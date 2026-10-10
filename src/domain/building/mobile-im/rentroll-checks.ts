/**
 * @file rentroll-checks.ts
 * @description 렌트롤 v1.5 검증 (자동검증 시트 V01~V13 코드 재계산) + 면적 단위 혼동 판정(V12).
 *
 * 스펙: docs/RENTROLL_v1.3_to_v1.5.md §3.2(V01~V13), §6.4(판정 로직), §8(하면 안 되는 것)
 *
 * - 입력은 프로덕션 형태(`floor_leases`: snake_case, 금액 만원, 면적 ㎡ 정본)다. 내부 금액 계산은 원 단위.
 * - 엑셀 캐시값(AC/AD 등)은 쓰지 않는다. 같은 규칙을 lease-math 순수 함수로 재계산한다.
 * - 단위를 추측해 자동 보정하지 않는다 (§8). 차단/해제 두 길만 있다.
 */
import {
  EVIDENCE_LEVELS,
  PAYMENT_STATUSES,
  PYEONG_TO_SQM_V15,
  type AreaInputUnit,
  type RentRollIssue,
  type RentRollMarketRent,
} from './rentroll-meta';
import {
  amountCheck,
  expiryBucket,
  groupContracts,
  isContractRepresentative,
  leaseAmountsKrw,
  parseYmd,
  resolveEvaluationDate,
  resolveLedger,
  type LeaseInput,
} from './lease-math';
import { isNonLeasableLeaseRow, resolveLeaseOccupancy, sumLeasedRentRoll } from './lease-vacancy';
import { buildYieldSet } from './yield-set';

type LeaseLike = Record<string, any> | null | undefined;

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** V12 임계값 (§6.4-7): 임대면적 합 ÷ 연면적 > 2 또는 < 0.45 */
export const AREA_UNIT_RATIO_MAX = 2;
export const AREA_UNIT_RATIO_MIN = 0.45;

/** 행의 임대면적(㎡). snake_case(area_sqm) 우선, camelCase(leaseAreaSqm) 폴백. */
function rowAreaSqm(r: LeaseLike): number {
  if (!r) return 0;
  const l = r as Record<string, any>;
  return num(l.area_sqm ?? l.leaseAreaSqm) ?? 0;
}

/** 임대면적(㎡) 합계 — 모든 행(공실·자가사용 포함, V03 정의와 동일) */
export function sumLeaseAreaSqm(rows: ReadonlyArray<LeaseLike> | null | undefined): number {
  return (Array.isArray(rows) ? rows : []).reduce((a: number, r) => a + rowAreaSqm(r), 0);
}

export function areaUnitMismatchMessage(ratio: number): string {
  return ratio > AREA_UNIT_RATIO_MAX
    ? `⚠ 단위 혼동 의심 — 임대면적 합이 연면적의 ${ratio.toFixed(1)}배입니다. G9(㎡/평)와 면적 숫자를 확인하세요.`
    : `⚠ 단위 혼동 의심 — 임대면적 합이 연면적의 ${(ratio * 100).toFixed(1)}%입니다. G9(㎡/평)와 면적 숫자를 확인하세요 (일부 층·구분소유 매각이면 사유를 적어 해제).`;
}

/**
 * V12 — 면적 단위 혼동 판정 (§6.4-7 그대로).
 *  - gfa 없음 / 면적 합 0 → AREA_UNIT_UNCHECKED (경고, 차단 아님)
 *  - Σarea_sqm ÷ gfa_sqm > 2 또는 < 0.45 → AREA_UNIT_MISMATCH (blocking, overridable)
 *  - 정상 → null
 * gfaSqm(J4)은 항상 ㎡ — 환산하지 않는다.
 */
