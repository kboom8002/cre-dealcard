/**
 * @file yield-set.ts
 * @description D10 — 수익률 표기 정합성: 단일 YieldSet.
 *
 * 요약 슬라이드(A02)와 수익률 슬라이드(A23)가 **같은 객체**에서 값·이름·가정을 읽는다.
 * 같은 지표는 같은 값, 같은 이름. 지표는 4종이며 분모/분자가 서로 다르다:
 *
 *  ① grossYieldOnPrice       = 연 임대료 ÷ 매매가                (운영비 차감 전)
 *  ② grossYieldNetOfDeposit  = 연 임대료 ÷ (매매가 − 보증금)     (운영비 차감 전, 보증금 승계 가정)
 *  ③ noiCapRate              = NOI ÷ 매매가                     (운영비·공실충당 차감 후)
 *  ④ stabilized              = 아래 둘 중 하나 (종류를 값과 함께 반드시 표기)
 *       - 'target_rent'      : (현재 연 임대료 + 실제 공실·자가사용 면적 × 목표임대료 × 12) ÷ (매매가 − 보증금)
 *                              → 중개인이 목표임대료(평당 만원/월)를 입력했고 해당 면적을 알 때만
 *       - 'reserve_excluded' : 현재 연 임대료를 공실충당률로 역산(÷(1−충당률)) ÷ (매매가 − 보증금)
 *                              → 시세 임대 가정이 **아님**. '공실충당 N% 제외 기준 (참고)'로만 표기
 *
 * 금융 문구 원칙: 근거 없는 시장 비교·평가 문구는 만들지 않는다 (시장 벤치마크 표 없음).
 */
import { sqmToPyeong } from '@/lib/utils/area-conversion';

export type OpexSource = 'user' | 'assumed';
export type StabilizedKind = 'target_rent' | 'reserve_excluded';

export interface YieldAssumptions {
  /** 운영비 ÷ 연 임대료 (%) — 미상이면 null */
  opexPct: number | null;
  opexSource: OpexSource;
  /** 공실충당률 (%) — NOI·'공실충당 제외 기준'에 적용된 값 */
  vacancyReservePct: number | null;
  /** 렌트롤에서 확인된 실제 공실률 (%) — 미상이면 null */
  actualVacancyPct: number | null;
  /** 승계 보증금 (원) */
  depositKrw: number;
  /** 중개인 입력 목표임대료 (만원/평/월) — 없으면 null */
  targetRentPerPyeongManwon: number | null;
}

export interface StabilizedYield {
  kind: StabilizedKind;
  /** % */
  value: number;
  /** 행 라벨 — 종류에 따라 정확히 구분 */
  label: string;
  /** 근거 한 줄 (target_rent일 때만; reserve_excluded는 null) */
  caption: string | null;
  /** target_rent: 목표임대료를 적용한 면적(평) */
  appliedAreaPyeong?: number;
}

export interface YieldSet {
  grossYieldOnPrice: number | null;
  grossYieldNetOfDeposit: number | null;
  noiCapRate: number | null;
  stabilized: StabilizedYield | null;
  annualRentKrw: number;
  noiBaseKrw: number | null;
  assumptions: YieldAssumptions;
}

/** 두 슬라이드가 공유하는 지표명 (같은 지표 = 같은 이름) */
export const YIELD_LABELS = {
  grossNetOfDeposit: '임대수익률 (Gross, 매매가−보증금 대비)',
  grossOnPrice: '임대수익률 (Gross, 매매가 대비)',
  noiCapRate: 'Cap Rate (NOI 기준)',
  stabilizedTargetRent: '안정화 수익률',
} as const;

export const stabilizedReserveLabel = (vacancyReservePct: number | null | undefined): string =>
  vacancyReservePct != null && Number.isFinite(vacancyReservePct) && vacancyReservePct > 0
    ? `공실충당 ${trimNum(vacancyReservePct)}% 제외 기준 (참고)`
    : '공실충당 제외 기준 (참고)';

function trimNum(n: number, digits = 1): string {
  return String(Number(n.toFixed(digits)));
}

const pos = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const r2 = (n: number): number => parseFloat(n.toFixed(2));

