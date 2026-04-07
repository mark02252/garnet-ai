# Shell ↔ Flow 자동 생성/실행 시스템 설계

> **목표:** Agent Shell의 커맨드 바에서 자연어로 플로우를 자동 생성, 실행, 조회할 수 있게 한다. "카페 창업 마케팅 플로우 만들어줘"라고 입력하면 Gemma4가 최적의 에이전트 팀을 설계하고, Canvas에 미니 플로우 다이어그램으로 미리보기를 보여주며, 사용자가 실행/수정을 선택할 수 있다.

---

## 1. 사용자 인터랙션 흐름

### 1-1. 플로우 자동 생성 (한 줄)

```
User: "강남 카페 창업 마케팅 플로우 만들어줘"
→ Intent: flow-create
→ Flow Architect (Gemma4) 호출
→ Canvas에 미니 플로우 다이어그램 패널 표시:
   - 에이전트 노드 목록 + 연결 구조 시각화
   - [실행] [에디터에서 수정] [취소] 버튼
→ 사용자 선택:
   - [실행] → FlowTemplate 저장 → SSE 실행 → Canvas에 실시간 노드 상태
   - [에디터에서 수정] → FlowTemplate 저장 → /flow/[id]로 이동
   - [취소] → 패널 닫기
```

### 1-2. 플로우 자동 생성 (대화형)

```
User: "새 프로젝트 플로우 만들어"
→ Intent: flow-create (주제 미감지)
→ Garnet 응답: "어떤 프로젝트인지 설명해주세요. 목표, 대상, 산업 등을 알려주시면 최적의 에이전트 팀을 설계합니다."
User: "B2B SaaS 런칭인데 기술 블로그랑 SEO도 해야 해"
→ Flow Architect 호출 (대화 맥락 포함)
→ Canvas 미리보기 패널 표시
```

### 1-3. 기존 플로우 실행

```
User: "지난번 마케팅 플로우 돌려줘"
→ Intent: flow-run
→ Template Matcher (Gemma4) — 저장된 템플릿 중 매칭
→ Garnet: "'여름 모객 전략' 플로우를 실행합니다. 주제를 입력해주세요."
User: "겨울 시즌으로 바꿔서"
→ SSE 실행 시작 → Canvas에 실행 중 다이어그램 표시
```

### 1-4. 플로우 목록 조회

```
User: "저장된 플로우 보여줘"
→ Intent: flow-list
→ Canvas 패널에 템플릿 목록 카드 표시 (이름, 노드 수, 최근 실행일)
→ 카드 클릭 → 에디터로 이동
```

---

## 2. 핵심 모듈

### 2-1. Flow Architect (`lib/flow/architect.ts`)

프로젝트 설명을 받아 최적의 에이전트 팀 + 연결 그래프를 생성하는 순수 함수.

**인터페이스:**

```typescript
type FlowBlueprint = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary: string        // "에이전트 5개, 웹검색 1개, 병렬 2개"
  reasoning: string      // Architect가 왜 이 구성을 선택했는지
}

async function generateFlowBlueprint(
  projectDescription: string,
  options?: {
    conversationContext?: string[]   // 대화형 모드 시 이전 대화
    preferredAgents?: string[]       // 사용자가 특정 에이전트 요청 시
  }
): Promise<FlowBlueprint>
```

**동작 원리:**

1. `DEFAULT_DOMAIN_AGENT_POOL`에서 사용 가능한 프리셋 에이전트 목록 추출
2. Gemma4에게 다음을 요청:
   - 프로젝트 분석 → 필요한 역할 결정
   - 프리셋에 매칭되는 역할은 해당 에이전트의 `id`, `name`, `systemPrompt` 사용
   - 프리셋에 없는 역할은 커스텀 `role` + `systemPrompt` 생성
   - 에이전트 간 의존관계 결정 (직렬/병렬)
   - 웹검색이 필요한 위치에 ToolNode 자동 삽입
