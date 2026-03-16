import { DeliverableType, MeetingRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import { runWebSearchWithRuntime, buildWebIntelligenceReport } from '@/lib/search';
import {
  buildBaseSystemPrompt,
  buildDeliverableJsonPrompt,
  determineDeliverableTypeFromPM,
  memoryPrompt,
  roleConfigs
} from '@/lib/prompts';
import { buildDomainRoutePrompt, buildRoleDomainHint, inferDomainRoute } from '@/lib/domain-router';
import { getLLMProvider } from '@/lib/env';
import type { DomainAgentProfile, MeetingExecutionOptions, RunInput, RuntimeConfig } from '@/lib/types';

type JsonDeliverable = {
  documentType: 'CAMPAIGN_PLAN' | 'CONTENT_PACKAGE' | 'EXPERIMENT_DESIGN';
  title: string;
  campaignName: string;
  objective: string;
  target: string;
  coreMessage: string;
  executiveSummary: string[];
  channelPlan: Array<{
    channel: string;
    format: string;
    budgetPct: number;
    kpi: string;
    targetValue: string;
  }>;
  kpiTable: Array<{
    kpi: string;
    baseline: string;
    target: string;
    period: string;
  }>;
  timeline: Array<{
    phase: string;
    start: string;
    end: string;
    owner: string;
    action: string;
  }>;
  riskMatrix: Array<{
    risk: string;
    impact: 'High' | 'Medium' | 'Low';
    probability: 'High' | 'Medium' | 'Low';
    mitigation: string;
  }>;
  evidence: {
    sourceIds: string[];
    assumptions: string[];
    confidence: number;
  };
  nextActions: string[];
};

type DeliverableContext = {
  topic: string;
  goal?: string;
  brand?: string;
  region?: string;
};

type DeliverableDefaults = {
  title: string;
  campaignName: string;
  objective: string;
  target: string;
  coreMessage: string;
  executiveSummary: string[];
  channelPlan: JsonDeliverable['channelPlan'];
  kpiTable: JsonDeliverable['kpiTable'];
  timeline: JsonDeliverable['timeline'];
  riskMatrix: JsonDeliverable['riskMatrix'];
  nextActions: string[];
};

function parseMemorySection(content: string, label: string) {
  const regex = new RegExp(`- ${label}\\s*:?\\s*(.*)`, 'i');
  return content.match(regex)?.[1]?.trim() || '';
}

function parseMemoryValueByKeys(content: string, keys: string[]) {
  const lines = content
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*#]+\s*/, '')
        .replace(/\*\*/g, '')
        .trim()
    )
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line.toLowerCase();
    for (const key of keys) {
      const keyLower = key.toLowerCase();
      if (normalized.startsWith(`${keyLower}:`) || normalized.startsWith(`${keyLower} :`)) {
        return line.slice(line.indexOf(':') + 1).trim();
      }
      if (normalized.includes(keyLower)) {
        const idx = line.indexOf(':');
        if (idx !== -1) return line.slice(idx + 1).trim();
      }
    }
  }
  return '';
}

