import {
  DEFAULT_AGENT_EXECUTION,
  DEFAULT_DOMAIN_AGENT_POOL,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import type {
  AgentExecutionConfig,
  DomainAgentPoolConfig,
  DomainAgentProfile,
  DomainKey
} from '@/lib/types';

export type AgentCard = {
  id: string;
  nickname: string;
  specialty: string;
  roleLabel?: string;
  phaseLabel?: string;
};

const DOMAIN_KEYS: DomainKey[] = [
  'MARKETING_GROWTH',
  'PRICING_PROCUREMENT',
  'OPERATIONS_EXPANSION',
  'FINANCE_STRATEGY',
  'GENERAL_STRATEGY'
];

const DOMAIN_LABELS: Record<DomainKey, string> = {
  MARKETING_GROWTH: '마케팅 성장',
  PRICING_PROCUREMENT: '단가/조달',
  OPERATIONS_EXPANSION: '운영/확장',
  FINANCE_STRATEGY: '재무 전략',
  GENERAL_STRATEGY: '범용 전략'
};

function mergePool(pool?: DomainAgentPoolConfig | null) {
  const defaults = sanitizeDomainAgentPoolConfig(DEFAULT_DOMAIN_AGENT_POOL);
  const custom = sanitizeDomainAgentPoolConfig(pool || {});
  const merged: DomainAgentPoolConfig = {
    ...defaults,
    ...custom,
    _GLOBAL_AGENT_POLICY: custom._GLOBAL_AGENT_POLICY || defaults._GLOBAL_AGENT_POLICY
  };
  return merged;
}

function uniqueProfiles(rows: DomainAgentProfile[]) {
  const seen = new Set<string>();
  const output: DomainAgentProfile[] = [];
  for (const row of rows) {
    const key = row.id.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(row);
  }
  return output;
}

export function getDomainAgentCatalog(pool?: DomainAgentPoolConfig | null, domain?: DomainKey | 'AUTO') {
  const merged = mergePool(pool);
  if (domain && domain !== 'AUTO') {
    return uniqueProfiles(merged[domain] || []);
  }
  return uniqueProfiles(DOMAIN_KEYS.flatMap((key) => merged[key] || []));
}

export function buildAgentCardsFromConfig(params: {
  pool?: DomainAgentPoolConfig | null;
  execution?: AgentExecutionConfig | null;
  fallbackDomain?: DomainKey | 'AUTO';
}) {
  const execution = params.execution || DEFAULT_AGENT_EXECUTION;
  const domain = execution.selectedDomain && execution.selectedDomain !== 'AUTO' ? execution.selectedDomain : params.fallbackDomain || 'AUTO';
  const catalog = getDomainAgentCatalog(params.pool, domain);
  const requestedIds = (execution.selectedAgents || []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const selected =
    requestedIds.length > 0
      ? catalog.filter((item) => requestedIds.includes(item.id.toLowerCase()) || requestedIds.includes(item.name.toLowerCase()))
      : catalog.slice(0, 4);

  const active = selected.length > 0 ? selected : catalog.slice(0, 4);
  const cards = active.slice(0, 4).map((item) => ({
    id: item.id,
    nickname: item.name,
    specialty: item.specialty.slice(0, 3).join(' · '),
    roleLabel: domain && domain !== 'AUTO' ? DOMAIN_LABELS[domain] : '도메인 자동'
  }));

  return [
    ...cards,
    {
      id: 'PM',
      nickname: 'PM',
      specialty: '최종 의사결정 및 산출물 확정',
      roleLabel: execution.taskMode || 'final_decision'
    }
  ];
}

export function parseTurnNickname(nickname: string, role: string) {
  const parts = nickname.split('·').map((item) => item.trim()).filter(Boolean);
  const baseName = parts[0] || nickname || role;
  const phaseLabel = parts.slice(1).join(' · ');
  return {
    baseName,
    phaseLabel,
    roleLabel: role === 'PM' ? '최종 의사결정' : '전문가 토론'
  };
}

export function buildAgentCardsFromTurns(
  turns: Array<{ role: string; nickname: string; content?: string }>
) {
  const seen = new Set<string>();
  const cards: AgentCard[] = [];

  for (const turn of turns) {
    const parsed = parseTurnNickname(turn.nickname, turn.role);
    const key = `${parsed.baseName}|${turn.role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      id: key,
      nickname: parsed.baseName,
      specialty: parsed.phaseLabel || (turn.role === 'PM' ? '최종 의사결정' : '회의 참여 에이전트'),
      roleLabel: parsed.roleLabel
    });
  }

  return cards;
}
