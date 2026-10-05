/**
 * 이미지 비율 보존 배치 헬퍼 (2026-10-05)
 *
 * 배경: PptxGenJS 의 sizing('cover'|'contain')은 addImage 옵션의 w/h 를 "원본 이미지 크기(비율)"로 간주한다.
 * 기존 코드가 w/h 에 박스 크기를 그대로 넘겨 원본 비율 정보가 사라졌고, 결과적으로 사진이 박스 비율로
 * 늘어나(왜곡) 렌더링되었다. 여기서는 실제 픽셀 크기(sharp 메타데이터)를 사용해 정확히 배치한다.
 */
import type PptxGenJS from 'pptxgenjs';

type Slide = ReturnType<PptxGenJS['addSlide']>;

export interface Box { x: number; y: number; w: number; h: number }

export type FitMode = 'cover' | 'contain' | 'auto';

export interface FitPlan {
  /** 실제 사용된 모드 */
  mode: 'cover' | 'contain' | 'stretch';
  /** 이미지가 실제로 그려지는 영역 (contain 시 박스 내부 중앙 정렬 영역) */
  drawn: Box;
}

/**
 * 순수 계산: 원본 크기와 박스로 배치 계획 산출.
 * auto: 원본/박스 종횡비 차이가 tolerance(기본 22%) 이내면 cover(경미한 크롭), 아니면 contain(전체 보존).
 */
export function planImageFit(box: Box, natW?: number, natH?: number, mode: FitMode = 'auto', tolerance = 0.22): FitPlan {
  if (!natW || !natH || natW <= 0 || natH <= 0) return { mode: 'stretch', drawn: { ...box } };
  const imgRatio = natW / natH;
  const boxRatio = box.w / box.h;
  let m: 'cover' | 'contain' = mode === 'contain' ? 'contain' : 'cover';
  if (mode === 'auto') {
    const diff = Math.abs(imgRatio - boxRatio) / boxRatio;
    m = diff <= tolerance ? 'cover' : 'contain';
  }
  if (m === 'cover') return { mode: 'cover', drawn: { ...box } };
  // contain: 박스 안에 비율 유지로 맞추고 중앙 정렬
  let w = box.w;
  let h = w / imgRatio;
  if (h > box.h) { h = box.h; w = h * imgRatio; }
  return { mode: 'contain', drawn: { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h } };
}

/**
 * 비율 보존 이미지 추가. natW/natH 가 없으면 기존 동작(박스에 맞춤)으로 폴백.
 * @returns 실제 그려진 영역 (오버레이 배치용)
 */
export function addImageFit(
  slide: Slide,
  data: string,
  box: Box,
  natW?: number,
  natH?: number,
  mode: FitMode = 'auto',
  extra: Record<string, unknown> = {},
): FitPlan {
  const plan = planImageFit(box, natW, natH, mode);
  if (plan.mode === 'cover') {
    // PptxGenJS cover: w/h = 원본 비율, sizing.w/h = 박스 → srcRect 로 중앙 크롭
    const imgW = box.w;
    const imgH = box.w * ((natH as number) / (natW as number));
    slide.addImage({ data, x: box.x, y: box.y, w: imgW, h: imgH, sizing: { type: 'cover', w: box.w, h: box.h }, ...extra } as any);
  } else {
    const d = plan.drawn;
    slide.addImage({ data, x: d.x, y: d.y, w: d.w, h: d.h, ...extra } as any);
  }
  return plan;
}
