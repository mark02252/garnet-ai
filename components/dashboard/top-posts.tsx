'use client'

import { useState, useMemo } from 'react'
import { formatCompactNumber } from '@/lib/format-number'

type TopPost = {
  id: string; timestamp: string; reach: number;
  caption?: string; media_type?: string; permalink?: string;
  like_count?: number; comments_count?: number;
}

type SortKey = 'reach' | 'likes' | 'engagement' | 'recent'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'reach', label: '도달' },
  { key: 'likes', label: '좋아요' },
  { key: 'engagement', label: '참여' },
  { key: 'recent', label: '최신' },
]

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
  const [sortBy, setSortBy] = useState<SortKey>('reach')

  const sorted = useMemo(() => {
    const copy = [...posts]
    switch (sortBy) {
      case 'reach':
        return copy.sort((a, b) => b.reach - a.reach)
      case 'likes':
        return copy.sort((a, b) => (b.like_count || 0) - (a.like_count || 0))
      case 'engagement':
        return copy.sort((a, b) =>
          ((b.like_count || 0) + (b.comments_count || 0)) -
          ((a.like_count || 0) + (a.comments_count || 0))
        )
      case 'recent':
        return copy.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      default:
        return copy
    }
  }, [posts, sortBy])

  if (posts.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ minHeight: 240 }}>
        <p className="text-sm text-[var(--text-muted)]">Instagram 연동 후 인기 게시물이 여기에 표시됩니다.</p>
      </div>
    )
  }

  function metricDisplay(post: TopPost) {
    switch (sortBy) {
      case 'reach':
        return <span className="text-sm font-semibold text-[var(--text-strong)]">{formatCompactNumber(post.reach)} 도달</span>
      case 'likes':
        return <span className="text-sm font-semibold text-[var(--text-strong)]">♥ {formatCompactNumber(post.like_count || 0)}</span>
      case 'engagement':
        return (
          <div className="text-right">
            <span className="text-sm font-semibold text-[var(--text-strong)]">♥ {formatCompactNumber(post.like_count || 0)}</span>
            {(post.comments_count || 0) > 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">💬 {post.comments_count}</p>
            )}
          </div>
        )
      case 'recent':
        return <span className="text-sm font-semibold text-[var(--text-strong)]">{formatCompactNumber(post.reach)} 도달</span>
      default:
        return <span className="text-sm font-semibold text-[var(--text-strong)]">{formatCompactNumber(post.reach)}</span>
    }
  }

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--text-strong)]">Top 게시물</p>
        <div className="flex rounded-lg overflow-hidden border border-[var(--surface-border)]">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`px-2 py-0.5 text-[11px] font-medium transition-colors ${
                sortBy === opt.key
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface-sub)] text-[var(--text-muted)] hover:text-[var(--text-strong)]'
              }`}
              onClick={() => setSortBy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-[var(--text-muted)] mb-2">
        * 오가닉 도달 기준. 광고 부스트 도달은 Facebook 연동 후 반영됩니다.
      </p>
      <div className="space-y-2">
        {sorted.map((post, i) => (
          <div key={post.id} className="flex items-start gap-3 py-2 border-b border-[var(--surface-border)] last:border-0">
            <span className="text-sm font-bold text-[var(--accent-text)] w-5 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--text-base)] truncate">{post.caption?.slice(0, 50) || '(캡션 없음)'}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{mediaTypeLabel(post.media_type)} · {formatDate(post.timestamp)}</p>
            </div>
            <div className="shrink-0">
              {metricDisplay(post)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
