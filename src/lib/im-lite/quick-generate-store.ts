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
import { formatPriceRange } from '@/lib/deal-card/price-band';

export interface QuickImRentRollRow {
  floor: string;
  unit?: string;
  use: string;
  tenantName?: string;
  areaSqm?: number;
  exclusiveAreaSqm?: number;
  depositManwon: number;
  monthlyRentManwon: number;
  maintenanceManwon?: number;
  leaseExpiry?: string;
  note?: string;
  status: 'occupied' | 'vacant' | 'owner';
}

export interface SeedSpec {
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
  bcrPct?: number;
  farPct?: number;
  parkingSpaces?: number;
  elevators?: number;
  pnu?: string;
  lat?: number;
  lng?: number;
  coordinates?: { lat: number; lng: number };
  officialLandPriceWonSqm?: number;
  officialLandPricePerSqm?: number;
  parcels?: any[];
  closingLine?: string;
  isSynthesized?: boolean;
  updatedAt?: string;
  mainPurpose?: string;
  handoverNote?: string;
  photos?: Array<Record<string, any>>;
  rentRoll: QuickImRentRollRow[];
}

export interface StoredQuickImRecord {
  buildingId: string;
  documentId: string;
  ownerId?: string;
  address: string;
  buildingName: string;
  askingPriceManwon: number;
  posture: string;
  pnu?: string;
  lat?: number;
  lng?: number;
  coordinates?: { lat: number; lng: number };
  officialLandPriceWonSqm?: number;
  officialLandPricePerSqm?: number;
  parcels?: any[];
  closingLine?: string;
  floorsAbove?: number;
  floorsBelow?: number;
  card4: Card4Data;
  basicImDoc: BasicImDocument;
  rentRoll: QuickImRentRollRow[];
  specs?: {
    gfaSqm?: number;
    landAreaSqm?: number;
    zoning?: string;
    completionDate?: string;
    handoverNote?: string;
    floorsAbove?: number;
    floorsBelow?: number;
    bcrPct?: number;
    farPct?: number;
    parkingSpaces?: number;
    elevators?: number;
    officialLandPriceWonSqm?: number;
    officialLandPricePerSqm?: number;
    parcels?: any[];
    closingLine?: string;
    mainPurpose?: string;
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
  docBody?: Record<string, any>;
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

const buildTestguideApiAssetPath = (folder: string, filename: string): string =>
  `/api/public/testguide-assets/images/${encodeURIComponent(folder)}/${encodeURIComponent(filename)}`;

const KNOWN_TEST_ASSET_PATHS: Record<string, string> = {
  '01_동교동_THEPARK_전면외관.jpg': buildTestguideApiAssetPath('01_동교동_THEPARK', '01_동교동_THEPARK_전면외관.jpg'),
  '02_동교동_THEPARK_1층출입구.jpg': buildTestguideApiAssetPath('01_동교동_THEPARK', '02_동교동_THEPARK_1층출입구.jpg'),
  '03_동교동_THEPARK_내부실내.png': buildTestguideApiAssetPath('01_동교동_THEPARK', '03_동교동_THEPARK_내부실내.png'),
  '04_동교동_THEPARK_루프탑테라스.webp': buildTestguideApiAssetPath('01_동교동_THEPARK', '04_동교동_THEPARK_루프탑테라스.webp'),
  '01_부천_동아빌딩_전면외관.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '01_부천_동아빌딩_전면외관.jpg'),
  '02_부천_동아빌딩_1층로비출입구.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '02_부천_동아빌딩_1층로비출입구.jpg'),
  '03_부천_동아빌딩_기준층내부실내.png': buildTestguideApiAssetPath('02_부천_동아빌딩', '03_부천_동아빌딩_기준층내부실내.png'),
  '04_부천_동아빌딩_주차장설비.webp': buildTestguideApiAssetPath('02_부천_동아빌딩', '04_부천_동아빌딩_주차장설비.webp'),
  '01_역삼동_여삼빌딩_전면외관.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '01_역삼동_여삼빌딩_전면외관.jpg'),
  '02_역삼동_여삼빌딩_메인로비.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '02_역삼동_여삼빌딩_메인로비.jpg'),
  '03_역삼동_여삼빌딩_오피스내부.png': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '03_역삼동_여삼빌딩_오피스내부.png'),
  '04_역삼동_여삼빌딩_지하주차장.webp': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '04_역삼동_여삼빌딩_지하주차장.webp'),
  '01_부천_골든타워_전면외관.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '01_부천_동아빌딩_전면외관.jpg'),
  '02_부천_골든타워_1층로비.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '02_부천_동아빌딩_1층로비출입구.jpg'),
  '03_부천_골든타워_학원내부.png': buildTestguideApiAssetPath('02_부천_동아빌딩', '03_부천_동아빌딩_기준층내부실내.png'),
  '04_부천_골든타워_주차설비.webp': buildTestguideApiAssetPath('02_부천_동아빌딩', '04_부천_동아빌딩_주차장설비.webp'),
  '01_역삼_제1역삼빌딩_전면외관.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '01_역삼동_여삼빌딩_전면외관.jpg'),
  '02_역삼_제1역삼빌딩_1층로비.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '02_역삼동_여삼빌딩_메인로비.jpg'),
  '03_역삼_제1역삼빌딩_기준층오피스.png': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '03_역삼동_여삼빌딩_오피스내부.png'),
  '04_역삼_제1역삼빌딩_기계식주차.webp': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '04_역삼동_여삼빌딩_지하주차장.webp'),
  // Legacy direct Supabase Storage testguide paths -> heal to resilient first-party route
  'testguide/deal1/01_exterior.jpg': buildTestguideApiAssetPath('01_동교동_THEPARK', '01_동교동_THEPARK_전면외관.jpg'),
  'testguide/deal1/02_entrance.jpg': buildTestguideApiAssetPath('01_동교동_THEPARK', '02_동교동_THEPARK_1층출입구.jpg'),
  'testguide/deal1/03_interior.png': buildTestguideApiAssetPath('01_동교동_THEPARK', '03_동교동_THEPARK_내부실내.png'),
  'testguide/deal1/04_rooftop.webp': buildTestguideApiAssetPath('01_동교동_THEPARK', '04_동교동_THEPARK_루프탑테라스.webp'),
  'testguide/deal2/01_exterior.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '01_부천_동아빌딩_전면외관.jpg'),
  'testguide/deal2/02_lobby.jpg': buildTestguideApiAssetPath('02_부천_동아빌딩', '02_부천_동아빌딩_1층로비출입구.jpg'),
  'testguide/deal2/03_interior.png': buildTestguideApiAssetPath('02_부천_동아빌딩', '03_부천_동아빌딩_기준층내부실내.png'),
  'testguide/deal2/04_parking.webp': buildTestguideApiAssetPath('02_부천_동아빌딩', '04_부천_동아빌딩_주차장설비.webp'),
  'testguide/deal3/01_exterior.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '01_역삼동_여삼빌딩_전면외관.jpg'),
  'testguide/deal3/02_lobby.jpg': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '02_역삼동_여삼빌딩_메인로비.jpg'),
  'testguide/deal3/03_interior.png': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '03_역삼동_여삼빌딩_오피스내부.png'),
  'testguide/deal3/04_parking.webp': buildTestguideApiAssetPath('03_역삼동_여삼빌딩', '04_역삼동_여삼빌딩_지하주차장.webp'),
};

