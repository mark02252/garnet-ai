# Flow Builder — 스펙 문서

## 개요

사용자가 에이전트 노드를 드래그앤드롭으로 배치하고 연결해 토론 파이프라인을 직접 구성하고 실행하는 시스템. 기존 `/seminar`의 하드코딩된 5명 순서 파이프라인을 대체하지 않고, 별도 `/flow` 페이지에서 사용자 정의 플로우를 만들어 즉시 실행하는 기능을 추가한다.

## 목표

- ReactFlow 캔버스에서 에이전트 노드 배치 + 연결 → 파이프라인 토폴로지 정의
- 저장된 FlowTemplate을 불러와 재사용
- 실행 시 노드별 진행 상태 실시간 표시 (캔버스 위에서 직접)
- 기존 `/seminar` 및 `pipeline.ts`는 변경 없이 유지 (하위 호환)

## 데이터 모델

```prisma
model FlowTemplate {
  id          String    @id @default(cuid())
  name        String
  description String?
  nodes       String    // JSON: FlowNode[]
  edges       String    // JSON: FlowEdge[]
  lastRunAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

### FlowNode 타입 정의

```typescript
type StartNode = {
  type: 'start'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string     // 기본 토픽 (실행 시 오버라이드 가능)
    brand?: string    // 웹 검색 ToolNode에 전달
    region?: string
    goal?: string
  }
}

type AgentNode = {
  type: 'agent'
  id: string
  position: { x: number; y: number }
  data: {
    role: string          // 표시 이름 (e.g. "성장전략가")
    agentKey?: string     // 팔레트 프리셋 에이전트 식별자 (e.g. "GROWTH_STRATEGIST") — UI 전용, 런타임에서 미사용
    model: 'claude' | 'gemini' | 'gpt' | 'groq'
    systemPrompt: string  // 항상 명시적으로 저장됨 — 실행 시 이 값을 직접 사용
  }
}
// agentKey 사용 규칙:
// - 팔레트에서 프리셋 에이전트를 캔버스에 드롭할 때 UI가 agent-config.ts에서 프로필을 조회하여 systemPrompt를 자동 생성
// - systemPrompt 생성 방법: `${profile.roleSummary}\n\n지침:\n${profile.instructions.join('\n')}\n\n금지:\n${profile.antiPatterns.join('\n')}`
// - profile 조회: Object.values(DEFAULT_DOMAIN_AGENT_POOL).flat().find(p => p.id === agentKey)
// - 이후 실행 엔진은 agentKey를 무시하고 node.data.systemPrompt만 사용

type ToolNode = {
  type: 'tool'
  id: string
  position: { x: number; y: number }
  data: { toolType: 'web-search' }
  // brand/region/goal은 업스트림 StartNode.data에서 상속
}

type EndNode = {
  type: 'end'
  id: string
  position: { x: number; y: number }
  data: Record<string, never>
}

type FlowNode = StartNode | AgentNode | ToolNode | EndNode

type FlowEdge = {
  id: string
  source: string   // 노드 id
  target: string   // 노드 id
}
```

### 유효성 검증 (저장 시 서버에서 수행)

- StartNode / EndNode는 각각 정확히 1개
- 사이클 금지 — 위상 정렬(Kahn's algorithm) 실패 시 400 반환
- StartNode에서 EndNode까지 경로가 존재해야 함 (도달 불가 노드는 저장 시 400 반환)

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/flow-templates` | 목록 조회 |
| POST | `/api/flow-templates` | 새 템플릿 생성 |
| GET | `/api/flow-templates/[id]` | 단일 조회 |
| PATCH | `/api/flow-templates/[id]` | 노드/엣지/이름 저장 |
| DELETE | `/api/flow-templates/[id]` | 삭제 |
| POST | `/api/flow-templates/[id]/run` | 즉시 실행 (SSE 스트림) |

### POST `/api/flow-templates/[id]/run`

요청 body:
```typescript
{
  topic: string       // 토론 주제 (StartNode.data.topic 오버라이드)
  brand?: string
  region?: string
  goal?: string
}
```

응답: `Content-Type: text/event-stream`

SSE 이벤트 포맷:
```typescript
type FlowRunEvent =
  | { type: 'run-start';     runId: string }          // Run DB 레코드 생성 직후
  | { type: 'node-start';    nodeId: string }
  | { type: 'node-done';     nodeId: string; output: string }
  | { type: 'node-error';    nodeId: string; error: string }
  | { type: 'flow-complete'; runId: string }           // Deliverable 저장 완료 후
  | { type: 'flow-error';    error: string }
```

