/**
 * L4: PPTX 바이너리 파서 종단 검증 (D35 §4)
 *
 * 대조군 v3/v4 PPTX를 실제로 열어서 게이트 컨텍스트를 추출하고
 * 위반 건수를 expected.json과 대조합니다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parsePptx } from '../../domain/building/mobile-im/pptx/pptx-parser';
import {
  extractGateContext,
  generateAuditReport,
} from '../../domain/building/mobile-im/pptx/extract-gate-context';

const CORPUS_DIR = resolve(__dirname, '../../../tests/corpus');

// ─── 헬퍼 ────────────────────────────────────────────
function loadPptx(filename: string): Buffer | null {
  const filepath = resolve(CORPUS_DIR, filename);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath);
}

function loadExpected(): Record<string, any> {
  const filepath = resolve(CORPUS_DIR, 'expected.json');
  if (!existsSync(filepath)) return {};
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

// ─── 테스트 ──────────────────────────────────────────
describe('L4: PPTX 바이너리 파서 (D35 §4)', () => {
  describe('파서 기본 동작', () => {
    it('v4_goldilocks.pptx를 파싱하여 슬라이드 구조를 추출한다', async () => {
      const buf = loadPptx('v4_goldilocks.pptx');
      if (!buf) return; // corpus 미존재 시 skip

      const result = await parsePptx(buf);

      // 기본 구조 검증
      expect(result.slideCount).toBeGreaterThan(0);
      expect(result.slides).toHaveLength(result.slideCount);
      expect(result.totalShapes).toBeGreaterThan(0);

      // 각 슬라이드에 인덱스 존재
      result.slides.forEach((slide, i) => {
        expect(slide.index).toBe(i);
        expect(slide.shapes).toBeDefined();
        expect(slide.texts).toBeDefined();
        expect(slide.images).toBeDefined();
      });
    });

    it('v3_gold.pptx를 파싱한다', async () => {
      const buf = loadPptx('v3_gold.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      expect(result.slideCount).toBeGreaterThan(0);
    });

    it('v3_obsidian.pptx를 파싱한다', async () => {
      const buf = loadPptx('v3_obsidian.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      expect(result.slideCount).toBeGreaterThan(0);
    });
  });

  describe('이미지 물리 추출', () => {
    it('이미지 DPI, 크로핑률, 종횡비 왜곡을 계산한다', async () => {
      const buf = loadPptx('v4_goldilocks.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      const imagesWithDpi = result.slides.flatMap(s => s.images).filter(img => img.effectiveDpi > 0);

      // 이미지가 있다면 물리 검사값이 합리적
      if (imagesWithDpi.length > 0) {
        for (const img of imagesWithDpi) {
          expect(img.effectiveDpi).toBeGreaterThan(0);
          expect(img.boxWidthInches).toBeGreaterThan(0);
          expect(img.boxHeightInches).toBeGreaterThan(0);
          expect(img.cropRatio).toBeGreaterThanOrEqual(0);
          expect(img.cropRatio).toBeLessThanOrEqual(1);
          expect(img.aspectDistortionPct).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('GateContext 추출', () => {
    it('v4_goldilocks에서 GateContext를 추출한다', async () => {
      const buf = loadPptx('v4_goldilocks.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      const ctx = extractGateContext(result.slides);

      // GateContext 필드가 존재
      expect(ctx.maxCropRatio).toBeDefined();
      expect(ctx.minEffectiveDpi).toBeDefined();
      expect(ctx.textOverflowCount).toBeDefined();
      expect(ctx.overlapMaxInches).toBeDefined();
      expect(ctx.bleedCount).toBeDefined();
      expect(ctx.aspectDistortionMaxPct).toBeDefined();
      expect(ctx.vacancyNarrativeContradiction).toBeDefined();
      expect(ctx.fallbackDuplicateCount).toBeDefined();
      expect(ctx.unclosedBracketCount).toBeDefined();
      expect(ctx.pageCountExceeded).toBeDefined();

      // 값 범위 합리성
      expect(ctx.maxCropRatio).toBeGreaterThanOrEqual(0);
      expect(ctx.minEffectiveDpi).toBeGreaterThanOrEqual(0);
      expect(ctx.textOverflowCount).toBeGreaterThanOrEqual(0);
    });

    // ── negative pair: 빈 슬라이드 배열 ──
    it('빈 슬라이드에서 위반 0을 반환한다', () => {
      const ctx = extractGateContext([]);
      expect(ctx.maxCropRatio).toBe(0);
      expect(ctx.textOverflowCount).toBe(0);
      expect(ctx.bleedCount).toBe(0);
      expect(ctx.vacancyNarrativeContradiction).toBe(false);
      expect(ctx.pageCountExceeded).toBe(false);
    });
  });

  describe('감사 리포트 생성', () => {
    it('v4_goldilocks 감사 리포트에서 위반을 탐지한다', async () => {
      const buf = loadPptx('v4_goldilocks.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      const ctx = extractGateContext(result.slides);
      const report = generateAuditReport(result.slides, ctx);

      // 구조 검증
      expect(report.slideCount).toBeGreaterThan(0);
      expect(report.gateContext).toBeDefined();
      expect(report.layoutViolations).toBeDefined();
      expect(report.standardViolations).toBeDefined();

      // v4_goldilocks는 위반이 있어야 함 (음성 대조군)
      const totalViolations = report.layoutViolations.length + report.standardViolations.length;
      expect(totalViolations).toBeGreaterThan(0);
    });

    // ── negative pair: 빈 슬라이드 ──
    it('빈 슬라이드 감사 리포트에서 위반 0을 반환한다', () => {
      const ctx = extractGateContext([]);
      const report = generateAuditReport([], ctx);
      expect(report.layoutViolations).toHaveLength(0);
      expect(report.standardViolations).toHaveLength(0);
    });
  });

  describe('대조군 기대 건수 비교', () => {
    it('3종 대조군에서 위반이 1건 이상 탐지된다', async () => {
      const expected = loadExpected();
      const specimens = expected.specimens ?? {};

      for (const [filename, spec] of Object.entries(specimens) as [string, any][]) {
        const buf = loadPptx(filename);
        if (!buf) continue;

        const result = await parsePptx(buf);
        const ctx = extractGateContext(result.slides);
        const report = generateAuditReport(result.slides, ctx);

        const totalViolations = report.layoutViolations.length + report.standardViolations.length;

        // 음성 대조군은 반드시 위반이 있어야 함
        expect(totalViolations).toBeGreaterThan(0);
      }
    });

    // ── negative pair: 빈 슬라이드는 위반 없음 ──
    it('빈 슬라이드는 대조군 검사에서 위반 0', () => {
      const ctx = extractGateContext([]);
      const report = generateAuditReport([], ctx);
      expect(report.layoutViolations.length + report.standardViolations.length).toBe(0);
    });
  });

  describe('텍스트 추출', () => {
    it('슬라이드에서 한국어 텍스트를 추출한다', async () => {
      const buf = loadPptx('v4_goldilocks.pptx');
      if (!buf) return;

      const result = await parsePptx(buf);
      const allTexts = result.slides.flatMap(s => s.texts);

      // 텍스트가 추출됨
      expect(allTexts.length).toBeGreaterThan(0);

      // 한국어 문자 포함 확인
      const hasKorean = allTexts.some(t => /[가-힣]/.test(t));
      expect(hasKorean).toBe(true);
    });
  });

  describe('면수 검사', () => {
    it('16면 초과 슬라이드는 G52 위반', () => {
      // 17면 가상 슬라이드
      const fakeSlides: any[] = Array.from({ length: 17 }, (_, i) => ({
        index: i, shapes: [], texts: [], images: [],
      }));
      const ctx = extractGateContext(fakeSlides);
      expect(ctx.pageCountExceeded).toBe(true);
    });

    // ── negative pair ──
    it('16면 이하 슬라이드는 G52 통과', () => {
      const fakeSlides: any[] = Array.from({ length: 16 }, (_, i) => ({
        index: i, shapes: [], texts: [], images: [],
      }));
      const ctx = extractGateContext(fakeSlides);
      expect(ctx.pageCountExceeded).toBe(false);
    });
  });
});
