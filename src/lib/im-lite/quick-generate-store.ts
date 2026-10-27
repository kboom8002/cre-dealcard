import fs from 'fs';
import os from 'os';
import path from 'path';
import type { BasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { buildBasicImDocument } from '@/domain/building/im-core/basic-im-document';
import { extractPureBuildingFacts } from '@/domain/building/im-core/facts';
import { computeCard4Hash, type Card4Data } from '@/lib/deal-card/card4-schema';

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
  createdAt: string;
  updatedAt: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

const STORE_FILE = path.join(os.tmpdir(), 'cre-v3-quick-generate-store.json');

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

  const card4Base: Omit<Card4Data, 'card4_hash'> = {
    region: params.region,
    use: params.use,
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
    },
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

export function updateQuickImCard4(idOrDocId: string, card4: Card4Data): StoredQuickImRecord | null {
  const existing = getQuickImRecord(idOrDocId);
  if (!existing) return null;
  const updated: StoredQuickImRecord = {
    ...existing,
    card4,
    updatedAt: new Date().toISOString(),
  };
  saveQuickImRecord(updated);
  return updated;
}
