/**
 * src/lib/magazine/view-helpers.ts — 독자 뷰어 클라이언트/서버 공용 순수 헬퍼 (node 전용 import 금지)
 */

/**
 * 카카오 공유 썸네일 등 절대 OG 이미지 URL.
 * `/api/og/magazine` 라우트는 쿼리(`brokerId`, `date`)만 받는다 — 경로형(`/api/og/magazine/{slug}`)은 404 (T3-10).
 */
export function buildOgImageUrl(baseUrl: string, slug: string, date: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/api/og/magazine?brokerId=${encodeURIComponent(slug)}&date=${encodeURIComponent(date)}`;
}

const VISITOR_KEY = 'cre_mag_vid';

function randomId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 설문 중복 방지용 1st-party 익명 방문자 ID (localStorage). 개인정보 아님.
 * 저장소 접근이 막혀 있으면 호출마다 임의 값을 돌려준다(서버가 IP 해시로도 보호).
 */
export function getOrCreateVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const fresh = randomId();
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

// ─────────────────────────────────────────────────────────────
// 금액·숫자 표기 (U-05: `65억`, T3-43: NOI 만원 정수)
// ─────────────────────────────────────────────────────────────

function withComma(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 금액(원) → 독자 표기. 소수가 필요 없으면 `65억`, 필요하면 `65.5억`, 1억 미만은 `4,500만`.
 * 숫자로 해석되지 않는 문자열(이미 `10억` 같은 표기)은 그대로 돌려주고, 없으면 `-`.
 */
export function formatPriceKo(won: unknown): string {
  if (typeof won === 'string') {
    const t = won.trim();
    if (!t) return '-';
    if (Number.isNaN(Number(t))) return t;
  }
  const n = typeof won === 'number' ? won : Number(won);
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 100_000_000) {
    const eok = Math.round((n / 100_000_000) * 10) / 10;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억`;
  }
  if (n >= 10_000) return `${withComma(n / 10_000)}만`;
  return withComma(n);
}

/** 만원 정수 표기 (천 단위 콤마). 예) 28,500만원 / -1,190만원. NOI 등 소수점 없이 표기한다. */
export function formatManwonInt(won: number): string {
  if (!Number.isFinite(won)) return '-';
  const man = Math.round(won / 10_000);
  return `${man < 0 ? '-' : ''}${withComma(Math.abs(man))}만원`;
}

/** 월 현금흐름 부호 표기: +1,438만 / −1,190만 (부호는 색에만 의존하지 않는다). */
export function formatSignedManwon(won: number): string {
  if (!Number.isFinite(won)) return '-';
  const man = Math.round(won / 10_000);
  if (man === 0) return '0만';
  return `${man > 0 ? '+' : '−'}${withComma(Math.abs(man))}만`;
}

// ─────────────────────────────────────────────────────────────
// 타깃·섹션 순서·섹션 on/off (DC-9, DC-10)
// ─────────────────────────────────────────────────────────────

export type ViewerTarget = 'all' | 'buyer' | 'seller';

/** `?target=` 값 정규화. 알 수 없는 값은 all, 소유주(owner*)는 seller 로 취급. */
export function parseViewerTarget(raw: string | string[] | null | undefined): ViewerTarget {
  const v = (Array.isArray(raw) ? raw[0] : raw ?? '').trim().toLowerCase();
  if (v === 'buyer') return 'buyer';
  if (v === 'seller' || v === 'owner' || v === 'owner_individual') return 'seller';
  return 'all';
}

/** 세무 섹션은 전체/매도 타깃에게만 노출 (매수 타깃에는 숨김). */
export function taxVisibleForTarget(target: ViewerTarget): boolean {
  return target === 'all' || target === 'seller';
}

export const VIEWER_SECTION_IDS = [
  'ai_briefing',
  'field_note',
  'theme_of_week',
  'featured_deals',
  'poll',
  'subscribe_cta',
  'broker_profile',
  'market_data',
  'news_curation',
  'auction_picks',
  'reports',
  'sentiment_index',
  'tax_clinic',
  'roi_calculator',
  'referral',
] as const;
export type ViewerSectionId = (typeof VIEWER_SECTION_IDS)[number];

const ORDER_ALL: readonly ViewerSectionId[] = [
  'ai_briefing', 'field_note', 'theme_of_week', 'featured_deals', 'poll', 'subscribe_cta', 'broker_profile',
  'market_data', 'news_curation', 'auction_picks', 'reports', 'sentiment_index', 'roi_calculator', 'tax_clinic', 'referral',
];
const ORDER_BUYER: readonly ViewerSectionId[] = [
  'ai_briefing', 'field_note', 'featured_deals', 'theme_of_week', 'poll', 'subscribe_cta', 'broker_profile',
  'market_data', 'news_curation', 'auction_picks', 'reports', 'sentiment_index', 'roi_calculator', 'tax_clinic', 'referral',
];
const ORDER_SELLER: readonly ViewerSectionId[] = [
  'ai_briefing', 'field_note', 'market_data', 'sentiment_index', 'featured_deals', 'theme_of_week', 'poll',
  'subscribe_cta', 'broker_profile', 'news_curation', 'auction_picks', 'reports', 'tax_clinic', 'roi_calculator', 'referral',
];

