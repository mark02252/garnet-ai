'use client';

import { CommandPalette } from '@/components/command-palette';
import { SystemBar } from '@/components/agent-shell/system-bar';
import { Canvas } from '@/components/agent-shell/canvas';
import { CommandBar } from '@/components/agent-shell/command-bar';
import { SignalFeed } from '@/components/agent-shell/signal-feed';

function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @media (max-width: 1023px) {
          .shell-wrapper { display: none !important; }
          .shell-mobile-fallback { display: flex !important; }
        }
        .shell-mobile-fallback { display: none; }
      `}</style>
      <div
        className="shell-mobile-fallback"
        style={{
          height: '100dvh', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, background: '#050810', color: '#3a6080',
          fontSize: 14, textAlign: 'center', padding: 24
        }}
      >
        <span style={{ fontSize: 32 }}>◈</span>
        <p>Agent Shell은 데스크탑(1024px+)에서 사용하세요.</p>
        <a href="/operations" style={{ color: '#00d4ff', textDecoration: 'none' }}>
          → 기존 화면으로 이동
        </a>
      </div>
      <div
        className="shell-wrapper shell-theme flex flex-col"
        style={{ height: '100dvh', background: 'var(--shell-bg)', overflow: 'hidden' }}
      >
        <SystemBar onOpenPalette={openCommandPalette} />
        <Canvas />
        <CommandBar />
        <SignalFeed />
        <CommandPalette />
        {children}
      </div>
    </>
  );
}
