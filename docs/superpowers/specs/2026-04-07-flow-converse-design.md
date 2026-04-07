---
title: "Flow Converse + Debate 노드 설계"
category: "spec"
owner: "rnr"
audience: "developer"
doc_kind: "design-spec"
tags: ["flow", "converse", "debate", "agent", "shell"]
created: 2026-04-07
updated: 2026-04-07
---

# Flow Converse + Debate 노드 설계

## 목표

Shell에서 멀티턴 대화를 통해 에이전트 팀을 정교하게 설계하고, 실행 시 에이전트 간 토론/검증 패턴으로 결과 품질을 극대화한다.

## 아키텍처: B+ (Converser → Architect → Smart Execution)

3단계 분리 구조:

| 단계 | 역할 | 목적 |
|------|------|------|
| Converser | 기획자 | 사용자 의도 파악, 제약/목표/성공기준 추출, 상세 브리프 생성 |
| Architect | 설계자 | 최적 에이전트 팀 구성 + 토론 패턴 포함 설계 |
| Execution | 실행팀 | DAG 기반 실행 + Debate 노드 합의 기반 루프 |

## 1. Converser LLM

### 역할

사용자와 대화하며 상세 브리프를 만드는 전담 LLM.

### 응답 타입

```typescript
type ConverserResult =
  | { mode: 'question'; question: string }
  | { mode: 'ready'; summary: string; brief: string }
```

### 함수 시그니처

```typescript
// lib/flow/converser.ts
async function converseForFlow(
  userMessage: string,
  conversationHistory: string[]
): Promise<ConverserResult>
```

### 프롬프트 수집 항목

1. 프로젝트 목표 (무엇을 달성하려는가)
2. 타겟/대상 (누구를 위한 것인가)
3. 제약조건 (예산, 기간, 채널 등)
4. 기대 산출물 (보고서, 전략, 콘텐츠 등)
5. 토론 필요 여부 (비교/검증이 필요한 주제인가)

충분한 정보가 모이면 `mode: "ready"`로 전환. 한 번에 하나의 질문만.

첫 메시지가 충분히 구체적이면 바로 `ready` 반환 가능.

### 대화 컨텍스트

클라이언트의 Shell `entries` 배열에서 최근 대화를 추출하여 `conversationHistory: string[]`로 전달. 페이지 새로고침 시 리셋.

**형식:** 각 항목은 `"user: ..."` 또는 `"assistant: ..."` 접두어가 붙은 문자열. `buildArchitectUserPrompt`의 `conversationContext`와 동일한 형식을 사용하여 Converser → Architect 전달 시 변환 불필요.

**최대 길이:** 최근 20개 메시지로 제한. 초과 시 오래된 메시지부터 잘림.

## 2. 인텐트 분류 변경

### 통합 로직

| 입력 | 판정 | 이유 |
|------|------|------|
| "카페 마케팅 플로우 만들어줘" | flow-converse | 모호 — Converser 시작 |
| "강남 카페 3호점, 2030 여성, 인스타 중심 플로우" | flow-create | 충분히 구체적 — 바로 Architect |
| "에이전트 추가해줘" (대화 중) | flow-converse | 대화 계속 |

판단 기준: Converser LLM이 첫 메시지도 평가 — 충분하면 바로 `ready`, 부족하면 `question`.

### 구체적 변경: `agent-intent.ts`

키워드 폴백 line 140: 기존 `flow-create` → `flow-converse`로 변경.

```typescript
// 변경 전
if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower))
  return { action: { type: 'flow-create', projectDescription: command }, ... }

// 변경 후
if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower))
  return { action: { type: 'flow-converse', question: command }, ... }
```

`flow-create`는 Converser가 `ready` 판정 후 서버에서 내부적으로 호출. 사용자 인텐트로 직접 매핑되는 경우는 매우 구체적인 입력에 한함.

## 3. Debate 노드

### 타입 정의

