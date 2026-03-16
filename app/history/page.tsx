'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type HistoryItem = {
  id: string;
  topic: string;
  brand?: string | null;
  region?: string | null;
  goal?: string | null;
  createdAt: string;
  tags: string[];
};

function formatDate(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  } catch {
    return value;
  }
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    if (dateFrom) params.set('dateFrom', dateFrom);

    setLoading(true);
    fetch(`/api/runs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setItems(data))
      .finally(() => setLoading(false));
  }, [q, tag, dateFrom]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return sort === 'desc' ? right - left : left - right;
    });
  }, [items, sort]);

  const stats = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const uniqueTags = new Set<string>();
    const uniqueBrands = new Set<string>();

    for (const item of items) {
      for (const tagItem of item.tags) uniqueTags.add(tagItem);
      if (item.brand) uniqueBrands.add(item.brand);
    }

    const recentCount = items.filter((item) => new Date(item.createdAt).getTime() >= sevenDaysAgo).length;
    const taggedCount = items.filter((item) => item.tags.length > 0).length;

    return {
      total: items.length,
      recentCount,
      taggedCount,
      uniqueTagCount: uniqueTags.size,
      uniqueBrandCount: uniqueBrands.size
    };
  }, [items]);

  const topTags = useMemo(() => {
    const tagMap = new Map<string, number>();
    for (const item of items) {
      for (const tagItem of item.tags) {
        tagMap.set(tagItem, (tagMap.get(tagItem) || 0) + 1);
      }
    }
    return [...tagMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const featured = sorted[0] || null;

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <p className="dashboard-eyebrow">Execution Archive</p>
        <h1 className="dashboard-title">실행 아카이브</h1>
        <p className="dashboard-copy">
          브리프, 태그, 날짜 기준으로 과거 전략 실행과 산출물을 빠르게 탐색하고, 어떤 유형의 실행이 반복되는지 한눈에 파악할 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/" className="button-primary">
            캠페인 스튜디오 열기
          </Link>
          <Link href="/dashboard" className="button-secondary">
            학습 대시보드 보기
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">누적 실행</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{stats.total}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">아카이브에 저장된 전체 회의 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">최근 7일</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{stats.recentCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">최근 집중적으로 실행한 캠페인 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">태그 연결</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{stats.uniqueTagCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">누적 태그 종류 수</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">브랜드 커버리지</p>
          <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{stats.uniqueBrandCount}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">실행 이력이 있는 브랜드 수</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.28fr)_340px]">
        <div className="space-y-5">
          <section className="panel space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Search Console</p>
                <h2 className="section-title">아카이브 탐색</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">키워드, 태그, 시작 날짜로 범위를 좁히고 정렬 방식으로 흐름을 빠르게 바꿀 수 있습니다.</p>
              </div>
              <span className="accent-pill">{sorted.length} results</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="soft-panel">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">키워드</label>
                <input placeholder="브리프 또는 목표 검색" value={q} onChange={(e) => setQ(e.target.value)} className="input" />
              </div>
              <div className="soft-panel">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">태그</label>
                <input placeholder="예: 리텐션, 공연장" value={tag} onChange={(e) => setTag(e.target.value)} className="input" />
              </div>
              <div className="soft-panel">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">시작 날짜</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input" />
              </div>
              <div className="soft-panel">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">정렬</label>
                <select value={sort} onChange={(e) => setSort(e.target.value as 'desc' | 'asc')} className="input">
                  <option value="desc">최신순</option>
                  <option value="asc">오래된순</option>
                </select>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Run Library</p>
                <h2 className="section-title">저장된 실행 목록</h2>
              </div>
              <span className="pill-option">{loading ? 'loading' : `${sorted.length}건`}</span>
            </div>
            {loading && <div className="soft-panel text-sm text-[var(--text-base)]">실행 기록을 불러오는 중입니다.</div>}
            {!loading && sorted.length === 0 && <div className="soft-panel text-sm text-[var(--text-base)]">검색된 실행 기록이 없습니다.</div>}
            <div className="grid gap-3">
              {sorted.map((item) => (
                <article key={item.id} className="list-card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold leading-6 text-[var(--text-strong)]">{item.topic}</p>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {formatDate(item.createdAt)} · {item.brand || '브랜드 미입력'} · {item.region || '지역 미입력'}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{item.goal || '목표 미입력'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/runs/${item.id}`} className="button-secondary px-3 py-2 text-xs">
                        상세 보기
                      </Link>
                      <Link href={`/runs/${item.id}/report`} className="button-secondary px-3 py-2 text-xs">
                        보고서
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(item.tags.length ? item.tags : ['태그 없음']).slice(0, 8).map((tagItem) => (
                      <span key={`${item.id}-${tagItem}`} className="pill-option">
                        {tagItem}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Archive Signals</p>
              <h2 className="section-title">반복 태그</h2>
            </div>
            {topTags.length === 0 ? (
              <div className="soft-panel text-sm text-[var(--text-base)]">아직 축적된 태그가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {topTags.map(([tagItem, count]) => (
                  <div key={tagItem} className="soft-panel">
                    <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-base)]">
                      <span>#{tagItem}</span>
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

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Featured Run</p>
              <h2 className="section-title">최근 실행 스냅샷</h2>
            </div>
            {featured ? (
              <div className="space-y-3">
                <div className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Topic</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-strong)]">{featured.topic}</p>
                </div>
                <div className="grid gap-3">
                  <div className="list-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">브랜드 / 지역</p>
                    <p className="mt-2 text-sm text-[var(--text-base)]">{featured.brand || '브랜드 미입력'}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{featured.region || '지역 미입력'}</p>
                  </div>
                  <div className="list-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">목표</p>
                    <p className="mt-2 text-sm text-[var(--text-base)]">{featured.goal || '목표 미입력'}</p>
                  </div>
                </div>
                <Link href={`/runs/${featured.id}`} className="button-primary w-full text-center">
                  최근 실행 열기
                </Link>
              </div>
            ) : (
              <div className="soft-panel text-sm text-[var(--text-base)]">실행 데이터가 쌓이면 최근 전략 회의 스냅샷이 여기에 표시됩니다.</div>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Guide</p>
              <h2 className="section-title">활용 팁</h2>
            </div>
            <div className="grid gap-3">
              <div className="soft-panel">
                <p className="text-sm leading-6 text-[var(--text-base)]">반복적으로 성과가 좋았던 실행은 태그를 통일해서 나중에 검색하기 쉽게 관리하는 편이 좋습니다.</p>
              </div>
              <div className="soft-panel">
                <p className="text-sm leading-6 text-[var(--text-base)]">실행 상세와 보고서를 같이 보면서, 어떤 의사결정이 실제 산출물로 이어졌는지 비교하면 재사용성이 올라갑니다.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
