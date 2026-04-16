import { runLLM } from '@/lib/llm'
import { prisma } from '@/lib/prisma'
import type { WorldModel } from '../types'

export type ContentResult = {
  contentIdeas: Array<{
    concept: string
    rationale: string
    format: 'post' | 'reel' | 'story' | 'carousel' | 'video'
  }>
}

const SYSTEM = `10년차 콘텐츠 전략가. 브랜드 보이스와 시즌 트렌드를 연결하는 전문가.
Chain-of-Draft 방식: 각 아이디어는 한 문장 컨셉 + 한 문장 근거.
JSON만 출력. 한국어.
기존에 반복된 아이디어 금지, 구체적이고 실행 가능한 제안만.`

export async function suggestContent(worldModel: WorldModel): Promise<ContentResult> {
  // 최근 content_strategy 도메인 지식
  let contentKnowledge = ''
  try {
    const entries = await prisma.knowledgeEntry.findMany({
      where: { domain: 'content_strategy', isAntiPattern: false },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    })
    contentKnowledge = entries.map(e => `- ${e.pattern}: ${e.observation.split('\n')[0].slice(0, 80)}`).join('\n')
  } catch { /* */ }

  const sns = worldModel.snapshot.sns
  const prompt = `## 현재 SNS 상황
참여율: ${sns.engagement}%
팔로워 변동: ${sns.followerGrowth}

## 축적된 콘텐츠 전략 지식
${contentKnowledge || '(없음)'}

현재 시점에 제안할 만한 콘텐츠 아이디어 **2개**를 도출하세요.
- 시즌/브랜드 보이스와 맞아야 함
- 기존 성공 패턴을 참고하되 반복은 금지
- 구체적 컨셉 (일반적 "콘텐츠 발행" 금지)

JSON으로 출력:
{"contentIdeas":[{"concept":"구체적 컨셉","rationale":"이 시점에 필요한 이유","format":"post|reel|story|carousel|video"}]}`

  try {
    const raw = await runLLM(SYSTEM, prompt, 0.5, 1200)
    const cleaned = raw.replace(/```(?:json)?/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned
    const parsed = JSON.parse(match)
    return {
      contentIdeas: Array.isArray(parsed.contentIdeas) ? parsed.contentIdeas.slice(0, 2) : [],
    }
  } catch {
    return { contentIdeas: [] }
  }
}
