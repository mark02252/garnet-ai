'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PageTransition } from '@/components/page-transition';
import { CopyButton } from '@/components/copy-button';
import { SeminarReportDashboard } from '@/components/seminar-report-dashboard';
import type { StructuredSeminarFinalReport } from '@/lib/report-visuals';
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
import {
  defaultSeminarRuntimeDraft,
  mergeSeminarRuntimeDraft,
  type SeminarRuntimeDraft
} from '@/lib/runtime-draft';
import { loadStoredRuntimeDraft } from '@/lib/runtime-storage';
import type { AgentExecutionConfig, BusinessContext, DomainAgentPoolConfig } from '@/lib/types';

type SeminarSession = {
  id: string;
  title: string | null;
  topic: string;
  brand: string | null;
  region: string | null;
  goal: string | null;
  status: 'PLANNED' | 'RUNNING' | 'STOPPED' | 'COMPLETED' | 'FAILED';
  startsAt: string;
  endsAt: string;
  intervalMinutes: number;
  maxRounds: number;
  completedRounds: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  morningBriefing: string | null;
  lastError: string | null;
  createdAt: string;
};

type SeminarRound = {
  id: string;
  roundNumber: number;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  runId: string | null;
  summary: string | null;
  error: string | null;
  scheduledAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

type SeminarFinalReport = {
  id: string;
  sessionId: string;
  content: string;
  structured: StructuredSeminarFinalReport | null;
  createdAt: string;
  updatedAt: string;
};

const statusLabel: Record<SeminarSession['status'], string> = {
  PLANNED: '예약됨',
  RUNNING: '진행 중',
  STOPPED: '중지됨',
  COMPLETED: '완료',
  FAILED: '실패'
};

const statusClass: Record<SeminarSession['status'], string> = {
  PLANNED: 'status-badge status-badge-neutral',
  RUNNING: 'status-badge status-badge-running',
  STOPPED: 'status-badge status-badge-neutral',
  COMPLETED: 'status-badge status-badge-info',
  FAILED: 'status-badge status-badge-error'
};

const SEMINAR_PRESETS = [
  {
    key: 'sprint',
    label: '스프린트',
    desc: '6시간 동안 고밀도 토론',
    durationHours: 6,
    intervalMinutes: 30
  },
  {
    key: 'overnight',
    label: '올나잇',
    desc: '12시간 심화 라운드',
    durationHours: 12,
    intervalMinutes: 40
  },
  {
    key: 'full-day',
    label: '풀데이 (권장)',
    desc: '24시간 안정 운영',
    durationHours: 24,
    intervalMinutes: 60
  },
  {
    key: 'custom',
    label: '직접 설정',
    desc: '시간/간격 수동 입력',
    durationHours: 24,
    intervalMinutes: 60
  }
] as const;

type SeminarPresetKey = (typeof SEMINAR_PRESETS)[number]['key'];

function parseBriefToFields(brief: string) {
  const lines = brief
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] || '';

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
    topic: firstLine,
    brand: extract(['브랜드', 'brand']),
    region: extract(['지역', 'region']),
    goal: extract(['목표', 'goal'])
  };
}

function buildRuntimePayload(runtime: SeminarRuntimeDraft) {
  return {
    runProfile: runtime.runProfile,
    llmProvider: runtime.llmProvider,
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
    searchProvider: (((runtime as unknown) as Record<string, string>).searchProvider?.trim() || 'serper') as 'serper' | 'brave' | 'naver',
    searchIncludeDomains: runtime.searchIncludeDomains.trim(),
    searchExcludeDomains: runtime.searchExcludeDomains.trim(),
    seminarDebateCycles: Math.max(1, Math.min(3, Math.floor(Number(runtime.seminarDebateCycles) || 1)))
  };
}

