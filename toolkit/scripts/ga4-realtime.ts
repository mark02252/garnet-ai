/**
 * GA4 실시간 체크
 * - 플랫폼별 활성 유저
 *
 * 사용: npx tsx scripts/ga4-realtime.ts
 */
import { loadEnv } from '../lib/env';
import { runRealtimeReport } from '../lib/ga4';

loadEnv();

async function main() {
  console.log('=== GA4 실시간 ===\n');

  const res = await runRealtimeReport({
    dimensions: [{ name: 'platform' }],
    metrics: [{ name: 'activeUsers' }],
  });

  console.log('활성 유저:');
  for (const row of (res.rows || [])) {
    const platform = row.dimensionValues?.[0]?.value;
    const users = row.metricValues?.[0]?.value;
    console.log(`  ${platform}: ${users}명`);
  }
}
main().catch(console.error);
