/**
 * @file src/lib/deal-card/copy-limits.ts
 * @description 딜카드 문구(한 줄 제목 · 장점 3줄) 18자 SSOT + 결정적(deterministic) 교정기.
 *
 * - 고객 화면(/dc/[id]) · 편집기 미리보기 · OG · 저장 API 가 모두 이 모듈 하나만 사용한다.
 * - 글자 수는 `Array.from(text.trim()).length` (코드포인트 기준) 로 센다.
 * - 18자를 넘거나 조사·관형어로 끝나는(…이/…가/…한/…및) 문구를 **어절 경계에서** 완결된
 *   체언형 문구로 교정한다. 절대 단어 중간에서 자르지 않고 말줄임표(…)를 붙이지 않는다.
 * - Pure: I/O · Node 의존성 없음 (서버/클라이언트 공용).
 */

export const DEAL_CARD_LINE_MAX = 18;

/** 코드포인트 기준 글자 수 (앞뒤 공백 제외). */
export function countDealCardChars(text: string | null | undefined): number {
  return Array.from(String(text ?? '').trim()).length;
}

const ELLIPSIS_RE = /…|⋯|‥|\.{2,}/g;

/** 조사처럼 보이는 글자로 끝나지만 실제로는 완결 명사인 어휘 (상가·임차인·대로 등). */
const NOUN_ENDING_WHITELIST: readonly string[] = [
  '상가', '호가', '시가', '평가', '단가', '대가', '지가', '주가', '원가', '증가', '추가', '부가', '휴가',
  '매매가', '분양가', '감정가', '낙찰가', '전세가', '임대가', '공시가', '거래가',
  '번화가', '학원가', '대학가', '주택가', '상권가',
  '임차인', '매수인', '매도인', '법인', '개인', '디자인', '확인', '주인', '거래인', '중개인',
  '직장인', '유동인', '승인', '할인', '요인',
  '대로', '도로', '차로', '통로', '경로', '진로', '선로', '수로', '교차로',
  '양화로', '논현로', '학동로', '언주로', '선릉로', '역삼로', '청담로', '뚝섬로', '독막로', '동교로', '홍익로', '신촌로', '통일로', '율곡로', '대학로', '보광로', '경인로', '가락로', '오금로', '을지로', '퇴계로', '종로', '성수로',
  '효과', '결과', '성과', '학과', '외과', '치과',
  '내과', '안과', '피부과', '소아과', '이비인후과', '정신과', '산부인과', '가정의학과', '재활의학과',
  '회의', '합의', '논의', '주의',
  '높이', '길이', '차이', '깊이', '넓이',
  '최소한', '최대한', '무제한', '유한', '기한', '상한', '하한', '권한',
  '창고', '광고', '최고', '재고', '층고', '신고', '보고',
  '동의', '정의',
];

/** 단독으로 끝에 남으면 수식 대상이 잘린 관형어/접속어 → 토큰째 삭제. */
const DROP_TAIL_TOKENS = new Set([
  '및', '또는', '그리고', '있는', '없는', '위한', '통한', '따른', '대한', '관한', '의한', '인한',
  '하는', '되는', '같은', '좋은', '높은', '넓은', '많은', '뛰어난', '가까운',
  '약', '연', '월', '총', '도보', '최대', '최소', '잘', '매우',
]);

const MULTI_CHAR_PARTICLES = ['에서', '으로', '에게', '부터', '까지', '처럼', '보다', '이며', '이고'];
const SINGLE_CHAR_PARTICLES = new Set(['이', '가', '은', '는', '을', '를', '의', '에', '로', '와', '과', '한', '된', '할', '던', '고', '며', '인']);

function isWhitelistedNoun(token: string): boolean {
  if (NOUN_ENDING_WHITELIST.some((w) => token.endsWith(w))) return true;
  if (
    !token.endsWith('으로') &&
    !/(?:오피스|건물|매물|빌딩|수익률|전용률|용적률|건폐율|구조|규모|용도|형태|상태|입지|가시성|접근성)로$/.test(token) &&
    /.+[가-힣]{2,}로$/.test(token)
  ) {
    return true;
  }
  return false;
}

