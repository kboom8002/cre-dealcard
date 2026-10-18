/**
 * @file ui-lexicon.ts
 * @description 60대 한국 상업용 빌딩 중개인을 위한 무마찰 UI 용어집 및 에러/필드 한국어 변환 SSOT
 */

/** 사용자 대면 UI에서 지양하는 영문/엔지니어링 용어 → 쉬운 실무 한국어 매핑 */
export const UI_LEXICON_MAP: Record<string, string> = {
  '투자 포스처': '건물 투자 유형',
  '포스처': '투자 유형',
  'Fact OM': '기본 사실 요약본',
  'Analysis IM': '표준 투자설명서',
  'Decision IM': '심층 투자설명서',
  '편집 승인(S60)': '내용 확인 완료',
  'S60': '내용 확인 완료',
  'S70': '최종 승인 완료',
  'Hot Lead': '관심 높은 고객',
  '핫리드': '관심 높은 고객',
  '아웃리치': '안부 연락',
  '19자리 PNU': '필지 고유번호(자동 조회)',
  '보안 검증 완료 (k=20)': '주소 비공개 보호 적용',
  'B-SSoT Studio Pro': '건물 상세 정보 관리',
  '중개인 코크핏': '중개 업무 홈',
};

/** IM 입력 시트 및 검증 칩에서 영문 키 노출을 원천 차단하는 한국어 필드 라벨 사전 */
export const KOREAN_FIELD_LABELS: Record<string, string> = {
  investmentPosture: '건물 투자 유형',
  address: '건물 주소',
  pnu: '주소 선택 (자동 조회)',
  askingPriceManwon: '매매 희망가',
  monthlyRentManwon: '월 임대료 합계',
  totalDepositManwon: '보증금 합계',
  mgmtFeeManwon: '월 관리비',
  vacancyPct: '공실률',
  currentRentManwon: '현재 임차 월세(사옥 비교용)',
  unitKind: '호실 구분',
  occDesiredFloors: '희망 사용 층수',
  acquisitionPriceManwon: '취득 예정가',
  landAreaSqm: '대지면적',
  totalGrossAreaSqm: '연면적',
  targetBuildingScale: '신축 목표 규모',
  constructionCostPerPyeongManwon: '평당 예상 건축비',
  roomCount: '객실 수',
  adrKrw: '평균 객실 단가',
  occPct: '평균 객실 가동률',
  gopMarginPct: '영업이익률',
};

/** 영문 필드 키를 한국어 라벨로 안전하게 변환 (미등록 키도 한글 안내로 폴백) */
export function getKoreanFieldLabel(fieldKey: string): string {
  if (!fieldKey) return '필수 입력 항목';
  if (KOREAN_FIELD_LABELS[fieldKey]) return KOREAN_FIELD_LABELS[fieldKey];
  // camelCase 영문 키가 그대로 노출되지 않도록 방어
  if (/^[a-zA-Z0-9_]+$/.test(fieldKey)) {
    return '추가 확인 항목';
  }
  return fieldKey;
}

/** PPTX/PDF 다운로드 실패 응답을 60대 중개인 친화적인 한국어 안내문으로 변환 */
export function humanizeImExportError(
  status?: number,
  payload?: { error?: string; reason?: string; suggestion?: string; qualityGrade?: string } | null,
  ext: 'pptx' | 'pdf' = 'pptx'
): { title: string; detail: string } {
  const docLabel = ext === 'pptx' ? 'PPTX 투자설명서' : 'PDF 문서';

  if (status === 429) {
    return {
      title: `${docLabel} 다운로드 요청이 일시적으로 많습니다.`,
      detail: '약 1분 뒤에 다시 버튼을 눌러주세요.',
    };
  }

  if (status === 404) {
    return {
      title: '생성된 투자설명서 초안을 찾을 수 없습니다.',
      detail: '먼저 [투자설명서 만들기] 버튼을 눌러 설명서를 생성해 주세요.',
    };
  }

  if (status === 422 || payload?.qualityGrade === 'D' || payload?.error?.includes('[G30]')) {
    const reason =
      payload?.reason ||
      '건물 기본 정보(주소·매매가·임대료 중 필수 항목)가 부족하여 슬라이드를 구성할 수 없습니다.';
    const suggestion =
      payload?.suggestion ||
      '[투자설명서 만들기] 화면에서 건물 주소와 매매 희망가를 확인한 뒤 다시 생성해 주세요.';
    return {
      title: `${docLabel}를 만들기에 건물 정보가 부족합니다.`,
      detail: `${reason} ${suggestion}`,
    };
  }

  if (payload?.reason) {
    return {
      title: `${docLabel} 생성 중 확인이 필요합니다.`,
      detail: payload.suggestion ? `${payload.reason} (${payload.suggestion})` : payload.reason,
    };
  }

  return {
    title: `${docLabel} 파일을 준비하는 중 문제가 생겼습니다.`,
    detail: '일시적인 통신 지연일 수 있습니다. 잠시 후 다시 눌러주세요.',
  };
}

/** 원시 에러 메시지(HTTP 코드, JSON 문자열, 영문 스택)를 중개인 친화 한국어로 정제 */
export function humanizeBrokerError(rawError: unknown, fallback = '처리 중 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (!rawError) return fallback;
  const msg = typeof rawError === 'string'
    ? rawError
    : rawError instanceof Error
    ? rawError.message
    : '';

  if (!msg) return fallback;

  // JSON 문자열이나 [object Object] 차단
  if (msg.startsWith('{') || msg.startsWith('[') || msg.includes('[object Object]')) {
    return fallback;
  }

  // HTTP 상태코드 노출 정제
  if (/HTTP\s*\d{3}/i.test(msg)) {
    return '서버와 통신하는 중 일시적인 지연이 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }

  // 순수 영문 에러 메시지인 경우 한국어 기본 안내로 교체
  if (/^[a-zA-Z0-9\s_:.,[\]()-]+$/.test(msg)) {
    if (msg.includes('G30') || msg.includes('Grade D')) {
      return '건물 기본 정보(주소·매매가 등)가 부족합니다. 정보를 보완한 뒤 다시 시도해 주세요.';
    }
    if (msg.includes('Rate limit')) {
      return '요청이 일시적으로 많습니다. 1분 뒤 다시 시도해 주세요.';
    }
    return fallback;
  }

  return msg;
}