/* ─────────────────────────── 공실·자가사용 면적 ─────────────────────────── */

const VACANT_RE = /공실/;
const OWNER_USE_RE = /자가\s*사용/;

export interface VacantAreaSummary {
  /** 공실 면적 합 (평) */
  vacantPyeong: number;
  /** 자가사용 면적 합 (평) */
  ownerUsePyeong: number;
  /** 공실·자가사용 호실이 있는지 */
  hasVacantOrOwnerUse: boolean;
  /** true면 모든 공실·자가사용 호실의 면적을 알고 있음 (하나라도 모르면 false → 목표임대료 계산 금지) */
  areaKnown: boolean;
}

function leaseText(l: Record<string, any>): string {
  return [l.tenant_name, l.tenant, l.tenant_type, l.tenant_sector, l.lease_state]
    .map((v) => (v == null ? '' : String(v)))
    .join(' ');
}

/** 호실 1개의 면적(평). 대용값(area_sqm_is_proxy)은 임대면적이 아니므로 미상 처리. */
function leaseAreaPyeong(l: Record<string, any>): number | null {
  const sqm = !l.area_sqm_is_proxy ? pos(l.area_sqm) : null;
  if (sqm != null) return sqmToPyeong(sqm);
  return pos(l.area_pyeong);
}

/**
 * floor_leases에서 '실제로' 공실이거나 자가사용인 호실의 면적을 합산한다.
 * (면적을 모르는 공실이 하나라도 있으면 areaKnown=false)
 */
export function summarizeVacantOwnerUseArea(floorLeases: unknown): VacantAreaSummary {
  const leases = (Array.isArray(floorLeases) ? floorLeases : []).filter(
    (l): l is Record<string, any> => !!l && typeof l === 'object',
  );
  let vacantPyeong = 0;
  let ownerUsePyeong = 0;
  let count = 0;
  let areaKnown = true;
  for (const l of leases) {
    const text = leaseText(l);
    const isOwnerUse = l.lease_state === '자가사용' || OWNER_USE_RE.test(text);
    const isVacant = !isOwnerUse && (l.is_vacant === true || l.lease_state === '공실' || VACANT_RE.test(text));
    if (!isOwnerUse && !isVacant) continue;
    count += 1;
    const py = leaseAreaPyeong(l);
    if (py == null) {
      areaKnown = false;
      continue;
    }
    if (isOwnerUse) ownerUsePyeong += py;
    else vacantPyeong += py;
  }
  return {
    vacantPyeong: Number(vacantPyeong.toFixed(2)),
    ownerUsePyeong: Number(ownerUsePyeong.toFixed(2)),
    hasVacantOrOwnerUse: count > 0,
    areaKnown,
  };
}

/* ─────────────────────────── YieldSet 빌더 ─────────────────────────── */

export interface BuildYieldSetParams {
  annualRentKrw: number;
  askingPriceKrw: number;
  depositKrw?: number;
  /** FinancialOutputs.annualNoi.base (원) */
  noiBaseKrw?: number | null;
  /** FinancialOutputs.capRate.base (%) — 있으면 그대로 사용 (요약 슬라이드 값과 동일) */
  noiCapRatePct?: number | null;
  opexPct?: number | null;
  opexSource?: OpexSource;
  vacancyReservePct?: number | null;
  actualVacancyPct?: number | null;
  floorLeases?: unknown;
  /** broker_extras.target_rent_per_pyeong_manwon (만원/평/월) */
  targetRentPerPyeongManwon?: number | null;
}

