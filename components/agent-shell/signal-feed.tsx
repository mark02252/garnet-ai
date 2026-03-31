'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStreamStore, type StreamEntry } from '@/lib/agent-stream-store';

function EntryRow({ entry }: { entry: StreamEntry }) {
  const statusColor =
    entry.status === 'running' ? 'var(--shell-status-running)'
    : entry.status === 'error' ? 'var(--shell-status-error)'
    : 'var(--shell-status-success)';

  return (
    <div className="stream-entry px-3 py-2 rounded" style={{ cursor: 'default' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ color: statusColor, fontSize: 10 }}>
          {entry.status === 'running' ? '▸' : entry.status === 'error' ? '✗' : '✓'}
        </span>
        <span
          style={{
            color: 'var(--shell-text-primary)',
            fontSize: 12,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}
        >
          {entry.label}
        </span>
      </div>
      {entry.steps.slice(-3).map((step, i) => (
        <div
          key={i}
          style={{
            paddingLeft: 16,
            fontSize: 11,
            color: 'var(--shell-text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {step.status === 'running' && (
            <span style={{ color: 'var(--shell-accent)' }}>↳ </span>
          )}
          {step.status === 'done' && (
            <span style={{ color: 'var(--shell-status-success)' }}>✓ </span>
          )}
          {step.status === 'error' && (
            <span style={{ color: 'var(--shell-status-error)' }}>✗ </span>
          )}
          {step.text}
        </div>
      ))}
    </div>
  );
}

export function SignalFeed() {
  const entries = useStreamStore((s) => s.entries);
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunning = entries.some((e) => e.status === 'running');

  useEffect(() => {
    if (hasRunning) {
      // Cancel any pending hide timer
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      hideTimerRef.current = null;
      countdownRef.current = null;
      setCountdown(null);
      setVisible(true);
    } else if (visible) {
      // Start 3s hide countdown
      let secs = 3;
      setCountdown(secs);
      countdownRef.current = setInterval(() => {
        secs -= 1;
        if (secs <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          setCountdown(null);
        } else {
          setCountdown(secs);
        }
      }, 1000);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
      }, 3000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [hasRunning, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            bottom: 96,
            right: 16,
            width: 300,
            maxHeight: 280,
            zIndex: 50,
            background: 'rgba(0,12,28,0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,212,255,0.2)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 36,
              flexShrink: 0,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              borderBottom: '1px solid rgba(0,212,255,0.1)',
            }}
          >
            {/* Header scan-line — 36px height, 6s loop */}
            <div
              className="scan-line-sweep"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 2,
                background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.4), transparent)',
                pointerEvents: 'none',
                '--scan-height': '36px',
                '--scan-duration': '6s',
              } as React.CSSProperties}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.25em',
                color: 'var(--shell-text-muted)',
              }}
            >
              SIGNAL FEED
            </span>
            {countdown !== null && (
              <span style={{ fontSize: 10, color: 'var(--shell-text-muted)' }}>
                CLOSING IN {countdown}s
              </span>
            )}
          </div>

          {/* Entries */}
          <div className="signal-feed-scroll" style={{ flex: 1, padding: '4px 0' }}>
            {entries.length === 0 ? (
              <div
                style={{
                  padding: '12px',
                  fontSize: 11,
                  color: 'var(--shell-text-muted)',
                  textAlign: 'center',
                }}
              >
                대기 중...
              </div>
            ) : (
              entries.map((e) => <EntryRow key={e.id} entry={e} />)
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
