/**
 * 퍼널 분석
 * - 전체 퍼널 (설치→가입→조회→결제→구매)
 * - 단계별 이탈률
 * - 플랫폼별 퍼널 비교
 *
 * 커스텀: EVENT_NAMES를 서비스에 맞게 수정
 * 사용: npx tsx scripts/bq-funnel.ts
 */
import { loadEnv } from '../lib/env';
import { query, getDS, daysAgoKST } from '../lib/bq';

loadEnv();
const DS = getDS();
const FROM = daysAgoKST(30);
const TO = daysAgoKST(1);

// 서비스에 맞게 수정
const FUNNEL_STEPS = [
  { name: '방문', event: 'first_visit' },
  { name: '가입', event: 'sign_up' },
  { name: '상품조회', event: 'view_item' },
  { name: '결제시작', event: 'begin_checkout' },
  { name: '구매완료', event: 'purchase' },
];

async function main() {
  console.log(`=== 퍼널 분석 (${FROM}~${TO}) ===\n`);

  // 전체 퍼널
  const selects = FUNNEL_STEPS.map(s =>
    `COUNT(DISTINCT CASE WHEN event_name='${s.event}' THEN user_pseudo_id END) AS ${s.event.replace(/[^a-z_]/g, '_')}`
  ).join(',\n    ');

  const result = await query(`
    SELECT ${selects}
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}'
  `);

  const row = result[0];
  const values = FUNNEL_STEPS.map(s => row[s.event.replace(/[^a-z_]/g, '_')] as number);
  const first = values[0] || 1;

  console.log('단계             유저     전환율   단계이탈');
  for (let i = 0; i < FUNNEL_STEPS.length; i++) {
    const pct = (values[i] / first * 100).toFixed(1);
    const drop = i > 0 ? ((1 - values[i] / values[i - 1]) * 100).toFixed(0) + '%' : '-';
    console.log(`  ${String(FUNNEL_STEPS[i].name).padEnd(14)} ${String(values[i]).padStart(6)}명   ${String(pct + '%').padStart(6)}   ${drop}`);
  }

  // 플랫폼별
  console.log('\n--- 플랫폼별 ---');
  for (const pf of ['WEB', 'IOS', 'ANDROID']) {
    const pfFilter = pf === 'WEB' ? "platform = 'WEB'" : `platform = '${pf}'`;
    const pfResult = await query(`
      SELECT ${selects}
      FROM \`${DS}.events_*\`
      WHERE _TABLE_SUFFIX BETWEEN '${FROM}' AND '${TO}' AND ${pfFilter}
    `);
    const pfRow = pfResult[0];
    const pfVals = FUNNEL_STEPS.map(s => pfRow[s.event.replace(/[^a-z_]/g, '_')] as number);
    const pfFirst = pfVals[0] || 1;
    console.log(`\n  [${pf}]`);
    for (let i = 0; i < FUNNEL_STEPS.length; i++) {
      console.log(`    ${FUNNEL_STEPS[i].name}: ${pfVals[i]}명 (${(pfVals[i] / pfFirst * 100).toFixed(0)}%)`);
    }
  }
}
main().catch(console.error);
