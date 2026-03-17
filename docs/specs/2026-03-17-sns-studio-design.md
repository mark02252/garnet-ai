# SNS 스튜디오 (Mirra 기능 통합) 설계 스펙

> 작성일: 2026-03-17
> 버전: v1.1 (스펙 리뷰 반영)
> 상태: 승인됨

---

## 1. 개요

Garnet에 SNS 전담 AI 매니저 기능을 통합한다. 참조 서비스인 Mirra(mirra.my)의 핵심 기능을 Garnet의 기존 아키텍처(Electron + Next.js + Prisma/SQLite) 위에 구현한다.

**핵심 철학:** 페르소나(Persona)가 모든 기능의 중심축. 콘텐츠 생성·발행·분석·댓글 자동화 모두 페르소나를 기반으로 동작한다.

**지원 플랫폼:** Instagram 우선, 이후 Threads → X → YouTube 순차 확장

**이미지 생성:** Google 나노바나나 2 — 모델 ID: `gemini-3.1-flash-image-preview`
> ⚠️ 구현 시작 전 `@google/genai` SDK 최신 버전에서 모델 ID 재확인 필요. 변경 시 업데이트할 것.

---

## 2. 서브시스템 구성

| # | 서브시스템 | 라우트 | 우선순위 |
|---|----------|--------|---------|
| A | AI 페르소나 엔진 | `/sns/personas` | 1 — 나머지 모든 기능의 기반 |
| B | 콘텐츠 제작소 | `/sns/studio` | 2 |
| C | 콘텐츠 캘린더 + 예약 발행 | `/sns/calendar` | 3 |
| D | 성과 대시보드 | `/sns/analytics` | 4 |
| E | 댓글 자동화 | `/sns/community` | 5 |

---

## 3. 전체 아키텍처

### 3.1 페이지 구조

```
/sns
├── /sns/personas              # A. 페르소나 목록 + 생성
│   ├── /sns/personas/new      #    신규 페르소나 마법사
│   └── /sns/personas/[id]     #    페르소나 상세 / 편집
├── /sns/studio                # B. 콘텐츠 제작소 (텍스트·카드뉴스·영상)
│   └── /sns/studio/[draftId]  #    초안 편집
├── /sns/calendar              # C. 캘린더 + 예약 발행
├── /sns/analytics             # D. 성과 대시보드 (Instagram 연동)
└── /sns/community             # E. 댓글 자동화
```

### 3.2 데이터 흐름

```
페르소나(A) ──기반──▶ 콘텐츠 제작(B)
                           │
                           ▼
                      예약 발행(C)
                           │
                           ▼
                 나노바나나 2 이미지 생성
                           │
                           ▼
                  Supabase Storage 업로드
                  (slides[].imageUrl 저장)
                           │
                           ▼
                      성과 분석(D) ◀── Instagram Graph API
                           │
                           ▼
                      댓글 관리(E) ◀── Instagram Graph API
```

### 3.3 기존 Garnet과 연결점 및 마이그레이션

- **`ContentDraft` → `SnsContentDraft` 마이그레이션:** 기존 `/content` 페이지의 `ContentDraft` 모델은 `SnsContentDraft`로 통합한다. 기존 레코드는 `personaId = null` 허용(nullable)으로 마이그레이션 후 순차적으로 연결. 기존 `ContentDraft` 모델은 마이그레이션 완료 후 스키마에서 제거.
- **`InstagramReachDaily` → `SnsAnalyticsSnapshot` 마이그레이션:** 기존 `accountId(String)` → `personaId` 매핑 필요. Instagram 계정 핸들(`instagramHandle`)이 일치하는 `SnsPersona`의 `id`로 연결. 매핑 불가 레코드는 orphan 처리(personaId null 허용).
- **기존 KPI 목표(`KpiGoal`)** ↔ SNS 성과 연동은 향후 확장 계획.
- **기존 Instagram OAuth 인프라 재활용.** 단, 댓글 자동화(E)를 위해 OAuth scope에 `instagram_manage_comments` 추가 필요 (섹션 8 참고).

### 3.4 네비게이션 추가

`components/app-nav.tsx`에 **SNS 스튜디오** 그룹 추가:
- 페르소나 (`/sns/personas`)
- 콘텐츠 제작소 (`/sns/studio`)
- 캘린더 (`/sns/calendar`)
- 성과 분석 (`/sns/analytics`)
- 커뮤니티 (`/sns/community`)

