'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';

type Page = { label: string; href: string };
type Action = { label: string; jobId: string };

const PAGES: Page[] = [
  { label: '캠페인 스튜디오', href: '/' },
  { label: '오늘의 브리핑', href: '/operations' },
  { label: '캠페인 룸', href: '/campaigns' },
  { label: '세미나 스튜디오', href: '/seminar' },
  { label: 'GA4 애널리틱스', href: '/analytics' },
  { label: 'KPI 목표', href: '/goals' },
  { label: '마케팅 인텔', href: '/intel' },
  { label: '알림 센터', href: '/notifications' },
  { label: '설정', href: '/settings' },
  { label: 'SNS 마케팅 대시보드', href: '/dashboard' },
  { label: 'SNS 페르소나', href: '/sns/personas' },
  { label: 'SNS 콘텐츠 제작소', href: '/sns/studio' },
  { label: 'SNS 캘린더', href: '/sns/calendar' },
  { label: 'SNS 성과 분석', href: '/sns/analytics' },
  { label: 'SNS 커뮤니티', href: '/sns/community' },
];

const ACTIONS: Action[] = [
  { label: '새 캠페인 회의 시작', jobId: 'campaign-meeting' },
  { label: '일간 브리핑 실행', jobId: 'daily-briefing' },
  { label: 'GA4 분석 실행', jobId: 'ga4-analysis' },
  { label: '마케팅 인텔 수집', jobId: 'intel-collect' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const toggle = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setOpen((v) => !v);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', toggle);
    return () => document.removeEventListener('keydown', toggle);
  }, [toggle]);

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const runAction = async (jobId: string, label: string) => {
    setOpen(false);
    try {
      await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
    } catch {
      // silently fail — toast handled upstream if needed
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setOpen(false)}>
      <div className="command-palette-container" onClick={(e) => e.stopPropagation()}>
        <Command>
          <Command.Input placeholder="페이지 이동 또는 액션 실행..." />
          <Command.List>
            <Command.Empty>결과가 없습니다</Command.Empty>

            <Command.Group heading="페이지">
              {PAGES.map((page) => (
                <Command.Item
                  key={page.href}
                  value={page.label}
                  onSelect={() => navigateTo(page.href)}
                >
                  {page.label}
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="액션">
              {ACTIONS.map((action) => (
                <Command.Item
                  key={action.jobId}
                  value={action.label}
                  onSelect={() => runAction(action.jobId, action.label)}
                >
                  {action.label}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
