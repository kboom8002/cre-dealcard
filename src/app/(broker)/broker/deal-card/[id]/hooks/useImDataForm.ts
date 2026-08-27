import type { InvestmentPosture } from '@/domain/ontology';

export interface PostureFieldRequirement {
  field: string;
  label: string;
}

/** 포스처별 필수 필드 정의 */
export function getPostureRequiredFields(posture: InvestmentPosture): PostureFieldRequirement[] {
  const common: PostureFieldRequirement[] = [
    { field: 'address', label: '주소' },
    { field: 'askingPrice', label: '매각 희망가' },
  ];
  
  switch (posture) {
    case 'income':
      return [...common, { field: 'monthlyRent', label: '월 임대료' }, { field: 'totalDeposit', label: '총 보증금' }];
    case 'owner_occupied':
      return [...common, { field: 'occHeadcount', label: '사용 인원' }, { field: 'occDesiredFloors', label: '희망 층수' }];
    case 'development':
      return [...common, { field: 'devTargetUse', label: '개발 목적' }, { field: 'devTargetScalePyung', label: '개발 규모(평)' }];
    case 'operating':
      return [...common, { field: 'roomCount', label: '객실 수' }, { field: 'averageDailyRate', label: 'ADR' }, { field: 'unitKind', label: '객실 유형' }];
    case 'trading':
      return [...common, { field: 'acquisitionPriceManwon', label: '매입가' }];
    default:
      return common;
  }
}

/** 폼 데이터에서 누락된 필드 반환 */
export function computeMissingFields(
  posture: InvestmentPosture,
  data: Record<string, unknown>
): PostureFieldRequirement[] {
  const required = getPostureRequiredFields(posture);
  return required.filter(r => !data[r.field]);
}
