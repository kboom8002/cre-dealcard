import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { optimizeImagesForPptx, type OptimizedImage } from '../utils/image-optimizer';
import type { PhotoMeta } from '../../types';
import type { GalleryLayoutType } from '../gallery-planner';
import { PHOTO_CATEGORY_LABELS } from '../../photo-url-transformer';

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

/**
 * A14 — 건물 사진 갤러리 (v0.6.0 고도화)
 * 1~4장의 사진을 최적 레이아웃(FULL_WIDE, DUAL, 1+2, GRID_2X2)으로 정밀 렌더링
 */
export async function buildA14Gallery(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const slide = L.light(input.pres);
  const warnings: string[] = [];
  const kicker = input.data.kicker || 'GALLERY';
  const title = input.data.title || '건물 주요 사진';
  L.head(slide, input.slideNum, kicker, title);

  const rawPhotos: PhotoMeta[] = input.data.photos || [];
  const photoUrls: string[] = input.data.photoUrls || [];

  // URLs & 메타 추출
  let targetPhotos: Array<{ url: string; caption?: string; label?: string; category?: string }> = [];

  if (rawPhotos.length > 0) {
    targetPhotos = rawPhotos.map(p => ({
      url: typeof p === 'string' ? p : p.url,
      caption: (p as any).caption || '',
      label: (p as any).category ? PHOTO_CATEGORY_LABELS[(p as any).category as keyof typeof PHOTO_CATEGORY_LABELS] : undefined,
      category: (p as any).category,
    }));
  } else if (photoUrls.length > 0) {
    targetPhotos = photoUrls.map(url => ({ url }));
  }

  const validPhotos = targetPhotos.filter(p => !!p.url);

  if (validPhotos.length === 0) {
    L.callout(slide, M, 2.20, CW, 1.4, 'info', '건물 사진',
      '건물 실사 사진이 등록되면 이 슬라이드에 최적 레이아웃으로 표시됩니다.');
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    return { slide, warnings };
  }

  // Optimize images (최대 4장 — 슬라이드당 4장 제한)
  const urlsToOptimize = validPhotos.slice(0, 4).map(p => p.url);
  const optimized = await optimizeImagesForPptx(urlsToOptimize, 4);

  if (optimized.length === 0) {
    L.callout(slide, M, 2.20, CW, 1.4, 'info', '사진 로딩 실패',
      '건물 사진을 로딩하지 못했습니다. 원본 이미지 상태 또는 네트워크를 확인해주세요.');
    warnings.push('갤러리 사진 로딩 실패');
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    return { slide, warnings };
  }

  const count = optimized.length;
  const startY = 1.35;
  const maxAvailableH = 5.15; // y: 1.35 ~ 6.50 (안전 여백 확보)
  const gap = 0.14;

  const layout: GalleryLayoutType = input.data.layout || (
    count === 1 ? 'FULL_WIDE' :
    count === 2 ? 'DUAL_LANDSCAPE' :
    count === 3 ? 'ONE_LARGE_TWO_SMALL_H' : 'GRID_2X2'
  );

  /** 사진 카드 렌더링 헬퍼 (이미지 + 카테고리 배지 + 캡션 바) */
  const renderPhotoCard = (
    optImg: OptimizedImage,
    metaIdx: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    // 1. 이미지
    slide.addImage({
      data: optImg.base64,
      x, y, w, h,
      sizing: { type: 'cover', w, h },
    });

    const meta = validPhotos[metaIdx] || {};

    // 2. 카테고리 배지 (좌상단)
    if (meta.label) {
      const badgeW = Math.max(0.9, meta.label.length * 0.14 + 0.25);
      slide.addShape('rect' as any, {
        x: x + 0.08, y: y + 0.08, w: badgeW, h: 0.26,
        fill: { color: '10161F', transparency: 20 },
      });
      slide.addText(meta.label, {
        x: x + 0.08, y: y + 0.08, w: badgeW, h: 0.26,
        fontFace: KR, fontSize: 8, color: 'FFFFFF', bold: true,
        align: 'center', valign: 'middle', margin: 0,
      });
    }

    // 3. 캡션 바 (하단 오버레이)
    if (meta.caption && meta.caption.trim().length > 0) {
      const captionH = 0.32;
      slide.addShape('rect' as any, {
        x, y: y + h - captionH, w, h: captionH,
        fill: { color: '000000', transparency: 40 },
      });
      slide.addText(meta.caption, {
        x: x + 0.12, y: y + h - captionH, w: w - 0.24, h: captionH,
        fontFace: KR, fontSize: 8.5, color: 'FFFFFF',
        valign: 'middle', margin: 0,
      });
    }
  };

  // ── 레이아웃 분기 렌더링 ──
  if (layout === 'FULL_WIDE' || count === 1) {
    // 1장: 대형 풀와이드
    const imgW = CW;
    const imgH = maxAvailableH;
    renderPhotoCard(optimized[0], 0, M, startY, imgW, imgH);
  } else if (layout === 'DUAL_LANDSCAPE' || layout === 'DUAL_PORTRAIT' || count === 2) {
    // 2장: 좌우 50:50 분할
    const imgW = (CW - gap) / 2;
    const imgH = maxAvailableH;
    optimized.forEach((img, i) => {
      const x = M + i * (imgW + gap);
      renderPhotoCard(img, i, x, startY, imgW, imgH);
    });
  } else if (layout === 'ONE_LARGE_TWO_SMALL_H' || count === 3) {
    // 3장: 좌측 대형(62%) + 우측 상하 2장(38%)
    const leftW = (CW - gap) * 0.60;
    const rightW = (CW - gap) * 0.40;
    const smallH = (maxAvailableH - gap) / 2;

    // 좌측 대형 메인 사진
    renderPhotoCard(optimized[0], 0, M, startY, leftW, maxAvailableH);

    // 우측 상단 소형 사진
    renderPhotoCard(optimized[1], 1, M + leftW + gap, startY, rightW, smallH);

    // 우측 하단 소형 사진
    if (optimized[2]) {
      renderPhotoCard(optimized[2], 2, M + leftW + gap, startY + smallH + gap, rightW, smallH);
    }
  } else {
    // 4장: 2열 x 2행 균등 그리드 (GRID_2X2)
    const cols = 2;
    const rows = 2;
    const imgW = (CW - gap) / cols;
    const imgH = (maxAvailableH - gap) / rows;

    optimized.forEach((img, i) => {
      if (i >= 4) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = M + col * (imgW + gap);
      const y = startY + row * (imgH + gap);
      renderPhotoCard(img, i, x, y, imgW, imgH);
    });
  }

  if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
  L.foot(slide, input.slideNum, input.docno);
  return { slide, warnings };
}
