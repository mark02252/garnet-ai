import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mcpConnectionSchema } from '@/lib/mcp-connections';
import { withLocalMcpClient, withMcpClient } from '@/lib/mcp-client';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  uri: z.string().min(1),
  connection: mcpConnectionSchema.optional()
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const startedAt = Date.now();
    const runner = body.connection
      ? withMcpClient(body.connection, async (client) =>
          client.readResource({
            uri: body.uri
          })
        )
      : withLocalMcpClient(async (client) =>
          client.readResource({
            uri: body.uri
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
        error: error instanceof Error ? error.message : 'MCP resource 조회 실패'
      },
      { status: 500 }
    );
  }
}
