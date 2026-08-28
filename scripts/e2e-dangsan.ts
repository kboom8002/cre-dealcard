/**
 * E2E 테스트: 당산동 근생빌딩 — 실물 데이터 기반 전체 파이프라인
 *
 * Phase 1: building_ssot_lite + supplemental 구성 (사용자 제공 정밀 메모)
 * Phase 2: PNU 해석 → 공공 API 7종 병렬 조회 → ExternalDataSnapshot
 * Phase 3: generateMobileIM() → 7섹션 마크다운 + heroCard
 * Phase 4: MobileImPptxRenderer.render() → PPTX
 * Phase 5: 검증
 *
 * 실행: npx tsx scripts/e2e-dangsan.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// env loaded via: npx tsx -r dotenv/config scripts/e2e-dangsan.ts
import fs from 'fs';
import path from 'path';

// ── 파이프라인 모듈 ──
import { resolveAddress } from '../src/lib/external/address-resolver';
import { enrichBuildingDataCore } from '../src/lib/external/enrich-by-pnu';
import { generateMobileIM } from '../src/domain/building/mobile-im/writer';
import type { MobileIMWriterInput, MobileIMSupplementalInput, FloorLeaseInput, ExternalDataSnapshot } from '../src/domain/building/mobile-im/types';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';

const OUT_DIR = path.resolve(__dirname, '../docs/uat1/pptx-outputs');
const SECTIONS_OUT = path.resolve(__dirname, '../docs/uat1/pptx-outputs/dangsan_sections.json');
const PPTX_OUT = path.resolve(OUT_DIR, 'dangsan_income_basic_B.pptx');

// ═══════════════════════════════════════════════════════════════
// Phase 1: 데이터 구성 (사용자 제공 정밀 모드 증분 메모 기반)
// ═══════════════════════════════════════════════════════════════

const RAW_ADDRESS = '서울 영등포구 당산동';

/** SSoT flat 구조 — 딜카드 핸드오프에서 넘어오는 형태 */
const building_ssot_lite: Record<string, unknown> = {
  id: 'e2e_dangsan_001',
  building_ssot_lite_id: 'e2e_dangsan_001',

  // 3축 식별
  area_signal: '당산',
  asset_type: '근생빌딩',
  price_band: '120억원',
  price_band_krw: 12_000_000_000,
  size_signal: '1,441㎡',
  vacancy_signal: '0%',           // 자가 포함 기준 만실
  total_area_sqm: 1441.15,
  current_use_signal: '근린생활시설',
  address: RAW_ADDRESS,
  raw_address: RAW_ADDRESS,

  // 투자 관점
  fit_summary: '임대료 현실화 47.3% 여력 — 현 월세 1,946만→기준단가 재산정 2,867만. 역세권 입지 + 배후 아파트 밀집.',
  caution_summary: '상가임대차보호법 적용 호실 존재(3F·4F, 갱신요구권 5~7년 잔여). 구분등기 구조(형제 2인 공동). 근저당 잔액 ~13억 확인 필요.',

  // 물리 데이터 (사용자 제공 building JSON)
  building_area_sqm: 263.01,
  building_coverage: 51.9,
  gross_area: 1441.15,
  above_ground_area: 1123.93,
  far_above_ground: 221.8,
  far_total: 284.4,
  floors: '지하 1층 ~ 지상 5층',
  approval_year: 2002,
  parking_type: '자주식',
  parking_count: 8,
  elevator_count: 1,
  building_condition: '양호 — 관리 상태 우수',

  // 토지 (사용자 제공 land JSON)
  parcel_count: 1,
  ledger_area_sqm: 506.8,
  effective_area_sqm: 506.8,
  jimok: '대',
  use_area: '준공업지역',

  // 용도지역 촉매 (사용자 제공 zoning JSON)
  zoning_catalyst: '서울시 준공업지역 제도개선 방안(2024.10) — 지구단위계획 수립 시 주거용도 용적률 상한 400%',
};

