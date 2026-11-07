/**
 * @file src/tests/e2e/fixtures/pseudo-golden-generator.ts
 * @description 실제 지번(공적장부 실측 제원) + 6대 가상 렌트롤 시나리오(Cases R1~R6) 파라메트릭 슈도 골든 생성기.
 *
 * 프로덕션 코드 오염 방지(Rule 34): 오직 테스트 픽스처 경로에서만 사용하며,
 * 투입 시점에 수학적 정답(Oracle)을 사전 계산하여 Mobile IM과 PPTX IM 양쪽의 정합성을 검증합니다.
 */

import { join } from 'path';
import type { BottomSheetData, FloorLease, PhotoMeta } from './basic-im-factory';
import { loadPhotosFromDirectory } from './basic-im-factory';
import type { GalleryLayoutType } from '@/domain/building/mobile-im/pptx/gallery-planner';
import { parseFlexibleManwon, parseFlexibleAreaNumber } from '@/domain/building/im-core/facts/rent';

export type PseudoGoldenCaseId =
  | 'R1_FULL_OCCUPANCY_SINGLE_FLOOR'
  | 'R2_HIGH_DENSITY_18_UNIT_SPLIT'
  | 'R3_VALUE_ADD_VACANT_OWNER_MIX'
  | 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME'
  | 'R5_EXCLUSIVE_AREA_PYEONG_INPUT'
  | 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS'
  | 'R7_ZERO_PHOTO_JEONSE_MIX'
  | 'R8_SINGLE_PHOTO_AND_BROKEN_URL'
  | 'R9_MULTI_PARCEL_3LOTS_MESSY_STRINGS';

export interface PseudoGoldenOracle {
  caseId: PseudoGoldenCaseId;
  description: string;
  askingPriceManwon: number;
  totalDepositManwon: number;
  monthlyRentManwon: number;
  otherIncomeMonthlyManwon: number;
  annualRentManwon: number;
  netInvestmentManwon: number;
  grossYieldPct: number;
  totalUnits: number;
  leasedUnits: number;
  ownerOccupiedUnits: number;
  vacantUnits: number;
  expectedSlideCount: number;
  landPricePerPyeongManwon: number;
  gfaPricePerPyeongManwon: number;
  areaInputUnit: 'sqm' | 'pyeong';
  totalInputAreaSqm: number;
  totalInputAreaPyeong: number;
  /** 사진 매트릭스(0장~12장) 검증 오라클 */
  expectedPhotoCount: number;
  expectedGallerySlideCount: 0 | 1 | 2;
  expectedGalleryLayouts: GalleryLayoutType[];
  expectedHeroPhotoSubstring: string;
  hasBrokerRegulationDrawing?: boolean;
}

export interface PseudoGoldenScenario {
  caseId: PseudoGoldenCaseId;
  label: string;
  pnu: string;
  pnus?: string[];
  posture: 'income' | 'owner_occupied' | 'trading';
  buildingName: string;
  coordinates: { lat: number; lng: number };
  bottomSheet: BottomSheetData;
  photos: PhotoMeta[];
  ssotExtra: Record<string, unknown>;
  buildingExtra?: Record<string, unknown>;
  docBodyExtra?: Record<string, unknown>;
  oracle: PseudoGoldenOracle;
}

const SQM_TO_PY = 0.3025;
const PY_TO_SQM = 3.305785;

const DANGSAN_IMAGES_DIR = join(
  process.cwd(),
  'docs',
  'golden-test-data',
  'p1-dangsan-income',
  'r2-standard',
  'images',
);

const YANGPYEONG_IMAGES_DIR = join(
  process.cwd(),
  'docs',
  'golden-test-data',
  'p5-yangpyeong-income',
  'r2-standard',
  'images',
);

const SEOCHO_IMAGES_DIR = join(
  process.cwd(),
  'docs',
  'golden-test-data',
  'p3-seocho-owner',
  'r3-verified',
  'images',
);

function imgPath(dir: string, filename: string): string {
  return join(dir, filename).replace(/\\/g, '/');
}

/**
 * R1 사진 셋 (2장 — DUAL_LANDSCAPE, 세로형 3:4 + 가로형 4:3 혼합, index 1에 isHero 지정하여 대표사진 우선순위 검증)
 */
function getR1Photos2(): PhotoMeta[] {
  return [
    {
      url: imgPath(YANGPYEONG_IMAGES_DIR, 'image_01.jpg'), // 750x1024 (3:4 세로형)
      category: 'exterior',
      caption: '측면 도로변 가시성 외관',
      role: 'exterior',
    },
    {
      url: imgPath(DANGSAN_IMAGES_DIR, 'image_01.jpeg'), // 3301x2476 (4:3 가로형)
      category: 'exterior',
      caption: '당산역세권 전면 코너 외관',
      isHero: true,
      role: 'cover',
    },
  ];
}

/**
 * R2 사진 셋 (4장 — GRID_2X2, 세로형 2장 + 가로형 2장 혼합 및 D11a 중복 캡션/실캡션 칩 분리 검증)
 */
function getR2Photos4(): PhotoMeta[] {
  return loadPhotosFromDirectory(YANGPYEONG_IMAGES_DIR, [
    { url: 'image_01.jpg', category: 'exterior', caption: '양평로 25m 대로변 코너 외관', isHero: true, role: 'cover' },
    { url: 'image_02.jpg', category: 'lobby', caption: '1층 로비', role: 'interior' }, // 라벨과 중복 캡션 → 칩만 표시
    { url: 'image_03.jpg', category: 'elevator', caption: '현대엘리베이터 15인승 홀 리모델링 완료', role: 'interior' },
    { url: 'image_04.jpg', category: 'parking', caption: '', role: 'facility' }, // 빈 캡션 → '주차장' 칩만 표시
  ]);
}

/**
 * R3 사진 셋 (3장 — ONE_LARGE_TWO_SMALL_H, 좌측 60% 대형 4:3 + 우측 상하 40% 소형 3:4 세로형·4:3 가로형)
 */
