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
      { floor: 'B1', tenant_type: '카페(자가운영)', area_pyeong: 96.0, deposit_manwon: 0, rent_manwon: 0, is_vacant: false, note: '소유자 직접 운영 · 임대전환 대상' },
      { floor: '1F', tenant_type: '약국', area_pyeong: 23.7, deposit_manwon: 6000, rent_manwon: 183, lease_start: '2015-09-01', lease_end: '2026-08-31', note: '임대 11년 경과' },
      { floor: '1F', tenant_type: '내과', area_pyeong: 31.9, deposit_manwon: 14000, rent_manwon: 883, lease_start: '2015-09-01', lease_end: '2026-08-31', note: '1F+2F 통합계약(B그룹)' },
      { floor: '2F', tenant_type: '내과', area_pyeong: 76.3, deposit_manwon: 0, rent_manwon: 0, lease_end: '2026-08-31', note: 'B그룹 금액은 1F행에 합산' },
      { floor: '3F', tenant_type: '헬스장', area_pyeong: 76.3, deposit_manwon: 5000, rent_manwon: 455, lease_end: '2026-04-17' },
      { floor: '4F', tenant_type: '주류판매', area_pyeong: 51.1, deposit_manwon: 3000, rent_manwon: 260, lease_end: '2025-04-30', note: 'IM 작성 시점 만료 계약' },
      { floor: '4F', tenant_type: '자가사용', area_pyeong: 25.1, deposit_manwon: 0, rent_manwon: 0, is_vacant: false, note: '임대전환 대상' },
      { floor: '5F', tenant_type: '내과', area_pyeong: 55.6, deposit_manwon: 1000, rent_manwon: 165, lease_start: '2015-09-01', lease_end: '2026-08-31', note: '별도 계약' },
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
    monthlyRentKrw: 46570000,   // 실측: 4,657만원 (표지 5,017만원과 차이)
    totalDepositKrw: 495000000, // 실측: 4.95억원 (표지 5.35억원과 차이)
    mgmtFeeKrw: 5760000,       // 실측: 576만원
    vacancyRatePct: 17,         // B1 면적기준 17%
    floor_leases: [
      { floor: 'B1', tenant_type: '공실', area_pyeong: 127.8, is_vacant: true, deposit_manwon: 0, rent_manwon: 0, note: '리스업 대상' },
      { floor: '1F', tenant_type: '부동산', deposit_manwon: 3500, rent_manwon: 250, mgmt_fee_manwon: 15, lease_start: '2023-11-11', lease_end: '2025-11-11' },
      { floor: '2F', tenant_type: '미용실', deposit_manwon: 5000, rent_manwon: 540, mgmt_fee_manwon: 60, lease_start: '2024-02-22', lease_end: '2026-02-21' },
      { floor: '3F', tenant_type: '치과', deposit_manwon: 7000, rent_manwon: 310, mgmt_fee_manwon: 53, lease_start: '2022-11-01', lease_end: '2024-10-31' },
      { floor: '4F', tenant_type: '사무실', deposit_manwon: 5000, rent_manwon: 440, mgmt_fee_manwon: 55, lease_start: '2022-06-30', lease_end: '2024-06-29' },
      { floor: '5F', tenant_type: '사무실', deposit_manwon: 5700, rent_manwon: 528, mgmt_fee_manwon: 66, lease_start: '2022-05-30', lease_end: '2024-05-29' },
      { floor: '6F', tenant_type: '사무실', deposit_manwon: 4000, rent_manwon: 483, mgmt_fee_manwon: 69, lease_start: '2024-03-01', lease_end: '2026-02-28' },
      { floor: '7F', tenant_type: '사무실', deposit_manwon: 5000, rent_manwon: 588, mgmt_fee_manwon: 62, lease_start: '2023-10-04', lease_end: '2025-10-03' },
      { floor: '8F', tenant_type: '사무실', deposit_manwon: 5000, rent_manwon: 560, mgmt_fee_manwon: 80, lease_start: '2023-09-08', lease_end: '2025-09-07' },
      { floor: '9F', tenant_type: '스튜디오렌탈', deposit_manwon: 2000, rent_manwon: 199, mgmt_fee_manwon: 22, lease_start: '2023-11-01', lease_end: '2025-10-31' },
      { floor: '9F', tenant_type: '사무실', deposit_manwon: 3000, rent_manwon: 300, mgmt_fee_manwon: 43, lease_start: '2023-12-01', lease_end: '2025-11-30' },
      { floor: '10F', tenant_type: '운동시설', deposit_manwon: 4300, rent_manwon: 459, mgmt_fee_manwon: 51, lease_start: '2022-10-01', lease_end: '2024-09-30' },
    ],
    askingPriceKrw: 25_000_000_000, 
    landAreaSqm: 518.7, 
    totalGrossAreaSqm: 2490.88,  // 실측 연면적
    buildYear: 2018, 
    floors: 'B1~10F', 
    zoning: '준공업지역', 
    parking: '자주식 1대 + 기계식 22대', 
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }] 
  },
  buildingMeta: { area_signal: '양평권역 (선유도역)', asset_type: '업무시설', price_band: '250억' }
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
