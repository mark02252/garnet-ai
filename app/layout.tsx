import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { Toaster } from 'sonner';
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
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
