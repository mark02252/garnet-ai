'use client';

import { useEffect, useState } from 'react';

type DotStatus = 'running' | 'idle' | 'error';

const JOBS = [
  { key: 'intel',   label: 'intel' },
  { key: 'seminar', label: 'seminar' },
  { key: 'video',   label: 'video' },
] as const;

export function AmbientBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, DotStatus>>({
    intel: 'idle', seminar: 'idle', video: 'idle'
  });

  // Poll real job status endpoint every 30s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/agent/job-status');
        if (res.ok) setStatuses(await res.json());
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  function dotClass(status: DotStatus) {
    if (status === 'running') return 'dot-running';
    if (status === 'error')   return 'dot-error';
    return '';
  }

  function dotColor(status: DotStatus) {
    if (status === 'running') return 'var(--shell-status-running)';
    if (status === 'error')   return 'var(--shell-status-error)';
    return 'var(--shell-status-idle)';
  }

  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: 40, flexShrink: 0,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid var(--shell-border)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-[var(--shell-accent)] font-bold text-sm tracking-widest">◈ GARNET</span>
        <div className="w-px h-4 bg-[var(--shell-border)]" />
        {JOBS.map(({ key, label }) => {
          const status = statuses[key] ?? 'idle';
          return (
            <button
              key={key}
              className={`flex items-center gap-1 text-[11px] hover:opacity-80 transition-opacity ${dotClass(status)}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
                       color: dotColor(status) }}
            >
              <span>●</span>
              <span className="text-[var(--shell-text-muted)]">{label}</span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onOpenPalette}
        className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--shell-border)',
                 borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}
      >
        ⌘K
      </button>
    </header>
  );
}
