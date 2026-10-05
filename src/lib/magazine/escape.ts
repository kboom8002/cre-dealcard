/**
 * src/lib/magazine/escape.ts — 출력 이스케이프/정제 (F-03, G7)
 * 이메일 HTML, 알림톡 템플릿 변수, OG 텍스트, JSON-LD 등 모든 외부 출력 직전에 사용.
 */

const HTML_ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML 텍스트/속성 컨텍스트 이스케이프. null/undefined → ''. */
export function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESC[c]);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  ndash: '–',
  mdash: '—',
};

/**
 * HTML 엔티티 디코드 (뉴스 제목 `&quot;` 등). 이중 인코딩(`&amp;quot;`)도 최대 2회 풀어낸다.
 * 디코드 결과는 텍스트로만 쓰고, HTML에 넣을 때는 반드시 escapeHtml을 다시 거친다.
 */
export function decodeEntities(s: string | null | undefined): string {
  if (!s) return '';
  const once = (t: string) =>
    t
      .replace(/&#(\d+);/g, (_, n) => {
        const code = Number(n);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
        const code = parseInt(h, 16);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
      })
      .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
  let out = once(s);
  if (/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(out)) out = once(out);
  return out;
}

/** 텍스트에서 HTML 태그·CDATA 래퍼를 제거한다. */
export function stripTags(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export interface SafeVarOptions {
  /** 최대 길이 (기본 30) */
  max?: number;
}

/**
 * 알림톡/SMS/이메일 템플릿 변수용 정제.
 * 개행·제어문자·URL·꺾쇠 제거 후 길이 제한 → 브랜드 피싱/링크 주입 차단.
 */
export function safeTemplateVar(s: unknown, opts: SafeVarOptions = {}): string {
  const max = opts.max ?? 30;
  if (s === null || s === undefined) return '';
  const cleaned = String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(?:www\.)\S+/gi, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

/** 구독자 이름 등 사람 이름용 정제 (한글/영문/숫자/공백/일부 기호만, 30자). */
export function safePersonName(s: unknown): string {
  const t = safeTemplateVar(s, { max: 30 });
  return t.replace(/[^\p{L}\p{N}\s.\-_()·]/gu, '').trim();
}

/** href에 넣을 URL 검증: http(s)만 허용. 아니면 null. */
export function safeHttpUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
