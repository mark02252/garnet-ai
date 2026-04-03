# Garnet Agent Shell UI — Design Spec

> 날짜: 2026-03-31
> 상태: 설계 확정
> 작성: Claude Sonnet 4.6 + rnr

---

## 1. 배경 및 목표

Garnet은 "AI 마케팅 OS"에서 **개인 에이전트 시스템**으로 피벗 중이다 (ref: `docs/2026-03-27-personal-agent-pivot-plan.md`).

현재 UI는 Toss Business 스타일의 대시보드 구조 — 사용자가 페이지를 탐색하며 데이터를 찾아가는 방식이다. 에이전트 중심 시스템에서는 방향이 반대여야 한다: **에이전트가 결과를 사용자 앞에 가져온다.**

### 목표
- 명령 → 처리 → 결과를 하나의 공간에서 경험
- 에이전트가 살아있다는 느낌 (ambient 상태, 실시간 스트림)
- 기존 31개 페이지 기능 전부 보존 및 접근 가능
- JARVIS 스타일의 고도화된 에이전트 UI — 실용성 유지

### 비목표
- 기존 도메인 기능 재작성 (Operations, Campaigns, Analytics 등)
- 모바일 퍼스트 (데스크탑 우선, 최소 1024px 지원)
- 음성 인터페이스 (Phase 4 이후)

---

## 2. 핵심 패러다임 전환

| 현재 | Agent Shell |
|------|-------------|
| 사용자가 페이지를 열어 데이터를 확인 | 에이전트가 결과를 캔버스에 소환 |
| 사이드바 네비게이션 중심 | 하단 커맨드 바 중심 |
| 라이트 모드, 카드 대시보드 | 다크 퍼스트, 플로팅 패널 |
| 기능별 페이지 분리 | 하나의 캔버스에서 모든 실행 |
| 상태를 보러 이동 | 상태가 ambient하게 항상 보임 |

---

## 3. 레이아웃 구조

```
┌─────────────────────────────────────────────────────────────┐
│  ◈ GARNET   ·intel ●●●  ·seminar ●●○  ·video ●○○   [⌘K]  │  ← Ambient Bar (40px)
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  STREAM      │  CANVAS                                      │
│  (260px)     │  (flex-1, min-width: 764px)                  │
│              │                                              │
│  실행 로그    │  플로팅 패널들 (에이전트가 위치 결정)           │
│              │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│  COMMAND BAR (72px)                                         │
│  ◎ 입력  |  [Domains ↗]  [Approvals (n) ↗]  [History ↗]  │
└─────────────────────────────────────────────────────────────┘
```

최소 지원 뷰포트: **1024px**. 1024px 미만에서는 기존 도메인 레이아웃으로 폴백.

### 3.1 Ambient Bar (상단, 40px)
- 로고 + 현재 실행 중인 잡별 pulse dot (색상 + pulse 애니메이션 조합)
- dot 색상: running=`#3182f6` / idle=`#484f58` / error=`#ef4444`
- 클릭 시 해당 잡 패널을 캔버스에 소환
- `⌘K` — CommandPalette 호출 (기존 유지, root layout에서 이동)

### 3.2 Agent Stream (왼쪽, 260px 고정)
- monospace 폰트, 에이전트 처리 로그 실시간 표시
- 각 실행 항목: 시작 → 중간 단계들 → 완료/실패
- 색상: `#3182f6` 진행 중 / `#22c55e` 완료 / `#ef4444` 실패 / `#484f58` 대기
- 클릭하면 해당 결과 패널을 캔버스에 소환 (이미 닫혔을 경우 재소환)
- 스크롤 가능, 최근 50개 항목 유지

### 3.3 Canvas (우측 메인 공간, flex-1)
- `position: relative` 컨테이너, 패널은 `position: absolute`
- 에이전트가 패널 초기 위치를 결정 (Section 7 참고)
- 패널 드래그 가능 (react-rnd)
- 배경: 미세한 노이즈 텍스처 + 매우 옅은 dot grid
- `ResizeObserver`로 `canvasWidth` / `canvasHeight` 실시간 추적 → 패널 위치 계산에 사용

### 3.4 Command Bar (하단, 72px 고정)
- 항상 포커스 가능한 입력창
- 포커스 시 하단 border glow 확장 애니메이션
- 퀵 액션: Domains (전체 도메인 목록), Approvals (대기 수 뱃지), History

