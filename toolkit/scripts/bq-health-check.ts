/**
 * BQ 일일 헬스체크
 * - 최신 테이블 확인
 * - 일별 DAU/구매/매출/설치
 * - 플랫폼별 비교
 * - 환불률
 * - user_id 수집률
 *
 * 사용: npx tsx scripts/bq-health-check.ts
 */
import { loadEnv } from '../lib/env';
import { query, getDS, daysAgoKST } from '../lib/bq';

loadEnv();
const DS = getDS();
const FROM = daysAgoKST(3);
const TO = daysAgoKST(1);

async function main() {
  console.log(`=== BQ 헬스체크 (${FROM}~${TO}) ===\n`);

  // 최신 테이블
  console.log('--- 최신 테이블 ---');
  const tables = await query(`SELECT table_id, row_count, ROUND(size_bytes/1024/1024,1) AS mb FROM \`${DS}.__TABLES__\` WHERE table_id LIKE 'events_%' ORDER BY table_id DESC LIMIT 5`);
  for (const r of tables) console.log(`  ${r.table_id}: ${r.row_count}행 / ${r.mb}MB`);

  // 일별 트렌드
  console.log('\n--- 일별 트렌드 ---');
  const daily = await query(`
    SELECT event_date,
      COUNT(DISTINCT user_pseudo_id) AS dau,
      COUNT(DISTINCT CASE WHEN platform IN ('IOS','ANDROID') THEN user_pseudo_id END) AS app,
      COUNT(DISTINCT CASE WHEN platform = 'WEB' THEN user_pseudo_id END) AS web,
      COUNTIF(event_name='purchase') AS purchases,
      SUM(CASE WHEN event_name='purchase' THEN COALESCE(
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key='value'),
        CAST((SELECT value.double_value FROM UNNEST(event_params) WHERE key='value') AS INT64),0) ELSE 0 END) AS rev,
      COUNTIF(event_name='first_open') AS installs,
      COUNTIF(event_name='sign_up') AS signups,
      COUNTIF(event_name='refund') AS refunds
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
    GROUP BY 1 ORDER BY 1
  `);
  for (const r of daily) {
    console.log(`  ${r.event_date}: DAU${r.dau} 웹${r.web} 앱${r.app} 구매${r.purchases} ${Number(r.rev).toLocaleString()}원 설치${r.installs} 가입${r.signups} 환불${r.refunds}`);
  }

  // 플랫폼별
  console.log('\n--- 플랫폼별 ---');
  const plat = await query(`
    SELECT platform, COUNT(DISTINCT user_pseudo_id) AS users,
      COUNTIF(event_name='purchase') AS p,
      SUM(CASE WHEN event_name='purchase' THEN COALESCE(
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key='value'),
        CAST((SELECT value.double_value FROM UNNEST(event_params) WHERE key='value') AS INT64),0) ELSE 0 END) AS rev
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
    GROUP BY 1 ORDER BY users DESC
  `);
  for (const r of plat) console.log(`  ${r.platform}: ${r.users}유저 / ${r.p}건 / ${Number(r.rev).toLocaleString()}원`);

  // user_id 수집률
  console.log('\n--- user_id 수집률 ---');
  const uid = await query(`
    SELECT event_date, platform,
      COUNT(DISTINCT user_pseudo_id) AS total,
      COUNT(DISTINCT CASE WHEN user_id IS NOT NULL AND user_id != '' THEN user_pseudo_id END) AS with_uid
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
    GROUP BY 1, 2 ORDER BY 1, 2
  `);
  for (const r of uid) console.log(`  ${r.event_date} ${String(r.platform).padEnd(10)} ${r.with_uid}/${r.total} (${(r.with_uid/r.total*100).toFixed(1)}%)`);

  console.log('\n=== 완료 ===');
}
main().catch(console.error);
