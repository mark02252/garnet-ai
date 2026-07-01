/**
 * 일일 리포트 → Slack 전송
 * - 어제 데이터 기준
 * - 전주 동일 요일 대비 변화율
 *
 * 사용: npx tsx scripts/bq-daily-report.ts
 */
import { loadEnv } from '../lib/env';
import { query, getDS, daysAgoKST } from '../lib/bq';
import { sendToSlack } from '../lib/slack';

loadEnv();
const DS = getDS();

async function main() {
  const yesterday = daysAgoKST(1);
  const weekAgo = daysAgoKST(8);
  const displayDate = yesterday.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

  const rows = await query(`
    SELECT event_date,
      COUNT(DISTINCT user_pseudo_id) AS dau,
      COUNT(DISTINCT CASE WHEN platform IN ('IOS','ANDROID') THEN user_pseudo_id END) AS app_dau,
      COUNT(DISTINCT CASE WHEN platform = 'WEB' THEN user_pseudo_id END) AS web_dau,
      COUNTIF(event_name='purchase') AS purchases,
      COUNTIF(event_name='purchase' AND platform IN ('IOS','ANDROID')) AS app_p,
      SUM(CASE WHEN event_name='purchase' THEN COALESCE(
        (SELECT value.int_value FROM UNNEST(event_params) WHERE key='value'),
        CAST((SELECT value.double_value FROM UNNEST(event_params) WHERE key='value') AS INT64),0) ELSE 0 END) AS rev,
      COUNTIF(event_name='refund') AS refunds,
      COUNTIF(event_name='first_open') AS installs,
      COUNTIF(event_name='sign_up') AS signups
    FROM \`${DS}.events_*\`
    WHERE _TABLE_SUFFIX IN ('${yesterday}', '${weekAgo}')
    GROUP BY 1
  `);

  const today = rows.find((r: any) => r.event_date === yesterday) || {} as any;
  const prev = rows.find((r: any) => r.event_date === weekAgo) || {} as any;

  const pct = (c: number, p: number) => {
    if (!p) return '(신규)';
    const d = ((c - p) / p * 100).toFixed(0);
    return Number(d) >= 0 ? `+${d}%` : `${d}%`;
  };
  const num = (v: number) => (v || 0).toLocaleString();
  const appRatio = today.purchases > 0 ? Math.round((today.app_p || 0) / today.purchases * 100) : 0;

  const text = [
    `*[일일 리포트]* ${displayDate}`,
    '',
    `*DAU* ${num(today.dau)} (웹 ${num(today.web_dau)} / 앱 ${num(today.app_dau)}) ${pct(today.dau, prev.dau)}`,
    '',
    '*구매*',
    `  총 ${num(today.purchases)}건 / ${num(today.rev)}원 ${pct(today.rev, prev.rev)}`,
    `  앱 ${num(today.app_p)}건 (${appRatio}%)`,
    `  환불 ${num(today.refunds)}건`,
    '',
    '*앱*',
    `  설치 ${num(today.installs)} / 가입 ${num(today.signups)}`,
    '',
    `_전주 대비: DAU ${pct(today.dau, prev.dau)} / 매출 ${pct(today.rev, prev.rev)}_`,
  ].join('\n');

  console.log(text);
  const res = await sendToSlack(text);
  console.log('\nSlack: ' + (res.ok ? '전송 성공' : '전송 실패'));
}
main().catch(console.error);
