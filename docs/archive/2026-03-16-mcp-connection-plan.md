# Garnet MCP 연결 계획

> 작성일: 2026-03-16
> 목적: 연결 가능한 외부 MCP 파악 및 우선순위 정리

---

## 1. 현재 MCP 상태

### 활성 연결 (1개)
| ID | 이름 | 설명 |
|----|------|------|
| `aimd-local` | 내부 Garnet 서버 | 실행/데이터셋/학습카드/인스타그램 데이터 노출 |

내부 서버가 노출하는 것:
- **Tools**: `list_runs`, `get_run_detail`, `list_datasets`, `get_dataset_detail`, `list_learning_cards`, `get_instagram_reach_summary`
- **Resources**: `aimd://overview`, `aimd://runs/recent`, `aimd://learning/recent`
- **Prompts**: `run-retrospective`, `dataset-insight-brief`, `learning-card-pack`

### 레지스트리에 있으나 미구현 (8개)
| ID | Wave | 상태 |
|----|------|------|
| `playwright` | 1 | 부분 구현 (smoke test API 준비됨) |
| `figma` | 1 | 템플릿만 |
| `notion` | 1 | 템플릿만, OAuth 미구현 |
| `sentry` | 2 | 템플릿만 |
| `browserstack` | 2 | 템플릿만 |
| `github` | 3 | 템플릿만 |
| `vercel` | 3 | 템플릿만 |
| `db-toolbox` | 3 | 템플릿만 |

---

## 2. 신규 추가 권장 MCP

레지스트리에 없지만 Garnet 워크플로우와 직결되는 서비스들.

| ID | 이름 | npm 패키지 | Transport | 추가 이유 |
|----|------|-----------|-----------|---------|
| `supabase` | Supabase MCP | `@supabase/mcp-server-supabase` | stdio | 이미 연결된 Supabase DB 직접 관리 |
| `slack` | Slack MCP | `@modelcontextprotocol/server-slack` | stdio | 승인 알림/브리핑 공유 워크플로우 |
| `gdrive` | Google Drive MCP | `@modelcontextprotocol/server-gdrive` | stdio | 데이터셋 파일 자동 동기화 |
| `brave-search` | Brave Search MCP | `@modelcontextprotocol/server-brave-search` | stdio | 캠페인 스튜디오 실시간 시장 조사 |

---

## 3. 연결 우선순위 및 가치

### 🔴 Wave 1 — 즉시 연결 (업무 가치 직결)

#### Notion `@notionhq/notion-mcp-server`
- **레지스트리**: 이미 있음
- **설정**: Notion Integration API Key
- **연결 시 가능한 것**
  - 세미나 보고서 → Notion 페이지 자동 발행
  - 플레이북 카드 → Notion DB 저장
  - 오늘의 브리핑 → 팀 공유 페이지 푸시
  - 내부 MCP 프롬프트(`run-retrospective`, `learning-card-pack`) 결과를 Notion으로 직접 전달
- **연결 화면**: `app/seminar/page.tsx`, `app/learning/page.tsx`, `app/operations/page.tsx`

#### Playwright `@playwright/mcp`
- **레지스트리**: 이미 있음
- **설정**: `npx @playwright/mcp@latest` 명령어 등록
- **연결 시 가능한 것**
  - `/api/mcp/playwright/smoke` 엔드포인트 활성화
  - 4개 핵심 화면(홈, 설정, 데이터, 세미나) 자동 점검
  - 배포 후 회귀 테스트 버튼 한 번으로 실행
- **연결 화면**: `app/settings/page.tsx` 개발 점검 모드

#### Supabase `@supabase/mcp-server-supabase` ⭐ 신규 추가
- **레지스트리**: 없음 → 추가 필요
- **설정**: Supabase Personal Access Token (`supabase.com/dashboard/account/tokens`)
- **연결 시 가능한 것**
  - `workspace_runs`, `workspace_learning_archives` 등 공유 테이블 직접 쿼리
  - 마이그레이션 상태 확인, 스키마 탐색
  - 팀 협업 데이터 Claude가 직접 읽고 분석
- **참고**: 프로젝트 ref `pwllacujwgzulkelqfrq` 이미 알고 있음

---

### 🟡 Wave 2 — 워크플로우 자동화

#### Slack `@modelcontextprotocol/server-slack` ⭐ 신규 추가
- **레지스트리**: 없음 → 추가 필요
- **설정**: Slack App Bot Token + Channel ID
- **연결 시 가능한 것**
  - 승인 대기 항목 Slack 채널로 자동 알림
  - 오늘의 브리핑 매일 아침 채널 발송
  - 캠페인 룸 상태 변경 알림
  - 세미나 결과 팀 공유