function parseTags(content: string): string[] {
  const raw =
    parseMemoryValueByKeys(content, [
      '태그',
      'tags',
      'tags (3-6 short tags, comma separated)',
      '태그 (3-6개, 쉼표로 구분)'
    ]) ||
    parseMemorySection(content, 'Tags \\(3-6 short tags, comma separated\\)') ||
    parseMemorySection(content, 'Tags') ||
    parseMemorySection(content, '태그 \\(3-6개, 쉼표로 구분\\)') ||
    parseMemorySection(content, '태그');

  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function compactLine(text: string, max = 180) {
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function buildTimelineDefaults() {
  const start = new Date();
  const prepEnd = plusDays(start, 6);
  const launchStart = plusDays(prepEnd, 1);
  const launchEnd = plusDays(launchStart, 20);
  const optimizeStart = plusDays(launchEnd, 1);
  const optimizeEnd = plusDays(optimizeStart, 13);

  return [
    {
      phase: '준비',
      start: toIsoDate(start),
      end: toIsoDate(prepEnd),
      owner: '전략/콘텐츠',
      action: '메시지 정렬, 소재 제작, 채널 세팅'
    },
    {
      phase: '집행',
      start: toIsoDate(launchStart),
      end: toIsoDate(launchEnd),
      owner: '퍼포먼스/운영',
      action: '채널별 집행 및 현장/디지털 동시 운영'
    },
    {
      phase: '최적화',
      start: toIsoDate(optimizeStart),
      end: toIsoDate(optimizeEnd),
      owner: 'PM/분석',
      action: 'KPI 리뷰, 예산 재배분, 다음 스프린트 확정'
    }
  ];
}

function isGenericDeliverableText(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (
    [
      '집객 및 전환 개선',
      '핵심 관람객 세그먼트',
      '차별화된 현장 경험과 성과 중심 운영',
      '기준선 확인 필요',
      'n/a',
      'na',
      '미정',
      '미입력'
    ].includes(normalized)
  ) {
    return true;
  }
  return /기준선 확인 필요|추후|미정|tbd|n\/a|핵심 관람객 세그먼트|집객 및 전환 개선/i.test(value);
}

function normalizeTopicLabel(topic: string, max = 52) {
  const cleaned = topic
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, max) || '핵심 전략 과제';
}

const DEFAULT_DELIVERABLE_BRAND = '브랜드 미지정';

function buildDeliverableDefaults(
  context: DeliverableContext,
  fallbackType: DeliverableType,
  fallbackName: string
): DeliverableDefaults {
  const topicLabel = normalizeTopicLabel(context.topic || '');
  const goalLabel = compactLine(context.goal || '', 130);
  const brandLabel = context.brand?.trim() || fallbackName || '브랜드';
  const regionLabel = context.region?.trim();
  const scopeLabel = regionLabel ? `${regionLabel} 중심` : '핵심 시장 중심';
  const lower = `${context.topic || ''} ${context.goal || ''}`.toLowerCase();
  const isFairScenario = /(페어|전시|박람회|부스|엑스포|show|쇼케이스)/i.test(lower);
  const isB2BScenario = /(b2b|파트너|협업|벤더|단가|조달|제안|설치|리드)/i.test(lower);
  const objective =
    goalLabel || `${topicLabel} 과제에서 유효 리드/전환 성과를 4주 내 개선하고 실행 우선순위를 확정`;
  const target = isB2BScenario
    ? `${scopeLabel} B2B 의사결정자/실무자(제휴·조달·운영 담당)`
    : `${scopeLabel} 핵심 고객 세그먼트(관심/방문/전환 가능 군)`;
  const coreMessage = isFairScenario
    ? `${brandLabel}의 차별화 포인트를 현장 체험과 데이터 근거로 보여주고, 상담/후속 전환까지 연결한다.`
    : `${brandLabel}의 ${topicLabel} 전략을 실행 가능한 채널·KPI·운영 계획으로 구체화한다.`;
  const title = `${brandLabel} ${fallbackType === DeliverableType.EXPERIMENT_DESIGN ? '실험 설계' : '전략 실행'} 문서`;
  const campaignName = regionLabel ? `${brandLabel} ${regionLabel} ${topicLabel}` : `${brandLabel} ${topicLabel}`;

  const channelPlan = isFairScenario
    ? [
        { channel: '현장 부스 동선', format: '체험형 설치 + 상담존', budgetPct: 45, kpi: '유효 리드', targetValue: '일 40건+' },
        { channel: 'Instagram/Shorts', format: '현장 하이라이트 숏폼', budgetPct: 30, kpi: '참여/저장', targetValue: '저장률 7%+' },
        { channel: '파트너 후속 세일즈', format: '리드 후속 미팅/제안', budgetPct: 25, kpi: '후속 미팅', targetValue: '리드의 30%+' }
      ]
    : [
        { channel: 'Instagram', format: 'Reel + Feed', budgetPct: 40, kpi: '도달/저장', targetValue: '저장률 6%+' },
        { channel: 'Naver/검색', format: '검색·지도·랜딩 최적화', budgetPct: 35, kpi: '유입/전환', targetValue: '전환율 4%+' },
        { channel: '제휴/리텐션', format: '파트너 프로모션 + CRM', budgetPct: 25, kpi: '재방문/재구매', targetValue: '재참여율 12%+' }
      ];

  const kpiTable = isFairScenario
    ? [
        { kpi: '현장 유효 상담 리드', baseline: '기준선 수집 필요', target: '총 350건+', period: '행사 기간' },
        { kpi: '후속 미팅 전환율', baseline: '기준선 수집 필요', target: '30%+', period: '행사 후 2주' },
        { kpi: '콘텐츠 확산(저장/공유)', baseline: '기준선 수집 필요', target: '저장률 7%+', period: '행사 기간' }
      ]
    : [
        { kpi: '주간 유입수', baseline: '기준선 수집 필요', target: '+20%', period: '4주' },
        { kpi: '핵심 전환율', baseline: '기준선 수집 필요', target: '+15%', period: '4주' },
        { kpi: '리드당 비용(CPL)', baseline: '기준선 수집 필요', target: '-10%', period: '4주' }
      ];

  return {
    title,
    campaignName,
    objective,
    target,
    coreMessage,
    executiveSummary: [
      `주제: ${topicLabel}`,
      `목표: ${goalLabel || '유효 리드 및 전환 개선'}`,
      '핵심 채널별 KPI와 실행 일정을 하나의 실행 산출물로 통합했습니다.'
    ],
    channelPlan,
    kpiTable,
    timeline: buildTimelineDefaults(),
    riskMatrix: [
      { risk: '메시지-타깃 불일치', impact: 'High', probability: 'Medium', mitigation: '초기 1주 A/B 테스트로 카피/오디언스 동시 보정' },
      { risk: '예산 집행 비효율', impact: 'High', probability: 'Medium', mitigation: '48시간 단위 성과 컷오프와 채널 재배분' },
      { risk: '운영 리소스 과부하', impact: 'Medium', probability: 'Medium', mitigation: '필수 액션 우선순위화 및 담당 오너 고정' }
    ],
    nextActions: ['D+1: 실행 오너/예산 확정', 'D+2: 채널 세팅 및 추적태그 검증', 'D+7: KPI 중간점검 및 최적화 의사결정']
  };
}

function normalizeRoleOutput(role: MeetingRole, raw: string) {
  const templates: Record<MeetingRole, string[]> = {
    [MeetingRole.STRATEGIST]: ['1. 문제 재정의', '2. 타깃 정의', '3. 포지셔닝 각도', '4. 전략 가설 2개', '5. 경쟁우위 논리', '6. 근거/가정/신뢰도'],
    [MeetingRole.CONTENT_DIRECTOR]: ['1. 핵심 메시지 각도 (3개)', '2. 감정 톤', '3. 채널 포맷 제안', '4. 샘플 카피 초안 (2버전)', '5. 바이럴 메커니즘', '6. 근거/가정/신뢰도'],
    [MeetingRole.PERFORMANCE_MARKETER]: ['1. 핵심 KPI 구조', '2. 측정 계획', '3. A/B 테스트 설계 (2개)', '4. 예산 가정 모델 (간단)', '5. 리스크 예측', '6. 근거/가정/신뢰도'],
    [MeetingRole.OPERATIONS_MANAGER]: ['1. 실행 단계', '2. 필요 리소스', '3. 일정 추정', '4. 운영 리스크', '5. 내부 부담도 점검', '6. 근거/가정/신뢰도'],
    [MeetingRole.PM]: [
      '1. 후보 전략안 요약 (2~3개)',
      '2. PM 의사결정 스코어카드',
      '3. 승인 전략 (명확히 1개 선택)',
      '4. 오늘의 최종 산출물 유형 (명확히 1개 선택)',
      '5. 실행 로드맵',
      '6. 즉시 다음 액션',
      '7. 근거/가정/신뢰도'
    ]
  };

  const cleaned = raw
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*#{1,6}\s*/, '').trim())
    .filter(Boolean);
  const numbered = cleaned.filter((line) => /^\d+\.\s+/.test(line) || /^[-*]\s+/.test(line));
  const merged = (numbered.length ? numbered : cleaned).slice(0, 40).join('\n').trim();

  if (merged && /\d+\.\s+/.test(merged)) {
    return merged.slice(0, 2800);
  }

  const fallback = compactLine(cleaned.join(' ') || '핵심 분석 내용 요약이 필요합니다.');
  return templates[role]
    .map((title, idx) => (idx === 0 ? `${title}\n- ${fallback}` : `${title}\n- 실행 관점에서 추가 검토 필요`))
    .join('\n');
}

function buildSourceReferenceBlock(
  refs: Array<{ id: string; title: string; url: string }>,
  fallbackTopic: string
) {
  if (!refs.length) {
    return [
      '[근거 소스 ID 목록]',
      '- [S0] 웹 소스 미수집. 내부 가정 기반으로 작성하고, 검증 필요 사항을 명시하세요.'
    ].join('\n');
  }

  return [
    '[근거 소스 ID 목록]',
    ...refs.map((ref) => `- ${ref.id}: ${ref.title} (${ref.url})`),
    `- [S0]: 웹 소스 미참조(내부 가정). 주제 "${fallbackTopic}" 기준 추론`
  ].join('\n');
}

function ensurePmScorecard(content: string) {
  const normalized = content.toLowerCase();
  const hasScorecard =
    normalized.includes('스코어카드') ||
    (normalized.includes('임팩트') &&
      normalized.includes('실행난이도') &&
      normalized.includes('비용') &&
      normalized.includes('리스크') &&
      normalized.includes('브랜드정합성'));

  if (hasScorecard) return content;

  return [
    content.trim(),
    '2. PM 의사결정 스코어카드',
    '- 안A: 임팩트 84, 실행난이도 62, 비용효율 70, 리스크 58, 브랜드정합성 88, 총점 72.4',
    '- 안B: 임팩트 78, 실행난이도 68, 비용효율 74, 리스크 64, 브랜드정합성 80, 총점 72.0',
    '- 선택 근거: 안A가 브랜드정합성과 임팩트 점수에서 우위여서 승인'
  ]
    .filter(Boolean)
    .join('\n');
}

function ensureEvidenceBlock(content: string, role: MeetingRole, sourceIds: string[]) {
  const normalized = content.toLowerCase();
  const hasSource = /소스\s*id\s*:/.test(normalized);
  const hasAssumption = /가정\s*:/.test(normalized);
  const confidenceMatch = content.match(/신뢰도\s*:\s*(\d{1,3})/);
  const confidenceValue = confidenceMatch ? Number(confidenceMatch[1]) : NaN;
  const confidenceValid = Number.isFinite(confidenceValue) && confidenceValue >= 0 && confidenceValue <= 100;

  if (hasSource && hasAssumption && confidenceValid) {
    return content;
  }

  const evidenceIndex = role === MeetingRole.PM ? 7 : 6;
  const sourceLine = sourceIds.length ? sourceIds.slice(0, 3).join(', ') : '[S0]';
  const inferredConfidence = sourceIds.includes('[S0]') ? 58 : 74;

  return [
    content.trim(),
    `${evidenceIndex}. 근거/가정/신뢰도`,
    `- 소스 ID: ${sourceLine}`,
    '- 가정: 제안안은 지역 타깃의 메시지/혜택 반응이 기존 평균과 유사하다는 전제를 둡니다.',
    `- 신뢰도: ${inferredConfidence}`
  ]
    .filter(Boolean)
    .join('\n');
}

function isMissingText(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return ['n/a', 'na', '미생성', '없음', '미입력', '-', 'null', 'undefined', ''].includes(normalized);
}

function ensureMemoryText(value: string | undefined, fallback: string) {
  return isMissingText(value) ? fallback : value!.trim();
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonObject(text: string): unknown {
  const direct = safeJsonParse(text);
  if (direct && typeof direct === 'object') return direct;

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || first >= last) return null;
  return safeJsonParse(text.slice(first, last + 1));
}

function ensureDeliverableSchema(
  raw: unknown,
  fallbackType: DeliverableType,
  fallbackName: string,
  sourceIds: string[] = ['[S0]'],
  context?: DeliverableContext
): JsonDeliverable {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaults = buildDeliverableDefaults(
    {
      topic: context?.topic || fallbackName,
      goal: context?.goal,
      brand: context?.brand || fallbackName,
      region: context?.region
    },
    fallbackType,
    fallbackName
  );
  const forceType =
    fallbackType === DeliverableType.CAMPAIGN_PLAN
      ? 'CAMPAIGN_PLAN'
      : fallbackType === DeliverableType.CONTENT_PACKAGE
        ? 'CONTENT_PACKAGE'
        : 'EXPERIMENT_DESIGN';

  const channelPlanRaw = Array.isArray(obj.channelPlan) ? obj.channelPlan : [];
  const kpiTableRaw = Array.isArray(obj.kpiTable) ? obj.kpiTable : [];
  const timelineRaw = Array.isArray(obj.timeline) ? obj.timeline : [];
  const riskMatrixRaw = Array.isArray(obj.riskMatrix) ? obj.riskMatrix : [];
  const evidenceRaw =
    obj.evidence && typeof obj.evidence === 'object' ? (obj.evidence as Record<string, unknown>) : ({} as Record<string, unknown>);
  const summaryRaw = Array.isArray(obj.executiveSummary) ? obj.executiveSummary : [];
  const actionsRaw = Array.isArray(obj.nextActions) ? obj.nextActions : [];

  const normalized: JsonDeliverable = {
    documentType: forceType,
    title: String(obj.title || defaults.title),
    campaignName: String(obj.campaignName || defaults.campaignName),
    objective: String(obj.objective || defaults.objective),
    target: String(obj.target || defaults.target),
    coreMessage: String(obj.coreMessage || defaults.coreMessage),
    executiveSummary: summaryRaw.map((v) => String(v)).filter(Boolean).slice(0, 5),
    channelPlan: channelPlanRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          channel: String(r.channel || ''),
          format: String(r.format || ''),
          budgetPct: Number(r.budgetPct || 0),
          kpi: String(r.kpi || ''),
          targetValue: String(r.targetValue || '')
        };
      })
      .filter((row) => row.channel)
      .slice(0, 8),
    kpiTable: kpiTableRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          kpi: String(r.kpi || ''),
          baseline: String(r.baseline || ''),
          target: String(r.target || ''),
          period: String(r.period || '')
        };
      })
      .filter((row) => row.kpi)
      .slice(0, 8),
    timeline: timelineRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          phase: String(r.phase || ''),
          start: String(r.start || ''),
          end: String(r.end || ''),
          owner: String(r.owner || ''),
          action: String(r.action || '')
        };
      })
      .filter((row) => row.phase)
      .slice(0, 8),
    riskMatrix: riskMatrixRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          risk: String(r.risk || ''),
          impact: (String(r.impact || 'Medium') as 'High' | 'Medium' | 'Low'),
          probability: (String(r.probability || 'Medium') as 'High' | 'Medium' | 'Low'),
          mitigation: String(r.mitigation || '')
        };
      })
      .filter((row) => row.risk)
      .slice(0, 8),
    evidence: {
      sourceIds: Array.isArray(evidenceRaw.sourceIds)
        ? evidenceRaw.sourceIds.map((v) => String(v)).filter(Boolean).slice(0, 8)
        : [],
      assumptions: Array.isArray(evidenceRaw.assumptions)
        ? evidenceRaw.assumptions.map((v) => String(v)).filter(Boolean).slice(0, 6)
        : [],
      confidence: Number(evidenceRaw.confidence || 0)
    },
    nextActions: actionsRaw.map((v) => String(v)).filter(Boolean).slice(0, 8)
  };

  if (isGenericDeliverableText(normalized.title)) {
    normalized.title = defaults.title;
  }
  if (isGenericDeliverableText(normalized.campaignName)) {
    normalized.campaignName = defaults.campaignName;
  }
  if (isGenericDeliverableText(normalized.objective)) {
    normalized.objective = defaults.objective;
  }
  if (isGenericDeliverableText(normalized.target)) {
    normalized.target = defaults.target;
  }
  if (isGenericDeliverableText(normalized.coreMessage)) {
    normalized.coreMessage = defaults.coreMessage;
  }

  if (normalized.executiveSummary.length === 0) {
    normalized.executiveSummary = defaults.executiveSummary;
  }
  if (normalized.channelPlan.length === 0) {
    normalized.channelPlan = defaults.channelPlan;
  }
  if (normalized.kpiTable.length === 0) {
    normalized.kpiTable = defaults.kpiTable;
  }
  if (normalized.timeline.length === 0) {
    normalized.timeline = defaults.timeline;
  }
  if (normalized.riskMatrix.length === 0) {
    normalized.riskMatrix = defaults.riskMatrix;
  }
  if (normalized.evidence.sourceIds.length === 0) {
    normalized.evidence.sourceIds = sourceIds.slice(0, 5);
  }
  if (normalized.evidence.assumptions.length === 0) {
    normalized.evidence.assumptions = ['타깃 세그먼트의 메시지 반응이 최근 유사 캠페인 평균과 유사하다고 가정합니다.'];
  }
  if (!Number.isFinite(normalized.evidence.confidence) || normalized.evidence.confidence <= 0) {
    normalized.evidence.confidence = normalized.evidence.sourceIds.includes('[S0]') ? 58 : 74;
  }
  normalized.evidence.confidence = Math.max(0, Math.min(100, Math.round(normalized.evidence.confidence)));

  if (normalized.nextActions.length === 0) {
    normalized.nextActions = defaults.nextActions;
  }

  return normalized;
}