---

## 4. 라우트 구조 및 레이아웃 전략

### 4.1 라우트 그룹 분리

```
app/
├── layout.tsx                    ← Root: html/body/font/globals/Toaster만 (AppNav 제거)
│
├── (shell)/                      ← Agent Shell 전용 레이아웃 (새 UI)
│   ├── layout.tsx                ← AmbientBar + Stream + Canvas + CommandBar + CommandPalette
│   └── page.tsx                  ← 새 홈 (기존 app/page.tsx 대체)
│
└── (domains)/                    ← 기존 31개 페이지 (AppNav + topbar 유지)
    ├── layout.tsx                ← 기존 AppNav + app-topbar + app-main 구조 그대로
    ├── operations/
    ├── campaigns/
    ├── analytics/
    ├── sns/
    ├── seminar/
    ├── intel/
    ├── dashboard/
    ├── settings/
    └── ...
```

URL은 Next.js App Router route group 특성상 변경 없음:
- `/` → `(shell)/page.tsx` (Agent Shell 홈)
- `/operations` → `(domains)/operations/page.tsx` (기존 그대로)
- `/campaigns` → `(domains)/campaigns/page.tsx` (기존 그대로)

### 4.2 기존 링크 처리

`(domains)` 이동 시 URL이 바뀌지 않으므로 기존 `AppNav`, 내부 `href` 링크, Tauri 딥링크 **모두 변경 없음**. 폴더 이동만 필요.

### 4.3 CopilotSidebar 처리

- `(shell)/layout.tsx` — CopilotSidebar **제거**. Agent Shell의 CommandBar + Stream이 대체.
- `(domains)/layout.tsx` — CopilotSidebar **유지** (`⌘.` 토글). 도메인 페이지에서 기존 코파일럿 사용 가능.
- `/api/copilot` 엔드포인트 — 변경 없음 (domains에서 계속 사용)
- `/api/agent/command` — 새로 추가 (shell 전용)

---

## 5. 비주얼 언어

### 5.1 컬러 팔레트

```css
/* 배경 */
--bg-base: #0a0a0f;
--bg-surface: rgba(255,255,255,0.04);
--bg-surface-hover: rgba(255,255,255,0.06);

/* 텍스트 */
--text-primary: #e8eaed;
--text-secondary: #8b949e;
--text-muted: #484f58;

/* 테두리 */
--border-default: rgba(255,255,255,0.08);
--border-active: rgba(49,130,246,0.4);

/* Accent */
--accent: #3182f6;
--accent-glow: rgba(49,130,246,0.15);

/* 상태 */
--status-running: #3182f6;
--status-success: #22c55e;
--status-error: #ef4444;
--status-idle: #484f58;
```

### 5.2 패널 스타일

```css
.canvas-panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  backdrop-filter: blur(12px);
}

.canvas-panel[data-status="loading"] {
  animation: scan-line 1.5s linear infinite;
}

@keyframes scan-line {
  0%   { border-top-color: rgba(49,130,246,0); }
  50%  { border-top-color: rgba(49,130,246,0.8); }
  100% { border-top-color: rgba(49,130,246,0); }
}
```

### 5.3 패널 소환 애니메이션 (Framer Motion)

```typescript
const panelVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 8 },
  visible: { opacity: 1, scale: 1,    y: 0,
             transition: { type: 'spring', stiffness: 300, damping: 25 } },
  exit:    { opacity: 0, scale: 0.95, y: -4,
             transition: { duration: 0.15 } }
}
```

### 5.4 Pulse Dot

```css
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
.dot-running { color: #3182f6; animation: pulse-dot 1s ease-in-out infinite; }
.dot-idle    { color: #484f58; }
.dot-error   { color: #ef4444; animation: pulse-dot 0.5s ease-in-out infinite; }
```

---

## 6. 컴포넌트 구조

