#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { PrismaClient } from '@prisma/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

function resolveDatasourceUrl() {
  const raw = process.env.DATABASE_URL || 'file:./dev.db';
  if (raw.startsWith('file:./')) {
    return `file:${path.join(process.cwd(), raw.replace('file:./', ''))}`;
  }
  return raw;
}

const prisma = new PrismaClient({
  datasourceUrl: resolveDatasourceUrl(),
  log: ['error']
});

const server = new McpServer(
  {
    name: 'garnet-mcp',
    version: '0.2.0'
  },
  {
    capabilities: { logging: {} },
    instructions:
      'Use the Garnet tools to inspect marketing runs, datasets, learning archives, seminar sessions, KPI goals, campaign rooms, and Instagram reach analyses. ' +
      'Start with "get_operations_summary" or resource "aimd://overview" for a quick health check. ' +
      'Then drill down with detail tools. Use prompts for structured analysis workflows.'
  }
);

function clipText(value, max = 800) {
  if (!value) return '';
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function parseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asJsonText(data) {
  return JSON.stringify(data, null, 2);
}

function textContent(data) {
  return [
    {
      type: 'text',
      text: asJsonText(data)
    }
  ];
}

function summarizeRun(run) {
  return {
    id: run.id,
    topic: run.topic,
    brand: run.brand,
    region: run.region,
    goal: run.goal,
    createdAt: run.createdAt,
    deliverableType: run.deliverable?.type || null,
    memoryTags: parseJsonArray(run.memoryLog?.tags).slice(0, 6),
    attachmentCount: run._count?.attachments || 0,
    sourceCount: run._count?.webSources || 0,
    meetingTurnCount: run._count?.meetingTurns || 0
  };
}

function summarizeDataset(dataset) {
  return {
    id: dataset.id,
    name: dataset.name,
    type: dataset.type,
    notes: dataset.notes,
    hasAnalysis: Boolean(dataset.analysis),
    rawDataPreview: clipText(dataset.rawData, 700),
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt
  };
}

function summarizeLearningCard(card) {
  return {
    id: card.id,
    status: card.status,
    sourceType: card.sourceType,
    situation: clipText(card.situation, 220),
    recommendedResponse: clipText(card.recommendedResponse, 360),
    tags: parseJsonArray(card.tags).slice(0, 8),
    signals: parseJsonArray(card.signals).slice(0, 8),
    runId: card.runId,
    updatedAt: card.updatedAt
  };
}

function summarizeKpiGoal(goal) {
  const progress = goal.targetValue > 0
    ? Math.round((goal.currentValue / goal.targetValue) * 100)
    : 0;
  return {
    id: goal.id,
    title: goal.title,
    brand: goal.brand,
    region: goal.region,
    metric: goal.metric,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    unit: goal.unit,
    period: goal.period,
    progressPct: progress,
    notes: clipText(goal.notes, 160),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt
  };
}

function summarizeSeminarSession(session) {
  return {
    id: session.id,
    title: session.title,
    topic: session.topic,
    brand: session.brand,
    status: session.status,
    completedRounds: session.completedRounds,
    maxRounds: session.maxRounds,
    intervalMinutes: session.intervalMinutes,
    nextRunAt: session.nextRunAt,
    lastRunAt: session.lastRunAt,
    morningBriefing: clipText(session.morningBriefing, 300),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function summarizeCampaignRoom(room) {
  return {
    id: room.id,
    title: room.title,
    brand: room.brand,
    region: room.region,
    goal: room.goal,
    objective: room.objective,
    status: room.status,
    notes: clipText(room.notes, 200),
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

function summarizeInstagramAnalysis(item) {
  return {
    id: item.id,
    accountId: item.accountId,
    days: item.days,
    trendDirection: item.trendDirection,
    averageReach: item.averageReach,
    latestReach: item.latestReach,
    dayOverDayChangePct: item.dayOverDayChangePct,
    anomalyCount: item.anomalyCount,
    createdAt: item.createdAt,
    summary: clipText(item.summary, 320)
  };
}

server.registerResource(
  'aimd-overview',
  'aimd://overview',
  {
    title: 'AIMD Overview',
    description: 'High-level overview of runs, datasets, learning cards, and Instagram analytics.',
    mimeType: 'application/json'
  },
  async () => {
    const [runCount, datasetCount, learningCount, confirmedLearningCount, seminarCount, runningSeminarCount, kpiGoalCount, latestRun, latestDataset, latestInstagram] =
      await Promise.all([
        prisma.run.count(),
        prisma.dataset.count(),
        prisma.learningArchive.count(),
        prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }),
        prisma.seminarSession.count(),
        prisma.seminarSession.count({ where: { status: 'RUNNING' } }),
        prisma.kpiGoal.count(),
        prisma.run.findFirst({ orderBy: { createdAt: 'desc' } }),
        prisma.dataset.findFirst({ orderBy: { updatedAt: 'desc' } }),
        prisma.instagramReachAnalysisRun.findFirst({ orderBy: { createdAt: 'desc' } })
      ]);

    const overview = {
      generatedAt: new Date().toISOString(),
      counts: {
        runs: runCount,
        datasets: datasetCount,
        learningCards: learningCount,
        confirmedLearningCards: confirmedLearningCount,
        seminarSessions: seminarCount,
        runningSeminarSessions: runningSeminarCount,
        kpiGoals: kpiGoalCount
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            topic: latestRun.topic,
            createdAt: latestRun.createdAt
          }
        : null,
      latestDataset: latestDataset
        ? {
            id: latestDataset.id,
            name: latestDataset.name,
            updatedAt: latestDataset.updatedAt
          }
        : null,
      latestInstagramAnalysis: latestInstagram ? summarizeInstagramAnalysis(latestInstagram) : null
    };

    return {
      contents: [
        {
          uri: 'aimd://overview',
          mimeType: 'application/json',
          text: asJsonText(overview)
        }
      ]
    };
  }
);

server.registerResource(
  'aimd-recent-runs',
  'aimd://runs/recent',
  {
    title: 'Recent Runs',
    description: 'Recent marketing meeting runs with compact metadata.',
    mimeType: 'application/json'
  },
  async () => {
    const runs = await prisma.run.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        deliverable: { select: { type: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true, meetingTurns: true } }
      }
    });

    return {
      contents: [
        {
          uri: 'aimd://runs/recent',
          mimeType: 'application/json',
          text: asJsonText({
            generatedAt: new Date().toISOString(),
            runs: runs.map(summarizeRun)
          })
        }
      ]
    };
  }
);

