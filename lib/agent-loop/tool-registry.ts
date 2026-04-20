/**
 * Garnet Phase 7 — Agentic Tool Harness
 * tool-registry.ts: Declares and registers the 6 standard Garnet tools.
 *
 * All external module imports use dynamic import() to avoid circular dependencies
 * and Turbopack/Next.js top-level import crashes.
 */

import type { ToolDeclaration } from './tool-types';
import type { ToolHarness } from './tool-harness';

// ── Tool Declarations ──────────────────────────────────────────────────────

const GA4_QUERY_DECLARATION: ToolDeclaration = {
  name: 'ga4_query',
  description:
    'Query MONOPLEX GA4 analytics data. Supports metrics: daily_traffic, channel_breakdown, page_performance, new_vs_returning, channel_trend, stickiness, engagement, device, geo, landing_pages, hourly_pattern, channel_conversions, ecommerce.',
  parameters: {
    metric: {
      type: 'string',
      description: 'The GA4 metric/report to fetch.',
      required: true,
      enum: [
        'daily_traffic',
        'channel_breakdown',
        'page_performance',
        'new_vs_returning',
        'channel_trend',
        'stickiness',
        'engagement',
        'device',
        'geo',
        'landing_pages',
        'hourly_pattern',
        'channel_conversions',
        'ecommerce',
      ],
    },
    start_date: {
      type: 'string',
      description: 'Start date in YYYY-MM-DD format (default: 30 days ago).',
      required: false,
    },
    end_date: {
      type: 'string',
      description: 'End date in YYYY-MM-DD format (default: today).',
      required: false,
    },
    days: {
      type: 'number',
      description: 'Shorthand for last N days (used by some reports instead of start/end date).',
      required: false,
    },
  },
};

const GA4_FUNNEL_DECLARATION: ToolDeclaration = {
  name: 'ga4_funnel',
  description: 'Fetch the MONOPLEX e-commerce purchase funnel with stage-by-stage drop-off rates.',
  parameters: {
    days: {
      type: 'number',
      description: 'Number of past days to include (default: 7).',
      required: false,
    },
  },
};

const THEATER_DETAIL_DECLARATION: ToolDeclaration = {
  name: 'theater_detail',
  description:
    'Fetch revenue and performance data for a specific MONOPLEX theater branch, filtered by theater code or name.',
  parameters: {
    query: {
      type: 'string',
      description: 'Theater code (e.g. m001), encrypted code, or Korean name (e.g. 배식당).',
      required: true,
    },
    days: {
      type: 'number',
      description: 'Number of past days to include (default: 7).',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Maximum number of top theaters to fetch before filtering (default: 50).',
      required: false,
    },
  },
};

const KNOWLEDGE_SEARCH_DECLARATION: ToolDeclaration = {
  name: 'knowledge_search',
  description:
    'Semantic search over the Garnet knowledge base (lessons, frameworks, market intelligence).',
  parameters: {
    query: {
      type: 'string',
      description: 'Natural-language search query.',
      required: true,
    },
    domain: {
      type: 'string',
      description: 'Optional domain filter (e.g. "marketing", "analytics").',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Maximum results to return (default: 10).',
      required: false,
    },
    min_similarity: {
      type: 'number',
      description: 'Minimum cosine similarity threshold 0–1 (default: 0.5).',
      required: false,
    },
  },
};

const EPISODE_SEARCH_DECLARATION: ToolDeclaration = {
  name: 'episode_search',
  description:
    'Retrieve episodic memories (past agent runs, campaign outcomes, reflections) by semantic meaning.',
  parameters: {
    query: {
      type: 'string',
      description: 'Natural-language search query.',
      required: true,
    },
    category: {
      type: 'string',
      description: 'Optional category filter (e.g. "campaign", "reflection").',
      required: false,
    },
    limit: {
      type: 'number',
      description: 'Maximum results to return (default: 5).',
      required: false,
    },
    min_similarity: {
      type: 'number',
      description: 'Minimum cosine similarity threshold 0–1 (default: 0.4).',
      required: false,
    },
  },
};

const WEB_SEARCH_DECLARATION: ToolDeclaration = {
  name: 'web_search',
  description:
    'Run a live web search for market intelligence, competitor news, or industry trends.',
  parameters: {
    topic: {
      type: 'string',
      description: 'Search topic or query string.',
      required: true,
    },
    brand: {
      type: 'string',
      description: 'Brand name for context (e.g. "MONOPLEX").',
      required: false,
    },
    region: {
      type: 'string',
      description: 'Geographic region to focus on (e.g. "Korea").',
      required: false,
    },
    goal: {
      type: 'string',
      description: 'Search intent or goal (e.g. "competitive analysis").',
      required: false,
    },
  },
};

export const ALL_DECLARATIONS: ToolDeclaration[] = [
  GA4_QUERY_DECLARATION,
  GA4_FUNNEL_DECLARATION,
  THEATER_DETAIL_DECLARATION,
  KNOWLEDGE_SEARCH_DECLARATION,
  EPISODE_SEARCH_DECLARATION,
  WEB_SEARCH_DECLARATION,
];

// ── Helpers ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ── Tool Handlers ──────────────────────────────────────────────────────────

