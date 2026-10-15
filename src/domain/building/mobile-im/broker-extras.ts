// src/domain/building/mobile-im/broker-extras.ts
// D4: 중개인 추가 정보 (투자 포인트 / 규제·계획 / 인근 시세 / 입지 / 매입 후 전략 / 목표 임대료)
//
// 원칙 (d4_d12_plan §0):
//  - 중개인이 입력한 사실만 원문 그대로 기록한다 (AI 재작성 금지, 출처 표기 "중개인 입력").
//  - 이 모듈은 클라이언트(바텀시트)와 서버(route/handler)가 공유하는 한도·검증의 단일 소스다.
//  - 계산은 하지 않는다 (평당가/괴리율/수익률은 PPTX 쪽 결정론 코드가 담당).

export type RegulatoryKind = 'district_plan' | 'dev_restriction' | 'zoning_special' | 'other';

export interface BrokerRegulatoryNote {
  kind: RegulatoryKind;
  title?: string;
  detail: string;
  /** 근거 / 제한행위 / 기한 — dev_restriction(개발행위허가제한)에서만 의미 있음 */
  basis?: string;
  restricted_acts?: string;
  period?: string;
}

export interface BrokerMarketComp {
  kind: 'transaction' | 'listing';
  location: string;
  price_eok?: number;
  land_price_per_pyeong_manwon?: number;
  note?: string;
  road_side?: '대로변' | '이면' | string;
  station_walk?: string;
  station_name?: string;
  station_walk_min?: number;
  land_area_sqm?: number;
  land_area_pyeong?: number;
  gfa_sqm?: number;
  gfa_pyeong?: number;
  as_of?: string;
  selected?: boolean;
  source?: 'broker' | 'molit_tx' | 'broker_listing' | 'rtms' | 'csv';
}

export type AcquisitionPlanAction =
  | 'vacant_lease'
  | 'owner_use_to_lease'
  | 'rerent'
  | 'convert_to_lease'
  | 'lease_vacant';

export interface AcquisitionPlanUnit {
  floor: string;
  action: AcquisitionPlanAction;
  deposit_manwon: number;
  rent_manwon: number;
  area_pyeong?: number;
  note?: string;
  source?: 'broker' | 'legacy_text';
}

export interface BrokerExtras {
  investment_points?: string[];
  closing_line?: string;
  regulatory_notes?: BrokerRegulatoryNote[];
  market_comps?: BrokerMarketComp[];
  location_note?: string;
  post_acquisition_plan?: string[];
  post_acquisition_units?: AcquisitionPlanUnit[];
  summary_yield_basis?: 'auto' | 'current' | 'stabilized';
  /** 목표 임대료 (만원/평/월) — 안정화 수익률 산출용 */
  target_rent_per_pyeong_manwon?: number;
}

/** 클라이언트·서버 공용 한도 (단일 소스) */
export const BROKER_EXTRAS_LIMITS = {
  investmentPointsMax: 5,
  investmentPointChars: 60,
  closingLineChars: 80,
  regulatoryNotesMax: 4,
  regTitleChars: 30,
  regDetailChars: 100,
  regBasisChars: 80,
  regRestrictedActsChars: 80,
  regPeriodChars: 80,
  marketCompsMax: 10,
  compLocationChars: 40,
  compNoteChars: 40,
  compRoadSideChars: 16,
  compStationWalkChars: 30,
  compAsOfChars: 20,
  locationNoteChars: 200,
  postAcquisitionPlanMax: 3,
  postAcquisitionPlanChars: 80,
  postAcquisitionUnitsMax: 10,
  postAcquisitionUnitNoteChars: 60,
} as const;

export const REGULATORY_KINDS: readonly RegulatoryKind[] = ['district_plan', 'dev_restriction', 'zoning_special', 'other'];
export const REGULATORY_KIND_LABELS: Record<RegulatoryKind, string> = {
  district_plan: '지구단위계획',
  dev_restriction: '개발행위허가제한',
  zoning_special: '용도지역 특례',
  other: '기타',
};
export const COMP_KIND_LABELS: Record<BrokerMarketComp['kind'], string> = {
  transaction: '실거래',
  listing: '매물',
};

export type BrokerExtrasParseResult =
  | { ok: true; value: BrokerExtras | undefined }
  | { ok: false; error: string };

class ExtrasError extends Error {}

const PREFIX = '중개인 추가 정보';
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g;

/** 제어문자 → 공백, '<' '>' 제거, 연속 공백 정리, trim */
function cleanString(v: unknown, label: string): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new ExtrasError(`${PREFIX} — ${label} 형식이 올바르지 않습니다.`);
  return v.replace(CONTROL_CHARS, ' ').replace(/[<>]/g, '').replace(/ {2,}/g, ' ').trim();
}

function checkMax(s: string, max: number, label: string): string {
  if (s.length > max) throw new ExtrasError(`${PREFIX} — ${label}은(는) ${max}자 이하로 입력해주세요. (현재 ${s.length}자)`);
  return s;
}

