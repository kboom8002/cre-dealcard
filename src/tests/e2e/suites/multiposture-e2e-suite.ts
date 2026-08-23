import { E2ETestCase, runFullPipeline } from '../infra/e2e-test-runner';
import { generateReport, type FullReport, type CaseReport } from '../infra/e2e-report-generator';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function ensureDir(dir: string) { 
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); 
}

const caseA: E2ETestCase = {
  caseName: 'caseA_hotel_300b',
  caseLabel: '에이치에비뉴호텔 이대점 300억',
  posture: 'operating',
  memo: '',
  expectedBanding: { price: '300억 원대' },
  expectedGradeRange: { min: 40, max: 85 },
  pptxSlideCount: 10,
  supplementalData: { 
    askingPriceKrw: 30_000_000_000, 
    annualRevenueKrw: 2_822_000_000, 
    gopMarginPct: 38, 
    adrKrw: 95000, 
    occPct: 78, 
    monthlyRentKrw: 0, 
    landAreaSqm: 486.2, 
    totalGrossAreaSqm: 3842.6, 
    buildYear: 2016, 
    floors: 'B2~12F', 
    zoning: '일반상업지역', 
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }] 
  }
};

const caseB: E2ETestCase = {
  caseName: 'caseB_office_120b',
  caseLabel: '역삼동 사옥 120억',
  posture: 'owner_occupied',
  memo: '',
  expectedBanding: { price: '120억 원대' },
  expectedGradeRange: { min: 30, max: 80 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 12_000_000_000, 
    monthlyRentKrw: 0, 
    landAreaSqm: 661.16, 
    totalGrossAreaSqm: 2644.63, 
    buildYear: 2010, 
    floors: 'B1~5F', 
    zoning: '제3종일반주거지역', 
    parking: '지하주차 30대', 
    photos: [] 
  }
};

const caseC: E2ETestCase = {
  caseName: 'caseC_trading_150b',
  caseLabel: '대치동 밸류애드 150억',
  posture: 'trading',
  memo: '',
  expectedBanding: { price: '150억 원대' },
  expectedGradeRange: { min: 30, max: 75 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 15_000_000_000, 
    monthlyRentKrw: 15000000, 
    vacancyRatePct: 20, 
    landAreaSqm: 400, 
    totalGrossAreaSqm: 1500, 
    buildYear: 1996, 
    floors: 'B1~5F', 
    zoning: '제3종일반주거지역', 
    targetExitPriceKrw: 18_000_000_000, 
    photos: [] 
  }
};

export async function runMultiPostureE2ESuite(): Promise<FullReport> {
  const ROOT = join(process.cwd(), 'docs', 'test0823', 'outputs', 'multiposture');
  ensureDir(ROOT);

  const cases: E2ETestCase[] = [caseA, caseB, caseC];
  const caseResults: CaseReport[] = [];

  for (const tc of cases) {
    const outputDir = join(ROOT, tc.caseName);
    console.log('\\n' + '='.repeat(60));
    console.log('[Multi-posture E2E 시작] ' + tc.caseLabel);
    
    try {
      const result = await runFullPipeline(tc, outputDir);
      caseResults.push(result as unknown as CaseReport);
      console.log('[Multi-posture E2E 완료] ' + tc.caseLabel);
    } catch (e) {
      console.error('[Multi-posture E2E 에러 발생] ' + tc.caseLabel, e);
      caseResults.push({
        caseName: tc.caseName,
        caseLabel: tc.caseLabel,
        posture: tc.posture,
        steps: [],
        inspections: [],
        artifacts: {},
        overallPass: false
      } as unknown as CaseReport);
    }
  }

  const report: FullReport = {
    suiteName: 'Multiposture E2E Suite',
    executedAt: new Date().toISOString(),
    cases: caseResults,
    totalPass: caseResults.filter(c => c.overallPass).length,
    totalFail: caseResults.filter(c => !c.overallPass).length,
  };

  console.log('[Multi-posture E2E Suite] 리포트 생성 중...');
  generateReport(report, ROOT);
  return report;
}

if (require.main === module) {
  runMultiPostureE2ESuite().then(r => {
    console.log('\\n' + '='.repeat(60));
    console.log('Multiposture E2E Suite: ' + r.totalPass + ' PASS / ' + r.totalFail + ' FAIL');
    process.exit(r.totalFail > 0 ? 1 : 0);
  }).catch(e => { 
    console.error('[치명적 에러] Multiposture E2E Suite 실행 실패:', e); 
    process.exit(1); 
  });
}