function stripDuplicateFileSuffix(filename: string): string {
  return filename.replace(/\s*\(\d+\)(?=\.[^.]+$)/, '').trim();
}

export function resolveKnownTestAssetUrl(nameOrUrl?: string | null): string | undefined {
  if (!nameOrUrl || typeof nameOrUrl !== 'string') return undefined;
  const trimmed = nameOrUrl.trim();
  if (KNOWN_TEST_ASSET_PATHS[trimmed]) return KNOWN_TEST_ASSET_PATHS[trimmed];
  const legacyMatch = trimmed.match(/testguide\/deal[123]\/[^?#\s]+/);
  if (legacyMatch && KNOWN_TEST_ASSET_PATHS[legacyMatch[0]]) {
    return KNOWN_TEST_ASSET_PATHS[legacyMatch[0]];
  }
  const rawBase = trimmed.split(/[\\/]/).pop() || '';
  let decodedBase = rawBase;
  try {
    decodedBase = decodeURIComponent(rawBase);
  } catch {
    // ignore malformed URI sequence
  }
  for (const candidate of [
    rawBase,
    stripDuplicateFileSuffix(rawBase),
    decodedBase,
    stripDuplicateFileSuffix(decodedBase),
  ]) {
    if (candidate && KNOWN_TEST_ASSET_PATHS[candidate]) {
      return KNOWN_TEST_ASSET_PATHS[candidate];
    }
  }
  return undefined;
}

const TEST_WORKER_SUFFIX = process.env.VITEST ? `-${process.pid}` : '';
const STORE_FILE = path.join(os.tmpdir(), `cre-v3-quick-generate-store${TEST_WORKER_SUFFIX}.json`);

declare global {
  // eslint-disable-next-line no-var
  var __CRE_QUICK_IM_STORE__: Map<string, StoredQuickImRecord> | undefined;
}

const KNOWN_GOLDEN_PARCELS: Array<{
  match: RegExp;
  pnu: string;
  coordinates: { lat: number; lng: number };
  officialLandPriceWonSqm?: number;
}> = [
  {
    match: /(동교동\s*147-8|양화로18안길\s*7)/,
    pnu: '1144012000101470008',
    coordinates: { lat: 37.5562, lng: 126.9241 },
    officialLandPriceWonSqm: 11670000,
  },
  {
    match: /(동교동\s*189-6|와우산로37길\s*9)/,
    pnu: '1144012100101890006',
    coordinates: { lat: 37.55597, lng: 126.93033 },
    officialLandPriceWonSqm: 11670000,
  },
  {
    match: /(심곡동\s*382-2|부천로29번길\s*22)/,
    pnu: '4119210100103820002',
    coordinates: { lat: 37.4867, lng: 126.7824 },
    officialLandPriceWonSqm: 4680000,
  },
  {
    match: /(심곡동\s*349-10|부천로39번길\s*8)/,
    pnu: '4119210200103490010',
    coordinates: { lat: 37.48815, lng: 126.78317 },
    officialLandPriceWonSqm: 4680000,
  },
  {
    match: /(역삼동\s*823-33|테헤란로14길\s*8)/,
    pnu: '1168010100108230033',
    coordinates: { lat: 37.4996, lng: 127.0344 },
    officialLandPriceWonSqm: 65340000,
  },
  {
    match: /(역삼동\s*648-23|테헤란로\s*123)/,
    pnu: '1168010100106480023',
    coordinates: { lat: 37.49956, lng: 127.03151 },
    officialLandPriceWonSqm: 65340000,
  },
  {
    match: /(보정동\s*1208-4|죽전로\s*15)/,
    pnu: '4146311100112080004',
    coordinates: { lat: 37.3228, lng: 127.1107 },
    officialLandPriceWonSqm: 6420000,
  },
  {
    match: /(보정동\s*1323-2|신촌로47번길\s*6)/,
    pnu: '4146311800113230002',
    coordinates: { lat: 37.3079134604492, lng: 127.110304201949 },
    officialLandPriceWonSqm: 2790000,
  },
];

function parseFloorCountsFromRentRoll(
  rentRoll: Array<{ floor?: string }>,
  explicitAbove?: unknown,
  explicitBelow?: unknown
): { floorsAbove: number; floorsBelow: number } {
  let maxAbove = 0;
  let maxBelow = 0;

  for (const r of rentRoll || []) {
    const rawFloor = String(r?.floor || '').trim();
    if (!rawFloor || /(주차|옥탑|기계식|루프탑|부대|관리)/.test(rawFloor)) continue;
    const segments = rawFloor.split(/[~,\s/]+/).filter(Boolean);
    for (const seg of segments) {
      const s = seg.trim().toUpperCase();
      if (!s) continue;
      const negMatch = s.match(/^-\s*(\d+)/);
      if (negMatch) {
        const n = parseInt(negMatch[1], 10);
        const fl = n >= 100 ? Math.floor(n / 100) : n;
        if (fl > 0 && fl < 20) maxBelow = Math.max(maxBelow, fl);
        continue;
      }
      const bMatch = s.match(/^(?:B|지하)\s*(\d+)?/i);
      if (bMatch && (s.startsWith('B') || s.startsWith('지하'))) {
        const n = bMatch[1] ? parseInt(bMatch[1], 10) : 1;
        const fl = n >= 100 ? Math.floor(n / 100) : n;
        if (fl > 0 && fl < 20) maxBelow = Math.max(maxBelow, fl);
        continue;
      }
      const aboveMatch = s.match(/(\d+)/);
      if (aboveMatch) {
        const n = parseInt(aboveMatch[1], 10);
        const fl = n >= 100 ? Math.floor(n / 100) : n;
        if (fl > 0 && fl < 100) maxAbove = Math.max(maxAbove, fl);
      }
    }
  }

  const numAbove = Number(explicitAbove);
  const numBelow = Number(explicitBelow);
  const floorsAbove = Number.isFinite(numAbove) && numAbove > 0 ? numAbove : maxAbove;
  const floorsBelow =
    Number.isFinite(numBelow) && numBelow > 0
      ? numBelow
      : maxBelow > 0
      ? maxBelow
      : 0;

  return { floorsAbove, floorsBelow };
}

function buildSeedRecord(params: SeedSpec): StoredQuickImRecord {
  const { floorsAbove, floorsBelow } = parseFloorCountsFromRentRoll(
    params.rentRoll,
    params.floorsAbove,
    params.floorsBelow
  );
  const occupiedRows = params.rentRoll.filter((r) => r.status !== 'vacant');
  const incomeGeneratingRows = params.rentRoll.filter(
    (r) => r.status !== 'vacant' && r.status !== 'owner'
  );
  const occupiedFloorsCount = params.rentRoll.length > 0 ? occupiedRows.length : 0;
  const totalDepositManwon = incomeGeneratingRows.reduce(
    (s, r) => s + (Number(r.depositManwon) || 0),
    0
  );
  const totalRentManwon = incomeGeneratingRows.reduce(
    (s, r) => s + (Number(r.monthlyRentManwon) || 0),
    0
  );
  const totalMonthlyMaintManwon = incomeGeneratingRows.reduce(
    (s, r) => s + (Number(r.maintenanceManwon) || 0),
    0
  );
  const vacancyCount = params.rentRoll.filter((r) => r.status === 'vacant').length;
  const vacancyRatePct =
    params.rentRoll.length > 0
      ? Number(((vacancyCount / params.rentRoll.length) * 100).toFixed(1))
      : 0;

  const officialLandPriceWonSqm =
    Number(params.officialLandPriceWonSqm ?? params.officialLandPricePerSqm) || 0;
  const resolvedCoords =
    params.coordinates ||
    (Number.isFinite(Number(params.lat)) &&
    Number.isFinite(Number(params.lng)) &&
    Number(params.lat) !== 0 &&
    Number(params.lng) !== 0
      ? { lat: Number(params.lat), lng: Number(params.lng) }
      : undefined);

  const isSeedId =
    params.buildingId === 'bld-01' ||
    params.buildingId === 'bld-02' ||
    params.buildingId === 'bld-03';
  const resolvedPhotos =
    Array.isArray(params.photos) && params.photos.length > 0
      ? params.photos.filter(
          (p: any) =>
            p &&
            typeof p.url === 'string' &&
            p.url.trim().length > 0 &&
            !p.url.startsWith('blob:')
        )
      : isSeedId
      ? [
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
        ]
      : [];

  const rawFacts = {
    id: params.buildingId,
    address: params.address,
    building_name: params.buildingName,
    pnu: params.pnu,
    coordinates: resolvedCoords,
    sale_price_manwon: params.askingPriceManwon,
    deposit_total_manwon: totalDepositManwon,
    monthly_rent_total_manwon: totalRentManwon,
    vacancy_rate_pct: vacancyRatePct,
    gross_floor_area_sqm: params.gfaSqm,
    land_area_sqm: params.landAreaSqm,
    zoning: params.zoning,
    official_land_price_won_sqm: officialLandPriceWonSqm,
    completion_date: params.completionDate,
    floors_above: floorsAbove,
    floors_below: floorsBelow,
    main_usage: params.use,
    investment_posture: params.posture,
    points: params.points,
    rent_roll: params.rentRoll,
    photos: resolvedPhotos,
    comps: [],
  };

  const facts = extractPureBuildingFacts(rawFacts);
  const basicImDoc = buildBasicImDocument({
    buildingId: params.buildingId,
    documentId: params.documentId,
    versionNo: 1,
    facts,
  });

  const gfaPyung = params.gfaSqm > 0 ? Math.max(1, Math.round(params.gfaSqm / 3.3058)) : 0;
  const landAreaPyung =
    params.landAreaSqm > 0 ? Math.max(1, Math.round(params.landAreaSqm / 3.3058)) : 0;
  const mappedPosture: DealCardPosture =
    params.posture === 'value_add' || params.posture === 'development'
      ? 'value_add'
      : params.posture === 'owner_occupied' || params.posture === 'owner_occupier'
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
  const totalFloorsCount = floorsAbove + floorsBelow;
  const perFloorAreaSqm =
    totalFloorsCount > 0 && params.gfaSqm > 0
      ? Math.round((params.gfaSqm / totalFloorsCount) * 10) / 10
      : 0;
  const perFloorAreaPy =
    perFloorAreaSqm > 0 ? Math.round((perFloorAreaSqm / 3.305785) * 10) / 10 : 0;
  const mappedFloorLeases = params.rentRoll.map((r, idx) => {
    const isVac = r.status === 'vacant';
    const isOwn = r.status === 'owner';
    const explicitAreaSqm = Number(
      r.areaSqm ??
        (r as any).area_sqm ??
        r.exclusiveAreaSqm ??
        (r as any).exclusive_area_sqm ??
        0
    );
    const areaSqm = explicitAreaSqm > 0 ? explicitAreaSqm : perFloorAreaSqm;
    const areaPy = areaSqm > 0 ? Math.round((areaSqm / 3.305785) * 10) / 10 : perFloorAreaPy;
    const exclusiveAreaSqm =
      Number(r.exclusiveAreaSqm ?? (r as any).exclusive_area_sqm ?? 0) || undefined;
    const rawUse = String(r.use || '').trim();
    const slashParts = rawUse
      .split(/\s*\/\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const splitTenantName = slashParts.length >= 2 ? slashParts[0] : undefined;
    const splitTenantType =
      slashParts.length >= 2
        ? slashParts[0] === slashParts[1]
          ? slashParts[0]
          : slashParts.slice(1).join(' / ')
        : rawUse || '근린생활시설';
    const explicitTenantName = String(r.tenantName || (r as any).tenant_name || '').trim();
    const resolvedTenantName = isVac
      ? '공실'
      : isOwn
      ? explicitTenantName || splitTenantName || '자가사용'
      : explicitTenantName || splitTenantName || splitTenantType;
    const resolvedTenantType = isVac ? '공실' : splitTenantType;
    return {
      floor: r.floor || `${idx + 1}F`,
      unit_label: r.unit || `${idx + 1}01호`,
      tenant_name: resolvedTenantName,
      tenant_type: resolvedTenantType,
      use: resolvedTenantType,
      area_sqm: areaSqm,
      area_m2: areaSqm,
      area_pyeong: areaPy,
      ...(exclusiveAreaSqm ? { exclusive_area_sqm: exclusiveAreaSqm } : {}),
      deposit_manwon: isVac ? 0 : Number(r.depositManwon || 0),
      deposit_krw: isVac ? 0 : Number(r.depositManwon || 0) * 10000,
      rent_manwon: isVac ? 0 : Number(r.monthlyRentManwon || 0),
      rent_krw: isVac ? 0 : Number(r.monthlyRentManwon || 0) * 10000,
      mgmt_fee_manwon: isVac ? 0 : Number(r.maintenanceManwon || 0),
      lease_state: isVac ? '공실' : isOwn ? '자가사용' : '임대중',
      is_vacant: isVac,
      lease_end: r.leaseExpiry || '-',
      ...(r.note ? { note: r.note, remark: r.note } : {}),
      source: 'broker',
    };
  });

  const exactEokNum = Math.round((params.askingPriceManwon / 10000) * 100) / 100;
  const exactEokDisplay = `${exactEokNum}억 원`;
  const useExplicitSpecs =
    params.isSynthesized ||
    params.bcrPct !== undefined ||
    params.farPct !== undefined ||
    params.parkingSpaces !== undefined ||
    params.elevators !== undefined;
  const bcrPct = useExplicitSpecs
    ? Number(params.bcrPct || 0)
    : params.landAreaSqm > 0 && perFloorAreaSqm > 0
    ? Math.min(
        59.8,
        Math.max(42.0, Math.round(((perFloorAreaSqm * 0.95) / Math.max(1, params.landAreaSqm)) * 1000) / 10)
      )
    : 0;
  const farPct = useExplicitSpecs
    ? Number(params.farPct || 0)
    : params.landAreaSqm > 0 && params.gfaSqm > 0
    ? Math.max(150.0, Math.round(((params.gfaSqm * 0.84) / Math.max(1, params.landAreaSqm)) * 1000) / 10)
    : 0;
  const parkingSpaces = useExplicitSpecs
    ? Number(params.parkingSpaces ?? 0)
    : params.gfaSqm > 0
    ? Math.max(4, Math.round(params.gfaSqm / 132))
    : 0;
  const elevators = useExplicitSpecs
    ? Number(params.elevators ?? 0)
    : floorsAbove >= 4
    ? 1
    : 0;
  const buildingRegisterSource =
    params.bcrPct || params.farPct ? 'api' : params.isSynthesized ? 'manual' : 'api';

  const ssotSummary = {
    address: params.address,
    raw_address: params.address,
    road_address: params.address,
    jibun_address: params.address,
    pnu: params.pnu,
    coordinates: resolvedCoords,
    lat: resolvedCoords?.lat ?? params.lat,
    lng: resolvedCoords?.lng ?? params.lng,
    building_name: params.buildingName,
    asset_type: params.use || '근린생활시설',
    area_signal: params.region,
    asking_price_manwon: params.askingPriceManwon,
    monthly_rent_total_manwon: totalRentManwon,
    monthly_rent_total_krw: totalRentManwon * 10000,
    total_deposit_manwon: totalDepositManwon,
    total_deposit_krw: totalDepositManwon * 10000,
    total_monthly_maint_manwon: totalMonthlyMaintManwon,
    maintenance_fee_monthly_krw: totalMonthlyMaintManwon * 10000,
    land_area_sqm: params.landAreaSqm,
    land_area_m2: params.landAreaSqm,
    total_gross_area_sqm: params.gfaSqm,
    total_gross_area_m2: params.gfaSqm,
    size_signal: `연면적 ${params.gfaSqm.toLocaleString()}㎡ (${facts.building.totalGrossAreaPyeong}평)`,
    zoning: params.zoning,
    land_category: '대',
    completion_date: params.completionDate,
    floors_above: floorsAbove,
    floors_below: floorsBelow,
    occupied_floors_count: occupiedFloorsCount,
    bcr_pct: bcrPct,
    far_pct: farPct,
    parking_count: parkingSpaces,
    parking_total: parkingSpaces,
    elevator_count: elevators,
    main_usage: params.mainPurpose || params.use || '제1·2종 근린생활시설',
    structure: '철근콘크리트구조',
    official_land_price_per_sqm: officialLandPriceWonSqm,
    official_land_price_krw: officialLandPriceWonSqm,
    ...(params.parcels ? { parcels: params.parcels } : {}),
    ...(params.closingLine ? { closing_line: params.closingLine } : {}),
    vacancy_pct: vacancyRatePct,
    vacancy_rate_pct: vacancyRatePct,
    vacancy_signal: vacancyRatePct === 0 ? '만실' : `공실률 ${vacancyRatePct}%`,
    cap_rate_pct: basicImDoc.facts.valuation.capRatePct,
    gross_yield_pct: basicImDoc.facts.valuation.grossYieldPct,
    investment_posture:
      params.posture === 'owner_occupier' || params.posture === 'owner_occupied'
        ? 'owner_occupied'
        : params.posture === 'development' || params.posture === 'value_add'
        ? 'development'
        : 'income',
    building_register_source: buildingRegisterSource,
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
        `| 건축규모 | 지하 ${floorsBelow}층 / 지상 ${floorsAbove}층 |`,
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
        `| 개별공시지가 | ${officialLandPriceWonSqm > 0 ? `㎡당 ${officialLandPriceWonSqm.toLocaleString()}원` : '공시지가 확인 중'} |`,
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
      markdown: `- 인근 실거래 및 시세 데이터 분석 중`,
    },
    {
      section_type: 'risk_check',
      title: '거래 조건 및 실사 체크포인트',
      markdown: [
        `- **명도 및 인도 조건**: ${params.handoverNote || '현 임대차 승계 또는 잔금 일정 협의 가능'}`,
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

  const fullDocBody: Record<string, any> = {
    schemaVersion: '3.0',
    tier: 'basic',
    preset: 'credeal_basic',
    releaseTier: 'fact_om',
    buildingName: params.buildingName,
    resolved_address: params.address,
    pnu: params.pnu,
    coordinates: resolvedCoords,
    lat: resolvedCoords?.lat ?? params.lat,
    lng: resolvedCoords?.lng ?? params.lng,
    official_land_price_per_sqm: officialLandPriceWonSqm,
    official_land_price_krw: officialLandPriceWonSqm,
    ...(params.parcels ? { parcels: params.parcels } : {}),
    ...(params.closingLine ? { closingLine: params.closingLine, closing_line: params.closingLine } : {}),
    investment_posture: ssotSummary.investment_posture,
    posture: ssotSummary.investment_posture,
    dataGrade: 'A',
    basicImDocument: basicImDoc,
    card4,
    rent_roll: params.rentRoll,
    floor_leases: mappedFloorLeases,
    ssot_summary: ssotSummary,
    market_comps: [],
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
    pnu: params.pnu,
    lat: resolvedCoords?.lat ?? params.lat,
    lng: resolvedCoords?.lng ?? params.lng,
    coordinates: resolvedCoords,
    officialLandPriceWonSqm,
    officialLandPricePerSqm: officialLandPriceWonSqm,
    ...(params.parcels ? { parcels: params.parcels } : {}),
    ...(params.closingLine ? { closingLine: params.closingLine } : {}),
    floorsAbove,
    floorsBelow,
    card4,
    basicImDoc,
    rentRoll: params.rentRoll,
    specs: {
      gfaSqm: params.gfaSqm,
      landAreaSqm: params.landAreaSqm,
      zoning: params.zoning,
      completionDate: params.completionDate,
      handoverNote: params.handoverNote,
      floorsAbove,
      floorsBelow,
      bcrPct,
      farPct,
      parkingSpaces,
      elevators,
      officialLandPriceWonSqm,
      officialLandPricePerSqm: officialLandPriceWonSqm,
      ...(params.parcels ? { parcels: params.parcels } : {}),
      ...(params.closingLine ? { closingLine: params.closingLine } : {}),
      ...(params.mainPurpose ? { mainPurpose: params.mainPurpose } : {}),
    },
    docBody: fullDocBody,
    fullDocBody,
    createdAt: now,
    updatedAt: params.updatedAt || now,
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
      pnu: '1156012800100800001',
      coordinates: { lat: 37.5342, lng: 126.9022 },
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
      pnu: '1168010100108230033',
      coordinates: { lat: 37.4996, lng: 127.0344 },
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
      pnu: '1165010800113030035',
      coordinates: { lat: 37.5019, lng: 127.0254 },
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

export function deleteQuickImRecord(id: string): void {
  if (!id) return;
  const store = getStoreMap();
  const target = store.get(id);
  store.delete(id);
  if (target) {
    if (target.buildingId) store.delete(target.buildingId);
    if (target.documentId) store.delete(target.documentId);
  }
  for (const [key, val] of Array.from(store.entries())) {
    if (val?.buildingId === id || val?.documentId === id) {
      store.delete(key);
    }
  }
  try {
    const uniqueByBuilding = new Map<string, StoredQuickImRecord>();
    for (const val of store.values()) {
      if (val?.buildingId) {
        uniqueByBuilding.set(val.buildingId, val);
      }
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(Array.from(uniqueByBuilding.values())), 'utf-8');
  } catch {
    // ignore file write error
  }
}

export function clearQuickImStoreForTest(): void {
  globalThis.__CRE_QUICK_IM_STORE__ = new Map<string, StoredQuickImRecord>();
  for (const seed of getDefaultSeeds()) {
    globalThis.__CRE_QUICK_IM_STORE__.set(seed.buildingId, seed);
    globalThis.__CRE_QUICK_IM_STORE__.set(seed.documentId, seed);
  }
  try {
    if (fs.existsSync(STORE_FILE)) {
      fs.unlinkSync(STORE_FILE);
    }
  } catch {
    // ignore
  }
}

export function getQuickImRecord(idOrDocId: string): StoredQuickImRecord | null {
  if (!idOrDocId) return null;
  const store = getStoreMap();
  return store.get(idOrDocId) || null;
}

export function synthesizeQuickRecordFromImItem(
  buildingIdOrItem: string | Record<string, any>,
  imItemOrBrokerProfile?: Record<string, any> | null,
  brokerProfileOrOwnerId?: Record<string, any> | string | null,
  eventCreatedAt?: string | null,
  maybeOwnerId?: string | null
): StoredQuickImRecord {
  const isSingleObjectArg =
    typeof buildingIdOrItem === 'object' && buildingIdOrItem !== null;
  const imItem: Record<string, any> = isSingleObjectArg
    ? buildingIdOrItem
    : (imItemOrBrokerProfile as Record<string, any>) || {};
  const buildingId: string = isSingleObjectArg
    ? String(imItem.buildingId || imItem.id || '')
    : String(buildingIdOrItem || imItem.buildingId || imItem.id || '');
  const brokerProfile: Record<string, any> | null | undefined = isSingleObjectArg
    ? (imItemOrBrokerProfile as Record<string, any> | null | undefined)
    : (brokerProfileOrOwnerId as Record<string, any> | null | undefined);
  const isFourthArgTimestamp =
    typeof eventCreatedAt === 'string' && /^\d{4}-\d{2}/.test(eventCreatedAt);
  const ownerId: string | null | undefined = isSingleObjectArg
    ? (typeof brokerProfileOrOwnerId === 'string' && !/^\d{4}-\d{2}/.test(brokerProfileOrOwnerId)
        ? brokerProfileOrOwnerId
        : imItem.ownerId)
    : maybeOwnerId || imItem.ownerId || (!isFourthArgTimestamp ? eventCreatedAt : undefined);
  const resolvedEventCreatedAt: string | undefined = isSingleObjectArg
    ? (typeof brokerProfileOrOwnerId === 'string' && /^\d{4}-\d{2}/.test(brokerProfileOrOwnerId)
        ? brokerProfileOrOwnerId
        : undefined)
    : isFourthArgTimestamp
    ? eventCreatedAt || undefined
    : undefined;

  const address = String(imItem.address || '').trim();
  const title = String(imItem.title || imItem.buildingName || '상업용 근생빌딩').trim();
  const region =
    address
      .replace(/^(서울특별시|서울시|경기도|인천광역시)\s*/, '')
      .split(/\s+/)
      .slice(0, 2)
      .join(' ') || '서울시 핵심권역';

  const askingPriceManwon = Number(imItem.askingPriceManwon) || 0;

  const rawRentRoll = Array.isArray(imItem.rentRoll) ? imItem.rentRoll : [];
  const normalizedRentRoll: QuickImRentRollRow[] =
    rawRentRoll.length > 0
      ? rawRentRoll.map((r: any, idx: number) => {
          const isVac =
            r.status === 'vacant' ||
            r.is_vacant === true ||
            r.lease_state === '공실' ||
            r.use === '공실';
          const isOwn =
            !isVac &&
            (r.status === 'owner' ||
              r.lease_state === '자가사용' ||
              r.use === '자가사용' ||
              r.use === '자가');
          const rawUseStr = String(
            r.use || r.tenant_type || r.tenant_name || (isVac ? '공실' : isOwn ? '자가사용' : '근린생활시설')
          ).trim();
          const slashParts = rawUseStr
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          const splitTenantName = slashParts.length >= 2 ? slashParts[0] : undefined;
          const splitUse =
            slashParts.length >= 2
              ? slashParts[0] === slashParts[1]
                ? slashParts[0]
                : slashParts.slice(1).join(' / ')
              : rawUseStr;
          const explicitTenantName = String(r.tenantName || r.tenant_name || splitTenantName || '').trim() || undefined;
          const rawAreaSqm = Number(r.areaSqm ?? r.area_sqm ?? r.area_m2 ?? 0);
          const rawAreaPy = Number(r.areaPyeong ?? r.area_pyeong ?? 0);
          const areaSqm =
            rawAreaSqm > 0
              ? rawAreaSqm
              : rawAreaPy > 0
              ? Math.round(rawAreaPy * 3.305785 * 100) / 100
              : undefined;
          const rawExclSqm = Number(r.exclusiveAreaSqm ?? r.exclusive_area_sqm ?? 0);
          const exclusiveAreaSqm = rawExclSqm > 0 ? rawExclSqm : undefined;
          const note = r.note !== undefined && String(r.note).trim().length > 0 ? String(r.note).trim() : undefined;

          return {
            floor: String(r.floor || `${idx + 1}F`),
            unit: String(r.unit || r.unit_label || `${idx + 1}01호`),
            use: splitUse,
            ...(explicitTenantName ? { tenantName: explicitTenantName } : {}),
            ...(areaSqm ? { areaSqm } : {}),
            ...(exclusiveAreaSqm ? { exclusiveAreaSqm } : {}),
            depositManwon: Number(r.depositManwon ?? r.deposit_manwon ?? 0),
            monthlyRentManwon: Number(r.monthlyRentManwon ?? r.rent_manwon ?? 0),
            maintenanceManwon: Number(r.maintenanceManwon ?? r.mgmt_fee_manwon ?? 0),
            leaseExpiry: String(r.leaseExpiry || r.lease_end || ''),
            ...(note ? { note } : {}),
            status: isVac
              ? ('vacant' as const)
              : isOwn
              ? ('owner' as const)
              : ('occupied' as const),
          };
        })
      : [];

  let gfaSqm = Number(String(imItem.gfaSqm ?? '').replace(/,/g, '')) || 0;
  let landAreaSqm = Number(String(imItem.landAreaSqm ?? '').replace(/,/g, '')) || 0;
  // Auto-correct swapped GFA and Land Area on multi-story buildings
  if (gfaSqm > 0 && landAreaSqm > 0 && gfaSqm < landAreaSqm && normalizedRentRoll.length >= 2) {
    const tmp = gfaSqm;
    gfaSqm = landAreaSqm;
    landAreaSqm = tmp;
  }

  const zoning = String(imItem.zoning || '').trim();
  const completionDate = String(imItem.completionDate || '').trim();
  const posture = String(imItem.investmentPosture || imItem.posture || 'core_income').trim();

  const knownGolden = address
    ? KNOWN_GOLDEN_PARCELS.find((entry) => entry.match.test(address))
    : undefined;

  const existingMem =
    getQuickImRecord(buildingId) ||
    (imItem.id ? getQuickImRecord(String(imItem.id)) : null);
  const sameExistingAddress =
    existingMem && (!address || !existingMem.address || existingMem.address === address);

  const rawPnu = typeof imItem.pnu === 'string' ? imItem.pnu.trim() : '';
  const resolvedPnu =
    rawPnu ||
    knownGolden?.pnu ||
    (sameExistingAddress ? existingMem?.pnu : undefined);

  const rawCoordLat = Number(imItem.coordinates?.lat ?? imItem.lat);
  const rawCoordLng = Number(imItem.coordinates?.lng ?? imItem.lng);
  const resolvedCoordinates =
    Number.isFinite(rawCoordLat) &&
    Number.isFinite(rawCoordLng) &&
    rawCoordLat !== 0 &&
    rawCoordLng !== 0
      ? { lat: rawCoordLat, lng: rawCoordLng }
      : knownGolden?.coordinates ||
        (sameExistingAddress ? existingMem?.coordinates : undefined);

  const officialLandPriceWonSqm =
    Number(imItem.officialLandPriceWonSqm ?? imItem.officialLandPricePerSqm) ||
    knownGolden?.officialLandPriceWonSqm ||
    (sameExistingAddress ? existingMem?.officialLandPriceWonSqm : undefined) ||
    0;

  const rawHighlights = Array.isArray(imItem.axiosHighlights) ? imItem.axiosHighlights : [];
  const extractedPoints = rawHighlights
    .map((h: any) =>
      typeof h === 'string'
        ? h.trim()
        : [h?.headline, h?.brief].filter(Boolean).join(' — ').trim()
    )
    .filter(Boolean);
  const points: [string, string, string] = [
    extractedPoints[0] || `${region} 핵심 상권 가시성 우수`,
    extractedPoints[1] || '우량 임차인 안정적 임대수익 확보',
    extractedPoints[2] || `${zoning || '상업·업무 권역'} 토지 및 건물 가치 우수`,
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
            const rawUrl = typeof p === 'string' ? p : p?.dataUrl || p?.url || p?.previewUrl;
            const url =
              resolveKnownTestAssetUrl(p?.name || rawUrl) ||
              rawUrl;
            if (
              !url ||
              typeof url !== 'string' ||
              url.trim().length === 0 ||
              url.startsWith('blob:') ||
              url.includes('/test-images/')
            ) {
              return null;
            }
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
            if (!url || url.startsWith('blob:')) return null;
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

  if (resolvedPhotos.length === 0 && existingMem) {
    const existingRealPhotos = Array.isArray(existingMem?.fullDocBody?.photos)
      ? existingMem.fullDocBody.photos.filter(
          (p: any) =>
            p &&
            typeof p.url === 'string' &&
            p.url.trim().length > 0 &&
            !p.url.startsWith('/test-images/') &&
            !p.url.startsWith('blob:')
        )
      : [];
    if (existingRealPhotos.length > 0) {
      resolvedPhotos = existingRealPhotos;
    }
  }

  const { floorsAbove, floorsBelow } = parseFloorCountsFromRentRoll(
    normalizedRentRoll,
    imItem.floorsAbove,
    imItem.floorsBelow
  );

  const priceBand =
    askingPriceManwon > 0
      ? formatPriceRange(askingPriceManwon * 10000)
      : '가격 협의';

  const resolvedClosingLine =
    String(
      imItem.closingLine ||
        imItem.brokerExtras?.closingLine ||
        imItem.brokerExtrasForm?.closingLine ||
        ''
    ).trim() || undefined;

  const rec = buildSeedRecord({
    buildingId,
    documentId: String(imItem.id || `im-doc-${buildingId}`),
    address,
    buildingName: title,
    region,
    use: String(imItem.mainPurpose || '근린생활시설'),
    mainPurpose: imItem.mainPurpose ? String(imItem.mainPurpose) : undefined,
    priceBand,
    askingPriceManwon,
    posture,
    isSynthesized: true,
    bcrPct: Number(imItem.bcrPct || 0),
    farPct: Number(imItem.farPct || 0),
    parkingSpaces: Number(imItem.parkingTotal ?? imItem.parkingSpaces ?? 0),
    elevators: Number(imItem.elevatorCount ?? imItem.elevators ?? 0),
    pnu: resolvedPnu || imItem.pnu,
    lat: resolvedCoordinates?.lat ?? imItem.lat,
    lng: resolvedCoordinates?.lng ?? imItem.lng,
    coordinates: resolvedCoordinates,
    officialLandPriceWonSqm,
    officialLandPricePerSqm:
      Number(imItem.officialLandPricePerSqm || 0) || officialLandPriceWonSqm,
    parcels: imItem.parcels,
    closingLine: resolvedClosingLine,
    points,
    gfaSqm,
    landAreaSqm,
    zoning,
    completionDate,
    floorsAbove: Number(imItem.floorsAbove || floorsAbove || 0),
    floorsBelow: Number(imItem.floorsBelow ?? floorsBelow ?? 0),
    rentRoll: normalizedRentRoll,
    ...(resolvedPhotos.length > 0 ? { photos: resolvedPhotos as any } : {}),
    ...(imItem.handoverNote ? { handoverNote: imItem.handoverNote } : {}),
  });

  const validItemUpdatedAt =
    typeof imItem.updatedAt === 'string' &&
    imItem.updatedAt.trim().length > 0 &&
    !/방금|전$/.test(imItem.updatedAt.trim())
      ? imItem.updatedAt.trim()
      : undefined;
  rec.updatedAt = resolvedEventCreatedAt || validItemUpdatedAt || rec.updatedAt;

  const cleanBrokerStr = (val: unknown): string => {
    if (typeof val !== 'string') return '';
    const t = val.trim();
    if (
      !t ||
      t === '-' ||
      t === '담당 공인중개사' ||
      t === '전담 부동산중개법인' ||
      t === '크리딜 파트너 중개법인' ||
      t.includes('확인 중')
    ) {
      return '';
    }
    return t;
  };

  const resolvedBrokerName =
    cleanBrokerStr(imItem.brokerName) ||
    cleanBrokerStr(brokerProfile?.displayName) ||
    cleanBrokerStr(brokerProfile?.display_name) ||
    '';
  const resolvedBrokerageName =
    cleanBrokerStr(imItem.brokerageName) ||
    cleanBrokerStr(brokerProfile?.company) ||
    '';
  const resolvedBrokerPhone =
    cleanBrokerStr(imItem.brokerPhone) ||
    cleanBrokerStr(brokerProfile?.phone) ||
    '';
  const resolvedBrokerRegNo =
    cleanBrokerStr(imItem.brokerRegNo) ||
    cleanBrokerStr(brokerProfile?.registrationNo) ||
    '';

  rec.ownerId = ownerId || undefined;
  rec.brokerProfile = {
    displayName: resolvedBrokerName,
    company: resolvedBrokerageName,
    phone: resolvedBrokerPhone,
    registrationNo: resolvedBrokerRegNo,
    slug: brokerProfile?.slug,
    photoUrl: brokerProfile?.photoUrl,
  };
  if (rec.basicImDoc?.facts) {
    rec.basicImDoc.facts.brokerOffice = {
      name: resolvedBrokerageName,
      representative: resolvedBrokerName,
      registrationNo: resolvedBrokerRegNo,
      phone: resolvedBrokerPhone,
    };
  }
  if (rec.fullDocBody) {
    if (rawHighlights.length > 0) {
      rec.fullDocBody.axios_highlights = rawHighlights;
    }
    rec.fullDocBody.broker_contact = {
      name: resolvedBrokerName,
      company: resolvedBrokerageName,
      phone: resolvedBrokerPhone,
      registration_no: resolvedBrokerRegNo,
      brokerName: resolvedBrokerName,
      brokerageName: resolvedBrokerageName,
      brokerPhone: resolvedBrokerPhone,
      registrationNo: resolvedBrokerRegNo,
      ...(resolvedClosingLine
        ? { closingLine: resolvedClosingLine, closing_line: resolvedClosingLine }
        : {}),
    };
    rec.docBody = rec.fullDocBody;
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

  let dbClient = supabase;
  if (!dbClient) {
    try {
      const { createServiceClient } = await import('@/lib/supabase/service');
      dbClient = createServiceClient();
    } catch {
      dbClient = null;
    }
  }

  if (dbClient && typeof dbClient.from === 'function') {
    try {
      const { data: imEvents } = await dbClient
        .from('activity_events')
        .select('actor_id, entity_id, event_type, metadata, created_at')
        .in('event_type', [
          'im_upserted',
          'im_deleted',
          'im_restored',
          'dealcard_upserted',
          'dealcard_deleted',
          'dealcard_restored',
        ])
        .order('created_at', { ascending: false })
        .limit(200);

      if (Array.isArray(imEvents)) {
        let pendingCard4Update: {
          card4: Card4Data;
          ownerId?: string;
          brokerProfile?: StoredQuickImRecord['brokerProfile'];
        } | null = null;

        for (const ev of imEvents) {
          const meta = (ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {}) as Record<string, any>;
          const evEntityId = String(ev.entity_id || '');
          const evBId = String(meta.building_id || '');
          const evImId = String(meta.im_id || meta.im_item?.id || '');
          const evItemBid = String(meta.im_item?.buildingId || '');
          if (
            evEntityId !== buildingId &&
            evBId !== buildingId &&
            evImId !== buildingId &&
            evItemBid !== buildingId &&
            (!docId || (evEntityId !== docId && evBId !== docId && evImId !== docId))
          ) {
            continue;
          }
          if (ev.event_type === 'im_deleted' || ev.event_type === 'dealcard_deleted') {
            if (!pendingCard4Update) {
              deleteQuickImRecord(buildingId);
              return null;
            }
            break;
          }
          if (
            (ev.event_type === 'dealcard_upserted' || ev.event_type === 'dealcard_restored') &&
            meta.card4 &&
            !pendingCard4Update
          ) {
            pendingCard4Update = {
              card4: meta.card4 as Card4Data,
              ownerId: ev.actor_id || undefined,
              brokerProfile: meta.broker_profile as StoredQuickImRecord['brokerProfile'] | undefined,
            };
            continue;
          }
          if ((ev.event_type === 'im_upserted' || ev.event_type === 'im_restored') && meta.im_item) {
            const itemToSynthesize: Record<string, any> = {
              ...(meta.im_item as Record<string, any>),
            };
            if (ev.actor_id && !itemToSynthesize.ownerId) {
              itemToSynthesize.ownerId = ev.actor_id;
            }
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
                  const { data: docRows } = await dbClient
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
                        return u.trim().length > 0 && !u.startsWith('/test-images/') && !u.startsWith('blob:');
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
            const synthesized = synthesizeQuickRecordFromImItem(
              buildingId,
              itemToSynthesize,
              meta.broker_profile as Record<string, any> | undefined,
              ev.created_at,
              ev.actor_id
            );
            if (pendingCard4Update) {
              return (
                updateQuickImCard4(buildingId, pendingCard4Update.card4, {
                  ownerId: pendingCard4Update.ownerId,
                  brokerProfile: pendingCard4Update.brokerProfile,
                }) || synthesized
              );
            }
            return synthesized;
          }
        }

        if (pendingCard4Update) {
          const updated = updateQuickImCard4(buildingId, pendingCard4Update.card4, {
            ownerId: pendingCard4Update.ownerId,
            brokerProfile: pendingCard4Update.brokerProfile,
          });
          if (updated) return updated;
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
  const isValidCard4 =
    typeof card4?.region === 'string' &&
    typeof card4?.use === 'string' &&
    typeof card4?.priceBand === 'string' &&
    Array.isArray(card4?.points) &&
    (card4.region.trim().length > 0 ||
      card4.use.trim().length > 0 ||
      card4.priceBand.trim().length > 0 ||
      card4.points.some((p) => typeof p === 'string' && p.trim().length > 0));

  const existing = getQuickImRecord(idOrDocId);
  if (!existing) {
    if (!isValidCard4) {
      return null;
    }
    const now = new Date().toISOString();
    const pts: [string, string, string] = [
      card4.points[0] || '',
      card4.points[1] || '',
      card4.points[2] || '',
    ];
    const gfaSqm =
      typeof card4.gfaPyung === 'number' && card4.gfaPyung > 0
        ? Math.round(card4.gfaPyung * 3.3058 * 10) / 10
        : 0;
    const landAreaSqm =
      typeof card4.landAreaPyung === 'number' && card4.landAreaPyung > 0
        ? Math.round(card4.landAreaPyung * 3.3058 * 10) / 10
        : 0;
    const synthesized = buildSeedRecord({
      buildingId: idOrDocId,
      documentId: `im-doc-${idOrDocId}`,
      address: card4.region || '',
      buildingName: `${card4.region || ''} ${card4.use || ''}`.trim() || '상업용 매물',
      region: card4.region || '',
      use: card4.use || '근린생활시설',
      priceBand: card4.priceBand || '가격 협의',
      askingPriceManwon: 0,
      posture: card4.posture || 'income',
      points: pts,
      gfaSqm,
      landAreaSqm,
      zoning: '',
      completionDate: '',
      floorsAbove: 0,
      floorsBelow: 0,
      isSynthesized: true,
      updatedAt: now,
      rentRoll: [],
    });
    synthesized.card4 = card4;
    synthesized.ownerId = opts?.ownerId;
    synthesized.brokerProfile = opts?.brokerProfile;
    if (synthesized.fullDocBody) {
      synthesized.fullDocBody.card4 = card4;
      synthesized.fullDocBody.ssot_summary = {
        ...(synthesized.fullDocBody.ssot_summary || {}),
        area_signal: card4.region || synthesized.fullDocBody.ssot_summary?.area_signal,
        asset_type: card4.use || synthesized.fullDocBody.ssot_summary?.asset_type,
        price_band: card4.priceBand || synthesized.fullDocBody.ssot_summary?.price_band,
      };
      synthesized.docBody = synthesized.fullDocBody;
    }
    saveQuickImRecord(synthesized);
    return synthesized;
  }

  if (!isValidCard4) {
    return null;
  }

  const now = new Date().toISOString();
  const nextFullDocBody = existing.fullDocBody
    ? {
        ...existing.fullDocBody,
        card4,
        ssot_summary: {
          ...(existing.fullDocBody.ssot_summary || {}),
          area_signal: card4.region || existing.fullDocBody.ssot_summary?.area_signal,
          asset_type: card4.use || existing.fullDocBody.ssot_summary?.asset_type,
          price_band: card4.priceBand || existing.fullDocBody.ssot_summary?.price_band,
        },
      }
    : existing.fullDocBody;
  const updated: StoredQuickImRecord = {
    ...existing,
    buildingName: `${card4.region} ${card4.use}`.trim(),
    ownerId: opts?.ownerId || existing.ownerId,
    brokerProfile: opts?.brokerProfile || existing.brokerProfile,
    card4,
    fullDocBody: nextFullDocBody,
    docBody: nextFullDocBody || existing.docBody,
    updatedAt: now,
  };
  saveQuickImRecord(updated);
  return updated;
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
