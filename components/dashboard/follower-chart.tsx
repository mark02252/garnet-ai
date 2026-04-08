'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { formatChartTick, formatCompactNumber } from '@/lib/format-number'

type FollowerDataPoint = { date: string; followers: number }

export function FollowerChart({ data, currentFollowers }: { data: FollowerDataPoint[]; currentFollowers?: number }) {
  // 데이터 변화 있는지 확인
  const uniqueValues = new Set(data.map(d => d.followers))
  const hasChange = uniqueValues.size > 1

  // 데이터가 부족하거나 변화 없으면 요약 카드 표시
  if (data.length <= 1 || !hasChange) {
    const count = currentFollowers ?? data[0]?.followers ?? 0
    return (
      <div className="panel" style={{ minHeight: 240 }}>
        <p className="text-sm font-semibold text-[var(--text-strong)] mb-4">팔로워</p>
        {count > 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <p className="text-3xl font-bold text-[var(--text-strong)]">{formatCompactNumber(count)}</p>
            <p className="text-xs text-[var(--text-muted)] mt-2">현재 팔로워</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {data.length > 1 ? '팔로워 변동이 감지되면 추이 차트로 전환됩니다' : '매일 동기화하면 추이 차트가 생성됩니다'}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-[var(--text-muted)]">동기화를 실행하면 팔로워 정보가 표시됩니다.</p>
          </div>
        )}
      </div>
    )
  }

  const current = data[data.length - 1]?.followers ?? 0
  const oldest = data[0]?.followers ?? 0
  const diff = current - oldest
  const diffLabel = diff > 0 ? `+${formatCompactNumber(diff)}` : formatCompactNumber(diff)

  return (
    <div className="panel">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--text-strong)]">팔로워 추이</p>
        <div className="text-right">
          <p className="text-lg font-bold text-[var(--text-strong)]">{formatCompactNumber(current)}</p>
          <p className={`text-xs ${diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>30일 전 대비 {diffLabel}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={50} tickFormatter={formatChartTick} />
          <Tooltip
            contentStyle={{ backgroundColor: 'rgba(8,10,20,0.94)', border: '1px solid rgba(201,53,69,0.14)', borderRadius: 8, fontSize: 12, color: '#F0ECE8' }}
            labelStyle={{ color: '#7E8A98' }}
            itemStyle={{ color: '#B0B8C4' }}
            formatter={(value) => [formatCompactNumber(Number(value)), '팔로워']}
          />
          <Line type="monotone" dataKey="followers" stroke="#3182f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