- **연결 화면**: `app/operations/page.tsx`, `app/campaigns/page.tsx`

#### Google Drive `@modelcontextprotocol/server-gdrive` ⭐ 신규 추가
- **레지스트리**: 없음 → 추가 필요
- **설정**: Google OAuth 2.0
- **연결 시 가능한 것**
  - Drive 폴더에서 데이터셋 CSV/XLSX 자동 동기화
  - 보고서 PDF Drive 저장
  - 팀 공유 파일 앱에서 바로 참조
- **연결 화면**: `app/datasets/page.tsx`

#### Figma (이미 레지스트리에 있음)
- **설정**: Figma Personal Access Token + 팀 ID
- **연결 시 가능한 것**
  - 디자인 컴포넌트 현황 동기화
  - 캠페인 크리에이티브 에셋 참조

---

### 🟢 Wave 3 — 운영 확장

| MCP | 가치 |
|-----|------|
| Sentry | 배포 후 오류 요약 → 캠페인 실행 영향 분석 |
| GitHub | 이슈 자동 생성, PR 상태 확인 |
| Vercel | 배포 로그와 캠페인 실험 연결 |
| Brave Search ⭐ | 캠페인 스튜디오에서 실시간 시장 조사 |

---

## 4. 수정된 레지스트리 계획

`lib/mcp-connections.ts`에 추가할 항목:

```typescript
// Supabase — Wave 1 신규
{
  id: 'supabase',
  name: 'Supabase MCP',
  description: '팀 공유 DB 직접 접근 및 관리',
  phase: 1,
  scope: 'data',
  transport: 'stdio',
  setupMode: 'command',
  authMode: 'bearer',
  command: 'npx',
  args: ['-y', '@supabase/mcp-server-supabase', '--access-token', '<token>'],
  documentationUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
  recommendedScreens: ['/settings', '/dashboard'],
}

// Slack — Wave 2 신규
{
  id: 'slack',
  name: 'Slack MCP',
  description: '승인 알림 및 브리핑 채널 공유',
  phase: 2,
  scope: 'workspace',
  transport: 'stdio',
  setupMode: 'command',
  authMode: 'bearer',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-slack'],
  documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  recommendedScreens: ['/operations', '/campaigns'],
}

// Google Drive — Wave 2 신규
{
  id: 'gdrive',
  name: 'Google Drive MCP',
  description: '데이터셋 파일 동기화 및 보고서 저장',
  phase: 2,
  scope: 'data',
  transport: 'stdio',
  setupMode: 'oauth',
  authMode: 'none',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-gdrive'],
  documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
  recommendedScreens: ['/datasets'],
}

// Brave Search — Wave 3 신규
{
  id: 'brave-search',
  name: 'Brave Search MCP',
  description: '캠페인 스튜디오 실시간 시장 조사',
  phase: 3,
  scope: 'research',
  transport: 'stdio',
  setupMode: 'command',
  authMode: 'bearer',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-brave-search'],
  documentationUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
  recommendedScreens: ['/'],
}
```

---

## 5. 내일 실행 순서

1. `lib/mcp-connections.ts` — Supabase, Slack, Google Drive, Brave Search 4개 항목 추가
2. Supabase MCP 실제 연결 테스트 (Personal Access Token 발급)
3. Notion MCP OAuth 플로우 구현 (`setupMode: 'oauth'` 처리)
4. Playwright MCP 명령어 연결 후 smoke test 실행 확인
5. 각 MCP가 연결됐을 때 사용할 화면별 액션 버튼 추가 (Notion 발행, Slack 공유 등)

---

## 6. 화면별 MCP 통합 계획

| 화면 | 연결할 MCP | 추가할 액션 |
|------|-----------|-----------|
| `app/page.tsx` (스튜디오) | Notion, Brave Search | 브리프 Notion 발행, 시장 조사 버튼 |
| `app/operations/page.tsx` | Slack, Notion | 브리핑 채널 공유, Notion 발행 |
| `app/campaigns/page.tsx` | Slack | 캠페인 상태 알림 |
| `app/seminar/page.tsx` | Notion | 보고서 Notion 발행 |
| `app/learning/page.tsx` | Notion | 플레이북 Notion DB 저장 |
| `app/datasets/page.tsx` | Google Drive | Drive 파일 가져오기/저장 |
| `app/settings/page.tsx` | Playwright, Supabase | smoke test, DB 관리 |
