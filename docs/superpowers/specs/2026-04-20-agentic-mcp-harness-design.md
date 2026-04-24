# Garnet Phase 7: Agentic MCP Harness + Domain Portability

**Date:** 2026-04-20
**Status:** Approved
**Scope:** MCP Harness, Agentic Retrieval, A2A Protocol, Domain Bootstrap

---

## 1. Problem Statement

현재 Garnet의 Sub-Reasoner 5개는 Scanner가 미리 수집한 WorldModel 스냅샷만 받아서 분석한다. 추가 데이터가 필요해도 직접 조회할 수 없어 일반적 수준의 인사이트에 그치며, 각 Sub-Reasoner 간 교차 분석도 불가능하다. 또한 MONOPLEX 도메인에 하드코딩된 부분이 많아 회사 이동 시 코드 전면 수정이 필요하다.

## 2. Goals

1. Sub-Reasoner가 MCP 도구를 통해 필요한 데이터를 능동적으로 조회
2. Knowledge Store / Episodic Memory를 맥락 기반으로 동적 검색 (Agentic Retrieval)
3. Sub-Reasoner 간 교차 질의 (A2A 내부 프로토콜)
4. MD 파일 하나로 새 도메인에 부트스트랩 가능한 이식성

## 3. Non-Goals

- 외부 에이전트 실시간 연동 (포트만 열어둠)
- MCP 28개 커넥션 전체 활성화 (필요한 것만 하네스에 등록)
- 유료 모델 도입 (Gemini Flash + Groq + Gemma4 유지)

---

## 4. Architecture

### 4.1 3계층 분리

```
Layer 1: Engine (도메인 무관)
  ├─ MCP Harness (lib/agent-loop/mcp-harness.ts)
  ├─ Agent Loop (Scanner → Reasoner → Executor)
  ├─ Knowledge Store (임베딩 검색)
  ├─ Governor (승인 큐)
  └─ A2A Protocol (lib/agent-loop/a2a-protocol.ts)

Layer 2: Domain Config (회사별 교체)
  ├─ config/domain.yaml (KPI, 데이터소스, Sub-Reasoner 구성)
  ├─ config/tools.yaml (Sub-Reasoner별 허용 MCP 도구)
  ├─ config/briefing-template.yaml (Slack 포맷)
  └─ config/company.md (비즈니스 컨텍스트 원본)

Layer 3: Learned Knowledge (회사별 축적)
  ├─ Knowledge Store entries (DB)
  ├─ Episodic Memory (DB)
  └─ Prompt versions (prompt-manager)
```

### 4.2 MCP Tool Harness

**파일:** `lib/agent-loop/mcp-harness.ts`

```typescript
type ToolCall = {
  tool: string
  params: Record<string, unknown>
}

type HarnessConfig = {
  allowedTools: Map<string, string[]>  // sub-reasoner → 허용 도구 목록
  maxCallsPerReasoner: number          // 기본 3
  maxCallsPerCycle: number             // 기본 15
  cacheTTL: 'cycle'                    // 사이클 단위 캐시
}
```

**동작:**
1. 캐시 체크 → 히트면 즉시 반환 (0ms)
2. 화이트리스트 체크 → 미허용 도구면 에러 반환
3. Rate limit 체크 → 초과면 에러 반환
4. MCP 도구 실행 → 결과 캐시 저장 → 반환

**캐시 키:** `${toolName}:${JSON.stringify(sortedParams)}`
**캐시 수명:** 사이클 시작 시 초기화 → 같은 사이클 내 데이터 일관성 보장

### 4.3 MCP 도구 정의 (6개)

| 도구 | 구현 | 외부 호출 여부 |
|------|------|--------------|
| `ga4_query` | fetchGA4 래퍼 → GA4 API | 외부 (GA4) |
| `ga4_funnel` | fetchEcommerceFunnel 래퍼 | 외부 (GA4) |
| `theater_detail` | fetchTheaterRevenueTop + filter | 외부 (GA4) |
| `knowledge_search` | searchKnowledgeSemantic() | 로컬 (DB + Ollama) |
| `episode_search` | retrieveByMeaning() | 로컬 (DB + Ollama) |
| `web_search` | runWebSearchWithRuntime() | 외부 (검색 API) |

로컬 도구(knowledge_search, episode_search)는 50~200ms, 외부 도구는 1~3초.

### 4.4 Sub-Reasoner별 도구 허용 매핑

