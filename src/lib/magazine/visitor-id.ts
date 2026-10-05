/**
 * src/lib/magazine/visitor-id.ts — 매거진 열람 분석용 방문자 식별 (E-04, T3-04/S2-28)
 *
 * 이전 방식: `btoa(UA + screen).slice(0, 32)` → 같은 기종 브라우저가 전부 같은 ID(충돌 759건),
 *            주석은 "SHA256"이라 서술했지만 실제로는 base64(가역) 였다.
 * 현재 방식: 브라우저가 `crypto.randomUUID()` 로 만든 **1st-party 랜덤 ID** 를 localStorage 에 13개월 보관.
 *   - 기기 지문(fingerprint) 아님 · 쿠키 아님 · 개인 식별 정보 없음.
 *   - 서버에는 원문이 저장되지 않는다. 서버가 `MAGAZINE_SID_SECRET` 기반 **HMAC-SHA256** 해시(`v2_…`)만 저장 (visitor-hash.ts).
 *
 * 이 파일은 클라이언트 번들에 들어가므로 node:crypto 를 import 하지 않는다.
 * 모든 함수는 저장소/난수 생성기를 주입받을 수 있어 단위테스트가 가능하다.
 */

export const VISITOR_ID_STORAGE_KEY = 'cre_mag_vid';
/** 13개월 (개인정보 보호·가이드상 상한). 만료되면 새 ID 를 발급한다. */
export const VISITOR_ID_TTL_MS = 395 * 24 * 60 * 60 * 1000;

export const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 구독/뷰어 푸터에 노출할 개인정보 고지 문구 계약 (E3 가 사용). */
export const ANALYTICS_NOTICE_TEXT =
  '열람 통계를 위해 이 브라우저에 임의의 방문자 번호를 13개월간 저장합니다(쿠키·기기 지문 아님). ' +
  '서버에는 암호화(해시)된 값만 저장되며, 구독자 전용 링크로 접속하면 중개사에게 열람 현황이 구독자와 연결되어 표시될 수 있습니다.';

export interface StoredVisitorId {
  id: string;
  /** 발급 시각(ms) */
  createdAt: number;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type IdGenerator = () => string | null;

/** 브라우저 crypto.randomUUID. 사용 불가(구형·비보안 컨텍스트)면 null — 이때 추적하지 않는다(지문 폴백 금지). */
export const defaultIdGenerator: IdGenerator = () => {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    return typeof c?.randomUUID === 'function' ? c.randomUUID() : null;
  } catch {
    return null;
  }
};

export function isValidVisitorId(v: unknown): v is string {
  return typeof v === 'string' && VISITOR_ID_RE.test(v);
}

/** 저장된 JSON 을 해석. 형식 오류·만료·미래 시각이면 null. */
export function parseStoredVisitorId(raw: string | null | undefined, now: number): StoredVisitorId | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { id, createdAt } = parsed as { id?: unknown; createdAt?: unknown };
  if (!isValidVisitorId(id)) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  if (createdAt > now + 60_000) return null; // 시계 조작/오류
  if (now - createdAt >= VISITOR_ID_TTL_MS) return null; // 13개월 만료
  return { id, createdAt };
}

/**
 * 방문자 ID 를 읽거나 새로 만든다.
 *  - 저장소가 있으면 영속(13개월), 쓰기 실패(사생활 보호 모드 등)면 이번 페이지 로드 동안만 유효한 ID.
 *  - 난수 생성기가 없으면 null (호출자는 추적을 중단해야 한다).
 */
export function resolveVisitorId(
  storage: KeyValueStorage | null | undefined,
  now: number = Date.now(),
  generate: IdGenerator = defaultIdGenerator,
): string | null {
  if (storage) {
    try {
      const existing = parseStoredVisitorId(storage.getItem(VISITOR_ID_STORAGE_KEY), now);
      if (existing) return existing.id;
    } catch {
      // 저장소 접근 거부 → 아래에서 세션 ID 로 진행
    }
  }
  const id = generate();
  if (!isValidVisitorId(id)) return null;
  if (storage) {
    try {
      storage.setItem(VISITOR_ID_STORAGE_KEY, JSON.stringify({ id, createdAt: now } satisfies StoredVisitorId));
    } catch {
      // 영속 실패 — 이 로드에서만 사용
    }
  }
  return id;
}

