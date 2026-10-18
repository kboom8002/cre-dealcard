/**
 * Basic IM 요약 슬라이드 — 실데이터 기반 "3대 핵심 투자 포인트" / 리드 문장 / 자산 하이라이트 합성기
 *
 * 배경 (2026-10-05 사용자 피드백 & R3 고도화):
 *   - 요약 슬라이드의 투자 포인트가 고정 템플릿 문구로 채워지거나 물건 개요·입지 슬라이드의
 *     단순 제원(역 거리·대지면적·호실수)을 그대로 반복하는 문제를 해결.
 *   - 3대 핵심 투자 포인트를 투자 판단 가치 중심의 3축으로 고도화:
 *     ① 우량 임차인·장기 재계약 안정성 (pointTenantQuality → 폴백 pointLease)
 *     ② 인근 시세 대비 가격 경쟁력 + 공시지가 추세 (pointPriceVsComps → 폴백 pointLand)
 *     ③ 매입 후 자가사용/공실 임대 전환 업사이드 (pointUpside → 폴백 pointFar)
 *   - 역세권·용도지역·준공연도·건축규모·포스처는 리드 문장(buildLeadSentence)에 압축 통합.
 *
 * 원칙:
 *   - Rule 34: 입력 데이터에 없는 수치·명칭은 절대 생성하지 않는다 (데이터가 없으면 해당 포인트를 만들지 않음).
 *   - Rule 4: 리드 문장과 포인트, 포인트 상호 간 중복 금지.
 *   - Rule 77: 상가건물 임대차보호법 비공식 숫자 한도 언급 금지.
 *   - 투자 보장/단정 표현("유력", "확실", "보장", "확정", "최고" 등) 금지 — 사실 서술형.
 *   - 순수 함수 (LLM 호출 없음) → LLM record/replay 무영향, 결정론적.
 */

import { parseStationName } from './binder/station-name';
import { formatLinesLabel, resolveMergedStations } from './station-lines';
import { normalizeBuildingRegister } from '@/lib/external/building-register-normalize';
import { isNonLeasableLeaseRow, resolveLeaseOccupancy, summarizeLeaseOccupancy } from '../lease-vacancy';
import { verifiedLegalLimits, verifiedLegalLimitsFromSsot } from './binder/legal-limits';
import { resolveDisplayAreas } from './binder/display-areas';
import { buildYieldSetFromBody } from '../yield-set';

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

export interface SummaryTenantQualityFacts {
  anchorNames: string[];
  anchorCategoryLabel: string;
  rentSharePct: number;
  anchorRentManwon: number;
  maxTenureYears?: number;
  hasBrokerTenureNote?: boolean;
}

export interface SummaryPriceVsCompsFacts {
  subjectLandPerPyeongManwon: number;
  compsAvgManwon: number;
  compsKindLabel: '인근 매물 평균' | '인근 실거래 평균';
  discountPct: number;
  hasBrokerComps: boolean;
}

export interface SummaryUpsideFacts {
  currentYieldPct: number;
  stabilizedYieldPct: number;
  diffPctP: number;
  targetFloorsLabel?: string;
  kind: 'broker_plan' | 'target_rent' | 'market_rent';
  hasBrokerInput: boolean;
}

export interface SummaryFacts {
  posture?: string;
  assetType?: string;
  areaSignal?: string;
  stationName?: string;   // '당산역'
  stationLine?: string;   // '2·9호선' 또는 '9호선'
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
  tenantQuality?: SummaryTenantQualityFacts;
  priceVsComps?: SummaryPriceVsCompsFacts;
  upside?: SummaryUpsideFacts;
  currentYieldPct?: number;
  stabilizedYieldPct?: number;
  brokerInvestmentPoints?: string[];
  devTargetScalePyeong?: number;
  devMaxFarPct?: number;
  devUse?: string;
}

export interface SummaryHighlights {
  lead: string;
  points: string[];
  /** 물건 개요 슬라이드 '자산 하이라이트' 박스용 짧은 문구 (≤ 약 32자) */
  shortHighlights: string[];
  /** 중개인 입력 데이터(시세 비교·경과연수·전환 계획·투자포인트)가 반영되었는지 여부 */
  hasBrokerInput?: boolean;
  /** 수치 충돌 등으로 제외된 중개인 입력 경고 목록 */
  warnings?: string[];
}

