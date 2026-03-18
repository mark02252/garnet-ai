'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type FollowerDataPoint = { date: string; followers: number }

export function FollowerChart({ data }: { data: FollowerDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ minHeight: 240 }}>
        <p className="text-sm text-[var(--text-muted)]">분석 동기화를 실행하면 팔로워 추이가 표시됩니다.</p>
      </div>
    )
  }

  const current = data[data.length - 1]?.followers ?? 0
  const oldest = data[0]?.followers ?? 0
  const diff = current - oldest
  const diffLabel = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()

  return (
    <div className="panel">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--text-strong)]">팔로워 추이</p>
        <div className="text-right">
          <p className="text-lg font-bold text-[var(--text-strong)]">{current.toLocaleString()}</p>
          <p className={`text-xs ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>30일 전 대비 {diffLabel}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value) => [Number(value).toLocaleString(), '팔로워']}
          />
          <Line type="monotone" dataKey="followers" stroke="#3182f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
