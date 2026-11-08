/**
 * UX Lexicon SSOT — 브로커 작업공간(딜카드 · IM · 뉴스레터 · 고객소통함) 사용자 대면 표준 용어.
 *
 * 원칙 (60대 초심자 중개인 대상 · 미니멀 · 무마찰):
 *  1. 같은 대상은 한 이름으로만 부른다.
 *  2. 개발/영어 약어(OG, slug, G2, token, hash, posture …)는 화면에 내보내지 않는다.
 *  3. 버튼은 짧은 동사로 끝낸다 ("보내기", "만들기", "예시 넣기").
 *  4. 'AI'라는 말은 실제 LLM 호출일 때만 쓴다.
 *
 * 금지어 가드: src/tests/workspace/ux-lexicon-guard.test.ts 가 BANNED_UI_TERMS 를
 * 작업공간 화면 파일의 "사용자 대면 문자열"에서 검사한다.
 */

/** 매수 성격 (딜카드 3종) — 내부 키: income | owner_occupied | value_add */
export const POSTURE_LABELS = {
  income: {
    title: '임대수익용',
    subtitle: '안정 월세 · 만실 수익',
    shortBadge: '임대수익용',
    areaRuleNote: '연면적 표시',
    areaFieldLabel: '면적 (연면적)',
    areaPlaceholder: '예: 연면적 440평',
  },
  owner_occupied: {
    title: '사옥용',
    subtitle: '직접 입주 · 가시성 · 주차',
    shortBadge: '사옥용',
    areaRuleNote: '연면적 표시',
    areaFieldLabel: '면적 (연면적)',
    areaPlaceholder: '예: 연면적 440평',
  },
  value_add: {
    title: '신축·개발용',
    subtitle: '리모델링 · 신축 · 토지가치',
    shortBadge: '신축·개발용',
    areaRuleNote: '토지면적 표시',
    areaFieldLabel: '면적 (토지면적)',
    areaPlaceholder: '예: 토지면적 130평',
  },
} as const;

/** IM 투자 목적 (5종) — 내부 키는 기존 investment_posture 값을 유지 */
export const IM_POSTURE_LABELS: Record<string, string> = {
  core_income: '임대수익',
  income: '임대수익',
  owner_occupied: '사옥(직접 사용)',
  development: '신축·개발',
  operating: '직접 운영',
  trading: '단기 매매',
};

export const TERMS = {
  // 딜카드
  kakaoThumbnail: '카톡 썸네일',
  oneLineTitle: '한 줄 제목',
  threeStrengths: '장점 3줄',
  region: '지역',
  use: '용도',
  area: '면적',
  areaLabel: '면적',
  price: '가격',
  gfa: '연면적',
  landArea: '토지면적',
  postureSectionTitle: '① 어떤 매물인가요?',
  thumbnailSectionTitle: '② 카톡 썸네일 & 한 줄 제목',
  pointsSectionTitle: '③ 장점 3줄',
  regionLabel: '지역 (동 또는 구)',
  useLabel: '용도',
  priceLabel: '가격',
  headlineLabel: '한 줄 제목',
  aiWriteButton: 'AI로 쓰기',
  aiWriting: 'AI 작성 중…',
  sendKakao: '카톡으로 보내기',
  copyLink: '링크 복사',
  recipientCallCta: '전화하기',
  recipientImRequestCta: 'IM 요청하기',
  previewBubbleTab: '카톡 말풍선',
  previewRecipientTab: '받는 화면',
  statusSent: '보냄',
  statusDraft: '작성 중',
  statusPublished: '발행됨',
  colPick: '① 고르기',
  colFill: '② 채우기',
  colPreviewSend: '③ 확인하고 보내기',
  // IM
  im: 'IM',
  createIm: 'IM 만들기',
  basicImDeck: 'Basic IM 발표자료(PPT)',
  rentRoll: '임대 현황',
  annualYield: '연 수익률',
  investmentPoint: '투자포인트',
  // 뉴스레터
  newsletter: '뉴스레터',
  // 고객소통함
  inbox: '소통함',
  docRequest: '자료 요청',
  sendDocs: '자료 보내기',
  reject: '거절',
  closeLink: '링크 닫기',
  memo: '메모',
  // 공통
  call: '전화하기',
  requestIm: 'IM 요청하기',
  aiWrite: 'AI로 쓰기',
  sampleFill: '예시 넣기',
  more: '더보기',
} as const;

/** 자동저장 상태 → 사용자 문구 (정직한 저장 표시) */
export type HonestSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict' | 'offline';

export const SAVE_STATE_LABELS: Record<HonestSaveState, string> = {
  idle: '',
  dirty: '고친 내용 있음',
  saving: '저장 중…',
  saved: '저장됨 ✓',
  error: '저장 안 됨 · 다시 시도',
  conflict: '다른 곳에서 고쳤어요',
  offline: '인터넷 연결 없음',
};

/** 상대 시간 ("방금", "3분 전", "2시간 전", "어제") — 고정 문구 "방금" 금지 */
export function formatRelativeKo(date: Date | string | number | null | undefined, now: number = Date.now()): string {
  if (date === null || date === undefined || date === '') return '';
  const t = typeof date === 'number' ? date : new Date(date).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '어제';
  return `${day}일 전`;
}

/**
 * 화면(사용자 대면 문자열)에 나오면 안 되는 용어.
 * 코드 식별자/주석/data-testid 는 대상이 아니며, 가드 테스트는 JSX 텍스트와
 * 문자열 리터럴 중 한글이 포함된 것만 검사한다.
 */
export const BANNED_UI_TERMS: ReadonlyArray<{ term: RegExp; use: string }> = [
  { term: /포스처/, use: '매수 성격 / 투자 목적' },
  { term: /OG ?(이미지|제목|면적|설명)/, use: '카톡 썸네일 / 한 줄 제목' },
  { term: /[1-4]사분면/, use: '지역 / 용도 / 면적 / 가격' },
  { term: /소구 ?카피/, use: '한 줄 제목' },
  { term: /SHA-256|해시 확정|해시:/, use: '(표시하지 않음)' },
  { term: /G2 ?(승인|상세)/, use: '자료 요청 / 자료 보내기' },
  { term: /핫리드/, use: '연락할 고객' },
  { term: /보안 토큰|전용 토큰/, use: '(표시하지 않음)' },
  { term: /404 차단|보안 회수/, use: '링크 닫힘' },
  { term: /바텀시트/, use: '자세히 입력하기' },
  { term: /PPTX 스튜디오/, use: '발표자료(PPT) 꾸미기' },
  { term: /콘텐츠 스튜디오|Content Studio|매거진 스튜디오/, use: '뉴스레터' },
  { term: /\(Slug\)|\(slug\)/, use: '내 뉴스레터 주소' },
  { term: /k-?익명성|재식별/, use: '(쉬운 안내 문구)' },
  { term: /바이너리 해시/, use: '(표시하지 않음)' },
];
