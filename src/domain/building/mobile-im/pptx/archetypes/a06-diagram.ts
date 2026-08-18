import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind, RowEntry } from '../imlib';
import { generateStaticMapPlaceholder, fetchKakaoMapImage, type OptimizedImage } from '../utils/image-optimizer';
import { enforceTextBudget } from '../text-budget';
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

  let mapImg: OptimizedImage | null = null;

  // 1차: 이미 생성된 카카오 지도 URL 사용
  if (mapImageUrl) {
    mapImg = await fetchKakaoMapImage(mapImageUrl, 1120, 900);
  }

  // 2차: 좌표 기반 카카오/OSM 합성 지도 (fetchKakaoMapImage 실패 시)
  if (!mapImg) {
    mapImg = await generateStaticMapPlaceholder(areaOrAddress, 1120, 900, coords);
  }

  if (mapImg) {
    slide.addImage({ data: mapImg.base64, x: M, y: 1.62, w: mapW, h: 4.50 });
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
    // Truncate each row's value to prevent overflow
    const safeRows = rightRows.map(([label, value, ...rest]: any[]) => 
      [stripMarkdown(String(label || '')), enforceTextBudget(stripMarkdown(String(value || '')), 70), ...rest]
    ) as RowEntry[];
    y = L.rows(slide, textX, y, textW, safeRows, { rh: 0.48, fs: 14 });
    y += 0.2;
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
    const body = enforceTextBudget(c.body ?? '', 100);
    const calloutH = Math.min(1.4, Math.max(0.8, 0.4 + Math.ceil(body.length / 30) * 0.22));
    // Only render callout if it fits within slide bounds
    if (y + calloutH <= 6.3) {
      L.callout(slide, textX, y, textW, calloutH, c.kind ?? 'info', c.title ?? '', body);
      y += calloutH + 0.1;
    }
  }

  if (left.source) {
    L.note(slide, textX, Math.min(y + 0.1, 6.2), textW, left.source);
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