```
app/
├── (shell)/
│   ├── layout.tsx
│   └── page.tsx
├── (domains)/
│   ├── layout.tsx
│   └── [기존 31개 페이지]
│
components/
├── agent-shell/
│   ├── ambient-bar.tsx
│   ├── agent-stream.tsx
│   ├── canvas.tsx
│   ├── canvas-panel.tsx             ← 공통 래퍼 (드래그, 닫기, 최소화, 상태)
│   └── command-bar.tsx
│
├── panels/
│   ├── ga4-summary-panel.tsx
│   ├── seminar-status-panel.tsx
│   ├── intel-brief-panel.tsx
│   ├── video-status-panel.tsx
│   ├── approval-panel.tsx
│   └── generic-result-panel.tsx     ← 텍스트/마크다운 응답용
│
lib/
├── canvas-store.ts                  ← Zustand: 패널 + 히스토리 상태
└── agent-commands.ts                ← 명령 파싱 + action 라우팅
```

### 6.1 Canvas Store 타입

패널 데이터는 discriminated union으로 타입 안전하게:

```typescript
type PanelData =
  | { type: 'ga4';      data: GA4SummaryData }
  | { type: 'seminar';  data: SeminarStatusData }
  | { type: 'intel';    data: IntelBriefData }
  | { type: 'video';    data: VideoStatusData }
  | { type: 'approval'; data: ApprovalData }
  | { type: 'generic';  data: { markdown: string } }

type CanvasPanel = {
  id: string
  title: string
  status: 'loading' | 'active' | 'completed' | 'error'
  position: { x: number; y: number }
  size: { width: number; height: number }
  spawnedAt: number
} & PanelData

type CanvasStore = {
  panels: CanvasPanel[]
  spawnPanel: (panel: Omit<CanvasPanel, 'id' | 'spawnedAt'>) => void
  updatePanel: (id: string, patch: Partial<CanvasPanel>) => void
  removePanel: (id: string) => void
  clearCompleted: () => void
}
```

### 6.2 Agent Stream 타입

```typescript
type StreamEntry = {
  id: string
  label: string
  steps: StreamStep[]
  status: 'running' | 'done' | 'error'
  panelId?: string
  startedAt: number
}

type StreamStep = {
  text: string
  status: 'pending' | 'running' | 'done' | 'error'
}
```

---

## 7. 명령 처리 흐름 및 SSE 이벤트 스키마

```
사용자 입력 (command-bar)
    │
    ▼
POST /api/agent/command { text: string }
    │
    ▼
의도 파악 (LLM or rule-based)
    │
    ├─ "GA4 분석해줘"   → ga4-analysis action
    ├─ "세미나 시작해줘" → seminar-start action
    ├─ "캠페인 보여줘"  → { event: 'navigate', url: '/campaigns' }
    └─ 일반 질문       → generic 응답 → generic-result-panel
    │
    ▼
SSE stream (text/event-stream)
    │
    ▼
agent-stream.tsx 파싱 → UI 업데이트
```

### SSE 이벤트 타입 정의

```typescript
// 서버 → 클라이언트 이벤트 포맷
type AgentSSEEvent =
  | { event: 'step';     data: { entryId: string; step: StreamStep } }
  | { event: 'panel';    data: Omit<CanvasPanel, 'id' | 'spawnedAt'> }
  | { event: 'navigate'; data: { url: string } }
  | { event: 'done';     data: { entryId: string } }
  | { event: 'error';    data: { entryId: string; message: string } }

// SSE 포맷 (text/event-stream)
// event: step
// data: {"entryId":"abc","step":{"text":"GA4 수집 중...","status":"running"}}
```

---

## 8. 패널 배치 로직

`canvasWidth` / `canvasHeight`는 Canvas 컴포넌트에서 `ResizeObserver`로 추적:

```typescript
// canvas.tsx
const canvasRef = useRef<HTMLDivElement>(null)
const [canvasDims, setCanvasDims] = useState({ width: 0, height: 0 })

useEffect(() => {
  const observer = new ResizeObserver(([entry]) => {
    setCanvasDims({
      width: entry.contentRect.width,
      height: entry.contentRect.height
    })
  })
  if (canvasRef.current) observer.observe(canvasRef.current)
  return () => observer.disconnect()
}, [])
```

패널 초기 위치 계산:

```typescript
const PANEL_W = 380
const PANEL_H = 260
const GAP = 20

function getNextPanelPosition(
  activePanels: CanvasPanel[],
  canvasWidth: number
): { x: number; y: number } {
  const cols = Math.max(1, Math.floor((canvasWidth - GAP) / (PANEL_W + GAP)))
  const idx = activePanels.length
  return {
    x: GAP + (idx % cols) * (PANEL_W + GAP),
    y: GAP + Math.floor(idx / cols) * (PANEL_H + GAP)
  }
}
```

