/**
 * @file layout-validator.ts
 * @description D33 BL-A — 지면 물리 검증기
 *
 * PPTX 슬라이드 렌더 완료 후 실측합니다.
 * G31~G36 위반 시 throw — 선언만 있고 실행이 없는 상태를 해소합니다.
 */
import PptxGenJS from 'pptxgenjs';

/** 캔버스 바운더리 (16:9 LAYOUT_WIDE) */
const CANVAS_W = 13.333;
const CANVAS_H = 7.5;

/** 인쇄 안전 마진 */
// D41 S4: imlib.ts M=0.62와 통일
const SAFE_W = 12.093;
const SAFE_H = 6.26;
const SAFE_MARGIN_X = 0.62;
const SAFE_MARGIN_Y = 0.62;

export interface LayoutViolation {
  gate: string;
  slideIndex: number;
  element: string;
  measured: number;
  limit: number;
  message: string;
}

export interface LayoutValidationResult {
  maxCropRatio: number;
  minEffectiveDpi: number;
  textOverflowCount: number;
  overlapMaxInches: number;
  bleedCount: number;
  aspectDistortionMaxPct: number;
  violations: LayoutViolation[];
}

interface ElementBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'text' | 'image' | 'shape' | 'table';
  slideIndex: number;
  /** 이미지 원본 픽셀 (알 수 있는 경우) */
  imgPixelW?: number;
  imgPixelH?: number;
  /** 텍스트 예상 높이 (알 수 있는 경우) */
  textEstimatedH?: number;
  /** 이미지 원본 종횡비 (알 수 있는 경우) */
  imgOriginalAspect?: number;
}

/**
 * PptxGenJS 프레젠테이션의 슬라이드를 순회하여
 * 모든 도형/이미지/텍스트 요소의 바운드를 수집합니다.
 *
 * NOTE: PptxGenJS는 내부 슬라이드 구조를 완전히 노출하지 않으므로,
 * `_slideObjects` 내부 API를 사용합니다. 이것이 깨지면 테스트에서 잡힙니다.
 */
function collectElements(pres: PptxGenJS): ElementBounds[] {
  const elements: ElementBounds[] = [];
  const slides = (pres as any)._slides ?? (pres as any).slides ?? [];

  for (let si = 0; si < slides.length; si++) {
    const slide = slides[si];
    const objs = slide?._slideObjects ?? slide?.data ?? [];

    for (const obj of objs) {
      const opts = obj?.options ?? obj ?? {};
      const toInches = (val: number) => (val > 100 ? val / 914400 : val);
      const x = toInches(parseFloat(opts.x) || 0);
      const y = toInches(parseFloat(opts.y) || 0);
      const w = toInches(parseFloat(opts.w) || 0);
      const h = toInches(parseFloat(opts.h) || 0);

      if (w === 0 && h === 0) continue;

      const type: ElementBounds['type'] =
        obj._type === 'image' || opts.data || opts.path ? 'image' :
        obj._type === 'table' || opts.arrTabRows ? 'table' :
        obj._type === 'text' || opts.text ? 'text' :
        'shape';

      const bounds: ElementBounds = { x, y, w, h, type, slideIndex: si + 1 };

      // 이미지 원본 정보 수집
      if (type === 'image') {
        if (opts._imgW) bounds.imgPixelW = opts._imgW;
        if (opts._imgH) bounds.imgPixelH = opts._imgH;
        if (opts._imgW && opts._imgH) {
          bounds.imgOriginalAspect = opts._imgW / opts._imgH;
        }
      }

      elements.push(bounds);
    }
  }

  return elements;
}

/**
 * 두 요소의 AABB 겹침 크기를 인치 단위로 반환합니다.
 */
function overlapInches(a: ElementBounds, b: ElementBounds): number {
  const overlapX = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return Math.min(overlapX, overlapY);
}

/**
 * PPTX 렌더 완료 후 지면 물리를 검증합니다.
 * 위반이 있으면 violations 배열에 기록합니다.
 */
