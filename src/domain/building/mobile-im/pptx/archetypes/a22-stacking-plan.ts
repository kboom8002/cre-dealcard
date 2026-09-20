/**
 * @file a22-stacking-plan.ts
 * @description Archetype A22: 건축 입면 셋백(Setback) 스태킹 플랜 & 임대차 현황 매트릭스
 * 
 * Spec:
 * - 16:9 캔버스 물리 무결성 (13.333" x 7.5"), Zero Bleed (G35).
 * - 좌측 패널: 건축 입면 셋백(10F~11F), 지표면(GL ±0.0m), 지하층(B1~B6F) 깊이감 반영 단면 실루엣.
 * - 우측 패널: 핵심 지표 4대 KPI 카드 + 층별 바닥/전용/임대면적 및 만기 매트릭스 표.
 * - 의미적 컬러코드: anchor(Navy/Gold), general(Slate), retail(Teal), parking(Charcoal), vacant(Red/Amber).
 * - Rule 1 (페르소나 격리), Rule 2 (CRE 실무 표준 용어), Rule 3 (비중복), Rule 10 (16면 본문 상한) 준수.
 */

import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR, NUM, CD } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import type { StackingPlanFloor, StackingPlanSummary, TenantCategory } from '../../types';
import { sqmToPyeong, pyeongToSqm } from "@/lib/utils/area-conversion";

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
  slide: ReturnType<PptxGenJS['addSlide']>;
  warnings: string[];
}

/** 의미적 컬러 매핑 (Light mode) */
export const TENANT_PALETTE: Record<TenantCategory, { fill: string; border: string; text: string; label: string }> = {
  anchor:  { fill: '1E3A8A', border: '3B82F6', text: 'FFFFFF', label: '앵커 테넌트' },
  general: { fill: '475569', border: '64748B', text: 'FFFFFF', label: '일반 업무' },
  retail:  { fill: '0D9488', border: '14B8A6', text: 'FFFFFF', label: '리테일/근생' },
  parking: { fill: '334155', border: '475569', text: 'CBD5E1', label: '주차/기계' },
  vacant:  { fill: 'EF4444', border: 'F87171', text: 'FFFFFF', label: '공실' },
};

/** 의미적 컬러 매핑 (Dark mode) */
export const TENANT_PALETTE_DARK: Record<TenantCategory, { fill: string; border: string; text: string; label: string }> = {
  anchor:  { fill: '1E3A8A', border: 'B98A2E', text: 'E8DEC8', label: '앵커 테넌트' },
  general: { fill: '334155', border: '475569', text: 'E2E8F0', label: '일반 업무' },
  retail:  { fill: '065F46', border: '10B981', text: 'D1FAE5', label: '리테일/근생' },
  parking: { fill: '1E293B', border: '334155', text: '94A3B8', label: '주차/기계' },
  vacant:  { fill: '991B1B', border: 'EF4444', text: 'FEE2E2', label: '공실' },
};

/**
 * 층별 바닥면적 기준 셋백 너비 비율 계산 함수
 * - 지상층: 상층부 셋백 테라스 반영 (0.45 ~ 1.0)
 * - 지하층: 굴착/대지 경계 확장 반영 (1.0 ~ 1.35)
 */
export function calculateSetbackRatio(
  floorArea: number,
  standardFloorArea: number,
  isSubterranean: boolean = false
): number {
  if (floorArea < 0) {
    console.warn('[A22] Negative floor area, clamping to 0'); return 0;
  }
  if (!floorArea || !standardFloorArea || standardFloorArea <= 0) {
    return 1.0;
  }
  const rawRatio = floorArea / standardFloorArea;
  if (isSubterranean) {
    return Math.min(1.35, Math.max(1.0, Math.round(rawRatio * 100) / 100));
  } else {
    return Math.min(1.0, Math.max(0.45, Math.round(rawRatio * 100) / 100));
  }
}

/**
 * 테넌트 사용 용도 및 명칭 기반 카테고리 자동 추론
 */
