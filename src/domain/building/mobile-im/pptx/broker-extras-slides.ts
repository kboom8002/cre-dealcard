/**
 * @file broker-extras-slides.ts
 * @description D4/D8 RENDER 측: 중개인 추가 정보(doc.body.broker_extras)를 Basic IM 선택 면의 dataMap 으로 변환.
 *
 * 원칙 (d4_d12_plan §0)
 *  - 중개인이 준 문자열은 원문 그대로 렌더한다 (AI·재작성·요약 없음). 출처 태그 '● 중개인입력'.
 *  - 계산은 결정론만: 실거래/매물 토지평당가 평균, 본건 환산 토지평당가(매매가 ÷ 대지평수), 괴리율.
 *  - 입력이 없으면 아무 면도 만들지 않는다 (기본 9면 불변, Rule 4/34).
 *
 * 순수 함수 모듈 — pptxgenjs / sharp 에 의존하지 않는다 (단위 테스트 용이).
 */
import type { BrokerExtras, BrokerMarketComp, BrokerRegulatoryNote } from '../broker-extras';
import { COMP_KIND_LABELS, REGULATORY_KIND_LABELS } from '../broker-extras';
import { sqmToPyeong } from '@/lib/utils/area-conversion';
import { isNearDuplicate } from './summary-highlights';

/** 지면에 쓰는 비사진(문서) 이미지 카테고리 — 일반 갤러리('현장 사진')에서 제외된다. */
export const BROKER_IMAGE_CATEGORIES: ReadonlySet<string> = new Set(['location_map', 'district_plan_map', 'floor_plan']);

/** 규제·계획 도면 면에 들어가는 카테고리 (위치도는 입지 면에 병합) */
export const BROKER_PLAN_IMAGE_CATEGORIES: ReadonlySet<string> = new Set(['district_plan_map', 'floor_plan']);

/** 출처 태그 (provenance 'broker' 라벨과 동일: imlib.PV.broker) */
export const BROKER_SOURCE_TAG = '● 중개인입력';
export const BROKER_UNVERIFIED_TAG = '중개인 제공 · 미검증';
export const COMPS_FOOTNOTE = '※ 중개인 제공 자료, 실거래·매물 기준일 미검증. 본건 환산 = 매매가 ÷ 대지평수';
export const COMPS_GAP_FORMULA = '괴리율 = (본건 환산 − 실거래 평균) ÷ 실거래 평균';

export interface BrokerImage {
  url: string;
  category: 'location_map' | 'district_plan_map' | 'floor_plan';
  caption?: string;
}

// ──────────────────────────────────────────────────────────────────
// 읽기 (영속화된 값을 관대하게 정규화 — 원문은 보존, 빈 값만 제거)
// ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function posNum(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * body.broker_extras 를 읽는다. 비어 있거나 형식이 맞지 않으면 null.
 * 한도(건수·길이)는 입력 단계(broker-extras.ts parse)에서 이미 강제되므로 여기서는 재절단하지 않는다.
 */
