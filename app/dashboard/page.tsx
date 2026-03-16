import Link from 'next/link';
import { prisma } from '@/lib/prisma';

function safeParse(raw: string) {
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(value);
}

function statusTone(status: 'DRAFT' | 'CONFIRMED' | 'ARCHIVED') {
  if (status === 'CONFIRMED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'ARCHIVED') return 'bg-[var(--surface-sub)] text-[var(--text-base)]';
  return 'bg-amber-100 text-amber-700';
}

export default async function DashboardPage() {
  const [archives, confirmedCount, draftCount, recent] = await Promise.all([
    prisma.learningArchive.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { run: { select: { id: true, topic: true, createdAt: true } } }
    }),
    prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }),
    prisma.learningArchive.count({ where: { status: 'DRAFT' } }),
    prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 8,
      include: { run: { select: { id: true, topic: true, createdAt: true } } }
    })
  ]);

  const total = archives.length;
  const archivedCount = Math.max(0, total - confirmedCount - draftCount);
  const linkedRunCount = archives.filter((item) => item.runId).length;
  const reusablePct = total > 0 ? Math.round((confirmedCount / total) * 100) : 0;

  const tagMap = new Map<string, number>();
  const sourceTypeMap = new Map<string, number>();
  for (const item of archives) {
    for (const tag of safeParse(item.tags)) {
      tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
    }
    sourceTypeMap.set(item.sourceType, (sourceTypeMap.get(item.sourceType) || 0) + 1);
  }

  const topTags = [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sourceMix = [...sourceTypeMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const featuredTemplates = archives.filter((item) => item.status === 'CONFIRMED').slice(0, 4);
  const latestRunLinked = archives.filter((item) => item.run).slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Learning Dashboard</p>
        <h1 className="dashboard-title">플레이북 운영 대시보드</h1>
        <p className="dashboard-copy">
          어떤 실행 패턴이 재사용 가능한 플레이북으로 축적되고 있는지, 지금 검토가 필요한 카드가 무엇인지, 최근 어떤 실행이 자산으로 연결됐는지 한 화면에서 파악합니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/learning" className="button-primary">
            학습 아카이브 열기
          </Link>
          <Link href="/history" className="button-secondary">
            실행 아카이브 보기
          </Link>
        </div>
        <div className="dashboard-chip-grid">
          <div className="dashboard-chip">
            <strong>재사용 가능 비율</strong>
            <br />
            {reusablePct}%
          </div>
          <div className="dashboard-chip">
            <strong>실행 연결 카드</strong>
            <br />
            {linkedRunCount}개
          </div>
          <div className="dashboard-chip">
            <strong>최근 검토 대기</strong>
            <br />
            {draftCount}개
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">누적 학습 카드</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{total}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 저장된 전체 학습 패턴</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">검증 완료</p>
          <p className="mt-2 text-base font-semibold text-emerald-700">{confirmedCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">바로 재사용할 수 있는 카드</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">검토 필요</p>
          <p className="mt-2 text-base font-semibold text-amber-700">{draftCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">사람 검토가 필요한 카드</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">보관됨</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{archivedCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">현재 운영에서 제외된 카드</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.26fr)_340px]">
        <div className="space-y-5">
          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Tag Signals</p>
                <h2 className="section-title">상위 학습 태그</h2>
              </div>
              <span className="accent-pill">{topTags.length} tags</span>
            </div>
            {topTags.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-base)]">아직 축적된 태그가 없습니다.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {topTags.map(([tag, count]) => (
                  <div key={tag} className="soft-panel">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                      <span>#{tag}</span>
                      <span>{count}회</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-border)]">
                      <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(10, Math.min(100, count * 12))}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
            <div className="panel space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recent Updates</p>
                  <h2 className="section-title">최근 업데이트된 학습 카드</h2>
                </div>
                <span className="pill-option">{recent.length}개</span>
              </div>
              {recent.length === 0 ? (
                <div className="soft-panel text-sm text-[var(--text-base)]">학습 카드가 없습니다.</div>
              ) : (
                <div className="grid gap-3">
                  {recent.map((item) => (
                    <Link key={item.id} href="/learning" className="list-card block">
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-[var(--text-strong)]">{item.situation}</p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>{item.status}</span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {item.run?.topic || item.sourceType} · {formatDate(item.updatedAt)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="panel space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Source Mix</p>
                  <h2 className="section-title">학습 유입 경로</h2>
                </div>
                <span className="pill-option">{sourceMix.length}개 유형</span>
              </div>
              {sourceMix.length === 0 ? (
                <div className="soft-panel text-sm text-[var(--text-base)]">아직 집계된 유입 경로가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {sourceMix.map(([sourceType, count]) => (
                    <div key={sourceType} className="soft-panel">
                      <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                        <span>{sourceType}</span>
                        <span>{count}개</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--surface-border)]">
                        <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(10, Math.min(100, count * 10))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Reusable Templates</p>
                <h2 className="section-title">바로 재사용할 응답 템플릿</h2>
              </div>
              <Link href="/learning" className="button-secondary">
                전체 카드 보기
              </Link>
            </div>
            {featuredTemplates.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-base)]">먼저 확정된 학습 카드를 만들어 주세요.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {featuredTemplates.map((item) => (
                  <article key={item.id} className="list-card">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Template</p>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(item.status)}`}>{item.status}</span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.situation}</p>
                    <pre className="mt-3 line-clamp-5 whitespace-pre-wrap text-xs leading-6 text-[var(--text-base)]">{item.recommendedResponse}</pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Ops Rail</p>
              <h2 className="section-title">운영 상태 요약</h2>
            </div>
            <div className="grid gap-3">
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">재사용률</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{reusablePct}%</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">확정 카드 비율 기준</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">실행 연결도</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{linkedRunCount}개</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">원본 실행과 연결된 카드 수</p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">검토 대기</p>
                <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{draftCount}개</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">사람 검토가 필요한 카드</p>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Run Linked Cards</p>
              <h2 className="section-title">최근 실행 연결</h2>
            </div>
            {latestRunLinked.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-base)]">실행과 연결된 카드가 아직 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {latestRunLinked.map((item) => (
                  <article key={item.id} className="list-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Linked Run</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.run?.topic || item.situation}</p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">{item.run ? formatDate(item.run.createdAt) : item.sourceType}</p>
                    {item.run?.id && (
                      <Link href={`/runs/${item.run.id}`} className="mt-3 inline-flex text-xs font-medium text-[var(--accent)] underline">
                        실행 상세 보기
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Next Action</p>
              <h2 className="section-title">운영 권장 흐름</h2>
            </div>
            <div className="grid gap-3">
              <div className="soft-panel">
                <p className="text-sm leading-6 text-[var(--text-base)]">`CONFIRMED`가 많은 태그 묶음은 별도 플레이북으로 묶어두면 세미나와 캠페인 스튜디오에서 바로 재사용하기 좋습니다.</p>
              </div>
              <div className="soft-panel">
                <p className="text-sm leading-6 text-[var(--text-base)]">최근 실행 연결 카드가 늘어나면, 어떤 실험이 학습으로 전환되는지 추적하기 쉬워집니다.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
