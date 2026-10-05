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
}

export interface BrokerExtras {
  investment_points?: string[];
  closing_line?: string;
  regulatory_notes?: BrokerRegulatoryNote[];
  market_comps?: BrokerMarketComp[];
  location_note?: string;
  post_acquisition_plan?: string[];
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
  marketCompsMax: 6,
  compLocationChars: 40,
  compNoteChars: 40,
  locationNoteChars: 200,
  postAcquisitionPlanMax: 3,
  postAcquisitionPlanChars: 80,
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
    if (!location && !note && price === undefined && landPrice === undefined) return; // 빈 행
    if (!location) throw new ExtrasError(`${PREFIX} — ${label} 소재지를 입력해주세요.`);
    if (price === undefined && landPrice === undefined) {
      throw new ExtrasError(`${PREFIX} — ${label} 가격(억) 또는 토지평당가(만원) 중 하나는 입력해주세요.`);
    }
    const comp: BrokerMarketComp = { kind: kindRaw, location: checkMax(location, L.compLocationChars, `${label} 소재지`) };
    if (price !== undefined) comp.price_eok = price;
    if (landPrice !== undefined) comp.land_price_per_pyeong_manwon = landPrice;
    if (note) comp.note = checkMax(note, L.compNoteChars, `${label} 비고`);
    out.push(comp);
  });
  if (out.length === 0) return undefined;
  if (out.length > L.marketCompsMax) {
    throw new ExtrasError(`${PREFIX} — 인근 시세 비교는 최대 ${L.marketCompsMax}행까지 입력할 수 있습니다.`);
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
    (x.post_acquisition_plan?.length ?? 0)
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
    }));
  }
  if (x.location_note) out.location_note = fn(x.location_note);
  if (x.post_acquisition_plan) out.post_acquisition_plan = x.post_acquisition_plan.map(fn);
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

function formNum(s: string): number | undefined {
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

  if (extras.market_comps?.length) {
    const lines = [
      BROKER_EXTRAS_HEADINGS.marketComps,
      '',
      '| 구분 | 소재지 | 가격 | 토지평당가 | 비고 |',
      '|---|---|---|---|---|',
    ];
    for (const c of extras.market_comps) {
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