server.registerResource(
  'aimd-recent-learning',
  'aimd://learning/recent',
  {
    title: 'Recent Learning Cards',
    description: 'Latest reusable response patterns and learning cards.',
    mimeType: 'application/json'
  },
  async () => {
    const cards = await prisma.learningArchive.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 12
    });

    return {
      contents: [
        {
          uri: 'aimd://learning/recent',
          mimeType: 'application/json',
          text: asJsonText({
            generatedAt: new Date().toISOString(),
            cards: cards.map(summarizeLearningCard)
          })
        }
      ]
    };
  }
);

server.registerTool(
  'list_runs',
  {
    title: 'List Runs',
    description: 'List recent marketing runs, optionally filtered by keyword.',
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10),
      query: z.string().optional()
    }
  },
  async ({ limit = 10, query }) => {
    const keyword = query?.trim();
    const runs = await prisma.run.findMany({
      where: keyword
        ? {
            OR: [
              { topic: { contains: keyword } },
              { brand: { contains: keyword } },
              { region: { contains: keyword } },
              { goal: { contains: keyword } }
            ]
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        deliverable: { select: { type: true } },
        memoryLog: { select: { tags: true } },
        _count: { select: { attachments: true, webSources: true, meetingTurns: true } }
      }
    });

    const structuredContent = {
      count: runs.length,
      runs: runs.map(summarizeRun)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'get_run_detail',
  {
    title: 'Get Run Detail',
    description: 'Fetch the full detail for a single marketing run.',
    inputSchema: {
      runId: z.string().min(1)
    }
  },
  async ({ runId }) => {
    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        webSources: { orderBy: { fetchedAt: 'desc' } },
        meetingTurns: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        deliverable: true,
        memoryLog: true
      }
    });

    if (!run) {
      return {
        content: [{ type: 'text', text: `Run not found: ${runId}` }],
        isError: true
      };
    }

    const structuredContent = {
      id: run.id,
      topic: run.topic,
      brand: run.brand,
      region: run.region,
      goal: run.goal,
      createdAt: run.createdAt,
      webSources: run.webSources.map((item) => ({
        title: item.title,
        url: item.url,
        provider: item.provider,
        fetchedAt: item.fetchedAt,
        snippet: clipText(item.snippet, 260)
      })),
      meetingTurns: run.meetingTurns.map((item) => ({
        role: item.role,
        nickname: item.nickname,
        createdAt: item.createdAt,
        content: clipText(item.content, 1400)
      })),
      attachments: run.attachments.map((item) => ({
        name: item.name,
        mimeType: item.mimeType,
        preview: clipText(item.content, 500)
      })),
      deliverable: run.deliverable
        ? {
            type: run.deliverable.type,
            createdAt: run.deliverable.createdAt,
            content: clipText(run.deliverable.content, 5000)
          }
        : null,
      memoryLog: run.memoryLog
        ? {
            hypothesis: run.memoryLog.hypothesis,
            direction: run.memoryLog.direction,
            expectedImpact: run.memoryLog.expectedImpact,
            risks: run.memoryLog.risks,
            outcome: run.memoryLog.outcome,
            failureReason: run.memoryLog.failureReason,
            tags: parseJsonArray(run.memoryLog.tags)
          }
        : null
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'list_datasets',
  {
    title: 'List Datasets',
    description: 'List saved datasets and their analysis availability.',
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10),
      query: z.string().optional()
    }
  },
  async ({ limit = 10, query }) => {
    const keyword = query?.trim();
    const datasets = await prisma.dataset.findMany({
      where: keyword
        ? {
            OR: [{ name: { contains: keyword } }, { notes: { contains: keyword } }, { type: { equals: keyword } }]
          }
        : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const structuredContent = {
      count: datasets.length,
      datasets: datasets.map(summarizeDataset)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'get_dataset_detail',
  {
    title: 'Get Dataset Detail',
    description: 'Fetch a dataset with preview, notes, and latest AI analysis.',
    inputSchema: {
      datasetId: z.string().min(1)
    }
  },
  async ({ datasetId }) => {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId }
    });

    if (!dataset) {
      return {
        content: [{ type: 'text', text: `Dataset not found: ${datasetId}` }],
        isError: true
      };
    }

    const structuredContent = {
      id: dataset.id,
      name: dataset.name,
      type: dataset.type,
      notes: dataset.notes,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
      rawDataPreview: clipText(dataset.rawData, 4000),
      analysis: clipText(dataset.analysis, 5000)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'list_learning_cards',
  {
    title: 'List Learning Cards',
    description: 'Search reusable learning cards by status or keyword.',
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10),
      status: z.enum(['DRAFT', 'CONFIRMED', 'ARCHIVED']).optional(),
      query: z.string().optional()
    }
  },
  async ({ limit = 10, status, query }) => {
    const keyword = query?.trim();
    const cards = await prisma.learningArchive.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(keyword
          ? {
              OR: [
                { situation: { contains: keyword } },
                { recommendedResponse: { contains: keyword } },
                { reasoning: { contains: keyword } },
                { tags: { contains: keyword } },
                { signals: { contains: keyword } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const structuredContent = {
      count: cards.length,
      cards: cards.map(summarizeLearningCard)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'get_instagram_reach_summary',
  {
    title: 'Get Instagram Reach Summary',
    description: 'Return the most recent Instagram reach analysis snapshot.',
    inputSchema: {}
  },
  async () => {
    const [latestAnalysis, recentDaily] = await Promise.all([
      prisma.instagramReachAnalysisRun.findFirst({
        orderBy: { createdAt: 'desc' }
      }),
      prisma.instagramReachDaily.findMany({
        orderBy: { metricDate: 'desc' },
        take: 14
      })
    ]);

    if (!latestAnalysis && recentDaily.length === 0) {
      return {
        content: [{ type: 'text', text: 'Instagram reach data is not available yet.' }],
        isError: true
      };
    }

    const structuredContent = {
      latestAnalysis: latestAnalysis ? summarizeInstagramAnalysis(latestAnalysis) : null,
      recentDaily: recentDaily.map((item) => ({
        metricDate: item.metricDate,
        reach: item.reach,
        fetchedAt: item.fetchedAt
      }))
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

// ── GA4 Analytics ─────────────────────────────────────────────────────────

server.registerTool(
  'get_ga4_traffic_summary',
  {
    title: 'Get GA4 Traffic Summary',
    description: 'Fetch daily traffic, channel breakdown, and top pages from Google Analytics 4 for the given date range.',
    inputSchema: {
      startDate: z.string().default('30daysAgo'),
      endDate: z.string().default('today')
    }
  },
  async ({ startDate = '30daysAgo', endDate = 'today' }) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const url = `${baseUrl}/api/ga4/report?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&type=all`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return {
          content: [{ type: 'text', text: `GA4 report failed: ${err.error || res.status}` }],
          isError: true
        };
      }
      const data = await res.json();
      return {
        content: textContent(data),
        structuredContent: data
      };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `GA4 fetch error: ${e.message || e}` }],
        isError: true
      };
    }
  }
);

// ── KPI Goals ──────────────────────────────────────────────────────────────

server.registerTool(
  'list_kpi_goals',
  {
    title: 'List KPI Goals',
    description: 'List KPI goals with current progress. Optionally filter by brand.',
    inputSchema: {
      limit: z.number().int().min(1).max(50).default(20),
      brand: z.string().optional()
    }
  },
  async ({ limit = 20, brand }) => {
    const goals = await prisma.kpiGoal.findMany({
      where: brand ? { brand } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    const structuredContent = {
      count: goals.length,
      goals: goals.map(summarizeKpiGoal)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'update_kpi_current_value',
  {
    title: 'Update KPI Current Value',
    description: 'Update the currentValue of a KPI goal by id.',
    inputSchema: {
      goalId: z.string().min(1),
      currentValue: z.number()
    }
  },
  async ({ goalId, currentValue }) => {
    const updated = await prisma.kpiGoal.update({
      where: { id: goalId },
      data: { currentValue }
    });

    return {
      content: textContent(summarizeKpiGoal(updated)),
      structuredContent: summarizeKpiGoal(updated)
    };
  }
);

// ── Seminar Sessions ────────────────────────────────────────────────────────

server.registerResource(
  'aimd-recent-seminars',
  'aimd://seminar/recent',
  {
    title: 'Recent Seminar Sessions',
    description: 'Latest seminar (strategy simulation) sessions with status and round count.',
    mimeType: 'application/json'
  },
  async () => {
    const sessions = await prisma.seminarSession.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 10
    });

    return {
      contents: [
        {
          uri: 'aimd://seminar/recent',
          mimeType: 'application/json',
          text: asJsonText({
            generatedAt: new Date().toISOString(),
            sessions: sessions.map(summarizeSeminarSession)
          })
        }
      ]
    };
  }
);

server.registerTool(
  'list_seminar_sessions',
  {
    title: 'List Seminar Sessions',
    description: 'List strategy simulation sessions, optionally filtered by status.',
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10),
      status: z.enum(['PLANNED', 'RUNNING', 'COMPLETED', 'FAILED', 'STOPPED']).optional()
    }
  },
  async ({ limit = 10, status }) => {
    const sessions = await prisma.seminarSession.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const structuredContent = {
      count: sessions.length,
      sessions: sessions.map(summarizeSeminarSession)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerTool(
  'get_seminar_session',
  {
    title: 'Get Seminar Session',
    description: 'Fetch full detail for a seminar session including all rounds and final report.',
    inputSchema: {
      sessionId: z.string().min(1)
    }
  },
  async ({ sessionId }) => {
    const session = await prisma.seminarSession.findUnique({
      where: { id: sessionId },
      include: {
        rounds: { orderBy: { roundNumber: 'asc' } },
        finalReport: true
      }
    });

    if (!session) {
      return {
        content: [{ type: 'text', text: `Seminar session not found: ${sessionId}` }],
        isError: true
      };
    }

    const structuredContent = {
      ...summarizeSeminarSession(session),
      rounds: session.rounds.map((round) => ({
        roundNumber: round.roundNumber,
        status: round.status,
        scheduledAt: round.scheduledAt,
        startedAt: round.startedAt,
        finishedAt: round.finishedAt,
        runId: round.runId,
        summary: clipText(round.summary, 400),
        error: round.error
      })),
      finalReport: session.finalReport
        ? {
            content: clipText(session.finalReport.content, 6000),
            createdAt: session.finalReport.createdAt,
            updatedAt: session.finalReport.updatedAt
          }
        : null
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

// ── Campaign Rooms ──────────────────────────────────────────────────────────

server.registerTool(
  'list_campaign_rooms',
  {
    title: 'List Campaign Rooms',
    description: 'List manual campaign rooms with status and key metadata.',
    inputSchema: {
      limit: z.number().int().min(1).max(30).default(10),
      status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional()
    }
  },
  async ({ limit = 10, status }) => {
    const rooms = await prisma.manualCampaignRoom.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit
    });

    const structuredContent = {
      count: rooms.length,
      rooms: rooms.map(summarizeCampaignRoom)
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

// ── Operations Summary ──────────────────────────────────────────────────────

server.registerTool(
  'get_operations_summary',
  {
    title: 'Get Operations Summary',
    description: 'Return a consolidated ops dashboard: run counts, seminar status, KPI health, and latest signals.',
    inputSchema: {}
  },
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalRuns,
      recentRunCount,
      deliverableCount,
      totalDatasets,
      analyzedDatasets,
      totalLearning,
      confirmedLearning,
      draftLearning,
      runningSeminars,
      completedSeminars,
      totalKpiGoals,
      latestReach,
      activeRooms
    ] = await Promise.all([
      prisma.run.count(),
      prisma.run.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.deliverable.count(),
      prisma.dataset.count(),
      prisma.dataset.count({ where: { analysis: { not: null } } }),
      prisma.learningArchive.count(),
      prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }),
      prisma.learningArchive.count({ where: { status: 'DRAFT' } }),
      prisma.seminarSession.count({ where: { status: 'RUNNING' } }),
      prisma.seminarSession.count({ where: { status: 'COMPLETED' } }),
      prisma.kpiGoal.count(),
      prisma.instagramReachAnalysisRun.findFirst({ orderBy: { createdAt: 'desc' } }),
      prisma.manualCampaignRoom.count({ where: { status: 'ACTIVE' } })
    ]);

    const structuredContent = {
      generatedAt: new Date().toISOString(),
      runs: {
        total: totalRuns,
        last7Days: recentRunCount,
        deliverableCoveragePct: totalRuns > 0 ? Math.round((deliverableCount / totalRuns) * 100) : 0
      },
      datasets: {
        total: totalDatasets,
        analyzedPct: totalDatasets > 0 ? Math.round((analyzedDatasets / totalDatasets) * 100) : 0,
        backlog: totalDatasets - analyzedDatasets
      },
      learning: {
        total: totalLearning,
        confirmed: confirmedLearning,
        draft: draftLearning,
        confirmedPct: totalLearning > 0 ? Math.round((confirmedLearning / totalLearning) * 100) : 0
      },
      seminars: {
        running: runningSeminars,
        completed: completedSeminars
      },
      kpi: {
        totalGoals: totalKpiGoals
      },
      campaigns: {
        activeRooms
      },
      latestReach: latestReach ? summarizeInstagramAnalysis(latestReach) : null
    };

    return {
      content: textContent(structuredContent),
      structuredContent
    };
  }
);

server.registerPrompt(
  'run-retrospective',
  {
    title: 'Run Retrospective',
    description: 'Guide a model to analyze one run and extract strategic learnings.',
    argsSchema: {
      runId: z.string().describe('Target run id')
    }
  },
  async ({ runId }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `Analyze marketing run ${runId}. ` +
            `Start by calling the MCP tool "get_run_detail". ` +
            `Then produce: 1) executive summary 2) strongest evidence and sources 3) risks or blind spots 4) reusable lessons for future campaigns.`
        }
      }
    ]
  })
);

server.registerPrompt(
  'dataset-insight-brief',
  {
    title: 'Dataset Insight Brief',
    description: 'Guide a model to inspect one dataset and recommend actions.',
    argsSchema: {
      datasetId: z.string().describe('Target dataset id'),
      businessGoal: z.string().optional().describe('Optional business goal or KPI focus')
    }
  },
  async ({ datasetId, businessGoal }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `Review dataset ${datasetId}. Call "get_dataset_detail" first. ` +
            `Summarize the signal, bottlenecks, and three practical actions.` +
            (businessGoal ? ` Optimize recommendations for this goal: ${businessGoal}.` : '')
        }
      }
    ]
  })
);

