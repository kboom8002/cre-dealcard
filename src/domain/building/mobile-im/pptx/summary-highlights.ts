/**
 * Basic IM 요약 슬라이드 — 실데이터 기반 "3대 핵심 투자 포인트" / 리드 문장 / 자산 하이라이트 합성기
 *
 * 배경 (2026-10-05 사용자 피드백):
 *   - 요약 슬라이드의 투자 포인트가 premium-template-engine 의 고정 템플릿 문구
 *     ("자산 가치 완충 여력 확보: … 핵심 입지 및 교통 인프라 기반의 자산 가치가 형성되어 있습니다." 등)로 채워져
 *     문장이 부자연스럽고, 리드 문장 == 포인트 01 로 중복되며, 포인트 03 이 '...' 로 잘렸다.
 *   - 근본 원인: AI investment_thesis 초안이 품질 게이트 LLM 타임아웃(fail-closed)으로 폐기되고 템플릿으로 대체됨.
 *
 * 원칙:
 *   - Rule 34: 입력 데이터에 없는 수치·명칭은 절대 생성하지 않는다 (데이터가 없으면 해당 포인트를 만들지 않음).
 *   - Rule 4: 리드 문장과 포인트, 포인트 상호 간 중복 금지.
 *   - 투자 보장/단정 표현("유력", "확실", "안정적 현금흐름 보장" 등) 금지 — 사실 서술형.
 *   - 순수 함수 (LLM 호출 없음) → LLM record/replay 무영향, 결정론적.
 */

import { parseStationName } from './binder/station-name';
import { normalizeBuildingRegister } from '@/lib/external/building-register-normalize';
import { isNonLeasableLeaseRow, resolveLeaseOccupancy, summarizeLeaseOccupancy } from '../lease-vacancy';
import { verifiedLegalLimits, verifiedLegalLimitsFromSsot } from './binder/legal-limits';
import { resolveDisplayAreas } from './binder/display-areas';

export interface SummaryLeaseFacts {
  /** 임대 대상 호실 수 (비임대 공용·설비 행 제외, 자가사용 포함) */
  totalUnits: number;
  /** 임대중 호실 수 (공실·자가사용 제외) */
  leasedUnits: number;
  /** 자가사용 호실 수 */
  ownerUseUnits?: number;
  vacantFloors: string[];
  monthlyRentManwon?: number;
  depositManwon?: number;
  /** 바텀시트 합계 ↔ 렌트롤 합계 불일치 시 경고 (렌더 warnings 용) */
  reconcileWarning?: string;
}

export interface SummaryFacts {
  posture?: string;
  assetType?: string;
  areaSignal?: string;
  stationName?: string;   // '선유도역'
  stationLine?: string;   // '9호선'
  stationWalkMin?: number;
  stationDistanceM?: number;
  roadCondition?: string; // '광대세각'
  zoning?: string;
  completionYear?: number;
  floorsAbove?: number;
  floorsBelow?: number;
  gfaSqm?: number;
  landSqm?: number;
  parcelCount?: number;
  farPct?: number;
  maxFarPct?: number;
  lease?: SummaryLeaseFacts;
  landPriceCagrPct?: number;
  landPriceYears?: number;
}

export interface SummaryHighlights {
  lead: string;
  points: string[];
  /** 물건 개요 슬라이드 '자산 하이라이트' 박스용 짧은 문구 (≤ 약 32자) */
  shortHighlights: string[];
}

// ─── 템플릿/상투 문구 탐지 ───────────────────────────────────────────────────
// premium-template-engine 의 investment_thesis 폴백 및 a04/a02 레거시 폴백에서 나오는 고정 문구.
const BOILERPLATE_PATTERNS: RegExp[] = [
  /핵심\s*입지\s*및\s*교통\s*인프라\s*기반의\s*자산\s*가치가\s*형성/,
  /현행\s*임대차\s*현황\s*및\s*공실률\s*기반/,
  /현행\s*공법\s*여력을\s*활용한/,
  /시세차익\s*실현이\s*유력/,
  /자산\s*가치\s*완충\s*여력\s*확보/,
  /자본\s*이득이\s*유력/,
  /자가\s*소유\s*전환\s*시\s*연간\s*임대\s*비용\s*절감/,
  /잔여\s*용적률\s*활용\s*및\s*신축\s*개발을\s*통한\s*사업\s*수익\s*실현이\s*가능/,
  /분양\s*또는\s*통\s*매각을\s*통한\s*자본\s*회수\s*시나리오/,
  /직영\s*운영을\s*통한\s*영업이익\(GOP\)\s*기반의\s*실질\s*수익\s*창출/,
  /오퍼레이션\s*효율화\s*및\s*브랜드\s*가치\s*제고/,
  /단기\s*보유\s*후\s*리밸런싱을\s*통한/,
  /인근\s*시세\s*대비\s*합리적\s*매입가\s*확보\s*시/,
  /핵심\s*입지\s*자산$/,
  /안정적\s*임대수익\s*기반\s*투자\s*매물/,
  /대중교통\s*역세권\s*접근성\s*및\s*주변\s*상업\s*인프라\s*우수/,
];