## 실행 엔진 (`lib/flow-runner.ts`)

### Run 레코드 생성 시점

`run-start` 직전 — 즉, 노드 실행 시작 전에 `Run` DB 레코드를 생성한다. `runId`는 이때 확정되어 이후 모든 이벤트에서 참조된다. EndNode DB 저장 실패 시 `flow-error` 이벤트를 발행하고 Run status를 'error'로 마크한다.

### Run 레코드 필드 매핑

`Run` 모델의 필수 필드는 `topic` 뿐이다. 나머지는 optional이거나 자동 생성된다.

```typescript
await prisma.run.create({
  data: {
    topic: runInput.topic,
    brand: runInput.brand ?? null,
    region: runInput.region ?? null,
    goal: runInput.goal ?? null,
    // id: uuid (자동), createdAt: now() (자동)
    // 관계 필드(meetingTurns, deliverable 등)는 나중에 연결
  }
})
```

### Deliverable 생성 (EndNode)

```typescript
await prisma.deliverable.create({
  data: {
    runId,
    type: 'CAMPAIGN_PLAN',  // Flow 실행은 항상 CAMPAIGN_PLAN으로 고정
    content: JSON.stringify({
      documentType: 'CAMPAIGN_PLAN',
      title: `Flow 실행 결과: ${topic}`,
      rawOutputs: nodeOutputs,  // Record<nodeId, string> 전체 저장
    }),
  }
})
```

### 실행 순서

1. FlowTemplate JSON 로드 → Kahn's algorithm으로 위상 정렬
2. **StartNode 처리 (depth 0):** 실행 없이 `context.set(startNode.id, runInput.topic)` 기록
3. 같은 depth의 나머지 노드를 `Promise.all`로 병렬 실행
4. 각 노드 완료 시 `context Map<nodeId, string>`에 출력 저장
5. 다운스트림 노드 실행 시 업스트림 출력을 userPrompt로 조립

### 모델 → RuntimeConfig 매핑

```typescript
const MODEL_RUNTIME: Record<AgentNode['data']['model'], Partial<RuntimeConfig>> = {
  claude:  { llmProvider: 'claude' },
  gemini:  { llmProvider: 'gemini' },
  gpt:     { llmProvider: 'openai' },
  groq:    { llmProvider: 'groq' },
}
```

### UserPrompt 조립 규칙 (AgentNode)

업스트림 노드 출력을 레이블과 함께 결합:

```
주제: {startNode.data.topic}

[업스트림 노드 역할명 또는 toolType]
{업스트림 노드 출력}

[업스트림 노드 역할명 또는 toolType]
{업스트림 노드 출력}

위 맥락을 바탕으로 당신의 역할({role})에 맞게 분석하고 의견을 제시하세요.
```

업스트림이 StartNode인 경우 레이블: `"주제"`, ToolNode인 경우: `"웹 검색 결과"`, AgentNode인 경우: `data.role` 값 사용.

### ToolNode (web-search) 실행

`getStartNode(nodes)`: `nodes.find(n => n.type === 'start') as StartNode`. StartNode는 항상 정확히 1개 (저장 유효성 검증에서 보장).

```typescript
const start = getStartNode(nodes)   // nodes 배열에서 type === 'start' 노드를 찾음
const hits = await runWebSearchWithRuntime(
  context.get(start.id)!,   // StartNode의 출력 = topic 텍스트
  start.data.brand,
  start.data.region,
  start.data.goal,
)
return hits.map(h => `${h.title}\n${h.snippet}`).join('\n\n')
```

### 에러 처리

- 개별 노드 실패 → `node-error` 발행, 해당 노드는 `context` Map에 저장되지 않음
- 다운스트림 노드 실행 전, **모든 직접 업스트림 중 하나라도 context에 없으면** 해당 노드도 건너뜀 (node-error 발행 없이 조용히 스킵)
  - 즉, 병렬 브랜치에서 A→C, B→C일 때 A 성공 + B 실패인 경우: C는 건너뜀
  - 이 정책은 "부분 성공으로 진행"보다 "데이터 완전성 보장"을 우선함