/**
 * 렌더 순서. 에디션이 `section_order` 를 가지면 그 순서(+구독·프로필을 뒤에 붙임), 없으면 타깃별 기본 순서.
 * 레퍼럴·세무는 항상 맨 뒤쪽(강등, U-05).
 */
export function resolveSectionOrder(
  target: ViewerTarget,
  customOrder?: unknown,
): string[] {
  if (Array.isArray(customOrder) && customOrder.length > 0) {
    const ids = customOrder.filter((x): x is string => typeof x === 'string');
    const out = ids.filter((id, i) => ids.indexOf(id) === i);
    for (const tail of ['subscribe_cta', 'broker_profile']) if (!out.includes(tail)) out.push(tail);
    return out;
  }
  if (target === 'buyer') return [...ORDER_BUYER];
  if (target === 'seller') return [...ORDER_SELLER];
  return [...ORDER_ALL];
}

/** `sections[].enabled === false` 로 꺼진 섹션인지. 항목이 없으면 켜진 것으로 본다. */
export function isSectionEnabled(sections: unknown, id: string): boolean {
  if (!Array.isArray(sections)) return true;
  const entry = sections.find((s) => s && typeof s === 'object' && (s as { id?: unknown }).id === id) as
    | { enabled?: unknown }
    | undefined;
  return !(entry && entry.enabled === false);
}

// ─────────────────────────────────────────────────────────────
// 표지/제목
// ─────────────────────────────────────────────────────────────

/**
 * 표지 h1 과 문서 title 에 같이 쓰는 제목 (T1-16). 에디션 헤드라인이 있으면 그것, 없으면 `{이름}의 CRE 매거진`.
 * 고정 문구('CRE 위클리 매거진')로 폴백하지 않는다.
 */
export function buildMagazineTitle(headline: unknown, brokerName?: string | null): string {
  const h = typeof headline === 'string' ? headline.replace(/\s+/g, ' ').trim() : '';
  if (h) return h;
  const name = (brokerName ?? '').trim();
  return name ? `${name}의 CRE 매거진` : 'CRE 매거진';
}

/** 읽는 시간(분) — 한국어 약 400자/분, 최소 2분. */
export function estimateReadMinutes(texts: Array<string | null | undefined>): number {
  const total = texts.filter(Boolean).join('').length;
  const est = Math.ceil(total / 400);
  return est < 2 ? 2 : est;
}

// ─────────────────────────────────────────────────────────────
// 뉴스·심리 (색 단독 의미 금지, 뉴스 최대 6건)
// ─────────────────────────────────────────────────────────────

export const MAX_NEWS_ITEMS = 6;