export function isBoilerplateHighlight(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  return BOILERPLATE_PATTERNS.some(re => re.test(t));
}

/** 비교용 정규화 — 공백·구두점·마크다운 제거 */
function norm(s: string): string {
  return String(s || '').replace(/\*\*/g, '').replace(/[\s.,·:：\-—()（）"'“”]/g, '').toLowerCase();
}

/** 두 문장이 사실상 같은지 (한쪽이 다른 쪽을 포함하거나 앞 24자가 동일) */
export function isNearDuplicate(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 12 && nb.includes(na)) return true;
  if (nb.length >= 12 && na.includes(nb)) return true;
  const k = Math.min(24, na.length, nb.length);
  return k >= 16 && na.slice(0, k) === nb.slice(0, k);
}

// ─── 포맷 헬퍼 ───────────────────────────────────────────────────────────────
const fmtInt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const fmtArea1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

/** 만원 → '5억 3,700만 원' / '5,147만 원' */
export function formatManwonKo(manwon: number): string {
  const v = Math.round(manwon);
  if (!Number.isFinite(v) || v <= 0) return '';
  const eok = Math.floor(v / 10000);
  const rest = v % 10000;
  if (eok > 0 && rest > 0) return `${eok}억 ${rest.toLocaleString('ko-KR')}만 원`;
  if (eok > 0) return `${eok}억 원`;
  return `${rest.toLocaleString('ko-KR')}만 원`;
}

function stationLabel(f: SummaryFacts): string {
  if (!f.stationName) return '';
  return f.stationLine ? `${f.stationName}(${f.stationLine})` : f.stationName;
}

function floorsLabel(f: SummaryFacts): string {
  const a = f.floorsAbove && f.floorsAbove > 0 ? f.floorsAbove : 0;
  const b = f.floorsBelow && f.floorsBelow > 0 ? f.floorsBelow : 0;
  if (a && b) return `지하 ${b}층·지상 ${a}층`;
  if (a) return `지상 ${a}층`;
  return '';
}

/**
 * '선유도역 9호선' / '선유도역(9호선)' / '선유도' → { name: '선유도역', line: '9호선' }
 * '동대문역사문화공원역 5호선' → { name: '동대문역사문화공원역', line: '5호선' }
 * 다중 노선('(2·4·5호선)')은 line = '2호선·4호선·5호선'.
 */
export function parseStation(raw: string | undefined | null, line?: string | null): { name?: string; line?: string } {
  const parsed = parseStationName(raw);
  if (!parsed.name) return {};
  let ln = parsed.lines.join('·');
  if (!ln && line) {
    const fromParam = parseStationName(`${parsed.name} ${String(line)}`).lines.join('·');
    ln = fromParam || String(line).trim();
  }
  return { name: parsed.name, line: ln || undefined };
}

// ─── 포인트 생성기 (데이터 없으면 null) ─────────────────────────────────────
function pointLocation(f: SummaryFacts): string | null {
  const st = stationLabel(f);
  if (!st) return null;
  const walk = f.stationWalkMin && f.stationWalkMin > 0 ? ` 도보 ${Math.round(f.stationWalkMin)}분` : '';
  const dist = f.stationDistanceM && f.stationDistanceM > 0 ? `(약 ${fmtInt(f.stationDistanceM)}m)` : '';
  const road = f.roadCondition ? `, ${f.roadCondition} 도로에 접해 있습니다` : '에 위치합니다';
  return `역세권 입지 — ${st}${walk}${dist} 거리${road}.`;
}

function pointLease(f: SummaryFacts): string | null {
  const l = f.lease;
  if (!l || l.totalUnits <= 0) return null;
  const rent = l.monthlyRentManwon && l.monthlyRentManwon > 0 ? formatManwonKo(l.monthlyRentManwon) : '';
  const dep = l.depositManwon && l.depositManwon > 0 ? formatManwonKo(l.depositManwon) : '';
  const owner = l.ownerUseUnits && l.ownerUseUnits > 0 ? l.ownerUseUnits : 0;
  const vacantCount = Math.max(0, l.totalUnits - l.leasedUnits - owner);
  let occ: string;
  if (vacantCount === 0 && owner === 0) occ = `전 ${l.totalUnits}개 호실 임차 중`;
  else if (l.leasedUnits <= 0 && owner === 0) occ = `${l.totalUnits}개 호실 전체 공실`;
  else if (l.leasedUnits <= 0 && vacantCount === 0) occ = `${l.totalUnits}개 호실 전체 자가사용`;
  else {
    const parts: string[] = [];
    if (vacantCount > 0) parts.push(l.vacantFloors.length > 0 && l.vacantFloors.length <= 3 ? `공실 ${l.vacantFloors.join('·')}` : `공실 ${vacantCount}`);
    if (owner > 0) parts.push(`자가사용 ${owner}`);
    occ = `${l.totalUnits}개 호실 중 ${l.leasedUnits}개 임차 중${parts.length ? `(${parts.join('·')})` : ''}`;
  }
  const money = rent && dep ? `, 월 임대료 ${rent}·보증금 ${dep}` : rent ? `, 월 임대료 ${rent}` : dep ? `, 보증금 ${dep}` : '';
  if (l.leasedUnits <= 0) return `임대 현황 — ${occ}으로, 임대 구성에 따라 수익 구조를 설계할 수 있습니다.`;
  return `임대 현황 — ${occ}${money}의 임대 수익이 발생하고 있습니다.`;
}

function pointLand(f: SummaryFacts): string | null {
  const land = f.landSqm && f.landSqm > 0 ? f.landSqm : 0;
  const cagr = f.landPriceCagrPct != null && Number.isFinite(f.landPriceCagrPct) ? f.landPriceCagrPct : undefined;
  if (!land && cagr == null) return null;
  const parcel = f.parcelCount && f.parcelCount > 1 ? `${f.parcelCount}필지 통합 ` : '';
  const zone = f.zoning ? `${f.zoning} ` : '';
  const landPart = land ? `${zone}${parcel}대지 ${fmtArea1(land)}㎡` : '';
  if (cagr != null && cagr > 0) {
    const yrs = f.landPriceYears && f.landPriceYears >= 2 ? `최근 ${f.landPriceYears}년간 ` : '';
    return landPart
      ? `토지 가치 — ${landPart}로, 개별공시지가가 ${yrs}연평균 ${cagr}% 상승했습니다.`
      : `토지 가치 — 개별공시지가가 ${yrs}연평균 ${cagr}% 상승했습니다.`;
  }
  if (!landPart) return null;
  return `토지 — ${landPart} 규모입니다.`;
}

function pointFar(f: SummaryFacts): string | null {
  if (!(f.farPct && f.farPct > 0 && f.maxFarPct && f.maxFarPct > 0)) return null;
  const gap = f.maxFarPct - f.farPct;
  if (gap <= 5) return null;
  return `용적률 여유 — 현 용적률 ${fmtArea1(f.farPct)}%로, ${f.zoning ? `${f.zoning} ` : ''}법정 상한 ${fmtArea1(f.maxFarPct)}% 대비 ${fmtArea1(gap)}%p 여유가 있습니다.`;
}

function pointSpace(f: SummaryFacts): string | null {
  const fl = floorsLabel(f);
  const gfa = f.gfaSqm && f.gfaSqm > 0 ? `연면적 ${fmtArea1(f.gfaSqm)}㎡` : '';
  if (!fl && !gfa) return null;
  const yr = f.completionYear ? `${f.completionYear}년 준공 ` : '';
  const body = [fl, gfa].filter(Boolean).join(', ');
  return `사옥 공간 — ${yr}${body} 규모로 단독 사옥 사용이 가능한 공간 구성입니다.`;
}

// ─── 리드 문장 ───────────────────────────────────────────────────────────────
function buildLead(f: SummaryFacts): string {
  const where = f.areaSignal ? `${f.areaSignal}${f.zoning ? ` ${f.zoning}` : ''}에 위치한 ` : (f.zoning ? `${f.zoning}에 위치한 ` : '');
  const yr = f.completionYear ? `${f.completionYear}년 준공` : '';
  const fl = floorsLabel(f);
  const spec = [yr, fl ? `${fl} 규모의` : ''].filter(Boolean).join(', ');
  const kind = (() => {
    const at = f.assetType || '빌딩';
    switch (f.posture) {
      case 'owner_occupied': return `사옥용 ${at}`;
      case 'development': return `개발 검토용 ${at}`;
      case 'operating': return `운영형 ${at}`;
      case 'trading': return at;
      default: return `임대수익형 ${at}`;
    }
  })();
  if (!where && !spec) return '';
  return `${where}${spec ? `${spec} ` : ''}${kind}입니다.`.replace(/\s+/g, ' ').trim();
}

// ─── 짧은 하이라이트 (물건 개요 박스) ───────────────────────────────────────
function buildShortHighlights(f: SummaryFacts): string[] {
  const out: string[] = [];
  const st = stationLabel(f);
  if (st) {
    const walk = f.stationWalkMin && f.stationWalkMin > 0 ? ` 도보 ${Math.round(f.stationWalkMin)}분` : '';
    out.push(`${st}${walk} 역세권${f.roadCondition ? ` · ${f.roadCondition} 접면` : ''}`);
  }
  const l = f.lease;
  if (l && l.totalUnits > 0 && f.posture !== 'owner_occupied' && f.posture !== 'development') {
    // 임차율 분모 = 임대 가능 호실(자가사용 제외). 자가사용은 별도 표기 (분모 혼용 금지)
    const owner = l.ownerUseUnits && l.ownerUseUnits > 0 ? l.ownerUseUnits : 0;
    const leasable = l.totalUnits - owner;
    const rent = l.monthlyRentManwon && l.monthlyRentManwon > 0 ? ` · 월 임대료 ${formatManwonKo(l.monthlyRentManwon)}` : '';
    if (leasable > 0) {
      const rate = Math.round((l.leasedUnits / leasable) * 1000) / 10;
      out.push(`임차 ${l.leasedUnits}/${leasable}개 호실(${rate}%)${owner ? ` · 자가사용 ${owner}` : ''}${rent}`);
    }
  }
  if (f.landSqm && f.landSqm > 0) {
    const parcel = f.parcelCount && f.parcelCount > 1 ? `${f.parcelCount}필지 통합 ` : '';
    out.push(`${parcel}대지 ${fmtArea1(f.landSqm)}㎡${f.zoning ? ` · ${f.zoning}` : ''}`);
  }
  if (out.length < 3 && f.landPriceCagrPct != null && f.landPriceCagrPct > 0) {
    out.push(`개별공시지가 연평균 ${f.landPriceCagrPct}% 상승`);
  }
  if (out.length < 3 && f.completionYear) {
    const fl = floorsLabel(f);
    out.push(`${f.completionYear}년 준공${fl ? ` · ${fl}` : ''}`);
  }
  return out.slice(0, 3);
}

/**
 * 실데이터 기반 요약 하이라이트 합성.
 * @param facts 검증된 사실 데이터
 * @param aiPoints (선택) AI/섹션 bullet — 템플릿·중복이 아니면 데이터 포인트가 3개 미만일 때 보충용
 */
export function buildSummaryHighlights(facts: SummaryFacts, aiPoints: string[] = []): SummaryHighlights {
  const order: Array<(f: SummaryFacts) => string | null> = (() => {
    switch (facts.posture) {
      case 'owner_occupied': return [pointLocation, pointSpace, pointLand, pointFar];
      case 'development': return [pointLand, pointFar, pointLocation, pointLease];
      case 'operating': return [pointLocation, pointLease, pointLand, pointSpace];
      case 'trading': return [pointLocation, pointLand, pointLease, pointFar];
      default: return [pointLocation, pointLease, pointLand, pointFar];
    }
  })();

  const lead = buildLead(facts);
  const points: string[] = [];
  const pushUnique = (p: string | null | undefined) => {
    if (!p) return;
    const t = p.trim();
    if (!t || isBoilerplateHighlight(t)) return;
    if (lead && isNearDuplicate(lead, t)) return;
    if (points.some(x => isNearDuplicate(x, t))) return;
    points.push(t);
  };
  for (const gen of order) {
    if (points.length >= 3) break;
    pushUnique(gen(facts));
  }
  for (const ai of aiPoints) {
    if (points.length >= 3) break;
    pushUnique(String(ai || '').replace(/\*\*/g, '').replace(/^[-•·\d.)\s]+/, ''));
  }

  return { lead, points, shortHighlights: buildShortHighlights(facts) };
}

