'use client';

import { useEffect, useState } from 'react';

type DotStatus = 'running' | 'idle' | 'error';

export function SystemBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [statuses, setStatuses] = useState<Record<string, DotStatus>>({});
  const [clock, setClock] = useState('');

  // Poll job status every 30s — same endpoint as old AmbientBar
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

  // Live clock — HH:MM:SS
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((n) => String(n).padStart(2, '0'))
          .join(':')
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const runningCount = Object.values(statuses).filter((s) => s === 'running').length;
  const isRunning = runningCount > 0;

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(0,8,20,0.9)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,212,255,0.2)',
        boxShadow: '0 1px 0 rgba(0,212,255,0.1), 0 4px 20px rgba(0,212,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
      }}
    >
      {/* Scan-line sweep */}
      <div
        className="scan-line-sweep"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.6), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Left: logo + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          className="logo-pulse"
          style={{
            color: 'var(--shell-accent)',
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.2em',
          }}
        >
          ◈ GARNET
        </span>
        <div style={{ width: 1, height: 16, background: 'rgba(0,212,255,0.2)' }} />
        <span
          style={{
            fontSize: 11,
            color: isRunning ? 'var(--shell-accent)' : 'var(--shell-text-muted)',
            letterSpacing: '0.1em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className={isRunning ? 'dot-running' : ''} style={{ fontSize: 8 }}>●</span>
          {isRunning
            ? `SYSTEM ACTIVE ● ${runningCount} JOBS RUNNING`
            : 'SYSTEM ACTIVE ● STANDBY'}
        </span>
      </div>

      {/* Center: clock */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'ui-monospace, monospace',
          fontSize: 12,
          color: 'var(--shell-text-muted)',
          letterSpacing: '0.2em',
        }}
      >
        {clock}
      </div>

      {/* Right: ⌘K button */}
      <button
        onClick={onOpenPalette}
        style={{
          fontSize: 11,
          color: 'var(--shell-text-muted)',
          background: 'rgba(0,212,255,0.05)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 6,
          padding: '2px 8px',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,212,255,0.1)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--shell-text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,212,255,0.05)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--shell-text-muted)';
        }}
      >
        ⌘K
      </button>
    </header>
  );
}