async function handleGa4Query(params: Record<string, unknown>): Promise<unknown> {
  const metric = params.metric as string;
  const days = typeof params.days === 'number' ? params.days : 30;
  const startDate = (params.start_date as string | undefined) ?? daysAgo(days);
  const endDate = (params.end_date as string | undefined) ?? today();

  const {
    fetchDailyTraffic,
    fetchChannelBreakdown,
    fetchPagePerformance,
    fetchNewVsReturning,
    fetchChannelTrend,
    fetchStickiness,
    fetchEngagementMetrics,
    fetchDeviceBreakdown,
    fetchGeoBreakdown,
    fetchLandingPages,
    fetchHourlyPattern,
    fetchChannelConversions,
    fetchEcommerceData,
  } = await import('@/lib/ga4-client');

  switch (metric) {
    case 'daily_traffic':
      return fetchDailyTraffic(startDate, endDate);
    case 'channel_breakdown':
      return fetchChannelBreakdown(startDate, endDate);
    case 'page_performance':
      return fetchPagePerformance(startDate, endDate);
    case 'new_vs_returning':
      return fetchNewVsReturning(startDate, endDate);
    case 'channel_trend':
      return fetchChannelTrend(startDate, endDate);
    case 'stickiness':
      return fetchStickiness(startDate, endDate);
    case 'engagement':
      return fetchEngagementMetrics(startDate, endDate);
    case 'device':
      return fetchDeviceBreakdown(startDate, endDate);
    case 'geo':
      return fetchGeoBreakdown(startDate, endDate);
    case 'landing_pages':
      return fetchLandingPages(startDate, endDate);
    case 'hourly_pattern':
      return fetchHourlyPattern(startDate, endDate);
    case 'channel_conversions':
      return fetchChannelConversions(startDate, endDate);
    case 'ecommerce':
      return fetchEcommerceData(startDate, endDate);
    default:
      throw new Error(`Unknown GA4 metric: "${metric}"`);
  }
}

async function handleGa4Funnel(params: Record<string, unknown>): Promise<unknown> {
  const days = typeof params.days === 'number' ? params.days : 7;
  const { fetchEcommerceFunnel } = await import('@/lib/ga4-client');
  return fetchEcommerceFunnel(days);
}

async function handleTheaterDetail(params: Record<string, unknown>): Promise<unknown> {
  const query = params.query as string;
  const days = typeof params.days === 'number' ? params.days : 7;
  const limit = typeof params.limit === 'number' ? params.limit : 50;

  const { fetchTheaterRevenueTop } = await import('@/lib/ga4-client');
  const { mapTheaterCode } = await import('@/lib/theater-mapping');

  const allTheaters = await fetchTheaterRevenueTop(days, limit);
  const normalizedQuery = query.toLowerCase().trim();

  // Try to resolve the query to a canonical name via mapTheaterCode
  const resolvedName = mapTheaterCode(query).toLowerCase();

  const matched = allTheaters.filter((t) => {
    const nameLower = (t.theaterName ?? '').toLowerCase();
    const codeLower = (t.theaterCode ?? '').toLowerCase();
    return (
      nameLower.includes(normalizedQuery) ||
      codeLower.includes(normalizedQuery) ||
      nameLower.includes(resolvedName) ||
      resolvedName.includes(nameLower)
    );
  });

  return matched.length > 0 ? matched : allTheaters.slice(0, 5);
}

async function handleKnowledgeSearch(params: Record<string, unknown>): Promise<unknown> {
  const { searchKnowledgeSemantic } = await import('./knowledge-store');
  return searchKnowledgeSemantic(params.query as string, {
    domain: params.domain as string | undefined,
    limit: typeof params.limit === 'number' ? params.limit : 10,
    minSimilarity: typeof params.min_similarity === 'number' ? params.min_similarity : 0.5,
  });
}

async function handleEpisodeSearch(params: Record<string, unknown>): Promise<unknown> {
  const { retrieveByMeaning } = await import('@/lib/memory/episodic-store');
  return retrieveByMeaning({
    query: params.query as string,
    category: params.category as string | undefined,
    limit: typeof params.limit === 'number' ? params.limit : 5,
    minSimilarity: typeof params.min_similarity === 'number' ? params.min_similarity : 0.4,
  });
}

async function handleWebSearch(params: Record<string, unknown>): Promise<unknown> {
  const { runWebSearchWithRuntime } = await import('@/lib/search');
  return runWebSearchWithRuntime(
    params.topic as string,
    params.brand as string | undefined,
    params.region as string | undefined,
    params.goal as string | undefined,
  );
}

// ── Registration ───────────────────────────────────────────────────────────

export function registerAllTools(harness: ToolHarness): void {
  harness.registerTool(GA4_QUERY_DECLARATION, handleGa4Query);
  harness.registerTool(GA4_FUNNEL_DECLARATION, handleGa4Funnel);
  harness.registerTool(THEATER_DETAIL_DECLARATION, handleTheaterDetail);
  harness.registerTool(KNOWLEDGE_SEARCH_DECLARATION, handleKnowledgeSearch);
  harness.registerTool(EPISODE_SEARCH_DECLARATION, handleEpisodeSearch);
  harness.registerTool(WEB_SEARCH_DECLARATION, handleWebSearch);
}
