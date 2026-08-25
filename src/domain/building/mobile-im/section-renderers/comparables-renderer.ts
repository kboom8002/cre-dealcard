/**
 * @file comparables-renderer.ts  
 * @description F-1: 비교 매물 섹션 렌더러 (결정론)
 */

export interface ComparableItem {
  name: string;
  distanceKm: number;
  askingPriceKrw: number;
  pricePerPyeong: number;
  areaM2: number;
  capRatePct?: number;
  transactionDate?: string;
  note?: string;
}

export interface ComparablesInput {
  subjectName: string;
  subjectPricePerPyeong: number;
  comparables: ComparableItem[];
}

export interface SectionOutput {
  section_type: string;
  title: string;
  markdown: string;
  confidence: 'deterministic';
  provenance: string[];
}

export function renderComparables(input: ComparablesInput): SectionOutput {
  const lines: string[] = ['## 비교 매물 분석'];
  
  if (input.comparables.length === 0) {
    lines.push('');
    lines.push('> 비교 가능한 매물 데이터가 충분하지 않습니다.');
    return {
      section_type: 'comparables',
      title: '비교 매물 분석',
      markdown: lines.join('\n'),
      confidence: 'deterministic',
      provenance: [],
    };
  }
  
  // 비교 테이블
  lines.push('');
  lines.push('| 매물명 | 거리 | 평당가 | 수익률 | 면적(㎡) | 거래일 |');
  lines.push('|--------|------|--------|--------|---------|--------|');
  
  const sorted = [...input.comparables].sort((a, b) => a.distanceKm - b.distanceKm);
  for (const c of sorted) {
    const capRate = c.capRatePct ? `${c.capRatePct.toFixed(1)}%` : '-';
    const txDate = c.transactionDate ?? '-';
    lines.push(`| ${c.name} | ${c.distanceKm.toFixed(1)}km | ${(c.pricePerPyeong / 10000).toFixed(0)}만 | ${capRate} | ${c.areaM2.toLocaleString()} | ${txDate} |`);
  }
  
  // 시세 대비 분석
  const avgPricePerPyeong = sorted.reduce((s, c) => s + c.pricePerPyeong, 0) / sorted.length;
  const discount = ((avgPricePerPyeong - input.subjectPricePerPyeong) / avgPricePerPyeong) * 100;
  
  lines.push('');
  if (discount > 0) {
    lines.push(`> 본건 평당가(${(input.subjectPricePerPyeong / 10000).toFixed(0)}만)는 주변 평균(${(avgPricePerPyeong / 10000).toFixed(0)}만) 대비 **${discount.toFixed(1)}% 할인** 수준입니다.`);
  } else {
    lines.push(`> 본건 평당가(${(input.subjectPricePerPyeong / 10000).toFixed(0)}만)는 주변 평균(${(avgPricePerPyeong / 10000).toFixed(0)}만) 대비 **${Math.abs(discount).toFixed(1)}% 프리미엄** 수준입니다.`);
  }
  
  return {
    section_type: 'comparables',
    title: '비교 매물 분석',
    markdown: lines.join('\n'),
    confidence: 'deterministic',
    provenance: ['public_api', 'broker'],
  };
}
