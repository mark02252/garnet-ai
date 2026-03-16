export type SeminarReportMetricItem = {
  label: string;
  count: number;
};

export type SeminarReportSourceItem = {
  title: string;
  url: string;
  count: number;
};

export type SeminarReportKeyValue = {
  label: string;
  value: string;
};

export type SeminarReportActionItem = {
  title: string;
  priority: 'NOW' | 'NEXT' | 'LATER';
  source?: string;
};

export type SeminarReportRoundItem = {
  roundNumber: number;
  pmSummary: string;
  deliverableType: string;
  objective: string;
  campaignName: string;
  direction: string;
  expectedImpact: string;
  risks: string;
  actions: string[];
  tags: string[];
};

export type StructuredSeminarFinalReport = {
  schemaVersion: '2026-03-13';
  sessionName: string;
  topic: string;
  operationWindow: string;
  completedRounds: number;
  maxRounds: number;
  completedRoundsLabel: string;
  intervalMinutes: number;
  debateCycles: number;
  summaryHeadline: string;
  strategy: SeminarReportKeyValue[];
  deliverableMix: SeminarReportMetricItem[];
  topTags: SeminarReportMetricItem[];
  topSources: SeminarReportSourceItem[];
  actions: SeminarReportActionItem[];
  roundLogs: SeminarReportRoundItem[];
  totalSourceReferences: number;
  totalUniqueSources: number;
  totalUniqueTags: number;
  totalDeliverableTypes: number;
};

export type ParsedSeminarReport = {
  sessionName: string;
  topic: string;
  operationWindow: string;
  completedRounds: string;
  intervalMinutes: string;
  debateCycles: string;
  roundLogs: string[];
  roundCards: SeminarReportRoundItem[];
  strategy: SeminarReportKeyValue[];
  deliverableMix: SeminarReportMetricItem[];
  topTags: SeminarReportMetricItem[];
  topSources: SeminarReportSourceItem[];
  actions: string[];
  actionItems: SeminarReportActionItem[];
  summaryHeadline: string;
  totalSourceReferences: number;
  totalUniqueSources: number;
  totalUniqueTags: number;
  totalDeliverableTypes: number;
  raw: string;
};

function normalizeLines(raw: string) {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseLineValue(lines: string[], label: string) {
  const match = lines.find((line) => line.startsWith(`- ${label}:`));
  if (!match) return '';
  return match.replace(`- ${label}:`, '').trim();
}

function splitSections(raw: string) {
  const sections = new Map<string, string[]>();
  const lines = raw.split('\n');
  let currentSection = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      continue;
    }

    if (!currentSection) continue;
    sections.set(currentSection, [...(sections.get(currentSection) || []), line]);
  }

  return sections;
}

function parseMetricItems(lines: string[]) {
  return lines
    .map((line) => {
      const cleaned = line.replace(/^-+\s*/, '').trim();
      const [labelPart, valuePart] = cleaned.split(':');
      const countMatch = String(valuePart || '').match(/\d+/);
      return {
        label: String(labelPart || '').trim(),
        count: countMatch ? Number(countMatch[0]) : 0
      };
    })
    .filter((item) => item.label);
}

function parseSourceItems(lines: string[]) {
  const items: SeminarReportSourceItem[] = [];
  let current: SeminarReportSourceItem | null = null;

  for (const line of lines) {
    if (line.startsWith('- ')) {
      const content = line.replace(/^-+\s*/, '').trim();
      const countMatch = content.match(/\((\d+)회\)/);
      const title = content.replace(/\s*\(\d+회\)\s*$/, '').trim();
      current = {
        title,
        url: '',
        count: countMatch ? Number(countMatch[1]) : 0
      };
      items.push(current);
      continue;
    }

    if (current && /^https?:\/\//i.test(line)) {
      current.url = line;
    }
  }

  return items;
}

function parseStrategy(lines: string[]) {
  return lines
    .map((line) => {
      const cleaned = line.replace(/^-+\s*/, '').trim();
      const [label, ...rest] = cleaned.split(':');
      return {
        label: String(label || '').trim(),
        value: rest.join(':').trim()
      };
    })
    .filter((item) => item.label && item.value);
}

function parseActionItems(lines: string[]) {
  return lines
    .map((line) => line.replace(/^[-\d.\s]+/, '').trim())
    .filter(Boolean);
}

function buildActionItems(actions: string[]) {
  return actions.map((title, idx) => ({
    title,
    priority: idx < 2 ? 'NOW' : idx < 4 ? 'NEXT' : 'LATER'
  })) as SeminarReportActionItem[];
}

