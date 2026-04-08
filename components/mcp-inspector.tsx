'use client';

import { useEffect, useState } from 'react';
import { canInspectMcpConnection, type McpConnectionDraft } from '@/lib/mcp-connections';

type McpInspectResponse = {
  ok: boolean;
  fetchedAt?: string;
  durationMs?: number;
  stderr?: string[];
  instructions?: string;
  server?: { name?: string; version?: string };
  tools?: Array<{
    name: string;
    title?: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  resources?: Array<{
    uri: string;
    name: string;
    title?: string;
    description?: string;
    mimeType?: string;
  }>;
  prompts?: Array<{
    name: string;
    title?: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  }>;
  error?: string;
};

type OverviewPayload = {
  generatedAt?: string;
  counts?: {
    runs?: number;
    datasets?: number;
    learningCards?: number;
    confirmedLearningCards?: number;
  };
  latestRun?: {
    id?: string;
    topic?: string;
    createdAt?: string;
  } | null;
  latestDataset?: {
    id?: string;
    name?: string;
    updatedAt?: string;
  } | null;
  latestInstagramAnalysis?: {
    id?: string;
    trendDirection?: string;
    latestReach?: number;
    summary?: string;
    createdAt?: string;
  } | null;
};

type TraceItem = {
  id: string;
  title: string;
  status: 'success' | 'error';
  createdAt: string;
  summary: string;
};

type ShowcaseCard = {
  eyebrow: string;
  title: string;
  detail: string;
  meta?: string;
};

type ShowcaseView = {
  title: string;
  subtitle: string;
  cards: ShowcaseCard[];
  raw?: string;
};

const DEFAULT_TOOL_ARGS: Record<string, string> = {
  list_runs: '{\n  "limit": 5\n}',
  get_run_detail: '{\n  "runId": ""\n}',
  list_datasets: '{\n  "limit": 5\n}',
  get_dataset_detail: '{\n  "datasetId": ""\n}',
  list_learning_cards: '{\n  "limit": 5,\n  "status": "CONFIRMED"\n}',
  get_instagram_reach_summary: '{}'
};

const DEFAULT_PROMPT_ARGS: Record<string, string> = {
  'run-retrospective': '{\n  "runId": ""\n}',
  'dataset-insight-brief': '{\n  "datasetId": "",\n  "businessGoal": "전환 개선"\n}',
  'learning-card-pack': '{\n  "status": "CONFIRMED"\n}'
};

function stringifyPretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJsonInput(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function clipText(value: unknown, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function parseOverviewFromResponse(payload: unknown): OverviewPayload | null {
  const response = payload as {
    result?: {
      contents?: Array<{ text?: string }>;
    };
  };
  const raw = response?.result?.contents?.[0]?.text;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as OverviewPayload;
  } catch {
    return null;
  }
}

function isInternalAimdConnection(connection?: McpConnectionDraft | null) {
  return !connection || connection.id === 'aimd-local';
}

export function McpInspector({ connection }: { connection: McpConnectionDraft | null }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [inspect, setInspect] = useState<McpInspectResponse | null>(null);
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseView | null>(null);
  const [selectedTool, setSelectedTool] = useState('');
  const [toolArgs, setToolArgs] = useState('{}');
  const [selectedResource, setSelectedResource] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [promptArgs, setPromptArgs] = useState('{}');
  const [toolLoading, setToolLoading] = useState(false);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [toolResult, setToolResult] = useState('');
  const [resourceResult, setResourceResult] = useState('');
  const [promptResult, setPromptResult] = useState('');
  const [traces, setTraces] = useState<TraceItem[]>([]);
  const internalShowcaseAvailable = isInternalAimdConnection(connection);
  const connectionSignature = JSON.stringify(connection || null);

  function pushTrace(item: Omit<TraceItem, 'id'>) {
    const next: TraceItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...item
    };
    setTraces((prev) => [next, ...prev].slice(0, 8));
  }

  async function loadOverview() {
    const res = await fetch('/api/mcp/resource', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: 'aimd://overview', connection: connection || undefined })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || '연결 요약을 불러오지 못했습니다.');
    }

    const parsedOverview = parseOverviewFromResponse(data);
    setOverview(parsedOverview);

    if (parsedOverview) {
      setShowcase({
        title: '현재 연결 요약',
        subtitle: '앱 안에 쌓인 핵심 자산을 한눈에 확인할 수 있습니다.',
        cards: [
          {
            eyebrow: '최근 실행',
            title: parsedOverview.latestRun?.topic || '최근 실행이 없습니다',
            detail: parsedOverview.latestRun?.createdAt ? formatDate(parsedOverview.latestRun.createdAt) : '실행 데이터가 아직 없습니다.'
          },
          {
            eyebrow: '최근 데이터셋',
            title: parsedOverview.latestDataset?.name || '최근 데이터셋이 없습니다',
            detail: parsedOverview.latestDataset?.updatedAt ? formatDate(parsedOverview.latestDataset.updatedAt) : '데이터셋이 아직 없습니다.'
          },
          {
            eyebrow: '인스타그램 성과',
            title: parsedOverview.latestInstagramAnalysis?.trendDirection || '성과 데이터 없음',
            detail:
              parsedOverview.latestInstagramAnalysis?.summary ||
              '인스타그램 도달 분석이 준비되면 이곳에서 바로 확인할 수 있습니다.'
          }
        ]
      });
    }
  }

  async function refreshInspect() {
    setError('');
    setRefreshing(true);
    try {
      const res = await fetch('/api/mcp/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ connection: connection || undefined })
      });
      const data = (await res.json()) as McpInspectResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'AI 연결 상태를 불러오지 못했습니다.');
      }

      setInspect(data);

      const nextTool = data.tools?.some((tool) => tool.name === selectedTool) ? selectedTool : (data.tools?.[0]?.name ?? '');
      setSelectedTool(nextTool);
      setToolArgs(DEFAULT_TOOL_ARGS[nextTool] || '{}');

      const nextResource = data.resources?.some((resource) => resource.uri === selectedResource) ? selectedResource : (data.resources?.[0]?.uri ?? '');
      setSelectedResource(nextResource);

      const nextPrompt = data.prompts?.some((prompt) => prompt.name === selectedPrompt) ? selectedPrompt : (data.prompts?.[0]?.name ?? '');
      setSelectedPrompt(nextPrompt);
      setPromptArgs(DEFAULT_PROMPT_ARGS[nextPrompt] || '{}');

      if (internalShowcaseAvailable) {
        await loadOverview();
      } else {
        setOverview(null);
        setShowcase({
          title: `${connection?.name || '외부 연결'} 점검 결과`,
          subtitle: '외부 MCP 연결은 먼저 도구/리소스/프롬프트가 정상적으로 보이는지 확인한 뒤, 각 화면에 순차적으로 붙이는 방식으로 확장합니다.',
          cards: [
            {
              eyebrow: '도구',
              title: `${data.tools?.length || 0}개`,
              detail: '서버가 제공하는 실행 가능한 도구 수'
            },
            {
              eyebrow: '리소스',
              title: `${data.resources?.length || 0}개`,
              detail: '읽을 수 있는 컨텍스트 리소스 수'
            },
            {
              eyebrow: '프롬프트',
              title: `${data.prompts?.length || 0}개`,
              detail: '재사용 가능한 프롬프트 템플릿 수'
            }
          ],
          raw: stringifyPretty(data)
        });
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'AI 연결 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (connection && !canInspectMcpConnection(connection)) {
      setInspect(null);
      setOverview(null);
      setShowcase({
        title: `${connection.name} 연결 준비 필요`,
        subtitle: '이 연결은 아직 점검 가능한 상태가 아닙니다. 연결 허브에서 endpoint, 명령, 또는 인증 정보를 먼저 입력해 주세요.',
        cards: [],
        raw: connection.setupHint || connection.note || ''
      });
      setError('');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    void refreshInspect();
  }, [connectionSignature]);

  async function loadRunsShowcase() {
    setToolLoading(true);
    try {
      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'list_runs',
          arguments: { limit: 6 },
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '최근 실행을 불러오지 못했습니다.');
      }

      const runs = ((data.result?.structuredContent as { runs?: Array<Record<string, unknown>> } | undefined)?.runs || []).map((run) => ({
        eyebrow: '전략 회의',
        title: clipText(run.topic, 52),
        detail: [clipText(run.brand, 24), clipText(run.region, 18)].filter(Boolean).join(' · ') || '브랜드/지역 정보 없음',
        meta: `${formatDate(String(run.createdAt || ''))} · 소스 ${run.sourceCount || 0}개`
      }));

      setShowcase({
        title: '최근 전략 회의',
        subtitle: '가장 최근에 실행된 회의 기록을 빠르게 살펴볼 수 있습니다.',
        cards: runs,
        raw: stringifyPretty(data)
      });

      pushTrace({
        title: '최근 전략 회의 불러오기',
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: `${runs.length}개의 실행 기록을 불러왔습니다.`
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : '최근 실행을 불러오지 못했습니다.';
      pushTrace({
        title: '최근 전략 회의 불러오기',
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
      setShowcase({
        title: '최근 전략 회의',
        subtitle: '데이터를 불러오는 중 문제가 발생했습니다.',
        cards: [],
        raw: message
      });
    } finally {
      setToolLoading(false);
    }
  }

  async function loadDatasetsShowcase() {
    setToolLoading(true);
    try {
      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'list_datasets',
          arguments: { limit: 6 },
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '데이터셋 현황을 불러오지 못했습니다.');
      }

      const datasets =
        ((data.result?.structuredContent as { datasets?: Array<Record<string, unknown>> } | undefined)?.datasets || []).map((dataset) => ({
          eyebrow: `데이터셋 · ${dataset.type || 'UNKNOWN'}`,
          title: clipText(dataset.name, 48),
          detail: clipText(dataset.notes || dataset.rawDataPreview || '설명 없음', 110),
          meta: dataset.hasAnalysis ? 'AI 분석 있음' : 'AI 분석 전'
        }));

      setShowcase({
        title: '데이터셋 현황',
        subtitle: '업로드된 자료와 분석 준비 상태를 확인할 수 있습니다.',
        cards: datasets,
        raw: stringifyPretty(data)
      });

      pushTrace({
        title: '데이터셋 현황 불러오기',
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: `${datasets.length}개의 데이터셋을 불러왔습니다.`
      });
    } catch (datasetError) {
      const message = datasetError instanceof Error ? datasetError.message : '데이터셋 현황을 불러오지 못했습니다.';
      pushTrace({
        title: '데이터셋 현황 불러오기',
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
      setShowcase({
        title: '데이터셋 현황',
        subtitle: '데이터를 불러오는 중 문제가 발생했습니다.',
        cards: [],
        raw: message
      });
    } finally {
      setToolLoading(false);
    }
  }

  async function loadLearningShowcase() {
    setToolLoading(true);
    try {
      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'list_learning_cards',
          arguments: { limit: 6, status: 'CONFIRMED' },
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '검증된 학습 카드를 불러오지 못했습니다.');
      }

      const cards = ((data.result?.structuredContent as { cards?: Array<Record<string, unknown>> } | undefined)?.cards || []).map((card) => ({
        eyebrow: '검증된 응답 패턴',
        title: clipText(card.situation, 64),
        detail: clipText(card.recommendedResponse, 130),
        meta: Array.isArray(card.tags) && card.tags.length > 0 ? `태그: ${card.tags.join(', ')}` : '태그 없음'
      }));

      setShowcase({
        title: '검증된 응답 패턴',
        subtitle: '재사용하기 좋은 대응 사례를 한 번에 훑어볼 수 있습니다.',
        cards,
        raw: stringifyPretty(data)
      });

      pushTrace({
        title: '검증된 응답 패턴 불러오기',
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: `${cards.length}개의 학습 카드를 불러왔습니다.`
      });
    } catch (learningError) {
      const message = learningError instanceof Error ? learningError.message : '검증된 학습 카드를 불러오지 못했습니다.';
      pushTrace({
        title: '검증된 응답 패턴 불러오기',
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
      setShowcase({
        title: '검증된 응답 패턴',
        subtitle: '데이터를 불러오는 중 문제가 발생했습니다.',
        cards: [],
        raw: message
      });
    } finally {
      setToolLoading(false);
    }
  }

  async function loadInstagramShowcase() {
    setToolLoading(true);
    try {
      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'get_instagram_reach_summary',
          arguments: {},
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '인스타그램 성과를 불러오지 못했습니다.');
      }

      const structured = (data.result?.structuredContent as { latestAnalysis?: Record<string, unknown> | null; recentDaily?: Array<Record<string, unknown>> } | undefined) || {};
      const latest = structured.latestAnalysis;
      const recentDaily = structured.recentDaily || [];

      const cards: ShowcaseCard[] = [];
      if (latest) {
        cards.push({
          eyebrow: '최근 성과 분석',
          title: `${latest.trendDirection || 'FLAT'} · 도달 ${latest.latestReach || 0}`,
          detail: clipText(latest.summary, 140),
          meta: latest.createdAt ? formatDate(String(latest.createdAt)) : ''
        });
      }
      recentDaily.slice(0, 4).forEach((item) => {
        cards.push({
          eyebrow: '일별 도달',
          title: `${item.reach || 0} reach`,
          detail: item.metricDate ? formatDate(String(item.metricDate)) : '날짜 없음',
          meta: item.fetchedAt ? `수집 ${formatDate(String(item.fetchedAt))}` : ''
        });
      });

      setShowcase({
        title: '인스타그램 성과 요약',
        subtitle: '최근 수집된 도달 데이터와 트렌드 분석을 빠르게 확인할 수 있습니다.',
        cards,
        raw: stringifyPretty(data)
      });

      pushTrace({
        title: '인스타그램 성과 요약 불러오기',
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: '최신 성과 분석과 최근 일별 데이터를 불러왔습니다.'
      });
    } catch (instagramError) {
      const message = instagramError instanceof Error ? instagramError.message : '인스타그램 성과를 불러오지 못했습니다.';
      pushTrace({
        title: '인스타그램 성과 요약 불러오기',
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
      setShowcase({
        title: '인스타그램 성과 요약',
        subtitle: '데이터를 불러오는 중 문제가 발생했습니다.',
        cards: [],
        raw: message
      });
    } finally {
      setToolLoading(false);
    }
  }

  async function runTool() {
    setToolLoading(true);
    setToolResult('');
    try {
      const parsedArgs = parseJsonInput(toolArgs);
      const res = await fetch('/api/mcp/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedTool,
          arguments: parsedArgs,
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'MCP 도구 실행 실패');
      }
      const pretty = stringifyPretty(data);
      setToolResult(pretty);
      pushTrace({
        title: `${selectedTool} 실행`,
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: '고급 실행 결과를 확인했습니다.'
      });
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : 'MCP 도구 실행 실패';
      setToolResult(message);
      pushTrace({
        title: `${selectedTool} 실행`,
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
    } finally {
      setToolLoading(false);
    }
  }

  async function readResource() {
    setResourceLoading(true);
    setResourceResult('');
    try {
      const res = await fetch('/api/mcp/resource', {
        method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: selectedResource, connection: connection || undefined })
    });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '리소스를 불러오지 못했습니다.');
      }
      const pretty = stringifyPretty(data);
      setResourceResult(pretty);
      pushTrace({
        title: `${selectedResource} 읽기`,
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: '고급 리소스 조회 결과를 확인했습니다.'
      });
    } catch (readError) {
      const message = readError instanceof Error ? readError.message : '리소스를 불러오지 못했습니다.';
      setResourceResult(message);
      pushTrace({
        title: `${selectedResource} 읽기`,
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
    } finally {
      setResourceLoading(false);
    }
  }

  async function getPrompt() {
    setPromptLoading(true);
    setPromptResult('');
    try {
      const parsedArgs = parseJsonInput(promptArgs);
      const res = await fetch('/api/mcp/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedPrompt,
          arguments: parsedArgs,
          connection: connection || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '프롬프트를 불러오지 못했습니다.');
      }
      const pretty = stringifyPretty(data);
      setPromptResult(pretty);
      pushTrace({
        title: `${selectedPrompt} 가져오기`,
        status: 'success',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: '고급 프롬프트 결과를 확인했습니다.'
      });
    } catch (promptError) {
      const message = promptError instanceof Error ? promptError.message : '프롬프트를 불러오지 못했습니다.';
      setPromptResult(message);
      pushTrace({
        title: `${selectedPrompt} 가져오기`,
        status: 'error',
        createdAt: new Date().toLocaleString('ko-KR'),
        summary: message
      });
    } finally {
      setPromptLoading(false);
    }
  }

  const selectedToolMeta = inspect?.tools?.find((tool) => tool.name === selectedTool);
  const selectedPromptMeta = inspect?.prompts?.find((prompt) => prompt.name === selectedPrompt);

  return (
    <section className="panel space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel">
          <div className="inline-flex rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-text)]">
            AI Connection Center
          </div>
          <h3 className="mt-4 text-[1.55rem] font-semibold tracking-[-0.04em] text-[var(--text-strong)]">AI 연결 센터</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-base)]">
            어려운 개발자용 용어 대신, 앱 안에 쌓인 회의 기록, 데이터셋, 학습 카드, 성과 요약을 버튼 한 번으로 바로 확인할 수 있게 정리했습니다.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="metric-card">
              <p className="text-xs text-[var(--text-muted)]">연결 상태</p>
              <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">{inspect ? '정상 연결' : '확인 중'}</p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {inspect?.durationMs ? `${inspect.durationMs}ms 응답` : `${connection?.name || '로컬 서버'} 점검 중`}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-[var(--text-muted)]">{internalShowcaseAvailable ? '누적 실행' : '도구 수'}</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">
                {internalShowcaseAvailable ? overview?.counts?.runs || 0 : inspect?.tools?.length || 0}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-[var(--text-muted)]">{internalShowcaseAvailable ? '데이터셋' : '리소스 수'}</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">
                {internalShowcaseAvailable ? overview?.counts?.datasets || 0 : inspect?.resources?.length || 0}
              </p>
            </div>
            <div className="metric-card">
              <p className="text-xs text-[var(--text-muted)]">{internalShowcaseAvailable ? '검증된 학습 카드' : '프롬프트 수'}</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--text-strong)]">
                {internalShowcaseAvailable ? overview?.counts?.confirmedLearningCards || 0 : inspect?.prompts?.length || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-strong)]">바로 볼 수 있는 정보</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">필요한 항목을 선택하면 결과가 바로 아래 카드로 정리됩니다.</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void refreshInspect()} disabled={refreshing}>
              {refreshing ? '갱신 중...' : '새로고침'}
            </button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="list-card text-left hover:bg-[var(--surface-sub)] transition"
              onClick={() => void loadRunsShowcase()}
              disabled={toolLoading || !internalShowcaseAvailable}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">최근 전략 회의</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">가장 최근에 실행된 회의 흐름과 주제를 빠르게 확인합니다.</p>
            </button>
            <button
              type="button"
              className="list-card text-left hover:bg-[var(--surface-sub)] transition"
              onClick={() => void loadDatasetsShowcase()}
              disabled={toolLoading || !internalShowcaseAvailable}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">데이터셋 현황</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">저장된 자료와 AI 분석 준비 상태를 한 번에 봅니다.</p>
            </button>
            <button
              type="button"
              className="list-card text-left hover:bg-[var(--surface-sub)] transition"
              onClick={() => void loadLearningShowcase()}
              disabled={toolLoading || !internalShowcaseAvailable}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">검증된 응답 패턴</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">이미 검증된 학습 카드만 모아서 바로 참고합니다.</p>
            </button>
            <button
              type="button"
              className="list-card text-left hover:bg-[var(--surface-sub)] transition"
              onClick={() => void loadInstagramShowcase()}
              disabled={toolLoading || !internalShowcaseAvailable}
            >
              <p className="text-sm font-semibold text-[var(--text-strong)]">인스타그램 성과</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">최근 도달 추세와 요약된 성과 메모를 바로 확인합니다.</p>
            </button>
          </div>
          {!internalShowcaseAvailable && (
            <p className="mt-4 text-xs text-[var(--text-muted)]">외부 MCP 연결은 빠른 보기 대신, 아래 고급 보기와 연결 점검 결과를 중심으로 확인합니다.</p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--text-muted)]">AI 연결 상태를 불러오는 중...</p>}
      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      {!loading && (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Showcase</p>
                <h4 className="mt-2 text-[1.2rem] font-semibold tracking-[-0.03em] text-[var(--text-strong)]">{showcase?.title || '한 번에 보기'}</h4>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
                  {showcase?.subtitle || '왼쪽의 버튼을 누르면 필요한 정보를 보기 쉬운 카드 형태로 정리해 드립니다.'}
                </p>
              </div>
              {toolLoading && <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent-text)]">불러오는 중</span>}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(showcase?.cards || []).map((card, index) => (
                <article key={`${card.title}-${index}`} className="soft-panel">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{card.eyebrow}</p>
                  <p className="mt-3 text-base font-semibold text-[var(--text-strong)]">{card.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">{card.detail}</p>
                  {card.meta && <p className="mt-3 text-xs text-[var(--text-muted)]">{card.meta}</p>}
                </article>
              ))}
            </div>
            {showcase && showcase.cards.length === 0 && (
              <div className="mt-5 rounded-[12px] border border-dashed border-[var(--surface-border)] bg-[var(--surface-sub)] px-4 py-6 text-sm text-[var(--text-muted)]">
                아직 표시할 데이터가 없습니다. 상단의 빠른 보기 항목을 선택하거나 데이터를 먼저 쌓아보세요.
              </div>
            )}
            {showcase?.raw && (
              <details className="mt-5 soft-panel">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--text-base)]">원본 결과 보기</summary>
                <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap text-[11px] text-[var(--text-base)]">{showcase.raw}</pre>
              </details>
            )}
          </div>

          <div className="space-y-4">
            <div className="panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">최근 확인 기록</p>
              <div className="mt-4 space-y-3">
                {traces.length === 0 && <p className="text-sm text-[var(--text-muted)]">아직 불러온 기록이 없습니다.</p>}
                {traces.map((trace) => (
                  <div key={trace.id} className="soft-panel">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--text-strong)]">{trace.title}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          trace.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {trace.status === 'success' ? '완료' : '오류'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{trace.summary}</p>
                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">{trace.createdAt}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <p className="text-sm font-semibold text-[var(--text-strong)]">현재 연결 정보</p>
              <div className="mt-4 space-y-3">
                <div className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Server</p>
                  <p className="mt-2 text-base font-semibold text-[var(--text-strong)]">
                    {inspect?.server?.name || 'unknown'} {inspect?.server?.version ? `v${inspect.server.version}` : ''}
                  </p>
                  {connection && <p className="mt-2 text-xs text-[var(--text-muted)]">{connection.name} · {connection.transport}</p>}
                </div>
                <div className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">What You Can Do</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-base)]">
                    {internalShowcaseAvailable
                      ? '회의 실행, 데이터셋, 학습 카드, 인스타 성과 정보를 앱 안에서 바로 불러와 확인하고, 필요하면 고급 모드에서 세부 실행까지 이어갈 수 있습니다.'
                      : '선택한 외부 MCP 연결의 도구, 리소스, 프롬프트가 정상적으로 보이는지 먼저 점검하고, 이후 화면별 발행/검증 기능으로 순차 확장할 수 있습니다.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <details className="panel">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--text-strong)]">전문가용 고급 실행 보기</summary>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">개발자나 운영 담당자가 원할 때만 raw MCP 도구, 리소스, 프롬프트를 직접 테스트할 수 있는 영역입니다.</p>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="soft-panel">
            <p className="text-sm font-semibold text-[var(--text-strong)]">고급 도구 실행</p>
            <div className="mt-3 space-y-3">
              <select
                className="input"
                value={selectedTool}
                onChange={(e) => {
                  const next = e.target.value;
                  setSelectedTool(next);
                  setToolArgs(DEFAULT_TOOL_ARGS[next] || '{}');
                }}
              >
                {(inspect?.tools || []).map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
              {selectedToolMeta?.description && <p className="text-xs text-[var(--text-muted)]">{selectedToolMeta.description}</p>}
              <textarea className="input min-h-[140px] font-mono text-xs" value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} />
              <button type="button" className="button-primary" onClick={() => void runTool()} disabled={!selectedTool || toolLoading}>
                {toolLoading ? '실행 중...' : '도구 실행'}
              </button>
              {toolResult && <pre className="soft-panel max-h-[240px] overflow-auto p-3 text-[11px] text-[var(--text-base)]">{toolResult}</pre>}
            </div>
          </div>

          <div className="soft-panel">
            <p className="text-sm font-semibold text-[var(--text-strong)]">고급 리소스 읽기</p>
            <div className="mt-3 space-y-3">
              <select className="input" value={selectedResource} onChange={(e) => setSelectedResource(e.target.value)}>
                {(inspect?.resources || []).map((resource) => (
                  <option key={resource.uri} value={resource.uri}>
                    {resource.uri}
                  </option>
                ))}
              </select>
              <button type="button" className="button-primary" onClick={() => void readResource()} disabled={!selectedResource || resourceLoading}>
                {resourceLoading ? '읽는 중...' : '리소스 읽기'}
              </button>
              {resourceResult && <pre className="soft-panel max-h-[240px] overflow-auto p-3 text-[11px] text-[var(--text-base)]">{resourceResult}</pre>}
            </div>
          </div>
        </div>

        <div className="mt-4 soft-panel">
          <p className="text-sm font-semibold text-[var(--text-strong)]">고급 프롬프트 미리보기</p>
          <div className="mt-3 space-y-3">
            <select
              className="input"
              value={selectedPrompt}
              onChange={(e) => {
                const next = e.target.value;
                setSelectedPrompt(next);
                setPromptArgs(DEFAULT_PROMPT_ARGS[next] || '{}');
              }}
            >
              {(inspect?.prompts || []).map((prompt) => (
                <option key={prompt.name} value={prompt.name}>
                  {prompt.name}
                </option>
              ))}
            </select>
            {selectedPromptMeta?.description && <p className="text-xs text-[var(--text-muted)]">{selectedPromptMeta.description}</p>}
            <textarea className="input min-h-[120px] font-mono text-xs" value={promptArgs} onChange={(e) => setPromptArgs(e.target.value)} />
            <button type="button" className="button-primary" onClick={() => void getPrompt()} disabled={!selectedPrompt || promptLoading}>
              {promptLoading ? '불러오는 중...' : '프롬프트 보기'}
            </button>
            {promptResult && <pre className="soft-panel max-h-[240px] overflow-auto p-3 text-[11px] text-[var(--text-base)]">{promptResult}</pre>}
          </div>
        </div>

        {inspect?.stderr && inspect.stderr.length > 0 && (
          <details className="mt-4 soft-panel">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-base)]">기술 로그 보기</summary>
            <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap text-[11px] text-[var(--text-base)]">{inspect.stderr.join('\n')}</pre>
          </details>
        )}
      </details>
    </section>
  );
}