// ─── doc.body → SummaryFacts 추출 (순수) ────────────────────────────────────
const num = (v: unknown): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};
const pos = (v: unknown): number | undefined => {
  const n = num(v);
  return n != null && n > 0 ? n : undefined;
};

export function extractLeaseFacts(leases: unknown, ssot?: Record<string, any>): SummaryLeaseFacts | undefined {
  if (!Array.isArray(leases) || leases.length === 0) return undefined;
  const rows = (leases as Record<string, any>[]).filter(Boolean);
  if (rows.length === 0) return undefined;
  // 점유 SSOT — 자가사용은 임차로 세지 않고, 비임대(기계실·주차장 등) 행은 호실 수에서 제외
  const occ = summarizeLeaseOccupancy(rows);
  // 금액: 렌트롤 임대중 행 합 (A24 합계 행과 같은 모집단 — 공실·자가사용·비임대 제외)
  const incomeRows = rows.filter(r => !isNonLeasableLeaseRow(r) && resolveLeaseOccupancy(r) === '임대중');
  const sumRent = incomeRows.reduce((a, r) => a + (num(r.rent_manwon ?? r.monthly_rent_manwon) ?? 0), 0);
  const sumDep = incomeRows.reduce((a, r) => a + (num(r.deposit_manwon) ?? 0), 0);
  const ssotRentKrw = pos(ssot?.monthly_rent_total_krw);
  const ssotRent = ssotRentKrw ? Math.round(ssotRentKrw / 10000) : undefined;
  const ssotDep = pos(ssot?.total_deposit_manwon);
  // 렌트롤에 금액이 있으면 렌트롤이 SSOT. 바텀시트 합계는 렌트롤 금액이 비었을 때만 폴백.
  const monthlyRentManwon = sumRent > 0 ? sumRent : ssotRent;
  const depositManwon = sumRent > 0 ? (sumDep > 0 ? sumDep : undefined) : (ssotDep ?? (sumDep > 0 ? sumDep : undefined));
  const diff = (a?: number, b?: number) => (a && b ? Math.abs(a - b) / b : 0);
  const reconcileWarning = sumRent > 0 && (diff(ssotRent, sumRent) > 0.005 || diff(ssotDep, sumDep) > 0.005)
    ? `바텀시트 합계(월 ${ssotRent ?? '-'}만·보증금 ${ssotDep ?? '-'}만)와 렌트롤 합계(월 ${sumRent}만·보증금 ${sumDep}만)가 달라 렌트롤 기준으로 표기`
    : undefined;
  return {
    totalUnits: occ.total,
    leasedUnits: occ.leased,
    ownerUseUnits: occ.ownerUse,
    vacantFloors: occ.vacantFloors,
    monthlyRentManwon,
    depositManwon,
    ...(reconcileWarning ? { reconcileWarning } : {}),
  };
}