### 3.5 SQLite 배열 필드 처리 원칙

Prisma + SQLite는 네이티브 배열 타입을 지원하지 않는다. 배열 데이터는 모두 `String` 타입으로 저장하며 JSON 직렬화/역직렬화로 처리한다.

```typescript
// 저장: JSON.stringify(['keyword1', 'keyword2'])
// 읽기: JSON.parse(persona.keywords) as string[]
```

---

## 4. 서브시스템 A — AI 페르소나 엔진

### 4.1 개요

SNS 계정의 브랜드 컨셉·타겟·글쓰기 스타일을 AI가 학습하여 페르소나 프로필을 생성. 이후 모든 콘텐츠 생성 시 해당 페르소나의 톤/스타일이 자동 반영된다.

### 4.2 학습 모드

| 모드 | 설명 | MVP |
|------|------|-----|
| ① 내 계정 분석 | 과거 포스팅 20개↑ 분석 → 패턴 학습 | ✅ |
| ② 계정 카피 | 타인 계정 ID 입력 → 스타일 복제 | 향후 |
| ③ 신규 생성 | 목적/타겟 설정만으로 AI 페르소나 제안 | ✅ |

### 4.3 데이터 수집 방식

**하이브리드 방식 (MVP → 점진 전환):**
- MVP: 수동 업로드 (텍스트 붙여넣기 or CSV)
- 1차 확장: Instagram Graph API 자동 수집
- 최종: 전 플랫폼 API 자동 연동

### 4.4 페르소나 생성 마법사 플로우

```
Step 1: 학습 모드 선택 (① or ③)
Step 2: 데이터 입력
  - ① 모드: 포스팅 텍스트 20개↑ 입력 또는 Instagram API 자동 수집
  - ③ 모드: 브랜드명 / 운영 목적 / 타겟 / 언어
Step 3: AI 분석 → 페르소나 프리뷰 + 튜닝
  - 브랜드 컨셉 (수정 가능)
  - 타겟 오디언스 (수정 가능)
  - 글쓰기 스타일 (수정 가능)
  - 톤 슬라이더 (공식적 ←→ 친근한)
  - 자주 쓰는 키워드 태그
```

### 4.5 AI 분석 프롬프트

```
시스템:
"다음 포스팅들을 분석해 아래 JSON 형식으로 브랜드 페르소나를 추출하세요:
{
  brandConcept: string,       // 브랜드 핵심 컨셉 (1-2문장)
  targetAudience: string,     // 타겟 오디언스 설명
  writingStyle: string,       // 글쓰기 스타일 설명
  tone: string,               // formal | casual | energetic | professional
  keywords: string[],         // 자주 쓰는 단어/표현 (최대 10개)
  sampleSentences: string[]   // 대표 문체 예시 (3개)
}"
```

### 4.6 Prisma 스키마

> `PersonaPlatform` 열거형은 여기서 한 번만 정의하며, B(SnsContentDraft)와 C(SnsScheduledPost)에서 재사용한다. 재선언 금지.

```prisma
enum PersonaLearnMode { FROM_POSTS FROM_TEMPLATE }
enum PersonaPlatform  { INSTAGRAM THREADS X YOUTUBE }

model SnsPersona {
  id              String           @id @default(cuid())
  name            String
  platform        PersonaPlatform  @default(INSTAGRAM)
  learnMode       PersonaLearnMode
  brandConcept    String?
  targetAudience  String?
  writingStyle    String?
  tone            String?
  // 배열 데이터는 JSON 직렬화 문자열로 저장 (SQLite 호환)
  keywords        String           @default("[]")   // JSON: string[]
  sampleSentences String           @default("[]")   // JSON: string[]
  instagramHandle String?
  isActive        Boolean          @default(true)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  sourcePosts      SnsPersonaPost[]
  contentDrafts    SnsContentDraft[]
  scheduledPosts   SnsScheduledPost[]
  analytics        SnsAnalyticsSnapshot[]
  commentTemplates SnsCommentTemplate[]
}

model SnsPersonaPost {
  id        String     @id @default(cuid())
  personaId String
  content   String
  postedAt  DateTime?
  source    String?    // "manual" | "instagram_api"
  persona   SnsPersona @relation(fields: [personaId], references: [id], onDelete: Cascade)

  @@index([personaId])
}
```

### 4.7 API 라우트