export function readBrokerExtras(body: unknown): BrokerExtras | null {
  const raw = (body as { broker_extras?: unknown } | null | undefined)?.broker_extras;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: BrokerExtras = {};

  if (Array.isArray(r.investment_points)) {
    const pts = r.investment_points.map(str).filter(Boolean);
    if (pts.length) out.investment_points = pts;
  }
  const closing = str(r.closing_line);
  if (closing) out.closing_line = closing;

  if (Array.isArray(r.regulatory_notes)) {
    const notes: BrokerRegulatoryNote[] = [];
    for (const n of r.regulatory_notes) {
      if (!n || typeof n !== 'object') continue;
      const o = n as Record<string, unknown>;
      const detail = str(o.detail);
      if (!detail) continue;
      const kind = (['district_plan', 'dev_restriction', 'zoning_special', 'other'] as const).find(k => k === o.kind) ?? 'other';
      const note: BrokerRegulatoryNote = { kind, detail };
      if (str(o.title)) note.title = str(o.title);
      if (str(o.basis)) note.basis = str(o.basis);
      if (str(o.restricted_acts)) note.restricted_acts = str(o.restricted_acts);
      if (str(o.period)) note.period = str(o.period);
      notes.push(note);
    }
    if (notes.length) out.regulatory_notes = notes;
  }

  if (Array.isArray(r.market_comps)) {
    const comps: BrokerMarketComp[] = [];
    for (const c of r.market_comps) {
      if (!c || typeof c !== 'object') continue;
      const o = c as Record<string, unknown>;
      const location = str(o.location);
      const price = posNum(o.price_eok);
      const land = posNum(o.land_price_per_pyeong_manwon);
      if (!location || (price === undefined && land === undefined)) continue;
      const comp: BrokerMarketComp = { kind: o.kind === 'listing' ? 'listing' : 'transaction', location };
      if (price !== undefined) comp.price_eok = price;
      if (land !== undefined) comp.land_price_per_pyeong_manwon = land;
      if (str(o.note)) comp.note = str(o.note);
      comps.push(comp);
    }
    if (comps.length) out.market_comps = comps;
  }

  const loc = str(r.location_note);
  if (loc) out.location_note = loc;

  if (Array.isArray(r.post_acquisition_plan)) {
    const plan = r.post_acquisition_plan.map(str).filter(Boolean);
    if (plan.length) out.post_acquisition_plan = plan;
  }
  const rent = posNum(r.target_rent_per_pyeong_manwon);
  if (rent !== undefined) out.target_rent_per_pyeong_manwon = rent;

  dedupeBrokerPointsAgainstLocation(out);
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Rule 4 (비중복 렌더링): 같은 문장이 '투자 포인트' 면과 '입지' 면 callout 에 이중 렌더되지 않도록 정리.
 *  - 입지 설명(location_note)과 사실상 같은 투자 포인트는 포인트에서 제거 (입지 문장은 입지 면이 정본).
 *  - 제거 결과 포인트가 0개가 되면 포인트를 유지하고 입지 callout 을 생략 (투자 포인트 면 소실 방지).
 * 원문 문자열은 바꾸지 않는다 (선택만).
 */
export function dedupeBrokerPointsAgainstLocation(extras: BrokerExtras): void {
  const loc = extras.location_note;
  const pts = extras.investment_points;
  if (!loc || !pts?.length) return;
  const kept = pts.filter(p => !isNearDuplicate(p, loc));
  if (kept.length === pts.length) return;
  if (kept.length > 0) extras.investment_points = kept;
  else delete extras.location_note;
}

/**
 * photos_v2 / photos 에서 중개인 업로드 도면·지도 이미지를 추출한다.
 * resolvePhotos 는 앞 12장만 취하므로(문서 이미지가 밀려날 수 있음) 원본 배열에서 직접 읽는다.
 */
export function extractBrokerImages(body: unknown): BrokerImage[] {
  const b = (body ?? {}) as { photos_v2?: unknown; photos?: unknown };
  const raw = Array.isArray(b.photos_v2) && b.photos_v2.length > 0
    ? b.photos_v2
    : (Array.isArray(b.photos) ? b.photos : []);
  const out: BrokerImage[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const url = str(o.url);
    if (!url || url.split('?')[0].toLowerCase().endsWith('.wdp')) continue;
    if (o.excluded === true) continue;
    const cat = String(o.category ?? o.type ?? '').toLowerCase();
    if (!BROKER_IMAGE_CATEGORIES.has(cat)) continue;
    const caption = str(o.caption);
    out.push({ url, category: cat as BrokerImage['category'], ...(caption ? { caption } : {}) });
  }
  return out;
}

export interface BrokerAvailability {
  hasBrokerPoints: boolean;
  hasBrokerRegulation: boolean;
  hasBrokerRegulationNotes: boolean;
  hasBrokerRegulationImages: boolean;
  hasBrokerComps: boolean;
}

export function deriveBrokerAvailability(body: unknown): BrokerAvailability {
  const extras = readBrokerExtras(body);
  const images = extractBrokerImages(body);
  const hasNotes = (extras?.regulatory_notes?.length ?? 0) > 0;
  const hasPlanImages = images.some(i => BROKER_PLAN_IMAGE_CATEGORIES.has(i.category));
  return {
    hasBrokerPoints: (extras?.investment_points?.length ?? 0) > 0,
    hasBrokerRegulation: hasNotes || hasPlanImages,
    hasBrokerRegulationNotes: hasNotes,
    hasBrokerRegulationImages: hasPlanImages,
    hasBrokerComps: (extras?.market_comps?.length ?? 0) > 0,
  };
}

// ──────────────────────────────────────────────────────────────────
// 결정론 계산 — 인근 시세 비교
// ──────────────────────────────────────────────────────────────────

/** 본건 환산 토지평당가(만원/평) = 매매가(만원) ÷ 대지평수. 물건 개요의 '토지평당가'와 동일 산식. */
export function subjectLandPricePerPyeongManwon(
  ssot: Record<string, unknown> | null | undefined,
  body?: Record<string, unknown> | null,
): number | undefined {
  const s = ssot ?? {};
  const ask = posNum(s.asking_price_manwon) ?? posNum(body?.asking_price_manwon);
  const py = posNum(s.land_area_pyeong);
  const sqm = posNum(s.land_area_sqm);
  const landPy = py ?? (sqm !== undefined ? sqmToPyeong(sqm) : undefined);
  if (ask === undefined || landPy === undefined) return undefined;
  const unit = Math.round(ask / landPy);
  return Number.isFinite(unit) && unit > 0 ? unit : undefined;
}

export interface CompsStats {
  transactionAvg?: number;   // 실거래 평균 토지평당가 (만원/평, 반올림)
  transactionCount: number;  // 평균에 사용된 실거래 건수 (값이 있는 행만)
  listingAvg?: number;
  listingCount: number;
  subject?: number;          // 본건 환산 토지평당가
  gapPct?: number;           // (본건 − 실거래 평균) ÷ 실거래 평균 × 100, 소수 1자리
}

function mean(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  return Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
}

/** 토지평당가 값이 있는 행만 평균에 반영 (값 없는 행은 무시). */
export function computeCompsStats(comps: readonly BrokerMarketComp[], subjectPerPyeong?: number): CompsStats {
  const tx = comps.filter(c => c.kind === 'transaction' && c.land_price_per_pyeong_manwon !== undefined)
    .map(c => c.land_price_per_pyeong_manwon as number);
  const ls = comps.filter(c => c.kind === 'listing' && c.land_price_per_pyeong_manwon !== undefined)
    .map(c => c.land_price_per_pyeong_manwon as number);
  const transactionAvg = mean(tx);
  const subject = subjectPerPyeong !== undefined && subjectPerPyeong > 0 ? subjectPerPyeong : undefined;
  const gapPct = (transactionAvg !== undefined && transactionAvg > 0 && subject !== undefined)
    ? Math.round(((subject - transactionAvg) / transactionAvg) * 1000) / 10
    : undefined;
  return {
    transactionAvg,
    transactionCount: tx.length,
    listingAvg: mean(ls),
    listingCount: ls.length,
    subject,
    gapPct,
  };
}

function fmtNum(n: number, maxFrac = 2): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: maxFrac });
}

