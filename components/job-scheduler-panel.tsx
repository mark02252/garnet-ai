'use client';

import { useEffect, useState } from 'react';

type Job = {
  id: string;
  name: string;
  description: string;
  cronLike: string;
  enabled: boolean;
  lastRunAt?: string;
};

type JobResult = {
  ok: boolean;
  message: string;
};

const cronLabels: Record<string, string> = {
  hourly: '매시간',
  daily: '매일',
  weekly: '매주'
};

export function JobSchedulerPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState('');
  const [lastResult, setLastResult] = useState<{ jobId: string; result: JobResult } | null>(null);

  useEffect(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs || []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, []);

  async function executeJob(jobId: string) {
    setRunningJobId(jobId);
    setLastResult(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      const result = await res.json();
      setLastResult({ jobId, result });

      // Refresh job list to update lastRunAt
      const refreshRes = await fetch('/api/jobs');
      const refreshData = await refreshRes.json();
      setJobs(refreshData.jobs || []);
    } catch {
      setLastResult({ jobId, result: { ok: false, message: '실행 실패' } });
    }
    setRunningJobId('');
  }

  if (loading) {
    return <div className="text-sm text-[var(--text-disabled)] py-4">작업 목록을 불러오는 중...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-strong)]">자동화 작업</h3>
          <p className="text-xs text-[var(--text-muted)]">등록된 자동화 작업을 관리하고 수동 실행할 수 있습니다.</p>
        </div>
      </div>

      {jobs.map((job) => (
        <div
          key={job.id}
          className="bg-[var(--surface)] rounded-lg p-4 border border-[var(--surface-border)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--text-strong)]">{job.name}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-sub)] text-[var(--text-muted)]">
                  {cronLabels[job.cronLike] || job.cronLike}
                </span>
                {job.enabled ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-active-bg)] text-[var(--status-active)]">활성</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--status-draft-bg)] text-[var(--status-draft)]">비활성</span>
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">{job.description}</p>
              {job.lastRunAt && (
                <p className="text-[10px] text-[var(--text-disabled)] mt-1">
                  마지막 실행: {new Date(job.lastRunAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                </p>
              )}
            </div>
            <button
              onClick={() => executeJob(job.id)}
              disabled={runningJobId === job.id}
              className="shrink-0 px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
            >
              {runningJobId === job.id ? '실행 중...' : '실행'}
            </button>
          </div>

          {lastResult?.jobId === job.id && (
            <div className={`mt-3 p-2.5 rounded-lg text-xs ${
              lastResult.result.ok
                ? 'bg-[var(--status-active-bg)] text-[var(--status-active)]'
                : 'bg-[var(--status-failed-bg)] text-[var(--status-failed)]'
            }`}>
              {lastResult.result.message.slice(0, 300)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
