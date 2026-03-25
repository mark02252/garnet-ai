import path from 'node:path';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  canInspectMcpConnection,
  createDefaultMcpHubDraft,
  getMcpConnectionById,
  type McpConnectionDraft
} from '@/lib/mcp-connections';
import { isDesktop } from '@/lib/platform';

function stringifyEnv(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function resolveMcpServerScriptPath() {
  const candidates = [
    path.join(process.cwd(), 'scripts', 'mcp-server.mjs'),
    path.join(process.cwd(), '..', 'scripts', 'mcp-server.mjs'),
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app.asar', 'scripts', 'mcp-server.mjs') : '',
    (process as any).resourcesPath ? path.join((process as any).resourcesPath, 'app.asar.unpacked', 'scripts', 'mcp-server.mjs') : ''
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error('MCP server script를 찾을 수 없습니다.');
}

function buildBuiltinLaunchParams() {
  const scriptPath = resolveMcpServerScriptPath();
  const env = stringifyEnv(process.env);

  if (isDesktop() && process.versions.electron) {
    env.ELECTRON_RUN_AS_NODE = '1';
  }

  return {
    command: process.execPath,
    args: [scriptPath],
    cwd: process.cwd(),
    env
  };
}

function buildHeaders(connection: McpConnectionDraft) {
  const headers: Record<string, string> = {};

  if (connection.authMode === 'bearer' && connection.bearerToken.trim()) {
    headers.Authorization = `Bearer ${connection.bearerToken.trim()}`;
  }

  if (connection.authMode === 'basic' && (connection.basicUsername.trim() || connection.basicPassword.trim())) {
    headers.Authorization = `Basic ${Buffer.from(
      `${connection.basicUsername.trim()}:${connection.basicPassword.trim()}`
    ).toString('base64')}`;
  }

  return headers;
}

function getDefaultLocalConnection() {
  const hub = createDefaultMcpHubDraft();
  return getMcpConnectionById(hub, 'aimd-local') || hub.connections[0];
}

function createTransport(connection: McpConnectionDraft) {
  if (connection.transport === 'builtin-local') {
    return {
      transport: new StdioClientTransport({
        ...buildBuiltinLaunchParams(),
        stderr: 'pipe'
      }),
      stderrSupported: true
    };
  }

  if (connection.transport === 'stdio') {
    const command = connection.command.trim();
    if (!command) {
      throw new Error(`${connection.name} 연결에 실행 명령이 없습니다.`);
    }

    const env = stringifyEnv(process.env);
    let resolvedArgs = connection.args || [];

    // Bearer token이 있는 stdio 서버 처리
    if (connection.authMode === 'bearer' && connection.bearerToken.trim()) {
      const token = connection.bearerToken.trim();

      // --access-token 인자가 있으면 다음 위치에 토큰 삽입 (Supabase MCP 등)
      const tokenArgIndex = resolvedArgs.indexOf('--access-token');
      if (tokenArgIndex !== -1) {
        resolvedArgs = [...resolvedArgs];
        if (tokenArgIndex + 1 < resolvedArgs.length) {
          // 플레이스홀더가 있으면 교체
          resolvedArgs[tokenArgIndex + 1] = token;
        } else {
          // --access-token이 마지막 인자면 토큰을 뒤에 추가
          resolvedArgs.push(token);
        }
      }

      // Notion MCP는 NOTION_TOKEN을 사용 (OPENAPI_MCP_HEADERS보다 우선하며 Notion-Version 헤더 포함)
      if (resolvedArgs.some(a => a.includes('notion-mcp-server'))) {
        env.NOTION_TOKEN = token;
      // Slack MCP는 SLACK_BOT_TOKEN을 사용 (xoxb-... Bot Token)
      } else if (resolvedArgs.some(a => a.includes('server-slack'))) {
        env.SLACK_BOT_TOKEN = token;
      } else {
        // 그 외 HTTP 방식 MCP 서버를 위한 OPENAPI_MCP_HEADERS 설정
        env.OPENAPI_MCP_HEADERS = JSON.stringify({
          Authorization: `Bearer ${token}`
        });
      }
    }

    return {
      transport: new StdioClientTransport({
        command,
        args: resolvedArgs,
        cwd: process.cwd(),
        env,
        stderr: 'pipe'
      }),
      stderrSupported: true
    };
  }

  const rawUrl = connection.url.trim();
  if (!rawUrl) {
    throw new Error(`${connection.name} 연결에 endpoint URL이 없습니다.`);
  }

  return {
    transport: new StreamableHTTPClientTransport(new URL(rawUrl), {
      requestInit: {
        headers: buildHeaders(connection)
      }
    }),
    stderrSupported: false
  };
}

export async function withMcpClient<T>(
  connection: McpConnectionDraft,
  run: (client: Client, context: { stderrLines: string[]; connection: McpConnectionDraft }) => Promise<T>
): Promise<{ data: T; stderr: string[] }> {
  if (!canInspectMcpConnection(connection)) {
    throw new Error(`${connection.name} 연결은 아직 점검할 준비가 되지 않았습니다.`);
  }

  const client = new Client({
    name: 'garnet-app',
    version: '0.2.0'
  });
  const { transport, stderrSupported } = createTransport(connection);
  const stderrLines: string[] = [];

  if (stderrSupported && 'stderr' in transport && transport.stderr) {
    transport.stderr.on('data', (chunk: unknown) => {
      const text = String(chunk || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      stderrLines.push(...text);
    });
  }

  await client.connect(transport);

  try {
    const data = await run(client, { stderrLines, connection });
    return { data, stderr: stderrLines };
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function withLocalMcpClient<T>(
  run: (client: Client, context: { stderrLines: string[]; connection: McpConnectionDraft }) => Promise<T>
): Promise<{ data: T; stderr: string[] }> {
  return withMcpClient(getDefaultLocalConnection(), run);
}