/** 마지막 어절이 조사/관형어로 끝나 문장이 잘려 보이는지 판정. */
export function endsWithDanglingParticle(text: string | null | undefined): boolean {
  const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1];
  if (!last) return false;
  if (DROP_TAIL_TOKENS.has(last)) return true;
  if (isWhitelistedNoun(last)) return false;
  if (MULTI_CHAR_PARTICLES.some((p) => last.length > p.length && last.endsWith(p))) return true;
  const chars = Array.from(last);
  if (chars.length < 2) return false;
  const tail = chars[chars.length - 1];
  if (!SINGLE_CHAR_PARTICLES.has(tail)) return false;
  // 숫자/영문 뒤 '인'·'고' 등은 판단 보류 (예: "2인")
  return /[가-힣]/.test(chars[chars.length - 2]);
}

/** 끝 어절의 조사/관형어를 걷어 완결 체언으로 만든다. */
function stripDanglingTail(text: string): string {
  let tokens = text.trim().split(/\s+/).filter(Boolean);
  for (let guard = 0; guard < 6 && tokens.length > 0; guard++) {
    const joined = tokens.join(' ');
    if (!endsWithDanglingParticle(joined)) break;
    const last = tokens[tokens.length - 1];
    if (DROP_TAIL_TOKENS.has(last)) {
      tokens = tokens.slice(0, -1);
      continue;
    }
    const multi = MULTI_CHAR_PARTICLES.find((p) => last.length > p.length && last.endsWith(p));
    if (multi) {
      tokens[tokens.length - 1] = last.slice(0, -multi.length);
      continue;
    }
    const chars = Array.from(last);
    const tail = chars[chars.length - 1];
    const stem = chars.slice(0, -1).join('');
    if (tail === '은' || tail === '는' || tail === '던' || tail === '할' || tail === '고' || tail === '며') {
      tokens = tokens.slice(0, -1); // 좋은/있는/좋고 → 수식 대상이 잘렸으므로 어절 삭제
    } else if ((tail === '한' || tail === '된') && Array.from(stem).length < 2) {
      tokens = tokens.slice(0, -1);
    } else {
      tokens[tokens.length - 1] = stem; // 가시성이→가시성, 가능한→가능, 입지로→입지
    }
    tokens = tokens.filter(Boolean);
  }
  return tokens.join(' ');
}

/** 문장형 서술어(…습니다/…입니다/…좋습니다)를 체언형으로 바꾼다. */
function rewritePredicateEnding(text: string): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  const lastIdx = tokens.length - 1;
  let last = tokens[lastIdx];
  let adjectival = false;

  const exact: Record<string, string> = {
    좋습니다: '우수', 좋아요: '우수', 좋다: '우수', 좋음: '우수',
    우수합니다: '우수', 우수해요: '우수', 뛰어납니다: '우수', 탁월합니다: '우수', 훌륭합니다: '우수',
    높습니다: '높음', 높아요: '높음', 많습니다: '풍부', 많아요: '풍부', 풍부합니다: '풍부',
    넓습니다: '넓음', 넓어요: '넓음', 있습니다: '보유', 있어요: '보유', 없습니다: '없음', 없어요: '없음',
    가능합니다: '가능', 가능해요: '가능', 편리합니다: '편리', 용이합니다: '용이',
  };

  if (exact[last]) {
    const mapped = exact[last];
    last = mapped;
    adjectival = true;
    const prevIdx = lastIdx - 1;
    const prev = prevIdx >= 0 ? tokens[prevIdx] : '';
    if (mapped === '보유' && /(?:되어|돼|해져)$/.test(prev)) {
      // "잘 형성되어 있습니다" → "형성"
      tokens[prevIdx] = prev.replace(/(?:되어|돼|해져)$/, '');
      if (tokens[prevIdx - 1] === '잘') tokens.splice(prevIdx - 1, 1);
      last = '';
    } else if (mapped === '보유' && /[가-힣]히$/.test(prev)) {
      // "충분히 있습니다" → "충분"
      tokens[prevIdx] = prev.slice(0, -1);
      last = '';
    }
  } else if (/(?:입니다|이에요|예요|이다)$/.test(last)) {
    last = last.replace(/(?:입니다|이에요|예요|이다)$/, '');
  } else if (/(?:되었습니다|됐습니다)$/.test(last)) {
    last = last.replace(/(?:되었습니다|됐습니다)$/, '');
  } else if (/했습니다$/.test(last)) {
    last = last.replace(/했습니다$/, '');
  } else if (/(?:합니다|해요)$/.test(last)) {
    last = last.replace(/(?:합니다|해요)$/, '');
    adjectival = true;
  } else if (/(?:됩니다|돼요)$/.test(last)) {
    last = last.replace(/(?:됩니다|돼요)$/, '');
  } else if (/(?:습니다|니다|어요|아요)$/.test(last)) {
    last = ''; // 매핑 불가 서술어는 어절째 제거 후 꼬리 정리
  }

  const next = [...tokens.slice(0, -1), ...(last ? [last] : [])];
  // "가시성이 우수" → "가시성 우수": 형용 서술어 앞 주격조사 제거
  if (adjectival && next.length >= 2) {
    const prevIdx = next.length - 2;
    const prev = next[prevIdx];
    if (!isWhitelistedNoun(prev) && /[가-힣](?:이|가|은|는)$/.test(prev)) {
      next[prevIdx] = prev.slice(0, -1);
    }
  }
  return next.join(' ');
}