server.registerPrompt(
  'learning-card-pack',
  {
    title: 'Learning Card Pack',
    description: 'Guide a model to turn learning cards into reusable playbooks.',
    argsSchema: {
      query: z.string().optional().describe('Keyword or tag to filter learning cards'),
      status: z.enum(['DRAFT', 'CONFIRMED', 'ARCHIVED']).optional().describe('Optional status filter')
    }
  },
  async ({ query, status }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `Create a reusable response playbook from learning cards. ` +
            `Call "list_learning_cards" first` +
            (query ? ` with query "${query}"` : '') +
            (status ? ` and status "${status}"` : '') +
            `. Then cluster similar situations, recommend the best confirmed patterns, and flag any draft cards that still need validation.`
        }
      }
    ]
  })
);

server.registerPrompt(
  'ops-weekly-digest',
  {
    title: 'Ops Weekly Digest',
    description: 'Guide a model to produce a concise weekly operations summary.',
    argsSchema: {}
  },
  async () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Produce a concise weekly operations digest. ' +
            'Call "get_operations_summary" first, then "list_seminar_sessions" with status RUNNING or COMPLETED, ' +
            'then "list_kpi_goals" to check goal health. ' +
            'Output: 1) headline numbers 2) top 3 priorities this week 3) risks or blockers 4) recommended next actions.'
        }
      }
    ]
  })
);