function cleanNumber(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    v = Number(t.replace(/,/g, ''));
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ExtrasError(`${PREFIX} — ${label}은(는) 0보다 큰 숫자로 입력해주세요.`);
  }
  return v;
}

function cleanNonNegativeNumber(v: unknown, label: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return undefined;
    v = Number(t.replace(/,/g, ''));
  }
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new ExtrasError(`${PREFIX} — ${label}은(는) 0 이상의 숫자로 입력해주세요.`);
  }
  return v;
}

function cleanStringList(v: unknown, label: string, maxItems: number, maxChars: number): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ExtrasError(`${PREFIX} — ${label} 형식이 올바르지 않습니다.`);
  const items = v.map((x) => cleanString(x, label)).filter((s) => s.length > 0);
  if (items.length === 0) return undefined;
  if (items.length > maxItems) throw new ExtrasError(`${PREFIX} — ${label}은(는) 최대 ${maxItems}개까지 입력할 수 있습니다.`);
  items.forEach((s, i) => checkMax(s, maxChars, `${label} ${i + 1}번`));
  return items;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseRegulatoryNotes(v: unknown): BrokerRegulatoryNote[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ExtrasError(`${PREFIX} — 규제·계획 메모 형식이 올바르지 않습니다.`);
  const L = BROKER_EXTRAS_LIMITS;
  const out: BrokerRegulatoryNote[] = [];
  v.forEach((raw, idx) => {
    const n = idx + 1;
    if (!isRecord(raw)) throw new ExtrasError(`${PREFIX} — 규제·계획 메모 ${n}번 형식이 올바르지 않습니다.`);
    const kindRaw = raw.kind === undefined || raw.kind === null || raw.kind === '' ? 'other' : raw.kind;
    if (typeof kindRaw !== 'string' || !(REGULATORY_KINDS as readonly string[]).includes(kindRaw)) {
      throw new ExtrasError(`${PREFIX} — 규제·계획 메모 ${n}번 구분이 올바르지 않습니다.`);
    }
    const kind = kindRaw as RegulatoryKind;
    const label = `규제·계획 메모 ${n}번`;
    const title = cleanString(raw.title, `${label} 제목`);
    const detail = cleanString(raw.detail, `${label} 내용`);
    const basis = cleanString(raw.basis, `${label} 근거`);
    const restricted = cleanString(raw.restricted_acts, `${label} 제한행위`);
    const period = cleanString(raw.period, `${label} 기한`);
    // 모든 입력 칸이 비어 있으면 빈 행으로 간주하고 버린다 (구분 선택만 한 경우)
    if (!title && !detail && !basis && !restricted && !period) return;
    if (!detail) throw new ExtrasError(`${PREFIX} — ${label} 내용을 입력해주세요.`);
    const note: BrokerRegulatoryNote = {
      kind,
      detail: checkMax(detail, L.regDetailChars, `${label} 내용`),
    };
    if (title) note.title = checkMax(title, L.regTitleChars, `${label} 제목`);
    if (kind === 'dev_restriction') {
      if (basis) note.basis = checkMax(basis, L.regBasisChars, `${label} 근거`);
      if (restricted) note.restricted_acts = checkMax(restricted, L.regRestrictedActsChars, `${label} 제한행위`);
      if (period) note.period = checkMax(period, L.regPeriodChars, `${label} 기한`);
    }
    out.push(note);
  });
  if (out.length === 0) return undefined;
  if (out.length > L.regulatoryNotesMax) {
    throw new ExtrasError(`${PREFIX} — 규제·계획 메모는 최대 ${L.regulatoryNotesMax}건까지 입력할 수 있습니다.`);
  }
  return out;
}

