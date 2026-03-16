import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mcpConnectionSchema } from '@/lib/mcp-connections';
import { withLocalMcpClient, withMcpClient } from '@/lib/mcp-client';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  connection: mcpConnectionSchema.optional()
});

async function inspectWithConnection(connection?: z.infer<typeof mcpConnectionSchema>) {
  try {
    const startedAt = Date.now();
    const runner = connection ? withMcpClient(connection, async (client) => {
      const [tools, resources, prompts] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts()
      ]);

      return {
        server: client.getServerVersion(),
        instructions: client.getInstructions(),
        capabilities: client.getServerCapabilities(),
        tools: tools.tools,
        resources: resources.resources,
        prompts: prompts.prompts
      };
    }) : withLocalMcpClient(async (client) => {
      const [tools, resources, prompts] = await Promise.all([
        client.listTools(),
        client.listResources(),
        client.listPrompts()
      ]);

      return {
        server: client.getServerVersion(),
        instructions: client.getInstructions(),
        capabilities: client.getServerCapabilities(),
        tools: tools.tools,
        resources: resources.resources,
        prompts: prompts.prompts
      };
    });
    const { data, stderr } = await runner;

    return NextResponse.json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      stderr,
      ...data
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'MCP 인스펙션 실패'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return inspectWithConnection();
}

export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  return inspectWithConnection(body.connection);
}