server.registerPrompt(
  'seminar-to-action',
  {
    title: 'Seminar to Action Plan',
    description: 'Turn a completed seminar session into a concrete action plan.',
    argsSchema: {
      sessionId: z.string().describe('Target seminar session id')
    }
  },
  async ({ sessionId }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            `Convert seminar session ${sessionId} into an executable action plan. ` +
            `Call "get_seminar_session" first. ` +
            `Then produce: 1) 3-line executive summary 2) key strategic decisions from the debate 3) ` +
            `5 concrete actions with owner role and deadline 4) risks to watch.`
        }
      }
    ]
  })
);

server.registerPrompt(
  'kpi-gap-analysis',
  {
    title: 'KPI Gap Analysis',
    description: 'Analyze current KPI goals and identify top gaps and quick wins.',
    argsSchema: {
      brand: z.string().optional().describe('Optional brand filter')
    }
  },
  async ({ brand }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Analyze KPI goal gaps and quick wins. ' +
            `Call "list_kpi_goals"${brand ? ` with brand "${brand}"` : ''}. ` +
            'Then: 1) rank goals by gap (farthest from target first) 2) identify which metrics need immediate attention ' +
            '3) suggest 3 specific actions to close the top gaps.'
        }
      }
    ]
  })
);

server.registerTool(
  'list_sns_personas',
  {
    title: 'List SNS Personas',
    description: 'List active SNS personas with platform, brand concept, and tone.',
    inputSchema: {}
  },
  async () => {
    const personas = await prisma.snsPersona.findMany({
      where: { isActive: true },
      select: { id: true, name: true, platform: true, brandConcept: true, tone: true },
    })
    const structuredContent = { count: personas.length, personas }
    return { content: textContent(structuredContent), structuredContent }
  }
);