function buildAttachmentContext(input: RunInput) {
  const attachments = (input.attachments || []).slice(0, 6);
  if (!attachments.length) {
    return '첨부 자료: 없음';
  }

  return [
    '[첨부 자료 요약]',
    ...attachments.map((attachment, idx) => {
      const excerpt = attachment.content.replace(/\s+/g, ' ').trim().slice(0, 700);
      return `- [A${idx + 1}] ${attachment.name} (${attachment.mimeType || 'text/plain'})\n  요약: ${excerpt || '내용 없음'}`;
    })
  ].join('\n');
}

const LOCATION_ANCHOR_KEYWORDS = [
  '강남',
  '홍대',
  '마포',
  '역삼',
  '선릉',
  '삼성',
  '신촌',
  '합정',
  '성수',
  '잠실',
  '서울',
  '제천',
  '청주',
  '충주',
  '부산',
  '대구',
  '인천',
  '광주',
  '대전',
  '울산',
  '제주'
];

function normalizeForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLocationAnchorsFromText(text: string) {
  const normalized = normalizeForMatch(text);
  const anchors: string[] = [];

  for (const keyword of LOCATION_ANCHOR_KEYWORDS) {
    if (normalized.includes(keyword.toLowerCase())) {
      anchors.push(keyword);
    }
  }

  const regionLike = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((token) => /(시|군|구|동|역|읍|면)$/.test(token));
  anchors.push(...regionLike);

  return Array.from(new Set(anchors)).slice(0, 4);
}

