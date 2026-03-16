import { MeetingRole } from '@prisma/client';
import {
  DEFAULT_DOMAIN_AGENT_POOL,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import type {
  AgentExecutionConfig,
  BusinessContext,
  DomainAgentPoolConfig,
  DomainAgentProfile,
  DomainKey,
  DomainOverride,
  GlobalAgentPolicy,
  RunInput
} from '@/lib/types';

export type { DomainKey, DomainOverride };

export type DomainRouteResult = {
  domain: DomainKey;
  confidence: number;
  reasons: string[];
  specialists: DomainAgentProfile[];
  routingMode: 'adaptive_pool' | 'manual_override';
  globalPolicy?: GlobalAgentPolicy;
  businessContext?: BusinessContext;
  agentExecution?: AgentExecutionConfig;
};

const domainRules: Array<{
  domain: DomainKey;
  weight: number;
  keywords: string[];
  reasons: string[];
}> = [
  {
    domain: 'PRICING_PROCUREMENT',
    weight: 1.25,
    keywords: ['단가', '단가표', '견적', '원가', '구매', '조달', '발주', '벤더', '공급사', '납품', '설치', '장비', '시공', 'capex', '입찰'],
    reasons: ['가격/조달/설치 신호가 강해 총소유비용과 공급 안정성 중심 판단이 필요합니다.']
  },
  {
    domain: 'OPERATIONS_EXPANSION',
    weight: 1.15,
    keywords: ['운영', '프로세스', '확장', '지점', '현장', '인력', '스케줄', '공정', '품질', '재고', '유지보수', '배포'],
    reasons: ['운영/확장 키워드가 강해 실행 가능성과 병목 관리가 핵심입니다.']
  },
  {
    domain: 'FINANCE_STRATEGY',
    weight: 1.1,
    keywords: ['수익', '손익', '마진', '비용', '예산', '재무', '회수', '투자', 'opex', 'cashflow'],
    reasons: ['재무성 검토 키워드가 포함되어 손익/현금흐름 관점이 필요합니다.']
  },
  {
    domain: 'MARKETING_GROWTH',
    weight: 1,
    keywords: ['마케팅', '캠페인', '브랜딩', '콘텐츠', '광고', '전환', '유입', '리드', '포지셔닝', '프로모션'],
    reasons: ['마케팅/그로스 키워드가 중심이라 성장·리텐션 관점이 우선입니다.']
  }
];

const domainKeys: DomainKey[] = [
  'MARKETING_GROWTH',
  'PRICING_PROCUREMENT',
  'OPERATIONS_EXPANSION',
  'FINANCE_STRATEGY',
  'GENERAL_STRATEGY'
];

function normalizeText(text: string) {
  return text.toLowerCase();
}

function collectCorpus(input: RunInput) {
  const fields = [input.topic, input.brand, input.region, input.goal].filter(Boolean).join(' ');
  const attachmentNames = (input.attachments || []).map((a) => a.name).join(' ');
  const attachmentBody = (input.attachments || []).map((a) => a.content.slice(0, 1800)).join('\n');
  return normalizeText(`${fields}\n${attachmentNames}\n${attachmentBody}`);
}

function normalizeLegacySpecialists(
  specialists:
    | Array<{
        id: string;
        name: string;
        specialty: string;
        expectedOutput: string;
      }>
    | undefined
) {
  if (!Array.isArray(specialists)) return [];
  return specialists
    .map((item) => {
      const id = String(item?.id || '').trim();
      const name = String(item?.name || '').trim();
      const specialty = String(item?.specialty || '').trim();
      const expectedOutput = String(item?.expectedOutput || '').trim();
      if (!id || !name || !specialty || !expectedOutput) return null;
      return {
        id,
        name,
        specialty: [specialty],
        expectedOutput
      } satisfies DomainAgentProfile;
    })
    .filter((item): item is DomainAgentProfile => Boolean(item))
    .slice(0, 12);
}

function getDefaultPool() {
  return sanitizeDomainAgentPoolConfig(DEFAULT_DOMAIN_AGENT_POOL);
}

function resolvePool(input: RunInput): DomainAgentPoolConfig {
  const custom = sanitizeDomainAgentPoolConfig(input.domainAgentPoolConfig || {});
  const defaults = getDefaultPool();
  const merged: DomainAgentPoolConfig = {
    ...defaults,
    ...custom,
    _GLOBAL_AGENT_POLICY: custom._GLOBAL_AGENT_POLICY || defaults._GLOBAL_AGENT_POLICY
  };

  for (const domain of domainKeys) {
    if (custom[domain]?.length) {
      merged[domain] = custom[domain];
      continue;
    }
    const legacy = normalizeLegacySpecialists(input.domainSpecialistOverrides?.[domain]);
    if (legacy.length) {
      merged[domain] = legacy;
    }
  }

  return merged;
}

function filterSelectedAgents(specialists: DomainAgentProfile[], agentExecution?: AgentExecutionConfig) {
  const requested = (agentExecution?.selectedAgents || []).map((item) => item.trim()).filter(Boolean);
  if (!requested.length) return specialists;
  const idSet = new Set(requested.map((item) => item.toLowerCase()));
  const matched = specialists.filter(
    (profile) => idSet.has(profile.id.toLowerCase()) || idSet.has(profile.name.toLowerCase())
  );
  return matched.length ? matched : specialists;
}

function resolveDomainSpecialists(input: RunInput, domain: DomainKey) {
  const pool = resolvePool(input);
  const defaults = pool[domain] || [];
  return {
    specialists: filterSelectedAgents(defaults, input.agentExecution),
    globalPolicy: pool._GLOBAL_AGENT_POLICY
  };
}

function pickRequestedDomain(input: RunInput): DomainOverride {
  if (input.domainOverride && input.domainOverride !== 'AUTO') return input.domainOverride;
  if (input.agentExecution?.selectedDomain && input.agentExecution.selectedDomain !== 'AUTO') {
    return input.agentExecution.selectedDomain;
  }
  return 'AUTO';
}

function getGeneralSpecialists(input: RunInput) {
  const { specialists, globalPolicy } = resolveDomainSpecialists(input, 'GENERAL_STRATEGY');
  return { specialists, globalPolicy };
}

export function inferDomainRoute(input: RunInput): DomainRouteResult {
  const requestedOverride = pickRequestedDomain(input);
  const businessContext = input.businessContext;
  const agentExecution = input.agentExecution;

  if (requestedOverride !== 'AUTO') {
    const resolved =
      requestedOverride === 'GENERAL_STRATEGY'
        ? getGeneralSpecialists(input)
        : resolveDomainSpecialists(input, requestedOverride);
    const selectedAgentReason =
      agentExecution?.selectedAgents?.length
        ? [`선택 에이전트 ${agentExecution.selectedAgents.length}개를 우선 투입합니다.`]
        : [];
    return {
      domain: requestedOverride,
      confidence: 99,
      reasons: [`사용자 설정으로 ${requestedOverride} 도메인을 강제 적용했습니다.`, ...selectedAgentReason],
      specialists: resolved.specialists,
      routingMode: 'manual_override',
      globalPolicy: resolved.globalPolicy,
      businessContext,
      agentExecution
    };
  }

  const corpus = collectCorpus(input);
  const scoring = domainRules.map((rule) => {
    const hitCount = rule.keywords.reduce((acc, keyword) => acc + (corpus.includes(keyword.toLowerCase()) ? 1 : 0), 0);
    return { rule, hitCount, score: hitCount * rule.weight };
  });

  const best = scoring.sort((a, b) => b.score - a.score)[0];
  const hasSignal = best && best.hitCount > 0;
  const chosenDomain = hasSignal ? best.rule.domain : 'GENERAL_STRATEGY';
  const chosen = chosenDomain === 'GENERAL_STRATEGY' ? null : domainRules.find((rule) => rule.domain === chosenDomain);
  const resolved = chosenDomain === 'GENERAL_STRATEGY' ? getGeneralSpecialists(input) : resolveDomainSpecialists(input, chosenDomain);

  const reasons = chosen ? [...chosen.reasons] : ['명확한 도메인 신호가 약해 범용 전략 모드로 실행합니다.'];
  if (agentExecution?.selectedAgents?.length) {
    reasons.push(`선택 에이전트 ${agentExecution.selectedAgents.length}개를 우선 반영했습니다.`);
  }
  if (agentExecution?.taskMode === 'multi_agent_synthesis') {
    reasons.push('다중 에이전트 종합 모드로 상호 관점 통합을 강화합니다.');
  }

  const confidence = hasSignal ? Math.max(55, Math.min(96, Math.round(60 + best.hitCount * 7))) : 55;
  return {
    domain: chosenDomain,
    confidence,
    reasons,
    specialists: resolved.specialists,
    routingMode: 'adaptive_pool',
    globalPolicy: resolved.globalPolicy,
    businessContext,
    agentExecution
  };
}

function formatList(label: string, values?: string[], limit = 6) {
  if (!values?.length) return '';
  return `- ${label}: ${values.slice(0, limit).join(', ')}`;
}

function formatBusinessContext(context?: BusinessContext) {
  if (!context) return '';
  const lines = [
    '[비즈니스 컨텍스트]',
    context.companyStage ? `- companyStage: ${context.companyStage}` : '',
    context.businessModel ? `- businessModel: ${context.businessModel}` : '',
    context.currentPriority ? `- currentPriority: ${context.currentPriority}` : '',
    context.decisionHorizon ? `- decisionHorizon: ${context.decisionHorizon}` : '',
    formatList('constraints', context.constraints),
    formatList('responseExpectation', context.responseExpectation)
  ].filter(Boolean);
  return lines.join('\n');
}

function formatAgentExecution(config?: AgentExecutionConfig) {
  if (!config) return '';
  const lines = [
    '[에이전트 실행 정책]',
    config.taskMode ? `- taskMode: ${config.taskMode}` : '',
    config.selectedDomain ? `- selectedDomain: ${config.selectedDomain}` : '',
    formatList('selectedAgents', config.selectedAgents, 12)
  ].filter(Boolean);
  return lines.join('\n');
}

function formatGlobalPolicy(policy?: GlobalAgentPolicy) {
  if (!policy) return '';
  const lines = [
    '[글로벌 에이전트 정책]',
    policy.version ? `- version: ${policy.version}` : '',
    policy.purpose ? `- purpose: ${policy.purpose}` : '',
    formatList('globalInstructions', policy.globalInstructions, 8),
    formatList('globalAntiPatterns', policy.globalAntiPatterns, 6),
    formatList('defaultResponseFormat', policy.defaultResponseFormat, 6)
  ].filter(Boolean);
  return lines.join('\n');
}

function formatSpecialist(profile: DomainAgentProfile) {
  const decisionBits = [
    profile.decisionPolicy?.primaryObjective ? `objective=${profile.decisionPolicy.primaryObjective}` : '',
    profile.decisionPolicy?.tradeoffPriority?.length
      ? `tradeoff=${profile.decisionPolicy.tradeoffPriority.slice(0, 4).join('/')}`
      : '',
    profile.decisionPolicy?.riskTolerance ? `risk=${profile.decisionPolicy.riskTolerance}` : ''
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `  - ${profile.id} | ${profile.name}`,
    profile.roleSummary ? `    summary: ${profile.roleSummary}` : '',
    `    specialty: ${profile.specialty.slice(0, 6).join(', ')}`,
    decisionBits ? `    decisionPolicy: ${decisionBits}` : '',
    profile.frameworks?.length ? `    frameworks: ${profile.frameworks.slice(0, 5).join(', ')}` : '',
    profile.outputSchema?.mustInclude?.length
      ? `    mustInclude: ${profile.outputSchema.mustInclude.slice(0, 8).join(', ')}`
      : '',
    profile.instructions?.length ? `    roleInstructions: ${profile.instructions.slice(0, 3).join(' / ')}` : '',
    profile.antiPatterns?.length ? `    antiPatterns: ${profile.antiPatterns.slice(0, 3).join(' / ')}` : '',
    `    expectedOutput: ${profile.expectedOutput}`
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDomainRoutePrompt(route: DomainRouteResult) {
  return [
    formatBusinessContext(route.businessContext),
    formatAgentExecution(route.agentExecution),
    formatGlobalPolicy(route.globalPolicy),
    '[도메인 라우팅 결과]',
    `- routingMode: ${route.routingMode}`,
    `- primaryDomain: ${route.domain}`,
    `- confidence: ${route.confidence}`,
    `- routingReason: ${route.reasons.join(' ')}`,
    '- activeSpecialists:',
    ...route.specialists.map((profile) => formatSpecialist(profile)),
    '',
    '역할별 제안은 위 activeSpecialists 관점을 반드시 반영하고, 현재 비즈니스 컨텍스트와 taskMode에 맞는 실행안으로 압축하세요.'
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRoleDomainHint(role: MeetingRole, route: DomainRouteResult) {
  const domainLabel = route.domain;
  const firstSpecialty = route.specialists[0]?.specialty?.[0] || '전략';
  const expectedOutputs = route.specialists
    .map((profile) => profile.expectedOutput)
    .filter(Boolean)
    .slice(0, 2)
    .join(' / ');
  const priority = route.businessContext?.currentPriority || '핵심 우선순위';

  if (role === MeetingRole.STRATEGIST) {
    return `도메인 힌트(${domainLabel}): 문제정의를 '${firstSpecialty}' 중심으로 재구성하고, ${priority}에 직접 연결하세요.`;
  }
  if (role === MeetingRole.CONTENT_DIRECTOR) {
    return `도메인 힌트(${domainLabel}): 메시지/문서화는 '${expectedOutputs || '핵심 산출물'}'를 바로 실행 가능한 문장과 구조로 변환하세요.`;
  }
  if (role === MeetingRole.PERFORMANCE_MARKETER) {
    return `도메인 힌트(${domainLabel}): KPI 설계는 도메인 핵심 지표와 businessContext 제약(예산/효율/리텐션)을 우선 반영하세요.`;
  }
  if (role === MeetingRole.OPERATIONS_MANAGER) {
    return `도메인 힌트(${domainLabel}): 실행 단계에 책임자, 선행조건, 리스크 완화안을 반드시 포함하세요.`;
  }
  return `도메인 힌트(${domainLabel}): 최종 선택은 activeSpecialists 관점과 taskMode(${route.agentExecution?.taskMode || 'adaptive'})를 통합해 1안으로 결정하세요.`;
}
