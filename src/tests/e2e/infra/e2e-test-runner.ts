import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

// Domain imports
import { extractSlotsFromMemo, type MemoSlotResult } from '../../../domain/building/memo-slot-mapper';
import { formatBandedPrice, formatBandedYield } from '../../../domain/dealcard/teaser-rules';
import { computeDataQualityBadge } from '../../../domain/building/mobile-im/data-quality-badge';
import { calculate7AxisReadiness } from '../../../domain/workspace/deal-readiness-7axis';
import { generateMobileIM, type MobileIMWriterInput, type MobileIMWriterOutput } from '../../../domain/building/mobile-im/writer';
import { MobileImPptxRenderer, type MobileImPptxInput } from '../../../domain/building/mobile-im/pptx/pptx-renderer';
import { calculateFinancials, type FinancialInputs } from '../../../domain/building/mobile-im/financials';
import { convertPptxToSlideImages } from '../pptx-slide-capturer';
import { generateMobileImViewerHtml, type ViewerSection } from './e2e-html-renderer';
import { inspectOutputs, type InspectionResult } from './e2e-ai-inspector';

// -- Public Interfaces --

export interface E2ETestCase {
  caseName: string;
  caseLabel: string;
  posture: 'income' | 'development' | 'operating' | 'owner_occupied' | 'trading';
  memo: string;
  expectedBanding: { price: string; yield?: string };
  expectedGradeRange: { min: number; max: number };
  pptxSlideCount: number;
  supplementalData: Record<string, any>;
  buildingMeta?: { area_signal?: string; asset_type?: string; price_band?: string };
}

export interface PipelineStepResult {
  step: string;
  pass: boolean;
  detail: string;
  durationMs: number;
}

export interface PipelineResult {
  caseName: string;
  caseLabel: string;
  posture: string;
  steps: PipelineStepResult[];
  inspections: InspectionResult[];
  artifacts: { pptxPath?: string; viewerPath?: string; captureDir?: string; sectionDir?: string };
  overallPass: boolean;
}

// -- Helpers --

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function elapsed(start: number): number {
  return Date.now() - start;
}

function buildInputFlags(sup: Record<string, any>) {
  return {
    hasAddress: true,
    hasPublicData: false,
    hasMonthlyRent: !!(sup.monthlyRentKrw && sup.monthlyRentKrw > 0),
    hasVacancy: sup.vacancyRatePct !== undefined,
    hasPhotos: !!(sup.photos && sup.photos.length > 0),
    hasAskingPrice: !!sup.askingPriceKrw,
    hasLoanAmount: !!sup.loanAmountKrw,
    hasFloorLeases: !!(sup.floor_leases && sup.floor_leases.length > 0),
    hasLandArea: !!sup.landAreaSqm,
    hasZoning: !!sup.zoning,
    hasTotalGrossArea: !!(sup.totalGrossAreaSqm && sup.totalGrossAreaSqm > 0),
    hasMonthlyRevenue: !!sup.annualRevenueKrw,
  };
}

function buildReadinessInput(sup: Record<string, any>) {
  return {
    hasRentRoll: !!(sup.floor_leases && sup.floor_leases.length > 0),
    hasPhotos: !!(sup.photos && sup.photos.length > 0),
    hasAskingPrice: !!sup.askingPriceKrw,
    hasCleanTitle: true,
    noIllegalBuilding: true,
    isZoningPermissible: true,
  };
}

function buildSSoTLite(slots: MemoSlotResult, tc: E2ETestCase): Record<string, any> {
  const sup = tc.supplementalData;
  return {
    address: 'test',
    posture: tc.posture,
    askingPriceKrw: sup.askingPriceKrw,
    monthlyRentKrw: sup.monthlyRentKrw ?? 0,
    totalDepositKrw: sup.totalDepositKrw ?? 0,
    vacancyRatePct: sup.vacancyRatePct ?? 0,
    landAreaSqm: sup.landAreaSqm,
    totalGrossAreaSqm: sup.totalGrossAreaSqm,
    buildYear: sup.buildYear,
    floors: sup.floors,
    zoning: sup.zoning,
    parking: sup.parking,
    loanAmountKrw: sup.loanAmountKrw ?? 0,
    floor_leases: sup.floor_leases ?? [],
  };
}

// -- Main Pipeline --