export function formatGapPct(g: number): string {
  return `${g > 0 ? '+' : ''}${g.toFixed(1)}%`;
}

// ──────────────────────────────────────────────────────────────────
// dataMap 빌더 (SectionData 호환 — left.rows / tableRows 로 renderer 의 hasContent 검사를 통과)
// ──────────────────────────────────────────────────────────────────

export interface BrokerDataMapOptions {
  /** ssot_summary (매매가·대지면적) */
  ssot?: Record<string, unknown> | null;
  /** body 전체 (asking_price_manwon 폴백, photos_v2) */
  body?: Record<string, unknown> | null;
}

export function buildBrokerPointsData(extras: BrokerExtras): Record<string, any> | null {
  const points = extras.investment_points ?? [];
  if (points.length === 0) return null;
  return {
    title: '투자 포인트·제안',
    kicker: 'Investment Points',
    content: '',
    tables: [],
    metrics: {},
    mode: 'points',
    points: [...points],
    closingLine: extras.closing_line ?? '',
    sourceTag: BROKER_SOURCE_TAG,
    unverifiedTag: BROKER_UNVERIFIED_TAG,
    left: { sub: '투자 포인트', rows: points.map((p, i) => [String(i + 1), p]) },
  };
}

export interface RegulationCard {
  kind: BrokerRegulatoryNote['kind'];
  kindLabel: string;
  title: string;
  detail: string;
  /** 근거 / 제한행위 / 기한 (값이 있는 것만, 원문 그대로) */
  lines: Array<{ label: string; value: string }>;
  tone: 'warn' | 'info';
}

