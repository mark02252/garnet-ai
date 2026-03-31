'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store';
import { useStreamStore } from '@/lib/agent-stream-store';

export function CommandBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ripple, setRipple] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const panels = useCanvasStore((s) => s.panels);
  const spawnPanel = useCanvasStore((s) => s.spawnPanel);
  const history = useCanvasStore((s) => s.history);
  const addEntry = useStreamStore((s) => s.addEntry);
  const addStep = useStreamStore((s) => s.addStep);
  const setEntryStatus = useStreamStore((s) => s.setEntryStatus);

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput('');
    setLoading(true);
    setRipple(true);
    setTimeout(() => setRipple(false), 400);

    const entryId = addEntry(text.trim());

    try {
      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() })
      });

      if (!res.ok || !res.body) throw new Error('Command failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleSSEEvent(event, entryId, panels, spawnPanel, addStep, setEntryStatus, router);
          } catch {}
        }
      }
    } catch {
      setEntryStatus(entryId, 'error');
    } finally {
      setLoading(false);
    }
  }, [loading, panels, spawnPanel, addEntry, addStep, setEntryStatus, router]);

  // Input wrapper border: focused state > default
  const wrapperBorder = focused && !loading
    ? 'rgba(0,212,255,0.6)'
    : 'rgba(0,212,255,0.25)';
  const wrapperShadow = focused && !loading
    ? '0 0 0 1px rgba(0,212,255,0.2), 0 0 20px rgba(0,212,255,0.1)'
    : 'none';

  return (
    <div
      style={{
        flexShrink: 0,
        minHeight: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(0,5,15,0.9)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(0,212,255,0.1)',
        padding: '0 0 8px',
      }}
    >
      {/* Input wrapper — 80% width, centered */}
      <div style={{ width: '80%', margin: '0 auto', position: 'relative' }}>
        <div
          className={input.length > 0 && !loading ? 'cmd-typing' : ''}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            border: `1px solid ${wrapperBorder}`,
            borderRadius: 12,
            background: 'rgba(0,15,30,0.8)',
            padding: '12px 20px',
            boxShadow: wrapperShadow,
            transition: 'border-color 0.2s, box-shadow 0.2s',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Ripple overlay on submit — key forces re-mount to re-trigger animation */}
          <motion.div
            key={ripple ? 'ripple-on' : 'ripple-off'}
            initial={{ scale: 1, opacity: ripple ? 0.3 : 0 }}
            animate={ripple ? { scale: 1.02, opacity: 0 } : { scale: 1, opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: 'rgba(0,212,255,0.15)',
              pointerEvents: 'none',
            }}
          />

          {/* Loading spinner */}
          {loading && (
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid rgba(0,212,255,0.15)',
                borderTopColor: '#00d4ff',
                animation: 'shell-spin 0.8s linear infinite',
                flexShrink: 0,
                display: 'block',
              }}
            />
          )}

          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(input);
              }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={loading ? 'Processing...' : 'Garnet에게 지시하세요...'}
            disabled={loading}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 14,
              color: 'var(--shell-text-primary)',
              caretColor: '#00d4ff',
              '--placeholder-color': loading ? '#00d4ff' : 'var(--shell-text-muted)',
            } as React.CSSProperties}
            className="command-bar-input"
          />
        </div>
      </div>

      {/* Context chips */}
      <div
        style={{
          width: '80%',
          margin: '6px auto 0',
          display: 'flex',
          gap: 8,
        }}
      >
        <Chip label="Domains ↗" onClick={() => router.push('/operations')} />
        <Chip label={`History (${history.length})`} onClick={undefined} />
      </div>
    </div>
  );
}

function Chip({ label, onClick }: { label: string; onClick?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 11,
        padding: '3px 12px',
        borderRadius: 20,
        border: `1px solid ${hovered ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.15)'}`,
        background: hovered ? 'rgba(0,212,255,0.1)' : 'rgba(0,212,255,0.05)',
        color: hovered ? 'var(--shell-text-primary)' : 'var(--shell-text-muted)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// SSE event handler — reads nested { event, data } structure from server
function handleSSEEvent(
  event: Record<string, unknown>,
  entryId: string,
  panels: ReturnType<typeof useCanvasStore.getState>['panels'],
  spawnPanel: ReturnType<typeof useCanvasStore.getState>['spawnPanel'],
  addStep: ReturnType<typeof useStreamStore.getState>['addStep'],
  setEntryStatus: ReturnType<typeof useStreamStore.getState>['setEntryStatus'],
  router: ReturnType<typeof useRouter>
) {
  switch (event.event) {
    case 'step': {
      const d = event.data as { entryId: string; step: { text: string; status: string } };
      addStep(d.entryId, { text: d.step.text, status: d.step.status as never });
      break;
    }
    case 'panel': {
      const d = event.data as { type: string; title: string; data: unknown };
      const pos = getNextPanelPosition(panels, 800);
      const panelId = spawnPanel({
        type: d.type as never, title: d.title, status: 'active',
        position: pos, size: { width: 380, height: 260 }, data: d.data as never
      });
      setEntryStatus(entryId, 'running', panelId);
      break;
    }
    case 'done':
      setEntryStatus(entryId, 'done');
      break;
    case 'error': {
      const d = event.data as { message: string };
      setEntryStatus(entryId, 'error');
      addStep(entryId, { text: d.message, status: 'error' });
      break;
    }
    case 'navigate': {
      const d = event.data as { url: string };
      router.push(d.url);
      break;
    }
  }
}
