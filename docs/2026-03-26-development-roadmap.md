# Garnet v0.5.0 → v1.0 개발 로드맵

> 날짜: 2026-03-26
> 상태: 진행 중

---

## 완료된 작업 (v0.5.0)

### 백엔드 인프라
- [x] Cron 스케줄러 엔진 (croner + toad-scheduler, 12개 잡)
- [x] 5개 플랫폼 수집기 (Serper, Naver, YouTube, Twitter, Reddit)
- [x] AI 분석 파이프라인 (관련도/긴급도, 긴급 알림, 데일리 다이제스트)
- [x] QuotaTracker, 데이터 보존 정책, catch-up 로직
- [x] Prisma: JobRun, MarketingIntel, MarketingDigest, WatchKeyword, VideoGeneration

### 프론트엔드
- [x] Cmd+K 커맨드 팔레트 (cmdk)
- [x] AI 코파일럿 사이드바 (Cmd+.)
- [x] Sonner 토스트 알림
- [x] 영상 스튜디오 (AI 스크립트 생성)
- [x] 마케팅 인텔 피드 + 워치리스트
- [x] 모닝 브리핑 카드
- [x] 전체 19개 페이지 프리미엄 UI 업데이트

### GA4 성과 분석
- [x] GA4 실제 데이터 연동 (31일 트래픽)
- [x] 프리미엄 대시보드 7개 섹션 (KPI, 트렌드, 참여도, 채널, 디바이스, 국가, 랜딩페이지)
- [x] GA4 API 8개 (report, realtime, engagement, devices, geo, landing-pages, analyze)
- [x] AI 3패널 성과 분석

### 데스크탑 앱
- [x] Tauri v2 마이그레이션 (Electron 완전 제거)
- [x] 플랫폼 브릿지 (lib/platform.ts)
- [x] Tauri dev 모드 정상 동작

### 배포
- [x] Vercel 배포 (garnet-two.vercel.app)
- [x] Supabase PostgreSQL 마이그레이션
- [x] GA4 Private Key base64 인코딩 해결
- [x] Instagram OAuth 프로덕션 연동

### Instagram
- [x] OAuth 스코프 업데이트 (instagram_business_*)
- [x] 원클릭 로그인 버튼
- [x] 토큰 교환 + 콜백 자동 처리
- [x] Meta 리디렉션 URI 등록

---

## 남은 개발 타임라인

### Phase A: SNS 데이터 수집 연동 (우선)
> Instagram 로그인은 완료됐지만 실제 데이터 수집이 안 되는 상태

- [ ] Instagram 토큰을 새 PostgreSQL DB에 저장
- [ ] Instagram Graph API로 인사이트 수집 (도달, 노출, 참여율)
- [ ] 팔로워 추이 데이터 수집 + SNS 대시보드 연동
- [ ] 게시물별 성과 데이터 (좋아요, 댓글, 저장, 공유)
- [ ] 오디언스 인구통계 (나이, 성별, 도시)
- [ ] "지금 수집" 버튼 정상 동작

### Phase B: LTX-2.3 영상 생성 통합
> AI 스크립트만 생성하던 영상 스튜디오에 실제 영상 생성 기능 추가

**LTX-2.3 개요:**
- Lightricks 개발, 22B 파라미터 DiT 모델
- 텍스트→영상, 이미지→영상, 오디오+영상 동시 생성
- 4K 해상도, 50FPS, LoRA 파인튜닝 지원
- 오픈소스 (상업용은 API 사용 권장)

**통합 방식: Fal.ai REST API**
- GPU 인프라 불필요
- 라이선스 걱정 없음
- REST API → 영상 스튜디오 바로 연동
- 비용: 사용량 기반 과금

**완료:**
- [x] Fal.ai API 키 발급 + 환경변수 설정
- [x] `lib/video/generate.ts` 확장 — Fal.ai API 호출로 실제 영상 생성
- [x] 영상 스튜디오 UI — 영상 플레이어 + 다운로드 + 상태 안내
- [x] `lib/video/fal-client.ts` — Fal.ai LTX 클라이언트

**향후 — 멀티 프로바이더 영상 생성 (Phase B-2):**

영상 생성 프로바이더를 선택할 수 있는 구조로 확장:

| 프로바이더 | 품질 | 가격/영상 | 용도 |
|-----------|------|---------|------|
| **Kling V3 Omni** | 최고 | $0.08~$0.17/초 | 1순위 (한국 인기 최고) |
| **MiniMax Hailuo 2.3** | 우수 | ~$0.10~$0.50 | 2순위 (모션 우수) |
| **Luma Ray3** | 우수 | ~$0.02~$0.16 | 저가 대안 |
| **Fal.ai LTX-2.3** | 보통 | ~$0.01~$0.05 | 현재 기본 (가장 저렴) |