/** 층별 임대차 — 8호실 (사용자 제공 leaseRoll) */
const floor_leases: FloorLeaseInput[] = [
  { floor: 'B1',    tenant_type: '데이르 카페 (자가)',    area_pyeong: 96,   deposit_manwon: 0,     rent_manwon: 0,   note: '소유주 직접 사용. 임대 전환 시 약 300만원/월 가능' },
  { floor: '1F-101', tenant_type: '늘푸른약국',           area_pyeong: 15.2, deposit_manwon: 5000,  rent_manwon: 120, lease_start: '2014-09-01', note: '갱신요구권 소진(11년). 재계약 가능. 인상률 상한 없음' },
  { floor: '1F-102', tenant_type: '로뎀나무내과 (1F)',    area_pyeong: 22.5, deposit_manwon: 5000,  rent_manwon: 200, lease_start: '2014-09-01', note: '1F+2F+5F 통합 임차. 전체 월세 60%' },
  { floor: '2F',     tenant_type: '로뎀나무내과 (2F)',    area_pyeong: 67.8, deposit_manwon: 10000, rent_manwon: 476, lease_start: '2014-09-01', note: '1F+2F+5F 통합 임차' },
  { floor: '3F',     tenant_type: '헬쓰장',              area_pyeong: 67.8, deposit_manwon: 5000,  rent_manwon: 300, lease_start: '2021-01-01', note: '갱신요구권 5~7년 잔여. 환산보증금 9억 이하 → 상가법 전면 적용. 5% 상한' },
  { floor: '4F-401', tenant_type: '국제와인',             area_pyeong: 42.7, deposit_manwon: 3000,  rent_manwon: 260, lease_start: '2022-01-01', lease_end: '2025-04-30', note: '갱신요구권 존재. 만기 경과(25.4.30). 계획: 260→306만(17.7% 인상)이나 갱신 시 5% 상한=273만 최대. 매도인 확인 필요' },
  { floor: '4F-402', tenant_type: '자가 사무실',         area_pyeong: 25.1, deposit_manwon: 0,     rent_manwon: 0,   note: '소유주 직접 사용. 임대 전환 시 약 302만원/월 가능' },
  { floor: '5F',     tenant_type: '로뎀나무내과 (5F)',    area_pyeong: 67.8, deposit_manwon: 6000,  rent_manwon: 590, lease_start: '2014-09-01', note: '1F+2F+5F 통합 임차' },
];

/** 보충 입력 */
const supplemental: MobileIMSupplementalInput = {
  resolved_address: RAW_ADDRESS,
  monthly_rent_total_krw: 19_460_000,    // 1,946만원
  vacancy_pct: 0,
  vacancy_status: '만실 (자가 2호실 포함)',
  total_deposit_manwon: 34000,           // 보증금 합계 3.4억
  asking_price_manwon: 1_200_000,        // 120억 = 1,200,000만원
  broker_highlight: '임대료 현실화 47.3% 여력. 기준층(3F) 단가 62.4천원/평 재산정 시 월세 2,867만원 가능.',
  floor_leases,
  investmentPosture: 'income',
  total_floor_count: 6,                  // B1~5F
  building_age_years: 23,                // 2002 준공
  photo_urls: [],
};

// ═══════════════════════════════════════════════════════════════
// Phase 2: PNU 해석 → 공공 API 조회
// ═══════════════════════════════════════════════════════════════

async function enrichFromAPIs(): Promise<ExternalDataSnapshot> {
  console.log('\n══ Phase 2: PNU 해석 + 공공 API 조회 ══');

  // Step 1: 주소 → PNU 해석
  console.log('[1/2] 주소 해석 중...', RAW_ADDRESS);
  const resolved = await resolveAddress(RAW_ADDRESS);
  if (!resolved) {
    console.warn('⚠ 주소 해석 실패 — 정적 외부 데이터로 폴백');
    return buildStaticExternalData();
  }
  console.log(`  PNU: ${resolved.pnu}`);
  console.log(`  도로명: ${resolved.roadAddress}`);
  console.log(`  좌표: ${resolved.lat}, ${resolved.lng}`);

  // Step 2: 7개 API 병렬 호출
  console.log('[2/2] 공공 API 7종 병렬 호출 중...');
  const enrichResult = await enrichBuildingDataCore(
    resolved,
    RAW_ADDRESS,
    'e2e_dangsan_001',
  );

  console.log(`  건축물대장: ${enrichResult.buildingRegister ? '✅' : '❌'}`);
  console.log(`  공시지가: ${enrichResult.landPrice ? '✅' : '❌'}`);
  console.log(`  토지이용: ${enrichResult.landUsePlan ? '✅' : '❌'}`);
  console.log(`  실거래가: ${(enrichResult.comparableTransactions as any[])?.length ?? 0}건`);
  console.log(`  POI: ${enrichResult.locationPoi ? '✅' : '❌'}`);
  console.log(`  등기: ${enrichResult.registryData ? '✅' : '❌'}`);
  console.log(`  상권: ${enrichResult.commercialDistrict ? '✅' : '❌'}`);
  console.log(`  지도: ${enrichResult.mapImageUrl ? '✅' : '❌'}`);
  if (enrichResult.errors.length > 0) {
    console.warn('  API 오류:', enrichResult.errors.map(e => `${e.api}: ${e.message}`).join(', '));
  }

  // ExternalDataSnapshot 형태로 변환
  const snapshot: ExternalDataSnapshot = {
    resolvedAddress: {
      pnu: resolved.pnu,
      lat: resolved.lat ?? undefined,
      lng: resolved.lng ?? undefined,
      roadAddress: resolved.roadAddress,
    },
    buildingRegister: enrichResult.buildingRegister as any,
    landPrice: enrichResult.landPrice as any,
    landUsePlan: enrichResult.landUsePlan as any,
    comparableTransactions: enrichResult.comparableTransactions as any,
    locationPoi: enrichResult.locationPoi as any,
    mapImageUrl: enrichResult.mapImageUrl,
    registryData: enrichResult.registryData as any,
    commercialDistrict: enrichResult.commercialDistrict as any,
    enrichedAt: enrichResult.enrichedAt,
    errors: enrichResult.errors,
  };

  return snapshot;
}

