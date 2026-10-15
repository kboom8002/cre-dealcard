/**
 * @file a27-land-use-plan.ts
 * @description A27_LAND_USE_PLAN — Basic IM 전용 토지현황 및 토지이용계획확인원 슬라이드
 *
 * 중개 실무 표준 양식(토지이용계획확인원 포맷)에 맞춰 좌측에:
 *   1) ■ 토지개요 (소재지 / 지목 / 면적 / 개별공시지가)
 *   2) ■ 토지이용계획 (국계법 지역·지구 / 다른 법령 지역·지구 / 시행령 제9조제4항 해당 시)
 * 우측에:
 *   - 지적도·용도지역도 이미지 + 본건 마커 배지 + 하단 범례 스와치
 *   - 필지가 2개 이상 용도지역에 걸친 경우에만 조건부 비율 콜아웃 박스 표시
 */

import * as L from '../imlib';
import type { ArchetypeInput, ArchetypeOutput } from './index';
import { optimizeImageForPptx } from '../utils/image-optimizer';
import { readMapMarkerMeta } from '@/lib/external/map-overlay-meta';
import {
  synthesizeLandUseConfirmFromSnapshot,
  type LandUseRegulationSummary,
} from '@/lib/external/land-use-api';
import { resolveDisplayAreas } from '../binder/display-areas';
import { parseBrokerParcels, summarizeParcels, type BrokerParcel } from '../../parcel-input';

const { C, KR, NUM, M, CW } = L;

export interface ZoningShareItem {
  zone: string;
  areaSqm?: number;
  totalAreaSqm?: number;
  sharePct: number;
}

export interface ZoningLegendItem {
  label: string;
  fillColor: string;
  borderColor?: string;
}

export interface ParcelRowItem {
  jibun: string;
  jimok: string;
  areaText: string;
  priceText: string;
}

function fmtNum(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Number(n.toFixed(decimals));
  return rounded.toLocaleString('ko-KR', {
    maximumFractionDigits: decimals,
  });
}

function resolveZoningSwatchColor(zoneName: string): { fill: string; border: string } {
  const z = zoneName.trim();
  if (z.includes('준공업')) return { fill: 'D8B4E2', border: '9C6ADE' };
  if (z.includes('공업')) return { fill: 'C5A3D9', border: '8A56AC' };
  if (z.includes('중심상업') || z.includes('일반상업') || z.includes('근린상업') || z.includes('유통상업')) {
    return { fill: 'F4B6C2', border: 'D64550' };
  }
  if (z.includes('준주거')) return { fill: 'F9D5A7', border: 'E07A2A' };
  if (z.includes('전용주거') || z.includes('일반주거') || z.includes('주거')) {
    return { fill: 'FBE7A1', border: 'D4A017' };
  }
  if (z.includes('녹지')) return { fill: 'B8E0B8', border: '3B873E' };
  if (z.includes('관리')) return { fill: 'D5E8D4', border: '67AB9F' };
  return { fill: 'DCE4EC', border: '64748B' };
}

/**
 * Basic IM Land 슬라이드용 입력 데이터 빌더.
 * 라이브 enrichment 또는 오프라인 스냅샷으로부터 토지개요 4행 + 토지이용계획확인원 2~3행 데이터를 조립합니다.
 */
