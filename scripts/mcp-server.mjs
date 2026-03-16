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
      'Use the Garnet tools to inspect marketing runs, datasets, learning archives, and Instagram reach analyses. Prefer overview resources first, then call detail tools when deeper evidence is needed.'
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
    const [runCount, datasetCount, learningCount, confirmedLearningCount, latestRun, latestDataset, latestInstagram] =
      await Promise.all([
        prisma.run.count(),
        prisma.dataset.count(),
        prisma.learningArchive.count(),
        prisma.learningArchive.count({ where: { status: 'CONFIRMED' } }),
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
        confirmedLearningCards: confirmedLearningCount
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
