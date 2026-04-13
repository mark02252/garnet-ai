import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const days = Number(url.searchParams.get('days') || '7')

  try {
    const { fetchEcommerceFunnel } = await import('@/lib/ga4-client')
    const stages = await fetchEcommerceFunnel(days)
    return NextResponse.json({ configured: true, days, stages })
  } catch (err) {
    return NextResponse.json({ configured: false, error: String(err) }, { status: 500 })
  }
}
