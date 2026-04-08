import Link from 'next/link';
import { PageTransition } from '@/components/page-transition';
import { ApprovalActionList } from '@/components/approval-action-list';
import { CreateCampaignRoomDialog } from '@/components/create-campaign-room-dialog';
import { getCampaignRooms } from '@/lib/campaign-rooms';

export const dynamic = 'force-dynamic';

function statusTone(status: 'ACTIVE' | 'NEEDS_REVIEW' | 'READY') {
  if (status === 'ACTIVE') return 'bg-emerald-900/40 text-emerald-300';
  if (status === 'NEEDS_REVIEW') return 'bg-amber-900/40 text-amber-300';
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
    <PageTransition>
    <div className="space-y-3">

      {/* ═══ Header ═══ */}
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">Campaign Rooms</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">캠페인 룸</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CreateCampaignRoomDialog />
            <Link href="/operations" className="button-secondary px-3 py-2 text-xs">브리핑</Link>
          </div>
        </div>
      </header>

      {/* ═══ KPI Strip ═══ */}
      <div className="ops-kpi-grid">
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{campaignRooms.length}</p>
          <p className="ops-kpi-label">캠페인 룸</p>
          <p className="ops-kpi-sub">활성 흐름</p>
        </div>
        <div className="ops-kpi-cell" style={{ '--kpi-accent': '#10b981' } as React.CSSProperties}>
          <p className="ops-kpi-val">{activeCount}</p>
          <p className="ops-kpi-label">진행 중</p>
          <p className="ops-kpi-sub">후속 실행 캠페인</p>
        </div>
        <div className="ops-kpi-cell" style={{ '--kpi-accent': '#f59e0b' } as React.CSSProperties}>
          <p className="ops-kpi-val">{approvalCount}</p>
          <p className="ops-kpi-label">승인 대기</p>
          <p className="ops-kpi-sub">전환 대기 항목</p>
        </div>
        <div className="ops-kpi-cell">
          <p className="ops-kpi-val">{averageReportingCoverage}%</p>
          <p className="ops-kpi-label">보고서 연결</p>
          <p className="ops-kpi-sub">평균 연결률</p>
        </div>
      </div>

      {/* ═══ Main + Sidebar ═══ */}
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="space-y-3">

          {/* Campaign Board */}
          <section className="ops-zone" id="board">
            <div className="ops-zone-head">
              <span className="ops-zone-label">캠페인 보드</span>
              <span className="text-[10px] font-semibold tabular-nums text-[var(--text-disabled)]">{campaignRooms.length} rooms</span>
            </div>

            {campaignRooms.length === 0 ? (
              <div className="px-4 py-3">
                <p className="text-[13px] text-[var(--text-muted)]">아직 캠페인 룸이 없습니다. 새 브리프를 시작하거나 위의 버튼으로 직접 만들어 보세요.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--surface-border)]">
                {campaignRooms.map((room) => (
                  <article key={room.id} className="p-4 transition-colors hover:bg-[var(--surface-hover)]">
                    {/* Row 1: Status + Title + Counts */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusTone(room.status)}`}>
                            {room.statusLabel}
                          </span>
                          <span className="text-[10px] text-[var(--text-disabled)]">{room.brand} · {room.region}</span>
                        </div>
                        <h3 className="mt-1.5 text-[14px] font-semibold tracking-tight text-[var(--text-strong)]">{room.title}</h3>
                        <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-muted)] line-clamp-1">{room.summary}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-[var(--text-disabled)]">
                          <span>{room.counts.briefs}B</span>
                          <span>/</span>
                          <span>{room.counts.reports}R</span>
                          <span>/</span>
                          <span>{room.counts.playbooks}P</span>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--text-disabled)]">{room.latestActivityLabel}</p>
                      </div>
                    </div>

                    {/* Row 2: Progress + Actions */}
                    <div className="mt-2 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 text-[10px]">
                        <span className="text-[var(--text-muted)]">보고서 <strong className="text-[var(--text-strong)]">{room.completion.reporting}%</strong></span>
                        <span className="text-[var(--text-muted)]">플레이북 <strong className="text-[var(--text-strong)]">{room.completion.playbook}%</strong></span>
                        <span className="text-[var(--text-muted)]">승인 <strong className="text-[var(--accent-text)]">{room.approvals.length}</strong></span>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/campaigns/${room.id}`} className="text-[10px] font-semibold text-[var(--accent-text)] hover:underline">보기</Link>
                        <Link href={room.primaryHref} className="text-[10px] font-semibold text-[var(--text-muted)] hover:underline">최신 흐름</Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right Sidebar ── */}
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          {/* Room Logic */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">캠페인 룸 안내</span>
            </div>
            <div className="ops-zone-body divide-y divide-[var(--surface-border)]">
              {[
                { title: '브리프를 하나의 흐름으로 묶습니다', desc: '브랜드 · 지역 · 목표 기준으로 실행과 토론을 한 방에서 관리' },
                { title: '승인 대기를 함께 보여줍니다', desc: '보고서, 세미나, 플레이북 확정을 놓치지 않게' },
                { title: '실행 자산화를 가속합니다', desc: '보고서와 플레이북 전환율을 트래킹' },
              ].map((item) => (
                <div key={item.title} className="px-4 py-3">
                  <p className="text-[12px] font-semibold text-[var(--text-strong)]">{item.title}</p>
                  <p className="mt-0.5 text-[10px] leading-4 text-[var(--text-muted)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Suggested Flow */}
          <div className="ops-zone">
            <div className="ops-zone-head">
              <span className="ops-zone-label">추천 운영 순서</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {['오늘의 브리핑 확인', '캠페인 룸에서 승인 처리', '스튜디오나 데이터로 재진입'].map((step, i) => (
                <div key={step} className="flex items-baseline gap-2">
                  <span className="text-[10px] font-bold tabular-nums text-[var(--accent-text)]">{i + 1}</span>
                  <p className="text-[11px] text-[var(--text-base)]">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
    </PageTransition>
  );
}
