import { NextRequest, NextResponse } from 'next/server'
import {
  startAgentLoop,
  stopAgentLoop,
  pauseAgentLoop,
  resumeAgentLoop,
  triggerCycle,
  isAgentLoopRunning,
} from '@/lib/agent-loop'
import type { CycleType } from '@/lib/agent-loop/types'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { action?: string; cycleType?: CycleType }
  const { action } = body

  switch (action) {
    case 'start':
      startAgentLoop()
      return NextResponse.json({ ok: true, status: 'running' })
    case 'stop':
      stopAgentLoop()
      return NextResponse.json({ ok: true, status: 'stopped' })
    case 'pause':
      pauseAgentLoop()
      return NextResponse.json({ ok: true, status: 'paused' })
    case 'resume':
      resumeAgentLoop()
      return NextResponse.json({ ok: true, status: 'running' })
    case 'trigger': {
      const cycleType = body.cycleType || 'routine-cycle'
      const result = await triggerCycle(cycleType)
      return NextResponse.json({ ok: true, result })
    }
    default:
      return NextResponse.json(
        { ok: false, error: `Unknown action: ${action}. Use: start, stop, pause, resume, trigger` },
        { status: 400 },
      )
  }
}

export async function GET() {
  return NextResponse.json({ running: isAgentLoopRunning() })
}
