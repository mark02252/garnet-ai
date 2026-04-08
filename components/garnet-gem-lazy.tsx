'use client'

import dynamic from 'next/dynamic'

const GarnetGem = dynamic(
  () => import('@/components/garnet-gem').then((m) => ({ default: m.GarnetGem })),
  { ssr: false, loading: () => <div className="h-20 w-20" /> }
)

export function GarnetGemLazy({ size, className }: { size?: number; className?: string }) {
  return <GarnetGem size={size} className={className} />
}
