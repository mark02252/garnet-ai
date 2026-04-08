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

type BestTime = { day: string; hour: string; count: number }

type Draft = { id: string; title: string | null; personaId: string | null }

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-blue-500',
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

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

type ViewMode = 'month' | 'week'

/** Parse best-time API response into { dayIndex, hour } pairs */
function parseBestTimes(bestTimes: BestTime[]): Array<{ dayIndex: number; hour: number }> {
  return bestTimes.map(bt => {
    const dayIndex = DAY_NAMES.indexOf(bt.day)
    const hour = parseInt(bt.hour, 10)
    return { dayIndex: dayIndex >= 0 ? dayIndex : 0, hour: isNaN(hour) ? 15 : hour }
  })
}

/**
 * Find the next optimal time slot that doesn't conflict with existing schedules.
 * Searches up to 14 days out, checking each best-time slot per day.
 */
function getNextOptimalTime(
  bestTimes: Array<{ dayIndex: number; hour: number }>,
  existingSchedules: Array<{ scheduledAt: string }>,
): Date {
  const now = new Date()
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidate = new Date(now)
    candidate.setDate(candidate.getDate() + dayOffset)
    for (const bt of bestTimes) {
      if (candidate.getDay() !== bt.dayIndex && bestTimes.length > 0) {
        // If we have day-specific data, only match the correct day-of-week
        continue
      }
      const slot = new Date(candidate)
      slot.setHours(bt.hour, 0, 0, 0)
      if (slot <= now) continue
      const hasConflict = existingSchedules.some(s => {
        const diff = Math.abs(new Date(s.scheduledAt).getTime() - slot.getTime())
        return diff < 2 * 60 * 60 * 1000
      })
      if (!hasConflict) return slot
    }
  }
  // Fallback: tomorrow at 15:00
  const fallback = new Date(now)
  fallback.setDate(fallback.getDate() + 1)
  fallback.setHours(15, 0, 0, 0)
  return fallback
}

/** Check if a given datetime conflicts (within 2h) with any existing schedule */
function findConflicts(
  targetDate: string,
  targetTime: string,
  posts: ScheduledPost[],
  excludeDraftId?: string,
): ScheduledPost[] {
  const dt = new Date(`${targetDate}T${targetTime}:00`)
  if (isNaN(dt.getTime())) return []
  return posts.filter(p => {
    if (excludeDraftId && p.draftId === excludeDraftId) return false
    const diff = Math.abs(new Date(p.scheduledAt).getTime() - dt.getTime())
    return diff < 2 * 60 * 60 * 1000
  })
}

