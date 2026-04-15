# Garnet 개발 진행 현황 및 향후 계획

> 작성일: 2026-03-19 | 현재 버전: v0.3.1+
> 이전 버전: v0.2.5 (2026-03-18 세션 시작 시점)

---

## 1. 이번 세션 완료 사항 (52개 커밋)

### Phase 1: 시각화 + 실제 연동 (v0.3.0)

| 기능 | 상세 |
|------|------|
| **마케팅 대시보드** | recharts 도달 추이 라인 차트 + 7일 이동평균, KPI 달성률 카드, 기간 선택(7/30/90일), 참여 지표(좋아요/댓글/게시빈도), 콘텐츠 유형별 분포 바 차트, 팔로워 현황 |
| **오늘의 할 일** | AI 브리핑 카드 (오늘/주간 예약 건수 + 도달 추세 + 추천), 예약 게시물 미리보기 (5건 타임라인) |
| **동기화 시스템** | 수동 동기화 버튼, 자동 동기화 (1시간 threshold), 마지막 동기화 시간 표시 |
| **Instagram 실제 게시** | `lib/sns/instagram-publisher.ts` — 단일 이미지 + 캐러셀 Graph API 발행, 즉시 발행 엔드포인트 (`/api/sns/content/[id]/publish`) |
| **자동 스케줄** | Electron 1분 타이머, 보안 저장소에서 토큰 읽어 전달 |
| **토큰 관리** | 단기→60일 장기 토큰 자동 교환 (저장 시), 24시간마다 자동 갱신 (Electron 백그라운드) |

### Phase 2: AI 자동화 (v0.3.1)

| 기능 | 상세 |
|------|------|
| **AI 성과 분석 리포트** | `lib/sns/performance-analyzer.ts` — Instagram 인사이트 수집 → LLM 분석 → 종합 리포트 (성과 요약, Top/저성과 분석, 패턴, 추천 콘텐츠, 광고 예산 제안) |
| **콘텐츠 킷** | 추천 → 해시태그 포함 초안 자동 생성 → "스튜디오 편집" / "캘린더 예약" 선택 배너 |
| **대시보드 AI 추천** | 최신 리포트 추천 3개 표시 + 전체 리포트 링크 |

### Phase 3-2: 비디오 렌더링

| 기능 | 상세 |
|------|------|
| **ffmpeg 영상 생성** | `lib/sns/video-renderer.ts` — 캐러셀 슬라이드 이미지 → MP4 변환, libx264 인코딩, scale/pad, Supabase 업로드 |
| **릴스 내보내기** | 비율별 영상 (1:1, 4:5, 9:16), 슬라이드당 표시 시간 조절 (2~6초), 에디터 내 영상 미리보기 |

### Instagram API 개선

| 기능 | 상세 |
|------|------|
| **v25.0 업그레이드** | 전체 Instagram API를 v19.0 → v25.0으로 업그레이드 |
| **인사이트 작동** | reach 지표 정상 수집 (모든 미디어 타입), impressions는 Instagram Login 제한으로 불가 |
| **graceful fallback** | insights 권한 없을 때 좋아요/댓글 기반 폴백, 미디어 타입별 metric 자동 조정 |
| **환경변수 수정** | GEMINI_API_KEY 읽기, 이미지 생성 모델 gemini-2.5-flash-image 업데이트 |

### UX/UI 대규모 고도화

| 영역 | 개선 내용 |
|------|---------|
| **사이드바** | 대시보드를 SNS 스튜디오 최상단으로 이동, 인사이트/성과분석 통합 (중복 제거) |
| **설정 페이지** | 탭 네비게이션 (연결/에이전트/MCP/개발자도구) — 78KB 페이지 정리 |
| **성과 분석** | 계정 개요, 기간 선택, recharts 라인 차트, 콘텐츠 유형별 성과, 최적 게시 시간, Top 게시물, 인게이지먼트율 상세 (산업 평균 대비) |
| **콘텐츠 제작소** | 드래프트 필터(초안/예약/발행), 삭제 버튼, 즉시 발행 버튼, 콘텐츠 미리보기, 참고 제작 모드 (URL/텍스트 → AI 변형) |
| **캐러셀 에디터** | 이미지 비율 선택 (1:1/4:5/9:16), 슬라이드 순서 변경/추가/삭제, 모든 슬라이드 일괄 이미지 생성, 캡션 미리보기 (2200자 제한), 해시태그 자동 추가, 텍스트 콘텐츠 편집 페이지 |
| **캘린더** | 게시물 미리보기 (제목+타입+상태 컬러), 클릭 상세 모달, 주간/월간 뷰 토글, 스마트 예약 (최적 시간 자동 추천), 일괄 예약, 충돌 경고 |
| **페르소나** | 검색, 플랫폼 필터, 삭제 확인, 연결 상태 뱃지, Instagram 자동 연결 (OAuth 대신 설정 가져오기) |
| **커뮤니티** | 미디어 자동 조회 (수동 ID 입력 제거), 댓글 수 표시, 0건 안내 |
| **공통** | 로딩 스피너 컴포넌트, 빈 상태 컴포넌트, LLM 프롬프트 개선 (본문 충실화), JSON 파싱 재시도 |

