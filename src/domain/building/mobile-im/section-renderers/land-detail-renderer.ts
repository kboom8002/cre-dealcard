/**
 * @file land-detail-renderer.ts
 * @description F-1: 토지 상세 섹션 렌더러 (결정론, LLM 미사용)
 */

export interface LandDetailInput {
  parcels: Array<{
    pnu: string;
    jimok: string;
    areaM2: number;
    ownershipRatio: number;
    officialLandPricePerM2?: number;
  }>;
  zoning: string;
  buildingCoverageRatio?: number;  // 건폐율 %
  floorAreaRatio?: number;         // 용적률 %
  maxFar?: number;                 // 법정 용적률 상한 %
  exclusions?: Array<{ kind: string; areaM2: number }>;
}

export interface SectionOutput {
  section_type: string;
  title: string;
  markdown: string;
  confidence: 'deterministic';
  provenance: string[];
}

export function renderLandDetail(input: LandDetailInput): SectionOutput {
  const lines: string[] = ['## 토지 현황'];
  
  // 필지 정보
  lines.push('');
  if (input.parcels.length === 1) {
    const p = input.parcels[0];
    lines.push(`- **지목**: ${p.jimok}`);
    lines.push(`- **대지면적**: ${p.areaM2.toLocaleString()}㎡ (${(p.areaM2 / 3.3058).toFixed(1)}평)`);
    if (p.officialLandPricePerM2) {
      lines.push(`- **공시지가**: ${p.officialLandPricePerM2.toLocaleString()}원/㎡`);
    }
  } else {
    lines.push(`### 필지 구성 (${input.parcels.length}필지)`);
    lines.push('| PNU | 지목 | 면적(㎡) | 지분율 | 공시지가(원/㎡) |');
    lines.push('|-----|------|---------|--------|----------------|');
    const totalArea = input.parcels.reduce((s, p) => s + p.areaM2 * p.ownershipRatio, 0);
    for (const p of input.parcels) {
      const price = p.officialLandPricePerM2?.toLocaleString() ?? '-';
      lines.push(`| ${p.pnu} | ${p.jimok} | ${p.areaM2.toLocaleString()} | ${(p.ownershipRatio * 100).toFixed(0)}% | ${price} |`);
    }
    lines.push(``);
    lines.push(`> **유효 대지면적 합계: ${totalArea.toLocaleString()}㎡ (${(totalArea / 3.3058).toFixed(1)}평)**`);
  }
  
  // 용도지역 & 용적률
  lines.push('');
  lines.push('### 이용 규제');
  lines.push(`- **용도지역**: ${input.zoning}`);
  if (input.buildingCoverageRatio) {
    lines.push(`- **건폐율**: ${input.buildingCoverageRatio}%`);
  }
  if (input.floorAreaRatio) {
    const farLine = input.maxFar
      ? `- **용적률**: ${input.floorAreaRatio}% (법정 상한 ${input.maxFar}%, 여유 ${(input.maxFar - input.floorAreaRatio).toFixed(1)}%p)`
      : `- **용적률**: ${input.floorAreaRatio}%`;
    lines.push(farLine);
  }
  
  // 제척
  if (input.exclusions && input.exclusions.length > 0) {
    lines.push('');
    lines.push('### 제척 사항');
    for (const ex of input.exclusions) {
      lines.push(`- ${ex.kind}: ${ex.areaM2.toLocaleString()}㎡`);
    }
  }
  
  return {
    section_type: 'land_detail',
    title: '토지 현황',
    markdown: lines.join('\n'),
    confidence: 'deterministic',
    provenance: ['registry', 'public_api'],
  };
}
