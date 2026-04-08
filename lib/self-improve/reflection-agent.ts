/**
 * Reflection Agent
 * 주요 실행 완료 후 전체 과정을 리뷰하고 교훈을 추출
 * 결과는 에피소딕 메모리 + 시맨틱 메모리에 저장
 */

import { runLLM } from '@/lib/llm'
import { storeEpisode } from '@/lib/memory/episodic-store'

export type ReflectionResult = {
  summary: string
  whatWentWell: string[]
  whatWentWrong: string[]
  lessonsLearned: string[]
  nextTimeImprove: string[]
}

/**
 * Flow 실행 결과에 대한 리플렉션
 */
export async function reflectOnFlowRun(params: {
  topic: string
  nodes: Array<{ role: string; output: string }>
  finalOutput: string
  judgeScore?: number
}): Promise<ReflectionResult> {
  const nodesContext = params.nodes
    .map(n => `[${n.role}]: ${n.output.slice(0, 200)}`)
    .join('\n')

  const prompt = `## Flow 실행 리플렉션

주제: ${params.topic}
${params.judgeScore ? `품질 점수: ${params.judgeScore}/100` : ''}

### 각 노드 결과:
${nodesContext}

### 최종 결과:
${params.finalOutput.slice(0, 500)}

위 실행 과정을 리뷰하고 교훈을 추출하세요. JSON만 출력:
{"summary":"1-2문장 요약","whatWentWell":["잘한 점"],"whatWentWrong":["못한 점"],"lessonsLearned":["배운 교훈"],"nextTimeImprove":["다음에 개선할 점"]}`

  const result = await runLLM(
    '당신은 리플렉션 전문가입니다. 실행 과정을 객관적으로 분석하고 개선점을 찾습니다. 한국어.',
    prompt, 0.3, 1500,
  )

  let reflection: ReflectionResult
  try {
    reflection = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}') as ReflectionResult
  } catch {
    reflection = {
      summary: result.slice(0, 200),
      whatWentWell: [],
      whatWentWrong: [],
      lessonsLearned: [],
      nextTimeImprove: [],
    }
  }

  // 에피소딕 메모리에 저장
  await storeEpisode({
    category: 'flow_run',
    input: `[리플렉션] ${params.topic}`,
    output: JSON.stringify(reflection),
    score: params.judgeScore,
    tags: ['reflection', params.topic],
    metadata: { type: 'reflection' },
  })

  return reflection
}

/**
 * SNS 성과에 대한 주간 리플렉션
 */
export async function reflectOnWeeklyPerformance(params: {
  totalReach: number
  totalSaved: number
  totalShares: number
  topPostCaption: string
  avgEngagementRate: number
  followerChange: number
}): Promise<ReflectionResult> {
  const prompt = `## 주간 SNS 성과 리플렉션

- 총 도달: ${params.totalReach.toLocaleString()}
- 총 저장: ${params.totalSaved} | 총 공유: ${params.totalShares}
- 평균 참여율: ${params.avgEngagementRate}%
- 팔로워 변화: ${params.followerChange >= 0 ? '+' : ''}${params.followerChange}
- 최고 성과 게시물: ${params.topPostCaption.slice(0, 100)}

이번 주 성과를 리플렉션하세요. JSON만:
{"summary":"요약","whatWentWell":["잘한점"],"whatWentWrong":["부족한점"],"lessonsLearned":["교훈"],"nextTimeImprove":["다음주 개선"]}`

  const result = await runLLM(
    '10년차 퍼포먼스 마케터입니다. 주간 성과를 냉철하게 분석합니다. 한국어.',
    prompt, 0.3, 1500,
  )

  let reflection: ReflectionResult
  try {
    reflection = JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}') as ReflectionResult
  } catch {
    reflection = {
      summary: result.slice(0, 200),
      whatWentWell: [],
      whatWentWrong: [],
      lessonsLearned: [],
      nextTimeImprove: [],
    }
  }

  await storeEpisode({
    category: 'sns_post',
    input: `[주간 리플렉션] 도달:${params.totalReach} 참여:${params.avgEngagementRate}%`,
    output: JSON.stringify(reflection),
    tags: ['reflection', 'weekly'],
    metadata: { type: 'weekly_reflection' },
  })

  return reflection
}
