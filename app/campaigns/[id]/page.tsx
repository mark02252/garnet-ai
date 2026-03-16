import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApprovalActionList } from '@/components/approval-action-list';
import { getCampaignRoomDetail } from '@/lib/campaign-rooms';

export const dynamic = 'force-dynamic';

function roomStatusTone(status: 'ACTIVE' | 'NEEDS_REVIEW' | 'READY') {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-700';
  if (status === 'NEEDS_REVIEW') return 'bg-amber-100 text-amber-700';
  return 'bg-[var(--accent-soft)] text-[var(--accent)]';
}

function timelineTone(type: 'run' | 'report' | 'seminar' | 'playbook' | 'approval') {
  if (type === 'seminar') return 'bg-emerald-100 text-emerald-700';
  if (type === 'playbook') return 'bg-amber-100 text-amber-700';
  if (type === 'approval') return 'bg-rose-100 text-rose-700';
  if (type === 'report') return 'bg-violet-100 text-violet-700';
  return 'bg-[var(--accent-soft)] text-[var(--accent)]';
}

function coverageTone(value: number) {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 50) return 'bg-[var(--accent)]';
  return 'bg-amber-500';
}

export default async function CampaignRoomDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = await getCampaignRoomDetail(id);
  if (!room) notFound();

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="dashboard-eyebrow">Campaign Room Detail</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${roomStatusTone(room.status)}`}>{room.statusLabel}</span>
              <span className="pill-option">{room.brand}</span>
              <span className="pill-option">{room.region}</span>
            </div>
            <h1 className="dashboard-title mt-4">{room.title}</h1>
            <p className="dashboard-copy mt-3">{room.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/campaigns" className="button-secondary">
              캠페인 룸으로 돌아가기
            </Link>
            <Link href={room.primaryHref} className="button-primary">
              핵심 화면 열기
            </Link>
          </div>
        </div>

        <div className="dashboard-chip-grid">
          <div className="dashboard-chip">
            <strong>다음 액션</strong>
            <br />
            {room.nextAction}
          </div>
          <div className="dashboard-chip">
            <strong>최근 활동</strong>
            <br />
            {room.latestActivityLabel}
          </div>
          <div className="dashboard-chip">
            <strong>승인 대기</strong>
            <br />
            {room.approvals.length}건
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">브리프/보고서</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
            {room.counts.briefs} / {room.counts.reports}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">실행에서 보고서까지 이어진 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">전략 시뮬레이션</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{room.counts.simulations}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">캠페인에 연결된 세미나 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">플레이북</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{room.counts.playbooks}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">반복 활용 가능한 운영 자산</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">신호 태그</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{room.signalTags.length}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">최근 반복적으로 감지된 키워드</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.24fr)_360px]">
        <div className="space-y-5">
          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Coverage</p>
                <h2 className="section-title">자산화 진행률</h2>
              </div>
              <span className="accent-pill">campaign flow</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="list-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">보고서 연결률</p>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{room.completion.reporting}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-border)]">
                  <div className={`h-full rounded-full ${coverageTone(room.completion.reporting)}`} style={{ width: `${room.completion.reporting}%` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">실행 결과가 공유 가능한 산출물로 정리된 비율입니다.</p>
              </div>
              <div className="list-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--text-strong)]">플레이북 전환률</p>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{room.completion.playbook}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-border)]">
                  <div className={`h-full rounded-full ${coverageTone(room.completion.playbook)}`} style={{ width: `${room.completion.playbook}%` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">좋은 응답 패턴이 팀 공용 자산으로 승격된 정도입니다.</p>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Timeline</p>
                <h2 className="section-title">캠페인 타임라인</h2>
              </div>
              <span className="accent-pill">{room.timeline.length} events</span>
            </div>
            <div className="space-y-3">
              {room.timeline.map((item) => (
                <Link key={item.id} href={item.href} className="list-card block transition hover:-translate-y-0.5 hover:border-[var(--surface-border)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${timelineTone(item.type)}`}>{item.label}</span>
                      <p className="text-xs text-[var(--text-muted)]">{item.atLabel}</p>
                    </div>
                    <span className="text-xs font-medium text-[var(--accent)]">열기</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{item.summary}</p>
                </Link>
              ))}
              {room.timeline.length === 0 && <div className="surface-note">이 캠페인에 연결된 타임라인 이벤트가 아직 없습니다.</div>}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Runs</p>
                <h2 className="section-title">연결된 브리프와 보고서</h2>
              </div>
              <span className="accent-pill">{room.linkedRuns.length} items</span>
            </div>
            <div className="grid gap-3">
              {room.linkedRuns.map((item) => (
                <article key={item.id} className="list-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="pill-option">{item.hasReport ? '보고서 있음' : '브리프만 존재'}</span>
                      <span className="text-xs text-[var(--text-muted)]">{item.createdAtLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={item.href} className="button-secondary px-3 py-2 text-xs">
                        실행 보기
                      </Link>
                      {item.reportHref && (
                        <Link href={item.reportHref} className="button-primary px-3 py-2 text-xs">
                          보고서 보기
                        </Link>
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]">
                    <span>근거 {item.sourceCount}개</span>
                    <span>첨부 {item.attachmentCount}개</span>
                    {item.signalTags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="pill-option">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
              {room.linkedRuns.length === 0 && <div className="surface-note">아직 연결된 브리프가 없습니다.</div>}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Simulation</p>
                <h2 className="section-title">전략 시뮬레이션</h2>
              </div>
              <span className="accent-pill">{room.linkedSessions.length} sessions</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {room.linkedSessions.map((item) => (
                <article key={item.id} className="list-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${timelineTone('seminar')}`}>{item.statusLabel}</span>
                    <span className="text-xs text-[var(--text-muted)]">{item.updatedAtLabel}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">{item.roundLabel}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{item.summary}</p>
                  <Link href={item.href} className="button-secondary mt-3 inline-flex px-3 py-2 text-xs">
                    시뮬레이션 열기
                  </Link>
                </article>
              ))}
              {room.linkedSessions.length === 0 && <div className="surface-note md:col-span-2">연결된 전략 시뮬레이션이 아직 없습니다.</div>}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Playbooks</p>
                <h2 className="section-title">플레이북 자산</h2>
              </div>
              <span className="accent-pill">{room.linkedPlaybooks.length} cards</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {room.linkedPlaybooks.map((item) => (
                <article key={item.id} className="list-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${timelineTone('playbook')}`}>{item.statusLabel}</span>
                    <span className="text-xs text-[var(--text-muted)]">{item.updatedAtLabel}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.tags.map((tag) => (
                      <span key={`${item.id}-${tag}`} className="pill-option">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <Link href={item.href} className="button-secondary mt-3 inline-flex px-3 py-2 text-xs">
                    플레이북 열기
                  </Link>
                </article>
              ))}
              {room.linkedPlaybooks.length === 0 && <div className="surface-note md:col-span-2">연결된 플레이북 자산이 아직 없습니다.</div>}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recommended Action</p>
              <h2 className="section-title">지금 해야 할 일</h2>
            </div>
            <div className="soft-panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">{room.nextAction}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">이 캠페인의 최근 브리프, 세미나, 플레이북 흐름을 기준으로 다음 액션을 제안합니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {room.signalTags.length > 0 ? (
                room.signalTags.map((tag) => (
                  <span key={`${room.id}-${tag}`} className="pill-option">
                    #{tag}
                  </span>
                ))
              ) : (
                <span className="surface-note">신호 태그를 수집 중입니다.</span>
              )}
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Approval Queue</p>
              <h2 className="section-title">승인 대기함</h2>
            </div>
            <ApprovalActionList
              items={room.approvals.map((approval) => ({
                id: `${room.id}-${approval.actionKind}-${approval.targetId}`,
                label: approval.label,
                description: approval.description,
                href: approval.href,
                actionKind: approval.actionKind,
                targetId: approval.targetId,
                actionLabel: approval.actionLabel
              }))}
              emptyMessage="지금은 이 캠페인에서 바로 처리할 승인 항목이 많지 않습니다."
            />
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Approval History</p>
              <h2 className="section-title">최근 승인 이력</h2>
            </div>
            <div className="space-y-3">
              {room.approvalHistory.map((item) => (
                <Link key={item.id} href={item.href} className="list-card block transition hover:-translate-y-0.5 hover:border-[var(--surface-border)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${timelineTone('approval')}`}>{item.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{item.updatedAtLabel}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--text-strong)]">{item.targetTitle}</p>
                </Link>
              ))}
              {room.approvalHistory.length === 0 && <div className="surface-note">아직 기록된 승인 이력이 없습니다.</div>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
