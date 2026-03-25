# Garnet v0.5.0 개발 진행 요약

> 날짜: 2026-03-25
> 상태: 진행 중

---

## 완료된 작업

### Phase 1-3: 백엔드 인프라 (2026-03-24)
- [x] croner + toad-scheduler 기반 Cron 스케줄러 엔진
- [x] 5개 플랫폼 수집기 (Serper, Naver, YouTube, Twitter, Reddit)
- [x] AI 분석 파이프라인 (관련도/긴급도 점수, 긴급 Slack 알림, 데일리 다이제스트)
- [x] QuotaTracker, 데이터 보존 정책, catch-up 로직
- [x] Prisma 모델: JobRun, MarketingIntel, MarketingDigest, WatchKeyword
- [x] API: /api/intel, /api/intel/digests, /api/watch-keywords, /api/jobs
- [x] 12개 Cron 잡 등록 및 자동 실행

### Phase 4: UX/UI 핵심 (2026-03-24)
- [x] Cmd+K 커맨드 팔레트 (cmdk)
- [x] Sonner 토스트 알림
- [x] SparklineCard (Recharts)
- [x] 모닝 브리핑 카드
- [x] 마케팅 인텔 피드 (/intel) + 워치리스트 (/intel/watchlist)

### Phase 5: 영상 자동화 + AI 코파일럿 (2026-03-24)
- [x] 영상 스튜디오 (/video): 프롬프트 → AI 스크립트 생성
- [x] VideoGeneration Prisma 모델 + API
- [x] AI 코파일럿 사이드바 (Cmd+.)
- [x] Copilot API (/api/copilot)

### Tauri v2 마이그레이션 (2026-03-25)
- [x] Rust 툴체인 + Tauri CLI 설치
- [x] src-tauri/ 프로젝트 초기화
- [x] Tauri dev 모드 검증 (모든 기능 정상)
- [x] 플랫폼 브릿지 (lib/platform.ts) — electronAPI → Tauri/브라우저 호환
- [x] Electron 코드/의존성 완전 제거 (-4,540줄)
- [x] GA4 실제 데이터 연동 확인 (31일 트래픽)

### Instagram OAuth (2026-03-25)
- [x] OAuth 스코프 업데이트 (instagram_business_basic 등)
- [x] OAuth URL 변경 (www.instagram.com/oauth/authorize)
- [x] META_APP_ID/SECRET 환경변수 지원
- [x] 원클릭 로그인 버튼 컴포넌트
- [x] 서버사이드 OAuth 리다이렉트
- [x] 토큰 교환 수정 (redirect_uri https 강제)
- [x] 콜백 페이지 https→http 자동 리다이렉트

### GA4 퍼포먼스 대시보드 (2026-03-25)
- [x] GA4 API 4개 추가 (참여도, 디바이스, 지역, 랜딩페이지)
- [x] 프리미엄 성과 분석 대시보드 (7개 섹션)
  - KPI 카드 + 스파크라인 + WoW 변화율
  - 트래픽 트렌드 듀얼 에어리어 차트
  - 참여도 & 이탈률 차트
  - 유입 채널 Top 10 (컬러 바)
  - 디바이스 분포 (도넛 차트)
  - 상위 국가 바 차트
  - 랜딩 페이지 테이블 (컬러 배지)
  - AI 3패널 성과 분석

### SNS 대시보드 (2026-03-25)
- [x] SNS Overview API
- [x] KPI 카드, 팔로워 차트, 빠른링크
- [x] Instagram 연결 배너