3. JSON 응답을 파싱하여 `FlowNode[]` + `FlowEdge[]` 구성
4. `kahnSort`로 그래프 유효성 검증
5. 자동 position 계산 (레이어별 x좌표 간격 200px, 같은 레이어 내 y좌표 분산)

**LLM 프롬프트 설계:**

systemPrompt:
```
당신은 Garnet의 Flow Architect입니다. 사용자의 프로젝트 설명을 분석하여 최적의 에이전트 파이프라인을 설계합니다.

사용 가능한 프리셋 에이전트:
{presetAgentList}

규칙:
- 프리셋에 적합한 에이전트가 있으면 반드시 사용 (agentKey 포함)
- 프리셋에 없는 역할이 필요하면 커스텀 에이전트 생성 (role + systemPrompt)
- 병렬 실행이 가능한 독립적 역할은 병렬로 배치
- 리서치/데이터 수집이 필요한 에이전트 앞에 web-search 노드 배치
- 최종 종합/의사결정 역할은 모든 분석 에이전트의 결과를 받도록 배치
- 에이전트는 3~8개 범위로 구성 (너무 적으면 분석 부족, 너무 많으면 비효율)
- 모든 systemPrompt에 "한국어로 응답하세요" 포함

반드시 아래 JSON 형식으로 응답하세요:
{jsonSchema}
```

**JSON 응답 스키마:**

```json
{
  "agents": [
    {
      "id": "agent-{timestamp}",
      "role": "역할명",
      "agentKey": "프리셋ID 또는 null",
      "model": "gemma4",
      "systemPrompt": "시스템 프롬프트",
      "dependsOn": ["의존하는 에이전트 id 목록"],
      "needsWebSearch": true
    }
  ],
  "summary": "에이전트 5개, 웹검색 2개, 병렬 브랜치 2개",
  "reasoning": "카페 창업 프로젝트이므로 상권/메뉴/마케팅/브랜딩 분석이 필요하며..."
}
```

파싱 후 `FlowNode[]`/`FlowEdge[]`로 변환:
- `needsWebSearch: true`인 에이전트 앞에 ToolNode 자동 삽입
- `dependsOn`을 기반으로 edge 생성
- `dependsOn`이 빈 배열이면 StartNode에서 직접 연결 (병렬 진입)
- 마지막 레이어의 에이전트에서 EndNode로 연결

### 2-2. Template Matcher (`lib/flow/template-matcher.ts`)

사용자 입력을 분석하여 저장된 템플릿 중 가장 적합한 것을 선택.

```typescript
type MatchResult = {
  templateId: string
  templateName: string
  confidence: number    // 0-1
  reason: string
} | null

async function matchFlowTemplate(
  userInput: string,
  templates: Array<{ id: string; name: string; nodes: string }>
): Promise<MatchResult>
```

- 저장된 템플릿의 이름 + 노드 역할명을 Gemma4에 전달
- confidence 0.6 미만이면 null 반환 → "매칭되는 플로우가 없습니다" 안내

### 2-3. Intent 라우터 확장 (`lib/agent-intent.ts`)

기존 `IntentAction` 타입에 flow 액션 추가:

```typescript
// 기존
type IntentAction =
  | { type: 'panel'; panelType: '...' }
  | { type: 'navigate'; url: string }
  | { type: 'text'; content: string }

// 추가
  | { type: 'flow-create'; projectDescription: string }
  | { type: 'flow-run'; userInput: string }
  | { type: 'flow-list' }
  | { type: 'flow-converse'; question: string }  // 대화형 모드
```

Intent 판별 systemPrompt에 flow 관련 키워드/예시 추가:
- "플로우 만들어줘", "에이전트 팀 구성", "파이프라인 설계" → `flow-create`
- "플로우 실행", "플로우 돌려줘" → `flow-run`
- "플로우 목록", "저장된 플로우" → `flow-list`

### 2-4. Shell API 엔드포인트

**`POST /api/flow-templates/generate`** (신규)

Flow Architect를 호출하여 blueprint를 반환. 아직 DB에 저장하지 않음 (미리보기 용도).

