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
  small: { priceUnit: 5_0000_0000, areaUnit: 20, capRateUnit: 0.5 },   // <30억
  medium: { priceUnit: 10_0000_0000, areaUnit: 20, capRateUnit: 0.5 }, // 30~100억
  large: { priceUnit: 30_0000_0000, areaUnit: 20, capRateUnit: 0.5 },  // 100억+
};

function getBandConfig(priceKrw: number): BandingConfig {
  if (priceKrw < 30_0000_0000) return DEFAULT_BANDS.small;
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
  const unit = 0.5;
  const lower = Math.floor(exactPct / unit) * unit;
  const upper = lower + unit;
  return `${lower.toFixed(1)}~${upper.toFixed(1)}%대`;
}

/** Bands building era to a 5-year unit like "2010년대 초 준공" */
export function bandBuildingEra(approvalYear: number): string {
  if (approvalYear <= 0) return '준공연도 미상';
  const decade = Math.floor(approvalYear / 10) * 10;
  const yearInDecade = approvalYear % 10;
  const part = yearInDecade < 5 ? '초' : '후반';
  return `${decade}년대 ${part} 준공`;
}

/** Bands FAR headroom to a 20%p unit like "용적률 여유 100%p+" */
export function bandFarHeadroom(headroomPp: number): string {
  if (headroomPp <= 0) return '용적률 여유 없음';
  const unit = 20;
  const lower = Math.floor(headroomPp / unit) * unit;
  return `용적률 여유 ${lower}%p+`;
}

/** Translates road contact type into B2C Korean labels */
export function bandRoadContact(roadContactType: string): string {
  const type = roadContactType.toUpperCase();
  if (type.includes('WIDE_CORNER') || type.includes('MED_CORNER')) return '각지(코너)';
  if (type.includes('WIDE_ONE') || type.includes('MED_ONE')) return '대로변';
  if (type.includes('NARROW_ONE')) return '이면도로';
  if (type.includes('DEAD_END')) return '막다른 도로';
  return '도로접면 확인 필요';
}

export interface Band {
  label: string;
  lo: number;
  hi: number;
}

export function assertBandContains(band: Band, actual: number): void {
  if (actual < band.lo || actual > band.hi) {
    throw new Error(`밴드 위반 — ${band.label}에 실제값 ${actual} 없음 (범위: ${band.lo}~${band.hi})`);
  }
}

export function parseBandRange(bandString: string): Band | null {
  const match = bandString.match(/(\d+)~(\d+)/);
  if (!match) return null;
  return { label: bandString, lo: Number(match[1]), hi: Number(match[2]) };
}
