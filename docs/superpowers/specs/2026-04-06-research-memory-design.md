# Research Memory — 스펙 문서

## 개요

큐레이션된 지식 저장소. 외부 아티클/트렌드와 내부 캠페인 인사이트를 저장하고, 태그/키워드 검색으로 수동 참조하는 시스템.

## 목표

- 외부 리서치(아티클, 트렌드, 리포트)와 내부 인사이트(캠페인 발견, 실험 결과)를 한 곳에 보관
- 태그 기반 빠른 검색으로 필요한 지식을 수동으로 참조
- `/intel` 페이지에서 원클릭으로 Research Memory에 저장

## 역할 분리

| 시스템 | 경로 | 역할 |
|---|---|---|
| 학습 아카이브 | `/learning` | 캠페인 실행 후 레슨 (구조화된 회고) |
| 리서치 메모리 | `/research` | 실행 전/중 참고할 지식 + 아이디어 메모 |
| 인텔 | `/intel` | 실시간 웹 인텔 모니터링 (→ Research Memory로 저장 가능) |

## 데이터 모델

### ResearchMemory (Prisma)

```prisma
model ResearchMemory {
  id        String   @id @default(cuid())
  title     String
  content   String?
  url       String?
  type      String   // "external" | "internal"
  tags      String[]
  source    String?
  savedAt   DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**필드 설명:**
- `title` — 필수. 아티클 제목 또는 메모 제목
- `content` — 선택. 요약 또는 메모 내용
- `url` — 선택. 외부 아티클 URL (URL 저장 시 제목 자동 추출)
- `type` — `"external"` (외부 아티클/트렌드) | `"internal"` (캠페인 인사이트/실험)
- `tags` — 자유 태그 배열 (예: `["릴스", "알고리즘", "2026Q1"]`)
- `source` — 출처명 (예: "Instagram Blog", "자체 실험", "Meta for Business")
- `savedAt` — 정보 저장 날짜 (기본: 현재)

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/research` | 목록 조회 (태그/키워드/타입 필터) |
| POST | `/api/research` | 새 항목 저장 |
| PATCH | `/api/research/[id]` | 항목 수정 |
| DELETE | `/api/research/[id]` | 항목 삭제 |

### GET `/api/research` 쿼리 파라미터
- `q` — 키워드 검색 (title, content, source 대상)
- `tags` — 태그 필터 (쉼표 구분)
- `type` — `external` | `internal`
- `page`, `limit` — 페이지네이션

## UI 구조

### `/research` 페이지

```
[+ 새 항목 추가] 버튼 (우상단)

[검색창] [타입 필터: 전체/외부/내부] [태그 필터]

──────────────────────────────────────
카드 목록:
  ┌─────────────────────────────────┐
  │ [타입 뱃지] 제목               │
  │ 출처 · 날짜                    │
  │ 태그들                         │
  │ 내용 요약 (있으면)             │
  └─────────────────────────────────┘
──────────────────────────────────────
```

### 추가 모달/폼
- URL 입력 → 제목 자동 추출 (Open Graph 파싱)
- 직접 제목/내용 입력
- 타입 선택 (외부/내부)
- 태그 입력 (콤마로 구분)
- 출처명 입력

### `/intel` 연동
- 인텔 아이템에 "Research Memory에 저장" 버튼 추가
- 클릭 시 제목/URL 자동 입력된 추가 모달 오픈

## 사이드바
- 기존 사이드바에 `/research` 항목 추가 (아이콘: BookOpen 또는 유사)

## 비고
- 벡터 DB 불필요 — Prisma full-text 또는 ILIKE 검색으로 충분
- 향후 벡터 검색 확장 가능 (pgvector)
- URL 메타데이터 추출은 서버사이드에서 처리 (`/api/research/fetch-meta`)
