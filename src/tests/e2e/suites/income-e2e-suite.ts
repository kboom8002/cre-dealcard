import { E2ETestCase, runFullPipeline } from '../infra/e2e-test-runner';
import { generateReport, type FullReport, type CaseReport } from '../infra/e2e-report-generator';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

function ensureDir(dir: string) { 
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); 
}

const caseA: E2ETestCase = {
  caseName: 'caseA_dangsan_115b',
  caseLabel: '당산역 메디컬 근생빌딩 115억',
  posture: 'income',
  memo: `[2025-05 현장 · 2025-05 매도인 면담 · 2025-05 임차인 현황 확인]

당산역(2호선/9호선) 도보 5분. 배후에 아파트 단지가 밀집해 있어 상권 배후가 두껍다.
국회대로·올림픽대로 접근이 좋고, 영등포구청·국회의사당 권역이라 유동도 안정적이다.

2002년 준공인데 관리 상태가 깨끗하다. 로비·복도·EV 다 손볼 데가 없다.
자주식 8대 주차에 전면 도로도 넓다.

임차 구성이 이 물건의 핵심이다. 로뎀나무내과가 1F·2F·5F를 쓰고, 1F에 고은약국이
붙어 있다. 병원+약국 조합이라 공실 리스크가 낮고 회전이 없다.
3F 헬스장, 4F 국제와인. B1은 데이르 카페인데 소유주 자가 사용이고, 4F 일부도 자가다.

문제는 임대료다. 약국·내과는 11년째 인상이 없었다. 현재 월세 총 1,946만원인데
기준층(3F) 단가 62.4천원/평에 맞춰 재산정하면 2,867만원까지 올라간다. 47% 차이다.

자가 사용분 두 곳(B1 전체, 4F 일부)을 임대로 돌리는 것만으로도 상당 부분 채워진다.
매입 후 임대료 현실화를 전제로 보면 기대 수익률 연 3.1%.

토지 평당 75백만원. 인근 조사해보니 입지·부지 양호한 건 130~160백만원,
불리한 건 85~100백만원 선이다. 우리 물건은 그 아래다. 가격 경쟁력이 확실하다.

준공업지역인데 서울시가 2024년 10월에 제도개선 방안을 냈다. 지구단위계획 수립 시
주거용도 용적률 400%까지, 준주거/3종일반주거로 용도지역 변경도 추진 중이다.
현 용적률이 221.8%(지상 기준)라 여유가 크다.

등기가 층별구분등기다. 소유주가 형제 두 분인데 전체 매각에 두 분 다 동의하셨다.
매매희망가 115억.`,
  expectedBanding: { price: '110억 원대', yield: '2%대 초반' },
  expectedGradeRange: { min: 60, max: 90 },
  pptxSlideCount: 10,
  supplementalData: { 
    monthlyRentKrw: 19460000, 
    totalDepositKrw: 290000000, 
    vacancyRatePct: 0, 
    loanAmountKrw: 5_110_000_000, 
    floor_leases: [
      { unitLabel: '1F(101호)', tenant: '고은약국', leaseAreaSqm: 78.39, depositKrw: 60000000, monthlyRentKrw: 1830000, leaseState: 'occupied' },
      { unitLabel: '1F·2F(102·201호)', tenant: '로뎀나무내과', leaseAreaSqm: 357.69, depositKrw: 140000000, monthlyRentKrw: 8830000, leaseState: 'occupied' },
      { unitLabel: '3F(301호)', tenant: '헬스장', leaseAreaSqm: 252.09, depositKrw: 50000000, monthlyRentKrw: 4550000, leaseState: 'occupied' },
      { unitLabel: '4F(401호)', tenant: '국제와인', leaseAreaSqm: 169.06, depositKrw: 30000000, monthlyRentKrw: 2600000, leaseState: 'occupied' },
      { unitLabel: '5F(501호)', tenant: '로뎀나무내과', leaseAreaSqm: 183.67, depositKrw: 10000000, monthlyRentKrw: 1650000, leaseState: 'occupied' },
      { unitLabel: 'B1F', tenant: '자가사용', leaseAreaSqm: 317.22, depositKrw: 0, monthlyRentKrw: 0, leaseState: 'owner_use' },
      { unitLabel: '4F(402호)', tenant: '자가사용', leaseAreaSqm: 83.03, depositKrw: 0, monthlyRentKrw: 0, leaseState: 'owner_use' },
    ], 
    askingPriceKrw: 11_500_000_000, 
    landAreaSqm: 506.8, 
    totalGrossAreaSqm: 1441.15, 
    buildYear: 2002, 
    floors: 'B1~5F', 
    zoning: '준공업지역', 
    parking: '자주식 8대', 
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }] 
  },
  buildingMeta: { area_signal: '당산권역 (당산역)', asset_type: '근린생활시설 (메디컬빌딩)', price_band: '115억' }
};

