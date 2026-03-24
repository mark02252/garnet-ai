import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { AppNav } from '@/components/app-nav';
import { SupabaseAuthChip } from '@/components/supabase-auth-chip';
import { Toaster } from 'sonner';
import { CommandPalette } from '@/components/command-palette';
import { CopilotSidebar } from '@/components/copilot-sidebar';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Garnet',
  description: 'Garnet'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className={notoSansKr.variable}>
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
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
