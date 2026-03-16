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
  if (priority === 'NEXT') return 'bg-sky-100 text-sky-700';
  return 'bg-slate-100 text-slate-600';
}

export function SeminarReportDashboard({ reportText, structured, compact = false }: SeminarReportDashboardProps) {
  const parsed = parseStructuredSeminarFinalReport(structured, reportText) || parseSeminarFinalReport(reportText);

  if (!parsed) {
    return (
      <div className="soft-panel">
        <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
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
      <section className={compact ? 'soft-panel space-y-4' : 'dashboard-hero'}>
        <div>
          <p className={compact ? 'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400' : 'dashboard-eyebrow'}>
            Seminar Report
          </p>
          <h2 className={compact ? 'mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950' : 'dashboard-title'}>
            {parsed.sessionName || parsed.topic || '세미나 통합 보고서'}
          </h2>
          <p className={compact ? 'mt-2 text-sm leading-6 text-slate-500' : 'dashboard-copy'}>
            {parsed.topic || '주제 미입력'}
            {parsed.operationWindow ? ` · ${parsed.operationWindow}` : ''}
          </p>
          {parsed.summaryHeadline && (
            <p className={compact ? 'mt-3 text-sm leading-6 text-slate-700' : 'mt-4 max-w-3xl text-[15px] leading-7 text-slate-600'}>
              {parsed.summaryHeadline}
            </p>
          )}
        </div>
        <div className={compact ? 'grid gap-3 md:grid-cols-3' : 'dashboard-chip-grid'}>
          <div className={compact ? 'soft-card' : 'dashboard-chip'}>
            <strong>완료 라운드</strong>
            <br />
            {parsed.completedRounds || '집계 전'}
          </div>
          <div className={compact ? 'soft-card' : 'dashboard-chip'}>
            <strong>라운드 간격</strong>
            <br />
            {parsed.intervalMinutes || '미기록'}
          </div>
          <div className={compact ? 'soft-card' : 'dashboard-chip'}>
            <strong>교차검토</strong>
            <br />
            {parsed.debateCycles || '미기록'}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">참조 출처</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{parsed.totalUniqueSources}</p>
          <p className="mt-1 text-xs text-slate-500">총 {parsed.totalSourceReferences}회 인용</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">핵심 태그</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{parsed.totalUniqueTags}</p>
          <p className="mt-1 text-xs text-slate-500">반복 언급된 주제 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">산출물 유형</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{parsed.totalDeliverableTypes}</p>
          <p className="mt-1 text-xs text-slate-500">세션에서 사용된 결과물 종류</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">즉시 액션</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{parsed.actionItems.length}</p>
          <p className="mt-1 text-xs text-slate-500">우선순위 보드 기준</p>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="panel space-y-4">
          <h3 className="section-title">전략 수렴 보드</h3>
          <div className="grid gap-3">
            {(strategy.length ? strategy : [{ label: '전략 방향', value: '아직 요약되지 않았습니다.' }]).map((item) => (
              <div key={`${item.label}-${item.value}`} className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{item.value}</p>
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
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Action {idx + 1}</p>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityTone(action.priority)}`}>
                    {action.priority}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{action.title}</p>
              </div>
            ))}
            {!actionItems.length &&
              (actions.length ? actions : ['즉시 실행 액션 없음']).map((action, idx) => (
                <div key={`${action}-${idx}`} className="list-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Action {idx + 1}</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-800">{action}</p>
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
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Round {round.roundNumber}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-950">{round.pmSummary}</p>
                  </div>
                  <span className="pill-option">{round.deliverableType}</span>
                </div>
                {(round.objective || round.campaignName) && (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {round.objective || round.campaignName}
                  </p>
                )}
                {(round.direction || round.expectedImpact) && (
                  <div className="mt-3 grid gap-2">
                    {round.direction && (
                      <div className="soft-card">
                        <p className="text-xs text-slate-400">Direction</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{round.direction}</p>
                      </div>
                    )}
                    {round.expectedImpact && (
                      <div className="soft-card">
                        <p className="text-xs text-slate-400">Impact</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{round.expectedImpact}</p>
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
                          <p key={`${round.roundNumber}-${action}`} className="text-xs leading-5 text-slate-500">
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
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Round Note {idx + 1}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{line}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel space-y-4">
          <h3 className="section-title">산출물/태그 분포</h3>
          <div className="space-y-4">
            <div className="soft-panel">
              <p className="text-sm font-semibold text-slate-950">산출물 비중</p>
              <div className="mt-3 space-y-2">
                {(deliverableMix.length ? deliverableMix : [{ label: '집계 없음', count: 0 }]).map((item) => (
                  <div key={`${item.label}-${item.count}`}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                      <span>{item.label}</span>
                      <span>{item.count}회</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-sky-500" style={{ width: `${Math.max(8, Math.min(100, item.count * 16))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="soft-panel">
              <p className="text-sm font-semibold text-slate-950">태그 빈도</p>
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
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{source.count}회 참조</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">{source.title}</p>
                {source.url && <p className="mt-2 text-xs text-sky-700">{source.url}</p>}
              </a>
            ))}
          </div>
        </section>
      )}

      <details className="panel">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">원본 보고서 보기</summary>
        <pre className="mt-4 whitespace-pre-wrap rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
          {parsed.raw}
        </pre>
      </details>
    </div>
  );
}
