/**
 * Auto Meeting — Agent Loop가 복합 이슈 감지 시 자동으로 에이전트 회의 실행
 *
 * Flow: 이슈 분석 → 에이전트 팀 생성 → Debate → Judge → 결론 도출 → 알림
 */

import { prisma } from '@/lib/prisma'
import { runLLM } from '@/lib/llm'
import { executeFlow } from '@/lib/flow/runner'
import { reflectOnFlowRun } from '@/lib/self-improve/reflection-agent'
import { isTelegramConfigured, sendMessage } from '@/lib/telegram'
import { storeEpisode } from '@/lib/memory/episodic-store'
import type { FlowNode, FlowEdge, RunInput } from '@/lib/flow/types'
import type { WorldModel, GoalProgress } from './types'

type MeetingResult = {
  meetingId: string
  topic: string
  conclusion: string
  judgeScore: number | null
  agentOutputs: Array<{ role: string; output: string }>
}

/**
 * 이슈의 복잡도를 판단하여 회의가 필요한지 결정
 * 복합 이슈 = 2개 이상 카테고리의 이슈가 동시에 존재
 */
export function needsMeeting(worldModel: WorldModel, goals: GoalProgress[]): boolean {
  const issueTypes = new Set(worldModel.openIssues.map(i => i.type))
  const behindGoals = goals.filter(g => !g.onTrack).length

  // 조건: 2개 이상 이슈 유형 OR 심각한 이슈 + 뒤처진 목표
  if (issueTypes.size >= 2) return true
  if (worldModel.openIssues.some(i => i.severity === 'critical') && behindGoals > 0) return true
  if (behindGoals >= 2) return true

  return false
}

/**
 * 이슈에 맞는 에이전트 팀 설계 (LLM 기반)
 * 반환: FlowTemplate용 nodes/edges JSON
 */
async function designMeetingTeam(topic: string, context: string): Promise<{
  nodes: string
  edges: string
}> {
  const prompt = `다음 마케팅 이슈에 대해 에이전트 회의 팀을 설계하세요.

이슈: ${topic}
맥락: ${context}

3-4명의 전문 에이전트로 구성된 토론 팀을 설계하세요.
각 에이전트는 다른 관점에서 분석합니다.

JSON 형식으로 FlowTemplate의 nodes와 edges를 반환하세요:
{
  "nodes": [
    {"id": "start-1", "type": "start", "position": {"x": 0, "y": 200}, "data": {"topic": "이슈 주제"}},
    {"id": "agent-1", "type": "agent", "position": {"x": 300, "y": 0}, "data": {"role": "역할명", "systemPrompt": "역할 설명과 분석 지시", "model": "gemma4"}},
    {"id": "agent-2", "type": "agent", "position": {"x": 300, "y": 200}, "data": {"role": "역할명", "systemPrompt": "...", "model": "gemma4"}},
    {"id": "agent-3", "type": "agent", "position": {"x": 300, "y": 400}, "data": {"role": "역할명", "systemPrompt": "...", "model": "gemma4"}},
    {"id": "end-1", "type": "end", "position": {"x": 600, "y": 200}, "data": {}}
  ],
  "edges": [
    {"id": "e1", "source": "start-1", "target": "agent-1"},
    {"id": "e2", "source": "start-1", "target": "agent-2"},
    {"id": "e3", "source": "start-1", "target": "agent-3"},
    {"id": "e4", "source": "agent-1", "target": "end-1"},
    {"id": "e5", "source": "agent-2", "target": "end-1"},
    {"id": "e6", "source": "agent-3", "target": "end-1"}
  ]
}

JSON만 출력하세요.`

  const raw = await runLLM(
    '에이전트 팀 설계 전문가. FlowTemplate JSON만 출력.',
    prompt, 0.4, 2000,
  )

  try {
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    return {
      nodes: JSON.stringify(parsed.nodes || []),
      edges: JSON.stringify(parsed.edges || []),
    }
  } catch {
    // 기본 3인 팀 폴백
    const defaultNodes: FlowNode[] = [
      { id: 'start-1', type: 'start', position: { x: 0, y: 200 }, data: { topic } },
      { id: 'agent-1', type: 'agent', position: { x: 300, y: 0 }, data: { role: 'Strategy Agent', systemPrompt: `마케팅 전략 관점에서 다음 이슈를 분석하세요: ${topic}`, model: 'gemma4' } },
      { id: 'agent-2', type: 'agent', position: { x: 300, y: 200 }, data: { role: 'Content Agent', systemPrompt: `콘텐츠 전략 관점에서 다음 이슈를 분석하세요: ${topic}`, model: 'gemma4' } },
      { id: 'agent-3', type: 'agent', position: { x: 300, y: 400 }, data: { role: 'Performance Agent', systemPrompt: `성과 데이터 관점에서 다음 이슈를 분석하세요: ${topic}`, model: 'gemma4' } },
      { id: 'end-1', type: 'end', position: { x: 600, y: 200 }, data: {} as Record<string, never> },
    ]
    const defaultEdges: FlowEdge[] = [
      { id: 'e1', source: 'start-1', target: 'agent-1' },
      { id: 'e2', source: 'start-1', target: 'agent-2' },
      { id: 'e3', source: 'start-1', target: 'agent-3' },
      { id: 'e4', source: 'agent-1', target: 'end-1' },
      { id: 'e5', source: 'agent-2', target: 'end-1' },
      { id: 'e6', source: 'agent-3', target: 'end-1' },
    ]
    return { nodes: JSON.stringify(defaultNodes), edges: JSON.stringify(defaultEdges) }
  }
}

