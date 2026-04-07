import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { parseStructuredDeliverable } from '@/lib/deliverable';
import { buildWebIntelligenceSummary } from '@/lib/web-report';
import { PrintButton } from '@/components/print-button';
import { StructuredDeliverableDashboard } from '@/components/structured-deliverable-dashboard';
import { FlowResultDashboard } from '@/components/flow-result-dashboard';

export default async function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const run = await prisma.run.findUnique({
    where: { id },
    include: {
      webSources: { orderBy: { fetchedAt: 'desc' } },
      meetingTurns: { orderBy: { createdAt: 'asc' } },
      deliverable: true,
      memoryLog: true
    }
  });

  if (!run) notFound();

  const structured = parseStructuredDeliverable(run.deliverable?.content);
  const webSummary = buildWebIntelligenceSummary(
    run.webSources.map((src) => ({ title: src.title, snippet: src.snippet, url: src.url }))
  );
  const pmTurn = run.meetingTurns.find((t) => t.role === 'PM');

  const rawContent = run.deliverable?.content;
  let flowOutputs: Record<string, string> | null = null;
  let flowNodeNames: Record<string, string> | undefined;
  try {
    const parsed = rawContent ? JSON.parse(rawContent) : null;
    if (parsed?.rawOutputs && typeof parsed.rawOutputs === 'object') {
      flowOutputs = parsed.rawOutputs;
      flowNodeNames = parsed.nodeNames;
    }
  } catch { /* not flow result */ }

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-5 print:max-w-none print:space-y-3">
      <div className="no-print flex items-center justify-between gap-3">
        <Link href={`/runs/${id}`} className="button-secondary">
          실행 상세로 돌아가기
        </Link>
        <PrintButton suggestedName={`run-${id}-report.pdf`} />
      </div>

      {flowOutputs ? (
        <FlowResultDashboard
          topic={run.topic}
          brand={run.brand}
          region={run.region}
          goal={run.goal}
          formattedDate={run.createdAt.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          rawOutputs={flowOutputs}
          nodeNames={flowNodeNames}
        />
      ) : (
        <StructuredDeliverableDashboard
          topic={run.topic}
          brand={run.brand}
          region={run.region}
          goal={run.goal}
          createdAt={run.createdAt}
          structured={structured}
          webSummary={webSummary}
          pmDecision={pmTurn?.content}
          rawContent={run.deliverable?.content}
        />
      )}
    </div>
  );
}