export interface NewsItemView {
  title: string;
  summary: string;
  source: string;
  topic: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

/** topNews / news_curation 에서 제목이 있는 항목만 최대 6건. */
export function pickTopNews(data: Record<string, unknown>, max = MAX_NEWS_ITEMS): NewsItemView[] {
  const raw = Array.isArray(data.topNews) ? data.topNews : Array.isArray(data.news_curation) ? data.news_curation : [];
  const out: NewsItemView[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    const title = String(r.title ?? '').replace(/^\[.*?\]\s*/, '').trim();
    if (!title) continue;
    const s = r.sentiment === 'bullish' || r.sentiment === 'bearish' ? r.sentiment : 'neutral';
    out.push({
      title,
      summary: typeof r.summary === 'string' ? r.summary : '',
      source: typeof r.source === 'string' ? r.source : '',
      topic: typeof r.topic === 'string' ? r.topic : '',
      sentiment: s,
    });
    if (out.length >= max) break;
  }
  return out;
}

/** 뉴스 감성 표시: 색 점 대신 텍스트+기호를 항상 함께 낸다. */
export function newsSentimentMeta(s: NewsItemView['sentiment']): { label: string; symbol: string } {
  if (s === 'bullish') return { label: '호재', symbol: '▲' };
  if (s === 'bearish') return { label: '악재', symbol: '▼' };
  return { label: '중립', symbol: '–' };
}

/** 투자 심리 점수 → 구간 라벨(텍스트). 색은 보조 수단. */
export function sentimentMeta(score: number): { label: string; bar: string; text: string } {
  if (score >= 70) return { label: '과열 구간', bar: 'from-orange-500 to-rose-500', text: 'text-rose-300' };
  if (score >= 50) return { label: '중립 이상', bar: 'from-emerald-500 to-teal-400', text: 'text-emerald-300' };
  return { label: '위축 구간', bar: 'from-blue-600 to-cyan-400', text: 'text-sky-300' };
}

// ─────────────────────────────────────────────────────────────
// 시장 온도 (뱃지 설명을 모바일에서도 노출, T3-52)
// ─────────────────────────────────────────────────────────────

export const MARKET_TEMP_VIEW: Readonly<Record<string, { emoji: string; color: string; description: string }>> = {
  '적극 매수': { emoji: '🟩', color: '#ef4444', description: '강한 매수 신호 — 거래량 급증, 매물 소진 빠름' },
  '선별 매수': { emoji: '🟨', color: '#f59e0b', description: '선별적 기회 존재 — 입지·가격 따져 진입 가능' },
  '관망': { emoji: '🟦', color: '#6b7280', description: '관망 국면 — 뚜렷한 방향 없이 거래 위축' },
  '조정 대기': { emoji: '🟧', color: '#3b82f6', description: '조정 진행 중 — 급매 나올 수 있으나 하락 리스크 상존' },
  '위기 경계': { emoji: '🟥', color: '#dc2626', description: '시장 위기 경계 — 금리·경기 악재 집중, 신규 투자 보류 권고' },
};

// ─────────────────────────────────────────────────────────────
// 용어집 (U2-17: Cap Rate·NOI·GBD·NPL 첫 등장 시 탭 가능한 설명)
// ─────────────────────────────────────────────────────────────

export const GLOSSARY: Readonly<Record<string, string>> = {
  'Cap Rate': '연 순영업소득(NOI)을 매입가로 나눈 비율입니다. 건물이 해마다 벌어들이는 수익률의 기준입니다.',
  NOI: '순영업소득. 임대수입에서 관리·운영비를 뺀 금액입니다(대출이자·세금 제외).',
  'Cash-on-Cash': '자기자본수익률. 연 순현금흐름을 실제 투입한 자기자본으로 나눈 비율입니다.',
  GBD: '강남 업무권역(Gangnam Business District). 강남·서초·역삼 일대를 가리킵니다.',
  YBD: '여의도 업무권역(Yeouido Business District)입니다.',
  CBD: '도심 업무권역(Central Business District). 광화문·종로·을지로 일대입니다.',
  NPL: '부실채권. 금융기관이 회수하기 어려워진 대출채권으로, 경매 물건 소싱과 함께 언급됩니다.',
};

const GLOSSARY_TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);

export interface GlossarySegment {
  text: string;
  /** 용어집 항목이면 해당 용어 */
  term?: string;
}

/**
 * 문자열을 용어/일반 조각으로 나눈다. 같은 `seen` 집합을 공유하면 용어당 **첫 등장만** 표시한다.
 * 영문자 사이에 낀 경우(예: 'NOIR')는 용어로 보지 않는다.
 */
export function splitGlossary(text: string, seen: Set<string> = new Set()): GlossarySegment[] {
  const out: GlossarySegment[] = [];
  let buf = '';
  let i = 0;
  const isLatin = (ch: string | undefined) => !!ch && /[A-Za-z]/.test(ch);
  while (i < text.length) {
    let matched: string | null = null;
    for (const t of GLOSSARY_TERMS) {
      if (text.startsWith(t, i) && !isLatin(text[i - 1]) && !isLatin(text[i + t.length])) {
        matched = t;
        break;
      }
    }
    if (matched && !seen.has(matched)) {
      if (buf) out.push({ text: buf });
      buf = '';
      out.push({ text: matched, term: matched });
      seen.add(matched);
      i += matched.length;
    } else {
      buf += text[i];
      i += 1;
    }
  }
  if (buf) out.push({ text: buf });
  return out;
}

// ─────────────────────────────────────────────────────────────
// 하단 바 액션 / 전화 링크 (U-03, CTA 위계: 주 1 전화 상담 + 보조 IM 요청, 전화 없으면 대체 CTA)
// ─────────────────────────────────────────────────────────────

/** `tel:` 링크. 8~12자리 숫자만 허용(아니면 null → 전화 CTA 숨김). */
export function toTelHref(phone: unknown): string | null {
  if (typeof phone !== 'string' && typeof phone !== 'number') return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 12) return null;
  return `tel:${digits}`;
}

export type ViewerBarAction =
  | { kind: 'call'; label: string; href: string; target: string }
  | { kind: 'contact'; label: string; href: string; target: string }
  | { kind: 'im'; label: string; href: string; target: string }
  | { kind: 'share'; label: string; target: string };

