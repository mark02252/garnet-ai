type WarRoomEvidenceRailProps = {
  topic: string;
  brand?: string;
  region?: string;
  goal?: string;
  domainLabel: string;
  configSummary?: string;
  participantCount: number;
  attachmentCount: number;
  attachmentTypes: string[];
  attachmentNames: string[];
  runProfileLabel: string;
  llmReady: boolean;
  searchReady: boolean;
  canRun: boolean;
  loading: boolean;
  progressPct: number;
  stepLabel: string;
  elapsedLabel: string;
  activeRunId?: string;
  stageSteps: Array<{ key: string; label: string; state: 'pending' | 'running' | 'completed' | 'failed' }>;
  searchSummary?: {
    keyTrend: string;
    marketShift: string;
    competitorSignals: string;
    riskSignals: string;
    opportunitySignals: string;
  } | null;
  searchSources?: Array<{ title: string; url: string }>;
};

function readinessTone(active: boolean) {
  return active ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
}

function stepTone(state: 'pending' | 'running' | 'completed' | 'failed') {
  if (state === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'running') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (state === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-slate-200 bg-white text-[var(--text-muted)]';
}

export function WarRoomEvidenceRail({
  topic,
  brand,
  region,
  goal,
  domainLabel,
  configSummary,
  participantCount,
  attachmentCount,
  attachmentTypes,
  attachmentNames,
  runProfileLabel,
  llmReady,
  searchReady,
  canRun,
  loading,
  progressPct,
  stepLabel,
  elapsedLabel,
  activeRunId,
  stageSteps,
  searchSummary,
  searchSources
}: WarRoomEvidenceRailProps) {
  const readinessCards = [
    { label: '주제 입력', value: canRun ? '준비됨' : '입력 필요', active: canRun },
    { label: 'LLM 연결', value: llmReady ? '정상' : '설정 필요', active: llmReady },
    { label: '검색 연결', value: searchReady ? '정상' : '설정 필요', active: searchReady },
    { label: '첨부 컨텍스트', value: `${attachmentCount}개`, active: attachmentCount > 0 }
  ];
  const evidenceRows = searchSummary
    ? [
        ['핵심 트렌드', searchSummary.keyTrend],
        ['시장 변화', searchSummary.marketShift],
        ['경쟁 시그널', searchSummary.competitorSignals],
        ['리스크', searchSummary.riskSignals],
        ['기회', searchSummary.opportunitySignals]
      ]
    : [];

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <section className="panel space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Readiness</p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">실행 준비도</h3>
          </div>
          <span className="accent-pill">{loading ? 'RUNNING' : 'READY CHECK'}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {readinessCards.map((item) => (
            <div key={item.label} className="status-tile">
              <div className="flex items-center justify-between gap-2">
                <p className="metric-label">{item.label}</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${readinessTone(item.active)}`}>
                  {item.value}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="soft-panel">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <span>{loading ? `${progressPct}% 진행` : '대기 상태'}</span>
            <span>{elapsedLabel}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-[var(--surface-border)]">
            <div className="h-2 rounded-full bg-[var(--accent)] transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
          </div>
          <p className="mt-2 text-sm font-medium text-[var(--text-base)]">{stepLabel}</p>
          {activeRunId && <p className="mt-1 text-xs text-[var(--text-muted)]">Run {activeRunId.slice(0, 8)}</p>}
        </div>
      </section>

      <section className="panel space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Input Snapshot</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">전략 입력 해석</h3>
        </div>
        <div className="grid gap-3">
          <div className="soft-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Topic</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{topic || '브리프를 입력하면 자동 해석됩니다.'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="list-card">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Brand / Region</p>
              <p className="mt-2 text-sm text-[var(--text-base)]">{brand || '브랜드 미입력'}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{region || '지역 미입력'}</p>
            </div>
            <div className="list-card">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Goal / Routing</p>
              <p className="mt-2 text-sm text-[var(--text-base)]">{goal || '목표 미입력'}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{domainLabel}</p>
            </div>
          </div>
          <div className="soft-card">
            <p className="text-xs text-[var(--text-muted)]">운영 모드</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-strong)]">{runProfileLabel}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              참여 에이전트 {participantCount}명
              {configSummary ? ` · ${configSummary}` : ''}
            </p>
          </div>
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Decision Flow</p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">실행 타임라인</h3>
          </div>
          <span className="pill-option">{stageSteps.length} 단계</span>
        </div>
        <div className="space-y-2">
          {stageSteps.map((step, index) => (
            <div key={step.key} className={`rounded-[20px] border px-4 py-3 ${stepTone(step.state)}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{index + 1}. {step.label}</p>
                <span className="text-[11px] font-semibold uppercase">
                  {step.state === 'completed'
                    ? 'DONE'
                    : step.state === 'running'
                      ? 'LIVE'
                      : step.state === 'failed'
                        ? 'FAIL'
                        : 'WAIT'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Evidence Rail</p>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">근거와 시그널</h3>
          </div>
          <span className="accent-pill">{searchSummary ? 'LIVE' : 'PENDING'}</span>
        </div>
        {searchSummary ? (
          <>
            <div className="grid gap-3">
              {evidenceRows.map(([label, value]) => (
                <div key={label} className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {(searchSources || []).slice(0, 4).map((source, idx) => (
                <a key={`${source.url}-${idx}`} href={source.url} target="_blank" rel="noreferrer" className="list-card block">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Source {idx + 1}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-strong)]">{source.title}</p>
                  <p className="mt-2 text-xs text-[var(--accent)]">{source.url}</p>
                </a>
              ))}
            </div>
          </>
        ) : (
          <div className="soft-panel">
            <p className="text-sm leading-6 text-[var(--text-base)]">
              `웹서치 품질 점검`을 실행하면 핵심 트렌드, 경쟁 시그널, 상위 출처가 이 레일에 정리됩니다.
            </p>
          </div>
        )}
      </section>

      <section className="panel space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Context Pack</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">첨부 컨텍스트</h3>
        </div>
        <div className="soft-card">
          <p className="text-sm font-semibold text-[var(--text-strong)]">{attachmentCount}개 자료 연결됨</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {attachmentTypes.length ? attachmentTypes.join(' · ') : '아직 첨부된 자료가 없습니다.'}
          </p>
        </div>
        <div className="space-y-2">
          {attachmentNames.length > 0 ? (
            attachmentNames.slice(0, 5).map((name, idx) => (
              <div key={`${name}-${idx}`} className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Attachment {idx + 1}</p>
                <p className="mt-2 text-sm text-[var(--text-base)]">{name}</p>
              </div>
            ))
          ) : (
            <div className="soft-panel">
              <p className="text-sm leading-6 text-[var(--text-base)]">브리프 외에 CSV, PDF, 문서, 이미지 자료를 넣으면 회의가 더 구체적으로 수렴합니다.</p>
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