export interface ExtractFactsInput {
  posture?: string;
  body?: Record<string, any>;
  building?: Record<string, any>;
  enrichment?: Record<string, any>;
  /** IMCore (있으면 physical 제원 보조 소스) */
  core?: Record<string, any> | null;
  /** 같은 덱 물건 개요 표의 [라벨, 값] 행 — 위 소스에 없을 때만 층수/용도지역 보조 파싱 */
  specRows?: Array<[string, string]>;
}

function fromSpecRows(rows: Array<[string, string]> | undefined) {
  const out: { above?: number; below?: number; zoning?: string } = {};
  for (const r of rows ?? []) {
    const k = String(r?.[0] ?? '').replace(/\s+/g, '');
    const v = String(r?.[1] ?? '');
    if (/층수|건축규모/.test(k)) {
      const a = v.match(/지상\s*(\d+)\s*층/);
      const b = v.match(/지하\s*(\d+)\s*층/);
      if (a) out.above = parseInt(a[1], 10);
      if (b) out.below = parseInt(b[1], 10);
    } else if (/용도지역|지역\/지구/.test(k) && v.trim() && v.trim() !== '-') {
      out.zoning = v.trim();
    }
  }
  return out;
}

export function extractSummaryFacts(input: ExtractFactsInput): SummaryFacts {
  const body = input.body ?? {};
  const ssot: Record<string, any> = body.ssot_summary ?? {};
  const hero: Record<string, any> = body.heroCard ?? {};
  const bldg: Record<string, any> = input.building ?? {};
  const enr: Record<string, any> = input.enrichment ?? body.enrichment ?? {};
  const br: Record<string, any> = enr.buildingRegister ?? {};
  const nbr = normalizeBuildingRegister(br); // 대장 키 별칭 단일 흡수 (grndFlrCnt/farPct/… → canonical)
  const lup: Record<string, any> = enr.landUsePlan ?? body.enrichment?.landUsePlan ?? {};
  const phys: Record<string, any> = input.core?.physical ?? {};
  const poi = enr.locationPoi ?? body.external_data?.locationPoi;
  const nearest = poi && !poi._isFallback ? poi.nearestStation : undefined;

  const st = parseStation(nearest?.name ?? ssot.station_name, nearest?.line ?? nearest?.lineName);
  const yrRaw = ssot.completion_year ?? hero.completionYear ?? bldg.built_year ?? phys.completionYear ?? nbr.useAprDay;
  const yr = yrRaw ? parseInt(String(yrRaw).slice(0, 4), 10) : NaN;
  const lph = enr.landPriceHistory ?? body.enrichment?.landPriceHistory;
  const parcels = Array.isArray(body.parcels) ? body.parcels : [];
  const str = (v: unknown): string | undefined => {
    const s = v == null ? '' : String(v).trim();
    return s && s !== '-' ? s : undefined;
  };
  const spec = fromSpecRows(input.specRows);
  const areas = resolveDisplayAreas({
    brokerLandSqm: pos(ssot.land_area_sqm ?? hero.landAreaM2 ?? bldg.land_area_sqm),
    brokerGfaSqm: pos(ssot.total_gross_area_sqm ?? hero.totalGrossAreaSqm ?? bldg.total_area_sqm),
    register: br,
  });

  return {
    posture: input.posture,
    assetType: ssot.asset_type ?? bldg.asset_type ?? hero.assetType,
    areaSignal: bldg.area_signal ?? ssot.area_signal ?? hero.areaSignal,
    stationName: st.name,
    stationLine: st.line,
    stationWalkMin: pos(nearest?.walkMinutes ?? ssot.station_walk_min),
    stationDistanceM: pos(nearest?.distanceM),
    roadCondition: str(ssot.road_condition) ?? str(bldg.road_condition) ?? str(lup.roadAccess) ?? str(phys.roadAccess),
    zoning: str(ssot.zoning) ?? str(ssot.zone_type) ?? str(lup.zoningDistrict) ?? str(phys.zoning) ?? str(br.useZone) ?? str(bldg.use_zone) ?? spec.zoning,
    completionYear: Number.isFinite(yr) && yr > 1900 ? yr : undefined,
    floorsAbove: pos(ssot.floors_above ?? hero.floorsAbove ?? bldg.floors_above ?? phys.floorsAbove ?? nbr.floorsAbove ?? spec.above),
    floorsBelow: pos(ssot.floors_below ?? hero.floorsBelow ?? bldg.floors_below ?? phys.floorsBelow ?? nbr.floorsBelow ?? spec.below),
    gfaSqm: areas.gfaSqm,
    landSqm: areas.landSqm,
    parcelCount: pos(ssot.parcel_count) ?? (parcels.length > 0 ? parcels.length : undefined),
    farPct: pos(ssot.far_pct ?? nbr.vlRat),
    maxFarPct: verifiedLegalLimitsFromSsot(ssot).farMax ?? verifiedLegalLimits(lup).farMax,
    lease: input.posture === 'owner_occupied' ? undefined : extractLeaseFacts(body.floor_leases, ssot),
    landPriceCagrPct: num(lph?.cagrPct),
    landPriceYears: Array.isArray(lph?.history) ? lph.history.length : undefined,
  };
}
