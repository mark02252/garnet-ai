import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { AgentLoopStatusResponse } from '@/lib/agent-loop/types'

export async function GET() {
  try {
    const now = new Date()
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    let running = false
    try {
      const mod = await import('@/lib/agent-loop')
      running = mod.isAgentLoopRunning()
    } catch { /* module init may fail */ }

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
        sentToGovernor: todayCycles.reduce((s, c) => s + c.sentToGovernor, 0),
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
    // DB 에러 등 — 빈 응답 반환
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
