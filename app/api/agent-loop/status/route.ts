import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'
import * as fs from 'fs'
import * as path from 'path'

type GovRow = {
  id: string
  kind: string
  payload: string | Record<string, unknown>
  status: string
  riskLevel: string | null
  createdAt: Date | string
}

function checkRunning(): boolean {
  try {
    const candidates = [
      path.join(process.cwd(), '.garnet-config', 'agent-loop-state.json'),
      path.resolve('.garnet-config', 'agent-loop-state.json'),
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
        return data.running === true
      }
    }
    return false
  } catch { return false }
}

function extractMeta(payload: unknown): { title: string; rationale: string } {
  try {
    const p = typeof payload === 'string' ? JSON.parse(payload) : payload
    const meta = (p as Record<string, unknown>)?._agentLoop as Record<string, string> | undefined
    return { title: meta?.title || '', rationale: meta?.rationale || '' }
  } catch { return { title: '', rationale: '' } }
}

export async function GET() {
  try {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const running = checkRunning()

    // Governor 데이터
    const governorPendingRows = await prisma.$queryRawUnsafe<GovRow[]>(
      `SELECT id, kind, payload, status, "riskLevel", "createdAt"
       FROM "GovernorAction"
       WHERE "status" IN ('PENDING_APPROVAL','PENDING_SCORE') AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 10`
    ).catch(() => [] as GovRow[])

    const governorRecentRows = await prisma.$queryRawUnsafe<GovRow[]>(
      `SELECT id, kind, payload, status, "riskLevel", "createdAt"
       FROM "GovernorAction"
       WHERE "deletedAt" IS NULL AND "createdAt" >= $1
       ORDER BY "createdAt" DESC LIMIT 20`,
      oneDayAgo.toISOString()
    ).catch(() => [] as GovRow[])

    const [lastCycle, todayCycles, goals, recentDecisions] = await Promise.all([
      prisma.agentLoopCycle.findFirst({
        where: { status: { not: 'running' } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.agentLoopCycle.findMany({
        where: { createdAt: { gte: oneDayAgo } },
      }),
      prisma.goalState.findMany({
        orderBy: { checkedAt: 'desc' },
        distinct: ['goalName'],
        take: 10,
      }),
      prisma.agentLoopCycle.findMany({
        where: { status: { not: 'running' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    const hasError = lastCycle?.status === 'failed'

    const response: AgentLoopStatusResponse = {
      status: running ? (hasError ? 'error' : 'running') : (todayCycles.length > 0 ? 'idle' : 'idle'),
      lastCycle: lastCycle ? {
        id: lastCycle.id,
        cycleType: lastCycle.cycleType,
        completedAt: lastCycle.createdAt.toISOString(),
        actionsCount: lastCycle.actionsCount,
        summary: lastCycle.summary,
      } : null,
      nextScheduled: {
        cycleType: 'routine-cycle',
        scheduledAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      },
      today: {
        autoExecuted: todayCycles.reduce((s, c) => s + c.autoExecuted, 0),
        sentToGovernor: governorPendingRows.length,
        totalCycles: todayCycles.length,
      },
      goals: goals.map(g => ({
        name: g.goalName,
        progressPercent: g.progressPercent,
        onTrack: g.onTrack,
      })),
      recentDecisions: recentDecisions.map(c => ({
        time: c.createdAt.toISOString(),
        summary: c.summary || `${c.cycleType} 사이클`,
        status: c.actionsCount === 0 ? 'no_action' as const
          : c.sentToGovernor > 0 ? 'pending_approval' as const
          : 'executed' as const,
      })),
      // 오늘 실행된 액션 내역
      recentActions: governorRecentRows.map(r => {
        const meta = extractMeta(r.payload)
        return {
          id: r.id,
          kind: r.kind,
          title: meta.title || r.kind,
          riskLevel: r.riskLevel || 'LOW',
          status: r.status === 'EXECUTED' ? 'executed' as const
            : r.status === 'FAILED' ? 'failed' as const
            : 'pending' as const,
          time: typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString(),
        }
      }),
      // 승인 대기 상세
      pendingApprovals: governorPendingRows.map(r => {
        const meta = extractMeta(r.payload)
        return {
          id: r.id,
          kind: r.kind,
          title: meta.title || r.kind,
          rationale: meta.rationale,
          riskLevel: r.riskLevel || 'MEDIUM',
          time: typeof r.createdAt === 'string' ? r.createdAt : r.createdAt.toISOString(),
        }
      }),
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[agent-loop/status] Error:', err)
    return NextResponse.json({
      status: 'idle',
      lastCycle: null,
      nextScheduled: { cycleType: 'routine-cycle', scheduledAt: '' },
      today: { autoExecuted: 0, sentToGovernor: 0, totalCycles: 0 },
      goals: [],
      recentDecisions: [],
      recentActions: [],
      pendingApprovals: [],
    } satisfies AgentLoopStatusResponse)
  }
}