function parseMarketComps(v: unknown): BrokerMarketComp[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ExtrasError(`${PREFIX} — 인근 시세 비교 형식이 올바르지 않습니다.`);
  const L = BROKER_EXTRAS_LIMITS;
  const out: BrokerMarketComp[] = [];
  v.forEach((raw, idx) => {
    const n = idx + 1;
    const label = `인근 시세 비교 ${n}번`;
    if (!isRecord(raw)) throw new ExtrasError(`${PREFIX} — ${label} 형식이 올바르지 않습니다.`);
    const kindRaw = raw.kind === undefined || raw.kind === null || raw.kind === '' ? 'transaction' : raw.kind;
    if (kindRaw !== 'transaction' && kindRaw !== 'listing') {
      throw new ExtrasError(`${PREFIX} — ${label} 구분이 올바르지 않습니다.`);
    }
    const location = cleanString(raw.location, `${label} 소재지`);
    const note = cleanString(raw.note, `${label} 비고`);
    const price = cleanNumber(raw.price_eok, `${label} 가격(억)`);
    const landPrice = cleanNumber(raw.land_price_per_pyeong_manwon, `${label} 토지평당가(만원)`);
    const roadSideRaw = cleanString(raw.road_side, `${label} 도로조건`);
    const stationWalk = cleanString(raw.station_walk, `${label} 지하철 거리`);
    const stationName = cleanString(raw.station_name, `${label} 지하철역`);
    const stationWalkMin = cleanNumber(raw.station_walk_min, `${label} 도보(분)`);
    const landAreaSqm = cleanNumber(raw.land_area_sqm, `${label} 토지면적(㎡)`);
    const landAreaPyeong = cleanNumber(raw.land_area_pyeong, `${label} 토지면적(평)`);
    const gfaSqm = cleanNumber(raw.gfa_sqm, `${label} 연면적(㎡)`);
    const gfaPyeong = cleanNumber(raw.gfa_pyeong, `${label} 연면적(평)`);
    const asOf = cleanString(raw.as_of, `${label} 기준일`);

    if (
      !location && !note && price === undefined && landPrice === undefined &&
      !roadSideRaw && !stationWalk && !stationName && stationWalkMin === undefined &&
      landAreaSqm === undefined && landAreaPyeong === undefined &&
      gfaSqm === undefined && gfaPyeong === undefined && !asOf
    ) {
      return; // 빈 행
    }
    if (!location) throw new ExtrasError(`${PREFIX} — ${label} 소재지를 입력해주세요.`);
    if (price === undefined && landPrice === undefined) {
      throw new ExtrasError(`${PREFIX} — ${label} 가격(억) 또는 토지평당가(만원) 중 하나는 입력해주세요.`);
    }
    const comp: BrokerMarketComp = { kind: kindRaw, location: checkMax(location, L.compLocationChars, `${label} 소재지`) };
    if (price !== undefined) comp.price_eok = price;
    if (landPrice !== undefined) comp.land_price_per_pyeong_manwon = landPrice;
    if (note) comp.note = checkMax(note, L.compNoteChars, `${label} 비고`);
    if (roadSideRaw) comp.road_side = checkMax(roadSideRaw, L.compRoadSideChars, `${label} 도로조건`);
    if (stationWalk) comp.station_walk = checkMax(stationWalk, L.compStationWalkChars, `${label} 지하철 거리`);
    if (stationName) comp.station_name = checkMax(stationName, L.compStationWalkChars, `${label} 지하철역`);
    if (stationWalkMin !== undefined) comp.station_walk_min = stationWalkMin;
    if (landAreaSqm !== undefined) comp.land_area_sqm = landAreaSqm;
    if (landAreaPyeong !== undefined) comp.land_area_pyeong = landAreaPyeong;
    if (gfaSqm !== undefined) comp.gfa_sqm = gfaSqm;
    if (gfaPyeong !== undefined) comp.gfa_pyeong = gfaPyeong;
    if (asOf) comp.as_of = checkMax(asOf, L.compAsOfChars, `${label} 기준일`);
    if (typeof raw.selected === 'boolean') comp.selected = raw.selected;
    if (
      raw.source === 'broker' ||
      raw.source === 'molit_tx' ||
      raw.source === 'broker_listing' ||
      raw.source === 'rtms' ||
      raw.source === 'csv'
    ) {
      comp.source = raw.source;
    }
    out.push(comp);
  });
  if (out.length === 0) return undefined;
  if (out.length > L.marketCompsMax) {
    throw new ExtrasError(`${PREFIX} — 인근 시세 비교는 최대 ${L.marketCompsMax}행까지 입력할 수 있습니다.`);
  }
  return out;
}

const VALID_PLAN_ACTIONS: readonly AcquisitionPlanAction[] = [
  'vacant_lease',
  'owner_use_to_lease',
  'rerent',
  'convert_to_lease',
  'lease_vacant',
];

function parsePostAcquisitionUnits(v: unknown): AcquisitionPlanUnit[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new ExtrasError(`${PREFIX} — 매입 후 전환 계획 형식이 올바르지 않습니다.`);
  const L = BROKER_EXTRAS_LIMITS;
  const out: AcquisitionPlanUnit[] = [];
  v.forEach((raw, idx) => {
    const n = idx + 1;
    const label = `매입 후 전환 계획 ${n}번`;
    if (!isRecord(raw)) throw new ExtrasError(`${PREFIX} — ${label} 형식이 올바르지 않습니다.`);
    const floor = cleanString(raw.floor, `${label} 층`);
    const deposit = cleanNonNegativeNumber(raw.deposit_manwon, `${label} 보증금(만원)`);
    const rent = cleanNumber(raw.rent_manwon, `${label} 월세(만원)`);
    const areaPy = cleanNumber(raw.area_pyeong, `${label} 면적(평)`);
    const note = cleanString(raw.note, `${label} 비고`);
    if (!floor && deposit === undefined && rent === undefined && areaPy === undefined && !note) return;
    if (!floor) throw new ExtrasError(`${PREFIX} — ${label} 층을 입력해주세요.`);
    if (rent === undefined) throw new ExtrasError(`${PREFIX} — ${label} 월세(만원)를 입력해주세요.`);
    const actionRaw = raw.action === undefined || raw.action === null || raw.action === '' ? 'owner_use_to_lease' : raw.action;
    if (typeof actionRaw !== 'string' || !(VALID_PLAN_ACTIONS as readonly string[]).includes(actionRaw)) {
      throw new ExtrasError(`${PREFIX} — ${label} 전환 구분이 올바르지 않습니다.`);
    }
    const unit: AcquisitionPlanUnit = {
      floor: checkMax(floor, 20, `${label} 층`),
      action: actionRaw as AcquisitionPlanAction,
      deposit_manwon: deposit ?? 0,
      rent_manwon: rent,
    };
    if (areaPy !== undefined) unit.area_pyeong = areaPy;
    if (note) unit.note = checkMax(note, L.postAcquisitionUnitNoteChars, `${label} 비고`);
    if (raw.source === 'broker' || raw.source === 'legacy_text') unit.source = raw.source;
    out.push(unit);
  });
  if (out.length === 0) return undefined;
  if (out.length > L.postAcquisitionUnitsMax) {
    throw new ExtrasError(`${PREFIX} — 매입 후 전환 계획은 최대 ${L.postAcquisitionUnitsMax}건까지 입력할 수 있습니다.`);
  }
  return out;
}