export function buildBrokerRegulationData(extras: BrokerExtras): Record<string, any> | null {
  const notes = extras.regulatory_notes ?? [];
  if (notes.length === 0) return null;
  const cards: RegulationCard[] = notes.map(n => {
    const lines: Array<{ label: string; value: string }> = [];
    if (n.basis) lines.push({ label: '근거', value: n.basis });
    if (n.restricted_acts) lines.push({ label: '제한행위', value: n.restricted_acts });
    if (n.period) lines.push({ label: '기한', value: n.period });
    return {
      kind: n.kind,
      kindLabel: REGULATORY_KIND_LABELS[n.kind],
      title: n.title ?? '',
      detail: n.detail,
      lines,
      tone: n.kind === 'dev_restriction' ? 'warn' : 'info',
    };
  });
  return {
    title: '규제·계획',
    kicker: 'Regulation & Plan',
    content: '',
    tables: [],
    metrics: {},
    mode: 'regulation',
    cards,
    sourceTag: BROKER_SOURCE_TAG,
    unverifiedTag: BROKER_UNVERIFIED_TAG,
    left: { sub: '규제·계획', rows: cards.map(c => [c.kindLabel, c.detail]) },
  };
}

export function buildBrokerRegulationImagesData(images: readonly BrokerImage[]): Record<string, any> | null {
  const plan = images.filter(i => BROKER_PLAN_IMAGE_CATEGORIES.has(i.category)).slice(0, 3);
  if (plan.length === 0) return null;
  return {
    title: '지구단위계획·도면',
    kicker: 'Plan Drawings',
    content: '',
    tables: [],
    metrics: {},
    photos: plan.map(i => ({ url: i.url, category: i.category, ...(i.caption ? { caption: i.caption } : {}) })),
    photoUrls: plan.map(i => i.url),
    layout: plan.length === 1 ? 'FULL_WIDE' : plan.length === 2 ? 'DUAL_LANDSCAPE' : 'ONE_LARGE_TWO_SMALL_H',
    // 이미지를 불러오지 못하면 '현장 실사 예정' 대체 카드 대신 면 자체를 생략한다
    suppressOnEmpty: true,
  };
}