export function buildYieldSet(p: BuildYieldSetParams): YieldSet {
  const annualRent = pos(p.annualRentKrw) ?? 0;
  const price = pos(p.askingPriceKrw) ?? 0;
  const deposit = Math.max(0, Number.isFinite(Number(p.depositKrw)) ? Number(p.depositKrw) : 0);
  const net = price - deposit;
  const reservePct = p.vacancyReservePct != null && Number.isFinite(p.vacancyReservePct) ? p.vacancyReservePct : null;
  const target = pos(p.targetRentPerPyeongManwon);

  const grossYieldOnPrice = price > 0 && annualRent > 0 ? r2((annualRent / price) * 100) : null;
  const grossYieldNetOfDeposit = net > 0 && annualRent > 0 ? r2((annualRent / net) * 100) : null;

  const noiBase = p.noiBaseKrw != null && Number.isFinite(p.noiBaseKrw) ? p.noiBaseKrw : null;
  const noiCapRate = pos(p.noiCapRatePct) ?? (price > 0 && noiBase != null && noiBase > 0 ? r2((noiBase / price) * 100) : null);

  // ④ 안정화 수익률
  let stabilized: StabilizedYield | null = null;
  const area = summarizeVacantOwnerUseArea(p.floorLeases);
  const appliedArea = area.vacantPyeong + area.ownerUsePyeong;
  if (net > 0 && annualRent > 0 && target != null && area.areaKnown && appliedArea > 0) {
    const addedRentKrw = appliedArea * target * 12 * 10_000; // 만원/평/월 → 원/년
    stabilized = {
      kind: 'target_rent',
      value: r2(((annualRent + addedRentKrw) / net) * 100),
      label: YIELD_LABELS.stabilizedTargetRent,
      caption: buildTargetRentCaption(area, target),
      appliedAreaPyeong: Number(appliedArea.toFixed(1)),
    };
  } else if (net > 0 && annualRent > 0 && reservePct != null && reservePct > 0 && reservePct < 100) {
    stabilized = {
      kind: 'reserve_excluded',
      value: r2(((annualRent / (1 - reservePct / 100)) / net) * 100),
      label: stabilizedReserveLabel(reservePct),
      caption: null,
    };
  }

  return {
    grossYieldOnPrice,
    grossYieldNetOfDeposit,
    noiCapRate,
    stabilized,
    annualRentKrw: annualRent,
    noiBaseKrw: noiBase,
    assumptions: {
      opexPct: p.opexPct != null && Number.isFinite(p.opexPct) ? p.opexPct : null,
      opexSource: p.opexSource ?? 'assumed',
      vacancyReservePct: reservePct,
      actualVacancyPct: p.actualVacancyPct != null && Number.isFinite(p.actualVacancyPct) ? p.actualVacancyPct : null,
      depositKrw: deposit,
      targetRentPerPyeongManwon: target,
    },
  };
}

function buildTargetRentCaption(area: VacantAreaSummary, targetManwon: number): string {
  const kinds = [area.vacantPyeong > 0 ? '공실' : '', area.ownerUsePyeong > 0 ? '자가사용' : ''].filter(Boolean).join('·');
  const total = Number((area.vacantPyeong + area.ownerUsePyeong).toFixed(1));
  return `${kinds} ${total.toLocaleString()}평을 목표임대료 평당 ${trimNum(targetManwon, 2)}만원으로 임대 가정 (중개인 입력)`;
}

/* ─────────────────────────── 요약 슬라이드 부제 / 각주 ─────────────────────────── */

const opexVerb = (src: OpexSource | undefined): string => (src === 'user' ? '제공' : '가정');

/**
 * 요약 Cap Rate 카드 부제. 비율을 모르면 숫자를 지어내지 않는다.
 *  - 알 때:  '운영비 18% 가정 · 공실충당 5%'  / '운영비 12% 제공 · 공실충당 5%'
 *  - 모를 때: '운영비·공실충당 차감 후'
 */
export function summaryCapRateSub(a: {
  opexPct?: number | null;
  opexSource?: OpexSource;
  vacancyReservePct?: number | null;
}): string {
  const hasOpex = a.opexPct != null && Number.isFinite(a.opexPct);
  const hasVac = a.vacancyReservePct != null && Number.isFinite(a.vacancyReservePct) && a.vacancyReservePct > 0;
  if (!hasOpex && !hasVac) return '운영비·공실충당 차감 후';
  const parts: string[] = [];
  if (hasOpex) parts.push(`운영비 ${trimNum(a.opexPct as number)}% ${opexVerb(a.opexSource)}`);
  else parts.push('운영비 차감');
  if (hasVac) parts.push(`공실충당 ${trimNum(a.vacancyReservePct as number)}%`);
  return parts.join(' · ');
}

