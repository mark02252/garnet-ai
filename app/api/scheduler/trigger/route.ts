import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { platform } = await req.json().catch(() => ({ platform: 'serper' }))

  try {
    const { initCollectors } = await import('@/lib/collectors/init')
    const { runCollectionJob } = await import('@/lib/collectors/orchestrator')
    const { analyzeRecentIntel } = await import('@/lib/intel/analyzer')

    initCollectors()
    const result = await runCollectionJob(platform)

    // 수집 성공 시 AI 분석도 실행
    if (result.ok) {
      try { await analyzeRecentIntel() } catch { /* non-critical */ }
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: String(err) },
      { status: 500 },
    )
  }
}