### 버그 수정 (주요)

| 버그 | 수정 |
|------|------|
| analytics/sync가 env var만 읽음 | body에서 accessToken 받도록 수정 |
| 댓글 API가 env var만 읽음 | accessToken 전달 방식 수정 |
| 대시보드 connectionRef 리렌더 초기화 | useRef로 변경 |
| Top 게시물 정렬 안 됨 | reach=0일 때 좋아요/댓글 기준 정렬 |
| 이미지 생성 모델 없음 | gemini-2.5-flash-image로 업데이트 |
| 리포트 API 500 에러 | GET 에러 핸들링 추가 |

---

## 2. 현재 작동 상태

### 정상 작동

| 기능 | 상태 |
|------|------|
| 마케팅 대시보드 (도달 차트, KPI, 오늘의 할 일) | ✅ |
| Instagram 게시물 목록/팔로워/도달 인사이트 | ✅ |
| 콘텐츠 생성 (텍스트/카드뉴스/참고 제작) | ✅ |
| 캐러셀 에디터 (편집/순서/삭제/비율) | ✅ |
| 캘린더 (월간/주간/스마트 예약) | ✅ |
| 성과 분석 (차트/유형별/최적시간/리포트) | ✅ |
| Instagram 실제 게시 (단일/캐러셀) | ✅ |
| 자동 스케줄 + 토큰 자동 갱신 | ✅ |
| 비디오 렌더링 (ffmpeg) | ✅ (이미지 있는 슬라이드 필요) |
| 페르소나 관리 | ✅ |

### 제한적 작동

| 기능 | 상태 | 원인 |
|------|------|------|
| 이미지 생성 (Gemini) | ⚠️ 할당량 초과 | Google AI 무료 tier 소진 |
| 커뮤니티 댓글 읽기 | ❌ | Instagram Login에서 댓글 내용 접근 불가 |
| 댓글 답변 게시 | ❌ | 동일 |
| 광고 API | ❌ | Facebook Login 필요 |
| impressions 지표 | ❌ | Instagram Login 제한 |

---

## 3. 향후 개발 계획

### 즉시 진행 가능 (차단 요인 없음)

| 순서 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| 1 | **운영 허브 섹션 접기/펼치기** | 낮음 | 중간 — 스크롤 피로 감소 |
| 2 | **차트 숫자 포맷팅** (1.2M, 50K) | 낮음 | 낮음 — 가독성 |
| 3 | **리포트 PDF 내보내기** | 중간 | 중간 — 클라이언트/상사 보고용 |
| 4 | **댓글 감정 분석** (LLM 기반) | 중간 | 중간 — 부정 댓글 빠른 발견 |
| 5 | **콘텐츠 템플릿 라이브러리** | 중간 | 높음 — 반복 작업 대폭 감소 |
| 6 | **성과 이상 알림** | 중간 | 높음 — 도달 급감 즉시 대응 |

### Facebook Login 해결 후 (보류 중)

| 순서 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| 7 | **댓글 관리 전체 활성화** | 낮음 | 높음 |
| 8 | **impressions 지표 추가** | 낮음 | 중간 |
| 9 | **Meta 광고 API 연동** | 높음 | 높음 — 광고 생성/집행/성과 |
| 10 | **광고 성과 대시보드** | 중간 | 높음 |

### Phase 3 나머지

| 순서 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| 11 | **Canva 연동** | 중간 | 중간 — Canva Pro 필요 |
| 12 | **BGM 추가** (비디오) | 낮음 | 낮음 — 릴스 품질 향상 |
| 13 | **전환 효과** (비디오) | 중간 | 낮음 — 페이드/슬라이드 |

### Phase 4: 플랫폼 인프라

