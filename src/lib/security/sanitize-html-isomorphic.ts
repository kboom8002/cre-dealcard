/**
 * @file src/lib/security/sanitize-html-isomorphic.ts
 * @description Zero-jsdom deterministic allowlist HTML sanitizer for SSR & CSR.
 *
 * Why this exists:
 * `isomorphic-dompurify` pulls `jsdom` -> `html-encoding-sniffer` -> `@exodus/bytes` (ESM-only),
 * causing `ERR_REQUIRE_ESM` 500 crashes on Vercel Node serverless SSR even inside `"use client"`
 * components (which still execute module-level imports during Next.js SSR).
 */

export interface SanitizeHtmlOptions {
  ALLOWED_TAGS?: readonly string[];
  ALLOWED_ATTR?: readonly string[];
  ALLOW_DATA_ATTR?: boolean;
}

const DEFAULT_ALLOWED_TAGS = [
  "a",
  "strong",
  "em",
  "b",
  "i",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
  "span",
  "div",
] as const;

const DEFAULT_ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "class",
  "style",
  "target",
  "rel",
] as const;

const VOID_TAGS = new Set(["br", "img", "hr"]);

const DROP_WITH_CONTENT_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "applet",
  "svg",
  "math",
  "template",
  "noscript",
  "textarea",
  "title",
  "xmp",
  "frameset",
  "frame",
  "form",
  "base",
  "meta",
  "link",
] as const;

const DROP_CONTAINER_CLOSED_RE = new RegExp(
  `<(${DROP_WITH_CONTENT_TAGS.join("|")})(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>`,
  "gi"
);

const DROP_CONTAINER_UNCLOSED_RE = new RegExp(
  `<(${DROP_WITH_CONTENT_TAGS.join("|")})(?:\\s[^>]*)?>[\\s\\S]*$`,
  "gi"
);

const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ":",
  tab: "\t",
  newline: "\n",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  sol: "/",
  bsol: "\\",
  semi: ";",
  lpar: "(",
  rpar: ")",
  num: "#",
};

function decodeEntitiesForInspection(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/&#([0-9]+);?/g, (_, dec: string) => {
      const cp = Number.parseInt(dec, 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/&([a-z]+);?/gi, (full, name: string) => {
      const lower = name.toLowerCase();
      return lower in NAMED_ENTITY_MAP ? NAMED_ENTITY_MAP[lower] : full;
    });
}

function normalizeUriForSchemeCheck(raw: string): string {
  return decodeEntitiesForInspection(raw)
    .replace(/[\u0000-\u0020\u007f-\u00a0\s]+/g, "")
    .trim();
}

const SAFE_HREF_SCHEME_RE = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/|\\)|#)/i;

function isSafeHref(raw: string): boolean {
  const normalized = normalizeUriForSchemeCheck(raw);
  if (!normalized) return false;
  return SAFE_HREF_SCHEME_RE.test(normalized);
}

function isSafeSrc(raw: string): boolean {
  const normalized = normalizeUriForSchemeCheck(raw);
  if (!normalized) return false;
  if (/^\/(?!\/|\\)/.test(normalized)) {
    return true;
  }
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(normalized)) {
    return true;
  }
  return /^https?:\/\/[^\s/\\]/i.test(normalized);
}

function decodeCssForInspection(value: string): string {
  return decodeEntitiesForInspection(value)
    .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => {
      const cp = Number.parseInt(hex, 16);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff
        ? String.fromCodePoint(cp)
        : "";
    })
    .replace(/\\([^\r\n\f0-9a-fA-F])/g, "$1")
    .replace(/[\u0000-\u001f\u007f]+/g, "");
}

function splitCssDeclarations(css: string): string[] {
  const decls: string[] = [];
  let current = "";
  let parenDepth = 0;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "\\" && i + 1 < css.length) {
      current += ch + css[i + 1];
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") {
      parenDepth++;
      current += ch;
      continue;
    }
    if (ch === ")" && parenDepth > 0) {
      parenDepth--;
      current += ch;
      continue;
    }
    if (ch === ";" && parenDepth === 0) {
      if (current.trim()) decls.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) decls.push(current.trim());
  return decls;
}

