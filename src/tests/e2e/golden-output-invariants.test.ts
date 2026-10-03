import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';
import {
  checkOutputInvariants, errorsOf, extractSlideXmlText, formatViolations,
} from '@/domain/building/mobile-im/quality/output-invariants';

/**
 * H1 게이트: 직전 골든 E2E가 생성한 PPTX 산출물 전수에 출력 불변식을 적용한다.
 * (산출물이 없으면 skip — E2E를 먼저 실행한 환경에서만 의미가 있다.)
 */
const OUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs');

function collectPptx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (/captures$/.test(name)) continue; // 동일 파일 사본
      out.push(...collectPptx(p));
    } else if (name.toLowerCase().endsWith('.pptx') && !/_\d{13}\.pptx$/i.test(name)) out.push(p); // 타임스탬프 사본(과거 실행분) 제외
  }
  return out;
}

function slideTexts(pptxPath: string): string[] {
  const zip = new AdmZip(pptxPath);
  return zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => parseInt(a.entryName.match(/(\d+)/)![1], 10) - parseInt(b.entryName.match(/(\d+)/)![1], 10))
    .map(e => extractSlideXmlText(e.getData().toString('utf-8')));
}

const files = collectPptx(OUT_DIR);

/**
 * 알려진 미해결 결함 (Basic IM 범위 밖). 수정되면 it.fails 가 실패하여 이 목록에서 제거하도록 유도한다.
 * - p1-dangsan-r3-pro: Pro IM 10p에 mock LLM 응답 JSON({"ok":true,"mocked":true,...})이 노출됨 (D-JSON-LEAK 잔존 경로)
 */
const KNOWN_ISSUES = ['p1_dangsan_income_r3_pro.pptx'];


describe('H1 게이트: 골든 PPTX 산출물 출력 불변식', () => {
  if (files.length === 0) {
    it.skip('골든 산출물 없음 (E2E 선행 필요)', () => {});
    return;
  }
  for (const f of files) {
    const known = KNOWN_ISSUES.some(k => f.endsWith(k));
    const run = known ? it.fails : it;
    run(`error 위반 0건: ${f.replace(OUT_DIR, '').replace(/\\/g, '/')}`, () => {
      const violations = checkOutputInvariants(slideTexts(f));
      expect(formatViolations(errorsOf(violations))).toBe('OK');
    });
  }
});
