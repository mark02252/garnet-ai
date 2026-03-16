import { MetaConnectionPanel } from '@/components/meta-connection-panel';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '데이터 없음';
  return Math.round(value).toLocaleString();
}

function trendLabel(direction: 'UP' | 'DOWN' | 'FLAT' | null | undefined) {
  if (direction === 'UP') return { label: '상승 추세', tone: 'text-emerald-700' };
  if (direction === 'DOWN') return { label: '하락 추세', tone: 'text-rose-700' };
  return { label: '보합 추세', tone: 'text-slate-700' };
}

export default async function SocialPage() {
  const latestReachAnalysis = await prisma.instagramReachAnalysisRun.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  const latestTrend = trendLabel(latestReachAnalysis?.trendDirection);

  return (
    <div className="space-y-6">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Planned Category</p>
        <h1 className="dashboard-title">SNS 인사이트는 현재 개발 예정 카테고리로 보류 중입니다</h1>
        <p className="dashboard-copy">
          현재 계정 권한과 Meta 앱 접근 조건이 정리되지 않아, 이 화면은 정식 운영 메뉴가 아니라 향후 소셜 연동을 확장할 때 다시 여는 준비 공간으로 남겨둡니다. 지금은 저장된 실험 데이터만 참고하고, 메인 업무 흐름은 캠페인 스튜디오·브리핑·캠페인 룸 중심으로 운영하는 것이 더 적합합니다.
        </p>
        <div className="dashboard-chip-grid">
          <div className="dashboard-chip">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">상태</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">개발 예정</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">정식 운영 메뉴에서 제외된 준비 기능</p>
          </div>
          <div className="dashboard-chip">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">최근 실험 추세</p>
            <p className={`mt-2 text-sm font-semibold ${latestTrend.tone}`}>{latestTrend.label}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">기존에 저장된 분석 결과 기준</p>
          </div>
          <div className="dashboard-chip">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">참고 데이터</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{formatNumber(latestReachAnalysis?.latestReach)}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">마지막으로 저장된 도달 값</p>
          </div>
        </div>
      </section>

      <section className="panel space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">보류 사유</h2>
            <p className="mt-1 text-sm text-slate-500">
              Meta 앱 접근 권한과 Instagram 인사이트 권한이 열리기 전까지는 실제 운영자가 이 화면을 쓰기 어렵습니다. 그래서 현재는 연구용 자리만 남기고, 정식 IA에서는 개발 예정 메뉴로만 표시합니다.
            </p>
          </div>
          <span className="pill-option">Hold</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="list-card">
            <p className="text-sm font-semibold text-slate-950">현재 권장 운영</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">캠페인 스튜디오, 브리핑, 캠페인 룸, 보고서 흐름을 중심으로 사용</p>
          </div>
          <div className="list-card">
            <p className="text-sm font-semibold text-slate-950">재개 조건</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Meta 개발자 앱 접근, Redirect URI 등록, 인사이트 권한 확보</p>
          </div>
          <div className="list-card">
            <p className="text-sm font-semibold text-slate-950">현재 활용 범위</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">기존 실험 데이터 조회와 연결 구조 보관</p>
          </div>
        </div>
      </section>

      <MetaConnectionPanel mode="social" />
    </div>
  );
}
