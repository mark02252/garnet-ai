import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { executeFlow } from '@/lib/flow/runner'
import { validateFlow } from '@/lib/flow/graph'
import type { FlowNode, FlowEdge, RunInput, FlowRunEvent } from '@/lib/flow/types'

export const dynamic = 'force-dynamic'

const runSchema = z.object({
  topic: z.string().min(1).max(500),
  brand: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  goal: z.string().max(500).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const encoder = new TextEncoder()

  function makeStream(templateId: string, runInput: RunInput) {
    return new ReadableStream({
      async start(controller) {
        function send(event: FlowRunEvent) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }

        try {
          const template = await prisma.flowTemplate.findUnique({ where: { id: templateId } })
          if (!template) {
            send({ type: 'flow-error', error: '템플릿을 찾을 수 없습니다.' })
            controller.close()
            return
          }

          const nodes = JSON.parse(template.nodes) as FlowNode[]
          const edges = JSON.parse(template.edges) as FlowEdge[]

          const validationError = validateFlow(nodes, edges)
          if (validationError) {
            send({ type: 'flow-error', error: validationError })
            controller.close()
            return
          }

          // Create Run record before starting execution
          const run = await prisma.run.create({
            data: {
              topic: runInput.topic,
              brand: runInput.brand ?? null,
              region: runInput.region ?? null,
              goal: runInput.goal ?? null,
            },
          })

          send({ type: 'run-start', runId: run.id })

          const nodeOutputs: Record<string, string> = {}
          const signal = AbortSignal.timeout(600_000)

          try {
            for await (const event of executeFlow(nodes, edges, runInput, signal)) {
              send(event)
              if (event.type === 'node-done') {
                nodeOutputs[event.nodeId] = event.output
              }
              if (event.type === 'flow-error') {
                // Run model has no status field — just close the stream
                controller.close()
                return
              }
            }

            // Save Deliverable
            await prisma.deliverable.create({
              data: {
                runId: run.id,
                type: 'CAMPAIGN_PLAN',
                content: JSON.stringify({
                  documentType: 'CAMPAIGN_PLAN',
                  title: `Flow 실행 결과: ${runInput.topic}`,
                  rawOutputs: nodeOutputs,
                  nodeNames: Object.fromEntries(
                    nodes
                      .filter(n => n.type === 'agent' || n.type === 'tool')
                      .map(n => [n.id, n.type === 'agent' ? (n.data as { role: string }).role : '웹 검색'])
                  ),
                }),
              },
            })

            // Update FlowTemplate.lastRunAt (fire-and-forget — don't delay flow-complete)
            void prisma.flowTemplate.update({
              where: { id: templateId },
              data: { lastRunAt: new Date() },
            }).catch(() => {})

            send({ type: 'flow-complete', runId: run.id })
          } catch (err) {
            send({ type: 'flow-error', error: err instanceof Error ? err.message : '실행 중 오류가 발생했습니다.' })
          }
        } catch (err) {
          send({ type: 'flow-error', error: err instanceof Error ? err.message : '서버 오류가 발생했습니다.' })
        } finally {
          controller.close()
        }
      },
    })
  }

  try {
    const body = runSchema.parse(await req.json())
    const stream = makeStream(id, body)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : '잘못된 요청입니다.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
