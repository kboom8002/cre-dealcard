// 스펙 §7 오라클(ΣAE 1441.15 / ΣAF 1175.00 / 평입력 1441.16·1175.05 / 혼동 4764.14 / Y14·Y15)을
// 모두 재현하는 8행 데이터를 시드 고정 난수 탐색으로 도출한다. 결과는 build-fixtures.mjs 의 DATASET 상수로 고정.
// 사용: node scripts/rentroll-v15/derive-dataset.mjs
import { computeOracle, sqmToPy, toSqm, r2 } from "./oracle-calc.mjs";

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260510);
const between = (lo, hi) => lo + rnd() * (hi - lo);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const PY = "\uD3C9"; // 평
const SQ = "\u33A1"; // ㎡

/** 평 입력 왕복 시 ㎡ 오차(센트) = round2(round2(D/3.305785)*3.305785) - D */
const delta = (sqm) => Math.round((toSqm(sqmToPy(sqm), PY) - sqm) * 100);
const range = (lo, hi) => { const a = []; for (let c = Math.round(lo * 100); c <= Math.round(hi * 100); c++) a.push(c / 100); return a; };
const withDelta = (lo, hi, ok) => range(lo, hi).filter((v) => ok(delta(v)));

const B1D = withDelta(255, 275, (d) => d >= 1);
// Y14 108,238 → 108,203 (Δ35) 이려면 평 왕복 오차 δ(센트) × 108238 / AF ≈ 35 → AF ≈ 30.9㎡(δ=+1) 또는 ≈ 61.9㎡(δ=+2)
const PHD = [...withDelta(28, 34, (d) => d === 1), ...withDelta(58, 66, (d) => d === 2)];
const WID = withDelta(190, 230, (d) => d >= 1);
const SFD = withDelta(80, 110, (d) => d >= 1);
const D2S = range(110, 130).filter((v) => delta(v) + delta(r2(205 - v)) === -1);

const GROUP_COST = 9_730_000;
for (let trial = 0; trial < 5_000_000; trial++) {
  const ratio = () => between(0.78, 0.86);
  const mk = (D) => ({ D, C: r2(D / ratio()) });
  const b1 = { C: 317.22, D: pick(B1D) };
  const ph = mk(pick(PHD));
  const nc1 = { D: 84.0, C: r2(84 / ratio()) };
  const D2 = pick(D2S);
  const nc2 = mk(D2);
  const nc5 = mk(r2(205 - D2));
  const wine = mk(pick(WID));
  const self4 = mk(pick(SFD));
  const others = [b1, ph, nc1, nc2, wine, self4, nc5];
  const D4 = r2(1175.0 - others.reduce((s, r) => s + r.D, 0));
  const C4 = r2(1441.15 - others.reduce((s, r) => s + r.C, 0));
  if (D4 < 200 || D4 > 290 || C4 <= D4) continue;
  const q = D4 / C4;
  if (q < 0.76 || q > 0.88) continue;
  const gym = { C: C4, D: D4 };
  // 행 순서: B1, 약국, 내과1F, 내과2F, 헬스장, 와인, 4F자가, 내과5F
  const sq = [b1, ph, nc1, nc2, gym, wine, self4, nc5];
  const mkRows = (unit, cost) =>
    sq.map((r, i) => ({
      C: unit === PY ? sqmToPy(r.C) : r.C,
      D: unit === PY ? sqmToPy(r.D) : r.D,
      group: [2, 3, 7].includes(i) ? "A" : "",
      state: [0, 6].includes(i) ? "자가사용" : "임대중",
      H: i === 1 ? cost : i === 2 ? GROUP_COST : i === 4 ? 1 : i === 5 ? 1 : null,
      I: 0,
    }));
  const py = computeOracle(mkRows(PY, 1_500_000), PY);
  if (py.sumAE !== 1441.16 || py.sumAF !== 1175.05) continue;
  const conf = computeOracle(sq.map((r) => ({ C: r.C, D: r.D, state: "자가사용" })), PY);
  if (conf.sumAE !== 4764.14) continue;
  const sqm = computeOracle(mkRows(SQ, 1_500_000), SQ);
  if (sqm.Y[2] !== 111299 || py.Y[2] !== 111302) continue;
  let found = null;
  for (let cost = 1_000_000; cost <= 1_900_000; cost += 1000) {
    const a = computeOracle(mkRows(SQ, cost), SQ).Y[1];
    const b = computeOracle(mkRows(PY, cost), PY).Y[1];
    if (a === 108238 && b === 108203) { found = cost; break; }
  }
  if (found == null) continue;
  console.log(JSON.stringify({ trial, pharmacyCost: found, rows: sq, sqmY: sqm.Y, pyY: py.Y, sums: { sqm: [sqm.sumAE, sqm.sumAF], py: [py.sumAE, py.sumAF], conf: conf.sumAE } }, null, 1));
  process.exit(0);
}
console.log("NOT FOUND", { B1D: B1D.length, PHD: PHD.length, WID: WID.length, SFD: SFD.length, D2S: D2S.length });
process.exitCode = 1;
