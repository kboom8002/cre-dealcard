export type PptxPhotoLayoutMode =
  | 'overview_side_by_side'
  | 'photo_driven'
  | 'map_driven'
  | 'data_constrained';

export interface PhotoSelectionContext {
  availablePhotoCount: number;
  hasCadastralMap: boolean;
  isNewlyConstructedOrRenovated: boolean;
  isLocationAdvantagePrimary: boolean;
}

export function selectPhotoLayoutArchetype(
  ctx: PhotoSelectionContext
): { archetype: PptxPhotoLayoutMode; reason: string } {
  if (ctx.availablePhotoCount <= 1) {
    return {
      archetype: 'data_constrained',
      reason: '가용 사진 1장 이하: 제원 중심 지면 구성 및 저화질 사진 강제 확대 방지',
    };
  }

  if (ctx.isNewlyConstructedOrRenovated && ctx.availablePhotoCount >= 4) {
    return {
      archetype: 'photo_driven',
      reason: '신축/리노베이션 자산 가치 극대화를 위한 상단 갤러리 주도형 레이아웃',
    };
  }

  if (ctx.isLocationAdvantagePrimary && ctx.hasCadastralMap) {
    return {
      archetype: 'map_driven',
      reason: '입지 및 개발호재 강조를 위한 광역 지적도 주도형 레이아웃',
    };
  }

  return {
    archetype: 'overview_side_by_side',
    reason: '일반 소형 상업용 부동산 표준 개요 병치형 레이아웃',
  };
}
