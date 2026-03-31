'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCanvasStore, getNextPanelPosition } from '@/lib/canvas-store';
import { useStreamStore } from '@/lib/agent-stream-store';

type QuickAction = { label: string; href?: string; badge?: number }

export function CommandBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
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

  const quickActions: QuickAction[] = [
    { label: 'Domains', href: '/operations' },
    { label: `History (${history.length})` },
  ];

  return (
    <div
      style={{
        borderTop: '1px solid var(--shell-border)',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}
    >
      <div className="px-4 py-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(input); } }}
          placeholder="Garnet에게 지시하세요..."
          disabled={loading}
          className="command-bar-input w-full bg-transparent text-[var(--shell-text-primary)] placeholder-[var(--shell-text-muted)] text-[14px]"
          style={{ border: 'none', outline: 'none' }}
        />
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => action.href ? router.push(action.href) : undefined}
            className="text-[11px] text-[var(--shell-text-muted)] hover:text-[var(--shell-text-secondary)] transition-colors"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--shell-border)',
              borderRadius: 4, padding: '2px 8px', cursor: 'pointer'
            }}
          >
            {action.label} ↗
          </button>
        ))}
      </div>
    </div>
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