`config/tools.yaml`에서 로드:

```yaml
sub_reasoners:
  analysis:
    tools: [ga4_query, knowledge_search, episode_search]
  content:
    tools: [knowledge_search, web_search, episode_search]
  strategy:
    tools: [ga4_query, knowledge_search, web_search]
  cro:
    tools: [ga4_funnel, theater_detail, knowledge_search]
  psychology:
    tools: [knowledge_search, episode_search, web_search]
```

---

## 5. Sub-Reasoner 도구 호출 프로토콜

### 5.1 호출 흐름

```
1. Sub-Reasoner 실행 시작
2. 시스템 프롬프트에 허용 도구 목록 + 호출 포맷 포함
3. LLM 1차 호출 → 분석 + tool_calls 배열 (선택적)
4. tool_calls가 있으면:
   a. 하네스가 각 도구 실행 (캐시/화이트리스트/rate limit 체크)
   b. 결과를 컨텍스트에 추가
   c. LLM 2차 호출 → 최종 분석
5. tool_calls가 없으면 1차 결과가 최종 (기존과 동일 속도)
```

### 5.2 프롬프트 포맷

```
당신은 ${role} 전문가입니다.
${systemPrompt}

## 사용 가능한 도구
${toolDescriptions}

## 도구 호출 방법
분석 중 추가 데이터가 필요하면, 응답 JSON의 "tool_calls" 필드에 요청하세요.
WorldModel 데이터만으로 충분하면 tool_calls를 비워두세요.

## 응답 포맷
{
  "tool_calls": [{"tool": "ga4_funnel", "params": {"filter": "..."}}],
  "analysis": { ... 기존 분석 포맷 ... }
}
```

### 5.3 타임아웃

- 기존 30초 유지
- 도구 호출 포함 시: LLM 1차(~5초) + 도구 실행(캐시 히트 0ms, 미스 ~3초) + LLM 2차(~5초) = ~13초
- 여유 충분. 실측 후 필요 시 조정

---

## 6. Agentic Retrieval

### 6.1 Knowledge Store 동적 검색

기존 `getKnowledgeForReasoner()` (상위 15개 고정) → **유지**. 전체 맥락용.

추가: `knowledge_search` 도구를 통해 Sub-Reasoner가 **분석 맥락에 맞는 지식을 동적 검색**.

```
CRO: knowledge_search("좌석 선택 이탈 원인")
→ searchKnowledgeSemantic("좌석 선택 이탈 원인", {minSimilarity: 0.4})
→ 관련 패턴/원칙만 정확히 반환
```

### 6.2 Episodic Memory 동적 검색

```
Strategy: episode_search("재방문율 개선 성공 캠페인")
→ retrieveByMeaning("재방문율 개선 성공 캠페인")
→ 과거 유사 상황의 액션 + 결과 반환
```

### 6.3 기존 Reasoner 조회와의 관계

| 용도 | 함수 | 호출 시점 |
|------|------|----------|
| 전체 맥락 | getKnowledgeForReasoner() | Reasoner 시작 시 1회 (기존) |
| 심층 분석 | knowledge_search / episode_search | Sub-Reasoner가 필요 시 (신규) |

보완 관계. 중복 아님.

---

## 7. A2A Protocol

### 7.1 내부 통신: ask_expert

**파일:** `lib/agent-loop/a2a-protocol.ts`

```typescript
type A2ARequest = {
  from: string        // 요청 Sub-Reasoner ID
  expert: string      // 대상 전문가 (psychology, cro, etc.)
  question: string    // 질문
}

type A2AResponse = {
  expert: string
  answer: string
  confidence: number
}
```

**동작:**
1. CRO가 `ask_expert({expert: "psychology", question: "..."})` 호출
2. 하네스가 Psychology의 시스템 프롬프트 + 질문으로 경량 LLM 1회 호출
3. 결과 캐시 (같은 질문 = 같은 답)
4. Sub-Reasoner당 ask_expert 1회 제한 (체이닝 방지)

### 7.2 외부 A2A (포트만 열어둠)

```typescript
// 향후 확장용 인터페이스
export async function askExternal(
  agentUrl: string,
  question: string,
  capabilities?: string[]
): Promise<A2AResponse> {
  // TODO: 외부 에이전트 연동 시 구현
  throw new Error('External A2A not yet implemented')
}

export function registerExternalAgent(
  name: string,
  url: string,
  capabilities: string[]
): void {
  // TODO: 에이전트 레지스트리
}
```

