'use client';

// Stub version — Task 15 will replace this with real job status polling

const JOB_DOTS = [
  { key: 'intel',   label: 'intel' },
  { key: 'seminar', label: 'seminar' },
  { key: 'video',   label: 'video' },
] as const;

export function AmbientBar({ onOpenPalette }: { onOpenPalette?: () => void }) {

  function dotClass(status: 'running' | 'idle' | 'error') {
    if (status === 'running') return 'dot-running text-[var(--shell-status-running)]';
    if (status === 'error')   return 'dot-error text-[var(--shell-status-error)]';
    return 'text-[var(--shell-text-muted)]';
  }

  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: 40,
        background: 'rgba(0,0,0,0.6)',
        borderBottom: '1px solid var(--shell-border)',
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3">
        <span className="text-[var(--shell-accent)] font-bold text-sm tracking-widest">◈ GARNET</span>
        <div className="w-px h-4 bg-[var(--shell-border)]" />
        {JOB_DOTS.map(({ key, label }) => (
          <button
            key={key}
            className={`flex items-center gap-1 text-[11px] ${dotClass('idle')} hover:opacity-80`}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
          >
            <span className={dotClass('idle')}>●</span>
            <span className="text-[var(--shell-text-muted)]">{label}</span>
          </button>
        ))}
      </div>

      {/* Command palette trigger */}
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
