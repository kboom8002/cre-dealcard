/**
 * @file layout-physics.ts
 * @description D31 — 지면 물리 검사 및 상자 역산 모듈
 *
 * 핵심 원칙: "사진이 상자를 정한다" — 최대 영역만 주고 실제 상자는 계산으로 받는다.
 *
 * ① fitBox   — 원본 비율 contain → dpi 하한 축소 → 정렬. 크로핑 0
 * ② textH    — CJK/Latin 혼합 텍스트 높이 추정 (줄바꿈 시뮬레이션)
 * ③ gridFit  — 여러 장을 높이만 맞추고 폭은 비율대로
 * ④ checkCropRatio / checkEffectiveDpi / checkOverflow / checkOverlap / checkBleed
 */

// ─── 슬라이드 상수 ─────────────────────────────────────────────────────────────
export const SLIDE_W = 13.333; // inches (16:9 widescreen)
export const SLIDE_H = 7.5;   // inches

// ─── DPI 하한 (D31 §1.1 / G17 정본) ────────────────────────────────────────────
export const MIN_DPI_PHOTO = 180;   // 실사 사진
export const MIN_DPI_CAPTURE = 150; // 캡처/도면

// ─── 크로핑 임계 (D31 §1.1) ────────────────────────────────────────────────────
export const CROP_WARN_THRESHOLD = 0.25;  // 25% 주의
export const CROP_BLOCK_THRESHOLD = 0.45; // 45% 위반

// ─── 겹침 허용 (D31 §1.1) ──────────────────────────────────────────────────────
export const OVERLAP_TOLERANCE = 0.015; // inches
export const OVERFLOW_TOLERANCE = 0.02; // inches

// ═══════════════════════════════════════════════════════════════════════════════
// fitBox — contain-fit + DPI 하한 자동 축소
// ═══════════════════════════════════════════════════════════════════════════════

export interface FitBoxResult {
  /** 상자 내 오프셋 x (정렬 반영) */
  x: number;
  /** 상자 내 오프셋 y (정렬 반영) */
  y: number;
  /** 실제 렌더링 폭 (inches) */
  w: number;
  /** 실제 렌더링 높이 (inches) */
  h: number;
  /** DPI 하한 미달로 축소되었는가 */
  shrunk: boolean;
  /** 실효 DPI (px/inch) */
  effectiveDpi: number;
  /** 크로핑률 (0 = contain, 0~1 = cover 시) */
  cropRatio: number;
}

export type FitAlign = 'center' | 'top' | 'bottom' | 'left' | 'right';

/**
 * 원본 비율을 유지하며 최대 영역 안에 contain-fit 합니다.
 * DPI 하한 미달 시 자동 축소하여 `shrunk` 플래그를 세웁니다.
 * **크로핑 0%** — 원본 전체가 보입니다.
 *
 * @param imgW 원본 이미지 폭 (px)
 * @param imgH 원본 이미지 높이 (px)
 * @param maxW 최대 상자 폭 (inches)
 * @param maxH 최대 상자 높이 (inches)
 * @param minDpi DPI 하한 (사진 180 / 캡처 150)
 * @param align 정렬 방향 (기본 center)
 */