export function buildBasicLandSlideData(params: {
  existingLandData?: any;
  enrichment?: any;
  ssot?: any;
  building?: any;
  body?: any;
  cadastralImg?: string | null;
}): Record<string, any> {
  const {
    existingLandData = {},
    enrichment = {},
    ssot = {},
    building = {},
    body = {},
    cadastralImg = null,
  } = params;

  const pnu = String(
    ssot?.pnu ||
      ssot?.register_main_pnu ||
      enrichment?.buildingRegister?.mainPnu ||
      body?.pnu ||
      existingLandData?.pnu ||
      '',
  ).trim();

  const landUseConfirm: LandUseRegulationSummary =
    existingLandData?.landUseConfirm &&
    (existingLandData.landUseConfirm.nationalLaw || existingLandData.landUseConfirm.otherLaws)
      ? existingLandData.landUseConfirm
      : synthesizeLandUseConfirmFromSnapshot(enrichment, ssot, pnu);

  const rawParcelsInput = body?.parcels ?? ssot?.parcels ?? building?.parcels ?? undefined;
  const parsedParcels = parseBrokerParcels(rawParcelsInput);
  const parcels: BrokerParcel[] = parsedParcels.ok ? parsedParcels.parcels : [];
  const parcelSummary = summarizeParcels(rawParcelsInput);
  const brokerLandSqm = Number(
    ssot?.land_area_sqm ||
      building?.land_area_sqm ||
      body?.land_area_sqm ||
      enrichment?.buildingRegister?.platArea ||
      enrichment?.landUsePlan?.landArea ||
      0,
  ) || undefined;
  const brokerGfaSqm = Number(
    ssot?.gross_floor_area_sqm ||
      building?.gross_floor_area_sqm ||
      body?.gross_floor_area_sqm ||
      enrichment?.buildingRegister?.totalArea ||
      0,
  ) || undefined;
  const displayAreas = resolveDisplayAreas({
    brokerLandSqm,
    brokerGfaSqm,
    register: enrichment?.buildingRegister ?? null,
  });

  // 1) 소재지 (지번 주소 우선)
  const rawJibun = String(
    enrichment?.landUsePlan?.jibunAddress ||
      landUseConfirm?.jibunAddress ||
      enrichment?.buildingRegister?.platPlc ||
      ssot?.jibun_address ||
      building?.jibun_address ||
      body?.jibun_address ||
      '',
  ).trim();
  const roadAddress = String(
    ssot?.address || building?.address || body?.address || '',
  ).trim();

  let locationText = rawJibun || roadAddress;
  if (parcelSummary.isMulti && parcelSummary.count > 1) {
    if (locationText && !locationText.includes('외 ') && !locationText.includes('필지')) {
      locationText = `${locationText} 외 ${parcelSummary.count - 1}필지`;
    }
  }

  // 2) 지목
  let jimokText = '';
  if (parcelSummary.isMulti && parcelSummary.landCategoryLabel) {
    jimokText = parcelSummary.landCategoryLabel;
  } else {
    jimokText = String(
      enrichment?.landUsePlan?.lndcgrCodeNm ||
        parcelSummary.landCategoryLabel ||
        parcels[0]?.landCategory ||
        ssot?.jimok ||
        building?.jimok ||
        body?.jimok ||
        '대',
    ).trim();
  }

  // 3) 면적
  let effectiveAreaSqm = displayAreas.landSqm ?? brokerLandSqm ?? 0;
  if (parcelSummary.isMulti && parcelSummary.totalAreaM2 && parcelSummary.totalAreaM2 > 0) {
    effectiveAreaSqm = parcelSummary.totalAreaM2;
  }
  let areaText = '';
  if (effectiveAreaSqm > 0) {
    const pyeong = effectiveAreaSqm / 3.305785;
    const multiSuffix =
      parcelSummary.isMulti && parcelSummary.count > 1
        ? parcelSummary.totalAreaM2
          ? ` · ${parcelSummary.count}필지 합계`
          : ` (외 ${parcelSummary.count - 1}필지)`
        : '';
    areaText = `${fmtNum(effectiveAreaSqm, 1)}㎡ (${fmtNum(pyeong, 1)}평)${multiSuffix}`;
  }

  // 4) 개별공시지가(㎡당)
  const histArr = Array.isArray(enrichment?.landPriceHistory?.history)
    ? enrichment.landPriceHistory.history
    : [];
  const histLatestPrice = Number(enrichment?.landPriceHistory?.latestPricePerSqm || 0);
  const histLatestYear = Number(
    enrichment?.landPriceHistory?.latestYear ||
      (histArr.length > 0 ? histArr[histArr.length - 1]?.year : 0) ||
      0,
  );
  const lupPrice = Number(enrichment?.landUsePlan?.pblntfPclnd || 0);
  const lupYear = Number(enrichment?.landUsePlan?.stdrYear || 0);
  const lupMonth = Number(enrichment?.landUsePlan?.stdrMt || 1) || 1;
  const ssotPrice = Number(
    ssot?.official_land_price_per_sqm ||
      building?.official_land_price_per_sqm ||
      parcelSummary.weightedOfficialPricePerM2 ||
      parcels[0]?.officialPricePerM2 ||
      0,
  );

  let pricePerSqm = 0;
  let priceYear = 0;
  let priceMonth = 1;

  if (histLatestPrice > 0) {
    pricePerSqm = histLatestPrice;
    priceYear = histLatestYear || lupYear;
    priceMonth = lupMonth || 1;
  } else if (lupPrice > 0) {
    pricePerSqm = lupPrice;
    priceYear = lupYear;
    priceMonth = lupMonth || 1;
  } else if (ssotPrice > 0) {
    pricePerSqm = ssotPrice;
    priceYear = histLatestYear || lupYear;
  }

  let officialPriceText = '';
  if (pricePerSqm > 0) {
    const yy = priceYear >= 2000 ? `'${String(priceYear).slice(-2)}년 ${priceMonth}월 기준` : '';
    const multiTag =
      parcelSummary.isMulti && parcelSummary.weightedOfficialPricePerM2
        ? ' · 가중평균'
        : parcelSummary.isMulti
          ? ' · 대표필지'
          : '';
    officialPriceText = yy
      ? `${Math.round(pricePerSqm).toLocaleString('ko-KR')}원/㎡ (${yy}${multiTag})`
      : `${Math.round(pricePerSqm).toLocaleString('ko-KR')}원/㎡${multiTag}`;
  }

  const overviewRows: Array<[string, string]> = [];
  if (locationText) overviewRows.push(['소재지', locationText]);
  if (jimokText) overviewRows.push(['지목', jimokText]);
  if (areaText) overviewRows.push(['면적', areaText]);
  if (officialPriceText) overviewRows.push(['개별공시지가(㎡당)', officialPriceText]);

  // 다필지 개별 행 (2필지 이상일 때)
  const parcelRows: ParcelRowItem[] =
    parcelSummary.isMulti && parcels.length >= 2
      ? parcels.slice(0, 5).map((p: BrokerParcel, idx: number) => ({
          jibun: p.pnu || `필지 ${idx + 1}`,
          jimok: p.landCategory || '-',
          areaText:
            typeof p.areaM2 === 'number' && p.areaM2 > 0
              ? `${fmtNum(p.areaM2, 1)}㎡`
              : '-',
          priceText:
            typeof p.officialPricePerM2 === 'number' && p.officialPricePerM2 > 0
              ? `${Math.round(p.officialPricePerM2).toLocaleString('ko-KR')}원`
              : '-',
        }))
      : [];

  // 용도지역 범례
  const zoningDistrict = String(
    enrichment?.landUsePlan?.zoningDistrict ||
      ssot?.zoning ||
      ssot?.zone_type ||
      building?.zoning ||
      (landUseConfirm.nationalItems.find((i) => i.code.startsWith('UQA') && i.name !== '도시지역')?.name ?? ''),
  ).trim();
  const zoningOverlap: string[] = Array.isArray(enrichment?.landUsePlan?.zoningOverlap)
    ? enrichment.landUsePlan.zoningOverlap.filter(Boolean)
    : [];

  const zoningLegend: ZoningLegendItem[] = [];
  const seenLegend = new Set<string>();
  for (const z of [zoningDistrict, ...zoningOverlap]) {
    if (!z || z === '도시지역' || seenLegend.has(z)) continue;
    seenLegend.add(z);
    const swatch = resolveZoningSwatchColor(z);
    zoningLegend.push({
      label: z,
      fillColor: swatch.fill,
      borderColor: swatch.border,
    });
  }
  zoningLegend.push({
    label: '본건 필지 경계',
    fillColor: 'FFF3CD',
    borderColor: 'E03131',
  });

  // 조건부 용도지역 비율 콜아웃 (2개 이상 용도지역 비율이 명시된 경우에만 활성화)
  const rawShares =
    existingLandData?.zoningShares ||
    body?.zoning_shares ||
    ssot?.zoning_shares ||
    undefined;
  const zoningShares: ZoningShareItem[] | undefined =
    Array.isArray(rawShares) && rawShares.length >= 2 ? rawShares : undefined;

  const resolvedMapImg =
    cadastralImg ||
    enrichment?.cadastralMapImage ||
    existingLandData?.cadastralImage ||
    existingLandData?.zoningMapImage ||
    existingLandData?.mapImageUrl ||
    existingLandData?.photoUrl ||
    null;

  return {
    ...existingLandData,
    kicker: existingLandData?.kicker || 'LAND & ZONING',
    title: existingLandData?.title || '토지 및 용도지역',
    overviewRows,
    landUseConfirm,
    parcelRows: parcelRows.length >= 2 ? parcelRows : undefined,
    zoningLegend,
    zoningShares,
    cadastralImage: resolvedMapImg,
    zoningMapImage: resolvedMapImg,
    mapImageUrl: resolvedMapImg,
    source: '출처: 토지이음 · V-World 국토교통부',
  };
}

