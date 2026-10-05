/**
 * @file land-detail-renderer.ts
 * @description F-1: 토지 상세 섹션 렌더러 (결정론, LLM 미사용)
 */

import { formatPyeong } from '@/lib/utils/area-conversion';

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
  // W-IM-5: V-World 토지특성 속성
  landShape?: string;              // 형상: '정방형' | '가장형' | '세장형' | '부정형' | '삼각형' 등
  landTopography?: string;         // 지형: '평지' | '완경사' | '급경사' | '고지' | '저지' 등
  roadFrontage?: string;           // 도로접면: '광대한면' | '중로한면' | '소로한면' | '세로(가)한면' | '맹지' 등
  /** 다필지에서 필지별 면적이 일부 미확인일 때 표시할 건축물대장 대지면적(합계) — 필지별 값으로 복제하지 않는다 (Rule 34) */
  registerLandAreaM2?: number;
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
    // 대지면적 미확인(0/NaN/음수) 은 '0㎡ (0.0평)' 이 아니라 '-' (Rule 34/37)
    lines.push(
      Number.isFinite(p.areaM2) && p.areaM2 > 0
        ? `- **대지면적**: ${p.areaM2.toLocaleString()}㎡ (${formatPyeong(p.areaM2, 1)}평)`
        : `- **대지면적**: -`,
    );
    if (p.officialLandPricePerM2) {
      lines.push(`- **공시지가**: ${p.officialLandPricePerM2.toLocaleString()}원/㎡`);
    }
  } else {
    lines.push(`### 필지 구성 (${input.parcels.length}필지)`);
    lines.push('| PNU | 지목 | 면적(㎡) | 지분율 | 공시지가(원/㎡) |');
    lines.push('|-----|------|---------|--------|----------------|');
    // 필지별 면적 미확인(0/NaN) 은 '-' (Rule 37). 전 필지 확인 시에만 합산, 아니면 건축물대장 대지면적을 출처와 함께 표시
    const hasArea = (p: { areaM2: number }) => Number.isFinite(p.areaM2) && p.areaM2 > 0;
    const allKnown = input.parcels.every(hasArea);
    for (const p of input.parcels) {
      const price = p.officialLandPricePerM2?.toLocaleString() ?? '-';
      const area = hasArea(p) ? p.areaM2.toLocaleString() : '-';
      lines.push(`| ${p.pnu} | ${p.jimok} | ${area} | ${(p.ownershipRatio * 100).toFixed(0)}% | ${price} |`);
    }
    lines.push(``);
    if (allKnown) {
      const totalArea = input.parcels.reduce((s, p) => s + p.areaM2 * p.ownershipRatio, 0);
      lines.push(`> **유효 대지면적 합계: ${totalArea.toLocaleString()}㎡ (${formatPyeong(totalArea, 1)}평)**`);
    } else if (input.registerLandAreaM2 && input.registerLandAreaM2 > 0) {
      const a = input.registerLandAreaM2;
      lines.push(`> **대지면적 합계 (건축물대장): ${a.toLocaleString()}㎡ (${formatPyeong(a, 1)}평)** — 필지별 면적은 토지대장 확인 필요`);
    }
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
  // W-IM-5: V-World 토지특성 속성 렌더링
  if (input.landShape) {
    lines.push(`- **필지 형상**: ${input.landShape}`);
  }
  if (input.landTopography) {
    lines.push(`- **지형**: ${input.landTopography}`);
  }
  if (input.roadFrontage) {
    lines.push(`- **도로접면**: ${input.roadFrontage}`);
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
