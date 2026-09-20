import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, CD, KR, M, CW, light } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { calculateSetbackRatio, inferTenantCategory } from './a22-stacking-plan';
import type { StackingPlanFloor } from '../../types';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
}

export interface ArchetypeOutput {
  slide?: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
  suppress?: boolean;
}

const EXPIRY_HEATMAP_PALETTE: Record<string, string> = {
  '2024': 'D6C6B9',
  '2025': 'C9A9A6',
  '2026': '93B3A0',
  '2027': 'A6C1D9',
  '2028': 'C5B4E3',
  '2029': 'F2C4A2',
  '2030': 'E8D1A7',
  '2031': 'B8D8D8',
  '2032': 'D4B8E0',
  '2033': 'A8C8B8',
  '2034': 'C8B8A8',
  '2035': 'B8C8E0',
};

type FloorInfo = StackingPlanFloor & { _expiry?: string; area?: number };

function parseExpiryYear(text: string): string | undefined {
  if (!text) return undefined;
  const m4 = text.match(/20(2[4-9]|3[0-5])/);
  if (m4) return `20${m4[1]}`;
  const m2 = text.match(/['’]?\s*(2[4-9]|3[0-5])\b/);
  if (m2) return `20${m2[1]}`;
  return undefined;
}

export function buildA24RentrollStacking(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  
  const data = input.data || {};
  const stackingData = data.stackingPlan || input.data.rentRollFloors || [];
  
  // Rent roll table data
  let tableRows = data.tableRows || (data.tables?.[0]?.rows) || [];
  if (tableRows.length === 0 && Array.isArray(input.data.tables)) {
    const firstTable = input.data.tables[0];
    if (firstTable?.rows?.length > 0) {
      tableRows = firstTable.rows;
    }
  }
  
  if (stackingData.length === 0 && tableRows.length === 0) {
    warnings.push('A24 렌트롤/스태킹 데이터 없음 — 슬라이드 억제');
    return { slide: input.pres.addSlide(), warnings, suppress: true };
  }

  const slide = light(input.pres);
  L.head(slide, input.slideNum, input.data.kicker || 'Rent Roll', input.data.title || '임대차 현황');

  // Left Panel (Stacking Plan)
  // x=0.62, w=4.45
  const spX = 0.62;
  const spW = 4.45;
  const spY = 1.8;
  const spH = 4.8;
  
  // Right Panel (Rent Roll Table)
  // x=5.22, w=7.50
  const tbX = 5.22;
  const tbW = 7.50;

  // --- Render Left Panel: Stacking Plan ---
  let floors: FloorInfo[] = stackingData;
  if (floors.length === 0 && tableRows.length > 0) {
    // F4 fix: 첫 행의 r[0]이 층 패턴에 맞는 경우만 스태킹 플랜으로 변환
    // ssot_summary 합성 행("월 임대료 합계" 등)이 층 이름으로 둔갑하는 시각 오염 방지
    const FLOOR_PATTERN = /^(B?\d+F?|지상|지하|옥탑|PH|RF|\d+층)/i;
    const firstCell = String(tableRows[0]?.[0] || '');
    if (FLOOR_PATTERN.test(firstCell.trim())) {
      floors = tableRows.map((r: any[]) => {
        const floor = String(r[0] || '').trim();
        // 테이블 컬럼 순서: [층수, 임차인, 면적(평), 보증금, 월세, 계약종료] — HEADERS/data-binder와 동기화
        const tenant = String(r[1] || '').trim();
        const areaStr = String(r[2] || '').trim();
        const deposit = String(r[3] || '').trim();
        const rent = String(r[4] || '').trim();
        const expiry = String(r[5] || '').trim();
        const isVac = tenant.includes('공실') || floor.includes('공실');
        return {
          floor,
          tenant: tenant || (isVac ? '공실' : '-'),
          isVacant: isVac,
          expiryYear: parseExpiryYear(expiry) || parseExpiryYear(tenant),
          area: parseFloat(areaStr.replace(/[^0-9.]/g, '')) || 0,
        };
      });
    }
    // 층 패턴이 아니면 floors를 빈 배열로 유지 → 좌측 스태킹 도식 생략, 우측 테이블만 렌더링
  }

  if (floors.length > 0) {
    // D6 Fix: 층수 표준 정규화 — 지하(B)부터 지상(1F~5F) 순서로 바닥에서 위로 정렬
    const parseFloorNum = (fl: any): number => {
      const s = String(fl || '').trim().toUpperCase();
      const bMatch = s.match(/^B(\d+)/);
      if (bMatch) return -parseInt(bMatch[1], 10);
      const fMatch = s.match(/^(\d+)F?/);
      if (fMatch) return parseInt(fMatch[1], 10);
      if (s.includes('지하')) return -1;
      if (s.includes('옥상') || s.includes('RF') || s.includes('PH')) return 99;
      return 1;
    };
    let drawFloors = [...floors].sort((a, b) => parseFloorNum(a.floor) - parseFloorNum(b.floor));
    if (floors.length > 12) {
      const bFloors = drawFloors.filter(f => String(f.floor).toUpperCase().startsWith('B'));
      const aboveFloors = drawFloors.filter(f => !String(f.floor).toUpperCase().startsWith('B'));
      if (bFloors.length > 1) {
        const mergedB: FloorInfo = {
          floor: `B${bFloors.length}~B1`,
          tenant: '주차장 및 기계실',
          category: 'parking'
        };
        drawFloors = [mergedB, ...aboveFloors];
      }
    }

    // G-11: Determine colors & legends — usedYears는 drawFloors 기준으로 수집하여 범례와 바 일치 보장
    const usedYears = new Set<string>();
    drawFloors.forEach(f => {
      const yr = f.expiryYear ? String(f.expiryYear) : parseExpiryYear(f.tenant || '');
      if (yr && !f.isVacant && !f.tenant?.includes('공실')) {
        // G-11: EXPIRY_HEATMAP_PALETTE에 정의된 연도만 범례에 포함 — 미정의 연도는 바에서 기본 회색으로 렌더링되므로 범례 불필요
        if (EXPIRY_HEATMAP_PALETTE[yr]) {
          usedYears.add(yr);
        }
        f._expiry = yr;
      }
    });

    const years = Array.from(usedYears).sort();
    
    // Draw legend
    let legendX = spX;
    years.forEach(year => {
      const color = EXPIRY_HEATMAP_PALETTE[year] || C.line2;
      slide.addShape('rect', { x: legendX, y: spY, w: 0.15, h: 0.15, fill: { color } });
      slide.addText(year, { x: legendX + 0.2, y: spY, w: 0.6, h: 0.15, fontSize: 9, color: '5B6B73', fontFace: KR });
      legendX += 0.8;
    });
    // Add Vacant legend
    slide.addShape('rect', { x: legendX, y: spY, w: 0.15, h: 0.15, fill: { color: 'FBEFE8' }, line: { dashType: 'dash' as const, color: 'B05A2E', width: 1.0 } });
    slide.addText('공실', { x: legendX + 0.2, y: spY, w: 0.6, h: 0.15, fontSize: 9, color: 'B05A2E', fontFace: KR, bold: true });

    // Render bars (bottom to top)
    const drawAreaH = spH - 0.4;
    const baseDrawY = spY + spH;

    const hPerFloor = drawAreaH / Math.max(1, drawFloors.length);
    const maxBarW = spW - 0.8;
    const maxArea = Math.max(...drawFloors.map(f => f.area || 0), 1);  // 실제 최대면적 기준

    let currentY = baseDrawY;
    
    // Ground line divider if B floors exist
    const bCount = drawFloors.filter(f => String(f.floor).toUpperCase().startsWith('B')).length;
    if (bCount > 0 && bCount < drawFloors.length) {
      const groundY = baseDrawY - (bCount * hPerFloor);
      slide.addShape('line', {
        x: spX + 0.2, y: groundY, w: spW - 0.4, h: 0,
        line: { color: 'CBD5E0', width: 1.5, dashType: 'dash' as const }
      });
      slide.addText('GL (지상/지하 경계)', {
        x: spX + 0.2, y: groundY - 0.2, w: 2.0, h: 0.2,
        fontSize: 8, color: '8A9AA3', fontFace: KR
      });
    }

    // D45: 7층+ 동적 높이 축소 — 폰트 크기 조정
    const floorFontSize = hPerFloor >= 0.65 ? 12 : hPerFloor >= 0.50 ? 10 : 9;
    const tenantFontSize = hPerFloor >= 0.65 ? 10 : hPerFloor >= 0.50 ? 9 : 8;

    drawFloors.forEach(floor => {
      currentY -= hPerFloor;
      
      const isSubterranean = String(floor.floor).toUpperCase().startsWith('B');
      const ratio = calculateSetbackRatio(floor.area || maxArea, maxArea, isSubterranean);
      const barW = maxBarW * ratio;
      const barX = spX + 0.4 + (maxBarW - barW) / 2;
      
      let fillCol = 'E2E8F0';
      const isVacant = floor.isVacant || floor.tenant?.includes('공실');
      if (isVacant) {
        fillCol = 'FBEFE8';
      } else if (floor._expiry && EXPIRY_HEATMAP_PALETTE[floor._expiry]) {
        fillCol = EXPIRY_HEATMAP_PALETTE[floor._expiry];
      } else if (floor.category === 'parking' || floor.tenant?.includes('주차')) {
        fillCol = 'E2E8F0';
      }
      
      // Floor label
      const floorLabel = String(floor.floor).replace(/층$/, '');
      slide.addText(floorLabel, {
        x: spX, y: currentY, w: 0.35, h: hPerFloor,
        fontSize: floorFontSize, bold: true, color: C.ink, align: 'right', valign: 'middle', fontFace: KR
      });
      
      // Bar
      if (isVacant) {
        slide.addShape('rect', {
          x: barX, y: currentY + 0.03, w: barW, h: hPerFloor - 0.06,
          fill: { color: fillCol },
          line: { dashType: 'dash' as const, color: 'B05A2E', width: 1.2 }
        });
      } else {
        slide.addShape('rect', {
          x: barX, y: currentY + 0.03, w: barW, h: hPerFloor - 0.06,
          fill: { color: fillCol },
          line: { color: '5B6B73', width: 1.1 }
        });
      }
      
      // Tenant text inside bar (임차인명 + 면적)
      const isVac = isVacant;
      const tenantName = isVac ? '공실' : (floor.tenant || '');
      const areaLabel = floor.area ? `${Math.round(floor.area)}평` : '';
      // 바 내부: 임차인명 (좌), 면적 (우)
      if (barW >= 1.5) {
        // 넓은 바: 임차인 좌정렬 + 면적 우정렬
        slide.addText(tenantName, {
          x: barX + 0.08, y: currentY + 0.03, w: barW * 0.6, h: hPerFloor - 0.06,
          fontSize: tenantFontSize, bold: isVac, color: isVac ? 'B05A2E' : '3A3A3A',
          align: 'left', valign: 'middle', fontFace: KR
        });
        if (areaLabel) {
          slide.addText(areaLabel, {
            x: barX + barW * 0.6, y: currentY + 0.03, w: barW * 0.35, h: hPerFloor - 0.06,
            fontSize: Math.max(tenantFontSize - 1, 7), color: '8A9AA3',
            align: 'right', valign: 'middle', fontFace: KR
          });
        }
      } else {
        // 좁은 바: 임차인명만 중앙
        slide.addText(tenantName, {
          x: barX + 0.05, y: currentY + 0.03, w: barW - 0.1, h: hPerFloor - 0.06,
          fontSize: tenantFontSize, bold: isVac, color: isVac ? 'B05A2E' : '3A3A3A',
          align: 'center', valign: 'middle', fontFace: KR
        });
      }
    });
  }

  // 스펙 §5.2: 개략도 필수 각주
  slide.addText('※ 렌트롤 현황 기준 층별 공간 배치도', {
    x: spX, y: 6.65, w: spW, h: 0.25,
    fontSize: 8.5, color: '8A8A8A', align: 'left',
    fontFace: '맑은 고딕',
  });

  // --- Right Panel: Rent Roll Table ---
  const HEADERS = ['층수', '임차인', '면적(평)', '보증금', '월세', '계약종료'];
  const colW = [0.8, 1.8, 1.3, 1.3, 1.1, 1.2]; // Sum = 7.50
  
  if (tableRows.length > 0) {
    let rawRows = [...tableRows];
    
    // First row might be header — D45: '층수'/'층' 단독이 아니라 헤더 키워드 2개 이상 매칭 시에만 제거
    // B1층, 1층 등 실데이터가 '층'을 포함하므로 단순 includes('층')으로는 오탐
    const firstRowStr = (rawRows[0] || []).map((c: any) => String(c || '').trim());
    const headerKeywords = ['층수', '면적', '임차인', '보증금', '월세', '계약종료', '관리비', '호실', '업종'];
    const headerMatches = firstRowStr.filter((cell: string) => headerKeywords.some(kw => cell.includes(kw)));
    if (headerMatches.length >= 2) {
      rawRows.shift();
    }

    // D7 Fix: 합계 행이 없으면 자동 합산 추가
    const hasSummaryRow = rawRows.some(r => r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim())));
    if (!hasSummaryRow && rawRows.length > 0) {
      let totalArea = 0, totalDeposit = 0, totalRent = 0;
      for (const r of rawRows) {
        const a = parseFloat(String(r[2] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(a)) totalArea += a;
        const d = parseFloat(String(r[3] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(d)) totalDeposit += d;
        const rt = parseFloat(String(r[4] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(rt)) totalRent += rt;
      }
      rawRows.push([
        '합계',
        `${rawRows.length}개 호실`,
        totalArea > 0 ? `${totalArea.toFixed(1)}평` : '-',
        totalDeposit > 0 ? `${Math.round(totalDeposit).toLocaleString()}만` : '-',
        totalRent > 0 ? `${Math.round(totalRent).toLocaleString()}만` : '-',
        '-'
      ]);
    }
    
    let displayRows = rawRows;
    let truncated = false;
    let totalCount = rawRows.length;
    if (rawRows.length > 11) {
      const summaryRow = rawRows.find(r => r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim())));
      displayRows = rawRows.filter(r => !r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()))).slice(0, 10);
      if (summaryRow) displayRows.push(summaryRow);
      truncated = true;
    }
    
    // Render table
    const tableData: any[][] = [];
    
    // Header
    tableData.push(HEADERS.map(h => ({
      text: h,
      options: { fill: C.ink, color: C.bg, fontSize: 10, bold: true, align: 'center' }
    })));
    
    // Body
    displayRows.forEach((row, i) => {
      const isSummary = row.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()));
      const isVacant = row.some((c: any) => String(c || '').includes('공실'));
      const isSelfUse = row.some((c: any) => /자가|자가사용/.test(String(c || '')));
      
      const fill = isSummary ? C.tint : (isVacant ? 'FBEFE8' : (isSelfUse ? C.tint : (i % 2 === 0 ? C.bg : 'F3F6F7')));
      const color = isVacant ? 'B05A2E' : (isSummary ? C.ink : (isSelfUse ? C.slate : '2B2B2B'));
      const bold = isSummary || isVacant;
      
      const mappedRow = [
        row[0] || '',
        row[1] || '',
        row[2] || '',
        row[3] || '',
        row[4] || '',
        row[5] || ''
      ].map((cell, cIdx) => {
        let text = String(cell).replace(/\*\*/g, '');
        if (text.length > 30) text = text.slice(0, 29) + '…';
        return {
          text,
          options: { fill, color, fontSize: 9.5, bold, align: cIdx >= 3 && cIdx <= 4 ? 'right' : 'center', fontFace: KR }
        };
      });
      tableData.push(mappedRow);
    });
    
    slide.addTable(tableData, {
      x: tbX, y: spY, w: tbW, colW,
      border: { type: 'solid', color: C.line, pt: 1 },
      rowH: 0.35,
      valign: 'middle'
    });
    
    if (truncated) {
      slide.addText(`(전체 ${totalCount}건 중 10건 표시)`, {
        x: tbX, y: spY + (displayRows.length + 1) * 0.35 + 0.1, w: tbW, h: 0.2,
        fontSize: 9, color: '7A8794', align: 'right', fontFace: KR
      });
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  
  return { slide, warnings };
}