function getR3Photos3(): PhotoMeta[] {
  return loadPhotosFromDirectory(DANGSAN_IMAGES_DIR, [
    { url: 'image_01.jpeg', category: 'exterior', caption: '당산역 도보권 코너 전면부', isHero: true, role: 'cover' },
    { url: 'image_11.jpeg', category: 'interior', caption: '2층 공실 원상복구 완료 내부', role: 'interior' }, // 3:4 세로형
    { url: 'image_02.jpeg', category: 'parking', caption: '자주식 10대 구역 및 진입로', role: 'facility' }, // 4:3 가로형
  ]);
}

/**
 * R4 사진 셋 (5장 유효 + 1장 excluded:true — GRID_2X3 5장 하단 2장 중앙 대칭 배치 및 IM 제외 필터 검증)
 */
function getR4Photos5PlusExcluded(): PhotoMeta[] {
  return [
    ...loadPhotosFromDirectory(DANGSAN_IMAGES_DIR, [
      { url: 'image_01.jpeg', category: 'exterior', caption: '대로변 코너 파사드 전경', isHero: true, role: 'cover' },
      { url: 'image_07.jpeg', category: 'entrance', caption: '1층 내과검진센터 메인 진입부', role: 'exterior' },
      { url: 'image_08.jpeg', category: 'corridor', caption: '기준층 홀 및 대기 라운지', role: 'interior' },
      { url: 'image_09.jpeg', category: 'tenant_space', caption: '1~2층 통합 내과검진센터 전용 내부', role: 'interior' },
      { url: 'image_14.jpeg', category: 'rooftop', caption: '통신중계기 설치 구역 및 방수 현황', role: 'facility' },
    ]),
    {
      url: imgPath(DANGSAN_IMAGES_DIR, 'image_21.png'),
      category: 'other',
      caption: 'IM 제외 지정 테스트 이미지',
      excluded: true,
    } as PhotoMeta,
  ];
}

/**
 * R5 사진 셋 (8장 — 4장 + 4장 2면 분할 GRID_2X2 × 2, 가로·세로 다중 비율 실사진)
 */
function getR5Photos8(): PhotoMeta[] {
  return [
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_02.jpeg'), category: 'exterior', caption: '남부순환로 코너 전면 파사드', isHero: true, role: 'cover' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_03.jpeg'), category: 'surroundings', caption: '전면 8m×6m 코너 접면 현황', role: 'exterior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_01.jpeg'), category: 'lobby', caption: '1층 출입구 및 보안 부스', role: 'interior' },
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_11.jpeg'), category: 'elevator', caption: '승강기 홀 및 층별 안내 보드', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_05.jpeg'), category: 'interior', caption: '3층 법무법인 전용 오피스', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_06.jpeg'), category: 'tenant_space', caption: '4층 핀테크 스튜디오 업무 공간', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_04.jpeg'), category: 'parking', caption: '자주식 및 기계식 복합 18대 구역', role: 'facility' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_07.jpeg'), category: 'rooftop', caption: '6층 루프탑 및 강남권 스카이뷰', role: 'facility' },
  ];
}

/**
 * R6 사진 셋 (12장 실사진 + 1장 floor_plan 건축도면 = 총 13개 입력)
 * - 일반 갤러리는 floor_plan을 제외한 12장을 6장(1/2) + 6장(2/2) GRID_2X3 2면으로 분할
 * - floor_plan은 전용 '지구단위계획·도면' 슬라이드(brokerRegulationImages)로 분리 렌더링
 */
function getR6Photos12PlusFloorPlan(): PhotoMeta[] {
  return [
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_02.jpeg'), category: 'exterior', caption: '서초 단독 사옥 정면 파사드', isHero: true, role: 'cover' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_03.jpeg'), category: 'surroundings', caption: '양재역 도보권 코너 진입부', role: 'exterior' },
    // index 2에 floor_plan 도면을 배치하여 resolvePhotos가 12번째 실사진을 절삭하지 않는지 검증
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_17.png'), category: 'floor_plan', caption: '기준층(2F~5F) 사옥 레이아웃 평면도' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_01.jpeg'), category: 'entrance', caption: '1층 사옥 쇼룸 및 리셉션 진입부', role: 'exterior' },
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_07.jpeg'), category: 'lobby', caption: '1층 리셉션 라운지 및 카페테리아', role: 'interior' },
    { url: imgPath(YANGPYEONG_IMAGES_DIR, 'image_03.jpg'), category: 'elevator', caption: '전 층 연결 승강기 홀', role: 'interior' },
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_08.jpeg'), category: 'corridor', caption: '기준층 타운홀 및 오픈 라운지', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_05.jpeg'), category: 'interior', caption: '2층 R&D 디자인본부 오픈 오피스', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_06.jpeg'), category: 'interior', caption: '3층 플랫폼개발본부 전용 업무공간', role: 'interior' },
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_09.jpeg'), category: 'tenant_space', caption: '4층 글로벌사업본부 전용 홀', role: 'interior' },
    { url: imgPath(DANGSAN_IMAGES_DIR, 'image_14.jpeg'), category: 'tenant_space', caption: '5층 경영지원본부 코어 복도', role: 'interior' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_04.jpeg'), category: 'parking', caption: '지하·지상 자주식 18대 전용 구역', role: 'facility' },
    { url: imgPath(SEOCHO_IMAGES_DIR, 'image_07.jpeg'), category: 'rooftop', caption: '임직원 휴게 루프탑 가든 및 조망', role: 'facility' },
  ];
}