/** 에디터 미리보기·iframe 에서는 비콘을 보내지 않는다 (T1-13: 세션당 99~104회 오염). */
export function isPreviewContext(search: string, inIframe: boolean): boolean {
  if (inIframe) return true;
  try {
    const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const v = p.get('preview');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** 서명된 sid 토큰 형식 (`b64url.b64url`, sid-token.ts 가 발급). 서버가 서명·만료·브로커 바인딩을 다시 검증한다. */
export const SID_TOKEN_RE = /^[A-Za-z0-9_-]{10,300}\.[A-Za-z0-9_-]{20,100}$/;

/** URL 의 `?sid=<서명 토큰>` (구독자 개인 링크) — 형식이 맞을 때만 반환. 위조 여부는 서버가 판단한다. */
export function readSubscriberSid(search: string): string | null {
  try {
    const p = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    const sid = p.get('sid');
    return typeof sid === 'string' && SID_TOKEN_RE.test(sid) ? sid : null;
  } catch {
    return null;
  }
}

// ── 클릭 타깃 ────────────────────────────────────────────────────────
/** 온도 모델이 이해하는 클릭 타깃 어휘 (buyer-temperature.ts 가 같은 값을 쓴다). */
export const CLICK_TARGETS = {
  IM_REQUEST: 'im_request',
  PHONE_CLICK: 'phone_click',
  LISTING_CLICK: 'listing_click',
  POLL_VOTE: 'poll_vote',
  CALC_SIMULATE: 'calc_simulate',
  REFERRAL_COPY: 'referral_copy',
  ACCORDION: 'accordion',
  CTA: 'cta',
  /** 문의 의사 표시(카톡·연락·세무 문의·투표 후 상담) — 전화/IM 보다 약한 의도 신호 */
  INQUIRY: 'inquiry',
  /** 공유·전달 — 점수 0 (기록만) */
  SHARE: 'share',
} as const;

/**
 * 뷰어(E3)가 보내는 별칭 → 정식 타깃. 서버(public analytics route)와 클라이언트가 같은 맵으로 흡수한다.
 *  - 전화/IM        : bottom_call → phone_click, bottom_im_request → im_request
 *  - 문의(inquiry)  : bottom_kakao, bottom_contact, tax_inquiry, poll_consult
 *  - 공유(share)    : bottom_share, referral_forward (점수 0)
 * 별칭이 아닌 값은 그대로 통과한다.
 */
export const CLICK_TARGET_ALIASES: Readonly<Record<string, string>> = {
  bottom_call: CLICK_TARGETS.PHONE_CLICK,
  bottom_im_request: CLICK_TARGETS.IM_REQUEST,
  bottom_kakao: CLICK_TARGETS.INQUIRY,
  bottom_contact: CLICK_TARGETS.INQUIRY,
  tax_inquiry: CLICK_TARGETS.INQUIRY,
  poll_consult: CLICK_TARGETS.INQUIRY,
  bottom_share: CLICK_TARGETS.SHARE,
  referral_forward: CLICK_TARGETS.SHARE,
};

/** 별칭 → 정식 타깃 (이미 정식이면 그대로). 입력은 소문자·trim 된 토큰. */
export function canonicalClickTarget(token: string): string {
  return Object.prototype.hasOwnProperty.call(CLICK_TARGET_ALIASES, token) ? CLICK_TARGET_ALIASES[token] : token;
}

const TARGET_TOKEN_RE = /^[a-z0-9][a-z0-9_:\-.]{0,59}$/;
const META_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

/** 원문 토큰 정규화(별칭 미적용): 소문자·허용문자·60자. 형식 불가면 null. */
export function rawClickTarget(target: unknown): string | null {
  if (typeof target !== 'string') return null;
  const t = target.trim().toLowerCase();
  return TARGET_TOKEN_RE.test(t) ? t : null;
}

/** target 문자열 정규화 + 별칭 흡수: 형식 불가면 null. */
export function normalizeClickTarget(target: unknown): string | null {
  const raw = rawClickTarget(target);
  return raw ? canonicalClickTarget(raw) : null;
}

export type ClickMetaValue = string | number | boolean;

/** 메타: 최대 8개, 키 정규식, 값은 원시값(문자열 100자). 객체·함수·중첩은 버린다. */
export function sanitizeClickMeta(meta: unknown): Record<string, ClickMetaValue> {
  const out: Record<string, ClickMetaValue> = {};
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (n >= 8) break;
    if (!META_KEY_RE.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 100);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
    else continue;
    n += 1;
  }
  return out;
}


export interface ClickPayload {
  target_url?: string;
  target_param?: string;
  meta?: Record<string, ClickMetaValue>;
}

/**
 * trackClick 인자 → 전송 페이로드.
 *  - 신규: (target, meta?)  target 은 어휘 토큰(예: 'im_request'), meta.url 은 target_url 로 분리, 나머지는 sanitize.
 *  - 레거시: (targetUrl, targetParam) 문자열 둘 — 기존 호출부 호환.
 * 형식 불가 target 이면 null (전송하지 않는다).
 */
export function buildClickPayload(target: unknown, meta?: unknown): ClickPayload | null {
  if (typeof target !== 'string') return null;
  if (typeof meta === 'string') {
    const param = normalizeClickTarget(meta);
    const out: ClickPayload = { target_url: target.slice(0, 500) };
    if (param) out.target_param = param;
    return out;
  }
  if (/^(tel|mailto|sms|https?):/i.test(target.trim())) {
    return target.length <= 500 ? { target_url: target.trim() } : null;
  }
  const rawToken = rawClickTarget(target);
  if (!rawToken) {
    // 토큰이 아니면 URL 로 간주(레거시 단일 인자) — 슬래시/스킴이 있을 때만
    if (/[/:]/.test(target) && target.length <= 500) return { target_url: target };
    return null;
  }
  const token = canonicalClickTarget(rawToken);
  const out: ClickPayload = { target_param: token };
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const { url, ...rest } = meta as Record<string, unknown>;
    if (typeof url === 'string' && url) out.target_url = url.slice(0, 500);
    const clean = sanitizeClickMeta(rest);
    if (Object.keys(clean).length > 0) out.meta = clean;
  }
  if (token !== rawToken) out.meta = { ...(out.meta ?? {}), target_raw: rawToken };
  return out;
}