export default function SeminarPage() {
  const [sessions, setSessions] = useState<SeminarSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [rounds, setRounds] = useState<SeminarRound[]>([]);
  const [briefing, setBriefing] = useState('');
  const [finalReport, setFinalReport] = useState<SeminarFinalReport | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [domainAgentPoolConfig, setDomainAgentPoolConfig] = useState<DomainAgentPoolConfig>({});
  const [businessContext, setBusinessContext] = useState<BusinessContext | null>(null);
  const [agentExecution, setAgentExecution] = useState<AgentExecutionConfig | null>(null);
  const [runtime, setRuntime] = useState<SeminarRuntimeDraft>({
    ...defaultSeminarRuntimeDraft
  });
  const [form, setForm] = useState({
    title: '',
    brief: '',
    topic: '',
    brand: '',
    region: '',
    goal: '',
    presetKey: 'full-day' as SeminarPresetKey,
    startMode: 'now' as 'now' | 'scheduled',
    startsAtLocal: '',
    durationHours: 24,
    intervalMinutes: 60
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadStoredRuntimeDraft({
        defaults: defaultSeminarRuntimeDraft,
        merge: mergeSeminarRuntimeDraft
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

  async function refreshSessions() {
    const res = await fetch('/api/seminar/sessions');
    const data = (await res.json()) as { sessions: SeminarSession[] };
    setSessions(data.sessions || []);
    if (data.sessions?.length && !selectedId) setSelectedId(data.sessions[0].id);
  }

  async function refreshDetail(id: string) {
    if (!id) return;
    const res = await fetch(`/api/seminar/sessions/${id}`);
    const data = (await res.json()) as {
      ok: boolean;
      session?: SeminarSession;
      rounds?: SeminarRound[];
      finalReport?: SeminarFinalReport | null;
    };
    if (!data.ok || !data.session) return;
    setRounds(data.rounds || []);
    setBriefing(data.session.morningBriefing || '');
    setFinalReport(data.finalReport || null);
    setSessions((prev) => prev.map((item) => (item.id === id ? data.session! : item)));
  }

  useEffect(() => {
    void refreshSessions();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void refreshDetail(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) return;
    setFinalReport(null);
  }, [selectedId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSessions();
      if (selectedId) void refreshDetail(selectedId);
    }, 12_000);
    return () => clearInterval(timer);
  }, [selectedId]);

  const selected = useMemo(() => sessions.find((session) => session.id === selectedId) || null, [sessions, selectedId]);
  const parsedBrief = useMemo(() => parseBriefToFields(form.brief), [form.brief]);
  const resolvedTopic = useMemo(() => form.topic.trim() || parsedBrief.topic, [form.topic, parsedBrief.topic]);
  const resolvedBrand = useMemo(() => form.brand.trim() || parsedBrief.brand, [form.brand, parsedBrief.brand]);
  const resolvedRegion = useMemo(() => form.region.trim() || parsedBrief.region, [form.region, parsedBrief.region]);
  const resolvedGoal = useMemo(() => form.goal.trim() || parsedBrief.goal, [form.goal, parsedBrief.goal]);

  const plannedRounds = useMemo(
    () => Math.max(1, Math.floor((form.durationHours * 60) / Math.max(10, form.intervalMinutes))),
    [form.durationHours, form.intervalMinutes]
  );

  const operationSummary = useMemo(() => {
    const startText =
      form.startMode === 'scheduled' && form.startsAtLocal
        ? new Date(form.startsAtLocal).toLocaleString('ko-KR')
        : '즉시 시작';
    const cycleText = `라운드 내부 교차검토 ${Math.max(1, runtime.seminarDebateCycles)}회`;
    return `${startText} / ${form.durationHours}시간 동안 ${form.intervalMinutes}분 간격 / 총 ${plannedRounds}라운드 / ${cycleText}`;
  }, [form.startMode, form.startsAtLocal, form.durationHours, form.intervalMinutes, plannedRounds, runtime.seminarDebateCycles]);

  const strategyConfigSummary = useMemo(() => {
    const parts = [];
    if (agentExecution?.taskMode) parts.push(agentExecution.taskMode);
    if (agentExecution?.selectedDomain && agentExecution.selectedDomain !== 'AUTO') {
      parts.push(`도메인 ${agentExecution.selectedDomain}`);
    }
    if (agentExecution?.selectedAgents?.length) parts.push(`에이전트 ${agentExecution.selectedAgents.length}개`);
    if (businessContext?.currentPriority) parts.push(`우선순위 ${businessContext.currentPriority}`);
    if (hasDomainAgentPoolConfig(domainAgentPoolConfig)) parts.push('커스텀 도메인 풀');
    return parts.join(' · ');
  }, [agentExecution, businessContext, domainAgentPoolConfig]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const topic = resolvedTopic.trim();
      if (!topic) {
        throw new Error('회의 주제를 입력해 주세요. (브리프 첫 줄 또는 주제 칸)');
      }

      let startsAt: string | undefined;
      if (form.startMode === 'scheduled') {
        if (!form.startsAtLocal) throw new Error('예약 시작 시간을 선택해 주세요.');
        const date = new Date(form.startsAtLocal);
        if (Number.isNaN(date.getTime())) throw new Error('예약 시작 시간이 올바르지 않습니다.');
        startsAt = date.toISOString();
      }

      const res = await fetch('/api/seminar/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim() || undefined,
          topic,
          brand: resolvedBrand || undefined,
          region: resolvedRegion || undefined,
          goal: resolvedGoal || undefined,
          startsAt,
          durationHours: form.durationHours,
          intervalMinutes: form.intervalMinutes,
          runtime: {
            ...buildRuntimePayload(runtime),
            domainAgentPoolConfig: hasDomainAgentPoolConfig(domainAgentPoolConfig) ? domainAgentPoolConfig : undefined,
            businessContext: hasBusinessContext(businessContext) ? businessContext || undefined : undefined,
            agentExecution: hasAgentExecution(agentExecution) ? agentExecution || undefined : undefined
          }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '세미나 생성 실패');

      setMessage('올나잇 세미나가 시작되었습니다. 세션 카드에서 진행 상태를 확인하세요.');
      setForm((prev) => ({
        ...prev,
        title: '',
        brief: '',
        topic: '',
        brand: '',
        region: '',
        goal: '',
        startMode: 'now',
        startsAtLocal: ''
      }));
      await refreshSessions();
      if (data.session?.id) {
        setSelectedId(data.session.id);
        await refreshDetail(data.session.id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '세미나 생성 실패');
    } finally {
      setLoading(false);
    }
  }

  async function runAction(path: string) {
    setMessage('');
    const res = await fetch(path, { method: 'POST' });
    const data = await res.json().catch(() => ({ ok: false, error: '요청 실패' }));
    if (!res.ok || data.ok === false) {
      setMessage(data.error || '요청 실패');
      return;
    }
    await refreshSessions();
    if (selectedId) await refreshDetail(selectedId);
  }

  function downloadFinalReport() {
    if (!selected || !finalReport?.content) return;
    const safeTitle = (selected.title || selected.topic || 'seminar').replace(/[^\w\-가-힣]+/g, '_').slice(0, 40);
    const blob = new Blob([finalReport.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeTitle}_통합최종보고서.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function applyPreset(key: SeminarPresetKey) {
    const preset = SEMINAR_PRESETS.find((item) => item.key === key);
    if (!preset) return;
    setForm((prev) => ({
      ...prev,
      presetKey: key,
      durationHours: preset.durationHours,
      intervalMinutes: preset.intervalMinutes
    }));
  }

  return (
    <PageTransition>
    <div className="space-y-5">
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">Seminar Studio</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">세미나 스튜디오</h2>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">주제를 던지면 에이전트들이 라운드별 토론을 반복하고, 아침 브리핑까지 자동으로 정리합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {strategyConfigSummary && (
              <span className="accent-pill text-xs">{strategyConfigSummary}</span>
            )}
            <span className="text-[10px] text-[var(--text-disabled)]">Mac 절전 해제 시 자동 진행</span>
          </div>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <form onSubmit={onCreate} className="panel space-y-4">
          <h3 className="section-title">세션 생성</h3>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">세션명</label>
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="예: 4월 강남 봄 시즌 모객 올나잇"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">회의 브리프 *</label>
            <textarea
              className="input min-h-[120px]"
              value={form.brief}
              onChange={(e) => setForm((prev) => ({ ...prev, brief: e.target.value }))}
              placeholder={
                '예)\n2분기 신규 고객 유입 전략 세미나\n브랜드: 브랜드명\n지역: 전국\n목표: 리드 전환율 15% 개선'
              }
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">첫 줄을 주제로 인식합니다. 브랜드/지역/목표는 선택적으로 줄바꿈 입력하세요.</p>
          </div>

          <details className="soft-panel">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-strong)]">상세 입력 (선택)</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">주제 직접 입력</label>
                <input
                  className="input"
                  value={form.topic}
                  onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder="브리프 대신 주제를 직접 지정할 때 입력"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">브랜드</label>
                  <input className="input" value={form.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">지역</label>
                  <input className="input" value={form.region} onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">목표</label>
                  <input className="input" value={form.goal} onChange={(e) => setForm((prev) => ({ ...prev, goal: e.target.value }))} />
                </div>
              </div>
            </div>
          </details>

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--text-base)]">운영 모드</p>
            <div className="grid gap-2 md:grid-cols-2">
              {SEMINAR_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className={`rounded-[14px] border px-4 py-3 text-left transition ${
                    form.presetKey === preset.key ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--surface-border)] bg-[var(--surface)] hover:bg-[var(--surface-sub)]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{preset.label}</p>
                  <p className="mt-1 text-xs text-[var(--text-base)]">{preset.desc}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {preset.durationHours}시간 / {preset.intervalMinutes}분
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">총 운영 시간(시간)</label>
              <input
                type="number"
                min={1}
                max={72}
                className="input"
                value={form.durationHours}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    presetKey: 'custom',
                    durationHours: Number(e.target.value || 1)
                  }))
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-base)]">라운드 간격(분)</label>
              <input
                type="number"
                min={10}
                max={360}
                className="input"
                value={form.intervalMinutes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    presetKey: 'custom',
                    intervalMinutes: Number(e.target.value || 60)
                  }))
                }
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[#6a5a51]">라운드 내부 상호 검토 사이클</label>
            <div className="grid gap-2 md:grid-cols-3">
              {[1, 2, 3].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRuntime((prev) => ({ ...prev, seminarDebateCycles: value }))}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    runtime.seminarDebateCycles === value
                      ? 'border-[#7b5a49] bg-[#f5eadf] text-[#2f211c]'
                      : 'border-[#e1d4c8] bg-white text-[#5e4d43]'
                  }`}
                >
                  <p className="font-semibold">{value}회</p>
                  <p className="mt-1 text-[11px]">{`초안→검토→수정 과정을 ${value}회 반복`}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6a5a51]">시작 방식</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, startMode: 'now' }))}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    form.startMode === 'now' ? 'bg-[#2c1d19] text-white' : 'bg-[#f2e7dc] text-[#4b392f]'
                  }`}
                >
                  지금 시작
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, startMode: 'scheduled' }))}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    form.startMode === 'scheduled' ? 'bg-[#2c1d19] text-white' : 'bg-[#f2e7dc] text-[#4b392f]'
                  }`}
                >
                  예약 시작
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6a5a51]">예약 시작 시각</label>
              <input
                type="datetime-local"
                className="input"
                disabled={form.startMode !== 'scheduled'}
                value={form.startsAtLocal}
                onChange={(e) => setForm((prev) => ({ ...prev, startsAtLocal: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#e3d7cb] bg-[#fbf4ea] px-3 py-2 text-xs text-[#5f4d43]">
            <p className="font-semibold text-[#3f2f29]">운영 요약</p>
            <p className="mt-1">{operationSummary}</p>
            <p className="mt-1">인식된 주제: {resolvedTopic || '미입력'} | 브랜드: {resolvedBrand || '-'} | 지역: {resolvedRegion || '-'} | 목표: {resolvedGoal || '-'}</p>
          </div>

          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? '세션 생성 중...' : '올나잇 세미나 시작'}
          </button>
          {message && <p className="text-sm text-[#6f5a4d]">{message}</p>}
        </form>

        <div className="panel space-y-3">
          <h3 className="section-title">세션 목록</h3>
          <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
            {sessions.map((session) => {
              const active = selectedId === session.id;
              const progressPct = session.maxRounds > 0
                ? Math.round((session.completedRounds / session.maxRounds) * 100)
                : 0;
              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="line-clamp-1 text-sm font-semibold text-[var(--text-strong)]">{session.title || session.topic}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold flex-shrink-0 ${statusClass[session.status]}`}>
                      {statusLabel[session.status]}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-sub)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    {session.completedRounds}/{session.maxRounds} 라운드 · {progressPct}%
                  </p>
                </button>
              );
            })}
            {sessions.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">생성된 세션이 없습니다.</p>
            )}
          </div>
        </div>
      </section>

      {selected && (
        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="section-title">{selected.title || selected.topic}</h3>
              <p className="mt-1 text-xs text-[#6f5f56]">
                {selected.brand || '브랜드 미입력'} | {selected.region || '지역 미입력'} | {selected.goal || '목표 미입력'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(selected.status === 'STOPPED' || selected.status === 'FAILED' || selected.status === 'PLANNED') && (
                <button type="button" className="button-secondary" onClick={() => runAction(`/api/seminar/sessions/${selected.id}/start`)}>
                  세션 재시작
                </button>
              )}
              {selected.status === 'RUNNING' && (
                <>
                  <button type="button" className="button-secondary" onClick={() => runAction(`/api/seminar/sessions/${selected.id}/tick`)}>
                    즉시 라운드 실행
                  </button>
                  <button type="button" className="button-secondary" onClick={() => runAction(`/api/seminar/sessions/${selected.id}/stop`)}>
                    세션 중지
                  </button>
                </>
              )}
            </div>
          </div>

          {selected.lastError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              최근 오류: {selected.lastError}
            </div>
          )}

          <div className="ops-kpi-grid">
            <div className="ops-kpi-cell">
              <p className="ops-kpi-val">{selected.completedRounds}<span className="text-base font-normal text-[var(--text-muted)]">/{selected.maxRounds}</span></p>
              <p className="ops-kpi-label">완료 라운드</p>
            </div>
            <div className="ops-kpi-cell" style={{ '--kpi-accent': '#6366f1' } as React.CSSProperties}>
              <p className="ops-kpi-val">{selected.intervalMinutes}<span className="text-base font-normal text-[var(--text-muted)]">분</span></p>
              <p className="ops-kpi-label">간격</p>
            </div>
            <div className="ops-kpi-cell" style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
              <p className="text-[13px] font-semibold tabular-nums text-[var(--text-strong)]">
                {selected.lastRunAt ? new Date(selected.lastRunAt).toLocaleString('ko-KR') : '-'}
              </p>
              <p className="ops-kpi-label">마지막 실행</p>
            </div>
            <div className="ops-kpi-cell" style={{ '--kpi-accent': '#f59e0b' } as React.CSSProperties}>
              <p className="text-[13px] font-semibold tabular-nums text-[var(--text-strong)]">
                {selected.nextRunAt ? new Date(selected.nextRunAt).toLocaleString('ko-KR') : '-'}
              </p>
              <p className="ops-kpi-label">다음 실행</p>
            </div>
          </div>

          <div>
            <p className="section-title mb-3">라운드 로그</p>
            <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className="soft-panel"
                  style={{
                    borderLeft: `3px solid ${
                      round.status === 'DONE' ? '#10b981' :
                      round.status === 'RUNNING' ? 'var(--accent)' : '#f43f5e'
                    }`
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-strong)]">Round {round.roundNumber}</span>
                    <span className={
                      round.status === 'DONE'
                        ? 'status-badge status-badge-success'
                        : round.status === 'RUNNING'
                          ? 'status-badge status-badge-running'
                          : 'status-badge status-badge-error'
                    }>
                      {round.status}
                    </span>
                    {round.runId && (
                      <div className="flex flex-wrap gap-2 ml-auto">
                        <Link className="text-xs text-[var(--accent-text)] underline" href={`/runs/${round.runId}`}>
                          실행 결과
                        </Link>
                        <Link className="text-xs text-[var(--accent-text)] underline" href={`/runs/${round.runId}/report`}>
                          산출물 보고서
                        </Link>
                      </div>
                    )}
                  </div>
                  {round.summary && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)]">라운드 요약 보기</summary>
                      <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--text-base)]">{round.summary}</pre>
                    </details>
                  )}
                  {round.error && <p className="mt-2 text-xs text-rose-600">{round.error}</p>}
                </div>
              ))}
              {rounds.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">아직 실행된 라운드가 없습니다.</p>
              )}
            </div>
          </div>

          <div className="soft-panel" style={{ borderLeft: '4px solid var(--accent)' }}>
            <p className="section-title mb-2">아침 브리핑</p>
            <pre className="whitespace-pre-wrap text-xs text-[var(--text-base)] leading-5">
              {briefing || '세션 완료 후 아침 브리핑이 자동 생성됩니다.'}
            </pre>
          </div>

          <div className="rounded-xl border border-[#d8c6b8] bg-[#fffaf5] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#2a1a18]">세션 통합 최종 보고서</p>
              <div className="flex flex-wrap gap-2">
                <Link className="button-secondary" href={`/seminar/sessions/${selected.id}/report`}>
                  통합 보고서 열기
                </Link>
                {finalReport?.content && (
                  <>
                    <CopyButton text={finalReport.content} />
                    <button type="button" className="button-secondary" onClick={downloadFinalReport}>
                      TXT 저장
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3">
              <SeminarReportDashboard
                reportText={finalReport?.content}
                structured={finalReport?.structured}
                compact
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              요약 대시보드 기준으로 먼저 보여주고, 원문 전체는 `통합 보고서 열기`에서 확인할 수 있습니다.
            </p>
          </div>
        </section>
      )}
    </div>
    </PageTransition>
  );
}
