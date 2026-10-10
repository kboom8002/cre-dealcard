// v1.5 렌트롤 오라클 계산 (엑셀 AE/AF/Y 수식과 동일). build-fixtures / derive-dataset 공용.
export const P2S = 3.305785;
export const r2 = (x) => Math.round(x * 100) / 100;

/** 입력 단위 값 → ㎡ 환산 (엑셀 ROUND(C*IF(G9="평",3.305785,1),2)) */
export const toSqm = (v, unit) => r2(v * (unit === "평" ? P2S : 1));
/** ㎡ 정본 → 평 입력값 (소수 2자리, 중개인이 적은 숫자) */
export const sqmToPy = (sqm) => r2(sqm / P2S);

/**
 * rows: [{ key, group, C, D, H, I, state }] — C/D 는 '입력 단위' 값.
 * 반환: AE/AF 합, 행별 Y(전용평당 월비용), 임대중 월세·보증금 합
 */
export function computeOracle(rows, unit) {
  const ae = rows.map((r) => (r.C == null ? null : toSqm(r.C, unit)));
  const af = rows.map((r) => (r.D == null ? null : toSqm(r.D, unit)));
  const sum = (a) => r2(a.reduce((s, v) => s + (v ?? 0), 0));
  const Y = rows.map((r, i) => {
    if (r.state !== "임대중" || r.H == null) return null;
    const cost = r.H + (r.I ?? 0);
    if (!r.group) return af[i] == null ? null : Math.round(cost / (af[i] / P2S));
    const members = rows.map((m, j) => ({ m, j })).filter(({ m }) => m.group === r.group);
    if (members.some(({ m }) => m.D == null)) return null;
    const gsum = members.reduce((s, { j }) => s + af[j], 0);
    return Math.round(cost / (gsum / P2S));
  });
  return {
    sumAE: sum(ae),
    sumAF: sum(af),
    Y,
    rentTotal: rows.reduce((s, r) => s + (r.H ?? 0), 0),
    depositTotal: rows.reduce((s, r) => s + (r.G ?? 0), 0),
    weightedExclusivePct: Math.round((sum(af) / sum(ae)) * 1000) / 10,
  };
}
