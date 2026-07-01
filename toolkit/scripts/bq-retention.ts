/**
 * 리텐션 분석
 * - D1, D7, D14, D21, D30 리텐션
 * - 코호트별 분석
 *
 * 사용: npx tsx scripts/bq-retention.ts
 */
import { loadEnv } from '../lib/env';
import { query, getDS, daysAgoKST } from '../lib/bq';

loadEnv();
const DS = getDS();
const FROM = daysAgoKST(35);
const TO = daysAgoKST(1);

async function main() {
  console.log(`=== 리텐션 분석 (${FROM}~${TO}) ===\n`);

  const result = await query(`
    WITH installers AS (
      SELECT user_pseudo_id, MIN(event_date) AS install_date
      FROM \`${DS}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
        AND event_name = 'first_open'
      GROUP BY 1
    ),
    retention AS (
      SELECT i.user_pseudo_id,
        MAX(CASE WHEN DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), PARSE_DATE('%Y%m%d', i.install_date), DAY) = 1 THEN 1 ELSE 0 END) AS d1,
        MAX(CASE WHEN DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), PARSE_DATE('%Y%m%d', i.install_date), DAY) = 7 THEN 1 ELSE 0 END) AS d7,
        MAX(CASE WHEN DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), PARSE_DATE('%Y%m%d', i.install_date), DAY) = 14 THEN 1 ELSE 0 END) AS d14,
        MAX(CASE WHEN DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), PARSE_DATE('%Y%m%d', i.install_date), DAY) = 21 THEN 1 ELSE 0 END) AS d21,
        MAX(CASE WHEN DATE_DIFF(PARSE_DATE('%Y%m%d', e.event_date), PARSE_DATE('%Y%m%d', i.install_date), DAY) = 30 THEN 1 ELSE 0 END) AS d30
      FROM installers i
      JOIN \`${DS}.events_*\` e ON i.user_pseudo_id = e.user_pseudo_id
      WHERE e._TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
      GROUP BY 1
    )
    SELECT COUNT(*) AS total,
      SUM(d1) AS d1, SUM(d7) AS d7, SUM(d14) AS d14, SUM(d21) AS d21, SUM(d30) AS d30
    FROM retention
  `);

  const r = result[0];
  console.log(`설치자: ${r.total}명`);
  for (const [label, val] of [['D1', r.d1], ['D7', r.d7], ['D14', r.d14], ['D21', r.d21], ['D30', r.d30]]) {
    console.log(`  ${label}: ${val}명 (${(val as number / r.total * 100).toFixed(1)}%)`);
  }
}
main().catch(console.error);
