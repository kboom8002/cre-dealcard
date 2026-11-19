import { formatPriceRange, formatKrw } from '@/lib/deal-card/price-band';

/**
 * 기본 모드: 하한 내림 단일 밴드 ("90억대", "1조 2,000억대")
 * 범위 모드: >= 5% 폭 블라인드 범위 ("80~100억", "2,000~2,200억") — price-band SSOT 위임
 */
export function bandPriceDisplay(
  askingPriceManwon: number,
  mode: 'single' | 'range' = 'single'
): string {
  if (!askingPriceManwon || askingPriceManwon <= 0) {
    return '가격 협의';
  }

  const priceKrw = askingPriceManwon * 10_000;
  if (mode === 'range') {
    return formatPriceRange(priceKrw);
  }

  const eok = askingPriceManwon / 10_000;
  let stepEok: number;
  if (eok < 30) stepEok = 5;
  else if (eok < 100) stepEok = 10;
  else if (eok < 300) stepEok = 20;
  else if (eok < 1000) stepEok = 50;
  else if (eok < 2000) stepEok = 100;
  else if (eok < 4000) stepEok = 200;
  else if (eok < 10000) stepEok = 500;
  else stepEok = Math.max(1000, Math.ceil((eok * 0.05) / 1000) * 1000);

  const baseEok = eok < 5 ? 1 : Math.max(1, Math.floor(eok / stepEok) * stepEok);
  const bandKrw = baseEok * 100_000_000;
  return `${formatKrw(bandKrw)}대`;
}
