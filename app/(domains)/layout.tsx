'use client';

import { useEffect } from 'react';
import { AppNav } from '@/components/app-nav';
import { SupabaseAuthChip } from '@/components/supabase-auth-chip';
import { CommandPalette } from '@/components/command-palette';
import { CopilotSidebar } from '@/components/copilot-sidebar';
import { useSidebarStore } from '@/lib/sidebar-store';

export default function DomainsLayout({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebarStore();

  // Cmd+B / Ctrl+B keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const gridCols = collapsed ? '60px 1fr' : '200px 1fr';

  return (
    <>
      <div className="app-shell">
        <div
          className="grid min-h-screen grid-cols-1 lg:grid-cols-[200px_1fr]"
          style={{ gridTemplateColumns: undefined }}
        >
          {/* Desktop grid with dynamic columns */}
          <style>{`
            @media (min-width: 1024px) {
              .app-shell > div {
                grid-template-columns: ${gridCols} !important;
              }
            }
          `}</style>

          <AppNav />

          <div className="min-w-0">
            <header className="app-topbar">
              {/* Mobile hamburger */}
              <button
                className="lg:hidden flex items-center justify-center h-8 w-8 rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-sub)] hover:text-[var(--text-base)] transition-colors"
                onClick={() => setMobileOpen(true)}
                aria-label="메뉴 열기"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <p className="text-[10px] font-semibold uppercase tracking-[2px] text-[var(--text-muted)]">Garnet OS</p>
              <SupabaseAuthChip />
            </header>
            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <CommandPalette />
      <CopilotSidebar />
    </>
  );
}
