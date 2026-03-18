'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

type ScheduledPost = {
  id: string
  draftId: string
  scheduledAt: string
  status: string
  draft: { type: string; title: string | null; content: string | null }
  persona: { name: string }
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-[var(--accent)]',
  PUBLISHED: 'bg-emerald-500',
  FAILED: 'bg-rose-500',
  MISSED: 'bg-amber-400',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '예약됨',
  PUBLISHED: '발행완료',
  FAILED: '실패',
  MISSED: '미발행',
}

const TYPE_LABEL: Record<string, string> = {
  TEXT: '텍스트',
  CARD_NEWS: '카드뉴스',
  CAROUSEL: '카드뉴스',
}

type ViewMode = 'month' | 'week'

function CalendarContent() {
  const searchParams = useSearchParams()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [drafts, setDrafts] = useState<{ id: string; title: string | null; personaId: string | null }[]>([])
  const [schedulingDraftId, setSchedulingDraftId] = useState(searchParams.get('draftId') || '')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Week view: which week offset from today (0 = current week)
  const [weekOffset, setWeekOffset] = useState(0)

  const refreshPosts = useCallback(() => {
    fetch(`/api/sns/schedule?year=${year}&month=${month}`)
      .then(r => r.json()).then(setPosts)
  }, [year, month])

  useEffect(() => { refreshPosts() }, [refreshPosts])

  useEffect(() => {
    fetch('/api/sns/content')
      .then(r => r.json()).then(setDrafts)
  }, [])

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()

  function getPostsForDay(day: number, m?: number, y?: number) {
    const targetMonth = m ?? month
    const targetYear = y ?? year
    return posts.filter(p => {
      const d = new Date(p.scheduledAt)
      return d.getDate() === day && d.getMonth() + 1 === targetMonth && d.getFullYear() === targetYear
    })
  }

  function getWeekDays(): Date[] {
    const base = new Date()
    const dayOfWeek = base.getDay()
    const startOfWeek = new Date(base)
    startOfWeek.setDate(base.getDate() - dayOfWeek + weekOffset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek)
      d.setDate(startOfWeek.getDate() + i)
      return d
    })
  }

  function truncate(s: string, len: number) {
    return s.length > len ? s.slice(0, len) + '…' : s
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  async function schedulePost() {
    if (!schedulingDraftId || !selectedDate) return
    setSaving(true)
    const dt = new Date(`${selectedDate}T${selectedTime}:00`)
    const draftData = await fetch(`/api/sns/content/${schedulingDraftId}`).then(r => r.json())
    const resolvedPersonaId = draftData.personaId || null
    await fetch('/api/sns/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: schedulingDraftId, scheduledAt: dt.toISOString(), personaId: resolvedPersonaId }),
    })
    refreshPosts()
    setSchedulingDraftId('')
    setSaving(false)
  }

  async function deleteSchedule(id: string) {
    setDeleting(true)
    await fetch(`/api/sns/schedule/${id}`, { method: 'DELETE' })
    setSelectedPost(null)
    setDeleting(false)
    refreshPosts()
  }

  function handlePostClick(post: ScheduledPost, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedPost(post)
  }

  // Shared post pill component for calendar cells
  function PostPill({ post, compact }: { post: ScheduledPost; compact?: boolean }) {
    const title = post.draft.title || post.draft.type
    const typeLabel = TYPE_LABEL[post.draft.type] || post.draft.type
    return (
      <button
        onClick={(e) => handlePostClick(post, e)}
        className={`${STATUS_COLOR[post.status]} text-white text-[10px] rounded px-1 mb-0.5 w-full text-left block`}
      >
        <span className="block truncate">{compact ? truncate(title, 15) : title}</span>
        {!compact && (
          <span className="opacity-75 text-[9px]">{typeLabel} · {formatTime(post.scheduledAt)}</span>
        )}
      </button>
    )
  }

  // Month view cell
  function MonthCell({ day }: { day: number }) {
    const dayPosts = getPostsForDay(day)
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
    return (
      <div
        className={`min-h-[72px] p-1 rounded border cursor-pointer hover:bg-[var(--surface-sub)] ${isToday ? 'border-[var(--accent)]' : 'border-[var(--surface-border)]'}`}
        onClick={() => setSelectedDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)}
      >
        <p className={`text-xs mb-1 ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>{day}</p>
        {dayPosts.map(p => (
          <PostPill key={p.id} post={p} compact />
        ))}
      </div>
    )
  }

  // Week view
  function WeekView() {
    const days = getWeekDays()
    return (
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <button className="button-secondary text-xs" onClick={() => setWeekOffset(o => o - 1)}>‹ 이전 주</button>
          <span className="text-sm text-[var(--text-muted)]">
            {days[0].getMonth() + 1}/{days[0].getDate()} – {days[6].getMonth() + 1}/{days[6].getDate()}
          </span>
          <button className="button-secondary text-xs" onClick={() => setWeekOffset(o => o + 1)}>다음 주 ›</button>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <div key={d} className="text-center text-xs text-[var(--text-muted)] py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(date => {
            const dayPosts = getPostsForDay(date.getDate(), date.getMonth() + 1, date.getFullYear())
            const isToday = date.toDateString() === today.toDateString()
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
            return (
              <div
                key={dateStr}
                className={`min-h-[120px] p-2 rounded border cursor-pointer hover:bg-[var(--surface-sub)] ${isToday ? 'border-[var(--accent)]' : 'border-[var(--surface-border)]'}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <p className={`text-xs mb-2 ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>
                  {date.getMonth() + 1}/{date.getDate()}
                </p>
                {dayPosts.map(p => (
                  <PostPill key={p.id} post={p} />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">콘텐츠 캘린더</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded overflow-hidden border border-[var(--surface-border)]">
            <button
              className={`px-3 py-1 text-xs ${viewMode === 'month' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'}`}
              onClick={() => setViewMode('month')}
            >
              월간
            </button>
            <button
              className={`px-3 py-1 text-xs ${viewMode === 'week' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'}`}
              onClick={() => setViewMode('week')}
            >
              주간
            </button>
          </div>
          {/* Month navigation (visible in month mode) */}
          {viewMode === 'month' && (
            <div className="flex items-center gap-2">
              <button className="button-secondary" onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }}>‹</button>
              <span className="font-medium">{year}년 {month}월</span>
              <button className="button-secondary" onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }}>›</button>
            </div>
          )}
        </div>
      </div>

      {/* 예약 폼 */}
      {(schedulingDraftId || searchParams.get('draftId')) && (
        <div className="card mb-4 flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">초안 선택</label>
            <select className="input" value={schedulingDraftId} onChange={e => setSchedulingDraftId(e.target.value)}>
              <option value="">선택</option>
              {drafts.map(d => <option key={d.id} value={d.id}>{d.title || d.id.slice(0, 8)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">날짜</label>
            <input type="date" className="input" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">시간</label>
            <input type="time" className="input" value={selectedTime} onChange={e => setSelectedTime(e.target.value)} />
          </div>
          <button className="button-primary" onClick={schedulePost} disabled={saving}>
            {saving ? '예약 중...' : '예약 확정'}
          </button>
        </div>
      )}

      {/* Calendar grid */}
      {viewMode === 'month' ? (
        <div className="card">
          <div className="grid grid-cols-7 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <div key={d} className="text-center text-xs text-[var(--text-muted)] py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => (
              <MonthCell key={day} day={day} />
            ))}
          </div>
        </div>
      ) : (
        <WeekView />
      )}

      {/* Post detail modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedPost(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-[var(--surface)] border border-[var(--surface-border)] rounded-lg shadow-lg p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <button className="absolute top-3 right-3 text-[var(--text-muted)] hover:text-[var(--text)]" onClick={() => setSelectedPost(null)}>
              &times;
            </button>
            <h3 className="text-base font-semibold mb-3">{selectedPost.draft.title || '(제목 없음)'}</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">콘텐츠 유형</span>
                <span>{TYPE_LABEL[selectedPost.draft.type] || selectedPost.draft.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">예약 시간</span>
                <span>{new Date(selectedPost.scheduledAt).toLocaleString('ko-KR')}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--text-muted)]">상태</span>
                <span className={`${STATUS_COLOR[selectedPost.status]} text-white text-xs rounded px-2 py-0.5`}>
                  {STATUS_LABEL[selectedPost.status] || selectedPost.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">페르소나</span>
                <span>{selectedPost.persona?.name || '-'}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Link
                href={`/sns/studio/${selectedPost.draftId}`}
                className="button-primary flex-1 text-center text-sm"
              >
                편집
              </Link>
              <button
                className="button-secondary flex-1 text-sm text-rose-500 hover:bg-rose-50"
                onClick={() => deleteSchedule(selectedPost.id)}
                disabled={deleting}
              >
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CalendarPage() {
  return <Suspense><CalendarContent /></Suspense>
}
