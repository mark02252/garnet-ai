/**
 * MONOPLEX 지점 코드 → 이름 매핑
 * GA4의 theater_code 파라미터를 사람이 읽기 좋은 이름으로 변환
 */

export const THEATER_MAPPING: Record<string, string> = {
  m001: '배식당',
  m002: '밀크북 극장',
  m005: '오르페오 한남',
  m007: '안영채 X 모노플렉스',
  m010: '글로스터 호텔 킨텍스 X 모노플렉스',
  m011: '민속촌자동차극장',
  m013: '디에이치시네마',
  m014: '씨네라운지 바이 운담채',
  m015: '현대자동차 남양연구소 시네마',
  m016: 'JSW씨네라운지',
  m017: '포포시네마',
  m018: '왕길역 로열파크시티 시네마 라운지',
  m019: '모노플렉스앳라이즈',
  m020: '의성작은영화관',
  m021: '안계행복영화관',
  m022: '검암역 로열파크씨티 시네마 1',
  m023: '검암역 로열파크씨티 시네마 2',
  m024: '클럽 자이안 시네마',
  m025: '파크아너스 시네마',
  m026: '페틀라 시네마',
  m027: '제천문화극장',
  m028: '모노플렉스 바이 이비스 스타일 앰배서더 강남',
  m029: '시네마 어나드범어',
}

/**
 * 코드를 이름으로 변환. 매핑 없으면 코드 그대로 반환.
 */
export function mapTheaterCode(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  return THEATER_MAPPING[code] || code
}

/**
 * 코드 + 이름 함께 표시 (예: "포포시네마 (m017)")
 */
export function formatTheaterLabel(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  const name = THEATER_MAPPING[code]
  return name ? `${name}` : `${code} (미등록)`
}
