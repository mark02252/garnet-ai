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
  name        String   @unique        // 중복 방지
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
}
```

## 자동 수집

### GitHub Trending 크론잡

- **주기:** 하루 1회 (매일 오전 9시)
- **대상:** GitHub Trending (TypeScript / JavaScript / Python)
- **필터:** 스타 1,000+ 또는 주간 증가 50+ 레포만 후보 등록
- **AI 분류:** 각 레포를 Garnet 컨텍스트 기준으로 분류
  - `marketing` — 마케팅, SNS, 콘텐츠, 분석 관련
  - `tech` — 프레임워크, 라이브러리, 인프라, AI/ML 관련
  - 무관 항목은 저장하지 않음
- **중복 처리:** `name` 유니크 제약으로 중복 자동 방지 (upsert 무시)
- **초기 상태:** 자동 수집 항목은 `assessing`으로 등록

### /intel 연동

- `/intel` 인텔 카드에 "Tech Radar 추가" 버튼 추가
- 클릭 시 카테고리/상태 선택 모달 → `/api/tech-radar` POST

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/tech-radar` | 목록 조회 (category/status/q 필터) |
| POST | `/api/tech-radar` | 항목 추가 |
| PATCH | `/api/tech-radar/[id]` | 상태/정보 수정 |
| DELETE | `/api/tech-radar/[id]` | 항목 삭제 |
| POST | `/api/cron/tech-radar-collect` | GitHub Trending 수집 크론 |

## UI 구조

### `/tech-radar` 페이지

**레이더 차트 뷰 (기본)**
- 순수 SVG로 구현 (외부 라이브러리 없음)
- 3개 동심원 링: 도입(안쪽) / 검토 중(중간) / 보류(바깥)
- 2개 섹터: 좌측 — 마케팅 도구 / 우측 — 기술 스택
- 항목은 ● 점으로 표시, 호버 시 이름+설명 툴팁
- 각 링/섹터에 레이블 표시

**리스트 뷰**
- 상태별 그룹핑된 카드 목록
- 카테고리 / 상태 필터 버튼
- 각 카드에서 상태 드롭다운으로 즉시 변경
- 출처 뱃지 (GitHub / Intel / Manual)

**뷰 전환**
- 우상단 토글 버튼 (차트 아이콘 ↔ 리스트 아이콘)

### 사이드바
- 아카이브 그룹에 `/tech-radar` 항목 추가

## 기존 시스템과의 관계

| 시스템 | 관계 |
|---|---|
| `/intel` | 인텔 항목 → "Tech Radar 추가" 버튼으로 연동 |
| `/research` | 독립적 (Research Memory는 아티클/인사이트, Tech Radar는 도구 평가) |
| Scheduler | 기존 `register-jobs.ts`에 GitHub Trending 크론잡 등록 |
