'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AvatarCards } from '@/components/avatar-cards';
import { CopyButton } from '@/components/copy-button';
import { parseStructuredDeliverable } from '@/lib/deliverable';
import { buildAgentCardsFromTurns, parseTurnNickname } from '@/lib/agent-ui';
import { buildWebIntelligenceSummary } from '@/lib/web-report';

type RunDetail = {
  id: string;
  topic: string;
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  createdAt: string;
  webSources: Array<{ id: string; title: string; snippet: string; url: string; provider: string }>;
  meetingTurns: Array<{ id: string; role: string; nickname: string; content: string; createdAt: string }>;
  attachments: Array<{ id: string; name: string; mimeType: string; content: string; createdAt: string }>;
  deliverable?: { id: string; type: string; content: string } | null;
  memoryLog?: {
    id: string;
    hypothesis: string;
    direction: string;
    expectedImpact: string;
    risks: string;
    outcome?: string | null;
    failureReason?: string | null;
    tags: string;
  } | null;
  tags: string[];
  relatedLearnings?: Array<{
    id: string;
    situation: string;
    recommendedResponse: string;
    status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED';
  }>;
};

function riskColor(value: string) {
  const key = value.toLowerCase();
  if (key.includes('high') || key.includes('상')) return 'bg-rose-100 text-rose-700';
  if (key.includes('low') || key.includes('하')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-amber-100 text-amber-700';
}

function learningTone(status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ARCHIVED') return 'bg-[var(--surface-sub)] text-[var(--text-base)]';
  return 'bg-amber-100 text-amber-700';
}

function formatDate(value: string) {
  try {
    const date = new Date(value);
    const parts = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const token = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return `${token.year}.${token.month}.${token.day} ${token.hour}:${token.minute}`;
  } catch {
    return value;
  }
}

export function RunDetailClient({ run }: { run: RunDetail }) {
  const pmTurn = useMemo(() => run.meetingTurns.find((turn) => turn.role === 'PM'), [run.meetingTurns]);
  const participantCards = useMemo(() => buildAgentCardsFromTurns(run.meetingTurns), [run.meetingTurns]);
  const [tagInput, setTagInput] = useState((run.tags || []).join(', '));
  const [outcomeInput, setOutcomeInput] = useState(run.memoryLog?.outcome || '');
  const [failureReasonInput, setFailureReasonInput] = useState(run.memoryLog?.failureReason || '');
  const [saveMessage, setSaveMessage] = useState('');
  const structured = useMemo(() => parseStructuredDeliverable(run.deliverable?.content), [run.deliverable?.content]);
  const webSummary = useMemo(
    () => buildWebIntelligenceSummary(run.webSources.map((src) => ({ title: src.title, snippet: src.snippet, url: src.url }))),
    [run.webSources]
  );

  const deliverableTypeLabel =
    run.deliverable?.type === 'CAMPAIGN_PLAN'
      ? '캠페인 플랜'
      : run.deliverable?.type === 'CONTENT_PACKAGE'
        ? '콘텐츠 패키지'
        : run.deliverable?.type === 'EXPERIMENT_DESIGN'
          ? '실험 설계 문서'
          : '산출물 없음';

  const primaryChannel = structured?.channelPlan
    .slice()
    .sort((a, b) => (Number(b.budgetPct) || 0) - (Number(a.budgetPct) || 0))[0];
  const topKpi = structured?.kpiTable[0];
  const confidence = Math.max(0, Math.min(100, Number(structured?.evidence?.confidence || 0)));
  const pmHighlights = (pmTurn?.content || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  const executiveSummary = structured?.executiveSummary.slice(0, 6) || [];
  const nextActions = structured?.nextActions.slice(0, 6) || [];
  const evidenceRows = [
    ['핵심 트렌드', webSummary.keyTrend],
    ['시장 변화', webSummary.marketShift],
    ['경쟁 시그널', webSummary.competitorSignals],
    ['리스크', webSummary.riskSignals],
    ['기회', webSummary.opportunitySignals]
  ] as const;

  async function saveTags() {
    if (!run.memoryLog?.id) return;
    const tags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 10);

    const res = await fetch(`/api/memory/${run.memoryLog.id}/tags`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tags,
        outcome: outcomeInput,
        failureReason: failureReasonInput
      })
    });

    if (!res.ok) {
      setSaveMessage('태그 저장에 실패했습니다.');
      return;
    }

    setSaveMessage('태그가 저장되었습니다.');
    setTimeout(() => setSaveMessage(''), 1200);
  }

  return (
    <div className="space-y-5">
      <section className="ops-zone">
        <div className="ops-zone-head"><span className="ops-zone-label">Execution Detail</span></div>
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[var(--text-strong)]">{structured?.campaignName || structured?.title || run.topic}</h1>
              <p className="text-[12px] text-[var(--text-muted)]">
                {run.brand || '브랜드 미입력'} · {run.region || '지역 미입력'} · {run.goal || '목표 미입력'} · 생성 {formatDate(run.createdAt)}
              </p>
              <p className="mt-3 max-w-3xl text-[13px] leading-6 text-[var(--text-base)]">
                {structured?.executiveSummary[0] || pmHighlights[0] || run.memoryLog?.direction || '이 실행의 핵심 판단과 산출물을 아래 대시보드에서 확인할 수 있습니다.'}
              </p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <Link href={`/runs/${run.id}/report`} className="button-secondary">
                대시보드 보고서
              </Link>
              <a href={`/api/runs/${run.id}/export`} className="button-primary">
                JSON 내보내기
              </a>
              {run.deliverable && (
                <a href={`/api/runs/${run.id}/export-pptx`} className="button-secondary">
                  PPTX 슬라이드
                </a>
              )}
            </div>
          </div>
          <div className="ops-kpi-grid">
            <div className="ops-kpi-cell">
              <p className="ops-kpi-label">산출물 유형</p>
              <p className="ops-kpi-val">{deliverableTypeLabel}</p>
            </div>
            <div className="ops-kpi-cell">
              <p className="ops-kpi-label">주력 채널</p>
              <p className="ops-kpi-val">{primaryChannel ? `${primaryChannel.channel} · ${primaryChannel.budgetPct}%` : '집계 전'}</p>
            </div>
            <div className="ops-kpi-cell">
              <p className="ops-kpi-label">대표 KPI</p>
              <p className="ops-kpi-val">{topKpi ? `${topKpi.kpi} · ${topKpi.target}` : '집계 전'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="ops-zone">
        <div className="ops-zone-head"><span className="ops-zone-label">Key Metrics</span></div>
        <div className="ops-kpi-grid">
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">참여 에이전트</p>
            <p className="ops-kpi-val">{participantCards.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">회의에 실제 참여한 역할 수</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">웹 근거</p>
            <p className="ops-kpi-val">{run.webSources.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">리서치에 사용된 출처 수</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">첨부 컨텍스트</p>
            <p className="ops-kpi-val">{run.attachments.length}</p>
            <p className="text-[10px] text-[var(--text-muted)]">회의에 주입된 참고 자료</p>
          </div>
          <div className="ops-kpi-cell">
            <p className="ops-kpi-label">근거 신뢰도</p>
            <p className="ops-kpi-val" style={{ fontVariantNumeric: 'tabular-nums' }}>{confidence}/100</p>
            <div className="mt-1 ops-bar-track">
              <div className="ops-bar-fill" style={{ width: `${confidence}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Participants</p>
            <h2 className="section-title">실제 회의 참가자</h2>
          </div>
          <span className="accent-pill">{participantCards.length}명</span>
        </div>
        <AvatarCards cards={participantCards} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.32fr)_360px]">
        <div className="space-y-5">
          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Strategy Board</p>
                <h2 className="section-title">최종 산출물</h2>
              </div>
              <CopyButton text={run.deliverable?.content || ''} />
            </div>
            <p className="text-sm text-[var(--text-muted)]">{deliverableTypeLabel}</p>

            {structured ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Objective</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{structured.objective}</p>
                  </div>
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Target</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{structured.target}</p>
                  </div>
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Core Message</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{structured.coreMessage}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {(executiveSummary.length ? executiveSummary : ['요약 데이터 없음']).map((line, idx) => (
                    <div key={`${line}-${idx}`} className="list-card">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Summary {idx + 1}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{line}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">채널 믹스</p>
                      <span className="pill-option">{structured.channelPlan.length}개 채널</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {structured.channelPlan.map((row, idx) => (
                        <div key={`${row.channel}-${row.format}-${idx}`}>
                          <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                            <span>
                              {row.channel} · {row.format}
                            </span>
                            <span>{row.budgetPct}%</span>
                          </div>
                          <div className="ops-bar-track">
                            <div className="ops-bar-fill" style={{ width: `${Math.max(0, Math.min(100, row.budgetPct))}%` }} />
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            KPI {row.kpi} · 목표 {row.targetValue}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">KPI 스냅샷</p>
                      <span className="pill-option">{structured.kpiTable.length}개</span>
                    </div>
                    <div className="mt-3 grid gap-3">
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
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">실행 타임라인</p>
                      <span className="accent-pill">Action Flow</span>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {structured.timeline.map((row, idx) => (
                        <div key={`${row.phase}-${idx}`} className="list-card">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-[var(--text-strong)]">{row.phase}</p>
                            <span className="pill-option">{row.owner}</span>
                          </div>
                          <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {row.start} ~ {row.end}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{row.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">즉시 액션</p>
                      <span className="accent-pill">{nextActions.length}개</span>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {(nextActions.length ? nextActions : ['즉시 액션 없음']).map((action, idx) => (
                        <div key={`${action}-${idx}`} className="list-card">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Action {idx + 1}</p>
                          <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-base)]">{action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">리스크 매트릭스</p>
                      <span className="pill-option">{structured.riskMatrix.length}개</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {structured.riskMatrix.map((row, idx) => (
                        <div key={`${row.risk}-${idx}`} className="list-card">
                          <p className="text-sm font-semibold text-[var(--text-strong)]">{row.risk}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full px-2.5 py-1 ${riskColor(row.impact)}`}>영향도 {row.impact}</span>
                            <span className={`rounded-full px-2.5 py-1 ${riskColor(row.probability)}`}>확률 {row.probability}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{row.mitigation}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">회의 로그</p>
                      <span className="accent-pill">{run.meetingTurns.length} turns</span>
                    </div>
                    <div className="mt-3 grid gap-3">
                      {run.meetingTurns.map((turn) => {
                        const parsed = parseTurnNickname(turn.nickname, turn.role);
                        return (
                          <div key={turn.id} className="list-card">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--text-strong)]">{parsed.baseName}</p>
                              {parsed.phaseLabel && <span className="pill-option">{parsed.phaseLabel}</span>}
                              <span className="pill-option">
                                {parsed.roleLabel}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(turn.createdAt)}</p>
                            <pre className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-base)]">{turn.content}</pre>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <pre className="soft-panel whitespace-pre-wrap text-sm leading-7 text-[var(--text-base)]">
                {run.deliverable?.content || '생성된 산출물이 없습니다.'}
              </pre>
            )}
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Attachments</p>
                <h2 className="section-title">첨부 자료</h2>
              </div>
              <span className="pill-option">{run.attachments.length}개</span>
            </div>
            {run.attachments.length === 0 ? (
              <div className="soft-panel">
                <p className="text-sm text-[var(--text-base)]">첨부된 자료가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {run.attachments.map((attachment, idx) => (
                  <div key={attachment.id} className="list-card">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Attachment {idx + 1}</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{attachment.name}</p>
                      </div>
                      <span className="pill-option">{attachment.mimeType}</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{formatDate(attachment.createdAt)}</p>
                    <pre className="soft-panel mt-3 max-h-44 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[var(--text-base)]">
                      {attachment.content}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Learning Matches</p>
                <h2 className="section-title">유사 학습 응답 패턴</h2>
              </div>
              <span className="pill-option">{(run.relatedLearnings || []).length}개</span>
            </div>
            {(run.relatedLearnings || []).length === 0 ? (
              <div className="soft-panel">
                <p className="text-sm text-[var(--text-base)]">추천 가능한 학습 카드가 없습니다. `/learning`에서 동기화를 먼저 실행하세요.</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(run.relatedLearnings || []).map((item) => (
                  <article key={item.id} className="list-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Learning Card</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${learningTone(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.situation}</p>
                    <pre className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-6 text-[var(--text-base)]">{item.recommendedResponse}</pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">PM Decision</p>
                <h2 className="section-title">최종 의사결정</h2>
              </div>
              <CopyButton text={pmTurn?.content || ''} />
            </div>
            <div className="grid gap-3">
              {(pmHighlights.length ? pmHighlights : ['PM 결정이 없습니다.']).map((line, idx) => (
                <div key={`${line}-${idx}`} className="list-card">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Decision {idx + 1}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{line}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Evidence Rail</p>
                <h2 className="section-title">웹 인텔리전스</h2>
              </div>
              <span className="accent-pill">{run.webSources.length} sources</span>
            </div>
            <div className="grid gap-3">
              {evidenceRows.map(([label, value]) => (
                <div key={label} className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {run.webSources.length === 0 ? (
                <div className="soft-panel">
                  <p className="text-sm text-[var(--text-base)]">웹 소스가 없습니다.</p>
                </div>
              ) : (
                run.webSources.slice(0, 5).map((source, idx) => (
                  <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="list-card block">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Source {idx + 1}</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{source.title}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--text-muted)]">{source.snippet}</p>
                  </a>
                ))
              )}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Memory Cockpit</p>
                <h2 className="section-title">마케팅 메모리 로그</h2>
              </div>
              <span className="pill-option">{(run.tags || []).length} tags</span>
            </div>

            <div className="grid gap-3">
              <div className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">가설</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{run.memoryLog?.hypothesis || '없음'}</p>
              </div>
              <div className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">전략 방향</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{run.memoryLog?.direction || '없음'}</p>
              </div>
              <div className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">예상 KPI 영향</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{run.memoryLog?.expectedImpact || '없음'}</p>
              </div>
              <div className="soft-panel">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">리스크</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{run.memoryLog?.risks || '없음'}</p>
              </div>
            </div>

            {structured && (
              <div className="soft-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">근거 및 가정</p>
                  <span className="pill-option">{confidence}/100</span>
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">Source IDs</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-base)]">
                  {(structured.evidence?.sourceIds || []).join(', ') || '근거 ID 없음'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(structured.evidence?.assumptions || []).length > 0 ? (
                    (structured.evidence?.assumptions || []).map((item, idx) => (
                      <span key={`${item}-${idx}`} className="pill-option">
                        {item}
                      </span>
                    ))
                  ) : (
                    <span className="pill-option">가정 정보 없음</span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-strong)]">실제 성과 피드백</label>
              <textarea
                value={outcomeInput}
                onChange={(e) => setOutcomeInput(e.target.value)}
                className="input min-h-[110px]"
                placeholder="예: 실행 2주 후 방문객 +12%, 예약 전환 +8%"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-strong)]">실패 원인 / 개선 포인트</label>
              <textarea
                value={failureReasonInput}
                onChange={(e) => setFailureReasonInput(e.target.value)}
                className="input min-h-[110px]"
                placeholder="예: 랜딩 메시지 불명확, 채널 분리 부족"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-strong)]">태그</label>
              <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="input" placeholder="예: 공연장, 지역홍보, SNS" />
            </div>

            <button onClick={saveTags} type="button" className="button-primary w-full justify-center">
              메모리 저장
            </button>
            {saveMessage && <p className="text-xs text-emerald-700">{saveMessage}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