/**
 * 자동 회의 실행
 */
export async function triggerAutoMeeting(
  worldModel: WorldModel,
  goals: GoalProgress[],
): Promise<MeetingResult | null> {
  // 1. 회의 주제 생성
  const issuesSummary = worldModel.openIssues
    .map(i => `[${i.severity}] ${i.summary}`)
    .join(', ')
  const behindGoals = goals.filter(g => !g.onTrack)
    .map(g => `${g.goal.goal} (${g.progressPercent}%)`)
    .join(', ')

  const topic = `마케팅 전략 회의: ${issuesSummary}${behindGoals ? ` | 뒤처진 목표: ${behindGoals}` : ''}`

  const context = `현재 상황:
- GA4 세션: ${worldModel.snapshot.ga4.sessions}, 이탈률: ${worldModel.snapshot.ga4.bounceRate}%
- SNS 참여율: ${worldModel.snapshot.sns.engagement}%, 팔로워: ${worldModel.snapshot.sns.followerGrowth}
- 경쟁사 위협: ${worldModel.snapshot.competitors.threatLevel}
- 활성 캠페인: ${worldModel.snapshot.campaigns.active}건`

  // 2. 에이전트 팀 설계
  const { nodes: nodesJson, edges: edgesJson } = await designMeetingTeam(topic, context)

  // 3. FlowTemplate DB 저장
  const template = await prisma.flowTemplate.create({
    data: {
      name: `[Auto Meeting] ${topic.slice(0, 80)}`,
      description: `Agent Loop 자동 회의 — ${new Date().toISOString()}`,
      nodes: nodesJson,
      edges: edgesJson,
    },
  })

  // 4. Flow 실행
  const nodes: FlowNode[] = JSON.parse(nodesJson)
  const edges: FlowEdge[] = JSON.parse(edgesJson)
  const runInput: RunInput = { topic }
  const agentOutputs: Array<{ role: string; output: string }> = []
  let finalOutput = ''

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3 * 60 * 1000) // 3분 타임아웃

  try {
    for await (const event of executeFlow(nodes, edges, runInput, controller.signal)) {
      if (event.type === 'node-done' && event.output) {
        agentOutputs.push({
          role: event.nodeId,
          output: event.output,
        })
        finalOutput = event.output // 마지막 노드 출력이 최종 결과
      }
    }
  } finally {
    clearTimeout(timeout)
  }

  // 5. 결론 종합 (LLM)
  const conclusionPrompt = `다음은 마케팅 전략 회의의 각 에이전트 분석 결과입니다:

${agentOutputs.map(a => `### ${a.role}\n${a.output.slice(0, 500)}`).join('\n\n')}

위 분석을 종합하여 3줄 이내의 핵심 결론과 구체적 액션 아이템을 도출하세요.
JSON: {"conclusion": "결론", "actions": ["액션1", "액션2"], "judgeScore": 0-100}`

  let conclusion = finalOutput.slice(0, 300)
  let judgeScore: number | null = null

  try {
    const raw = await runLLM('회의 결론 도출 전문가. JSON만 출력.', conclusionPrompt, 0.3, 800)
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')
    conclusion = parsed.conclusion || conclusion
    judgeScore = typeof parsed.judgeScore === 'number' ? parsed.judgeScore : null
  } catch { /* use default */ }

  // 6. Reflection + 에피소딕 메모리 저장
  try {
    await reflectOnFlowRun({
      topic,
      nodes: agentOutputs,
      finalOutput: conclusion,
      judgeScore: judgeScore ?? undefined,
    })
  } catch { /* non-critical */ }

  await storeEpisode({
    category: 'flow_run',
    input: topic,
    output: conclusion,
    score: judgeScore ?? undefined,
    tags: ['agent-loop', 'auto-meeting'],
    metadata: { templateId: template.id, agentCount: agentOutputs.length },
  })

  // 7. Telegram 알림
  if (isTelegramConfigured()) {
    const agentList = agentOutputs.map(a => a.role).join(', ')
    const text = `*Agent Loop 자동 회의 완료*

*주제:* ${topic.slice(0, 100)}
*참여:* ${agentList || 'N/A'}
${judgeScore != null ? `*품질 점수:* ${judgeScore}/100` : ''}

*결론:*
${conclusion.slice(0, 500)}

상세: Flow #${template.id}`

    await sendMessage(text, { parseMode: 'Markdown' }).catch(() => {})
  }

  return {
    meetingId: template.id,
    topic,
    conclusion,
    judgeScore,
    agentOutputs,
  }
}
