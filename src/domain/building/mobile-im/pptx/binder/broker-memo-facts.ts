/**
 * 중개인 원문 메모(building_ssot_lite.raw_input)에서 "중개인이 직접 명시한" 수치만 결정론적으로 추출한다.
 *
 * 배경 (golden fact oracle, 2026-10):
 *  - 메모 파서(LLM)의 hospitality/development/owner Signals 는 어디에도 저장되지 않고, 바텀시트 폼 입력은
 *    골든 E2E 에서 채워지지 않아 호텔 KPI(객실·ADR·OCC·RevPAR·GOP 마진·운영사), 개발 허가 용적률·토지평당가·
 *    신축 가능 연면적, 사옥 임대료 절감액·손익분기가 PPTX 에 반영되지 않았다.
 *  - 렌더 단계에서 원문 메모를 정규식으로 다시 읽어 "중개인 제시값"을 복원한다. LLM 호출 없음 · 값 창작 없음.
 *
 * 원칙 (Rule 34/37):
 *  - 메모에 명시된 값만 반환한다. 없으면 undefined (호출부가 '-' 또는 행 생략).
 *  - 계산값(RevPAR = ADR × OCC)은 ADR/OCC 가 모두 있을 때만, 중개인 미기재 시에 한해 결정론적으로 파생한다.
 *  - 중개인 제시값은 계산값/가정값보다 우선하며(충돌하는 두 숫자를 동시에 표기하지 않는다), 출처 라벨(BROKER_STATED_TAG)과 함께 표기한다.
 */

/** 중개인 제시값 출처 라벨 (broker-extras-slides.BROKER_SOURCE_TAG 와 동일 문구) */
export const BROKER_STATED_TAG = '● 중개인입력';

export interface HospitalityMemoFacts {
  totalRooms?: number;
  adrKrw?: number;
  occPct?: number;
  revparKrw?: number;
  gopMarginPct?: number;
  annualRevenueKrw?: number;
  annualGopKrw?: number;
  operatorName?: string;
  operatingModel?: 'management_contract' | 'direct' | 'lease';
}

export interface DevelopmentMemoFacts {
  /** 허가(인허가/허용) 용적률 % — 법정 용적률(대장/용도지역)과 별개 */
  maxFarPct?: number;
  /** 중개인 제시 토지평당가 (만원/평) */
  landPricePerPyeongManwon?: number;
  /** 신축 가능/계획 연면적 (평) — 기존(현황) 연면적과 절대 혼용 금지 */
  plannedGfaPyung?: number;
}

export interface OwnerMemoFacts {
  /** 연 임대료 절감액 (억원) */
  annualSavingsBil?: number;
  /** 자가전환 손익분기 (년) */
  breakevenYears?: number;
}

