/**
 * 연면적 해석 우선순위 (표기용).
 *
 *   중개인 명시 입력(㎡ > 평) > SSoT(공부) > 공공 건축물대장
 *
 * 렌트롤 임대면적 합은 공실·공용부·자가사용 누락 가능성이 있어 "연면적"이 아니므로
 * 표기값 후보에서 제외한다. (골든 E2E ig2/ig3: 공부 1,687.51㎡ 인데 임대면적 합 1,479㎡ 로 표기되던 결함)
 */
export interface TotalAreaSources {
  explicitSqm?: number | null;
  explicitPyeong?: number | null;
  ssotSqm?: number | null;
  publicRegisterSqm?: number | null;
}

const PYEONG_TO_SQM = 3.305785;

export function resolveTotalGrossAreaSqm(src: TotalAreaSources): number {
  const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return (
    n(src.explicitSqm) ||
    (n(src.explicitPyeong) ? n(src.explicitPyeong) * PYEONG_TO_SQM : 0) ||
    n(src.ssotSqm) ||
    n(src.publicRegisterSqm)
  );
}
