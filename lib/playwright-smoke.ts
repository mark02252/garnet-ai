export type PlaywrightSmokeScenario = {
  id: 'home' | 'settings' | 'datasets' | 'seminar';
  title: string;
  description: string;
  path: string;
  waitForText: string;
  expectedText: string[];
};

export const PLAYWRIGHT_SMOKE_SCENARIOS: PlaywrightSmokeScenario[] = [
  {
    id: 'home',
    title: '캠페인 스튜디오 첫 화면',
    description: '캠페인 스튜디오의 첫 진입 화면이 정상적으로 열리는지 확인합니다.',
    path: '/',
    waitForText: 'Garnet 캠페인 스튜디오',
    expectedText: ['Garnet 캠페인 스튜디오', '브리프 작성']
  },
  {
    id: 'settings',
    title: '설정과 연결 허브',
    description: '연결 허브와 AI 연결 센터가 설정 화면에서 정상적으로 보이는지 점검합니다.',
    path: '/settings',
    waitForText: 'MCP 연결 허브',
    expectedText: ['설정 및 복구', 'MCP 연결 허브', 'AI 연결 센터']
  },
  {
    id: 'datasets',
    title: '데이터 스튜디오',
    description: '데이터 업로드와 분석 화면의 주요 타이틀이 준비되는지 확인합니다.',
    path: '/datasets',
    waitForText: '마케팅 데이터 분석 스튜디오',
    expectedText: ['마케팅 데이터 분석 스튜디오', '데이터 업로드']
  },
  {
    id: 'seminar',
    title: '세미나 스튜디오',
    description: '세미나 운영 화면이 정상적으로 열리고 주요 섹션이 보이는지 확인합니다.',
    path: '/seminar',
    waitForText: '올나잇 세미나 스튜디오',
    expectedText: ['올나잇 세미나 스튜디오', '세션 생성']
  }
];

export function getPlaywrightSmokeScenario(id: string) {
  return PLAYWRIGHT_SMOKE_SCENARIOS.find((scenario) => scenario.id === id) || null;
}

export function normalizePlaywrightBaseUrl(value?: string | null) {
  const raw = String(value || '').trim() || 'http://127.0.0.1:3000';
  const url = new URL(raw);
  const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.origin}${pathname}`;
}

export function buildPlaywrightScenarioUrl(baseUrl: string, scenarioPath: string) {
  const normalizedBase = normalizePlaywrightBaseUrl(baseUrl);
  return new URL(scenarioPath, `${normalizedBase}/`).toString();
}
