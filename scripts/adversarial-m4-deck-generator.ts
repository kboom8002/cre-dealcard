import fs from 'fs';
import path from 'path';
import { MobileImPptxRenderer, type MobileImPptxInput } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { calculateFinancials } from '../src/domain/building/mobile-im/financials';
import { extractSlideTexts, inspectPptxBinary } from '../src/assurance/im-harness/golden-test-utils';

const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'test', 'm4-fallback');
const DUMMY_PNG_DATA_URI = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Rule G54 Defect Excuse Regex
const G54_DEFECT_EXCUSE_REGEX = /(?:API\s*연결\s*지연|PNU\s*미등록|자료\s*없음|미확보|일시적으로\s*불러올\s*수\s*없습니다|현장\s*사진이\s*아직\s*등록되지\s*않았습니다)/i;

function createFullPositiveBaseline(overrides: Partial<MobileImPptxInput['doc']['body']> = {}): MobileImPptxInput {
  const askingPriceManwon = 1500000; // 150억
  const monthlyRentKrw = 45000000;   // 4,500만
  const totalDepositManwon = 150000; // 15억

  const financials = calculateFinancials({
    purchasePriceKrw: askingPriceManwon * 10000,
    monthlyRentKrw,
    totalDepositManwon,
  });

  const ssot = {
    address: '서울특별시 강남구 역삼동 736-1',
    building_name: '역삼 테헤란 프라임 타워',
    asking_price_manwon: askingPriceManwon,
    total_deposit_manwon: totalDepositManwon,
    monthly_rent_total_krw: monthlyRentKrw,
    land_area_sqm: 450.5,
    total_gross_area_sqm: 2850.2,
    completion_year: 2019,
    zoning: '일반상업지역',
    floors: '지상 10층 / 지하 2층',
    floors_above: 10,
    floors_below: 2,
    parking_count: 24,
    elevator_count: 2,
    vacancy_pct: 0,
    price_band: '150억',
  };

  const defaultBody = {
    heroCard: {
      askingPriceDisplay: '150.0억 원',
      capRateBase: financials?.capRate?.base ?? 4.0,
      noiBaseBil: 5.4,
      equityRequiredBil: 135.0,
      leveragedYieldPct: financials?.leveragedYield ?? 5.5,
      posture: 'income' as const,
      landAreaM2: ssot.land_area_sqm,
      totalGrossAreaM2: ssot.total_gross_area_sqm,
      zoning: ssot.zoning,
      keyInvestmentPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    },
    identity: {
      investmentPosture: 'income' as const,
      assetType: '근린생활시설',
    },
    ssot_summary: ssot,
    financials: financials ?? {},
    preset: 'credeal_basic',
    keyInvestmentPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    keyPoint: '테헤란로 초역세권 우량 임차인 만실 운영 자산',
    coordinates: { lat: 37.498095, lng: 127.027610 },
    macroTransitImage: DUMMY_PNG_DATA_URI,
    cadastralMapImage: DUMMY_PNG_DATA_URI,
    photos: [
      {
        url: path.join(process.cwd(), 'docs', 'golden-test-data', 'p1-dangsan-income', 'r2-standard', 'images', 'image_01.jpeg').replace(/\\/g, '/'),
        category: 'exterior',
        caption: '건물 전면 외관',
        isHero: true,
        role: 'exterior',
      },
    ],
    floor_leases: [
      { floor: '1F', tenant_type: '스타벅스', area_pyeong: 45.2, deposit_manwon: 30000, rent_manwon: 1500 },
      { floor: '2F', tenant_type: '올리브영', area_pyeong: 42.0, deposit_manwon: 20000, rent_manwon: 1100 },
      { floor: '3F', tenant_type: '치과의원', area_pyeong: 40.5, deposit_manwon: 15000, rent_manwon: 950 },
    ],
    hasRentRoll: true,
    hasLandHistory: true,
    landPriceHistory: {
      history: [
        { year: 2020, priceWon: 35000000 },
        { year: 2021, priceWon: 38000000 },
        { year: 2022, priceWon: 42000000 },
        { year: 2023, priceWon: 45000000 },
        { year: 2024, priceWon: 48000000 },
      ],
    },
    enrichment: {
      hasCadastralMap: true,
      cadastralMapImage: DUMMY_PNG_DATA_URI,
      hasTransitMap: true,
      macroTransitImage: DUMMY_PNG_DATA_URI,
      landPriceHistory: {
        history: [
          { year: '2020', pricePerSqm: 35000000 },
          { year: '2021', pricePerSqm: 38000000 },
          { year: '2022', pricePerSqm: 42000000 },
          { year: '2023', pricePerSqm: 45000000 },
          { year: '2024', pricePerSqm: 48000000 },
        ],
      },
    },
    ...overrides,
  };

  return {
    buildingId: 'missing-data-test-001',
    preset: 'credeal_basic',
    posture: 'income',
    grade: 'A',
    doc: {
      title: '역삼 테헤란 프라임 타워 투자설명서',
      body: defaultBody,
      sections: [
        {
          title: '물건 개요',
          section_type: 'property_overview',
          markdown: '### 물건 기본 정보\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | 서울특별시 강남구 역삼동 736-1 |\n| 연면적 | 2,850.2㎡ |',
        },
        {
          title: '입지 분석',
          section_type: 'location_access',
          markdown: '### 입지 정보\n- 역삼역 도보 2분 테헤란로 핵심 업무지구 위치',
        },
        {
          title: '임대차 현황',
          section_type: 'lease_status',
          markdown: '### 층별 임대차 현황\n| 층 | 임차인 | 보증금(만) | 월세(만) |\n|:---|:---|---:|---:|\n| 1F | 스타벅스 | 30,000 | 1,500 |',
        },
        {
          title: '투자수익률 분석',
          section_type: 'income_analysis',
          markdown: '### 수익률 분석\n- 표면 수익률 4.0%',
        },
      ],
    },
    building: {
      area_signal: 'GBD',
      asset_type: '근린생활시설',
      price_band: '150억',
      address: ssot.address,
      building_name: ssot.building_name,
    },
    broker: {
      display_name: '김수석',
      company_name: 'CREDEAL 프라임',
      phone: '010-1234-5678',
      specialty: '강남 프라임 오피스/근생',
    },
  };
}

