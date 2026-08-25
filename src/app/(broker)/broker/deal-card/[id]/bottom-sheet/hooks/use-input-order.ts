// hooks/use-input-order.ts — L축 포스처별 입력 순서 결정

import type { InvestmentPosture } from '@/domain/ontology';

/**
 * 포스처별 입력 섹션 순서를 반환합니다.
 * 바텀시트 폼에서 섹션 렌더링 순서를 동적으로 결정하는 데 사용합니다.
 */
export function getInputOrder(posture: InvestmentPosture): string[] {
  switch (posture) {
    case 'income':
      return ['posture', 'address', 'lease', 'financial', 'comps', 'photos', 'additional'];
    case 'development':
      return ['posture', 'address', 'parcel', 'development', 'financial', 'photos'];
    case 'operating':
      return ['posture', 'address', 'performance', 'hospitality', 'financial', 'photos'];
    case 'owner_occupied':
      return ['posture', 'address', 'occupancy', 'physical', 'financial', 'photos'];
    case 'trading':
      return ['posture', 'address', 'comps', 'history', 'financial', 'photos'];
    default:
      return ['posture', 'address', 'lease', 'financial', 'comps', 'photos', 'additional'];
  }
}