```typescript
// AgentNode의 model 타입과 동일한 유니온 사용
type DebateNode = {
  type: 'debate'
  id: string
  position: { x: number; y: number }
  data: {
    topic: string
    rounds: number          // 최대 라운드 (기본 3)
    model: AgentNode['data']['model']  // 'gemma4' | 'claude' | 'gemini' | 'gpt' | 'groq'
    proSystemPrompt: string
    conSystemPrompt: string
  }
}

// FlowNode 유니온 확장
type FlowNode = StartNode | AgentNode | ToolNode | EndNode | DebateNode
```

### 실행 로직 (합의 기반 종료)

Debate 노드는 runner에서 단일 노드로 취급되며, 내부적으로 멀티 LLM 호출을 수행:

```
executeDebateNode(node, upstreamContext, signal):
  debateHistory = []

  for (round = 1..maxRounds):
    // abort signal 체크 (매 라운드 시작 시)
    if (signal?.aborted) break

    // 1. 찬성 에이전트
    proInput = buildDebatePrompt('pro', node.data, upstreamContext, debateHistory)
    proOutput = await runLLM(node.data.proSystemPrompt, proInput, ...)
    debateHistory.push({ speaker: 'pro', round, content: proOutput })
    yield { type: 'debate-turn', nodeId, speaker: 'pro', round, content: proOutput }

    // 2. 반대 에이전트 (찬성 실패 시 "찬성 측 응답 없음" 표기 후 계속)
    conInput = buildDebatePrompt('con', node.data, upstreamContext, debateHistory)
    conOutput = await runLLM(node.data.conSystemPrompt, conInput, ...)
    debateHistory.push({ speaker: 'con', round, content: conOutput })
    yield { type: 'debate-turn', nodeId, speaker: 'con', round, content: conOutput }

    // 3. 모더레이터 판정
    modInput = buildModeratorPrompt(node.data.topic, debateHistory)
    modResult = parseModeratorResult(await runLLM(moderatorSystemPrompt, modInput, ...))
    yield { type: 'debate-turn', nodeId, speaker: 'moderator', round, content: modResult.summary }

    // 파싱 실패 시: 마지막 라운드면 consensus=true, 아니면 consensus=false (계속)
    if (modResult.consensus) break

  // 최종 출력: 모더레이터의 합의문을 context Map에 단일 엔트리로 저장
  return modResult.summary + '\n\n핵심 인사이트:\n' + modResult.keyInsights.join('\n')
```

**context Map 저장:** debate 노드 ID를 키로, 최종 합의문을 값으로 저장. 후속 노드는 일반 agent 출력과 동일하게 접근.

**레이어 내 동작:** debate 노드는 같은 레이어의 다른 노드와 병렬 실행 가능 (Promise.all). 내부 라운드는 순차 실행.

### 단일 에이전트 실패 처리

- 찬성(pro)만 실패: 반대 에이전트는 "상대측 응답 없음"으로 진행, 모더레이터에 알림
- 반대(con)만 실패: 동일
- 모더레이터 파싱 실패: 마지막 라운드면 `consensus: true`, 아니면 `consensus: false` (안전하게 계속)

### 모더레이터 응답 형식

```typescript
type ModeratorResult = {
  consensus: boolean
  summary: string        // 현재까지 논의 요약
  keyInsights: string[]  // 핵심 인사이트
  remainingIssues?: string[]  // consensus=false 일 때
}
```

### SSE 이벤트

`debate-turn`은 `FlowRunEvent` 유니온에 추가:

```typescript
// lib/flow/types.ts FlowRunEvent 확장
| { type: 'debate-turn'; nodeId: string; speaker: 'pro' | 'con' | 'moderator'; round: number; content: string }
```

기존 `node-start`/`node-done`도 debate 노드에 대해 발생 (전체 debate 시작/종료).

### Architect 연동

Architect JSON 스키마에 debate 항목 추가:

```json
{
  "agents": [
    { "id": "...", "type": "agent", ... },
    {
      "id": "debate-1",
      "type": "debate",
      "topic": "인스타 vs 틱톡 마케팅 효과 비교",
      "rounds": 2,
      "model": "gemma4",
      "proSystemPrompt": "인스타그램 마케팅 전문가...",
      "conSystemPrompt": "틱톡 마케팅 전문가...",
      "dependsOn": ["agent-1"]
    }
  ]
}
```