interface TestCase {
  key: string;
  name: string;
  filename: string;
  input: MobileImPptxInput;
}

const testCases: TestCase[] = [
  {
    key: 'baseline',
    name: 'Control Positive (Full Baseline Data)',
    filename: 'case-control-positive.pptx',
    input: createFullPositiveBaseline(),
  },
  {
    key: 'case_a',
    name: 'Case A: Cadastral Map Missing',
    filename: 'case-a-cadastral-missing.pptx',
    input: createFullPositiveBaseline({
      cadastralMapImage: undefined,
      enrichment: {
        hasCadastralMap: false,
        cadastralMapImage: undefined,
        hasTransitMap: true,
        macroTransitImage: DUMMY_PNG_DATA_URI,
        landPriceHistory: {
          history: [
            { year: '2020', pricePerSqm: 35000000 },
            { year: '2021', pricePerSqm: 38000000 },
            { year: '2022', pricePerSqm: 42000000 },
            { year: '2023', pricePerSqm: 45000000 },
            { year: '2024', pricePerSqm: 48000000 },
          ],
        },
      },
    }),
  },
  {
    key: 'case_b',
    name: 'Case B: Transit Diagram Missing',
    filename: 'case-b-transit-missing.pptx',
    input: createFullPositiveBaseline({
      coordinates: null,
      macroTransitImage: null,
      mapImageUrl: null,
      poiSpots: [],
      enrichment: {
        hasCadastralMap: true,
        cadastralMapImage: DUMMY_PNG_DATA_URI,
        hasTransitMap: false,
        macroTransitImage: null,
        landPriceHistory: {
          history: [
            { year: '2020', pricePerSqm: 35000000 },
            { year: '2021', pricePerSqm: 38000000 },
            { year: '2022', pricePerSqm: 42000000 },
            { year: '2023', pricePerSqm: 45000000 },
            { year: '2024', pricePerSqm: 48000000 },
          ],
        },
      },
    }),
  },
  {
    key: 'case_c',
    name: 'Case C: Photo Gallery Empty',
    filename: 'case-c-gallery-empty.pptx',
    input: createFullPositiveBaseline({
      photos: [],
      photoUrls: [],
    }),
  },
  {
    key: 'case_d',
    name: 'Case D: Rent Roll Empty',
    filename: 'case-d-rentroll-empty.pptx',
    input: createFullPositiveBaseline({
      hasRentRoll: false,
      floor_leases: [],
      tableRows: [],
    }),
  },
  {
    key: 'case_e',
    name: 'Case E: Land Price History Empty',
    filename: 'case-e-land-history-empty.pptx',
    input: createFullPositiveBaseline({
      hasLandHistory: false,
      landPriceHistory: null,
      enrichment: {
        hasCadastralMap: true,
        cadastralMapImage: DUMMY_PNG_DATA_URI,
        hasTransitMap: true,
        macroTransitImage: DUMMY_PNG_DATA_URI,
        landPriceHistory: null,
      },
    }),
  },
  {
    key: 'case_f',
    name: 'Case F: Total Degenerate Combined Chaos',
    filename: 'case-f-total-chaos.pptx',
    input: createFullPositiveBaseline({
      coordinates: null,
      macroTransitImage: null,
      mapImageUrl: null,
      cadastralMapImage: null,
      poiSpots: [],
      photos: [],
      photoUrls: [],
      hasRentRoll: false,
      floor_leases: [],
      tableRows: [],
      hasLandHistory: false,
      landPriceHistory: null,
      enrichment: {
        hasCadastralMap: false,
        cadastralMapImage: undefined,
        hasTransitMap: false,
        macroTransitImage: null,
        landPriceHistory: null,
      },
    }),
  },
];

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const renderer = new MobileImPptxRenderer();
  console.log(`[adversarial-m4] Generating ${testCases.length} test presentations to ${OUTPUT_DIR}...`);

  const summaryResults: any[] = [];

  for (const tc of testCases) {
    console.log(`\n--- Generating [${tc.key}] ${tc.name} ---`);
    const start = Date.now();
    const output = await renderer.render(tc.input);
    const duration = Date.now() - start;

    const outPath = path.join(OUTPUT_DIR, tc.filename);
    fs.writeFileSync(outPath, output.buffer);

    // Extract slide texts for inspection
    const slideTexts = await extractSlideTexts(output.buffer);
    const allText = slideTexts.map(s => s.text).join(' ');

    const hasG54Excuse = G54_DEFECT_EXCUSE_REGEX.test(allText);
    const binaryInspection = await inspectPptxBinary(output.buffer);

    const result = {
      key: tc.key,
      name: tc.name,
      filename: tc.filename,
      filePath: outPath,
      slideCount: output.slideCount,
      slideCountPass: output.slideCount === 9,
      extractedSlideCount: slideTexts.length,
      hasG54Excuse,
      poisonTokenCount: binaryInspection.poisonTokenViolationCount,
      bleedCount: binaryInspection.bleedCount,
      durationMs: duration,
      fileSizeBytes: output.buffer.length,
    };

    summaryResults.push(result);
    console.log(`  -> Saved: ${tc.filename} (${(output.buffer.length / 1024).toFixed(1)} KB, ${duration}ms)`);
    console.log(`  -> Slides: ${output.slideCount} (Expected: 9) - ${result.slideCountPass ? 'PASS' : 'FAIL'}`);
    console.log(`  -> G54 Excuse Check: ${!hasG54Excuse ? 'CLEAN (PASS)' : 'DETECTED (FAIL)'}`);
    console.log(`  -> Binary Bleed: ${binaryInspection.bleedCount}, Poison: ${binaryInspection.poisonTokenViolationCount}`);
  }

  console.log('\n========================================');
  console.log('       GENERATION COMPLETE SUMMARY      ');
  console.log('========================================');
  console.table(summaryResults.map(r => ({
    Key: r.key,
    Filename: r.filename,
    Slides: r.slideCount,
    Pass9: r.slideCountPass,
    G54Clean: !r.hasG54Excuse,
    Poison: r.poisonTokenCount,
    Bleed: r.bleedCount,
    SizeKB: (r.fileSizeBytes / 1024).toFixed(1),
  })));

  const all9 = summaryResults.every(r => r.slideCountPass);
  const allNoExcuse = summaryResults.every(r => !r.hasG54Excuse);
  console.log(`\nAll 9-Slide Invariant: ${all9 ? 'PASS' : 'FAIL'}`);
  console.log(`All G54 Clean: ${allNoExcuse ? 'PASS' : 'FAIL'}`);

  const summaryJsonPath = path.join(OUTPUT_DIR, 'summary.json');
  fs.writeFileSync(summaryJsonPath, JSON.stringify(summaryResults, null, 2), 'utf8');
  console.log(`Summary written to: ${summaryJsonPath}`);
}

main().catch(err => {
  console.error('[adversarial-m4] ERROR:', err);
  process.exit(1);
});
