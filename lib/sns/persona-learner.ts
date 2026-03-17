// lib/sns/persona-learner.ts
import { runLLM } from '@/lib/llm'

export type PersonaAnalysis = {
  brandConcept: string
  targetAudience: string
  writingStyle: string
  tone: string
  keywords: string[]
  sampleSentences: string[]
}

export type PersonaTemplateInput = {
  brandName: string
  purpose: string
  target: string
  language: string
}

/**
 * 과거 포스팅 배열을 분석해 페르소나 프로필을 추출한다.
 */
export async function analyzePostsForPersona(
  posts: string[]
): Promise<PersonaAnalysis> {
  const postsText = posts.slice(0, 30).join('\n---\n')

  const result = await runLLM(
    `당신은 SNS 브랜드 전략 전문가입니다.
아래 포스팅들을 분석해 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "brandConcept": "브랜드 핵심 컨셉 (1-2문장)",
  "targetAudience": "타겟 오디언스 설명",
  "writingStyle": "글쓰기 스타일 설명",
  "tone": "formal | casual | energetic | professional 중 하나",
  "keywords": ["자주 쓰는 단어/표현 최대 10개"],
  "sampleSentences": ["대표 문체 예시 3개"]
}`,
    `다음 포스팅들을 분석하세요:\n\n${postsText}`
  )

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')
    return JSON.parse(jsonMatch[0]) as PersonaAnalysis
  } catch {
    throw new Error('페르소나 분석 결과를 파싱할 수 없습니다.')
  }
}

/**
 * 운영 목적/타겟 설정으로 신규 페르소나를 제안한다.
 */
export async function generatePersonaFromTemplate(
  input: PersonaTemplateInput
): Promise<PersonaAnalysis> {
  const result = await runLLM(
    `당신은 SNS 브랜드 전략 전문가입니다.
아래 정보를 바탕으로 최적의 SNS 페르소나를 제안하세요.
반드시 아래 JSON 형식으로만 응답하세요:
{
  "brandConcept": "브랜드 핵심 컨셉 (1-2문장)",
  "targetAudience": "타겟 오디언스 설명",
  "writingStyle": "글쓰기 스타일 설명",
  "tone": "formal | casual | energetic | professional 중 하나",
  "keywords": ["추천 키워드/표현 최대 10개"],
  "sampleSentences": ["추천 문체 예시 3개"]
}`,
    `브랜드명: ${input.brandName}
운영 목적: ${input.purpose}
타겟: ${input.target}
사용 언어: ${input.language}`
  )

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')
    return JSON.parse(jsonMatch[0]) as PersonaAnalysis
  } catch {
    throw new Error('페르소나 생성 결과를 파싱할 수 없습니다.')
  }
}