// ─── 템플릿/상투 문구 탐지 ───────────────────────────────────────────────────
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

const FORBIDDEN_GUARANTEE_RE = /보장|확정|최고|유력|확실/;
const RULE77_FORBIDDEN_RE = /법정\s*(?:상한\s*|한도\s*)?\d+(?:\.\d+)?\s*%/g;

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
const fmtPct2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

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
  if (!f.stationLine) return f.stationName;
  const rawLines = f.stationLine
    .split(/[·,/]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (/^\d+$/.test(s) ? `${s}호선` : s));
  const formatted = formatLinesLabel(rawLines) || f.stationLine;
  return `${f.stationName}(${formatted})`;
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

// ─── 3대 핵심 투자 포인트 생성기 (데이터 없으면 null) ─────────────────────────

/**
 * ① 우량 임차인·장기 재계약 안정성 (병·의원·약국·금융 등 앵커 비중 ≥ 30% + 장기 재계약/다수 호실)
 */
export function pointTenantQuality(f: SummaryFacts): string | null {
  const tq = f.tenantQuality;
  if (!tq || tq.anchorNames.length === 0 || tq.rentSharePct < 30 || tq.anchorRentManwon <= 0) {
    return null;
  }
  const names = tq.anchorNames.slice(0, 2).join('·');
  const rentStr = formatManwonKo(tq.anchorRentManwon);
  if (tq.maxTenureYears && tq.maxTenureYears >= 5) {
    return `${tq.anchorCategoryLabel} — ${names}이 월 임대료의 ${tq.rentSharePct}%(${rentStr})를 차지하며, 일부 계약은 ${tq.maxTenureYears}년째 유지되고 있습니다.`;
  }
  return `${tq.anchorCategoryLabel} — ${names} 등 핵심 임차인이 월 임대료의 ${tq.rentSharePct}%(${rentStr})를 차지하고 있습니다.`;
}

/**
 * ② 인근 시세 대비 가격 경쟁력 + 공시지가 상승 추세
 */
export function pointPriceVsComps(f: SummaryFacts): string | null {
  const pvc = f.priceVsComps;
  if (!pvc || pvc.subjectLandPerPyeongManwon <= 0 || pvc.compsAvgManwon <= 0 || pvc.discountPct <= 0) {
    return null;
  }
  const subjStr = formatManwonKo(pvc.subjectLandPerPyeongManwon);
  const avgStr = formatManwonKo(pvc.compsAvgManwon);
  const cagr = f.landPriceCagrPct != null && Number.isFinite(f.landPriceCagrPct) && f.landPriceCagrPct > 0
    ? f.landPriceCagrPct
    : undefined;
  const yrs = f.landPriceYears && f.landPriceYears >= 2 ? `${f.landPriceYears}년간 ` : '';
  if (cagr != null) {
    return `가격 경쟁력 — 토지평당 약 ${subjStr}으로 ${pvc.compsKindLabel}(${avgStr}) 대비 약 ${pvc.discountPct}% 낮고, 공시지가는 ${yrs}연 ${cagr}% 상승했습니다.`;
  }
  return `가격 경쟁력 — 토지평당 약 ${subjStr}으로 ${pvc.compsKindLabel}(${avgStr}) 대비 약 ${pvc.discountPct}% 낮은 수준입니다.`;
}

/**
 * ③ 매입 후 자가사용/공실 임대 전환 업사이드
 */
export function pointUpside(f: SummaryFacts): string | null {
  const up = f.upside;
  if (!up || up.stabilizedYieldPct <= up.currentYieldPct || up.diffPctP <= 0.05) {
    return null;
  }
  const curStr = fmtPct2(up.currentYieldPct);
  const stabStr = fmtPct2(up.stabilizedYieldPct);
  const diffStr = fmtPct2(up.diffPctP);
  const floorPart = up.targetFloorsLabel ? `(${up.targetFloorsLabel})` : '';
  if (up.kind === 'broker_plan') {
    return `매입 후 업사이드 — 자가사용 호실${floorPart} 임대 전환 시 안정화 기대수익률 ${stabStr}%로 현행(${curStr}%) 대비 +${diffStr}%p 개선됩니다.`;
  }
  return `임대 안정화 여력 — 미임대 호실${floorPart} 임대 전환 시 안정화 기대수익률 ${stabStr}%로 현행(${curStr}%) 대비 +${diffStr}%p 상승 여력이 있습니다.`;
}

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

