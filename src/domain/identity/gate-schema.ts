/**
 * gate-schema.ts — G2/G3 무마찰 게이트 스키마
 * Spec: DISTRIBUTION_AND_IDENTITY.md §5
 * 
 * 매칭 축은 전부 단일 탭 칩으로. 자유입력은 마찰이 높고 데이터 품질도 낮습니다.
 * 탭 4번 + 이름 + 전화번호. 목표 완료 시간 20초.
 */

export type ChipField = {
  kind: 'chip';
  required: boolean;
  options: readonly string[];
};

export type TextField = {
  kind: 'text';
  required: boolean;
  maxLen: number;
};

export type PhoneField = {
  kind: 'phone';
  required: boolean;
};

export type GateField = ChipField | TextField | PhoneField;

/**
 * G2 게이트 스키마 — 상세 IM 열람 자격
 * 칩 4종 + 이름 + 전화번호
 */
export const GATE_G2 = {
  budgetBand: {
    kind: 'chip' as const,
    required: true,
    options: ['~50억', '50~100억', '100~200억', '200~300억', '300억~', '미정'] as const,
    label: '투자 예산',
    icon: '💰',
  },
  purpose: {
    kind: 'chip' as const,
    required: true,
    options: ['실사용(사옥)', '임대수익', '밸류애드', '개발', '자산배분'] as const,
    label: '매수 목적',
    icon: '🎯',
  },
  financing: {
    kind: 'chip' as const,
    required: true,
    options: ['전액 자기자본', '대출 병행', '대출 필수', '미정'] as const,
    label: '자금 조달',
    icon: '🏦',
  },
  entityType: {
    kind: 'chip' as const,
    required: true,
    options: ['개인', '법인', '조합·펀드', '대리인'] as const,
    label: '거래 주체',
    icon: '👤',
  },
  name: {
    kind: 'text' as const,
    required: true,
    maxLen: 20,
    label: '성함',
    placeholder: '홍길동',
  },
  phone: {
    kind: 'phone' as const,
    required: true,
    label: '연락처',
    placeholder: '010-0000-0000',
  },
} as const;

/** Entity type enum 매핑 (칩 → DB 저장용) */
export const ENTITY_TYPE_MAP: Record<string, string> = {
  '개인': 'individual',
  '법인': 'corp',
  '조합·펀드': 'fund',
  '대리인': 'agent',
};

/** Budget band enum 매핑 (칩 → DB 저장용) */
export const BUDGET_BAND_MAP: Record<string, string> = {
  '~50억': 'under_50',
  '50~100억': '50_100',
  '100~200억': '100_200',
  '200~300억': '200_300',
  '300억~': 'over_300',
  '미정': 'undecided',
};

/**
 * §5.3 마찰 예산 — 필드를 늘리려는 모든 시도에 적용
 * 1. 이 필드 없이 매칭이 불가능한가?
 * 2. 단일 탭으로 답할 수 있는가?
 * 3. 게이트 이탈률이 30%를 넘지 않는다는 근거가 있는가?
 */
export const FRICTION_BUDGET = {
  maxFields: 6,
  targetCompletionSeconds: 20,
  maxDropoffRate: 0.30,
} as const;

export interface G2FormData {
  budgetBand: string;
  purpose: string;
  financing: string;
  entityType: string;
  name: string;
  phone: string;
}

/**
 * G2 폼 데이터 유효성 검증
 */
export function validateG2Form(data: G2FormData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!GATE_G2.budgetBand.options.includes(data.budgetBand as any)) {
    errors.push('투자 예산을 선택해주세요.');
  }
  if (!GATE_G2.purpose.options.includes(data.purpose as any)) {
    errors.push('매수 목적을 선택해주세요.');
  }
  if (!GATE_G2.financing.options.includes(data.financing as any)) {
    errors.push('자금 조달 방식을 선택해주세요.');
  }
  if (!GATE_G2.entityType.options.includes(data.entityType as any)) {
    errors.push('거래 주체를 선택해주세요.');
  }
  if (!data.name || data.name.length > 20) {
    errors.push('성함을 입력해주세요. (20자 이내)');
  }
  if (!data.phone || !/^01[016789]-?\d{3,4}-?\d{4}$/.test(data.phone.replace(/\s/g, ''))) {
    errors.push('올바른 연락처를 입력해주세요.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 전화번호를 E.164 형식으로 변환
 */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('010')) return `+82${digits.slice(1)}`;
  if (digits.startsWith('82')) return `+${digits}`;
  return `+82${digits}`;
}
