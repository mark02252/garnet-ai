import { NextResponse } from 'next/server';
import { getJobStatuses } from '@/lib/scheduler/engine';

// Maps scheduler job IDs to the 3 shell dot keys.
// intel  — data collection & digest jobs
// seminar — analysis, reporting & KPI jobs
// video  — no dedicated scheduler jobs yet; always reflects idle unless future jobs are added
const JOB_KEY_MAP: Record<string, 'intel' | 'seminar' | 'video'> = {
  'collect-twitter': 'intel',
  'collect-serper':  'intel',
  'collect-naver':   'intel',
  'collect-youtube': 'intel',
  'collect-reddit':  'intel',
  'daily-digest':    'intel',
  'daily-briefing':      'seminar',
  'weekly-kpi-review':   'seminar',
  'ga4-analysis':        'seminar',
  'urgent-recommendations': 'seminar',
};

type DotStatus = 'running' | 'idle' | 'error';

export async function GET() {
  try {
    const jobs = await getJobStatuses();
    const result: Record<string, DotStatus> = { intel: 'idle', seminar: 'idle', video: 'idle' };

    for (const job of jobs) {
      const key = JOB_KEY_MAP[job.id];
      if (!key) continue;

      // Running wins over any prior status
      if (job.isRunning) { result[key] = 'running'; continue; }

      // Only downgrade from idle → error, never from running → error
      if (result[key] !== 'running' && job.lastStatus === 'FAILED') {
        result[key] = 'error';
      }
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ intel: 'idle', seminar: 'idle', video: 'idle' });
  }
}
