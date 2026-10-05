import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry } from '../imlib';
import { stripMarkdown } from '../data-binder';
import { fetchKakaoMapImage, generateStaticMapPlaceholder, optimizeImageForPptx, type OptimizedImage, type MapPoiSpot, type LocationMapOverlayMeta } from '../utils/image-optimizer';
import { poiMarkerFill } from '../utils/location-map-overlay';
import { readMapMarkerMeta, centerCropToAspect, normToSlot } from '@/lib/external/map-overlay-meta';
import sharp from 'sharp';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('a06-diagram');


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
  suppress?: boolean;
}

/** 좌측 지도 슬롯 (인치) */
const MAP_Y = 1.62;
const MAP_H = 4.50;

/** 범례 행에서 제거할 keySpots 파생 랜드마크 라벨 (지도 번호 범례로 대체 — Rule 4 중복 방지) */
const POI_DERIVED_ROW_LABELS = new Set(['의료시설', '교육시설', '상업시설', '주요시설', '공공기관']);

/**
 * [Rule 66] 지도 위 '본건' 네이티브 라벨 (PptxGenJS 텍스트 — 서버리스 CJK 두부 원천 차단).
 * markerTopY(마커 상단) 바로 위에 말풍선형 라벨을 배치하고, 슬롯 밖으로 나가지 않도록 클램프한다.
 */
function addTargetLabel(
  slide: ReturnType<PptxGenJS['addSlide']>,
  cx: number,
  markerTopY: number,
  markerBottomY: number,
  slot: { x: number; y: number; w: number; h: number },
  color: string,
): void {
  const w = 0.52;
  const h = 0.24;
  const tip = 0.07;
  let above = true;
  let y = markerTopY - tip - h;
  if (y < slot.y + 0.04) {
    above = false;
    y = markerBottomY + tip;
  }
  const x = Math.max(slot.x + 0.04, Math.min(slot.x + slot.w - w - 0.04, cx - w / 2));
  const tipX = Math.max(x + 0.06, Math.min(x + w - 0.18, cx - 0.06));
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color },
    line: { color: 'FFFFFF', width: 1 },
    rectRadius: 0.05,
  });
  slide.addShape('triangle', {
    x: tipX, y: above ? y + h - 0.01 : y - tip + 0.01, w: 0.12, h: tip,
    fill: { color },
    line: { color, width: 0 },
    rotate: above ? 180 : 0,
  });
  slide.addText('본건', {
    x, y, w, h,
    fontSize: 9.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: KR, margin: 0,
  });
}

/**
 * 지적도 이미지 배치: 슬롯 종횡비로 중앙 크롭(늘이기 왜곡 제거) 후 삽입하고,
 * PNG tEXt에 기록된 본건 마커 위치에 네이티브 '본건' 라벨을 얹는다.
 */
