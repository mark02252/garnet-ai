export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--surface-sub)] ${className ?? ''}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="panel space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  )
}