const SAFE_INLINE_STYLE_PROP_RE =
  /^(?:color|background(?:-color)?|font(?:-(?:size|weight|style|family|variant))?|line-height|letter-spacing|word-spacing|text-(?:align|decoration(?:-line|-color|-style)?|transform|indent|overflow)|white-space|word-break|overflow-wrap|vertical-align|padding(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?|margin(?:-(?:top|right|bottom|left|inline(?:-start|-end)?|block(?:-start|-end)?))?|border(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?|border-(?:top-left-|top-right-|bottom-left-|bottom-right-)?radius|border-collapse|border-spacing|display|width|min-width|max-width|height|min-height|max-height|box-sizing|overflow(?:-[xy])?|gap|row-gap|column-gap|flex(?:-(?:direction|wrap|grow|shrink|basis))?|align-(?:items|self|content)|justify-(?:content|items|self)|grid(?:-(?:template-columns|template-rows|column|row|auto-flow))?|list-style(?:-type|-position)?|table-layout|position)$/;

export function sanitizeInlineStyle(rawStyle: string): string {
  if (!rawStyle || typeof rawStyle !== "string") return "";

  const wholeInspected = decodeCssForInspection(rawStyle);
  if (/(?:javascript|vbscript)\s*:/i.test(wholeInspected)) {
    return "";
  }

  const rawDecls = splitCssDeclarations(rawStyle);
  const keptDecls: string[] = [];

  for (const rawDecl of rawDecls) {
    const inspectedDecl = decodeCssForInspection(rawDecl).trim();
    if (!inspectedDecl) continue;

    if (
      inspectedDecl.startsWith("@") ||
      /@import|(?:url|expression|image-set)\s*\(|(?:javascript|vbscript|data)\s*:|behavior\s*:|-moz-binding/i.test(
        inspectedDecl
      )
    ) {
      continue;
    }

    const colonIdx = inspectedDecl.indexOf(":");
    if (colonIdx <= 0) continue;

    const prop = inspectedDecl.slice(0, colonIdx).trim().toLowerCase();
    const val = inspectedDecl.slice(colonIdx + 1).trim();
    const valNormalized = val.replace(/!important\s*$/i, "").trim().toLowerCase();
    if (!prop || !valNormalized) continue;

    // Block CSS phishing overlay & UI redressing declarations
    if (
      prop === "z-index" ||
      prop === "pointer-events" ||
      prop === "inset" ||
      prop.startsWith("inset-") ||
      prop === "top" ||
      prop === "right" ||
      prop === "bottom" ||
      prop === "left"
    ) {
      continue;
    }
    if (prop === "position" && !/^(?:static|relative)$/.test(valNormalized)) {
      continue;
    }
    if (
      /^margin(?:-[a-z]+)*$/.test(prop) &&
      (/^margin[^:]*:\s*-/i.test(inspectedDecl) || /(?:^|[\s,(])-\s*(?:\d|\.)/.test(valNormalized))
    ) {
      continue;
    }

    if (!SAFE_INLINE_STYLE_PROP_RE.test(prop)) {
      continue;
    }

    const rawClean = rawDecl
      .replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
      .replace(/[<>"'`]/g, "")
      .trim();
    const rawColonIdx = rawClean.indexOf(":");
    if (rawColonIdx <= 0) continue;
    const rawProp = rawClean.slice(0, rawColonIdx).trim().toLowerCase();
    const rawVal = rawClean.slice(rawColonIdx + 1).trim();
    if (!/^[a-z-]+$/.test(rawProp) || rawProp !== prop || !rawVal || /\\/.test(rawVal)) {
      continue;
    }

    keptDecls.push(`${rawProp}: ${rawVal}`);
  }

  if (keptDecls.length === 0) return "";
  const trailingSemi = rawStyle.trim().endsWith(";") ? ";" : "";
  return `${keptDecls.join("; ")}${trailingSemi}`;
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttrValue(raw: string): string {
  return raw
    .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const TAG_OR_TEXT_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>|[^<]+|</g;
const ATTR_RE =
  /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

export function sanitizeHtmlAllowlist(
  html: string,
  options: SanitizeHtmlOptions = {}
): string {
  if (!html || typeof html !== "string") return "";

  const allowedTags = new Set(
    (options.ALLOWED_TAGS ?? DEFAULT_ALLOWED_TAGS).map((t) => t.toLowerCase())
  );
  const allowedAttrs = new Set(
    (options.ALLOWED_ATTR ?? DEFAULT_ALLOWED_ATTR).map((a) => a.toLowerCase())
  );
  const allowDataAttr = options.ALLOW_DATA_ATTR === true;

  // 1. Strip comments, declarations, and dangerous container blocks with their content
  let working = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "");

  // Run twice to neutralize nested obfuscations like <scr<script>...</script>ipt>
  for (let pass = 0; pass < 2; pass++) {
    working = working
      .replace(DROP_CONTAINER_CLOSED_RE, "")
      .replace(DROP_CONTAINER_UNCLOSED_RE, "");
  }

  // 2. Tokenize tags vs text and rebuild only allowlisted markup
  const out: string[] = [];
  const tokens = working.match(TAG_OR_TEXT_RE) ?? [];

  for (const token of tokens) {
    if (token.startsWith("<!--")) {
      continue;
    }

    if (!token.startsWith("<")) {
      out.push(token.replace(/>/g, "&gt;"));
      continue;
    }

    if (token === "<") {
      out.push("&lt;");
      continue;
    }

    // Closing tag: </tag>
    const closeMatch = token.match(/^<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>$/);
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase();
      if (allowedTags.has(tag) && !VOID_TAGS.has(tag)) {
        out.push(`</${tag}>`);
      }
      continue;
    }

    // Opening / self-closing tag: <tag ...>
    const openMatch = token.match(/^<([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)>$/);
    if (!openMatch) {
      out.push(escapeHtml(token));
      continue;
    }

    const tag = openMatch[1].toLowerCase();
    if (!allowedTags.has(tag)) {
      continue;
    }

    const rawAttrs = openMatch[2] || "";
    const keptAttrs = new Map<string, string>();

    ATTR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = ATTR_RE.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const rawVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

      // Never allow inline event handlers or xmlns/xlink script vectors
      if (attrName.startsWith("on") || attrName.startsWith("xmlns")) {
        continue;
      }

      const isDataAttr = attrName.startsWith("data-");
      if (isDataAttr && !allowDataAttr) {
        continue;
      }
      if (!isDataAttr && !allowedAttrs.has(attrName)) {
        continue;
      }

      if (attrName === "href") {
        if (!isSafeHref(rawVal)) continue;
        keptAttrs.set(attrName, escapeAttrValue(rawVal.trim()));
      } else if (attrName === "src") {
        if (!isSafeSrc(rawVal)) continue;
        keptAttrs.set(attrName, escapeAttrValue(rawVal.trim()));
      } else if (attrName === "style") {
        const cleanStyle = sanitizeInlineStyle(rawVal);
        if (!cleanStyle) continue;
        keptAttrs.set(attrName, escapeAttrValue(cleanStyle));
      } else if (attrName === "target") {
        const cleanTarget = rawVal.trim();
        if (cleanTarget === "_blank" || cleanTarget === "_self") {
          keptAttrs.set("target", cleanTarget);
        }
      } else {
        keptAttrs.set(attrName, escapeAttrValue(rawVal));
      }
    }

    if (tag === "a" && keptAttrs.get("target") === "_blank" && allowedAttrs.has("rel")) {
      keptAttrs.set("rel", "noopener noreferrer");
    }

    const serializedAttrs = Array.from(keptAttrs.entries())
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
    const attrPart = serializedAttrs ? ` ${serializedAttrs}` : "";

    if (VOID_TAGS.has(tag)) {
      out.push(`<${tag}${attrPart} />`);
    } else {
      out.push(`<${tag}${attrPart}>`);
    }
  }

  return out.join("");
}

export const sanitizeHtmlIsomorphic = sanitizeHtmlAllowlist;
