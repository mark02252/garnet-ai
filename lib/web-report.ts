type SourceLike = {
  title: string;
  snippet: string;
  url: string;
};

export type WebIntelligenceSummary = {
  keyTrend: string;
  marketShift: string;
  competitorSignals: string;
  riskSignals: string;
  opportunitySignals: string;
  sources: Array<{ title: string; url: string }>;
};

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'about',
  'your',
  'have',
  'will',
  'more',
  '시장',
  '브랜드',
  '전략',
  '캠페인',
  '분석',
  '대한',
  '관련',
  '에서',
  '까지',
  '하는',
  '위한',
  '있습니다'
]);

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 2 && !STOPWORDS.has(v));
}

function topKeywords(sources: SourceLike[], size = 3) {
  const map = new Map<string, number>();
  for (const source of sources) {
    for (const token of tokenize(`${source.title} ${source.snippet}`)) {
      map.set(token, (map.get(token) || 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([word]) => word);
}

export function buildWebIntelligenceSummary(sources: SourceLike[]): WebIntelligenceSummary {
  if (!sources.length) {
    return {
      keyTrend: '웹 소스가 없어 트렌드 추출이 제한됩니다.',
      marketShift: '시장 변화 신호를 확인할 수 없습니다.',
      competitorSignals: '경쟁사 시그널을 확인할 수 없습니다.',
      riskSignals: '검증 가능한 리스크 시그널이 없습니다.',
      opportunitySignals: '웹 인텔리전스 미수집 상태로 기회 시그널이 제한됩니다.',
      sources: []
    };
  }

  const keywords = topKeywords(sources, 4);
  const keywordText = keywords.length ? keywords.join(', ') : '핵심 키워드 추출 없음';
  const topTitles = sources
    .slice(0, 3)
    .map((source) => source.title)
    .join(' / ');
  const snippetCorpus = sources.map((source) => source.snippet.toLowerCase()).join(' ');

  const hasPriceSignal = /가격|할인|price|promotion|deal|coupon/.test(snippetCorpus);
  const hasExperienceSignal = /경험|체험|experience|event|popup|immersive/.test(snippetCorpus);
  const hasChannelSignal = /instagram|youtube|shorts|틱톡|sns|social/.test(snippetCorpus);

  return {
    keyTrend: `상위 키워드(${keywordText}) 중심으로 검색 결과가 수렴하며, 실행형 콘텐츠 기획 관심이 높습니다.`,
    marketShift: hasPriceSignal
      ? '가격/혜택과 경험가치를 결합한 하이브리드 프로모션이 증가하고 있습니다.'
      : '브랜드 메시지와 성과 측정(전환/KPI)을 연결한 운영 방식이 강화되고 있습니다.',
    competitorSignals: `상위 노출 레퍼런스(${topTitles})에서 시즌/체험형 메시지와 채널별 포맷 최적화가 반복됩니다.`,
    riskSignals: hasChannelSignal
      ? '채널 포맷 적합성 미흡 시 노출 대비 전환 효율 저하 가능성이 큽니다.'
      : '차별적 가치 제안 없이 일반 카피 중심 집행 시 성과 편차가 커질 수 있습니다.',
    opportunitySignals: hasExperienceSignal
      ? '현장 경험(오프라인)과 디지털 확산(SNS)을 연동한 프로그램 설계 시 집객 상승 여지가 큽니다.'
      : '명확한 타깃 세분화와 실험 설계(A/B)를 결합하면 빠른 학습 루프 구축이 가능합니다.',
    sources: sources.map((source) => ({ title: source.title, url: source.url }))
  };
}

export function buildWebIntelligenceReport(sources: SourceLike[]) {
  const summary = buildWebIntelligenceSummary(sources);

  if (!summary.sources.length) {
    return [
      '[웹 인텔리전스 리포트]',
      `- 핵심 트렌드: ${summary.keyTrend}`,
      `- 시장 변화: ${summary.marketShift}`,
      `- 경쟁사 시그널: ${summary.competitorSignals}`,
      `- 리스크 시그널: ${summary.riskSignals}`,
      `- 기회 시그널: ${summary.opportunitySignals}`,
      '- 출처: 없음'
    ].join('\n');
  }

  return [
    '[웹 인텔리전스 리포트]',
    `- 핵심 트렌드: ${summary.keyTrend}`,
    `- 시장 변화: ${summary.marketShift}`,
    `- 경쟁사 시그널: ${summary.competitorSignals}`,
    `- 리스크 시그널: ${summary.riskSignals}`,
    `- 기회 시그널: ${summary.opportunitySignals}`,
    '- 출처:',
    ...summary.sources.map((source) => `- ${source.title}: ${source.url}`)
  ].join('\n');
}