export interface BrokerMemoFacts {
  hospitality: HospitalityMemoFacts;
  development: DevelopmentMemoFacts;
  owner: OwnerMemoFacts;
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;

function toNum(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function pos(n: number | undefined): number | undefined {
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** "95,000원" | "9.5만원" → 원 단위 */
function krwFromMatch(num: string | undefined, man: string | undefined): number | undefined {
  const n = toNum(num);
  if (n === undefined) return undefined;
  const v = man ? n * 10000 : n;
  return Math.round(v);
}

export function parseHospitalityMemoFacts(text: string): HospitalityMemoFacts {
  const out: HospitalityMemoFacts = {};
  if (!text) return out;

  const rooms = text.match(new RegExp(String.raw`(?:총\s*)?객실(?:\s*수)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*실`));
  const roomsN = pos(toNum(rooms?.[1]));
  if (roomsN !== undefined && Number.isInteger(roomsN) && roomsN <= 5000) out.totalRooms = roomsN;

  const adr = text.match(new RegExp(String.raw`ADR\s*[:：]?\s*(?:약\s*)?${NUM}\s*(만)?\s*원`, 'i'));
  const adrV = pos(krwFromMatch(adr?.[1], adr?.[2]));
  if (adrV !== undefined && adrV >= 1000) out.adrKrw = adrV;

  const occ = text.match(new RegExp(String.raw`(?:OCC|점유율|가동률)\s*[:：]?\s*(?:약\s*)?${NUM}\s*%`, 'i'));
  const occV = pos(toNum(occ?.[1]));
  if (occV !== undefined && occV <= 100) out.occPct = occV;

  const rev = text.match(new RegExp(String.raw`RevPAR\s*[:：]?\s*(?:약\s*)?${NUM}\s*(만)?\s*원`, 'i'));
  const revV = pos(krwFromMatch(rev?.[1], rev?.[2]));
  if (revV !== undefined && revV >= 1000) out.revparKrw = revV;

  const gopM = text.match(new RegExp(String.raw`GOP\s*마진(?:율)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*%`, 'i'));
  const gopMV = pos(toNum(gopM?.[1]));
  if (gopMV !== undefined && gopMV <= 100) out.gopMarginPct = gopMV;

  const annRev = text.match(new RegExp(String.raw`연간?\s*총?\s*매출(?:액)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*억`));
  const annRevV = pos(toNum(annRev?.[1]));
  if (annRevV !== undefined) out.annualRevenueKrw = Math.round(annRevV * 1e8);

  const annGop = text.match(new RegExp(String.raw`GOP\s*[:：]?\s*(?:약\s*)?${NUM}\s*억`, 'i'));
  const annGopV = pos(toNum(annGop?.[1]));
  if (annGopV !== undefined) out.annualGopKrw = Math.round(annGopV * 1e8);

  const op = text.match(/운영\s*[:：]\s*([^\n(]*?)\s*(위탁\s*운영|위탁|직영|임대\s*운영)?\s*(?:\(|\n|$)/);
  const opName = op?.[1]?.trim();
  if (opName && opName.length >= 2 && opName.length <= 30) out.operatorName = opName;
  const opModel = op?.[2];
  if (opModel) {
    out.operatingModel = /위탁/.test(opModel) ? 'management_contract' : /직영/.test(opModel) ? 'direct' : 'lease';
  }

  // RevPAR 는 중개인 미기재 + ADR/OCC 모두 기재 시에만 결정론적 파생 (ADR × OCC)
  if (out.revparKrw === undefined && out.adrKrw !== undefined && out.occPct !== undefined) {
    out.revparKrw = Math.round(out.adrKrw * out.occPct / 100);
  }
  return out;
}

export function parseDevelopmentMemoFacts(text: string): DevelopmentMemoFacts {
  const out: DevelopmentMemoFacts = {};
  if (!text) return out;

  const far = text.match(new RegExp(String.raw`(?:허가|허용|인허가|계획)\s*용적률\s*[:：]?\s*(?:약\s*)?${NUM}\s*%`));
  const farV = pos(toNum(far?.[1]));
  if (farV !== undefined && farV <= 3000) out.maxFarPct = farV;

  const lp = text.match(new RegExp(String.raw`토지\s*평당(?:가)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*(억|만\s*원|만)`));
  const lpN = pos(toNum(lp?.[1]));
  if (lpN !== undefined && lp?.[2]) {
    out.landPricePerPyeongManwon = Math.round(lp[2] === '억' ? lpN * 10000 : lpN);
  }

  const gfa = text.match(new RegExp(String.raw`(?:신축|계획|예정|개발)\s*(?:가능\s*)?연면적\s*[:：]?\s*(?:약\s*)?${NUM}\s*평`));
  const gfaV = pos(toNum(gfa?.[1]));
  if (gfaV !== undefined) out.plannedGfaPyung = gfaV;
  return out;
}

export function parseOwnerMemoFacts(text: string): OwnerMemoFacts {
  const out: OwnerMemoFacts = {};
  if (!text) return out;

  const sav = text.match(new RegExp(String.raw`(?:연간?\s*)?임대료\s*절감(?:액)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*억`));
  const savV = pos(toNum(sav?.[1]));
  if (savV !== undefined) out.annualSavingsBil = savV;

  const be = text.match(new RegExp(String.raw`손익\s*분기(?:점)?\s*[:：]?\s*(?:약\s*)?${NUM}\s*년`));
  const beV = pos(toNum(be?.[1]));
  if (beV !== undefined) out.breakevenYears = beV;
  return out;
}

export function parseBrokerMemoFacts(text: string | null | undefined): BrokerMemoFacts {
  const t = typeof text === 'string' ? text : '';
  return {
    hospitality: parseHospitalityMemoFacts(t),
    development: parseDevelopmentMemoFacts(t),
    owner: parseOwnerMemoFacts(t),
  };
}

/** 건물 제원(층수·준공연도) 메모 명시값 — 개요 슬라이드 폴백 전용 (대장·SSoT 모두 비어 있을 때만 사용) */
export interface BuildingSpecMemoFacts {
  floorsAbove?: number;
  floorsBelow?: number;
  completionYear?: number;
}

/**
 * '지하 2층 ~ 지상 12층' / 'B1~5F' / '준공 2016년' / '2018년 신축' 같은 현황 표기만 추출.
 * 신축·계획·개발 맥락의 층수(계획 규모)와 연도는 현황이 아니므로 단독 표기는 해당 문맥 줄에서 제외 (Rule 34).
 */
export function parseBuildingSpecMemoFacts(text: string | null | undefined): BuildingSpecMemoFacts {
  const out: BuildingSpecMemoFacts = {};
  const t = typeof text === 'string' ? text : '';
  const PLAN_CTX = /(신축\s*(?:후|가능|예정|계획)|계획|개발|증축|목표|예정|가능)/;
  const nowYear = new Date().getFullYear();
  for (const line of t.split(/\r?\n/)) {
    const range = line.match(/지하\s*(\d{1,2})\s*층\s*[~\-–—]\s*지상\s*(\d{1,3})\s*층/);
    const bf = line.match(/\bB\s*(\d{1,2})\s*[~\-–—]\s*(\d{1,3})\s*F\b/i);
    if (out.floorsAbove === undefined) {
      if (range) { out.floorsBelow = Number(range[1]); out.floorsAbove = Number(range[2]); }
      else if (bf) { out.floorsBelow = Number(bf[1]); out.floorsAbove = Number(bf[2]); }
      else if (!PLAN_CTX.test(line)) {
        const up = line.match(/지상\s*(\d{1,3})\s*층/);
        const down = line.match(/지하\s*(\d{1,2})\s*층/);
        if (up) out.floorsAbove = Number(up[1]);
        if (up && down) out.floorsBelow = Number(down[1]);
      }
    }
    if (out.completionYear === undefined) {
      const y1 = line.match(/(?:준공|사용승인)\s*(?:연도|년도|일)?\s*[:：]?\s*((?:19|20)\d{2})\s*(?:년|\.|-|\/)?/);
      const y2 = line.match(/((?:19|20)\d{2})\s*년\s*(?:준공|신축|사용승인)(?!\s*(?:후|가능|예정|계획))/);
      const y = Number((y1 ?? y2)?.[1]);
      if (Number.isFinite(y) && y >= 1900 && y <= nowYear) out.completionYear = y;
    }
  }
  return out;
}

/** 원문 메모 텍스트 위치: building 행 raw_input (라우트: select('*')) → body 사본 폴백 */
export function brokerMemoTextOf(body: Record<string, any> | undefined | null, building?: any): string {
  const cands = [building?.raw_input, building?.rawInput, body?.raw_input, body?.rawInput, body?.ssot_summary?.raw_input];
  for (const c of cands) if (typeof c === 'string' && c.trim()) return c;
  return '';
}

export function resolveBrokerMemoFacts(body: Record<string, any> | undefined | null, building?: any): BrokerMemoFacts {
  return parseBrokerMemoFacts(brokerMemoTextOf(body, building));
}

/**
 * 호텔/운영형 KPI 해석: 구조화 입력(body.hotel_operating | body.supplemental.hotel_operating = 바텀시트)이
 * 있으면 그 값이 우선, 비어 있는 키만 원문 메모에서 복원. 반환 키는 HotelOperatingInput(snake_case) 규약.
 */
export function resolveHotelOperating(body: Record<string, any> | undefined | null, building?: any): Record<string, any> {
  const structured = (body?.hotel_operating || body?.supplemental?.hotel_operating || {}) as Record<string, any>;
  const memo = resolveBrokerMemoFacts(body, building).hospitality;
  const merged: Record<string, any> = { ...structured };
  const fill = (key: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    const cur = merged[key];
    if (cur === undefined || cur === null || cur === '' || cur === 0) merged[key] = v;
  };
  fill('total_rooms', memo.totalRooms);
  fill('adr_krw', memo.adrKrw);
  fill('occupancy_rate_pct', memo.occPct);
  fill('gop_margin_pct', memo.gopMarginPct);
  fill('annual_revenue_krw', memo.annualRevenueKrw);
  fill('annual_gop_krw', memo.annualGopKrw);
  fill('operator_name', memo.operatorName);
  fill('operating_model', memo.operatingModel);
  fill('revpar_krw', memo.revparKrw);
  // 구조화 ADR/OCC 만 있고 RevPAR 가 없으면 결정론적 파생 (ADR × OCC)
  if (!(Number(merged.revpar_krw) > 0) && Number(merged.adr_krw) > 0 && Number(merged.occupancy_rate_pct) > 0) {
    merged.revpar_krw = Math.round(Number(merged.adr_krw) * Number(merged.occupancy_rate_pct) / 100);
  }
  return merged;
}
