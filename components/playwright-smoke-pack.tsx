'use client';

import { useMemo, useState } from 'react';
import {
  canInspectMcpConnection,
  describeMcpConnectionReadiness,
  type McpConnectionDraft
} from '@/lib/mcp-connections';
import {
  PLAYWRIGHT_SMOKE_SCENARIOS,
  buildPlaywrightScenarioUrl,
  normalizePlaywrightBaseUrl
} from '@/lib/playwright-smoke';

type PlaywrightSmokeResult = {
  ok: boolean;
  passed?: boolean;
  fetchedAt?: string;
  durationMs?: number;
  targetUrl?: string;
  expectedText?: string[];
  snapshotExcerpt?: string;
  error?: string;
  scenario?: {
    id: string;
    title: string;
    description: string;
    path: string;
  };
  steps?: Array<{
    id: string;
    title: string;
    ok: boolean;
    summary: string;
  }>;
};

type PlaywrightSmokePackProps = {
  connection: McpConnectionDraft | null;
};

function formatDate(value?: string) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

export function PlaywrightSmokePack({ connection }: PlaywrightSmokePackProps) {
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:3000');
  const [runningId, setRunningId] = useState('');
  const [runningAll, setRunningAll] = useState(false);
  const [results, setResults] = useState<Record<string, PlaywrightSmokeResult>>({});
  const readiness = connection ? describeMcpConnectionReadiness(connection) : null;
  const canRun = Boolean(connection && canInspectMcpConnection(connection));
  const normalizedBaseUrl = useMemo(() => {
    try {
      return normalizePlaywrightBaseUrl(baseUrl);
    } catch {
      return baseUrl;
    }
  }, [baseUrl]);

  async function runScenario(scenarioId: string) {
    if (!connection) return;

    setRunningId(scenarioId);
    try {
      const res = await fetch('/api/mcp/playwright/smoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection,
          scenarioId,
          baseUrl: normalizedBaseUrl
        })
      });
      const data = (await res.json()) as PlaywrightSmokeResult;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Playwright 점검에 실패했습니다.');
      }

      setResults((prev) => ({
        ...prev,
        [scenarioId]: data
      }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [scenarioId]: {
          ok: false,
          passed: false,
          error: error instanceof Error ? error.message : 'Playwright 점검에 실패했습니다.'
        }
      }));
    } finally {
      setRunningId('');
    }
  }

  async function runAllScenarios() {
    if (!canRun) return;
    setRunningAll(true);

    try {
      for (const scenario of PLAYWRIGHT_SMOKE_SCENARIOS) {
        // Keep the checks sequential so the browser session stays easy to follow.
        // eslint-disable-next-line no-await-in-loop
        await runScenario(scenario.id);
      }
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <section className="panel space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">QA Automation</p>
          <h3 className="mt-2 text-[1.25rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">Playwright 자동 점검</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            비개발자도 버튼만 눌러서 주요 화면이 정상적으로 열리는지 확인할 수 있는 빠른 점검 패널입니다. 현재는 홈, 설정, 데이터,
            세미나 4개 흐름을 먼저 검증합니다.
          </p>
        </div>
        <button type="button" className="button-primary" onClick={() => void runAllScenarios()} disabled={!canRun || runningAll || Boolean(runningId)}>
          {runningAll ? '전체 점검 실행 중...' : '핵심 흐름 전체 점검'}
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="soft-panel space-y-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text-strong)]">점검 대상 주소</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
              개발 중에는 보통 `http://127.0.0.1:3000` 을 그대로 두면 됩니다. 필요하면 다른 포트나 프리뷰 주소로 바꿔서 점검할 수
              있습니다.
            </p>
          </div>
          <label className="space-y-2 text-sm text-[var(--text-base)]">
            <span>Base URL</span>
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="http://127.0.0.1:3000"
              className="input w-full"
            />
          </label>
          <div className="soft-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">현재 연결</p>
            <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{connection?.name || 'Playwright MCP 연결 없음'}</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
              {connection
                ? readiness?.detail || connection.description
                : '먼저 MCP 연결 허브에서 Playwright MCP를 켜고 저장해 주세요.'}
            </p>
            {connection && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[var(--surface-sub)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-base)]">
                  {connection.transport}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    canRun ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {canRun ? '즉시 점검 가능' : readiness?.label || '설정 필요'}
                </span>
              </div>
            )}
          </div>

          {!canRun && (
            <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-800">
              연결 허브에서 `Playwright MCP`를 활성화하고 저장하면 바로 사용할 수 있습니다. 브라우저가 아직 설치되지 않았다면 첫 실행에서
              자동 설치를 시도하고, 필요하면 `npx playwright install chromium` 으로 미리 준비해도 됩니다.
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {PLAYWRIGHT_SMOKE_SCENARIOS.map((scenario) => {
            const result = results[scenario.id];
            const running = runningId === scenario.id;
            const previewUrl = (() => {
              try {
                return buildPlaywrightScenarioUrl(normalizedBaseUrl, scenario.path);
              } catch {
                return 'Base URL 형식을 확인해 주세요.';
              }
            })();
            const passed = result?.passed;

            return (
              <div key={scenario.id} className="soft-panel space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{scenario.path}</p>
                    <h4 className="mt-2 text-lg font-semibold text-[var(--text-strong)]">{scenario.title}</h4>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{scenario.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        result
                          ? passed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                          : 'bg-[var(--surface-sub)] text-[var(--text-muted)]'
                      }`}
                    >
                      {result ? (passed ? '통과' : '확인 필요') : '미실행'}
                    </span>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void runScenario(scenario.id)}
                      disabled={!canRun || runningAll || Boolean(runningId)}
                    >
                      {running ? '점검 중...' : '이 화면 점검'}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">확인 기준</p>
                    <p className="mt-2 text-sm text-[var(--text-strong)]">{previewUrl}</p>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">기대 문구: {scenario.expectedText.join(' / ')}</p>
                    {result?.fetchedAt && (
                      <p className="mt-3 text-xs text-[var(--text-muted)]">
                        최근 점검: {formatDate(result.fetchedAt)}
                        {result.durationMs ? ` · ${result.durationMs}ms` : ''}
                      </p>
                    )}
                    {result?.error && <p className="mt-3 text-sm text-rose-700">{result.error}</p>}
                  </div>

                  <div className="soft-panel">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">점검 메모</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-base)]">
                      {result?.snapshotExcerpt ||
                        '아직 점검 결과가 없습니다. 버튼을 누르면 Playwright가 실제 화면을 열고 주요 문구가 보이는지 자동으로 검사합니다.'}
                    </p>
                    {result?.steps?.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {result.steps.map((step) => (
                          <span
                            key={step.id}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              step.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}
                            title={step.summary}
                          >
                            {step.title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
