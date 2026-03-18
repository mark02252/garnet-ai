'use client'

export function EmptyState({
  icon = '📋',
  title,
  description,
  actionLabel,
  actionHref
}: {
  icon?: string
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm font-semibold text-[var(--text-strong)]">{title}</p>
      {description && <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm">{description}</p>}
      {actionLabel && actionHref && (
        <a href={actionHref} className="button-primary text-xs mt-4 px-4 py-2">
          {actionLabel}
        </a>
      )}
    </div>
  )
}