---

## 8. Domain Bootstrap

### 8.1 company.md 기반 초기화

회사 이동 시 사용자가 `config/company.md` 전달:

```markdown
---
name: "새 회사"
industry: "SaaS / B2B"
kpis: [MRR, churn_rate, NPS, trial_conversion]
data_sources: [ga4, mixpanel, hubspot]
sub_reasoners: [analysis, content, growth, retention, pricing]
---

## 비즈니스 컨텍스트
...
```

### 8.2 부트스트랩 프로세스

**파일:** `lib/agent-loop/domain-bootstrap.ts`

```
1. company.md 파싱 (frontmatter + body)
2. config/domain.yaml 자동 생성
3. config/tools.yaml 자동 생성 (data_sources → 도구 매핑)
4. Sub-Reasoner 시스템 프롬프트 생성 (industry + context 기반)
5. Knowledge Store 시딩 (비즈니스 컨텍스트 → 초기 지식)
6. config/briefing-template.yaml 생성 (KPI 기반)
```

### 8.3 현재 MONOPLEX 의존성 제거 대상

| 현재 하드코딩 | 이동 대상 |
|-------------|----------|
| theater_mapping.ts | config/domain.yaml → custom_dimensions |
| Sub-Reasoner 시스템 프롬프트 | config/에서 로드 |
| Slack 브리핑 포맷 | config/briefing-template.yaml |
| GA4 Custom Dimension | .env (이미 외부화) |

---

## 9. 파일 구조 (신규/변경)

```
lib/agent-loop/
  mcp-harness.ts          (신규) MCP 하네스 — 캐시, 화이트리스트, rate limit
  mcp-tools.ts            (신규) 6개 MCP 도구 구현체
  a2a-protocol.ts         (신규) ask_expert 내부 통신 + 외부 포트
  domain-bootstrap.ts     (신규) company.md → config 자동 생성
  sub-reasoners/
    index.ts              (변경) 도구 호출 프로토콜 통합
    analysis.ts           (변경) tool_calls 지원 프롬프트
    content.ts            (변경) tool_calls 지원 프롬프트
    strategy.ts           (변경) tool_calls 지원 프롬프트
    cro.ts                (변경) tool_calls 지원 프롬프트
    psychology.ts         (변경) tool_calls 지원 프롬프트

config/
  domain.yaml             (신규) 도메인 설정
  tools.yaml              (신규) Sub-Reasoner별 도구 허용
  briefing-template.yaml  (신규) Slack 브리핑 템플릿
  company.md              (신규) 비즈니스 컨텍스트 원본
```

---

## 10. Tool Calling 구현 전략

### 10.1 runLLM 확장

현재 `runLLM()`은 text-in/text-out. 도구 호출을 위해 두 가지 경로:

- **Gemini 2.5 Flash**: Gemini API의 native function calling 지원 → `runLLM()`에 `tools` 파라미터 추가, `functionDeclarations`로 전달
- **Groq**: Groq API도 tool_use 지원 → 동일 패턴
- **Gemma4 (로컬)**: native tool calling 미지원 → JSON 프롬프트 방식 + `json_repair` 유틸로 파싱 실패 대응

```typescript
// lib/llm.ts 확장
export async function runLLMWithTools(
  system: string,
  prompt: string,
  tools: ToolDeclaration[],
  options?: { temperature?: number; maxTokens?: number; runtime?: RuntimeConfig }
): Promise<{ text: string; toolCalls: ToolCall[] }>
```

### 10.2 파싱 실패 폴백

LLM이 tool_calls를 잘못 생성하면:
1. JSON repair 시도 (닫히지 않은 브래킷 등)
2. repair 실패 시 → tool_calls 무시, 1차 텍스트만으로 분석 완료 (기존과 동일 품질)
3. 실패율 로깅 → self-improvement 루프에 반영

**목표**: 도구 호출 성공률 85%+, 실패해도 기존 수준 보장

---

## 11. 에러 처리

### 11.1 도구 호출 에러 포맷

```json
{"tool": "ga4_query", "status": "error", "error": "rate_limit", "message": "사이클당 호출 한도 초과"}
```

LLM 시스템 프롬프트에 명시: "도구 에러가 반환되면 해당 데이터 없이 분석을 진행하세요. WorldModel 데이터로 대체 가능합니다."

### 11.2 도구 타임아웃

