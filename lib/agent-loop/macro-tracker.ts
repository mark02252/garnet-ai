import { addKnowledge } from './knowledge-store'

type SeasonalEvent = {
  name: string
  startMM_DD: string // "MM-DD"
  endMM_DD: string
  domain: string
  pattern: string
  observation: string
}

// 한국 기준 주요 이벤트/시즌
const SEASONAL_EVENTS: SeasonalEvent[] = [
  // 공휴일/이벤트
  { name: '설날', startMM_DD: '01-25', endMM_DD: '02-05', domain: 'consumer', pattern: '설 연휴 기간', observation: '가족 여가 수요 증가, 문화 콘텐츠 소비 상승' },
  { name: '어린이날', startMM_DD: '04-28', endMM_DD: '05-07', domain: 'consumer', pattern: '어린이날/가정의달', observation: '가족 대관/이벤트 수요 급증, 키즈 콘텐츠 반응 상승' },
  { name: '여름방학', startMM_DD: '07-15', endMM_DD: '08-25', domain: 'consumer', pattern: '여름 방학 시즌', observation: '영화관 성수기, 가족/청소년 대관 수요 최대' },
  { name: '추석', startMM_DD: '09-10', endMM_DD: '09-25', domain: 'consumer', pattern: '추석 연휴 기간', observation: '가족 모임 대관 수요, 문화 행사 증가' },
  { name: '크리스마스', startMM_DD: '12-15', endMM_DD: '12-31', domain: 'consumer', pattern: '연말/크리스마스 시즌', observation: '프라이빗 대관/파티 수요 급증, 프리미엄 경험 선호' },
  { name: '겨울방학', startMM_DD: '12-20', endMM_DD: '02-10', domain: 'consumer', pattern: '겨울 방학 시즌', observation: '영화관 성수기, 실내 여가 선호' },

  // 비즈니스 시즌
  { name: 'B2B 예산 시즌', startMM_DD: '10-01', endMM_DD: '11-30', domain: 'b2b', pattern: '기업 차년도 예산 편성기', observation: 'B2B 영업 최적기, 신규 구축 제안 적기' },
  { name: '봄 기업행사', startMM_DD: '03-15', endMM_DD: '05-15', domain: 'b2b', pattern: '봄 기업 행사 시즌', observation: '기업 대관/워크숍 수요 증가, 출장/연수 시즌' },
  { name: '블랙프라이데이', startMM_DD: '11-20', endMM_DD: '11-30', domain: 'pricing_strategy', pattern: '블랙프라이데이/할인 시즌', observation: '프로모션 경쟁 심화, 가격 민감도 상승' },

  // SNS/마케팅 시즌
  { name: '인스타 성수기', startMM_DD: '04-01', endMM_DD: '06-30', domain: 'content_strategy', pattern: '봄 SNS 활성기', observation: '아웃도어/감성 콘텐츠 반응 상승, 참여율 연중 최고' },
]

/**
 * 현재 날짜 기준 ±14일 이내 이벤트에 대한 지식 생성
 * daily-briefing에서 호출
 */
export async function trackMacroContext(): Promise<{ events: string[] }> {
  const now = new Date()
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const activeEvents: string[] = []

  for (const event of SEASONAL_EVENTS) {
    if (isWithinRange(today, event.startMM_DD, event.endMM_DD, 14)) {
      activeEvents.push(event.name)

      await addKnowledge({
        domain: event.domain,
        level: 2,
        pattern: event.pattern,
        observation: event.observation,
        source: `macro_calendar_${now.getFullYear()}`,
      })
    }
  }

  return { events: activeEvents }
}

/** MM-DD가 start~end 범위의 ±buffer일 이내인지 */
function isWithinRange(today: string, start: string, end: string, bufferDays: number): boolean {
  const year = new Date().getFullYear()
  const todayDate = new Date(`${year}-${today}`)
  const startDate = new Date(`${year}-${start}`)
  const endDate = new Date(`${year}-${end}`)

  // 연말~연초 범위 처리
  if (endDate < startDate) {
    // e.g., 12-20 ~ 02-10
    return todayDate >= new Date(startDate.getTime() - bufferDays * 86400000) ||
           todayDate <= new Date(endDate.getTime() + bufferDays * 86400000)
  }

  const bufferedStart = new Date(startDate.getTime() - bufferDays * 86400000)
  const bufferedEnd = new Date(endDate.getTime() + bufferDays * 86400000)
  return todayDate >= bufferedStart && todayDate <= bufferedEnd
}

/** 오늘의 거시 환경 요약 (Reasoner 프롬프트용) */
export function getMacroSummary(): string {
  const now = new Date()
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const active = SEASONAL_EVENTS.filter(e => isWithinRange(today, e.startMM_DD, e.endMM_DD, 7))

  if (active.length === 0) return '현재 특별한 시즌/이벤트 없음'

  return active.map(e => `[${e.name}] ${e.observation}`).join('\n')
}