async function placeLandMapImage(
  s: any,
  imgSrc: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Promise<boolean> {
  const markerMeta = readMapMarkerMeta(imgSrc);
  const opt = await optimizeImageForPptx(imgSrc);
  if (!opt) return false;

  const targetRatio = w / h;
  let finalData = opt.base64;
  let cropScaleX = 1;
  let cropScaleY = 1;

  try {
    const sharpMod = (await import('sharp')).default;
    const rawBuf = opt.buffer || Buffer.from(opt.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const meta = await sharpMod(rawBuf).metadata();
    if (meta.width && meta.height) {
      const srcRatio = meta.width / meta.height;
      let extractW = meta.width;
      let extractH = meta.height;
      let left = 0;
      let top = 0;

      if (srcRatio > targetRatio * 1.02) {
        extractW = Math.round(meta.height * targetRatio);
        left = Math.round((meta.width - extractW) / 2);
        cropScaleX = meta.width / extractW;
      } else if (srcRatio < targetRatio * 0.98) {
        extractH = Math.round(meta.width / targetRatio);
        top = Math.round((meta.height - extractH) / 2);
        cropScaleY = meta.height / extractH;
      }

      if (left > 0 || top > 0) {
        const croppedBuf = await sharpMod(rawBuf)
          .extract({ left, top, width: extractW, height: extractH })
          .png()
          .toBuffer();
        finalData = `data:image/png;base64,${croppedBuf.toString('base64')}`;
      }
    }
  } catch {
    // sharp 실패 시 원본 비율 유지
  }

  s.addImage({ data: finalData, x, y, w, h });

  // Rule 66: 네이티브 본건 마커 배지
  const rawRx = markerMeta?.target ? markerMeta.target.x : 0.5;
  const rawRy = markerMeta?.target ? markerMeta.target.y : 0.5;
  const adjRx = 0.5 + (rawRx - 0.5) * cropScaleX;
  const adjRy = 0.5 + (rawRy - 0.5) * cropScaleY;
  const clampedRx = Math.max(0.12, Math.min(0.88, adjRx));
  const clampedRy = Math.max(0.15, Math.min(0.85, adjRy));

  const badgeW = 0.54;
  const badgeH = 0.24;
  const bx = x + w * clampedRx - badgeW / 2;
  const by = y + h * clampedRy - badgeH / 2;

  s.addShape('roundRect' as any, {
    x: bx,
    y: by,
    w: badgeW,
    h: badgeH,
    rectRadius: 0.05,
    fill: { color: 'C92A2A' },
    line: { color: 'FFFFFF', width: 1.2 },
  });
  s.addText('본건', {
    x: bx,
    y: by,
    w: badgeW,
    h: badgeH,
    fontFace: KR,
    fontSize: 8.5,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    valign: 'middle',
    margin: 0,
  });

  return true;
}

export async function buildA27LandUsePlan(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const s = L.light(input.pres);
  const rawD = input.data || {};
  const d =
    Array.isArray(rawD.overviewRows) && rawD.landUseConfirm
      ? rawD
      : buildBasicLandSlideData({
          existingLandData: rawD,
          enrichment: rawD.enrichment,
          ssot: rawD.ssot,
          building: rawD.building,
          body: rawD.body,
          cadastralImg: rawD.cadastralImage || rawD.zoningMapImage || rawD.mapImageUrl,
        });

  L.head(
    s,
    input.slideNum,
    d.kicker || 'LAND & ZONING',
    d.title || '토지 및 용도지역',
  );

  const leftX = M;
  const leftW = 5.80;
  const rightX = 6.68;
  const rightW = 6.03;

  // ─────────────────────────────────────────────────────────────
  // 좌측 상단: ■ 토지개요
  // ─────────────────────────────────────────────────────────────
  L.sub(s, leftX, 1.48, leftW, '■ 토지개요');

  const overviewRows: Array<[string, string]> = Array.isArray(d.overviewRows)
    ? d.overviewRows.filter((r: any) => Array.isArray(r) && r[0] && r[1] && r[1] !== '-')
    : [];

  const overviewTableY = 1.80;
  const overviewRowH = 0.32;
  if (overviewRows.length > 0) {
    const tblRows = overviewRows.map(([label, val]) => [
      {
        text: String(label),
        options: {
          fontFace: KR,
          fontSize: 9,
          bold: true,
          color: C.ink2,
          fill: { color: C.tint },
          align: 'center' as const,
          valign: 'middle' as const,
          margin: [3, 6, 3, 6] as [number, number, number, number],
        },
      },
      {
        text: String(val),
        options: {
          fontFace: KR,
          fontSize: 9,
          bold: false,
          color: C.ink,
          fill: { color: C.bg },
          align: 'left' as const,
          valign: 'middle' as const,
          margin: [3, 8, 3, 8] as [number, number, number, number],
        },
      },
    ]);

    s.addTable(tblRows, {
      x: leftX,
      y: overviewTableY,
      w: leftW,
      colW: [1.75, leftW - 1.75],
      rowH: overviewRowH,
      border: { type: 'solid', pt: 0.5, color: C.line },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 좌측 중단: ■ 토지이용계획 (토지이용계획확인원 2~3행 양식)
  // ─────────────────────────────────────────────────────────────
  const section2Y = 3.24;
  L.sub(s, leftX, section2Y, leftW, '■ 토지이용계획');

  const confirm: LandUseRegulationSummary =
    d.landUseConfirm || synthesizeLandUseConfirmFromSnapshot(d.enrichment, d.ssot, d.pnu);

  const hasMultiParcelTable = Array.isArray(d.parcelRows) && d.parcelRows.length >= 2;
  const planTableY = 3.56;
  const maxPlanBottomY = hasMultiParcelTable ? 5.18 : 6.26;
  const availPlanH = maxPlanBottomY - planTableY;

  const planEntries: Array<{ label: string; value: string; weight: number; fontSize: number }> = [];

  const nationalLawText = String(confirm?.nationalLaw || '').trim();
  if (nationalLawText) {
    planEntries.push({
      label: '「국토의 계획 및 이용에 관한 법률」에\n따른 지역·지구등',
      value: nationalLawText,
      weight: 1,
      fontSize: nationalLawText.length > 90 ? 8.5 : 9.0,
    });
  }

  const otherLawsText = String(confirm?.otherLaws || '').trim();
  if (otherLawsText) {
    const otherFs =
      otherLawsText.length > 200
        ? 8.0
        : otherLawsText.length > 130
          ? 8.5
          : 9.0;
    planEntries.push({
      label: '다른 법령 등에 따른 지역·지구등',
      value: otherLawsText,
      weight: otherLawsText.length > 100 ? 2.1 : 1.4,
      fontSize: otherFs,
    });
  }

  const article94Text = confirm?.article9_4 ? String(confirm.article9_4).trim() : '';
  if (article94Text) {
    planEntries.push({
      label: '「토지이용규제 기본법 시행령」\n제9조제4항 각 호에 해당되는 사항',
      value: article94Text,
      weight: 1.0,
      fontSize: 8.5,
    });
  }

  if (planEntries.length > 0) {
    const totalWeight = planEntries.reduce((acc, e) => acc + e.weight, 0);
    const rowHeights = planEntries.map((e) =>
      Number(Math.max(0.46, (availPlanH * e.weight) / totalWeight).toFixed(2)),
    );

    const planTblRows = planEntries.map((entry) => [
      {
        text: entry.label,
        options: {
          fontFace: KR,
          fontSize: 8.5,
          bold: true,
          color: C.ink2,
          fill: { color: C.tint },
          align: 'center' as const,
          valign: 'middle' as const,
          margin: [4, 6, 4, 6] as [number, number, number, number],
        },
      },
      {
        text: entry.value,
        options: {
          fontFace: KR,
          fontSize: entry.fontSize,
          bold: false,
          color: C.ink,
          fill: { color: C.bg },
          align: 'left' as const,
          valign: 'middle' as const,
          margin: [4, 8, 4, 8] as [number, number, number, number],
        },
      },
    ]);

    s.addTable(planTblRows, {
      x: leftX,
      y: planTableY,
      w: leftW,
      colW: [1.95, leftW - 1.95],
      rowH: rowHeights,
      border: { type: 'solid', pt: 0.5, color: C.line },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 다필지 부속 테이블 (2필지 이상인 경우에만 하단 컴팩트 표시)
  // ─────────────────────────────────────────────────────────────
  if (hasMultiParcelTable) {
    const pRows: ParcelRowItem[] = d.parcelRows.slice(0, 4);
    const mpHeader = ['소재지(지번)', '지목', '면적', '공시지가(㎡)'].map((hText) => ({
      text: hText,
      options: {
        fontFace: KR,
        fontSize: 8,
        bold: true,
        color: C.ink2,
        fill: { color: C.tint },
        align: 'center' as const,
        valign: 'middle' as const,
        margin: [2, 4, 2, 4] as [number, number, number, number],
      },
    }));
    const mpBody = pRows.map((r) => [
      {
        text: r.jibun,
        options: {
          fontFace: KR,
          fontSize: 8,
          color: C.ink,
          fill: { color: C.bg },
          align: 'left' as const,
          valign: 'middle' as const,
          margin: [2, 4, 2, 4] as [number, number, number, number],
        },
      },
      {
        text: r.jimok,
        options: {
          fontFace: KR,
          fontSize: 8,
          color: C.body,
          fill: { color: C.bg },
          align: 'center' as const,
          valign: 'middle' as const,
          margin: [2, 4, 2, 4] as [number, number, number, number],
        },
      },
      {
        text: r.areaText,
        options: {
          fontFace: NUM,
          fontSize: 8,
          color: C.ink,
          fill: { color: C.bg },
          align: 'right' as const,
          valign: 'middle' as const,
          margin: [2, 4, 2, 4] as [number, number, number, number],
        },
      },
      {
        text: r.priceText,
        options: {
          fontFace: NUM,
          fontSize: 8,
          color: C.body,
          fill: { color: C.bg },
          align: 'right' as const,
          valign: 'middle' as const,
          margin: [2, 4, 2, 4] as [number, number, number, number],
        },
      },
    ]);

    s.addTable([mpHeader, ...mpBody], {
      x: leftX,
      y: 5.26,
      w: leftW,
      colW: [2.25, 0.80, 1.35, 1.40],
      rowH: 0.21,
      border: { type: 'solid', pt: 0.5, color: C.line },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 좌측 하단: 출처 주석 (SAFE_BOTTOM = 6.75 이내)
  // ─────────────────────────────────────────────────────────────
  const sourceText = String(d.source || '출처: 토지이음 · V-World 국토교통부');
  s.addText(sourceText, {
    x: leftX,
    y: 6.40,
    w: leftW,
    h: 0.24,
    fontFace: KR,
    fontSize: 8,
    color: C.mute,
    valign: 'middle',
    margin: 0,
  });

  // ─────────────────────────────────────────────────────────────
  // 우측: 지적도·용도지역도 이미지 + 조건부 복합용도 비율 콜아웃 + 하단 범례
  // ─────────────────────────────────────────────────────────────
  const mapY = 1.48;
  const mapH = 4.46;

  s.addShape(input.pres.ShapeType.rect, {
    x: rightX,
    y: mapY,
    w: rightW,
    h: mapH,
    fill: { color: C.tint },
    line: { color: C.line, width: 0.75 },
  });

  const imgSrc = d.zoningMapImage || d.cadastralImage || d.mapImageUrl || d.photoUrl;
  let imgPlaced = false;
  if (imgSrc) {
    imgPlaced = await placeLandMapImage(s, imgSrc, rightX, mapY, rightW, mapH);
  }
  if (!imgPlaced) {
    s.addText('지적도 · 용도지역도\n(국토교통부 V-World 공간정보)', {
      x: rightX,
      y: mapY,
      w: rightW,
      h: mapH,
      fontFace: KR,
      fontSize: 10,
      color: C.mute,
      align: 'center',
      valign: 'middle',
      margin: 0,
    });
  }

  // 조건부: 2개 이상 용도지역에 걸친 필지일 때만 비율 콜아웃 표시
  if (Array.isArray(d.zoningShares) && d.zoningShares.length >= 2) {
    const shareLines = d.zoningShares.slice(0, 3).map((z: ZoningShareItem) => {
      const tot = z.totalAreaSqm && z.totalAreaSqm > 0 ? `총 대지면적 ${fmtNum(z.totalAreaSqm, 1)}㎡ 중 ` : '';
      return `• ${z.zone}: ${tot}${fmtNum(z.sharePct, 1)}% 구성`;
    });
    const boxX = rightX + 0.16;
    const boxY = mapY + 0.14;
    const boxW = 3.95;
    const boxH = 0.24 + shareLines.length * 0.20;

    s.addShape(input.pres.ShapeType.rect, {
      x: boxX,
      y: boxY,
      w: boxW,
      h: boxH,
      fill: { color: 'FFFFFF' },
      line: { color: C.brass, width: 1.0 },
    });
    s.addText(shareLines.join('\n'), {
      x: boxX + 0.10,
      y: boxY + 0.04,
      w: boxW - 0.20,
      h: boxH - 0.08,
      fontFace: KR,
      fontSize: 8.5,
      bold: true,
      color: C.ink,
      valign: 'middle',
      margin: 0,
    });
  }

  // 하단 용도지역 범례 스와치
  const legendItems: ZoningLegendItem[] = Array.isArray(d.zoningLegend) ? d.zoningLegend : [];
  if (legendItems.length > 0) {
    const legendY = 6.02;
    const legendH = 0.34;
    s.addShape(input.pres.ShapeType.rect, {
      x: rightX,
      y: legendY,
      w: rightW,
      h: legendH,
      fill: { color: C.tint },
      line: { color: C.line, width: 0.5 },
    });

    let curX = rightX + 0.16;
    for (const item of legendItems.slice(0, 4)) {
      const swatchW = 0.22;
      const swatchH = 0.14;
      const swatchY = legendY + (legendH - swatchH) / 2;
      s.addShape(input.pres.ShapeType.rect, {
        x: curX,
        y: swatchY,
        w: swatchW,
        h: swatchH,
        fill: { color: item.fillColor },
        line: { color: item.borderColor || C.line, width: 0.75 },
      });
      const labelW = Math.max(1.15, item.label.length * 0.14 + 0.25);
      s.addText(item.label, {
        x: curX + swatchW + 0.06,
        y: legendY,
        w: labelW,
        h: legendH,
        fontFace: KR,
        fontSize: 8.5,
        bold: true,
        color: C.ink2,
        valign: 'middle',
        margin: 0,
      });
      curX += swatchW + labelW + 0.18;
    }
  }

  L.foot(s, input.slideNum, input.docno);
  return { slide: s, warnings: [] };
}
