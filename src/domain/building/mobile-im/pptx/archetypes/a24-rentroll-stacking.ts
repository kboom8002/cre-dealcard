import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, CD, KR, M, CW, light } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { calculateSetbackRatio, inferTenantCategory } from './a22-stacking-plan';
import type { StackingPlanFloor } from '../../types';
import { sqmToPyeong } from '@/lib/utils/area-conversion';

export interface ArchetypeInput {
  pres: PptxGenJS;
  slideNum: number;
  docno: string;
  watermarkText?: string;
  data: Record<string, any>;
  grade: 'A' | 'B' | 'C';
  provenance: Record<string, ProvenanceKind>;
  flags?: Record<string, any>;
}

export interface ArchetypeOutput {
  slide?: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
  suppress?: boolean;
}

function isSuppressed(flags?: Record<string, any>, archetype?: string): boolean {
  if (!flags) return false;
  if (archetype && (flags[archetype] === false || flags[`suppress_${archetype}`] === true || flags[`hide_${archetype}`] === true)) {
    return true;
  }
  if (Array.isArray(flags.suppressedArchetypes) && archetype && flags.suppressedArchetypes.includes(archetype)) {
    return true;
  }
  return false;
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
  
  if (isSuppressed(input.flags, 'A24')) {
    warnings.push('A24 렌트롤/스태킹 슬라이드 억제 (플래그 지정)');
    return { warnings, suppress: true };
  }

  const slide = light(input.pres);
  L.head(slide, input.slideNum, input.data.kicker || 'Rent Roll', input.data.title || '임대차 현황');

  if (stackingData.length === 0 && tableRows.length === 0) {
    L.fallbackCard(slide, M, 1.62, CW, 4.80, {
      badge: '임대차 실사 안내',
      badgeKind: 'brass',
      title: '임대차 계약 및 렌트롤 상세 실사 프로토콜',
      leadText: '본 자산의 세부 층별 임대차 계약 원장 및 정산 내역은 매수 의향 접수 및 비밀유지협약(NDA) 체결 후 실측 대조가 진행됩니다.',
      checklist: [
        '임대차 계약서 원본 전수 대조 (임대료, 관리비, 계약기간, 만기일 및 갱신 옵션)',
        '보증금 및 월임대료 입금 금융 원장 대조·검증 (체납 내역 및 부가가치세 신고서 정합성)',
        '특약 사항 및 렌트프리(Rent-Free), 핏아웃(Fit-out) 등 실질 유효 임대료(Net Effective Rent) 산정',
        '상가건물 임대차보호법상 계약갱신요구권 행사 가능 여부 및 명도/재계약 리스크 검토',
      ],
      icon: 'document',
    });
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    warnings.push('A24 렌트롤 데이터 없음 — 임대차 실사 대체 카드 삽입');
    return { slide, warnings };
  }

  // Left Panel (Stacking Plan)
  const spX = M;
  const spW = 3.40;
  const spY = 1.8;
  const spH = 4.8;
  
  // Right Panel (Rent Roll Table)
  const gap = 0.30;
  const tbX = M + spW + gap;
  const tbW = CW - spW - gap;

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
        // D45 C-1 fix: 10열 표준 헤더 기준 인덱스 정렬
        // ['층', '호실', '용도/업종', '임차인', '전용면적(㎡)', '보증금(만원)', '월세(만원)', '관리비(만원)', '계약종료', '비고']
        //   r[0]   r[1]     r[2]        r[3]       r[4]           r[5]           r[6]           r[7]           r[8]      r[9]
        const is12Col = r.length >= 12;
        const tenant  = String(r[is12Col ? 3 : 1] || '').trim();
        const areaStr = String(r[is12Col ? 4 : 3] || '').trim();
        const deposit = String(r[is12Col ? 7 : 5] || '').trim();
        const rent    = String(r[is12Col ? 8 : 6] || '').trim();
        const expiry  = String(r[is12Col ? 11 : 9] || '').trim();
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

    // 1. 층별로 세입자 그룹화
    interface FloorGroup {
      floorName: string;
      isSubterranean: boolean;
      totalArea: number;
      tenants: typeof drawFloors;
    }
    const floorGroups: FloorGroup[] = [];
    for (const f of drawFloors) {
      let fg = floorGroups.find(g => g.floorName === String(f.floor));
      if (!fg) {
        fg = {
          floorName: String(f.floor),
          isSubterranean: String(f.floor).toUpperCase().startsWith('B'),
          totalArea: 0,
          tenants: []
        };
        floorGroups.push(fg);
      }
      fg.tenants.push(f);
      fg.totalArea += (f.area || 0);
    }

    const hPerFloor = drawAreaH / Math.max(1, floorGroups.length);
    const maxBarW = spW - 0.70;
    const maxArea = Math.max(...floorGroups.map(g => g.totalArea), 1);  // 실제 최대면적 기준

    let currentY = baseDrawY;
    
    // Ground line divider if B floors exist
    const bCount = floorGroups.filter(g => g.isSubterranean).length;
    if (bCount > 0 && bCount < floorGroups.length) {
      const groundY = baseDrawY - (bCount * hPerFloor);
      slide.addShape('line', {
        x: spX + 0.55, y: groundY, w: spW - 0.65, h: 0,
        line: { color: '94A3B8', width: 1.5, dashType: 'dash' as const }
      });
      slide.addText('GL', {
        x: spX, y: groundY - 0.12, w: 0.50, h: 0.24,
        fontSize: 7.5, color: '64748B', fontFace: KR, align: 'right', valign: 'middle', bold: true
      });
    }

    // D45: 7층+ 동적 높이 축소 — 폰트 크기 조정
    const floorFontSize = hPerFloor >= 0.65 ? 12 : hPerFloor >= 0.50 ? 10 : 9;
    const tenantFontSize = hPerFloor >= 0.65 ? 10 : hPerFloor >= 0.50 ? 9 : 8;

    floorGroups.forEach(group => {
      currentY -= hPerFloor;
      
      const ratio = calculateSetbackRatio(group.totalArea || maxArea, maxArea, group.isSubterranean);
      const floorBarW = maxBarW * ratio;
      const floorBarX = spX + 0.58 + (maxBarW - floorBarW) / 2;
      
      // Floor label
      const floorLabel = String(group.floorName).replace(/층$/, '');
      slide.addText(floorLabel, {
        x: spX, y: currentY, w: 0.52, h: hPerFloor,
        fontSize: floorFontSize, bold: true, color: C.ink, align: 'right', valign: 'middle', fontFace: KR
      });
      
      // Render tenants horizontally
      let currentX = floorBarX;
      group.tenants.forEach((tenant, idx) => {
        const tenantRatio = group.totalArea > 0 ? (tenant.area || 0) / group.totalArea : 1 / group.tenants.length;
        let tenantW = floorBarW * tenantRatio;
        // F-13: 1F 다중 테넌트 시 바 폭 보장
        if (group.tenants.length > 1) {
          tenantW = Math.max(0.8, tenantW);
          if (tenantW * group.tenants.length > floorBarW) {
            tenantW = floorBarW / group.tenants.length; // 강제 균등 분할
          }
        }
        
        let fillCol = 'E2E8F0';
        const isVacant = tenant.isVacant || tenant.tenant?.includes('공실');
        if (isVacant) {
          fillCol = 'FBEFE8';
        } else if (tenant._expiry && EXPIRY_HEATMAP_PALETTE[tenant._expiry]) {
          fillCol = EXPIRY_HEATMAP_PALETTE[tenant._expiry];
        } else if (tenant.category === 'parking' || tenant.tenant?.includes('주차')) {
          fillCol = 'E2E8F0';
        }

        // Bar
        if (isVacant) {
          slide.addShape('rect', {
            x: currentX, y: currentY + 0.03, w: tenantW, h: hPerFloor - 0.06,
            fill: { color: fillCol },
            line: { dashType: 'dash' as const, color: 'B05A2E', width: 1.2 }
          });
        } else {
          slide.addShape('rect', {
            x: currentX, y: currentY + 0.03, w: tenantW, h: hPerFloor - 0.06,
            fill: { color: fillCol },
            line: { color: '5B6B73', width: 1.1 }
          });
        }
        
        // Tenant text inside bar
        const tenantName = isVacant ? '공실' : (tenant.tenant || '');
        const areaPyeong = tenant.area ? Math.round(sqmToPyeong(tenant.area)) : 0;
        const areaLabel = areaPyeong > 0 ? `${areaPyeong}평` : '';
        const combinedLabel = areaLabel ? `${tenantName} (${areaLabel})` : tenantName;
        
        if (tenantW >= 0.8) {
          slide.addText(combinedLabel, {
            x: currentX + 0.04, y: currentY + 0.02, w: tenantW - 0.08, h: hPerFloor - 0.04,
            fontSize: tenantFontSize, bold: isVacant, color: isVacant ? 'B05A2E' : '3A3A3A',
            align: 'center', valign: 'middle', fontFace: KR, shrinkText: true
          });
        } else if (tenantW >= 0.4) {
          slide.addText(tenantName, {
            x: currentX + 0.02, y: currentY + 0.02, w: tenantW - 0.04, h: hPerFloor - 0.04,
            fontSize: Math.max(tenantFontSize - 1, 7.5), bold: isVacant, color: isVacant ? 'B05A2E' : '3A3A3A',
            align: 'center', valign: 'middle', fontFace: KR
          });
        }
        currentX += tenantW;
      });
    });
  }

  // 스펙 §5.2: 개략도 필수 각주
  slide.addText('※ 렌트롤 현황 기준 층별 공간 배치도', {
    x: spX, y: 6.52, w: spW, h: 0.20,
    fontSize: 8.5, color: '8A8A8A', align: 'left',
    fontFace: '맑은 고딕',
    margin: 0,
  });

  // --- Right Panel: Rent Roll Table ---
  const HEADERS = ['층', '임차인', '용도', '임대면적', '전용면적', '보증금', '월임대료', '관리비', '월합계', '만기일'];
  const colW = [0.48, 1.05, 0.88, 0.78, 0.78, 0.78, 0.78, 0.78, 0.78, 1.30]; // Sum = 8.39 <= tbW (8.393)

  
  if (tableRows.length > 0) {
    let rawRows = tableRows.map((row: any) => {
      const newRow = [...row];
      // Do not splice for 12 columns. Assuming tableRows provides exactly 12 columns.
      return newRow;
    });
    
    // First row might be header — D45: '층수'/'층' 단독이 아니라 헤더 키워드 2개 이상 매칭 시에만 제거
    // B1층, 1층 등 실데이터가 '층'을 포함하므로 단순 includes('층')으로는 오탐
    const firstRowStr = (rawRows[0] || []).map((c: any) => String(c || '').trim());
    const headerKeywords = ['층수', '면적', '임차인', '보증금', '월세', '계약종료', '관리비', '호실', '업종'];
    const headerMatches = firstRowStr.filter((cell: string) => headerKeywords.some(kw => cell.includes(kw)));
    if (headerMatches.length >= 2) {
      rawRows.shift();
    }

    // D7 Fix: 합계 행이 없으면 자동 합산 추가
    const hasSummaryRow = rawRows.some((r: any) => r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim())));
    if (!hasSummaryRow && rawRows.length > 0) {
      let totalArea = 0, totalExcArea = 0, totalDeposit = 0, totalRent = 0, totalMgmt = 0, totalMonth = 0;
      for (const r of rawRows) {
        const a = parseFloat(String(r[3] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(a)) totalArea += a;
        const e = parseFloat(String(r[4] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(e)) totalExcArea += e;
        const d = parseFloat(String(r[5] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(d)) totalDeposit += d;
        const rt = parseFloat(String(r[6] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(rt)) totalRent += rt;
        const mt = parseFloat(String(r[7] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(mt)) totalMgmt += mt;
        const tot = parseFloat(String(r[8] || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(tot)) totalMonth += tot;
      }
      
      const totalMonthlySum = (totalMonth > 0 ? totalMonth : (totalRent + totalMgmt));

      rawRows.push([
        '합계',
        `${rawRows.length}개 호실`,
        '-',
        totalArea > 0 ? `${totalArea.toFixed(1)}` : '-',
        totalExcArea > 0 ? `${totalExcArea.toFixed(1)}` : '-',
        totalDeposit > 0 ? `${Math.round(totalDeposit).toLocaleString()}` : '-',
        totalRent > 0 ? `${Math.round(totalRent).toLocaleString()}` : '-',
        totalMgmt > 0 ? `${Math.round(totalMgmt).toLocaleString()}` : '-',
        totalMonthlySum > 0 ? `${Math.round(totalMonthlySum).toLocaleString()}` : '-',
        '-'
      ]);
    }
    
    let displayRows = rawRows;
    let truncated = false;
    let totalCount = rawRows.length;
    
    // D45: Dynamic row height to fit more rows (up to 18 rows comfortably)
    const maxRowsToFit = 18;
    if (rawRows.length > maxRowsToFit) {
      const summaryRow = rawRows.find((r: any) => r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim())));
      displayRows = rawRows.filter((r: any) => !r.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()))).slice(0, maxRowsToFit - 1);
      if (summaryRow) displayRows.push(summaryRow);
      truncated = true;
    }
    
    // Calculate dynamic sizes
    const totalRenderRows = displayRows.length + 1; // +1 for header
    let dynamicRowH = 0.35;
    let dynamicFontSize = 8.5;
    
    if (totalRenderRows > 12) {
      dynamicRowH = Math.max(0.24, 4.8 / totalRenderRows);
      dynamicFontSize = dynamicRowH >= 0.30 ? 8.5 : dynamicRowH >= 0.27 ? 8 : 7.5;
    }
    
    // Render table
    const tableData: any[][] = [];
    const cellMargin = L.getDynamicTableMargin(dynamicRowH);
    
    // Header
    tableData.push(HEADERS.map((h, cIdx) => {
      const cWidth = colW[cIdx] ?? 0.8;
      const fitted = L.fitTableCell(h, cWidth, dynamicRowH, Math.max(dynamicFontSize, 9));
      return {
        text: fitted.text,
        options: { fill: C.ink, color: C.bg, fontSize: fitted.fontSize, bold: true, align: 'center', margin: cellMargin }
      };
    }));
    
    // Body
    displayRows.forEach((row: any, i: number) => {
      const isSummary = row.some((c: any) => /^(?:합계|계|총합|총액)\b/.test(String(c || '').trim()));
      const isVacant = String(row[3] || '').includes('공실');
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
        row[5] || '',
        row[6] || '',
        row[7] || '',
        row[8] || '',
        row[9] || '',
      ].map((cell, cIdx) => {
        const text = String(cell).replace(/\*\*/g, '');
        const cWidth = colW[cIdx] ?? 0.8;
        const fitted = L.fitTableCell(text, cWidth, dynamicRowH, dynamicFontSize);
        return {
          text: fitted.text,
          options: {
            fill, color, fontSize: fitted.fontSize, bold,
            align: cIdx >= 3 && cIdx <= 8 ? 'right' : (cIdx === 1 ? 'left' : 'center'),
            fontFace: KR,
            margin: cellMargin,
          }
        };
      });
      tableData.push(mappedRow);
    });
    
    slide.addTable(tableData, {
      x: tbX, y: spY, w: tbW, colW,
      border: { type: 'solid', color: C.line, pt: 0.3 },
      rowH: dynamicRowH,
      valign: 'middle'
    });
    
    if (truncated) {
      slide.addText(`(전체 ${totalCount - 1}건 중 ${maxRowsToFit - 1}건 표시)`, {
        x: tbX, y: 6.52, w: tbW, h: 0.20,
        fontSize: Math.max(dynamicFontSize - 1, 7), color: '7A8794', align: 'right', fontFace: KR, margin: 0
      });
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  
  return { slide, warnings };
}