- EndNode의 직접 업스트림이 모두 context에 없으면 `flow-error` 발행
- 최대 실행 시간: 10분 (`AbortSignal.timeout(600_000)`)

## Zustand Store (`lib/flow-run-store.ts`)

```typescript
type NodeStatus = 'idle' | 'running' | 'done' | 'error'

type FlowRunStore = {
  runId: string | null
  nodeStatuses: Record<string, NodeStatus>   // nodeId → status
  nodeOutputs:  Record<string, string>       // nodeId → output text
  isRunning: boolean
  error: string | null

  startRun: (runId: string) => void
  setNodeStatus: (nodeId: string, status: NodeStatus) => void
  setNodeOutput: (nodeId: string, output: string) => void
  finishRun: () => void
  resetRun: () => void
}
```

## UI 구조 (`/flow` 페이지)

### 라우팅

- `/flow` → 템플릿 목록 페이지
- `/flow/[id]` → 에디터 페이지

### 템플릿 목록 (`/flow`)

카드 그리드:
- 템플릿명, 노드 수, `lastRunAt` (없으면 "실행 기록 없음")
- `+ 새 플로우` 버튼 → POST `/api/flow-templates` 후 `/flow/[id]`로 이동

### 에디터 레이아웃 (`/flow/[id]`)

```
┌──────────────────────────────────────────────────────────┐
│  헤더: 템플릿명 편집 인풋   [저장]  [▶ 실행]            │
├──────────┬──────────────────────────────┬─────────────────┤
│  팔레트   │                              │  노드 설정 패널  │
│ (드래그)  │     ReactFlow 캔버스         │  (노드 선택 시)  │
│           │                              │                  │
│ 에이전트  │  노드 + 엣지 렌더링          │  역할명          │
│ ─────     │  실행 상태 오버레이          │  모델 선택       │
│ 성장전략가│                              │  시스템 프롬프트 │
│ 콘텐츠    │                              │                  │
│ 퍼포먼스  │                              │                  │
│ PM        │                              │                  │
│ 커스텀 +  │                              │                  │
│           │                              │                  │
│ 도구      │                              │                  │
│ ─────     │                              │                  │
│ 웹검색    │                              │                  │
└──────────┴──────────────────────────────┴─────────────────┘
│  실행 시: 토픽 입력 모달 → 진행 상태 하단 바             │
└──────────────────────────────────────────────────────────┘
```

### 노드 비주얼

**AgentNode:**
- 배경: `var(--surface-raised)`, 테두리: `var(--surface-border)`
- 상단: 역할명 + 모델 뱃지 (claude=보라, gemini=파랑, gpt=초록, groq=주황)
- 실행 상태별 스타일:
  - idle: 기본
  - running: cyan 테두리 펄스 + 스피너
  - done: green 테두리 + ✓
  - error: red 테두리 + ✗

**StartNode:** 원형, 토픽 텍스트
**EndNode:** 원형, "산출물"
**ToolNode:** 사각형, 🔍 + "웹 검색"

### 실행 플로우 (UI)

1. `▶ 실행` 클릭 → 토픽/brand/region/goal 입력 모달
2. `POST /api/flow-templates/[id]/run` SSE 연결
3. `run-start` → `isRunning = true`, `runId` 저장
4. `node-start` → 해당 nodeId 상태 `running`
5. `node-done` → 상태 `done`, output 저장 (hover 시 툴팁으로 표시)
6. `node-error` → 상태 `error`
7. `flow-complete` → `isRunning = false`, 하단에 "완료 — 결과 보기" 링크 (`/seminar/${runId}`)
8. `flow-error` → 에러 토스트

## 기존 시스템과의 관계

| 시스템 | 관계 |
|--------|------|
| `/seminar` | 유지 — 스케줄 기반 토론은 기존 하드코딩 파이프라인 그대로 |
| `pipeline.ts` | 유지 — `/seminar` 전용 |
| `agent-config.ts` | Flow Runner에서 `agentKey`로 기본 systemPrompt 로드 시 참조 |
| `lib/llm.ts` → `runLLM()` | Flow Runner에서 직접 호출 |
| `lib/search.ts` → `runWebSearchWithRuntime()` | ToolNode 실행 시 호출 |

## 라이브러리

- `@xyflow/react` — ReactFlow 캔버스 (신규 설치)
- 기존 스택 그대로 유지 (Zustand, Tailwind, Prisma, Zod)
