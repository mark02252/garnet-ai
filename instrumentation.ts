/**
 * Next.js instrumentation — 서버 시작 시 Agent Loop 자동 시작
 * Edge runtime에서는 실행 안 됨 (Node.js runtime에서만)
 */
export async function register() {
  // Node.js runtime에서만 시작
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Agent Loop 자동 시작
    try {
      const { startAgentLoop } = await import('@/lib/agent-loop')
      startAgentLoop()
      console.log('[instrumentation] Agent Loop 자동 시작됨')
    } catch (err) {
      console.error('[instrumentation] Agent Loop 시작 실패:', err)
    }

    // Scheduler 자동 시작 (마케팅 인텔 수집, 다이제스트 등)
    try {
      const { initSchedulerSystem } = await import('@/lib/scheduler/init')
      await initSchedulerSystem()
      console.log('[instrumentation] Scheduler 자동 시작됨')
    } catch (err) {
      console.error('[instrumentation] Scheduler 시작 실패:', err)
    }
  }
}