const caseB: E2ETestCase = {
  caseName: 'caseB_yangpyeong_250b',
  caseLabel: '선유도역 업무시설 250억',
  posture: 'income',
  memo: `[현장]

영등포구 양평동4가 117, 134, 125-2번지. 3필지 합쳐 518.7㎡(157평).
선유도역 9호선 4번출구에서 도보 1분. 대로변이고 초역세권이다.

2018년 9월 준공. 신축이라 내외관이 아주 수려하다. 손볼 데가 없다.
지하 1층에 지상 10층, 업무시설. 철근콘크리트에 개별 냉난방, 승강기 1대.
주차는 옥외 자주식 1대에 기계식 22대.

선유도역 대로변이라 사무실 임차 수요가 풍부하다. 안정적인 임대수익이 기대된다.
현재 지하 1층만 공실이다.

보증금 5억 3,500만원, 월 임대료 5,017만원, 관리비 648만원.
매매가 250억, 평당 1억 5,923만원.

준공업지역이고 공시지가가 ㎡당 948만 4천원(평당 3,135만원, 2023년 1월 기준)이다.`,
  expectedBanding: { price: '250억 원대', yield: '2%대 중반' },
  expectedGradeRange: { min: 50, max: 85 },
  pptxSlideCount: 10,
  supplementalData: { 
    monthlyRentKrw: 50170000, 
    totalDepositKrw: 535000000, 
    mgmtFeeKrw: 6480000, 
    vacancyRatePct: 17, 
    askingPriceKrw: 25_000_000_000, 
    landAreaSqm: 518.7, 
    totalGrossAreaSqm: 3050.0, 
    buildYear: 2018, 
    floors: 'B1~10F', 
    zoning: '준공업지역', 
    parking: '자주식 1대 + 기계식 22대', 
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }] 
  }
};

export async function runIncomeE2ESuite(): Promise<FullReport> {
  const ROOT = join(process.cwd(), 'docs', 'test0823', 'outputs', 'income');
  ensureDir(ROOT);

  const cases: E2ETestCase[] = [caseA, caseB];
  const caseResults: CaseReport[] = [];

  for (const tc of cases) {
    const outputDir = join(ROOT, tc.caseName);
    console.log('\\n' + '='.repeat(60));
    console.log('[Income E2E 시작] ' + tc.caseLabel);
    
    try {
      const result = await runFullPipeline(tc, outputDir);
      // CaseReport 변환 (파이프라인 결과에 맞게 매핑, 세부 속성은 구현에 따름)
      caseResults.push(result as unknown as CaseReport);
      console.log('[Income E2E 완료] ' + tc.caseLabel);
    } catch (e) {
      console.error('[Income E2E 에러 발생] ' + tc.caseLabel, e);
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
    suiteName: 'Income E2E Suite',
    executedAt: new Date().toISOString(),
    cases: caseResults,
    totalPass: caseResults.filter(c => c.overallPass).length,
    totalFail: caseResults.filter(c => !c.overallPass).length,
  };

  console.log('[Income E2E Suite] 리포트 생성 중...');
  generateReport(report, ROOT);
  return report;
}

if (require.main === module) {
  runIncomeE2ESuite().then(r => {
    console.log('\\n' + '='.repeat(60));
    console.log('Income E2E Suite: ' + r.totalPass + ' PASS / ' + r.totalFail + ' FAIL');
    process.exit(r.totalFail > 0 ? 1 : 0);
  }).catch(e => { 
    console.error('[치명적 에러] Income E2E Suite 실행 실패:', e); 
    process.exit(1); 
  });
}
