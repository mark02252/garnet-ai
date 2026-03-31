import Link from 'next/link';
import { ApprovalActionList } from '@/components/approval-action-list';
import { PageSectionTabs } from '@/components/page-section-tabs';
import { CreateCampaignRoomDialog } from '@/components/create-campaign-room-dialog';
import { getCampaignRooms } from '@/lib/campaign-rooms';

export const dynamic = 'force-dynamic';

function statusTone(status: 'ACTIVE' | 'NEEDS_REVIEW' | 'READY') {
  if (status === 'ACTIVE') return 'bg-[var(--status-active-bg)] text-[var(--status-active)]';
  if (status === 'NEEDS_REVIEW') return 'bg-[var(--status-paused-bg)] text-[var(--status-paused)]';
  return 'bg-[var(--status-completed-bg)] text-[var(--status-completed)]';
}

export default async function CampaignsPage() {
  const campaignRooms = await getCampaignRooms(12);
  const activeCount = campaignRooms.filter((room) => room.status === 'ACTIVE').length;
  const approvalCount = campaignRooms.reduce((sum, room) => sum + room.approvals.length, 0);
  const averageReportingCoverage =
    campaignRooms.length > 0
      ? Math.round(campaignRooms.reduce((sum, room) => sum + room.completion.reporting, 0) / campaignRooms.length)
      : 0;

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            <p className="dashboard-eyebrow">Campaign Rooms</p>
            <h1 className="dashboard-title">캠페인 룸</h1>
            <p className="dashboard-copy">브리프, 보고서, 플레이북을 캠페인 단위로 빠르게 읽습니다.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CreateCampaignRoomDialog />
              <Link href="/operations" className="button-secondary">오늘의 브리핑</Link>
              <Link href="/campaigns" className="button-secondary">새 브리프</Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="accent-pill">활성 {activeCount}개</span>
              <span className="pill-option">승인 {approvalCount}건</span>
              <span className="pill-option">보고서 평균 {averageReportingCoverage}%</span>
            </div>
          </div>

          <div className="soft-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">오늘 포인트</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-strong)]">
              승인 대기 항목과 최신 보고서 연결 상태만 먼저 확인해도 충분합니다.
            </p>
            <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
              새 캠페인 룸을 직접 만들어 브랜드 · 지역 · 목표 단위로 실행을 모아 관리하세요.
            </p>
          </div>
        </div>
        <PageSectionTabs
          items={[
            { label: '캠페인 보드', href: '#board' },
            { label: '승인 대기', href: '#approvals' },
            { label: '운영 순서', href: '#guide' }
          ]}
        />
      </section>

      {/* ── KPI Tiles ── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">캠페인 룸</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{campaignRooms.length}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">최근 활동 기준으로 정리된 주요 흐름</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">실행 진행 중</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{activeCount}개</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">세미나나 후속 실행이 이어지는 캠페인</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">평균 보고서 연결률</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{averageReportingCoverage}%</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">브리프 대비 산출물 정리 비율</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">승인 대기</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{approvalCount}건</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">보고서, 플레이북, 세미나 결과 대기</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_340px]">
        <div className="space-y-5">
          {/* ── Campaign Board ── */}
          <section id="board" className="panel space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Campaign Board</p>
                <h2 className="section-title">진행 중인 캠페인 흐름</h2>
              </div>
              <span className="accent-pill">{campaignRooms.length} rooms</span>
            </div>

            {campaignRooms.length === 0 ? (
              <div className="surface-note">
                <strong>아직 캠페인 룸이 없습니다.</strong> 새 브리프를 시작하거나 위의 "새 캠페인 룸" 버튼으로 직접 만들어 보세요.
              </div>
            ) : (
              <div className="grid gap-3">
                {campaignRooms.map((room) => (
                  <article key={room.id} className="list-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(room.status)}`}>
                            {room.statusLabel}
                          </span>
                          <span className="pill-option">{room.brand}</span>
                          <span className="pill-option">{room.region}</span>
                          <span className="pill-option">{room.approvals.length} approvals</span>
                        </div>
                        <h3 className="mt-3 text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">{room.title}</h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-base)]">{room.summary}</p>
                      </div>
                      <div className="soft-panel text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Latest Update</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{room.latestActivityLabel}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="pill-option">브리프 {room.counts.briefs}</span>
                      <span className="pill-option">보고서 {room.counts.reports}</span>
                      <span className="pill-option">시뮬레이션 {room.counts.simulations}</span>
                      <span className="pill-option">플레이북 {room.counts.playbooks}</span>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
                      <div className="space-y-3">
                        <div className="soft-panel">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[var(--text-strong)]">현재 목표</p>
                            <span className="pill-option">{room.completion.reporting}% 보고서 연결</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-base)]">{room.objective}</p>
                        </div>
                        <div className="soft-panel">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-[var(--text-strong)]">다음 액션</p>
                            <span className="pill-option">{room.completion.playbook}% 플레이북 전환</span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--text-base)]">{room.nextAction}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/campaigns/${room.id}`} className="button-primary">보기</Link>
                          <Link href={room.primaryHref} className="button-secondary">최신 흐름</Link>
                          {room.reportHref && (
                            <Link href={room.reportHref} className="button-secondary">보고서</Link>
                          )}
                          {room.seminarHref && (
                            <Link href={room.seminarHref} className="button-secondary">시뮬레이션</Link>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="list-card">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Approval Queue</p>
                          <div className="mt-3">
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
                              compact
                              emptyMessage="지금은 별도 승인 대기 항목이 많지 않습니다."
                            />
                          </div>
                        </div>
                        <div className="list-card">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Signal Tags</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(room.signalTags.length ? room.signalTags : ['신호 수집 중']).map((tag) => (
                              <span key={`${room.id}-${tag}`} className="pill-option">#{tag}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right Sidebar ── */}
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section id="approvals" className="panel space-y-4 scroll-mt-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Room Logic</p>
              <h2 className="section-title">캠페인 룸이 하는 일</h2>
            </div>
            <div className="grid gap-3">
              <div className="list-card">
                <p className="text-sm font-semibold text-[var(--text-strong)]">브리프를 하나의 흐름으로 묶습니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">브랜드, 지역, 목표 기준으로 최근 실행과 토론을 같은 방에서 읽습니다.</p>
              </div>
              <div className="list-card">
                <p className="text-sm font-semibold text-[var(--text-strong)]">승인 대기 항목을 함께 보여줍니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">보고서 정리, 세미나 회수, 플레이북 확정을 놓치지 않게 합니다.</p>
              </div>
              <div className="list-card">
                <p className="text-sm font-semibold text-[var(--text-strong)]">실행 자산화를 가속합니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">보고서와 플레이북으로 전환되는 비율을 함께 봅니다.</p>
              </div>
            </div>
          </section>

          <section id="guide" className="panel space-y-4 scroll-mt-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Suggested Flow</p>
              <h2 className="section-title">추천 운영 순서</h2>
            </div>
            <div className="space-y-3">
              <div className="soft-panel">
                <p className="text-sm font-semibold text-[var(--text-strong)]">1. 오늘의 브리핑 확인</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">어떤 캠페인이 급한지 먼저 읽습니다.</p>
              </div>
              <div className="soft-panel">
                <p className="text-sm font-semibold text-[var(--text-strong)]">2. 캠페인 룸에서 승인 처리</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">보고서, 세미나 결과, 플레이북 후보를 정리합니다.</p>
              </div>
              <div className="soft-panel">
                <p className="text-sm font-semibold text-[var(--text-strong)]">3. 캠페인 스튜디오나 데이터로 재진입</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">다음 브리프, 분석, 전략 시뮬레이션으로 이어집니다.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