const FILLER_WORDS = new Set([
  '매우', '아주', '정말', '굉장히', '무척', '상당히', '특히', '현재', '바로', '가장', '다양한', '충분한',
  '인근', '주변', '일대', '모두', '함께', '또한', '약', '잘',
]);

/** 어절 내부 조사 정리 (길이 초과일 때만 호출): 입지로→입지, 오피스가→오피스, 접근이→접근 */
function stripInnerParticles(tokens: string[]): string[] {
  return tokens.map((tok, idx) => {
    if (idx === tokens.length - 1 || isWhitelistedNoun(tok)) return tok;
    const multi = ['에서', '으로'].find((p) => tok.length > p.length + 1 && tok.endsWith(p));
    if (multi) return tok.slice(0, -multi.length);
    const chars = Array.from(tok);
    if (chars.length >= 2 && /[가-힣]$/.test(chars[chars.length - 2])) {
      const tail = chars[chars.length - 1];
      if (['이', '가', '을', '를', '로', '의', '와', '과'].includes(tail)) return chars.slice(0, -1).join('');
      if ((tail === '한' || tail === '된') && chars.length >= 3) return chars.slice(0, -1).join('');
    }
    return tok;
  });
}

function basicNormalize(raw: string): string {
  let s = String(raw ?? '');
  // " — 부연설명" 꼬리 제거 (IM 하이라이트 headline — brief 결합 형식)
  s = s.split(/\s[—–]\s/)[0] ?? '';
  s = s
    .replace(ELLIPSIS_RE, ' ')
    .replace(/["“”'‘’「」『』]/g, '')
    .replace(/^\s*(?:[-•·*▶▷✔✓]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/[\s.,!?~;:·、。]+$/u, '').replace(/^[\s,·]+/, '').trim();
  return s;
}

/** "신사역과 잠원역" → "신사·잠원역", "A 및 B" → "A·B" */
function compactConjunctions(s: string): string {
  return s
    .replace(/([가-힣A-Za-z0-9]+)역\s*(?:과|와|및|,)\s*([가-힣A-Za-z0-9]+)역/g, '$1·$2역')
    .replace(/\s+및\s+/g, '·')
    .replace(/\s*·\s*/g, '·');
}

export interface RepairDealCardLineOptions {
  max?: number;
  /** 교정 결과가 비었을 때 사용할 대체 문구 (이 문구도 교정된다). */
  fallback?: string;
}

/**
 * 딜카드 한 줄 문구를 ≤max 자의 완결 체언형으로 교정한다 (결정적·멱등).
 * - 이미 짧고 완결된 문구는 그대로 둔다(중개사 원문 존중).
 */
export function repairDealCardLine(
  raw: string | null | undefined,
  options: RepairDealCardLineOptions = {},
): string {
  const max = options.max ?? DEAL_CARD_LINE_MAX;
  let s = basicNormalize(String(raw ?? ''));
  if (!s) return options.fallback ? repairDealCardLine(options.fallback, { max }) : '';

  s = rewritePredicateEnding(s);
  s = compactConjunctions(s);
  s = stripDanglingTail(s);

  if (countDealCardChars(s) > max) {
    let tokens = stripInnerParticles(s.split(/\s+/).filter(Boolean));
    s = tokens.join(' ');
    if (countDealCardChars(s) > max) {
      tokens = tokens.filter((t) => !FILLER_WORDS.has(t));
      s = tokens.join(' ');
    }
    while (countDealCardChars(s) > max && tokens.length > 1) {
      tokens = tokens.slice(0, -1);
      s = stripDanglingTail(tokens.join(' '));
      tokens = s.split(/\s+/).filter(Boolean);
    }
    if (countDealCardChars(s) > max) {
      // 띄어쓰기 없는 단일 덩어리: 최후 수단으로 코드포인트 절단 후 꼬리 정리
      s = stripDanglingTail(Array.from(s).slice(0, max).join('').trim());
    }
  }

  s = s.replace(/[\s,·]+$/, '').replace(/^[\s,·]+/, '').trim();
  if (countDealCardChars(s) < 2) {
    return options.fallback && options.fallback !== raw
      ? repairDealCardLine(options.fallback, { max })
      : s;
  }
  return s;
}

export interface DealCardLineAssessment {
  count: number;
  max: number;
  isOver: boolean;
  isDangling: boolean;
  hasEllipsis: boolean;
  isSentenceStyle: boolean;
  ok: boolean;
  /** 고객 화면에 실제로 표시될 교정 문구 */
  repaired: string;
}

/** 편집기 카운터(14/18)와 경고 상태 계산용. */
export function assessDealCardLine(
  text: string | null | undefined,
  max: number = DEAL_CARD_LINE_MAX,
): DealCardLineAssessment {
  const value = String(text ?? '');
  const count = countDealCardChars(value);
  const isOver = count > max;
  const isDangling = endsWithDanglingParticle(value);
  const hasEllipsis = /…|⋯|‥|\.{2,}/.test(value);
  const isSentenceStyle = /(?:습니다|입니다|니다|해요|어요|아요)[.!\s]*$/.test(value.trim());
  const repaired = repairDealCardLine(value, { max });
  return {
    count,
    max,
    isOver,
    isDangling,
    hasEllipsis,
    isSentenceStyle,
    ok: count > 0 && !isOver && !isDangling && !hasEllipsis,
    repaired,
  };
}

/** 고객 화면용 엄격 검증: 비어있지 않음 · ≤max · 말줄임 없음 · 조사로 끝나지 않음. */
export function isCompleteDealCardLine(text: string | null | undefined, max = DEAL_CARD_LINE_MAX): boolean {
  const v = String(text ?? '').trim();
  return v.length > 0 && countDealCardChars(v) <= max && !/…|⋯|\.{2,}/.test(v) && !endsWithDanglingParticle(v);
}

export const GENERIC_POINT_FALLBACKS: readonly [string, string, string] = [
  '접근성 좋은 입지',
  '안정적 임차 구성',
  '꾸준한 임대수익 구조',
];

/** 장점 3줄을 교정한다. 빈 칸은 fallbacks(기본: 숫자 없는 정성 문구)로 채울 수 있다. */
export function repairDealCardPoints(
  points: readonly (string | null | undefined)[] | null | undefined,
  options: { fillEmpty?: boolean; fallbacks?: readonly string[] } = {},
): [string, string, string] {
  const src = Array.isArray(points) ? points : [];
  const fallbacks = options.fallbacks ?? GENERIC_POINT_FALLBACKS;
  const out: string[] = [];
  for (let i = 0; i < 3; i++) {
    const repaired = repairDealCardLine(src[i] ?? '');
    out.push(repaired || (options.fillEmpty ? repairDealCardLine(fallbacks[i] ?? '') : ''));
  }
  return [out[0], out[1], out[2]];
}

// ── 숫자 근거(grounding) 검증 ───────────────────────────────────────────────

const NUM_WITH_UNIT_RE = /(\d+(?:[.,]\d+)*)\s*(%p|%|억|만|평|㎡|층|년|분|m|대|호|실|개|배)?/g;

function normalizeNum(n: string): string {
  return n.replace(/,/g, '').replace(/\.0+$/, '');
}

function collectGroundedNumberSets(context: string): { known: Set<string>; knownPct: Set<string> } {
  const known = new Set<string>();
  const knownPct = new Set<string>();
  const ctxStr = String(context ?? '');
  for (const m of ctxStr.matchAll(NUM_WITH_UNIT_RE)) {
    const num = normalizeNum(m[1]);
    known.add(num);
    if (m[2] === '%' || m[2] === '%p') {
      knownPct.add(num);
    }
  }
  for (const m of ctxStr.matchAll(/(?:yieldPct|수익률|공실률|용적률|건폐율)[^0-9]{0,15}(\d+(?:[.,]\d+)*)/gi)) {
    const num = normalizeNum(m[1]);
    known.add(num);
    knownPct.add(num);
  }
  return { known, knownPct };
}

/** 출력 문구 중 입력(context)에 근거가 없는 숫자 목록 (단위 없는 1~2자리 정수는 무시). */
export function findUngroundedNumbers(text: string, context: string): string[] {
  const { known, knownPct } = collectGroundedNumberSets(context);
  const unknown: string[] = [];
  for (const m of String(text ?? '').matchAll(NUM_WITH_UNIT_RE)) {
    const num = normalizeNum(m[1]);
    const unit = m[2];
    if (!unit && /^\d{1,2}$/.test(num)) continue;
    const isPct = unit === '%' || unit === '%p';
    const isGrounded = isPct ? knownPct.has(num) : known.has(num);
    if (!isGrounded && !unknown.includes(num)) unknown.push(num);
  }
  return unknown;
}

/** 근거 없는 숫자 표현("연 4%대", "도보 3분")을 제거하고 남은 문구를 정리한다. */
export function stripUngroundedNumbers(text: string, context: string): { cleaned: string; stripped: string[] } {
  const unknown = findUngroundedNumbers(text, context);
  if (unknown.length === 0) return { cleaned: text, stripped: [] };
  const { known, knownPct } = collectGroundedNumberSets(context);
  let next = text;
  for (const num of unknown) {
    const escaped = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (known.has(num) && !knownPct.has(num)) {
      next = next.replace(
        new RegExp(`(?:연\\s*|약\\s*)?(?<![0-9.,])${escaped}(?:[.,]\\d+)?\\s*(?:%p|%대|%)(?!\\d)`, 'g'),
        ' ',
      );
    } else {
      next = next.replace(
        new RegExp(`(?:연\\s*|약\\s*|도보\\s*|월\\s*)?(?<![0-9.,])${escaped}(?:[.,]\\d+)?\\s*(?:%p|%대|%|분|층|년|억|만|평|㎡|m|대|호|실|개|배)?대?(?!\\d)`, 'g'),
        ' ',
      );
    }
  }
  next = next.replace(/\s+/g, ' ').replace(/^[·,.\s]+|[·,.\s]+$/g, '').trim();
  return { cleaned: next, stripped: unknown };
}

// ── 한 줄 제목 파생 (근거 기반) ─────────────────────────────────────────────

export interface DealCardHeadlineSource {
  posture?: 'income' | 'owner_occupied' | 'value_add' | string;
  points?: readonly (string | null | undefined)[];
  headline?: string | null;
}

const FEATURE_RULES: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /우량\s*임차|우량임차|장기\s*임차|안정\s*임차/, label: '우량임차' },
  { re: /만실|공실\s*(?:없|0)/, label: '만실' },
  { re: /코너|각지/, label: '코너' },
  { re: /더블\s*역세권|(?:\S+·\S+역)/, label: '더블 역세권' },
  { re: /역세권|역\s*도보|역\s*인접|역\s*접근/, label: '역세권' },
  { re: /대로변|광대로|대로/, label: '대로변' },
  { re: /신축|리모델링/, label: '신축급' },
  { re: /가시성/, label: '가시성 우수' },
  { re: /주차/, label: '주차 확보' },
  { re: /용적률/, label: '용적률 여유' },
  { re: /사옥/, label: '사옥 적합' },
];

/**
 * 장점 3줄에서 **근거가 있는 특징만** 뽑아 ≤18자 한 줄 제목을 만든다.
 * - 수익률(%)은 입력 장점에 실제로 있을 때만 사용한다 (임의 "연 4%대" 생성 금지).
 */
export function deriveDealCardHeadline(src: DealCardHeadlineSource): string {
  const posture = src.posture || 'income';
  const joined = (src.points || []).filter(Boolean).join(' ');
  const yieldMatch = joined.match(/(\d+(?:\.\d+)?)\s*%(대)?/);
  const yieldStr = yieldMatch ? `${yieldMatch[1]}%${yieldMatch[2] ?? ''}` : null;

  const features: string[] = [];
  for (const rule of FEATURE_RULES) {
    if (rule.re.test(joined) && !features.includes(rule.label)) features.push(rule.label);
    if (features.length >= 3) break;
  }
  if (features.includes('더블 역세권')) {
    const i = features.indexOf('역세권');
    if (i >= 0) features.splice(i, 1);
  }

  const parts: string[] = [];
  if (posture === 'income' && yieldStr) parts.push(`연 ${yieldStr}`);
  parts.push(...features);

  let base: string;
  if (parts.length === 0) {
    base = posture === 'owner_occupied' ? '사옥 활용 추천 매물' : posture === 'value_add' ? '신축·밸류업 검토 매물' : '안정 임대수익 매물';
  } else if (parts.length === 1) {
    base = `${parts[0]} ${posture === 'owner_occupied' ? '사옥' : posture === 'value_add' ? '개발 부지' : '수익형 매물'}`;
  } else {
    base = parts.join(' ');
  }
  return repairDealCardLine(base) || '안정 임대수익 매물';
}

/** 제목에서 썸네일 칩(지역/용도)과 중복되는 어구를 제거한다 (AI 출력 전용). */
export function stripChipRepetition(text: string, chips: { region?: string; use?: string }): string {
  let out = text;
  const needles = [chips.region, chips.use, ...(chips.region || '').split(/\s+/)]
    .map((n) => (n || '').trim())
    .filter((n) => n.length >= 2);
  for (const n of needles.sort((a, b) => b.length - a.length)) {
    if (out.includes(n)) {
      const candidate = out.split(n).join(' ').replace(/\s+/g, ' ').trim();
      if (countDealCardChars(candidate) >= 4) out = candidate;
    }
  }
  return out;
}

export interface DealCardCopyFields {
  headline?: string;
  points: [string, string, string] | string[];
  posture?: string;
  region?: string;
  use?: string;
  priceBand?: string;
}

/**
 * 카드 전체 문구 정규화: 장점 3줄 교정 + (옵션) 빈 한 줄 제목을 근거 기반 파생 제목으로 채움.
 * - fillHeadline 은 카드에 내용(지역/용도/가격/장점)이 있을 때만 동작한다 (새 빈 카드는 그대로).
 */
export function normalizeDealCardCopy<T extends DealCardCopyFields>(
  card: T,
  options: { fillHeadline?: boolean } = {},
): T {
  const points = repairDealCardPoints(card.points);
  let headline = repairDealCardLine(card.headline ?? '');
  const hasContent = Boolean(
    card.region?.trim() || card.use?.trim() || card.priceBand?.trim() || points.some((p) => p),
  );
  if (!headline && options.fillHeadline && hasContent) {
    headline = deriveDealCardHeadline({ posture: card.posture, points });
  }
  const samePoints = Array.isArray(card.points) && points.every((p, i) => p === (card.points[i] ?? ''));
  if (samePoints && headline === (card.headline ?? '')) return card;
  return { ...card, headline, points };
}