/** 수익률 슬라이드 각주 (8pt 한 줄). 모르는 값은 생략한다. */
export function yieldFootnote(a: YieldAssumptions): string {
  const opex = a.opexPct != null
    ? `운영비율 ${trimNum(a.opexPct)}%(${a.opexSource === 'user' ? '중개인 제공' : '가정'})`
    : '운영비율 가정';
  const vac = a.vacancyReservePct != null && a.vacancyReservePct > 0 ? `, 공실충당 ${trimNum(a.vacancyReservePct)}%` : '';
  return `※ ${opex}${vac}, 보증금 승계 가정. 임대수익률은 운영비 차감 전, Cap Rate는 차감 후.`;
}

/* ─────────────────────────── 문서 body → YieldSet ─────────────────────────── */

const numOrNull = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * document_objects.body에서 YieldSet을 만든다 — 요약 슬라이드(heroCard.capRateBase)와 수익률 슬라이드가 같은
 * body.financials(FinancialCalculator 산출)를 읽으므로 같은 지표는 같은 값이다.
 *
 * 레거시 문서(D10 이전 financials에 noiBaseKrw/opexPct/vacancyReservePct 없음)는 보존된 값에서 역산한다:
 *  - 공실충당 = 1 − 임대수익률 ÷ 공실충당 제외 수익률 (정수 % 반올림)
 *  - 운영비율 = (연 임대료×(1−공실충당) − NOI) ÷ 연 임대료
 */
export function buildYieldSetFromBody(body: Record<string, any> | null | undefined): YieldSet {
  const b = body ?? {};
  const fin = (b.financials ?? {}) as Record<string, any>;
  const hero = (b.heroCard ?? {}) as Record<string, any>;
  const ssot = (b.ssot_summary ?? {}) as Record<string, any>;

  const askKrw = (numOrNull(ssot.asking_price_manwon ?? b.asking_price_manwon) ?? 0) * 10_000;
  const depositKrw = numOrNull(fin.depositKrw) ?? (numOrNull(ssot.total_deposit_manwon) ?? 0) * 10_000;
  const finRentKrw = (numOrNull(fin.annualRentBil) ?? 0) * 1e8;
  const annualRentKrw = finRentKrw > 0 ? finRentKrw : (numOrNull(ssot.monthly_rent_total_krw) ?? 0) * 12;

  const noiBaseKrw = numOrNull(fin.noiBaseKrw) ?? numOrNull(fin.annualNoi?.base);
  const noiCapRatePct = numOrNull(fin.capRate?.base) ?? numOrNull(hero.capRateBase);

  let reservePct = numOrNull(fin.vacancyReservePct) ?? numOrNull(hero.vacancyReservePct);
  if (reservePct == null) {
    const g = numOrNull(fin.grossYieldOnEquity);
    const s = numOrNull(fin.grossYieldStabilized);
    if (g != null && s != null && g > 0 && s > g) reservePct = Math.round((1 - g / s) * 100);
  }

  let opexPct = numOrNull(fin.opexPct) ?? numOrNull(hero.opexPct);
  if (opexPct == null && annualRentKrw > 0 && noiBaseKrw != null && noiBaseKrw > 0 && reservePct != null) {
    const opexKrw = annualRentKrw * (1 - reservePct / 100) - noiBaseKrw;
    if (opexKrw >= 0) opexPct = parseFloat(((opexKrw / annualRentKrw) * 100).toFixed(1));
  }

  const opexSource: OpexSource = (fin.opexSource ?? hero.opexSource) === 'user' ? 'user' : 'assumed';
  const vacPct = numOrNull(ssot.vacancy_pct);

  return buildYieldSet({
    annualRentKrw,
    askingPriceKrw: askKrw,
    depositKrw,
    noiBaseKrw,
    noiCapRatePct,
    opexPct,
    opexSource,
    vacancyReservePct: reservePct,
    actualVacancyPct: vacPct != null && vacPct > 0 ? vacPct : null,
    floorLeases: b.floor_leases,
    // Phase C가 추가하는 중개인 입력 — 필드가 아직 없을 수 있으므로 방어적으로 읽는다.
    targetRentPerPyeongManwon: numOrNull(b.broker_extras?.target_rent_per_pyeong_manwon),
  });
}