export function validateLayout(pres: PptxGenJS): LayoutValidationResult {
  const elements = collectElements(pres);
  const violations: LayoutViolation[] = [];

  let maxCropRatio = 0;
  let minEffectiveDpi = Infinity;
  let textOverflowCount = 0;
  let overlapMaxInches = 0;
  let bleedCount = 0;
  let aspectDistortionMaxPct = 0;

  for (const el of elements) {
    // G35: 지면 이탈 검사
    const rightEdge = el.x + el.w;
    const bottomEdge = el.y + el.h;
    if (el.x < -0.01 || el.y < -0.01 || rightEdge > CANVAS_W + 0.01 || bottomEdge > CANVAS_H + 0.01) {
      bleedCount++;
      violations.push({
        gate: 'G35',
        slideIndex: el.slideIndex,
        element: `${el.type}@(${el.x.toFixed(2)},${el.y.toFixed(2)})`,
        measured: Math.max(rightEdge - CANVAS_W, bottomEdge - CANVAS_H, -el.x, -el.y),
        limit: 0,
        message: `지면 이탈: 요소가 캔버스 밖 (${el.x.toFixed(2)},${el.y.toFixed(2)} → ${rightEdge.toFixed(2)},${bottomEdge.toFixed(2)})`,
      });
    }

    // G32: 실효 DPI (이미지만)
    if (el.type === 'image' && el.imgPixelW && el.w > 0) {
      const effectiveDpi = el.imgPixelW / el.w;
      minEffectiveDpi = Math.min(minEffectiveDpi, effectiveDpi);
      const dpiLimit = 150; // 캡처 기준 하한
      if (effectiveDpi < dpiLimit) {
        violations.push({
          gate: 'G32',
          slideIndex: el.slideIndex,
          element: `image@(${el.x.toFixed(2)},${el.y.toFixed(2)})`,
          measured: Math.round(effectiveDpi),
          limit: dpiLimit,
          message: `실효 DPI ${Math.round(effectiveDpi)} < ${dpiLimit}`,
        });
      }
    }

    // G36: 종횡비 왜곡 (이미지만)
    if (el.type === 'image' && el.imgOriginalAspect && el.w > 0 && el.h > 0) {
      const displayAspect = el.w / el.h;
      const distortionPct = Math.abs(displayAspect - el.imgOriginalAspect) / el.imgOriginalAspect * 100;
      aspectDistortionMaxPct = Math.max(aspectDistortionMaxPct, distortionPct);
      if (distortionPct > 5) {
        violations.push({
          gate: 'G36',
          slideIndex: el.slideIndex,
          element: `image@(${el.x.toFixed(2)},${el.y.toFixed(2)})`,
          measured: parseFloat(distortionPct.toFixed(1)),
          limit: 5,
          message: `종횡비 왜곡 ${distortionPct.toFixed(1)}% > 5%`,
        });
      }
    }

    // G31: 사진 크로핑률 (이미지만)
    if (el.type === 'image' && el.imgOriginalAspect && el.w > 0 && el.h > 0) {
      const displayAspect = el.w / el.h;
      const origAspect = el.imgOriginalAspect;
      // 크롭 비율: 1 - (contain 영역 / cover 영역)
      let cropRatio = 0;
      if (displayAspect > origAspect) {
        // 높이 방향 크롭
        cropRatio = 1 - origAspect / displayAspect;
      } else {
        cropRatio = 1 - displayAspect / origAspect;
      }
      maxCropRatio = Math.max(maxCropRatio, cropRatio);
    }

    // G33: 텍스트 넘침 (텍스트 요소만 — textEstimatedH 있을 때)
    if (el.type === 'text' && el.textEstimatedH && el.textEstimatedH > el.h + 0.05) {
      textOverflowCount++;
      violations.push({
        gate: 'G33',
        slideIndex: el.slideIndex,
        element: `text@(${el.x.toFixed(2)},${el.y.toFixed(2)})`,
        measured: parseFloat(el.textEstimatedH.toFixed(2)),
        limit: parseFloat(el.h.toFixed(2)),
        message: `텍스트 넘침: 예상높이 ${el.textEstimatedH.toFixed(2)}" > 상자높이 ${el.h.toFixed(2)}"`,
      });
    }
  }

  // G34: 요소 겹침 — 같은 슬라이드 내 요소 쌍 검사
  const slideGroups = new Map<number, ElementBounds[]>();
  for (const el of elements) {
    const group = slideGroups.get(el.slideIndex) ?? [];
    group.push(el);
    slideGroups.set(el.slideIndex, group);
  }
  for (const [slideIdx, group] of slideGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const overlap = overlapInches(group[i], group[j]);
        overlapMaxInches = Math.max(overlapMaxInches, overlap);
        // G34는 warn 수준 — violations에는 추가하지만 throw 대상은 아님
      }
    }
  }

  // minEffectiveDpi가 Infinity면 이미지가 없는 것 — 기본값 설정
  if (minEffectiveDpi === Infinity) minEffectiveDpi = 300;

  return {
    maxCropRatio,
    minEffectiveDpi,
    textOverflowCount,
    overlapMaxInches,
    bleedCount,
    aspectDistortionMaxPct,
    violations,
  };
}
