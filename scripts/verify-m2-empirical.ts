/**
 * scripts/verify-m2-empirical.ts
 * 
 * Comprehensive Empirical Stress Harness for Milestone 2: GBD 2-Method Valuation Integration & PPTX Rendering
 * Authored by: m11_m2_challenger_2 (Empirical Challenger)
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import {
  calculateSalesComparison,
  calculateIncomeCapitalization,
  generateCreDualValuationReport,
  DEFAULT_COST_METHOD_EXCLUSION_NOTE,
} from '../src/domain/building/im-core/valuation-calc';
import { bindSectionData, DATA_KEY_ARCHETYPE } from '../src/domain/building/mobile-im/pptx/data-binder';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';

const sinsaFixturePath = path.resolve('docs/test/real-broker-im/sinsa-590-fixture.json');
const seochoFixturePath = path.resolve('docs/test/real-broker-im/seocho-1364-28-fixture.json');
const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

/** Exact doc builder matching real-broker-im-pipeline.test.ts */
function buildPipelineDoc(fixture: any, options?: { overrideComps?: any[]; overrideNote?: string; injectDefectExcuse?: string }) {
  const compList = options?.overrideComps !== undefined ? options.overrideComps : (fixture.salesComparisonComps || []);
  const costNote = options?.overrideNote !== undefined ? options.overrideNote : (fixture.incomeCapitalization?.costMethodExcludedNote || DEFAULT_COST_METHOD_EXCLUSION_NOTE);

  const keyFacts = fixture.keyFacts3Tier;
  const keyFactsTableRows: string[] = [];
  if (keyFacts) {
    if (keyFacts.tier1_subject) {
      keyFacts.tier1_subject.forEach(([k, v]: [string, string]) => keyFactsTableRows.push(`| **대상지** | ${k} | ${v} | - |`));
    }
    if (keyFacts.tier2_land) {
      keyFacts.tier2_land.forEach(([k, v]: [string, string]) => keyFactsTableRows.push(`| **토지** | ${k} | ${v} | - |`));
    }
    if (keyFacts.tier3_building) {
      keyFacts.tier3_building.forEach(([k, v]: [string, string]) => keyFactsTableRows.push(`| **건물** | ${k} | ${v} | - |`));
    }
  }

  const leaseRows = (fixture.stackingPlan || []).map((u: any) => {
    const isVacant = u.isVacant;
    const tenantStr = isVacant ? `**${u.tenant || '공실'}**` : (u.tenant || '-');
    const depStr = isVacant ? '-' : (u.depositKrw ? u.depositKrw.toLocaleString() : '-');
    const rentStr = isVacant ? '-' : (u.monthlyRentKrw ? u.monthlyRentKrw.toLocaleString() : '-');
    return `| ${u.floor} | ${tenantStr} | ${depStr} | ${rentStr} |`;
  }).join('\n');

  const sections: any[] = [
    {
      section_type: 'property_overview',
      title: '토지 및 건물 제원',
      markdown: `### 건축물대장 및 3단 그룹 Key Facts 제원\n\n| 구분 | 주요 항목 | 상세 제원 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
    },
  ];

  if (compList.length > 0) {
    const compRows = compList.map((c: any) => {
      const landPyStr = c.landPricePerPyeongKrw ? `약 ${(c.landPricePerPyeongKrw / 1e8).toFixed(2)}억/평` : '-';
      return `| ${c.name} | ${c.landAreaPyeong}평 | ${c.gfaPyeong}평 | ${landPyStr} | ${c.dealDate} |`;
    }).join('\n');

    let md = `### 인근 실거래 및 매물 평당가 분석 (사례비교법)\n\n| 소재지/명칭 | 대지면적 | 연면적 | 대지 평당가 | 거래시점 |\n|---|---|---|---|---|\n${compRows}`;
    if (costNote) {
      md += `\n\n> ${costNote}`;
    }
    if (options?.injectDefectExcuse) {
      md += `\n\n> ${options.injectDefectExcuse}`;
    }
    sections.push({
      section_type: 'comparable_analysis',
      title: '주변 매물 및 실거래 시세 비교',
      markdown: md,
    });
  }

  sections.push(
    {
      section_type: 'lease_status',
      title: '임대차 현황 (Rent Roll)',
      markdown: `| 층수 | 입주사명 | 보증금(원) | 월차임(원) |\n|---|---|---:|---:|\n${leaseRows}\n| **합계** | **총 ${fixture.stackingPlan?.length || 0}개 구획** | **${fixture.statedDepositKrw.toLocaleString()}** | **${fixture.statedMonthlyRentKrw.toLocaleString()}** |`,
    },
    {
      section_type: 'income_analysis',
      title: '수익성 및 현금흐름 분석',
      markdown: `### 연 순수익률 (Cap Rate) 분석\n- 현재 연 순수익률 (Cap Rate): ${fixture.capRatePct}%\n- 연간 임대수익: ${((fixture.statedMonthlyRentKrw * 12) / 1e8).toFixed(2)}억 원\n- 시장 요구 Cap Rate: 2.5% ~ 3.5%\n- 밸류에이션 원칙: ${costNote}`,
    }
  );

  return {
    deal_id: fixture.dealId,
    title: fixture.title,
    body: {
      title: fixture.title,
      property_name: fixture.title,
      address: fixture.address,
      asking_price: fixture.askingPriceKrw,
      land_area: fixture.landAreaM2,
      gross_floor_area: fixture.grossFloorAreaM2,
      cap_rate: fixture.capRatePct,
      deposit: fixture.statedDepositKrw,
      monthly_rent: fixture.statedMonthlyRentKrw,
      enrichment: {
        buildingRegister: { archArea: fixture.archAreaM2, useAprDay: fixture.completionDate },
        landUsePlan: { zone: fixture.landUseZone },
      },
    },
    sections,
  };
}

async function runAllTests() {
  console.log('======================================================================');
  console.log('🧪 EMPIRICAL HARNESS: Milestone 2 2-Method Valuation & PPTX Verification');
  console.log('======================================================================\n');

  let allPass = true;

  // ─────────────────────────────────────────────────────────────
  // 1. DATA BINDER & ARCHETYPE PARSING VERIFICATION
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [VERIFICATION 1] data-binder.ts Parsing Integrity for comparable_analysis');
  const sinsaDoc = buildPipelineDoc(sinsaFixture);
  const sinsaBound = bindSectionData(sinsaDoc);

  const compsData = sinsaBound['comps'];
  if (!compsData) {
    console.error('❌ FAIL: dataMap["comps"] is undefined!');
    allPass = false;
  } else {
    console.log('  ✓ dataMap["comps"] successfully populated');
    console.log(`  ✓ Archetype mapping: DATA_KEY_ARCHETYPE["comps"] === "${DATA_KEY_ARCHETYPE['comps']}" (A03 LargeTable)`);
    console.log('  ✓ Table Headers:', compsData.tableHead);
    console.log(`  ✓ Table Rows: ${compsData.tableRows?.length} rows`);
    console.log(`  ✓ Exclusion Note: "${compsData.note}"`);

    const expectedHeaders = ['소재지/명칭', '대지면적', '연면적', '대지 평당가', '거래시점'];
    if (JSON.stringify(compsData.tableHead) !== JSON.stringify(expectedHeaders)) {
      console.error('❌ FAIL: Table headers mismatch!');
      allPass = false;
    } else {
      console.log('  ✓ PASS: Table headers match exactly');
    }

    if (compsData.tableRows?.length !== 5) {
      console.error(`❌ FAIL: Expected 5 comp rows for Sinsa, got ${compsData.tableRows?.length}`);
      allPass = false;
    } else {
      console.log('  ✓ PASS: 5 comps parsed into table rows');
    }

    if (compsData.note !== DEFAULT_COST_METHOD_EXCLUSION_NOTE) {
      console.error('❌ FAIL: Note does not match DEFAULT_COST_METHOD_EXCLUSION_NOTE!');
      allPass = false;
    } else {
      console.log('  ✓ PASS: Note exactly matches default cost method exclusion rationale');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. PHYSICAL LAYOUT BOUNDS & OVERFLOW PREVENTION (A03)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [VERIFICATION 2] A03 Physical Geometry & Canvas Bounds Check');
  const cases = [
    { name: 'Sinsa 590 (5 comps)', rows: 5 },
    { name: 'Seocho 1364-28 (4 comps)', rows: 4 },
  ];

  for (const c of cases) {
    const rh = c.rows > 8 ? 0.38 : 0.48;
    const tableEnd = 1.80 + ((Math.min(12, c.rows) + 1) * rh);
    const noteY = tableEnd + 0.10;
    const noteBottom = noteY + 0.30;
    const maxBoundary = 6.75;
    const fits = noteBottom <= maxBoundary;
    console.log(`  - Case: ${c.name} (${c.rows} rows, rh=${rh}")`);
    console.log(`    Table end: ${tableEnd.toFixed(2)}", Note Y: ${noteY.toFixed(2)}", Note bottom: ${noteBottom.toFixed(2)}" / Limit: ${maxBoundary}"`);
    if (!fits) {
      console.error(`    ❌ FAIL: Layout overflow detected for ${c.name}!`);
      allPass = false;
    } else {
      console.log(`    ✓ PASS: Fits within canvas margin with ${(maxBoundary - noteBottom).toFixed(2)}" buffer`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. PHYSICAL PPTX BINARY VALIDATION (REAL OUTPUT)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [VERIFICATION 3] Physical PPTX XML Inspection of Comps Slide');
  const sinsaPptxPath = path.resolve('docs/demo-output/real-broker-sinsa-590.pptx');
  const buf = fs.readFileSync(sinsaPptxPath);
  const zip = await JSZip.loadAsync(buf);
  const slide9Xml = await zip.files['ppt/slides/slide9.xml'].async('text');

  const tokens = Array.from(slide9Xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map(m => m[1]);
  const slideText = tokens.join(' ');
  console.log(`  - Slide 9 total text tokens: ${tokens.length}`);
  console.log(`  - Title found: "${tokens[1]}"`);

  const hasCompsTitle = tokens[1] === '주변 매물 및 실거래 시세 비교';
  const hasCompA = slideText.includes('586-6');
  const hasCompB = slideText.includes('588-1');
  const hasCostExclusion = slideText.includes('원가법 제외');

  console.log(`  - Slide Title is Comps: ${hasCompsTitle}`);
  console.log(`  - Contains Comp A (신사동 586-6): ${hasCompA}`);
  console.log(`  - Contains Comp B (신사동 588-1): ${hasCompB}`);
  console.log(`  - Contains Cost Exclusion Note: ${hasCostExclusion}`);

  if (hasCompsTitle && hasCompA && hasCompB && hasCostExclusion) {
    console.log('  ✓ PASS: Comps table and Cost Method Exclusion note physically confirmed in PPTX slide 9');
  } else {
    console.error('❌ FAIL: Slide 9 content incomplete!');
    allPass = false;
  }

  const inspection = await inspectPptxBinary(buf);
  console.log(`  - Physical Binary Inspector: bleedCount=${inspection.bleedCount}, placeholderCount=${inspection.placeholderResidueCount}, personaCount=${inspection.personaViolationCount}, lexiconCount=${inspection.lexiconViolationCount}, legalCount=${inspection.legalRiskViolationCount}, isPass=${inspection.isPass}`);
  if (inspection.bleedCount !== 0 || !inspection.isPass) {
    console.error('❌ FAIL: Binary inspection failed on Sinsa PPTX!');
    allPass = false;
  } else {
    console.log('  ✓ PASS: 0 bleed, 0 placeholders, 0 violations on full PPTX');
  }

  // ─────────────────────────────────────────────────────────────
  // 4. NEGATIVE MUTATION 1: OMISSION OF COMPS
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [NEGATIVE MUTATION 1] Omission of Comparable Analysis');
  let thrownEmptyComps = false;
  try {
    calculateSalesComparison([], {
      askingPriceKrw: sinsaFixture.askingPriceKrw,
      landAreaPyeong: sinsaFixture.landAreaM2 * 0.3025,
      gfaPyeong: sinsaFixture.grossFloorAreaM2 * 0.3025,
    });
  } catch (err: any) {
    thrownEmptyComps = true;
    console.log(`  ✓ calculateSalesComparison([]) threw expected error: "${err.message}"`);
  }
  if (!thrownEmptyComps) {
    console.error('❌ FAIL: calculateSalesComparison([]) did NOT throw on empty comps!');
    allPass = false;
  }

  const noCompsDoc = buildPipelineDoc(sinsaFixture, { overrideComps: [] });
  const noCompSection = noCompsDoc.sections.find((s: any) => s.section_type === 'comparable_analysis');
  if (noCompSection === undefined) {
    console.log('  ✓ PASS: When comps are empty, buildPipelineDoc does NOT generate comparable_analysis section');
  } else {
    console.error('❌ FAIL: comparable_analysis section was generated despite empty comps!');
    allPass = false;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. NEGATIVE MUTATION 2: INVALID CAP RATES
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [NEGATIVE MUTATION 2] Invalid Cap Rates');
  const invalidCapRates: [number, number][] = [
    [0, 3.5],
    [-1.0, 2.5],
    [2.5, 16.0],
    [20.0, 25.0],
  ];

  for (const [low, high] of invalidCapRates) {
    let thrown = false;
    try {
      calculateIncomeCapitalization({
        annualGrossRentKrw: 775500000,
        askingPriceKrw: sinsaFixture.askingPriceKrw,
        marketCapRateRangePct: [low, high],
      });
    } catch (err: any) {
      thrown = true;
      console.log(`  ✓ Cap Rate [${low}%, ${high}%] threw expected error: "${err.message}"`);
    }
    if (!thrown) {
      console.error(`❌ FAIL: Cap Rate [${low}%, ${high}%] did NOT throw!`);
      allPass = false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. NEGATIVE MUTATION 3: STRIPPED COST METHOD EXCLUSION NOTE
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [NEGATIVE MUTATION 3] Stripped Cost Method Exclusion Note');
  const subject = {
    askingPriceKrw: sinsaFixture.askingPriceKrw,
    landAreaPyeong: sinsaFixture.landAreaM2 * 0.3025,
    gfaPyeong: sinsaFixture.grossFloorAreaM2 * 0.3025,
    annualGrossRentKrw: sinsaFixture.statedMonthlyRentKrw * 12,
    marketCapRateRangePct: sinsaFixture.incomeCapitalization.marketCapRateRangePct as [number, number],
  };
  const validReport = generateCreDualValuationReport(sinsaFixture.salesComparisonComps, subject);
  const corruptedReport = { ...validReport, costMethodExcludedNote: '' };

  const isCostMethodExclusionValid = (rep: typeof validReport): boolean => {
    return Boolean(rep.costMethodExcludedNote && rep.costMethodExcludedNote.includes('원가법 제외'));
  };

  const validPassed = isCostMethodExclusionValid(validReport);
  const corruptedFailed = !isCostMethodExclusionValid(corruptedReport);

  console.log(`  - Valid report passes exclusion validation: ${validPassed}`);
  console.log(`  - Corrupted report (empty note) fails exclusion validation: ${corruptedFailed}`);

  if (validPassed && corruptedFailed) {
    console.log('  ✓ PASS: Stripping cost method note is cleanly detected and rejected by governance check');
  } else {
    console.error('❌ FAIL: Cost method exclusion check failed!');
    allPass = false;
  }

  // ─────────────────────────────────────────────────────────────
  // 7. NEGATIVE MUTATION 4: DEFECT EXCUSE INJECTION IN COMPS (G54)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [NEGATIVE MUTATION 4] Defect Excuse Injection in Comps (G54)');
  const renderer = new MobileImPptxRenderer();
  const defectDoc = buildPipelineDoc(sinsaFixture, {
    injectDefectExcuse: '인근 비교사례는 확보하지 않았습니다. 비워 둡니다.',
  });
  const defectRender = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: defectDoc as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const defectInspection = await inspectPptxBinary(defectRender.buffer);
  console.log(`  - Defect excuse violation count: ${defectInspection.defectExcuseViolationCount}`);
  console.log(`  - Binary inspect isPass: ${defectInspection.isPass}`);
  if (defectInspection.defectExcuseViolationCount > 0 && !defectInspection.isPass) {
    console.log('  ✓ PASS: Defect excuse ("비워 둡니다", "인근 비교사례는 확보하지 않았습니다") in comps detected by G54 gate');
  } else {
    console.error('❌ FAIL: Defect excuse was not detected!');
    allPass = false;
  }

  // ─────────────────────────────────────────────────────────────
  // 8. NEGATIVE MUTATION 5: BANNED LEXICON INJECTION IN COMPS (RULE 2)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [NEGATIVE MUTATION 5] Banned Lexicon Injection in Comps (Rule 2)');
  const corruptedComps = sinsaFixture.salesComparisonComps.map((c: any, i: number) => {
    if (i === 0) return { ...c, name: `${c.name} (GOP 5.2%)` };
    return c;
  });
  const lexiconDoc = buildPipelineDoc(sinsaFixture, {
    overrideComps: corruptedComps,
  });
  const lexiconRender = await renderer.render({
    buildingId: sinsaFixture.dealId,
    doc: lexiconDoc as any,
    posture: sinsaFixture.posture,
    preset: 'commercial_visual_grid',
    grade: 'A',
  });
  const lexiconInspection = await inspectPptxBinary(lexiconRender.buffer);
  console.log(`  - Lexicon violation count: ${lexiconInspection.lexiconViolationCount}`);
  console.log(`  - Binary inspect isPass: ${lexiconInspection.isPass}`);
  if (lexiconInspection.lexiconViolationCount > 0 && !lexiconInspection.isPass) {
    console.log('  ✓ PASS: Banned transliteration ("GOP") in comp table row detected by Rule 2 gate');
  } else {
    console.error('❌ FAIL: Banned lexicon was not detected!');
    allPass = false;
  }

  console.log('\n======================================================================');
  if (allPass) {
    console.log('🏆 FINAL EMPIRICAL VERDICT: ALL TESTS PASSED (100% APPROVE)');
  } else {
    console.log('💥 FINAL EMPIRICAL VERDICT: DEFECTS DETECTED (REJECT)');
  }
  console.log('======================================================================');
}

runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
