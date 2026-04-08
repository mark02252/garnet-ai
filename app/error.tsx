'use client';

import { useState } from 'react';

const RECOVERY_COMMAND = 'npm run dev:clean';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(RECOVERY_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050810] p-6"
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='92'%3E%3Cpath d='M20,1 L39,11.5 L39,34.5 L20,45 L1,34.5 L1,11.5 Z' fill='none' stroke='%2300d4ff' stroke-opacity='0.05' stroke-width='0.5'/%3E%3C/svg%3E\")", backgroundSize: '80px 92px' }}
    >
      <div className="mx-auto w-full max-w-lg rounded-xl border border-[rgba(201,53,69,0.2)] bg-[rgba(0,12,28,0.92)] p-6 backdrop-blur-md">
        <p className="text-[9px] font-semibold uppercase tracking-[2px] text-[#6090a8]">Recovery</p>
        <h1 className="mt-2 text-lg font-semibold text-[#e8f4ff]">화면 오류가 발생했습니다</h1>
        <p className="mt-2 text-sm text-[#6aabcc]">
          일시적인 Next 캐시 손상일 수 있습니다. 먼저 다시 시도하고, 계속되면 복구 명령을 실행하세요.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="rounded-md bg-[#C93545] px-4 py-1.5 text-sm font-semibold text-[#ffffff] hover:bg-[#B02D3C]">
            다시 시도
          </button>
          <button type="button" onClick={onCopy} className="rounded-md border border-[rgba(201,53,69,0.3)] bg-transparent px-4 py-1.5 text-sm text-[#C93545] hover:bg-[rgba(201,53,69,0.08)]">
            복구 명령 복사
          </button>
        </div>
        <p className="mt-2 text-xs text-[#6090a8]">
          터미널에서 실행: <code className="text-[#6aabcc]">{RECOVERY_COMMAND}</code>
          {copied ? ' (복사됨)' : ''}
        </p>

        <details className="mt-4 rounded-lg border border-[rgba(201,53,69,0.12)] bg-[rgba(0,20,40,0.6)] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#6090a8]">기술 정보</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-[#6aabcc]">{error?.message || 'Unknown error'}</pre>
        </details>
      </div>
    </div>
  );
}