function pointBuildingScale(f: SummaryFacts): string | null {
  const fl = floorsLabel(f);
  const gfa = f.gfaSqm && f.gfaSqm > 0
    ? `연면적 ${fmtArea1(f.gfaSqm)}㎡(약 ${fmtArea1(f.gfaSqm * 0.3025)}평)`
    : '';
  if (!fl && !gfa) return null;
  const yr = f.completionYear ? `${f.completionYear}년 준공 ` : '';
  const body = [fl, gfa].filter(Boolean).join(', ');
  return `건축 규모 — ${yr}${body} 규모의 자산입니다.`;
}

function pointDevPlan(f: SummaryFacts): string | null {
  const scalePy = f.devTargetScalePyeong && f.devTargetScalePyeong > 0 ? `신축 목표 규모 약 ${fmtInt(f.devTargetScalePyeong)}평` : '';
  const maxFar = f.devMaxFarPct && f.devMaxFarPct > 0 ? `허가 용적률 ${fmtInt(f.devMaxFarPct)}%` : '';
  if (!scalePy && !maxFar) return null;
  const usePart = f.devUse ? `(${f.devUse})` : '';
  const body = [maxFar, scalePy ? `${scalePy}${usePart}` : ''].filter(Boolean).join(', ');
  return `개발 검토 — ${body} 기준으로 신축·개발 계획이 수립된 자산입니다.`;
}

// ─── 리드 문장 ───────────────────────────────────────────────────────────────
export function buildLeadSentence(f: SummaryFacts, includeStationInLead = false): string {
  const st = stationLabel(f);
  const walk = f.stationWalkMin && f.stationWalkMin > 0 ? ` 도보 ${Math.round(f.stationWalkMin)}분` : '';
  const yr = f.completionYear ? `${f.completionYear}년 준공` : '';
  const fl = floorsLabel(f);
  const kind = (() => {
    const rawAt = f.assetType?.trim();
    const at = (!rawAt || rawAt === '기타' || rawAt === '미분류') ? '빌딩' : rawAt;
    switch (f.posture) {
      case 'owner_occupied': return `사옥용 ${at}`;
      case 'development': return `개발 검토용 ${at}`;
      case 'operating': return `운영형 ${at}`;
      case 'trading': return at;
      default: return `임대수익형 ${at}`;
    }
  })();

  if (includeStationInLead && st) {
    const zonePart = f.zoning ? `${f.zoning}의 ` : '';
    const scalePart = [yr, fl].filter(Boolean).join(' ');
    return `${st}${walk}, ${zonePart}${scalePart ? `${scalePart} ` : ''}${kind}입니다.`.replace(/\s+/g, ' ').trim();
  }

  const where = f.areaSignal
    ? `${f.areaSignal}${f.zoning ? ` ${f.zoning}` : ''}에 위치한 `
    : (f.zoning ? `${f.zoning}에 위치한 ` : '');
  const spec = [yr, fl ? `${fl} 규모의` : ''].filter(Boolean).join(', ');
  if (!where && !spec) return '';
  return `${where}${spec ? `${spec} ` : ''}${kind}입니다.`.replace(/\s+/g, ' ').trim();
}

const buildLead = buildLeadSentence;

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
 * 중개인 투자 포인트와 산출 수익률 간 충돌 검사.
 * 수익률(%) 언급이 산출된 현행/안정화 수익률과 >0.1%p 이상 차이 나면 제외하고 경고를 기록한다.
 */
