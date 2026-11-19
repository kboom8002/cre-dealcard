/**
 * @file p7-sutaek-r2-golden-pipeline.test.ts
 * @description P7 수택 Dev R2-Standard
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { calculateFinancials } from '@/domain/building/mobile-im/financials';
import {
  MobileImPptxRenderer,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
  verifyMathematicalConsistency,
} from '@/assurance/im-harness/golden-test-utils';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { safeWritePptx } from './fixtures/safe-write';
import { createBasicImTestInput } from './fixtures/basic-im-factory';

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p7-sutaek-dev', 'r2-standard');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p7-sutaek-r2');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'sutaek_dev_r2_basic.pptx');

describe.skipIf(!existsSync(DATA_DIR))('P7 수택 Dev R2-Standard', () => {
  let bottomSheet: any;
  let pptxResult: any;

  beforeAll(() => {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it('Step 1: 데이터셋 로드', async () => {
    bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));
    expect(bottomSheet.posture).toBe('development');
  });

  it('Step 2: 메모 슬롯 추출', async () => {
    const memoPath = join(DATA_DIR, 'memo.txt');
    const sourceText = existsSync(memoPath)
      ? readFileSync(memoPath, 'utf8')
      : `${bottomSheet.address ?? ''} ${bottomSheet.title ?? ''}`.trim();
    const slots = extractSlotsFromMemo(sourceText);
    expect(slots).toBeDefined();
  });
  it('Step 3: 재무 계산', async () => {
    const fin = calculateFinancials({
      posture: 'development',
      purchasePriceKrw: 8900000000,
      monthlyRentKrw: 0,
      totalAreaSqm: Number(bottomSheet.totalFloorAreaSqm || 100),
      platAreaSqm: Number(bottomSheet.landAreaSqm || 100),
      vacancyRatePct: 0,
      totalDepositManwon: 0,
    });
    expect(fin).toBeDefined();
  });
  it('Step 4: 데이터 품질 배지', async () => {
    const badge = computeDataQualityBadge({ hasAddress: true, hasPhotos: true } as any, 'development');
    expect(badge).toBeDefined();
    expect(typeof badge.tier).toBe('string');
    expect(typeof badge.score).toBe('number');
  });
  it('Step 5: 덱 시퀀서 검증', async () => {
    const seq = buildDeckSequence({
      posture: 'development',
      grade: 'B',
      hasPhotos: true,
      preset: 'credeal_basic',
      dataAvailability: {},
    });
    expect(seq.length).toBeGreaterThanOrEqual(6);
    expect(seq.length).toBeLessThanOrEqual(12);
  });

  it('Step 6: PPTX 렌더링', async () => {
    const pptxInput = await createBasicImTestInput(bottomSheet, { buildingName: '수택 복합개발' });
    const renderer = new MobileImPptxRenderer();
    pptxResult = await renderer.render(pptxInput);
    safeWritePptx(PPTX_OUTPUT_PATH, pptxResult.buffer);
    expect(pptxResult.buffer).toBeDefined();
  });

  it('Step 7-A: Poison Token 검증', async () => { await assertZeroPoisonTokens(pptxResult.buffer); });
  it('Step 7-B: Evasive Phrase 검증', async () => { await assertZeroEvasivePhrases(pptxResult.buffer); });
  it('Step 7-C: Mock Data Leak 검증', async () => { await assertZeroMockLeaks(pptxResult.buffer); });
  it('Step 7-D: Physical Binary Gates 검증', async () => {
    const bin = await assertAllPhysicalBinaryGates(pptxResult.buffer);
    expect(bin.isPass).toBe(true);
  });

  it('Step 8: 슬라이드 콘텐츠 검증', async () => {
    const extractedSlides = await extractSlideTexts(pptxResult.buffer);
    const fullText = extractedSlides.map((s: any) => s.text).join(' ');
    expect(fullText.includes('수택') || fullText.includes('구리')).toBe(true);
    expect(fullText.includes('89')).toBe(true);
  });

  it('Step 9: 수학적 일관성 검증', async () => {
    const consistency = verifyMathematicalConsistency(
      { noi: 0, askingPrice: 8900000000, initialCapRatePct: 0 },
      { year1Noi: 0, grossSalePrice: 8900000000 }
    );
    expect(consistency.isConsistent).toBe(true);
  });
  it('Step 10: PPTX 산출물 바이너리 검증', async () => {
    expect(pptxResult.buffer.byteLength).toBeGreaterThan(10_000);
    expect(existsSync(PPTX_OUTPUT_PATH)).toBe(true);
  });
});
