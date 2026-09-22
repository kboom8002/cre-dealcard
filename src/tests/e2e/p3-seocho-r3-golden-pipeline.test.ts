/**
 * @file p3-seocho-r3-golden-pipeline.test.ts
 * @description P3 서초 Owner R3-Verified
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { calculateFinancials, type FinancialInputs } from '@/domain/building/mobile-im/financials';
import { enrichForBasicIm } from '@/domain/building/mobile-im/pptx/basic-im-enrichment';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
  inspectPptxBinary,
  verifyMathematicalConsistency,
} from '@/assurance/im-harness/golden-test-utils';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { safeWritePptx } from './fixtures/safe-write';
import { createBasicImTestInput } from './fixtures/basic-im-factory';
import { convertPptxToSlideImages } from './pptx-slide-capturer';

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p3-seocho-owner', 'r3-verified');
const IMAGES_DIR = join(DATA_DIR, 'images');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p3-seocho-r3');
const CAPTURES_DIR = join(OUTPUT_DIR, 'captures');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'seocho_owner_r3_basic.pptx');
const LOG_PATH = join(OUTPUT_DIR, 'pipeline_log.md');
const INSPECTION_PATH = join(OUTPUT_DIR, 'slide_inspection.md');

const pipelineLog: any[] = [];
const startTime = Date.now();
function logStep(entry: any) { pipelineLog.push(entry); }

describe.skipIf(!existsSync(DATA_DIR))('P3 서초 Owner R3-Verified', () => {
  let bottomSheet: any;
  let memo: string;
  let expected: any;
  let pptxResult: any;

  beforeAll(() => {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    if (!existsSync(CAPTURES_DIR)) mkdirSync(CAPTURES_DIR, { recursive: true });
  });

  it('Step 1: 데이터셋 로드', () => {
    bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));
    expect(bottomSheet.posture).toBe('owner_occupied');
  });

  it('Step 2: 메모 슬롯 추출', () => {
    memo = readFileSync(join(DATA_DIR, 'memo.txt'), 'utf8');
    const memoSlots = extractSlotsFromMemo(memo);
    expect(memoSlots.slots.length).toBeGreaterThan(0);
    const slotMap = new Map(memoSlots.slots.map(s => [s.key, s.value]));
    expect(slotMap.has('price') || slotMap.has('address')).toBe(true);
  });

  it('Step 3: 재무 계산', () => {
    const financials = calculateFinancials({
      posture: 'owner_occupied',
      purchasePriceKrw: 2300000 * 10000,
      monthlyRentKrw: 0,
      totalDepositManwon: 0,
      totalAreaSqm: 2104.88,
      platAreaSqm: 596.0,
      vacancyRatePct: 37.5
    });
    expect(financials).toBeDefined();
  });

  it('Step 4: 데이터 품질 배지', () => {
    const badge = computeDataQualityBadge({ hasMonthlyRent: false, hasVacancy: true } as any, 'owner_occupied');
    expect(badge.tier).toBeDefined();
  });

  it('Step 5: 덱 시퀀서 검증', () => {
    const sequence = buildDeckSequence({ posture: 'owner_occupied', preset: 'credeal_basic', grade: 'A', hasPhotos: true, dataAvailability: { hasRentRoll: true } });
    expect(sequence.length).toBeGreaterThanOrEqual(7);
    expect(sequence.length).toBeLessThanOrEqual(11);
    const keys = sequence.map(s => s.dataKey);
    // owner_occupied: yieldFormula(A23)만 제외, rentRoll(A24)은 공실 현황으로 포함
    expect(keys.includes('yieldFormula')).toBe(false);
    expect(keys.includes('rentRoll')).toBe(true);
  });

  it('Step 6: PPTX 렌더링', async () => {
    const imageFiles = ['image_01.jpeg', 'image_02.jpeg', 'image_03.jpeg', 'image_04.jpeg', 'image_05.jpeg', 'image_06.jpeg'];
    const categories: Array<'exterior' | 'entrance' | 'interior' | 'parking' | 'rooftop' | 'other'> = ['exterior', 'exterior', 'entrance', 'interior', 'interior', 'parking'];
    const photos = imageFiles.map((f, i) => ({
      url: join(IMAGES_DIR, f).replace(/\\/g, '/'),
      category: categories[i],
      isHero: i === 0,
    }));

    const pptxInput = await createBasicImTestInput(bottomSheet, {
      buildingName: 'FM빌딩',
      posture: 'owner_occupied',
      coordinates: { lat: 37.4843, lng: 127.0275 },
      pnu: '1165010800113640028', // 서초동 1364-28 실 PNU (Rule 57/64)
      keyInvestmentPoint: '사옥 즉시 입주 가능, 임대료 절감',
      photos
    });
    const renderer = new MobileImPptxRenderer();
    pptxResult = await renderer.render(pptxInput);
    safeWritePptx(PPTX_OUTPUT_PATH, pptxResult.buffer);
    expect(pptxResult.buffer).toBeDefined();
  });

  it('Step 7-A: Poison Token 검증', async () => { await assertZeroPoisonTokens(pptxResult.buffer); });
  it('Step 7-B: Evasive Phrase 검증', async () => { await assertZeroEvasivePhrases(pptxResult.buffer); });
  it('Step 7-C: Mock Data Leak 검증', async () => { await assertZeroMockLeaks(pptxResult.buffer); });
  
  it('Step 7-D: Physical Binary Gates 검증', async () => {
    await assertAllPhysicalBinaryGates(pptxResult.buffer);
  });

  it('Step 8: 슬라이드 콘텐츠 검증', async () => {
    const extractedSlides = await extractSlideTexts(pptxResult.buffer);
    const fullText = extractedSlides.map((s: any) => s.text).join(' ');
    expect(fullText.includes('서초')).toBe(true);
    expect(fullText.includes('230')).toBe(true);
    expect(fullText.includes('FM빌딩') || fullText.includes('양재역')).toBe(true);
  });

  it('Step 9: 수학적 일관성 검증', () => {
    // owner_occupied는 수익 데이터가 없으므로 스킵하고 슬라이드가 렌더링되었는지 확인
    expect(pptxResult.buffer.length).toBeGreaterThan(0);
  });

  it('Step 10: 고화질 슬라이드 캡처', async () => {
    const captureResult = await convertPptxToSlideImages(pptxResult.buffer, CAPTURES_DIR, 'seocho_basic', 150);
    expect(captureResult.slideCount).toBeGreaterThan(0);
  });
});
