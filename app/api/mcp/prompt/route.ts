import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mcpConnectionSchema } from '@/lib/mcp-connections';
import { withLocalMcpClient, withMcpClient } from '@/lib/mcp-client';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
  connection: mcpConnectionSchema.optional()
});

function normalizePromptArgs(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, arg]) => [key, String(arg ?? '')]));
}

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const startedAt = Date.now();
    const runner = body.connection
      ? withMcpClient(body.connection, async (client) =>
          client.getPrompt({
            name: body.name,
            arguments: normalizePromptArgs(body.arguments)
          })
        )
      : withLocalMcpClient(async (client) =>
          client.getPrompt({
            name: body.name,
            arguments: normalizePromptArgs(body.arguments)
          })
        );
    const { data, stderr } = await runner;

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      stderr,
      result: data
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'MCP prompt 조회 실패'
      },
      { status: 500 }
    );
  }
}