export function checkAreaUnit(
  rows: ReadonlyArray<LeaseLike> | null | undefined,
  gfaSqm: number | null | undefined,
): RentRollIssue | null {
  const sum = sumLeaseAreaSqm(rows);
  const gfa = num(gfaSqm);
  if (!gfa || gfa <= 0 || sum === 0) {
    return {
      code: 'AREA_UNIT_UNCHECKED',
      level: 'warning',
      message: '면적 단위 판정 보류 — 연면적(J4) 또는 임대면적 합이 없습니다.',
    };
  }
  const ratio = sum / gfa;
  if (ratio > AREA_UNIT_RATIO_MAX || ratio < AREA_UNIT_RATIO_MIN) {
    return {
      code: 'AREA_UNIT_MISMATCH',
      level: 'blocking',
      ratio,
      overridable: true,
      message: areaUnitMismatchMessage(ratio),
    };
  }
  return null;
}

/* ═══════════════════════════ V01 ~ V13 (자동검증 시트 재계산) ═══════════════════════════ */

export type RentrollCheckCode =
  | 'V01' | 'V02' | 'V03' | 'V04' | 'V05' | 'V06' | 'V07'
  | 'V08' | 'V09' | 'V10' | 'V11' | 'V12' | 'V13';

/** ok = 정상 · warn = 비차단 경고 · block = 발행 차단(해제 가능 여부는 overridden/게이트가 판단) · info = 참고/보류 */
export type RentrollCheckLevel = 'ok' | 'warn' | 'block' | 'info';

export type RentrollCheckValue = number | string | boolean | null | { [k: string]: number | string | boolean | null };

export interface RentrollCheckResult {
  code: RentrollCheckCode;
  level: RentrollCheckLevel;
  message: string;
  value?: RentrollCheckValue;
  /** V12 — 중개인이 사유를 적어 차단을 해제한 경우 true (level 은 'warn' 으로 내려간다) */
  overridden?: boolean;
}

export type RentrollChecks = Record<RentrollCheckCode, RentrollCheckResult>;

export interface ComputeRentrollChecksParams {
  rows: ReadonlyArray<LeaseInput>;
  /** J4 연면적 (㎡ 고정) */
  gfaSqm?: number | null;
  /** J3 매각(희망)가 (원) */
  askingPriceKrw?: number | null;
  /** J8 기타수입 (원/월) */
  otherIncomeKrw?: number | null;
  /** J5~J7 + M5~M7 */
  marketRent?: RentRollMarketRent | null;
  /** C5 렌트롤 기준일 (비면 now 기준 오늘) */
  asOf?: string | Date | number | null;
  areaInputUnit?: AreaInputUnit;
  /**
   * 신뢰 가능한 건축물대장 연면적(㎡) — J4 가 비었을 때만 쓰는 **보조 판정**용.
   * 보조 판정은 경고만 낸다 (차단하지 않는다). 신뢰 여부(isRegisterTrustworthy)는 호출자가 판단한다.
   */
  registerGfaSqm?: number | null;
  /** V12 해제 기록 — reason 이 비어 있지 않으면 차단 해제 */
  areaOverride?: { reason?: string | null; by?: string; at?: string } | null;
  now?: Date;
}

const r1 = (n: number): number => Math.round(n * 10) / 10;
const posNum = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};
const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

const AUX_PREFIX = 'J4 없음 — 건축물대장 연면적 기준 보조 판정';

/**
 * 렌트롤 V01~V13 코드 재계산. 엑셀 자동검증 시트의 캐시를 믿지 않는다 (스펙 §3.2, §8).
 * 순수 함수 — 결과는 doc.body.rentroll_checks 로 저장하고 게이트(quality-gates)가 V01·V12 를 읽는다.
 */