/**
 * 레거시 post_acquisition_plan 문자열에서 구조화된 전환 계획(AcquisitionPlanUnit[])을 추출한다.
 * 예:
 *  - "자가사용 B1 임대 전환 (현실화안 보증 5,000만 / 월 458만)" → { floor: 'B1', action: 'owner_use_to_lease', deposit_manwon: 5000, rent_manwon: 458 }
 *  - "4F 자가사용분 임대 전환 (현실화안 보증 3,000만 / 월 144만)" → { floor: '4F', action: 'owner_use_to_lease', deposit_manwon: 3000, rent_manwon: 144 }
 */
export function parseLegacyPostAcquisitionPlanUnits(
  planLines?: readonly string[] | null,
  floorLeases?: readonly any[] | null,
): AcquisitionPlanUnit[] {
  if (!Array.isArray(planLines) || planLines.length === 0) return [];
  const leases = Array.isArray(floorLeases) ? floorLeases.filter((l) => l && typeof l === 'object') : [];

  const normalizeFloorToken = (raw: string): string => {
    const s = raw.trim().toUpperCase();
    const bMatch = s.match(/^(?:B|지하\s*)(\d+)(?:F|층)?$/i);
    if (bMatch) return `B${bMatch[1]}`;
    const fMatch = s.match(/^(?:지상\s*)?(\d+)\s*(?:F|층)$/i);
    if (fMatch) return `${fMatch[1]}F`;
    return s;
  };

  const parseAmountManwon = (text: string, prefixRe: RegExp): number | null => {
    const m = text.match(prefixRe);
    if (!m) return null;
    const eokStr = m[1]?.replace(/,/g, '');
    const manStr = m[2]?.replace(/,/g, '');
    let total = 0;
    let matched = false;
    if (eokStr && Number.isFinite(Number(eokStr))) {
      total += Number(eokStr) * 10000;
      matched = true;
    }
    if (manStr && Number.isFinite(Number(manStr))) {
      total += Number(manStr);
      matched = true;
    }
    return matched ? total : null;
  };

  const out: AcquisitionPlanUnit[] = [];
  for (const rawLine of planLines) {
    if (typeof rawLine !== 'string') continue;
    const line = rawLine.trim();
    if (!line) continue;

    // 층 토큰 추출 (예: B1, B2F, 지하1층, 지하 1층, 4F, 4층)
    const floorMatch = line.match(/(?:^|[\s(·,])(B\d+F?|지하\s*\d+\s*층?|(?:지상\s*)?\d+\s*(?:F|층))(?=$|[\s)·,가-힣])/i);
    if (!floorMatch) continue;
    const floor = normalizeFloorToken(floorMatch[1]);

    // 보증금 추출 (예: 보증 5,000만, 보증금 1억 2,000만, 보증 0.5억)
    const depositManwon = parseAmountManwon(
      line,
      /보증(?:금)?\s*(?:([\d,]+(?:\.\d+)?)\s*억\s*)?(?:([\d,]+(?:\.\d+)?)\s*만)?/,
    );
    // 월세 추출 (예: 월 458만, 월세 458만, 월임대료 458만)
    const rentManwon = parseAmountManwon(
      line,
      /월(?:세|임대료)?\s*(?:([\d,]+(?:\.\d+)?)\s*억\s*)?(?:([\d,]+(?:\.\d+)?)\s*만)?/,
    );

    if (depositManwon == null || rentManwon == null || !(rentManwon > 0)) continue;

    const isRerent = !/(자가|공실|임대\s*전환)/.test(line) && /(재계약|인상|갱신|재조정)/.test(line);
    const isVacant = !isRerent && /공실/.test(line) && !/자가/.test(line);
    const action: AcquisitionPlanAction = isRerent
      ? 'rerent'
      : isVacant
        ? 'vacant_lease'
        : 'owner_use_to_lease';

    let areaPyeong: number | undefined;
    // floorLeases가 제공된 경우 해당 층에 자가사용 또는 공실 호실이 실제로 존재하는지 검증 (rerent 제외)
    if (leases.length > 0 && action !== 'rerent') {
      const matchingLeases = leases.filter((l) => {
        const lf = normalizeFloorToken(String(l.floor ?? l.unit ?? ''));
        return lf === floor || lf.startsWith(`${floor}-`) || lf.startsWith(`${floor}(`);
      });
      const vacantOrOwnerLeases = matchingLeases.filter((l) => {
        const txt = [l.lease_state, l.tenant_name, l.tenant, l.tenant_type, l.tenant_sector, l.note]
          .map((v) => (v == null ? '' : String(v)))
          .join(' ');
        return Boolean(l.is_vacant) || /자가|공실/.test(txt);
      });
      if (vacantOrOwnerLeases.length === 0) continue;
      let totalPy = 0;
      for (const l of vacantOrOwnerLeases) {
        const py = Number(l.area_pyeong);
        const sqm = Number(l.area_sqm);
        if (Number.isFinite(py) && py > 0) totalPy += py;
        else if (Number.isFinite(sqm) && sqm > 0) totalPy += sqm / 3.305785;
      }
      if (totalPy > 0) {
        areaPyeong = Math.round(totalPy * 10) / 10;
      }
    }

    const unit: AcquisitionPlanUnit = {
      floor,
      action,
      deposit_manwon: depositManwon,
      rent_manwon: rentManwon,
    };
    if (areaPyeong !== undefined) unit.area_pyeong = areaPyeong;
    out.push(unit);
  }
  return out;
}

