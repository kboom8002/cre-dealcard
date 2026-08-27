/**
 * 양평동 더레드빌딩 Executive Gold PPTX IM v4 — 골디락스 파이프라인
 * 
 * Phase 1~5 적용:
 * - 골디락스 단일 시퀀스 (tier 폐지)
 * - enrichment 필드 직접 주입 (V-World 데이터 바인딩)
 * - 건물 이미지 5장 base64 인코딩
 * - 공공 API 데이터 보강 (건축물대장 + 토지이용계획 + 공시지가)
 * - 카카오 지도 좌표 + 정적 URL
 * 
 * 실행: npx tsx src/tests/e2e/generate-yangpyeong-gold.ts
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';

const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'pptx-output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

function loadImageBase64(absPath: string): string {
  const buf = readFileSync(absPath);
  const ext = extname(absPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const IMG_DIR = join(
  process.env.USERPROFILE || 'C:\\Users\\User',
  '.gemini', 'antigravity', 'brain',
  'a489fe9e-be7e-4b38-948e-93d1a1ca0e35',
  '.user_uploaded'
);

const IMAGE_FILES = [
  { file: 'media_1787802462856.jpg', type: 'exterior', label: '건물 외관', caption: '더레드빌딩 정면 전경 (양평로 대로변)', role: 'cover', isHero: true },
  { file: 'media_1787802548948.png', type: 'aerial', label: '항공 조감', caption: '양평동 일대 항공뷰 (한강 조망)', role: 'exterior', isHero: false },
  { file: 'media_1787802564691.png', type: 'interior', label: '오피스 내부', caption: '임차 공간 오피스 인테리어 (자연채광)', role: 'general', isHero: false },
  { file: 'media_1787802582713.png', type: 'rooftop', label: '옥상 테라스', caption: '옥상 테라스 한강뷰 (주간)', role: 'general', isHero: false },
  { file: 'media_1787802594707.png', type: 'rooftop', label: '옥상 야경', caption: '옥상 테라스 조경 (야간 조명)', role: 'general', isHero: false },
];

function buildPhotos(): any[] {
  return IMAGE_FILES.map((img, idx) => {
    const absPath = join(IMG_DIR, img.file);
    if (!existsSync(absPath)) {
      console.warn('⚠️ img not found: ' + absPath);
      return null;
    }
    const base64Url = loadImageBase64(absPath);
    return {
      url: base64Url,
      type: img.type,
      label: img.label,
      caption: img.caption,
      order: idx + 1,
      role: img.role,
      isHero: img.isHero,
      buildingId: 'yangpyeong-gold-v4',
    };
  }).filter(Boolean);
}

// ══════════════════════════════════════════════════
// V-World 공공 API 시뮬레이션 enrichment 데이터
// (실제 handler.ts 경유 시 자동 주입, 여기서는 직접 구성)
// ══════════════════════════════════════════════════
const enrichment = {
  // 토지이용계획 (V-World API)
  landUsePlan: {
    pnu: '1156010100104440000',
    zoning: '준공업지역',
    maxFloorAreaRatio: 400,
    maxBuildingCoverageRatio: 60,
    landUseRestrictions: ['제2종지구단위계획구역 (영등포구 양평지구)'],
    otherRegulations: ['지구단위계획구역', '대로변(양평로) 가로구역별 최고높이 제한'],
    _source: 'vworld_api',
  },
  // 공시지가 (V-World API)
  landPrice: {
    pnu: '1156010100104440000',
    officialPricePerM2: 5_870_000,
    baseYear: 2025,
    totalLandArea: 518.7,
    totalOfficialPrice: Math.round(518.7 * 5_870_000),
    priceChangePct: 3.2,
    _source: 'vworld_api',
  },
  // 건축물대장 (국토교통부 API)
  buildingRegister: {
    mainPurpose: '업무시설',
    structure: '철근콘크리트구조',
    roofStructure: '평지붕(콘크리트)',
    totalGrossArea: 2490.88,
    buildingCoverageRatio: 51.6,
    floorAreaRatio: 398.8,
    completionDate: '2018-09-14',
    elevatorCount: 1,
    parkingCount: 23,
    selfParkingCount: 1,
    mechanicalParkingCount: 22,
    floors: { underground: 1, aboveground: 10 },
    heatMethod: '개별난방 (도시가스)',
    archArea: 267.67,
    _source: 'gov_api',
  },
  // 등기부등본 데이터
  registryData: {
    ownerName: '(확인 필요)',
    ownershipType: '단독소유',
    acquisitionDate: '(확인 필요)',
    encumbrances: [],
    liens: [],
    _source: 'registry_api',
  },
  // 비교사례 (실거래가 RTMS)
  comparableTransactions: [
    { address: '영등포구 양평동4가 인근', dealDate: '2024-03', priceManwon: 228_000, areaM2: 2100, pricePerPyeong: 3580, assetType: '사무실', _source: 'rtms_api' },
    { address: '영등포구 양평동3가', dealDate: '2024-06', priceManwon: 195_000, areaM2: 1850, pricePerPyeong: 3475, assetType: '사무실', _source: 'rtms_api' },
    { address: '영등포구 문래동3가', dealDate: '2024-09', priceManwon: 310_000, areaM2: 3200, pricePerPyeong: 3193, assetType: '업무시설', _source: 'rtms_api' },
  ],
  // 상권분석 (소상공인시장진흥공단)
  commercialDistrict: {
    districtName: '양평동 선유도역 오피스 상권',
    totalEstablishments: 1842,
    avgMonthlySales: 5200,
    openingRate: 12.3,
    closingRate: 8.7,
    dominantCategory: '지식서비스업',
    _source: 'semas_api',
  },
  // 카카오 지도 POI
  locationPoi: {
    keySpots: [
      { name: '선유도역 4번출구', distance: '80m', category: '지하철', walkMin: 1 },
      { name: '양화대교', distance: '500m', category: '도로' },
      { name: '선유도공원', distance: '600m', category: '공원', walkMin: 8 },
      { name: '합정역', distance: '1.2km', category: '지하철', walkMin: 15 },
      { name: 'CGV 여의도', distance: '2km', category: '편의시설' },
    ],
    _source: 'kakao_api',
  },
  // 지적도는 WMS URL 시뮬레이션 (실제: base64 이미지)
  cadastralMapImage: null,
};

const yangpyeongDoc = {
  title: '선유도역 초역세권 신축 오피스빌딩(더레드빌딩) 투자설명서',
  body: {
    photos: [] as any[],
    photo_urls: [] as string[],
    heroCard: {
      askingPriceDisplay: '250.0억 원',
      capRateBase: 2.41,
      noiBaseBil: 6.02,
      equityRequiredBil: 125.0,
      leveragedYieldPct: 3.85,
      posture: 'income',
      landAreaM2: 518.7,
      totalGrossAreaM2: 2490.88,
      zoning: '준공업지역',
      keyInvestmentPoint: '2018년 신축 자산 · IT·회계 등 11개 법인 분산 만실 · 지하 리스업 시 2.71%',
      yieldBasis: 'noi_price',
    },
    identity: { investmentPosture: 'income', assetType: '사무용빌딩' },
    coordinates: { lat: 37.5345, lng: 126.8935 },
    mapImageUrl: 'https://map.kakao.com/link/map/더레드빌딩,37.5345,126.8935',
    address: '서울특별시 영등포구 양평동4가 117',
    pnu: '1156010100104440000',
    // Phase 2: enrichment 필드 직접 주입 — V-World/공공 API 원본 데이터
    enrichment,
    external_data: {
      enrichedAt: new Date().toISOString(),
      hasPublicData: true,
      address: '서울특별시 영등포구 양평동4가 117',
      errors: [],
      fallbackStatus: {
        buildingRegister: false,
        landPrice: false,
        landUsePlan: false,
        locationPoi: false,
      },
    },
    dataGrade: 'A',
    dataCompleteness: {
      buildingRegister: true,
      buildingRegisterSource: 'loaded',
      qualityGrade: 'A',
      pptxExportAllowed: true,
      generatedAt: new Date().toISOString(),
    },
  },
  sections: [
    {
      title: '물건 개요', section_type: 'property_overview',
      markdown: `### 서울특별시 영등포구 양평동4가 117, 134, 125-2 (3필지 통합)\n- **대지면적**: 156.91평 (518.7㎡)\n- **연면적**: 전체 753.49평 (2,490.88㎡) / 지상 625.75평 (2,068.60㎡)\n- **건축규모**: 지하 1층 ~ 지상 10층 (철근콘크리트, 승강기 1대, 옥외1+기계식22대 주차)\n- **준공연도**: 2018년 9월\n- **용적률 현황**: 지상 연면적 기준 **398.8%** (준공업지역 법정 상한 400% 근접)\n- **거래 형태**: 매매희망가 250억 원\n- **구조**: 철근콘크리트 구조 / 평지붕(콘크리트)\n- **건폐율**: 51.6%\n\n| 구분 | 대지면적 | 연면적 (전체) | 지상 용적률 | 준공연도 | 주용도 |\n|---|---|---|---|---|---|\n| 본건 | 156.91평 | 753.49평 | 398.8% | 2018.09 | 업무시설 |`,
    },
    {
      title: '입지 및 교통 접근성', section_type: 'location_access',
      markdown: `### 선유도역 9호선 역세권 및 대로변\n- **역세권**: 선유도역 4번 출구 도보 1분(80m) 대로변 직결\n- **도로망**: 올림픽대로, 서부간선도로, 양화대교 초인접\n- **버스 노선**: 양평역 정류장 도보 3분 — 6개 노선\n- **오피스 수요**: 영등포 벤처밸리 및 여의도 금융업 배후 수요 지속 유입\n- **주변 환경**: 선유도공원(600m), 한강 조망 확보, 양평로 대로변 가시성`,
    },
    {
      title: '토지 현황', section_type: 'land_overview',
      markdown: `### 토지 이용 및 공시지가\n- **소재지**: 서울특별시 영등포구 양평동4가 117번지 외 2필지\n- **대지면적**: 518.7㎡ (156.91평)\n- **용도지역**: 준공업지역\n- **법정 용적률 상한**: 400% (현 398.8% — 상한 근접)\n- **법정 건폐율 상한**: 60% (현 51.6%)\n- **지구단위계획**: 제2종 지구단위계획구역 (영등포구 양평지구)\n- **2025년 공시지가**: 5,870,000원/㎡ (전년 대비 +3.2%)\n- **공시지 총액**: 약 30.4억 원\n- **토지 이용 제한**: 지구단위계획구역, 대로변 최고높이 제한`,
    },
    {
      title: '건물 개요', section_type: 'building_overview',
      markdown: `### 건축물대장 기준 건물 제원\n- **주용도**: 업무시설 (사무용빌딩)\n- **구조**: 철근콘크리트구조 / 평지붕(콘크리트)\n- **규모**: 지하 1층 ~ 지상 10층\n- **연면적**: 2,490.88㎡ (753.49평)\n- **건축면적**: 267.67㎡ (80.97평)\n- **건폐율**: 51.6% / **용적률**: 398.8%\n- **준공일**: 2018년 9월 14일 (만 8년차)\n- **승강기**: 승객용 1대\n- **주차장**: 옥외 자주식 1대 + 기계식 22대 = 총 23대\n- **난방**: 개별난방 (도시가스)`,
    },
    {
      title: '임대차 현황', section_type: 'lease_status',
      markdown: `### 11개 기업 다각화 분산 임차\n- **보증금 총액**: 5억 3,500만 원 | **월 임대료 총액**: 5,017만 원 (관리비 648만 별도)\n- **공실 현황**: 17.0% (지하 1층 127.7평만 리스업 대기)\n- **임차인 구성**: 디자인스튜디오, IT, 회계법인, 무역상사, 이커머스, 컨설팅 등\n- **상임법 분석**: 11개 호실 전원 환산보증금 9억 이하\n\n| 층 | 임차인 | 면적(평) | 보증금 | 월세(만) | 비고 |\n|---|---|---:|---:|---:|---|\n| B1 | (공실) | 127.7 | - | - | 리스업 대기 |\n| 1F | 디자인스튜디오A | 32.5 | 3,000만 | 220 | |\n| 2F | IT법인B | 55.2 | 5,000만 | 410 | |\n| 3F | 회계법인C | 62.8 | 6,000만 | 480 | |\n| 4F | 무역상사D | 58.3 | 5,500만 | 435 | |\n| 5F | 이커머스E | 61.4 | 5,000만 | 425 | |\n| 6F | 컨설팅F | 55.7 | 5,000만 | 400 | |\n| 7F | IT법인G | 45.8 | 4,000만 | 370 | |\n| 8F | 디자인스튜디오H | 42.3 | 4,000만 | 350 | |\n| 9F | 무역상사I | 38.5 | 3,500만 | 330 | |\n| 10F | 마케팅J | 35.8 | 3,000만 | 297 | |\n| 10F(일부) | 컨설팅K | 22.6 | 2,500만 | 300 | |`,
    },
    {
      title: '수익성 분석', section_type: 'income_analysis',
      markdown: `### 현행 연 순수익률(Cap Rate) 2.41% + 지하 공실 리스업 시 2.71%\n- **현재 연 순수익률(Cap Rate)**: **2.41%** (연간 확정 임대수입 6억 204만 원)\n- **지하 1층(127.7평) 리스업 시**: 월 +638만 원 → **5,655만 원** (+12.7%)\n- **잠재 연 순수익률(Cap Rate)**: **2.71%** (연간 6억 7,860만 원)\n- **연 순수익률 산출 기준**: NOI(순영업소득) ÷ 매매가격\n\n> 기준: 순영업소득(NOI) / 매각 희망가 250억 원`,
    },
    {
      title: '자본 구조', section_type: 'capital_structure',
      markdown: `### 자금 조달 구조 (250억 원 기준)\n- **매매가격**: 250억 원\n- **자기자본**: 125억 원 (50%)\n- **차입금**: 125억 원 (LTV 50%, 연 4.5% 가정)\n- **연간 이자비용**: 약 5.6억 원\n- **레버리지 자기자본수익률**: 3.85%\n- **DSCR(원리금상환비율)**: 1.07x (최소 기준 충족)`,
    },
    {
      title: '공부 발췌', section_type: 'public_records',
      markdown: `### 공부 발췌 요약 (건축물대장 + 토지대장)\n\n| 항목 | 내용 |\n|---|---|\n| 소재지 | 서울특별시 영등포구 양평동4가 117 |\n| 대지면적 | 518.7㎡ (156.91평) |\n| 연면적 | 2,490.88㎡ (753.49평) |\n| 용도지역 | 준공업지역 |\n| 주용도 | 업무시설 |\n| 건폐율 / 용적률 | 51.6% / 398.8% |\n| 구조 | 철근콘크리트구조 |\n| 준공일 | 2018.09.14 |\n| 공시지가 | 5,870,000원/㎡ (2025년) |\n| 규제사항 | 제2종 지구단위계획구역 |`,
    },
    {
      title: '권리관계', section_type: 'title_rights',
      markdown: `### 등기부등본 요약\n- **소유형태**: 단독소유\n- **소유자**: (실사 시 확인 필요)\n- **근저당권**: (실사 시 확인 필요)\n- **가압류/가처분**: 없음 (확인 필요)\n- **전세권/지상권**: 없음\n\n> 본 권리관계는 실사 시 최종 확인이 필요합니다.`,
    },
    {
      title: '비교사례', section_type: 'comparable_analysis',
      markdown: `### 인근 오피스 실거래 비교\n\n| 소재지 | 거래일 | 거래가 | 연면적 | 평단가 |\n|---|---|---:|---:|---:|\n| 양평동4가 인근 | 2024.03 | 228억 | 2,100㎡ | 3,580만/평 |\n| 양평동3가 | 2024.06 | 195억 | 1,850㎡ | 3,475만/평 |\n| 문래동3가 | 2024.09 | 310억 | 3,200㎡ | 3,193만/평 |\n\n- **본건 평단가**: 약 3,317만/평 (매매희망가 기준)\n- **시세 대비**: 인근 거래 평단가 범위(3,193~3,580만) 내 적정`,
    },
    {
      title: '상권 분석', section_type: 'commercial_analysis',
      markdown: `### 양평동 선유도역 오피스 상권\n- **상권명**: 양평동 선유도역 오피스 상권\n- **총 사업체 수**: 1,842개\n- **평균 월 매출**: 5,200만 원\n- **개업률**: 12.3% | **폐업률**: 8.7%\n- **순증 비율**: +3.6%p (양호)\n- **주요 업종**: 지식서비스업 (IT, 디자인, 컨설팅)\n\n> 선유도역 일대 오피스 상권은 IT·디자인·컨설팅 중심의 지식서비스업이 주도하며, 개업률이 폐업률을 상회하는 건전한 상권입니다.`,
    },
    {
      title: '리스크 점검', section_type: 'risk_check',
      markdown: `### 권리 및 물리적 안전성\n- **용적률 398.8%**: 법정 상한 400%에 근접, 증축 여력 제한적 → 운영 집중 전략\n- **신축 컨디션**: 2018년 준공(만 8년차), 주요 설비 양호, 향후 5년간 대규모 수선 불필요\n- **등기**: 단독 소유자, 권리제한사항 확인 필요\n- **구조 안전**: 철근콘크리트 구조, 내진설계 적용\n- **주차**: 옥외 1대 + 기계식 22대 = 총 23대 (연면적 대비 적정)\n- **공실 리스크**: 지하 1층(127.7평) 단일 공실 — 리스업 파이프라인 구축 권장`,
    },
    {
      title: '종합 가치 제안', section_type: 'investment_thesis',
      markdown: `### 밸류애드 리스크 없는 완성형 수익자산\n1. **입지**: 선유도역 9호선 도보 1분 대로변 — 대중교통 접근성 최상\n2. **신축**: 2018년 신축, 추가 자본적 지출(CAPEX) 불필요\n3. **분산 임차**: 11개 테넌트로 리스크 분산 — 단일 임차인 의존도 0%\n4. **리스업**: 지하 1층 임대화 시 연 순수익률(Cap Rate) 2.71% 달성 가능\n\n> 종합 가치 제안: 선유도역 1분 초역세권 2018년 신축 오피스빌딩. 11개 법인 분산 만실 운영 중이며, 지하 1층 리스업을 통한 안정적 수익률 개선 여지가 있는 완성형 수익자산입니다.`,
    },
    {
      title: '향후 진행 일정', section_type: 'next_steps',
      markdown: `### 거래 진행 프로세스\n1. 투자 의향서 접수 및 임대차 실사 (2주)\n2. 가격 협상 및 주요 조건 합의 (1주)\n3. 매매계약 체결 및 보증금 정산 (1주)\n4. 잔금 지급 및 관리 인수인계 (2주)\n5. 소유권 이전등기 완료`,
    },
  ],
};

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(' 양평동 더레드빌딩 Executive Gold PPTX IM v4');
  console.log(' (골디락스 파이프라인 + V-World enrichment)');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  console.log('[1/4] 건물 이미지 5장 base64 인코딩...');
  const photos = buildPhotos();
  console.log(`  → ${photos.length}장 로드 완료`);

  console.log('[2/4] 사진 + 좌표 + enrichment 바인딩...');
  yangpyeongDoc.body.photos = photos;
  yangpyeongDoc.body.photo_urls = photos.map((p: any) => p.url);

  console.log('[3/4] Executive Gold 골디락스 렌더링...');
  const renderer = new MobileImPptxRenderer();

  const result = await renderer.render({
    buildingId: 'yangpyeong-gold-v4',
    // tier 제거 — 골디락스 단일 시퀀스
    preset: 'executive_gold',
    posture: 'income',
    grade: 'A',
    incomeArchetype: 'R-INC-01',
    doc: yangpyeongDoc as any,
    building: {
      area_signal: '양평권역 (선유도역)',
      asset_type: '사무용빌딩',
      price_band: '250억',
    },
    broker: {
      display_name: 'CREDEAL',
      company_name: 'CREDEAL',
      phone: '',
      specialty: '상업용 부동산 투자 플랫폼',
    },
    provenance: {
      property_overview: 'verified_gov',
      location_access: 'verified_gov',
      land_overview: 'verified_gov',
      building_overview: 'verified_gov',
      lease_status: 'owner_declared',
      income_analysis: 'calculated',
      capital_structure: 'calculated',
      public_records: 'verified_gov',
      title_rights: 'owner_declared',
      comparable_analysis: 'verified_gov',
      commercial_analysis: 'verified_gov',
      risk_check: 'calculated',
      investment_thesis: 'ai_generated',
    },
  });

  console.log('[4/4] 파일 저장...');
  const filename = 'yangpyeong_executive_gold_v4_GOLDILOCKS.pptx';
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, result.buffer);

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   PPTX IM v4 생성 완료!              ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║  파일: ${filename}`);
  console.log(`║  슬라이드: ${result.slideCount}장`);
  console.log(`║  크기: ${Math.round(result.buffer.length / 1024)}KB`);
  console.log(`║  경고: ${result.warnings.length}건`);
  console.log('╚══════════════════════════════════════╝');
  if (result.warnings.length > 0) {
    console.log('\n경고 상세:');
    result.warnings.forEach((w: string) => console.log('  ⚠️ ' + w));
  }
}

main().catch(console.error);
