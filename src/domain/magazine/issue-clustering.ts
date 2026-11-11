/**
 * src/domain/magazine/issue-clustering.ts — AI 클러스터링 AXIOS형 단위 이슈 5선 & 와이드 포스트잇 카드 SSOT
 *
 * 중개인 고도화 요구사항 반영:
 *  - 일간(Daily)·주간(Weekly)·월간(Monthly) 모두 단위 이슈 5건(ISSUE_CARD_COUNT = 5) 고정 구성
 *  - 중개인 개인 설정(권역 preferredRegions, 뉴스 큐레이션 분야 preferredChannels) 기반 가중치 클러스터링 및 비부동산 가십 차단
 *  - AXIOS 카드뉴스형 제목(최대 2줄 대형 헤드라인) + 해설 브리프(2줄 부제형 핵심 요약, 2문장)
 *  - 각 이슈는 적절한 파스텔 색상의 박스 배경(5톤: amber, sky, mint, lavender, peach)으로 와이드 포스트잇 메모(카드뉴스)처럼 렌더링
 *
 * 클라이언트·서버 공용 순수 모듈 (Node 전용 import 금지).
 */

import type { AxiosUnitIssue, PostItTone } from './types';
import {
  CURATED_CHANNEL_POOL,
  NEWS_CHANNEL_MAP,
  isCreRelevantArticle,
  isSpecificNewsChannelId,
  resolveNewsChannel,
  type NewsPoolItem,
  type SpecificNewsChannelId,
} from './news-channels';
import { expandRegionKeywords } from './broker-preferences';

export const ISSUE_CARD_COUNT = 5;

export const POST_IT_TONES: readonly PostItTone[] = [
  'amber',
  'sky',
  'mint',
  'lavender',
  'peach',
] as const;

export interface PostItToneMeta {
  tone: PostItTone;
  label: string;
  emoji: string;
  /** 카드 배경색 (라이트 웜 페이퍼/포스트잇 톤) */
  cardBg: string;
  /** 카드 테두리색 */
  cardBorder: string;
  /** 좌측 포인트 스트립 색 */
  accentBar: string;
  /** 상단 배지 배경/텍스트 */
  badgeBg: string;
  badgeText: string;
  /** 본문 제목/해설 텍스트 색 */
  titleColor: string;
  bodyColor: string;
  metaColor: string;
  /** 글래스모피즘 카드뉴스 배경 (루미너스 파스텔 오로라 메시 그래디언트 — WCAG AAA 시인성) */
  glassBackground: string;
  /** 글래스 카드 광학 헤어라인 테두리 색 */
  glassBorder: string;
  /** 글래스 배지 반투명 표면 색 */
  glassPillBg: string;
  /** 글래스 배지 미세 링 테두리 색 */
  glassPillBorder: string;
  /** 카드 강조 포인트 색 (번호 칩 점 · 좌측 시그니처 스트립 · 구분선 · 스와치) */
  glassAccent: string;
  /** 카드 외곽 은은한 톤 글로우 + 상단 스페큘러 림 그림자 */
  glassGlow: string;
}

/**
 * SOTA 뉴스/금융 앱(Apple News+ · Toss · Axios · Radix Step 1~3) 기준
 * 루미너스 데이라이트 파스텔 오로라 메시 그래디언트:
 *  - L* 95~98 고명도 펄-파스텔 베이스 위에 듀얼 파스텔 오브를 얹어 현대적 카드뉴스 질감 구현
 *  - 짙은 잉크(#0F172A 제목 15:1+, #1E293B 해설 12:1+)와 결합해 난시·노안 빛번짐(Halation) 없이 WCAG AAA 시인성 보장
 */
function buildGlassMesh(orbA: string, orbB: string, baseFrom: string, baseTo: string): string {
  return [
    `radial-gradient(125% 95% at 0% 0%, ${orbA} 0%, rgba(255,255,255,0) 60%)`,
    `radial-gradient(100% 90% at 100% 100%, ${orbB} 0%, rgba(255,255,255,0) 62%)`,
    `linear-gradient(145deg, ${baseFrom} 0%, ${baseTo} 100%)`,
  ].join(', ');
}

export const POST_IT_TONE_META: Readonly<Record<PostItTone, PostItToneMeta>> = {
  amber: {
    tone: 'amber',
    label: '샴페인 골드',
    emoji: '🟨',
    cardBg: '#FFFBEB',
    cardBorder: '#FDE68A',
    accentBar: '#D97706',
    badgeBg: '#FEF3C7',
    badgeText: '#78350F',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#78350F',
    glassBackground: buildGlassMesh(
      'rgba(253, 230, 138, 0.68)',
      'rgba(254, 215, 170, 0.48)',
      '#FFFDF7',
      '#FEF7E0',
    ),
    glassBorder: 'rgba(217, 119, 6, 0.26)',
    glassPillBg: 'rgba(254, 243, 199, 0.90)',
    glassPillBorder: 'rgba(217, 119, 6, 0.30)',
    glassAccent: '#D97706',
    glassGlow:
      '0 14px 30px -16px rgba(217, 119, 6, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.94)',
  },
  sky: {
    tone: 'sky',
    label: '세룰리안 스카이',
    emoji: '🟦',
    cardBg: '#F0F9FF',
    cardBorder: '#BAE6FD',
    accentBar: '#0284C7',
    badgeBg: '#E0F2FE',
    badgeText: '#0C4A6E',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#0369A1',
    glassBackground: buildGlassMesh(
      'rgba(186, 230, 253, 0.72)',
      'rgba(199, 210, 254, 0.50)',
      '#F8FCFF',
      '#EAF5FF',
    ),
    glassBorder: 'rgba(2, 132, 199, 0.26)',
    glassPillBg: 'rgba(224, 242, 254, 0.90)',
    glassPillBorder: 'rgba(2, 132, 199, 0.30)',
    glassAccent: '#0284C7',
    glassGlow:
      '0 14px 30px -16px rgba(2, 132, 199, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.94)',
  },
  mint: {
    tone: 'mint',
    label: '셀라돈 민트',
    emoji: '🟩',
    cardBg: '#ECFDF5',
    cardBorder: '#A7F3D0',
    accentBar: '#059669',
    badgeBg: '#D1FAE5',
    badgeText: '#064E3B',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#047857',
    glassBackground: buildGlassMesh(
      'rgba(167, 243, 208, 0.66)',
      'rgba(153, 246, 228, 0.46)',
      '#F7FEFB',
      '#E8FAF1',
    ),
    glassBorder: 'rgba(5, 150, 105, 0.26)',
    glassPillBg: 'rgba(209, 250, 229, 0.90)',
    glassPillBorder: 'rgba(5, 150, 105, 0.30)',
    glassAccent: '#059669',
    glassGlow:
      '0 14px 30px -16px rgba(5, 150, 105, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.94)',
  },
  lavender: {
    tone: 'lavender',
    label: '아이리스 라벤더',
    emoji: '🟪',
    cardBg: '#F5F3FF',
    cardBorder: '#DDD6FE',
    accentBar: '#7C3AED',
    badgeBg: '#EDE9FE',
    badgeText: '#2E1065',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#5B21B6',
    glassBackground: buildGlassMesh(
      'rgba(221, 214, 254, 0.72)',
      'rgba(245, 208, 254, 0.48)',
      '#FCFAFF',
      '#F2EEFF',
    ),
    glassBorder: 'rgba(124, 58, 237, 0.25)',
    glassPillBg: 'rgba(237, 233, 254, 0.90)',
    glassPillBorder: 'rgba(124, 58, 237, 0.30)',
    glassAccent: '#7C3AED',
    glassGlow:
      '0 14px 30px -16px rgba(124, 58, 237, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.94)',
  },
  peach: {
    tone: 'peach',
    label: '로즈 피치',
    emoji: '🟧',
    cardBg: '#FFF1F2',
    cardBorder: '#FECDD3',
    accentBar: '#E11D48',
    badgeBg: '#FFE4E6',
    badgeText: '#881337',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#BE123C',
    glassBackground: buildGlassMesh(
      'rgba(254, 205, 211, 0.68)',
      'rgba(254, 215, 170, 0.46)',
      '#FFF9FA',
      '#FFEDF1',
    ),
    glassBorder: 'rgba(225, 29, 72, 0.24)',
    glassPillBg: 'rgba(255, 228, 230, 0.90)',
    glassPillBorder: 'rgba(225, 29, 72, 0.28)',
    glassAccent: '#E11D48',
    glassGlow:
      '0 14px 30px -16px rgba(225, 29, 72, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.94)',
  },
};