export function inferTenantCategory(
  floor: Partial<StackingPlanFloor>,
  anchorTenantName?: string
): TenantCategory {
  if (floor.isVacant || (floor.tenant && (floor.tenant.includes('공실') || floor.tenant.includes('미임차')))) {
    return 'vacant';
  }
  const use = (floor.use || '').toLowerCase();
  const tenant = (floor.tenant || '').toLowerCase();

  // 주차장 및 기계실/전기실
  if (
    use.includes('주차') || use.includes('기계') || use.includes('전기') || use.includes('발전') ||
    tenant.includes('주차') || tenant.includes('기계') || tenant.includes('전기')
  ) {
    return 'parking';
  }

  // 앵커 테넌트 (사옥/본사 또는 지정 앵커사)
  if (anchorTenantName && (tenant.includes(anchorTenantName.toLowerCase()) || anchorTenantName.toLowerCase().includes(tenant))) {
    return 'anchor';
  }
  if (
    tenant.includes('사옥') || tenant.includes('본사') ||
    tenant.includes('앵커') || use.includes('사옥')
  ) {
    return 'anchor';
  }

  // 리테일 / 근린생활시설 / 병원 / F&B
  if (
    use.includes('근린생활') || use.includes('근생') || use.includes('휴게음식') || use.includes('소매') ||
    tenant.includes('편의점') || tenant.includes('카페') || tenant.includes('병원') || tenant.includes('의원') ||
    tenant.includes('약국') || tenant.includes('식당') || tenant.includes('베이커리') || tenant.includes('f&b') ||
    tenant.includes('음식점') || tenant.includes('클리닉') || tenant.includes('치과')
  ) {
    return 'retail';
  }

  return 'general';
}

/**
 * 고층 빌딩(N > 16) 스태킹 플랜 및 테이블용 층 병합/군집화(Clustering) 함수
 * - 지상층 기준층(연속 업무시설) 군집화 및 지하 주차장 층 병합
 * - 상층부 셋백/테라스, 저층부 근생/로비, 앵커 테넌트 층은 개별 보존
 */
export function condenseFloorsForDisplay(
  floors: StackingPlanFloor[],
  anchorName?: string
): StackingPlanFloor[] {
  if (floors.length <= 16) {
    return mergeParkingFloors(floors);
  }

  const above = floors.filter(f => !String(f?.floor || '').toUpperCase().startsWith('B'));
  const below = floors.filter(f => String(f?.floor || '').toUpperCase().startsWith('B'));

  const condensedBelow = mergeParkingFloors(below);
  const condensedAbove: StackingPlanFloor[] = [];

  if (above.length <= 12) {
    condensedAbove.push(...above);
  } else {
    const topPreservedCount = Math.min(
      3,
      above.filter((f, idx) => idx < 3 && (f.hasTerrace || (f.setbackRatio != null && f.setbackRatio < 0.85))).length || 2
    );

    const bottomPreservedCount = Math.min(
      3,
      above.filter((f, idx) => idx >= above.length - 3 && (f.category === 'retail' || f.tenantCategory === 'retail')).length || 2
    );

    const topFloors = above.slice(0, topPreservedCount);
    const bottomFloors = above.slice(above.length - bottomPreservedCount);
    const middleFloors = above.slice(topPreservedCount, above.length - bottomPreservedCount);

    condensedAbove.push(...topFloors);

    if (middleFloors.length <= 4) {
      condensedAbove.push(...middleFloors);
    } else {
      const numClusters = middleFloors.length > 24 ? 3 : (middleFloors.length > 10 ? 2 : 1);
      const chunkSize = Math.ceil(middleFloors.length / numClusters);

      for (let c = 0; c < numClusters; c++) {
        const chunk = middleFloors.slice(c * chunkSize, (c + 1) * chunkSize);
        if (chunk.length === 0) continue;

        if (chunk.length === 1) {
          condensedAbove.push(chunk[0]);
        } else {
          const topFloorRaw = chunk[0].floor || '';
          const bottomFloorRaw = chunk[chunk.length - 1].floor || '';
          const topFloorNum = topFloorRaw.replace(/\D/g, '');
          const bottomFloorNum = bottomFloorRaw.replace(/\D/g, '');
          const floorLabel = topFloorNum && bottomFloorNum
            ? (parseInt(bottomFloorNum, 10) < parseInt(topFloorNum, 10) ? `${bottomFloorNum}F~${topFloorNum}F` : `${topFloorNum}F~${bottomFloorNum}F`)
            : `${bottomFloorRaw}~${topFloorRaw}`;

          const totalExclusivePy = chunk.reduce((sum, f) => sum + (f.exclusiveAreaPy ?? (f.exclusiveAreaM2 ? sqmToPyeong(f.exclusiveAreaM2) : 0)), 0);
          const totalLeasablePy = chunk.reduce((sum, f) => sum + (f.leasableAreaPy ?? (f.leasableAreaM2 ? sqmToPyeong(f.leasableAreaM2) : 0)), 0);
          const avgFloorAreaM2 = chunk.reduce((sum, f) => sum + (f.floorAreaM2 || 0), 0) / chunk.length;
          const allVacant = chunk.every(f => f.isVacant);
          const isAnchorChunk = anchorName && chunk.some(f => f.tenant?.includes(anchorName));

          condensedAbove.push({
            floor: floorLabel,
            use: '기준층 업무시설',
            tenant: isAnchorChunk
              ? `${anchorName} (${chunk.length}개층)`
              : (allVacant ? `공실 (${chunk.length}개층)` : `기준층 업무 (${chunk.length}개층)`),
            floorAreaM2: avgFloorAreaM2,
            exclusiveAreaPy: totalExclusivePy,
            leasableAreaPy: totalLeasablePy,
            setbackRatio: 1.0,
            hasTerrace: false,
            isVacant: allVacant,
            category: isAnchorChunk ? 'anchor' : (allVacant ? 'vacant' : 'general'),
            tenantCategory: isAnchorChunk ? 'anchor' : (allVacant ? 'vacant' : 'general'),
            expiryYear: chunk[0].expiryYear || 0,
          });
        }
      }
    }

    condensedAbove.push(...bottomFloors);
  }

  return [...condensedAbove, ...condensedBelow];
}

