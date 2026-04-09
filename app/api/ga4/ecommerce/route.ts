import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { fetchEcommerceSummary } = await import('@/lib/ga4-client')
    const data = await fetchEcommerceSummary(30)
    return NextResponse.json({ configured: true, ...data })
  } catch (err) {
    return NextResponse.json({ configured: false, error: String(err) }, { status: 500 })
  }
}
