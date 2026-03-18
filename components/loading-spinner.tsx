'use client'

export function LoadingSpinner({ text = '불러오는 중...' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      <p className="text-sm text-[var(--text-muted)]">{text}</p>
    </div>
  )
}
