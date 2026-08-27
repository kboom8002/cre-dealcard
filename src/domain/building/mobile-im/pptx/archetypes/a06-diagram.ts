import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry } from '../imlib';
import { generateStaticMapPlaceholder, fetchKakaoMapImage, type OptimizedImage, type MapPoiSpot } from '../utils/image-optimizer';
// enforceTextBudget는 data-binder에서 이미 적용되므로 여기서는 사용하지 않음
import { stripMarkdown } from '../data-binder';

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

export async function buildA06Diagram(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  L.head(slide, input.slideNum, input.data.kicker || 'SECTION', input.data.title || '제목');

  const mapW = 5.60;
  const gap = 0.40;
  const textX = M + mapW + gap;
  const textW = CW - mapW - gap;

  // ── 좌측: 지도 ──
  const coords = input.data?.coordinates ?? null;
  const mapImageUrl = input.data?.mapImageUrl ?? null;
  const areaOrAddress = (input.data?.left as any)?.source || input.data?.areaSignal || '서울';
  const poiSpots: MapPoiSpot[] = input.data?.poiSpots ?? [];

  // 0차: 지적도 이미지가 직접 전달된 경우 (V-World WMS)
  if (input.data?.cadastralImage) {
    slide.addImage({ data: input.data.cadastralImage, x: M, y: 1.62, w: mapW, h: 4.50 });
  } else {
    let mapImg: OptimizedImage | null = null;

    // 1차: 이미 생성된 카카오 지도 URL 사용
    if (mapImageUrl) {
      mapImg = await fetchKakaoMapImage(mapImageUrl, 1120, 900);
    }

    // 2차: 좌표 기반 카카오/OSM 합성 지도 (fetchKakaoMapImage 실패 시)
    if (!mapImg) {
      mapImg = await generateStaticMapPlaceholder(areaOrAddress, 1120, 900, coords, poiSpots);
    }

    if (mapImg) {
      slide.addImage({ data: mapImg.base64, x: M, y: 1.62, w: mapW, h: 4.50 });
    } else {
      // D32 BL-2: 지도 데이터 결손 경고
      warnings.push(`[BL-2] 지도 렌더 실패: 좌표=${coords ? '있음' : '없음'}, URL=${mapImageUrl ? '있음' : '없음'}, 지명='${areaOrAddress}'`);
    }
  }

  // D32 BL-2: 지도 4조건 검증 (좌표·URL·지명·POI)
  if (!coords && !mapImageUrl) {
    warnings.push('[BL-2] 지도 좌표와 이미지 URL 모두 없음 — 플레이스홀더 지도 사용');
  }
  if (!areaOrAddress || areaOrAddress === '서울') {
    warnings.push('[BL-2] 지도 지명/주소가 기본값(서울)임 — 정확한 주소 미입력');
  }

  // ── 우측: 텍스트 데이터 ──
  let y = 1.62;
  const left = input.data.left || {};
  const right = input.data.right || {};

  const subText = left.sub || right.sub;
  if (subText) {
    L.sub(slide, textX, y, textW, subText);
    y += 0.35;
  }

  const rightRows = right.rows ?? [];
  if (rightRows.length > 0) {
    const safeRows = rightRows.map(([label, value, ...rest]: any[]) => 
      [stripMarkdown(String(label || '')), stripMarkdown(String(value || '')), ...rest]
    ) as RowEntry[];
    y = L.rows(slide, textX, y, textW, safeRows, { rh: 0.54, fs: 13 });
    y += 0.15;
  }

  if (rightRows.length === 0) {
    // Fallback: default location attributes
    const defaultRows: RowEntry[] = [
      ['주소', '확인 필요'],
      ['교통', '확인 필요'],
      ['주변 인프라', '확인 필요'],
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
    // 슬라이드 하단(6.3인치) 내에서만 렌더링
    const maxAvailable = 6.3 - y;
    if (maxAvailable >= 0.7) {
      const finalH = Math.min(calloutH, maxAvailable);
      L.callout(slide, textX, y, textW, finalH, c.kind ?? 'info', c.title ?? '', body);
      y += finalH + 0.1;
    }
  }

  if (left.source) {
    L.note(slide, textX, Math.min(y + 0.1, 6.2), textW, left.source);
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
