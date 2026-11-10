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
