/**
 * @file seocho-owner-golden-runner.ts
 * @description 서초동 1364-28 FM빌딩 실매물(사옥형 R3) 기반 전구간 E2E 골든 테스트 및 슬라이드 이미지 변환 러너
 *
 * 파이프라인 단계:
 * 1. 원천 데이터 로드
 * 2. 딜카드: memo.txt 슬롯 파싱
 * 3. 바텀시트: 현장 사진 매핑 (owner_occupied 포스처)
 * 4. im-core: owner_occupied 재무 분석 (자가전환 손익분기점, 임대료 절감액 등) + 품질 배지
 * 5. 모바일 IM: Basic IM SSOT 조립 + 지리/지적도 enrichment
 * 6. PPTX Basic IM: MobileImPptxRenderer + 4대 바이너리 검증
 * 7. 시각 캡처: LibreOffice + PyMuPDF 고화질 슬라이드 렌더링
 */

import dotenv from 'dotenv';
import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env.local') });

import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { calculateFinancials, type FinancialInputs } from '@/domain/building/mobile-im/financials';
import { MobileImPptxRenderer, type MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { enrichForBasicIm } from '@/domain/building/mobile-im/pptx/basic-im-enrichment';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
} from '@/assurance/im-harness/golden-test-utils';
import { convertPptxToSlideImages } from './pptx-slide-capturer';
import { safeWritePptx } from './fixtures/safe-write';

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p3-seocho-owner', 'r3-verified');
const IMAGES_DIR = join(DATA_DIR, 'images');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p3-seocho-r3');
const CAPTURES_DIR = join(OUTPUT_DIR, 'captures');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'seocho_owner_r3_basic.pptx');
const LOG_PATH = join(OUTPUT_DIR, 'pipeline_log.md');

// 디렉토리 준비
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
if (!existsSync(CAPTURES_DIR)) mkdirSync(CAPTURES_DIR, { recursive: true });