### 프리미엄 UI 전체 업데이트 (2026-03-25)
- [x] 성과 분석 (/analytics) — 프리미엄 리빌드
- [x] 인스타 연결 (meta-connection-panel) — 원클릭 UI
- [x] 마케팅 인텔 (/intel) — 스탯 카드, 필터, 프리미엄 피드
- [x] 영상 스튜디오 (/video) — 그래디언트 히어로
- [x] KPI 목표 (/goals) — 요약 카드 + 프로그레스바
- [x] 실행 아카이브 (/history) — 타입별 컬러 보더 + 필터
- [x] 워치리스트 (/intel/watchlist) — 삭제 기능 + 프리미엄 UI
- [x] 마케팅 대시보드 (/dashboard) — KPI 카드, 차트 개선
- [x] SNS 페르소나 (/sns/personas) — 카드 그리드 개선
- [x] SNS 콘텐츠 제작소 (/sns/studio) — 상태 필터, 카드 개선
- [x] SNS 캘린더 (/sns/calendar) — 상태 레전드, 카드 개선
- [x] SNS 커뮤니티 (/sns/community) — 댓글 카드 개선
- [x] 세미나 스튜디오 (/seminar) — 프로그레스바, 카드 개선
- [x] 데이터 스튜디오 (/datasets) — 업로드 영역, 타입 배지
- [x] 오늘의 브리핑 (/operations) — 우선순위 컬러 코딩
- [x] 플레이북 (/learning) — 상태 필터 필, 카드 개선
- [x] 캠페인 스튜디오 (홈) — 준비도 배지, 진행 패널

### GTM 세팅 가이드 (2026-03-25)
- [x] 4개 태그 구성 가이드 (click_cta, purchase, view_item, 기본)
- [x] 추가 추천 태그 4개 (begin_checkout, sign_up, login, scroll_depth)
- [x] 변수/트리거 세팅 방법
- [x] GA4 키 이벤트(전환) 등록 방법

---

## 남은 작업

### 배포 준비
- [ ] Vercel 웹 배포 (HTTPS 도메인 확보)
- [ ] Meta 앱에 프로덕션 리다이렉션 URI 등록
- [ ] Tauri 프로덕션 빌드 설정 (Vercel URL 로드)
- [ ] DMG 패키징 + 코드 서명
- [ ] 자동 업데이트 설정 (tauri-plugin-updater)

### 기능 고도화 (향후)
- [ ] 통합 대시보드 (GA4 + Instagram + 광고 원스톱 뷰)
- [ ] MCP 영상 서버 연동 (RunwayML/Luma)
- [ ] React Flow 비주얼 워크플로우 캔버스
- [ ] 승인 인박스 (에이전트 자율 작업 → 인간 판단 요청)
- [ ] 세션 리플레이 (에이전트 실행 단계별 재생)

### Tauri 클릭 이슈 (조사 필요)
- [ ] Tauri dev 모드에서 간헐적 클릭 불가 현상 조사
- [ ] macOS WKWebView 포커스 이슈 확인
- [ ] 프로덕션 빌드에서 재현 테스트

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15, React 19, TailwindCSS, Recharts, cmdk, sonner |
| 백엔드 | Next.js API Routes, Prisma, SQLite |
| 데스크탑 | Tauri v2 (Rust + macOS WKWebView) |
| AI/LLM | Gemini, OpenAI, Claude, Groq (multi-provider fallback) |
| 수집 | Serper, Naver, YouTube, Twitter, Reddit API |
| 스케줄링 | croner + toad-scheduler (12개 Cron 잡) |
| 분석 | GA4 Data API, Instagram Graph API |
| 테스트 | Vitest (26 tests passing) |

---

## 환경 변수 현황

| 키 | 상태 | 용도 |
|---|------|------|
| GEMINI_API_KEY | SET | 기본 LLM |
| SEARCH_API_KEY | SET | Serper 웹 검색 |
| GA4_PROPERTY_ID | SET | GA4 Analytics |
| GA4_CLIENT_EMAIL | SET | GA4 서비스 계정 |
| GA4_PRIVATE_KEY | SET | GA4 인증 |
| META_APP_ID | SET | Instagram OAuth |
| META_APP_SECRET | SET | Instagram 토큰 교환 |
| NEXT_PUBLIC_META_APP_ID | SET | 클라이언트 Instagram 로그인 |
| DATABASE_URL | SET | SQLite |
| SUPABASE_URL/KEY | SET | Supabase |
| BRAVE_SEARCH_API_KEY | EMPTY | 검색 fallback (선택) |
| NAVER_CLIENT_ID/SECRET | EMPTY | 네이버 수집 (선택) |
| ANTHROPIC_API_KEY | EMPTY | Claude LLM (선택) |
| YOUTUBE_API_KEY | EMPTY | YouTube 수집 (선택) |
| TWITTER_BEARER_TOKEN | EMPTY | Twitter 수집 (선택) |
| REDDIT_CLIENT_ID/SECRET | EMPTY | Reddit 수집 (선택) |