| 순서 | 항목 | 난이도 | 영향도 |
|------|------|--------|--------|
| 14 | **Supabase Auth + 워크스페이스** | 높음 | 높음 — 다중 사용자 |
| 15 | **MCP 외부 연동** (Slack/Notion/GDrive) | 중간 | 중간 |
| 16 | **TypeScript strict + 테스트** | 중간 | 높음 — 안정성 |

### 전략적 개선 (장기)

| 항목 | 설명 |
|------|------|
| **멀티 플랫폼** | Threads, X, YouTube 지원 (현재 Instagram만 실제 연동) |
| **경쟁사 벤치마크** | 유사 계정 성과 비교 분석 |
| **A/B 테스트** | 게시물 변형 태깅 + 성과 비교 |
| **Claude API 통합** | 텍스트 품질 향상 (한국어 우수) |
| **실시간 미리보기** | 프롬프트 입력 중 AI 실시간 생성 미리보기 |
| **팀 협업** | 승인 워크플로우, 역할 기반 권한 |

---

## 4. 기술 부채

| 항목 | 상태 | 우선순위 |
|------|------|---------|
| TypeScript strict 에러 2개 | `personas/[id]/learn/route.ts`, `lib/sns/image-generator.ts` | 낮음 |
| 테스트 인프라 없음 | Vitest + Playwright E2E 필요 | 중간 |
| 설정 페이지 78KB | 탭 분리 완료, 추가 리팩토링 가능 | 낮음 |
| OAuth 리다이렉트 http/https 불일치 | 로컬 개발 한정 이슈 | 낮음 |
| `process.env` 하드코딩 일부 남아있음 | body 전달로 대부분 수정됨 | 낮음 |

---

## 5. 계정 및 연동 정보

| 항목 | 값 |
|------|------|
| Instagram | @monoplex_official |
| Account ID | [REDACTED] |
| 팔로워 | ~6,900 |
| App | Garnet2 (ID: [REDACTED]) |
| 토큰 방식 | Instagram Login for Business |
| 인사이트 | reach 작동, impressions 불가 |
| Facebook 페이지 | Monoplex (ID: 110447610779155) |
| Facebook Login | 보류 (페이지 관리자 권한 필요) |
| Gemini API | gemini-2.5-flash-image (할당량 초과) |
| LLM | Gemini 기본, Claude 미연동 |

---

## 6. 파일 구조 변경 요약

### 신규 생성 파일
```
app/api/dashboard/route.ts              — 대시보드 데이터 집계 API
app/api/sns/content/[id]/publish/route.ts — 즉시 발행
app/api/sns/content/[id]/video/route.ts  — 비디오 렌더링
app/api/sns/content/reference/route.ts   — 참고 제작
app/api/sns/analytics/report/route.ts    — AI 리포트
app/api/sns/community/media/route.ts     — 미디어 목록
app/api/meta/token/exchange/route.ts     — 토큰 교환
app/api/meta/token/refresh/route.ts      — 토큰 갱신
components/dashboard/reach-chart.tsx     — 도달 차트
components/dashboard/follower-chart.tsx  — 팔로워 차트
components/dashboard/top-posts.tsx       — Top 게시물
components/loading-spinner.tsx           — 로딩 스피너
components/empty-state.tsx               — 빈 상태
lib/sns/performance-analyzer.ts          — AI 성과 분석
lib/sns/instagram-publisher.ts           — Instagram 게시
```

### 주요 수정 파일
```
app/dashboard/page.tsx                   — 전면 교체 (마케팅 대시보드)
app/sns/analytics/page.tsx               — 대규모 확장
app/sns/studio/page.tsx                  — 참고 제작 + 필터/삭제/발행
app/sns/studio/[draftId]/page.tsx        — 에디터 6기능 + 비디오
app/sns/calendar/page.tsx                — 미리보기 + 스마트 예약
app/sns/personas/page.tsx                — 검색/필터/삭제
app/sns/community/page.tsx               — 미디어 자동 조회
app/settings/page.tsx                    — 탭 네비게이션
components/app-nav.tsx                   — 사이드바 재구성
components/meta-connection-panel.tsx     — 토큰 자동 교환
lib/sns/instagram-api.ts                 — v25.0 + reach only
lib/sns/video-renderer.ts               — ffmpeg 구현
lib/sns/image-generator.ts              — 모델/환경변수 수정
electron/main.ts                        — 토큰 갱신 + 스케줄러
prisma/schema.prisma                    — SnsPerformanceReport 추가
```