### 패널 생명주기 및 자동 퇴장

```
소환 → loading (스캔 라인 애니메이션)
    → active (데이터 표시)
    → completed (border 초록 glow 1초 → 일반으로)

자동 퇴장 조건: 활성 패널(loading/active) 수 ≥ 4
  - completed 패널이 있으면 가장 오래된 것 fade out → History 저장
  - completed 패널이 없으면 (모두 loading/active) 퇴장 없음 — 사용자가 수동 닫기
사용자 수동 닫기: 언제든 가능 → History 저장
```

---

## 9. History 저장 전략

- **저장소**: Zustand slice + `localStorage` 영속화 (zustand/middleware `persist`)
- **저장 대상**: 패널이 닫히거나 자동 퇴장될 때 `HistoryEntry` 생성
- **기존 연계**: `app/(domains)/history/` 페이지와는 독립 (기존은 Prisma JobRun 기반). Agent Shell History는 클라이언트 사이드 전용으로 시작, Phase UI-3에서 DB 연계 검토.

```typescript
type HistoryEntry = {
  id: string
  title: string
  type: PanelData['type']
  closedAt: number
  summary?: string         // 패널 완료 시 한 줄 요약
}
```

`[History ↗]` 버튼 → 히스토리 패널을 캔버스에 소환 (별도 페이지 이동 없음).

---

## 10. 신규 의존성

Phase UI-1 시작 전 설치 필수:

```bash
npm install framer-motion react-rnd zustand
```

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `framer-motion` | ^11 | 패널 소환/해제 애니메이션 |
| `react-rnd` | ^10 | 드래그 + 리사이즈 패널 |
| `zustand` | ^5 | Canvas 패널 + History 전역 상태 |

기존 스택 (Next.js 15, Tailwind, Prisma, Supabase) 전부 유지.
SSE는 native `ReadableStream` 사용 — 외부 라이브러리 불필요.

---

## 11. 기존 기능 접근성 보장

| 접근 방법 | 대상 |
|-----------|------|
| `[Domains ↗]` 버튼 | 기존 전체 페이지 목록 |
| `⌘K` CommandPalette | 페이지 이동 + 빠른 실행 (shell layout에서 유지) |
| Ambient Bar dot 클릭 | 해당 잡 상태 패널 소환 |
| Stream 항목 클릭 | 결과 패널 재소환 |
| 명령어 직접 입력 | "캠페인 보여줘" → navigate 이벤트 → 페이지 이동 |

`app/(domains)/` 페이지들은 기존 AppNav + CopilotSidebar와 함께 전체 화면으로 그대로 접근 가능.

---

## 12. 구현 단계

### Phase UI-1 — Agent Shell 기반 골격
1. `npm install framer-motion react-rnd zustand`
2. `app/layout.tsx` → html/body/font/Toaster만 남기기
3. `app/(shell)/layout.tsx` + `app/(domains)/layout.tsx` 생성
4. 기존 31개 페이지 → `app/(domains)/` 이동 (URL 변경 없음)
5. `lib/canvas-store.ts` Zustand 스토어
6. `components/agent-shell/` 4개 컴포넌트 (ambient-bar, agent-stream, canvas, command-bar)
7. `app/(shell)/page.tsx` (Agent Shell 진입점)
8. 다크 테마 CSS 변수 추가 (`globals.css`)

### Phase UI-2 — 패널 시스템 + 명령 처리
1. `components/panels/` 5개 핵심 패널
2. `components/agent-shell/canvas-panel.tsx` 공통 래퍼 (Framer Motion + react-rnd)
3. `/api/agent/command` SSE 엔드포인트
4. 패널 배치 로직 + ResizeObserver
5. `lib/agent-commands.ts` 의도 파악 + 라우팅

### Phase UI-3 — 고도화 + 폴리시
1. Canvas 배경 (노이즈 텍스처 + dot grid)
2. 패널 최소화 / 스냅 동작
3. History 패널 + localStorage 영속화
4. 1024px 미만 모바일 폴백 (도메인 레이아웃으로 리다이렉트)
5. Phase UI-3 이후: DB 기반 History 연계 검토
