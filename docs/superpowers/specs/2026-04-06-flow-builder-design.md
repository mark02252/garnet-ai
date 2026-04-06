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
  id          String   @id @default(cuid())
  name        String
  description String?
  nodes       String   // JSON: FlowNode[]
  edges       String   // JSON: FlowEdge[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### FlowNode 타입 정의

```typescript
type StartNode = {
  type: 'start'
  id: string
  position: { x: number; y: number }
  data: { topic: string }
}

type AgentNode = {
  type: 'agent'
  id: string
  position: { x: number; y: number }
  data: {
    role: string           // 표시 이름 (e.g. "성장전략가")
    agentKey: string       // DOMAIN_POOL_KEY 키 (e.g. "GROWTH_STRATEGIST")
    model: 'claude' | 'gemini' | 'gpt' | 'groq'
    systemPrompt: string   // 커스텀 시스템 프롬프트 (기본값: agent-config.ts에서 로드)
  }
}

type ToolNode = {
  type: 'tool'
  id: string
  position: { x: number; y: number }
  data: { toolType: 'web-search' }
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

### 중복 처리 및 유효성

- StartNode / EndNode는 각각 정확히 1개만 허용
- 사이클(순환 연결) 허용 안 함 — 저장 시 서버에서 위상 정렬 가능 여부 검증
- AgentNode의 `agentKey`가 `agent-config.ts`에 없으면 `systemPrompt`를 직접 사용

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/flow-templates` | 목록 조회 |
| POST | `/api/flow-templates` | 새 템플릿 생성 |
| GET | `/api/flow-templates/[id]` | 단일 조회 |
| PATCH | `/api/flow-templates/[id]` | 노드/엣지 저장 |
| DELETE | `/api/flow-templates/[id]` | 삭제 |
| POST | `/api/flow-templates/[id]/run` | 즉시 실행 (SSE 스트림) |

### POST `/api/flow-templates/[id]/run`

- `topic: string` (필수) — 토론 주제
- SSE 스트림 응답: `Content-Type: text/event-stream`
- 이벤트 포맷:

```typescript
type FlowRunEvent =
  | { type: 'node-start';    nodeId: string }
  | { type: 'node-done';     nodeId: string; output: string }
  | { type: 'node-error';    nodeId: string; error: string }
  | { type: 'flow-complete'; runId: string }
  | { type: 'flow-error';    error: string }
```

## 실행 엔진 (`lib/flow-runner.ts`)

### 핵심 로직

1. FlowTemplate JSON → 방향 그래프 구성
2. **위상 정렬(Kahn's algorithm)** → 실행 순서 결정
3. 같은 깊이(depth)의 노드는 `Promise.all`로 병렬 실행
4. 각 노드 완료 후 출력 텍스트를 `context` Map에 축적
5. 다운스트림 노드 실행 시 업스트림 노드들의 출력을 컨텍스트로 주입

### 노드별 실행 동작

| 노드 타입 | 동작 |
|----------|------|
| `start` | topic을 context에 저장, 즉시 완료 |
| `tool` (web-search) | `runWebSearchWithRuntime()` 호출, 결과를 context에 저장 |
| `agent` | 업스트림 context + systemPrompt로 LLM 호출 (`runLLM`), 응답을 context에 저장 |
| `end` | 모든 업스트림 context를 합쳐 Run + Deliverable DB 저장 |

### 에러 처리

- 개별 노드 실패 시 해당 노드를 `error` 상태로 마크하고 다운스트림 노드는 건너뜀
- EndNode 도달 불가능한 경우 `flow-error` 이벤트 발행
- 최대 실행 시간: 10분 (AbortSignal.timeout)

## UI 구조 (`/flow` 페이지)

### 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  헤더: 템플릿명 편집 인풋   [저장]  [▶ 실행]            │
├──────────┬──────────────────────────────┬─────────────────┤
│  팔레트   │                              │  노드 설정 패널  │
│           │     ReactFlow 캔버스         │  (노드 선택 시)  │
│ 에이전트  │                              │                  │
│ ─────     │  노드 + 엣지 렌더링          │  역할명          │
│ 성장전략가│  실행 중: 상태 오버레이      │  모델 선택       │
│ 콘텐츠    │                              │  시스템 프롬프트 │
│ 퍼포먼스  │                              │  편집            │
│ PM        │                              │                  │
│ 커스텀 +  │                              │                  │
│           │                              │                  │
│ 도구      │                              │                  │
│ ─────     │                              │                  │
│ 웹검색    │                              │                  │
└──────────┴──────────────────────────────┴─────────────────┘
│  실행 시: 토픽 입력 바 + 진행 상태 표시                   │
└──────────────────────────────────────────────────────────┘
```

### 노드 비주얼

**AgentNode:**
- 배경: `var(--surface-raised)`, 테두리: `var(--surface-border)`
- 상단: 역할명 + 모델 뱃지 (Claude=보라, Gemini=파랑, GPT=초록, Groq=주황)
- 실행 상태 오버레이:
  - 대기: 기본
  - 실행 중: cyan 테두리 펄스 + 스피너
  - 완료: green 테두리 + ✓
  - 오류: red 테두리 + ✗

**StartNode:** 원형, 토픽 텍스트 표시
**EndNode:** 원형, "산출물" 텍스트
**ToolNode (web-search):** 사각형, 🔍 아이콘 + "웹 검색"

### 실행 플로우

1. `▶ 실행` 클릭 → 토픽 입력 모달
2. `POST /api/flow-templates/[id]/run` 호출 (SSE)
3. `node-start` 이벤트 → 해당 노드 실행 중 스타일 적용
4. `node-done` 이벤트 → 완료 스타일 + 출력 텍스트 툴팁 표시 가능
5. `flow-complete` → 하단에 Run ID 링크 + "완료" 토스트

### 템플릿 목록 (`/flow` 진입 시)

- 카드 목록: 템플릿명, 노드 수, 마지막 실행 시각
- `+ 새 플로우` → 빈 캔버스 생성
- 카드 클릭 → 에디터로 진입

## 기존 시스템과의 관계

| 시스템 | 관계 |
|--------|------|
| `/seminar` | 유지 — 스케줄 기반 토론은 기존 하드코딩 파이프라인 사용 |
| `pipeline.ts` | 유지 — `/seminar` 전용으로 계속 사용 |
| `agent-config.ts` | Flow Runner에서 `agentKey`로 기본 systemPrompt 로드 시 참조 |
| `lib/llm.ts` | Flow Runner에서 `runLLM()` 직접 호출 |
| `lib/search.ts` | Tool 노드(web-search) 실행 시 호출 |

## 라이브러리

- `@xyflow/react` — ReactFlow 캔버스 (신규 설치)
- 기존 스택 그대로 유지 (Zustand, Tailwind, Prisma, Zod)