```
app/api/sns/personas/
├── route.ts              # GET(목록) / POST(생성)
├── [id]/route.ts         # GET / PATCH / DELETE
└── [id]/learn/route.ts   # POST — AI 분석 트리거 (SSE 스트림)
```

---

## 5. 서브시스템 B — 콘텐츠 제작소

### 5.1 콘텐츠 타입

| 타입 | 설명 |
|------|------|
| TEXT | 텍스트 포스트 |
| CAROUSEL | 카드뉴스 (슬라이드 형식) |
| VIDEO | 릴스/숏폼 영상 |

### 5.2 기획 엔진

| 모드 | 설명 |
|------|------|
| CREATIVE | LLM 자체 아이디어 창작 |
| SEARCH | 웹서치 기반 트렌드 반영 |
| FILE | PDF/텍스트 업로드 → 전문 지식 활용 |

### 5.3 텍스트 포스트

기존 `/content` 페이지 로직 흡수. 페르소나 선택 시 시스템 프롬프트에 자동 주입:

```
"당신은 {brandConcept} 브랜드의 SNS 담당자입니다.
 타겟: {targetAudience}
 글쓰기 스타일: {writingStyle}
 자주 쓰는 표현: {JSON.parse(keywords).join(', ')}
 다음 지시에 따라 Instagram 포스팅을 작성하세요."
```

### 5.4 카드뉴스 제작 플로우

```
기획안 텍스트 입력
     ↓
AI가 N장 슬라이드로 자동 분배
  (커버 1장 + 본문 N장 + CTA 1장)
     ↓
각 슬라이드: { title, body, imagePrompt }
     ↓
나노바나나 2 API → 슬라이드 이미지 생성
  (페르소나 레퍼런스 이미지 최대 14장 주입 → 스타일 일관성)
     ↓
생성된 이미지 base64 → Supabase Storage 업로드
  → slides[].imageUrl에 Storage URL 저장
     ↓
텍스트 오버레이 → 최종 카드뉴스
```

### 5.5 나노바나나 2 연동

```typescript
// app/api/sns/content/[id]/image/route.ts
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY! })

// ⚠️ 구현 전 모델 ID 재확인: ai.models.list() 또는 공식 문서 참조
const response = await ai.models.generateContent({
  model: 'gemini-3.1-flash-image-preview',
  contents: imagePrompt,
  // 페르소나 레퍼런스 이미지 최대 14장 주입 → 브랜드 일관성
})
// 결과: base64 → Supabase Storage (garnet-attachments 버킷) → URL 반환
```

**비용:** $0.065/이미지 (카드뉴스 5장 = 약 $0.33)

### 5.6 영상 렌더링 (릴스/숏폼)

```
완성된 카드뉴스 슬라이드 배열
     ↓
슬라이드별 노출 시간 설정 (기본 3초/장)
     ↓
fluent-ffmpeg + ffmpeg-static → MP4 로컬 렌더링
     ↓
BGM 선택: 무료 음원 라이브러리 or 파일 업로드
     ↓
최종 MP4 → Supabase Storage or 로컬 다운로드
```

**Electron 빌드 설정 (ffmpeg-static 번들링):**
```json
// package.json electron-builder 설정
{
  "build": {
    "asarUnpack": [
      ".next-build/**",
      "node_modules/ffmpeg-static/**"  // ffmpeg 바이너리 asar 제외
    ],
    "files": [
      "node_modules/ffmpeg-static/**"
    ]
  }
}
```
```typescript
// electron/main.ts — ffmpeg 경로 주입
import ffmpegPath from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'
ffmpeg.setFfmpegPath(ffmpegPath!)
```

> Electron 환경이므로 `fluent-ffmpeg`으로 서버 비용 없이 로컬 렌더링 가능.

### 5.7 Prisma 스키마

> `PersonaPlatform` 열거형은 섹션 4.6에서 정의됨 — 재선언 불필요.

