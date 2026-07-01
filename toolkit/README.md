# Growth Analytics Toolkit

GA4/BQ/GTM API 기반 데이터 분석 자동화 툴킷.
새 프로젝트에 이식하여 즉시 분석 환경을 구축할 수 있습니다.

## 구조

```
toolkit/
  ├── .env.example          # 환경변수 템플릿
  ├── lib/
  │   ├── bq.ts             # BigQuery 클라이언트
  │   ├── ga4.ts            # GA4 Data API 클라이언트
  │   ├── ga4-admin.ts      # GA4 Admin API (디멘션/전환 등록)
  │   ├── gtm.ts            # GTM API (태그/변수/트리거 관리)
  │   └── slack.ts          # Slack 웹훅
  ├── scripts/
  │   ├── bq-health-check.ts    # BQ 일일 헬스체크
  │   ├── bq-funnel.ts          # 퍼널 분석
  │   ├── bq-retention.ts       # 리텐션 분석
  │   ├── bq-daily-report.ts    # 일일 리포트 (Slack 전송)
  │   ├── ga4-realtime.ts       # GA4 실시간 체크
  │   ├── ga4-setup.ts          # GA4 커스텀 디멘션/전환 일괄 등록
  │   ├── gtm-audit.ts          # GTM 태그/변수 감사
  │   └── gtm-publish.ts        # GTM 버전 생성/배포
  └── setup.md              # 초기 세팅 가이드
```

## 빠른 시작

```bash
# 1. 의존성 설치
npm install @google-cloud/bigquery @google-analytics/data googleapis

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 GA4/BQ/GTM 크레덴셜 입력

# 3. 헬스체크 실행
npx tsx scripts/bq-health-check.ts

# 4. 일일 리포트 실행
npx tsx scripts/bq-daily-report.ts
```

## 새 프로젝트 이식 체크리스트

1. GCP 프로젝트 생성 또는 접근 권한 확보
2. 서비스 계정 발급 (GA4 + BQ + GTM 권한)
3. GA4 속성 ID 확인
4. GTM 계정/컨테이너 ID 확인
5. BQ 데이터셋 확인 (GA4 내보내기 활성화)
6. .env 설정
7. bq-health-check.ts 실행으로 연결 확인
8. 이벤트명/파라미터를 서비스에 맞게 커스텀
