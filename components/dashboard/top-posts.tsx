'use client'

type TopPost = {
  id: string; timestamp: string; reach: number;
  caption?: string; media_type?: string; permalink?: string;
}

function mediaTypeLabel(type?: string) {
  if (type === 'VIDEO') return '영상'
  if (type === 'CAROUSEL_ALBUM') return '캐러셀'
  return '이미지'
}

function formatDate(iso: string) {
  try { return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date(iso)) }
  catch { return iso.slice(5, 10) }
}

export function TopPosts({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ minHeight: 240 }}>
        <p className="text-sm text-[var(--text-muted)]">Instagram 연동 후 인기 게시물이 여기에 표시됩니다.</p>
      </div>
    )
  }

  return (
    <div className="panel">
      <p className="text-sm font-semibold text-[var(--text-strong)] mb-3">Top 게시물 (도달 기준)</p>
      <div className="space-y-2">
        {posts.map((post, i) => (
          <div key={post.id} className="flex items-start gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
            <span className="text-sm font-bold text-[var(--accent)] w-5 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text-base)] truncate">{post.caption?.slice(0, 50) || '(캡션 없음)'}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{mediaTypeLabel(post.media_type)} · {formatDate(post.timestamp)}</p>
            </div>
            <span className="text-sm font-semibold text-[var(--text-strong)] shrink-0">{post.reach.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
