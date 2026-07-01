/**
 * GTM 감사
 * - 전체 태그/변수/트리거 목록
 * - 버전 이력
 *
 * 사용: npx tsx scripts/gtm-audit.ts
 */
import { loadEnv } from '../lib/env';
import { listWorkspaces, listTags, listVariables, listTriggers, listVersions } from '../lib/gtm';

loadEnv();

async function main() {
  console.log('=== GTM 감사 ===\n');

  const workspaces = await listWorkspaces();
  for (const ws of workspaces) {
    console.log(`--- WS ${ws.workspaceId}: ${ws.name} ---`);

    const tags = await listTags(ws.path!);
    console.log(`\n  태그 (${tags.length}개):`);
    for (const t of tags) console.log(`    [${t.type}] ${t.name}`);

    const vars = await listVariables(ws.path!);
    console.log(`\n  변수 (${vars.length}개):`);
    for (const v of vars) console.log(`    [${v.type}] ${v.name}`);

    const triggers = await listTriggers(ws.path!);
    console.log(`\n  트리거 (${triggers.length}개):`);
    for (const t of triggers) console.log(`    [${t.type}] ${t.name}`);
  }

  console.log('\n--- 버전 이력 ---');
  const versions = await listVersions();
  for (const v of versions.slice(-10)) {
    console.log(`  v${v.containerVersionId}: ${v.name}`);
  }
}
main().catch(console.error);