/** 폴백: API 호출 실패 시 사용자 제공 데이터로 정적 구성 */
function buildStaticExternalData(): ExternalDataSnapshot {
  return {
    resolvedAddress: {
      lat: 37.5340, lng: 126.9027,
      roadAddress: '서울 영등포구 당산로',
    },
    buildingRegister: {
      totalArea: 1441.15,
      platArea: 506.8,
      useAprDay: '20020000',
      mainPurpose: '근린생활시설',
      structure: '철근콘크리트구조',
      floorsAbove: 5, floorsBelow: 1,
      bcRat: 51.9, vlRat: 284.4,
      archArea: 263.01,
      elevatorCount: 1,
      parkingCount: 8,
    },
    landUsePlan: {
      zoningDistrict: '준공업지역',
      zoningOverlap: [],
      buildingCoverageMax: 60,
      floorAreaRatioMax: 400,
    },
    landPrice: { pricePerSqm: 5500000, baseYear: '2024' },
    locationPoi: {
      nearestStation: { name: '당산역', distanceM: 380, walkMinutes: 5 },
      poiCounts: { subway: 1, busStop: 4, cafe: 12, parking: 3, restaurant: 20, convenience: 8 },
    },
    comparableTransactions: [],
    enrichedAt: new Date().toISOString(),
    errors: [],
  };
}

// ═══════════════════════════════════════════════════════════════
// Phase 3: Mobile IM 생성
// ═══════════════════════════════════════════════════════════════

