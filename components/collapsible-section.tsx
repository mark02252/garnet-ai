'use client';

import { useState } from 'react';

export function CollapsibleSection({
  title,
  defaultOpen = true,
  badge,
  trailing,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-3 text-left"
          onClick={() => setOpen((prev) => !prev)}
        >
          <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
          <span className="text-xs text-[var(--text-muted)]">{open ? '\u25B2 \uC811\uAE30' : '\u25BC \uD3BC\uCE58\uAE30'}</span>
          {badge}
        </button>
        {trailing}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
