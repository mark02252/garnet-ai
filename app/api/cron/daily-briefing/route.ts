export async function GET(req: Request): Promise<Response> {
  if (!process.env.CRON_SECRET || req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const { runDailyBriefingJob } = await import('@/lib/job-scheduler');
    await runDailyBriefingJob();
    return new Response('ok');
  } catch (err) {
    console.error('[cron] daily-briefing 실패', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
