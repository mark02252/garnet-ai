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
    <div className="p-6">
      <div className="mx-auto max-w-2xl rounded-2xl border border-[#ddcfc1] bg-white p-6 shadow-[0_10px_28px_rgba(58,39,35,0.10)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a5646]">Recovery</p>
        <h1 className="mt-2 text-2xl font-semibold">화면 오류가 발생했습니다</h1>
        <p className="mt-2 text-sm text-[#5d4b43]">
          일시적인 Next 캐시 손상일 수 있습니다. 먼저 다시 시도하고, 계속되면 복구 명령을 실행하세요.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="button-primary">
            다시 시도
          </button>
          <button type="button" onClick={onCopy} className="button-secondary">
            복구 명령 복사
          </button>
        </div>
        <p className="mt-2 text-xs text-[#6f5f56]">
          터미널에서 실행: <code>{RECOVERY_COMMAND}</code>
          {copied ? ' (복사됨)' : ''}
        </p>

        <details className="mt-4 rounded-lg border border-[#e5d9ce] bg-[#faf4ec] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#5b463d]">기술 정보</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs text-[#4b3a33]">{error?.message || 'Unknown error'}</pre>
        </details>
      </div>
    </div>
  );
}