async function placeCadastralImage(
  slide: ReturnType<PptxGenJS['addSlide']>,
  image: string,
  slot: { x: number; y: number; w: number; h: number },
): Promise<void> {
  const meta = readMapMarkerMeta(image);
  let data: string | null = null;
  let crop: { left: number; top: number; width: number; height: number } | null = null;
  let imgW = meta?.imgW ?? 0;
  let imgH = meta?.imgH ?? 0;
  try {
    const b64 = image.includes(',') ? image.slice(image.indexOf(',') + 1) : image;
    const buf = Buffer.from(b64, 'base64');
    const md = await sharp(buf).metadata();
    if (md.width && md.height) {
      imgW = md.width;
      imgH = md.height;
      crop = centerCropToAspect(imgW, imgH, slot.w / slot.h);
      const out = await sharp(buf)
        .extract(crop)
        .resize({ width: Math.min(1200, crop.width), withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      data = `image/jpeg;base64,${out.toString('base64')}`;
    }
  } catch (err) {
    log.warn('[a06-diagram] cadastral crop failed — 원본 비율로 배치:', err);
    crop = null;
  }
  if (!data) {
    const optimizedCadastral = await optimizeImageForPptx(image, 1200, 80);
    data = optimizedCadastral?.base64 || image;
  }
  slide.addImage({ data, ...slot });

  if (meta?.target && imgW > 0 && imgH > 0) {
    const pt = normToSlot(meta.target, { w: imgW, h: imgH }, slot, crop);
    if (pt) {
      // 마커 반경 11px(+테두리) → 인치 환산
      const pxToIn = slot.w / (crop?.width ?? imgW);
      const r = 14 * pxToIn;
      addTargetLabel(slide, pt.x, pt.y - r, pt.y + r, slot, 'DC2626');
    }
  }
}

/** 입지 지도 하단 번호 범례 (지도 마커 번호 = 범례 번호, 한글 명칭은 네이티브 텍스트) */
function addPoiLegend(
  slide: ReturnType<PptxGenJS['addSlide']>,
  meta: LocationMapOverlayMeta,
  x: number,
  y: number,
  w: number,
): void {
  type Cell = { kind: 'poi'; n: number; fill: string; text: string } | { kind: 'walk'; text: string };
  const cells: Cell[] = meta.pois.map(p => ({
    kind: 'poi' as const,
    n: p.index,
    fill: poiMarkerFill(p.poi.kind).replace('#', ''),
    text: p.poi.label,
  }));
  if (meta.walkCircle) {
    cells.push({ kind: 'walk', text: `도보 ${meta.walkCircle.minutes}분 반경 (약 ${meta.walkCircle.radiusM}m)` });
  }
  if (cells.length === 0) return;
  const cols = 2;
  const colW = w / cols;
  const rowH = 0.22;
  cells.slice(0, 6).forEach((cell, i) => {
    const cx = x + (i % cols) * colW;
    const cy = y + Math.floor(i / cols) * rowH;
    if (cell.kind === 'poi') {
      slide.addShape('ellipse', {
        x: cx, y: cy + 0.025, w: 0.17, h: 0.17,
        fill: { color: cell.fill },
        line: { color: 'FFFFFF', width: 0.75 },
      });
      slide.addText(String(cell.n), {
        x: cx, y: cy + 0.025, w: 0.17, h: 0.17,
        fontSize: 7.5, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: KR, margin: 0,
      });
    } else {
      slide.addText('╌', {
        x: cx, y: cy, w: 0.17, h: rowH,
        fontSize: 10, bold: true, color: 'B8860B', align: 'center', valign: 'middle', fontFace: KR, margin: 0,
      });
    }
    slide.addText(cell.text, {
      x: cx + 0.22, y: cy, w: colW - 0.26, h: rowH,
      fontSize: 8.5, color: '1E293B', valign: 'middle', fontFace: KR, margin: 0, fit: 'shrink',
    });
  });
}

export async function buildA06Diagram(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');

  const mapW = 5.60;
  const gap = 0.40;
  const textX = M + mapW + gap;
  const textW = CW - mapW - gap;

  // ── 좌측: 지도 ──
  let poiLegendRendered = false;
  const coords = input.data?.coordinates ?? null;
  const mapImageUrl = input.data?.mapImageUrl ?? null;
  const areaOrAddress = input.data?.left?.source || input.data?.areaSignal || '서울';
  const poiSpots: MapPoiSpot[] = input.data?.poiSpots ?? [];

  // 0-1차: 광역 대중교통망 벡터 다이어그램 (최우선 벡터 맵)
  const macroTransitRaw = input.data?.macroTransitImage;
  const macroTransitImg = typeof macroTransitRaw === 'object' && macroTransitRaw !== null
    ? (macroTransitRaw.base64 ?? macroTransitRaw.data ?? (Buffer.isBuffer(macroTransitRaw) ? `image/png;base64,${macroTransitRaw.toString('base64')}` : null))
    : (typeof macroTransitRaw === 'string' ? macroTransitRaw : null);

  if (macroTransitImg) {
    const optimizedMacro = await optimizeImageForPptx(macroTransitImg, 1200, 80);
    slide.addImage({ data: optimizedMacro?.base64 || macroTransitImg, x: M, y: 1.62, w: mapW, h: 4.50 });
  } else if (input.data?.cadastralImage) {
    // 0-2차: 지적도 이미지가 직접 전달된 경우 (V-World WMS)
    // 슬롯 종횡비 중앙 크롭 + 네이티브 '본건' 라벨 (이미지 내 영문 TARGET 라벨 제거 — Rule 66)
    await placeCadastralImage(slide, String(input.data.cadastralImage), { x: M, y: MAP_Y, w: mapW, h: MAP_H });
  } else if (input.data.title?.includes('토지') || input.data.kicker?.includes('토지') || input.data.title?.includes('지적도')) {
    // 지적도 슬라이드인데 V-World 이미지가 없는 경우 Fallback
    L.fallbackCard(slide, M, 1.62, mapW, 4.50, {
      badge: '공적장부 열람 대상',
      badgeKind: 'brass',
      title: '지적 및 토지이용계획 열람 안내',
      leadText: '본 자산의 지적경계 및 용도지역 지정 현황은 토지이음 및 부동산종합공부시스템 원장을 기반으로 대조·확인합니다.',
      checklist: [
        '토지이용계획확인원 상 용도지역·지구 행위제한 정합성 실사',
        '지적공부(토지대장·지적도)상 지목, 면적 및 필지 경계 실측 대조',
        '건축선 후퇴, 도로접면 조건(진입로 폭원) 및 일조사선 규제 점검',
        '지구단위계획구역 여부 및 지자체 도시계획조례 추가 완화 가능성 검토',
      ],
      icon: 'map',
    });
    warnings.push('[BL-2] 지적도 API 연동 실패로 대체 실사 카드 삽입됨');
  } else {
    let mapImg: { base64: string; overlayMeta?: LocationMapOverlayMeta } | null = null;

    // 1차: 카카오 Static Map + POI 오버레이 (최우선 — 도보 반경/랜드마크 표시)
    // 포스처/자산유형 맞춤 POI 3~5건 정밀 선별 (location-poi-selector, 실조회 후보만 사용)
    if (coords) {
      try {
        mapImg = await generateStaticMapPlaceholder(
          areaOrAddress, 1120, 900, coords, poiSpots,
          {
            posture: input.data?.posture ?? null,
            assetType: input.data?.assetType ?? null,
            candidates: Array.isArray(input.data?.poiCandidates) ? input.data.poiCandidates : null,
          },
        );
      } catch (err) {
        log.warn('[a06-diagram] generateStaticMapPlaceholder failed:', err);
      }
    }

    // 1.5차: POI 오버레이 실패 시 카카오 지도 URL 폴백
    if (!mapImg && mapImageUrl) {
      mapImg = await fetchKakaoMapImage(mapImageUrl, 1120, 900);
    }

    // 2차: 고해상도(1600x1200, 266 DPI) 인메모리 Macro Transit Engine 벡터 다이어그램 자동 합성
    const targetAddress = input.data?.address || input.data?.resolved_address || areaOrAddress;
    const hasLocationSignal = Boolean(coords || (targetAddress && targetAddress !== '서울'));
    if (!mapImg && hasLocationSignal) {
      try {
        const { generateMacroTransitDiagram } = await import('@/services/macro-transit-engine');
        const transitResult = await generateMacroTransitDiagram({
          address: targetAddress,
          propertyName: input.data?.title || input.data?.left?.sub || '대상 자산',
          coordinates: coords,
        });
        if (transitResult?.base64) {
          const opt = await optimizeImageForPptx(transitResult.base64, 1200, 80);
          mapImg = opt || { base64: transitResult.base64 };
        }
      } catch (err) {
        log.warn('[a06-diagram] Auto-generation of macro transit diagram failed:', err);
      }
    }

    if (mapImg) {
      slide.addImage({ data: mapImg.base64, x: M, y: 1.62, w: mapW, h: 4.50 });

      // [Rule 66 준수] 입지 지도 한글 오버레이 및 범례 (PptxGenJS 네이티브 셰이프로 서버리스 CJK 폰트 두부 원천 방지)
      const isLocationSlide = Boolean(
        input.data.title?.includes('입지') ||
        input.data.kicker?.includes('입지') ||
        input.data.kicker?.includes('Location') ||
        input.data.kicker?.includes('SECTION')
      );
      const overlayMeta = mapImg.overlayMeta;
      if (isLocationSlide && overlayMeta) {
        // [Rule 66] 핀 위 네이티브 '본건' 라벨 (이미지 내 TARGET 텍스트 제거, 단일 표시)
        const slot = { x: M, y: MAP_Y, w: mapW, h: MAP_H };
        const tx = M + overlayMeta.target.x * mapW;
        const ty = MAP_Y + overlayMeta.target.y * MAP_H;
        const topY = MAP_Y + overlayMeta.targetTopY * MAP_H;
        addTargetLabel(slide, tx, topY, ty + 0.05, slot, '132A3A');
        // 지도 하단(지도 바깥) 번호 범례: 마커 번호 = 범례 번호, 명칭 + 도보 시간
        addPoiLegend(slide, overlayMeta, M, MAP_Y + MAP_H + 0.06, mapW);
        poiLegendRendered = overlayMeta.pois.length > 0;
      } else if (isLocationSlide) {
        // 1. 좌측 하단 반투명 범례 카드 (도보 권역 및 대상지 안내)
        slide.addShape('roundRect', {
          x: M + 0.15, y: 1.62 + 4.50 - 0.45, w: 3.50, h: 0.35,
          fill: { color: 'FFFFFF', transparency: 10 },
          line: { color: 'CBD5E1', width: 0.8 },
          rectRadius: 0.04
        });
        slide.addText([
          { text: '★ ', options: { color: 'B8860B', fontSize: 9, bold: true } },
          { text: '대상 자산(본건)   ', options: { color: '1E293B', fontSize: 8.5, bold: true } },
          { text: '╌ ', options: { color: 'B8860B', fontSize: 10, bold: true } },
          { text: '도보 5분 반경 (약 400m)', options: { color: '475569', fontSize: 8.5 } }
        ], {
          x: M + 0.20, y: 1.62 + 4.50 - 0.43, w: 3.40, h: 0.30,
          fontFace: KR, valign: 'middle'
        });

        // 2. 지도 중심부 핀 라벨 한글 뱃지 ('★ 본건')
        const pinBadgeW = 0.90;
        const pinBadgeH = 0.24;
        const pinBadgeX = M + (mapW - pinBadgeW) / 2;
        const pinBadgeY = 1.62 + (4.50 / 2) + 0.22;
        slide.addShape('roundRect', {
          x: pinBadgeX, y: pinBadgeY, w: pinBadgeW, h: pinBadgeH,
          fill: { color: '132A3A' },
          line: { color: 'FFFFFF', width: 1 },
          rectRadius: 0.04
        });
        slide.addText('★ 본건', {
          x: pinBadgeX, y: pinBadgeY, w: pinBadgeW, h: pinBadgeH,
          fontSize: 9, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: KR
        });
      }
    } else {
      // 지도 데이터 미제공 시 Macro Location Overview Fallback Card 렌더링 (슬라이드 드롭 방지)
      L.fallbackCard(slide, M, 1.62, mapW, 4.50, {
        badge: '권역 입지 분석',
        badgeKind: 'info',
        title: '교통망 및 입지 인프라 실사 안내',
        leadText: '대상 자산의 대중교통 접근성 및 반경 1km 내 비즈니스·상업 인프라 집적도를 현장 조사 기준으로 검증합니다.',
        checklist: [
          '주요 간선도로 및 광역 대중교통(지하철·버스) 환승 노선 접근성 실사',
          '도보 5분~10분 반경 유동인구 집객 동선 및 배후 수요층 집중도 평가',
          '주변 주요 앵커 오피스 및 핵심 상업시설 인지도·집객 영향력 분석',
          '향후 인근 도시교통계획망 신설 및 도로 확장 개발 호재 영향 점검',
        ],
        icon: 'map',
      });
      warnings.push('[BL-E] 지도 미확보 — 입지 실사 대체 카드 삽입');
    }
  }

  // D33 BL-E: 지도 4조건 경고 (suppress하지 않은 경우에만 도달)
  if (!coords && !mapImageUrl && !input.data?.cadastralImage && !macroTransitImg) {
    warnings.push('[BL-2] 지도 좌표와 이미지 URL 모두 없음');
  }

  // ── 우측: 텍스트 데이터 ──
  let y = 1.62;
  const left = input.data.left || {};
  const right = input.data.right || {};

  const subText = left.sub || right.sub;
  if (subText) {
    L.sub(slide, textX, y, textW, stripMarkdown(subText));
    y += 0.35;
  }

  let rightRows = (right.rows ?? [])
    // 지도 번호 범례에 랜드마크가 표시되면 keySpots 파생 랜드마크 행은 제거 (Rule 4 비중복)
    .filter((r: any) => !(poiLegendRendered && Array.isArray(r) && POI_DERIVED_ROW_LABELS.has(String(r[0] ?? ''))))
    .slice(0, 7);
  if (rightRows.length === 0 && input.data.content) {
    // 마크다운 콘텐츠에서 키-값 불릿을 동적 추출 (Rule 26: 특정 지역명 하드코딩 금지)
    const contentText = String(input.data.content);
    const autoRows: RowEntry[] = [];
    // 패턴 1: "키워드: 설명" 형태 불릿
    const kvMatches = contentText.match(/(?:^|\n)\s*[-•*]\s*(.+?)[:：]\s*(.+)/g);
    if (kvMatches) {
      for (const m of kvMatches.slice(0, 7)) {
        const parts = m.replace(/^\s*[-•*]\s*/, '').split(/[:：]\s*/);
        if (parts.length >= 2 && parts[0].length <= 20 && parts[1].length >= 5) {
          autoRows.push([parts[0].trim(), parts[1].trim().substring(0, 60)]);
        }
      }
    }
    // 패턴 2: 키-값이 없으면 짧은 문장에서 추출
    if (autoRows.length < 2) {
      const sentences = contentText.split(/[.。\n]/).filter(s => s.trim().length >= 10 && s.trim().length <= 60);
      for (const s of sentences.slice(0, 3)) {
        const clean = s.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();
        if (clean.length >= 10) autoRows.push(['입지 특성', clean]);
      }
    }
    if (autoRows.length >= 2) {
      rightRows = autoRows;
    }
  }

  if (rightRows.length > 0) {
    // 마크다운 헤더/링크 태그 제거 강화
    function cleanMarkdownDeep(text: string): string {
      return text
        .replace(/^#{1,6}\s*/gm, '')        // ### 헤더 제거
        .replace(/\[([^\]]*)\]/g, '$1')      // [건물] → 건물  
        .replace(/\*\*([^*]*)\*\*/g, '$1')    // **bold** → bold
        .replace(/\*([^*]*)\*/g, '$1')        // *italic* → italic
        .replace(/`([^`]*)`/g, '$1')          // `code` → code
        .trim();
    }

    const safeRows = rightRows.map(([label, value, ...rest]: any[]) => {
      const origLabel = String(label || '');
      const origValue = String(value || '');
      let l = cleanMarkdownDeep(stripMarkdown(origLabel));
      let v = cleanMarkdownDeep(stripMarkdown(origValue));
      
      if (origValue.length > v.length && !/[.다요음함]$/.test(v)) {
        v += '...';
      }
      return [l, v, ...rest];
    }) as RowEntry[];

    const numRows = safeRows.length;
    const hasCallout = Boolean(right.callout);
    let rowH = 0.50;
    let fs = 12.5;
    if (numRows >= 6 || (numRows >= 5 && hasCallout)) {
      rowH = 0.38;
      fs = 11.5;
    } else if (numRows >= 4 && hasCallout) {
      rowH = 0.44;
      fs = 12.0;
    }

    y = L.rows(slide, textX, y, textW, safeRows, { rh: rowH, fs });
    y += 0.12;
  }

  if (rightRows.length === 0) {
    // Fallback: default location attributes (Rule 37: 회피성 문구 차단)
    const areaOrAddress = input.data.address || input.data.area || input.data.location || '도심 핵심 권역';
    const defaultRows: RowEntry[] = [
      ['소재 권역', areaOrAddress],
      ['대중교통', '지하철 및 간선버스 노선 인접'],
      ['주변 인프라', '업무 및 상업 편의시설 밀집'],
    ];
    y = L.rows(slide, textX, y, textW, defaultRows, { rh: 0.38, fs: 11 });
    y += 0.2;
    warnings.push('입지 데이터 없음 — 기본 프레임 표시');
  }

  if (right.callout && y < 5.8) {
    const c = right.callout;
    // data-binder에서 이미 enforceTextBudget 적용됨 — 이중 잘림 방지
    const body = c.body ?? '';
    // CJK 기준 줄당 글자 수 계산 (callout 내부 패딩 0.36인치 제거)
    const effectiveW = textW - 0.36;
    const cjkCharsPerLine = Math.max(10, Math.floor(effectiveW / 0.19));
    const bodyLines = Math.max(1, Math.ceil(body.length / cjkCharsPerLine));
    // 높이 = 타이틀(0.36) + 줄수 × 줄높이(0.24) + 하단패딩(0.12)
    const calloutH = Math.min(2.0, Math.max(0.7, 0.36 + bodyLines * 0.24 + 0.12));
    // left.source가 있으면 note 공간(0.35") 확보
    const maxAvailable = (left.source ? 6.10 : 6.35) - y;
    if (maxAvailable >= 0.7) {
      const finalH = Math.min(calloutH, maxAvailable);
      L.callout(slide, textX, y, textW, finalH, c.kind ?? 'info', c.title ?? '', body);
      y += finalH + 0.1;
    }
  }

  if (left.source && y <= 6.50) {
    const noteY = Math.max(y + 0.05, 6.25);
    if (noteY <= 6.75) {
      L.note(slide, textX, noteY, textW, left.source);
    }
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
