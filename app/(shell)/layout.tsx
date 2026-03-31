import { CommandPalette } from '@/components/command-palette';
import { AmbientBar } from '@/components/agent-shell/ambient-bar';
import { AgentStream } from '@/components/agent-shell/agent-stream';
import { Canvas } from '@/components/agent-shell/canvas';
import { CommandBar } from '@/components/agent-shell/command-bar';

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
          flexDirection: 'column', gap: 12, background: '#0a0a0f', color: '#8b949e',
          fontSize: 14, textAlign: 'center', padding: 24
        }}
      >
        <span style={{ fontSize: 32 }}>◈</span>
        <p>Agent Shell은 데스크탑(1024px+)에서 사용하세요.</p>
        <a href="/operations" style={{ color: '#3182f6', textDecoration: 'none' }}>
          → 기존 화면으로 이동
        </a>
      </div>
      <div
        className="shell-wrapper shell-theme flex flex-col"
        style={{ height: '100dvh', background: 'var(--shell-bg)', overflow: 'hidden' }}
      >
        <AmbientBar />
        <div className="flex flex-1 overflow-hidden">
          <AgentStream />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Canvas />
            <CommandBar />
          </div>
        </div>
        <CommandPalette />
        {children}
      </div>
    </>
  );
}