function filterBrokerInvestmentPoints(
  rawPoints: string[] | undefined,
  facts: SummaryFacts,
  warnings: string[],
): string[] {
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];
  const validYields = [
    facts.currentYieldPct,
    facts.stabilizedYieldPct,
    facts.upside?.currentYieldPct,
    facts.upside?.stabilizedYieldPct,
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const accepted: string[] = [];
  for (const raw of rawPoints) {
    let cleaned = String(raw || '')
      .replace(RULE77_FORBIDDEN_RE, '법정 상한')
      .replace(/\*\*/g, '')
      .replace(/^[-•·\d.)\s]+/, '')
      .trim();
    if (!cleaned || FORBIDDEN_GUARANTEE_RE.test(cleaned)) continue;

    // 수익률 수치 언급 검사 (예: '수익률 3.1%로 상승', '기대수익률 3.1%')
    const yieldMatch = /(?:수익률|Cap\s*Rate)[^0-9%]{0,16}(\d+(?:\.\d+)?)\s*%/i.exec(cleaned)
      ?? /(\d+(?:\.\d+)?)\s*%\s*(?:수익률|로\s*상승)/.exec(cleaned);
    if (yieldMatch && validYields.length > 0) {
      const claimed = parseFloat(yieldMatch[1]);
      if (Number.isFinite(claimed)) {
        const matchesAny = validYields.some(vy => Math.abs(vy - claimed) <= 0.101);
        if (!matchesAny) {
          const refYield = facts.upside?.stabilizedYieldPct ?? facts.stabilizedYieldPct ?? validYields[validYields.length - 1];
          warnings.push(
            `[HIGHLIGHT-CONFLICT] 중개인 투자포인트 수익률(${claimed}%)이 산출 수익률(${fmtPct2(refYield)}%)과 불일치하여 제외`
          );
          continue;
        }
      }
    }
    accepted.push(cleaned);
  }
  return accepted;
}

/**
 * 실데이터 기반 요약 하이라이트 합성.
 * @param facts 검증된 사실 데이터
 * @param aiPoints (선택) AI/섹션 bullet — 템플릿·중복이 아니면 데이터 포인트가 3개 미만일 때 보충용
 */