```prisma
enum ContentType  { TEXT CAROUSEL VIDEO }
enum DraftStatus  { DRAFT SCHEDULED PUBLISHED FAILED }
enum PlanningMode { CREATIVE SEARCH FILE }

model SnsContentDraft {
  id           String          @id @default(cuid())
  personaId    String?         // nullable: ContentDraft 마이그레이션 시 일시적
  type         ContentType
  planningMode PlanningMode    @default(CREATIVE)
  title        String?
  content      String?
  slides       String?         // JSON: [{ title, body, imageUrl, imagePrompt }]
  videoUrl     String?
  status       DraftStatus     @default(DRAFT)
  // scheduledAt은 SnsScheduledPost가 단일 진실의 출처 — 여기서 중복 관리 안 함
  publishedAt  DateTime?
  platform     PersonaPlatform @default(INSTAGRAM)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  persona      SnsPersona?     @relation(fields: [personaId], references: [id])
  scheduled    SnsScheduledPost[]

  @@index([personaId])
  @@index([status])
}
```

### 5.8 API 라우트

```
app/api/sns/content/
├── route.ts               # GET(목록) / POST(초안 생성)
├── [id]/route.ts          # GET / PATCH / DELETE
├── [id]/image/route.ts    # POST — 나노바나나 2 이미지 생성
└── [id]/render/route.ts   # POST — FFmpeg 영상 렌더링
```

---

## 6. 서브시스템 C — 콘텐츠 캘린더 + 예약 발행

### 6.1 캘린더 UI

월간 캘린더 뷰. 각 날짜 셀에 예약된 콘텐츠를 페르소나별 색상 + 타입 아이콘으로 표시.

### 6.2 예약 발행 시스템

```
사용자: 초안 완성 → [예약 발행] 클릭
             ↓
POST /api/sns/schedule — draftId 이미 PENDING인지 체크
  → 중복이면 409 Conflict 반환 (idempotency guard)
             ↓
날짜/시간 선택 + 페르소나 확인
             ↓
SnsScheduledPost 생성 (status: PENDING)
SnsContentDraft.status = SCHEDULED
             ↓
Electron main process — setInterval 1분마다 체크
  → 예약 시간 도달 시 Instagram Graph API publish 호출
  → status: PUBLISHED / FAILED 업데이트
             ↓
알림 인박스(/notifications)에 발행 결과 푸시
```

**앱 종료 시 처리:** 앱 재시작 시 `status = PENDING AND scheduledAt < now()` → `MISSED`로 일괄 업데이트 후 사용자에게 알림.

### 6.3 AI 최적 발행 시간 추천

```
GET /api/sns/analytics/best-time?personaId=xxx

과거 SnsAnalyticsSnapshot 분석:
→ 요일별 / 시간대별 engagement 평균 계산
→ 상위 3개 시간대 추천
→ 캘린더 예약 시 추천 시간 하이라이트
```

### 6.4 Prisma 스키마

> `PersonaPlatform` 열거형은 섹션 4.6에서 정의됨 — 재선언 불필요.

```prisma
enum ScheduleStatus { PENDING PUBLISHED FAILED MISSED }

model SnsScheduledPost {
  id          String          @id @default(cuid())
  draftId     String          @unique  // 초안당 1개 예약만 허용
  personaId   String
  platform    PersonaPlatform @default(INSTAGRAM)
  scheduledAt DateTime
  publishedAt DateTime?
  status      ScheduleStatus  @default(PENDING)
  errorMsg    String?
  createdAt   DateTime        @default(now())

  draft       SnsContentDraft @relation(fields: [draftId], references: [id])
  persona     SnsPersona      @relation(fields: [personaId], references: [id])

  @@index([status, scheduledAt])  // Electron 타이머 쿼리 최적화
}
```

### 6.5 API 라우트

```
app/api/sns/schedule/
├── route.ts       # GET(캘린더 목록) / POST(예약 생성 — draftId 중복 체크)
└── [id]/route.ts  # PATCH(수정) / DELETE(취소)
```

---

## 7. 서브시스템 D — 성과 대시보드

### 7.1 주요 지표

- 총 도달수 (reach)
- 인게이지먼트율 (engagement %)
- 팔로워 증가
- 발행 수
- 인기 포스팅 TOP 5
- 도달수 추이 (라인차트)

### 7.2 데이터 수집

```
Electron main process — 매일 자정 자동 수집 (+ 수동 트리거 가능)
     ↓
GET https://graph.instagram.com/me/media
  → 각 포스팅: impressions, reach, engagement, likes, comments
     ↓
upsert SnsAnalyticsSnapshot (@@unique([personaId, date]) 기준)
  → 중복 수집 시 기존 레코드 업데이트 (idempotent)
```

### 7.3 AI 디스커션

성과 데이터 JSON을 컨텍스트로 주입한 runLLM() 호출. 사용자가 자연어로 전략 질문 가능.

