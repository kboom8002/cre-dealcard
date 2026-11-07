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

export type PseudoGoldenCaseId =
  | 'R1_FULL_OCCUPANCY_SINGLE_FLOOR'
  | 'R2_HIGH_DENSITY_18_UNIT_SPLIT'
  | 'R3_VALUE_ADD_VACANT_OWNER_MIX'
  | 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME'
  | 'R5_EXCLUSIVE_AREA_PYEONG_INPUT'
  | 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS';

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

function getDangsanPhotos(): PhotoMeta[] {
  return loadPhotosFromDirectory(DANGSAN_IMAGES_DIR, [
    { url: 'image_01.jpeg', category: 'exterior', caption: '전면 외관', isHero: true, role: 'cover' },
    { url: 'image_02.jpeg', category: 'exterior', caption: '측면 외관', role: 'exterior' },
    { url: 'image_07.jpeg', category: 'entrance', caption: '1층 주출입구', role: 'exterior' },
    { url: 'image_08.jpeg', category: 'interior', caption: '1층 복도', role: 'interior' },
    { url: 'image_09.jpeg', category: 'interior', caption: '전용 내부', role: 'interior' },
    { url: 'image_14.jpeg', category: 'parking', caption: '자주식 주차장', role: 'facility' },
  ]);
}

function getYangpyeongPhotos(): PhotoMeta[] {
  return loadPhotosFromDirectory(YANGPYEONG_IMAGES_DIR, [
    { url: 'image_01.jpg', category: 'exterior', caption: '건물 외관', isHero: true, role: 'cover' },
    { url: 'image_02.jpg', category: 'interior', caption: '1층 로비', role: 'interior' },
    { url: 'image_03.jpg', category: 'interior', caption: '엘리베이터홀', role: 'interior' },
    { url: 'image_04.jpg', category: 'parking', caption: '주차장', role: 'facility' },
    { url: 'image_05.jpg', category: 'surroundings', caption: '주변 도로/환경', role: 'surroundings' },
  ]);
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
      totalDepositManwon += Number(fl.deposit_manwon || 0);
      monthlyRentManwon += Number(fl.rent_manwon || 0);
    }

    const m2 = Number((fl as any).area_m2 ?? (fl as any).area_sqm ?? 0);
    const py = Number(fl.area_pyeong ?? 0);
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
  };
}

/**
 * 6대 슈도 골든 시나리오(Cases R1~R6)를 생성합니다.
 */
export function buildPseudoGoldenScenarios(): PseudoGoldenScenario[] {
  const dangsanPhotos = getDangsanPhotos();
  const yangpyeongPhotos = getYangpyeongPhotos();

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

  return [
    {
      caseId: 'R1_FULL_OCCUPANCY_SINGLE_FLOOR',
      label: 'Case R1: 완전 만실 1층=1호실 표준 (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 코너 메디컬빌딩',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r1BottomSheet,
      photos: dangsanPhotos,
      ssotExtra: {
        bcr_pct: 51.89,
        far_pct: 221.76,
        arch_area_sqm: 263.01,
        structure: '철근콘크리트구조',
        road_condition: '중로각지',
      },
      oracle: computeOracle({
        caseId: 'R1_FULL_OCCUPANCY_SINGLE_FLOOR',
        description: '전 층 만실(6개 층 6개 호실) 표준 수익형',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r1Leases,
      }),
    },
    {
      caseId: 'R2_HIGH_DENSITY_18_UNIT_SPLIT',
      label: 'Case R2: 다호실 쪼개기 과밀 16개 호실 (양평동4가 117 외 2필지)',
      pnu: '1156012800101170000',
      pnus: ['1156012800101170000', '1156012800101340000', '1156012800101250002'],
      posture: 'income',
      buildingName: '선유도역 더레드 타워',
      coordinates: { lat: 37.5381, lng: 126.8938 },
      bottomSheet: r2BottomSheet,
      photos: yangpyeongPhotos,
      ssotExtra: {
        bcr_pct: 58.4,
        far_pct: 398.8,
        arch_area_sqm: 302.92,
        structure: '철근콘크리트구조',
        road_condition: '25m 양평로 코너 접면',
      },
      oracle: computeOracle({
        caseId: 'R2_HIGH_DENSITY_18_UNIT_SPLIT',
        description: 'B1~10F 총 16개 분할 호실 과밀 렌트롤(2면 분할) + 다중 용도 스태킹',
        askingPriceManwon: 2500000,
        landAreaM2: 518.7,
        grossFloorAreaM2: 2490.88,
        leases: r2Leases,
        expectedSlideCount: 10,
      }),
    },
    {
      caseId: 'R3_VALUE_ADD_VACANT_OWNER_MIX',
      label: 'Case R3: 부분 공실(1) + 자가사용(2) + 임대(3) 혼합 밸류애드 (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 밸류업 메디컬타워',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r3BottomSheet,
      photos: dangsanPhotos,
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
        description: '임대 3호실 + 자가사용 2호실 + 공실 1호실 혼합 및 안정화 수익률 산출',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r3Leases,
      }),
    },
    {
      caseId: 'R4_MULTI_FLOOR_INTEGRATED_OTHER_INCOME',
      label: 'Case R4: 복층 통합계약(1F~2F) + 기타수입 월 180만 포함 (당산동5가 11-47)',
      pnu: '1156011500100110047',
      posture: 'income',
      buildingName: '당산 참좋은 메디컬센터',
      coordinates: { lat: 37.5342, lng: 126.9022 },
      bottomSheet: r4BottomSheet,
      photos: dangsanPhotos,
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
        description: '1F~2F 복층 통합계약(2F 임대료 0원·통합 비고) 및 옥상 통신중계기 기타수입 월 180만원',
        askingPriceManwon: 1150000,
        landAreaM2: 506.8,
        grossFloorAreaM2: 1441.15,
        leases: r4Leases,
        otherIncomeMonthlyManwon: 180,
      }),
    },
    {
      caseId: 'R5_EXCLUSIVE_AREA_PYEONG_INPUT',
      label: 'Case R5: 평(py) 단위 전용면적 입력 (서초동 1364-28)',
      pnu: '1165010800113640028',
      posture: 'income',
      buildingName: '서초 남부순환로 프라임빌딩',
      coordinates: { lat: 37.4836, lng: 127.0357 },
      bottomSheet: r5BottomSheet,
      photos: dangsanPhotos,
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
        description: '전용면적 평(py) 단위 단독 입력 시 이중 환산 방지 및 스태킹·렌트롤 정합성',
        askingPriceManwon: 2300000,
        landAreaM2: 596.0,
        grossFloorAreaM2: 2104.8,
        leases: r5Leases,
        areaInputUnit: 'pyeong',
      }),
    },
    {
      caseId: 'R6_ZERO_RENT_OWNER_HQ_WITH_COMPS',
      label: 'Case R6: 전층 명도·사옥형 (임대료 0원) + 인근 시세비교 3건 (서초동 1364-28)',
      pnu: '1165010800113640028',
      posture: 'owner_occupied',
      buildingName: '서초 단독 사옥 타워',
      coordinates: { lat: 37.4836, lng: 127.0357 },
      bottomSheet: r6BottomSheet,
      photos: dangsanPhotos,
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
        description: '전 층 자가사용(임대료 0원) 사옥형 포스처(수익률 산식 제외) + 인근 시세 비교 슬라이드 추가(9면)',
        askingPriceManwon: 2300000,
        landAreaM2: 596.0,
        grossFloorAreaM2: 2104.8,
        leases: r6Leases,
        expectedSlideCount: 9,
      }),
    },
  ];
}
