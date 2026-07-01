/**
 * GA4 초기 세팅
 * - 커스텀 디멘션 일괄 등록
 * - 커스텀 메트릭 일괄 등록
 * - 전환 이벤트 일괄 등록
 *
 * 서비스에 맞게 DIMENSIONS, METRICS, CONVERSIONS 수정
 * 사용: npx tsx scripts/ga4-setup.ts
 */
import { loadEnv } from '../lib/env';
import { createCustomDimension, createCustomMetric, createConversionEvent, listCustomDimensions, listConversionEvents } from '../lib/ga4-admin';

loadEnv();

// ===== 서비스에 맞게 수정 =====
const DIMENSIONS = [
  { param: 'content_group', display: 'Content Group' },
  { param: 'theater_code', display: 'Theater Code' },
  { param: 'transaction_id', display: 'Transaction ID' },
  { param: 'payment_type', display: 'Payment Type' },
  { param: 'method', display: 'Auth Method' },
  { param: 'error_code', display: 'Error Code' },
  { param: 'error_message', display: 'Error Message' },
];

const METRICS = [
  { param: 'value', display: 'Purchase Value', unit: 'STANDARD' },
  { param: 'discount_amount', display: 'Discount Amount', unit: 'STANDARD' },
];

const CONVERSIONS = [
  'purchase', 'sign_up', 'first_open', 'begin_checkout', 'login',
];

async function main() {
  console.log('=== GA4 초기 세팅 ===\n');

  console.log('--- 커스텀 디멘션 ---');
  for (const d of DIMENSIONS) {
    const res = await createCustomDimension(d.param, d.display);
    console.log(`  ${d.param}: ${res.ok ? 'OK' : res.error}`);
  }

  console.log('\n--- 커스텀 메트릭 ---');
  for (const m of METRICS) {
    const res = await createCustomMetric(m.param, m.display, m.unit);
    console.log(`  ${m.param}: ${res.ok ? 'OK' : res.error}`);
  }

  console.log('\n--- 전환 이벤트 ---');
  for (const e of CONVERSIONS) {
    const res = await createConversionEvent(e);
    console.log(`  ${e}: ${res.ok ? 'OK' : res.error}`);
  }

  console.log('\n--- 현황 ---');
  const dims = await listCustomDimensions();
  const convs = await listConversionEvents();
  console.log(`  디멘션: ${dims.length}/50 / 전환: ${convs.length}개`);
}
main().catch(console.error);
