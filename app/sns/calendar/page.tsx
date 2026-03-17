'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

type ScheduledPost = {
  id: string
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

  useEffect(() => {
    fetch(`/api/sns/schedule?year=${year}&month=${month}`)
      .then(r => r.json()).then(setPosts)
  }, [year, month])

  useEffect(() => {
    fetch('/api/sns/content')
      .then(r => r.json()).then(setDrafts)
  }, [])

  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()

  function getPostsForDay(day: number) {
    return posts.filter(p => new Date(p.scheduledAt).getDate() === day)
  }

  async function schedulePost() {
    if (!schedulingDraftId || !selectedDate) return
    setSaving(true)
    const dt = new Date(`${selectedDate}T${selectedTime}:00`)
    // draft에서 personaId를 가져온 뒤 예약 생성
    const draftData = await fetch(`/api/sns/content/${schedulingDraftId}`).then(r => r.json())
    const resolvedPersonaId = draftData.personaId || null
    await fetch('/api/sns/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId: schedulingDraftId, scheduledAt: dt.toISOString(), personaId: resolvedPersonaId }),
    })
    const updated = await fetch(`/api/sns/schedule?year=${year}&month=${month}`).then(r => r.json())
    setPosts(updated)
    setSchedulingDraftId('')
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="dashboard-eyebrow">SNS 스튜디오</p>
          <h1 className="dashboard-title">콘텐츠 캘린더</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="button-secondary" onClick={() => { if (month === 1) { setMonth(12); setYear(y => y-1) } else setMonth(m => m-1) }}>‹</button>
          <span className="font-medium">{year}년 {month}월</span>
          <button className="button-secondary" onClick={() => { if (month === 12) { setMonth(1); setYear(y => y+1) } else setMonth(m => m+1) }}>›</button>
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

      {/* 캘린더 그리드 */}
      <div className="card">
        <div className="grid grid-cols-7 mb-2">
          {['일','월','화','수','목','금','토'].map(d => (
            <div key={d} className="text-center text-xs text-[var(--text-muted)] py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dayPosts = getPostsForDay(day)
            const isToday = today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day
            return (
              <div
                key={day}
                className={`min-h-[72px] p-1 rounded border cursor-pointer hover:bg-[var(--surface-sub)] ${isToday ? 'border-[var(--accent)]' : 'border-[var(--surface-border)]'}`}
                onClick={() => setSelectedDate(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`)}
              >
                <p className={`text-xs mb-1 ${isToday ? 'text-[var(--accent)] font-bold' : 'text-[var(--text-muted)]'}`}>{day}</p>
                {dayPosts.map(p => (
                  <div key={p.id} className={`${STATUS_COLOR[p.status]} text-white text-[10px] rounded px-1 mb-0.5 truncate`}>
                    {p.draft.title || p.draft.type}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage() {
  return <Suspense><CalendarContent /></Suspense>
}