export function computeRentrollChecks(p: ComputeRentrollChecksParams): RentrollChecks {
  const rows = (Array.isArray(p.rows) ? p.rows : []).filter(Boolean);
  const now = p.now ?? new Date();
  const unit: AreaInputUnit = p.areaInputUnit === 'pyeong' ? 'pyeong' : 'sqm';
  const evalDate = resolveEvaluationDate(p.asOf, now);
  const evalYmd = evalDate.toISOString().slice(0, 10);
  const asOfGiven = parseYmd(p.asOf) != null;

  const live = rows.filter((r) => resolveLeaseOccupancy(r) === '임대중' && !isNonLeasableLeaseRow(r));
  const out = {} as RentrollChecks;
  const set = (c: RentrollCheckResult) => { out[c.code] = c; };

  /* ── V01 통합계약 금액 — 계약 단위 '월세 누락'·'금액 중복' 0건이어야 발행 ── */
  {
    let rentMissing = 0, duplicate = 0, mgmtMissing = 0, ok = 0;
    for (const g of groupContracts(rows)) {
      const liveRow = g.rows.find((r) => resolveLeaseOccupancy(r) === '임대중' && !isNonLeasableLeaseRow(r));
      if (!liveRow) continue;
      const a = amountCheck(liveRow, rows);
      if (a === '월세 누락') rentMissing++;
      else if (a === '금액 중복') duplicate++;
      else if (a === '관리비 누락') mgmtMissing++;
      else if (a === 'OK') ok++;
    }
    const value = { rentMissing, duplicate, mgmtMissing, ok };
    if (live.length === 0) {
      set({ code: 'V01', level: 'info', message: '임대중 호실이 없어 금액 판정 대상이 없습니다.', value });
    } else if (rentMissing + duplicate > 0) {
      const parts = [rentMissing ? `월세 누락 ${rentMissing}건` : '', duplicate ? `금액 중복 ${duplicate}건` : ''].filter(Boolean).join(' · ');
      set({
        code: 'V01', level: 'block', value,
        message: `${parts} — 통합계약은 그룹 대표 행 1개에만 보증금·월세·관리비를 적어야 발행할 수 있습니다.`,
      });
    } else {
      set({
        code: 'V01', level: 'ok', value,
        message: mgmtMissing ? `계약 단위 금액 정상 (관리비 누락 ${mgmtMissing}건 — 참고)` : '계약 단위 금액 정상',
      });
    }
  }

  /* ── V02 평가 기준일 ── */
  set(asOfGiven
    ? { code: 'V02', level: 'ok', message: `평가 기준일 ${evalYmd} (렌트롤 기준일)`, value: evalYmd }
    : { code: 'V02', level: 'warn', message: `렌트롤 기준일(C5)이 비어 오늘(${evalYmd}) 기준으로 계산했습니다 — 날짜가 바뀌면 만기 구간·갱신권 잔여가 달라집니다.`, value: evalYmd });

  /* ── 면적 판정 공통 ── */
  const areaSum = sumLeaseAreaSqm(rows);
  const gfa = posNum(p.gfaSqm);
  const reg = posNum(p.registerGfaSqm);
  const auxOnly = gfa == null && reg != null; // J4 없음 + 신뢰 대장 → 보조 판정(경고만)
  const baseGfa = gfa ?? reg;
  const ratio = baseGfa != null && areaSum > 0 ? areaSum / baseGfa : null;

  /* ── V03 임대면적 합 ÷ 연면적 (75% 미만 = 호실 누락 의심, 100% 초과 = 면적 오기 의심) ── */
  if (ratio == null) {
    set({ code: 'V03', level: 'warn', message: baseGfa == null ? '판정 보류 — 연면적(J4)이 없습니다.' : '판정 보류 — 임대면적 합이 없습니다.', value: null });
  } else {
    const pct = r1(ratio * 100);
    const pre = auxOnly ? `${AUX_PREFIX}: ` : '';
    const detail = ratio < 0.75 ? '75% 미만 — 호실 누락 의심' : ratio > 1 ? '100% 초과 — 면적 오기 의심' : '정상 범위';
    // 보조 판정은 정상이어도 'info' (J4 가 정본이 아니므로 ok 로 단정하지 않음), 이상이면 warn 까지만
    const level: RentrollCheckLevel = ratio < 0.75 || ratio > 1 ? 'warn' : auxOnly ? 'info' : 'ok';
    set({ code: 'V03', level, message: `${pre}임대면적 합 ÷ 연면적 = ${pct.toFixed(1)}% (${detail})`, value: pct });
  }

  /* ── V04 단순 수익률 (정본) = ΣH×12 ÷ (J3 − ΣG) / V05 기타수입 포함 ── */
  {
    let rentKrw = 0, depositKrw = 0;
    for (const r of live) {
      const a = leaseAmountsKrw(r);
      rentKrw += a.rentKrw ?? 0;
      depositKrw += a.depositKrw ?? 0;
    }
    const price = posNum(p.askingPriceKrw);
    const other = posNum(p.otherIncomeKrw);
    const ys = buildYieldSet({ annualRentKrw: rentKrw * 12, askingPriceKrw: price ?? 0, depositKrw, otherIncomeKrw: other });
    if (ys.grossYieldNetOfDeposit == null) {
      const why = price == null ? '매각가(J3)가 없어' : (price - depositKrw) <= 0 ? '매각가가 보증금 이하여서' : '월세 합이 없어';
      set({ code: 'V04', level: 'info', message: `${why} 수익률 판정을 보류합니다.`, value: null });
    } else {
      set({
        code: 'V04', level: 'ok', value: ys.grossYieldNetOfDeposit,
        message: `단순 수익률 ${ys.grossYieldNetOfDeposit.toFixed(2)}% = 월세 합 ${fmtInt(rentKrw)}원 × 12 ÷ (매각가 − 보증금 ${fmtInt(depositKrw)}원)`,
      });
    }
    if (ys.grossYieldInclOtherIncome == null) {
      set({ code: 'V05', level: 'info', message: other == null ? '기타수입(J8) 없음' : '수익률 판정 보류 (V04 와 동일 사유)', value: null });
    } else {
      set({
        code: 'V05', level: 'ok',
        value: { pct: ys.grossYieldInclOtherIncome, otherIncomeKrw: other },
        message: `기타수입 포함 수익률 ${ys.grossYieldInclOtherIncome.toFixed(2)}% (기타수입 월 ${fmtInt(other as number)}원 — IM 에는 별도 줄)`,
      });
    }
  }

  /* ── V06 12개월 내 만기 + 만료 경과 월세 비중 (계약 단위 월세, AC 재계산) ── */
  {
    let total = 0, expiring = 0, expired = 0, within12 = 0;
    for (const r of live) {
      const rent = leaseAmountsKrw(r).rentKrw ?? 0;
      if (rent <= 0) continue;
      total += rent;
      const b = expiryBucket(r, evalDate);
      if (b === '만료 경과') { expiring += rent; expired += rent; }
      else if (b === '12개월 내') { expiring += rent; within12 += rent; }
    }
    if (total <= 0) {
      set({ code: 'V06', level: 'info', message: '월세 합이 없어 만기 비중 판정을 보류합니다.', value: null });
    } else {
      const pct = r1((expiring / total) * 100);
      set({
        code: 'V06', level: 'info',
        value: { pct, expiredPct: r1((expired / total) * 100), within12Pct: r1((within12 / total) * 100) },
        message: `12개월 내 만기·만료 경과 월세 비중 ${pct.toFixed(1)}% (기준일 ${evalYmd})`,
      });
    }
  }

  /* ── V07 근거 분포 · V08 입금 확인 · V09 렌트프리 (계약 단위 = 월세가 적힌 대표 행) ── */
  const reps = live.filter((r) => isContractRepresentative(r, rows));
  {
    const cnt = { contract: 0, seller: 0, oral: 0, missing: 0 };
    for (const r of reps) {
      const e = String((r as Record<string, any>).evidence_level ?? '').trim();
      if (e === EVIDENCE_LEVELS[0]) cnt.contract++;
      else if (e === EVIDENCE_LEVELS[1]) cnt.seller++;
      else if (e === EVIDENCE_LEVELS[2]) cnt.oral++;
      else cnt.missing++;
    }
    set({
      code: 'V07', level: 'info', value: { ...cnt, total: reps.length },
      message: reps.length === 0
        ? '월세가 적힌 계약이 없습니다.'
        : `근거 — 계약서 원본 ${cnt.contract} · 매도인 렌트롤 ${cnt.seller} · 구두 ${cnt.oral} · 미기재 ${cnt.missing} (계약 ${reps.length}건)`,
    });
  }
  {
    const cnt = { normal: 0, overdue: 0, unconfirmed: 0, missing: 0 };
    for (const r of reps) {
      const s = String((r as Record<string, any>).payment_status ?? '').trim();
      if (s === PAYMENT_STATUSES[0]) cnt.normal++;
      else if (s === PAYMENT_STATUSES[1]) cnt.overdue++;
      else if (s === PAYMENT_STATUSES[2]) cnt.unconfirmed++;
      else cnt.missing++;
    }
    const flagged = cnt.overdue + cnt.unconfirmed;
    const noneEntered = reps.length > 0 && cnt.missing === reps.length;
    set({
      code: 'V08',
      level: flagged > 0 ? 'warn' : noneEntered ? 'info' : 'ok',
      value: { ...cnt, flagged },
      message: noneEntered
        ? '입금 확인(최근 12개월) 미입력'
        : `입금 확인 — 연체 ${cnt.overdue}건 · 미확인 ${cnt.unconfirmed}건 (계약 ${reps.length}건 중)`,
    });
  }
  {
    const free = live.filter((r) => (posNum((r as Record<string, any>).rent_free_months) ?? 0) > 0);
    set({
      code: 'V09', level: free.length > 0 ? 'info' : 'ok', value: free.length,
      message: free.length > 0 ? `렌트프리 잔여 호실 ${free.length}개` : '렌트프리 호실 없음',
    });
  }

  /* ── V10 시장 임대료 입력 / V11 R3+ 고품질 IM 준비 ── */
  const mr = p.marketRent ?? {};
  const rates = [mr.market_rent_1f, mr.market_rent_upper, mr.market_rent_basement];
  const sources = [mr.market_rent_1f_source, mr.market_rent_upper_source, mr.market_rent_basement_source];
  const rateCount = rates.filter((v) => posNum(v) != null).length;
  const sourceCount = sources.filter((v) => String(v ?? '').trim() !== '').length;
  const withSource = rates.filter((v, i) => posNum(v) != null && String(sources[i] ?? '').trim() !== '').length;
  set({
    code: 'V10',
    level: rateCount > sourceCount ? 'warn' : rateCount === 0 ? 'info' : 'ok',
    value: { rates: rateCount, sources: sourceCount, ratesWithSource: withSource },
    message: rateCount === 0
      ? '시장 임대료(J5~J7) 미입력'
      : `시장 임대료 ${rateCount}개 · 출처 ${sourceCount}개${rateCount > sourceCount ? ' — 출처를 적어야 IM 에 인용됩니다' : ''}`,
  });
  {
    const resolution = resolveLedger(rows, { asOf: p.asOf });
    const evidenceMissing = live.filter((r) => !(EVIDENCE_LEVELS as ReadonlyArray<string>).includes(String((r as Record<string, any>).evidence_level ?? '').trim())).length;
    const lacks: string[] = [];
    if (resolution !== 'R3') lacks.push(`해상도 ${resolution}(R3 필요)`);
    if (withSource < 1) lacks.push('출처 있는 시장 임대료 없음');
    if (live.length === 0 || evidenceMissing > 0) lacks.push(live.length === 0 ? '임대중 행 없음' : `근거 미기재 ${evidenceMissing}행`);
    set({
      code: 'V11', level: lacks.length === 0 ? 'ok' : 'info',
      value: { resolution, marketRentWithSource: withSource, evidenceMissingRows: evidenceMissing, ready: lacks.length === 0 },
      message: lacks.length === 0 ? 'R3+ 고품질 IM 준비 완료' : `R3+ 미충족 — ${lacks.join(' · ')}`,
    });
  }

  /* ── V12 면적 단위 혼동 (발행 차단, 사유 입력 시 해제) / 보조 판정은 경고만 ── */
  {
    const reason = String(p.areaOverride?.reason ?? '').trim();
    if (auxOnly) {
      const issue = checkAreaUnit(rows, reg);
      if (issue?.code === 'AREA_UNIT_MISMATCH') {
        set({ code: 'V12', level: 'warn', value: issue.ratio ?? null, message: `${AUX_PREFIX}: ${issue.message}` });
      } else if (issue) {
        set({ code: 'V12', level: 'warn', value: null, message: `${AUX_PREFIX}: 판정 보류 — 임대면적 합이 없습니다.` });
      } else {
        set({ code: 'V12', level: 'info', value: ratio, message: `${AUX_PREFIX}: 정상 (임대면적 합 ÷ 연면적 ${r1((ratio as number) * 100).toFixed(1)}%)` });
      }
    } else {
      const issue = checkAreaUnit(rows, gfa);
      if (issue === null) {
        set({ code: 'V12', level: 'ok', value: ratio, message: '정상' });
      } else if (issue.code === 'AREA_UNIT_MISMATCH') {
        if (reason) {
          set({ code: 'V12', level: 'warn', overridden: true, value: issue.ratio ?? null, message: `${issue.message} — 사유 입력으로 해제: ${reason}` });
        } else {
          set({ code: 'V12', level: 'block', overridden: false, value: issue.ratio ?? null, message: issue.message });
        }
      } else {
        set({ code: 'V12', level: 'warn', value: null, message: gfa == null ? '판정 보류 — 연면적(J4)이 없습니다.' : '판정 보류 — 임대면적 합이 없습니다.' });
      }
    }
  }

  /* ── V13 면적 입력 단위 ── */
  set({
    code: 'V13', level: 'info', value: unit,
    message: unit === 'pyeong'
      ? `평 — C·D열 × ${PYEONG_TO_SQM_V15} = AE·AF열(㎡)`
      : '㎡ — C·D열 = AE·AF열(㎡)',
  });

  return out;
}

