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
  /** 글래스모피즘 카드뉴스 배경 (다크 베이스 + 톤 메시 그래디언트) */
  glassBackground: string;
  /** 카드 강조 포인트 색 (번호 칩 점 · 구분선 · 글로우 오브) */
  glassAccent: string;
  /** 카드 외곽 은은한 톤 글로우 그림자 */
  glassGlow: string;
}

/**
 * 다크 베이스 위에 톤 컬러 오브 2개를 겹친 메시 그래디언트 (카드뉴스형 글래스모피즘 배경)
 * - 흰색 본문 텍스트 대비(WCAG AA 4.5:1 이상)를 보장하도록 베이스는 짙은 남색 계열로 고정
 */
function buildGlassMesh(orbA: string, orbB: string, baseFrom: string, baseTo: string): string {
  return [
    `radial-gradient(120% 95% at 0% 0%, ${orbA} 0%, rgba(0,0,0,0) 58%)`,
    `radial-gradient(95% 85% at 100% 100%, ${orbB} 0%, rgba(0,0,0,0) 62%)`,
    `linear-gradient(140deg, ${baseFrom} 0%, ${baseTo} 100%)`,
  ].join(', ');
}

export const POST_IT_TONE_META: Readonly<Record<PostItTone, PostItToneMeta>> = {
  amber: {
    tone: 'amber',
    label: '옐로우 포스트잇',
    emoji: '🟨',
    cardBg: '#FEF9C3',
    cardBorder: '#FDE047',
    accentBar: '#CA8A04',
    badgeBg: '#FEF08A',
    badgeText: '#854D0E',
    titleColor: '#0F172A',
    bodyColor: '#334155',
    metaColor: '#713F12',
    glassBackground: buildGlassMesh('rgba(251,191,36,0.62)', 'rgba(249,115,22,0.42)', '#2A1A06', '#0F172A'),
    glassAccent: '#FCD34D',
    glassGlow: '0 18px 40px -18px rgba(245,158,11,0.55)',
  },
  sky: {
    tone: 'sky',
    label: '스카이 포스트잇',
    emoji: '🟦',
    cardBg: '#E0F2FE',
    cardBorder: '#7DD3FC',
    accentBar: '#0284C7',
    badgeBg: '#BAE6FD',
    badgeText: '#075985',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#0369A1',
    glassBackground: buildGlassMesh('rgba(56,189,248,0.60)', 'rgba(99,102,241,0.45)', '#06213A', '#0F172A'),
    glassAccent: '#7DD3FC',
    glassGlow: '0 18px 40px -18px rgba(14,165,233,0.55)',
  },
  mint: {
    tone: 'mint',
    label: '민트 포스트잇',
    emoji: '🟩',
    cardBg: '#DCFCE7',
    cardBorder: '#86EFAC',
    accentBar: '#16A34A',
    badgeBg: '#BBF7D0',
    badgeText: '#166534',
    titleColor: '#0F172A',
    bodyColor: '#1E293B',
    metaColor: '#15803D',
    glassBackground: buildGlassMesh('rgba(52,211,153,0.58)', 'rgba(34,211,238,0.40)', '#062A22', '#0F172A'),
    glassAccent: '#6EE7B7',
    glassGlow: '0 18px 40px -18px rgba(16,185,129,0.55)',
  },
  lavender: {
    tone: 'lavender',
    label: '라벤더 포스트잇',
    emoji: '🟪',
    cardBg: '#F3E8FF',
    cardBorder: '#D8B4FE',
    accentBar: '#9333EA',
    badgeBg: '#E9D5FF',
    badgeText: '#6B21A8',
    titleColor: '#1E1B4B',
    bodyColor: '#312E81',
    metaColor: '#6B21A8',
    glassBackground: buildGlassMesh('rgba(167,139,250,0.62)', 'rgba(236,72,153,0.40)', '#1E0E3A', '#0F172A'),
    glassAccent: '#C4B5FD',
    glassGlow: '0 18px 40px -18px rgba(139,92,246,0.55)',
  },
  peach: {
    tone: 'peach',
    label: '피치 포스트잇',
    emoji: '🟧',
    cardBg: '#FFE4E6',
    cardBorder: '#FDA4AF',
    accentBar: '#E11D48',
    badgeBg: '#FECDD3',
    badgeText: '#9F1239',
    titleColor: '#0F172A',
    bodyColor: '#334155',
    metaColor: '#BE123C',
    glassBackground: buildGlassMesh('rgba(251,113,133,0.60)', 'rgba(251,146,60,0.40)', '#330B18', '#0F172A'),
    glassAccent: '#FDA4AF',
    glassGlow: '0 18px 40px -18px rgba(244,63,94,0.55)',
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

/** 단독으로 끝나면 문장이 매달리는 접속·후치 어절 */
const DANGLING_STANDALONE_RE =
  /^(?:및|또|또한|그리고|그러나|하지만|등|등의|통해|위해|대해|따라|관련|중심|가운데|vs|VS|대비|위한|따른|대한|인한|통한|관한|향한)$/;
/** 관형형·연결형으로 끝나 뒤 어절이 필요한 어미 */
const DANGLING_MODIFIER_SUFFIX_RE =
  /(?:따른|위한|대한|인한|통한|관한|향한|앞둔|맞은|하는|되는|있는|없는|이는|라는|이라는|하던|되던|에서의|으로의|와의|과의|하고|하며|하면서|되며|되고|되면서|이며|이고|이자|돼|면서|지만|는데)$/;
/** 관형형 1음절 어미 (명사 예외는 별도 처리) */
const DANGLING_ADNOMINAL_RE = /(?:한|된|할|될|던|의)$/;
const ADNOMINAL_NOUN_EXCEPTION_RE =
  /(?:제한|기한|권한|상한|하한|무한|유한|역할|합의|협의|회의|논의|동의|건의|심의|문의|강의|주의|정의|의의|창의|호의|편의|유의|대의|민의)$/;
/** 매달린 조사 (어절 끝) */
const DANGLING_PARTICLE_RE = /(?:을|를|은|는|에|에서|으로|에게|부터|까지|조차|마저|와|과|로|보다|처럼|만큼|이나|라도)$/;
/** 주격 조사 이/가 — 받침 규칙으로만 판별 (물가·주가·길이 등 명사 예외) */
function endsWithSubjectParticle(core: string): boolean {
  const chars = Array.from(core);
  if (chars.length < 2) return false;
  const tail = chars[chars.length - 1];
  const prev = chars[chars.length - 2];
  if (tail === '이') return hasBatchim(prev) && !/(?:길이|높이|깊이|넓이|놀이|먹이)$/.test(core);
  if (tail === '가') {
    return !hasBatchim(prev) && !/^(?:유가|요가|주가|시가|지가|호가|대가|고가|저가|매가|추가|감가|부가|차가|소가|평가)$/.test(core) && !/(?:투자가|애호가)$/.test(core);
  }
  return false;
}
const PARTICLE_NOUN_EXCEPTION_RE = /(?:가을|마을|노을|고을|효과|결과|성과|사과|과정|도로|경로|통로|진로|선로|항로|노로|기와)$/;

function hasBatchim(syllable: string): boolean {
  const code = syllable.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function stripWordPunct(word: string): string {
  return word.replace(/^[\s'"‘’“”「」『』(（[\]]+|[\s'"‘’“”「」『』)）\]]+$/g, '').replace(TRAILING_PUNCT_RE, '');
}

/** 마지막 어절이 문장을 매달리게 만드는 수식·접속·조사 어절인지 판별 */
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

/** 제목 끝에 매달린 조사·관형형·접속 어절을 최대 3개까지 걷어낸다 */
function tidyTitleTail(text: string, minChars = 8): string {
  let words = balanceQuotes(text.replace(TRAILING_PUNCT_RE, '')).split(' ').filter(Boolean);
  for (let i = 0; i < 3 && words.length > 1; i++) {
    const last = words[words.length - 1];
    const core = stripWordPunct(last);
    // 인용 관형형 '~다는' → 종결형 '~다' (예: 수천만원을 가른다는 → 가른다)
    if (/[가-힣]다는$/.test(core)) {
      words[words.length - 1] = core.replace(/는$/, '');
      break;
    }
    // 주격 조사로 끝나면 어절은 살리고 조사만 제거 (예: 영수증이 → 영수증)
    if (endsWithSubjectParticle(core)) {
      words[words.length - 1] = Array.from(core).slice(0, -1).join('');
      break;
    }
    if (!isDanglingKoreanWord(last)) break;
    const next = words.slice(0, -1);
    if (charLength(next.join(' ')) < minChars) break;
    words = next;
  }
  return balanceQuotes(words.join(' ').replace(TRAILING_PUNCT_RE, ''));
}

/**
 * 한국어 헤드라인을 글자 수 예산 이내로 "자르지 않고" 압축한다.
 * 1) 괄호 보조설명 제거 → 2) '및/그리고' 가운뎃점 축약 → 3) 쉼표·대시 절 단위 조합
 * → 4) 어절 경계 누적 + 매달린 어절 제거. 말줄임표(…)는 절대 붙이지 않는다.
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

  const clauses = s.split(/\s*(?:,|，|—|–|\s-\s|:|：|\||;)\s*/).filter(Boolean);
  if (clauses.length > 1) {
    let acc = '';
    for (const clause of clauses) {
      const next = acc ? `${acc}, ${clause}` : clause;
      if (charLength(next) <= maxChars) acc = next;
      else break;
    }
    if (acc && charLength(acc) >= Math.min(14, Math.floor(maxChars * 0.45))) {
      return tidyTitleTail(acc);
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

const COMPLETE_ENDING_RE = /(?:다|요|음|됨|함|임|세요|십시오|죠)$/;
const CONNECTIVE_WORD_RE = /(?:면서|으며|며|고|지만|는데|어서|아서|해서|돼서|여서|므로|으므로|니까|으니)$/;

/** 연결어미(…하며/…되면서/…있고/…지며)를 종결형(…합니다/…됩니다/…있습니다/…집니다)으로 바꾼다 */
function convertConnectiveToFinal(clause: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/^(.*)있(?:으며|으면서|고|지만|는데|어서|어|으므로|으니까|으니)$/, '$1있습니다'],
    [/^(.*)없(?:으며|으면서|고|지만|는데|어서|어|으므로|으니까|으니)$/, '$1없습니다'],
    [/^(.*)(?:하|해)(?:면서|며|고|지만|는데|서|여서|여|므로|니까|니)$/, '$1합니다'],
    [/^(.*)(?:되|돼)(?:면서|며|고|지만|는데|서|어서|어|므로|니까|니)$/, '$1됩니다'],
    [/^(.*[가-힣])지(?:면서|며|고|지만|는데)$/, '$1집니다'],
    [/^(.*[가-힣])이(?:며|고|지만|는데)$/, '$1입니다'],
  ];
  for (const [re, rep] of rules) {
    if (re.test(clause)) {
      const out = clause.replace(re, rep).trim();
      return charLength(out) >= 6 ? out : null;
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

  const multi = last.match(/^(.+?)(에서|으로|에게|부터|까지|조차|마저)$/);
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
    !/^(?:유가|요가|주가|시가|지가|호가|대가|고가|저가|매가|추가|감가|부가|차가|소가|평가)$/.test(last) &&
    !/(?:투자가|애호가)$/.test(last)
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

/** 명사구·연결형으로 끝난 절을 완결된 한국어 평서문(…다.)으로 마감한다 */
function finalizeKoreanSentence(clause: string, minChars = 8): string {
  let base = clause
    .replace(/[,·:：….\-–—]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return '';
  base = balanceQuotes(base);
  if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;

  const converted = convertConnectiveToFinal(base);
  if (converted) return `${converted}.`;

  // 관형형·접속 어절이 매달려 있으면 최대 3개까지 걷어낸다 (조사는 아래에서 어절 내부만 제거)
  for (let i = 0; i < 3; i++) {
    const words = base.split(' ');
    if (words.length < 2) break;
    const last = stripWordPunct(words[words.length - 1]);
    const isModifierOrConj =
      DANGLING_STANDALONE_RE.test(last) ||
      DANGLING_MODIFIER_SUFFIX_RE.test(last) ||
      (DANGLING_ADNOMINAL_RE.test(last) && !/의$/.test(last) && !ADNOMINAL_NOUN_EXCEPTION_RE.test(last)) ||
      (CONNECTIVE_WORD_RE.test(last) && !convertConnectiveToFinal(last));
    if (!isModifierOrConj) break;
    const stripped = words.slice(0, -1).join(' ').replace(TRAILING_PUNCT_RE, '');
    if (charLength(stripped) < minChars) break;
    base = stripped;
    if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;
    const conv = convertConnectiveToFinal(base);
    if (conv) return `${conv}.`;
  }

  base = stripTrailingParticle(base).replace(TRAILING_PUNCT_RE, '');
  if (COMPLETE_ENDING_RE.test(base)) return `${base}.`;
  if (/중$/.test(base)) return `${base}입니다.`;
  if (HADA_VERBAL_NOUN_RE.test(base)) return `${base}합니다.`;
  if (DOEDA_VERBAL_NOUN_RE.test(base)) return `${base}됩니다.`;
  return `${base}입니다.`;
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

  const direct = finalizeKoreanSentence(body);
  if (charLength(direct) <= maxLen) return direct;

  const commaParts = body.split(/\s*,\s*/).filter(Boolean);
  for (let n = commaParts.length - 1; n >= 1; n--) {
    const head = commaParts.slice(0, n).join(', ');
    if (charLength(head) < 10) continue;
    const fin = finalizeKoreanSentence(head);
    if (charLength(fin) <= maxLen) return fin;
  }

  const words = body.split(' ');
  for (let i = words.length - 1; i >= 2; i--) {
    const lastWord = stripWordPunct(words[i - 1]);
    if (!CONNECTIVE_WORD_RE.test(lastWord)) continue;
    const head = words.slice(0, i).join(' ');
    const conv = convertConnectiveToFinal(head);
    if (conv && charLength(conv) + 1 <= maxLen) return `${conv}.`;
  }

  for (let i = words.length - 1; i >= 2; i--) {
    const fin = finalizeKoreanSentence(words.slice(0, i).join(' '));
    if (fin && charLength(fin) <= maxLen) return fin;
  }

  return finalizeKoreanSentence(Array.from(body).slice(0, Math.max(10, maxLen - 6)).join(''), 4);
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
  const titleKey = (opts.title ?? '').replace(/\s+/g, '');
  const sentences: string[] = [];

  const pushCondensed = (s: string) => {
    const condensed = condenseSentence(s, maxTotalChars);
    if (!condensed) return;
    const key = condensed.replace(/\s+/g, '');
    // 제목을 그대로 반복하는 해설은 정보 가치가 없으므로 건너뛴다
    if (titleKey && key.replace(/[.]$/, '') === titleKey) return;
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