async function generateIM(externalData: ExternalDataSnapshot) {
  console.log('\n══ Phase 3: Mobile IM 생성 (LLM 호출 포함) ══');

  const input: MobileIMWriterInput = {
    building_ssot_lite: building_ssot_lite as any,
    supplemental,
    readiness: { score: 85, missing: [] },
    external_data: externalData,
    dataGrade: 'B',
    dcfEligible: false,
    onProgress: (section) => {
      console.log(`  [${section.section_order}] ${section.section_type} — ${section.confidence} (${section.markdown.length}자)`);
    },
  };

  const result = await generateMobileIM(input);

  console.log(`\n  ✅ IM 생성 완료`);
  console.log(`  섹션 수: ${result.sections.length}`);
  console.log(`  AI 사용: ${result.ai_used}`);
  console.log(`  heroCard.askingPrice: ${result.heroCard?.askingPriceDisplay}`);
  console.log(`  heroCard.capRate: ${result.heroCard?.capRateBase}`);
  console.log(`  heroCard.noiBaseBil: ${result.heroCard?.noiBaseBil}`);
  console.log(`  publishBlocked: ${result.publishBlocked}`);

  // 중간 산출물 저장
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const sectionsJson = {
    generatedAt: result.generated_at,
    aiUsed: result.ai_used,
    heroCard: result.heroCard,
    financials: result.financials,
    sectionCount: result.sections.length,
    sections: result.sections.map(s => ({
      section_type: s.section_type,
      section_order: s.section_order,
      title: s.title,
      confidence: s.confidence,
      markdownLength: s.markdown.length,
      markdown: s.markdown,
      judge_score: s.judge_score,
    })),
  };
  fs.writeFileSync(SECTIONS_OUT, JSON.stringify(sectionsJson, null, 2), 'utf-8');
  console.log(`  sections.json → ${SECTIONS_OUT}`);

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Phase 4: PPTX 렌더링
// ═══════════════════════════════════════════════════════════════

async function renderPptx(imResult: any, externalData: ExternalDataSnapshot) {
  console.log('\n══ Phase 4: PPTX 렌더링 ══');

  const renderer = new MobileImPptxRenderer();
  const pptxResult = await renderer.render({
    buildingId: 'e2e_dangsan_001',
    preset: 'credeal_signature',
    posture: 'income' as const,
    grade: 'B' as const,
    incomeArchetype: 'R-INC-02' as const,   // 임대료 정상화형
    docno: 'E2E-DANGSAN',
    doc: {
      title: '당산동 근생빌딩 투자설명서',
      body: {
        heroCard: imResult.heroCard,
        photo_urls: [],
        coordinates: externalData.resolvedAddress
          ? { lat: externalData.resolvedAddress.lat, lng: externalData.resolvedAddress.lng }
          : null,
        mapImageUrl: externalData.mapImageUrl,
      },
      sections: imResult.sections,
    },
    building: {
      area_signal: '당산',
      asset_type: '근생빌딩',
      price_band: '120억원',
    },
    broker: {
      display_name: '홍길동',
      company_name: '크리딜',
    },
  } as any);

  fs.writeFileSync(PPTX_OUT, pptxResult.buffer);
  console.log(`  ✅ PPTX 생성 완료`);
  console.log(`  슬라이드: ${pptxResult.slideCount}장`);
  console.log(`  파일 크기: ${Math.round(pptxResult.fileSizeBytes / 1024)}KB`);
  console.log(`  경고: ${pptxResult.warnings.length}건`, pptxResult.warnings);
  console.log(`  → ${PPTX_OUT}`);

  return pptxResult;
}

// ═══════════════════════════════════════════════════════════════
// Phase 5: 검증
// ═══════════════════════════════════════════════════════════════

function validate(imResult: any, pptxResult: any) {
  console.log('\n══ Phase 5: 검증 ══');
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  // IM 검증
  checks.push({
    name: 'IM 섹션 수 ≥ 7',
    pass: imResult.sections.length >= 7,
    detail: `${imResult.sections.length}개`,
  });

  checks.push({
    name: 'heroCard.askingPrice 존재',
    pass: !!imResult.heroCard?.askingPriceDisplay,
    detail: imResult.heroCard?.askingPriceDisplay ?? 'null',
  });

  // 월세 합계 정합성 (섹션 마크다운에서 1,946 또는 1946 검색)
  const allMarkdown = imResult.sections.map((s: any) => s.markdown).join('\n');
  const hasRentTotal = allMarkdown.includes('1,946') || allMarkdown.includes('1946');
  checks.push({
    name: '월세 합계 1,946만원 포함',
    pass: hasRentTotal,
    detail: hasRentTotal ? '포함' : '미포함 — 데이터 바인딩 확인 필요',
  });

  // 임대료 현실화 표시
  const hasNormalization = allMarkdown.includes('47.3') || allMarkdown.includes('현실화') || allMarkdown.includes('정상화');
  checks.push({
    name: '임대료 현실화 여력 표시',
    pass: hasNormalization,
    detail: hasNormalization ? '포함' : '미포함',
  });

  // PPTX 검증
  checks.push({
    name: 'PPTX 슬라이드 ≥ 7',
    pass: pptxResult.slideCount >= 7,
    detail: `${pptxResult.slideCount}장`,
  });

  checks.push({
    name: 'PPTX 파일 > 100KB',
    pass: pptxResult.fileSizeBytes > 100_000,
    detail: `${Math.round(pptxResult.fileSizeBytes / 1024)}KB`,
  });

  checks.push({
    name: '경고 0건',
    pass: pptxResult.warnings.length === 0,
    detail: pptxResult.warnings.length > 0 ? pptxResult.warnings.join(', ') : 'OK',
  });

  // 결과 출력
  console.log('');
  const passCount = checks.filter(c => c.pass).length;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }
  console.log(`\n  결과: ${passCount}/${checks.length} PASS`);

  if (passCount < checks.length) {
    console.error('\n  ⚠ 일부 검증 실패 — 위 항목 확인 필요');
    process.exitCode = 1;
  }
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  E2E 테스트: 당산동 근생빌딩 (RENT_NORMALIZATION) ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`시각: ${new Date().toISOString()}`);

  // Phase 1: 데이터 구성 (위에서 상수로 정의)
  console.log('\n══ Phase 1: 데이터 구성 완료 ══');
  console.log(`  building_ssot_lite: ${Object.keys(building_ssot_lite).length}개 필드`);
  console.log(`  supplemental.floor_leases: ${floor_leases.length}호실`);
  console.log(`  가격: ${building_ssot_lite.price_band}`);

  // Phase 2: 공공 API
  let externalData: ExternalDataSnapshot;
  try {
    externalData = await enrichFromAPIs();
  } catch (err: any) {
    console.warn(`\n⚠ 공공 API 전체 실패: ${err.message}`);
    console.warn('  → 정적 외부 데이터로 폴백');
    externalData = buildStaticExternalData();
  }

  // Phase 3: IM 생성
  const imResult = await generateIM(externalData);

  // Phase 4: PPTX
  const pptxResult = await renderPptx(imResult, externalData);

  // Phase 5: 검증
  validate(imResult, pptxResult);
}

main().catch((e) => {
  console.error('\n💥 E2E 테스트 실패:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
});
