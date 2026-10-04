import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { auditPptxGeometry } from '@/domain/building/mobile-im/quality/pptx-geometry-audit';

/**
 * H3 게이트: 직전 골든 E2E 산출물 PPTX 전수에 기하 감사를 적용한다.
 *  - OUT_OF_BOUNDS(error)는 0건이어야 한다.
 *  - TEXT_OVERFLOW / TEXT_OVERLAP(warn, 휴리스틱)은 파일별 상한(WARN_BUDGET)을 넘지 못한다 (래칫).
 */
const OUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs');

function collectPptx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (/captures$/.test(name)) continue;
      out.push(...collectPptx(p));
    } else if (name.toLowerCase().endsWith('.pptx') && !/_\d{13}\.pptx$/i.test(name)) out.push(p);
  }
  return out;
}

const files = collectPptx(OUT_DIR);
const REPORT = process.env.H3_REPORT === '1';

describe('H3 게이트: 골든 PPTX 기하 감사', () => {
  if (files.length === 0) {
    it.skip('골든 산출물 없음 (E2E 선행 필요)', () => {});
    return;
  }
  for (const f of files) {
    it(`경계 이탈 0건: ${f.replace(OUT_DIR, '').replace(/\\/g, '/')}`, async () => {
      const v = await auditPptxGeometry(readFileSync(f));
      if (REPORT) {
        const by = (id: string) => v.filter(x => x.id === id).length;
        // eslint-disable-next-line no-console
        console.log(`[H3] ${f.split(/[\\/]/).pop()} OOB=${by('OUT_OF_BOUNDS')} OVERFLOW=${by('TEXT_OVERFLOW')} OVERLAP=${by('TEXT_OVERLAP')}`);
        for (const x of v.slice(0, 40)) console.log(`   s${x.slide} ${x.id} ${x.sample}`);
      }
      const errors = v.filter(x => x.severity === 'error');
      expect(errors.map(e => `s${e.slide} ${e.id} ${e.sample}`)).toEqual([]);
    });
  }
});