function isSafeHttpUrl(u: unknown): u is string {
  if (typeof u !== 'string') return false;
  try {
    const p = new URL(u);
    return p.protocol === 'https:' || p.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * 뷰어 하단 바 액션 목록.
 *  - 전화 있음: [전화 상담(주), IM 요청, 공유]
 *  - 전화 없음: [카톡·문의(주; kakaoUrl 없으면 프로필 문의), IM 요청, 공유] — 둘 다 불가하면 해당 CTA 생략
 *  - slug 가 없으면 slug 의존 CTA(IM 요청·프로필 문의)는 생략
 */
export function buildBottomBarActions(opts: {
  phone?: unknown;
  brokerSlug?: string | null;
  kakaoUrl?: unknown;
}): ViewerBarAction[] {
  const actions: ViewerBarAction[] = [];
  const tel = toTelHref(opts.phone);
  const slug = opts.brokerSlug || null;
  if (tel) {
    actions.push({ kind: 'call', label: '전화 상담', href: tel, target: 'bottom_call' });
  } else if (isSafeHttpUrl(opts.kakaoUrl)) {
    actions.push({ kind: 'contact', label: '카톡 문의', href: opts.kakaoUrl, target: 'bottom_kakao' });
  } else if (slug) {
    actions.push({
      kind: 'contact',
      label: '문의하기',
      href: `/broker-profile/${encodeURIComponent(slug)}?ref=magazine-contact`,
      target: 'bottom_contact',
    });
  }
  if (slug) {
    actions.push({
      kind: 'im',
      label: 'IM 요청',
      href: `/broker-profile/${encodeURIComponent(slug)}?ref=magazine-cta`,
      target: 'bottom_im_request',
    });
  }
  actions.push({ kind: 'share', label: '공유', target: 'bottom_share' });
  return actions;
}

// ─────────────────────────────────────────────────────────────
// 분석 호출 (E4 의 trackClick(target, meta?) 이 없어도 안전)
// ─────────────────────────────────────────────────────────────

/** `analytics.trackClick?.(target, meta)` 를 타입·런타임 모두 안전하게 호출한다. 텔레메트리 실패는 UI 를 막지 않는다. */
export function safeTrackClick(analytics: unknown, target: string, meta?: Record<string, unknown>): void {
  const fn = (analytics as { trackClick?: unknown } | null | undefined)?.trackClick;
  if (typeof fn !== 'function') return;
  try {
    (fn as (t: string, m?: Record<string, unknown>) => void)(target, meta);
  } catch {
    /* 분석 실패는 사용자 동작에 영향 없음 */
  }
}

// ─────────────────────────────────────────────────────────────
// 콘텐츠 존재 판정 (빈/부분 데이터 → EmptyState)
// ─────────────────────────────────────────────────────────────

/** 표지 외에 보여 줄 본문 데이터가 하나라도 있는지. */
export function hasAnyViewerContent(data: Record<string, unknown>): boolean {
  const nonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
  const nonEmptyStr = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  const fn = data.field_note as Record<string, unknown> | null | undefined;
  return (
    nonEmptyStr(data.briefing) ||
    nonEmptyStr(data.theme_title) ||
    nonEmptyArr(data.featured_deals) ||
    nonEmptyArr(data.dealHighlights) ||
    nonEmptyArr(data.topNews) ||
    nonEmptyArr(data.news_curation) ||
    nonEmptyArr(data.recentTransactions) ||
    nonEmptyArr(data.auctionPicks) ||
    nonEmptyArr(data.reports) ||
    !!data.rentalTrend ||
    !!data.commercialDistrict ||
    !!data.monthlySummary ||
    !!data.poll ||
    !!data.tax_clinic ||
    !!(fn && Object.values(fn).some(nonEmptyStr))
  );
}

// ─────────────────────────────────────────────────────────────
// 뉴스 토픽 한글화 (T1-UX-3) — 알 수 없는 값은 원문 유지(지어내지 않음)
// ─────────────────────────────────────────────────────────────

const TOPIC_LABELS_KO: Readonly<Record<string, string>> = {
  rate: '금리', rates: '금리', interest: '금리',
  policy: '정책', regulation: '규제', tax: '세제',
  market: '시장', transaction: '거래', transactions: '거래',
  supply: '공급', redevelopment: '재건축·재개발', development: '개발',
  finance: '금융', loan: '대출', auction: '경매', npl: 'NPL',
  office: '오피스', retail: '상가', 'small-building': '꼬마빌딩', landmark: '랜드마크',
  other: '기타', general: '일반',
};

export function topicLabelKo(topic: string): string {
  const t = (topic ?? '').trim();
  if (!t) return '';
  return TOPIC_LABELS_KO[t.toLowerCase()] ?? t;
}