구현 항목:
- [ ] 멀티 프로바이더 구조: `lib/video/providers/` (kling.ts, minimax.ts, luma.ts, fal-ltx.ts)
- [ ] 영상 스튜디오 UI에 프로바이더 선택 드롭다운
- [ ] 프로바이더별 API 키 환경변수 (KLING_API_KEY, MINIMAX_API_KEY 등)
- [ ] 이미지→영상 기능 (제품 사진 → 쇼케이스 영상)
- [ ] 오디오 동기화 영상 생성 (BGM 포함 릴스)
- [ ] 영상 길이/품질 옵션 선택
- [ ] SNS 스튜디오 연동 (생성된 영상 → 예약 발행)

⚠️ **Higgsfield 비추천** — Kling/MiniMax 모델을 4.5배 마크업 리셀, 직접 API 사용 권장

### Phase C: GA4 퍼포먼스 대시보드 심화
> 10년차 퍼포먼스 마케터급 분석 기능

- [ ] 전환 퍼널 (조회 → 장바구니 → 결제 → 완료)
- [ ] 캠페인별 성과 (UTM 기반)
- [ ] 코호트 리텐션 분석
- [ ] 시간대별/요일별 패턴 히트맵
- [ ] 이상 징후 자동 감지 (Z-score)
- [ ] GA4 키 이벤트(전환) 연동 — GTM 세팅 후

### Phase D: 통합 퍼포먼스 대시보드
> GA4 + Instagram + 광고 데이터를 하나의 뷰로 통합

- [ ] 통합 KPI 카드 (웹 트래픽 + SNS 도달 + 전환)
- [ ] 채널별 ROI 비교 차트
- [ ] 크로스 채널 어트리뷰션
- [ ] 주간/월간 자동 리포트 생성
- [ ] Slack/이메일 알림 연동

### Phase E: DMG 프로덕션 빌드 (최종)
> 모든 기능 완성 후 데스크탑 앱 패키징

- [ ] Tauri 프로덕션 빌드 설정 (Vercel URL 로드)
- [ ] DMG 패키징 + 코드 서명
- [ ] 자동 업데이트 설정 (tauri-plugin-updater)
- [ ] GitHub Releases 연동
- [ ] 커스텀 도메인 설정 (garnet-two.vercel.app → 커스텀)

### Phase F: 고급 기능 (향후)
- [ ] React Flow 비주얼 워크플로우 캔버스
- [ ] 승인 인박스 (에이전트 자율 작업 → 인간 판단)
- [ ] 세션 리플레이 (에이전트 실행 단계별 재생)
- [ ] MCP 영상 서버 (자체 호스팅 LTX-Video)
- [ ] LoRA 브랜드 스타일 학습

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Next.js 15.5, React 19, TailwindCSS, Recharts, cmdk, sonner |
| 백엔드 | Next.js API Routes, Prisma, Supabase PostgreSQL |
| 데스크탑 | Tauri v2 (Rust + macOS WKWebView) |
| 배포 | Vercel (garnet-two.vercel.app) |
| AI/LLM | Gemini, OpenAI, Claude, Groq |
| 영상 생성 | LTX-2.3 via Fal.ai API (예정) |
| 수집 | Serper, Naver, YouTube, Twitter, Reddit |
| 스케줄링 | croner + toad-scheduler (12개 Cron 잡) |
| 분석 | GA4 Data API, Instagram Graph API |
| 테스트 | Vitest (26 tests) |

---

## 환경 변수

### 설정 완료
| 키 | 용도 |
|---|------|
| GEMINI_API_KEY | 기본 LLM |
| SEARCH_API_KEY | Serper 웹 검색 |
| GA4_PROPERTY_ID | GA4 Analytics |
| GA4_CLIENT_EMAIL | GA4 서비스 계정 |
| GA4_PRIVATE_KEY | GA4 인증 (base64) |
| META_APP_ID | Instagram OAuth |
| META_APP_SECRET | Instagram 토큰 교환 |
| NEXT_PUBLIC_META_APP_ID | 클라이언트 Instagram 로그인 |
| NEXT_PUBLIC_APP_URL | 앱 URL |
| DATABASE_URL | Supabase PostgreSQL |
| DIRECT_URL | Prisma 마이그레이션용 |

### 미설정 (선택)
| 키 | 용도 | 필요 시점 |
|---|------|----------|
| FAL_API_KEY | LTX-2.3 영상 생성 | Phase B |
| YOUTUBE_API_KEY | YouTube 수집 | 수집 활성화 시 |
| TWITTER_BEARER_TOKEN | Twitter 수집 | 수집 활성화 시 |
| REDDIT_CLIENT_ID/SECRET | Reddit 수집 | 수집 활성화 시 |
| NAVER_CLIENT_ID/SECRET | 네이버 수집 | 수집 활성화 시 |
| SLACK_WEBHOOK_URL | Slack 알림 | 알림 활성화 시 |
| ANTHROPIC_API_KEY | Claude LLM | Claude 사용 시 |
