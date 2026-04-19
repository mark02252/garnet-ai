/**
 * MONOPLEX 지점 코드 → 이름 매핑
 * GA4의 theater_code 파라미터를 사람이 읽기 좋은 이름으로 변환
 *
 * 3가지 형식 모두 지원:
 * - Raw 코드: m001, m002, o001 등
 * - 암호화 코드: _CSB5mK8S56Y6rtPuUsCzg 등
 * - 한글 이름: 모노플렉스앳라이즈 등 (theater 필드에서 직접 올 때)
 */

type TheaterInfo = {
  raw: string
  encrypted: string
  name: string
  type: 'general' | 'outdoor'
}

const THEATERS: TheaterInfo[] = [
  // 일반 극장
  { raw: 'm001', encrypted: '_CSB5mK8S56Y6rtPuUsCzg', name: '배식당', type: 'general' },
  { raw: 'm002', encrypted: '4PpUEbOIIpKP77uk-TJqVA', name: '밀크북 극장', type: 'general' },
  { raw: 'm005', encrypted: 'CDqH_56H0Pv-IMLVBUSzhQ', name: '오르페오 한남', type: 'general' },
  { raw: 'm007', encrypted: 'IOjwGYNKXo1fGvArICxewA', name: '안영채 X 모노플렉스', type: 'general' },
  { raw: 'm010', encrypted: 'Wz_XX2o2vOf5A_muU-Q6pQ', name: '글로스터 호텔 킨텍스 X 모노플렉스', type: 'general' },
  { raw: 'm011', encrypted: 'xjOhtCQQsZpjiYW-Cp_otw', name: '민속촌자동차극장', type: 'general' },
  { raw: 'm013', encrypted: 'BPiU-cl9iwteZCKh4DvVqA', name: '디에이치시네마', type: 'general' },
  { raw: 'm014', encrypted: 'd7RFzAy8TmO5X_PgdL3ItQ', name: '씨네라운지 바이 윤담재', type: 'general' },
  { raw: 'm015', encrypted: 'TVajDsDQM0V1-7lyeTqwiw', name: '현대자동차 남양연구소 시네마', type: 'general' },
  { raw: 'm016', encrypted: '58TUrVa4uwLlAHGJfsMwqQ', name: 'JSW씨네라운지', type: 'general' },
  { raw: 'm017', encrypted: 'oxxN6Ykd3WXh-OXVTBuUFA', name: '포포시네마', type: 'general' },
  { raw: 'm018', encrypted: '9A9QVsjgL9Uon0pYVXdn8g', name: '왕길역 로열파크시티 시네마 라운지', type: 'general' },
  { raw: 'm019', encrypted: 'cbsfj2-VDW3z6QdXDEXMqQ', name: '모노플렉스앳라이즈', type: 'general' },
  { raw: 'm020', encrypted: 'lpd2ikyjgg_u6GTJhV7R6w', name: '의성작은영화관', type: 'general' },
  { raw: 'm021', encrypted: '9qb7xjNj6LeVFpewhwCR2A', name: '안계행복영화관', type: 'general' },
  { raw: 'm022', encrypted: 'kczimCX9e3cWY5y3YlHs5w', name: '검암역 로열파크씨티 시네마 1', type: 'general' },
  { raw: 'm023', encrypted: 'C9n-pgIg-6MfD21IYvIYLg', name: '검암역 로열파크씨티 시네마 2', type: 'general' },
  { raw: 'm024', encrypted: 'FdN0zA2JD6B4fEvSNxjneg', name: '클럽 자이안 시네마', type: 'general' },
  { raw: 'm025', encrypted: 'aKcYpbrdi7xGFYM3qiZAKg', name: '파크아너스 시네마', type: 'general' },
  { raw: 'm026', encrypted: 'u8jLnWKaziDSUHFh94szbQ', name: '페를라 시네마', type: 'general' },
  { raw: 'm027', encrypted: 'RKcvRpFZO0MzanqAZkZmDA', name: '제천문화극장', type: 'general' },
  { raw: 'm028', encrypted: '4o5pZDD8Yky0fXm_ye6IPQ', name: '모노플렉스 바이 이비스 스타일 앰배서더 강남', type: 'general' },
  { raw: 'm029', encrypted: 'akEUOvc3IOOUUGjVAXMO0Q', name: '시네마 어나드범어', type: 'general' },
  // 야외 극장
  { raw: 'o001', encrypted: 'ln1kWhzZIvqUF3F7igdRGg', name: '소피텔', type: 'outdoor' },
]

// 모든 형식 → 이름 매핑 (raw, encrypted, 한글 모두)
const _lookup = new Map<string, string>()
for (const t of THEATERS) {
  _lookup.set(t.raw, t.name)
  _lookup.set(t.encrypted, t.name)
  _lookup.set(t.name, t.name) // 한글이 직접 올 때도 매핑
}

// 한글 변형 처리 (띄어쓰기 차이 등)
_lookup.set('모노플렉스 앳 라이즈', '모노플렉스앳라이즈')
_lookup.set('씨네라운지 바이 운담채', '씨네라운지 바이 윤담재')
_lookup.set('페틀라 시네마', '페를라 시네마')

/**
 * 어떤 형식이든 이름으로 변환
 * raw(m001), encrypted(_CSB5...), 한글 모두 지원
 */
export function mapTheaterCode(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  return _lookup.get(code) || code
}

/**
 * 이름 표시 (매핑 안 되면 코드 그대로 + 미등록 표시)
 */
export function formatTheaterLabel(code: string | null | undefined): string {
  if (!code) return '(미분류)'
  const name = _lookup.get(code)
  return name || `${code} (미등록)`
}

/**
 * 전체 지점 목록 조회
 */
export function getAllTheaters(): TheaterInfo[] {
  return THEATERS
}

/**
 * 기존 THEATER_MAPPING 호환 (레거시)
 */
export const THEATER_MAPPING: Record<string, string> = Object.fromEntries(
  THEATERS.flatMap(t => [[t.raw, t.name], [t.encrypted, t.name]])
)
