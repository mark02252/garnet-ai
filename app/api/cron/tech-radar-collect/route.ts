import { collectGithubTrending } from '@/lib/tech-radar/github-collector'

export async function GET(req: Request): Promise<Response> {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const result = await collectGithubTrending()
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[cron] tech-radar-collect 실패', err)
    return new Response('Internal Server Error', { status: 500 })
  }
}