```typescript
// Request
{ projectDescription: string, conversationContext?: string[] }

// Response
{ nodes: FlowNode[], edges: FlowEdge[], summary: string, reasoning: string }
```

**기존 `POST /api/flow-templates`** 확장

현재는 `{ name }` 만 받아서 기본 start+end 노드로 생성. 확장하여 `{ name, nodes?, edges? }` 도 받을 수 있게:

```typescript
// 기존: { name: "새 플로우" } → 기본 노드
// 확장: { name: "카페 마케팅", nodes: "[...]", edges: "[...]" } → Architect가 생성한 노드로 저장
```

### 2-5. Canvas 미니 플로우 다이어그램 (`FlowPreviewPanel`)

새로운 Canvas 패널 컴포넌트. ReactFlow를 사용하지 않고 **경량 SVG/div 기반**으로 렌더링.

**패널 구조:**

```
┌─── Flow Preview ──────────────────────┐
│                                        │
│  [노드 다이어그램 — SVG]               │
│    ○ 시작                              │
│    ├─ 🔍 웹검색                        │
│    ├─ 📊 상권 분석가          (병렬)    │
│    ↓                                   │
│    → 🎯 마케팅 기획자                   │
│    → 📋 런칭 PM                        │
│    ○ 산출물                            │
│                                        │
│  에이전트 5개 · 웹검색 1개 · 병렬 2개   │
│  ────────────────────────────────────  │
│  [▶ 실행]  [✏ 에디터]  [✕ 취소]       │
└────────────────────────────────────────┘
```

**실행 중 상태:**

패널이 실행 모드로 전환됨:
- 각 노드 옆에 상태 아이콘 (⟳ running, ✓ done, ✗ error)
- 진행률 텍스트: "3/5 노드 완료"
- 완료 시: [결과 보기 →] 버튼

**구현:**

```typescript
// components/agent-shell/flow-preview-panel.tsx
type FlowPreviewPanelProps = {
  nodes: FlowNode[]
  edges: FlowEdge[]
  summary: string
  reasoning?: string
  status: 'preview' | 'running' | 'complete' | 'error'
  nodeStatuses?: Record<string, NodeStatus>   // Zustand 연동
  runId?: string
  onExecute: () => void
  onOpenEditor: () => void
  onClose: () => void
}
```

노드 레이아웃은 `kahnSort`로 레이어를 구하고, 각 레이어를 세로로 배치:
- 레이어 간 x 간격: 120px
- 같은 레이어 내 y 간격: 50px
- SVG `<line>` 또는 `<path>`로 edge 렌더링

### 2-6. Command Bar 처리 흐름 확장

현재 `command-bar.tsx`는 `/api/agent/command`에 POST하고 SSE 이벤트를 처리함. Flow 관련 이벤트 타입을 추가:

```typescript
// 기존 SSE 이벤트
{ event: 'step', data: { text, status } }
{ event: 'panel', data: { type, title, ... } }
{ event: 'done', data: { ... } }

// Flow 추가 이벤트
{ event: 'flow-preview', data: { nodes, edges, summary, reasoning } }
{ event: 'flow-run-start', data: { runId, templateId } }
{ event: 'flow-node-status', data: { nodeId, status } }
{ event: 'flow-complete', data: { runId } }
{ event: 'flow-converse', data: { question } }  // 대화형 모드 — 추가 질문
```

`command-bar.tsx`의 SSE 핸들러에서:
- `flow-preview` → `FlowPreviewPanel`을 Canvas에 spawn
- `flow-run-start` → 기존 미리보기 패널을 실행 모드로 전환
- `flow-node-status` → Zustand `useFlowRunStore` 업데이트 → 패널 리렌더
- `flow-complete` → 패널에 "결과 보기" 버튼 표시
- `flow-converse` → 입력 대기 상태 + 질문 표시

### 2-7. Agent Command API 확장 (`/api/agent/command`)

현재 `/api/agent/command`는 intent를 분석하고 적절한 액션을 실행. Flow intent 처리 추가:

