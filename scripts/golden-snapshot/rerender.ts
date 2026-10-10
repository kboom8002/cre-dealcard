/**
 * @file scripts/golden-snapshot/rerender.ts
 * @description 스냅샷을 오프라인으로 PPTX 재렌더 (서버/Playwright/LLM/실 API 없음).
 *
 *   npx tsx scripts/golden-snapshot/rerender.ts <name|all|core|income>
 *
 * 출력: e2e/golden-snapshots/out/<name>.pptx, <name>.slides.json (슬라이드 텍스트 + 뷰어 섹션 마크다운)
 */
import { GOLDENS, CORE_GOLDEN_NAMES, INCOME_IG_NAMES, hasSnapshot, rerenderSnapshot } from './lib';

async function main() {
  const target = process.argv[2] ?? 'core';
  const names = target === 'all' ? GOLDENS.map(g => g.name).filter(hasSnapshot)
    : target === 'income' ? INCOME_IG_NAMES.filter(hasSnapshot)
    : target === 'core' ? CORE_GOLDEN_NAMES : [target];
  let failed = 0;
  for (const n of names) {
    if (!hasSnapshot(n)) { console.log(`⏭  ${n}: 스냅샷 없음 (capture.ts 먼저 실행)`); continue; }
    try {
      const r = await rerenderSnapshot(n);
      console.log(`✅ ${n}: ${r.slideCount}슬라이드 ${r.ms}ms | 차단된 네트워크 시도 ${r.network.blocked.length}건, Kakao 정적지도 스텁 ${r.network.stubbedKakaoStaticMap}건`);
      for (const u of new Set(r.network.blocked)) console.log(`     blocked: ${u}`);
    } catch (e: any) {
      failed++;
      console.log(`❌ ${n}: ${e?.message ?? e}`);
    }
  }
  if (failed) process.exit(1);
}
main().catch(e => { console.error(e); process.exit(1); });
