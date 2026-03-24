'use client';

import { AreaChart, Area, ResponsiveContainer } from 'recharts';

type SparklineCardProps = {
  title: string;
  value: string | number;
  change: number; // % vs previous period
  data: { v: number }[];
  unit?: string;
};

export function SparklineCard({ title, value, change, data, unit }: SparklineCardProps) {
  const isPositive = change >= 0;
  const changeColor = isPositive ? '#22c55e' : '#ef4444';
  const changeLabel = `${isPositive ? '+' : ''}${change.toFixed(1)}%`;

  return (
    <div className="metric-card" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background sparkline */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 48,
          opacity: 0.15,
          pointerEvents: 'none',
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`sparkGrad-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent, #3182f6)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="var(--accent, #3182f6)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke="var(--accent, #3182f6)"
              strokeWidth={1.5}
              fill={`url(#sparkGrad-${title})`}
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p className="metric-label">{title}</p>
        <p className="metric-value">
          {value}
          {unit && <span style={{ fontSize: '0.6em', fontWeight: 500, marginLeft: 4, color: 'var(--text-muted)' }}>{unit}</span>}
        </p>
        <span
          className="status-badge"
          style={{
            background: isPositive ? 'var(--status-active-bg, #f0fdf4)' : 'var(--status-failed-bg, #fef2f2)',
            color: changeColor,
            fontSize: 12,
          }}
        >
          {changeLabel} 전주 대비
        </span>
      </div>
    </div>
  );
}
