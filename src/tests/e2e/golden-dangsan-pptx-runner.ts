/**
 * @file golden-dangsan-pptx-runner.ts
 * @description 갱신된 L3 fixture로 PPTX IM 생성 + 산출물 저장
 *              카카오 Static Map API + V-World WMS 지적도 실호출 포함
 */
import { config } from 'dotenv';
config({ path: '.env.local' }); // API 키 로드

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { bindSectionData } from '@/domain/building/mobile-im/pptx/data-binder';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { buildKakaoStaticMapUrl } from '@/lib/external/kakao-static-map';
import { fetchCadastralMapImage } from '@/lib/external/vworld-wms-cadastral';
import AdmZip from 'adm-zip';

const FIXTURE_DIR = join(process.cwd(), 'docs', 'prod-test', '01-dangsan-income', 'level-3-verified');
const OUTPUT_DIR = join(FIXTURE_DIR, 'output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function run() {
  console.log('=== Golden Test: 당산동 수익형 L3 Verified PPTX 생성 ===\n');

  // 1. Load fixture
  const payload = JSON.parse(readFileSync(join(FIXTURE_DIR, 'input_payload.json'), 'utf8'));
  const bottomSheet = JSON.parse(readFileSync(join(FIXTURE_DIR, 'bottom_sheet.json'), 'utf8'));

  console.log('✅ Fixture loaded');
  console.log(`   매매가: ${(payload.asking_price_manwon / 10000).toFixed(1)}억`);
  console.log(`   월 임대료: ${payload.monthly_rent_manwon.toLocaleString()}만원`);
  console.log(`   LTV: ${payload.ltv_pct}% / 금리: ${payload.loan_interest_pct}%`);
  console.log(`   취득세: ${payload.acquisition_tax_pct}% / 중개수수료: ${(payload.brokerage_fee_manwon / 10000).toFixed(2)}억`);
  console.log(`   사진: ${payload.photos_v2.length}장 / 렌트롤: ${payload.floor_leases.length}구획`);
  console.log(`   비교사례: ${payload.manual_comps.length}건\n`);

  // 1-1. 카카오 Static Map API 호출 (당산동5가 11-47 실좌표)
  const LAT = 37.5339;
  const LNG = 126.9027;
  console.log('▶ [API] 카카오 Static Map 호출...');
  const mapImageUrl = buildKakaoStaticMapUrl({ lat: LAT, lng: LNG, level: 3, width: 1280, height: 960 });
  const isPlaceholder = mapImageUrl.includes('placehold.co');
  console.log(`   ${isPlaceholder ? '⚠ KAKAO_REST_API_KEY 미설정 — placeholder 사용' : '✅ 카카오 지도 URL 생성 완료'}`);
  console.log(`   URL: ${mapImageUrl.substring(0, 80)}...`);

  // 1-2. V-World WMS 지적도 API 호출
  console.log('▶ [API] V-World WMS 지적도 호출...');
  let cadastralResult: Awaited<ReturnType<typeof fetchCadastralMapImage>> = null;
  try {
    cadastralResult = await fetchCadastralMapImage(LAT, LNG, 1200, 900, 200);
    if (cadastralResult) {
      console.log(`   ✅ 지적도 취득 성공 (${cadastralResult.buffer.length} bytes, ${cadastralResult.width}×${cadastralResult.height})`);
      // 지적도 이미지를 output에도 저장
      writeFileSync(join(OUTPUT_DIR, 'cadastral-map.png'), cadastralResult.buffer);
      console.log(`   📁 cadastral-map.png 저장됨`);
    } else {
      console.log('   ⚠ 지적도 취득 실패 (API 키 미설정 또는 오류)');
    }
  } catch (err) {
    console.log(`   ⚠ 지적도 API 오류: ${err}`);
  }
  console.log();

  // 2. Build doc body (simulating handler.ts output)
  const doc = {
    title: '당산동5가 11-47 호산당빌딩 투자 제안서',
    body: {
      posture: 'income',
      tier: 'pro',
      releaseTier: 'decision_im',
      asking_price_manwon: payload.asking_price_manwon,
      total_deposit_manwon: payload.total_deposit_manwon,
      monthly_rent_manwon: payload.monthly_rent_manwon,
      mgmt_fee_total_manwon: payload.mgmt_fee_total_manwon,
      vacancy_pct: payload.vacancy_pct,
      loan_amount_manwon: payload.loan_amount_manwon,
      loan_bank: payload.loan_bank,
      floor_leases: payload.floor_leases,
      manual_comps: payload.manual_comps,
      ancillary_incomes: payload.ancillary_incomes,
      // 사진 URL을 public/test-images/dangsan/ 경로로 매핑 (image-optimizer가 로컬 파일 로드)
      photos_v2: payload.photos_v2.map((p: any) => ({
        ...p,
        url: p.url.replace(/.*\/images\//, '/test-images/dangsan/'),
      })),
      broker_highlight: payload.broker_highlight,
      subway_info: payload.subway_info,
      // 위치 좌표 + 카카오 지도 URL (실 API 호출 결과)
      coordinates: { lat: LAT, lng: LNG },
      mapImageUrl: mapImageUrl,
      resolved_address: '서울특별시 영등포구 당산동5가 11-47',
      address: '서울특별시 영등포구 당산동5가 11-47',
      // D41 Phase D: acquisition_cost
      acquisition_cost: {
        tax_pct: payload.acquisition_tax_pct,
        brokerage_manwon: payload.brokerage_fee_manwon,
        legal_manwon: payload.legal_fee_manwon,
        other_manwon: payload.other_acquisition_cost_manwon,
        total_manwon: Math.round(
          payload.asking_price_manwon * (payload.acquisition_tax_pct / 100) +
          payload.brokerage_fee_manwon +
          payload.legal_fee_manwon +
          (payload.other_acquisition_cost_manwon || 0)
        ),
      },
      // D41 Phase D: loan_scenario
      loan_scenario: {
        ltv_pct: payload.ltv_pct,
        interest_pct: payload.loan_interest_pct,
        term_years: payload.loan_term_years,
        target_irr_pct: payload.target_irr_pct,
        monthly_interest_manwon: Math.round(
          payload.asking_price_manwon * (payload.ltv_pct / 100) * (payload.loan_interest_pct / 100) / 12
        ),
      },
      ssot_summary: {
        asking_price_manwon: payload.asking_price_manwon,
        deposit_manwon: payload.total_deposit_manwon,
        monthly_rent_manwon: payload.monthly_rent_manwon,
      },
      enrichment: {
        landUsePlan: {
          zoningName: '제2종일반주거지역',
          floorAreaRatioMax: 250,
          buildingCoverageMax: 60,
          districtPlanName: '영등포 당산지구 지구단위계획',
        },
        buildingRegister: {
          mainUse: '근린생활시설',
          completionDate: '1998-06-15',
          totalGrossAreaM2: 1141.15,
          landAreaM2: 420.5,
          floorsAbove: 5,
          floorsBelow: 1,
          structure: '철근콘크리트',
          parkingCount: 8,
        },
        landPrice: {
          officialLandPricePerSqm: 12_500_000,
          assessedYear: 2025,
        },
        comparableTransactions: [
          { address: '영등포구 당산동5가 11-48', dealAmount: 1200000, area: 1320, dealYear: 2023, dealMonth: 11, buildingUse: '근린생활시설', floors: 5, memo: '인접 건물' },
          { address: '영등포구 당산동5가 12-10', dealAmount: 1150000, area: 1100, dealYear: 2024, dealMonth: 2, buildingUse: '근린생활시설', floors: 4, memo: '의원/약국 중심' },
          { address: '영등포구 당산동6가 2-1', dealAmount: 1300000, area: 1580, dealYear: 2024, dealMonth: 5, buildingUse: '근린생활시설', floors: 6, memo: '피트니스/학원 중심' },
        ],
        // 지적도 이미지 (V-World WMS 실 API 호출 결과)
        cadastralMapImage: cadastralResult
          ? { base64: cadastralResult.base64, source: 'vworld_wms', pnu: '1156011500100110047', width: cadastralResult.width, height: cadastralResult.height }
          : (() => {
              // Fallback: V-World 실패 시 항공사진을 placeholder로 사용
              try {
                const imgBuf = readFileSync(join(process.cwd(), 'public', 'test-images', 'dangsan', '02_aerial.jpg'));
                return { base64: `image/jpeg;base64,${imgBuf.toString('base64')}`, source: 'fallback', pnu: '1156011500100110047' };
              } catch { return null; }
            })(),
      },
      // 외부 데이터 플래그 (공공 API 자동 수집 결과 시뮬레이션)
      external_data: {
        hasPublicData: true,
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 당산역세권 만실 메디컬 근생빌딩\n- 소재지: 서울특별시 영등포구 당산동5가 11-47 (영신로 259, 호산당빌딩)\n- 건물규모: 지하 1층 ~ 지상 5층, 1998년 준공\n- 토지면적: 420.5㎡ (127.2평) / 연면적: 1,141.15㎡ (345.2평)\n- 용도지역: 제2종일반주거지역\n- 매매가: 115억 원`,
      },
      {
        title: '입지 분석',
        section_type: 'location_access',
        markdown: `### 2호선/9호선 더블역세권 + 국회대로 접근\n- 당산역(2호선/9호선) 도보 5분, 영등포구청 행정중심지\n- 국회대로·올림픽대로 진입 양호, 여의도 업무지구 15분\n- 배후 아파트 3,000세대+ 밀집, 안정적 소비 수요\n- 당산로 상가 밀집 구간 접면, 보행 유동 풍부`,
      },
      {
        title: '임대 현황',
        section_type: 'lease_status',
        markdown: `### 7구획 만실 (공실률 0%)\n| 층 | 임차인 | 업종 | 면적(평) | 보증금(만원) | 월세(만원) |\n|---|---|---|---|---|---|\n| B1 | 자가카페 | 음식점 | 95.96 | - | - |\n| 1F | 당산메디칼약국 | 약국 | 23.71 | 6,000 | 183 |\n| 1F+2F | 연세이비인후과 | 의원 | 108.20 | 14,000 | 883 |\n| 3F | 당산피트니스 | 헬스 | 76.26 | 5,000 | 455 |\n| 4F | 소유자 사무실 | 사무 | 25.12 | - | - |\n| 4F | 와인앤모어 | 주류 | 51.14 | 3,000 | 260 |\n| 5F | 서울피부과 | 피부과 | 55.56 | 1,000 | 165 |\n\n월 임대수입 합계: 1,946만원 / 보증금 합계: 2억 9,000만원`,
      },
      {
        title: '수익 분석',
        section_type: 'income_analysis',
        markdown: `### 수익률 및 레버리지 분석\n- 매매가: 115억 원\n- 연 총임대수입: 2.34억 원 (= 1,946만 × 12)\n- 표면 Cap Rate: 2.03%\n- 취득세(4.6%): 5.29억 / 중개보수(0.9%): 1.04억 / 법무사비: 0.03억\n- 총취득원가: 약 121.6억 원\n\n금리 4.5% 기준 LTV 민감도:\n| LTV | 대출금액 | 실투자금 | 월이자 | 월순현금 | ROE |\n|-----|---------|---------|--------|---------|-----|\n| 0% | - | 118.7억 | - | +1,946만 | 1.97% |\n| 40% | 46.0억 | 72.6억 | 1,725만 | +221만 | 0.37% |\n| 50% | 57.5억 | 60.9억 | 2,156만 | -210만 | -0.41% |\n\n⚠️ 역레버리지: Cap Rate(2.03%) < 대출금리(4.5%), LTV 50% 이상 시 현금흐름 적자`,
      },
    ],
  };

  const building = {
    area_signal: '영등포/당산',
    asset_type: '근린생활시설',
    price_band: '115억',
    building_name: '호산당빌딩',
    land_area_pyeong: 127.2,
    total_gross_area_pyeong: 345.2,
    floors_above: 5,
    floors_below: 1,
    completion_year: 1998,
    zoning: '제2종일반주거지역',
  };

  // 3. Render PPTX
  console.log('▶ PPTX 렌더링 시작...');
  const renderer = new MobileImPptxRenderer();
  const result = await renderer.render({
    doc,
    building,
    preset: 'commercial_visual_grid',
    posture: 'income',
    grade: 'A',
    templateId: 'commercial_visual_grid',
  });
  const pptxBuffer = result.buffer;

  // 4. Save PPTX
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const pptxPath = join(OUTPUT_DIR, `01-dangsan-income_${ts}.pptx`);
  writeFileSync(pptxPath, pptxBuffer);
  console.log(`✅ PPTX saved: ${pptxPath} (${(pptxBuffer.length / 1024).toFixed(1)} KB)`);
  console.log(`   슬라이드: ${result.slideCount}면 / 경고: ${result.warnings.length}건`);
  if (result.warnings.length > 0) {
    console.log('   ⚠ 경고 목록:');
    result.warnings.forEach((w: string) => console.log(`     - ${w}`));
  }
  console.log();

  // 5. Extract slide texts
  const zip = new AdmZip(pptxBuffer);
  const slideEntries = zip.getEntries()
    .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  const slideTexts = slideEntries.map(entry => {
    const xml = entry.getData().toString('utf8');
    const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    return matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ');
  });

  console.log(`📊 총 슬라이드: ${slideTexts.length}면\n`);

  // 5-1. Check embedded images
  const imageEntries = zip.getEntries().filter(e => /^ppt\/media\/image[-\d]+\.(jpg|jpeg|png|gif|bmp|emf|wmf)$/i.test(e.entryName));
  const totalImageSizeKB = imageEntries.reduce((sum, e) => sum + e.header.size, 0) / 1024;
  console.log(`📸 임베딩 이미지: ${imageEntries.length}장 (${totalImageSizeKB.toFixed(1)} KB)\n`);

  // 6. Verify key data points
  const allText = slideTexts.join('\n');
  const checks = [
    { name: '매매가 115억', pass: allText.includes('115') },
    { name: '월 임대 1,946만 또는 1946', pass: /1[,.]?946/.test(allText) },
    { name: 'Cap Rate 2.0', pass: /2\.0[0-9]/.test(allText) },
    { name: '취득세 4.6%', pass: allText.includes('4.6') },
    { name: '역레버리지 경고', pass: /역레버리지|레버리지/.test(allText) },
    { name: 'LTV 40%', pass: /LTV\s*40|40%/.test(allText) },
    { name: '당산역', pass: allText.includes('당산') },
    { name: '비교사례 존재', pass: /비교|Comps/.test(allText) },
    { name: 'NaN 없음', pass: !allText.includes('NaN') },
    { name: 'undefined 없음', pass: !allText.includes('undefined') },
    { name: '중개수수료', pass: /중개|보수/.test(allText) },
    { name: 'DSCR 또는 자기자본수익률', pass: /DSCR|자기자본|수익률/.test(allText) },
    { name: '커버 이미지 임베딩 (≥1장)', pass: imageEntries.length >= 1 },
    { name: '건물 사진 임베딩 (≥2장)', pass: imageEntries.length >= 2 },
    { name: 'PPTX 크기 500KB+ (이미지 포함)', pass: pptxBuffer.length > 500 * 1024 },
  ];

  console.log('=== 산출물 검증 ===');
  let passCount = 0;
  for (const c of checks) {
    const icon = c.pass ? '✅' : '❌';
    console.log(`  ${icon} ${c.name}`);
    if (c.pass) passCount++;
  }
  console.log(`\n결과: ${passCount}/${checks.length} 통과\n`);

  // 7. Save slide texts
  const textsPath = join(OUTPUT_DIR, 'slide-texts-latest.json');
  writeFileSync(textsPath, JSON.stringify({
    totalSlides: slideTexts.length,
    generatedAt: new Date().toISOString(),
    fixture: 'level-3-verified (D41 갱신본)',
    checks: checks.map(c => ({ ...c })),
    passRate: `${passCount}/${checks.length}`,
    slides: slideTexts.map((text, i) => ({ slide: i + 1, text: text.substring(0, 500) })),
  }, null, 2));
  console.log(`✅ Slide texts saved: ${textsPath}`);

  // 8. Save summary
  const summaryPath = join(OUTPUT_DIR, 'summary-latest.json');
  writeFileSync(summaryPath, JSON.stringify({
    testCase: '01-dangsan-income',
    level: 'level-3-verified',
    fixture: 'D41 갱신본 (취득비용+대출 시나리오 포함)',
    generatedAt: new Date().toISOString(),
    pptxSizeKB: (pptxBuffer.length / 1024).toFixed(1),
    totalSlides: slideTexts.length,
    checks: passCount + '/' + checks.length,
    acquisitionCost: doc.body.acquisition_cost,
    loanScenario: doc.body.loan_scenario,
  }, null, 2));
  console.log(`✅ Summary saved: ${summaryPath}`);
}

run().then(() => {
  console.log('\n🎉 골든 테스트 완료!');
  process.exit(0);
}).catch(err => {
  console.error('❌ 골든 테스트 실패:', err);
  process.exit(1);
});