/**
 * Business Context System
 * 사업 정보를 수집/분석/저장하고, 모든 AI 분석에 맥락으로 주입
 *
 * 입력 방식:
 * 1. 웹사이트 URL → Playwright 자동 분석
 * 2. MD/텍스트 파일 업로드 → 파싱 + AI 구조화
 * 3. 직접 입력 (폼)
 * 4. 혼합 (여러 소스 통합)
 */

import * as fs from 'fs'
import * as path from 'path'
import { runLLM } from '@/lib/llm'

const CONTEXT_PATH = path.join(process.cwd(), '.garnet-config', 'business-context.json')

// ── Types ──

export type BusinessModel = {
  name: string
  description: string
  isCore: boolean // 핵심 수익원인지
  conversionPage?: string // 전환 페이지 URL
}

export type Competitor = {
  name: string
  url?: string
  strengths: string[]
  weaknesses: string[]
  relationship: 'price' | 'location' | 'quality' | 'brand' | 'general'
}

export type StrategicGoal = {
  goal: string
  metric: string
  target: string
  deadline?: string
  priority: 'critical' | 'high' | 'medium' | 'low'
}

export type BusinessContext = {
  // 기본 정보
  companyName: string
  industry: string
  website: string
  description: string // AI가 생성하거나 사용자가 입력

  // 사업 모델
  businessModels: BusinessModel[]

  // 타겟 고객
  targetAudience: {
    demographics: string // "20-30대, 서울 거주, 영화 마니아"
    psychographics: string // "프라이빗 경험 선호, SNS 활발"
    painPoints: string[] // 고객이 겪는 문제
  }

  // 경쟁사
  competitors: Competitor[]

  // 전략 목표
  strategicGoals: StrategicGoal[]

  // 핵심 전환
  conversionPages: Array<{
    url: string
    name: string
    importance: 'critical' | 'high' | 'medium'
  }>

  // 브랜드 보이스
  brandVoice: {
    tone: string // "친근하지만 프리미엄"
    keywords: string[] // 자주 사용하는 키워드
    avoidWords: string[] // 사용하지 않는 단어
  }

  // 메타 정보
  lastUpdated: string
  sources: string[] // 어디서 정보를 가져왔는지
}

// ── Storage ──

export function loadBusinessContext(): BusinessContext | null {
  try {
    if (fs.existsSync(CONTEXT_PATH)) {
      return JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf-8'))
    }
  } catch { /* ignore */ }
  return null
}

export function saveBusinessContext(context: BusinessContext) {
  const dir = path.dirname(CONTEXT_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONTEXT_PATH, JSON.stringify(context, null, 2))
}

// ── Context Injection (모든 AI 프롬프트에 주입) ──

export function getBusinessContextPrompt(): string {
  const ctx = loadBusinessContext()
  if (!ctx) return ''

  const models = ctx.businessModels
    .map(m => `- ${m.name}${m.isCore ? ' (핵심)' : ''}: ${m.description}`)
    .join('\n')

  const competitors = ctx.competitors
    .map(c => `- ${c.name}: 강점(${c.strengths.join(', ')}), 약점(${c.weaknesses.join(', ')})`)
    .join('\n')

  const goals = ctx.strategicGoals
    .map(g => `- [${g.priority}] ${g.goal}: ${g.metric} → ${g.target}`)
    .join('\n')

  return `## 비즈니스 맥락 (모든 분석에 반영할 것)

회사: ${ctx.companyName} (${ctx.industry})
웹사이트: ${ctx.website}
설명: ${ctx.description}

사업 모델:
${models}

타겟 고객: ${ctx.targetAudience.demographics}
고객 특성: ${ctx.targetAudience.psychographics}
고객 페인포인트: ${ctx.targetAudience.painPoints.join(', ')}

경쟁사:
${competitors}

전략 목표:
${goals}

브랜드 톤: ${ctx.brandVoice.tone}
핵심 키워드: ${ctx.brandVoice.keywords.join(', ')}
`
}

// ── Analyzers ──

/**
 * 웹사이트 URL → Business Context 자동 생성
 */
