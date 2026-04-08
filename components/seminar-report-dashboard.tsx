import {
  parseSeminarFinalReport,
  parseStructuredSeminarFinalReport,
  type StructuredSeminarFinalReport
} from '@/lib/report-visuals';

type SeminarReportDashboardProps = {
  reportText?: string | null;
  structured?: StructuredSeminarFinalReport | null;
  compact?: boolean;
};

function priorityTone(priority: string) {
  if (priority === 'NOW') return 'bg-emerald-100 text-emerald-700';
  if (priority === 'NEXT') return 'bg-[var(--accent-soft)] text-[var(--accent-text)]';
  return 'bg-[var(--surface-sub)] text-[var(--text-base)]';
}

export function SeminarReportDashboard({ reportText, structured, compact = false }: SeminarReportDashboardProps) {
  const parsed = parseStructuredSeminarFinalReport(structured, reportText) || parseSeminarFinalReport(reportText);

  if (!parsed) {
    return (
      <div className="soft-panel">
        <pre className="whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">
          {reportText || '세션이 완료되면 통합 보고서가 생성됩니다.'}
        </pre>
      </div>
    );
  }

  const roundLogs = compact ? parsed.roundLogs.slice(0, 3) : parsed.roundLogs;
  const actions = compact ? parsed.actions.slice(0, 4) : parsed.actions;
  const topSources = compact ? parsed.topSources.slice(0, 3) : parsed.topSources.slice(0, 6);
  const topTags = compact ? parsed.topTags.slice(0, 6) : parsed.topTags.slice(0, 10);
  const strategy = compact ? parsed.strategy.slice(0, 4) : parsed.strategy;
  const deliverableMix = compact ? parsed.deliverableMix.slice(0, 4) : parsed.deliverableMix;
  const actionItems = compact ? parsed.actionItems.slice(0, 4) : parsed.actionItems;
  const roundCards = compact ? parsed.roundCards.slice(0, 3) : parsed.roundCards;

  return (
    <div className="space-y-4">
      <section className={compact ? 'soft-panel space-y-4' : 'ops-zone'}>
        {!compact && <div className="ops-zone-head"><span className="ops-zone-label">Seminar Report</span></div>}
        <div className={compact ? '' : 'p-4 space-y-3'}>
          {compact && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Seminar Report
            </p>
          )}
          <h2 className={compact ? 'mt-2 text-xl font-semibold tracking-[-0.03em] text-[var(--text-strong)]' : 'text-lg font-bold tracking-tight text-[var(--text-strong)]'}>
            {parsed.sessionName || parsed.topic || '세미나 통합 보고서'}
          </h2>
          <p className={compact ? 'mt-2 text-sm leading-6 text-[var(--text-muted)]' : 'text-[12px] text-[var(--text-muted)]'}>
            {parsed.topic || '주제 미입력'}
            {parsed.operationWindow ? ` · ${parsed.operationWindow}` : ''}
          </p>
          {parsed.summaryHeadline && (
            <p className={compact ? 'mt-3 text-sm leading-6 text-[var(--text-base)]' : 'mt-3 max-w-3xl text-[13px] leading-6 text-[var(--text-base)]'}>
              {parsed.summaryHeadline}
            </p>
          )}
          <div className={compact ? 'grid gap-3 md:grid-cols-3' : 'ops-kpi-grid'}>
            <div className={compact ? 'soft-card' : 'ops-kpi-cell'}>
              {compact ? <><strong>완료 라운드</strong><br />{parsed.completedRounds || '집계 전'}</> : <><p className="ops-kpi-label">완료 라운드</p><p className="ops-kpi-val">{parsed.completedRounds || '집계 전'}</p></>}
            </div>
            <div className={compact ? 'soft-card' : 'ops-kpi-cell'}>
              {compact ? <><strong>라운드 간격</strong><br />{parsed.intervalMinutes || '미기록'}</> : <><p className="ops-kpi-label">라운드 간격</p><p className="ops-kpi-val">{parsed.intervalMinutes || '미기록'}</p></>}
            </div>
            <div className={compact ? 'soft-card' : 'ops-kpi-cell'}>
              {compact ? <><strong>교차검토</strong><br />{parsed.debateCycles || '미기록'}</> : <><p className="ops-kpi-label">교차검토</p><p className="ops-kpi-val">{parsed.debateCycles || '미기록'}</p></>}
            </div>
          </div>
        </div>
      </section>

      <section className="ops-zone">
        <div className="ops-zone-head"><span className="ops-zone-label">Key Metrics</span></div>
        <div className="ops-kpi-grid">
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">참조 출처</p>
            <p className="ops-kpi-val">{parsed.totalUniqueSources}</p>
            <p className="text-[10px] text-[var(--text-muted)]">총 {parsed.totalSourceReferences}회 인용</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">핵심 태그</p>
            <p className="ops-kpi-val">{parsed.totalUniqueTags}</p>
            <p className="text-[10px] text-[var(--text-muted)]">반복 언급된 주제 수</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">산출물 유형</p>
            <p className="ops-kpi-val">{parsed.totalDeliverableTypes}</p>
            <p className="text-[10px] text-[var(--text-muted)]">세션에서 사용된 결과물 종류</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">즉시 액션</p>
            <p className="ops-kpi-val">{parsed.actionItems.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">우선순위 보드 기준</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel space-y-4">
          <h3 className="section-title">전략 수렴 보드</h3>
          <div className="grid gap-3">
            {(strategy.length ? strategy : [{ label: '전략 방향', value: '아직 요약되지 않았습니다.' }]).map((item) => (
              <div key={`${item.label}-${item.value}`} className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h3 className="section-title">즉시 실행 액션</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {(actionItems.length ? actionItems : []).map((action, idx) => (
              <div key={`${action.title}-${idx}`} className="list-card">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Action {idx + 1}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityTone(action.priority)}`}>
                    {action.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-strong)]">{action.title}</p>
              </div>
            ))}
            {!actionItems.length &&
              (actions.length ? actions : ['즉시 실행 액션 없음']).map((action, idx) => (
                <div key={`${action}-${idx}`} className="list-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Action {idx + 1}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-strong)]">{action}</p>
                </div>
              ))}
          </div>
        </div>
      </section>

      {roundCards.length > 0 && (
        <section className="panel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">라운드 수렴 타임라인</h3>
            <span className="accent-pill">결정 흐름</span>
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {roundCards.map((round) => (
              <div key={`round-card-${round.roundNumber}`} className="soft-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Round {round.roundNumber}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{round.pmSummary}</p>
                  </div>
                  <span className="pill-option">{round.deliverableType}</span>
                </div>
                {(round.objective || round.campaignName) && (
                  <p className="mt-3 text-sm leading-6 text-[var(--text-base)]">
                    {round.objective || round.campaignName}
                  </p>
                )}
                {(round.direction || round.expectedImpact) && (
                  <div className="mt-3 grid gap-2">
                    {round.direction && (
                      <div className="soft-card">
                        <p className="text-xs text-[var(--text-muted)]">Direction</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-base)]">{round.direction}</p>
                      </div>
                    )}
                    {round.expectedImpact && (
                      <div className="soft-card">
                        <p className="text-xs text-[var(--text-muted)]">Impact</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-base)]">{round.expectedImpact}</p>
                      </div>
                    )}
                  </div>
                )}
                {(round.tags.length > 0 || round.actions.length > 0) && (
                  <div className="mt-3 space-y-3">
                    {round.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {round.tags.map((tag) => (
                          <span key={`${round.roundNumber}-${tag}`} className="pill-option">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {round.actions.length > 0 && (
                      <div className="space-y-1">
                        {round.actions.map((action) => (
                          <p key={`${round.roundNumber}-${action}`} className="text-xs leading-5 text-[var(--text-muted)]">
                            {action}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="panel space-y-4">
          <h3 className="section-title">라운드 의사결정 로그</h3>
          <div className="grid gap-3">
            {(roundLogs.length ? roundLogs : ['라운드 로그가 없습니다.']).map((line, idx) => (
              <div key={`${line}-${idx}`} className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Round Note {idx + 1}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{line}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h3 className="section-title">산출물/태그 분포</h3>
          <div className="space-y-4">
            <div className="soft-panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">산출물 비중</p>
              <div className="mt-3 space-y-2">
                {(deliverableMix.length ? deliverableMix : [{ label: '집계 없음', count: 0 }]).map((item) => (
                  <div key={`${item.label}-${item.count}`}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                      <span>{item.label}</span>
                      <span>{item.count}회</span>
                    </div>
                    <div className="ops-bar-track">
                      <div className="ops-bar-fill" style={{ width: `${Math.max(8, Math.min(100, item.count * 16))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="soft-panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">태그 빈도</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(topTags.length ? topTags : [{ label: '태그 없음', count: 0 }]).map((item) => (
                  <span key={`${item.label}-${item.count}`} className="pill-option">
                    {item.label} · {item.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {topSources.length > 0 && (
        <section className="panel space-y-4">
          <h3 className="section-title">반복 참조된 출처</h3>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {topSources.map((source) => (
              <a
                key={`${source.title}-${source.url}`}
                href={source.url || undefined}
                target={source.url ? '_blank' : undefined}
                rel={source.url ? 'noreferrer' : undefined}
                className="list-card"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{source.count}회 참조</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{source.title}</p>
                {source.url && <p className="mt-2 text-xs text-[var(--accent-text)]">{source.url}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      <details className="panel">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-strong)]">원본 보고서 보기</summary>
        <pre className="soft-panel mt-4 whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">
          {parsed.raw}
        </pre>
      </details>
    </div>
  );
}
