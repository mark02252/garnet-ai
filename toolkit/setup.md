# 새 프로젝트 초기 세팅 가이드

## 1. GCP 프로젝트 준비

```bash
# 서비스 계정 생성 (GCP Console에서)
# 필요 권한:
#   - BigQuery Data Viewer
#   - BigQuery Job User
#   - Google Analytics Admin
#   - Tag Manager Edit/Publish
```

## 2. GA4 설정

```bash
# GA4 Admin → 속성 설정 → 데이터 API 활성화
# GA4 Admin → BigQuery 연결 활성화
# GA4 Admin → 사용자 관리 → 서비스 계정 추가 (편집자)
```

## 3. GTM 설정

```bash
# GTM Admin → 사용자 관리 → 서비스 계정 추가 (게시 권한)
```

## 4. 환경변수

```bash
cp .env.example .env
# .env 파일 편집:
#   GA4_CLIENT_EMAIL, GA4_PRIVATE_KEY: 서비스 계정
#   GA4_PROPERTY_ID: GA4 속성 ID (숫자)
#   GA4_MEASUREMENT_ID: G-XXXXXXXXXX
#   BQ_PROJECT_ID: GCP 프로젝트 ID
#   BQ_DATASET: project-id.analytics_속성ID
#   GTM_ACCOUNT_ID, GTM_CONTAINER_ID: GTM 콘솔에서 확인
#   SLACK_WEBHOOK_URL: Slack 앱에서 생성
```

## 5. 의존성 설치

```bash
npm install @google-cloud/bigquery @google-analytics/data googleapis
npm install -D tsx typescript
```

## 6. 연결 확인

```bash
# BQ 연결 확인
npx tsx scripts/bq-health-check.ts

# GA4 실시간 확인
npx tsx scripts/ga4-realtime.ts

# GTM 감사
npx tsx scripts/gtm-audit.ts
```

## 7. GA4 초기 세팅

```bash
# ga4-setup.ts에서 DIMENSIONS, METRICS, CONVERSIONS를 서비스에 맞게 수정 후:
npx tsx scripts/ga4-setup.ts
```

## 8. 일일 리포트 자동화

```bash
# 수동 실행
npx tsx scripts/bq-daily-report.ts

# cron 설정 (매일 오전 9시)
# 0 9 * * * cd /path/to/toolkit && npx tsx scripts/bq-daily-report.ts
```

## 9. 커스텀 스크립트 추가

서비스에 맞는 분석 스크립트는 `scripts/` 폴더에 추가.
`lib/bq.ts`의 `query()` 함수를 사용하면 BQ 쿼리를 간단하게 실행 가능.

```typescript
import { loadEnv } from '../lib/env';
import { query, getDS } from '../lib/bq';

loadEnv();
const DS = getDS();

async function main() {
  const result = await query(`
    SELECT event_name, COUNT(*) AS cnt
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX = '20260701'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);
  console.log(result);
}
main();
```