export function buildBrokerCompsData(extras: BrokerExtras, opts: BrokerDataMapOptions = {}): Record<string, any> | null {
  const comps = extras.market_comps ?? [];
  if (comps.length === 0) return null;
  const subject = subjectLandPricePerPyeongManwon(opts.ssot, opts.body);
  const stats = computeCompsStats(comps, subject);
  // 비고가 하나도 없으면 '-'만 있는 열을 만들지 않는다 (렌더러는 head 길이로 열폭을 투영)
  const hasNote = comps.some(c => (c.note ?? '').trim() !== '');
  const tableHead = hasNote
    ? ['구분', '소재지', '가격(억)', '토지평당가(만원)', '비고']
    : ['구분', '소재지', '가격(억)', '토지평당가(만원)'];
  const tableRows = comps.map(c => [
    COMP_KIND_LABELS[c.kind],
    c.location,
    c.price_eok !== undefined ? fmtNum(c.price_eok) : '-',
    c.land_price_per_pyeong_manwon !== undefined ? fmtNum(c.land_price_per_pyeong_manwon) : '-',
    ...(hasNote ? [c.note?.trim() ? c.note : '-'] : []),
  ]);
  const summaryCards: Array<{ label: string; value: string; sub: string }> = [];
  if (stats.transactionAvg !== undefined) {
    summaryCards.push({ label: '실거래 평균', value: `${fmtNum(stats.transactionAvg, 0)}만원/평`, sub: `토지평당가 · ${stats.transactionCount}건` });
  }
  if (stats.listingAvg !== undefined) {
    summaryCards.push({ label: '매물 평균', value: `${fmtNum(stats.listingAvg, 0)}만원/평`, sub: `토지평당가 · ${stats.listingCount}건` });
  }
  if (stats.subject !== undefined) {
    summaryCards.push({ label: '본건 환산', value: `${fmtNum(stats.subject, 0)}만원/평`, sub: '토지평당가 · 산식은 각주' });
  }
  if (stats.gapPct !== undefined) {
    summaryCards.push({ label: '괴리율', value: formatGapPct(stats.gapPct), sub: '본건 vs 실거래 평균' });
  }
  return {
    title: '인근 시세 비교',
    kicker: 'Market Comps',
    content: '',
    tables: [],
    metrics: {},
    mode: 'comps',
    tableHead,
    tableRows,
    stats,
    summaryCards,
    footnotes: stats.gapPct !== undefined ? [COMPS_FOOTNOTE, COMPS_GAP_FORMULA] : [COMPS_FOOTNOTE],
    sourceTag: BROKER_SOURCE_TAG,
    unverifiedTag: BROKER_UNVERIFIED_TAG,
  };
}

/** 선택 면 3종(+도면 면) dataMap. 입력이 없는 키는 포함하지 않는다. */
export function buildBrokerExtrasDataMap(body: unknown, opts: BrokerDataMapOptions = {}): Record<string, Record<string, any>> {
  const out: Record<string, Record<string, any>> = {};
  const extras = readBrokerExtras(body);
  if (extras) {
    const points = buildBrokerPointsData(extras);
    if (points) out.brokerPoints = points;
    const reg = buildBrokerRegulationData(extras);
    if (reg) out.brokerRegulation = reg;
    const comps = buildBrokerCompsData(extras, { body: body as Record<string, unknown>, ...opts });
    if (comps) out.brokerComps = comps;
  }
  const regImg = buildBrokerRegulationImagesData(extractBrokerImages(body));
  if (regImg) out.brokerRegulationImages = regImg;
  return out;
}

// ──────────────────────────────────────────────────────────────────
// 기존 면 보강 (면 추가 없음): 입지 / 렌트롤
// ──────────────────────────────────────────────────────────────────

/**
 * 입지 면: location_note → 우측 callout(원문), 위치도 이미지 → 좌측 지도 슬롯(brokerMapImage).
 * 우측 callout 공간을 위해 행 수를 5개로 제한한다. 이미 있던 자동 '입지 종합 분석' callout 은
 * 중개인 입력 설명이 대체한다 (Rule 4 — 같은 위치에 두 callout 중복 금지).
 */
export function applyBrokerLocation(
  location: Record<string, any> | undefined | null,
  extras: BrokerExtras | null,
  images: readonly BrokerImage[],
): void {
  if (!location) return;
  const map = images.find(i => i.category === 'location_map');
  if (map) {
    location.brokerMapImage = map.url;
    location.brokerMapCaption = map.caption ? `● 위치도 · ${map.caption}` : '● 위치도 (중개인 제공)';
  }
  if (extras?.location_note) {
    if (!location.right) location.right = {};
    if (Array.isArray(location.right.rows) && location.right.rows.length > 5) {
      location.right.rows = location.right.rows.slice(0, 5);
    }
    location.right.callout = {
      kind: 'info',
      title: '입지 설명 · 중개인입력',
      body: extras.location_note,
    };
  }
}

/** 렌트롤 면: post_acquisition_plan → 하단 '매입 후 전략' 박스 (A24 brokerPostAcquisitionPlan). */
export function applyBrokerRentRollPlan(rentRoll: Record<string, any> | undefined | null, extras: BrokerExtras | null): void {
  if (!rentRoll || !extras?.post_acquisition_plan?.length) return;
  rentRoll.brokerPostAcquisitionPlan = [...extras.post_acquisition_plan];
}
