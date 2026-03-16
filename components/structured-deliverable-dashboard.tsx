import type { StructuredDeliverable } from '@/lib/deliverable';
import type { WebIntelligenceSummary } from '@/lib/web-report';

type StructuredDeliverableDashboardProps = {
  topic: string;
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  createdAt?: string | Date;
  structured: StructuredDeliverable | null;
  webSummary: WebIntelligenceSummary;
  pmDecision?: string | null;
  rawContent?: string | null;
};

function riskTone(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('high') || normalized.includes('상')) return 'bg-rose-100 text-rose-700';
  if (normalized.includes('low') || normalized.includes('하')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
}

function formatDate(value?: string | Date) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return String(value);
  }
}

export function StructuredDeliverableDashboard({
  topic,
  brand,
  region,
  goal,
  createdAt,
  structured,
  webSummary,
  pmDecision,
  rawContent
}: StructuredDeliverableDashboardProps) {
  if (!structured) {
    return (
      <div className="space-y-4">
        <section className="dashboard-hero print:rounded-none print:border-none print:bg-white print:px-0 print:py-0 print:shadow-none">
          <p className="dashboard-eyebrow">Marketing Report</p>
          <h1 className="dashboard-title">{topic}</h1>
          <p className="dashboard-copy">
            {brand || '브랜드 미입력'} · {region || '지역 미입력'} · {goal || '목표 미입력'}
            {createdAt ? ` · 생성 ${formatDate(createdAt)}` : ''}
          </p>
        </section>

        <section className="panel space-y-3">
          <h2 className="section-title">최종 산출물 원문</h2>
          <pre className="soft-panel whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">
            {rawContent || '생성된 산출물이 없습니다.'}
          </pre>
        </section>
      </div>
    );
  }

  const totalBudget = structured.channelPlan.reduce((sum, row) => sum + (Number(row.budgetPct) || 0), 0);
  const primaryChannel = structured.channelPlan
    .slice()
    .sort((a, b) => (Number(b.budgetPct) || 0) - (Number(a.budgetPct) || 0))[0];
  const topKpi = structured.kpiTable[0];
  const confidence = Math.max(0, Math.min(100, Number(structured.evidence?.confidence || 0)));
  const signalCards = [
    ['핵심 트렌드', webSummary.keyTrend],
    ['시장 변화', webSummary.marketShift],
    ['경쟁사 시그널', webSummary.competitorSignals],
    ['리스크 시그널', webSummary.riskSignals],
    ['기회 시그널', webSummary.opportunitySignals]
  ];

  return (
    <div className="space-y-5">
      <section className="dashboard-hero print:rounded-none print:border-none print:bg-white print:px-0 print:py-0 print:shadow-none">
        <p className="dashboard-eyebrow">Marketing Report</p>
        <h1 className="dashboard-title">{structured.campaignName || structured.title || topic}</h1>
        <p className="dashboard-copy">
          {brand || '브랜드 미입력'} · {region || '지역 미입력'} · {goal || structured.objective || '목표 미입력'}
          {createdAt ? ` · 생성 ${formatDate(createdAt)}` : ''}
        </p>
        <div className="dashboard-chip-grid">
          <div className="dashboard-chip">
            <strong>핵심 목표</strong>
            <br />
            {structured.objective}
          </div>
          <div className="dashboard-chip">
            <strong>주요 타깃</strong>
            <br />
            {structured.target}
          </div>
          <div className="dashboard-chip">
            <strong>코어 메시지</strong>
            <br />
            {structured.coreMessage}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">주력 채널</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{primaryChannel?.channel || '미정'}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{primaryChannel ? `${primaryChannel.budgetPct}% · ${primaryChannel.format}` : '채널 계획 없음'}</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">예산 커버리지</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{totalBudget}%</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">채널 플랜 합산 기준</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">대표 KPI</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{topKpi?.kpi || '미정'}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{topKpi ? `${topKpi.target} · ${topKpi.period}` : 'KPI 없음'}</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">근거 신뢰도</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{confidence}/100</p>
          <div className="mt-2 h-2 rounded-full bg-[var(--surface-border)]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${confidence}%` }} />
          </div>
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">시장 인사이트 보드</h2>
          <span className="accent-pill">웹 인텔리전스 요약</span>
        </div>
        <div className="grid gap-3 xl:grid-cols-5 md:grid-cols-2">
          {signalCards.map(([label, value]) => (
            <div key={label} className="soft-panel">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel space-y-4">
          <h2 className="section-title">핵심 실행 요약</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(structured.executiveSummary.length ? structured.executiveSummary : ['요약 없음']).map((line, idx) => (
              <div key={`${line}-${idx}`} className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Summary {idx + 1}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{line}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h2 className="section-title">즉시 액션 보드</h2>
          <div className="grid gap-3">
            {(structured.nextActions.length ? structured.nextActions : ['즉시 액션 없음']).map((action, idx) => (
              <div key={`${action}-${idx}`} className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Action {idx + 1}</p>
                <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-base)]">{action}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel space-y-4">
          <h2 className="section-title">채널 믹스</h2>
          <div className="grid gap-3">
            {structured.channelPlan.map((row, idx) => (
              <div key={`${row.channel}-${idx}`} className="soft-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-strong)]">{row.channel}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{row.format} · KPI {row.kpi}</p>
                  </div>
                  <span className="accent-pill">{row.budgetPct}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-[var(--surface-border)]">
                  <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, row.budgetPct))}%` }} />
                </div>
                <p className="mt-3 text-sm text-[var(--text-base)]">목표: {row.targetValue}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h2 className="section-title">KPI 스냅샷</h2>
          <div className="grid gap-3">
            {structured.kpiTable.map((row, idx) => (
              <div key={`${row.kpi}-${idx}`} className="list-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{row.kpi}</p>
                  <span className="pill-option">{row.period}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="soft-card">
                    <p className="text-xs text-[var(--text-muted)]">Baseline</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-base)]">{row.baseline}</p>
                  </div>
                  <div className="soft-card">
                    <p className="text-xs text-[var(--text-muted)]">Target</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--text-base)]">{row.target}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="panel space-y-4">
          <h2 className="section-title">실행 타임라인</h2>
          <div className="space-y-3">
            {structured.timeline.map((row, idx) => (
              <div key={`${row.phase}-${idx}`} className="list-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">{row.phase}</p>
                  <span className="pill-option">
                    {row.start} - {row.end}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">Owner · {row.owner}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{row.action}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h2 className="section-title">리스크와 근거</h2>
          <div className="space-y-3">
            {structured.riskMatrix.map((row, idx) => (
              <div key={`${row.risk}-${idx}`} className="list-card">
                <p className="text-sm font-semibold text-[var(--text-strong)]">{row.risk}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${riskTone(row.impact)}`}>영향도 {row.impact}</span>
                  <span className={`rounded-full px-2.5 py-1 font-semibold ${riskTone(row.probability)}`}>확률 {row.probability}</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-base)]">대응: {row.mitigation}</p>
              </div>
            ))}

            <div className="soft-panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">근거 Source IDs</p>
              <p className="mt-2 text-sm text-[var(--text-base)]">
                {structured.evidence.sourceIds.length ? structured.evidence.sourceIds.join(', ') : '근거 ID 없음'}
              </p>
            </div>

            <div className="soft-panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">가정</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-base)]">
                {(structured.evidence.assumptions.length ? structured.evidence.assumptions : ['가정 정보 없음']).map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="panel space-y-3">
        <h2 className="section-title">PM 최종 결정</h2>
        <div className="soft-panel">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">{pmDecision || 'PM 결정이 없습니다.'}</pre>
        </div>
      </section>

      <details className="panel">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-base)]">원본 산출물 보기</summary>
        <pre className="soft-panel mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">
          {rawContent || '생성된 산출물이 없습니다.'}
        </pre>
      </details>
    </div>
  );
}
