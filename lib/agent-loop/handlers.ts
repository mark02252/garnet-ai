// lib/agent-loop/handlers.ts

import { registerHandler } from '@/lib/governor-executor'
import { storeEpisode } from '@/lib/memory/episodic-store'

let registered = false

/**
 * Agent Loop 전용 액션 핸들러 등록.
 * Orchestrator 시작 시 한 번 호출.
 */
export function registerAgentLoopHandlers(): void {
  if (registered) return
  registered = true

  // report_generation — 분석 리포트 생성 (에피소딕 메모리에 저장)
  registerHandler('report_generation', async (payload: unknown) => {
    const p = payload as Record<string, unknown>
    await storeEpisode({
      category: 'ai_report',
      input: String(p._agentLoop ? (p._agentLoop as Record<string, unknown>).title : 'Agent Loop Report'),
      output: String(p._agentLoop ? (p._agentLoop as Record<string, unknown>).rationale : ''),
      score: 60,
      tags: ['agent-loop', 'auto-generated'],
      metadata: p,
    })
    console.log('[Agent Loop Handler] report_generation executed')
  })

  // playbook_update — 플레이북 업데이트 (로그만 남김, 향후 확장)
  registerHandler('playbook_update', async (payload: unknown) => {
    const p = payload as Record<string, unknown>
    console.log('[Agent Loop Handler] playbook_update:', (p._agentLoop as Record<string, unknown>)?.title)
  })

  // alert — 알림 생성 (로그)
  registerHandler('alert', async (payload: unknown) => {
    const p = payload as Record<string, unknown>
    console.log('[Agent Loop Handler] alert:', (p._agentLoop as Record<string, unknown>)?.title)
  })

  // flow_trigger, content_publish, budget_adjust — MEDIUM+ 이므로 Governor 승인 필요
  // 이들은 보통 자동실행되지 않지만, 혹시 LOW로 분류될 경우 대비
  registerHandler('flow_trigger', async () => {
    console.log('[Agent Loop Handler] flow_trigger — requires manual execution via Flow Builder')
  })

  registerHandler('content_publish', async () => {
    console.log('[Agent Loop Handler] content_publish — requires manual execution')
  })

  registerHandler('budget_adjust', async () => {
    console.log('[Agent Loop Handler] budget_adjust — requires manual execution')
  })

  // competitor_discovery — 경쟁사 자동 발견 (별도 모듈에서 처리)
  registerHandler('competitor_discovery', async () => {
    // discoverNewCompetitors()는 별도 모듈에서 주간 리뷰 시 호출
    console.log('[Agent Loop Handler] competitor_discovery triggered')
  })
}