- 개별 도구 호출 타임아웃: 5초
- 타임아웃 시 에러로 처리 (재시도 없음)
- LLM 2차 호출에서 에러 컨텍스트 포함

---

## 12. A2A 타임아웃 관리

### 12.1 ask_expert와 도구 호출 상호 배제

- Sub-Reasoner가 `ask_expert`를 사용하면 일반 도구 호출은 **2회까지** (3회 → 2회)
- `ask_expert` 자체 타임아웃: 8초
- `ask_expert`는 대상 전문가의 **축약 시스템 프롬프트** 사용 (전체 프롬프트 아닌 핵심 전문성만)

### 12.2 캐시 우선 전략

ask_expert 호출 전, 해당 전문가의 현재 사이클 분석 결과가 이미 있으면 → LLM 호출 없이 캐시에서 관련 부분 추출

---

## 13. 하네스 명명 및 기존 MCP Hub 관계

### 13.1 명칭 정리

- **Tool Harness** (`mcp-harness.ts`): Sub-Reasoner용 도구 호출 레이어. 내부 함수 래퍼.
- **MCP Hub** (기존 `mcp-connections.ts`): 외부 MCP 서버 연결 관리. 28개 커넥션.

Tool Harness의 6개 도구는 직접 함수 호출. MCP 프로토콜을 거치지 않음. 향후 MCP Hub의 커넥션이 활성화되면 Tool Harness에 MCP 기반 도구를 추가 등록하는 확장 경로 제공.

### 13.2 외부 API Rate Limit

사이클 단위 rate limit 외에, 외부 API(GA4, web_search)용 **슬라이딩 윈도우**:
- GA4: 분당 최대 10회
- web_search: 분당 최대 5회
- 인메모리 토큰 버킷으로 구현

---

## 14. 도메인 이식성 범위

### 14.1 Phase 7 범위

- config/ 디렉토리 + YAML 기반 설정 분리
- Sub-Reasoner 시스템 프롬프트를 config에서 로드
- 도구를 "범용" / "도메인 특화"로 분류
- company.md 부트스트랩 시 사용자 검토 단계 포함

### 14.2 범용 도구 vs 도메인 특화 도구

| 범용 (항상 사용 가능) | 도메인 특화 (config에서 등록) |
|---------------------|--------------------------|
| knowledge_search | ga4_query |
| episode_search | ga4_funnel |
| web_search | theater_detail |
| ask_expert | (새 회사별 추가 가능) |

### 14.3 WorldModel 이식성 — 향후 과제

현재 `WorldModelSnapshot` 타입이 GA4/SNS 필드를 하드코딩. Phase 7에서는 **프롬프트와 도구만 이식 가능**하게 하고, WorldModel 타입 리팩토링은 Phase 8로 분리. 부트스트랩 시 사용자에게 "WorldModel 필드는 수동 조정 필요"를 안내.

### 14.4 부트스트랩 사용자 검토 단계

```
1. company.md 파싱
2. config/ 자동 생성
3. ⚠️ 사용자에게 생성된 config 검토 요청
4. 승인 후 → Knowledge Store 시딩
5. 승인 후 → Sub-Reasoner 프롬프트 적용
```

---

## 15. 관측성 (Observability)

Tool Harness가 사이클마다 기록:

```typescript
type HarnessMetrics = {
  cycleId: string
  toolCalls: Array<{ tool: string; reasoner: string; latencyMs: number; cached: boolean; success: boolean }>
  cacheHitRate: number
  rateLimitRejections: number
  askExpertCalls: number
  toolCallParseFailures: number
}
```

- `.garnet-config/harness-metrics.json`에 저장 (대시보드용)
- `toolCallParseFailures`가 높으면 self-improvement 루프에서 프롬프트 개선

---

## 16. 제약사항

- 무료 모델만 사용: Gemini 2.5 Flash + Groq llama-3.3-70b + Gemma4
- Sub-Reasoner 타임아웃: 30초 유지 (실측 후 조정)
- Sub-Reasoner당 도구 호출 최대 3회 (ask_expert 사용 시 2회), ask_expert 최대 1회
- 사이클당 전체 도구 호출 최대 15회
- 외부 API 슬라이딩 윈도우: GA4 분당 10회, web_search 분당 5회
- 기존 Scanner → WorldModel 흐름 유지 (하네스는 추가 조회용)
- WorldModel 타입 리팩토링은 Phase 8로 분리
- 도메인 부트스트랩 시 사용자 검토 필수