### 7.4 Prisma 스키마

```prisma
model SnsAnalyticsSnapshot {
  id          String          @id @default(cuid())
  personaId   String
  platform    PersonaPlatform @default(INSTAGRAM)
  date        DateTime
  reach       Int             @default(0)
  impressions Int             @default(0)
  engagement  Float           @default(0)
  followers   Int             @default(0)
  postCount   Int             @default(0)
  topPostId   String?
  createdAt   DateTime        @default(now())

  persona     SnsPersona      @relation(fields: [personaId], references: [id])

  @@unique([personaId, date])  // 중복 수집 방지
}
```

### 7.5 API 라우트

```
app/api/sns/analytics/
├── route.ts              # GET (스냅샷 목록)
├── sync/route.ts         # POST — 수동 Instagram 데이터 수집 트리거
└── best-time/route.ts    # GET (최적 발행 시간 추천)
```

---

## 8. 서브시스템 E — 댓글 자동화

### 8.1 Instagram OAuth 스코프 추가

기존 OAuth 스코프에 `instagram_manage_comments` 추가 필요:
```
기존: instagram_business_basic, instagram_business_manage_insights
추가: instagram_manage_comments
```
`/app/api/meta/oauth/exchange` 라우트 및 OAuth 초기화 코드 수정 필요.

### 8.2 댓글 관리 플로우

```
Instagram Graph API → 미답변 댓글 수집
     ↓
목록 표시 (댓글 내용 + 작성자)
     ↓
다중 선택 → [AI 답변 일괄 생성]
     ↓
runLLM() — 페르소나 톤/스타일 주입
  → 각 댓글에 개별 답변 초안 생성
     ↓
사용자 수정 가능
     ↓
[발행] → POST /{comment-id}/replies (instagram_manage_comments 스코프 필요)
```

### 8.3 AI 답변 프롬프트

```
"당신은 {brandConcept} 브랜드의 SNS 담당자입니다.
 글쓰기 스타일: {writingStyle}, 톤: {tone}
 자주 쓰는 표현: {JSON.parse(keywords).join(', ')}
 다음 댓글에 자연스럽게 답변하세요: '{comment}'"
```

### 8.4 DM 전환 자동화 (향후 구현)

특정 키워드 댓글 감지 시 DM 자동 발송으로 구매 페이지 유도.

### 8.5 Prisma 스키마

```prisma
model SnsCommentTemplate {
  id              String     @id @default(cuid())
  personaId       String
  // 배열은 JSON 직렬화 문자열로 저장 (SQLite 호환)
  triggerKeywords String     @default("[]")  // JSON: string[]
  replyType       String     // "comment" | "dm"
  template        String
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())

  persona         SnsPersona @relation(fields: [personaId], references: [id])

  @@index([personaId])
}
```

### 8.6 API 라우트

```
app/api/sns/community/
├── comments/route.ts              # GET (Instagram API 연동)
├── comments/[id]/reply/route.ts   # POST (답변 발행)
└── comments/generate/route.ts     # POST (AI 답변 일괄 생성)
```

---

## 9. 신규 패키지

| 패키지 | 용도 |
|--------|------|
| `@google/genai` | 나노바나나 2 이미지 생성 |
| `fluent-ffmpeg` | 영상 렌더링 |
| `ffmpeg-static` | FFmpeg 바이너리 번들 (Electron asar 제외 설정 필요) |

---

## 10. 구현 순서 (A → E)

1. **A. 페르소나 엔진** — Prisma 스키마 + API + UI (마법사 + 목록)
2. **B. 콘텐츠 제작소** — 텍스트 → 카드뉴스(나노바나나 2) → 영상(FFmpeg) 순서로 점진 구현
3. **C. 캘린더** — 예약 발행 + Electron 타이머 + MISSED 처리
4. **D. 성과 대시보드** — Instagram API 수집 + upsert + 차트
5. **E. 커뮤니티** — OAuth 스코프 추가 + 댓글 수집 + AI 답변 자동화

---

## 11. 향후 확장 계획

- 페르소나 모드 ② (계정 카피) 구현
- Threads, X, YouTube 플랫폼 추가
- DM 전환 자동화 (키워드 트리거)
- KPI 목표와 SNS 성과 통합 뷰
- 팀 협업 (워크스페이스 멤버별 페르소나 권한)
