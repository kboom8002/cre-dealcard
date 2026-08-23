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
  memo: `[2026-04-12 현장]

강남대로 바로 이면. 신사역 4분, 논현역 7분 걸어서 재봤고 실제로 그 정도 나온다.
간장게장 골목이 바로 옆이라 주말에도 사람이 끊이지 않는 자리. 업무·상업·주거가
섞여 있어서 주 7일 상권이라고 봐도 된다.

이면 교차 골목 코너부고 바로 앞에 싸리재 소공원(약 377평)이 있다. 이게 크다.
공원 쪽으로 전면이 열려 있어서 시인성이 좋고, 신축하면 저층부 F&B 집객이 확실히
달라질 자리다.

건물은 1990년 준공이라 많이 낡았다. 승강기가 기존 남자화장실 자리에 소형으로
끼워 넣은 거라 2층부터만 운행하고 4~5인 타면 꽉 찬다. 주차리프트는 지금 안 쓰고
있는데 돌리려면 용량·크기 증설이 사실상 필요하다. 공간 효율이 나쁘다.
→ 리모델링보다 신축이 맞는 물건.

임차인이 여럿 있는데 매도인이 명도해서 넘기는 조건이라 매수자가 신축 부담 없이
들어올 수 있다. 이게 이 물건의 제일 큰 장점.

가격은 토지 평당 1.3억. 반경 150m 안에서 강남대로 배후 일면부가 1.7~2.3억,
안쪽 이면부가 1.1~1.6억 나오는데 본 자산은 일면부 성격인데도 이면부 하단 가격이다.
명도비까지 포함된 확정가라 실질적으로는 더 싸다고 봐야 한다.

호재 두 개 — 경부고속도로 지하화 논의, 위례-신사선 예타 통과. 둘 다 확정 단계는
아니지만 방향은 잡혔다.

신축은 지하1~지상6층으로 근생·의원·업무 복합으로 보고 있다. 서울시 소규모 건축물
한시적 용적률 상향 대상이라 250% 미만으로 잡으면 된다.`,
  expectedBanding: { price: '240억 원대' },
  expectedGradeRange: { min: 60, max: 85 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 24_226_800_000,   // 242.268억 (토지 평당 1.3억)
    landAreaSqm: 616.1,               // 616.1㎡ (186.36평, 2필지 합산)
    totalGrossAreaSqm: 1200,          // 기존 연면적 1,200㎡
    buildYear: 1990,                  // 1990년 준공
    floors: 'B1~5F',                  // 기존 층수
    zoning: '제2종일반주거지역',
    monthlyRentKrw: 0,                // 매도인 전원 명도 조건
    vacancyRatePct: 100,
    photos: [{ url: '/test-images/01_exterior.jpg', type: 'exterior' }], 
    constructionCostPerPyeong: 750,   // 공사비 평당 750만 원 (문서 기준)
    targetGrossAreaPyeong: 600,       // 신축 목표 연면적 약 600평
    targetFloorAreaRatio: 249         // 신축 목표 용적률 249%
  },
  buildingMeta: { area_signal: '신사·잠원권역 (신사역)', asset_type: '근생빌딩 (신축부지)', price_band: '242억' }
};

const caseB: E2ETestCase = {
  caseName: 'caseB_sutaek_89b',
  caseLabel: '구리 수택동 나대지 89억',
  posture: 'development',
  memo: `경기도 구리시 수택동 419-19, 419-12, 419-96번지 나대지.
3필지 합쳐 651.2㎡(196.98평). 건물 없이 바로 개발 가능하다.
구리역 380m 도보 5분. 경의중앙선에 8호선 별내선이 들어와 이용객 하루 3만.
도로가 12m·6m·4m 세 면 접한다. 삼면 접도라 건축 자유도가 높다.
도시지역 상업지역. 매매가 89억, 평당 4,500만원.
저층 상가·중층 오피스텔·상층 업무 복합개발을 추천한다.

주의: 매도자는 용적률 최대 1,260%를 주장하나, 이는 지구단위계획 수립(약 18개월
소요 및 기부채납 조건)이 전제되어야 함.
개발규모 연면적 2,500평 이상 시 교통영향평가 대상(약 6개월 추가 소요).
공사비는 평당 750만 예상.

[인근 실거래 비교]
1. 인근 142평, 61억 (평당 4,296만)
2. 인근 188평, 88억 (평당 4,681만)
3. 인근 221평, 95억 (평당 4,299만)
본 물건은 평당 4,518만으로 적정 시세임.`,
  expectedBanding: { price: '80억 원대' },
  expectedGradeRange: { min: 40, max: 85 },
  pptxSlideCount: 9,
  supplementalData: { 
    askingPriceKrw: 8_900_000_000,    // 89억 (토지 평당 4,518만)
    landAreaSqm: 651.2,               // 651.2㎡ (196.98평, 3필지 합산)
    totalGrossAreaSqm: 0,             // 나대지 (건물 없음)
    buildYear: null as any,
    floors: null as any,
    zoning: '상업지역',                // 일반상업지역
    monthlyRentKrw: 0,
    vacancyRatePct: 0,
    photos: [], 
    constructionCostPerPyeong: 750,   // 공사비 평당 750만
    targetGrossAreaPyeong: 2500,      // 개발 목표 연면적 2,500평
    targetFloorAreaRatio: 800         // 기본 용적률 800% (지구단위 최대 1,260%)
  },
  buildingMeta: { area_signal: '구리역권 (구리역)', asset_type: '나대지 (복합개발)', price_band: '89억' }
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