/**
 * 중개인 추가 정보 파싱·검증 (클라이언트/서버 공용).
 * - trim, 빈 항목 제거, 제어문자·'<>' 제거, 한도 초과 시 한국어 오류
 * - 숫자는 유한·양수만 허용
 * - 비어 있으면 value: undefined
 * - 문자열을 재작성(AI)하지 않는다 (정제만)
 */
export function parseBrokerExtras(input: unknown): BrokerExtrasParseResult {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  if (!isRecord(input)) return { ok: false, error: `${PREFIX} — 형식이 올바르지 않습니다.` };
  const L = BROKER_EXTRAS_LIMITS;
  try {
    const value: BrokerExtras = {};

    const points = cleanStringList(input.investment_points, '투자 포인트', L.investmentPointsMax, L.investmentPointChars);
    if (points) value.investment_points = points;

    const closing = cleanString(input.closing_line, '마무리 한줄');
    if (closing) value.closing_line = checkMax(closing, L.closingLineChars, '마무리 한줄');

    const reg = parseRegulatoryNotes(input.regulatory_notes);
    if (reg) value.regulatory_notes = reg;

    const comps = parseMarketComps(input.market_comps);
    if (comps) value.market_comps = comps;

    const loc = cleanString(input.location_note, '입지 설명');
    if (loc) value.location_note = checkMax(loc, L.locationNoteChars, '입지 설명');

    const plan = cleanStringList(input.post_acquisition_plan, '매입 후 전략', L.postAcquisitionPlanMax, L.postAcquisitionPlanChars);
    if (plan) value.post_acquisition_plan = plan;

    const units = parsePostAcquisitionUnits(input.post_acquisition_units);
    if (units) value.post_acquisition_units = units;

    if (input.summary_yield_basis !== undefined && input.summary_yield_basis !== null && input.summary_yield_basis !== '') {
      const b = input.summary_yield_basis;
      if (b !== 'auto' && b !== 'current' && b !== 'stabilized') {
        throw new ExtrasError(`${PREFIX} — 요약 수익률 기준이 올바르지 않습니다.`);
      }
      value.summary_yield_basis = b;
    }

    const rent = cleanNumber(input.target_rent_per_pyeong_manwon, '목표 임대료(평당 만원/월)');
    if (rent !== undefined) value.target_rent_per_pyeong_manwon = rent;

    return { ok: true, value: hasBrokerExtras(value) ? value : undefined };
  } catch (e) {
    if (e instanceof ExtrasError) return { ok: false, error: e.message };
    throw e;
  }
}

/** 하나라도 비어 있지 않은 항목이 있는지 */
export function hasBrokerExtras(x?: BrokerExtras | null): boolean {
  if (!x) return false;
  return !!(
    x.investment_points?.length ||
    x.closing_line ||
    x.regulatory_notes?.length ||
    x.market_comps?.length ||
    x.location_note ||
    x.post_acquisition_plan?.length ||
    x.post_acquisition_units?.length ||
    x.summary_yield_basis ||
    (x.target_rent_per_pyeong_manwon !== undefined && x.target_rent_per_pyeong_manwon > 0)
  );
}

/** 입력된 항목 수 (배지 표시용). 목표 임대료는 별도 입력이므로 제외 */
export function countBrokerExtrasFilled(x?: BrokerExtras | null): number {
  if (!x) return 0;
  return (
    (x.investment_points?.length ?? 0) +
    (x.closing_line ? 1 : 0) +
    (x.regulatory_notes?.length ?? 0) +
    (x.market_comps?.length ?? 0) +
    (x.location_note ? 1 : 0) +
    (x.post_acquisition_plan?.length ?? 0) +
    (x.post_acquisition_units?.length ?? 0)
  );
}

