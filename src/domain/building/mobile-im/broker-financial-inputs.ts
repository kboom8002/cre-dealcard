/**
 * @file broker-financial-inputs.ts
 * @description 중개인 제시값(구조화 입력 + 원문 메모 명시값)을 운영/개발/자가사용 재무 입력으로 연결한다.
 *
 * 배경: 메모 파서(LLM)의 hospitality/development/ownerOccupied Signals 는 layers 에 저장되지 않아 생성 단계가
 *       메모 원문 값(ADR·OCC·GOP 마진·임대료 절감·손익분기·토지평당가)을 쓰지 못했고, 대신 가정 기본값
 *       (GOP 35%, 시장임대료 7만원/평)이 재무 산출·히어로카드에 영속되어 중개인 값과 충돌했다 (Rule 34).
 *
 * 원칙: 구조화 입력(바텀시트) 우선, 원문 메모 추출은 빈 값만 보충. LLM 호출 없음 · 값 창작 없음.
 */
import { resolveBrokerMemoFacts, resolveHotelOperating } from './pptx/binder/broker-memo-facts';
import type { FinancialInputs } from '@/domain/building/im-core/financial-calculator';

type Json = Record<string, any>;

const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * 원문 메모 명시값을 supplemental(hotel_operating / developmentSpec / occupancySpec)에 보충한다. (in-place)
 * 구조화 입력이 이미 값을 가진 키는 덮어쓰지 않는다.
 * @returns 보충된 키 목록 (로그용)
 */
export function supplementBrokerMemoFacts(
  supplemental: Json,
  memoText: string | null | undefined,
  posture: string,
): string[] {
  const filled: string[] = [];
  if (!supplemental || typeof memoText !== 'string' || !memoText.trim()) return filled;
  const memo = resolveBrokerMemoFacts({ raw_input: memoText }, undefined);

  if (posture === 'operating') {
    const merged = resolveHotelOperating({ supplemental, raw_input: memoText }, undefined);
    if (Object.keys(merged).length > 0) {
      const before = (supplemental.hotel_operating ?? {}) as Json;
      for (const k of Object.keys(merged)) if (before[k] === undefined || before[k] === null || before[k] === '' || before[k] === 0) filled.push(`hotel_operating.${k}`);
      supplemental.hotel_operating = merged;
    }
  }

  if (posture === 'development') {
    const ds = { ...((supplemental.developmentSpec ?? {}) as Json) };
    if (!num(ds.landPricePerPyeongManwon) && memo.development.landPricePerPyeongManwon) {
      ds.landPricePerPyeongManwon = memo.development.landPricePerPyeongManwon; filled.push('developmentSpec.landPricePerPyeongManwon');
    }
    if (!num(ds.maxFarPct) && memo.development.maxFarPct) {
      ds.maxFarPct = memo.development.maxFarPct; filled.push('developmentSpec.maxFarPct');
    }
    if (!num(ds.targetScalePyung) && !num(ds.targetScalePyeong) && memo.development.plannedGfaPyung) {
      ds.targetScalePyung = memo.development.plannedGfaPyung; filled.push('developmentSpec.targetScalePyung');
    }
    if (filled.some((k) => k.startsWith('developmentSpec.'))) supplemental.developmentSpec = ds;
  }

  if (posture === 'owner_occupied') {
    const os = { ...((supplemental.occupancySpec ?? {}) as Json) };
    if (!num(os.annualSavingsBil) && memo.owner.annualSavingsBil) {
      os.annualSavingsBil = memo.owner.annualSavingsBil; filled.push('occupancySpec.annualSavingsBil');
    }
    if (!num(os.breakevenYears) && memo.owner.breakevenYears) {
      os.breakevenYears = memo.owner.breakevenYears; filled.push('occupancySpec.breakevenYears');
    }
    if (filled.some((k) => k.startsWith('occupancySpec.'))) supplemental.occupancySpec = os;
  }
  return filled;
}

/**
 * supplemental 의 중개인 제시값 → calculateFinancials 입력 (포스처별). 값이 없으면 키 자체를 생략한다.
 */
export function brokerFinancialExtras(supplemental: Json | null | undefined, posture: string): Partial<FinancialInputs> {
  const s = (supplemental ?? {}) as Json;
  const out: Partial<FinancialInputs> = {};

  if (posture === 'operating') {
    const h = (s.hotel_operating ?? {}) as Json;
    const annualRevenueKrw = num(h.annual_revenue_krw);
    const gopMarginPct = num(h.gop_margin_pct);
    const gopKrw = num(h.annual_gop_krw);
    const adrKrw = num(h.adr_krw);
    const occPct = num(h.occupancy_rate_pct);
    const revparKrw = num(h.revpar_krw);
    if (annualRevenueKrw) out.annualRevenueKrw = annualRevenueKrw;
    if (gopMarginPct) out.gopMarginPct = gopMarginPct;
    if (gopKrw) out.gopKrw = gopKrw;
    if (adrKrw) out.adrKrw = adrKrw;
    if (occPct) out.occPct = occPct;
    if (revparKrw) out.revparKrw = revparKrw;
  }

  if (posture === 'owner_occupied') {
    const o = (s.occupancySpec ?? {}) as Json;
    const sav = num(o.annualSavingsBil);
    const be = num(o.breakevenYears);
    if (sav) out.brokerAnnualSavingsBil = sav;
    if (be) out.brokerBreakevenYears = be;
  }

  if (posture === 'development') {
    const d = (s.developmentSpec ?? {}) as Json;
    const lp = num(d.landPricePerPyeongManwon);
    if (lp) out.brokerLandPricePerPyeongManwon = lp;
  }
  return out;
}
