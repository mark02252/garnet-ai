/**
 * 중복 knowledge 병합 + cross_domain L3→L2 다운그레이드 스크립트
 * 1회 실행: npx tsx scripts/merge-duplicate-knowledge.ts
 */
import { mergeAndDowngradeCrossDomain } from '../lib/agent-loop/knowledge-store'

async function main() {
  console.log('=== 중복 인사이트 병합 시작 ===\n')

  const result = await mergeAndDowngradeCrossDomain()

  console.log(`✅ 다운그레이드: ${result.downgraded}건 (L3 → L2)`)
  console.log(`✅ 병합: ${result.merged}건 (유사도 0.85+ 중복)`)
  console.log(`✅ 삭제: ${result.deleted}건 (병합으로 제거)`)

  process.exit(0)
}

main().catch(err => {
  console.error('❌ 실패:', err)
  process.exit(1)
})
