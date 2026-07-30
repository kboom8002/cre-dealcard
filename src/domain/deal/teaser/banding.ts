/**
 * @module Banding
 * @description Dynamic banding rules for teaser value display.
 * "Calculation is precise, display is banded" — teaser.md
 * @see docs/credal_v3/specs/teaser.md
 */

export interface BandingConfig {
  priceUnit: number;  // KRW band width
  areaUnit: number;   // pyung band width
  capRateUnit: number; // percentage band width
}

const DEFAULT_BANDS: Record<string, BandingConfig> = {
  small: { priceUnit: 1_0000_0000, areaUnit: 50, capRateUnit: 1 },   // <10억
  medium: { priceUnit: 10_0000_0000, areaUnit: 100, capRateUnit: 0.5 }, // 10~100억
  large: { priceUnit: 50_0000_0000, areaUnit: 500, capRateUnit: 0.5 },  // 100억+
};

function getBandConfig(priceKrw: number): BandingConfig {
  if (priceKrw < 10_0000_0000) return DEFAULT_BANDS.small;
  if (priceKrw < 100_0000_0000) return DEFAULT_BANDS.medium;
  return DEFAULT_BANDS.large;
}

/** Bands a price to a range string like "50~60억원대" */
export function bandPrice(exactKrw: number): string {
  if (exactKrw <= 0) return '가격 미정';
  const config = getBandConfig(exactKrw);
  const lower = Math.floor(exactKrw / config.priceUnit) * config.priceUnit;
  const upper = lower + config.priceUnit;
  const format = (v: number) => {
    if (v >= 1_0000_0000) return `${Math.round(v / 1_0000_0000)}억`;
    if (v >= 1_0000) return `${Math.round(v / 1_0000)}만`;
    return `${v}`;
  };
  return `${format(lower)}~${format(upper)}원대`;
}

/** Bands area to a range string like "300~400평대" */
export function bandArea(exactPyung: number): string {
  if (exactPyung <= 0) return '면적 미정';
  const config = getBandConfig(exactPyung * 3000_0000); // rough price estimate
  const unit = config.areaUnit;
  const lower = Math.floor(exactPyung / unit) * unit;
  const upper = lower + unit;
  return `${lower}~${upper}평대`;
}

/** Bands cap rate to a range string like "4~5%대" */
export function bandCapRate(exactPct: number): string {
  if (exactPct <= 0) return '수익률 미정';
  const unit = exactPct < 3 ? 0.5 : 1;
  const lower = Math.floor(exactPct / unit) * unit;
  const upper = lower + unit;
  return `${lower.toFixed(1)}~${upper.toFixed(1)}%대`;
}
