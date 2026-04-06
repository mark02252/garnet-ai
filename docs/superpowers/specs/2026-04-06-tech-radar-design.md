# Tech Radar — 스펙 문서

## 개요

마케팅 도구와 기술 스택을 자동 수집하고 시각적 레이더로 관리하는 시스템. GitHub Trending + 인텔 피드에서 후보를 자동 발굴하고, 사용자가 상태를 직접 결정한다.

## 목표

- GitHub Trending에서 관련 도구/기술 후보를 매일 자동 수집
- 마케팅 도구와 기술 스택을 하나의 레이더에서 통합 관리
- 도입 / 검토 중 / 보류 3단계로 명확하게 상태 관리
- 레이더 차트 + 리스트 뷰 전환으로 전략적 시각화

## 상태 정의

| 상태 | 의미 |
|---|---|
| 도입 (adopted) | 현재 사용 중이거나 도입 결정됨 |
| 검토 중 (assessing) | 평가 중, 자동 수집 항목의 초기 상태 |
| 보류 (hold) | 현재 적합하지 않음, 재검토 필요 |

## 데이터 모델

```prisma
model TechRadarItem {
  id          String   @id @default(cuid())
  name        String   @unique        // 소문자 정규화 후 저장 (중복 방지)
  category    String                  // "marketing" | "tech"
  status      String                  // "adopted" | "assessing" | "hold"
  description String?
  url         String?
  source      String?                 // "github" | "intel" | "manual"
  tags        String   @default("[]") // JSON array string
  addedAt     DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category])
  @@index([status])
  @@index([status, category])
}
```

**중복 처리:** 저장 시 `name.toLowerCase().trim()`으로 정규화 후 upsert — 이미 존재하면 `updatedAt`만 갱신하고 `status`는 유지.

## 자동 수집

### GitHub Trending 수집 방식

- **데이터 소스:** `https://github.com/trending/{lang}?since=weekly` HTML 스크래핑
  - 언어: `typescript`, `javascript`, `python` 3개 순서로 fetch
  - fetch + HTML 파싱 (정규식으로 repo명, star수, 주간 증가수 추출)
- **필터:** 스타 1,000+ 또는 주간 증가 50+ 레포만 후보 등록
- **AI 분류:** Gemini (`GEMINI_MODEL` 환경변수, 미설정 시 `gemini-2.5-flash` 기본값) 호출
  - 입력: repo명 + description (description 없으면 repo명만 사용)
  - 출력: `"marketing"` | `"tech"` | `"irrelevant"` (JSON 파싱, 실패 시 `"irrelevant"` 처리)
  - 프롬프트: "다음 GitHub 레포지토리가 마케팅 자동화/SNS/콘텐츠 도구면 'marketing', 프레임워크/라이브러리/AI/인프라 도구면 'tech', 그 외면 'irrelevant'로만 답하라."
  - `irrelevant` 항목은 저장 안 함
  - **Gemini 호출 실패 시:** 해당 항목 건너뜀 (잡 전체를 중단하지 않음)
- **초기 상태:** `assessing`으로 등록
- **Rate limiting:** 각 언어별 fetch 사이 500ms 딜레이

### 크론잡 등록

- **실행 방식:** `lib/scheduler/register-jobs.ts`에 인프로세스 잡으로 등록 (기존 패턴)
- **외부 트리거:** `GET /api/cron/tech-radar-collect` — `Authorization: Bearer {CRON_SECRET}` 인증 (기존 크론 라우트 패턴 동일)
- **주기:** 매일 오전 9시 (`0 9 * * *`)

### /intel 연동

- `/intel` 인텔 카드에 "Tech Radar 추가" 버튼 추가
- 클릭 시 모달 오픈 — 다음 필드 자동 pre-fill:
  - `name`: `item.title`
  - `url`: `item.url`
  - `description`: `item.snippet`
  - `source`: `"intel"`
- 사용자가 `category`와 `status` 선택 후 저장 → `/api/tech-radar` POST
- 저장 성공 시 모달 닫힘, 버튼 "✓ 추가됨"으로 변경 (savedIds 패턴, /intel 기존 방식과 동일)
- 취소 또는 모달 외부 클릭 시 닫힘

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/tech-radar` | 목록 조회 (category/status/q 필터, limit 기본 50) |
| POST | `/api/tech-radar` | 항목 추가 |
| PATCH | `/api/tech-radar/[id]` | 상태/정보 수정 |
| DELETE | `/api/tech-radar/[id]` | 항목 삭제 |
| GET | `/api/cron/tech-radar-collect` | GitHub Trending 수집 크론 (CRON_SECRET 인증) |

## UI 구조

### `/tech-radar` 페이지

**레이더 차트 뷰 (기본)**
- 순수 SVG로 구현 (외부 라이브러리 없음)
- 3개 동심원 링: 도입(안쪽, r=120) / 검토 중(중간, r=220) / 보류(바깥, r=300)
- 2개 섹터: 상단 반원 — 마케팅 도구 / 하단 반원 — 기술 스택
- 항목 배치: 같은 링+섹터 내 항목들을 섹터 호(arc) 안에서 균등 각도 분배
  - 각도 계산: `θ = sectorStart + (i + 1) * sectorSpan / (count + 1)` (i = 0-based index)
  - 좌표: `x = cx + r * cos(θ)`, `y = cy + r * sin(θ)` (cx/cy = SVG 중심점)
  - 예: 검토 중(r=220) + 마케팅(상단 반원 0°~180°) 3개 → 45°, 90°, 135° 위치
- 항목은 ● 점(r=5)으로 표시, 호버 시 이름+설명 툴팁
- 각 링/섹터에 레이블 표시

**리스트 뷰**
- 상태별 그룹핑된 카드 목록
- 카테고리 / 상태 필터 버튼
- 각 카드에서 상태 드롭다운으로 즉시 변경 (선택 즉시 PATCH 자동 저장, 별도 저장 버튼 없음)
- 출처 뱃지 (GitHub / Intel / Manual)

**뷰 전환**
- 우상단 토글 버튼 (차트 아이콘 ↔ 리스트 아이콘)

### 사이드바
- `components/app-nav.tsx`의 아카이브 navGroup에 `{ href: '/tech-radar', label: '테크 레이더', icon: <RadarIcon /> }` 추가

## 기존 시스템과의 관계

| 시스템 | 관계 |
|---|---|
| `/intel` | 인텔 항목 → "Tech Radar 추가" 버튼으로 연동 |
| `/research` | 독립적 (Research Memory는 아티클/인사이트, Tech Radar는 도구 평가) |
| Scheduler | 기존 `register-jobs.ts`에 GitHub Trending 크론잡 등록 |
| Gemini | AI 분류에 `GEMINI_MODEL` 사용 |