export function fitBox(
  imgW: number,
  imgH: number,
  maxW: number,
  maxH: number,
  minDpi: number = MIN_DPI_CAPTURE,
  align: FitAlign = 'center',
): FitBoxResult {
  if (imgW <= 0 || imgH <= 0 || maxW <= 0 || maxH <= 0) {
    return { x: 0, y: 0, w: maxW, h: maxH, shrunk: false, effectiveDpi: 0, cropRatio: 0 };
  }

  const imgAspect = imgW / imgH;

  // Step 1: contain-fit → 비율 유지하며 maxW × maxH 안에 맞춤
  let fitW: number;
  let fitH: number;
  if (imgAspect >= maxW / maxH) {
    // 가로가 더 넓음 → 폭 기준
    fitW = maxW;
    fitH = maxW / imgAspect;
  } else {
    // 세로가 더 긴 경우 → 높이 기준
    fitH = maxH;
    fitW = maxH * imgAspect;
  }

  // Step 2: DPI 하한 검사 → 하한 미달 시 축소
  let shrunk = false;
  const effectiveDpiW = imgW / fitW;
  const effectiveDpiH = imgH / fitH;
  const effectiveDpi = Math.min(effectiveDpiW, effectiveDpiH);

  if (effectiveDpi < minDpi) {
    // DPI 하한 미달: 상자를 줄여 DPI 를 맞춤
    const maxWByDpi = imgW / minDpi;
    const maxHByDpi = imgH / minDpi;
    fitW = Math.min(fitW, maxWByDpi);
    fitH = Math.min(fitH, maxHByDpi);
    shrunk = true;
  }

  // Step 3: 정렬 오프셋 계산
  let offsetX = 0;
  let offsetY = 0;
  const remainW = maxW - fitW;
  const remainH = maxH - fitH;

  switch (align) {
    case 'center':
      offsetX = remainW / 2;
      offsetY = remainH / 2;
      break;
    case 'top':
      offsetX = remainW / 2;
      offsetY = 0;
      break;
    case 'bottom':
      offsetX = remainW / 2;
      offsetY = remainH;
      break;
    case 'left':
      offsetX = 0;
      offsetY = remainH / 2;
      break;
    case 'right':
      offsetX = remainW;
      offsetY = remainH / 2;
      break;
  }

  const finalDpi = Math.min(imgW / fitW, imgH / fitH);

  return {
    x: offsetX,
    y: offsetY,
    w: fitW,
    h: fitH,
    shrunk,
    effectiveDpi: finalDpi,
    cropRatio: 0, // contain → 크로핑 없음
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// coverCropRatio — cover-fit 시 손실률 계산 (검사 전용)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * cover-fit 했을 때 원본의 몇 % 가 잘리는지 계산합니다.
 * 실제 크로핑을 수행하지 않고 비율만 계산합니다.
 */
export function coverCropRatio(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): number {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return 0;

  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;

  if (Math.abs(imgAspect - boxAspect) < 0.01) return 0;

  // cover-fit: 상자를 완전히 채우되 비율 유지 → 긴 축이 잘림
  let visibleFraction: number;
  if (imgAspect > boxAspect) {
    // 이미지가 상자보다 가로로 넓음 → 좌우가 잘림
    visibleFraction = boxAspect / imgAspect;
  } else {
    // 이미지가 상자보다 세로로 김 → 상하가 잘림
    visibleFraction = imgAspect / boxAspect;
  }

  return 1 - visibleFraction;
}

// ═══════════════════════════════════════════════════════════════════════════════
// textH — CJK/Latin 혼합 텍스트 높이 추정
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CJK 문자: 글자당 폭 ≈ fontSizePt / 72 inches
 * Latin 문자: 글자당 폭 ≈ fontSizePt × 0.55 / 72 inches
 *
 * 상자 폭 안에서 줄바꿈을 시뮬레이션하여 필요한 높이를 인치 단위로 반환합니다.
 */
export function textH(
  text: string,
  widthInches: number,
  fontSizePt: number,
  lineSpacing: number = 1.3,
): number {
  if (!text || widthInches <= 0 || fontSizePt <= 0) return 0;

  const charHeightInches = fontSizePt / 72;

  // 텍스트를 줄 단위로 분리 (명시적 줄바꿈)
  const explicitLines = text.split('\n');
  let totalLines = 0;

  for (const line of explicitLines) {
    if (line.length === 0) {
      totalLines += 1;
      continue;
    }

    // 각 줄에서 자동 줄바꿈 계산
    let currentLineWidth = 0;
    let linesInParagraph = 1;

    for (const char of line) {
      const isCJK = /[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(char);
      const charWidth = isCJK
        ? fontSizePt / 72
        : fontSizePt * 0.55 / 72;

      currentLineWidth += charWidth;
      if (currentLineWidth > widthInches) {
        linesInParagraph += 1;
        currentLineWidth = charWidth; // 다음 줄로 넘어감
      }
    }

    totalLines += linesInParagraph;
  }

  return totalLines * charHeightInches * lineSpacing;
}

// ═══════════════════════════════════════════════════════════════════════════════
// gridFit — 여러 장을 높이만 맞추고 폭은 비율대로
// ═══════════════════════════════════════════════════════════════════════════════

export interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 여러 이미지를 하나의 행에 배치합니다.
 * 모든 이미지의 높이를 통일하고, 폭은 원본 비율에 비례합니다.
 * 총 폭이 `totalW`를 초과하지 않도록 높이를 자동 조절합니다.
 */
export function gridFit(
  images: Array<{ w: number; h: number }>,
  startX: number,
  startY: number,
  totalW: number,
  maxH: number,
  gap: number = 0.12,
): GridCell[] {
  if (images.length === 0) return [];
  if (images.length === 1) {
    const box = fitBox(images[0].w, images[0].h, totalW, maxH);
    return [{ x: startX + box.x, y: startY + box.y, w: box.w, h: box.h }];
  }

  // 모든 이미지를 높이 1로 정규화 → 각 폭 = aspect ratio
  const aspects = images.map(img => (img.w / img.h) || 1);
  const totalGap = gap * (images.length - 1);

  // 균일 높이 h 에서 총 폭 = sum(aspect_i * h) + totalGap = totalW
  // → h = (totalW - totalGap) / sum(aspect_i)
  const sumAspects = aspects.reduce((a, b) => a + b, 0);
  let unifiedH = (totalW - totalGap) / sumAspects;
  unifiedH = Math.min(unifiedH, maxH);

  const cells: GridCell[] = [];
  let cx = startX;
  for (let i = 0; i < images.length; i++) {
    const cellW = aspects[i] * unifiedH;
    cells.push({ x: cx, y: startY, w: cellW, h: unifiedH });
    cx += cellW + gap;
  }

  return cells;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout Check Functions — D31 §1.1 게이트용
// ═══════════════════════════════════════════════════════════════════════════════

export type LayoutSeverity = 'violation' | 'warning';

export interface LayoutCheckResult {
  gate: string;        // G31~G35
  severity: LayoutSeverity;
  message: string;
  value?: number;
}

/** G31: 사진 크로핑률 검사 */
export function checkCropRatio(
  imgW: number, imgH: number,
  boxW: number, boxH: number,
  label?: string,
): LayoutCheckResult | null {
  const ratio = coverCropRatio(imgW, imgH, boxW, boxH);
  if (ratio > CROP_BLOCK_THRESHOLD) {
    return {
      gate: 'G31',
      severity: 'violation',
      message: `${label || '사진'} 크로핑률 ${(ratio * 100).toFixed(1)}% > ${CROP_BLOCK_THRESHOLD * 100}% 상한`,
      value: ratio,
    };
  }
  if (ratio > CROP_WARN_THRESHOLD) {
    return {
      gate: 'G31',
      severity: 'warning',
      message: `${label || '사진'} 크로핑률 ${(ratio * 100).toFixed(1)}% > ${CROP_WARN_THRESHOLD * 100}% 주의`,
      value: ratio,
    };
  }
  return null;
}

/** G32: 실효 DPI 검사 */
export function checkEffectiveDpi(
  imgW: number, imgH: number,
  boxW: number, boxH: number,
  minDpi: number = MIN_DPI_CAPTURE,
  label?: string,
): LayoutCheckResult | null {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return null;

  const dpiW = imgW / boxW;
  const dpiH = imgH / boxH;
  const effectiveDpi = Math.min(dpiW, dpiH);

  if (effectiveDpi < minDpi) {
    return {
      gate: 'G32',
      severity: 'violation',
      message: `${label || '사진'} 실효 DPI ${effectiveDpi.toFixed(0)} < 하한 ${minDpi}`,
      value: effectiveDpi,
    };
  }
  return null;
}

/** G33: 텍스트 넘침 검사 */
export function checkOverflow(
  text: string,
  boxW: number,
  boxH: number,
  fontSizePt: number,
  lineSpacing: number = 1.3,
  label?: string,
): LayoutCheckResult | null {
  const needed = textH(text, boxW, fontSizePt, lineSpacing);
  if (needed > boxH + OVERFLOW_TOLERANCE) {
    return {
      gate: 'G33',
      severity: 'violation',
      message: `${label || '텍스트'} 넘침: 필요 ${needed.toFixed(2)}in > 상자 ${boxH.toFixed(2)}in`,
      value: needed - boxH,
    };
  }
  return null;
}

/** G34: 요소 겹침 검사 */
export function checkOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  labelA?: string,
  labelB?: string,
): LayoutCheckResult | null {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

  if (overlapX > OVERLAP_TOLERANCE && overlapY > OVERLAP_TOLERANCE) {
    const overlapInches = Math.min(overlapX, overlapY);
    return {
      gate: 'G34',
      severity: overlapInches > OVERLAP_TOLERANCE ? 'warning' : 'violation',
      message: `${labelA || '요소A'}와 ${labelB || '요소B'} 겹침 ${overlapInches.toFixed(3)}in`,
      value: overlapInches,
    };
  }
  return null;
}

/** G35: 지면 이탈 검사 */
export function checkBleed(
  el: { x: number; y: number; w: number; h: number },
  label?: string,
  isBackground: boolean = false,
): LayoutCheckResult | null {
  // 배경/풀블리드 요소는 제외
  if (isBackground) return null;

  const right = el.x + el.w;
  const bottom = el.y + el.h;

  if (el.x < -0.01 || el.y < -0.01 || right > SLIDE_W + 0.01 || bottom > SLIDE_H + 0.01) {
    return {
      gate: 'G35',
      severity: 'violation',
      message: `${label || '요소'} 지면 이탈: (${el.x.toFixed(2)}, ${el.y.toFixed(2)}) ~ (${right.toFixed(2)}, ${bottom.toFixed(2)})`,
      value: Math.max(
        Math.max(0, -el.x),
        Math.max(0, -el.y),
        Math.max(0, right - SLIDE_W),
        Math.max(0, bottom - SLIDE_H),
      ),
    };
  }
  return null;
}
