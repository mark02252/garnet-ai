import { z } from 'zod';

export const mcpConnectionTransportSchema = z.enum(['builtin-local', 'stdio', 'streamable-http']);
export const mcpConnectionAuthModeSchema = z.enum(['none', 'bearer', 'basic']);
export const mcpConnectionSetupModeSchema = z.enum(['builtin', 'command', 'url', 'oauth', 'manual']);
export const mcpConnectionScopeSchema = z.enum(['internal', 'workspace', 'design', 'qa', 'observability', 'delivery', 'data']);
export const mcpConnectionPhaseSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const mcpConnectionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  phase: mcpConnectionPhaseSchema,
  scope: mcpConnectionScopeSchema,
  transport: mcpConnectionTransportSchema,
  setupMode: mcpConnectionSetupModeSchema,
  authMode: mcpConnectionAuthModeSchema.default('none'),
  enabled: z.boolean().default(false),
  readonly: z.boolean().default(false),
  command: z.string().default(''),
  args: z.array(z.string()).default([]),
  url: z.string().default(''),
  bearerToken: z.string().default(''),
  basicUsername: z.string().default(''),
  basicPassword: z.string().default(''),
  documentationUrl: z.string().default(''),
  setupHint: z.string().default(''),
  note: z.string().default(''),
  recommendedScreens: z.array(z.string()).default([])
});

export const mcpHubDraftSchema = z.object({
  activeConnectionId: z.string().default('aimd-local'),
  connections: z.array(mcpConnectionSchema).default([])
});

export type McpConnectionDraft = z.infer<typeof mcpConnectionSchema>;
export type McpHubDraft = z.infer<typeof mcpHubDraftSchema>;

