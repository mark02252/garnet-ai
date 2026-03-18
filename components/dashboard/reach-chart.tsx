'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

type ReachDataPoint = { date: string; reach: number; avg7d?: number }

function computeMovingAverage(data: ReachDataPoint[]): ReachDataPoint[] {
  return data.map((point, i) => {
    if (i < 6) return point
    const window = data.slice(i - 6, i + 1)
    const avg = Math.round(window.reduce((sum, p) => sum + p.reach, 0) / 7)
    return { ...point, avg7d: avg }
  })
}

export function ReachChart({ data }: { data: ReachDataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="panel flex items-center justify-center" style={{ height: 300 }}>
        <p className="text-sm text-[var(--text-muted)]">
          Instagram 연동 후 도달 데이터가 여기에 표시됩니다.{' '}
          <a href="/settings" className="text-[var(--accent)] underline">설정 →</a>
        </p>
      </div>
    )
  }

  const enriched = computeMovingAverage(data)

  return (
    <div className="panel">
      <p className="text-sm font-semibold text-[var(--text-strong)] mb-4">Instagram 도달 추이 (30일)</p>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={enriched} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} />
          <Tooltip
            contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => [Number(value).toLocaleString(), name === 'reach' ? '일별 도달' : '7일 평균']}
          />
          <Line type="monotone" dataKey="reach" stroke="#3182f6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="avg7d" stroke="#6b7684" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
