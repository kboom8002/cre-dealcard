import { E2ETestCase, runFullPipeline } from '../infra/e2e-test-runner';
import { generateReport, type FullReport, type CaseReport } from '../infra/e2e-report-generator';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function ensureDir(dir: string) { 
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); 
}

const caseA: E2ETestCase = {
  caseName: 'caseA_jamwon_242b',
  caseLabel: '잠원동 신축개발 242억',
  posture: 'development',
  memo: '',
  expectedBanding: { price: '240억 원대' },
  expectedGradeRange: { min: 60, max: 85 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 24_226_800_000, 
    landAreaSqm: 615.1, 
    totalGrossAreaSqm: 1200, 
    buildYear: 1990, 
    floors: 'B1~5F', 
    zoning: '제2종일반주거지역', 
    monthlyRentKrw: 0, 
    vacancyRatePct: 100, 
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }], 
    constructionCostPerPyeong: 650, 
    targetGrossAreaPyeong: 600, 
    targetFloorAreaRatio: 249 
  },
  buildingMeta: { area_signal: '신사·잠원권역', asset_type: '근생빌딩 (신축부지)', price_band: '242억' }
};

const caseB: E2ETestCase = {
  caseName: 'caseB_sutaek_89b',
  caseLabel: '구리 수택동 나대지 89억',
  posture: 'development',
  memo: '',
  expectedBanding: { price: '80억 원대' },
  expectedGradeRange: { min: 40, max: 85 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 8_900_000_000, 
    landAreaSqm: 651.2, 
    totalGrossAreaSqm: 0, 
    buildYear: null as any, 
    floors: null as any, 
    zoning: '상업지역', 
    monthlyRentKrw: 0, 
    vacancyRatePct: 0, 
    photos: [], 
    constructionCostPerPyeong: 750, 
    targetGrossAreaPyeong: 2500, 
    targetFloorAreaRatio: 800 
  },
  buildingMeta: { area_signal: '구리역권', asset_type: '나대지 (복합개발)', price_band: '89억' }
};

export async function runDevelopmentE2ESuite(): Promise<FullReport> {
  const ROOT = join(process.cwd(), 'docs', 'test0823', 'outputs', 'development');
  ensureDir(ROOT);

  const cases: E2ETestCase[] = [caseA, caseB];
  const caseResults: CaseReport[] = [];

  for (const tc of cases) {
    const outputDir = join(ROOT, tc.caseName);
    console.log('\\n' + '='.repeat(60));
    console.log('[Development E2E 시작] ' + tc.caseLabel);
    
    try {
      const result = await runFullPipeline(tc, outputDir);
      caseResults.push(result as unknown as CaseReport);
      console.log('[Development E2E 완료] ' + tc.caseLabel);
    } catch (e) {
      console.error('[Development E2E 에러 발생] ' + tc.caseLabel, e);
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
    suiteName: 'Development E2E Suite',
    executedAt: new Date().toISOString(),
    cases: caseResults,
    totalPass: caseResults.filter(c => c.overallPass).length,
    totalFail: caseResults.filter(c => !c.overallPass).length,
  };

  console.log('[Development E2E Suite] 리포트 생성 중...');
  generateReport(report, ROOT);
  return report;
}

if (require.main === module) {
  runDevelopmentE2ESuite().then(r => {
    console.log('\\n' + '='.repeat(60));
    console.log('Development E2E Suite: ' + r.totalPass + ' PASS / ' + r.totalFail + ' FAIL');
    process.exit(r.totalFail > 0 ? 1 : 0);
  }).catch(e => { 
    console.error('[치명적 에러] Development E2E Suite 실행 실패:', e); 
    process.exit(1); 
  });
}
