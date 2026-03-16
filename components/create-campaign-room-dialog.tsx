'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type Field = { id: string; label: string; placeholder: string; required?: boolean; multiline?: boolean };

const FIELDS: Field[] = [
  { id: 'title', label: '캠페인명', placeholder: '예: 2024 하반기 신제품 런칭', required: true },
  { id: 'brand', label: '브랜드', placeholder: '예: Garnet, TechCo', required: true },
  { id: 'region', label: '지역/채널', placeholder: '예: 서울, 인스타그램, 글로벌', required: true },
  { id: 'goal', label: '목표', placeholder: '예: 인지도 확대, 리드 확보', required: true },
  { id: 'objective', label: '세부 목표 (선택)', placeholder: '이번 캠페인에서 이루려는 구체적인 결과를 적어주세요.' },
  { id: 'notes', label: '메모 (선택)', placeholder: '배경, 제약 사항 등 참고할 내용을 자유롭게 적어주세요.', multiline: true }
];

export function CreateCampaignRoomDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function handleClose() {
    setOpen(false);
    setError(null);
    formRef.current?.reset();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));

    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch('/api/campaigns/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || '생성에 실패했습니다.');
          return;
        }
        handleClose();
        router.refresh();
      } catch {
        setError('네트워크 오류가 발생했습니다.');
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="button-primary">
        + 새 캠페인 룸
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(25,31,40,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div
            className="w-full max-w-lg rounded-[16px] bg-[var(--surface)] shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
            style={{ border: '1px solid var(--surface-border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Campaign Rooms</p>
                <h2 className="mt-0.5 text-base font-semibold text-[var(--text-strong)]">새 캠페인 룸 만들기</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--text-muted)] hover:bg-[var(--surface-sub)] hover:text-[var(--text-base)]"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
              {FIELDS.map((field) => (
                <div key={field.id}>
                  <label htmlFor={field.id} className="mb-1.5 block text-[13px] font-semibold text-[var(--text-strong)]">
                    {field.label}
                    {field.required && <span className="ml-1 text-rose-500">*</span>}
                  </label>
                  {field.multiline ? (
                    <textarea
                      id={field.id}
                      name={field.id}
                      placeholder={field.placeholder}
                      rows={3}
                      className="input resize-none"
                    />
                  ) : (
                    <input
                      id={field.id}
                      name={field.id}
                      type="text"
                      placeholder={field.placeholder}
                      required={field.required}
                      className="input"
                    />
                  )}
                </div>
              ))}

              {error && (
                <div className="rounded-[8px] bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={handleClose} className="button-secondary" disabled={pending}>
                  취소
                </button>
                <button type="submit" className="button-primary" disabled={pending}>
                  {pending ? '생성 중...' : '캠페인 룸 만들기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
