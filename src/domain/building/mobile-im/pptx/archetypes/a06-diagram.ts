import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry } from '../imlib';
import { stripMarkdown } from '../data-binder';
import { fetchKakaoMapImage, generateStaticMapPlaceholder, optimizeImageForPptx, type OptimizedImage, type MapPoiSpot } from '../utils/image-optimizer';

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
    const optimizedCadastral = await optimizeImageForPptx(input.data.cadastralImage, 1200, 80);
    slide.addImage({ data: optimizedCadastral?.base64 || input.data.cadastralImage, x: M, y: 1.62, w: mapW, h: 4.50 });
  } else {
    let mapImg: OptimizedImage | null = null;

    // 1차: 이미 생성된 카카오 지도 URL 사용
    if (mapImageUrl) {
      mapImg = await fetchKakaoMapImage(mapImageUrl, 1120, 900);
    }

    // 1.5차: 카카오 Static Map API 직접 호출 (API 키 사용, Referer 불필요)
    if (!mapImg && coords) {
      try {
        mapImg = await generateStaticMapPlaceholder(
          areaOrAddress, 1120, 900, coords, poiSpots
        );
      } catch (err) {
        log.warn('[a06-diagram] generateStaticMapPlaceholder failed:', err);
      }
    }

    // 2차: 고해상도(1600x1200, 266 DPI) 인메모리 Macro Transit Engine 벡터 다이어그램 자동 합성
    const targetAddress = input.data?.address || input.data?.resolved_address || areaOrAddress;
    const hasLocationSignal = Boolean(coords || (targetAddress && targetAddress !== '서울'));
    if (!mapImg && hasLocationSignal) {
      try {
        const { generateMacroTransitDiagram } = await import('@/services/macro-transit-engine');
        const transitResult = await generateMacroTransitDiagram({
          address: targetAddress,
          propertyName: input.data?.title || (input.data?.left as any)?.sub || '대상 자산',
          coordinates: coords,
        });
        if (transitResult?.base64) {
          const opt = await optimizeImageForPptx(transitResult.base64, 1200, 80);
          mapImg = opt || ({ base64: transitResult.base64 } as any);
        }
      } catch (err) {
        log.warn('[a06-diagram] Auto-generation of macro transit diagram failed:', err);
      }
    }

    if (mapImg) {
      slide.addImage({ data: mapImg.base64, x: M, y: 1.62, w: mapW, h: 4.50 });
    } else {
      // D33 BL-E: 지도 없으면 면 생략, 체크리스트 이관 (유령 백지 슬라이드 방지를 위해 pres에서 슬라이드 제거)
      warnings.push('[BL-E] 지도 데이터 미확보 — 슬라이드 생략, 체크리스트 이관');
      const presAny = input.pres as any;
      if (Array.isArray(presAny.slides) && presAny.slides.length > 0) {
        const lastIdx = presAny.slides.length - 1;
        if (presAny.slides[lastIdx] === slide) {
          presAny.slides.pop();
        }
      }
      L.foot(slide, input.slideNum, input.docno);
      return { slide, warnings, suppress: true } as any;
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

  let rightRows = (right.rows ?? []).slice(0, 5);
  if (rightRows.length === 0 && input.data.content) {
    // 마크다운 콘텐츠에서 키-값 불릿을 동적 추출 (Rule 26: 특정 지역명 하드코딩 금지)
    const contentText = String(input.data.content);
    const autoRows: RowEntry[] = [];
    // 패턴 1: "키워드: 설명" 형태 불릿
    const kvMatches = contentText.match(/(?:^|\n)\s*[-•*]\s*(.+?)[:：]\s*(.+)/g);
    if (kvMatches) {
      for (const m of kvMatches.slice(0, 5)) {
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
