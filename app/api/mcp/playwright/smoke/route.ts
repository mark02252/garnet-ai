import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mcpConnectionSchema } from '@/lib/mcp-connections';
import { withMcpClient } from '@/lib/mcp-client';
import { buildPlaywrightScenarioUrl, getPlaywrightSmokeScenario, normalizePlaywrightBaseUrl } from '@/lib/playwright-smoke';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  scenarioId: z.string().min(1),
  baseUrl: z.string().optional(),
  autoInstallBrowser: z.boolean().default(true),
  connection: mcpConnectionSchema
});

type StepResult = {
  id: string;
  title: string;
  ok: boolean;
  summary: string;
};

function clipText(value: string, max = 560) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function extractTextPayload(result: unknown) {
  const payload = result as {
    content?: Array<{ type?: string; text?: string }>;
  };

  return (payload.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => String(item.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function isBrowserInstallIssue(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('browser') &&
    (lower.includes('install') || lower.includes('executable') || lower.includes('not found') || lower.includes('missing'))
  );
}

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const scenario = getPlaywrightSmokeScenario(body.scenarioId);

    if (!scenario) {
      return NextResponse.json(
        {
          ok: false,
          error: '알 수 없는 Playwright 점검 시나리오입니다.'
        },
        { status: 400 }
      );
    }

    const startedAt = Date.now();
    const baseUrl = normalizePlaywrightBaseUrl(body.baseUrl);
    const targetUrl = buildPlaywrightScenarioUrl(baseUrl, scenario.path);
    const { data, stderr } = await withMcpClient(body.connection, async (client) => {
      const tools = await client.listTools();
      const availableTools = new Set((tools.tools || []).map((tool) => tool.name));
      const requiredTools = ['browser_navigate', 'browser_wait_for', 'browser_snapshot'];

      for (const toolName of requiredTools) {
        if (!availableTools.has(toolName)) {
          throw new Error(`선택한 MCP 연결에 ${toolName} 도구가 없습니다.`);
        }
      }

      const steps: StepResult[] = [];

      const callToolText = async (name: string, args: Record<string, unknown>) => {
        const result = await client.callTool({
          name,
          arguments: args
        });
        return {
          result,
          text: extractTextPayload(result)
        };
      };

      const navigateWithRecovery = async () => {
        try {
          return await callToolText('browser_navigate', { url: targetUrl });
        } catch (error) {
          const message = error instanceof Error ? error.message : '브라우저 시작 실패';
          if (!body.autoInstallBrowser || !availableTools.has('browser_install') || !isBrowserInstallIssue(message)) {
            throw error;
          }

          await client.callTool({
            name: 'browser_install',
            arguments: {}
          });
          steps.push({
            id: 'install',
            title: '브라우저 설치',
            ok: true,
            summary: '첫 실행에 필요한 브라우저를 자동으로 설치했습니다.'
          });
          return callToolText('browser_navigate', { url: targetUrl });
        }
      };

      const navigate = await navigateWithRecovery();
      steps.push({
        id: 'navigate',
        title: '페이지 열기',
        ok: true,
        summary: `${scenario.path} 화면으로 이동했습니다.`
      });

      const waited = await callToolText('browser_wait_for', {
        text: scenario.waitForText
      });
      steps.push({
        id: 'wait',
        title: '문구 대기',
        ok: true,
        summary: `핵심 문구 "${scenario.waitForText}" 가 화면에 나타났습니다.`
      });

      const snapshot = await callToolText('browser_snapshot', {});
      steps.push({
        id: 'snapshot',
        title: '화면 스냅샷',
        ok: true,
        summary: '접근성 스냅샷을 수집해 최종 확인에 사용했습니다.'
      });

      const combinedEvidence = [navigate.text, waited.text, snapshot.text].filter(Boolean).join('\n\n');
      const passed = scenario.expectedText.every((entry) => combinedEvidence.toLowerCase().includes(entry.toLowerCase()));
      steps.push({
        id: 'assert',
        title: '기준 검증',
        ok: passed,
        summary: passed
          ? '기대한 주요 문구가 모두 확인되었습니다.'
          : `기대한 문구 일부가 보이지 않았습니다: ${scenario.expectedText.join(', ')}`
      });

      if (availableTools.has('browser_close')) {
        await client
          .callTool({
            name: 'browser_close',
            arguments: {}
          })
          .catch(() => undefined);
      }

      return {
        ok: true,
        passed,
        scenario: {
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
          path: scenario.path
        },
        targetUrl,
        expectedText: scenario.expectedText,
        snapshotExcerpt: clipText(snapshot.text),
        evidenceText: clipText(combinedEvidence, 1800),
        steps
      };
    });

    return NextResponse.json({
      ...data,
      ok: true,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      stderr
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Playwright MCP 점검 실패'
      },
      { status: 500 }
    );
  }
}
