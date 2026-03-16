import Link from 'next/link';
import type { Notification } from '@/app/api/notifications/route';

export const dynamic = 'force-dynamic';

async function getNotifications(): Promise<Notification[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/notifications`, {
    cache: 'no-store'
  });
  if (!res.ok) return [];
  return res.json();
}

function typeTone(type: Notification['type']) {
  if (type === 'warning') return { badge: 'bg-rose-100 text-rose-700', border: 'border-l-rose-400', dot: 'bg-rose-500' };
  if (type === 'action') return { badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400', dot: 'bg-amber-500' };
  if (type === 'success') return { badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400', dot: 'bg-emerald-500' };
  return { badge: 'bg-sky-100 text-sky-700', border: 'border-l-sky-400', dot: 'bg-[var(--accent)]' };
}

function typeLabel(type: Notification['type']) {
  if (type === 'warning') return '주의';
  if (type === 'action') return '즉시 처리';
  if (type === 'success') return '달성';
  return '정보';
}

function categoryLabel(category: Notification['category']) {
  const labels: Record<Notification['category'], string> = {
    playbook: '플레이북',
    approval: '승인',
    seminar: '세미나',
    performance: '성과',
    kpi: 'KPI',
    draft: '자산화'
  };
  return labels[category];
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default async function NotificationsPage() {
  const notifications = await getNotifications();

  const warnings = notifications.filter((n) => n.type === 'warning');
  const actions = notifications.filter((n) => n.type === 'action');
  const infos = notifications.filter((n) => n.type === 'info');
  const successes = notifications.filter((n) => n.type === 'success');

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <p className="dashboard-eyebrow">Notification Inbox</p>
            <h1 className="dashboard-title">알림 인박스</h1>
            <p className="dashboard-copy">지금 바로 처리해야 할 항목과 확인이 필요한 상태를 한눈에 파악합니다.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {notifications.length > 0 ? (
                <>
                  <span className="accent-pill">{notifications.length}개 알림</span>
                  {warnings.length > 0 && <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">주의 {warnings.length}</span>}
                  {actions.length > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">즉시 처리 {actions.length}</span>}
                  {successes.length > 0 && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">달성 {successes.length}</span>}
                </>
              ) : (
                <span className="accent-pill">모든 항목 정상</span>
              )}
            </div>
          </div>
          <div className="soft-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">오늘 상태</p>
            <div className="mt-4 space-y-2">
              {[
                { label: '주의 필요', count: warnings.length, tone: 'text-rose-600' },
                { label: '즉시 처리', count: actions.length, tone: 'text-amber-600' },
                { label: '정보성', count: infos.length, tone: 'text-[var(--accent)]' },
                { label: '달성 축하', count: successes.length, tone: 'text-emerald-700' }
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">{item.label}</span>
                  <span className={`font-semibold ${item.tone}`}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── KPI Tiles ── */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">전체 알림</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{notifications.length}개</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">주의 필요</p>
          <p className="mt-2 text-base font-semibold text-rose-600">{warnings.length}개</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">즉시 처리</p>
          <p className="mt-2 text-base font-semibold text-amber-600">{actions.length}개</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">달성 완료</p>
          <p className="mt-2 text-base font-semibold text-emerald-700">{successes.length}개</p>
        </div>
      </section>

      {/* ── Notification List ── */}
      <section className="panel space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Inbox</p>
          <h2 className="section-title">전체 알림 목록</h2>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] bg-emerald-50">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                <path d="M5 12l5 5L20 7" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-[var(--text-strong)]">모든 항목이 정상입니다</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">처리할 알림이 없습니다. 잘 관리되고 있어요!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const tone = typeTone(n.type);
              return (
                <div
                  key={n.id}
                  className={`list-card border-l-4 ${tone.border}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.badge}`}>
                            {typeLabel(n.type)}
                          </span>
                          <span className="pill-option">{categoryLabel(n.category)}</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{n.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-base)]">{n.description}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <p className="text-xs text-[var(--text-muted)]">{formatDate(n.at)}</p>
                      <Link href={n.href} className="button-secondary px-3 py-1.5 text-xs">
                        {n.cta}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Quick Links ── */}
      <section className="panel space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Quick Actions</p>
          <h2 className="section-title">빠른 이동</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '플레이북 검토', desc: 'DRAFT 카드 확정', href: '/learning' },
            { label: 'KPI 목표 확인', desc: '달성률 업데이트', href: '/goals' },
            { label: '캠페인 룸', desc: '승인 처리', href: '/campaigns' },
            { label: '오늘의 브리핑', desc: '전체 현황', href: '/operations' }
          ].map((item) => (
            <Link key={item.href} href={item.href} className="list-card block">
              <p className="text-sm font-semibold text-[var(--text-strong)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