function computeOracle(params: {
  caseId: PseudoGoldenCaseId;
  description: string;
  askingPriceManwon: number;
  landAreaM2: number;
  grossFloorAreaM2: number;
  leases: FloorLease[];
  otherIncomeMonthlyManwon?: number;
  expectedSlideCount?: number;
  areaInputUnit?: 'sqm' | 'pyeong';
  expectedPhotoCount: number;
  expectedGallerySlideCount: 0 | 1 | 2;
  expectedGalleryLayouts: GalleryLayoutType[];
  expectedHeroPhotoSubstring: string;
  hasBrokerRegulationDrawing?: boolean;
}): PseudoGoldenOracle {
  const {
    caseId,
    description,
    askingPriceManwon,
    landAreaM2,
    grossFloorAreaM2,
    leases,
    otherIncomeMonthlyManwon = 0,
    expectedSlideCount = 9,
    areaInputUnit = 'sqm',
    expectedPhotoCount,
    expectedGallerySlideCount,
    expectedGalleryLayouts,
    expectedHeroPhotoSubstring,
    hasBrokerRegulationDrawing = false,
  } = params;

  let totalDepositManwon = 0;
  let monthlyRentManwon = 0;
  let leasedUnits = 0;
  let ownerOccupiedUnits = 0;
  let vacantUnits = 0;
  let totalInputAreaSqm = 0;
  let totalInputAreaPyeong = 0;

  for (const fl of leases) {
    const isVacant = Boolean(
      fl.is_vacant ||
        fl.status === 'vacant' ||
        fl.lease_state === '공실' ||
        fl.tenant_type === '공실' ||
        fl.tenant_name === '공실',
    );
    const isOwner = Boolean(
      !isVacant &&
        (fl.status === 'owner' ||
          fl.lease_state === '자가사용' ||
          fl.tenant_type === '자가' ||
          fl.tenant_type === '자가사용' ||
          fl.tenant_name === '자가' ||
          fl.tenant_name === '자가사용'),
    );

    if (isVacant) {
      vacantUnits++;
    } else if (isOwner) {
      ownerOccupiedUnits++;
    } else {
      leasedUnits++;
      totalDepositManwon += parseFlexibleManwon(fl.deposit_manwon);
      monthlyRentManwon += parseFlexibleManwon(fl.rent_manwon);
    }

    const m2 = parseFlexibleAreaNumber((fl as any).area_m2 ?? (fl as any).area_sqm ?? 0);
    const py = parseFlexibleAreaNumber(fl.area_pyeong ?? 0);
    if (areaInputUnit === 'pyeong' && py > 0) {
      totalInputAreaPyeong += py;
      totalInputAreaSqm += Math.round(py * PY_TO_SQM * 100) / 100;
    } else {
      const effM2 = m2 > 0 ? m2 : py > 0 ? Math.round(py * PY_TO_SQM * 100) / 100 : 0;
      totalInputAreaSqm += effM2;
      totalInputAreaPyeong += py > 0 ? py : Math.round((effM2 / PY_TO_SQM) * 10) / 10;
    }
  }

  const annualRentManwon = monthlyRentManwon * 12;
  const netInvestmentManwon =
    totalDepositManwon > 0 && totalDepositManwon < askingPriceManwon
      ? askingPriceManwon - totalDepositManwon
      : askingPriceManwon;
  const grossYieldPct =
    netInvestmentManwon > 0 && annualRentManwon > 0
      ? Math.round(((annualRentManwon / netInvestmentManwon) * 100) * 100) / 100
      : 0;

  const landPricePerPyeongManwon = Math.round(askingPriceManwon / (landAreaM2 / PY_TO_SQM));
  const gfaPricePerPyeongManwon = Math.round(askingPriceManwon / (grossFloorAreaM2 / PY_TO_SQM));

  return {
    caseId,
    description,
    askingPriceManwon,
    totalDepositManwon,
    monthlyRentManwon,
    otherIncomeMonthlyManwon,
    annualRentManwon,
    netInvestmentManwon,
    grossYieldPct,
    totalUnits: leases.length,
    leasedUnits,
    ownerOccupiedUnits,
    vacantUnits,
    expectedSlideCount,
    landPricePerPyeongManwon,
    gfaPricePerPyeongManwon,
    areaInputUnit,
    totalInputAreaSqm: Math.round(totalInputAreaSqm * 100) / 100,
    totalInputAreaPyeong: Math.round(totalInputAreaPyeong * 10) / 10,
    expectedPhotoCount,
    expectedGallerySlideCount,
    expectedGalleryLayouts,
    expectedHeroPhotoSubstring,
    hasBrokerRegulationDrawing,
  };
}

/**
 * 6대 슈도 골든 시나리오(Cases R1~R6)를 생성합니다.
 */
