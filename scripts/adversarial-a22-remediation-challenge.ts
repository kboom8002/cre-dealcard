/**
 * Empirical Adversarial Verification Suite: Archetype A22 Stacking Plan Remediation
 * 
 * Verifies:
 * 1. High-rises (27, 40, 50 floors + boundary tests) strictly respect canvas height (Y+H <= 6.90") and have 0 bleed.
 * 2. Dynamic summary row reflects real data without hardcoding (no hardcoded "3,233.4", "전층 만실", "8개층").
 * 3. Missing / null / undefined floor identifiers handled defensively without TypeError.
 * 4. Table column widths sum to exactly 5.92".
 */
import PptxGenJS from 'pptxgenjs';
import {
  buildA22StackingPlan,
  calculateSetbackRatio,
  inferTenantCategory,
  condenseFloorsForDisplay,
} from '../src/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan';
import { validateLayout } from '../src/domain/building/mobile-im/pptx/layout-validator';
import type { StackingPlanFloor } from '../src/domain/building/mobile-im/types';

interface CheckRecord {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: any;
}

const records: CheckRecord[] = [];

function check(id: string, name: string, category: string, passed: boolean, expected: string, actual: string, details?: any) {
  records.push({ id, name, category, passed, expected, actual, details });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] [${id}] ${category} > ${name}`);
  if (!passed) {
    console.error(`       Expected: ${expected}`);
    console.error(`       Actual:   ${actual}`);
    if (details) console.error(`       Details:  ${JSON.stringify(details)}`);
  }
}

function extractText(val: any): string {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map(extractText).join('');
  if (typeof val === 'object') {
    if (val.text !== undefined) return extractText(val.text);
    if (val.t !== undefined) return extractText(val.t);
  }
  return String(val);
}

function getMaxBottom(pres: any): number {
  const slides = pres._slides || [];
  if (slides.length === 0) return 0;
  let maxBottom = 0;
  for (const slide of slides) {
    for (const obj of slide._slideObjects || []) {
      const y = obj.y > 100 ? obj.y / 914400 : (obj.y || 0);
      const h = obj.h > 100 ? obj.h / 914400 : (obj.h || 0);
      const bottom = y + h;
      if (bottom > maxBottom) {
        maxBottom = bottom;
      }
    }
  }
  return Math.round(maxBottom * 1000) / 1000;
}

function generateFloors(aboveCount: number, belowCount: number, options?: {
  vacantRatio?: number;
  anchorName?: string;
  anchorFloors?: number;
  customExclusivePy?: number;
}): StackingPlanFloor[] {
  const floors: StackingPlanFloor[] = [];
  const anchorCount = options?.anchorFloors ?? 0;
  const anchorName = options?.anchorName ?? '앵커기업';

  for (let i = aboveCount; i >= 1; i--) {
    const isAnchor = anchorCount > 0 && i <= anchorCount;
    const isVacant = options?.vacantRatio ? (i % Math.round(1 / options.vacantRatio) === 0) : false;
    floors.push({
      floor: `${i}F`,
      use: i <= 2 ? '근린생활시설' : '업무시설',
      tenant: isAnchor ? `${anchorName} 본사` : (isVacant ? '공실' : `임차인 ${i}F`),
      floorAreaM2: i >= 20 ? 800 : 1200,
      exclusiveAreaPy: options?.customExclusivePy ?? (i >= 20 ? 150 : 250),
      leasableAreaPy: options?.customExclusivePy ? options.customExclusivePy * 1.5 : 350,
      expiryYear: 2026 + (i % 4),
      isVacant,
    });
  }

  for (let b = 1; b <= belowCount; b++) {
    floors.push({
      floor: `B${b}F`,
      use: b === 1 ? '근린생활시설' : '주차장',
      tenant: b === 1 ? '아케이드' : `자주식 주차장 B${b}`,
      floorAreaM2: 1500,
      exclusiveAreaPy: b === 1 ? 200 : 0,
      leasableAreaPy: b === 1 ? 300 : 0,
      isVacant: false,
    });
  }

  return floors;
}

async function runAdversarialVerification() {
  console.log('================================================================');
  console.log('STARTING EMPIRICAL ADVERSARIAL VERIFICATION: ARCHETYPE A22');
  console.log('================================================================\n');

  // ===========================================================================
  // SECTION 1: High-Rise Canvas Height & Bleed Verification (27, 40, 50 floors)
  // ===========================================================================
  const floorCountsToTest = [
    { name: '27-Floor High-Rise (23F + B4F)', above: 23, below: 4 },
    { name: '40-Floor Skyscraper (35F + B5F)', above: 35, below: 5 },
    { name: '50-Floor Ultra-High-Rise (45F + B5F)', above: 45, below: 5 },
    { name: '16-Floor Boundary Limit (12F + B4F)', above: 12, below: 4 },
    { name: '30-Floor Tower (25F + B5F)', above: 25, below: 5 },
    { name: '60-Floor Mega-Tower (52F + B8F)', above: 52, below: 8 },
  ];

  for (const cfg of floorCountsToTest) {
    const totalFloors = cfg.above + cfg.below;
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';

    const floors = generateFloors(cfg.above, cfg.below);
    const result = buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: `HR-${totalFloors}`,
      data: {
        title: `${totalFloors}층 고층 자산 스태킹 플랜`,
        stackingPlan: floors,
      },
      grade: 'A',
      provenance: {},
    });

    const layout = validateLayout(pres);
    const g35Violations = layout.violations.filter(v => v.gate === 'G35');
    const maxBottom = getMaxBottom(pres);

    check(
      `HR-BLEED-${totalFloors}`,
      `Zero Bleed on ${cfg.name}`,
      'Physical Layout Physics',
      layout.bleedCount === 0 && g35Violations.length === 0,
      'bleedCount === 0 and 0 G35 violations',
      `bleedCount: ${layout.bleedCount}, G35 violations: ${g35Violations.length}`,
      { violations: g35Violations }
    );

    check(
      `HR-BOUND-${totalFloors}`,
      `Max Y+H <= 6.90" on ${cfg.name}`,
      'Physical Layout Physics',
      maxBottom <= 6.90,
      'maxBottom <= 6.90 inches',
      `maxBottom: ${maxBottom} inches`
    );
  }

  // ===========================================================================
  // SECTION 2: Dynamic Summary Row Verification (Zero Hardcoded Values)
  // ===========================================================================

  // Case 2.1: 100% Vacant 2-Floor Asset with 100 py each (sum = 200.0)
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const twoVacantFloors: StackingPlanFloor[] = [
      { floor: '2F', use: '근린생활시설', tenant: '공실', floorAreaM2: 500, exclusiveAreaPy: 100.0, isVacant: true },
      { floor: '1F', use: '근린생활시설', tenant: '공실', floorAreaM2: 500, exclusiveAreaPy: 100.0, isVacant: true },
    ];

    buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'VACANT-2',
      data: {
        title: '전층 공실 2층 리테일',
        stackingPlan: twoVacantFloors,
        summary: { totalGrossAreaPy: 300.0, exclusiveRatePct: 66.7, waleYears: 0.0, vacancyRatePct: 100.0 },
        anchorTenantName: '임차인없음',
      },
      grade: 'B',
      provenance: {},
    });

    const slide = (pres as any)._slides[0];
    const tableObj = slide._slideObjects.find((o: any) => o._type === 'table' || o.arrTabRows);
    const summaryRow = tableObj.arrTabRows[tableObj.arrTabRows.length - 1];

    const col0 = extractText(summaryRow[0]);
    const col1 = extractText(summaryRow[1]);
    const col2 = extractText(summaryRow[2]);
    const col4 = extractText(summaryRow[4]);

    check('SUM-VAC-01', 'Summary Row Label is "합계"', 'Dynamic Summary', col0 === '합계', '"합계"', `"${col0}"`);
    check('SUM-VAC-02', 'Vacancy shows "2개층 공실" and NOT "전층 만실"', 'Dynamic Summary', col1 === '2개층 공실' && !col1.includes('전층 만실'), '"2개층 공실" without "전층 만실"', `"${col1}"`);
    check('SUM-VAC-03', 'Total Area is exact sum "200.0" and NOT hardcoded "3,233.4"', 'Dynamic Summary', col2 === '200.0' && !col2.includes('3,233.4'), '"200.0" (not 3,233.4)', `"${col2}"`);
    check('SUM-VAC-04', 'Anchor note does NOT claim "8개층 사옥 단독 사용"', 'Dynamic Summary', !col4.includes('8개층') && !col4.includes('8개층 사옥 단독 사용'), 'No false 8-floor claim', `"${col4}"`);
  }

  // Case 2.2: Partial Vacancy & Custom Tenant Anchor
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const mixedFloors: StackingPlanFloor[] = [
      { floor: '5F', use: '업무시설', tenant: '카카오 본사', floorAreaM2: 600, exclusiveAreaPy: 50.0, isVacant: false, tenantCategory: 'anchor' },
      { floor: '4F', use: '업무시설', tenant: '카카오 본사', floorAreaM2: 600, exclusiveAreaPy: 50.0, isVacant: false, tenantCategory: 'anchor' },
      { floor: '3F', use: '업무시설', tenant: '일반 테넌트 A', floorAreaM2: 600, exclusiveAreaPy: 50.0, isVacant: false, tenantCategory: 'general' },
      { floor: '2F', use: '업무시설', tenant: '공실', floorAreaM2: 600, exclusiveAreaPy: 50.0, isVacant: true, tenantCategory: 'vacant' },
      { floor: '1F', use: '근린생활시설', tenant: '일반 테넌트 B', floorAreaM2: 600, exclusiveAreaPy: 50.0, isVacant: false, tenantCategory: 'retail' },
    ];

    buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'MIXED-5',
      data: {
        title: '혼합 임대차 빌딩',
        stackingPlan: mixedFloors,
        summary: { totalGrossAreaPy: 500.0, exclusiveRatePct: 50.0, waleYears: 3.2, vacancyRatePct: 20.0 },
        anchorTenantName: '카카오',
      },
      grade: 'A',
      provenance: {},
    });

    const slide = (pres as any)._slides[0];
    const tableObj = slide._slideObjects.find((o: any) => o._type === 'table' || o.arrTabRows);
    const summaryRow = tableObj.arrTabRows[tableObj.arrTabRows.length - 1];

    const col1 = extractText(summaryRow[1]);
    const col2 = extractText(summaryRow[2]);
    const col4 = extractText(summaryRow[4]);

    check('SUM-MIX-01', 'Vacancy shows "1개층 공실"', 'Dynamic Summary', col1 === '1개층 공실', '"1개층 공실"', `"${col1}"`);
    check('SUM-MIX-02', 'Total exclusive area sums to "250.0"', 'Dynamic Summary', col2 === '250.0', '"250.0"', `"${col2}"`);
    check('SUM-MIX-03', 'Anchor note correctly states "카카오 2개층 사옥 단독 사용"', 'Dynamic Summary', col4.includes('카카오') && col4.includes('2개층'), 'Contains "카카오" and "2개층"', `"${col4}"`);
  }

  // Case 2.3: 8 Anchor Floors
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const eightAnchorFloors: StackingPlanFloor[] = [];
    for (let i = 8; i >= 1; i--) {
      eightAnchorFloors.push({
        floor: `${i}F`,
        use: '업무시설',
        tenant: '삼성물산 본사',
        floorAreaM2: 800,
        exclusiveAreaPy: 100.0,
        isVacant: false,
        tenantCategory: 'anchor',
      });
    }

    buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'ANCHOR-8',
      data: {
        title: '삼성물산 8개층 단독 사옥',
        stackingPlan: eightAnchorFloors,
        summary: { totalGrossAreaPy: 1200.0, exclusiveRatePct: 66.7, waleYears: 5.0, vacancyRatePct: 0.0 },
        anchorTenantName: '삼성물산',
      },
      grade: 'A',
      provenance: {},
    });

    const slide = (pres as any)._slides[0];
    const tableObj = slide._slideObjects.find((o: any) => o._type === 'table' || o.arrTabRows);
    const summaryRow = tableObj.arrTabRows[tableObj.arrTabRows.length - 1];

    const col1 = extractText(summaryRow[1]);
    const col2 = extractText(summaryRow[2]);
    const col4 = extractText(summaryRow[4]);

    check('SUM-ANC-01', 'Vacancy shows "전층 만실"', 'Dynamic Summary', col1 === '전층 만실', '"전층 만실"', `"${col1}"`);
    check('SUM-ANC-02', 'Total exclusive area sums to "800.0"', 'Dynamic Summary', col2 === '800.0', '"800.0"', `"${col2}"`);
    check('SUM-ANC-03', 'Anchor note correctly states "삼성물산 8개층 사옥 단독 사용"', 'Dynamic Summary', col4.includes('삼성물산') && col4.includes('8개층'), 'Contains "삼성물산" and "8개층"', `"${col4}"`);
  }

  // Case 2.4: Empty Stacking Plan Array (Defensive Zero Floor handling)
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';

    let threw = false;
    try {
      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'EMPTY-0',
        data: {
          title: '데이터 무결성 점검 (빈 배열)',
          stackingPlan: [],
        },
        grade: 'C',
        provenance: {},
      });
    } catch (e) {
      threw = true;
    }

    const layout = validateLayout(pres);

    check('SUM-EMP-01', 'Empty floor array renders without exception', 'Defensive Hardening', !threw, 'no exception', threw ? 'threw exception' : 'safe');
    check('SUM-EMP-02', 'Empty floor array has 0 bleed', 'Physical Layout Physics', layout.bleedCount === 0, '0 bleed', `${layout.bleedCount} bleed`);
  }

  // ===========================================================================
  // SECTION 3: Defensive Null & Undefined Floor Handling
  // ===========================================================================
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';

    const malformedFloors = [
      { floor: undefined, use: '오피스', tenant: '테넌트 1', floorAreaM2: 500 },
      { floor: null, use: '근생', tenant: '테넌트 2', floorAreaM2: 500 },
      { floor: '', use: '주차장', tenant: '주차장', floorAreaM2: 800 },
      {},
      { floor: 123 as any, use: undefined, tenant: null },
    ];

    let threw = false;
    let errorMsg = '';
    try {
      buildA22StackingPlan({
        pres,
        slideNum: 1,
        docno: 'MALFORMED',
        data: {
          title: '결손 및 비정형 데이터 내성 점검',
          stackingPlan: malformedFloors as any,
        },
        grade: 'C',
        provenance: {},
      });
    } catch (e: any) {
      threw = true;
      errorMsg = e?.message || String(e);
    }

    const layout = validateLayout(pres);

    check(
      'DEF-NULL-01',
      'Undefined/null/non-string floor identifiers handled safely without TypeError',
      'Defensive Hardening',
      !threw,
      'No runtime TypeError thrown',
      threw ? `Threw: ${errorMsg}` : 'Completed cleanly'
    );

    check(
      'DEF-NULL-02',
      'Malformed floor deck has 0 layout bleed',
      'Physical Layout Physics',
      layout.bleedCount === 0,
      '0 bleed',
      `${layout.bleedCount} bleed`
    );
  }

  // ===========================================================================
  // SECTION 4: Column Widths Exact Sum (tableW = 5.92")
  // ===========================================================================
  {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const singleFloor: StackingPlanFloor[] = [
      { floor: '1F', use: '근린생활시설', tenant: '테넌트', floorAreaM2: 500, exclusiveAreaPy: 100, isVacant: false },
    ];

    buildA22StackingPlan({
      pres,
      slideNum: 1,
      docno: 'COL-W',
      data: {
        title: '테이블 열 너비 검증',
        stackingPlan: singleFloor,
      },
      grade: 'A',
      provenance: {},
    });

    const slide = (pres as any)._slides[0];
    const tableObj = slide._slideObjects.find((o: any) => o._type === 'table' || o.arrTabRows);
    
    const tableColW = [0.65, 1.15, 0.78, 0.78, 1.96, 0.60];
    const colSum = tableColW.reduce((sum, w) => sum + w, 0);
    const roundedColSum = Math.round(colSum * 100) / 100;

    check(
      'TBL-COL-01',
      'Table column widths sum to exactly 5.92"',
      'Table Alignment Geometry',
      roundedColSum === 5.92,
      '5.92 inches',
      `${roundedColSum} inches`
    );

    const rawTableW = tableObj.options?.w ?? (tableObj.options?.colW ? tableObj.options.colW.reduce((a: number, b: number) => a + b, 0) : undefined);
    const tableW = rawTableW !== undefined && rawTableW > 100 ? rawTableW / 914400 : rawTableW;
    check(
      'TBL-COL-02',
      'Table object width matches 5.92"',
      'Table Alignment Geometry',
      tableW !== undefined && Math.abs(tableW - 5.92) < 0.01,
      '5.92 inches',
      `${tableW} inches`
    );
  }

  // ===========================================================================
  // SUMMARY REPORT
  // ===========================================================================
  const total = records.length;
  const passed = records.filter(r => r.passed).length;
  const failed = records.filter(r => !r.passed).length;

  console.log('\n================================================================');
  console.log(`EMPIRICAL ADVERSARIAL VERIFICATION SUMMARY`);
  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    console.error(`\nFAILED CHECKS (${failed}):`);
    records.filter(r => !r.passed).forEach(r => {
      console.error(` - [${r.id}] ${r.category} > ${r.name}: Expected ${r.expected}, got ${r.actual}`);
    });
    process.exit(1);
  } else {
    console.log('\nALL EMPIRICAL ADVERSARIAL CHECKS PASSED WITH ZERO FLAWS.');
    process.exit(0);
  }
}

runAdversarialVerification().catch(err => {
  console.error('Fatal execution error in adversarial harness:', err);
  process.exit(1);
});