```typescript
// flow-create intent 처리
if (intent.type === 'flow-create') {
  send({ event: 'step', data: { text: '플로우를 설계하고 있습니다...', status: 'running' } })
  const blueprint = await generateFlowBlueprint(intent.projectDescription, { conversationContext })
  send({ event: 'flow-preview', data: blueprint })
  send({ event: 'step', data: { text: `에이전트 ${blueprint.nodes.filter(n => n.type === 'agent').length}개로 구성된 플로우를 설계했습니다.`, status: 'done' } })
  send({ event: 'done', data: {} })
}

// flow-run intent 처리
if (intent.type === 'flow-run') {
  const templates = await prisma.flowTemplate.findMany({ ... })
  const match = await matchFlowTemplate(intent.userInput, templates)
  if (!match) {
    send({ event: 'text', data: { content: '매칭되는 플로우가 없습니다. 새로 만들까요?' } })
    return
  }
  // 주제 추출 or 대화로 확인 → SSE 실행
}
```

---

## 3. 데이터 흐름

```
[CommandBar 입력]
  ↓
[/api/agent/command] — SSE 스트림
  ↓
[Intent 분석] — Gemma4
  ├─ flow-create → [Flow Architect] → flow-preview 이벤트
  ├─ flow-run → [Template Matcher] → flow-run-start 이벤트
  ├─ flow-list → DB 조회 → panel 이벤트
  └─ flow-converse → 추가 질문 이벤트
  ↓
[Canvas] — FlowPreviewPanel 렌더링
  ↓
[사용자 선택]
  ├─ [실행] → POST /api/flow-templates (저장) → POST .../run (SSE 실행) → 노드 상태 실시간
  ├─ [에디터] → POST /api/flow-templates (저장) → router.push(/flow/[id])
  └─ [취소] → 패널 닫기
```

---

## 4. 수정/생성 파일 목록

| 파일 | 변경 | 설명 |
|------|------|------|
| `lib/flow/architect.ts` | 신규 | Flow Architect — LLM 기반 플로우 자동 설계 |
| `lib/flow/template-matcher.ts` | 신규 | LLM 기반 템플릿 매칭 |
| `lib/flow/architect-prompt.ts` | 신규 | Architect용 systemPrompt + JSON 스키마 |
| `lib/agent-intent.ts` | 수정 | flow-create/run/list/converse 인텐트 추가 |
| `app/api/flow-templates/generate/route.ts` | 신규 | Flow Architect API (POST) |
| `app/api/flow-templates/route.ts` | 수정 | POST에 nodes/edges 옵션 추가 |
| `app/api/agent/command/route.ts` | 수정 | flow intent 처리 + SSE 이벤트 추가 |
| `components/agent-shell/flow-preview-panel.tsx` | 신규 | 미니 플로우 다이어그램 + 실행 상태 |
| `components/agent-shell/canvas-panel.tsx` | 수정 | FlowPreviewPanel 렌더링 분기 추가 |
| `components/agent-shell/command-bar.tsx` | 수정 | flow SSE 이벤트 핸들러 |

### 변경하지 않는 것

- 기존 Flow Builder 에디터 (`/flow/[id]`) — 그대로 유지
- 기존 Flow 실행 엔진 (`lib/flow/runner.ts`) — 그대로 재사용
- 기존 Flow API routes (CRUD, SSE run) — run route 그대로 재사용
- Agent Shell 레이아웃/CSS — 기존 디자인 시스템 유지

---

## 5. 테스트 계획

1. **Flow Architect 단위 테스트:** 다양한 프로젝트 설명 → 유효한 nodes/edges JSON 생성 확인
2. **Template Matcher 단위 테스트:** 사용자 입력 + 템플릿 목록 → 올바른 매칭 확인
3. **Intent 라우터 테스트:** flow 관련 키워드 → 올바른 intent 분류 확인
4. **통합 테스트:** Shell에서 "플로우 만들어줘" → Canvas 패널 표시 → 실행 → 결과 확인
5. **그래프 유효성:** Architect 출력을 `validateFlow()` + `kahnSort()`로 검증
6. **에러 케이스:** LLM이 잘못된 JSON 반환 시 graceful fallback
