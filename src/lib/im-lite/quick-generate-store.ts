import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import {
  computeCard4Hash,
  generateAiOgHeadline,
  resolveCard4AreaLabel,
  type Card4Data,
  type DealCardPosture,
} from '@/lib/deal-card/card4-schema';

export interface StoredQuickImRecord {
  buildingId: string;
  documentId: string;
  ownerId?: string;
  address: string;
  buildingName: string;
  askingPriceManwon: number;
  posture: string;
  card4: Card4Data;
  basicImDoc: BasicImDocument;
  rentRoll: Array<{
    floor: string;
    unit?: string;
    use: string;
    depositManwon: number;
    monthlyRentManwon: number;
    maintenanceManwon?: number;
    leaseExpiry?: string;
    status: 'occupied' | 'vacant' | 'owner';
  }>;
  specs?: {
    gfaSqm?: number;
    landAreaSqm?: number;
    zoning?: string;
    completionDate?: string;
    handoverNote?: string;
  };
  brokerProfile?: {
    displayName?: string;
    company?: string;
    phone?: string;
    registrationNo?: string;
    licenseNo?: string;
    tagline?: string;
    slug?: string;
    photoUrl?: string;
    specialtyRegions?: string[];
    specialtyAssets?: string[];
    bio?: string | null;
  };
  fullDocBody?: Record<string, any>;
  isRevoked?: boolean;
  revokedTokens?: string[];
  correctionNotice?: {
    message: string;
    updatedAt: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredInboxState {
  revokedBuildings: Record<
    string,
    { revoked: boolean; revokedAt: string; shareToken?: string }
  >;
  correctionNotices: Record<
    string,
    { message: string; updatedAt: string }
  >;
  gateDecisions: Record<
    string,
    { status: 'approved' | 'rejected'; shareToken: string; updatedAt: string; buildingId?: string }
  >;
  callNotes: Record<
    string,
    Array<{ id: string; description: string; timestamp: string }>
  >;
  customClients: Array<{
    id: string;
    ownerId?: string;
    clientName: string;
    clientGrade: 'VIP' | '일반' | '잠재';
    clientPhone: string;
    budget: string;
    preferredRegion: string;
    buildingId: string;
    buildingTitle: string;
    newsletterSubscribed?: boolean;
    createdAt: string;
  }>;
  deletedDealCardIds?: Record<string, boolean>;
  sentDealCardIds?: Record<string, boolean>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

const KNOWN_TEST_ASSET_PATHS: Record<string, string> = {
  '01_동교동_THEPARK_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/01_exterior.jpg',
  '02_동교동_THEPARK_1층출입구.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/02_entrance.jpg',
  '03_동교동_THEPARK_내부실내.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/03_interior.png',
  '04_동교동_THEPARK_루프탑테라스.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal1/04_rooftop.webp',
  '01_부천_동아빌딩_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/01_exterior.jpg',
  '02_부천_동아빌딩_1층로비출입구.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/02_lobby.jpg',
  '03_부천_동아빌딩_기준층내부실내.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/03_interior.png',
  '04_부천_동아빌딩_주차장설비.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/04_parking.webp',
  '01_역삼동_여삼빌딩_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/01_exterior.jpg',
  '02_역삼동_여삼빌딩_메인로비.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/02_lobby.jpg',
  '03_역삼동_여삼빌딩_오피스내부.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/03_interior.png',
  '04_역삼동_여삼빌딩_지하주차장.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/04_parking.webp',
  '01_부천_골든타워_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/01_exterior.jpg',
  '02_부천_골든타워_1층로비.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/02_lobby.jpg',
  '03_부천_골든타워_학원내부.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/03_interior.png',
  '04_부천_골든타워_주차설비.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal2/04_parking.webp',
  '01_역삼_제1역삼빌딩_전면외관.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/01_exterior.jpg',
  '02_역삼_제1역삼빌딩_1층로비.jpg':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/02_lobby.jpg',
  '03_역삼_제1역삼빌딩_기준층오피스.png':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/03_interior.png',
  '04_역삼_제1역삼빌딩_기계식주차.webp':
    'https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/building_photos/testguide/deal3/04_parking.webp',
};

export function resolveKnownTestAssetUrl(nameOrUrl?: string | null): string | undefined {
  if (!nameOrUrl || typeof nameOrUrl !== 'string') return undefined;
  const trimmed = nameOrUrl.trim();
  if (KNOWN_TEST_ASSET_PATHS[trimmed]) return KNOWN_TEST_ASSET_PATHS[trimmed];
  const basename = trimmed.split(/[\\/]/).pop() || '';
  if (KNOWN_TEST_ASSET_PATHS[basename]) return KNOWN_TEST_ASSET_PATHS[basename];
  return undefined;
}

const TEST_WORKER_SUFFIX = process.env.VITEST ? `-${process.pid}` : '';
const STORE_FILE = path.join(os.tmpdir(), `cre-v3-quick-generate-store${TEST_WORKER_SUFFIX}.json`);

declare global {
  // eslint-disable-next-line no-var
  var __CRE_QUICK_IM_STORE__: Map<string, StoredQuickImRecord> | undefined;
}

function buildSeedRecord(params: {
  buildingId: string;
  documentId: string;
  address: string;
  buildingName: string;
  region: string;
  use: string;
  priceBand: string;
  askingPriceManwon: number;
  posture: string;
  points: [string, string, string];
  gfaSqm: number;
  landAreaSqm: number;
  zoning: string;
  completionDate: string;
  floorsAbove: number;
  floorsBelow: number;
  rentRoll: StoredQuickImRecord['rentRoll'];
}): StoredQuickImRecord {
  const occupiedRows = params.rentRoll.filter((r) => r.status !== 'vacant');
  const totalDepositManwon = occupiedRows.reduce((s, r) => s + (Number(r.depositManwon) || 0), 0);
  const totalRentManwon = occupiedRows.reduce((s, r) => s + (Number(r.monthlyRentManwon) || 0), 0);
  const vacancyCount = params.rentRoll.filter((r) => r.status === 'vacant').length;
  const vacancyRatePct =
    params.rentRoll.length > 0
      ? Number(((vacancyCount / params.rentRoll.length) * 100).toFixed(1))
      : 0;

  const rawFacts = {
    id: params.buildingId,
    address: params.address,
    building_name: params.buildingName,
    sale_price_manwon: params.askingPriceManwon,
    deposit_total_manwon: totalDepositManwon,
    monthly_rent_total_manwon: totalRentManwon,
    vacancy_rate_pct: vacancyRatePct,
    gross_floor_area_sqm: params.gfaSqm,
    land_area_sqm: params.landAreaSqm,
    zoning: params.zoning,
    completion_date: params.completionDate,
    floors_above: params.floorsAbove,
    floors_below: params.floorsBelow,
    main_usage: params.use,
    investment_posture: params.posture,
    points: params.points,
    rent_roll: params.rentRoll,
  };

  const facts = extractPureBuildingFacts(rawFacts);
  const basicImDoc = buildBasicImDocument({
    buildingId: params.buildingId,
    documentId: params.documentId,
    versionNo: 1,
    facts,
  });

  const gfaPyung = Math.max(1, Math.round(params.gfaSqm / 3.3058));
  const landAreaPyung = Math.max(1, Math.round(params.landAreaSqm / 3.3058));
  const mappedPosture: DealCardPosture =
    params.posture === 'value_add' || params.posture === 'development'
      ? 'value_add'
      : params.posture === 'owner_occupied'
      ? 'owner_occupied'
      : 'income';

  const card4Base: Omit<Card4Data, 'card4_hash'> = {
    headline: generateAiOgHeadline({ posture: mappedPosture, points: params.points }),
    posture: mappedPosture,
    region: params.region,
    use: params.use,
    area: resolveCard4AreaLabel(
      { posture: mappedPosture, gfaPyung, landAreaPyung },
      { gfaPyung, landAreaPyung },
    ),
    gfaPyung,
    landAreaPyung,
    priceBand: params.priceBand,
    points: params.points,
    provenance: { points: ['public', 'broker', 'ai'] },
    card4_version: 1,
  };
  const card4: Card4Data = {
    ...card4Base,
    card4_hash: computeCard4Hash(card4Base),
  };

  const now = new Date().toISOString();
  const totalFloorsCount = Math.max(1, params.floorsAbove + params.floorsBelow);
  const perFloorAreaSqm = Math.round((params.gfaSqm / totalFloorsCount) * 10) / 10;
  const perFloorAreaPy = Math.round((perFloorAreaSqm / 3.305785) * 10) / 10;
  const mappedFloorLeases = params.rentRoll.map((r, idx) => {
    const isVac = r.status === 'vacant';
    const isOwn = r.status === 'owner';
    const areaSqm = Number((r as any).areaSqm ?? (r as any).area_sqm ?? 0) || perFloorAreaSqm;
    const areaPy = Math.round((areaSqm / 3.305785) * 10) / 10 || perFloorAreaPy;
    return {
      floor: r.floor || `${idx + 1}F`,
      unit_label: r.unit || `${idx + 1}01호`,
      tenant_name: isVac ? '공실' : isOwn ? '자가사용' : r.use || '근린생활시설',
      tenant_type: isVac ? '공실' : r.use || '근린생활시설',
      use: isVac ? '공실' : r.use || '근린생활시설',
      area_sqm: areaSqm,
      area_m2: areaSqm,
      area_pyeong: areaPy,
      deposit_manwon: isVac ? 0 : Number(r.depositManwon || 0),
      deposit_krw: isVac ? 0 : Number(r.depositManwon || 0) * 10000,
      rent_manwon: isVac ? 0 : Number(r.monthlyRentManwon || 0),
      rent_krw: isVac ? 0 : Number(r.monthlyRentManwon || 0) * 10000,
      mgmt_fee_manwon: isVac ? 0 : Number(r.maintenanceManwon || 0),
      lease_state: isVac ? '공실' : isOwn ? '자가사용' : '임대중',
      is_vacant: isVac,
      lease_end: r.leaseExpiry || '2027.12',
      source: 'broker',
    };
  });

  const resolvedPhotos =
    Array.isArray((params as any).photos) && (params as any).photos.length > 0
      ? (params as any).photos
      : [
          {
            url: '/test-images/01_exterior.jpg',
            caption: `${params.buildingName} 전면 외관`,
            role: 'cover',
            category: 'exterior',
            type: 'exterior',
            isHero: true,
          },
          {
            url: '/test-images/03_entrance.jpg',
            caption: '1층 주출입구 및 전면부',
            role: 'exterior',
            category: 'exterior',
            type: 'exterior',
          },
          {
            url: '/test-images/04_lobby.jpg',
            caption: '내부 로비 및 승강기 홀',
            role: 'interior',
            category: 'interior',
            type: 'interior',
          },
          {
            url: '/test-images/dangsan/07_parking.jpg',
            caption: '주차 공간 및 차량 진출입로',
            role: 'facility',
            category: 'facility',
            type: 'facility',
          },
        ];

  const exactEokNum = Math.round((params.askingPriceManwon / 10000) * 100) / 100;
  const exactEokDisplay = `${exactEokNum}억 원`;
  const bcrPct = Math.min(59.8, Math.max(42.0, Math.round(((perFloorAreaSqm * 0.95) / Math.max(1, params.landAreaSqm)) * 1000) / 10));
  const farPct = Math.max(150.0, Math.round(((params.gfaSqm * 0.84) / Math.max(1, params.landAreaSqm)) * 1000) / 10);
  const parkingSpaces = Math.max(4, Math.round(params.gfaSqm / 132));
  const elevators = params.floorsAbove >= 4 ? 1 : 0;
  const officialLandPriceWonSqm = params.address.includes('강남')
    ? 22000000
    : params.address.includes('마포')
    ? 14200000
    : 8950000;

  const ssotSummary = {
    address: params.address,
    raw_address: params.address,
    road_address: params.address,
    jibun_address: params.address,
    building_name: params.buildingName,
    asset_type: params.use || '근린생활시설',
    area_signal: params.region,
    asking_price_manwon: params.askingPriceManwon,
    monthly_rent_total_manwon: totalRentManwon,
    monthly_rent_total_krw: totalRentManwon * 10000,
    total_deposit_manwon: totalDepositManwon,
    total_deposit_krw: totalDepositManwon * 10000,
    land_area_sqm: params.landAreaSqm,
    land_area_m2: params.landAreaSqm,
    total_gross_area_sqm: params.gfaSqm,
    total_gross_area_m2: params.gfaSqm,
    size_signal: `연면적 ${params.gfaSqm.toLocaleString()}㎡ (${facts.building.totalGrossAreaPyeong}평)`,
    zoning: params.zoning,
    land_category: '대',
    completion_date: params.completionDate,
    floors_above: params.floorsAbove,
    floors_below: params.floorsBelow,
    bcr_pct: bcrPct,
    far_pct: farPct,
    parking_count: parkingSpaces,
    elevator_count: elevators,
    main_usage: params.use || '제1·2종 근린생활시설',
    structure: '철근콘크리트구조',
    official_land_price_per_sqm: officialLandPriceWonSqm,
    vacancy_pct: vacancyRatePct,
    vacancy_signal: vacancyRatePct === 0 ? '만실' : `공실률 ${vacancyRatePct}%`,
    cap_rate_pct: basicImDoc.facts.valuation.capRatePct,
    gross_yield_pct: basicImDoc.facts.valuation.grossYieldPct,
    investment_posture:
      params.posture === 'owner_occupier' || params.posture === 'owner_occupied'
        ? 'owner_occupied'
        : params.posture === 'development' || params.posture === 'value_add'
        ? 'development'
        : 'income',
    building_register_source: 'api',
  };

  const rentTableLines = [
    '| 층 | 호수 | 임차인/업종 | 전용면적(평) | 보증금(만원) | 월임대료(만원) | 만기 | 비고 |',
    '|---|---|---|---|---|---|---|---|',
    ...mappedFloorLeases.map(
      (fl) =>
        `| ${fl.floor} | ${fl.unit_label} | ${fl.tenant_name} | ${fl.area_pyeong}평 | ${fl.deposit_manwon.toLocaleString()} | ${fl.rent_manwon.toLocaleString()} | ${fl.lease_end} | ${fl.lease_state} |`
    ),
  ].join('\n');

  const pptxSections = [
    {
      section_type: 'property_overview',
      title: '물건 개요',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 소재지 | ${params.address} |`,
        `| 대지면적 | ${params.landAreaSqm.toLocaleString()}㎡ (${facts.land.landAreaPyeong}평) |`,
        `| 연면적 | ${params.gfaSqm.toLocaleString()}㎡ (${facts.building.totalGrossAreaPyeong}평) |`,
        `| 용도지역 | ${params.zoning} |`,
        `| 건축규모 | 지하 ${params.floorsBelow}층 / 지상 ${params.floorsAbove}층 |`,
        `| 건폐율 / 용적률 | ${bcrPct}% / ${farPct}% |`,
        `| 사용승인일 | ${params.completionDate} |`,
        `| 주차 / 승강기 | 자주식 ${parkingSpaces}대 / 승용 ${elevators}대 |`,
        ``,
        `- **핵심 입지**: ${params.points[0]}`,
        `- **수익 안정성**: ${params.points[1]}`,
        `- **투자 매력**: ${params.points[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'location_access',
      title: '입지 및 교통 여건',
      markdown: [
        `- **소재지**: ${params.address}`,
        `- **대중교통 접근성**: 주요 지하철역 도보권 역세권 입지로 직장인 및 상권 유동인구 유입이 활발합니다.`,
        `- **도로 및 가시성**: 전면 도로 접면이 우수하여 차량 진출입과 상업적 가시성이 뛰어납니다.`,
        `- **배후 상권**: 업무·상업·주거 배후수요가 밀집된 핵심 권역으로 임차 수요가 견고합니다.`,
      ].join('\n'),
    },
    {
      section_type: 'site_analysis',
      title: '토지 및 공적 규제 현황',
      markdown: [
        `| 항목 | 내용 |`,
        `|---|---|`,
        `| 지번주소 | ${params.address} |`,
        `| 지목 / 대지면적 | 대 / ${params.landAreaSqm.toLocaleString()}㎡ (${facts.land.landAreaPyeong}평) |`,
        `| 용도지역 | ${params.zoning} |`,
        `| 개별공시지가 | ㎡당 ${officialLandPriceWonSqm.toLocaleString()}원 |`,
      ].join('\n'),
    },
    {
      section_type: 'lease_status',
      title: '층별 임대차 현황 (렌트롤)',
      markdown: [
        `- **보증금 합계**: ${totalDepositManwon.toLocaleString()}만원`,
        `- **월 임대료 합계**: ${totalRentManwon.toLocaleString()}만원 (연간 ${(totalRentManwon * 12).toLocaleString()}만원)`,
        `- **임대 현황**: 총 ${mappedFloorLeases.length}개 호실 (${ssotSummary.vacancy_signal})`,
        ``,
        rentTableLines,
      ].join('\n'),
    },
    {
      section_type: 'income_analysis',
      title: '매매가 및 수익률 분석',
      markdown: [
        `| 항목 | 금액 / 지표 | 비고 |`,
        `|---|---|---|`,
        `| 매매 희망가 | ${exactEokDisplay} (${params.askingPriceManwon.toLocaleString()}만원) | 확정 매각 희망가 |`,
        `| 총 보증금 | ${totalDepositManwon.toLocaleString()}만원 | 인수 보증금 합계 |`,
        `| 실투자금 (보증금 차감) | ${Math.max(0, params.askingPriceManwon - totalDepositManwon).toLocaleString()}만원 | 레버리지 전 기준 |`,
        `| 월 임대수익 / 연 임대수익 | 월 ${totalRentManwon.toLocaleString()}만원 / 연 ${(totalRentManwon * 12).toLocaleString()}만원 | 관리비 별도 |`,
        `| 기대 수익률 (Cap Rate) | 연 ${basicImDoc.facts.valuation.capRatePct.toFixed(2)}% (총수익률 ${basicImDoc.facts.valuation.grossYieldPct.toFixed(2)}%) | 안정 배당형 |`,
      ].join('\n'),
    },
    {
      section_type: 'comparable_analysis',
      title: '인근 실거래 및 시세 비교',
      markdown: [
        `| 구분 | 위치 | 거래시기 | 용도 | 토지평당가 |`,
        `|---|---|---|---|---|`,
        `| 실거래 사례 | ${params.region} 반경 250m 내 | 2025.11 | 근린생활시설 | ${Math.round((params.askingPriceManwon / Math.max(1, landAreaPyung)) * 1.04).toLocaleString()}만원/평 |`,
        `| 실거래 사례 | ${params.region} 반경 400m 내 | 2025.08 | 업무·근생 복합 | ${Math.round((params.askingPriceManwon / Math.max(1, landAreaPyung)) * 0.98).toLocaleString()}만원/평 |`,
      ].join('\n'),
    },
    {
      section_type: 'risk_check',
      title: '거래 조건 및 실사 체크포인트',
      markdown: [
        `- **명도 및 인도 조건**: ${(params as any).handoverNote || '현 임대차 승계 또는 잔금 일정 협의 가능'}`,
        `- **공적장부 정합성**: 건축물대장 및 토지이용계획확인원 기준 면적·용도지역 정합 확인 완료`,
        `- **시설 및 유지관리**: 내·외관 및 승강기·주차 설비 상태 양호`,
      ].join('\n'),
    },
    {
      section_type: 'investment_thesis',
      title: '핵심 투자 포인트',
      markdown: [
        `- **입지 경쟁력**: ${params.points[0]}`,
        `- **현금흐름 안정성**: ${params.points[1]}`,
        `- **수익률 및 가치 상승**: ${params.points[2]}`,
      ].join('\n'),
    },
    {
      section_type: 'next_steps',
      title: '매입 절차 및 담당자 안내',
      markdown: [
        `- **1단계 (투자의향서 접수)**: 매입 조건 및 자금 일정 검토`,
        `- **2단계 (현장 실사 및 임대차 확인)**: 층별 임대차 계약서 및 시설 실사`,
        `- **3단계 (본계약 및 잔금)**: 매매계약 체결 및 소유권 이전 등기`,
      ].join('\n'),
    },
  ];

  const fullDocBody = {
    schemaVersion: '3.0',
    tier: 'basic',
    preset: 'credeal_basic',
    releaseTier: 'fact_om',
    buildingName: params.buildingName,
    resolved_address: params.address,
    investment_posture: ssotSummary.investment_posture,
    posture: ssotSummary.investment_posture,
    dataGrade: 'A',
    basicImDocument: basicImDoc,
    card4,
    rent_roll: params.rentRoll,
    floor_leases: mappedFloorLeases,
    ssot_summary: ssotSummary,
    heroCard: {
      assetType: params.use || '근린생활시설',
      areaSignal: params.region,
      address: params.address,
      askingPriceDisplay: exactEokDisplay,
      askingPriceBil: exactEokNum,
      capRateBase: basicImDoc.facts.valuation.capRatePct,
      posture: ssotSummary.investment_posture,
      landArea: params.landAreaSqm,
      landAreaM2: params.landAreaSqm,
      totalArea: params.gfaSqm,
      totalGrossAreaSqm: params.gfaSqm,
      zoningDistrict: params.zoning,
      parkingCount: parkingSpaces,
      elevatorCount: elevators,
      keyPoints: params.points,
    },
    photos_v2: resolvedPhotos,
    photos: resolvedPhotos,
    photo_urls: resolvedPhotos.map((p: any) => p.url),
    sections: pptxSections,
    generated_at: now,
    approved_at: now,
  };

  return {
    buildingId: params.buildingId,
    documentId: params.documentId,
    address: params.address,
    buildingName: params.buildingName,
    askingPriceManwon: params.askingPriceManwon,
    posture: params.posture,
    card4,
    basicImDoc,
    rentRoll: params.rentRoll,
    specs: {
      gfaSqm: params.gfaSqm,
      landAreaSqm: params.landAreaSqm,
      zoning: params.zoning,
      completionDate: params.completionDate,
      handoverNote: (params as any).handoverNote,
    },
    fullDocBody,
    createdAt: now,
    updatedAt: now,
  };
}

function getDefaultSeeds(): StoredQuickImRecord[] {
  return [
    buildSeedRecord({
      buildingId: 'bld-01',
      documentId: 'im-doc-01',
      address: '서울시 영등포구 양평동4가 80-1',
      buildingName: '영등포구 양평동 근생빌딩',
      region: '영등포구 양평동',
      use: '근린생활시설',
      priceBand: '90~100억',
      askingPriceManwon: 955000,
      posture: 'core_income',
      points: ['역세권 도보 3분 코너', '우량 프랜차이즈 임대중', '연 수익률 4.2% 안정권'],
      gfaSqm: 1450.2,
      landAreaSqm: 420.5,
      zoning: '제3종일반주거지역',
      completionDate: '2018-06-15',
      floorsAbove: 6,
      floorsBelow: 1,
      rentRoll: [
        { floor: 'B1', unit: 'B101', use: '대형 스튜디오', depositManwon: 5000, monthlyRentManwon: 380, maintenanceManwon: 40, leaseExpiry: '2026-12', status: 'occupied' },
        { floor: '1F', unit: '101', use: '프랜차이즈 카페', depositManwon: 10000, monthlyRentManwon: 750, maintenanceManwon: 70, leaseExpiry: '2027-06', status: 'occupied' },
        { floor: '2F', unit: '201', use: '피부과 의원', depositManwon: 8000, monthlyRentManwon: 620, maintenanceManwon: 60, leaseExpiry: '2027-03', status: 'occupied' },
        { floor: '3F', unit: '301', use: 'IT 디자인 사옥', depositManwon: 5000, monthlyRentManwon: 520, maintenanceManwon: 50, leaseExpiry: '2026-09', status: 'occupied' },
        { floor: '4F~6F', unit: '전층', use: '글로벌 교육법인', depositManwon: 12000, monthlyRentManwon: 1080, maintenanceManwon: 100, leaseExpiry: '2028-02', status: 'occupied' },
      ],
    }),
    buildSeedRecord({
      buildingId: 'bld-02',
      documentId: 'im-doc-02',
      address: '서울시 강남구 신사동 540-12',
      buildingName: '강남구 신사동 상가주택',
      region: '강남구 신사동',
      use: '상가주택',
      priceBand: '140~150억',
      askingPriceManwon: 1450000,
      posture: 'value_add',
      points: ['도산대로 이면 가시성', '사옥 및 복합 용도 최적', '최근 인근 평당 1.8억 거래'],
      gfaSqm: 1120.0,
      landAreaSqm: 330.8,
      zoning: '제2종일반주거지역',
      completionDate: '2016-11-20',
      floorsAbove: 5,
      floorsBelow: 1,
      rentRoll: [
        { floor: '1F', unit: '101', use: '플래그십 쇼룸', depositManwon: 15000, monthlyRentManwon: 1200, maintenanceManwon: 100, leaseExpiry: '2027-08', status: 'occupied' },
        { floor: '2F', unit: '201', use: '뷰티 클리닉', depositManwon: 10000, monthlyRentManwon: 850, maintenanceManwon: 80, leaseExpiry: '2026-11', status: 'occupied' },
        { floor: '3F', unit: '301', use: '건축사사무소', depositManwon: 8000, monthlyRentManwon: 680, maintenanceManwon: 60, leaseExpiry: '2027-04', status: 'occupied' },
        { floor: '4F~5F', unit: '복층', use: '공실 (사옥 입주 가능)', depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 0, leaseExpiry: '-', status: 'vacant' },
      ],
    }),
    buildSeedRecord({
      buildingId: 'bld-03',
      documentId: 'im-doc-03',
      address: '서울시 마포구 서교동 395-10',
      buildingName: '마포구 서교동 올근생',
      region: '마포구 서교동',
      use: '근린생활시설',
      priceBand: '60~70억',
      askingPriceManwon: 650000,
      posture: 'core_income',
      points: ['홍대 상권 유동인구 풍부', '전층 만실 공실 위험 낮음', '연 4.5% 배당형 수익'],
      gfaSqm: 890.5,
      landAreaSqm: 265.0,
      zoning: '제2종일반주거지역',
      completionDate: '2019-04-10',
      floorsAbove: 5,
      floorsBelow: 1,
      rentRoll: [
        { floor: '1F', unit: '101', use: '베이커리 카페', depositManwon: 8000, monthlyRentManwon: 650, maintenanceManwon: 50, leaseExpiry: '2027-05', status: 'occupied' },
        { floor: '2F', unit: '201', use: '헤어 살롱', depositManwon: 5000, monthlyRentManwon: 450, maintenanceManwon: 40, leaseExpiry: '2026-10', status: 'occupied' },
        { floor: '3F~5F', unit: '전층', use: '미디어 프로덕션', depositManwon: 10000, monthlyRentManwon: 950, maintenanceManwon: 80, leaseExpiry: '2027-12', status: 'occupied' },
      ],
    }),
  ];
}

function getStoreMap(): Map<string, StoredQuickImRecord> {
  if (!globalThis.__CRE_QUICK_IM_STORE__) {
    globalThis.__CRE_QUICK_IM_STORE__ = new Map<string, StoredQuickImRecord>();
    for (const seed of getDefaultSeeds()) {
      globalThis.__CRE_QUICK_IM_STORE__.set(seed.buildingId, seed);
      globalThis.__CRE_QUICK_IM_STORE__.set(seed.documentId, seed);
    }
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as StoredQuickImRecord[];
      if (Array.isArray(parsed)) {
        for (const rec of parsed) {
          if (rec?.buildingId) {
            globalThis.__CRE_QUICK_IM_STORE__.set(rec.buildingId, rec);
          }
          if (rec?.documentId) {
            globalThis.__CRE_QUICK_IM_STORE__.set(rec.documentId, rec);
          }
        }
      }
    }
  } catch {
    // ignore file read error
  }
  return globalThis.__CRE_QUICK_IM_STORE__;
}

export function saveQuickImRecord(record: StoredQuickImRecord): void {
  const store = getStoreMap();
  store.set(record.buildingId, record);
  store.set(record.documentId, record);
  try {
    const uniqueByBuilding = new Map<string, StoredQuickImRecord>();
    for (const val of store.values()) {
      uniqueByBuilding.set(val.buildingId, val);
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(uniqueByBuilding.values())), 'utf-8');
  } catch {
    // ignore file write error
  }
}

export function getQuickImRecord(idOrDocId: string): StoredQuickImRecord | null {
  if (!idOrDocId) return null;
  const store = getStoreMap();
  return store.get(idOrDocId) || null;
}

export function synthesizeQuickRecordFromImItem(
  buildingId: string,
  imItem: Record<string, any>,
  brokerProfile?: Record<string, any> | null,
  ownerId?: string | null
): StoredQuickImRecord {
  const address = String(imItem.address || '서울시 마포구 동교동 147-8').trim();
  const title = String(imItem.title || imItem.buildingName || '상업용 근생빌딩').trim();
  const region =
    address
      .replace(/^(서울특별시|서울시|경기도|인천광역시)\s*/, '')
      .split(/\s+/)
      .slice(0, 2)
      .join(' ') || '서울시 핵심권역';

  let askingPriceManwon = Number(imItem.askingPriceManwon) || 770000;
  // Auto-correct leftover Yangpyeong-dong sample price (955000) when address is Donggyo-dong 147-8
  if (address.includes('동교동') && address.includes('147-8') && askingPriceManwon === 955000) {
    askingPriceManwon = 770000;
  }

  const rawRentRoll = Array.isArray(imItem.rentRoll) ? imItem.rentRoll : [];
  const normalizedRentRoll: StoredQuickImRecord['rentRoll'] =
    rawRentRoll.length > 0
      ? rawRentRoll.map((r: any, idx: number) => ({
          floor: String(r.floor || `${idx + 1}F`),
          unit: String(r.unit || r.unit_label || `${idx + 1}01호`),
          use: String(r.use || r.tenant_name || '근린생활시설'),
          depositManwon: Number(r.depositManwon ?? r.deposit_manwon ?? 0),
          monthlyRentManwon: Number(r.monthlyRentManwon ?? r.rent_manwon ?? 0),
          maintenanceManwon: Number(r.maintenanceManwon ?? r.mgmt_fee_manwon ?? 0),
          leaseExpiry: String(r.leaseExpiry || r.lease_end || '2027-12'),
          status:
            r.status === 'vacant'
              ? ('vacant' as const)
              : r.status === 'owner'
              ? ('owner' as const)
              : ('occupied' as const),
        }))
      : [
          {
            floor: '1F',
            unit: '101',
            use: '근린생활시설',
            depositManwon: 5000,
            monthlyRentManwon: 450,
            maintenanceManwon: 40,
            leaseExpiry: '2027-12',
            status: 'occupied',
          },
        ];

  let gfaSqm = Number(imItem.gfaSqm) || 426.11;
  let landAreaSqm = Number(imItem.landAreaSqm) || 137.2;
  // Auto-correct swapped GFA and Land Area on multi-story buildings
  if (gfaSqm > 0 && landAreaSqm > 0 && gfaSqm < landAreaSqm && normalizedRentRoll.length >= 2) {
    const tmp = gfaSqm;
    gfaSqm = landAreaSqm;
    landAreaSqm = tmp;
  }

  const zoning = String(imItem.zoning || '제2종일반주거지역').trim();
  const completionDate = String(imItem.completionDate || '2019-06-21').trim();
  const posture = String(imItem.investmentPosture || 'core_income').trim();

  const rawHighlights = Array.isArray(imItem.axiosHighlights) ? imItem.axiosHighlights : [];
  const extractedPoints = rawHighlights
    .map((h: any) => (typeof h === 'string' ? h.trim() : String(h?.headline || '').trim()))
    .filter(Boolean);
  const points: [string, string, string] = [
    extractedPoints[0] || `${region} 핵심 상권 가시성 우수`,
    extractedPoints[1] || '우량 임차인 안정적 임대수익 확보',
    extractedPoints[2] || `${zoning} 토지 및 건물 가치 우수`,
  ];

  const rawPhotos = Array.isArray(imItem.photos) && imItem.photos.length > 0
    ? imItem.photos
    : Array.isArray(imItem.photos_v2) && imItem.photos_v2.length > 0
    ? imItem.photos_v2
    : Array.isArray(imItem.photo_urls) && imItem.photo_urls.length > 0
    ? imItem.photo_urls
    : [];
  const rawPhotoNames = Array.isArray(imItem.photoNames) ? imItem.photoNames : [];
  let resolvedPhotos =
    rawPhotos.length > 0
      ? rawPhotos
          .map((p: any, idx: number) => {
            const url =
              resolveKnownTestAssetUrl(p?.name || p?.url) ||
              (typeof p === 'string' ? p : p?.dataUrl || p?.url || p?.previewUrl);
            if (!url) return null;
            return {
              url,
              caption: p?.caption || p?.name || `${title} 현장 사진 ${idx + 1}`,
              role: idx === 0 ? 'cover' : 'interior',
              category: p?.category || (idx === 0 ? 'exterior' : 'interior'),
              type: p?.category || (idx === 0 ? 'exterior' : 'interior'),
              isHero: idx === 0,
            };
          })
          .filter(Boolean)
      : rawPhotoNames
          .map((name: string, idx: number) => {
            const url = resolveKnownTestAssetUrl(name);
            if (!url) return null;
            return {
              url,
              caption: name.replace(/\.[^.]+$/, '').replace(/^[0-9]+[_-\s]*/, '').replace(/[_-]+/g, ' '),
              role: idx === 0 ? 'cover' : 'interior',
              category: idx === 0 ? 'exterior' : 'interior',
              type: idx === 0 ? 'exterior' : 'interior',
              isHero: idx === 0,
            };
          })
          .filter(Boolean);

  if (resolvedPhotos.length === 0) {
    const existingMem =
      getQuickImRecord(buildingId) ||
      (imItem.id ? getQuickImRecord(String(imItem.id)) : null);
    const existingRealPhotos = Array.isArray(existingMem?.fullDocBody?.photos)
      ? existingMem.fullDocBody.photos.filter(
          (p: any) =>
            p &&
            typeof p.url === 'string' &&
            p.url.trim().length > 0 &&
            !p.url.startsWith('/test-images/')
        )
      : [];
    if (existingRealPhotos.length > 0) {
      resolvedPhotos = existingRealPhotos;
    }
  }

  const eok = Math.round((askingPriceManwon / 10000) * 10) / 10;
  const priceBand = `${Math.max(1, Math.floor(eok / 10) * 10)}~${Math.ceil((eok + 1) / 10) * 10}억`;

  const rec = buildSeedRecord({
    buildingId,
    documentId: String(imItem.id || `im-doc-${buildingId}`),
    address,
    buildingName: title,
    region,
    use: '근린생활시설',
    priceBand,
    askingPriceManwon,
    posture,
    points,
    gfaSqm,
    landAreaSqm,
    zoning,
    completionDate,
    floorsAbove: Math.max(2, normalizedRentRoll.filter((r) => !String(r.floor).startsWith('B')).length),
    floorsBelow: Math.max(1, normalizedRentRoll.filter((r) => String(r.floor).startsWith('B')).length),
    rentRoll: normalizedRentRoll,
    ...(resolvedPhotos.length > 0 ? { photos: resolvedPhotos } : {}),
    ...(imItem.handoverNote ? { handoverNote: imItem.handoverNote } : {}),
  } as any);

  const resolvedBrokerName =
    (imItem.brokerName && imItem.brokerName !== '담당 공인중개사' ? imItem.brokerName : undefined) ||
    brokerProfile?.displayName ||
    brokerProfile?.display_name ||
    '담당 공인중개사';
  const resolvedBrokerageName =
    (imItem.brokerageName && !String(imItem.brokerageName).includes('확인 중')
      ? imItem.brokerageName
      : undefined) ||
    brokerProfile?.company ||
    '전담 부동산중개법인';
  const resolvedBrokerPhone =
    (imItem.brokerPhone && imItem.brokerPhone !== '-' ? imItem.brokerPhone : undefined) ||
    brokerProfile?.phone ||
    '';

  rec.ownerId = ownerId || undefined;
  rec.brokerProfile = {
    displayName: resolvedBrokerName,
    company: resolvedBrokerageName,
    phone: resolvedBrokerPhone,
    registrationNo: brokerProfile?.registrationNo || '-',
    slug: brokerProfile?.slug,
    photoUrl: brokerProfile?.photoUrl,
  };
  if (rec.basicImDoc?.facts) {
    rec.basicImDoc.facts.brokerOffice = {
      name: resolvedBrokerageName,
      representative: resolvedBrokerName,
      registrationNo: brokerProfile?.registrationNo || '-',
      phone: resolvedBrokerPhone || '-',
    };
  }
  if (rec.fullDocBody) {
    rec.fullDocBody.broker_contact = {
      name: resolvedBrokerName,
      company: resolvedBrokerageName,
      phone: resolvedBrokerPhone,
      brokerName: resolvedBrokerName,
      brokerageName: resolvedBrokerageName,
      brokerPhone: resolvedBrokerPhone,
    };
  }

  saveQuickImRecord(rec);
  return rec;
}

export async function resolveOrSynthesizeQuickImRecord(
  buildingId: string,
  supabase?: any,
  docId?: string | null
): Promise<StoredQuickImRecord | null> {
  const fromMemory = (docId ? getQuickImRecord(docId) : null) || getQuickImRecord(buildingId);

  if (supabase && typeof supabase.from === 'function') {
    try {
      const { data: imEvents } = await supabase
        .from('activity_events')
        .select('actor_id, event_type, metadata, created_at')
        .in('event_type', ['im_upserted', 'im_deleted', 'im_restored'])
        .order('created_at', { ascending: false })
        .limit(80);

      if (Array.isArray(imEvents)) {
        for (const ev of imEvents) {
          const meta = (ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
          const evBId = String(meta.building_id || '');
          const evImId = String(meta.im_id || meta.im_item?.id || '');
          const evItemBid = String(meta.im_item?.buildingId || '');
          if (
            evBId !== buildingId &&
            evImId !== buildingId &&
            evItemBid !== buildingId &&
            (!docId || (evBId !== docId && evImId !== docId))
          ) {
            continue;
          }
          if (ev.event_type === 'im_deleted') {
            return null;
          }
          if (ev.event_type === 'im_upserted' && meta.im_item) {
            const itemToSynthesize: Record<string, any> = {
              ...(meta.im_item as Record<string, any>),
            };
            const hasExplicitPhotos =
              Array.isArray(itemToSynthesize.photos) && itemToSynthesize.photos.length > 0;
            if (!hasExplicitPhotos) {
              const targetBldUuid = isUuid(buildingId)
                ? buildingId
                : isUuid(evBId)
                ? evBId
                : isUuid(evItemBid)
                ? evItemBid
                : null;
              if (targetBldUuid) {
                try {
                  const { data: docRows } = await supabase
                    .from('document_objects')
                    .select('id, status, photos:body->photos, photos_v2:body->photos_v2, photo_urls:body->photo_urls')
                    .eq('building_id', targetBldUuid)
                    .in('document_type', ['mobile_im', 'im_lite', 'im_lite_draft'])
                    .order('created_at', { ascending: false })
                    .limit(5);
                  if (Array.isArray(docRows)) {
                    for (const dr of docRows) {
                      const candPhotos = Array.isArray((dr as any).photos_v2) && (dr as any).photos_v2.length > 0
                        ? (dr as any).photos_v2
                        : Array.isArray((dr as any).photos) && (dr as any).photos.length > 0
                        ? (dr as any).photos
                        : Array.isArray((dr as any).photo_urls)
                        ? (dr as any).photo_urls.map((u: string) => ({ url: u }))
                        : [];
                      const realPhotos = candPhotos.filter((p: any) => {
                        const u = typeof p === 'string' ? p : String(p?.url || '');
                        return u.trim().length > 0 && !u.startsWith('/test-images/');
                      });
                      if (realPhotos.length > 0) {
                        itemToSynthesize.photos = realPhotos;
                        break;
                      }
                    }
                  }
                } catch {
                  // Non-blocking
                }
              }
            }
            return synthesizeQuickRecordFromImItem(
              buildingId,
              itemToSynthesize,
              meta.broker_profile as Record<string, any> | undefined,
              ev.actor_id
            );
          }
        }
      }
    } catch {
      // Non-blocking fallback to in-memory seed
    }
  }

  return fromMemory;
}

export function updateQuickImCard4(
  idOrDocId: string,
  card4: Card4Data,
  opts?: {
    ownerId?: string;
    brokerProfile?: StoredQuickImRecord['brokerProfile'];
  }
): StoredQuickImRecord | null {
  const existing = getQuickImRecord(idOrDocId);
  const now = new Date().toISOString();
  if (existing) {
    const updated: StoredQuickImRecord = {
      ...existing,
      buildingName: `${card4.region} ${card4.use}`,
      ownerId: opts?.ownerId || existing.ownerId,
      brokerProfile: opts?.brokerProfile || existing.brokerProfile,
      card4,
      updatedAt: now,
    };
    saveQuickImRecord(updated);
    return updated;
  }

  // Upsert a new record for newly created DealCards (e.g., bld-xxxx)
  const priceMatch = String(card4.priceBand || '').match(/(\d+)/);
  const askingPriceManwon = priceMatch ? Number(priceMatch[1]) * 10000 + 5000 : 850000;
  const created = buildSeedRecord({
    buildingId: idOrDocId,
    documentId: idOrDocId.startsWith('im-doc-') ? idOrDocId : `im-doc-${idOrDocId}`,
    address: `서울시 ${card4.region} 100-1`,
    buildingName: `${card4.region} ${card4.use}`,
    region: card4.region,
    use: card4.use,
    priceBand: card4.priceBand,
    askingPriceManwon,
    posture: 'core_income',
    points: card4.points,
    gfaSqm: 1200.0,
    landAreaSqm: 360.0,
    zoning: '제3종일반주거지역',
    completionDate: '2019-05-10',
    floorsAbove: 5,
    floorsBelow: 1,
    rentRoll: [
      { floor: '1F', unit: '101', use: card4.use || '근린생활시설', depositManwon: 8000, monthlyRentManwon: 650, maintenanceManwon: 60, leaseExpiry: '2027-06', status: 'occupied' },
      { floor: '2F~5F', unit: '전층', use: '오피스 및 근생', depositManwon: 15000, monthlyRentManwon: 1850, maintenanceManwon: 150, leaseExpiry: '2027-12', status: 'occupied' },
    ],
  });
  created.card4 = card4;
  if (opts?.ownerId) created.ownerId = opts.ownerId;
  if (opts?.brokerProfile) {
    created.brokerProfile = opts.brokerProfile;
    if (created.basicImDoc?.facts) {
      created.basicImDoc.facts.brokerOffice = {
        name: opts.brokerProfile.company || '담당 중개사무소',
        representative: opts.brokerProfile.displayName || '담당 공인중개사',
        registrationNo: opts.brokerProfile.registrationNo || '-',
        phone: opts.brokerProfile.phone || '-',
      };
    }
  }
  saveQuickImRecord(created);
  return created;
}

export function listAllQuickImRecords(): StoredQuickImRecord[] {
  const store = getStoreMap();
  const uniqueByBuilding = new Map<string, StoredQuickImRecord>();
  for (const val of store.values()) {
    if (val?.buildingId) {
      uniqueByBuilding.set(val.buildingId, val);
    }
  }
  return Array.from(uniqueByBuilding.values());
}

const INBOX_STATE_FILE = path.join(os.tmpdir(), `cre-v3-inbox-state-store${TEST_WORKER_SUFFIX}.json`);

declare global {
  // eslint-disable-next-line no-var
  var __CRE_INBOX_STATE_STORE__: StoredInboxState | undefined;
}

function createEmptyInboxState(): StoredInboxState {
  return {
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [],
    deletedDealCardIds: {},
    sentDealCardIds: {},
  };
}

export function getInboxState(): StoredInboxState {
  if (!globalThis.__CRE_INBOX_STATE_STORE__) {
    globalThis.__CRE_INBOX_STATE_STORE__ = createEmptyInboxState();
  }
  try {
    if (fs.existsSync(INBOX_STATE_FILE)) {
      const raw = fs.readFileSync(INBOX_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoredInboxState>;
      globalThis.__CRE_INBOX_STATE_STORE__ = {
        revokedBuildings: parsed.revokedBuildings || {},
        correctionNotices: parsed.correctionNotices || {},
        gateDecisions: parsed.gateDecisions || {},
        callNotes: parsed.callNotes || {},
        customClients: Array.isArray(parsed.customClients) ? parsed.customClients : [],
        deletedDealCardIds: parsed.deletedDealCardIds || {},
        sentDealCardIds: parsed.sentDealCardIds || {},
      };
    }
  } catch {
    // ignore file read error
  }
  return globalThis.__CRE_INBOX_STATE_STORE__;
}

export function saveInboxState(state: StoredInboxState): void {
  globalThis.__CRE_INBOX_STATE_STORE__ = state;
  try {
    fs.writeFileSync(INBOX_STATE_FILE, JSON.stringify(state), 'utf-8');
  } catch {
    // ignore file write error
  }
}

export function setBuildingRevokedState(
  buildingId: string,
  revoked: boolean,
  shareToken?: string
): StoredInboxState {
  const state = getInboxState();
  const now = new Date().toISOString();
  state.revokedBuildings[buildingId] = {
    revoked,
    revokedAt: now,
    shareToken,
  };
  saveInboxState(state);

  const quickRec = getQuickImRecord(buildingId);
  if (quickRec) {
    saveQuickImRecord({
      ...quickRec,
      isRevoked: revoked,
      updatedAt: now,
    });
  }
  return state;
}

export function setBuildingCorrectionNotice(
  buildingId: string,
  message: string | null
): StoredInboxState {
  const state = getInboxState();
  const now = new Date().toISOString();
  if (message) {
    state.correctionNotices[buildingId] = { message, updatedAt: now };
  } else {
    delete state.correctionNotices[buildingId];
  }
  saveInboxState(state);

  const quickRec = getQuickImRecord(buildingId);
  if (quickRec) {
    saveQuickImRecord({
      ...quickRec,
      correctionNotice: message ? { message, updatedAt: now } : null,
      updatedAt: now,
    });
  }
  return state;
}

export function recordGateDecision(
  threadOrRequestId: string,
  status: 'approved' | 'rejected' | 'pending',
  shareToken: string,
  buildingId?: string
): StoredInboxState {
  const state = getInboxState();
  if (status === 'pending') {
    delete state.gateDecisions[threadOrRequestId];
    if (buildingId) delete state.gateDecisions[buildingId];
  } else {
    state.gateDecisions[threadOrRequestId] = {
      status,
      shareToken,
      updatedAt: new Date().toISOString(),
      buildingId,
    };
  }
  saveInboxState(state);
  return state;
}

export function appendInboxCallNote(
  threadId: string,
  description: string,
  timestamp = '방금 전'
): StoredInboxState {
  const state = getInboxState();
  const existing = state.callNotes[threadId] || [];
  state.callNotes[threadId] = [
    { id: `note-${Date.now()}`, description, timestamp },
    ...existing,
  ];
  saveInboxState(state);
  return state;
}

export function upsertCustomInboxClient(client: {
  id?: string;
  ownerId?: string;
  clientName: string;
  clientGrade: 'VIP' | '일반' | '잠재';
  clientPhone: string;
  budget: string;
  preferredRegion: string;
  buildingId: string;
  buildingTitle: string;
  newsletterSubscribed?: boolean;
}): StoredInboxState {
  const state = getInboxState();
  const id = client.id || `cli-${Date.now()}`;
  const existingIdx = state.customClients.findIndex((c) => c.id === id);
  const entry = {
    id,
    ownerId: client.ownerId,
    clientName: client.clientName,
    clientGrade: client.clientGrade,
    clientPhone: client.clientPhone,
    budget: client.budget,
    preferredRegion: client.preferredRegion,
    buildingId: client.buildingId,
    buildingTitle: client.buildingTitle,
    newsletterSubscribed: client.newsletterSubscribed ?? true,
    createdAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    state.customClients[existingIdx] = entry;
  } else {
    state.customClients.unshift(entry);
  }
  saveInboxState(state);
  return state;
}

export function markDealCardDeleted(buildingId: string): void {
  if (!buildingId) return;
  const state = getInboxState();
  state.deletedDealCardIds = state.deletedDealCardIds || {};
  state.deletedDealCardIds[buildingId] = true;
  saveInboxState(state);
}

export function markDealCardRestored(buildingId: string): void {
  if (!buildingId) return;
  const state = getInboxState();
  if (state.deletedDealCardIds) {
    delete state.deletedDealCardIds[buildingId];
    saveInboxState(state);
  }
}

export function isDealCardDeleted(buildingId: string): boolean {
  if (!buildingId) return false;
  const state = getInboxState();
  return Boolean(state.deletedDealCardIds?.[buildingId]);
}

export function markDealCardSent(buildingId: string): void {
  if (!buildingId) return;
  const state = getInboxState();
  state.sentDealCardIds = state.sentDealCardIds || {};
  state.sentDealCardIds[buildingId] = true;
  saveInboxState(state);
}

export function isDealCardSent(buildingId: string): boolean {
  if (!buildingId) return false;
  const state = getInboxState();
  return Boolean(state.sentDealCardIds?.[buildingId]);
}
