import type PptxGenJS from 'pptxgenjs';
import * as L from '../imlib';
import { C, M, CW, KR } from '../imlib';
import type { ProvenanceKind } from '../imlib';
import { optimizeImagesForPptx, type OptimizedImage } from '../utils/image-optimizer';
import { addImageFit } from '../utils/image-fit';
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
  suppress?: boolean;
}

/** 비교용 정규화: 숫자·공백·괄호·구두점 제거 ('주변 도로/환경 2' → '주변도로환경') */
export function normalizeCaptionForCompare(s: string | undefined | null): string {
  return String(s ?? '').replace(/[\d\s()（）\[\]{}·ㆍ.,:;!?/\\\-_~]+/g, '');
}

/** 캡션이 칩 라벨과 동일하거나 서로 포함 관계(정규화 기준)이면 중복 */
export function isCaptionRedundantWithLabel(caption: string | undefined | null, label: string | undefined | null): boolean {
  const nc = normalizeCaptionForCompare(caption);
  const nl = normalizeCaptionForCompare(label);
  if (!nc || !nl) return false;
  return nc.includes(nl) || nl.includes(nc);
}

/** 칩과 구분되는 실제 정보를 담은 캡션인지 */
export function hasRealCaption(caption: string | undefined | null, label: string | undefined | null): boolean {
  if (!caption || caption.trim().length === 0) return false;
  return !isCaptionRedundantWithLabel(caption, label);
}


/**
 * A14 — 건물 사진 갤러리 (v0.6.0 고도화)
 * 1~4장의 사진을 최적 레이아웃(FULL_WIDE, DUAL, 1+2, GRID_2X2)으로 정밀 렌더링
 */