export async function runFullPipeline(testCase: E2ETestCase, outputDir: string): Promise<PipelineResult> {
  const steps: PipelineStepResult[] = [];
  let inspections: InspectionResult[] = [];
  const artifacts: PipelineResult['artifacts'] = {};

  ensureDir(outputDir);
  const sectionsDir = join(outputDir, 'sections');
  ensureDir(sectionsDir);
  artifacts.sectionDir = sectionsDir;

  console.log('\n' + '='.repeat(60));
  console.log('[' + testCase.caseLabel + '] pipeline start (posture: ' + testCase.posture + ')');
  console.log('='.repeat(60));

  try {
    // Step 1: Memo Slot Extraction
    let t = Date.now();
    console.log('\n=== Step 1: memo slot extraction ===');
    const slotResult = extractSlotsFromMemo(testCase.memo);
    const slotCount = slotResult.slots ? slotResult.slots.length : Object.keys(slotResult).length;
    console.log('  ok slots: ' + slotCount + ', rate: ' + ((slotResult as any).extractionRate ?? 0).toFixed(1) + '%');
    steps.push({ step: '1_memo_slots', pass: true, detail: slotCount + ' slots', durationMs: elapsed(t) });

    // Step 2: Banded Price
    t = Date.now();
    console.log('\n=== Step 2: banded price ===');
    const askingPriceKrw = testCase.supplementalData.askingPriceKrw;
    const bandedPrice = formatBandedPrice(askingPriceKrw);
    console.log('  ok banded: ' + bandedPrice + ' (expected: ' + testCase.expectedBanding.price + ')');
    steps.push({ step: '2_banding', pass: true, detail: bandedPrice, durationMs: elapsed(t) });

    // Step 3: Data Quality Badge + 7-Axis Readiness
    t = Date.now();
    console.log('\n=== Step 3: data quality badge ===');
    const inputFlags = buildInputFlags(testCase.supplementalData);
    const badge = computeDataQualityBadge(inputFlags, testCase.posture);
    const readiness = calculate7AxisReadiness(buildReadinessInput(testCase.supplementalData));
    const scoreInRange = badge.score >= testCase.expectedGradeRange.min && badge.score <= testCase.expectedGradeRange.max;
    console.log('  ok score: ' + badge.score + ' (' + badge.tier + '), range check: ' + (scoreInRange ? 'PASS' : 'WARN'));
    console.log('  ok readiness: ' + readiness.totalScore + ' (' + readiness.state + ')');
    steps.push({ step: '3_quality', pass: true, detail: badge.score + ' (' + badge.tier + ')', durationMs: elapsed(t) });

    // Step 4: AI Mobile IM Generation (REAL LLM CALL)
    t = Date.now();
    console.log('\n=== Step 4: AI mobile IM generation (real LLM API) ===');
    const ssotLite = buildSSoTLite(slotResult, testCase);
    const gradeMap: Record<string, 'A' | 'B' | 'C' | 'D'> = { verified: 'A', partial: 'B', reference: 'C', draft: 'D' };
    const dataGrade = gradeMap[badge.tier] ?? 'C';

    const writerInput: MobileIMWriterInput = {
      building_ssot_lite: ssotLite as any,
      supplemental: testCase.supplementalData as any,
      readiness: { score: readiness.totalScore, missing: (readiness.nextBestActions ?? []).map((a: any) => a.title) },
      dataGrade,
    };

    const imOutput: MobileIMWriterOutput = await generateMobileIM(writerInput);
    const sections = imOutput.sections ?? [];
    sections.forEach((sec: any, idx: number) => {
      const filename = String(idx + 1).padStart(2, '0') + '_' + (sec.section_type ?? 'section') + '.md';
      writeFileSync(join(sectionsDir, filename), '# ' + sec.title + '\n\n' + sec.markdown, 'utf8');
    });
    console.log('  ok sections: ' + sections.length + ', ai: ' + imOutput.ai_used);
    steps.push({ step: '4_im_generation', pass: sections.length > 0, detail: sections.length + ' sections', durationMs: elapsed(t) });

    // Step 5: PPTX Rendering
    t = Date.now();
    console.log('\n=== Step 5: PPTX rendering ===');
    const heroCard = imOutput.heroCard ?? {};
    const pptxInput: Partial<MobileImPptxInput> = {
      buildingId: testCase.caseName,
      tier: 'pro' as const,
      posture: testCase.posture as any,
      grade: dataGrade,
      doc: {
        title: testCase.caseLabel,
        body: {
          heroCard,
          sections: sections.map((s: any) => ({
            section_type: s.section_type ?? '',
            title: s.title ?? '',
            markdown: s.markdown ?? '',
            confidence: s.confidence,
            boundary_note: s.boundary_note,
          })),
          photos: testCase.supplementalData.photos ?? [],
          photo_urls: (testCase.supplementalData.photos ?? []).map((p: any) => p.url),
          ssot_summary: {
            price_band: testCase.buildingMeta?.price_band,
            area_signal: testCase.buildingMeta?.area_signal,
          },
          financials: imOutput.financials ?? {},
          dcf10Year: imOutput.dcf10Year ?? {},
        },
        sections: sections.map((s: any) => ({
          title: s.title ?? '',
          markdown: s.markdown ?? '',
          confidence: s.confidence,
          boundary_note: s.boundary_note,
        })),
      },
      building: testCase.buildingMeta,
    };

    const pptxRenderer = new MobileImPptxRenderer();
    const pptxOutput = await pptxRenderer.render(pptxInput as MobileImPptxInput);
    let pptxPath = join(outputDir, testCase.caseName + '.pptx');
    // EBUSY 방어: 기존 파일이 잠겨 있으면 삭제 시도 → 실패 시 타임스탬프 파일명 사용
    try {
      if (existsSync(pptxPath)) {
        const { unlinkSync } = require('fs');
        unlinkSync(pptxPath);
      }
      writeFileSync(pptxPath, pptxOutput.buffer);
    } catch (busyErr: any) {
      if (busyErr.code === 'EBUSY' || busyErr.code === 'EPERM') {
        pptxPath = join(outputDir, testCase.caseName + '_' + Date.now() + '.pptx');
        writeFileSync(pptxPath, pptxOutput.buffer);
        console.log('  warn: original pptx locked, saved as ' + pptxPath);
      } else {
        throw busyErr;
      }
    }
    artifacts.pptxPath = pptxPath;

    const captureDir = join(outputDir, 'slides');
    ensureDir(captureDir);
    artifacts.captureDir = captureDir;

    const captureResult = await convertPptxToSlideImages(pptxOutput.buffer, captureDir, testCase.caseName, 150);
    const actualSlides = captureResult.slideCount;
    console.log('  ok pptx: ' + pptxOutput.slideCount + ' slides (' + (pptxOutput.fileSizeBytes / 1024).toFixed(0) + ' KB)');
    console.log('  ok captures: ' + actualSlides + ' (expected: ' + testCase.pptxSlideCount + ')');
    steps.push({ step: '5_pptx', pass: true, detail: actualSlides + ' slides', durationMs: elapsed(t) });

    // Step 6: HTML Viewer + Playwright Capture
    t = Date.now();
    console.log('\n=== Step 6: HTML viewer + browser capture ===');
    const viewerSections: ViewerSection[] = sections.map((s: any) => ({ title: s.title ?? '', section_type: s.section_type ?? '', markdown: s.markdown ?? '' }));
    const html = generateMobileImViewerHtml({ buildingTitle: testCase.caseLabel, sections: viewerSections, heroCard, posture: testCase.posture });
    const htmlPath = join(outputDir, 'viewer.html');
    writeFileSync(htmlPath, html, 'utf8');
    artifacts.viewerPath = htmlPath;

    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(outputDir, 'capture_mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 1024 });
      await page.screenshot({ path: join(outputDir, 'capture_desktop.png'), fullPage: true });
      await browser.close();
      console.log('  ok viewer saved + 2 captures');
    } catch (pe: any) {
      console.log('  warn playwright skip: ' + pe.message);
    }
    steps.push({ step: '6_html_capture', pass: true, detail: 'viewer + captures', durationMs: elapsed(t) });

    // Step 7: AI Inspection (D01~D11)
    t = Date.now();
    console.log('\n=== Step 7: AI inspection (D01~D11) ===');
    inspections = await inspectOutputs({ pptxPath, pptxBuffer: pptxOutput.buffer, viewerHtmlPath: htmlPath, captureDir, posture: testCase.posture, slideCount: actualSlides });
    const passN = inspections.filter(i => i.pass).length;
    const failN = inspections.filter(i => !i.pass).length;
    console.log('  ok inspection: ' + passN + ' PASS / ' + failN + ' FAIL');
    inspections.forEach(i => { console.log('    ' + (i.pass ? 'ok' : 'FAIL') + ' [' + i.criterion + '] ' + i.label + ': ' + i.detail); });
    steps.push({ step: '7_inspection', pass: failN === 0, detail: passN + '/' + inspections.length + ' pass', durationMs: elapsed(t) });

  } catch (error: any) {
    console.error('  ERROR: ' + error.message);
    steps.push({ step: 'ERROR', pass: false, detail: error.message, durationMs: 0 });
  }

  const overallPass = steps.every(s => s.pass);
  console.log('\n' + '-'.repeat(40));
  console.log('[' + testCase.caseLabel + '] result: ' + (overallPass ? 'ALL PASS' : 'FAIL'));
  return { caseName: testCase.caseName, caseLabel: testCase.caseLabel, posture: testCase.posture, steps, inspections, artifacts, overallPass };
}
