import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'
import * as fs from 'fs'
import * as path from 'path'

function checkRunning(): boolean {
  try {
    // process.cwd()가 다를 수 있으므로 여러 경로 시도
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

export async function GET() {
  try {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const running = checkRunning()

    // Governor 실제 대기 건수
    const governorPending = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int as count FROM "GovernorAction" WHERE "status" IN ('PENDING_APPROVAL','PENDING_SCORE') AND "deletedAt" IS NULL`
    ).then(r => r[0]?.count ?? 0).catch(() => 0)

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
        sentToGovernor: governorPending,
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
    } satisfies AgentLoopStatusResponse)
  }
}