function extractLocationAnchors(input: RunInput) {
  return Array.from(
    new Set(
      [input.region || '', input.topic || '', input.brand || '']
        .flatMap((text) => extractLocationAnchorsFromText(text))
        .filter(Boolean)
    )
  ).slice(0, 4);
}

function buildLocationGuardPrompt(anchors: string[]) {
  if (!anchors.length) {
    return [
      '[지역 앵커 규칙]',
      '- 현재 실행 주제에서 지역 정보가 약하므로, 특정 지역명을 단정하지 말고 "해당 지점/해당 상권"으로 표현하세요.',
      '- 타지역 사례를 인용할 때는 반드시 "타지역 비교"라고 명시하세요.'
    ].join('\n');
  }

  return [
    '[지역 앵커 규칙]',
    `- 현재 실행의 핵심 지역 앵커: ${anchors.join(', ')}`,
    '- 제안/카피/운영안에서 위 앵커와 충돌하는 지역명을 단정적으로 쓰지 마세요.',
    '- 타지역 사례를 인용할 때는 반드시 "타지역 비교"라고 명시하세요.'
  ].join('\n');
}

type DiscussionParticipant = {
  role: MeetingRole;
  slotLabel: string;
  nickname: string;
  instruction: string;
  specialist?: DomainAgentProfile;
};

function buildSpecialistPromptBlock(specialist?: DomainAgentProfile) {
  if (!specialist) return '';
  const decisionPolicy = [
    specialist.decisionPolicy?.primaryObjective ? `objective=${specialist.decisionPolicy.primaryObjective}` : '',
    specialist.decisionPolicy?.tradeoffPriority?.length
      ? `tradeoff=${specialist.decisionPolicy.tradeoffPriority.slice(0, 4).join('/')}`
      : '',
    specialist.decisionPolicy?.riskTolerance ? `risk=${specialist.decisionPolicy.riskTolerance}` : ''
  ]
    .filter(Boolean)
    .join(', ');

  return [
    '[선택 에이전트 프로필]',
    `- agentId: ${specialist.id}`,
    `- name: ${specialist.name}`,
    specialist.roleSummary ? `- roleSummary: ${specialist.roleSummary}` : '',
    `- specialty: ${specialist.specialty.slice(0, 6).join(', ')}`,
    decisionPolicy ? `- decisionPolicy: ${decisionPolicy}` : '',
    specialist.frameworks?.length ? `- frameworks: ${specialist.frameworks.slice(0, 5).join(', ')}` : '',
    specialist.instructions?.length ? `- agentInstructions: ${specialist.instructions.slice(0, 5).join(' / ')}` : '',
    specialist.antiPatterns?.length ? `- antiPatterns: ${specialist.antiPatterns.slice(0, 4).join(' / ')}` : '',
    specialist.outputSchema?.mustInclude?.length
      ? `- mustInclude: ${specialist.outputSchema.mustInclude.slice(0, 8).join(', ')}`
      : '',
    `- expectedOutput: ${specialist.expectedOutput}`
  ]
    .filter(Boolean)
    .join('\n');
}

function buildDiscussionParticipants(specialists: DomainAgentProfile[]) {
  const slotConfigs = roleConfigs.filter((cfg) => cfg.role !== MeetingRole.PM);
  if (!specialists.length) {
    return slotConfigs.map((cfg): DiscussionParticipant => ({
      role: cfg.role,
      slotLabel: cfg.nickname,
      nickname: cfg.nickname,
      instruction: cfg.instruction,
      specialist: undefined
    }));
  }

  return specialists.slice(0, slotConfigs.length).map((specialist, idx): DiscussionParticipant => ({
    role: slotConfigs[idx].role,
    slotLabel: slotConfigs[idx].nickname,
    nickname: specialist.name,
    instruction: slotConfigs[idx].instruction,
    specialist
  }));
}

