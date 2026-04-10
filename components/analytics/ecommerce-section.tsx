'use client'

import { useEffect, useState } from 'react'

type EcomData = {
  totalTransactions: number
  totalRevenue: number
  avgPurchaseRate: number
  avgOrderValue: number
  dailyData: Array<{
    date: string
    transactions: number
    revenue: number
    purchaseRate: number
    avgOrderValue: number
  }>
}

export function EcommerceSection() {
  const [data, setData] = useState<EcomData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/ga4/ecommerce')
      .then(r => r.json())
      .then(d => { if (d.configured) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="animate-pulse h-48 rounded-xl bg-zinc-900/50" />
  if (!data || data.totalRevenue === 0) return null

  // 최근 7일 데이터
  const recent7 = data.dailyData.slice(-7)
  const prev7 = data.dailyData.slice(-14, -7)

  const recent7Revenue = recent7.reduce((s, d) => s + d.revenue, 0)
  const prev7Revenue = prev7.reduce((s, d) => s + d.revenue, 0)
  const revenueChange = prev7Revenue > 0 ? ((recent7Revenue - prev7Revenue) / prev7Revenue) * 100 : 0

  const recent7Buyers = recent7.reduce((s, d) => s + d.transactions, 0)
  const avgConvRate = recent7.length > 0
    ? recent7.reduce((s, d) => s + d.purchaseRate, 0) / recent7.length
    : 0

  // 일별 매출 바 차트 (간단한 CSS)
  const maxRevenue = Math.max(...data.dailyData.map(d => d.revenue), 1)

  // 매출 있는 날만 필터
  const daysWithRevenue = data.dailyData.filter(d => d.revenue > 0)

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#F0ECE8', letterSpacing: 1 }}>
          💰 전자상거래 성과
        </h2>
        <span style={{ fontSize: 10, color: '#7E8A98' }}>최근 30일</span>
      </div>

      {/* KPI 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#F0ECE8' }}>₩{data.totalRevenue.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: '#7E8A98', marginTop: 4 }}>총 매출</div>
          {revenueChange !== 0 && (
            <div style={{ fontSize: 10, color: revenueChange > 0 ? '#4ade80' : '#f87171', marginTop: 2 }}>
              {revenueChange > 0 ? '↑' : '↓'} {Math.abs(revenueChange).toFixed(1)}% vs 이전 7일
            </div>
          )}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#60a5fa' }}>{data.totalTransactions}</div>
          <div style={{ fontSize: 10, color: '#7E8A98', marginTop: 4 }}>구매자 (30일)</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#fbbf24' }}>{(avgConvRate * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 10, color: '#7E8A98', marginTop: 4 }}>구매 전환율 (7일)</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#a78bfa' }}>₩{data.avgOrderValue.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: '#7E8A98', marginTop: 4 }}>인당 평균</div>
        </div>
      </div>

      {/* 일별 매출 바 차트 */}
      {daysWithRevenue.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 11, color: '#7E8A98', marginBottom: 12 }}>일별 매출</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {data.dailyData.slice(-14).map((d, i) => {
              const height = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0
              const date = d.date.slice(6, 8)
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${Math.max(height, 2)}%`,
                      background: d.revenue > 0 ? '#C93545' : 'rgba(255,255,255,0.05)',
                      borderRadius: 2,
                      minHeight: 2,
                    }}
                    title={`${d.date}: ₩${d.revenue.toLocaleString()}`}
                  />
                  <span style={{ fontSize: 8, color: '#555', marginTop: 4 }}>{date}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