/** 저장 직전 문자열 변환(예: sanitizeComplianceText) 적용 — 구조·숫자는 보존 */
export function mapBrokerExtrasStrings(x: BrokerExtras, fn: (s: string) => string): BrokerExtras {
  const out: BrokerExtras = {};
  if (x.investment_points) out.investment_points = x.investment_points.map(fn);
  if (x.closing_line) out.closing_line = fn(x.closing_line);
  if (x.regulatory_notes) {
    out.regulatory_notes = x.regulatory_notes.map((r) => ({
      kind: r.kind,
      detail: fn(r.detail),
      ...(r.title ? { title: fn(r.title) } : {}),
      ...(r.basis ? { basis: fn(r.basis) } : {}),
      ...(r.restricted_acts ? { restricted_acts: fn(r.restricted_acts) } : {}),
      ...(r.period ? { period: fn(r.period) } : {}),
    }));
  }
  if (x.market_comps) {
    out.market_comps = x.market_comps.map((c) => ({
      kind: c.kind,
      location: fn(c.location),
      ...(c.price_eok !== undefined ? { price_eok: c.price_eok } : {}),
      ...(c.land_price_per_pyeong_manwon !== undefined ? { land_price_per_pyeong_manwon: c.land_price_per_pyeong_manwon } : {}),
      ...(c.note ? { note: fn(c.note) } : {}),
      ...(c.road_side ? { road_side: c.road_side } : {}),
      ...(c.station_walk ? { station_walk: fn(c.station_walk) } : {}),
      ...(c.station_name ? { station_name: fn(c.station_name) } : {}),
      ...(c.station_walk_min !== undefined ? { station_walk_min: c.station_walk_min } : {}),
      ...(c.land_area_sqm !== undefined ? { land_area_sqm: c.land_area_sqm } : {}),
      ...(c.land_area_pyeong !== undefined ? { land_area_pyeong: c.land_area_pyeong } : {}),
      ...(c.gfa_sqm !== undefined ? { gfa_sqm: c.gfa_sqm } : {}),
      ...(c.gfa_pyeong !== undefined ? { gfa_pyeong: c.gfa_pyeong } : {}),
      ...(c.as_of ? { as_of: fn(c.as_of) } : {}),
      ...(c.selected !== undefined ? { selected: c.selected } : {}),
      ...(c.source ? { source: c.source } : {}),
    }));
  }
  if (x.location_note) out.location_note = fn(x.location_note);
  if (x.post_acquisition_plan) out.post_acquisition_plan = x.post_acquisition_plan.map(fn);
  if (x.post_acquisition_units) {
    out.post_acquisition_units = x.post_acquisition_units.map((u) => ({
      floor: fn(u.floor),
      action: u.action,
      deposit_manwon: u.deposit_manwon,
      rent_manwon: u.rent_manwon,
      ...(u.area_pyeong !== undefined ? { area_pyeong: u.area_pyeong } : {}),
      ...(u.note ? { note: fn(u.note) } : {}),
      ...(u.source ? { source: u.source } : {}),
    }));
  }
  if (x.summary_yield_basis) out.summary_yield_basis = x.summary_yield_basis;
  if (x.target_rent_per_pyeong_manwon !== undefined) out.target_rent_per_pyeong_manwon = x.target_rent_per_pyeong_manwon;
  return out;
}

// ──────────────────────────────────────────────────────────────────
// 바텀시트 폼 상태 <-> BrokerExtras 변환 (클라이언트 전용 헬퍼, 순수 함수)
// ──────────────────────────────────────────────────────────────────

export interface BrokerRegulatoryRowForm {
  kind: RegulatoryKind;
  detail: string;
  basis: string;
  restricted_acts: string;
  period: string;
}
export interface BrokerCompRowForm {
  kind: 'transaction' | 'listing';
  location: string;
  price_eok: string;
  land_price_per_pyeong_manwon: string;
  note: string;
  road_side?: '' | '대로변' | '이면' | string;
  station_walk?: string;
  land_area_pyeong?: string;
  gfa_pyeong?: string;
  as_of?: string;
  selected?: boolean;
}
export interface BrokerExtrasFormState {
  investmentPointsText: string;
  closingLine: string;
  regulatoryRows: BrokerRegulatoryRowForm[];
  compRows: BrokerCompRowForm[];
  locationNote: string;
  postAcquisitionPlanText: string;
  targetRent: string;
}

export const EMPTY_BROKER_EXTRAS_FORM: BrokerExtrasFormState = {
  investmentPointsText: '',
  closingLine: '',
  regulatoryRows: [],
  compRows: [],
  locationNote: '',
  postAcquisitionPlanText: '',
  targetRent: '',
};

