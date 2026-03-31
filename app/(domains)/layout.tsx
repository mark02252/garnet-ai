import { AppNav } from '@/components/app-nav';
import { SupabaseAuthChip } from '@/components/supabase-auth-chip';
import { CommandPalette } from '@/components/command-palette';
import { CopilotSidebar } from '@/components/copilot-sidebar';

export default function DomainsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="app-shell">
        <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[200px_1fr]">
          <AppNav />
          <div className="min-w-0">
            <header className="app-topbar">
              <p className="text-[13px] font-semibold text-[#333d4b]">Garnet</p>
              <SupabaseAuthChip />
            </header>
            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>
      <CommandPalette />
      <CopilotSidebar />
    </>
  );
}
