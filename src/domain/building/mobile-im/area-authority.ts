/**
 * 생성 경로 면적 정합 — LLM 본문(뷰어 마크다운)에 남는 '기각된 면적'을 정본 값으로 교정한다.
 *
 * 배경 (2026-10-10 income 골든 오라클, P2): PPTX 는 표시 해석기(display-areas)로 대장/중개인 값을 하나로 정하지만,
 * 뷰어 LLM 본문은 프롬프트에 섞여 들어간 중개인 오기 값(예: 연면적 1,141.15㎡ = 345.2평, 대지 424.6㎡ vs 대장 420.6㎡)을
 * 그대로 서술해 같은 물건의 면적이 면마다 달랐다. 프롬프트 입력 정렬(handler)이 1차 방어, 이 모듈이 2차 결정론적 안전망.
 *
 * 규칙 (보수적):
 *  - 기각 값(rejected)은 정본(authoritative)과 0.5% 이상 달라야 하고, 다른 정당한 값(protected: 정본·필지별·층별 면적)과 겹치지 않아야 한다.
 *  - '숫자 + ㎡/평' 형태만 교체 (단위 없는 숫자는 건드리지 않음). 소수 자릿수는 원문을 따른다.
 *  - LLM 무관 순수 함수.
 */

import { sqmToPyeong } from '@/lib/utils/area-conversion';

export interface AreaRewriteSpec {
  /** 정본 면적 (㎡) */
  authoritativeSqm: number;
  /** 정본이 아닌 것으로 판정된 면적 후보 (㎡) */
  rejectedSqm: number[];
}

const NUM_UNIT_RE = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(\s*)(㎡|m²|평)/g;

const REL_REJECT = 0.002; // 표기 반올림 허용
const MIN_DIFF = 0.005; // 정본과 이 이상 달라야 기각 값으로 인정

const near = (a: number, b: number, tol: number): boolean => b > 0 && Math.abs(a - b) / b <= tol;

/** 기각 후보 정제: 정본과 충분히 다르고 protected 와 겹치지 않는 값만 */
export function filterRejectedAreas(spec: AreaRewriteSpec, protectedSqm: number[]): number[] {
  const out: number[] = [];
  for (const r of spec.rejectedSqm) {
    if (!Number.isFinite(r) || r <= 0) continue;
    if (near(r, spec.authoritativeSqm, MIN_DIFF)) continue;
    if (protectedSqm.some(p => near(r, p, MIN_DIFF))) continue;
    if (out.some(o => near(r, o, 0.0005))) continue;
    out.push(r);
  }
  return out;
}

function format(value: number, decimals: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function rewriteRejectedAreas(
  markdown: string,
  specs: AreaRewriteSpec[],
  protectedSqm: number[],
): { text: string; replaced: number } {
  if (!markdown) return { text: markdown, replaced: 0 };
  const prepared = specs
    .filter(s => Number.isFinite(s.authoritativeSqm) && s.authoritativeSqm > 0)
    .map(s => ({ auth: s.authoritativeSqm, rejected: filterRejectedAreas(s, [...protectedSqm, s.authoritativeSqm, ...specs.map(x => x.authoritativeSqm)]) }))
    .filter(s => s.rejected.length > 0);
  if (prepared.length === 0) return { text: markdown, replaced: 0 };
  const allProtected = [...protectedSqm, ...specs.map(s => s.authoritativeSqm)];

  let replaced = 0;
  const text = markdown.replace(NUM_UNIT_RE, (whole, intPart: string, decPart: string | undefined, space: string, unit: string) => {
    const n = Number(`${intPart.replace(/,/g, '')}${decPart ?? ''}`);
    if (!Number.isFinite(n) || n <= 0) return whole;
    const decimals = decPart ? decPart.length - 1 : 0;
    const isPyeong = unit === '평';
    const toSqm = (v: number) => (isPyeong ? v / sqmToPyeong(1) : v);
    const asSqm = toSqm(n);
    // 정당한 값(정본·필지·층별)이면 그대로 — 평 표기는 반올림 오차가 커서 0.3% 허용
    const tol = isPyeong ? 0.003 : REL_REJECT;
    if (allProtected.some(p => near(asSqm, p, tol))) return whole;
    for (const s of prepared) {
      if (s.rejected.some(r => near(asSqm, r, tol))) {
        const nextVal = isPyeong ? sqmToPyeong(s.auth) : s.auth;
        replaced++;
        return `${format(nextVal, decimals)}${space}${unit}`;
      }
    }
    return whole;
  });
  return { text, replaced };
}