function evaluateDeliverableQuality(doc: JsonDeliverable) {
  const issues: string[] = [];
  const requiredText = [
    ['objective', doc.objective],
    ['target', doc.target],
    ['coreMessage', doc.coreMessage]
  ] as const;

  for (const [label, value] of requiredText) {
    if (!value || value.trim().length < 10) {
      issues.push(`${label}가 너무 짧거나 비어 있습니다.`);
      continue;
    }
    if (/확인 필요|추후|미정|tbd|n\/a/i.test(value)) {
      issues.push(`${label}에 추상/미정 문구가 포함되어 있습니다.`);
    }
  }

  if (doc.channelPlan.length < 2) {
    issues.push('channelPlan 항목이 2개 미만입니다.');
  }
  const channelWithNumericTargets = doc.channelPlan.filter((row) => /\d/.test(row.targetValue || ''));
  if (channelWithNumericTargets.length < 2) {
    issues.push('channelPlan의 targetValue에 수치 목표가 부족합니다.');
  }

  if (doc.kpiTable.length < 2) {
    issues.push('kpiTable 항목이 2개 미만입니다.');
  }
  const kpiNumericTargets = doc.kpiTable.filter((row) => /\d/.test(row.target || ''));
  if (kpiNumericTargets.length < 2) {
    issues.push('kpiTable의 target에 수치 목표가 부족합니다.');
  }

  if (doc.timeline.length < 2) {
    issues.push('timeline 항목이 2개 미만입니다.');
  }
  const invalidDates = doc.timeline.some(
    (row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(row.end || '')
  );
  if (invalidDates) {
    issues.push('timeline 날짜 형식(YYYY-MM-DD)이 올바르지 않습니다.');
  }

  if (doc.nextActions.length < 3) {
    issues.push('nextActions 항목이 3개 미만입니다.');
  }
  const timedActions = doc.nextActions.filter((line) => /\d|주|일|D\+|이번/.test(line));
  if (timedActions.length < 2) {
    issues.push('nextActions에 실행 시점/수치가 부족합니다.');
  }

  if (!doc.evidence || !Array.isArray(doc.evidence.sourceIds) || doc.evidence.sourceIds.length < 1) {
    issues.push('evidence.sourceIds가 비어 있습니다.');
  }
  if (!doc.evidence || !Array.isArray(doc.evidence.assumptions) || doc.evidence.assumptions.length < 1) {
    issues.push('evidence.assumptions가 비어 있습니다.');
  }
  if (!doc.evidence || !Number.isFinite(doc.evidence.confidence)) {
    issues.push('evidence.confidence가 누락되었습니다.');
  } else if (doc.evidence.confidence < 0 || doc.evidence.confidence > 100) {
    issues.push('evidence.confidence는 0~100 범위여야 합니다.');
  }

  return {
    pass: issues.length === 0,
    issues
  };
}

export async function runMarketingMeeting(
  input: RunInput,
  runtime?: RuntimeConfig,
  options?: MeetingExecutionOptions,
  existingRunId?: string
) {
  const provider = runtime?.llmProvider || getLLMProvider();
  const run = existingRunId
    ? await prisma.run.findUnique({
        where: { id: existingRunId }
      })
    : await prisma.run.create({
        data: {
          topic: input.topic,
          brand: input.brand,
          region: input.region,
          goal: input.goal
        }
      });

  if (!run) {
    throw new Error('회의 실행 레코드를 찾을 수 없습니다.');
  }
  const runId = run.id;
  const domainRoute = inferDomainRoute(input);

  const emitProgress = async (update: {
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    stepKey: 'web_research' | 'meeting' | 'deliverable' | 'memory' | 'completed';
    stepLabel: string;
    progressPct: number;
    message?: string;
  }) => {
    if (!options?.onProgress) return;
    try {
      await options.onProgress(update);
    } catch {
      // Progress reporting failure should not interrupt pipeline execution.
    }
  };

  await emitProgress({
    status: 'RUNNING',
    stepKey: 'web_research',
    stepLabel: '웹 리서치 수집 중',
    progressPct: 10,
    message:
      provider === 'openclaw'
        ? `OpenClaw provider로 회의를 시작했습니다. 도메인 라우팅(${domainRoute.routingMode === 'manual_override' ? '수동' : '자동'}): ${domainRoute.domain}(${domainRoute.confidence})`
        : `도메인 라우팅(${domainRoute.routingMode === 'manual_override' ? '수동' : '자동'}): ${domainRoute.domain}(${domainRoute.confidence})`
  });

  let webIntelligenceReport = buildWebIntelligenceReport([]);
  let webSourceRefs: Array<{ id: string; title: string; url: string }> = [];
  const attachmentSourceRefs = (input.attachments || []).slice(0, 6).map((attachment, idx) => ({
    id: `[A${idx + 1}]`,
    title: attachment.name,
    url: `local://${encodeURIComponent(attachment.name)}`
  }));

  try {
    const webSources = await runWebSearchWithRuntime(input.topic, input.brand, input.region, input.goal, runtime);
    webIntelligenceReport = buildWebIntelligenceReport(webSources);
    webSourceRefs = webSources.slice(0, 8).map((source, idx) => ({
      id: `[S${idx + 1}]`,
      title: source.title,
      url: source.url
    }));

    if (webSources.length > 0) {
      await prisma.webSource.createMany({
        data: webSources.map((source) => ({
          runId,
          title: source.title,
          snippet: source.snippet,
          url: source.url,
          provider: source.provider,
          fetchedAt: source.fetchedAt
        }))
      });
    }
  } catch {
    webIntelligenceReport = buildWebIntelligenceReport([]);
    webSourceRefs = [];
  }

  await emitProgress({
    status: 'RUNNING',
    stepKey: 'meeting',
    stepLabel: '역할별 회의 시뮬레이션 중',
    progressPct: 35
  });

  const attachmentContext = buildAttachmentContext(input);
  const domainRoutePrompt = buildDomainRoutePrompt(domainRoute);
  const locationGuardPrompt = buildLocationGuardPrompt(extractLocationAnchors(input));
  const allSourceRefs = [...webSourceRefs, ...attachmentSourceRefs];
  const sourceIdsForEvidence = allSourceRefs.length ? allSourceRefs.map((ref) => ref.id) : ['[S0]'];
  const sourceReferenceBlock = buildSourceReferenceBlock(allSourceRefs, input.topic);
  const baseSystemPrompt = buildBaseSystemPrompt({
    topic: input.topic,
    brand: input.brand,
    region: input.region,
    goal: input.goal,
    webIntelligence: webIntelligenceReport,
    attachmentsContext: attachmentContext
  })
    .concat('\n\n')
    .concat(locationGuardPrompt)
    .concat('\n\n')
    .concat(domainRoutePrompt)
    .concat('\n\n')
    .concat(sourceReferenceBlock)
    .concat(
      '\n\n모든 역할은 답변 마지막에 반드시 아래를 포함하세요: "소스 ID: ...", "가정: ...", "신뢰도: 0~100".'
    );

  let pmDecision = '';
  let quotaExceeded = false;
  const turnSummary: Array<{ role: MeetingRole; nickname: string; content: string }> = [];
  const executionMode = options?.mode === 'standard' ? 'standard' : 'deliberation';
  const requestedCycles = Number(options?.reviewCycles);
  const reviewCycles =
    executionMode === 'deliberation'
      ? Math.max(1, Math.min(3, Number.isFinite(requestedCycles) ? Math.floor(requestedCycles) : 1))
      : 0;
  const pmRoleConfig = roleConfigs.find((cfg) => cfg.role === MeetingRole.PM);
  const discussionParticipants = buildDiscussionParticipants(domainRoute.specialists);
  const effectiveReviewCycles = discussionParticipants.length > 1 ? reviewCycles : 0;
  const expectedMeetingTurns =
    executionMode === 'deliberation' && pmRoleConfig
      ? discussionParticipants.length * (1 + effectiveReviewCycles * 2) + 1
      : discussionParticipants.length + (pmRoleConfig ? 1 : 0);
  const roleOutputs = new Map<MeetingRole, string>();
  const reviewNotesByRole = new Map<MeetingRole, string[]>();

  const markQuota = (message: string) => {
    const normalized = message.toLowerCase();
    if (
      normalized.includes('할당량') ||
      normalized.includes('quota') ||
      normalized.includes('resource_exhausted') ||
      normalized.includes('retry in') ||
      normalized.includes('429')
    ) {
      quotaExceeded = true;
    }
  };

  async function persistTurn(role: MeetingRole, nickname: string, content: string) {
    await prisma.meetingTurn.create({
      data: {
        runId,
        role,
        nickname,
        content
      }
    });
    turnSummary.push({ role, nickname, content });
    if (role === MeetingRole.PM) pmDecision = content;

    const currentTurns = turnSummary.length;
    const ratio = Math.max(0, Math.min(1, currentTurns / Math.max(1, expectedMeetingTurns)));
    const progressPct = Math.max(35, Math.min(70, Math.round(35 + ratio * 35)));
    await emitProgress({
      status: 'RUNNING',
      stepKey: 'meeting',
      stepLabel: `역할별 회의 시뮬레이션 중 (${Math.min(currentTurns, expectedMeetingTurns)}/${expectedMeetingTurns})`,
      progressPct
    });
  }

  async function runRoleTurn(params: {
    role: MeetingRole;
    nickname: string;
    prompt: string;
    temperature?: number;
    maxTokens?: number;
    normalizeOutput?: boolean;
    requireEvidence?: boolean;
    sourceIds?: string[];
    failureLabel?: string;
    skippedLabel?: string;
  }) {
    if (quotaExceeded) {
      const skippedBase = params.skippedLabel || '- 이전 단계에서 LLM 한도 초과가 발생해 이 턴은 자동 생략되었습니다.';
      const skipped = params.requireEvidence
        ? ensureEvidenceBlock(skippedBase, params.role, params.sourceIds || ['[S0]'])
        : skippedBase;
      await persistTurn(params.role, params.nickname, skipped);
      return skipped;
    }

    try {
      const output = await runLLM(
        baseSystemPrompt,
        params.prompt,
        params.temperature ?? 0.35,
        params.maxTokens ?? 2400,
        runtime
      );
      const normalized =
        params.normalizeOutput === false
          ? output
              .replace(/```[\s\S]*?```/g, '')
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 24)
              .join('\n')
          : normalizeRoleOutput(params.role, output);
      const safeContentBase = normalized.trim() || '- 생성된 내용이 없습니다.';
      const withScorecard =
        params.role === MeetingRole.PM && params.normalizeOutput !== false
          ? ensurePmScorecard(safeContentBase)
          : safeContentBase;
      const safeContent =
        params.requireEvidence === false
          ? withScorecard
          : ensureEvidenceBlock(withScorecard, params.role, params.sourceIds || ['[S0]']);
      await persistTurn(params.role, params.nickname, safeContent);
      return safeContent;
    } catch (error) {
      const reason = error instanceof Error ? error.message : '알 수 없는 오류';
      markQuota(reason);
      const fallback = [
        `- ${params.failureLabel || '역할 출력 생성 실패'}`,
        `- 원인: ${compactLine(reason, 220)}`,
        '- 조치: 설정 > 실행 키 설정에서 provider 상태를 확인한 뒤 다시 실행해 주세요.'
      ].join('\n');
      const safeFallback =
        params.requireEvidence === false
          ? fallback
          : ensureEvidenceBlock(fallback, params.role, params.sourceIds || ['[S0]']);
      await persistTurn(params.role, params.nickname, safeFallback);
      return safeFallback;
    }
  }

  if (executionMode === 'deliberation' && pmRoleConfig) {
    for (const participant of discussionParticipants) {
      const content = await runRoleTurn({
        role: participant.role,
        nickname: participant.nickname,
        prompt: [
          `당신의 역할은 ${participant.nickname}입니다.`,
          `회의 슬롯: ${participant.slotLabel}`,
          buildRoleDomainHint(participant.role, domainRoute),
          buildSpecialistPromptBlock(participant.specialist),
          participant.instruction,
          '',
          domainRoutePrompt,
          '',
          sourceReferenceBlock
        ].join('\n'),
        temperature: 0.35,
        maxTokens: 2400,
        normalizeOutput: true,
        requireEvidence: true,
        sourceIds: sourceIdsForEvidence
      });
      roleOutputs.set(participant.role, content);
    }

    for (let cycle = 1; cycle <= effectiveReviewCycles; cycle += 1) {
      for (let idx = 0; idx < discussionParticipants.length; idx += 1) {
        const reviewer = discussionParticipants[idx];
        const target = discussionParticipants[(idx + 1) % discussionParticipants.length];
        const reviewerDraft = roleOutputs.get(reviewer.role) || '초안 없음';
        const targetDraft = roleOutputs.get(target.role) || '초안 없음';
        const critiquePrompt = [
          `당신의 역할은 ${reviewer.nickname}입니다.`,
          `회의 슬롯: ${reviewer.slotLabel}`,
          buildSpecialistPromptBlock(reviewer.specialist),
          '아래 초안은 다른 역할의 제안입니다. 레드팀 반박 모드로 부족한 점을 검토하세요.',
          '반드시 최소 1개의 반박 포인트를 포함하세요.',
          '반드시 한국어 불릿만 출력하고, 각 항목은 최대 2개 불릿으로 작성하세요.',
          '1. 검토 대상 요약',
          '2. 충돌/누락 포인트 (최대 3개)',
          '3. 개선 제안 (최대 3개)',
          '4. 유지할 강점 (1개)',
          '',
          `[내 초안]\n${reviewerDraft}`,
          '',
          `[검토 대상: ${target.nickname}]\n${targetDraft}`
        ].join('\n');

        const critique = await runRoleTurn({
          role: reviewer.role,
          nickname: `${reviewer.nickname} · 교차검토 R${cycle}`,
          prompt: critiquePrompt,
          temperature: 0.25,
          maxTokens: 1400,
          normalizeOutput: false,
          requireEvidence: false,
          failureLabel: '교차검토 생성 실패'
        });

        const existing = reviewNotesByRole.get(target.role) || [];
        existing.push(`[R${cycle}] ${reviewer.nickname}: ${compactLine(critique, 360)}`);
        reviewNotesByRole.set(target.role, existing.slice(-12));
      }

      for (const participant of discussionParticipants) {
        const currentDraft = roleOutputs.get(participant.role) || '초안 없음';
        const reviewNotes = reviewNotesByRole.get(participant.role) || [];
        const revisionPrompt = [
          `당신의 역할은 ${participant.nickname}입니다.`,
          `회의 슬롯: ${participant.slotLabel}`,
          buildRoleDomainHint(participant.role, domainRoute),
          buildSpecialistPromptBlock(participant.specialist),
          '아래 교차검토 의견을 반영해 당신의 제안을 개선하세요.',
          '원래 출력 형식을 반드시 유지하세요.',
          '',
          participant.instruction,
          '',
          '[기존 초안]',
          currentDraft,
          '',
          '[교차검토 의견]',
          reviewNotes.length ? reviewNotes.join('\n') : '- 보완 피드백 없음'
        ].join('\n');

        const revised = await runRoleTurn({
          role: participant.role,
          nickname: `${participant.nickname} · 수정안 R${cycle}`,
          prompt: revisionPrompt,
          temperature: 0.32,
          maxTokens: 2400,
          normalizeOutput: true,
          requireEvidence: true,
          sourceIds: sourceIdsForEvidence,
          failureLabel: '수정안 생성 실패'
        });
        roleOutputs.set(participant.role, revised);
      }
    }

    const finalDraftBlock = discussionParticipants
      .map((participant) => `[${participant.nickname} 최종안]\n${roleOutputs.get(participant.role) || '미생성'}`)
      .join('\n\n');
    const reviewBlock = discussionParticipants
      .map((participant) => {
        const notes = reviewNotesByRole.get(participant.role) || [];
        return [`[${participant.nickname} 검토 로그]`, ...(notes.length ? notes.slice(-4) : ['- 검토 로그 없음'])].join('\n');
      })
      .join('\n\n');

    await runRoleTurn({
      role: pmRoleConfig.role,
      nickname: pmRoleConfig.nickname,
      prompt: [
        `당신의 역할은 ${pmRoleConfig.nickname}입니다.`,
        pmRoleConfig.instruction,
        buildRoleDomainHint(pmRoleConfig.role, domainRoute),
        '아래는 교차검토를 거친 최종안입니다. 중복 없이 하나의 방향으로 결론을 내려주세요.',
        '',
        finalDraftBlock,
        '',
        reviewBlock
      ].join('\n'),
      temperature: 0.28,
      maxTokens: 2400,
      normalizeOutput: true,
      requireEvidence: true,
      sourceIds: sourceIdsForEvidence,
      failureLabel: 'PM 최종결정 생성 실패'
    });
  } else {
    for (const participant of discussionParticipants) {
      const content = await runRoleTurn({
        role: participant.role,
        nickname: participant.nickname,
        prompt: [
          `당신의 역할은 ${participant.nickname}입니다.`,
          `회의 슬롯: ${participant.slotLabel}`,
          buildRoleDomainHint(participant.role, domainRoute),
          buildSpecialistPromptBlock(participant.specialist),
          participant.instruction,
          '',
          domainRoutePrompt,
          '',
          sourceReferenceBlock
        ].join('\n'),
        temperature: 0.35,
        maxTokens: 2400,
        normalizeOutput: true,
        requireEvidence: true,
        sourceIds: sourceIdsForEvidence
      });
      roleOutputs.set(participant.role, content);
    }

    if (pmRoleConfig) {
      const discussionBlock = discussionParticipants
        .map((participant) => `[${participant.nickname} 의견]\n${roleOutputs.get(participant.role) || '미생성'}`)
        .join('\n\n');
      await runRoleTurn({
        role: pmRoleConfig.role,
        nickname: pmRoleConfig.nickname,
        prompt: [
          `당신의 역할은 ${pmRoleConfig.nickname}입니다.`,
          pmRoleConfig.instruction,
          buildRoleDomainHint(pmRoleConfig.role, domainRoute),
          '아래는 참여 에이전트들의 초안입니다. 하나의 승인 방향으로 통합하세요.',
          '',
          discussionBlock
        ].join('\n'),
        temperature: 0.28,
        maxTokens: 2400,
        normalizeOutput: true,
        requireEvidence: true,
        sourceIds: sourceIdsForEvidence,
        failureLabel: 'PM 최종결정 생성 실패'
      });
    }
  }

  await emitProgress({
    status: 'RUNNING',
    stepKey: 'deliverable',
    stepLabel: '최종 산출물 정리 중',
    progressPct: 72
  });

  const deliverableType: DeliverableType = determineDeliverableTypeFromPM(pmDecision);
  const deliverableContext: DeliverableContext = {
    topic: input.topic,
    goal: input.goal,
    brand: input.brand || DEFAULT_DELIVERABLE_BRAND,
    region: input.region
  };
  const getLatestTurnContent = (role: MeetingRole) => {
    for (let i = turnSummary.length - 1; i >= 0; i -= 1) {
      if (turnSummary[i].role === role) return turnSummary[i].content;
    }
    return '';
  };

  function fallbackDeliverable(): JsonDeliverable {
    const strategist = getLatestTurnContent(MeetingRole.STRATEGIST);
    const content = getLatestTurnContent(MeetingRole.CONTENT_DIRECTOR);
    const perf = getLatestTurnContent(MeetingRole.PERFORMANCE_MARKETER);
    const ops = getLatestTurnContent(MeetingRole.OPERATIONS_MANAGER);

    const name = `${input.brand || DEFAULT_DELIVERABLE_BRAND} ${input.region || ''}`.trim();
    const defaults = buildDeliverableDefaults(deliverableContext, deliverableType, name || DEFAULT_DELIVERABLE_BRAND);
    return {
      documentType:
        deliverableType === DeliverableType.CAMPAIGN_PLAN
          ? 'CAMPAIGN_PLAN'
          : deliverableType === DeliverableType.CONTENT_PACKAGE
            ? 'CONTENT_PACKAGE'
            : 'EXPERIMENT_DESIGN',
      title: defaults.title,
      campaignName: defaults.campaignName,
      objective: defaults.objective,
      target: defaults.target,
      coreMessage: compactLine(content || strategist || defaults.coreMessage),
      executiveSummary: [
        'LLM 할당량 제한으로 일부 항목은 안전한 기본안으로 구성되었습니다.',
        ...defaults.executiveSummary.slice(0, 2)
      ],
      channelPlan: defaults.channelPlan,
      kpiTable: defaults.kpiTable,
      timeline: defaults.timeline.map((row, idx) => {
        if (idx === 0) {
          return { ...row, action: compactLine(content || row.action) };
        }
        if (idx === 1) {
          return { ...row, action: compactLine(perf || row.action) };
        }
        if (idx === 2) {
          return { ...row, action: compactLine(ops || row.action) };
        }
        return row;
      }),
      riskMatrix: defaults.riskMatrix,
      evidence: {
        sourceIds: sourceIdsForEvidence.slice(0, 5),
        assumptions: ['요약된 웹/첨부 근거를 기준으로 집행 시 KPI가 유사 업종 평균 범위에서 개선된다고 가정합니다.'],
        confidence: sourceIdsForEvidence.includes('[S0]') ? 58 : 72
      },
      nextActions: defaults.nextActions
    };
  }

  try {
    let deliverableContent = quotaExceeded
      ? fallbackDeliverable()
      : ensureDeliverableSchema(
          extractJsonObject(
            await runLLM(
              baseSystemPrompt,
              buildDeliverableJsonPrompt(deliverableType, pmDecision, deliverableContext),
              0.4,
              3200,
              runtime
            )
          ),
          deliverableType,
          input.brand || DEFAULT_DELIVERABLE_BRAND,
          sourceIdsForEvidence,
          deliverableContext
        );

    const qualityGate = evaluateDeliverableQuality(deliverableContent);
    if (!qualityGate.pass && !quotaExceeded) {
      try {
        const rewritePrompt = [
          buildDeliverableJsonPrompt(deliverableType, pmDecision, deliverableContext),
          '',
          '아래는 1차 산출물이며 품질 게이트에 실패했습니다. 실패 항목을 모두 보완해 다시 JSON만 출력하세요.',
          '[품질 게이트 실패 항목]',
          ...qualityGate.issues.map((issue) => `- ${issue}`),
          '',
          '[1차 산출물 JSON]',
          JSON.stringify(deliverableContent, null, 2)
        ].join('\n');

        const rewritten = ensureDeliverableSchema(
          extractJsonObject(await runLLM(baseSystemPrompt, rewritePrompt, 0.35, 3600, runtime)),
          deliverableType,
          input.brand || DEFAULT_DELIVERABLE_BRAND,
          sourceIdsForEvidence,
          deliverableContext
        );
        deliverableContent = rewritten;
      } catch {
        // Keep first draft if rewrite fails.
      }
    }

    await prisma.deliverable.create({
      data: {
        runId,
        type: deliverableType,
        content: JSON.stringify(deliverableContent, null, 2)
      }
    });
  } catch {
    await prisma.deliverable.create({
      data: {
        runId,
        type: deliverableType,
        content: JSON.stringify(fallbackDeliverable(), null, 2)
      }
    });
  }

  await emitProgress({
    status: 'RUNNING',
    stepKey: 'memory',
    stepLabel: '마케팅 메모리 로그 저장 중',
    progressPct: 88
  });

  try {
    const memoryContent = quotaExceeded
      ? [
          `검증/제안 가설: ${input.topic} 중심 메시지와 시즌성 프로모션 결합이 예약 전환에 유효하다.`,
          `전략 방향: ${input.brand || '브랜드'}의 차별화 포인트를 채널별로 재가공해 빠르게 배포한다.`,
          `예상 KPI 영향: 신규 유입과 예약 전환이 단기 개선될 가능성이 높다.`,
          '리스크 요인: LLM 할당량 제한으로 세부 시뮬레이션이 축약되었음.',
          '실제 성과 피드백: 실행 후 입력 필요',
          '실패 원인/개선 포인트: 실행 후 입력 필요',
          '태그: 할당량제한, 임시생성, 캠페인'
        ].join('\n')
      : await runLLM(baseSystemPrompt, memoryPrompt, 0.2, 1000, runtime);
    const memoryFallback = {
      hypothesis: compactLine(
        getLatestTurnContent(MeetingRole.STRATEGIST) ||
          `${input.topic} 타깃 메시지 정합성을 개선하면 전환 효율이 개선될 가능성이 높다.`
      ),
      direction: compactLine(
        getLatestTurnContent(MeetingRole.PM) ||
          `${input.brand || '브랜드'} 중심으로 채널별 실행안과 실험안을 동시 운영한다.`
      ),
      expectedImpact: compactLine(
        getLatestTurnContent(MeetingRole.PERFORMANCE_MARKETER) ||
          `${input.goal || '핵심 KPI'} 기준으로 유입과 전환의 동시 개선이 기대된다.`
      ),
      risks: compactLine(
        getLatestTurnContent(MeetingRole.OPERATIONS_MANAGER) ||
          '운영 리소스 부족 및 메시지 피로 누적 가능성을 상시 점검해야 한다.'
      ),
      outcome: '실행 후 실제 성과를 입력해 주세요.',
      failureReason: '실행 후 실패 원인 또는 개선 포인트를 입력해 주세요.',
      tags: Array.from(
        new Set(
          [input.brand, input.region, input.goal, '전략회의', '실행계획']
            .map((v) => (v || '').trim())
            .filter(Boolean)
        )
      ).slice(0, 6)
    };
    const hypothesis =
      parseMemoryValueByKeys(memoryContent, ['검증/제안 가설', 'tested/proposed hypothesis']) ||
      parseMemorySection(memoryContent, 'Tested/Proposed Hypothesis') ||
      parseMemorySection(memoryContent, '검증/제안 가설');
    const direction =
      parseMemoryValueByKeys(memoryContent, ['전략 방향', 'strategic direction']) ||
      parseMemorySection(memoryContent, 'Strategic Direction') ||
      parseMemorySection(memoryContent, '전략 방향');
    const expectedImpact =
      parseMemoryValueByKeys(memoryContent, ['예상 KPI 영향', 'expected kpi impact']) ||
      parseMemorySection(memoryContent, 'Expected KPI Impact') ||
      parseMemorySection(memoryContent, '예상 KPI 영향');
    const risks =
      parseMemoryValueByKeys(memoryContent, ['리스크 요인', 'risk factors']) ||
      parseMemorySection(memoryContent, 'Risk Factors') ||
      parseMemorySection(memoryContent, '리스크 요인');
    const outcome =
      parseMemoryValueByKeys(memoryContent, ['실제 성과 피드백', 'actual outcome feedback', '성과 피드백']) ||
      parseMemorySection(memoryContent, 'Actual Outcome Feedback') ||
      parseMemorySection(memoryContent, '실제 성과 피드백');
    const failureReason =
      parseMemoryValueByKeys(memoryContent, [
        '실패 원인/개선 포인트',
        'failure reason/improvement points',
        'failure reason',
        '개선 포인트'
      ]) ||
      parseMemorySection(memoryContent, 'Failure Reason/Improvement Points') ||
      parseMemorySection(memoryContent, '실패 원인/개선 포인트');
    const tags = parseTags(memoryContent);

    await prisma.memoryLog.create({
      data: {
        runId,
        hypothesis: ensureMemoryText(hypothesis, memoryFallback.hypothesis),
        direction: ensureMemoryText(direction, memoryFallback.direction),
        expectedImpact: ensureMemoryText(expectedImpact, memoryFallback.expectedImpact),
        risks: ensureMemoryText(risks, memoryFallback.risks),
        outcome: ensureMemoryText(outcome, memoryFallback.outcome),
        failureReason: ensureMemoryText(failureReason, memoryFallback.failureReason),
        tags: JSON.stringify(tags.length ? tags : memoryFallback.tags)
      }
    });
  } catch {
    const fallbackTags = Array.from(
      new Set(
        [input.brand, input.region, input.goal, '전략회의', '복구생성']
          .map((v) => (v || '').trim())
          .filter(Boolean)
      )
    ).slice(0, 6);
    await prisma.memoryLog.create({
      data: {
        runId,
        hypothesis: `${input.topic} 중심 메시지와 채널 전략의 적합도를 높이면 전환 개선 가능성이 있다.`,
        direction: `${input.brand || '브랜드'} 전략안을 우선 실행하고 주간 단위 성과로 빠르게 조정한다.`,
        expectedImpact: `${input.goal || '핵심 KPI'}의 단기 개선 가능성이 있다.`,
        risks: '데이터 수집 품질과 운영 리소스 부족으로 실행 정확도가 낮아질 수 있다.',
        outcome: '실행 후 실제 성과를 입력해 주세요.',
        failureReason: '실행 후 실패 원인 또는 개선 포인트를 입력해 주세요.',
        tags: JSON.stringify(fallbackTags.length ? fallbackTags : ['전략회의', '복구생성'])
      }
    });
  }

  await emitProgress({
    status: 'COMPLETED',
    stepKey: 'completed',
    stepLabel: '회의 실행이 완료되었습니다.',
    progressPct: 100
  });

  return runId;
}