// ── Seminar Sessions ──────────────────────────────────────────────────────

server.registerTool(
  'get_seminar_session',
  {
    title: 'Get Seminar Session Detail',
    description: 'Get details of a specific seminar session including rounds and final report.',
    inputSchema: {
      sessionId: z.string().min(1)
    }
  },
  async ({ sessionId }) => {
    const session = await prisma.seminarSession.findUnique({
      where: { id: sessionId },
      include: {
        rounds: { orderBy: { roundNumber: 'asc' } },
        finalReport: true
      }
    });
    if (!session) {
      return { content: [{ type: 'text', text: 'Session not found.' }], isError: true };
    }
    const structuredContent = {
      id: session.id,
      title: session.title,
      topic: session.topic,
      status: session.status,
      totalRounds: session.totalRounds,
      rounds: session.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        status: r.status,
        summary: (r.content || '').slice(0, 200)
      })),
      hasFinalReport: !!session.finalReport
    };
    return { content: textContent(structuredContent), structuredContent };
  }
);

// ── Campaign Rooms ────────────────────────────────────────────────────────

server.registerTool(
  'list_campaign_rooms',
  {
    title: 'List Campaign Rooms',
    description: 'List active campaign rooms with brand, region, and goal.',
    inputSchema: {
      status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
      limit: z.number().int().min(1).max(50).default(20)
    }
  },
  async ({ status, limit = 20 }) => {
    const rooms = await prisma.manualCampaignRoom.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    const structuredContent = {
      count: rooms.length,
      rooms: rooms.map((r) => ({
        id: r.id,
        title: r.title,
        brand: r.brand,
        region: r.region,
        goal: r.goal,
        status: r.status,
        updatedAt: r.updatedAt
      }))
    };
    return { content: textContent(structuredContent), structuredContent };
  }
);

