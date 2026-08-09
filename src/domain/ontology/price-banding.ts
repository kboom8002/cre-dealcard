/**
 * 기본 모드: 상한 편향 단일 밴드 ("90억대")
 * 범위 모드: 상한 편향 범위 ("80~90억대") — 브로커 토글 시
 */
export function bandPriceDisplay(
  askingPriceManwon: number,
  mode: 'single' | 'range' = 'single'
): string {
  if (!askingPriceManwon || askingPriceManwon <= 0) {
    return '가격 협의';
  }
  
  const eok = askingPriceManwon / 10000;
  let step: number;
  if (eok <= 50) step = 5;
  else if (eok <= 300) step = 10;
  else if (eok <= 1000) step = 50;
  else step = 100;

  if (mode === 'single') {
    // 상한 편향: ceil로 올림 → "90억대"
    const band = Math.ceil(eok / step) * step;
    return `${band}억대`;
  }
  
  // 범위 모드: 중심 기준 ±step, 상한 포함
  const center = Math.ceil(eok / step) * step;
  const lo = center - step;
  const hi = center;
  return `${lo}~${hi}억`;
}