export async function buildA14Gallery(input: ArchetypeInput): Promise<ArchetypeOutput> {
  const warnings: string[] = [];
  const kicker = input.data.kicker || 'GALLERY';
  const title = input.data.title || '건물 주요 사진';

  const rawPhotos: PhotoMeta[] = input.data.photos || [];
  const photoUrls: string[] = input.data.photoUrls || [];

  // URLs & 메타 추출
  let targetPhotos: Array<{ url: string; caption?: string; label?: string; category?: string }> = [];

  if (rawPhotos.length > 0) {
    targetPhotos = rawPhotos.map(p => ({
      url: typeof p === 'string' ? p : p.url,
      caption: p.caption || '',
      label: (p.category && PHOTO_CATEGORY_LABELS[p.category as keyof typeof PHOTO_CATEGORY_LABELS])
        ? PHOTO_CATEGORY_LABELS[p.category as keyof typeof PHOTO_CATEGORY_LABELS]
        : (p.type && PHOTO_CATEGORY_LABELS[p.type as keyof typeof PHOTO_CATEGORY_LABELS])
          ? PHOTO_CATEGORY_LABELS[p.type as keyof typeof PHOTO_CATEGORY_LABELS]
          : undefined,
      category: p.category || p.type,
    }));
  } else if (photoUrls.length > 0) {
    targetPhotos = photoUrls.map(url => ({ url }));
  }

  const validPhotos = targetPhotos.filter(p => !!p.url);

  const renderFallbackGallery = (): ArchetypeOutput => {
    const slide = L.light(input.pres);
    // D4: 중개인 도면 면(suppressOnEmpty)은 이미지를 못 불러오면 일반 '현장 실사' 대체 카드 대신 면을 생략한다
    if (input.data.suppressOnEmpty) {
      warnings.push('도면 이미지 로딩 실패 — 지구단위계획·도면 면 생략');
      return { slide, warnings, suppress: true };
    }
    L.head(slide, input.slideNum, input.data.kicker || 'Gallery', input.data.title || '현장 사진');
    L.fallbackCard(slide, M, 1.50, CW, 5.00, {
      badge: '현장 실사 예정',
      badgeKind: 'info',
      title: '건축물 현황 및 물리적 실사 점검 안내',
      leadText: '본 자산의 내·외관 상태 및 주요 설비 사양은 매수 실사 절차 진행 시 현장 방문 조사를 통해 상세 확인 및 촬영이 진행됩니다.',
      checklist: [
        '외관 파사드 마감재 보존 상태 및 균열·누수 흔적 정밀 점검',
        '승강기, 기계식 주차설비, 수배전반 등 핵심 설비 내구연한 및 정기검사 이력',
        '옥상 방수 상태, 지하층 결로/누수 여부 및 공용부(계단실·화장실) 관리 컨디션',
        '법정 주차대수 확보 여부, 주차장 진입로 회전반경 및 층고 실측 검증',
      ],
      icon: 'building',
    });
    if (input.watermarkText) L.watermark(slide, input.watermarkText, false);
    L.foot(slide, input.slideNum, input.docno);
    return { slide, warnings };
  };

  if (validPhotos.length === 0) {
    warnings.push('갤러리 사진 없음 — 건축물 현황 실사 대체 카드 삽입');
    return renderFallbackGallery();
  }

  // B3 Fix: 이미지 최적화를 슬라이드 생성 전에 수행
  const urlsToOptimize = validPhotos.slice(0, 6).map(p => p.url);
  let optimized: OptimizedImage[] = [];
  try {
    optimized = await optimizeImagesForPptx(urlsToOptimize, 6, 2000, 85);
  } catch (err) {
    warnings.push(`갤러리 이미지 최적화 실패: ${err instanceof Error ? err.message : String(err)}`);
    return renderFallbackGallery();
  }

  if (optimized.length === 0) {
    warnings.push('갤러리 사진 로딩 실패 — 건축물 현황 실사 대체 카드 삽입');
    return renderFallbackGallery();
  }

  // 검증 통과 후에만 슬라이드 생성
  const slide = L.light(input.pres);
  L.head(slide, input.slideNum, kicker, title);

  const count = optimized.length;
  const startY = 1.35;
  const maxAvailableH = 5.15; // y: 1.35 ~ 6.50 (안전 여백 확보)
  const gap = 0.14;

  const layout: GalleryLayoutType = input.data.layout || (
    count === 1 ? 'FULL_WIDE' :
    count === 2 ? 'DUAL_LANDSCAPE' :
    count === 3 ? 'ONE_LARGE_TWO_SMALL_H' :
    count === 4 ? 'GRID_2X2' : 'GRID_2X3'
  );

  // D11a: 2장 이상이면서 전 사진이 같은 분류면 칩은 정보가 없으므로 생략
  const renderedCats = validPhotos.slice(0, 6).map(p => p.category || '');
  const allSameCategory = renderedCats.length >= 2 && renderedCats.every(c => c === renderedCats[0]);

  /** 사진 카드 렌더링 헬퍼 (이미지 실렌더링 영역(drawn) 기준 테두리 + 카테고리 배지 + 캡션 바 — 세로형 사진 레터박스 및 배지 부유 현상 원천 차단) */
  const renderPhotoCard = (
    optImg: OptimizedImage,
    metaIdx: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    // 1. 이미지 (contain 모드 — D31 BL-2: 원본 비율 100% 보존, 크로핑·왜곡 0)
    const fitPlan = addImageFit(slide, optImg.base64, { x, y, w, h }, optImg.width, optImg.height, 'contain');
    const dx = fitPlan.drawn.x;
    const dy = fitPlan.drawn.y;
    const dw = fitPlan.drawn.w;
    const dh = fitPlan.drawn.h;

    // 2. 실제 그려진 사진 외곽에만 깔끔한 헤어라인 테두리 마감 (회색 레터박스 여백 제거)
    slide.addShape('rect', {
      x: dx, y: dy, w: dw, h: dh,
      line: { color: C.line, width: 0.6 },
    });

    const meta = validPhotos[metaIdx] || {};

    // D11a: 실제 캡션이 있으면 캡션만, 캡션이 없을 때만 칩(분류 라벨). 전 사진이 같은 분류면 칩 생략.
    const realCaption = hasRealCaption(meta.caption, meta.label);
    const showChip = !!meta.label && !realCaption && !allSameCategory;

    // 3. 카테고리 배지 (실제 사진 좌상단 모서리에 정확히 부착)
    if (showChip && meta.label) {
      const badgeW = Math.min(Math.max(0.6, dw - 0.16), Math.max(0.9, meta.label.length * 0.14 + 0.25));
      slide.addShape('rect', {
        x: dx + 0.08, y: dy + 0.08, w: badgeW, h: 0.26,
        fill: { color: '10161F', transparency: 20 },
      });
      slide.addText(meta.label, {
        x: dx + 0.08, y: dy + 0.08, w: badgeW, h: 0.26,
        fontFace: KR, fontSize: 9, color: 'FFFFFF', bold: true, // D30 m-4: 최소 캡션 9pt
        align: 'center', valign: 'middle', margin: 0,
      });
    }

    // 4. 캡션 바 (하단 오버레이) — 실제 사진 폭(dw)에 정렬 (세로형 사진 폭이 좁을 때 2줄 래핑 시 캡션 바 높이 자동 확장)
    if (realCaption) {
      const capText = String(meta.caption).trim();
      const capTextW = Math.max(0.4, dw - 0.24);
      const estCharsPerLine = Math.max(4, Math.floor((capTextW * 72) / (9 * 1.05)));
      const estLines = Math.ceil(capText.length / estCharsPerLine);
      const captionH = estLines >= 2 ? 0.44 : 0.32;
      const safeCapText =
        estLines > 2
          ? `${capText.slice(0, Math.max(4, estCharsPerLine * 2 - 2))}…`
          : capText;
      slide.addShape('rect', {
        x: dx, y: dy + dh - captionH, w: dw, h: captionH,
        fill: { color: '000000', transparency: 40 },
      });
      slide.addText(safeCapText, {
        x: dx + 0.12, y: dy + dh - captionH, w: capTextW, h: captionH,
        fontFace: KR, fontSize: 9, color: 'FFFFFF', // D30 m-4: 최소 캡션 9pt
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
  } else if (layout === 'GRID_2X3' || count >= 5) {
    // 5~6장: 3열 x 2행 균등 그리드 (5장일 때 하단 2장은 중앙 대칭 배치하여 우하단 빈칸 해소)
    const cols = 3;
    const rows = 2;
    const imgW = (CW - gap * 2) / cols;
    const imgH = (maxAvailableH - gap) / rows;
    const row1CenteredStartX = M + (CW - (imgW * 2 + gap)) / 2;

    optimized.forEach((img, i) => {
      if (i >= 6) return;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = (count === 5 && row === 1)
        ? row1CenteredStartX + (i - 3) * (imgW + gap)
        : M + col * (imgW + gap);
      const y = startY + row * (imgH + gap);
      renderPhotoCard(img, i, x, y, imgW, imgH);
    });
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

