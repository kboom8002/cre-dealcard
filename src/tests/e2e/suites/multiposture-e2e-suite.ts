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
  memo: `서대문구 대현동 비즈니스호텔 매물. 이대역 도보 3분, 신촌 대학가.
객실 94실 (스탠다드더블 46, 트윈 28, 디럭스 14, 스위트 6). 대지 486.2㎡(147평), 연면적 3,842.6㎡(1,162평).
지하2층~지상12층, 2016년 4월 준공. 일반상업지역, 용적률 654.1%.
매각가 300억. 객실당 3.19억.
운영은 위탁운영, 에이치에비뉴 브랜드. 계약 2029년 만료 (잔여 4년).
ADR: 95,000원, OCC: 78%, RevPAR: 74,100원.
계절성: 대학가 3~5월, 9~11월 성수, 1~2월 비수기 60% 이하.
외국인 비중: 45% (중국/일본/동남아).
GOP 마진 38%, 연 총매출 28.22억, GOP 10.72억.
부대매출 비중 11%.

호텔 특유 리스크:
1. 운영 성과 변동 (ADR/OCC 시장 등락)
2. 운영사 계약 만료 (2029년, 재계약 조건 미확정)
3. 외국인 관광 의존도 45%
4. 계절성 (1~2월 비수기 OCC 60% 이하)
5. 용도변경 제약 (숙박→타용도 전환 곤란)
6. 시설 노후 리뉴얼 주기 (2016 준공, 8년차)`,
  expectedBanding: { price: '300억 원대' },
  expectedGradeRange: { min: 40, max: 85 },
  pptxSlideCount: 10,
  supplementalData: { 
    askingPriceKrw: 30_000_000_000,        // 300억
    annualRevenueKrw: 2_822_000_000,       // 연 총매출 28.22억
    gopMarginPct: 38,                      // GOP 마진 38%
    adrKrw: 95000,                         // ADR 9.5만원
    occPct: 78,                            // OCC 78%
    totalRooms: 94,                        // 객실 94실
    monthlyRentKrw: 0,                     // 위탁 직영 (임대차 없음)
    landAreaSqm: 486.2,                    // 대지 486.2㎡ (147평)
    totalGrossAreaSqm: 3842.6,             // 연면적 3,842.6㎡ (1,162평)
    buildYear: 2016,                       // 2016년 4월 준공
    floors: 'B2~12F',
    zoning: '일반상업지역',
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }] 
  },
  buildingMeta: { area_signal: '이대·신촌 대학가 (이대역)', asset_type: '비즈니스호텔 (위탁운영)', price_band: '300억' }
};

const caseB: E2ETestCase = {
  caseName: 'caseB_office_120b',
  caseLabel: '역삼동 사옥 120억',
  posture: 'owner_occupied',
  memo: `강남구 역삼동 5층 사옥용 빌딩. 매매가 120억.
전층 명도 가능. 지하주차 30대. 역삼역 도보 3분.
연면적 800평, 대지 200평. 2010년 준공. 제3종일반주거지역.`,
  expectedBanding: { price: '120억 원대' },
  expectedGradeRange: { min: 30, max: 80 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 12_000_000_000,        // 120억
    monthlyRentKrw: 0,                     // 전층 명도 (자가사용 전제)
    landAreaSqm: 661.16,                   // 대지 200평 (661.16㎡)
    totalGrossAreaSqm: 2644.63,            // 연면적 800평 (2,644.63㎡)
    buildYear: 2010,
    floors: 'B1~5F',
    zoning: '제3종일반주거지역',
    parking: '지하주차 30대',
    photos: [] 
  },
  buildingMeta: { area_signal: '역삼역 강남업무권역', asset_type: '업무시설 (사옥)', price_band: '120억' }
};

const caseC: E2ETestCase = {
  caseName: 'caseC_trading_150b',
  caseLabel: '대치동 밸류애드 150억',
  posture: 'trading',
  memo: `강남구 대치동 근생빌딩. 매매가 150억.
1996년 준공 5층. 용적률 여유 있어 리모델링+증축 가능.
현 임차인 3호실. 엑시트 목표 180~200억.`,
  expectedBanding: { price: '150억 원대' },
  expectedGradeRange: { min: 30, max: 75 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 15_000_000_000,        // 150억
    monthlyRentKrw: 15_000_000,            // 월 임대료 1,500만
    totalDepositKrw: 110_000_000,          // 보증금 총 1.1억
    vacancyRatePct: 20,                    // 공실률 20% (5층 중 1층)
    landAreaSqm: 400,                      // 대지 약 121평 (400㎡)
    totalGrossAreaSqm: 1500,               // 연면적 약 454평 (1,500㎡)
    buildYear: 1996,
    floors: 'B1~5F',
    zoning: '제3종일반주거지역',
    targetExitPriceKrw: 18_000_000_000,    // 엑시트 목표 180억
    floor_leases: [
      { floor: '1F', tenant_type: '음식점', deposit_manwon: 5000, rent_manwon: 600, lease_end: '2025-12-31' },
      { floor: '2F', tenant_type: '사무실', deposit_manwon: 3000, rent_manwon: 500, lease_end: '2026-06-30' },
      { floor: '3F', tenant_type: '학원', deposit_manwon: 3000, rent_manwon: 400, lease_end: '2025-09-30', note: '명도 대상' },
    ],
    photos: [] 
  },
  buildingMeta: { area_signal: '대치동 학원가', asset_type: '근린생활시설 (밸류애드)', price_band: '150억' }
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
