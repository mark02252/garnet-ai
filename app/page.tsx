'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AvatarCards } from '@/components/avatar-cards';
import { WarRoomEvidenceRail } from '@/components/war-room-evidence-rail';
import {
  AGENT_EXECUTION_KEY,
  BUSINESS_CONTEXT_KEY,
  DOMAIN_POOL_KEY,
  hasAgentExecution,
  hasBusinessContext,
  hasDomainAgentPoolConfig,
  sanitizeAgentExecution,
  sanitizeBusinessContext,
  sanitizeDomainAgentPoolConfig
} from '@/lib/agent-config';
import { buildAgentCardsFromConfig } from '@/lib/agent-ui';
import { defaultRuntimeDraft, mergeRuntimeDraft, type RuntimeDraft } from '@/lib/runtime-draft';
import { loadStoredRuntimeDraft } from '@/lib/runtime-storage';
import { extractFilePayload } from '@/lib/file-extract';
import type { AgentExecutionConfig, BusinessContext, DomainAgentPoolConfig, DomainOverride } from '@/lib/types';

const DRAFT_KEY = 'meeting_form_draft_v1';

type BriefAttachment = {
  name: string;
  mimeType: string;
  content: string;
  sourceType: 'CSV' | 'JSON' | 'TEXT' | 'XLSX' | 'PDF' | 'DOCX' | 'IMAGE' | 'UNKNOWN';
};

const MAX_ATTACHMENTS = 6;
const DOMAIN_LABELS: Record<DomainOverride, string> = {
  AUTO: '자동 추천 라우팅',
  MARKETING_GROWTH: '마케팅 성장 전략',
  PRICING_PROCUREMENT: '단가/조달 전략',
  OPERATIONS_EXPANSION: '운영/확장 전략',
  FINANCE_STRATEGY: '재무 전략',
  GENERAL_STRATEGY: '범용 전략'
};