export function buildPseudoGoldenScenarios(): PseudoGoldenScenario[] {
  const r1Photos = getR1Photos2();
  const r2Photos = getR2Photos4();
  const r3Photos = getR3Photos3();
  const r4Photos = getR4Photos5PlusExcluded();
  const r5Photos = getR5Photos8();
  const r6Photos = getR6Photos12PlusFloorPlan();

  // ─────────────────────────────────────────────────────────────────
  // Case R1: 완전 만실 · 1층=1호실 표준 (서울 영등포구 당산동5가 11-47)
  // ─────────────────────────────────────────────────────────────────
  const r1Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '바른체형운동센터', tenant_type: '운동시설', area_m2: 317.36, area_pyeong: 96.0, deposit_manwon: 5000, rent_manwon: 380, mgmt_fee_manwon: 40, lease_end: '2027-08-31', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '메디팜온누리약국', tenant_type: '약국·소매점', area_m2: 183.80, area_pyeong: 55.6, deposit_manwon: 20000, rent_manwon: 1120, mgmt_fee_manwon: 90, lease_end: '2028-02-28', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '서울바른내과의원', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 10000, rent_manwon: 680, mgmt_fee_manwon: 60, lease_end: '2028-05-31', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '연세튼튼정형외과', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 10000, rent_manwon: 620, mgmt_fee_manwon: 60, lease_end: '2027-11-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '한빛세무회계법인', tenant_type: '업무시설(사무소)', area_m2: 251.91, area_pyeong: 76.2, deposit_manwon: 6000, rent_manwon: 490, mgmt_fee_manwon: 50, lease_end: '2027-06-30', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '더프라임수학학원', tenant_type: '교육연구(학원)', area_m2: 183.62, area_pyeong: 55.5, deposit_manwon: 4000, rent_manwon: 360, mgmt_fee_manwon: 40, lease_end: '2027-12-31', is_vacant: false },
  ];

  const r1BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceManwon: 1150000,
    landAreaM2: 506.8,
    grossFloorAreaM2: 1441.15,
    completionYear: 2002,
    zoning: '준공업지역',
    floors: 'B1/5F',
    parking: 10,
    elevator: 1,
    floor_leases: r1Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R2: 다호실 쪼개기 과밀 16호실 스트레스 (서울 영등포구 양평동4가 117 외 2필지, B1~10F)
  // ─────────────────────────────────────────────────────────────────
  const r2Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '스크린골프아카데미', tenant_type: '운동시설', area_m2: 240.0, area_pyeong: 72.6, deposit_manwon: 5000, rent_manwon: 350, lease_end: '2027-06-30', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '스페셜티커피로스터스', tenant_type: '휴게음식점', area_m2: 95.0, area_pyeong: 28.7, deposit_manwon: 10000, rent_manwon: 650, lease_end: '2028-03-31', is_vacant: false },
    { floor: '1F', unit_label: '102호', tenant_name: '선유도우리온누리약국', tenant_type: '약국', area_m2: 65.0, area_pyeong: 19.7, deposit_manwon: 12000, rent_manwon: 580, lease_end: '2028-09-30', is_vacant: false },
    { floor: '1F', unit_label: '103호', tenant_name: '프레시편의점선유도점', tenant_type: '소매점', area_m2: 60.0, area_pyeong: 18.2, deposit_manwon: 5000, rent_manwon: 340, lease_end: '2027-10-31', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '연세프리미엄치과의원', tenant_type: '의원', area_m2: 140.0, area_pyeong: 42.4, deposit_manwon: 8000, rent_manwon: 460, lease_end: '2028-04-30', is_vacant: false },
    { floor: '2F', unit_label: '202호', tenant_name: '맑은피부과의원', tenant_type: '의원', area_m2: 110.0, area_pyeong: 33.3, deposit_manwon: 6000, rent_manwon: 380, lease_end: '2027-11-30', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '바른정형외과도수치료센터', tenant_type: '의원', area_m2: 250.0, area_pyeong: 75.6, deposit_manwon: 10000, rent_manwon: 620, lease_end: '2028-06-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '글로벌특허법률사무소', tenant_type: '업무시설', area_m2: 130.0, area_pyeong: 39.3, deposit_manwon: 5000, rent_manwon: 320, lease_end: '2027-07-31', is_vacant: false },
    { floor: '4F', unit_label: '402호', tenant_name: '공실', tenant_type: '공실', area_m2: 120.0, area_pyeong: 36.3, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', is_vacant: true },
    { floor: '5F', unit_label: '501호', tenant_name: '넥스트클라우드소프트웨어', tenant_type: '업무시설', area_m2: 250.0, area_pyeong: 75.6, deposit_manwon: 8000, rent_manwon: 540, lease_end: '2028-01-31', is_vacant: false },
    { floor: '6F', unit_label: '601호', tenant_name: '엘리트영어에듀케이션학원', tenant_type: '학원', area_m2: 150.0, area_pyeong: 45.4, deposit_manwon: 5000, rent_manwon: 350, lease_end: '2027-08-31', is_vacant: false },
    { floor: '6F', unit_label: '602호', tenant_name: '미래코딩로보틱스학원', tenant_type: '학원', area_m2: 100.0, area_pyeong: 30.3, deposit_manwon: 3000, rent_manwon: 240, lease_end: '2027-09-30', is_vacant: false },
    { floor: '7F', unit_label: '701호', tenant_name: '한결회계세무컨설팅그룹', tenant_type: '업무시설', area_m2: 230.0, area_pyeong: 69.6, deposit_manwon: 7000, rent_manwon: 480, lease_end: '2028-02-28', is_vacant: false },
    { floor: '8F', unit_label: '801호', tenant_name: '아키텍처디자인스튜디오', tenant_type: '업무시설', area_m2: 200.0, area_pyeong: 60.5, deposit_manwon: 6000, rent_manwon: 420, lease_end: '2027-12-31', is_vacant: false },
    { floor: '9F', unit_label: '901호', tenant_name: '바이오헬스케어연구소', tenant_type: '업무시설', area_m2: 180.0, area_pyeong: 54.5, deposit_manwon: 6000, rent_manwon: 400, lease_end: '2028-05-31', is_vacant: false },
    { floor: '10F', unit_label: '1001호', tenant_name: '루프탑라운지앤다이닝', tenant_type: '일반음식점', area_m2: 170.88, area_pyeong: 51.7, deposit_manwon: 7000, rent_manwon: 450, lease_end: '2028-08-31', is_vacant: false },
  ];

  const r2BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 양평동4가 117, 134, 125-2',
    askingPriceManwon: 2500000,
    landAreaM2: 518.7,
    grossFloorAreaM2: 2490.88,
    completionYear: 2018,
    zoning: '준공업지역',
    floors: 'B1/10F',
    parking: 23,
    elevator: 1,
    floor_leases: r2Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R3: 부분 공실 + 자가사용 혼합 Value-Add (당산동5가 11-47)
  // ─────────────────────────────────────────────────────────────────
  const r3Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 317.36, area_pyeong: 96.0, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '매도인 창고·스튜디오 자가사용 (즉시 임대 전환 가능)', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '당산역메디컬약국', tenant_type: '약국', area_m2: 183.80, area_pyeong: 55.6, deposit_manwon: 15000, rent_manwon: 950, lease_end: '2028-06-30', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '공실', tenant_type: '공실', lease_state: '공실', status: 'vacant', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '인테리어 원상복구 완료 (즉시 입주 가능)', is_vacant: true },
    { floor: '3F', unit_label: '301호', tenant_name: '굿모닝통증의학과의원', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 10000, rent_manwon: 620, lease_end: '2028-03-31', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 251.91, area_pyeong: 76.2, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '매도인 법인 사무실 자가사용 (매각 시 명도 또는 재임대)', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '스마트에듀입시학원', tenant_type: '학원', area_m2: 183.62, area_pyeong: 55.5, deposit_manwon: 5000, rent_manwon: 430, lease_end: '2027-12-31', is_vacant: false },
  ];

  const r3BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceManwon: 1150000,
    landAreaM2: 506.8,
    grossFloorAreaM2: 1441.15,
    completionYear: 2002,
    zoning: '준공업지역',
    floors: 'B1/5F',
    parking: 10,
    elevator: 1,
    floor_leases: r3Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R4: 복층 통합계약 (1F~2F) + 옥상/주차 기타수입 포함 (당산동5가 11-47)
  // ─────────────────────────────────────────────────────────────────
  const r4Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '프리미엄필라테스랩', tenant_type: '운동시설', area_m2: 317.36, area_pyeong: 96.0, deposit_manwon: 4000, rent_manwon: 320, lease_end: '2027-09-30', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '참좋은내과건강검진센터', tenant_type: '의원', area_m2: 183.80, area_pyeong: 55.6, deposit_manwon: 20000, rent_manwon: 1450, lease_end: '2028-08-31', note: '1F~2F 통합계약 (보증금·임대료 1F 일괄 합산)', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '참좋은내과건강검진센터', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 0, rent_manwon: 0, lease_end: '2028-08-31', note: '1F 통합계약 포함', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '서울안과의원', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 8000, rent_manwon: 550, lease_end: '2027-11-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '세무법인화우당산지점', tenant_type: '업무시설', area_m2: 251.91, area_pyeong: 76.2, deposit_manwon: 5000, rent_manwon: 420, lease_end: '2028-01-31', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '당산건축사사무소', tenant_type: '업무시설', area_m2: 183.62, area_pyeong: 55.5, deposit_manwon: 3000, rent_manwon: 310, lease_end: '2027-10-31', is_vacant: false },
  ];

  const r4BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceManwon: 1150000,
    landAreaM2: 506.8,
    grossFloorAreaM2: 1441.15,
    completionYear: 2002,
    zoning: '준공업지역',
    floors: 'B1/5F',
    parking: 10,
    elevator: 1,
    floor_leases: r4Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R5: 평(py) 단위 전용면적만 입력한 케이스 (서울 서초구 서초동 1364-28, B1~6F)
  // ─────────────────────────────────────────────────────────────────
  const r5Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '모던사운드레코딩스튜디오', tenant_type: '근린생활시설', area_pyeong: 45.0, deposit_manwon: 5000, rent_manwon: 380, lease_end: '2027-07-31', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '아티장베이커리카페', tenant_type: '휴게음식점', area_pyeong: 42.0, deposit_manwon: 15000, rent_manwon: 980, lease_end: '2028-05-31', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '양재뷰티클리닉의원', tenant_type: '의원', area_pyeong: 55.0, deposit_manwon: 10000, rent_manwon: 680, lease_end: '2028-02-28', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '법무법인서초파트너스', tenant_type: '업무시설', area_pyeong: 55.0, deposit_manwon: 8000, rent_manwon: 590, lease_end: '2027-11-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '핀테크벤처스튜디오', tenant_type: '업무시설', area_pyeong: 55.0, deposit_manwon: 8000, rent_manwon: 570, lease_end: '2028-01-31', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '글로벌에듀컨설팅', tenant_type: '업무시설', area_pyeong: 55.0, deposit_manwon: 7000, rent_manwon: 550, lease_end: '2027-10-31', is_vacant: false },
    { floor: '6F', unit_label: '601호', tenant_name: '프라이빗멤버십라운지', tenant_type: '근린생활시설', area_pyeong: 48.0, deposit_manwon: 7000, rent_manwon: 500, lease_end: '2028-04-30', is_vacant: false },
  ];

  const r5BottomSheet: BottomSheetData = {
    address: '서울특별시 서초구 서초동 1364-28',
    askingPriceManwon: 2300000,
    landAreaM2: 596.0,
    grossFloorAreaM2: 2104.8,
    completionYear: 2017,
    zoning: '제3종일반주거지역',
    floors: 'B1/6F',
    parking: 18,
    elevator: 1,
    floor_leases: r5Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R6: 전층 명도/사옥형 임대료 0원 + 인근 매각사례(comps 3건) (서울 서초구 서초동 1364-28)
  // ─────────────────────────────────────────────────────────────────
  const r6Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 300.0, area_pyeong: 90.8, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '사옥 구내식당·피트니스 (전층 명도 인도)', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 280.8, area_pyeong: 84.9, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '사옥 쇼룸·리셉션 로비 (전층 명도 인도)', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 310.0, area_pyeong: 93.8, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: 'R&D 디자인본부 (전층 명도 인도)', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 310.0, area_pyeong: 93.8, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '플랫폼개발본부 (전층 명도 인도)', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 310.0, area_pyeong: 93.8, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '글로벌사업본부 (전층 명도 인도)', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 310.0, area_pyeong: 93.8, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '경영지원본부 (전층 명도 인도)', is_vacant: false },
    { floor: '6F', unit_label: '601호', tenant_name: '자가사용', tenant_type: '자가사용', lease_state: '자가사용', status: 'owner', area_m2: 284.0, area_pyeong: 85.9, deposit_manwon: 0, rent_manwon: 0, lease_end: '-', note: '임원실·대회의실 (전층 명도 인도)', is_vacant: false },
  ];

  const r6BottomSheet: BottomSheetData = {
    address: '서울특별시 서초구 서초동 1364-28',
    askingPriceManwon: 2300000,
    landAreaM2: 596.0,
    grossFloorAreaM2: 2104.8,
    completionYear: 2017,
    zoning: '제3종일반주거지역',
    floors: 'B1/6F',
    parking: 18,
    elevator: 1,
    floor_leases: r6Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R7: 사진 0장(미등록) + 전세(보증금 단독·월세 0원) 2개 층 혼합 (당산동5가 11-47)
  // ─────────────────────────────────────────────────────────────────
  const r7Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '바른체형운동센터', tenant_type: '운동시설', area_m2: 317.36, area_pyeong: 96.0, deposit_manwon: 5000, rent_manwon: 380, mgmt_fee_manwon: 40, lease_end: '2027-08-31', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '메디팜온누리약국', tenant_type: '약국·소매점', area_m2: 183.80, area_pyeong: 55.6, deposit_manwon: 20000, rent_manwon: 1120, mgmt_fee_manwon: 90, lease_end: '2028-02-28', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '서울바른내과의원', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 10000, rent_manwon: 680, mgmt_fee_manwon: 60, lease_end: '2028-05-31', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '연세튼튼정형외과', tenant_type: '의원', area_m2: 252.23, area_pyeong: 76.3, deposit_manwon: 10000, rent_manwon: 620, mgmt_fee_manwon: 60, lease_end: '2027-11-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '우리들회계컨설팅', tenant_type: '업무시설(전세)', lease_state: '임대중', area_m2: 251.91, area_pyeong: 76.2, deposit_manwon: 50000, rent_manwon: 0, mgmt_fee_manwon: 50, lease_end: '2027-10-31', note: '전세 계약 (보증금 5억 / 관리비 별도)', is_vacant: false },
    { floor: '5F', unit_label: '501호', tenant_name: '스카이소프트웨어랩', tenant_type: '업무시설(전세)', lease_state: '임대중', area_m2: 183.62, area_pyeong: 55.5, deposit_manwon: 30000, rent_manwon: 0, mgmt_fee_manwon: 40, lease_end: '2028-01-31', note: '전세 계약 (보증금 3억 / 관리비 별도)', is_vacant: false },
  ];

  const r7BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 당산동5가 11-47',
    askingPriceManwon: 1150000,
    landAreaM2: 506.8,
    grossFloorAreaM2: 1441.15,
    completionYear: 2002,
    zoning: '준공업지역',
    floors: 'B1/5F',
    parking: 10,
    elevator: 1,
    floor_leases: r7Leases,
  };

  // ─────────────────────────────────────────────────────────────────
  // Case R8: 유효 사진 1장(FULL_WIDE) + 깨진 이미지 URL 1장 폴백 복원력 (서초동 1364-28)
  // ─────────────────────────────────────────────────────────────────
  const r8Photos: PhotoMeta[] = [
    {
      url: 'docs/golden-test-data/non-existent-broken-photo-404.jpg',
      category: 'exterior',
      caption: '깨진 URL 이미지 (스킵 대상)',
    },
    {
      url: imgPath(SEOCHO_IMAGES_DIR, 'image_02.jpeg'),
      category: 'exterior',
      role: 'cover',
      isHero: true,
      caption: '남부순환로 코너 전면 파사드 단독 전경',
    },
  ];

  // ─────────────────────────────────────────────────────────────────
  // Case R9: 다필지 주소(양평동4가 117, 134, 125-2) 자동 PNU 3건 합성 + 비정형 한글 금액·면적 문자열 파싱
  // ─────────────────────────────────────────────────────────────────
  const r9Leases: FloorLease[] = [
    { floor: 'B1', unit_label: 'B101호', tenant_name: '스크린골프아카데미', tenant_type: '운동시설', area_m2: '240.0㎡ (전용)' as any, area_pyeong: '약 72.6평' as any, deposit_manwon: '5,000만원' as any, rent_manwon: '350만 (부가세 별도)' as any, mgmt_fee_manwon: '40만원' as any, lease_end: '2027-06-30', is_vacant: false },
    { floor: '1F', unit_label: '101호', tenant_name: '선유도메디컬약국', tenant_type: '약국', area_m2: '220.0㎡' as any, area_pyeong: '66.6평' as any, deposit_manwon: '1억 5,000만' as any, rent_manwon: '950만원 (VAT 별도)' as any, mgmt_fee_manwon: '80만' as any, lease_end: '2028-03-31', is_vacant: false },
    { floor: '2F', unit_label: '201호', tenant_name: '연세프리미엄치과의원', tenant_type: '의원', area_m2: '250.0㎡' as any, area_pyeong: '75.6평' as any, deposit_manwon: '1억' as any, rent_manwon: '680만원' as any, mgmt_fee_manwon: '60만' as any, lease_end: '2028-04-30', is_vacant: false },
    { floor: '3F', unit_label: '301호', tenant_name: '바른정형외과도수치료센터', tenant_type: '의원', area_m2: '250.0㎡' as any, area_pyeong: '75.6평' as any, deposit_manwon: '1억 2,000만' as any, rent_manwon: '720만원' as any, mgmt_fee_manwon: '60만' as any, lease_end: '2028-06-30', is_vacant: false },
    { floor: '4F', unit_label: '401호', tenant_name: '글로벌특허법률사무소', tenant_type: '업무시설', area_m2: '250.0㎡' as any, area_pyeong: '75.6평' as any, deposit_manwon: '8,000만원' as any, rent_manwon: '520만' as any, mgmt_fee_manwon: '50만' as any, lease_end: '2027-07-31', is_vacant: false },
  ];

  const r9BottomSheet: BottomSheetData = {
    address: '서울특별시 영등포구 양평동4가 117, 134, 125-2',
    askingPriceManwon: 1500000,
    landAreaM2: 518.7,
    grossFloorAreaM2: 1210.0,
    completionYear: 2018,
    zoning: '준공업지역',
    floors: 'B1/4F',
    parking: 14,
    elevator: 1,
    floor_leases: r9Leases,
  };

  return [
    {
      caseId: 'R1_FULL_OCCUPANCY_SINGLE_FLOOR',
      label: 'Case R1: 완전 만실 1층=1호실 표준 + 사진 2장(DUAL_LANDSCAPE) (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 코너 메디컬빌딩',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r1BottomSheet,
      photos: r1Photos,
      ssotExtra: {
        bcr_pct: 51.89,
        far_pct: 221.76,
        arch_area_sqm: 263.01,
        structure: '철근콘크리트구조',
        road_condition: '중로각지',
      },
      oracle: computeOracle({
        caseId: 'R1_FULL_OCCUPANCY_SINGLE_FLOOR',
        description: '전 층 만실(6개 층 6개 호실) 표준 수익형 + 사진 2장(세로 3:4 + 가로 4:3, DUAL_LANDSCAPE)',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r1Leases,
        expectedSlideCount: 9,
        expectedPhotoCount: 2,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['DUAL_LANDSCAPE'],
        expectedHeroPhotoSubstring: 'p1-dangsan-income/r2-standard/images/image_01.jpeg',
      }),
    },
    {
      caseId: 'R2_HIGH_DENSITY_18_UNIT_SPLIT',
      label: 'Case R2: 다호실 쪼개기 과밀 16개 호실 + 사진 4장(GRID_2X2) (양평동4가 117 외 2필지)',
      pnu: '1156012800101170000',
      pnus: ['1156012800101170000', '1156012800101340000', '1156012800101250002'],
      posture: 'income',
      buildingName: '선유도역 더레드 타워',
      coordinates: { lat: 37.5381, lng: 126.8938 },
      bottomSheet: r2BottomSheet,
      photos: r2Photos,
      ssotExtra: {
        bcr_pct: 58.4,
        far_pct: 398.8,
        arch_area_sqm: 302.92,
        structure: '철근콘크리트구조',
        road_condition: '25m 양평로 코너 접면',
      },
      oracle: computeOracle({
        caseId: 'R2_HIGH_DENSITY_18_UNIT_SPLIT',
        description: 'B1~10F 총 16개 분할 호실 과밀 렌트롤(2면 분할) + 사진 4장(GRID_2X2, D11a 칩·캡션 분리)',
        askingPriceManwon: 2500000,
        landAreaM2: 518.7,
        grossFloorAreaM2: 2490.88,
        leases: r2Leases,
        expectedSlideCount: 10,
        expectedPhotoCount: 4,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['GRID_2X2'],
        expectedHeroPhotoSubstring: 'p5-yangpyeong-income/r2-standard/images/image_01.jpg',
      }),
    },
    {
      caseId: 'R3_VALUE_ADD_VACANT_OWNER_MIX',
      label: 'Case R3: 부분 공실(1)+자가(2)+임대(3) 혼합 + 사진 3장(ONE_LARGE_TWO_SMALL_H) (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 밸류업 메디컬타워',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r3BottomSheet,
      photos: r3Photos,
      ssotExtra: {
        bcr_pct: 51.89,
        far_pct: 221.76,
        arch_area_sqm: 263.01,
        structure: '철근콘크리트구조',
        road_condition: '중로각지',
      },
      docBodyExtra: {
        broker_extras: {
          post_acquisition_plan: [
            'B1·4F 자가사용(172.2평) 및 2F 공실(76.3평)을 평당 월 5만원 기준으로 임대 전환 시 월 임대료 약 1,242만원 추가 확보 가능',
          ],
          stabilized_target_rent_per_pyeong_manwon: 5,
        },
      },
      oracle: computeOracle({
        caseId: 'R3_VALUE_ADD_VACANT_OWNER_MIX',
        description: '임대 3호실 + 자가사용 2호실 + 공실 1호실 혼합 + 사진 3장(1+2 비대칭 ONE_LARGE_TWO_SMALL_H)',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r3Leases,
        expectedSlideCount: 9,
        expectedPhotoCount: 3,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['ONE_LARGE_TWO_SMALL_H'],
        expectedHeroPhotoSubstring: 'p1-dangsan-income/r2-standard/images/image_01.jpeg',
      }),
    },
    {
      caseId: 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME',
      label: 'Case R4: 복층 통합계약(1F~2F)+기타수입 + 사진 5장(GRID_2X3 하단 중앙대칭) (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 참좋은 메디컬센터',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r4BottomSheet,
      photos: r4Photos,
      ssotExtra: {
        bcr_pct: 51.89,
        far_pct: 221.76,
        arch_area_sqm: 263.01,
        structure: '철근콘크리트구조',
        road_condition: '중로각지',
        other_income_monthly_manwon: 180,
      },
      docBodyExtra: {
        other_income_monthly_manwon: 180,
        other_income_label: '옥상 통신중계기 및 외부 유료주차 수익',
      },
      oracle: computeOracle({
        caseId: 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME',
        description: '1F~2F 복층 통합계약 + 기타수입 월 180만원 + 사진 5장(GRID_2X3 하단 2장 중앙 정렬, excluded 1장 제외)',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r4Leases,
        otherIncomeMonthlyManwon: 180,
        expectedSlideCount: 9,
        expectedPhotoCount: 5,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['GRID_2X3'],
        expectedHeroPhotoSubstring: 'p1-dangsan-income/r2-standard/images/image_01.jpeg',
      }),
    },
    {
      caseId: 'R5_EXCLUSIVE_AREA_PYEONG_INPUT',
      label: 'Case R5: 평(py) 단위 전용면적 입력 + 사진 8장(4+4 2면 분할 GRID_2X2) (서초동 1364-28)',
      pnu: '1165010800113640028',
      posture: 'income',
      buildingName: '서초 남부순환로 프라임빌딩',
      coordinates: { lat: 37.4836, lng: 127.0357 },
      bottomSheet: r5BottomSheet,
      photos: r5Photos,
      ssotExtra: {
        bcr_pct: 47.9,
        far_pct: 296.6,
        arch_area_sqm: 285.5,
        structure: '철근콘크리트구조',
        road_condition: '남부순환로347길 코너 접면',
      },
      docBodyExtra: {
        rent_roll_meta: {
          area_input_unit: 'pyeong',
          area_basis: 'exclusive',
        },
      },
      oracle: computeOracle({
        caseId: 'R5_EXCLUSIVE_AREA_PYEONG_INPUT',
        description: '전용면적 평(py) 단위 단독 입력 + 사진 8장(현장 사진 1/2 4장 + 2/2 4장 2면 분할, 총 10면)',
        askingPriceManwon: 2300000,
        landAreaM2: 596.0,
        grossFloorAreaM2: 2104.8,
        leases: r5Leases,
        areaInputUnit: 'pyeong',
        expectedSlideCount: 10,
        expectedPhotoCount: 8,
        expectedGallerySlideCount: 2,
        expectedGalleryLayouts: ['GRID_2X2', 'GRID_2X2'],
        expectedHeroPhotoSubstring: 'p3-seocho-owner/r3-verified/images/image_02.jpeg',
      }),
    },
    {
      caseId: 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS',
      label: 'Case R6: 전층 명도·사옥형 + 시세비교 3건 + 사진 12장(6+6 2면 분할) + 도면 1장 (서초동 1364-28)',
      pnu: '1165010800113640028',
      posture: 'owner_occupied',
      buildingName: '서초 단독 사옥 타워',
      coordinates: { lat: 37.4836, lng: 127.0357 },
      bottomSheet: r6BottomSheet,
      photos: r6Photos,
      ssotExtra: {
        bcr_pct: 47.9,
        far_pct: 296.6,
        arch_area_sqm: 285.5,
        structure: '철근콘크리트구조',
        road_condition: '남부순환로347길 코너 접면',
      },
      docBodyExtra: {
        broker_extras: {
          market_comps: [
            { kind: 'sale', location: '서초동 1362-15 (양재역 도보 5분)', price_eok: 245, land_price_per_pyeong_manwon: 13500, as_of: '2026.02', note: '2016년식 근생·업무 빌딩 실거래' },
            { kind: 'sale', location: '서초동 1365-8 (남부순환로 이면)', price_eok: 215, land_price_per_pyeong_manwon: 12900, as_of: '2025.11', note: '사옥 매입 완료 사례' },
            { kind: 'listing', location: '서초동 1364-10 (인근 코너 매물)', price_eok: 260, land_price_per_pyeong_manwon: 14200, as_of: '2026.05', note: '현재 시장 매각 호가' },
          ],
          closing_line: '잔금과 동시에 전 층 명도 인도가 확약된 서초구 내 희소 단독 사옥 매물입니다.',
        },
      },
      oracle: computeOracle({
        caseId: 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS',
        description: '전 층 자가사용 사옥형 + 시세 비교 + 사진 12장(6+6 2면 분할) + floor_plan 도면 전용 슬라이드(총 11면)',
        askingPriceManwon: 2300000,
        landAreaM2: 596.0,
        grossFloorAreaM2: 2104.8,
        leases: r6Leases,
        expectedSlideCount: 11,
        expectedPhotoCount: 12,
        expectedGallerySlideCount: 2,
        expectedGalleryLayouts: ['GRID_2X3', 'GRID_2X3'],
        expectedHeroPhotoSubstring: 'p3-seocho-owner/r3-verified/images/image_02.jpeg',
        hasBrokerRegulationDrawing: true,
      }),
    },
    {
      caseId: 'R7_ZERO_PHOTO_JEONSE_MIX',
      label: 'Case R7: 사진 0장(미등록) + 전세(보증금 단독·월세 0원) 2개 층 혼합 (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 전세복합 메디컬빌딩',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r7BottomSheet,
      photos: [],
      ssotExtra: {
        bcr_pct: 51.89,
        far_pct: 221.76,
        arch_area_sqm: 263.01,
        structure: '철근콘크리트구조',
        road_condition: '중로각지',
      },
      oracle: computeOracle({
        caseId: 'R7_ZERO_PHOTO_JEONSE_MIX',
        description: '사진 0장(건축물 실사 안내 대체 카드) + 전세(보증금 8억/월세 0원) 2개 층 포함 순투하자본 수익률 검증',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r7Leases,
        expectedSlideCount: 9,
        expectedPhotoCount: 0,
        expectedGallerySlideCount: 0,
        expectedGalleryLayouts: [],
        expectedHeroPhotoSubstring: '',
      }),
    },
    {
      caseId: 'R8_SINGLE_PHOTO_AND_BROKEN_URL',
      label: 'Case R8: 유효 사진 1장(FULL_WIDE) + 깨진 이미지 URL 1장 폴백 복원력 (서초동 1364-28)',
      pnu: '1165010800113640028',
      posture: 'income',
      buildingName: '서초 시그니처 타워',
      coordinates: { lat: 37.4836, lng: 127.0357 },
      bottomSheet: r5BottomSheet,
      photos: r8Photos,
      ssotExtra: {
        bcr_pct: 47.9,
        far_pct: 296.6,
        arch_area_sqm: 285.5,
        structure: '철근콘크리트구조',
        road_condition: '남부순환로347길 코너 접면',
      },
      oracle: computeOracle({
        caseId: 'R8_SINGLE_PHOTO_AND_BROKEN_URL',
        description: '깨진 이미지 URL 1장 포함 시 크래시 없이 유효 사진 1장(FULL_WIDE) 및 원본 캡션 정확 매칭 검증',
        askingPriceManwon: 2300000,
        landAreaM2: 596.0,
        grossFloorAreaM2: 2104.8,
        leases: r5Leases,
        expectedSlideCount: 9,
        expectedPhotoCount: 2,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['DUAL_LANDSCAPE'],
        expectedHeroPhotoSubstring: 'p3-seocho-owner/r3-verified/images/image_02.jpeg',
      }),
    },
    {
      caseId: 'R9_MULTI_PARCEL_3LOTS_MESSY_STRINGS',
      label: 'Case R9: 다필지 주소(양평동4가 117, 134, 125-2) 자동 PNU 3건 합성 + 비정형 한글 금액·면적 파싱',
      pnu: '', // 의도적으로 비워두어 주소 문자열로부터 19자리 대표 PNU + 부속 PNU 2건 자동 해석 검증
      posture: 'income',
      buildingName: '선유도 다필지 코너빌딩',
      coordinates: { lat: 37.5381, lng: 126.8938 },
      bottomSheet: r9BottomSheet,
      photos: r1Photos,
      ssotExtra: {
        bcr_pct: 58.2,
        far_pct: 233.2,
        arch_area_sqm: 301.8,
        structure: '철근콘크리트구조',
        road_condition: '양산로19길 코너 접면',
      },
      oracle: computeOracle({
        caseId: 'R9_MULTI_PARCEL_3LOTS_MESSY_STRINGS',
        description: '다필지 쉼표 주소로부터 19자리 PNU 3건 자동 추출 및 비정형 한글 금액("1억 5,000만", "950만원 (VAT 별도)") 파싱 검증',
        askingPriceManwon: 1500000,
        landAreaM2: 518.7,
        grossFloorAreaM2: 1210.0,
        leases: r9Leases,
        expectedSlideCount: 9,
        expectedPhotoCount: 2,
        expectedGallerySlideCount: 1,
        expectedGalleryLayouts: ['DUAL_LANDSCAPE'],
        expectedHeroPhotoSubstring: 'p1-dangsan-income/r2-standard/images/image_01.jpeg',
      }),
    },
  ];
}