/**
 * 연속된 지하 주차장 층 병합 헬퍼
 */
function mergeParkingFloors(floors: StackingPlanFloor[]): StackingPlanFloor[] {
  const result: StackingPlanFloor[] = [];
  const parkingGroup: StackingPlanFloor[] = [];

  const flushParking = () => {
    if (parkingGroup.length === 0) return;
    if (parkingGroup.length === 1) {
      result.push(parkingGroup[0]);
    } else {
      const firstF = parkingGroup[0].floor || '';
      const lastF = parkingGroup[parkingGroup.length - 1].floor || '';
      const totalExPy = parkingGroup.reduce((sum, f) => sum + (f.exclusiveAreaPy || 0), 0);
      const totalLeasPy = parkingGroup.reduce((sum, f) => sum + (f.leasableAreaPy || 0), 0);
      const totalAreaM2 = parkingGroup.reduce((sum, f) => sum + (f.floorAreaM2 || 0), 0);
      result.push({
        floor: `${firstF}~${lastF}`,
        use: '주차장',
        tenant: `지하 자주식 주차장 (${parkingGroup.length}개층)`,
        floorAreaM2: totalAreaM2 / parkingGroup.length,
        exclusiveAreaPy: totalExPy,
        leasableAreaPy: totalLeasPy,
        setbackRatio: Math.max(...parkingGroup.map(f => f.setbackRatio ?? 1.25)),
        depthMeters: parkingGroup[parkingGroup.length - 1].depthMeters ?? ((parkingGroup.length + 1) * -3.5),
        category: 'parking',
        tenantCategory: 'parking',
        isVacant: false,
        hasTerrace: false,
      });
    }
    parkingGroup.length = 0;
  };

  for (const f of floors) {
    const isParking = f.category === 'parking' || f.tenantCategory === 'parking' ||
      f.use?.includes('주차') || f.tenant?.includes('주차');
    if (isParking && floors.length > 3) {
      parkingGroup.push(f);
    } else {
      flushParking();
      result.push(f);
    }
  }
  flushParking();

  return result;
}

/**
 * Archetype A22 Stacking Plan 슬라이드 빌더
 */
