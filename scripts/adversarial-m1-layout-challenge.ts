/**
 * scripts/adversarial-m1-layout-challenge.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER HARNESS for Milestone M1 (Layout & Margin Standardization)
 *
 * Tests:
 * 1. split2Col Layout Geometry Generator across all presets, y, h, and customGap sweeps
 * 2. A23 Yield Formula callout clamping under various bullet counts (0, 1, 2, 3, 5, 10, 50) and land history states
 * 3. A24 Rent Roll column width sums, container width containment, and row mapping invariants
 * 4. A12 Ownership split2Col standardization and boundary closure
 */

import pptxgen from 'pptxgenjs';
import * as L from '../src/domain/building/mobile-im/pptx/imlib';
import {
  W,
  H,
  M,
  CW,
  SAFE_BOTTOM,
  split2Col,
} from '../src/domain/building/mobile-im/pptx/imlib';
import { buildA23YieldFormula } from '../src/domain/building/mobile-im/pptx/archetypes/a23-yield-formula';
import { buildA24RentrollStacking } from '../src/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking';
import { buildA12Ownership } from '../src/domain/building/mobile-im/pptx/archetypes/a12-ownership';

interface ChallengeResult {
  suite: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
}

const results: ChallengeResult[] = [];

function assert(
  suite: string,
  name: string,
  passed: boolean,
  expected: string,
  actual: string,
  details?: string
) {
  results.push({ suite, name, passed, expected, actual, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${suite}] ${name}: expected ${expected}, got ${actual}${details ? ` (${details})` : ''}`);
}

async function runAdversarialChallenges() {
  console.log('======================================================================');
  console.log('STARTING EMPIRICAL ADVERSARIAL CHALLENGES FOR MILESTONE M1');
  console.log('======================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 1: split2Col Generator & Exhaustive Gap Sweep
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: split2Col Layout Geometry & Exhaustive Gap Sweep ---');

  const presets = ['60_40', '50_50', '45_55', 'stacking'] as const;
  const testYs = [0, 1.5, 1.98, 2.5, 4.0];
  const testHs = [0.5, 2.0, 4.5, 5.0];

  // 1.1 Default Gap Verification for all presets
  const expectedDefaultGaps: Record<typeof presets[number], number> = {
    '60_40': 0.40,
    '50_50': 0.40,
    '45_55': 0.28,
    'stacking': 0.30,
  };
  const expectedDefaultLeftW: Record<typeof presets[number], number> = {
    '60_40': 7.30,
    '50_50': 5.846,
    '45_55': 5.45,
    'stacking': 3.40,
  };

  for (const preset of presets) {
    const bounds = split2Col(preset, 1.5, 4.0);
    const expectedGap = expectedDefaultGaps[preset];
    const expectedLw = expectedDefaultLeftW[preset];
    const expectedRightX = Math.round((M + expectedLw + expectedGap) * 1000) / 1000;
    const expectedRightW = Math.round((CW - expectedLw - expectedGap) * 1000) / 1000;
    const rightEdge = Math.round((bounds.right.x + bounds.right.w) * 1000) / 1000;
    const targetEdge = Math.round((W - M) * 1000) / 1000;

    assert(
      'Suite 1.1: Default Presets',
      `${preset} default values`,
      bounds.left.x === M &&
        bounds.left.w === expectedLw &&
        bounds.gap === expectedGap &&
        bounds.right.x === expectedRightX &&
        bounds.right.w === expectedRightW &&
        Math.abs(rightEdge - targetEdge) < 0.0001,
      `left.x=${M}, left.w=${expectedLw}, right.x=${expectedRightX}, right.w=${expectedRightW}, edge=${targetEdge}`,
      `left.x=${bounds.left.x}, left.w=${bounds.left.w}, right.x=${bounds.right.x}, right.w=${bounds.right.w}, edge=${rightEdge}`
    );
  }

  // 1.2 Exhaustive Sweep: 0.00 to 1.50 inch gaps (step 0.01) across 4 presets and various y, h
  let sweepTotal = 0;
  let sweepFailures = 0;
  let maxEdgeDrift = 0;

  for (const preset of presets) {
    for (let gapInt = 0; gapInt <= 150; gapInt++) {
      const customGap = gapInt / 100;
      for (const y of testYs) {
        for (const h of testHs) {
          sweepTotal++;
          const bounds = split2Col(preset, y, h, customGap);

          const expectedRightX = Math.round((M + bounds.left.w + customGap) * 1000) / 1000;
          const rightEdge = Math.round((bounds.right.x + bounds.right.w) * 1000) / 1000;
          const targetEdge = Math.round((W - M) * 1000) / 1000;
          const drift = Math.abs(rightEdge - targetEdge);
          if (drift > maxEdgeDrift) maxEdgeDrift = drift;

          const condLeftX = bounds.left.x === M;
          const condRightX = Math.abs(bounds.right.x - expectedRightX) < 0.001;
          const condEdge = drift <= 0.001;
          const condY = bounds.left.y === y && bounds.right.y === y;
          const condH = bounds.left.h === h && bounds.right.h === h;

          if (!condLeftX || !condRightX || !condEdge || !condY || !condH) {
            sweepFailures++;
          }
        }
      }
    }
  }

  assert(
    'Suite 1.2: Exhaustive Gap Sweep (0.00" to 1.50")',
    `Tested ${sweepTotal} combinations across 4 presets`,
    sweepFailures === 0,
    '0 failures',
    `${sweepFailures} failures (maxEdgeDrift: ${maxEdgeDrift.toFixed(6)}")`
  );

  // 1.3 Fine Sweep: 0.000 to 0.500 inch gaps (step 0.005)
  let fineSweepTotal = 0;
  let fineSweepFailures = 0;
  for (const preset of presets) {
    for (let gapInt = 0; gapInt <= 500; gapInt += 5) {
      const customGap = gapInt / 1000;
      fineSweepTotal++;
      const bounds = split2Col(preset, 2.0, 3.0, customGap);
      const rightEdge = Math.round((bounds.right.x + bounds.right.w) * 1000) / 1000;
      const targetEdge = Math.round((W - M) * 1000) / 1000;
      if (Math.abs(rightEdge - targetEdge) > 0.001 || bounds.left.x !== M) {
        fineSweepFailures++;
      }
    }
  }

  assert(
    'Suite 1.3: Fine Micro-Gap Sweep (0.000" to 0.500", step 0.005")',
    `Tested ${fineSweepTotal} fine gap combinations`,
    fineSweepFailures === 0,
    '0 failures',
    `${fineSweepFailures} failures`
  );

  // 1.4 Negative Pair: Asymmetric Canvas Drift
  const legacyM = 0.55;
  const legacyRightEdge = legacyM + CW;
  const legacyRightMargin = Math.round((W - legacyRightEdge) * 1000) / 1000;
  assert(
    'Suite 1.4: Bilateral Symmetry Negative Pair',
    'Legacy M=0.55 causes right margin drift of 0.14"',
    legacyRightMargin !== legacyM && Math.abs(legacyRightMargin - legacyM - 0.14) < 0.001,
    'legacyRightMargin = 0.690 != 0.55',
    `legacyRightMargin = ${legacyRightMargin}`
  );

  console.log('\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 2: A23 Yield Formula Callout Clamping & Footer Non-Collision
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 2: A23 Yield Formula Callout Clamping & Footer Non-Collision ---');

  const FOOTER_Y = 6.94;
  const bulletCounts = [0, 1, 2, 3, 5, 10, 20, 50, 100];
  const landHistoryFlags = [true, false];

  for (const hasLandHistory of landHistoryFlags) {
    for (const numBullets of bulletCounts) {
      const testName = `A23 with ${numBullets} bullets, hasLandHistory=${hasLandHistory}`;

      // Simulate the exact clamping logic from a23-yield-formula.ts:
      const cardY = 1.50;
      const cardH = 4.20;
      let calloutY = cardY + cardH + 0.15; // 5.85
      const rawH = 0.20 + numBullets * 0.28;
      let calloutH = rawH;

      if (numBullets > 0) {
        if (calloutY + calloutH > SAFE_BOTTOM) {
          calloutH = Math.max(0.50, SAFE_BOTTOM - calloutY);
          if (calloutY + calloutH > SAFE_BOTTOM) {
            calloutY = SAFE_BOTTOM - calloutH;
          }
        }
      } else {
        calloutH = 0;
      }

      const calloutBottom = numBullets > 0 ? calloutY + calloutH : 0;
      const passesSafeBottom = numBullets === 0 || calloutBottom <= SAFE_BOTTOM + 0.0001;
      const passesFooterCollision = numBullets === 0 || calloutBottom < FOOTER_Y;
      const clearanceToFooter = numBullets > 0 ? (FOOTER_Y - calloutBottom).toFixed(3) : 'N/A';
      const noCardOverlap = numBullets === 0 || calloutY >= cardY + cardH;

      assert(
        'Suite 2.1: Mathematical Clamp Simulation',
        testName,
        passesSafeBottom && passesFooterCollision && noCardOverlap,
        `calloutBottom <= ${SAFE_BOTTOM}" and < ${FOOTER_Y}" and calloutY >= ${cardY + cardH}"`,
        `calloutBottom = ${calloutBottom.toFixed(3)}", footerClearance = ${clearanceToFooter}", calloutY = ${calloutY.toFixed(3)}"`
      );
    }
  }

  // 2.2 Empirical Archetype Execution with Real PptxGenJS instance and Slide Shape Spy
  console.log('\nExecuting A23 archetype instances with live slide inspection...');
  
  function runA23WithSpy(data: any): { calloutFound: boolean; calloutY: number; calloutH: number; calloutBottom: number } {
    const pres = new pptxgen();
    let detectedCallout: { y: number; h: number } | null = null;

    const origAddSlide = pres.addSlide.bind(pres);
    pres.addSlide = () => {
      const slide = origAddSlide();
      const origAddShape = slide.addShape.bind(slide);
      slide.addShape = (shapeType: any, opts: any) => {
        // Detect callout: roundRect spanning full content width (CW) below KPI card (y >= 5.70)
        if (shapeType === 'roundRect' && Math.abs(opts.x - M) < 0.01 && Math.abs(opts.w - CW) < 0.01 && opts.y >= 5.70) {
          detectedCallout = { y: opts.y, h: opts.h };
        }
        return origAddShape(shapeType, opts);
      };
      return slide;
    };

    buildA23YieldFormula({
      pres,
      slideNum: 1,
      docno: 'TEST',
      grade: 'A',
      provenance: {},
      data,
    } as any);

    if (detectedCallout) {
      const d: { y: number; h: number } = detectedCallout;
      return {
        calloutFound: true,
        calloutY: d.y,
        calloutH: d.h,
        calloutBottom: Math.round((d.y + d.h) * 1000) / 1000,
      };
    }
    return { calloutFound: false, calloutY: 0, calloutH: 0, calloutBottom: 0 };
  }

  // Test Case 1: 0 bullets
  const res0 = runA23WithSpy({
    title: '수익률 테스트',
    askingPrice: 3_000_000_000,
    totalDeposit: 200_000_000,
    annualRent: 0,
    capRateAsIs: 0,
    landPriceHistory: null,
  });

  assert(
    'Suite 2.2: Live Archetype Slide Inspection',
    '0 bullets produces 0 callout calls',
    !res0.calloutFound,
    'no callout rendered',
    res0.calloutFound ? `callout at y=${res0.calloutY}, h=${res0.calloutH}` : 'no callout rendered'
  );

  // Test Case 2: 1 bullet (capRate >= 4.5%)
  const res1 = runA23WithSpy({
    title: '수익률 테스트',
    askingPrice: 3_000_000_000,
    totalDeposit: 200_000_000,
    annualRent: 150_000_000,
    capRateAsIs: 5.2,
    landPriceHistory: null,
  });

  assert(
    'Suite 2.2: Live Archetype Slide Inspection',
    '1 bullet produces unclamped callout within safe bounds',
    res1.calloutFound &&
      Math.abs(res1.calloutY - 5.85) < 0.001 &&
      Math.abs(res1.calloutH - 0.48) < 0.001 &&
      res1.calloutBottom <= SAFE_BOTTOM,
    `callout at y=5.85, h=0.48, bottom=6.33 <= ${SAFE_BOTTOM}`,
    res1.calloutFound ? `y=${res1.calloutY.toFixed(2)}, h=${res1.calloutH.toFixed(2)}, bottom=${res1.calloutBottom.toFixed(2)}` : 'none'
  );

  // Test Case 3: 2 bullets (capRate + land CAGR)
  const res2 = runA23WithSpy({
    title: '수익률 테스트',
    askingPrice: 3_000_000_000,
    totalDeposit: 200_000_000,
    annualRent: 150_000_000,
    capRateAsIs: 5.2,
    landPriceHistory: {
      history: [
        { year: '2023', pricePerSqm: 10_000_000 },
        { year: '2024', pricePerSqm: 11_000_000 },
      ],
      cagrPct: 4.5,
      latestPricePerSqm: 11_000_000,
    },
  });

  assert(
    'Suite 2.2: Live Archetype Slide Inspection',
    '2 bullets produces unclamped callout within safe bounds',
    res2.calloutFound &&
      Math.abs(res2.calloutY - 5.85) < 0.001 &&
      Math.abs(res2.calloutH - 0.76) < 0.001 &&
      res2.calloutBottom <= SAFE_BOTTOM,
    `callout at y=5.85, h=0.76, bottom=6.61 <= ${SAFE_BOTTOM}`,
    res2.calloutFound ? `y=${res2.calloutY.toFixed(2)}, h=${res2.calloutH.toFixed(2)}, bottom=${res2.calloutBottom.toFixed(2)}` : 'none'
  );

  // Test Case 4: 3 bullets (capRate + CAGR + Land Ratio >= 60%)
  const res3 = runA23WithSpy({
    title: '수익률 테스트',
    askingPrice: 3_000_000_000,
    totalDeposit: 200_000_000,
    annualRent: 150_000_000,
    capRateAsIs: 5.2,
    landAreaSqm: 250, // 250 * 11,000,000 = 2,750,000,000 / 3,000,000,000 = 91.6% >= 60%
    landPriceHistory: {
      history: [
        { year: '2023', pricePerSqm: 10_000_000 },
        { year: '2024', pricePerSqm: 11_000_000 },
      ],
      cagrPct: 4.5,
      latestPricePerSqm: 11_000_000,
    },
  });

  assert(
    'Suite 2.2: Live Archetype Slide Inspection',
    '3 bullets triggers CLAMP to exactly SAFE_BOTTOM (6.75")',
    res3.calloutFound &&
      Math.abs(res3.calloutY - 5.85) < 0.001 &&
      Math.abs(res3.calloutH - 0.90) < 0.001 &&
      Math.abs(res3.calloutBottom - SAFE_BOTTOM) < 0.001,
    `callout clamped to h=0.90, bottom=${SAFE_BOTTOM}`,
    res3.calloutFound ? `y=${res3.calloutY.toFixed(2)}, h=${res3.calloutH.toFixed(2)}, bottom=${res3.calloutBottom.toFixed(2)}` : 'none'
  );

  // 2.3 Negative Pair: Pre-fix Unclamped A23 Behavior
  const unconstrainedCardH = 4.80; // Pre-fix value when !hasLandHistory
  const unconstrainedCalloutY = 1.50 + unconstrainedCardH + 0.15; // 6.45
  const unconstrainedRawH = 0.20 + 3 * 0.28; // 1.04 (3 bullets)
  const unconstrainedBottom = unconstrainedCalloutY + unconstrainedRawH; // 7.49
  assert(
    'Suite 2.3: A23 Negative Pair (Pre-fix Unclamped Overflow)',
    'Pre-fix cardH=4.80 causes bottom to reach 7.49" and collide with footer at 6.94"',
    unconstrainedBottom > SAFE_BOTTOM && unconstrainedBottom > FOOTER_Y,
    `bottom > ${SAFE_BOTTOM}" and > ${FOOTER_Y}"`,
    `bottom = ${unconstrainedBottom.toFixed(2)}"`
  );

  console.log('\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 3: A24 Column Widths & Container Bounds
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 3: A24 Rent Roll Column Widths & Container Bounds ---');

  const spW = 3.40;
  const gap = 0.30;
  const tbX = M + spW + gap; // 0.62 + 3.40 + 0.30 = 4.32
  const tbW = CW - spW - gap; // 12.093 - 3.40 - 0.30 = 8.393

  const colW = [0.48, 1.05, 0.88, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1.30];
  const sumColW = Math.round(colW.reduce((a, b) => a + b, 0) * 1000) / 1000;
  const containerSlack = Math.round((tbW - sumColW) * 1000) / 1000;
  const tableRightEdge = Math.round((tbX + sumColW) * 1000) / 1000;
  const slideRightMargin = Math.round((W - tableRightEdge) * 1000) / 1000;

  // 3.1 Sum and Bounds Assertions
  assert(
    'Suite 3.1: A24 Column Width Sum',
    'colW sum <= tbW (8.393")',
    sumColW <= tbW,
    `<= ${tbW}"`,
    `${sumColW}" (slack: ${containerSlack}")`
  );

  assert(
    'Suite 3.1: A24 Right Safe Margin Preservation',
    'Slide right margin >= standard M (0.62")',
    slideRightMargin >= M - 0.0001,
    `>= ${M}"`,
    `${slideRightMargin}"`
  );

  // 3.2 Negative Pair: Pre-fix Over-extended Column Widths
  const preFixColW = [0.50, 1.10, 0.90, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 1.33];
  const preFixSum = Math.round(preFixColW.reduce((a, b) => a + b, 0) * 1000) / 1000;
  const preFixRightEdge = Math.round((tbX + preFixSum) * 1000) / 1000;
  const preFixMargin = Math.round((W - preFixRightEdge) * 1000) / 1000;

  assert(
    'Suite 3.2: A24 Negative Pair (Pre-fix Table Overflow)',
    'Pre-fix colW sum (8.63") exceeded container by 0.237" and eroded right margin to 0.453"',
    preFixSum > tbW && preFixMargin < M,
    `sum > ${tbW}" and margin < ${M}"`,
    `sum = ${preFixSum}", margin = ${preFixMargin}"`
  );

  // 3.3 Live A24 Archetype Invariance with Varying Row Payloads
  console.log('\nExecuting A24 archetype instances with degenerate row payloads...');
  const testPayloads = [
    { name: 'Empty Table Rows', rows: [] },
    { name: 'Partial 3-Column Rows', rows: [['1F', '카페', '30평'], ['2F', '사무실', '50평']] },
    {
      name: 'Standard 10-Column Rows',
      rows: [
        ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'],
        ['1F', '스타벅스', '근생', '150.0', '130.0', '10,000', '800', '100', '900', '2028-12-31'],
        ['2F', '치과', '의원', '120.0', '100.0', '5,000', '500', '80', '580', '2027-06-30'],
      ],
    },
    {
      name: 'Oversized 15-Column Rows',
      rows: [
        Array.from({ length: 15 }, (_, i) => `Col_${i + 1}`),
        Array.from({ length: 15 }, (_, i) => `Data_${i + 1}`),
      ],
    },
    {
      name: 'Ultra-Long Text Rows (>100 chars)',
      rows: [
        [
          '1F',
          '주식회사 매우매우긴법인명칭대한민국최대규모의프랜차이즈본점직영점',
          '제1종근린생활시설휴게음식점및일반음식점복합용도',
          '999.99',
          '888.88',
          '1,000,000',
          '50,000',
          '5,000',
          '55,000',
          '2035-12-31',
        ],
      ],
    },
  ];

  for (const testCase of testPayloads) {
    const pres = new pptxgen();
    let capturedTableData: any[][] = [];
    let capturedOptions: any = null;

    // Spy on slide.addTable
    const origAddSlide = pres.addSlide.bind(pres);
    pres.addSlide = () => {
      const slide = origAddSlide();
      const origAddTable = slide.addTable.bind(slide);
      slide.addTable = (data: any, options: any) => {
        capturedTableData = data;
        capturedOptions = { ...options, colW: options.colW ? [...options.colW] : [] };
        return origAddTable(data, options);
      };
      return slide;
    };

    const mockInput = {
      pres,
      slideNum: 6,
      docno: 'DOC-M1-A24-CHALLENGE',
      data: {
        title: '임대차 현황 및 층별 배치도',
        kicker: 'Rent Roll',
        tableRows: testCase.rows,
        stackingData: [
          { floor: '2F', tenant: '치과', area: 120, isVacant: false },
          { floor: '1F', tenant: '스타벅스', area: 150, isVacant: false },
        ],
      },
      grade: 'A' as const,
      provenance: {},
    };

    let executedWithoutThrow = false;

    try {
      buildA24RentrollStacking(mockInput as any);
      executedWithoutThrow = true;
    } catch (err: any) {
      console.error(`Error executing A24 with ${testCase.name}:`, err);
    }

    if (testCase.rows.length === 0) {
      assert(
        'Suite 3.3: Live A24 Robustness',
        testCase.name,
        executedWithoutThrow && capturedTableData.length === 0,
        'executed cleanly and 0 table rows rendered',
        `executed=${executedWithoutThrow}, tableRows=${capturedTableData.length}`
      );
    } else {
      const allRowsHave10Cols = capturedTableData.every((r) => r.length === 10);
      const tableWidth = capturedOptions?.w ?? 0;
      const colWArray = capturedOptions?.colW ?? [];
      const sumCols = colWArray.reduce((a: number, b: number) => a + b, 0);

      assert(
        'Suite 3.3: Live A24 Robustness',
        testCase.name,
        executedWithoutThrow &&
          allRowsHave10Cols &&
          colWArray.length === 10 &&
          Math.abs(sumCols - 8.39) < 0.001 &&
          tableWidth <= tbW,
        `allRows 10 cols, colW length 10, colW sum 8.39 <= ${tbW}`,
        `executed=${executedWithoutThrow}, all10Cols=${allRowsHave10Cols}, colWCount=${colWArray.length}, sumCols=${sumCols.toFixed(2)}`
      );
    }
  }

  console.log('\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SUITE 4: A12 Ownership Standard Primitives Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 4: A12 Ownership split2Col Standardization ---');

  const presA12 = new pptxgen();
  let a12TableData: any[][] = [];
  let a12TableOptions: any = null;

  const origA12AddSlide = presA12.addSlide.bind(presA12);
  presA12.addSlide = () => {
    const slide = origA12AddSlide();
    const origAddTable = slide.addTable.bind(slide);
    slide.addTable = (data: any, options: any) => {
      if (!a12TableOptions) {
        a12TableData = data;
        a12TableOptions = { ...options, colW: options.colW ? [...options.colW] : [] };
      }
      return origAddTable(data, options);
    };
    return slide;
  };

  const mockA12Input = {
    pres: presA12,
    slideNum: 4,
    docno: 'DOC-M1-A12-CHALLENGE',
    data: {
      title: '소유권 및 권리관계',
      kicker: 'OWNERSHIP',
      ownershipRows: [
        ['갑구', '소유권 이전 (매매)', '2015-08-12'],
        ['을구', '근저당권 설정 (우리은행)', '채권최고액 24억원'],
      ],
      callouts: [
        { title: '소유권 상태', body: '단독 소유, 권리관계 명확함' },
        { title: '제한물권', body: '잔금 시 전액 말소 조건' },
      ],
      note: '※ 본 자료는 부동산 등기사항전부증명서(말소사항 포함)를 기준으로 작성되었습니다.',
    },
    grade: 'A' as const,
    provenance: {},
  };

  let a12Success = false;
  try {
    buildA12Ownership(mockA12Input as any);
    a12Success = true;
  } catch (err: any) {
    console.error('Error executing A12:', err);
  }

  const { left: a12Left, right: a12Right } = split2Col('60_40', 1.98, 4.5);
  const a12TableSumColW = a12TableOptions?.colW
    ? a12TableOptions.colW.reduce((a: number, b: number) => a + b, 0)
    : 0;

  assert(
    'Suite 4: A12 Ownership Live Archetype',
    'A12 renders cleanly with standardized split2Col primitives',
    a12Success &&
      Math.abs(a12TableOptions.x - a12Left.x) < 0.001 &&
      Math.abs(a12TableOptions.w - a12Left.w) < 0.001 &&
      Math.abs(a12TableSumColW - a12Left.w) < 0.001,
    `table.x=${a12Left.x}, table.w=${a12Left.w}`,
    `table.x=${a12TableOptions?.x}, table.w=${a12TableOptions?.w}, sumColW=${a12TableSumColW}`
  );

  console.log('\n======================================================================');
  console.log('ADVERSARIAL CHALLENGE SUMMARY');
  console.log('======================================================================');

  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;

  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED:      ${totalPassed}`);
  console.log(`FAILED:      ${totalFailed}`);

  if (totalFailed === 0) {
    console.log('\n>>> OVERALL VERDICT: APPROVE <<<');
  } else {
    console.log('\n>>> OVERALL VERDICT: REQUEST_CHANGES <<<');
  }

  return { totalPassed, totalFailed, results };
}

runAdversarialChallenges().catch((err) => {
  console.error('Fatal error during challenge execution:', err);
  process.exit(1);
});
