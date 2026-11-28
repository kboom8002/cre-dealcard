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
  postureSectionTitle: '매물 유형',
  thumbnailSectionTitle: '카톡 썸네일 · 한 줄 제목',
  pointsSectionTitle: '장점 3줄',
  regionLabel: '지역 (동 또는 구)',
  useLabel: '용도',
  priceLabel: '가격',
  headlineLabel: '한 줄 제목',
  aiWriteButton: 'AI로 쓰기',
  aiWriting: 'AI 작성 중…',
  sendKakao: '카톡으로 보내기',
  copyLink: '링크 복사',
  recipientCallCta: '전화하기',
  recipientImRequestCta: '상세 제안서(IM) 요청',
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
  // 부동산뉴스
  newsletter: '부동산뉴스',
  // 고객 소통
  inbox: '고객 소통',
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
  { term: /네이밍 ?라이츠|브랜딩 ?라이츠/, use: '사옥 단독 명칭 표기(간판 설치권)' },
  { term: /캡레이트/, use: '연 순수익률 (Cap Rate)' },
  { term: /(?:60대 자산가를 위한|법인 대표 맞춤|디벨로퍼 맞춤)/, use: '(Rule 1: 외부 문서에 페르소나 직접 표기 금지)' },
];

export interface RuntimeLexiconPattern {
  pattern: string;
  regex: RegExp;
  suggestion: string;
}

export interface RuntimeSurfaceLexiconViolation {
  pattern: string;
  match: string;
  suggestion: string;
  surface?: string;
}

/**
 * 런타임 출력(API 응답 · 렌더링 표면 · PPTX/뉴스레터/카카오)에 절대 노출되면 안 되는
 * 기술 오류/DB/내부 식별자 누출 패턴.
 */
export const RUNTIME_TECHNICAL_LEAK_PATTERNS: ReadonlyArray<RuntimeLexiconPattern> = [
  {
    pattern: 'PGRST\\d+',
    regex: /PGRST\d+/,
    suggestion: 'PostgREST 오류 코드를 사용자 안내 문구로 치환',
  },
  {
    pattern: '\\bNaN\\b',
    regex: /\bNaN\b/,
    suggestion: '숫자 결측치 포맷터(확인 중 / —) 적용',
  },
  {
    pattern: '\\bundefined\\b',
    regex: /\bundefined\b/,
    suggestion: '미정의 값 문자열 직렬화 차단',
  },
  {
    pattern: 'SQLSTATE',
    regex: /SQLSTATE/i,
    suggestion: 'SQL 상태 코드를 친절한 한국어 오류 안내로 치환',
  },
  {
    pattern: 'violates (?:foreign key|unique)',
    regex: /violates (?:foreign key|unique)/i,
    suggestion: 'DB 제약조건 오류 원문을 한국어 안내 문구로 치환',
  },
  {
    pattern: 'TypeError:',
    regex: /TypeError:/,
    suggestion: '런타임 TypeError 스택/메시지 외부 노출 차단',
  },
  {
    pattern: 'Cannot read propert',
    regex: /Cannot read propert/i,
    suggestion: '런타임 JS 예외 메시지 외부 노출 차단',
  },
];

const RUNTIME_RAW_UUID_V4_PATTERN: RuntimeLexiconPattern = {
  pattern: '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
  regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  suggestion: '내부 UUID v4 식별자를 화면/오류 문구에서 제거',
};

/**
 * 런타임 사용자 대면 표면에서 순화/치환이 필요한 CRE 약어 및 내부 전문 용어.
 */
export const RUNTIME_BANNED_CRE_JARGON_PATTERNS: ReadonlyArray<RuntimeLexiconPattern> = [
  {
    pattern: '캡레이트',
    regex: /캡레이트/,
    suggestion: '연 순수익률 (Cap Rate)',
  },
  {
    pattern: '배당률',
    regex: /배당률/,
    suggestion: '연 수익률 / 자본환원율',
  },
  {
    pattern: '\\bNOI\\b',
    regex: /\bNOI\b/,
    suggestion: '순영업소득 / 연 순수익',
  },
  {
    pattern: '\\bLTV\\b',
    regex: /\bLTV\b/,
    suggestion: '감정가 대비 대출 비율 / 담보인정 한도',
  },
  {
    pattern: '임대호가',
    regex: /임대호가/,
    suggestion: '월 임대료 / 임대 조건',
  },
  {
    pattern: '건물 ID',
    regex: /건물 ID/,
    suggestion: '매물명 또는 대상 건물',
  },
];

/**
 * 런타임 렌더링 텍스트 및 API 에러 메시지를 스캔해
 * BANNED_UI_TERMS + 기술적 오류 누출 + 비표준 CRE 약어(NOI/LTV/배당률/임대호가/건물 ID)를 탐지한다.
 */
export function scanRuntimeSurfaceLexicon(
  text: string,
  opts?: { surface?: string; allowUuid?: boolean },
): Array<{ pattern: string; match: string; suggestion: string }> {
  if (!text || !text.trim()) return [];

  const results: Array<{ pattern: string; match: string; suggestion: string }> = [];
  const seen = new Set<string>();

  const pushMatch = (pattern: string, match: string, suggestion: string) => {
    const key = `${pattern}::${match}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ pattern, match, suggestion });
  };

  for (const { term, use } of BANNED_UI_TERMS) {
    const flags = term.flags.includes('g') ? term.flags : `${term.flags}g`;
    const re = new RegExp(term.source, flags);
    for (const m of text.matchAll(re)) {
      pushMatch(term.source, m[0], use);
    }
  }

  for (const entry of RUNTIME_TECHNICAL_LEAK_PATTERNS) {
    const flags = entry.regex.flags.includes('g')
      ? entry.regex.flags
      : `${entry.regex.flags}g`;
    const re = new RegExp(entry.regex.source, flags);
    for (const m of text.matchAll(re)) {
      pushMatch(entry.pattern, m[0], entry.suggestion);
    }
  }

  if (!opts?.allowUuid) {
    const uuidRe = new RegExp(
      RUNTIME_RAW_UUID_V4_PATTERN.regex.source,
      `${RUNTIME_RAW_UUID_V4_PATTERN.regex.flags}g`,
    );
    for (const m of text.matchAll(uuidRe)) {
      pushMatch(
        RUNTIME_RAW_UUID_V4_PATTERN.pattern,
        m[0],
        RUNTIME_RAW_UUID_V4_PATTERN.suggestion,
      );
    }
  }

  for (const entry of RUNTIME_BANNED_CRE_JARGON_PATTERNS) {
    const flags = entry.regex.flags.includes('g')
      ? entry.regex.flags
      : `${entry.regex.flags}g`;
    const re = new RegExp(entry.regex.source, flags);
    for (const m of text.matchAll(re)) {
      // Avoid duplicate report if BANNED_UI_TERMS already recorded the exact same match
      const alreadyReportedMatch = results.some((r) => r.match === m[0]);
      if (!alreadyReportedMatch) {
        pushMatch(entry.pattern, m[0], entry.suggestion);
      }
    }
  }

  return results;
}