export function buildStructuredSeminarFinalReportText(structured: StructuredSeminarFinalReport) {
  return [
    '[세션 통합 최종 보고서]',
    `- 세션명: ${structured.sessionName}`,
    `- 주제: ${structured.topic}`,
    `- 운영: ${structured.operationWindow}`,
    `- 완료 라운드: ${structured.completedRoundsLabel}`,
    `- 라운드 간격: ${structured.intervalMinutes}분`,
    `- 라운드 내부 상호검토: ${structured.debateCycles}회`,
    '',
    '[1) 라운드 의사결정 로그]',
    ...(structured.roundLogs.length
      ? structured.roundLogs.map(
          (round) =>
            `- R${round.roundNumber}: ${round.pmSummary || 'PM 요약 없음'} | 산출물=${round.deliverableType}${
              round.objective ? ` | 목표=${round.objective}` : ''
            }`
        )
      : ['- 요약 가능한 라운드 로그가 없습니다.']),
    '',
    '[2) 수렴된 전략 방향]',
    ...(structured.strategy.length
      ? structured.strategy.map((item) => `- ${item.label}: ${item.value}`)
      : ['- 전략 방향 데이터 없음']),
    '',
    '[3) 산출물 비중]',
    ...(structured.deliverableMix.length
      ? structured.deliverableMix.map((item) => `- ${item.label}: ${item.count}회`)
      : ['- 산출물 집계 없음']),
    '',
    '[4) 태그 빈도 Top]',
    ...(structured.topTags.length
      ? structured.topTags.map((item) => `- ${item.label}: ${item.count}`)
      : ['- 태그 데이터 없음']),
    '',
    '[5) 웹 인텔리전스 출처 Top]',
    ...(structured.topSources.length
      ? structured.topSources.map((item) => `- ${item.title} (${item.count}회)\n  ${item.url}`)
      : ['- 웹 출처 데이터 없음']),
    '',
    '[6) 최종 즉시 실행 액션]',
    ...(structured.actions.length
      ? structured.actions.map((item, idx) => `${idx + 1}. ${item.title}`)
      : ['1. 최신 라운드 산출물 기준으로 실행 우선순위 재정렬'])
  ].join('\n');
}

export function parseStructuredSeminarFinalReport(
  structured?: StructuredSeminarFinalReport | null,
  raw?: string | null
): ParsedSeminarReport | null {
  if (!structured) return null;

  return {
    sessionName: structured.sessionName,
    topic: structured.topic,
    operationWindow: structured.operationWindow,
    completedRounds: structured.completedRoundsLabel,
    intervalMinutes: `${structured.intervalMinutes}분`,
    debateCycles: `${structured.debateCycles}회`,
    roundLogs: structured.roundLogs.map(
      (round) =>
        `R${round.roundNumber} · ${round.pmSummary || 'PM 요약 없음'} · ${round.deliverableType}${
          round.objective ? ` · ${round.objective}` : ''
        }`
    ),
    roundCards: structured.roundLogs,
    strategy: structured.strategy,
    deliverableMix: structured.deliverableMix,
    topTags: structured.topTags,
    topSources: structured.topSources,
    actions: structured.actions.map((item) => item.title),
    actionItems: structured.actions,
    summaryHeadline: structured.summaryHeadline,
    totalSourceReferences: structured.totalSourceReferences,
    totalUniqueSources: structured.totalUniqueSources,
    totalUniqueTags: structured.totalUniqueTags,
    totalDeliverableTypes: structured.totalDeliverableTypes,
    raw: raw || buildStructuredSeminarFinalReportText(structured)
  };
}

export function parseSeminarFinalReport(raw?: string | null): ParsedSeminarReport | null {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;

  const sections = splitSections(normalized);
  const headerLines = sections.get('세션 통합 최종 보고서') || [];
  const roundLines = sections.get('1) 라운드 의사결정 로그') || [];
  const strategyLines = sections.get('2) 수렴된 전략 방향') || [];
  const deliverableLines = sections.get('3) 산출물 비중') || [];
  const tagLines = sections.get('4) 태그 빈도 Top') || [];
  const sourceLines = sections.get('5) 웹 인텔리전스 출처 Top') || [];
  const actionLines = sections.get('6) 최종 즉시 실행 액션') || [];

  const sessionName = parseLineValue(headerLines, '세션명');
  const topic = parseLineValue(headerLines, '주제');
  const operationWindow = parseLineValue(headerLines, '운영');
  const completedRounds = parseLineValue(headerLines, '완료 라운드');
  const intervalMinutes = parseLineValue(headerLines, '라운드 간격');
  const debateCycles = parseLineValue(headerLines, '라운드 내부 상호검토');

  if (!sessionName && !topic && !roundLines.length && !actionLines.length) {
    return null;
  }

  return {
    sessionName,
    topic,
    operationWindow,
    completedRounds,
    intervalMinutes,
    debateCycles,
    roundLogs: roundLines.map((line) => line.replace(/^-+\s*/, '').trim()).filter(Boolean),
    roundCards: [],
    strategy: parseStrategy(strategyLines),
    deliverableMix: parseMetricItems(deliverableLines),
    topTags: parseMetricItems(tagLines),
    topSources: parseSourceItems(sourceLines),
    actions: parseActionItems(actionLines),
    actionItems: buildActionItems(parseActionItems(actionLines)),
    summaryHeadline: parseLineValue(strategyLines, '최종 전략 방향'),
    totalSourceReferences: parseSourceItems(sourceLines).reduce((sum, item) => sum + item.count, 0),
    totalUniqueSources: parseSourceItems(sourceLines).length,
    totalUniqueTags: parseMetricItems(tagLines).length,
    totalDeliverableTypes: parseMetricItems(deliverableLines).length,
    raw: normalized
  };
}