`dependsOn`은 그래프 수준 개념으로 `buildGraph`에서 엣지로 변환됨 (기존 agent와 동일 패턴).

Architect 프롬프트에 다음 지시 추가:
- 비교/분석/검증이 필요한 주제 → `type: "debate"` 노드 배치
- `proSystemPrompt`, `conSystemPrompt`에 대립되는 관점 부여
- 토론이 불필요한 단순 작업에는 사용하지 않을 것

## 4. SSE 이벤트 & 클라이언트 처리

### flow-converse 이벤트

```typescript
// 서버 → 클라이언트 (agent/command SSE 스트림)
{ event: 'flow-converse', data: { mode: 'question', question: '...' } }
{ event: 'flow-converse', data: { mode: 'ready', summary: '...', brief: '...' } }
```

`brief`는 `ready` 모드에서 반드시 포함. 클라이언트가 승인 시 서버에 반환하여 Architect에 전달.

### command-bar.tsx 처리

```typescript
case 'flow-converse':
  if (data.mode === 'question') → Shell에 AI 질문 텍스트를 step으로 표시
  if (data.mode === 'ready') → 요약 표시 + brief를 상태에 저장 + "만들까요?" 확인 표시
```

### 사용자 승인 흐름

"만들까요?" → 사용자 "응"/"만들어줘" →
서버에 `{ command: "flow-converse-confirm", brief, conversationHistory }` 전송 →
서버: `generateFlowBlueprint(brief, { conversationContext })` 호출 →
`flow-preview` 이벤트 반환

## 5. 에러 처리

| 시나리오 | 처리 |
|---------|------|
| Converser LLM 응답 파싱 실패 | 폴백: "좀 더 구체적으로 설명해주세요" 질문 전환 |
| Architect 플로우 생성 실패 | 기존 retry (MAX_RETRIES=2), 실패 시 에러 메시지 |
| Debate 찬성/반대 한쪽만 실패 | 실패 측 "응답 없음" 표기, 나머지 + 모더레이터 계속 진행 |
| Debate 양쪽 모두 실패 | 해당 라운드 스킵, 이전까지 내용으로 모더레이터 판정 |
| 모더레이터 판정 파싱 실패 | 마지막 라운드면 consensus=true, 아니면 consensus=false (안전하게 계속) |
| 사용자가 대화 중 다른 명령 | 대화 컨텍스트 리셋, 새 인텐트 처리 |
| maxRounds 도달 | 모더레이터 강제 합의문 생성 |
| Debate 중 abort signal | 매 라운드 시작 시 체크, 중단 시 현재까지 내용으로 합의 도출 |

## 6. 변경 파일

| 구분 | 파일 | 변경 |
|------|------|------|
| 신규 | `lib/flow/converser.ts` | Converser LLM 대화 로직 |
| 신규 | `lib/flow/converser-prompt.ts` | Converser 시스템 프롬프트 |
| 신규 | `app/(domains)/flow/[id]/components/nodes/DebateNode.tsx` | ReactFlow Debate 노드 컴포넌트 |
| 수정 | `lib/flow/types.ts` | DebateNode 타입, debate-turn 이벤트, FlowNode 유니온 확장 |
| 수정 | `lib/flow/runner.ts` | Debate 노드 실행 로직 (합의 기반 루프 + abort 체크) |
| 수정 | `lib/flow/architect-prompt.ts` | 토론 패턴 설계 지시 + debate 노드 JSON 스키마 |
| 수정 | `lib/flow/architect.ts` | buildGraph에서 debate 노드 처리 |
| 수정 | `app/api/agent/command/route.ts` | flow-converse + flow-converse-confirm 핸들러 |
| 수정 | `components/agent-shell/command-bar.tsx` | flow-converse 이벤트 처리 + brief 상태 관리 |
| 수정 | `lib/agent-intent.ts` | 키워드 폴백 flow-create → flow-converse 변경 |
| 수정 | `components/flow-result-dashboard.tsx` | debate 결과 렌더링 (라운드별 찬반 + 합의문) |
