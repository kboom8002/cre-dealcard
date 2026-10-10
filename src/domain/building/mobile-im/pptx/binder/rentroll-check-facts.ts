/**
 * 렌트롤 v1.5 §9.1 — Basic IM A24 하단 각주 (순수 함수)
 *
 * body.rentroll_checks(V01..V13, 핸들러가 저장)에서 **계산된 사실**만 한 줄로 요약한다.
 * - V06 12개월 내 만기·만료 경과 월세 비중 / V07 근거 분포 / V08 입금 연체·미확인 / V09 렌트프리 호실
 * - 값이 없거나 0 이면 해당 조각 생략 (날조·빈 문구 금지). 조각이 하나도 없으면 null.
 * - 평가·권고 문구는 넣지 않는다 (사실만).
 */

type CheckLike = { code?: string; value?: unknown } | null | undefined;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function pick(checks: unknown, code: string): CheckLike {
  const c = obj(checks)?.[code];
  return c && typeof c === 'object' ? (c as CheckLike) : null;
}

/** 각주 한 줄. 사실이 없으면 null */
export function buildRentrollFactsNote(checks: unknown): string | null {
  if (!obj(checks)) return null;
  const parts: string[] = [];

  const v06 = obj(pick(checks, 'V06')?.value);
  const pct = num(v06?.pct);
  if (pct != null && pct > 0) parts.push(`12개월 내 만기·만료 경과 월세 ${pct.toFixed(1)}%`);

  const v07 = obj(pick(checks, 'V07')?.value);
  if (v07) {
    const contract = num(v07.contract) ?? 0;
    const seller = num(v07.seller) ?? 0;
    const oral = num(v07.oral) ?? 0;
    const ev: string[] = [];
    if (contract > 0) ev.push(`계약서 원본 ${contract}`);
    if (seller > 0) ev.push(`매도인 렌트롤 ${seller}`);
    if (oral > 0) ev.push(`구두 ${oral}`);
    if (ev.length > 0) parts.push(`근거 ${ev.join('·')}건`);
  }

  const v08 = obj(pick(checks, 'V08')?.value);
  if (v08) {
    const overdue = num(v08.overdue) ?? 0;
    const unconfirmed = num(v08.unconfirmed) ?? 0;
    const pay: string[] = [];
    if (overdue > 0) pay.push(`연체 ${overdue}`);
    if (unconfirmed > 0) pay.push(`미확인 ${unconfirmed}`);
    if (pay.length > 0) parts.push(`입금 ${pay.join('·')}건`);
  }

  const v09 = num(pick(checks, 'V09')?.value);
  if (v09 != null && v09 > 0) parts.push(`렌트프리 잔여 ${v09}개 호실`);

  return parts.length > 0 ? parts.join(' · ') : null;
}