/** level 이 'block' 인 검증 (V01·V12). 해제된 V12 는 'warn' 이므로 포함되지 않는다. */
export function blockingRentrollChecks(checks: Partial<RentrollChecks> | null | undefined): RentrollCheckResult[] {
  return Object.values(checks ?? {}).filter((c): c is RentrollCheckResult => !!c && c.level === 'block');
}

/**
 * 월 임대료(원) 해석기 — FinancialCalculator 의 `monthlyRentKrw` 입력용 (X3).
 * 1순위 supplemental.monthly_rent_total_krw(>0), 2순위 렌트롤 임대중 행 합(sumLeasedRentRoll), 없으면 0.
 * NOI·Cap Rate 를 월세로 넣지 않는다 (NOI ÷ 12 ≠ 월 임대료).
 */
export function resolveMonthlyRentKrw(
  supplemental: { monthly_rent_total_krw?: unknown; floor_leases?: unknown } | null | undefined,
): number {
  const direct = posNum(supplemental?.monthly_rent_total_krw);
  if (direct != null) return direct;
  const leases = Array.isArray(supplemental?.floor_leases) ? (supplemental!.floor_leases as ReadonlyArray<LeaseLike>) : [];
  const sum = sumLeasedRentRoll(leases);
  return sum.rentManwon > 0 ? Math.round(sum.rentManwon * 10_000) : 0;
}
