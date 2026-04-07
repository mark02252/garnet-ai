'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode } from 'react';

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

function BriefingIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="3.5" rx="1.5" fill="currentColor" opacity="0.2" />
      <rect x="3" y="10" width="12" height="2.5" rx="1.25" fill="currentColor" />
      <rect x="3" y="15" width="8" height="2.5" rx="1.25" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function CampaignIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M3 5h18M3 12h12M3 19h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19" cy="17" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function StudioIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M16.9 16.9l1.4 1.4M5.6 18.4l1.4-1.4M16.9 7.1l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SeminarIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 13c1.7 0 4 1 4 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="13" width="4" height="8" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="10" y="8" width="4" height="13" rx="1.5" fill="currentColor" opacity="0.7" />
      <rect x="17" y="3" width="4" height="18" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function PlaybookIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M4 4h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.05 11a9 9 0 1 0 .5-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3 5v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoalsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.7" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M3 20L9 14L13 18L21 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 10H21V14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ContentIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M12 3l1.5 4.5H18l-3.75 2.7 1.5 4.5L12 12l-3.75 2.7 1.5-4.5L6 7.5h4.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function NotificationIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function SocialIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="2" y="2" width="20" height="20" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}

function SnsPersonaIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="19" cy="7" r="2.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

function SnsStudioIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8h8M8 11h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7 21h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function SnsCalendarIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 3v4M8 3v4M3 9h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="15" r="1.5" fill="currentColor" opacity="0.6" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
      <circle cx="16" cy="15" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

function SnsAnalyticsIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M4 17l4-5 4 3 4-6 4 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 21h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

function SnsCommunityIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BookOpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function RadarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  )
}

function VideoStudioIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <rect x="2" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17 9l5-3v12l-5-3V9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function FlowBuilderIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="19" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="19" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 12h4M13.5 7.2l-2 3.3M13.5 16.8l-2-3.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: '운영',
    items: [
      { href: '/operations', label: '오늘의 브리핑', icon: <BriefingIcon /> },
    ],
  },
  {
    label: '캠페인',
    items: [
      { href: '/shell', label: '에이전트 셸', icon: <StudioIcon /> },
      { href: '/campaigns', label: '캠페인 룸', icon: <CampaignIcon /> },
    ],
  },
  {
    label: '제작',
    items: [
      { href: '/seminar', label: '세미나 스튜디오', icon: <SeminarIcon /> },
      { href: '/flow', label: '플로우 빌더', icon: <FlowBuilderIcon /> },
      { href: '/datasets', label: '데이터 스튜디오', icon: <DataIcon /> },
      { href: '/video', label: '영상 스튜디오', icon: <VideoStudioIcon /> },
    ],
  },
  {
    label: 'SNS 스튜디오',
    items: [
      { href: '/dashboard',      label: '마케팅 대시보드', icon: <DashboardIcon /> },
      { href: '/sns/personas',    label: '페르소나',       icon: <SnsPersonaIcon /> },
      { href: '/sns/studio',      label: '콘텐츠 제작소',  icon: <SnsStudioIcon /> },
      { href: '/sns/calendar',    label: '캘린더',         icon: <SnsCalendarIcon /> },
      { href: '/sns/analytics',   label: '성과 분석',      icon: <SnsAnalyticsIcon /> },
      { href: '/sns/community',   label: '커뮤니티',       icon: <SnsCommunityIcon /> },
    ],
  },
  {
    label: '성과',
    items: [
      { href: '/goals', label: 'KPI 목표', icon: <GoalsIcon /> },
      { href: '/analytics', label: 'GA4 Analytics', icon: <AnalyticsIcon /> },
      { href: '/intel', label: '마케팅 인텔', icon: <ContentIcon /> },
      { href: '/intel/watchlist', label: '워치리스트', icon: <SocialIcon /> },
    ],
  },
  {
    label: '아카이브',
    items: [
      { href: '/learning', label: '플레이북', icon: <PlaybookIcon /> },
      { href: '/history', label: '실행 아카이브', icon: <HistoryIcon /> },
      { href: '/research', label: '리서치 메모리', icon: <BookOpenIcon /> },
      { href: '/tech-radar', label: '테크 레이더', icon: <RadarIcon /> },
      { href: '/notifications', label: '알림 인박스', icon: <NotificationIcon /> },
    ],
  },
];

const bottomItems: NavItem[] = [
  { href: '/settings', label: '설정', icon: <SettingsIcon /> },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={[
        'relative flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 transition-colors',
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--surface-border)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-sub)] hover:text-[var(--text-base)]'
      ].join(' ')}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)] shadow-[0_0_6px_var(--accent-glow)]" />
      )}
      <span className="shrink-0">{item.icon}</span>
      <span className="truncate text-[13px] font-medium">{item.label}</span>
    </Link>
  );
}

export function AppNav() {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar">
      {/* Logo */}
      <Link
        href="/operations"
        className="mb-3 flex h-9 items-center gap-2.5 px-2 text-[var(--accent)]"
        title="Garnet"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] border border-[var(--surface-border)] text-[12px] font-bold text-[var(--accent)]">
          ◈
        </span>
        <span className="text-[13px] font-bold text-[var(--text-base)] tracking-[2px]">GARNET</span>
      </Link>

      {/* Grouped nav */}
      <nav className="flex flex-1 flex-col gap-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-2.5 text-[8px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <NavButton key={item.href} item={item} active={isActivePath(pathname, item.href)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 pt-2">
        <div className="mb-2 h-px bg-[var(--surface-border)]" />
        {bottomItems.map((item) => (
          <NavButton key={item.href} item={item} active={isActivePath(pathname, item.href)} />
        ))}
      </div>
    </aside>
  );
}