// ── Recommendations ───────────────────────────────────────────────────────

server.registerTool(
  'get_action_recommendations',
  {
    title: 'Get Action Recommendations',
    description: 'Compute and return prioritized action recommendations based on KPI, approvals, campaigns, and seminars.',
    inputSchema: {}
  },
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      const res = await fetch(`${baseUrl}/api/recommendations`);
      if (!res.ok) {
        return { content: [{ type: 'text', text: 'Recommendations API failed.' }], isError: true };
      }
      const data = await res.json();
      return { content: textContent(data), structuredContent: data };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message || e}` }], isError: true };
    }
  }
);

// ── Scheduled Jobs ────────────────────────────────────────────────────────

server.registerTool(
  'list_scheduled_jobs',
  {
    title: 'List Scheduled Jobs',
    description: 'List all registered automated jobs with their status and schedule.',
    inputSchema: {}
  },
  async () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    try {
      const res = await fetch(`${baseUrl}/api/jobs`);
      if (!res.ok) {
        return { content: [{ type: 'text', text: 'Jobs API failed.' }], isError: true };
      }
      const data = await res.json();
      return { content: textContent(data), structuredContent: data };
    } catch (e) {
      return { content: [{ type: 'text', text: `Error: ${e.message || e}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Garnet MCP server running on stdio');
}

async function shutdown(signal) {
  console.error(`Received ${signal}, shutting down MCP server...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

main().catch(async (error) => {
  console.error('MCP server error:', error);
  await prisma.$disconnect();
  process.exit(1);
});
