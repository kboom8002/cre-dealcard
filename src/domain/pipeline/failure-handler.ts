export type FailureKind =
  | 'pnu_resolve_failed'
  | 'api_timeout'
  | 'api_partial'
  | 'ocr_low_confidence'
  | 'multi_parcel_overflow'
  | 'grade_d_publish_blocked';

export interface FailureRecovery {
  kind: FailureKind;
  userMessage: string;
  fallbackAction: string;
  canResume: boolean;       // 항상 true
}

export const FAILURE_RECOVERY_MATRIX: Record<FailureKind, FailureRecovery> = {
  pnu_resolve_failed:      { kind: 'pnu_resolve_failed',      userMessage: '지도에서 직접 선택해 주세요',    fallbackAction: 'map_select',    canResume: true },
  api_timeout:             { kind: 'api_timeout',             userMessage: '재시도 버튼을 눌러주세요',         fallbackAction: 'retry',         canResume: true },
  api_partial:             { kind: 'api_partial',             userMessage: '일부 데이터를 가져오지 못했습니다', fallbackAction: 'continue',      canResume: true },
  ocr_low_confidence:      { kind: 'ocr_low_confidence',      userMessage: '확인이 필요한 항목이 있습니다',   fallbackAction: 'manual_review', canResume: true },
  multi_parcel_overflow:   { kind: 'multi_parcel_overflow',   userMessage: '필지가 많습니다. 직접 선택해 주세요', fallbackAction: 'manual_select', canResume: true },
  grade_d_publish_blocked: { kind: 'grade_d_publish_blocked', userMessage: '자료 등급이 부족합니다',         fallbackAction: 'improve_grade', canResume: true },
};

export function handleFailure(kind: FailureKind): FailureRecovery {
  return FAILURE_RECOVERY_MATRIX[kind];
}