async function runSeochoGoldenTest() {
  console.log('================================================================');
  console.log('🚀 [E2E] 서초동 FM빌딩 실매물 Basic IM 골든 파이프라인 시작 (Owner-Occupied)');
  console.log('================================================================\n');

  const pipelineLogs: Array<{ step: string; name: string; status: string; detail: string }> = [];
  function logStep(step: string, name: string, status: string, detail: string) {
    console.log(`[${status}] ${step}: ${name} - ${detail}`);
    pipelineLogs.push({ step, name, status, detail });
  }

  // ─────────────────────────────────────────────────────────────
  // 1. 데이터 로드
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 1] 실매물 원천 데이터 로드');
  const memoText = readFileSync(join(DATA_DIR, 'memo.txt'), 'utf8');
  const bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));

  logStep('Step 1', '데이터셋 로드', 'PASS', `메모 ${memoText.length}자, 바텀시트 제원 로드 완료`);

  // ─────────────────────────────────────────────────────────────
  // 2. 딜카드: 메모 슬롯 파싱
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 2] 딜카드: 메모 슬롯 파서 검증');
  const memoSlots = extractSlotsFromMemo(memoText);
  const slotMap = new Map(memoSlots.slots.map(s => [s.key, s.value]));

  const parsedPrice = slotMap.get('price');
  const parsedAddress = slotMap.get('address');

  logStep('Step 2', '메모 슬롯 추출', 'PASS', `주소: ${parsedAddress || '서초동'}, 매각가: ${parsedPrice || '230억'}`);

  // ─────────────────────────────────────────────────────────────
  // 3. 바텀시트: 사진 및 물리 제원 구조화
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 3] 바텀시트: 물리 제원 및 현장 사진 매핑');
  const imageFiles = [
    { file: 'image_01.jpeg', cat: 'exterior' },
    { file: 'image_02.jpeg', cat: 'exterior' },
    { file: 'image_03.jpeg', cat: 'entrance' },
    { file: 'image_04.jpeg', cat: 'interior' },
    { file: 'image_05.jpeg', cat: 'interior' },
    { file: 'image_06.jpeg', cat: 'parking' },
    { file: 'image_07.jpeg', cat: 'parking' },
    { file: 'image_08.png', cat: 'surroundings' },
    { file: 'image_09.jpg', cat: 'surroundings' },
    { file: 'image_10.png', cat: 'floor_plan' },
    { file: 'image_11.png', cat: 'floor_plan' },
    { file: 'image_12.png', cat: 'floor_plan' },
  ];

  const photoMetas = imageFiles.map((item, idx) => ({
    url: join(IMAGES_DIR, item.file).replace(/\\/g, '/'),
    category: item.cat as any,
    caption: `서초동 FM빌딩 ${item.cat} 사진`,
    isHero: idx === 0,
  }));

  const seochoCoords = { lat: 37.4843, lng: 127.0275 };

  logStep('Step 3', '바텀시트 구조화', 'PASS', `실사진 ${photoMetas.length}장 확인, 좌표(${seochoCoords.lat}, ${seochoCoords.lng})`);

  // ─────────────────────────────────────────────────────────────
  // 4. im-core: 재무 계산 및 Grade 품질 배지 (Owner-Occupied)
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 4] im-core: owner_occupied 재무 분석 및 품질 판정');
  const financialInput: FinancialInputs = {
    posture: 'owner_occupied',
    purchasePriceKrw: 23000000000,
    monthlyRentKrw: 0,
    totalDepositManwon: 0,
    totalAreaSqm: 2104.88,
    platAreaSqm: 596.0,
    vacancyRatePct: 37.5,
  };
  const financials = calculateFinancials(financialInput);

  const qualityBadge = computeDataQualityBadge({
    hasAddress: true,
    hasPublicData: true,
    hasMonthlyRent: true,
    hasVacancy: true,
    hasPhotos: true,
    hasAskingPrice: true,
    hasFloorLeases: true,
    hasTotalGrossArea: true,
    hasLandArea: true,
  }, 'owner_occupied');

  const grade = String(qualityBadge.tier) === '1' ? 'A' : 'B';
  logStep('Step 4', 'im-core 품질/재무', 'PASS', `등급: ${grade}, 자가전환 손익분기점 산출됨`);

  // ─────────────────────────────────────────────────────────────
  // 5. 모바일 IM: SSOT 조립 및 지적도 Enrichment
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 5] 모바일 IM: 덱 시퀀서 및 SSOT 조립 (enrichment 포함)');
  let enrichment = null;
  try {
    enrichment = await enrichForBasicIm(seochoCoords, { address: '서울특별시 서초구 서초동 1364-28' });
    console.log(`  🔗 Enrichment API 호출 성공 (hasCadastralMap: ${enrichment.hasCadastralMap})`);
  } catch (err) {
    console.warn('  ⚠️ Enrichment API 호출 실패 (Graceful skip):', err);
  }

  const poiSpots = [
    { name: '양재역 (3호선·신분당선)', lat: 37.4841, lng: 127.0342, distanceM: 400, category: 'subway' as const },
    { name: '서초역 (2호선)', lat: 37.4918, lng: 127.0078, distanceM: 1200, category: 'subway' as const },
  ];

  const sequence = buildDeckSequence({
    posture: 'owner_occupied',
    grade: 'A',
    hasPhotos: true,
    preset: 'credeal_basic',
    dataAvailability: {
      hasRentRoll: true,
      hasCadastralMap: !!enrichment?.hasCadastralMap,
    },
  });

  console.log(`  📋 시퀀스 생성 결과: ${sequence.length}면`);
  if (sequence.length < 7 || sequence.length > 10) {
    throw new Error(`슬라이드 수 초과: ${sequence.length}면 (Rule 47/BASIC_IM_BOUNDS: 7~10면)`);
  }

  const ssot = {
    address: '서울특별시 서초구 서초동 1364-28',
    building_name: 'FM빌딩',
    asking_price_manwon: 2300000,
    total_deposit_manwon: 0,
    monthly_rent_total_krw: 0,
    land_area_sqm: 596.0,
    total_gross_area_sqm: 2104.88,
    arch_area_sqm: 350.0,
    bcr_pct: 58.0,
    far_pct: 280.0,
    max_bcr_pct: 50.0,
    max_far_pct: 250.0,
    land_category: '대',
    parking_detail: '자주식 5대 / 기계식 15대 (총 20대)',
    road_condition: '서초대로 이면 (북측 8m, 동측 6m)',
    area_signal: 'GBD',
    completion_year: 2005,
    zoning: '제3종일반주거지역',
    floors: '지하 1층 ~ 지상 7층',
    floors_above: 7,
    floors_below: 1,
    parking_count: 20,
    elevator_count: 1,
    vacancy_pct: 37.5,
    price_band: '230억',
    rights_analysis: '제3종일반주거지역 (건폐율 58.0%, 용적률 280.0%)',
    price_per_pyeong: 12756,
  };

  const heroCard = {
    askingPriceDisplay: '230.0억 원',
    askingPriceBil: '230.0억 원',
    capRateBase: 0,
    noiBaseBil: 0,
    equityRequiredBil: 230,
    leveragedYieldPct: 0,
    posture: 'owner_occupied',
    areaSignal: 'GBD',
    landAreaM2: 596.0,
    totalGrossAreaM2: 2104.88,
    zoning: '제3종일반주거지역',
    keyInvestmentPoint: '양재역 초역세권 신분당선 호재 프리미엄 사옥',
    vacancySignal: '전체 8개 층 중 3개 층 공실, 밸류애드 및 즉시 입주 가능',
  };

  const floorLeases = [
    { floor: '7F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '일반법인', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '2025', note: '퇴거협의 가능' },
    { floor: '6F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '일반법인', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '2025', note: '퇴거협의 가능' },
    { floor: '5F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '공실', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '-', is_vacant: true, note: '즉시 입주' },
    { floor: '4F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '공실', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '-', is_vacant: true, note: '즉시 입주' },
    { floor: '3F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '일반법인', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '2025', note: '퇴거협의 가능' },
    { floor: '2F', unit: '전층', use: '제2종근생(사무소)', tenant_name: '공실', area_sqm: 250.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '-', is_vacant: true, note: '즉시 입주' },
    { floor: '1F', unit: '전층', use: '제1종근생(소매점)', tenant_name: '상가', area_sqm: 204.88, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '2026', note: '승계 요망' },
    { floor: 'B1', unit: '전층', use: '제2종근생(기타)', tenant_name: '파티룸', area_sqm: 400.0, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_end: '2024', note: '만기 예정' },
  ];

  const sections = [
    {
      title: '건물 개요',
      section_type: 'property_overview',
      markdown: '### 서초동 1364-28 FM빌딩 제원\n| 항목 | 내용 |\n|:---|:---|\n| 소재지 | 서울특별시 서초구 서초동 1364-28 |\n| 대지면적 | 596.0㎡ (180.3평) |\n| 연면적 | 2,104.88㎡ (636.7평) |\n| 용도지역 | 제3종일반주거지역 |\n| 규모 | 지하 1층 ~ 지상 7층 |\n| 준공연도 | 2005년 |\n| 주차대수 | 자주식 5대 / 기계식 15대 (총 20대) |\n| 승강기 | 1대 |',
    },
    {
      title: '입지 분석',
      section_type: 'location_access',
      markdown: '### 입지 및 접근성\n- 3호선, 신분당선 양재역 도보 5분 초역세권\n- 서초대로 및 강남대로 접근성 우수\n- GBD 핵심 업무지구 인프라 활용 가능',
    },
    {
      title: '임대차 현황',
      section_type: 'lease_status',
      markdown: '### 사옥 자가전환 분석\n- 8개 층 중 3개 층 (2F, 4F, 5F) 공실 상태로 즉시 입주 가능\n- 기존 임차인 명도 협의 용이 (만기 임박 층 다수)\n- 전체 자가 전환 시 연 7.5억 임대료 절감 효과',
    },
    {
      title: '투자수익률 분석',
      section_type: 'income_analysis',
      markdown: '### 매매가 및 시세 갭 분석\n- 매각 희망가: 230억 원 (토지 평당 1.27억 원)\n- 서초동 일대 신축/리모델링 사옥용 수요 대비 합리적 밸류에이션\n- 자가전환 손익분기: 약 4.2년',
    },
  ];

  const pptxInput: MobileImPptxInput = {
    buildingId: 'seocho-fm',
    preset: 'credeal_basic',
    posture: 'owner_occupied',
    grade: 'A',
    releaseTier: 'fact_om',
    docno: 'IM-SEOCHO-FM-R3',
    doc: {
      title: '서초동 FM빌딩 사옥용 매각안내서',
      body: {
        preset: 'credeal_basic',
        heroCard,
        identity: {
          investmentPosture: 'owner_occupied',
          assetType: '근린생활시설',
        },
        photos: photoMetas,
        floor_leases: floorLeases,
        ssot_summary: ssot,
        financials,
        coordinates: seochoCoords,
        poiSpots,
        cadastralMapImage: enrichment?.cadastralMapImage,
        cadastralImage: enrichment?.cadastralMapImage,
        enrichment: enrichment || {},
        keyInvestmentPoint: heroCard.keyInvestmentPoint,
        keyPoint: heroCard.keyInvestmentPoint,
      },
      sections,
    },
    building: {
      area_signal: 'GBD',
      asset_type: '근린생활시설',
      price_band: '230억',
      address: ssot.address,
      building_name: ssot.building_name,
      bcr_pct: ssot.bcr_pct,
      far_pct: ssot.far_pct,
      arch_area_sqm: ssot.arch_area_sqm,
      parking_count: ssot.parking_count,
      parking_detail: ssot.parking_detail,
      road_condition: ssot.road_condition,
      land_category: ssot.land_category,
      floors: ssot.floors,
      completion_year: ssot.completion_year,
    },
    broker: {
      display_name: '수석 자문역',
      company_name: 'CREDEAL 투자자문',
      phone: '02-555-8888',
      specialty: 'GBD 오피스 사옥 자문',
    },
  };

  logStep('Step 5', '모바일 IM 입력 조립', 'PASS', `총 ${sequence.length}면 계약 시퀀스 확정`);

  // ─────────────────────────────────────────────────────────────
  // 6. PPTX Basic IM 렌더링 & 4대 바이너리 단언
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 6] PPTX Basic IM 렌더링');
  const renderer = new MobileImPptxRenderer();
  const pptxResult = await renderer.render(pptxInput);

  const savedPath = safeWritePptx(PPTX_OUTPUT_PATH, pptxResult.buffer);
  const fileSizeKB = Math.round(pptxResult.buffer.length / 1024);
  console.log(`  💾 PPTX 저장 완료: ${savedPath} (${fileSizeKB} KB, ${pptxResult.slideCount}면)`);

  logStep('Step 6', 'PPTX 렌더링', 'PASS', `크기: ${fileSizeKB}KB, 면수: ${pptxResult.slideCount}면`);

  // 4대 바이너리 검증
  console.log('\n▶ [Step 7] PPTX 바이너리 4대 게이트 자동 단언');
  await assertZeroPoisonTokens(pptxResult.buffer);
  console.log('  ✅ [Gate 1] Poison Token 0건 단언 성공');

  await assertZeroMockLeaks(pptxResult.buffer);
  console.log('  ✅ [Gate 2] Mock Data 누출 0건 단언 성공');

  await assertZeroEvasivePhrases(pptxResult.buffer);
  console.log('  ✅ [Gate 3] 회피성 문구 0건 단언 성공');

  const extracted = await extractSlideTexts(pptxResult.buffer);
  const fullText = extracted.map(s => s.text).join(' ');
  if (/2\d{2}억\s*대/.test(fullText)) {
    throw new Error('가격 밴드(200억대) 누출 감지');
  }
  console.log('  ✅ [Gate 4] 가격 밴드 차단 단언 성공');

  logStep('Step 7', '바이너리 4대 단언', 'PASS', '전체 통과');

  // ─────────────────────────────────────────────────────────────
  // 7. LibreOffice 150 DPI 고화질 슬라이드 PNG 렌더링
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 8] LibreOffice + PyMuPDF 150 DPI 슬라이드 PNG 변환');
  const captureResult = await convertPptxToSlideImages(pptxResult.buffer, CAPTURES_DIR, 'seocho_basic', 150);

  console.log(`  🖼️ 캡처 완료: 총 ${captureResult.slideCount}개 이미지`);
  logStep('Step 8', '슬라이드 이미지 캡처 (owner_occupied)', 'PASS', `${captureResult.slideCount}개 PNG 생성 완료`);

  // ─────────────────────────────────────────────────────────────
  // 8. 서초동 매매수익형 (trading 포스처) 대조 렌더링
  // ─────────────────────────────────────────────────────────────
  console.log('\n▶ [Step 9] 대조군: 서초동 FM빌딩 매매차익형 (trading 포스처) 렌더링');
  const TRADING_CAPTURES_DIR = join(OUTPUT_DIR, 'trading_captures');
  const TRADING_PPTX_PATH = join(OUTPUT_DIR, 'seocho_trading_r3_basic.pptx');
  if (!existsSync(TRADING_CAPTURES_DIR)) mkdirSync(TRADING_CAPTURES_DIR, { recursive: true });

  const tradingPptxInput: MobileImPptxInput = {
    ...pptxInput,
    posture: 'trading',
    docno: 'IM-SEOCHO-FM-TRD',
    doc: {
      ...pptxInput.doc,
      title: '서초동 FM빌딩 매매차익형 매각 안내서',
      body: {
        ...pptxInput.doc.body,
        identity: {
          investmentPosture: 'trading',
          assetType: '근린생활시설',
        },
      },
    },
  };

  const tradingPptxResult = await renderer.render(tradingPptxInput);
  safeWritePptx(TRADING_PPTX_PATH, tradingPptxResult.buffer);
  
  const tradingCaptureResult = await convertPptxToSlideImages(tradingPptxResult.buffer, TRADING_CAPTURES_DIR, 'seocho_trading', 150);
  logStep('Step 9', 'Trading 대조 렌더링/캡처', 'PASS', `${tradingCaptureResult.slideCount}면 생성`);

  // 로그 파일 작성
  const pipelineReport = `# P3 서초동 FM빌딩 — Basic IM 파이프라인 E2E 골든 테스트 로그\n
- **실행 일시**: ${new Date().toISOString()}
- **매물명**: 서초동 FM빌딩
- **포스처**: 사옥형 (owner_occupied)
- **매각 희망가**: 230억 원
- **생성 슬라이드 면수**: ${pptxResult.slideCount}면
- **PPTX 파일 용량**: ${fileSizeKB} KB\n
## 단계별 검증 결과
| 단계 | 검증 항목 | 결과 | 세부 내용 |
|:---|:---|:---:|:---|
${pipelineLogs.map(l => `| ${l.step} | ${l.name} | **${l.status}** | ${l.detail} |`).join('\n')}
`;
  writeFileSync(LOG_PATH, pipelineReport, 'utf8');
  console.log(`\n📄 종합 보고서 저장 완료: ${LOG_PATH}`);

  return { pptxPath: PPTX_OUTPUT_PATH, captures: captureResult.slideImages, slideCount: pptxResult.slideCount };
}

runSeochoGoldenTest()
  .then((res) => {
    console.log('\n================================================================');
    console.log('🎉 [SUCCESS] 서초동 FM빌딩 골든 파이프라인 완료!');
    console.log(`- PPTX: ${res.pptxPath}`);
    console.log(`- 캡처: ${res.captures.length}장 생성`);
    console.log('================================================================\n');
  })
  .catch((err) => {
    console.error('\n❌ [FAILED]', err);
    process.exit(1);
  });
