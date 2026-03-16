'use client';

import { useState } from 'react';

type PrintButtonProps = {
  suggestedName?: string;
};

export function PrintButton({ suggestedName }: PrintButtonProps) {
  const [message, setMessage] = useState('');

  async function onSave() {
    setMessage('');
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const derivedName =
        suggestedName ||
        (parts[0] === 'seminar' && parts[2]
          ? `seminar-${parts[2]}-report.pdf`
          : parts[0] === 'runs' && parts[1]
            ? `run-${parts[1]}-report.pdf`
            : 'report.pdf');
      if (window.electronAPI?.savePdfReport) {
        const result = await window.electronAPI.savePdfReport(derivedName);
        if (result.ok) {
          setMessage(`저장됨: ${result.path || derivedName}`);
          return;
        }
        if (result.canceled) {
          setMessage('저장이 취소되었습니다.');
          return;
        }
      }
      window.print();
    } catch {
      setMessage('PDF 저장에 실패했습니다. 다시 시도해 주세요.');
    }
  }

  return (
    <div className="no-print flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onSave}
        className="button-secondary"
      >
        PDF 저장
      </button>
      {message && <p className="max-w-[260px] text-right text-xs text-[var(--text-muted)]">{message}</p>}
    </div>
  );
}