const MCP_PRESET_CONNECTIONS: McpConnectionDraft[] = [
  {
    id: 'aimd-local',
    name: '내부 AIMD 서버',
    description: '현재 앱의 실행 기록, 데이터셋, 학습 카드, 인스타그램 성과를 읽는 내장 MCP 서버',
    phase: 0,
    scope: 'internal',
    transport: 'builtin-local',
    setupMode: 'builtin',
    authMode: 'none',
    enabled: true,
    readonly: true,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: '',
    setupHint: '앱과 함께 바로 사용할 수 있습니다.',
    note: 'AI 연결 센터의 기본 데이터 소스로 사용됩니다.',
    recommendedScreens: ['설정', '캠페인 스튜디오', '데이터 스튜디오', '학습 인사이트']
  },
  {
    id: 'playwright',
    name: 'Playwright MCP',
    description: '로컬 UI 플로우를 자동으로 검증하는 QA 연결',
    phase: 1,
    scope: 'qa',
    transport: 'stdio',
    setupMode: 'command',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: 'npx',
    args: [
      '@playwright/mcp@latest',
      '--headless',
      '--isolated',
      '--viewport-size',
      '1440x960',
      '--timeout-action',
      '15000',
      '--timeout-navigation',
      '90000'
    ],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://github.com/microsoft/playwright-mcp',
    setupHint: '캠페인 스튜디오, 세미나, 데이터 업로드 흐름의 smoke test에 가장 먼저 연결하기 좋습니다. 브라우저가 없으면 연결 후 browser_install 또는 npx playwright install chromium 이 필요할 수 있습니다.',
    note: 'Wave 1 우선 연결 권장',
    recommendedScreens: ['캠페인 스튜디오', '세미나', '데이터 스튜디오']
  },
  {
    id: 'figma',
    name: 'Figma MCP',
    description: '선택한 Figma 프레임과 컴포넌트를 기준으로 디자인 컨텍스트를 가져옵니다.',
    phase: 1,
    scope: 'design',
    transport: 'streamable-http',
    setupMode: 'manual',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://developers.figma.com/docs/figma-mcp-server/',
    setupHint: 'Figma Desktop 또는 Remote MCP URL을 준비한 뒤 연결합니다.',
    note: '디자인 마감 단계에서 사용하는 연결입니다.',
    recommendedScreens: ['설정', '캠페인 스튜디오', '세미나']
  },
  {
    id: 'notion',
    name: 'Notion MCP',
    description: '브리프, 세미나 리포트, 학습 플레이북을 Notion 워크스페이스로 발행합니다.',
    phase: 1,
    scope: 'workspace',
    transport: 'streamable-http',
    setupMode: 'oauth',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: 'https://mcp.notion.com/mcp',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://developers.notion.com/docs/mcp',
    setupHint: 'OAuth 승인 흐름이 필요한 remote MCP입니다. 연결 허브 기반 이후 인증 플로우를 추가합니다.',
    note: 'Wave 1 문서화/지식 축적 연결',
    recommendedScreens: ['캠페인 스튜디오', '세미나', '학습 인사이트']
  },
  {
    id: 'sentry',
    name: 'Sentry MCP',
    description: '배포 후 오류, 이슈, 성능 병목을 요약합니다.',
    phase: 2,
    scope: 'observability',
    transport: 'stdio',
    setupMode: 'command',
    authMode: 'bearer',
    enabled: false,
    readonly: false,
    command: 'npx',
    args: ['@sentry/mcp-server@latest'],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://github.com/getsentry/sentry-mcp',
    setupHint: 'Sentry access token을 입력하면 오류 요약과 검색을 연결할 수 있습니다.',
    note: 'Wave 2 운영 관측 연결',
    recommendedScreens: ['설정', '운영 센터(예정)']
  },
  {
    id: 'browserstack',
    name: 'BrowserStack MCP',
    description: '실제 브라우저와 디바이스에서 플로우를 검증합니다.',
    phase: 2,
    scope: 'qa',
    transport: 'streamable-http',
    setupMode: 'manual',
    authMode: 'basic',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://github.com/browserstack/mcp-server',
    setupHint: 'BrowserStack MCP endpoint와 계정 인증 정보가 준비된 뒤 연결합니다.',
    note: 'Wave 2 실제 디바이스 검증용',
    recommendedScreens: ['캠페인 스튜디오', '세미나', '운영 센터(예정)']
  },
  {
    id: 'github',
    name: 'GitHub MCP',
    description: '이슈 생성, 구현 태스크 정리, 운영 이슈 연결에 사용하는 개발 운영 연결',
    phase: 3,
    scope: 'delivery',
    transport: 'streamable-http',
    setupMode: 'oauth',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/use-the-github-mcp-server',
    setupHint: '운영 자동화용 연결입니다. 제품 핵심 기능보다 후순위로 붙이는 것이 좋습니다.',
    note: 'Wave 3 운영 확장',
    recommendedScreens: ['설정', '운영 센터(예정)']
  },
  {
    id: 'vercel',
    name: 'Vercel MCP',
    description: '배포 상태, 로그, 실험용 랜딩 연결을 위한 delivery 연결',
    phase: 3,
    scope: 'delivery',
    transport: 'streamable-http',
    setupMode: 'oauth',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://vercel.com/docs/agent-resources/vercel-mcp',
    setupHint: '배포 센터를 만들 때 함께 연결하는 것이 가장 자연스럽습니다.',
    note: 'Wave 3 배포 운영 연결',
    recommendedScreens: ['설정', '운영 센터(예정)']
  },
  {
    id: 'db-toolbox',
    name: 'DB MCP Toolbox',
    description: '운영 DB와 분석 DB를 MCP 도구 계층으로 확장합니다.',
    phase: 3,
    scope: 'data',
    transport: 'streamable-http',
    setupMode: 'manual',
    authMode: 'none',
    enabled: false,
    readonly: false,
    command: '',
    args: [],
    url: '',
    bearerToken: '',
    basicUsername: '',
    basicPassword: '',
    documentationUrl: 'https://github.com/googleapis/genai-toolbox',
    setupHint: '외부 DB나 웨어하우스 연결이 필요해지는 시점에 맞춰 추가합니다.',
    note: 'Wave 3 데이터 확장',
    recommendedScreens: ['데이터 스튜디오', '운영 센터(예정)']
  }
];