export function buildA22StackingPlan(input: ArchetypeInput): ArchetypeOutput {
  const warnings: string[] = [];
  const onDark = input.data.onDark === true;
  const slide = onDark ? L.dark(input.pres) : L.light(input.pres);

  const kicker = input.data.kicker || 'ARCHITECTURAL STACKING PLAN';
  const title = input.data.title || '건축 입면 셋백 단면 실루엣 및 층별 임대차 현황';

  // Rule 1 가드레일: 제목 및 본문 페르소나 단어 검출
  const personaRegex = /60대|자산가|법인\s*대표|디벨로퍼\s*맞춤|은퇴자/;
  if (personaRegex.test(title) || personaRegex.test(kicker)) {
    warnings.push(`[Rule 1] A22 제목에 페르소나 단어가 포함되었습니다: "${title}"`);
  }

  if (onDark) {
    L.headD(slide, input.slideNum, kicker, title);
  } else {
    L.head(slide, input.slideNum, kicker, title);
  }

  // ── 레이아웃 기하 (16:9 와이드, Zero Bleed 보장) ──
  // Canvas: W=13.333, H=7.5, M=0.62, CW=12.093
  const y = 1.48;
  const hCard = 5.25;
  const gap = 0.28;
  const leftW = 5.45;
  const rightW = CW - leftW - gap; // 12.093 - 5.45 - 0.28 = 6.363
  const leftX = M;
  const rightX = leftX + leftW + gap; // 0.62 + 5.45 + 0.28 = 6.35

  // ── 데이터 정규화 ──
  const rawFloors: StackingPlanFloor[] = Array.isArray(input.data.stackingPlan)
    ? input.data.stackingPlan
    : [];

  const anchorName = input.data.anchorTenantName || input.data.anchorTenant?.name || '주요 임차인';

  // 기준층 바닥면적 산출 (9F~5F 일반 기준층 평균)
  let standardArea = 0;
  for (const f of rawFloors) {
    const floorStr = String(f?.floor || '');
    const floorNum = parseInt(floorStr.replace(/\D/g, ''), 10);
    if (!floorStr.toUpperCase().startsWith('B') && floorNum >= 3 && floorNum <= 9) {
      if (f.floorAreaM2 && f.floorAreaM2 > standardArea) {
        standardArea = f.floorAreaM2;
      } else if (f.floorAreaPy && f.floorAreaPy > standardArea) {
        standardArea = f.floorAreaPy;
      }
    }
  }
  if (standardArea <= 0) {
    const validAboveFloors = rawFloors.filter(f => !String(f?.floor || '').toUpperCase().startsWith('B') && (f.floorAreaM2 || f.floorAreaPy));
    if (validAboveFloors.length > 0) {
      const sum = validAboveFloors.reduce((acc, f) => acc + (f.floorAreaM2 || pyeongToSqm(f.floorAreaPy || 0)), 0);
      standardArea = Math.round(sum / validAboveFloors.length);
    } else {
      standardArea = 1000;
    }
  }

  // 층 정규화 및 카테고리/셋백 비율 할당
  const normalizedFloors: StackingPlanFloor[] = rawFloors.map(f => {
    const floorStr = String(f?.floor || '');
    const isSub = floorStr.toUpperCase().startsWith('B');
    const area = f.floorAreaM2 || (f.floorAreaPy ? pyeongToSqm(f.floorAreaPy) : standardArea);
    const setback = f.setbackRatio ?? calculateSetbackRatio(area, standardArea, isSub);
    const category = f.category || f.tenantCategory || inferTenantCategory(f, anchorName);
    const hasTerrace = f.hasTerrace ?? (!isSub && setback < 0.70);
    return {
      ...f,
      floor: f?.floor || (isSub ? 'B1F' : '1F'),
      category,
      tenantCategory: category,
      setbackRatio: setback,
      hasTerrace,
    };
  });

  // 고층/다층 자산 디스플레이 군집화 (Zero Bleed 보장)
  const displayFloors = condenseFloorsForDisplay(normalizedFloors, anchorName);

  // ══════════════════════════════════════════════════════
  // 좌측 패널: 건축 입면 셋백 단면 실루엣 (Silhouette)
  // ══════════════════════════════════════════════════════
  L.card(slide, leftX, y, leftW, hCard, { onDark });

  // 좌측 소제목
  slide.addText('1. 건축 입면 셋백 및 층별 단면 실루엣', {
    x: leftX + 0.22,
    y: y + 0.16,
    w: leftW - 0.44,
    h: 0.28,
    fontFace: KR,
    fontSize: 12.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  // 범례 행 (Legend Row)
  const legendY = y + 0.44;
  const colorMap = onDark ? TENANT_PALETTE_DARK : TENANT_PALETTE;
  const legendItems: Array<{ cat: TenantCategory; label: string }> = [
    { cat: 'anchor', label: '앵커' },
    { cat: 'general', label: '일반' },
    { cat: 'retail', label: '리테일' },
    { cat: 'parking', label: '주차/기계' },
    { cat: 'vacant', label: '공실' },
  ];
  let legX = leftX + 0.22;
  legendItems.forEach(item => {
    const colCfg = colorMap[item.cat];
    slide.addShape('roundRect', {
      x: legX,
      y: legendY + 0.02,
      w: 0.16,
      h: 0.16,
      rectRadius: 0.04,
      fill: { color: colCfg.fill },
      line: { color: colCfg.border, width: 0.5 },
    });
    slide.addText(item.label, {
      x: legX + 0.20,
      y: legendY,
      w: 0.75,
      h: 0.20,
      fontFace: KR,
      fontSize: 8.5,
      color: onDark ? CD.body : C.body,
      valign: 'middle',
      margin: 0,
    });
    legX += 0.95;
  });

  // 단면 바 그리기 영역
  const stackTopY = y + 0.70;
  const stackAvailH = 4.38;

  // 지상/지하 분리 (디스플레이 층 기준)
  // 건축 단면도 표준: 최상층이 위(Y 작음), 최하층이 아래(Y 큼)
  const aboveFloors = displayFloors
    .filter(f => !String(f?.floor || '').toUpperCase().startsWith('B'))
    .sort((a, b) => {
      const numA = parseInt(String(a?.floor || '0').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b?.floor || '0').replace(/\D/g, ''), 10) || 0;
      return numB - numA; // 내림차순: 5F → 4F → 3F → 2F → 1F
    });
  const belowFloors = displayFloors.filter(f => String(f?.floor || '').toUpperCase().startsWith('B'));

  const totalDisplayRows = aboveFloors.length + belowFloors.length;
  const glLineHeight = 0.16;
  const netFloorSpace = stackAvailH - glLineHeight;
  const rowGap = totalDisplayRows > 20 ? 0.006 : (totalDisplayRows > 12 ? 0.010 : 0.015);
  const totalGaps = Math.max(0, totalDisplayRows - 1) * rowGap;
  const rowHeight = Math.min(0.25, Math.max(0.06, (netFloorSpace - totalGaps) / Math.max(1, totalDisplayRows)));

  const crossCenterX = leftX + leftW / 2;
  const maxBarWidth = 4.30;

  let currentBarY = stackTopY;

  // 방어적 단언: 최상층이 배열 첫 번째 (건축 단면도 표준)
  if (aboveFloors.length >= 2) {
    const firstNum = parseInt(String(aboveFloors[0]?.floor || '0').replace(/\D/g, ''), 10) || 0;
    const lastNum = parseInt(String(aboveFloors[aboveFloors.length - 1]?.floor || '0').replace(/\D/g, ''), 10) || 0;
    if (firstNum > 0 && lastNum > 0 && firstNum < lastNum) {
      warnings.push(`[A22] 스태킹 플랜 층 순서 이상: ${aboveFloors[0].floor} < ${aboveFloors[aboveFloors.length-1].floor} (최상층이 먼저 와야 함)`);
    }
  }

  // 1) 지상층 렌더링 (상층부 -> 1F)
  aboveFloors.forEach(floor => {
    const ratio = floor.setbackRatio ?? 1.0;
    const barW = maxBarWidth * ratio;
    const barX = crossCenterX - barW / 2;
    const colCfg = colorMap[floor.category ?? 'general'];

    // 층 바 배경
    slide.addShape('roundRect', {
      x: barX,
      y: currentBarY,
      w: barW,
      h: rowHeight,
      rectRadius: 0.03,
      fill: { color: colCfg.fill },
      line: { color: colCfg.border, width: 0.5 },
    });

    const fontScale = rowHeight < 0.12 ? 0.75 : (rowHeight < 0.16 ? 0.88 : 1.0);
    const floorFontSize = Math.max(6.0, Math.round(8.5 * fontScale * 10) / 10);
    const tenantFontSize = Math.max(5.8, Math.round(8.2 * fontScale * 10) / 10);
    const badgeFontSize = Math.max(5.5, Math.round(7.8 * fontScale * 10) / 10);

    // 층명 (11F, 10F...)
    slide.addText(floor.floor || '-', {
      x: barX + 0.08,
      y: currentBarY,
      w: 0.85,
      h: rowHeight,
      fontFace: NUM,
      fontSize: floorFontSize,
      bold: true,
      color: colCfg.text,
      valign: 'middle',
      margin: 0,
    });

    // 주요 임차사 명칭
    const tenantLabel = floor.tenant
      ? floor.tenant.slice(0, 20)
      : (floor.use ? floor.use.slice(0, 16) : '-');
    slide.addText(tenantLabel, {
      x: barX + 0.95,
      y: currentBarY,
      w: Math.max(1.2, barW - 1.75),
      h: rowHeight,
      fontFace: KR,
      fontSize: tenantFontSize,
      color: colCfg.text,
      valign: 'middle',
      margin: 0,
    });

    // 만기 연도 뱃지 (Pill)
    if (floor.expiryYear && floor.expiryYear > 0 && rowHeight >= 0.10) {
      slide.addText(`'${String(floor.expiryYear).slice(-2)}`, {
        x: barX + barW - 0.70,
        y: currentBarY + 0.02,
        w: 0.62,
        h: rowHeight - 0.04,
        fontFace: NUM,
        fontSize: badgeFontSize,
        bold: true,
        align: 'center',
        valign: 'middle',
        fill: { color: onDark ? CD.border : C.tint },
        color: onDark ? 'FFFFFF' : C.ink,
        margin: 0,
      });
    }

    // 테라스 셋백 표기 (상층부 후퇴 층)
    if (floor.hasTerrace && rowHeight >= 0.11) {
      slide.addText('🌿 테라스', {
        x: barX + barW + 0.08,
        y: currentBarY,
        w: 0.70,
        h: rowHeight,
        fontFace: KR,
        fontSize: 7.5,
        bold: true,
        color: onDark ? '10B981' : '0D9488',
        valign: 'middle',
        margin: 0,
      });
    }

    currentBarY += rowHeight + rowGap;
  });

  // 2) 지표면 (GL ±0.0m) 디바이더 라인
  currentBarY += 0.03;
  slide.addShape('line', {
    x: leftX + 0.30,
    y: currentBarY + 0.07,
    w: leftW - 0.60,
    h: 0,
    line: { color: onDark ? CD.mute : C.slate, width: 1.2, dashType: 'dash' },
  });
  slide.addText('지표면 (GL ±0.0m)', {
    x: leftX + 0.35,
    y: currentBarY,
    w: 1.60,
    h: 0.16,
    fontFace: KR,
    fontSize: 7.5,
    bold: true,
    color: onDark ? CD.mute : C.slate,
    margin: 0,
  });
  currentBarY += glLineHeight;

  // 3) 지하층 렌더링 (B1F -> B6F)
  belowFloors.forEach((floor, bIdx) => {
    const ratio = floor.setbackRatio ?? 1.25;
    const barW = Math.min(leftW - 0.80, maxBarWidth * ratio);
    const barX = crossCenterX - barW / 2;
    const colCfg = colorMap[floor.category ?? 'parking'];

    const fontScale = rowHeight < 0.12 ? 0.75 : (rowHeight < 0.16 ? 0.88 : 1.0);
    const floorFontSize = Math.max(6.0, Math.round(8.5 * fontScale * 10) / 10);
    const tenantFontSize = Math.max(5.8, Math.round(8.2 * fontScale * 10) / 10);
    const badgeFontSize = Math.max(5.5, Math.round(7.8 * fontScale * 10) / 10);
    const depthFontSize = Math.max(5.5, Math.round(7.0 * fontScale * 10) / 10);

    // 지하 심도 라벨 (-3.5m, -7.0m...)
    const depthMeters = floor.depthMeters ?? ((bIdx + 1) * -3.5);
    slide.addText(`${depthMeters}m`, {
      x: leftX + 0.05,
      y: currentBarY,
      w: 0.65,
      h: rowHeight,
      fontFace: NUM,
      fontSize: depthFontSize,
      color: onDark ? CD.mute : C.slate,
      align: 'right',
      valign: 'middle',
      margin: 0,
    });

    // 지하층 바 배경
    slide.addShape('roundRect', {
      x: barX,
      y: currentBarY,
      w: barW,
      h: rowHeight,
      rectRadius: 0.03,
      fill: { color: colCfg.fill },
      line: { color: colCfg.border, width: 0.5 },
    });

    // 층명 (B1F, B2F...)
    slide.addText(floor.floor || '-', {
      x: barX + 0.08,
      y: currentBarY,
      w: 0.85,
      h: rowHeight,
      fontFace: NUM,
      fontSize: floorFontSize,
      bold: true,
      color: colCfg.text,
      valign: 'middle',
      margin: 0,
    });

    // 테넌트 / 용도
    const desc = floor.tenant
      ? floor.tenant.slice(0, 20)
      : (floor.use ? floor.use.slice(0, 16) : '-');
    slide.addText(desc, {
      x: barX + 0.95,
      y: currentBarY,
      w: Math.max(1.2, barW - 1.75),
      h: rowHeight,
      fontFace: KR,
      fontSize: tenantFontSize,
      color: colCfg.text,
      valign: 'middle',
      margin: 0,
    });

    // 만기 연도 뱃지
    if (floor.expiryYear && floor.expiryYear > 0 && rowHeight >= 0.10) {
      slide.addText(`'${String(floor.expiryYear).slice(-2)}`, {
        x: barX + barW - 0.70,
        y: currentBarY + 0.02,
        w: 0.62,
        h: rowHeight - 0.04,
        fontFace: NUM,
        fontSize: badgeFontSize,
        bold: true,
        align: 'center',
        valign: 'middle',
        fill: { color: onDark ? CD.border : C.tint },
        color: onDark ? 'FFFFFF' : C.ink,
        margin: 0,
      });
    }

    currentBarY += rowHeight + rowGap;
  });

  // ══════════════════════════════════════════════════════
  // 우측 패널: KPI 카드 + 층별 임대차 매트릭스 표
  // ══════════════════════════════════════════════════════
  L.card(slide, rightX, y, rightW, hCard, { onDark });

  // 우측 소제목
  slide.addText('2. 층별 면적 및 임대차 제원 매트릭스', {
    x: rightX + 0.22,
    y: y + 0.16,
    w: rightW - 0.44,
    h: 0.28,
    fontFace: KR,
    fontSize: 12.5,
    bold: true,
    color: onDark ? C.brass : C.brassD,
    margin: 0,
  });

  // ── 4대 핵심 KPI 카드 ──
  const summary: StackingPlanSummary = input.data.summary || input.data.stackingSummary || {};
  const totalGfaPy = summary.totalGrossAreaPy || input.data.totalGrossAreaPy;
  const exclusiveRate = summary.exclusiveRatePct || input.data.exclusiveRatePct;
  const waleVal = summary.waleYears || input.data.waleYears;
  const vacancyVal = summary.vacancyRatePct ?? input.data.vacancyRatePct;

  const kpiY = y + 0.46;
  const kpiH = 0.78;
  const kpiGap = 0.12;
  const kpiW = (rightW - 0.44 - kpiGap * 3) / 4; // ~1.39"

  const gfaValue = totalGfaPy ? `${Number(totalGfaPy).toLocaleString(undefined, { maximumFractionDigits: 1 })}평` : '—';
  const exclusiveValue = exclusiveRate != null ? `${exclusiveRate}%` : '—';
  const waleValue = waleVal != null ? `${waleVal}년` : '—';
  const vacancyValue = vacancyVal != null ? `${vacancyVal}%` : '—';

  const kpiData = [
    { label: '연면적', value: gfaValue, sub: '건축물대장' },
    { label: '전용률', value: exclusiveValue, sub: '계약면적 대비' },
    { label: 'WALE', value: waleValue, sub: '잔여 임대기간' },
    { label: '공실률', value: vacancyValue, sub: (vacancyVal === 0 ? '전층 만실 운용' : (vacancyVal != null ? '일부 공실' : '—')) },
  ];

  kpiData.forEach((kpi, idx) => {
    const kX = rightX + 0.22 + idx * (kpiW + kpiGap);
    slide.addShape('roundRect', {
      x: kX,
      y: kpiY,
      w: kpiW,
      h: kpiH,
      rectRadius: 0.05,
      fill: { color: onDark ? CD.block : C.tint },
      line: { color: onDark ? CD.border : C.line, width: 0.5 },
    });
    slide.addText(kpi.label, {
      x: kX + 0.08,
      y: kpiY + 0.08,
      w: kpiW - 0.16,
      h: 0.18,
      fontFace: KR,
      fontSize: 8.5,
      color: onDark ? CD.mute : C.mute,
      margin: 0,
    });
    slide.addText(kpi.value, {
      x: kX + 0.08,
      y: kpiY + 0.26,
      w: kpiW - 0.16,
      h: 0.28,
      fontFace: NUM,
      fontSize: 13.5,
      bold: true,
      color: onDark ? 'FFFFFF' : C.ink,
      margin: 0,
    });
    slide.addText(kpi.sub, {
      x: kX + 0.08,
      y: kpiY + 0.54,
      w: kpiW - 0.16,
      h: 0.18,
      fontFace: KR,
      fontSize: 7.2,
      color: onDark ? CD.faint : C.mute2,
      margin: 0,
    });
  });

  // ── 층별 제원 표 (Data Matrix Table) ──
  const tableY = kpiY + kpiH + 0.16;
  const tableW = 5.92;

  const tableHeaders = ['층수', '주용도', '전용(평)', '임대(평)', '주요 입주사', '만기'];
  const tableColW = [0.65, 1.15, 0.78, 0.78, 1.96, 0.60]; // 0.65 + 1.15 + 0.78 + 0.78 + 1.96 + 0.60 = 5.92"

  const displayTableRows: Array<[string, string, string, string, string, string]> = [];

  displayFloors.forEach(f => {
    displayTableRows.push([
      f.floor || '-',
      f.use ? f.use.replace(/제[12]종근린생활시설/g, '근린생활').slice(0, 10) : '-',
      f.exclusiveAreaPy != null ? f.exclusiveAreaPy.toFixed(1) : (f.exclusiveAreaM2 ? (sqmToPyeong(f.exclusiveAreaM2)).toFixed(1) : '-'),
      f.leasableAreaPy != null ? f.leasableAreaPy.toFixed(1) : (f.leasableAreaM2 ? (sqmToPyeong(f.leasableAreaM2)).toFixed(1) : '-'),
      f.tenant ? f.tenant.slice(0, 18) : '-',
      f.expiryYear && f.expiryYear > 0 ? `${f.expiryYear}` : '-',
    ]);
  });

  // ── 동적 집계 계산 (Dynamic Summary Calculation) ──
  // 1) 실제 전용면적(평) 합산
  const realTotalExclusivePy = normalizedFloors.reduce((sum, f) => {
    const py = f.exclusiveAreaPy ?? (f.exclusiveAreaM2 ? sqmToPyeong(f.exclusiveAreaM2) : 0);
    return sum + (typeof py === 'number' && !isNaN(py) ? py : 0);
  }, 0);
  const fallbackExclusivePy = summary.totalExclusiveAreaPy
    ? String(summary.totalExclusiveAreaPy)
    : (summary.totalGrossAreaPy && summary.exclusiveRatePct
        ? ((summary.totalGrossAreaPy * summary.exclusiveRatePct) / 100).toFixed(1)
        : '-');
  const formattedExclusivePy = realTotalExclusivePy > 0
    ? realTotalExclusivePy.toFixed(1)
    : fallbackExclusivePy;

  // 2) 실제 공실 층수 및 텍스트 산출
  const vacantFloorsCount = normalizedFloors.filter(f => f.isVacant || f.category === 'vacant' || f.tenantCategory === 'vacant').length;
  const dynamicVacancyText = vacantFloorsCount === 0
    ? (vacancyVal > 0 ? `공실률 ${vacancyVal}%` : '전층 만실')
    : `${vacantFloorsCount}개층 공실`;

  // 3) 실제 앵커 테넌트 사용 층수 산출
  const realAnchorFloorsCount = normalizedFloors.filter(f =>
    f.tenantCategory === 'anchor' ||
    f.category === 'anchor' ||
    (anchorName && typeof f.tenant === 'string' && f.tenant.toLowerCase().includes(anchorName.toLowerCase()))
  ).length;

  let dynamicAnchorNote = '단독 사옥';
  if (realAnchorFloorsCount > 0) {
    dynamicAnchorNote = `${anchorName} ${realAnchorFloorsCount}개층 사옥 단독 사용`;
  } else if (normalizedFloors.length > 0) {
    const firstActive = normalizedFloors.find(f => !f.isVacant && typeof f.tenant === 'string' && f.tenant !== '-');
    if (firstActive?.tenant) {
      dynamicAnchorNote = `${firstActive.tenant.slice(0, 16)}`;
    } else if (normalizedFloors[0]?.tenant && normalizedFloors[0].tenant !== '-') {
      dynamicAnchorNote = `${normalizedFloors[0].tenant.slice(0, 16)}`;
    } else {
      dynamicAnchorNote = '일반 임대 운용';
    }
  } else {
    dynamicAnchorNote = '일반 임대 운용';
  }

  // 4) 실제 연면적/임대면적 표기
  const formattedGfa = typeof totalGfaPy === 'number'
    ? `${totalGfaPy.toLocaleString()}`
    : `${totalGfaPy}`;

  // 합계 행 추가
  displayTableRows.push([
    '합계',
    dynamicVacancyText,
    formattedExclusivePy,
    formattedGfa,
    dynamicAnchorNote,
    waleVal > 0 ? `WALE ${waleVal}년` : '-',
  ]);

  const cellData = displayTableRows.map((row, rIdx) => {
    const isTotal = rIdx === displayTableRows.length - 1;
    return row.map((cellText, cIdx) => ({
      t: cellText,
      b: isTotal || cIdx === 0,
      c: isTotal ? (onDark ? C.brass : C.brassD) : (cIdx === 0 ? (onDark ? 'FFFFFF' : C.ink) : (onDark ? CD.body : C.body)),
      fill: isTotal ? (onDark ? CD.block : C.tint) : undefined,
    }));
  });

  // 표 높이 자동 스케일 (하단 각주와 겹침 및 지면 이탈 방지)
  const maxTableH = 3.20;
  const targetRowH = Math.min(0.24, Math.max(0.14, maxTableH / (displayTableRows.length + 1)));

  L.table(
    slide,
    rightX + 0.22,
    tableY,
    tableW,
    tableHeaders,
    cellData,
    tableColW,
    {
      rh: targetRowH,
      bfs: 8.5,
      hfs: 8.5,
      onDark,
    }
  );

  // 하단 참고 주석
  const buildingNote = input.data.buildingNote ? ` (${input.data.buildingNote})` : '';
  slide.addText(
    `※ 본 제원은 건축물대장 및 임대차계약서 실측 기준입니다.${buildingNote}`,
    {
      x: rightX + 0.22,
      y: y + hCard - 0.32,
      w: tableW,
      h: 0.26,
      fontFace: KR,
      fontSize: 8.0,
      color: onDark ? CD.faint : C.mute2,
      margin: 0,
    }
  );

  return { slide, warnings };
}