function decodeBasicEntities(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/** 카드뉴스 포스트잇 이슈 제목 최대 글자 수 (중개인 요구 1.1: 36자 이내 · 잘림 0건) */
export const AXIOS_TITLE_MAX_CHARS = 36;
/** 카드뉴스 포스트잇 이슈 해설 최대 글자 수 (중개인 요구 1.2: 48자 이내 · 잘림 0건) */
export const AXIOS_BRIEF_MAX_CHARS = 48;

/** 서로게이트 쌍(이모지 등)을 1자로 세는 화면 기준 글자 수 */
export function charLength(text: string): number {
  return Array.from(text).length;
}

const TRAILING_PUNCT_RE = /[\s,，·:：…\-–—|;]+$/;

/* ── 한국어 어절 판별기 (제목·해설 공용) ─────────────────────────────── */

/** 단독으로 끝나면 문장이 매달리는 접속·후치·부정·의존명사 어절 */
const DANGLING_STANDALONE_RE =
  /^(?:및|또|또한|그리고|그러나|하지만|등|등의|통해|위해|대해|따라|관련|중심|가운데|vs|VS|대비|위한|따른|대한|인한|통한|관한|향한|안|못|수|순|건|걸|바|셈|듯|채|뿐|체|측|시|간|별)$/;
/** 관형형·연결형·보조용언 선행형(축약형 '~해선/~돼선/~보단/~치곤/~할순' 포함)으로 끝나 뒤 어절이 필요한 어미 */
const DANGLING_MODIFIER_SUFFIX_RE =
  /(?:따른|위한|대한|인한|통한|관한|향한|앞둔|맞은|하는|되는|있는|없는|이는|라는|이라는|하던|되던|에서의|으로의|와의|과의|하고|하며|하면서|되며|되고|되면서|이며|이고|이자|돼|면서|지만|는데|해선|돼선|해서는|돼서는|와선|가선|봐선|서선|에선|로선|으로선|만으론|만으로는|에겐|한테선|보단|치곤|라곤|하긴|되긴|있긴|없긴|할순|될순|볼순|갈순|하면|되면|오면|가면|보면|크면|높으면|낮으면|해야|돼야|해봐야|하다간|했다간|않아|않고|않은|않는|못해|못한|못할|말고|말아야|없이|아닌|같은)$/;
/** 관형형 1음절 어미 (명사 예외는 별도 처리) */
const DANGLING_ADNOMINAL_RE = /(?:한|된|할|될|던|의)$/;
const ADNOMINAL_NOUN_EXCEPTION_RE =
  /(?:제한|기한|권한|상한|하한|무한|유한|역할|합의|협의|회의|논의|동의|건의|심의|문의|강의|주의|정의|의의|창의|호의|편의|유의|대의|민의|전환|교환|순환|반환|상환|소환)$/;
/** 매달린 조사 (어절 끝) */
const DANGLING_PARTICLE_RE =
  /(?:을|를|은|는|에|에서|으로|에게|부터|까지|조차|마저|와|과|로|보다|처럼|만큼|이나|라도|만은|에는|에서는|으로는|로의)$/;
/** 주격 조사 이/가 — 받침 규칙으로만 판별 (물가·주가·길이 등 명사 예외) */
function endsWithSubjectParticle(core: string): boolean {
  const chars = Array.from(core);
  if (chars.length < 2) return false;
  const tail = chars[chars.length - 1];
  const prev = chars[chars.length - 2];
  if (tail === '이') return hasBatchim(prev) && !/(?:길이|높이|깊이|넓이|놀이|먹이|차이|추이|전이)$/.test(core);
  if (tail === '가') {
    return (
      !hasBatchim(prev) &&
      !/^(?:유가|요가|주가|시가|지가|호가|대가|고가|저가|매가|추가|감가|부가|차가|소가|평가|단가|원가|상가|허가|인가|국가|여가|증가)$/.test(core) &&
      !/(?:투자가|애호가|전문가|자산가|건축가|사업가)$/.test(core)
    );
  }
  return false;
}
const PARTICLE_NOUN_EXCEPTION_RE =
  /(?:가을|마을|노을|고을|효과|결과|성과|사과|과정|도로|경로|통로|진로|선로|항로|노로|기와|규모|수요|공급|창구)$/;

function hasBatchim(syllable: string): boolean {
  const code = syllable.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function stripWordPunct(word: string): string {
  return word.replace(/^[\s'"‘’“”「」『』(（[\]]+|[\s'"‘’“”「」『』)）\]]+$/g, '').replace(TRAILING_PUNCT_RE, '');
}

/** 마지막 어절이 문장을 매달리게 만드는 수식·접속·보조용언·조사 어절인지 판별 */
export function isDanglingKoreanWord(word: string): boolean {
  const core = stripWordPunct(word);
  if (!core) return true;
  if (DANGLING_STANDALONE_RE.test(core)) return true;
  if (charLength(core) >= 2 && DANGLING_MODIFIER_SUFFIX_RE.test(core)) return true;
  if (
    charLength(core) >= 2 &&
    DANGLING_ADNOMINAL_RE.test(core) &&
    !ADNOMINAL_NOUN_EXCEPTION_RE.test(core)
  ) {
    return true;
  }
  if (
    charLength(core) >= 2 &&
    DANGLING_PARTICLE_RE.test(core) &&
    !PARTICLE_NOUN_EXCEPTION_RE.test(core)
  ) {
    return true;
  }
  if (endsWithSubjectParticle(core)) return true;
  return false;
}

/** 홀수 개로 남은 따옴표를 제거해 시각적 미완결(열린 따옴표)을 방지 */
function balanceQuotes(text: string): string {
  let out = text;
  for (const q of ["'", '"']) {
    const count = out.split(q).length - 1;
    if (count % 2 === 1) out = out.split(q).join('');
  }
  const pairs: Array<[string, string]> = [['‘', '’'], ['“', '”'], ['(', ')'], ['「', '」']];
  for (const [open, close] of pairs) {
    const o = out.split(open).length - 1;
    const c = out.split(close).length - 1;
    if (o !== c) out = out.split(open).join('').split(close).join('');
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** 제목 끝에 매달린 조사·관형형·보조용언·접속 어절을 완결될 때까지 정리한다 */
function tidyTitleTail(text: string, minChars = 8): string {
  let words = balanceQuotes(text.replace(TRAILING_PUNCT_RE, '')).split(' ').filter(Boolean);
  for (let i = 0; i < 6 && words.length > 1; i++) {
    const last = words[words.length - 1];
    const core = stripWordPunct(last);
    // 인용 관형형 '~다는/~라는' → 종결형 '~다/~라' (예: 수천만원을 가른다는 → 가른다)
    if (/[가-힣]다는$/.test(core)) {
      words[words.length - 1] = core.replace(/는$/, '');
      break;
    }
    // 부정·당위 보조용언이 잘려 '~해선/~해서는/~돼선/~하면'만 남은 경우: 명사 어간이면 '~금물/주의'로 완결 복원
    const negStemMatch = core.match(/^([가-힣]{2,})(?:해선|해서는|돼선|돼서는)$/);
    if (negStemMatch) {
      const candidate = [...words.slice(0, -1), `${negStemMatch[1]} 주의`].join(' ');
      if (charLength(candidate) >= minChars) {
        words = [...words.slice(0, -1), `${negStemMatch[1]} 주의`];
        break;
      }
    }
    // 주격 조사로 끝나면 어절은 살리고 조사만 제거 (예: 영수증이 → 영수증)
    if (endsWithSubjectParticle(core)) {
      words[words.length - 1] = Array.from(core).slice(0, -1).join('');
      break;
    }
    if (!isDanglingKoreanWord(last)) break;
    const next = words.slice(0, -1);
    if (charLength(next.join(' ')) < minChars) {
      // 더 이상 어절을 뺄 수 없을 때는 마지막 명사에 붙은 격조사만 벗겨 명사구로 마감
      const strippedLast = stripTrailingParticle(last);
      if (strippedLast !== last && !isDanglingKoreanWord(strippedLast)) {
        words[words.length - 1] = strippedLast;
      }
      break;
    }
    words = next;
  }
  return balanceQuotes(words.join(' ').replace(TRAILING_PUNCT_RE, ''));
}

/**
 * 장문 한국어 문장형 헤드라인을 의미 손실 없이 신문 편집장 스타일로 다이어트한다.
 * - 예: "일부 '공간'의 호황을 건물 전체의 임대수입으로 계산해서는 안 된다" (37자)
 *   → "일부 공간 호황을 건물 전체 임대수입으로 계산해선 안 된다" (32자, 100% 완결 문장 보존!)
 * - 여전히 길 경우 문미 서술 관용구('~해선 안 된다' → '~금물', '~해야 한다' → '~필수')를 완결 압축한다.
 */
function dietHeadlineProse(text: string, maxChars: number): string {
  let out = text
    // 1~6자 명사를 감싼 장식용 작은따옴표 제거 ('공간'의 → 공간의)
    .replace(/['‘’]([가-힣A-Za-z0-9·]{1,6})['‘’]/g, '$1')
    // 축약 가능한 보조용언·연결구 정리
    .replace(/해서는\s*안\s*된다/g, '해선 안 된다')
    .replace(/돼서는\s*안\s*된다/g, '돼선 안 된다')
    .replace(/\s*(?:에\s+따른|에\s+대한|로\s+인한)\s+/g, ' ')
    // 문미 인용 보도 투('~다는 전문가 조언/분석/지적')를 완결 평서형('~다')으로 직결
    .replace(/([가-힣])다는\s+(?:세무\s*|부동산\s*|시장\s*)?(?:전문가\s*)?(?:조언|분석|전망|지적|경고|보도|평가)(?:이\s*나왔다)?$/g, '$1다')
    .replace(/\s+/g, ' ')
    .trim();

  if (charLength(out) <= maxChars) return out;

  // 명사 사이 관형격 조사 '의' 다이어트 (단, '주의/논의/합의' 등 한자어 명사는 보존)
  out = out
    .replace(/([가-힣]{2,})의\s+(?=[가-힣])/g, (full, stem: string) =>
      ADNOMINAL_NOUN_EXCEPTION_RE.test(`${stem}의`) ? full : `${stem} `,
    )
    .replace(/\s+/g, ' ')
    .trim();

  if (charLength(out) <= maxChars) return out;

  // 문미 복합 부정·당위 서술어를 완결 명사형 헤드라인 술어로 압축 (절단 시 의미 반전 원천 차단!)
  out = out
    .replace(/([가-힣]{2,})으?로\s+([가-힣]{2,})(?:해선|해서는|하면)\s*안\s*(?:된다|돼|됩니다|됨)(?:고\s*[가-힣]+)?$/, '$1 $2 금물')
    .replace(/([가-힣]{2,})(?:해선|해서는|하면)\s*안\s*(?:된다|돼|됩니다|됨)(?:고\s*[가-힣]+)?$/, '$1 금물')
    .replace(/([가-힣]{2,})(?:해야|돼야)\s*(?:한다|합니다)$/, '$1 필수')
    .replace(/([가-힣]{2,})할\s*수\s*없다$/, '$1 불가')
    .replace(/\s+/g, ' ')
    .trim();

  return out;
}

/**
 * 한국어 헤드라인을 글자 수 예산 이내로 "자르지 않고" 압축한다.
 * 1) 괄호 보조설명 제거 → 2) '및/그리고' 가운뎃점 축약 → 3) 조사·따옴표·문미 서술구 다이어트
 * → 4) 쉼표·대시 완결 절 조합 → 5) 어절 경계 누적 + 매달린 어절 제거. 말줄임표(…)는 절대 붙이지 않는다.
 */
function compressKoreanTitle(input: string, maxChars: number): string {
  let s = input.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (charLength(s) <= maxChars) return tidyTitleTail(s, Math.min(8, charLength(s)));

  const noParen = s
    .replace(/\s*[(（][^)）]*[)）]\s*/g, ' ')
    .replace(/\s*[[【][^\]】]*[\]】]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (noParen) s = noParen;
  if (charLength(s) <= maxChars) return tidyTitleTail(s);

  const compact = s
    .replace(/\s+(?:및|그리고)\s+/g, '·')
    .replace(/\s*(?:본격적으로|사실상|이른바|일제히)\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact) s = compact;
  if (charLength(s) <= maxChars) return tidyTitleTail(s);

  const dieted = dietHeadlineProse(s, maxChars);
  if (dieted) s = dieted;
  if (charLength(s) <= maxChars) return tidyTitleTail(s);

  const clauses = s.split(/\s*(?:,|，|—|–|\s-\s|:|：|\||;)\s*/).filter(Boolean);
  if (clauses.length > 1) {
    let acc = '';
    for (const clause of clauses) {
      const next = acc ? `${acc}, ${clause}` : clause;
      if (charLength(next) <= maxChars) acc = next;
      else break;
    }
    const tidiedAcc = acc ? tidyTitleTail(acc) : '';
    if (
      tidiedAcc &&
      charLength(tidiedAcc) >= Math.min(14, Math.floor(maxChars * 0.45)) &&
      !isDanglingKoreanWord(tidiedAcc.split(' ').pop() ?? '')
    ) {
      return tidiedAcc;
    }
  }

  const words = s.split(' ');
  const kept: string[] = [];
  for (const w of words) {
    const cand = [...kept, w].join(' ');
    if (charLength(cand) <= maxChars) kept.push(w);
    else break;
  }
  if (kept.length === 0) {
    return Array.from(s).slice(0, maxChars).join('').replace(TRAILING_PUNCT_RE, '');
  }
  return tidyTitleTail(kept.join(' '));
}

/** 문자열 전체를 감싼 따옴표 한 쌍만 제거한다 ("공실" 증가 처럼 내부 인용은 보존) */
function stripWrappingQuotes(text: string): string {
  const pairs: Array<[string, string]> = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];
  for (const [open, close] of pairs) {
    if (text.length >= 2 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return text;
}

/**
 * 뉴스레터 표지 제목 등을 깔끔한 1줄(single-line)로 정제한다.
 * - 앞쪽 `[매체명]` 제거, 줄바꿈 제거, 불필요한 따옴표·말줄임 정리 (말줄임표 `…`/`...` 절대 미부착)
 * - 글자 수 초과 시 어절 경계 압축 + 매달린 조사·관형형 제거로 완결된 명사구 유지
 */
export function formatSingleLineTitle(raw: unknown, maxChars = 38): string {
  if (typeof raw !== 'string') return '';
  const cleaned = decodeBasicEntities(raw)
    .replace(/[\r\n]+/g, ' ')
    .replace(/…|\.{2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/[.。,·:：-]+$/, '')
    .trim();

  if (!cleaned) return '';
  return compressKoreanTitle(stripWrappingQuotes(cleaned), maxChars);
}

/**
 * 카드뉴스형 포스트잇 이슈 제목 정제기 (기본 36자 = AXIOS_TITLE_MAX_CHARS)
 * - 고객 화면에서 한 단계 작아진 폰트로 2줄 안에 잘림 없이 읽히도록 36자 예산을 강제한다.
 */
export function formatAxiosCardTitle(raw: unknown, maxChars = AXIOS_TITLE_MAX_CHARS): string {
  return formatSingleLineTitle(raw, Math.min(maxChars, AXIOS_TITLE_MAX_CHARS));
}

/**
 * 텍스트를 문장 단위로 분리한다.
 */
export function splitKoreanSentences(text: string): string[] {
  const normalized = decodeBasicEntities(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/…|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const rawParts = normalized
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return rawParts.map((s) => (/[.!?。]$/.test(s) ? s : `${s}.`));
}

/* ── 해설(Deck) 완결 서술어 엔진 ─────────────────────────────────────── */

const COMPLETE_ENDING_RE = /(?:다|요|세요|십시오|죠)$/;
const CONNECTIVE_WORD_RE = /(?:면서|으며|며|고|지만|는데|어서|아서|해서|돼서|여서|므로|으므로|니까|으니)$/;

const TELEGRAPHIC_HADA_ROOT_RE =
  /(?:필요|중요|유리|불리|가능|불가|뚜렷|분명|긴밀|민감|취약|유효|부족|충분|유사|상이|동일|저렴|과도|불안|견고|꾸준|활발|저조|부진|양호|우수|탁월|심각|시급|절실|불가피|바람직|적절|적합|유망|위험|안전|편리|불편|복잡|단순|명확|불투명|급증|급감|상승|하락|증가|감소|발생|지속|유지|선호|주목|집중|기록|전망|예상|분석|지적|강조|권고|당부|요구|시사|의미|좌우|결정|견인)$/;

/** 개조식 명사형 종결('~있음', '~안 됨', '~해야 함' 등)을 완결된 한국어 평서문('~습니다/~다')으로 변환한다 */
function normalizeTelegraphicEnding(clause: string, maxBodyChars?: number): string | null {
  const choose = (polite: string, plain: string): string => {
    if (maxBodyChars !== undefined && charLength(polite) > maxBodyChars && charLength(plain) <= maxBodyChars) {
      return plain;
    }
    return polite;
  };

  if (/있음$/.test(clause)) {
    return choose(clause.replace(/있음$/, '있습니다'), clause.replace(/있음$/, '있다'));
  }
  if (/없음$/.test(clause)) {
    return choose(clause.replace(/없음$/, '없습니다'), clause.replace(/없음$/, '없다'));
  }
  if (/않음$/.test(clause)) {
    return choose(clause.replace(/않음$/, '않습니다'), clause.replace(/않음$/, '않다'));
  }
  if (/못함$/.test(clause)) {
    return choose(clause.replace(/못함$/, '못합니다'), clause.replace(/못함$/, '못한다'));
  }
  if (/됨$/.test(clause)) {
    return choose(clause.replace(/됨$/, '됩니다'), clause.replace(/됨$/, '된다'));
  }
  if (/많음$/.test(clause)) {
    return choose(clause.replace(/많음$/, '많습니다'), clause.replace(/많음$/, '많다'));
  }
  if (/적음$/.test(clause)) {
    return choose(clause.replace(/적음$/, '적습니다'), clause.replace(/적음$/, '적다'));
  }
  if (/높음$/.test(clause)) {
    return choose(clause.replace(/높음$/, '높습니다'), clause.replace(/높음$/, '높다'));
  }
  if (/낮음$/.test(clause)) {
    return choose(clause.replace(/낮음$/, '낮습니다'), clause.replace(/낮음$/, '낮다'));
  }
  if (/같음$/.test(clause)) {
    return choose(clause.replace(/같음$/, '같습니다'), clause.replace(/같음$/, '같다'));
  }
  if (/(?:[가-힣]\s+|가능성이|영향이|변동성이|위험이|부담이|비중이|격차가|차이가)큼$/.test(clause)) {
    return choose(clause.replace(/큼$/, '큽니다'), clause.replace(/큼$/, '크다'));
  }
  if (/(?:야|아야|어야|해야|돼야|봐서야)\s*함$/.test(clause)) {
    return choose(clause.replace(/함$/, '합니다'), clause.replace(/함$/, '한다'));
  }
  const hadaMatch = clause.match(/^(.*)함$/);
  if (hadaMatch && TELEGRAPHIC_HADA_ROOT_RE.test(hadaMatch[1])) {
    return choose(`${hadaMatch[1]}합니다`, `${hadaMatch[1]}한다`);
  }
  const imMatch = clause.match(/^(.*(?:중|뿐|셈|터|바|것|수준|시점|상황|전망|예정|계획|추세|흐름|요인|원인|결과|특징|핵심|필수|유리|불리|가능|불가))임$/);
  if (imMatch) {
    return choose(`${imMatch[1]}입니다`, `${imMatch[1]}이다`);
  }
  if (/(?:보임|돋보임|선보임)$/.test(clause)) {
    return choose(clause.replace(/임$/, '입니다'), clause.replace(/임$/, '인다'));
  }
  if (/늘어남$/.test(clause)) {
    return choose(clause.replace(/남$/, '납니다'), clause.replace(/남$/, '난다'));
  }
  if (/줄어듦$/.test(clause)) {
    return choose(clause.replace(/듦$/, '듭니다'), clause.replace(/듦$/, '든다'));
  }
  return null;
}

/** 연결어미·미완결 보조용언('…하며/…되면서/…해선 안/…할 수')을 완결 종결형('…합니다/…됩니다/…있습니다')으로 바꾼다 */
function convertConnectiveToFinal(clause: string, maxBodyChars?: number): string | null {
  const tele = normalizeTelegraphicEnding(clause, maxBodyChars);
  if (tele && charLength(tele) >= 6) return tele;

  const rules: Array<[RegExp, string, string]> = [
    [/^(.*[가-힣])(?:해선|해서는|하면)\s*안(?:\s*되[가-힣]*)?$/, '$1하면 안 됩니다', '$1해선 안 된다'],
    [/^(.*[가-힣])(?:돼선|돼서는|되면)\s*안(?:\s*되[가-힣]*)?$/, '$1되면 안 됩니다', '$1돼선 안 된다'],
    [/^(.*[가-힣])(?:해선|해서는)$/, '$1하면 안 됩니다', '$1해선 안 된다'],
    [/^(.*[가-힣])(?:돼선|돼서는)$/, '$1되면 안 됩니다', '$1돼선 안 된다'],
    [/^(.*[가-힣])\s*할\s*수$/, '$1 가능합니다', '$1 가능하다'],
    [/^(.*[가-힣])해야$/, '$1해야 합니다', '$1해야 한다'],
    [/^(.*[가-힣])돼야$/, '$1돼야 합니다', '$1돼야 한다'],
    [/^(.*)있(?:으며|으면서|고|지만|는데|어서|어|으므로|으니까|으니)$/, '$1있습니다', '$1있다'],
    [/^(.*)없(?:으며|으면서|고|지만|는데|어서|어|으므로|으니까|으니)$/, '$1없습니다', '$1없다'],
    [/^(.*)(?:하|해)(?:면서|며|고|지만|는데|서|여서|여|므로|니까|니)$/, '$1합니다', '$1한다'],
    [/^(.*)(?:되|돼)(?:면서|며|고|지만|는데|서|어서|어|므로|니까|니)$/, '$1됩니다', '$1된다'],
    [/^(.*[가-힣])지(?:면서|며|고|지만|는데)$/, '$1집니다', '$1진다'],
    [/^(.*[가-힣])이(?:며|고|지만|는데)$/, '$1입니다', '$1이다'],
  ];
  for (const [re, politeRep, plainRep] of rules) {
    if (re.test(clause)) {
      const politeOut = clause.replace(re, politeRep).replace(/\s+/g, ' ').trim();
      const plainOut = clause.replace(re, plainRep).replace(/\s+/g, ' ').trim();
      const chosen =
        maxBodyChars !== undefined && charLength(politeOut) > maxBodyChars && charLength(plainOut) <= maxBodyChars
          ? plainOut
          : politeOut;
      return charLength(chosen) >= 6 ? chosen : null;
    }
  }
  return null;
}

const HADA_VERBAL_NOUN_RE =
  /(?:증가|감소|상승|하락|급증|급감|반등|주목|검토|필요|중요|유리|불리|가능|확인|선호|집중|유지|지속|기대|전망|예상|우세|부상|등장|성장|주도|견인|점검|제안|추천)$/;
const DOEDA_VERBAL_NOUN_RE =
  /(?:확대|축소|강화|완화|개선|악화|회복|유입|확산|둔화|재편|부각|본격화|가속화|활성화|정상화|양극화|차별화|다변화|구체화|시행|도입|적용|마련|추진|형성|조정|인하|인상|동결)$/;

/** 어절 끝 조사를 받침 규칙에 맞춰 안전하게 제거 (예: 수요가→수요, 공실이→공실, 금리를→금리) */
function stripTrailingParticle(base: string): string {
  const words = base.split(' ');
  const last = words[words.length - 1] ?? '';
  const chars = Array.from(last);
  if (chars.length < 2) return base;

  const multi = last.match(/^(.+?)(에서|으로|에게|부터|까지|조차|마저|에서는|으로는|에는|만은|보다|처럼|만큼)$/);
  if (multi && charLength(multi[1]) >= 1) {
    words[words.length - 1] = multi[1];
    return words.join(' ');
  }

  const tail = chars[chars.length - 1];
  const prev = chars[chars.length - 2];
  const stem = chars.slice(0, -1).join('');
  let strip = false;
  if ((tail === '을' || tail === '은' || tail === '과') && hasBatchim(prev)) strip = true;
  if ((tail === '를' || tail === '는' || tail === '와') && !hasBatchim(prev)) strip = true;
  if (tail === '이' && hasBatchim(prev) && !/(?:길이|높이|깊이|넓이|놀이|먹이)$/.test(last)) strip = true;
  if (
    tail === '가' &&
    !hasBatchim(prev) &&
    !/^(?:유가|요가|주가|시가|지가|호가|대가|고가|저가|매가|추가|감가|부가|차가|소가|평가|단가|원가|상가|허가|인가|국가|여가|증가)$/.test(last) &&
    !/(?:투자가|애호가|전문가|자산가|건축가|사업가)$/.test(last)
  ) {
    strip = true;
  }
  if (tail === '에' && chars.length >= 2) strip = true;
  if (tail === '의' && !ADNOMINAL_NOUN_EXCEPTION_RE.test(last)) strip = true;
  if (tail === '로' && !hasBatchim(prev) && !PARTICLE_NOUN_EXCEPTION_RE.test(last)) strip = true;
  if (PARTICLE_NOUN_EXCEPTION_RE.test(last)) strip = false;

  if (strip && charLength(stem) >= 1) {
    words[words.length - 1] = stem;
    return words.join(' ');
  }
  return base;
}

/** 명사구·연결형·개조식으로 끝난 절을 완결된 한국어 평서문(…다.)으로 마감한다 */
function finalizeKoreanSentence(clause: string, minChars = 8, maxLen?: number): string {
  const maxBodyChars = maxLen !== undefined ? Math.max(4, maxLen - 1) : undefined;
  let base = clause
    .replace(/[,·:：….\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  base = balanceQuotes(base);
  if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;

  const converted = convertConnectiveToFinal(base, maxBodyChars);
  if (converted) return `${converted}.`;

  // 관형형·접속·보조용언 선행 어절이 매달려 있으면 최대 5개까지 걷어낸다 (조사는 아래에서 어절 내부만 제거)
  for (let i = 0; i < 5; i++) {
    const words = base.split(' ');
    if (words.length < 2) break;
    const last = stripWordPunct(words[words.length - 1]);
    const isModifierOrConj =
      DANGLING_STANDALONE_RE.test(last) ||
      DANGLING_MODIFIER_SUFFIX_RE.test(last) ||
      (DANGLING_ADNOMINAL_RE.test(last) && !/의$/.test(last) && !ADNOMINAL_NOUN_EXCEPTION_RE.test(last)) ||
      (CONNECTIVE_WORD_RE.test(last) && !convertConnectiveToFinal(last, maxBodyChars));
    if (!isModifierOrConj) break;
    const stripped = words.slice(0, -1).join(' ').replace(TRAILING_PUNCT_RE, '');
    if (charLength(stripped) < minChars) break;
    base = stripped;
    if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;
    const conv = convertConnectiveToFinal(base, maxBodyChars);
    if (conv) return `${conv}.`;
  }

  base = stripTrailingParticle(base).replace(TRAILING_PUNCT_RE, '');
  if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;
  const postTele = convertConnectiveToFinal(base, maxBodyChars);
  if (postTele) return `${postTele}.`;
  const pickSuffix = (polite: string, plain: string) => {
    const p = `${base}${polite}.`;
    if (maxLen !== undefined && charLength(p) > maxLen && charLength(`${base}${plain}.`) <= maxLen) {
      return `${base}${plain}.`;
    }
    return p;
  };
  if (/중$/.test(base)) return pickSuffix('입니다', '이다');
  if (HADA_VERBAL_NOUN_RE.test(base)) return pickSuffix('합니다', '한다');
  if (DOEDA_VERBAL_NOUN_RE.test(base)) return pickSuffix('됩니다', '된다');
  return pickSuffix('입니다', '이다');
}

/**
 * 한 문장을 글자 수 예산(기본 48자) 이내의 완결된 평서문으로 압축한다.
 * 1) 그대로 맞으면 서술어만 보정 → 2) 쉼표 절 단위 → 3) 연결어미 어절 경계에서 종결형 변환
 * → 4) 어절 경계 누적 후 서술어 보강. 말줄임표(…)는 절대 붙이지 않는다.
 */
function condenseSentence(sentence: string, maxLen = AXIOS_BRIEF_MAX_CHARS): string {
  const cleaned = sentence
    .replace(/…|\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:특히|또한|아울러|한편|이에\s*따라|이와\s*함께)\s*,?\s*/g, '')
    .trim();
  if (!cleaned) return '';
  const body = cleaned.replace(/[.!?。]+$/, '').trim();
  if (!body) return '';

  const direct = finalizeKoreanSentence(body, 8, maxLen);
  if (charLength(direct) <= maxLen) return direct;

  const commaParts = body.split(/\s*,\s*/).filter(Boolean);
  for (let n = commaParts.length - 1; n >= 1; n--) {
    const head = commaParts.slice(0, n).join(', ');
    if (charLength(head) < 10) continue;
    const fin = finalizeKoreanSentence(head, 8, maxLen);
    if (charLength(fin) <= maxLen) return fin;
  }

  const words = body.split(' ');
  for (let i = words.length - 1; i >= 2; i--) {
    const lastWord = stripWordPunct(words[i - 1]);
    if (!CONNECTIVE_WORD_RE.test(lastWord)) continue;
    const head = words.slice(0, i).join(' ');
    const conv = convertConnectiveToFinal(head, maxLen - 1);
    if (conv && charLength(conv) + 1 <= maxLen) return `${conv}.`;
  }

  for (let i = words.length - 1; i >= 2; i--) {
    const fin = finalizeKoreanSentence(words.slice(0, i).join(' '), 8, maxLen);
    if (fin && charLength(fin) <= maxLen) return fin;
  }

  return finalizeKoreanSentence(Array.from(body).slice(0, Math.max(10, maxLen - 6)).join(''), 4, maxLen);
}

/**
 * 여러 문장(문단 포함)을 글자 수 예산 이내로 "문장 단위"로 줄인다 (하드 슬라이스 금지).
 * - 예산 안에 들어오는 앞 문장들을 유지하고, 첫 문장조차 넘치면 condenseSentence로 완결 압축
 * - preserveParagraphs=true 이면 빈 줄(\n\n) 문단 구분을 유지
 */
export function condenseKoreanParagraph(
  text: string,
  maxLen: number,
  opts: { preserveParagraphs?: boolean } = {},
): string {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return '';
  if (charLength(source) <= maxLen) return source;

  const paragraphs = opts.preserveParagraphs
    ? source.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [source];
  const outParas: string[] = [];
  let used = 0;
  for (const para of paragraphs) {
    const kept: string[] = [];
    for (const s of splitKoreanSentences(para)) {
      const sep = kept.length > 0 ? 1 : outParas.length > 0 ? 2 : 0;
      if (used + sep + charLength(s) <= maxLen) {
        kept.push(s);
        used += sep + charLength(s);
      } else {
        break;
      }
    }
    if (kept.length === 0) break;
    outParas.push(kept.join(' '));
  }
  if (outParas.length > 0) return outParas.join('\n\n');
  const first = splitKoreanSentences(source)[0] ?? source;
  return condenseSentence(first, maxLen);
}

const INTERNAL_LABEL_RE =
  /(?:핵심\s*팩트|브로커\s*임플리케이션|추천\s*액션|시장\s*시사점|매수자\s*포인트|Why\s*it\s*matters)\s*[:：]\s*/gi;

const CONCISE_CHANNEL_FALLBACKS: Readonly<Record<SpecificNewsChannelId, readonly [string, string]>> = {
  real_estate: [
    '역세권 우량 빌딩을 중심으로 법인과 자산가의 선별 매수세가 이어집니다.',
    '표면 수익률과 함께 대지 지분·리모델링 여력을 함께 점검할 시점입니다.',
  ],
  economy_finance: [
    '기업대출 금리와 통화정책이 빌딩 매수자의 자기자본수익률을 좌우합니다.',
    '조달 금리 스프레드를 사전 점검하면 협상력과 현금흐름이 개선됩니다.',
  ],
  tax_wealth: [
    '빌딩의 취득·보유·증여 세무 구조에 따라 세후 수익률 격차가 벌어집니다.',
    '사전 감정평가와 부담부증여·법인 활용 유불리를 미리 점검해야 합니다.',
  ],
  culture_lifestyle: [
    '외관 리노베이션과 문화 콘텐츠 결합이 임차인 집객력과 가치를 높입니다.',
    '우량 임차인 유치를 위해 저층 공간 기획을 차별화하는 사례가 늘었습니다.',
  ],
  commercial_trend: [
    '핵심 상권의 메디컬·대형 카페 유입이 중소형 빌딩 임대료를 견인합니다.',
    '공실 위험을 낮추려면 층별 업종 구성과 소비 트렌드를 살펴야 합니다.',
  ],
};

/**
 * AXIOS 카드뉴스형 짧은 부제(Deck) 포맷터 — 기본 48자(AXIOS_BRIEF_MAX_CHARS) 이내
 * - 원문 요약(파이프 `|` 구분 구조 포함)에서 핵심 1문장을 완결된 평서문으로 압축하고,
 *   예산이 남을 때만 두 번째 문장을 덧붙인다 (총합 48자 이내 · 잘림 0건 · 말줄임표 0건).
 * - 내부 라벨(`핵심 팩트:`, `브로커 임플리케이션:`, `추천 액션:`) 및 파이프(`|`) 노출 100% 제거
 */
export function formatAxiosTwoLineBrief(
  rawSummary: unknown,
  opts: {
    secondarySummary?: string;
    title?: string;
    channel?: SpecificNewsChannelId;
    maxTotalChars?: number;
  } = {},
): string {
  const maxTotalChars = Math.min(opts.maxTotalChars ?? AXIOS_BRIEF_MAX_CHARS, AXIOS_BRIEF_MAX_CHARS);
  const raw = typeof rawSummary === 'string' ? decodeBasicEntities(rawSummary).trim() : '';
  const normalizeRepeatKey = (t: string) =>
    t
      .replace(/\s+/g, '')
      .replace(/['"‘’“”.,!?·:：\-–—]/g, '')
      .replace(/(?:입니다|합니다|됩니다|있습니다|없습니다|이다|한다|된다|있다|없다)$/, '');
  const titleKey = normalizeRepeatKey(opts.title ?? '');
  const sentences: string[] = [];

  const pushCondensed = (s: string) => {
    const condensed = condenseSentence(s, maxTotalChars);
    if (!condensed) return;
    const key = condensed.replace(/\s+/g, '');
    // 제목을 그대로 반복하거나 '제목 + 입니다.'로만 바꾼 해설은 정보 가치가 없으므로 건너뛴다
    if (titleKey && normalizeRepeatKey(condensed) === titleKey) return;
    if (!sentences.some((x) => x.replace(/\s+/g, '') === key)) sentences.push(condensed);
  };

  const segments = raw
    ? raw
        .split('|')
        .map((seg) => seg.replace(INTERNAL_LABEL_RE, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    : [];
  for (const seg of segments) {
    for (const s of splitKoreanSentences(seg)) {
      if (sentences.length >= 3) break;
      pushCondensed(s);
    }
  }

  if (opts.secondarySummary && sentences.length < 2) {
    const secRaw = decodeBasicEntities(opts.secondarySummary)
      .split('|')[0]
      ?.replace(INTERNAL_LABEL_RE, '')
      .trim();
    const first = secRaw ? splitKoreanSentences(secRaw)[0] : undefined;
    if (first) pushCondensed(first);
  }

  if (sentences.length === 0) {
    const channelKey = opts.channel ?? 'real_estate';
    const extras = CONCISE_CHANNEL_FALLBACKS[channelKey] ?? CONCISE_CHANNEL_FALLBACKS.real_estate;
    for (const ex of extras) pushCondensed(ex);
  }

  let joined = sentences[0] ?? '';
  for (const next of sentences.slice(1)) {
    const candidate = `${joined} ${next}`;
    if (charLength(candidate) <= maxTotalChars) joined = candidate;
    else break;
  }
  return joined;
}

/**
 * 하위호환 및 AXIOS 브리프 표준 함수 (48자 이내 짧은 부제형 요약 반환)
 */
export function formatAxiosBrief(
  rawSummary: unknown,
  opts: {
    secondarySummary?: string;
    title?: string;
    channel?: SpecificNewsChannelId;
  } = {},
): string {
  return formatAxiosTwoLineBrief(rawSummary, opts);
}

/**
 * 단위 이슈 1건의 제목(36자)·해설(48자) 카피 예산을 강제하는 단일 정규화 진입점
 * (AI 생성 결과 · 중개사 수동 편집 · 저장 · 고객 뷰어 렌더링 공용)
 */
export function normalizeAxiosIssueCopy(input: {
  title: unknown;
  brief: unknown;
  channel?: SpecificNewsChannelId;
}): { title: string; brief: string } {
  const title = formatAxiosCardTitle(input.title);
  const brief = formatAxiosTwoLineBrief(input.brief, { title, channel: input.channel });
  return { title, brief };
}

export interface ClusterIssuesOptions {
  cadence?: 'daily' | 'weekly' | 'monthly' | 'special';
  preferredIds?: readonly string[];
  preferredRegions?: readonly string[];
  preferredChannels?: readonly SpecificNewsChannelId[];
  dealKeywords?: readonly string[];
}

/**
 * 다수의 뉴스 기사 후보를 중개인 설정(권역·관심 채널·보유 매물 키워드) 기반으로 가중치 클러스터링하여
 * 정확히 5건(ISSUE_CARD_COUNT = 5)의 AXIOS형 카드뉴스 포스트잇 단위 이슈로 재구성한다.
 */
export function clusterArticlesIntoFiveIssues(
  articles: readonly NewsPoolItem[] = [],
  opts: ClusterIssuesOptions = {},
): AxiosUnitIssue[] {
  const expandedRegions = expandRegionKeywords(opts.preferredRegions ?? []);
  const dealKeywords = (opts.dealKeywords ?? [])
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);
  const activeChannels: SpecificNewsChannelId[] =
    Array.isArray(opts.preferredChannels) && opts.preferredChannels.length > 0
      ? opts.preferredChannels.filter(isSpecificNewsChannelId)
      : [
          'real_estate',
          'economy_finance',
          'commercial_trend',
          'tax_wealth',
          'culture_lifestyle',
        ];

  const preferredChannelSet = new Set<SpecificNewsChannelId>(activeChannels);
  const preferredIdSet = new Set<string>((opts.preferredIds ?? []).map((id) => String(id).trim()));

  // 1. 입력 기사(비부동산 가십 필터링 적용) + 부족분 보충용 기본 풀 준비
  const pool: Array<{ item: NewsPoolItem; score: number; channel: SpecificNewsChannelId }> = [];
  const seenKey = new Set<string>();

  const computeScore = (
    item: NewsPoolItem,
    ch: SpecificNewsChannelId,
    isUserProvided: boolean,
  ): number => {
    const id = String(item.id ?? item.title ?? '').trim();
    const text = `${item.title ?? ''} ${item.summary ?? ''}`;
    let score = typeof item.importance_score === 'number' ? item.importance_score : 6;

    if (isUserProvided) score += 10;
    if (preferredIdSet.has(id)) score += 100;
    if (preferredChannelSet.has(ch)) score += 15;

    let regionMatches = 0;
    for (const rk of expandedRegions) {
      if (rk.length >= 2 && text.includes(rk)) {
        regionMatches += 1;
        if (regionMatches >= 4) break;
      }
    }
    score += regionMatches * 8;

    for (const dk of dealKeywords) {
      if (dk.length >= 2 && text.includes(dk)) {
        score += 8;
        break;
      }
    }

    return score;
  };

  const pushItem = (item: NewsPoolItem, isUserProvided = false) => {
    if (!isCreRelevantArticle(item)) return;
    const title = formatSingleLineTitle(item.title, 80);
    if (!title) return;
    const key = String(item.id ?? title).trim();
    const normTitle = title.replace(/\s+/g, '');
    if (seenKey.has(key) || seenKey.has(normTitle)) return;
    seenKey.add(key);
    seenKey.add(normTitle);
    const channel = resolveNewsChannel(item);
    const score = computeScore(item, channel, isUserProvided);
    pool.push({ item, score, channel });
  };

  if (preferredIdSet.size > 0) {
    const byId = new Map(articles.map((a) => [String(a.id ?? a.title).trim(), a]));
    for (const pid of preferredIdSet) {
      const found = byId.get(pid);
      if (found) pushItem(found, true);
    }
  }

  for (const a of articles) {
    pushItem(a, true);
  }
  for (const c of CURATED_CHANNEL_POOL) {
    pushItem(c, false);
  }

  // 점수 내림차순 정렬
  pool.sort((a, b) => b.score - a.score);

  // 2. 선호 채널 우선 버킷 구성
  const allChannels: SpecificNewsChannelId[] = [
    ...activeChannels,
    ...(
      [
        'real_estate',
        'economy_finance',
        'commercial_trend',
        'tax_wealth',
        'culture_lifestyle',
      ] as const
    ).filter((ch) => !preferredChannelSet.has(ch)),
  ];

  const buckets = new Map<SpecificNewsChannelId, NewsPoolItem[]>();
  for (const ch of allChannels) buckets.set(ch, []);
  for (const entry of pool) {
    const list = buckets.get(entry.channel) ?? buckets.get('real_estate')!;
    list.push(entry.item);
  }

  const totalPreferredCandidates = activeChannels.reduce(
    (acc, ch) => acc + (buckets.get(ch)?.length ?? 0),
    0,
  );

  const clusters: Array<{
    primary: NewsPoolItem;
    related: NewsPoolItem[];
    channel: SpecificNewsChannelId;
  }> = [];
  const usedIds = new Set<string>();

  // 라운드로빈으로 선호 채널에서 먼저 5개 이슈를 채운다
  let pass = 0;
  while (clusters.length < ISSUE_CARD_COUNT && pass < ISSUE_CARD_COUNT) {
    let addedInPass = false;
    for (const ch of activeChannels) {
      if (clusters.length >= ISSUE_CARD_COUNT) break;
      const list = (buckets.get(ch) ?? []).filter(
        (x) => !usedIds.has(String(x.id ?? x.title)),
      );
      if (list.length === 0) continue;

      const primary = list[0];
      usedIds.add(String(primary.id ?? primary.title));

      const related: NewsPoolItem[] = [];
      // 후보 기사가 충분할 때만 동일 토픽 보조 기사를 클러스터로 병합
      const canMergeRelated = totalPreferredCandidates - usedIds.size >= ISSUE_CARD_COUNT - clusters.length;
      if (canMergeRelated) {
        for (let i = 1; i < list.length && related.length < 2; i++) {
          const cand = list[i];
          if (cand.topic && cand.topic === primary.topic) {
            related.push(cand);
            usedIds.add(String(cand.id ?? cand.title));
          }
        }
      }

      clusters.push({ primary, related, channel: ch });
      addedInPass = true;
    }
    if (!addedInPass) break;
    pass += 1;
  }

  // 선호 채널만으로 5개가 안 채워졌을 경우 전체 풀에서 점수순 보충
  for (const entry of pool) {
    if (clusters.length >= ISSUE_CARD_COUNT) break;
    const key = String(entry.item.id ?? entry.item.title);
    if (usedIds.has(key)) continue;
    usedIds.add(key);
    clusters.push({ primary: entry.item, related: [], channel: entry.channel });
  }

  // 3. 각 클러스터를 AXIOS 카드뉴스형 2줄 헤드라인 + 2줄 부제 브리프 + 포스트잇 5톤으로 변환
  return clusters.slice(0, ISSUE_CARD_COUNT).map((cluster, idx) => {
    const { primary, related, channel } = cluster;
    const memoTone = POST_IT_TONES[idx % POST_IT_TONES.length];
    const title =
      formatAxiosCardTitle(primary.cardTitle || primary.title) ||
      `핵심 상업용 부동산 이슈 #${idx + 1}`;
    const brief = formatAxiosTwoLineBrief(primary.cardBrief || primary.summary, {
      secondarySummary: related[0]?.cardBrief || related[0]?.summary,
      title,
      channel,
    });

    const rawSources = [primary.source, ...related.map((r) => r.source)]
      .map((s) => (typeof s === 'string' ? s.trim() : ''))
      .filter(Boolean);
    const uniqueSources = Array.from(new Set(rawSources)).slice(0, 3);
    if (uniqueSources.length === 0) {
      uniqueSources.push(NEWS_CHANNEL_MAP[channel]?.shortLabel ?? '시장 브리핑');
    }

    const sentiment =
      primary.sentiment === 'bullish' || primary.sentiment === 'bearish'
        ? primary.sentiment
        : 'neutral';

    return {
      id: String(primary.id ?? `issue-${idx + 1}`),
      title,
      brief,
      memoTone,
      channel,
      topic: primary.topic || channel,
      sentiment,
      sources: uniqueSources,
      ...(typeof primary.url === 'string' && /^https?:\/\//i.test(primary.url.trim())
        ? { url: primary.url.trim() }
        : {}),
      articleCount: 1 + related.length,
    };
  });
}

/**
 * 저장된 에디션 데이터(unitIssues 또는 레거시 topNews/news_curation)에서
 * 독자 뷰어 및 에디터가 사용할 AXIOS 포스트잇 단위 이슈 목록(최대 5건)을 추출한다.
 */
export function resolveUnitIssuesFromData(
  data: Record<string, unknown>,
  opts: { max?: number; fallbackFromTopNews?: boolean } = {},
): AxiosUnitIssue[] {
  const max = opts.max ?? ISSUE_CARD_COUNT;
  const fallbackFromTopNews = opts.fallbackFromTopNews ?? true;

  if (Array.isArray(data.unitIssues) && data.unitIssues.length > 0) {
    const valid: AxiosUnitIssue[] = [];
    for (let i = 0; i < data.unitIssues.length && valid.length < max; i++) {
      const raw = data.unitIssues[i];
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const title = formatAxiosCardTitle(r.title);
      if (!title) continue;
      if (!isCreRelevantArticle({ title, summary: typeof r.brief === 'string' ? r.brief : '' })) {
        continue;
      }
      const channel = resolveNewsChannel({
        title,
        summary: typeof r.brief === 'string' ? r.brief : '',
        topic: typeof r.topic === 'string' ? r.topic : '',
        channel: typeof r.channel === 'string' ? r.channel : '',
      });
      const brief = formatAxiosTwoLineBrief(r.brief ?? r.summary, { title, channel });
      const toneRaw = typeof r.memoTone === 'string' ? r.memoTone : '';
      const memoTone: PostItTone = (POST_IT_TONES as readonly string[]).includes(toneRaw)
        ? (toneRaw as PostItTone)
        : POST_IT_TONES[valid.length % POST_IT_TONES.length];
      const sentiment =
        r.sentiment === 'bullish' || r.sentiment === 'bearish' ? r.sentiment : 'neutral';
      const sources = Array.isArray(r.sources)
        ? r.sources.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : typeof r.source === 'string' && r.source.trim()
          ? [r.source.trim()]
          : [];

      valid.push({
        id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `issue-${valid.length + 1}`,
        title,
        brief,
        memoTone,
        channel,
        topic: typeof r.topic === 'string' ? r.topic : channel,
        sentiment,
        sources,
        ...(typeof r.url === 'string' && /^https?:\/\//i.test(r.url.trim())
          ? { url: r.url.trim() }
          : {}),
        articleCount:
          typeof r.articleCount === 'number' && r.articleCount >= 1
            ? r.articleCount
            : Math.max(1, sources.length),
      });
    }
    if (valid.length > 0) return valid;
  }

  if (!fallbackFromTopNews) return [];

  const rawNews = Array.isArray(data.topNews)
    ? data.topNews
    : Array.isArray(data.news_curation)
      ? data.news_curation
      : [];
  if (rawNews.length === 0) return [];

  const out: AxiosUnitIssue[] = [];
  for (let i = 0; i < rawNews.length && out.length < max; i++) {
    const n = rawNews[i];
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    const title = formatAxiosCardTitle(r.title);
    if (!title) continue;
    if (!isCreRelevantArticle({ title, summary: typeof r.summary === 'string' ? r.summary : '' })) {
      continue;
    }
    const channel = resolveNewsChannel({
      title,
      summary: typeof r.summary === 'string' ? r.summary : '',
      topic: typeof r.topic === 'string' ? r.topic : '',
      channel: typeof r.channel === 'string' ? r.channel : '',
    });
    const brief = formatAxiosTwoLineBrief(r.summary, { title, channel });
    const memoTone = POST_IT_TONES[out.length % POST_IT_TONES.length];
    const sentiment =
      r.sentiment === 'bullish' || r.sentiment === 'bearish' ? r.sentiment : 'neutral';
    const source = typeof r.source === 'string' && r.source.trim() ? [r.source.trim()] : [];

    out.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `news-issue-${out.length + 1}`,
      title,
      brief,
      memoTone,
      channel,
      topic: typeof r.topic === 'string' ? r.topic : channel,
      sentiment,
      sources: source,
      ...(typeof r.url === 'string' && /^https?:\/\//i.test(r.url.trim())
        ? { url: r.url.trim() }
        : {}),
      articleCount: 1,
    });
  }
  return out;
}