export function createDefaultMcpHubDraft(): McpHubDraft {
  return {
    activeConnectionId: 'aimd-local',
    connections: MCP_PRESET_CONNECTIONS.map((connection) => ({
      ...connection,
      args: [...connection.args],
      recommendedScreens: [...connection.recommendedScreens]
    }))
  };
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArgs(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function mergeConnectionWithPreset(candidate: unknown, preset: McpConnectionDraft): McpConnectionDraft {
  const parsed = mcpConnectionSchema.safeParse({
    ...preset,
    ...(candidate && typeof candidate === 'object' ? candidate : {})
  });
  const value = parsed.success ? parsed.data : preset;

  return {
    ...preset,
    enabled: preset.readonly ? preset.enabled : value.enabled,
    authMode: value.authMode,
    command: value.transport === 'stdio' ? normalizeText(value.command) : preset.command,
    args: value.transport === 'stdio' ? normalizeArgs(value.args) : preset.args,
    url: value.transport === 'streamable-http' ? normalizeText(value.url) : preset.url,
    bearerToken: normalizeText(value.bearerToken),
    basicUsername: normalizeText(value.basicUsername),
    basicPassword: normalizeText(value.basicPassword),
    note: normalizeText(value.note) || preset.note
  };
}

export function mergeMcpHubDraft(defaults: McpHubDraft, raw: unknown): McpHubDraft {
  const baseline = defaults?.connections?.length ? defaults : createDefaultMcpHubDraft();
  const parsed = mcpHubDraftSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : { activeConnectionId: baseline.activeConnectionId, connections: [] };
  const incomingById = new Map(input.connections.map((connection) => [connection.id, connection]));
  const connections = baseline.connections.map((preset) => mergeConnectionWithPreset(incomingById.get(preset.id), preset));
  const activeConnectionId = connections.some((connection) => connection.id === input.activeConnectionId)
    ? input.activeConnectionId
    : baseline.activeConnectionId;

  return {
    activeConnectionId,
    connections
  };
}

export function getMcpConnectionById(hub: McpHubDraft, id?: string | null) {
  if (!id) return null;
  return hub.connections.find((connection) => connection.id === id) || null;
}

export function getActiveMcpConnection(hub: McpHubDraft) {
  return getMcpConnectionById(hub, hub.activeConnectionId) || hub.connections[0] || null;
}

export function getMcpConnectionPhaseLabel(phase: McpConnectionDraft['phase']) {
  switch (phase) {
    case 0:
      return '내장 연결';
    case 1:
      return 'Wave 1';
    case 2:
      return 'Wave 2';
    case 3:
      return 'Wave 3';
    default:
      return '기타';
  }
}

export function describeMcpConnectionReadiness(connection: McpConnectionDraft) {
  if (connection.transport === 'builtin-local') {
    return {
      ready: true,
      tone: 'ready' as const,
      label: '즉시 사용 가능',
      detail: '현재 앱과 함께 번들된 내부 MCP 서버입니다.'
    };
  }

  if (connection.setupMode === 'oauth') {
    return {
      ready: false,
      tone: 'planned' as const,
      label: 'OAuth 단계 예정',
      detail: connection.setupHint || '앱 내 승인 플로우를 추가한 뒤 연결할 수 있습니다.'
    };
  }

  if (connection.transport === 'stdio') {
    const commandReady = Boolean(normalizeText(connection.command));
    return commandReady
      ? {
          ready: true,
          tone: 'ready' as const,
          label: '명령 준비됨',
          detail: '연결 점검을 실행해 실제 도구 목록을 확인할 수 있습니다.'
        }
      : {
          ready: false,
          tone: 'setup' as const,
          label: '명령 필요',
          detail: '실행할 MCP 명령을 먼저 입력해 주세요.'
        };
  }

  const urlReady = Boolean(normalizeText(connection.url));
  return urlReady
    ? {
        ready: true,
        tone: 'ready' as const,
        label: '엔드포인트 준비됨',
        detail: '연결 점검을 실행해 실제 응답을 확인할 수 있습니다.'
      }
    : {
        ready: false,
        tone: connection.setupMode === 'manual' ? ('setup' as const) : ('planned' as const),
        label: connection.setupMode === 'manual' ? '엔드포인트 필요' : '준비 중',
        detail: connection.setupHint || '연결 정보가 더 필요합니다.'
      };
}

export function canInspectMcpConnection(connection: McpConnectionDraft) {
  const readiness = describeMcpConnectionReadiness(connection);
  if (!readiness.ready) return false;
  if (!connection.enabled && connection.transport !== 'builtin-local') return false;
  if (connection.setupMode === 'oauth') return false;
  return true;
}