export async function analyzeWebsite(url: string): Promise<Partial<BusinessContext>> {
  // Playwright로 페이지 데이터 추출
  const { extractPageData } = await import('@/lib/playwright-agent')
  const pageData = await extractPageData(url)

  const prompt = `다음 웹사이트 정보를 분석하여 비즈니스 컨텍스트를 JSON으로 추출하세요.

URL: ${url}
제목: ${pageData.title}
설명: ${pageData.description}
H1: ${pageData.h1.join(', ')}
가격 정보: ${pageData.prices.join(', ')}
프로모션: ${pageData.promotions.join(', ')}
본문 (1000자): ${pageData.textContent}

JSON 출력:
{"companyName":"회사명","industry":"업종","description":"2-3문장 사업 설명","businessModels":[{"name":"모델명","description":"설명","isCore":true}],"targetAudience":{"demographics":"인구통계","psychographics":"심리특성","painPoints":["문제1"]},"brandVoice":{"tone":"톤","keywords":["키워드"],"avoidWords":[]}}`

  const result = await runLLM(
    '비즈니스 분석가입니다. 웹사이트에서 사업 정보를 정확히 추출합니다. 한국어. JSON만 출력.',
    prompt, 0.3, 2000,
  )

  try {
    return JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    return { companyName: pageData.title, website: url, description: pageData.description }
  }
}

/**
 * MD/텍스트 파일 → Business Context 자동 생성
 */
export async function analyzeDocument(content: string, filename?: string): Promise<Partial<BusinessContext>> {
  const prompt = `다음 사업소개서/문서를 분석하여 비즈니스 컨텍스트를 JSON으로 추출하세요.

${filename ? `파일명: ${filename}` : ''}
문서 내용:
${content.slice(0, 4000)}

JSON 출력 (모든 필드를 최대한 채우세요):
{"companyName":"","industry":"","description":"","businessModels":[{"name":"","description":"","isCore":true,"conversionPage":""}],"targetAudience":{"demographics":"","psychographics":"","painPoints":[]},"competitors":[{"name":"","strengths":[],"weaknesses":[],"relationship":"general"}],"strategicGoals":[{"goal":"","metric":"","target":"","priority":"high"}],"brandVoice":{"tone":"","keywords":[],"avoidWords":[]}}`

  const result = await runLLM(
    '비즈니스 전략 컨설턴트입니다. 문서에서 핵심 사업 정보를 정확히 추출합니다. 한국어. JSON만 출력.',
    prompt, 0.3, 3000,
  )

  try {
    return JSON.parse(result.match(/\{[\s\S]*\}/)?.[0] || '{}')
  } catch {
    return { description: content.slice(0, 500) }
  }
}

/**
 * 여러 소스 통합 (웹사이트 + 문서 + 직접 입력)
 */
export async function mergeContextSources(sources: Array<{
  type: 'website' | 'document' | 'manual'
  data: Partial<BusinessContext>
}>): Promise<BusinessContext> {
  // 기존 컨텍스트 로드
  const existing = loadBusinessContext()

  // 모든 소스 병합
  const merged: BusinessContext = {
    companyName: '',
    industry: '',
    website: '',
    description: '',
    businessModels: [],
    targetAudience: { demographics: '', psychographics: '', painPoints: [] },
    competitors: [],
    strategicGoals: [],
    conversionPages: [],
    brandVoice: { tone: '', keywords: [], avoidWords: [] },
    lastUpdated: new Date().toISOString(),
    sources: [],
    ...existing,
  }

  for (const source of sources) {
    const d = source.data
    if (d.companyName) merged.companyName = d.companyName
    if (d.industry) merged.industry = d.industry
    if (d.website) merged.website = d.website
    if (d.description) merged.description = d.description
    if (d.businessModels?.length) merged.businessModels = [...merged.businessModels, ...d.businessModels]
    if (d.targetAudience) {
      if (d.targetAudience.demographics) merged.targetAudience.demographics = d.targetAudience.demographics
      if (d.targetAudience.psychographics) merged.targetAudience.psychographics = d.targetAudience.psychographics
      if (d.targetAudience.painPoints?.length) merged.targetAudience.painPoints = [...new Set([...merged.targetAudience.painPoints, ...d.targetAudience.painPoints])]
    }
    if (d.competitors?.length) merged.competitors = [...merged.competitors, ...d.competitors]
    if (d.strategicGoals?.length) merged.strategicGoals = [...merged.strategicGoals, ...d.strategicGoals]
    if (d.brandVoice) {
      if (d.brandVoice.tone) merged.brandVoice.tone = d.brandVoice.tone
      if (d.brandVoice.keywords?.length) merged.brandVoice.keywords = [...new Set([...merged.brandVoice.keywords, ...d.brandVoice.keywords])]
    }
    merged.sources.push(source.type)
  }

  // 중복 제거
  merged.businessModels = merged.businessModels.filter((m, i, arr) =>
    arr.findIndex(x => x.name === m.name) === i
  )
  merged.competitors = merged.competitors.filter((c, i, arr) =>
    arr.findIndex(x => x.name === c.name) === i
  )

  saveBusinessContext(merged)
  return merged
}