function CalendarContent() {
  const searchParams = useSearchParams()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [posts, setPosts] = useState<ScheduledPost[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [schedulingDraftId, setSchedulingDraftId] = useState(searchParams.get('draftId') || '')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('10:00')
  const [saving, setSaving] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Smart schedule state
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [optimalHint, setOptimalHint] = useState('')
  const [conflictWarning, setConflictWarning] = useState('')
  const [smartScheduleMode, setSmartScheduleMode] = useState(false)
  const [smartSelectedDraftIds, setSmartSelectedDraftIds] = useState<Set<string>>(new Set())
  const [smartScheduling, setSmartScheduling] = useState(false)
  const [smartPreview, setSmartPreview] = useState<Array<{ draftId: string; title: string; scheduledAt: Date }>>([])

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

  // Fetch best times when a draft is selected for scheduling
  useEffect(() => {
    if (!schedulingDraftId) {
      setOptimalHint('')
      return
    }
    const draft = drafts.find(d => d.id === schedulingDraftId)
    const personaId = draft?.personaId
    if (!personaId) return

    fetch(`/api/sns/analytics/best-time?personaId=${personaId}`)
      .then(r => r.json())
      .then((data: BestTime[]) => {
        setBestTimes(data)
        if (data.length > 0) {
          const parsed = parseBestTimes(data)
          const optimal = getNextOptimalTime(parsed, posts)
          const dateStr = `${optimal.getFullYear()}-${String(optimal.getMonth() + 1).padStart(2, '0')}-${String(optimal.getDate()).padStart(2, '0')}`
          const timeStr = `${String(optimal.getHours()).padStart(2, '0')}:${String(optimal.getMinutes()).padStart(2, '0')}`
          setSelectedDate(dateStr)
          setSelectedTime(timeStr)
          const dayName = DAY_NAMES[optimal.getDay()]
          setOptimalHint(`최적 시간 추천: ${dayName}요일 ${timeStr} (참여율 기준)`)
        }
      })
      .catch(() => { /* best-time fetch optional */ })
  }, [schedulingDraftId, drafts, posts])

  // Conflict warning when date/time changes
  useEffect(() => {
    if (!selectedDate || !selectedTime) {
      setConflictWarning('')
      return
    }
    const conflicts = findConflicts(selectedDate, selectedTime, posts, schedulingDraftId || undefined)
    if (conflicts.length > 0) {
      const c = conflicts[0]
      const cTime = new Date(c.scheduledAt)
      const hh = String(cTime.getHours()).padStart(2, '0')
      const mm = String(cTime.getMinutes()).padStart(2, '0')
      setConflictWarning(`같은 날 ${hh}:${mm}에 이미 예약된 게시물이 있습니다`)
    } else {
      setConflictWarning('')
    }
  }, [selectedDate, selectedTime, posts, schedulingDraftId])

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()

  // Unscheduled drafts (those not already in posts)
  const scheduledDraftIds = new Set(posts.map(p => p.draftId))
  const unscheduledDrafts = drafts.filter(d => !scheduledDraftIds.has(d.id))

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
    setConflictWarning('')
    setOptimalHint('')
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

  // --- Smart / Bulk Schedule ---
  function toggleSmartDraft(draftId: string) {
    setSmartSelectedDraftIds(prev => {
      const next = new Set(prev)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  function generateSmartPreview() {
    const selected = unscheduledDrafts.filter(d => smartSelectedDraftIds.has(d.id))
    if (selected.length === 0) return

    const parsed = bestTimes.length > 0
      ? parseBestTimes(bestTimes)
      : [{ dayIndex: -1, hour: 15 }] // fallback: 15:00 every day

    // Build a combined list of existing + already-assigned slots for conflict check
    const allScheduled: Array<{ scheduledAt: string }> = [
      ...posts.map(p => ({ scheduledAt: p.scheduledAt })),
    ]

    const preview: Array<{ draftId: string; title: string; scheduledAt: Date }> = []
    const now = new Date()

    for (const draft of selected) {
      // Find next available optimal slot not conflicting with existing + already previewed
      let assigned: Date | null = null
      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        if (assigned) break
        const candidate = new Date(now)
        candidate.setDate(candidate.getDate() + dayOffset)

        const slotsToTry = parsed.length > 0 && parsed[0].dayIndex >= 0
          ? parsed.filter(bt => bt.dayIndex === candidate.getDay())
          : parsed // fallback: try on every day

        for (const bt of slotsToTry) {
          const slot = new Date(candidate)
          slot.setHours(bt.hour, 0, 0, 0)
          if (slot <= now) continue
          const hasConflict = allScheduled.some(s => {
            const diff = Math.abs(new Date(s.scheduledAt).getTime() - slot.getTime())
            return diff < 2 * 60 * 60 * 1000
          })
          if (!hasConflict) {
            assigned = slot
            break
          }
        }
      }

      if (!assigned) {
        // Ultimate fallback: stack them at 15:00 on successive days
        const fb = new Date(now)
        fb.setDate(fb.getDate() + preview.length + 1)
        fb.setHours(15, 0, 0, 0)
        assigned = fb
      }

      allScheduled.push({ scheduledAt: assigned.toISOString() })
      preview.push({ draftId: draft.id, title: draft.title || draft.id.slice(0, 8), scheduledAt: assigned })
    }

    setSmartPreview(preview)
  }

  async function executeSmartSchedule() {
    if (smartPreview.length === 0) return
    setSmartScheduling(true)
    for (const item of smartPreview) {
      const draftData = await fetch(`/api/sns/content/${item.draftId}`).then(r => r.json())
      const resolvedPersonaId = draftData.personaId || null
      await fetch('/api/sns/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: item.draftId, scheduledAt: item.scheduledAt.toISOString(), personaId: resolvedPersonaId }),
      })
    }
    setSmartScheduling(false)
    setSmartScheduleMode(false)
    setSmartSelectedDraftIds(new Set())
    setSmartPreview([])
    refreshPosts()
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
        <p className={`text-xs mb-1 ${isToday ? 'text-[var(--accent-text)] font-bold' : 'text-[var(--text-muted)]'}`}>{day}</p>
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
      <div className="ops-zone">
        <div className="flex items-center justify-between mb-3">
          <button className="button-secondary text-xs" onClick={() => setWeekOffset(o => o - 1)}>‹ 이전 주</button>
          <span className="text-sm text-[var(--text-muted)]">
            {days[0].getMonth() + 1}/{days[0].getDate()} – {days[6].getMonth() + 1}/{days[6].getDate()}
          </span>
          <button className="button-secondary text-xs" onClick={() => setWeekOffset(o => o + 1)}>다음 주 ›</button>
        </div>
        <div className="grid grid-cols-7 mb-2">
          {DAY_NAMES.map(d => (
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
                <p className={`text-xs mb-2 ${isToday ? 'text-[var(--accent-text)] font-bold' : 'text-[var(--text-muted)]'}`}>
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

  // Status legend colors with labels
  const STATUS_LEGEND = [
    { key: 'PENDING', label: '예약됨', color: 'var(--accent)' },
    { key: 'PUBLISHED', label: '발행완료', color: '#10b981' },
    { key: 'FAILED', label: '실패', color: '#f43f5e' },
    { key: 'MISSED', label: '미발행', color: '#f59e0b' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Hero */}
      <header className="ops-zone">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="ops-zone-label">SNS Calendar</p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-[var(--text-strong)]">캘린더</h1>
            <p className="text-[12px] text-[var(--text-muted)]">예약된 게시물을 월간/주간으로 한눈에 관리합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Smart schedule toggle */}
            <button
              className={smartScheduleMode ? 'accent-pill text-xs' : 'pill-option text-xs'}
              onClick={() => {
                setSmartScheduleMode(m => !m)
                setSmartSelectedDraftIds(new Set())
                setSmartPreview([])
              }}
            >
              스마트 예약
            </button>
            {/* View mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
              <button
                className={`px-4 py-1.5 text-xs font-semibold ${viewMode === 'month' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'}`}
                onClick={() => setViewMode('month')}
              >
                월간
              </button>
              <button
                className={`px-4 py-1.5 text-xs font-semibold ${viewMode === 'week' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'}`}
                onClick={() => setViewMode('week')}
              >
                주간
              </button>
            </div>
            {/* Month navigation (visible in month mode) */}
            {viewMode === 'month' && (
              <div className="flex items-center gap-2">
                <button className="button-secondary text-xs" onClick={() => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }}>‹</button>
                <span className="text-sm font-semibold text-[var(--text-strong)]">{year}년 {month}월</span>
                <button className="button-secondary text-xs" onClick={() => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }}>›</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Status legend */}
      <div className="soft-card flex flex-wrap items-center gap-4 py-3">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">상태</span>
        {STATUS_LEGEND.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-[var(--text-base)]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Smart Bulk Schedule Panel */}
      {smartScheduleMode && (
        <div className="soft-card">
          <h3 className="section-title mb-4">스마트 예약 — 미예약 초안 선택</h3>
          {unscheduledDrafts.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">미예약 초안이 없습니다.</p>
          ) : (
            <>
              <div className="space-y-1 max-h-48 overflow-y-auto mb-3">
                {unscheduledDrafts.map(d => (
                  <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-[var(--surface-sub)] rounded px-2 py-1">
                    <input
                      type="checkbox"
                      checked={smartSelectedDraftIds.has(d.id)}
                      onChange={() => toggleSmartDraft(d.id)}
                      className="accent-[var(--accent)]"
                    />
                    <span>{d.title || d.id.slice(0, 8)}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  className="button-secondary text-xs"
                  onClick={generateSmartPreview}
                  disabled={smartSelectedDraftIds.size === 0}
                >
                  미리보기 생성 ({smartSelectedDraftIds.size}건)
                </button>
                {smartPreview.length > 0 && (
                  <button
                    className="button-primary text-xs"
                    onClick={executeSmartSchedule}
                    disabled={smartScheduling}
                  >
                    {smartScheduling ? '예약 중...' : `스마트 예약 실행 (${smartPreview.length}건)`}
                  </button>
                )}
              </div>
            </>
          )}
          {/* Preview table */}
          {smartPreview.length > 0 && (
            <div className="mt-3 border border-[var(--surface-border)] rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-sub)]">
                    <th className="text-left px-3 py-2">초안</th>
                    <th className="text-left px-3 py-2">예약 시간</th>
                  </tr>
                </thead>
                <tbody>
                  {smartPreview.map(item => (
                    <tr key={item.draftId} className="border-t border-[var(--surface-border)]">
                      <td className="px-3 py-2">{item.title}</td>
                      <td className="px-3 py-2">{item.scheduledAt.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 예약 폼 */}
      {(schedulingDraftId || searchParams.get('draftId')) && (
        <div className="soft-card">
          <p className="section-title mb-4">예약 설정</p>
          <div className="flex items-end gap-3 flex-wrap">
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
          {/* Optimal time hint */}
          {optimalHint && (
            <p className="text-xs text-[var(--accent-text)] mt-2">
              {'\uD83D\uDCA1'} {optimalHint}
            </p>
          )}
          {/* Conflict warning */}
          {conflictWarning && (
            <p className="text-xs text-amber-500 mt-1">
              {'\u26A0\uFE0F'} {conflictWarning}
            </p>
          )}
        </div>
      )}

      {/* Calendar grid */}
      {viewMode === 'month' ? (
        <div className="ops-zone">
          <div className="grid grid-cols-7 mb-2">
            {DAY_NAMES.map(d => (
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