function splitLines(text: string): string[] {
  return (text ?? '').split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function formNum(s: string | undefined): number | undefined {
  const t = (s ?? '').trim();
  if (t === '') return undefined;
  return Number(t.replace(/,/g, ''));
}

/** 폼 상태 → parseBrokerExtras 입력 객체 (검증 전 원시 객체; NaN 은 그대로 두어 파서가 거절) */
export function brokerExtrasFormToInput(f: BrokerExtrasFormState): Record<string, unknown> {
  return {
    investment_points: splitLines(f.investmentPointsText),
    closing_line: f.closingLine,
    regulatory_notes: f.regulatoryRows.map((r) => ({
      kind: r.kind,
      detail: r.detail,
      basis: r.basis,
      restricted_acts: r.restricted_acts,
      period: r.period,
    })),
    market_comps: f.compRows.map((c) => ({
      kind: c.kind,
      location: c.location,
      price_eok: formNum(c.price_eok),
      land_price_per_pyeong_manwon: formNum(c.land_price_per_pyeong_manwon),
      note: c.note,
      ...(c.road_side ? { road_side: c.road_side } : {}),
      ...(c.station_walk?.trim() ? { station_walk: c.station_walk } : {}),
      ...(formNum(c.land_area_pyeong) !== undefined ? { land_area_pyeong: formNum(c.land_area_pyeong) } : {}),
      ...(formNum(c.gfa_pyeong) !== undefined ? { gfa_pyeong: formNum(c.gfa_pyeong) } : {}),
      ...(c.as_of?.trim() ? { as_of: c.as_of } : {}),
      ...(c.selected !== undefined ? { selected: c.selected } : {}),
    })),
    location_note: f.locationNote,
    post_acquisition_plan: splitLines(f.postAcquisitionPlanText),
    target_rent_per_pyeong_manwon: formNum(f.targetRent),
  };
}

/** 저장된 body.broker_extras → 폼 상태 (시트 재오픈 복원) */
export function brokerExtrasToForm(x?: BrokerExtras | null): BrokerExtrasFormState {
  if (!x) return { ...EMPTY_BROKER_EXTRAS_FORM, regulatoryRows: [], compRows: [] };
  return {
    investmentPointsText: (x.investment_points ?? []).join('\n'),
    closingLine: x.closing_line ?? '',
    regulatoryRows: (x.regulatory_notes ?? []).map((r) => ({
      kind: r.kind,
      detail: r.detail ?? '',
      basis: r.basis ?? '',
      restricted_acts: r.restricted_acts ?? '',
      period: r.period ?? '',
    })),
    compRows: (x.market_comps ?? []).map((c) => ({
      kind: c.kind,
      location: c.location ?? '',
      price_eok: c.price_eok !== undefined ? String(c.price_eok) : '',
      land_price_per_pyeong_manwon: c.land_price_per_pyeong_manwon !== undefined ? String(c.land_price_per_pyeong_manwon) : '',
      note: c.note ?? '',
      ...(c.road_side ? { road_side: c.road_side } : {}),
      ...(c.station_walk ? { station_walk: c.station_walk } : {}),
      ...(c.land_area_pyeong !== undefined ? { land_area_pyeong: String(c.land_area_pyeong) } : {}),
      ...(c.gfa_pyeong !== undefined ? { gfa_pyeong: String(c.gfa_pyeong) } : {}),
      ...(c.as_of ? { as_of: c.as_of } : {}),
      ...(c.selected !== undefined ? { selected: c.selected } : {}),
    })),
    locationNote: x.location_note ?? '',
    postAcquisitionPlanText: (x.post_acquisition_plan ?? []).join('\n'),
    targetRent: x.target_rent_per_pyeong_manwon !== undefined ? String(x.target_rent_per_pyeong_manwon) : '',
  };
}

// ──────────────────────────────────────────────────────────────────
// 모바일 뷰어 텍스트 블록 (결정론, AI 없음, 원문 그대로)
// ──────────────────────────────────────────────────────────────────

export const BROKER_EXTRAS_SOURCE_TAG = '중개인 입력';

export const BROKER_EXTRAS_HEADINGS = {
  investmentPoints: `### 투자 포인트 (${BROKER_EXTRAS_SOURCE_TAG})`,
  regulatory: `### 규제·계획 (${BROKER_EXTRAS_SOURCE_TAG})`,
  marketComps: `### 인근 시세 비교 (${BROKER_EXTRAS_SOURCE_TAG})`,
  locationNote: `### 입지 설명 (${BROKER_EXTRAS_SOURCE_TAG})`,
  postAcquisitionPlan: `### 매입 후 전략 (${BROKER_EXTRAS_SOURCE_TAG})`,
} as const;

/** 마크다운 표 셀 이스케이프 (파이프·줄바꿈) */
function cell(s: string | undefined): string {
  const t = (s ?? '').replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').trim();
  return t || '-';
}

function fmtDecimal(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

function fmtWithComma(n: number): string {
  const r = Math.round(n * 100) / 100;
  const [int, frac] = String(r).split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
}

export interface BrokerExtrasBlocks {
  investment_thesis?: string;
  /** 규제·계획 — 호출측에서 land_detail 우선, 없으면 risk_check 로 폴백 */
  regulatory?: string;
  comparables?: string;
  location_access?: string;
  lease_status?: string;
}

/** 입력 항목별 마크다운 블록 생성 (입력이 없는 블록은 키 자체가 없음) */
export function buildBrokerExtrasBlocks(extras?: BrokerExtras | null): BrokerExtrasBlocks {
  const blocks: BrokerExtrasBlocks = {};
  if (!extras) return blocks;

  if (extras.investment_points?.length || extras.closing_line) {
    const lines = [BROKER_EXTRAS_HEADINGS.investmentPoints, ''];
    for (const p of extras.investment_points ?? []) lines.push(`- ${p}`);
    if (extras.closing_line) {
      if (extras.investment_points?.length) lines.push('');
      lines.push(`> ${extras.closing_line}`);
    }
    blocks.investment_thesis = lines.join('\n');
  }

  if (extras.regulatory_notes?.length) {
    const lines = [BROKER_EXTRAS_HEADINGS.regulatory, ''];
    for (const r of extras.regulatory_notes) {
      const head = `**${REGULATORY_KIND_LABELS[r.kind]}**${r.title ? ` · ${r.title}` : ''}`;
      lines.push(`- ${head}: ${r.detail}`);
      if (r.kind === 'dev_restriction') {
        if (r.basis) lines.push(`  - 근거: ${r.basis}`);
        if (r.restricted_acts) lines.push(`  - 제한행위: ${r.restricted_acts}`);
        if (r.period) lines.push(`  - 기한: ${r.period}`);
      }
    }
    blocks.regulatory = lines.join('\n');
  }

  const activeComps = (extras.market_comps ?? []).filter((c) => c.selected !== false);
  if (activeComps.length) {
    const lines = [
      BROKER_EXTRAS_HEADINGS.marketComps,
      '',
      '| 구분 | 소재지 | 가격 | 토지평당가 | 비고 |',
      '|---|---|---|---|---|',
    ];
    for (const c of activeComps) {
      const price = c.price_eok !== undefined ? `${fmtDecimal(c.price_eok)}억` : '-';
      const land = c.land_price_per_pyeong_manwon !== undefined ? `${fmtWithComma(c.land_price_per_pyeong_manwon)}만원/평` : '-';
      lines.push(`| ${COMP_KIND_LABELS[c.kind]} | ${cell(c.location)} | ${price} | ${land} | ${cell(c.note)} |`);
    }
    blocks.comparables = lines.join('\n');
  }

  if (extras.location_note) {
    blocks.location_access = [BROKER_EXTRAS_HEADINGS.locationNote, '', extras.location_note].join('\n');
  }

  if (extras.post_acquisition_plan?.length) {
    blocks.lease_status = [
      BROKER_EXTRAS_HEADINGS.postAcquisitionPlan,
      '',
      ...extras.post_acquisition_plan.map((p) => `- ${p}`),
    ].join('\n');
  } else if (extras.post_acquisition_units?.length) {
    blocks.lease_status = [
      BROKER_EXTRAS_HEADINGS.postAcquisitionPlan,
      '',
      ...extras.post_acquisition_units.map((u) => {
        const dep = u.deposit_manwon > 0 ? `보증 ${fmtWithComma(u.deposit_manwon)}만 / ` : '';
        return `- ${u.floor} 임대 전환 (${dep}월 ${fmtWithComma(u.rent_manwon)}만)`;
      }),
    ].join('\n');
  }

  return blocks;
}

interface MarkdownSectionLike {
  section_type: string;
  markdown?: string;
}

function appendBlock(sections: MarkdownSectionLike[], sectionType: string, block: string): boolean {
  const target = sections.find((s) => s.section_type === sectionType);
  if (!target) return false;
  const base = typeof target.markdown === 'string' ? target.markdown.trimEnd() : '';
  // 재생성 중복 방지: 같은 제목이 이미 있으면 덧붙이지 않음
  const firstLine = block.split('\n', 1)[0];
  if (base.includes(firstLine)) return true;
  target.markdown = base ? `${base}\n\n${block}` : block;
  return true;
}

/**
 * 생성된 섹션 배열의 기존 섹션에 중개인 입력 블록을 덧붙인다 (in-place).
 * - 새 section_type 은 만들지 않는다 (섹션이 없으면 생략).
 * - 규제·계획: land_detail 우선, 없으면 risk_check.
 * 반환: 실제로 덧붙인 섹션 키 목록.
 */
export function applyBrokerExtrasToSections(sections: MarkdownSectionLike[] | undefined | null, extras?: BrokerExtras | null): string[] {
  const applied: string[] = [];
  if (!sections || !extras) return applied;
  const blocks = buildBrokerExtrasBlocks(extras);
  if (blocks.investment_thesis && appendBlock(sections, 'investment_thesis', blocks.investment_thesis)) applied.push('investment_thesis');
  if (blocks.regulatory) {
    if (appendBlock(sections, 'land_detail', blocks.regulatory)) applied.push('land_detail');
    else if (appendBlock(sections, 'risk_check', blocks.regulatory)) applied.push('risk_check');
  }
  if (blocks.comparables && appendBlock(sections, 'comparables', blocks.comparables)) applied.push('comparables');
  if (blocks.location_access && appendBlock(sections, 'location_access', blocks.location_access)) applied.push('location_access');
  if (blocks.lease_status && appendBlock(sections, 'lease_status', blocks.lease_status)) applied.push('lease_status');
  return applied;
}
