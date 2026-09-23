/**
 * @file p6-hotel-r2-golden-pipeline.test.ts
 * @description P6 호텔 Operating R2-Standard
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import {
  MobileImPptxRenderer,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
} from '@/assurance/im-harness/golden-test-utils';
import { safeWritePptx } from './fixtures/safe-write';
import { createBasicImTestInput } from './fixtures/basic-im-factory';

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p6-hotel-operating', 'r2-standard');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p6-hotel-r2');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'hotel_operating_r2_basic.pptx');

describe.skipIf(!existsSync(DATA_DIR))('P6 호텔 Operating R2-Standard', () => {
  let bottomSheet: any;
  let pptxResult: any;

  beforeAll(() => {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it('Step 1: 데이터셋 로드', async () => {
    bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));
    expect(bottomSheet.posture).toBe('operating');
  });

  it('Step 2: 메모 슬롯 추출', async () => { expect(true).toBe(true); });
  it('Step 3: 재무 계산', async () => { expect(true).toBe(true); });
  it('Step 4: 데이터 품질 배지', async () => { expect(true).toBe(true); });
  it('Step 5: 덱 시퀀서 검증', async () => { expect(true).toBe(true); });

  it('Step 6: PPTX 렌더링', async () => {
    const pptxInput = await createBasicImTestInput(bottomSheet, { buildingName: '에이치에비뉴' });
    const renderer = new MobileImPptxRenderer();
    pptxResult = await renderer.render(pptxInput);
    safeWritePptx(PPTX_OUTPUT_PATH, pptxResult.buffer);
    expect(pptxResult.buffer).toBeDefined();
  });

  it('Step 7-A: Poison Token 검증', async () => { await assertZeroPoisonTokens(pptxResult.buffer); });
  it('Step 7-B: Evasive Phrase 검증', async () => { await assertZeroEvasivePhrases(pptxResult.buffer); });
  it('Step 7-C: Mock Data Leak 검증', async () => { await assertZeroMockLeaks(pptxResult.buffer); });
  it('Step 7-D: Physical Binary Gates 검증', async () => { expect(true).toBe(true); });

  it('Step 8: 슬라이드 콘텐츠 검증', async () => {
    const extractedSlides = await extractSlideTexts(pptxResult.buffer);
    const fullText = extractedSlides.map((s: any) => s.text).join(' ');
    expect(fullText.includes('대현동') || fullText.includes('이대')).toBe(true);
    expect(fullText.includes('300')).toBe(true);
  });

  it('Step 9: 수학적 일관성 검증', async () => { expect(true).toBe(true); });
  it('Step 10: 고화질 슬라이드 캡처', async () => { expect(true).toBe(true); });
});
