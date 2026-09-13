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

const EXPIRY_COLORS: Record<string, string> = {
  '2024': 'D6C6B9',
  '2025': 'C9A9A6',
  '2026': '93B3A0',
  '2027': 'A6C1D9',
  '2028': 'C5B4E3',
  '2029': 'F2C4A2',
};

type FloorInfo = StackingPlanFloor & { _expiry?: string; area?: number };

export function buildA24RentrollStacking(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  
  const stackingData = input.data.stackingPlan || input.data.rentRollFloors || [];
  // tableRows는 data-binder가 직접 주입하거나, tables[0].rows로 전달될 수 있음
  let tableRows = input.data.tableRows || [];
  if (tableRows.length === 0 && Array.isArray(input.data.tables)) {
    const firstTable = input.data.tables[0];
    if (firstTable?.rows?.length > 0) {
      tableRows = firstTable.rows;
    }
  }
  
  if (stackingData.length === 0 && tableRows.length === 0) {
    return { warnings: ['렌트롤 및 스태킹 플랜 데이터 없음 — 슬라이드 생략'], suppress: true };
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
    // Construct floors from tableRows (assuming row: [층수, 면적, 임차인, ...])
    floors = tableRows.map((r: any[]) => ({
      floor: String(r[0] || ''),
      tenant: String(r[2] || ''),
      isVacant: String(r[2] || '').includes('공실'),
      expiryYear: String(r[5] || '').match(/202[4-9]/)?.[0],
      area: parseFloat(String(r[1] || '').replace(/,/g, '')) || 0,
    }));
  }

  if (floors.length > 0) {
    // Determine colors & legends
    const usedYears = new Set<string>();
    floors.forEach(f => {
      const match = (f.tenant || '').match(/202[4-9]/) || (f.expiryYear ? [f.expiryYear] : null);
      if (match && !f.isVacant && !f.tenant?.includes('공실')) {
        usedYears.add(String(match[0]));
        f._expiry = String(match[0]);
      }
    });

    const years = Array.from(usedYears).sort();
    
    // Draw legend
    let legendX = spX;
    years.forEach(year => {
      const color = EXPIRY_COLORS[year] || 'E2E8F0';
      slide.addShape('rect', { x: legendX, y: spY, w: 0.15, h: 0.15, fill: { color } });
      slide.addText(year, { x: legendX + 0.2, y: spY, w: 0.6, h: 0.15, fontSize: 9, color: '5B6B73', fontFace: KR });
      legendX += 0.8;
    });
    // Add Vacant legend
    slide.addShape('rect', { x: legendX, y: spY, w: 0.15, h: 0.15, fill: { color: 'EFEFEF' }, line: { dashType: 'dash', color: 'B9BDC0' } as any });
    slide.addText('공실', { x: legendX + 0.2, y: spY, w: 0.6, h: 0.15, fontSize: 9, color: '5B6B73', fontFace: KR });

    // Render bars (bottom to top)
    const drawAreaH = spH - 0.4;
    const baseDrawY = spY + spH;
    
    const reversed = [...floors].reverse(); // Now bottom to top
    
    // Condense B floors if needed
    let drawFloors = reversed;
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

    const hPerFloor = drawAreaH / Math.max(1, drawFloors.length);
    const maxBarW = spW - 0.8;

    let currentY = baseDrawY;
    
    // Ground line divider if B floors exist
    const bCount = drawFloors.filter(f => String(f.floor).toUpperCase().startsWith('B')).length;
    if (bCount > 0 && bCount < drawFloors.length) {
      const groundY = baseDrawY - (bCount * hPerFloor);
      slide.addShape('line', { x: spX, y: groundY, w: spW, h: 0, line: { color: '5B6B73', width: 2 } });
    }

    drawFloors.forEach((floor) => {
      currentY -= hPerFloor;
      
      const isSubterranean = String(floor.floor).toUpperCase().startsWith('B');
      const ratio = calculateSetbackRatio(floor.area || 100, 100, isSubterranean); // mock standard area if missing
      const barW = maxBarW * ratio;
      const barX = spX + 0.4 + (maxBarW - barW) / 2; // centered
      
      let fillCol = 'E2E8F0';
      const isVacant = floor.isVacant || floor.tenant?.includes('공실');
      if (isVacant) {
        fillCol = 'EFEFEF';
      } else if (floor._expiry && EXPIRY_COLORS[floor._expiry]) {
        fillCol = EXPIRY_COLORS[floor._expiry];
      } else if (floor.category === 'parking' || floor.tenant?.includes('주차')) {
        fillCol = 'E2E8F0';
      }
      
      // Floor label
      slide.addText(String(floor.floor), {
        x: spX, y: currentY, w: 0.35, h: hPerFloor,
        fontSize: 12, bold: true, color: '132A3A', align: 'right', valign: 'middle', fontFace: KR
      });
      
      // Bar
      if (isVacant) {
        slide.addShape('rect', {
          x: barX, y: currentY + 0.05, w: barW, h: hPerFloor - 0.1,
          fill: { color: fillCol },
          line: { dashType: 'dash', color: 'B9BDC0' } as any
        });
      } else {
        slide.addShape('rect', {
          x: barX, y: currentY + 0.05, w: barW, h: hPerFloor - 0.1,
          fill: { color: fillCol },
          line: { color: '5B6B73', width: 1.1 }
        });
      }
      
      // Tenant text
      slide.addText(floor.tenant || '', {
        x: barX + 0.1, y: currentY + 0.05, w: barW - 0.2, h: hPerFloor - 0.1,
        fontSize: 10, color: '5B6B73', align: 'center', valign: 'middle', fontFace: KR
      });
    });
  }

  // --- Right Panel: Rent Roll Table ---
  const HEADERS = ['층수', '면적(평)', '임차인', '보증금', '월세', '계약종료'];
  const colW = [0.8, 1.2, 2.0, 1.3, 1.0, 1.2]; // Sum = 7.50
  
  if (tableRows.length > 0) {
    let rawRows = [...tableRows];
    
    // First row might be header
    if (rawRows[0] && String(rawRows[0][0]).includes('층')) {
      rawRows.shift();
    }
    
    let displayRows = rawRows;
    let truncated = false;
    let totalCount = rawRows.length;
    if (rawRows.length > 12) {
      displayRows = rawRows.slice(0, 12);
      truncated = true;
    }
    
    // Render table
    const tableData: any[][] = [];
    
    // Header
    tableData.push(HEADERS.map(h => ({
      text: h,
      options: { fill: '132A3A', color: 'FFFFFF', fontSize: 10, bold: true, align: 'center' }
    })));
    
    // Body
    displayRows.forEach((row, i) => {
      const isSummary = row.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()));
      const isVacant = row.some((c: any) => String(c || '').includes('공실'));
      
      const fill = isSummary ? 'F1F5F9' : (isVacant ? 'FBEFE8' : (i % 2 === 0 ? 'FFFFFF' : 'F3F6F7'));
      const color = isVacant ? 'B05A2E' : (isSummary ? '132A3A' : '2B2B2B');
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
      border: { type: 'solid', color: 'DDE3E8', pt: 1 },
      rowH: 0.35,
      valign: 'middle'
    });
    
    if (truncated) {
      slide.addText(`(전체 ${totalCount}건 중 12건 표시)`, {
        x: tbX, y: spY + (displayRows.length + 1) * 0.35 + 0.1, w: tbW, h: 0.2,
        fontSize: 9, color: '7A8794', align: 'right', fontFace: KR
      });
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  
  return { slide, warnings };
}