export function buildSummaryHighlights(facts: SummaryFacts, aiPoints: string[] = []): SummaryHighlights {
  const warnings: string[] = [];
  const validBrokerPoints = filterBrokerInvestmentPoints(facts.brokerInvestmentPoints, facts, warnings);

  const isIncomeDefault =
    !facts.posture ||
    facts.posture === 'income';
  const hasValueAnchors = Boolean(facts.tenantQuality || facts.priceVsComps || facts.upside);

  let usedBrokerInput = false;
  const points: string[] = [];

  const pushUnique = (p: string | null | undefined, fromBroker = false, leadRef = ''): boolean => {
    if (!p) return false;
    const t = p.trim();
    if (!t || isBoilerplateHighlight(t)) return false;
    if (leadRef && isNearDuplicate(leadRef, t)) return false;
    if (points.some(x => isNearDuplicate(x, t))) return false;
    points.push(t);
    if (fromBroker) usedBrokerInput = true;
    return true;
  };

  if (isIncomeDefault && hasValueAnchors) {
    // R3: 3대 가치 중심 포인트 우선 합성 (우량 임차인 / 시세 대비 가격경쟁력 / 매입 후 전환 업사이드)
    const candidateLead = buildLeadSentence(facts, true);

    const tqText = pointTenantQuality(facts);
    if (tqText) {
      pushUnique(tqText, Boolean(facts.tenantQuality?.hasBrokerTenureNote), candidateLead);
    } else {
      pushUnique(pointLease(facts), false, candidateLead);
    }

    const pvcText = pointPriceVsComps(facts);
    if (pvcText) {
      pushUnique(pvcText, Boolean(facts.priceVsComps?.hasBrokerComps), candidateLead);
    } else {
      pushUnique(pointLand(facts), false, candidateLead);
    }

    const upText = pointUpside(facts);
    if (upText) {
      pushUnique(upText, Boolean(facts.upside?.hasBrokerInput), candidateLead);
    } else if (points.length < 3) {
      pushUnique(pointFar(facts), false, candidateLead);
    }

    for (const bp of validBrokerPoints) {
      if (points.length >= 3) break;
      pushUnique(bp, true, candidateLead);
    }

    let usedLocationFallback = false;
    if (points.length < 3) {
      const locText = pointLocation(facts);
      if (locText && !points.some(x => isNearDuplicate(x, locText))) {
        points.push(locText);
        usedLocationFallback = true;
      }
    }
    for (const ai of aiPoints) {
      if (points.length >= 3) break;
      const cleaned = String(ai || '').replace(/\*\*/g, '').replace(/^[-•·\d.)\s]+/, '');
      pushUnique(cleaned, false, candidateLead);
    }

    const finalLead = usedLocationFallback
      ? buildLeadSentence(facts, false)
      : candidateLead;

    return {
      lead: finalLead,
      points: points.slice(0, 3),
      shortHighlights: buildShortHighlights(facts),
      hasBrokerInput: usedBrokerInput,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const order: Array<(f: SummaryFacts) => string | null> = (() => {
    switch (facts.posture) {
      case 'owner_occupied': return [pointLocation, pointSpace, pointLand, pointFar];
      case 'development': return [pointLand, pointFar, pointLocation, pointDevPlan, pointBuildingScale, pointLease];
      case 'operating': return [pointLocation, pointLease, pointLand, pointSpace, pointBuildingScale];
      case 'trading': return [pointLocation, pointLand, pointLease, pointFar, pointBuildingScale];
      default: return [pointLocation, pointLease, pointLand, pointFar, pointBuildingScale];
    }
  })();

  const lead = buildLead(facts, false);
  for (const gen of order) {
    if (points.length >= 3) break;
    pushUnique(gen(facts), gen === pointDevPlan, lead);
  }
  for (const bp of validBrokerPoints) {
    if (points.length >= 3) break;
    pushUnique(bp, true, lead);
  }
  for (const ai of aiPoints) {
    if (points.length >= 3) break;
    pushUnique(String(ai || '').replace(/\*\*/g, '').replace(/^[-•·\d.)\s]+/, ''), false, lead);
  }

  return {
    lead,
    points,
    shortHighlights: buildShortHighlights(facts),
    ...(usedBrokerInput ? { hasBrokerInput: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
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

const MEDICAL_TENANT_RE = /(의원|내과|외과|소아과|피부과|안과|이비인후과|정형외과|신경외과|산부인과|비뇨기과|정신건강|가정의학과|재활의학과|마취통증|치과|한의원|병원|약국|클리닉|메디컬|검진)/;
const CORP_ANCHOR_RE = /(은행|증권|보험|금융|스타벅스|올리브영|다이소|대기업|법인)/;

function cleanTenantName(raw: string): string {
  return String(raw || '')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();
}

function extractTenantQualityFacts(leases: unknown): SummaryTenantQualityFacts | undefined {
  if (!Array.isArray(leases) || leases.length === 0) return undefined;
  const rows = (leases as Record<string, any>[]).filter(Boolean);
  const incomeRows = rows.filter(r => !isNonLeasableLeaseRow(r) && resolveLeaseOccupancy(r) === '임대중');
  if (incomeRows.length === 0) return undefined;

  const totalRent = incomeRows.reduce((a, r) => a + (num(r.rent_manwon ?? r.monthly_rent_manwon) ?? 0), 0);
  if (totalRent <= 0) return undefined;

  let maxTenureYears: number | undefined;
  let hasBrokerTenureNote = false;
  for (const r of incomeRows) {
    const note = String(r.note ?? '');
    const m = /(?:임대|장기\s*임차|계약)?\s*(\d+)\s*년\s*(?:경과|차|이상|째|유지)/.exec(note);
    if (m) {
      const yrs = parseInt(m[1], 10);
      if (Number.isFinite(yrs) && yrs > 0 && (!maxTenureYears || yrs > maxTenureYears)) {
        maxTenureYears = yrs;
        hasBrokerTenureNote = true;
      }
    }
  }

  // 1) 병·의원·약국 의료 앵커 집계
  const medByTenant = new Map<string, number>();
  let medTotalRent = 0;
  for (const r of incomeRows) {
    const rawName = String(r.tenant_type ?? r.tenant_name ?? '').trim();
    if (!MEDICAL_TENANT_RE.test(rawName)) continue;
    const rent = num(r.rent_manwon ?? r.monthly_rent_manwon) ?? 0;
    if (rent <= 0) continue;
    medTotalRent += rent;
    const cname = cleanTenantName(rawName);
    if (cname) {
      medByTenant.set(cname, (medByTenant.get(cname) ?? 0) + rent);
    }
  }

  const medSharePct = Math.round((medTotalRent / totalRent) * 100);
  if (medSharePct >= 30 && medByTenant.size > 0 && ((maxTenureYears && maxTenureYears >= 5) || medByTenant.size >= 2)) {
    const sortedNames = Array.from(medByTenant.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    return {
      anchorNames: sortedNames,
      anchorCategoryLabel: '의료 임차',
      rentSharePct: medSharePct,
      anchorRentManwon: Math.round(medTotalRent),
      ...(maxTenureYears ? { maxTenureYears } : {}),
      ...(hasBrokerTenureNote ? { hasBrokerTenureNote } : {}),
    };
  }

  // 2) 금융·우량 법인 앵커 집계 (장기 계약 동반 시)
  const corpByTenant = new Map<string, number>();
  let corpTotalRent = 0;
  for (const r of incomeRows) {
    const rawName = String(r.tenant_type ?? r.tenant_name ?? '').trim();
    if (!CORP_ANCHOR_RE.test(rawName)) continue;
    const rent = num(r.rent_manwon ?? r.monthly_rent_manwon) ?? 0;
    if (rent <= 0) continue;
    corpTotalRent += rent;
    const cname = cleanTenantName(rawName);
    if (cname) {
      corpByTenant.set(cname, (corpByTenant.get(cname) ?? 0) + rent);
    }
  }
  const corpSharePct = Math.round((corpTotalRent / totalRent) * 100);
  if (corpSharePct >= 35 && corpByTenant.size > 0 && maxTenureYears && maxTenureYears >= 5) {
    const sortedNames = Array.from(corpByTenant.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    return {
      anchorNames: sortedNames,
      anchorCategoryLabel: '핵심 임차',
      rentSharePct: corpSharePct,
      anchorRentManwon: Math.round(corpTotalRent),
      maxTenureYears,
      hasBrokerTenureNote,
    };
  }

  return undefined;
}

function extractPriceVsCompsFacts(
  askingPriceManwon: number | undefined,
  landSqm: number | undefined,
  brokerExtras: Record<string, any> | undefined,
): SummaryPriceVsCompsFacts | undefined {
  if (!askingPriceManwon || askingPriceManwon <= 0 || !landSqm || landSqm <= 0) return undefined;
  const comps = Array.isArray(brokerExtras?.market_comps) ? brokerExtras!.market_comps : [];
  if (comps.length === 0) return undefined;

  const landPyeong = landSqm * 0.3025;
  if (landPyeong <= 0) return undefined;
  const subjectPerPyeong = Math.round(askingPriceManwon / landPyeong);

  const compPerPyeongs: number[] = [];
  let dealCount = 0;
  for (const c of comps) {
    if (!c || typeof c !== 'object') continue;
    const direct = pos(c.land_price_per_pyeong_manwon ?? c.price_per_pyeong_manwon);
    const derived =
      !direct && pos(c.price_manwon) && pos(c.land_area_pyeong)
        ? Math.round(pos(c.price_manwon)! / pos(c.land_area_pyeong)!)
        : undefined;
    const val = direct ?? derived;
    if (val && val > 0) {
      compPerPyeongs.push(val);
      if (c.kind === 'deal') dealCount++;
    }
  }

  if (compPerPyeongs.length === 0) return undefined;
  const compsAvgManwon = Math.round(compPerPyeongs.reduce((a, b) => a + b, 0) / compPerPyeongs.length);
  if (compsAvgManwon <= subjectPerPyeong) return undefined;
  const discountPct = Math.round((1 - subjectPerPyeong / compsAvgManwon) * 100);
  if (discountPct <= 0) return undefined;

  const compsKindLabel = dealCount === compPerPyeongs.length ? '인근 실거래 평균' : '인근 매물 평균';
  return {
    subjectLandPerPyeongManwon: subjectPerPyeong,
    compsAvgManwon,
    compsKindLabel,
    discountPct,
    hasBrokerComps: true,
  };
}

function extractUpsideFacts(
  body: Record<string, any>,
  askingPriceManwon: number | undefined,
  leaseFacts: SummaryLeaseFacts | undefined,
): { upside?: SummaryUpsideFacts; currentYieldPct?: number; stabilizedYieldPct?: number } {
  const yieldSet = buildYieldSetFromBody(body);
  const curRent = leaseFacts?.monthlyRentManwon ?? 0;
  const curDep = leaseFacts?.depositManwon ?? 0;
  const netAsk = askingPriceManwon && askingPriceManwon > curDep ? askingPriceManwon - curDep : undefined;
  const fallbackCurYield =
    netAsk && netAsk > 0 && curRent > 0
      ? Math.round(((curRent * 12) / netAsk) * 10000) / 100
      : undefined;
  const currentYieldPct =
    yieldSet.grossYieldNetOfDeposit != null
      ? Math.round(yieldSet.grossYieldNetOfDeposit * 100) / 100
      : fallbackCurYield;

  if (!currentYieldPct || currentYieldPct <= 0 || !askingPriceManwon || askingPriceManwon <= 0) {
    return { currentYieldPct };
  }

  const brokerExtras = body.broker_extras ?? {};
  const planText = String(brokerExtras.post_acquisition_plan ?? '').trim();
  const rows = Array.isArray(body.floor_leases) ? (body.floor_leases as Record<string, any>[]) : [];
  const ownerRows = rows.filter(r => r && !isNonLeasableLeaseRow(r) && resolveLeaseOccupancy(r) === '자가사용');
  const vacantRows = rows.filter(r => r && !isNonLeasableLeaseRow(r) && resolveLeaseOccupancy(r) === '공실');

  // 1) 중개인 매입 후 전환 계획(post_acquisition_plan) 내 '보증 X만 / 월 Y만' 파싱
  if (planText) {
    const convRe = /보증(?:금)?\s*([\d,]+)\s*만(?:원)?\s*[/·,]\s*월(?:세|임대료)?\s*([\d,]+)\s*만/g;
    let addedDep = 0;
    let addedRent = 0;
    let matchCount = 0;
    let m: RegExpExecArray | null;
    while ((m = convRe.exec(planText)) !== null) {
      const d = parseFloat(m[1].replace(/,/g, ''));
      const r = parseFloat(m[2].replace(/,/g, ''));
      if (Number.isFinite(d) && d >= 0 && Number.isFinite(r) && r > 0) {
        addedDep += d;
        addedRent += r;
        matchCount++;
      }
    }

    if (matchCount > 0 && addedRent > 0) {
      const stabNetAsk = askingPriceManwon - (curDep + addedDep);
      const stabAnnualRent = (curRent + addedRent) * 12;
      if (stabNetAsk > 0) {
        const stabilizedYieldPct = Math.round((stabAnnualRent / stabNetAsk) * 10000) / 100;
        const diffPctP = Math.round((stabilizedYieldPct - currentYieldPct) * 100) / 100;
        if (diffPctP > 0.05) {
          const ownerFloorNames = Array.from(
            new Set(ownerRows.map(r => String(r.floor || '').trim()).filter(Boolean))
          );
          const hasPartialFloor = ownerFloorNames.some(fl =>
            rows.some(r => String(r?.floor || '').trim() === fl && resolveLeaseOccupancy(r) === '임대중')
          );
          const targetFloorsLabel =
            ownerFloorNames.length > 0
              ? `${ownerFloorNames.join('·')}${hasPartialFloor ? ' 일부' : ''}`
              : undefined;
          return {
            currentYieldPct,
            stabilizedYieldPct,
            upside: {
              currentYieldPct,
              stabilizedYieldPct,
              diffPctP,
              targetFloorsLabel,
              kind: 'broker_plan',
              hasBrokerInput: true,
            },
          };
        }
      }
    }
  }

  // 2) yieldSet.stabilized (broker_plan, market_rent 또는 target_rent 가정) 폴백 — reserve_excluded 제외
  const stab = yieldSet.stabilized;
  if (
    stab &&
    stab.value != null &&
    (stab.kind === 'broker_plan' || stab.kind === 'market_rent' || stab.kind === 'target_rent')
  ) {
    const stabilizedYieldPct = Math.round(stab.value * 100) / 100;
    const diffPctP = Math.round((stabilizedYieldPct - currentYieldPct) * 100) / 100;
    if (diffPctP > 0.05) {
      const targetFloors = Array.from(
        new Set([...ownerRows, ...vacantRows].map(r => String(r.floor || '').trim()).filter(Boolean))
      );
      return {
        currentYieldPct,
        stabilizedYieldPct,
        upside: {
          currentYieldPct,
          stabilizedYieldPct,
          diffPctP,
          targetFloorsLabel: targetFloors.length > 0 ? targetFloors.slice(0, 3).join('·') : undefined,
          kind: stab.kind,
          hasBrokerInput: stab.kind === 'broker_plan' || stab.kind === 'target_rent',
        },
      };
    }
  }

  return { currentYieldPct };
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

  // 지하철 노선 병합기(resolveMergedStations) 우선 적용: 당산역 2호선 + 당산역 9호선 → 당산역(2·9호선)
  const mergedStations = poi && !poi._isFallback
    ? resolveMergedStations(poi, enr.landmarkPool ?? body.landmarkPool)
    : [];
  const primaryMerged = mergedStations[0];
  const st = primaryMerged
    ? {
        name: primaryMerged.baseName,
        line: formatLinesLabel(primaryMerged.lines) || undefined,
      }
    : parseStation(nearest?.name ?? ssot.station_name, nearest?.line ?? nearest?.lineName);

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

  const lease = input.posture === 'owner_occupied' ? undefined : extractLeaseFacts(body.floor_leases, ssot);
  const askingPriceManwon = pos(ssot.asking_price_manwon ?? hero.asking_price_manwon ?? bldg.asking_price_manwon);
  const tenantQuality = input.posture === 'owner_occupied' ? undefined : extractTenantQualityFacts(body.floor_leases);
  const priceVsComps = extractPriceVsCompsFacts(askingPriceManwon, areas.landSqm, body.broker_extras);
  const { upside, currentYieldPct, stabilizedYieldPct } = extractUpsideFacts(body, askingPriceManwon, lease);
  const rawBrokerPoints = Array.isArray(body.broker_extras?.investment_points)
    ? body.broker_extras.investment_points.map((p: unknown) => String(p ?? '').trim()).filter(Boolean)
    : undefined;
  const devSpec = body.developmentSpec ?? {};
  const rawDevUse = str(devSpec.use ?? devSpec.targetUse);
  const DEV_USE_KO: Record<string, string> = {
    office: '업무시설(오피스)',
    officetel: '오피스텔',
    retail: '근린생활시설',
    mixed: '복합개발',
    residential: '주거시설',
    hotel: '숙박시설',
  };
  const devUseKo = rawDevUse ? (DEV_USE_KO[rawDevUse.toLowerCase()] ?? rawDevUse) : undefined;

  return {
    posture: input.posture,
    assetType: ssot.asset_type ?? bldg.asset_type ?? hero.assetType,
    areaSignal: bldg.area_signal ?? ssot.area_signal ?? hero.areaSignal,
    stationName: st.name,
    stationLine: st.line,
    stationWalkMin: primaryMerged?.walkMinutes ?? pos(nearest?.walkMinutes ?? ssot.station_walk_min),
    stationDistanceM: primaryMerged?.distanceM ?? pos(nearest?.distanceM),
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
    devTargetScalePyeong: pos(devSpec.targetScalePyeong ?? devSpec.targetScalePyung ?? bldg.layers?.planned_floor_area_pyung),
    devMaxFarPct: pos(devSpec.maxFAR ?? devSpec.maxFarPct),
    devUse: devUseKo,
    lease,
    landPriceCagrPct: num(lph?.cagrPct),
    landPriceYears: Array.isArray(lph?.history) ? lph.history.length : undefined,
    ...(tenantQuality ? { tenantQuality } : {}),
    ...(priceVsComps ? { priceVsComps } : {}),
    ...(upside ? { upside } : {}),
    ...(currentYieldPct != null ? { currentYieldPct } : {}),
    ...(stabilizedYieldPct != null ? { stabilizedYieldPct } : {}),
    ...(rawBrokerPoints && rawBrokerPoints.length > 0 ? { brokerInvestmentPoints: rawBrokerPoints } : {}),
  };
}
