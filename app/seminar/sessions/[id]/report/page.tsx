import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import { PrintButton } from '@/components/print-button';
import { SeminarReportDashboard } from '@/components/seminar-report-dashboard';
import { ensureSeminarFinalReport } from '@/lib/seminar-scheduler';
import { getSeminarSessionDetail } from '@/lib/seminar-storage';

async function loadSessionReport(sessionId: string) {
  const detail = await getSeminarSessionDetail(sessionId);
  if (!detail) return null;

  if (
    (detail.session.status === 'COMPLETED' || detail.session.status === 'STOPPED') &&
    (!detail.finalReport || !detail.finalReport.structured)
  ) {
    await ensureSeminarFinalReport(sessionId);
    return getSeminarSessionDetail(sessionId);
  }

  return detail;
}

export default async function SeminarSessionReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadSessionReport(id);
  if (!detail) notFound();

  const { session, rounds, finalReport } = detail;
  const reportText = finalReport?.content || '세션이 완료되면 통합 보고서가 생성됩니다.';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <section className="dashboard-hero">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="dashboard-eyebrow">Session Report</p>
            <h1 className="brand-title mt-3 text-[1.9rem] text-slate-950">{session.title || session.topic}</h1>
            <p className="mt-2 text-sm text-slate-500">
              상태: {session.status} | 라운드: {session.completedRounds}/{session.maxRounds} | 간격: {session.intervalMinutes}분
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="button-secondary" href="/seminar">
              세미나로 돌아가기
            </Link>
            <PrintButton suggestedName={`seminar-${id}-report.pdf`} />
            {finalReport?.content && <CopyButton text={finalReport.content} />}
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">라운드 바로가기</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {rounds
            .slice()
            .sort((a, b) => b.roundNumber - a.roundNumber)
            .map((round) => (
              <div key={round.id} className="list-card text-xs">
                <p className="font-semibold text-slate-950">Round {round.roundNumber}</p>
                <p className="text-slate-500">{round.status}</p>
                {round.runId && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Link className="text-sky-700 underline" href={`/runs/${round.runId}`}>
                      실행 결과
                    </Link>
                    <Link className="text-sky-700 underline" href={`/runs/${round.runId}/report`}>
                      산출물 보고서
                    </Link>
                  </div>
                )}
              </div>
            ))}
          {rounds.length === 0 && <p className="text-sm text-slate-500">표시할 라운드가 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">세션 통합 최종 보고서</h2>
        <div className="mt-3">
          <SeminarReportDashboard reportText={reportText} structured={finalReport?.structured} />
        </div>
      </section>
    </div>
  );
}