export default function HomePage() {
  const router = useRouter();
  const defaultForm = {
    brief: '',
    topic: '',
    brand: '',
    region: '',
    goal: '',
    domainOverride: 'AUTO' as DomainOverride
  };
  const [form, setForm] = useState({
    ...defaultForm
  });
  const [inputMode, setInputMode] = useState<'simple' | 'advanced'>('simple');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeRunId, setActiveRunId] = useState('');
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [runProgress, setRunProgress] = useState<{
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    progressPct: number;
    stepLabel: string;
    message?: string;
    steps: Array<{ key: string; label: string; state: 'pending' | 'running' | 'completed' | 'failed' }>;
  } | null>(null);
  const progressSourceRef = useRef<EventSource | null>(null);
  const [envStatus, setEnvStatus] = useState<{
    ok: boolean;
    provider: 'openai' | 'gemini' | 'groq' | 'local' | 'openclaw';
    missing: string[];
    keyStatus: {
      openaiApiKey: boolean;
      geminiApiKey: boolean;
      geminiModel: boolean;
      groqApiKey: boolean;
      groqModel: boolean;
      localBaseUrl: boolean;
      localModel: boolean;
      searchApiKey: boolean;
    };
  } | null>(null);
  const [runtime, setRuntime] = useState<RuntimeDraft>({
    ...defaultRuntimeDraft
  });
  const [testingSearch, setTestingSearch] = useState(false);
  const [searchTestError, setSearchTestError] = useState('');
  const [searchTestResult, setSearchTestResult] = useState<{
    query: string;
    triedQueries?: string[];
    resolution?: {
      effectiveBrand?: string;
      effectiveRegion?: string;
      inferredBranch?: string;
      confidence?: number;
      reasons?: string[];
    };
    sourceCount: number;
    summary: {
      keyTrend: string;
      marketShift: string;
      competitorSignals: string;
      riskSignals: string;
      opportunitySignals: string;
    };
    webSources: Array<{ title: string; url: string; snippet: string }>;
  } | null>(null);
  const [attachments, setAttachments] = useState<BriefAttachment[]>([]);
  const [attachmentMessage, setAttachmentMessage] = useState('');
  const [domainAgentPoolConfig, setDomainAgentPoolConfig] = useState<DomainAgentPoolConfig>({});
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [agentExecution, setAgentExecution] = useState<AgentExecutionConfig | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<typeof defaultForm>;
        setForm({
          ...defaultForm,
          ...parsed,
          brief: typeof parsed?.brief === 'string' ? parsed.brief : '',
          topic: typeof parsed?.topic === 'string' ? parsed.topic : '',
          brand: typeof parsed?.brand === 'string' ? parsed.brand : '',
          region: typeof parsed?.region === 'string' ? parsed.region : '',
          goal: typeof parsed?.goal === 'string' ? parsed.goal : '',
          domainOverride:
            parsed?.domainOverride === 'MARKETING_GROWTH' ||
            parsed?.domainOverride === 'PRICING_PROCUREMENT' ||
            parsed?.domainOverride === 'OPERATIONS_EXPANSION' ||
            parsed?.domainOverride === 'FINANCE_STRATEGY' ||
            parsed?.domainOverride === 'GENERAL_STRATEGY'
              ? parsed.domainOverride
              : 'AUTO'
        });
      } catch {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadStoredRuntimeDraft({
        defaults: defaultRuntimeDraft,
        merge: mergeRuntimeDraft
      });
      if (!cancelled) {
        setRuntime(loaded.value);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(DOMAIN_POOL_KEY);
    if (!raw) return;
    try {
      setDomainAgentPoolConfig(sanitizeDomainAgentPoolConfig(JSON.parse(raw)));
    } catch {
      localStorage.removeItem(DOMAIN_POOL_KEY);
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(BUSINESS_CONTEXT_KEY);
    if (!raw) return;
    try {
      setBusinessContext(sanitizeBusinessContext(JSON.parse(raw)));
    } catch {
      localStorage.removeItem(BUSINESS_CONTEXT_KEY);
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(AGENT_EXECUTION_KEY);
    if (!raw) return;
    try {
      setAgentExecution(sanitizeAgentExecution(JSON.parse(raw)));
    } catch {
      localStorage.removeItem(AGENT_EXECUTION_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    fetch('/api/env-status')
      .then((res) => res.json())
      .then((data) => setEnvStatus(data))
      .catch(() =>
        setEnvStatus({
          ok: false,
          provider: 'gemini',
          missing: ['환경 상태 확인 실패'],
          keyStatus: {
            openaiApiKey: false,
            geminiApiKey: false,
            geminiModel: false,
            groqApiKey: false,
            groqModel: false,
            localBaseUrl: false,
            localModel: false,
            searchApiKey: false
          }
        })
      );
  }, []);

  useEffect(() => {
    if (!loading || !runStartedAt) return;
    setElapsedSec(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    const timer = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - runStartedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, runStartedAt]);

  const runningLabel = useMemo(() => {
    if (!loading) return '전략 회의 시작';
    if (runProgress) return `${runProgress.progressPct}% · ${runProgress.stepLabel}`;
    return '회의 실행 준비 중...';
  }, [loading, runProgress]);

  const stageSteps = runProgress?.steps || [
    { key: 'web_research', label: '웹 리서치', state: loading ? 'running' : 'pending' as const },
    { key: 'meeting', label: '역할별 회의', state: 'pending' as const },
    { key: 'deliverable', label: '최종 산출물', state: 'pending' as const },
    { key: 'memory', label: '메모리 로그', state: 'pending' as const }
  ];

  function formatElapsed(seconds: number) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  function clearProgressSource() {
    if (progressSourceRef.current) {
      progressSourceRef.current.close();
      progressSourceRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      clearProgressSource();
    };
  }, []);

  function startRunProgressPolling(runId: string) {
    clearProgressSource();

    const es = new EventSource(`/api/runs/${runId}/progress/stream`);
    progressSourceRef.current = es;

    es.onmessage = (event) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string) as Record<string, unknown>;
      } catch {
        return;
      }

      if (data.error) {
        clearProgressSource();
        setLoading(false);
        setError(String(data.error));
        return;
      }

      setRunProgress({
        status: data.status as 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED',
        progressPct: data.progressPct as number,
        stepLabel: data.stepLabel as string,
        message: data.message as string | undefined,
        steps: (data.steps as Array<{ key: string; label: string; state: 'pending' | 'running' | 'completed' | 'failed' }>) || []
      });

      if (data.status === 'COMPLETED') {
        clearProgressSource();
        setLoading(false);
        localStorage.removeItem(DRAFT_KEY);
        router.push(`/runs/${runId}`);
        return;
      }

      if (data.status === 'FAILED') {
        clearProgressSource();
        setLoading(false);
        setError((data.message as string) || '회의 실행 중 오류가 발생했습니다.');
      }
    };

    es.onerror = () => {
      clearProgressSource();
      setLoading(false);
      setError('진행 상태 스트림 연결이 끊겼습니다. 다시 시도해 주세요.');
    };
  }

  function parseBriefToFields(brief: string) {
    const safeBrief = typeof brief === 'string' ? brief : '';
    const lines = safeBrief
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const firstLine = lines[0] || '';
    const topic = firstLine || safeBrief.trim();

    const extract = (keys: string[]) => {
      for (const line of lines) {
        for (const key of keys) {
          const regex = new RegExp(`^${key}\\s*[:：-]\\s*(.+)$`, 'i');
          const match = line.match(regex);
          if (match?.[1]) return match[1].trim();
        }
      }
      return '';
    };

    return {
      topic,
      brand: extract(['브랜드', 'brand']),
      region: extract(['지역', 'region']),
      goal: extract(['목표', 'goal'])
    };
  }

  function buildPayload() {
    const runtimePayload = {
      llmProvider: runtime.llmProvider,
      runProfile: runtime.runProfile,
      openaiApiKey: runtime.openaiApiKey.trim(),
      openaiModel: runtime.openaiModel.trim(),
      geminiApiKey: runtime.geminiApiKey.trim(),
      geminiModel: runtime.geminiModel.trim(),
      groqApiKey: runtime.groqApiKey.trim(),
      groqModel: runtime.groqModel.trim(),
      localBaseUrl: runtime.localBaseUrl.trim(),
      localModel: runtime.localModel.trim(),
      localApiKey: runtime.localApiKey.trim(),
      openclawAgent: runtime.openclawAgent.trim(),
      searchApiKey: runtime.searchApiKey.trim(),
      searchProvider: ((runtime as Record<string, string>).searchProvider?.trim() || 'serper') as 'serper' | 'brave' | 'naver',
      searchIncludeDomains: runtime.searchIncludeDomains.trim(),
      searchExcludeDomains: runtime.searchExcludeDomains.trim()
    };

    if (inputMode === 'simple') {
      const parsed = parseBriefToFields(form.brief);
      return {
        topic: parsed.topic,
        brand: parsed.brand || '',
        region: parsed.region || '',
        goal: parsed.goal || '',
        domainOverride: form.domainOverride === 'AUTO' ? undefined : form.domainOverride,
        domainAgentPoolConfig: hasDomainAgentPoolConfig(domainAgentPoolConfig) ? domainAgentPoolConfig : undefined,
        businessContext: hasBusinessContext(businessContext) ? businessContext || undefined : undefined,
        agentExecution: hasAgentExecution(agentExecution) ? agentExecution || undefined : undefined,
        attachments: attachments.map((item) => ({
          name: item.name,
          mimeType: item.mimeType,
          content: item.content
        })),
        runtime: runtimePayload
      };
    }

    return {
      topic: form.topic,
      brand: form.brand,
      region: form.region,
      goal: form.goal,
      domainOverride: form.domainOverride === 'AUTO' ? undefined : form.domainOverride,
      domainAgentPoolConfig: hasDomainAgentPoolConfig(domainAgentPoolConfig) ? domainAgentPoolConfig : undefined,
      businessContext: hasBusinessContext(businessContext) ? businessContext || undefined : undefined,
      agentExecution: hasAgentExecution(agentExecution) ? agentExecution || undefined : undefined,
      attachments: attachments.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        content: item.content
      })),
      runtime: runtimePayload
    };
  }

  const payload = useMemo(buildPayload, [form, inputMode, runtime, attachments, domainAgentPoolConfig, businessContext, agentExecution]);
  const configSummary = useMemo(() => {
    const parts = [];
    if (hasDomainAgentPoolConfig(domainAgentPoolConfig)) parts.push('도메인 풀 커스텀');
    if (businessContext?.currentPriority) parts.push(`우선순위: ${businessContext.currentPriority}`);
    if (agentExecution?.taskMode) parts.push(`모드: ${agentExecution.taskMode}`);
    if (agentExecution?.selectedDomain && agentExecution.selectedDomain !== 'AUTO') {
      parts.push(`기본 도메인: ${agentExecution.selectedDomain}`);
    }
    if (agentExecution?.selectedAgents?.length) {
      parts.push(`선택 에이전트 ${agentExecution.selectedAgents.length}개`);
    }
    return parts.join(' · ');
  }, [domainAgentPoolConfig, businessContext, agentExecution]);
  const participantCards = useMemo(
    () =>
      buildAgentCardsFromConfig({
        pool: domainAgentPoolConfig,
        execution: agentExecution,
        fallbackDomain: form.domainOverride
      }),
    [domainAgentPoolConfig, agentExecution, form.domainOverride]
  );
  const attachmentTypes = useMemo(() => Array.from(new Set(attachments.map((item) => item.sourceType))), [attachments]);
  const attachmentNames = useMemo(() => attachments.map((item) => item.name), [attachments]);
  const envKeys = envStatus?.keyStatus;
  const hasSearchKey = !!(payload.runtime.searchApiKey || envKeys?.searchApiKey);
  const hasLlmKey =
    payload.runtime.runProfile === 'free'
      ? true
      : payload.runtime.llmProvider === 'gemini'
      ? !!((payload.runtime.geminiApiKey && (payload.runtime.geminiModel || envKeys?.geminiModel)) || (envKeys?.geminiApiKey && envKeys?.geminiModel))
      : payload.runtime.llmProvider === 'groq'
        ? !!(payload.runtime.groqApiKey || envKeys?.groqApiKey)
      : payload.runtime.llmProvider === 'local'
        ? !!((payload.runtime.localBaseUrl && payload.runtime.localModel) || (envKeys?.localBaseUrl && envKeys?.localModel))
        : payload.runtime.llmProvider === 'openclaw'
          ? true
        : !!(payload.runtime.openaiApiKey || envKeys?.openaiApiKey);
  const canRun = payload.topic.trim().length > 0;
  const canSearchTest = payload.topic.trim().length > 0 && hasSearchKey;
  const runProfileLabel =
    runtime.runProfile === 'free' ? '무료 자동 선택 모드' : `수동 선택 모드 · ${runtime.llmProvider.toUpperCase()}`;
  const runProgressPct = runProgress?.progressPct || (loading ? 8 : 0);
  const runStepLabel = runProgress?.stepLabel || (loading ? '실행 준비 중' : '실행 전 대기');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    setRunStartedAt(Date.now());
    setElapsedSec(0);
    setRunProgress(null);
    let queuedRunId = '';

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '회의 실행에 실패했습니다.');
      }

      queuedRunId = data.runId;
      setActiveRunId(data.runId);
      const resolvedInfo = [data.resolvedBrand, data.resolvedBranch, data.resolvedRegion]
        .map((v: unknown) => String(v || '').trim())
        .filter(Boolean)
        .join(' / ');
      const resolvedNotice = resolvedInfo
        ? `엔티티 해석: ${resolvedInfo}${data.resolutionConfidence ? ` (${data.resolutionConfidence}%)` : ''}`
        : '';
      if (data.providerNotice) {
        const routeModeLabel = data.routedMode === 'manual_override' ? '수동' : '자동';
        const routeNotice = data.routedDomain
          ? `도메인(${routeModeLabel}): ${String(data.routedDomain)} (${data.routedConfidence || '-'}%)`
          : '';
        setNotice([data.providerNotice, routeNotice, resolvedNotice].filter(Boolean).join(' · '));
      } else if (data.effectiveProvider) {
        const runProfileLabel = String(data.runProfile || runtime.runProfile).toUpperCase();
        const routeModeLabel = data.routedMode === 'manual_override' ? '수동' : '자동';
        const routeNotice = data.routedDomain
          ? ` · 도메인(${routeModeLabel}): ${String(data.routedDomain)} (${data.routedConfidence || '-'}%)`
          : '';
        setNotice(
          [
            `실행 모드: ${runProfileLabel}`,
            `선택 provider: ${String(data.effectiveProvider).toUpperCase()}${routeNotice}`,
            resolvedNotice
          ]
            .filter(Boolean)
            .join(' · ')
        );
      }
      startRunProgressPolling(data.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회의 실행에 실패했습니다.');
      clearProgressSource();
    } finally {
      if (!queuedRunId) {
        setLoading(false);
        setRunStartedAt(null);
      }
    }
  }

  async function onSearchTest() {
    if (!payload.topic.trim()) {
      setSearchTestError('웹서치 점검을 위해 주제를 먼저 입력해 주세요.');
      return;
    }

    setTestingSearch(true);
    setSearchTestError('');
    setSearchTestResult(null);
    try {
      const res = await fetch('/api/search/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '웹서치 점검에 실패했습니다.');
      }
      setSearchTestResult(data);
    } catch (err) {
      setSearchTestError(err instanceof Error ? err.message : '웹서치 점검에 실패했습니다.');
    } finally {
      setTestingSearch(false);
    }
  }

  async function onUploadAttachments(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setAttachmentMessage('');

    const remain = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const selected = files.slice(0, remain);
    const parsed = await Promise.all(selected.map((file) => extractFilePayload(file, 15000)));
    const normalized: BriefAttachment[] = parsed
      .map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        content: item.content,
        sourceType: item.sourceType
      }))
      .filter((item) => item.name && item.content);

    setAttachments((prev) => {
      const merged = [...prev, ...normalized];
      const deduped: BriefAttachment[] = [];
      const seen = new Set<string>();
      for (const item of merged) {
        const key = `${item.name}|${item.content.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      return deduped.slice(0, MAX_ATTACHMENTS);
    });

    const notes = parsed.map((item) => item.note).filter(Boolean);
    if (notes.length > 0) {
      setAttachmentMessage(notes[0] || '');
    } else if (files.length > remain) {
      setAttachmentMessage(`첨부는 최대 ${MAX_ATTACHMENTS}개까지 가능합니다.`);
    } else {
      setAttachmentMessage(`${normalized.length}개 파일을 첨부했습니다.`);
    }
    e.target.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-hero order-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="dashboard-eyebrow">Campaign Studio</p>
            <h2 className="dashboard-title">캠페인 스튜디오</h2>
            <p className="dashboard-copy">브리프를 넣고 바로 실행 흐름으로 넘깁니다.</p>
            {envStatus && !envStatus.ok && (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                `.env` 기준 누락 키: {envStatus.missing.join(', ')} (설정에서 바로 연결할 수 있습니다)
              </div>
            )}
            <div className="dashboard-link-strip">
              <Link href="/operations" className="dashboard-link-pill">
                오늘의 브리핑
              </Link>
              <Link href="/campaigns" className="dashboard-link-pill">
                캠페인 이어보기
              </Link>
              <Link href="/seminar" className="dashboard-link-pill">
                세미나 시뮬레이션
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="accent-pill">{runProfileLabel}</span>
              <span className="pill-option">에이전트 {participantCards.length}명</span>
              <span className="pill-option">첨부 {attachments.length}개</span>
            </div>
          </div>

          <div className="soft-card min-w-[220px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">오늘 상태</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="accent-pill">#{DOMAIN_LABELS[form.domainOverride]}</span>
              {canRun ? <span className="pill-option">실행 가능</span> : <span className="pill-option">브리프 필요</span>}
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--text-base)]">급한 안건은 브리핑에서 보고, 여기서 바로 다음 실행으로 넘기면 됩니다.</p>
          </div>
        </div>
      </section>

      <div className="order-2">
        <AvatarCards cards={participantCards} />
      </div>

      <form id="war-room-form" onSubmit={onSubmit} className="order-3">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.42fr)_332px]">
          <div className="space-y-4">
            <div className="panel space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Composer</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">브리프</h3>
                </div>
                <div className="segmented-wrap">
                  <button
                    type="button"
                    onClick={() => setInputMode('simple')}
                    className={`segmented-pill ${inputMode === 'simple' ? 'segmented-pill-active' : ''}`}
                  >
                    간단 브리프
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputMode('advanced')}
                    className={`segmented-pill ${inputMode === 'advanced' ? 'segmented-pill-active' : ''}`}
                  >
                    상세 입력
                  </button>
                </div>
              </div>

              {inputMode === 'simple' ? (
                <div className="soft-panel">
                  <label className="mb-1 block text-sm font-medium text-[var(--text-strong)]">브리프 *</label>
                  <textarea
                    required
                    value={form.brief}
                    onChange={(e) => setForm({ ...form, brief: e.target.value })}
                    className="input min-h-[136px]"
                    placeholder={'예)\n프리미엄 라이프스타일 브랜드 봄 시즌 전환 캠페인\n브랜드: 브랜드명\n지역: 서울 강남\n목표: 신규 문의 20% 증가'}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="pill-option">한 문장만 입력해도 시작</span>
                    <span className="pill-option">브랜드 · 지역 · 목표 함께 입력 가능</span>
                  </div>
                </div>
              ) : (
                <div className="soft-panel">
                  <div className="grid gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-[var(--text-strong)]">주제 *</label>
                      <input
                        required
                        value={form.topic}
                        onChange={(e) => setForm({ ...form, topic: e.target.value })}
                        className="input"
                        placeholder="예: 직장인 대상 저당 에너지드링크 출시 캠페인"
                      />
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--text-strong)]">브랜드</label>
                        <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--text-strong)]">지역</label>
                        <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-[var(--text-strong)]">목표</label>
                        <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="input" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="panel space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Routing</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">도메인 라우팅</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">자동 추천 또는 수동 고정 중 선택합니다.</p>
                </div>
                <span className="pill-option">현재 {DOMAIN_LABELS[form.domainOverride]}</span>
              </div>
              <select
                value={form.domainOverride}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    domainOverride: e.target.value as
                      | 'AUTO'
                      | 'MARKETING_GROWTH'
                      | 'PRICING_PROCUREMENT'
                      | 'OPERATIONS_EXPANSION'
                      | 'FINANCE_STRATEGY'
                      | 'GENERAL_STRATEGY'
                  }))
                }
                className="input"
              >
                <option value="AUTO">자동 추천 (Adaptive)</option>
                <option value="MARKETING_GROWTH">마케팅 성장 전략</option>
                <option value="PRICING_PROCUREMENT">단가/조달 전략</option>
                <option value="OPERATIONS_EXPANSION">운영/확장 전략</option>
                <option value="FINANCE_STRATEGY">재무 전략</option>
                <option value="GENERAL_STRATEGY">범용 전략</option>
              </select>
            </div>

            <div className="panel space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Attachments</p>
                <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">첨부</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">CSV, XLSX, JSON, TXT, PDF, DOCX, 이미지 파일을 최대 {MAX_ATTACHMENTS}개까지 연결합니다.</p>
              </div>
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json,.txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.bmp,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                className="block w-full text-xs text-[var(--text-muted)]"
                onChange={onUploadAttachments}
              />
              {attachmentMessage && <p className="text-xs text-[var(--text-muted)]">{attachmentMessage}</p>}
              {attachments.length === 0 && (
                <div className="rounded-lg border border-dashed border-[var(--surface-border)] bg-[var(--surface-sub)] px-4 py-4 text-sm text-[var(--text-muted)]">
                  아직 첨부된 파일이 없습니다.
                </div>
              )}
              {attachments.length > 0 && (
                <div className="grid gap-3">
                  {attachments.map((attachment, idx) => (
                    <div key={`${attachment.name}-${idx}`} className="list-card">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                          A{idx + 1} · {attachment.sourceType}
                        </p>
                        <button type="button" className="button-secondary px-3 py-1.5 text-[11px]" onClick={() => removeAttachment(idx)}>
                          제거
                        </button>
                      </div>
                      <p className="mt-2 text-sm font-medium text-[var(--text-strong)]">{attachment.name}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{attachment.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Launch</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">실행</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">준비되면 바로 실행하거나 검색만 먼저 확인할 수 있습니다.</p>
                </div>
                <Link href="/settings" className="button-secondary px-3 py-2 text-xs">
                  설정
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="accent-pill">{DOMAIN_LABELS[form.domainOverride]}</span>
                <span className="pill-option">
                  {runtime.runProfile === 'free' ? '무료모드(자동 선택)' : '수동모드(직접 선택)'}
                </span>
                {configSummary ? <span className="pill-option">{configSummary}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={loading || !canRun || !hasLlmKey || !hasSearchKey} className="button-primary">
                  {runningLabel}
                </button>
                <button
                  type="button"
                  onClick={onSearchTest}
                  disabled={testingSearch || !canSearchTest}
                  className="button-secondary"
                >
                  {testingSearch ? '웹서치 점검 중...' : '웹서치 품질 점검'}
                </button>
              </div>
              <p className="text-xs text-[var(--text-muted)]">실행 키와 관리자 연결은 설정에서 관리합니다.</p>
              {!canSearchTest && (
                <p className="text-xs text-amber-700">웹서치 점검은 주제와 Search API 키가 준비되면 사용할 수 있습니다.</p>
              )}
              {!hasLlmKey && (
                <p className="text-xs text-amber-700">LLM 키 또는 모델이 없어 실행할 수 없습니다. 설정 화면에서 연결을 먼저 확인해 주세요.</p>
              )}
              {notice && <p className="rounded-[20px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p>}
              {error && <p className="rounded-[20px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
            </div>

            {(loading || runProgress?.status === 'FAILED') && (
              <div className="panel space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="section-title">실시간 실행 현황</p>
                  <div className="flex items-center gap-2">
                    <span className="accent-pill">{loading ? 'RUNNING' : runProgress?.status || 'IDLE'}</span>
                    {activeRunId && (
                      <span className="pill-option">Run {activeRunId.slice(0, 8)}</span>
                    )}
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-border)]">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, runProgressPct))}%` }} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                  <p>{runProgressPct}% · {runStepLabel}</p>
                  <p>경과시간 {formatElapsed(elapsedSec)}</p>
                </div>
              </div>
            )}

            {searchTestError && <p className="rounded-[20px] bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchTestError}</p>}
            {searchTestResult && (
              <div className="panel space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Search Quality</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">웹서치 점검 결과</h3>
                  </div>
                  <span className="pill-option">{searchTestResult.sourceCount}개 소스</span>
                </div>
                {searchTestResult.resolution && (
                  <div className="surface-note">
                    해석: {[searchTestResult.resolution.effectiveBrand, searchTestResult.resolution.inferredBranch, searchTestResult.resolution.effectiveRegion]
                      .filter(Boolean)
                      .join(' / ') || '미확정'}
                    {typeof searchTestResult.resolution.confidence === 'number' ? ` (${searchTestResult.resolution.confidence}%)` : ''}
                  </div>
                )}
                <div className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">메인 쿼리</p>
                  <p className="mt-2 break-all text-sm leading-6 text-[var(--text-base)]">{searchTestResult.query}</p>
                </div>
                {(searchTestResult.triedQueries || []).length > 0 && (
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">시도한 쿼리</p>
                    <div className="mt-3 space-y-2">
                      {(searchTestResult.triedQueries || []).map((q, idx) => (
                        <p key={`${q}-${idx}`} className="text-sm leading-6 text-[var(--text-base)]">
                          {idx + 1}. {q}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">핵심 트렌드</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{searchTestResult.summary.keyTrend}</p>
                  </div>
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">시장 변화</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{searchTestResult.summary.marketShift}</p>
                  </div>
                </div>
                <div className="grid gap-3">
                  {searchTestResult.webSources.slice(0, 5).map((source) => (
                    <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="list-card block">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{source.title}</p>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{source.snippet}</p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-[var(--text-muted)]">입력값은 자동 저장되며, 실행 실패 시에도 그대로 유지됩니다.</p>
          </div>

          <WarRoomEvidenceRail
            topic={payload.topic}
            brand={payload.brand}
            region={payload.region}
            goal={payload.goal}
            domainLabel={DOMAIN_LABELS[form.domainOverride]}
            configSummary={configSummary}
            participantCount={participantCards.length}
            attachmentCount={attachments.length}
            attachmentTypes={attachmentTypes}
            attachmentNames={attachmentNames}
            runProfileLabel={runProfileLabel}
            llmReady={hasLlmKey}
            searchReady={hasSearchKey}
            canRun={canRun}
            loading={loading}
            progressPct={runProgressPct}
            stepLabel={runStepLabel}
            elapsedLabel={`경과 ${formatElapsed(elapsedSec)}`}
            activeRunId={activeRunId}
            stageSteps={stageSteps}
            searchSummary={searchTestResult?.summary}
            searchSources={searchTestResult?.webSources.map((source) => ({ title: source.title, url: source.url }))}
          />
        </div>
      </form>
    </div>
  );
}
