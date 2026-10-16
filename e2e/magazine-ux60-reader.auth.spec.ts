/**
 * 👵 60대 독자 여정 UX 테스트 (감사 전용 — 앱 코드 수정 없음)
 *
 * 페르소나: 독자 R 박정자(64) — 갤럭시 S23(360×780, DPR3), 시스템 글꼴 '크게', 카카오톡 인앱 브라우저.
 * R0 카톡 미리보기(OG) · R1 첫 화면 · R2 본문 읽기 · R3 관심 매물 · R4 ROI 계산기 · R5 설문 · R6 중개인 연락
 * R7 구독(인라인 카드 + 구독 페이지 + 확인 페이지) · R8 아카이브/공유/뒤로가기 · R9 수신거부
 *
 * 큰 글꼴 근사: (a) html{font-size:130%} (rem 만 커짐) / (b) html.style.zoom=1.3 (WebView textZoom 근사)
 * 안전: 분석 비콘 차단, 모든 non-GET /api/** 는 mock(구독 검증 실패 1회만 실서버), Kakao SDK stub, tel: 기본동작 차단,
 *       /im-lite/** 문서 stub(LLM 유발 방지). E2E 픽스처(magazine_issues, content.e2e_fixture=E2E_UX60_R_*) 와
 *       E2E 구독자(pending, 0100000xxxx)는 afterAll 에서 정리.
 * 산출물: brain/93f8.../scratch/ux60/reader/*.png, reader_report.json
 */
import { test, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { issueUnsubToken } from '../src/domain/magazine/unsub-token';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const OUT = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\93f8ca59-e154-4bf8-adb4-2396b2b1ee90\\scratch\\ux60\\reader';
const PORT = Number(process.env.E2E_PORT || 3000);
const BASE = `http://localhost:${PORT}`;
const SLUG = 'test-broker-kim';
const BROKER_UUID = '204246a5-7c52-4549-9570-f089fbbf789c';
const BASE_ISSUE_DATE = '2026-10-04';
const REAL_OLD = '2026-09-20';
const FIX_CANDIDATES = ['2026-08-23', '2026-08-16', '2026-08-09', '2026-08-02', '2026-07-26', '2026-07-19'];
const TS = Date.now();
const TAG = `E2E_UX60_R_${TS}`;
const E2E_PHONE = '01000007241';
const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410800';
const SAMSUNG_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const KAKAO_SCRAP_UA = 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/';
const KAKAO_STUB = `window.Kakao={init:function(){},isInitialized:function(){return true},Share:{sendDefault:function(o){window.__kakaoShare=o;}}};`;
const VP = { width: 360, height: 780 };

type Mode = 'base' | 'a' | 'b';
/** UX60_MODES=b 처럼 주면 해당 글꼴 모드만 재측정 (부수효과 단계는 FULL 일 때만) */
const ONLY_MODES = process.env.UX60_MODES ? process.env.UX60_MODES.split(',') : null;
const FULL = !ONLY_MODES;
const M = (arr: Mode[]): Mode[] => (ONLY_MODES ? arr.filter((m) => ONLY_MODES.includes(m)) : arr);
type PollMock = 'ok' | '500' | 'slow';
type SubMock = 'pending_kakao' | 'pending_sent' | '500' | '429' | 'slow' | 'network';

// 서버 문구(route.ts)를 그대로 재현한 mock 응답 — 실제 쓰기 없이 성공 화면을 본다.
const MSG_ACCEPTED_SENT = '구독 신청이 접수되었습니다. 보내드린 확인 링크를 눌러 구독을 완료해 주세요.';
const MSG_NO_CONFIRM_CHANNEL = '구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없으며, 구독 확인이 끝나기 전에는 매거진이 발송되지 않습니다. 이메일 주소를 함께 입력해 다시 신청해 주세요.';

const rep: Record<string, any> = { tag: TAG, base: BASE, startedAt: new Date().toISOString() };
const blockedWrites: string[] = [];
let fixtureId: string | null = null;
let FIX_DATE = '';
let seededSubId: string | null = null;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function ensureOut() { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); }
function saveRep() { ensureOut(); fs.writeFileSync(path.join(OUT, 'reader_report.json'), JSON.stringify(rep, null, 1), 'utf8'); }
function viewer(date = FIX_DATE) { return `/magazine/${SLUG}/${date}`; }

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch (e: any) {
    (rep.errors ||= []).push(`${label}: ${String(e?.message || e).split('\n')[0].slice(0, 300)}`);
    return undefined;
  }
}

async function hideDev(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #__next-build-watcher { display: none !important; }' }).catch(() => {});
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } } = {}) {
  ensureOut();
  await hideDev(page);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, name), fullPage: !!opts.fullPage, clip: opts.clip, scale: 'css', timeout: 30000 }).catch((e) => {
    (rep.errors ||= []).push(`shot ${name}: ${String(e?.message || e).slice(0, 160)}`);
  });
  return name;
}

// ─────────────────────────────────────────────────────────────
// 컨텍스트 (카톡 인앱 · 큰 글꼴 · mock)
// ─────────────────────────────────────────────────────────────
interface CtxOpts { mode?: Mode; ua?: string; poll?: PollMock; sub?: SubMock; kakao?: 'stub' | 'block'; noShare?: boolean; perf?: boolean; allowUnsub?: boolean; viewport?: { width: number; height: number } }

async function readerCtx(browser: Browser, o: CtxOpts = {}): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: { cookies: [], origins: [] },
    viewport: o.viewport ?? VP,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: o.ua ?? KAKAO_UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
  });
  ctx.setDefaultTimeout(30000);
  ctx.setDefaultNavigationTimeout(120000);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  await ctx.addInitScript((cfg: { mode: Mode; noShare: boolean }) => {
    try {
      Object.defineProperty(Navigator.prototype, 'sendBeacon', {
        configurable: true,
        value: function (u: string) { ((window as any).__beacons ||= []).push(String(u)); return true; },
      });
    } catch { /* noop */ }
    if (cfg.noShare) { try { Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined }); } catch { /* noop */ } }
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="tel:"]');
      if (a) { e.preventDefault(); ((window as any).__tel ||= []).push(a.getAttribute('href')); }
    }, true);
    // LCP 관측
    try {
      new PerformanceObserver((l) => { for (const en of l.getEntries()) (window as any).__lcp = en.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* noop */ }
    if (cfg.mode === 'a' || cfg.mode === 'b') {
      // (b) 인라인 style 은 React 가 <html> 속성을 하이드레이션하며 지우므로 스타일시트로도 고정한다.
      const css = cfg.mode === 'a' ? 'html{font-size:130% !important}' : 'html{zoom:1.3 !important}';
      const add = () => {
        if (document.getElementById('__ux60_font')) return;
        const s = document.createElement('style'); s.id = '__ux60_font'; s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
      window.addEventListener('load', add);
    }
  }, { mode: o.mode ?? 'base', noShare: !!o.noShare });

  // 1) catch-all: 모든 쓰기 mock (가장 먼저 등록 → 가장 나중에 평가)
  await ctx.route(o.perf ? '**/api/**' : '**/*', async (route) => {
    const req = route.request();
    const m = req.method();
    const url = req.url();
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(m);
    if (isWrite && (/\/api\//.test(url) || /\/rest\/v1\//.test(url) || req.headers()['next-action'])) {
      blockedWrites.push(`${m} ${url.replace(BASE, '').slice(0, 120)}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mocked: true }) });
    }
    return route.fallback();
  });
  // 2) 분석 비콘 차단
  await ctx.route('**/api/public/magazine/analytics**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"e2e":"blocked"}' }));
  // 2-1) R9 전용: 수신거부 폼 POST 실서버 통과 (E2E/가상 구독자 토큰만 사용)
  if (o.allowUnsub) await ctx.route('**/api/public/magazine/unsubscribe**', (r) => r.continue());
  // 3) Kakao SDK
  await ctx.route('**/kakao_js_sdk/**', (r) => (o.kakao === 'block' ? r.abort() : r.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB })));
  // 4) IM(투자설명서) 문서 stub — LLM/IM 경로 유발 금지
  await ctx.route('**/im-lite/**', (r) => (r.request().resourceType() === 'document'
    ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><meta charset="utf-8"><title>im-lite stub</title><p>e2e stub (투자설명서)</p>' })
    : r.abort()));
  // 5) 설문 POST mock
  await ctx.route('**/api/public/magazine/poll**', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    blockedWrites.push('POST poll (mock)');
    const mode = o.poll ?? 'ok';
    if (mode === '500') return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    if (mode === 'slow') await new Promise((res) => setTimeout(res, 5000));
    let choice = 0; try { choice = Number(JSON.parse(r.request().postData() || '{}').choice) || 0; } catch { /* noop */ }
    const counts: Record<number, number> = { 0: 3, 1: 2, 2: 1 }; counts[choice] = (counts[choice] || 0) + 1;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, alreadyVoted: false, results: { total: 7, counts } }) });
  });
  // 6) 구독 POST mock
  await ctx.route('**/api/public/magazine/subscribe**', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* noop */ }
    (rep.subscribePosts ||= []).push({ mock: o.sub ?? 'auto', channel: body.channel, hasEmail: !!body.email, phoneDigits: String(body.phone || '').length, consent: body.consent, source: body.source, tags: body.tags });
    blockedWrites.push('POST subscribe (mock)');
    const mode = o.sub ?? (body.email ? 'pending_sent' : 'pending_kakao');
    if (mode === 'network') return r.abort('internetdisconnected');
    if (mode === '500') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'INTERNAL', message: '일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' } }) });
    if (mode === '429') return r.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '3600' }, body: JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' } }) });
    if (mode === 'slow') await new Promise((res) => setTimeout(res, 5000));
    if (mode === 'pending_kakao' || (mode === 'slow' && !body.email)) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'pending', pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL', message: MSG_NO_CONFIRM_CHANNEL }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'pending', message: MSG_ACCEPTED_SENT }) });
  });
  return ctx;
}

async function gotoViewer(page: Page, url = viewer()) {
  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(async () => page.goto(url, { waitUntil: 'load', timeout: 120000 }));
  await page.locator('#roi-price-range').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { status: resp?.status() ?? null, ms: Date.now() - t0 };
}

// ─────────────────────────────────────────────────────────────
// 측정 (폰트·대비·터치·넘침·용어·이모지·섹션)
// ─────────────────────────────────────────────────────────────
async function metrics(page: Page, scopeSel?: string) {
  return page.evaluate((scope) => {
    const W = window.innerWidth; const H = window.innerHeight;
    const root: Element = (scope && document.querySelector(scope)) || document.body;
    const probe = document.createElement('span'); probe.style.fontSize = '16px'; probe.textContent = 'M'; document.body.appendChild(probe);
    const pfs = parseFloat(getComputedStyle(probe).fontSize); const pz = (probe as any).currentCSSZoom ?? 1; probe.remove();
    const zoomMult = Math.abs(pfs - 16) < 0.5 ? pz : 1;
    const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1;
    const cx = cv.getContext('2d', { willReadFrequently: true })!;
    const cache = new Map<string, { r: number; g: number; b: number; a: number }>();
    const rgba = (c: string) => {
      const hit = cache.get(c); if (hit) return hit;
      cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data; const v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; cache.set(c, v); return v;
    };
    const bgOf = (el: Element | null) => {
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      let e: Element | null = el;
      while (e) {
        const cs = getComputedStyle(e);
        const bi = cs.backgroundImage;
        if (bi && bi !== 'none' && /gradient/.test(bi)) {
          const m = bi.match(/(rgba?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|lab\([^)]+\)|#[0-9a-fA-F]{3,8})/);
          if (m) { const g = rgba(m[1]); if (g.a > 0) layers.push(g); if (g.a >= 0.99) break; }
        }
        const c = rgba(cs.backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 0.99) break;
        e = e.parentElement;
      }
      let base = { r: 255, g: 255, b: 255 };
      for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; base = { r: L.r * L.a + base.r * (1 - L.a), g: L.g * L.a + base.g * (1 - L.a), b: L.b * L.a + base.b * (1 - L.a) }; }
      return base;
    };
    const lum = (c: { r: number; g: number; b: number }) => {
      const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const contrast = (el: Element) => {
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      const fg0 = rgba(cs.color);
      let op = 1; let e: Element | null = el; while (e) { op *= parseFloat(getComputedStyle(e).opacity || '1'); e = e.parentElement; }
      const a = fg0.a * op;
      const fg = { r: fg0.r * a + bg.r * (1 - a), g: fg0.g * a + bg.g * (1 - a), b: fg0.b * a + bg.b * (1 - a) };
      const L1 = lum(fg); const L2 = lum(bg);
      return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || cs.visibility === 'hidden' || cs.display === 'none') return false;
      if ((el as HTMLElement).closest('[hidden]')) return false;
      return true;
    };
    // 텍스트
    const seen = new Set<Element>();
    const texts: any[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement; if (!el || seen.has(el)) continue;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
      if (el.closest('nextjs-portal')) continue;
      if (!visible(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const fs = Math.round(parseFloat(cs.fontSize) * zoomMult * 10) / 10;
      texts.push({ fs, cr: contrast(el), t: t.slice(0, 40), w: cs.fontWeight, sec: el.closest('[data-section-id]')?.getAttribute('data-section-id') || '', y: Math.round(r.top + window.scrollY), fixed: !!el.closest('[data-magazine-bottom-bar]'), emojiOnly: /^[\p{Extended_Pictographic}\uFE0F\u200d\s]+$/u.test(t) });
    }
    const big = (r: any) => r.fs >= 18.66 || (r.fs >= 14 && Number(r.w) >= 700); // WCAG large text
    const textSum = {
      total: texts.length,
      lt12: texts.filter((r) => r.fs < 12).length,
      lt14: texts.filter((r) => r.fs < 14 && !r.emojiOnly).length,
      lt16: texts.filter((r) => r.fs < 16 && !r.emojiOnly).length,
      byFs: texts.reduce((acc: Record<string, number>, r) => { acc[String(r.fs)] = (acc[String(r.fs)] || 0) + 1; return acc; }, {}),
      crLt45: texts.filter((r) => !r.emojiOnly && r.cr < (big(r) ? 3 : 4.5)).length,
      crLt7: texts.filter((r) => !r.emojiOnly && r.cr < (big(r) ? 4.5 : 7)).length,
      minFs: texts.length ? Math.min(...texts.filter((r) => !r.emojiOnly).map((r) => r.fs)) : null,
    };
    const lt14Items = texts.filter((r) => r.fs < 14 && !r.emojiOnly).map((r) => `${r.fs}px cr${r.cr} [${r.sec || (r.fixed ? 'bar' : '-')}] ${r.t}`);
    const crItems = texts.filter((r) => !r.emojiOnly && r.cr < (big(r) ? 3 : 4.5)).map((r) => `cr${r.cr} ${r.fs}px [${r.sec || '-'}] ${r.t}`);
    const fold = texts.filter((r) => r.y - window.scrollY < H && r.y - window.scrollY >= 0).map((r) => `${r.fs}|${r.t}`);
    // 터치 타깃
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary,label[for]';
    const targets: any[] = [];
    for (const el of Array.from(root.querySelectorAll(sel)) as HTMLElement[]) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const label = txt || el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el as HTMLInputElement).value || el.getAttribute('title') || '';
      targets.push({
        tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', label: label.slice(0, 30),
        w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + window.scrollY),
        iconOnly: !txt && !!el.querySelector('svg') && el.tagName !== 'INPUT',
        im: el.getAttribute('inputmode') || '', href: (el.getAttribute('href') || '').slice(0, 80),
        sec: el.closest('[data-section-id]')?.getAttribute('data-section-id') || (el.closest('[data-magazine-bottom-bar]') ? 'bar' : ''),
      });
    }
    const small = targets.filter((t) => t.w < 48 || t.h < 48);
    // 넘침/잘림
    const hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    const over: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= W + 1) continue;
      let p: HTMLElement | null = el.parentElement; let contained = false;
      while (p && p !== document.body) { const ox = getComputedStyle(p).overflowX; if (/(auto|scroll|hidden|clip)/.test(ox)) { contained = true; break; } p = p.parentElement; }
      if (contained) continue;
      if (el.parentElement && el.parentElement.getBoundingClientRect().right > W + 1) continue;
      over.push(`${el.tagName.toLowerCase()}.${String(el.className || '').slice(0, 40)} right=${Math.round(r.right)} "${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 30)}"`);
      if (over.length > 15) break;
    }
    const clipped: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*')) as HTMLElement[]) {
      const cs = getComputedStyle(el);
      const lc = (cs as any).webkitLineClamp;
      if (((lc && lc !== 'none') && el.scrollHeight > el.clientHeight + 2) || (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)) {
        if (visible(el)) clipped.push(`[${el.closest('[data-section-id]')?.getAttribute('data-section-id') || (el.closest('[data-magazine-bottom-bar]') ? 'bar' : '-')}] ${(el.innerText || '').replace(/\s+/g, ' ').slice(0, 50)}`);
      }
      if (clipped.length > 20) break;
    }
    const scrollers = (Array.from(root.querySelectorAll('*')) as HTMLElement[]).filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 4)
      .map((el) => `${el.tagName.toLowerCase()} [${el.closest('[data-section-id]')?.getAttribute('data-section-id') || '-'}] sw=${el.scrollWidth} cw=${el.clientWidth}`);
    // 용어·이모지·숫자
    const txt = (root as HTMLElement).innerText || '';
    const eng: Record<string, number> = {};
    for (const m of txt.matchAll(/[A-Za-z][A-Za-z0-9&\-.]*(?:[ -](?:Rate|Flow|on-Cash|Cash|Verified|by|Data)[A-Za-z]*)?/g)) { const k = m[0].replace(/[.\-]+$/, ''); if (k.length >= 2) eng[k] = (eng[k] || 0) + 1; }
    const emoji = (txt.match(/\p{Extended_Pictographic}/gu) || []).length;
    const nums = {
      eok: (txt.match(/\d[\d,.]*\s*억/g) || []).length,
      man: (txt.match(/\d[\d,.]*\s*만/g) || []).length,
      pct: (txt.match(/\d[\d,.]*\s*%/g) || []).length,
      rawLong: (txt.match(/\b\d{5,}\b/g) || []).slice(0, 10),
      isoDates: (txt.match(/\b20\d\d-\d\d-\d\d\b/g) || []).slice(0, 10),
      source: (txt.match(/출처/g) || []).length,
      asOf: (txt.match(/기준/g) || []).length,
      ai: (txt.match(/AI/g) || []).length,
    };
    const sections = Array.from(document.querySelectorAll('main [data-section-id]')).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-section-id'), h2: (el.querySelector('h2,h1')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: Math.round(r.height), y: Math.round(r.top + window.scrollY) };
    });
    const collapsed = Array.from(root.querySelectorAll('[aria-expanded="false"]')).map((e) => ((e as HTMLElement).innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 40));
    const closedDetails = Array.from(root.querySelectorAll('details:not([open]) > summary')).map((e) => ((e as HTMLElement).innerText || '').slice(0, 40));
    const bar = document.querySelector('[data-magazine-bottom-bar]') as HTMLElement | null;
    const br = bar?.getBoundingClientRect();
    const h1 = document.querySelector('h1'); const h1r = h1?.getBoundingClientRect();
    return {
      W, H, zoomMult, calib: { probeFs: pfs, probeZoom: pz, h1Fs: h1 ? getComputedStyle(h1).fontSize : null, h1H: h1r ? Math.round(h1r.height) : null },
      scrollH: document.documentElement.scrollHeight, screens: Math.round((document.documentElement.scrollHeight / H) * 10) / 10,
      textSum, lt14Items: lt14Items.slice(0, 80), crItems: crItems.slice(0, 40), fold: fold.slice(0, 40),
      targetsN: targets.length, smallN: small.length, small: small.slice(0, 60).map((t) => `${t.w}x${t.h} ${t.tag}${t.type ? ':' + t.type : ''} [${t.sec || '-'}] ${t.label}${t.iconOnly ? ' (아이콘만)' : ''}`),
      iconOnly: targets.filter((t) => t.iconOnly).map((t) => `${t.tag} ${t.label}`),
      inputs: targets.filter((t) => ['input', 'textarea', 'select'].includes(t.tag)).map((t) => `${t.type || t.tag} im=${t.im} ${t.w}x${t.h} ${t.label}`),
      tels: targets.filter((t) => t.href.startsWith('tel:')).map((t) => `${t.w}x${t.h} [${t.sec}] ${t.label}`),
      hScroll, over, clipped, scrollers, eng, emoji, nums, sections, collapsed, closedDetails,
      bar: br ? { top: Math.round(br.top), h: Math.round(br.height), hidden: bar!.getAttribute('aria-hidden') === 'true', text: (bar!.innerText || '').replace(/\s+/g, ' ') } : null,
    };
  }, scopeSel ?? null);
}

/** 화면 단위로 스크롤하며 캡처 (스크롤 화면 수 = 파일 수) */
async function screens(page: Page, prefix: string, max = 30) {
  const H = await page.evaluate(() => window.innerHeight);
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const files: string[] = [];
  let i = 0;
  for (let y = 0; y < total && i < max; y += H, i++) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(250);
    files.push(await shot(page, `${prefix}_s${String(i + 1).padStart(2, '0')}.png`));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return { count: files.length, total, H };
}

async function expandAll(page: Page) {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('main [aria-expanded="false"]').forEach((b) => { (b as HTMLElement).click(); n++; });
    document.querySelectorAll('main details:not([open])').forEach((d) => { (d as HTMLDetailsElement).open = true; n++; });
    return n;
  });
}

async function toastWatch(page: Page, maxMs = 12000) {
  const t0 = Date.now(); let firstSeen: number | null = null; let lastSeen: number | null = null; let text = '';
  while (Date.now() - t0 < maxMs) {
    const t = await page.evaluate(() => Array.from(document.querySelectorAll('[data-sonner-toast]')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ')).join(' | ')).catch(() => '');
    if (t) { if (firstSeen === null) firstSeen = Date.now() - t0; lastSeen = Date.now() - t0; text = t; } else if (firstSeen !== null) break;
    await page.waitForTimeout(200);
  }
  return { text, visibleMs: firstSeen !== null && lastSeen !== null ? lastSeen - firstSeen : 0, firstSeenMs: firstSeen };
}

async function toastShot(page: Page, name: string) {
  for (let i = 0; i < 15; i++) {
    const has = await page.locator('[data-sonner-toast]').count().catch(() => 0);
    if (has) { await shot(page, name); return true; }
    await page.waitForTimeout(100);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// 픽스처 (실제 발행본 복제 + 설문/세무/현장노트/테마/시장온도)
// ─────────────────────────────────────────────────────────────
async function createFixture() {
  const db = sb();
  const { data: stale } = await db.from('magazine_issues').select('id, tag:content->>e2e_fixture').filter('content->>e2e_fixture', 'like', 'E2E_UX60_R_%');
  for (const r of (stale || []) as any[]) { if (Date.now() - Number(String(r.tag).replace('E2E_UX60_R_', '')) > 30 * 60_000) await db.from('magazine_issues').delete().eq('id', r.id); }
  const { data: base, error: baseErr } = await db.from('magazine_issues').select('content').eq('broker_id', SLUG).eq('issue_date', BASE_ISSUE_DATE).maybeSingle();
  if (baseErr || !base?.content) throw new Error(`base issue 없음 ${baseErr?.message}`);
  const { data: older } = await db.from('magazine_issues').select('content').eq('broker_id', SLUG).eq('issue_date', REAL_OLD).maybeSingle();
  const { data: taken } = await db.from('magazine_issues').select('issue_date').in('broker_id', [SLUG, BROKER_UUID]).in('issue_date', FIX_CANDIDATES);
  const takenSet = new Set((taken || []).map((r: any) => r.issue_date));
  const date = FIX_CANDIDATES.find((d) => !takenSet.has(d));
  if (!date) throw new Error('픽스처 빈 날짜 없음');
  const c: any = JSON.parse(JSON.stringify(base.content));
  delete c.id;
  c.issueDate = date;
  c.keyStats = (Array.isArray(c.keyStats) ? c.keyStats : []).filter((s: any) => !/62\s*\/\s*100/.test(String(s?.value)) && s?.label !== '시장 상태');
  delete c.sentiment;
  if (older?.content?.rentalTrend) c.rentalTrend = older.content.rentalTrend;
  if (older?.content?.commercialDistrict) c.commercialDistrict = older.content.commercialDistrict;
  c.market_temp = '선별 매수';
  c.cover_keywords = ['공실 양극화', '강남', '꼬마빌딩'];
  c.field_note = {
    question: '이번 주 강남 꼬마빌딩 매수 문의가 지난주보다 늘었습니다.',
    buyerReaction: '1층 임차인이 확정된 건물 위주로 문의가 집중됩니다.',
    sellerReaction: '호가를 낮추기보다 임대 조건을 조정하려는 분이 많습니다.',
    marketJudgment: '역세권·1층 가시성이 좋은 물건만 거래되는 선별 장세입니다.',
    comment: '매각을 고민하신다면 공실부터 채우는 것이 먼저입니다.',
  };
  c.theme_title = '공실 시대, 1층이 건물값을 좌우한다';
  c.theme_body_md = '1층 임차인의 업종과 계약 기간이 매수자의 가격 판단에 가장 큰 영향을 줍니다. 공실이 길어지면 NOI가 줄고 Cap Rate 기준 가격도 내려갑니다.';
  c.theme_asset_types = ['오피스빌딩'];
  c.poll = {
    question: '이번 분기 강남 꼬마빌딩, 어떻게 보시나요?',
    options: [
      { label: '지금이 매수 적기', intent: 'buyer' },
      { label: '가격 조정 후 매수', intent: 'neutral' },
      { label: '보유 건물 매각 검토', intent: 'seller' },
    ],
  };
  c.tax_clinic = {
    question: '법인 명의로 꼬마빌딩을 취득하면 세금이 어떻게 달라지나요?',
    answer: '법인은 취득세·보유세·양도 시 과세 방식이 개인과 다릅니다. 취득 전에 세무사와 함께 검토하세요.',
    source: '지방세법 제13조 (일반 안내)',
    asOf: date,
    disclaimer: '일반 정보이며 세무 자문이 아닙니다. 실제 신고 전 세무사와 상담하세요.',
  };
  c.e2e_fixture = TAG;
  const { data: ins, error } = await db.from('magazine_issues').insert({ broker_id: SLUG, issue_date: date, content: c }).select('id').single();
  if (error || !ins) throw new Error(`fixture insert 실패 ${error?.message}`);
  fixtureId = ins.id; FIX_DATE = date;
  rep.fixture = { id: ins.id, date, base: BASE_ISSUE_DATE, deals: (c.dealHighlights || []).length, brokerHasPhone: !!c.broker?.phone, brokerHasKakao: !!(c.broker?.kakaoUrl || c.broker?.kakao_url), brokerCompany: c.broker?.company ?? null, brokerPhoto: c.broker?.photoUrl ?? null };
}

// ═════════════════════════════════════════════════════════════
test.describe.configure({ mode: 'default' });

test.describe('👵 UX60 독자 여정 (박정자, 64세)', () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(1_800_000);
    ensureOut();
    await safe('fixture', createFixture);
    // 첫 컴파일 워밍업 (측정 왜곡 방지)
    const ctx = await readerCtx(browser);
    const page = await ctx.newPage();
    const urls = [viewer(), `/magazine/${SLUG}`, `/magazine/${SLUG}/subscribe`, `/magazine/${SLUG}/2026-01-04`,
      `/api/og/magazine?brokerId=${SLUG}&date=${FIX_DATE}`, `/api/public/magazine/unsubscribe?t=x`, `/broker-profile/${SLUG}`, '/privacy'];
    for (const u of urls) await safe(`warm ${u}`, async () => { await page.goto(u, { waitUntil: 'load', timeout: 180000 }); await page.waitForTimeout(800); });
    await ctx.close();
    saveRep();
  });

  test.afterAll(async () => {
    const db = sb();
    const cleanup: Record<string, any> = {};
    if (fixtureId) {
      const { error } = await db.from('magazine_issues').delete().eq('id', fixtureId);
      const { count } = await db.from('magazine_issues').select('id', { count: 'exact', head: true }).eq('id', fixtureId);
      cleanup.fixture = { id: fixtureId, remaining: count, error: error?.message ?? null };
    }
    const { data: stray } = await db.from('magazine_issues').select('id').filter('content->>e2e_fixture', 'eq', TAG);
    cleanup.strayFixture = stray?.length ?? 0;
    if (seededSubId) {
      const ev = await db.from('activity_events').delete().eq('entity_id', seededSubId);
      const s = await db.from('magazine_subscribers').delete().eq('id', seededSubId);
      const { count } = await db.from('magazine_subscribers').select('id', { count: 'exact', head: true }).eq('id', seededSubId);
      cleanup.seededSub = { id: seededSubId.slice(0, 8), remaining: count, evErr: ev.error?.message ?? null, subErr: s.error?.message ?? null };
    }
    const { data: phoneRows } = await db.from('magazine_subscribers').select('id').or(`subscriber_phone.eq.${E2E_PHONE},subscriber_phone.eq.010-0000-7241,phone_e164.eq.+821000007241`);
    cleanup.e2ePhoneRowsLeft = phoneRows?.length ?? 0;
    for (const r of (phoneRows || []) as any[]) await db.from('magazine_subscribers').delete().eq('id', r.id);
    rep.cleanup = cleanup;
    rep.blockedWrites = Array.from(new Set(blockedWrites)).slice(0, 80);
    rep.finishedAt = new Date().toISOString();
    saveRep();
    console.log('cleanup', JSON.stringify(cleanup));
  });

  // ── R0 카톡 채팅방 미리보기 ─────────────────────────────────
  test('R0 카톡 미리보기 (OG)', async ({ browser, request }) => {
    test.setTimeout(600_000);
    const r0: Record<string, any> = {};
    rep.R0 = r0;
    await safe('R0 meta', async () => {
      const res = await request.get(`${BASE}${viewer()}`, { headers: { 'user-agent': KAKAO_SCRAP_UA }, timeout: 120000 });
      const html = await res.text();
      const meta = (p: string) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]+content="([^"]*)"`)) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${p}"`)); return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : null; };
      r0.status = res.status();
      r0.title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] ?? null;
      r0.ogTitle = meta('og:title'); r0.ogDesc = meta('og:description'); r0.ogImage = meta('og:image'); r0.ogUrl = meta('og:url'); r0.ogSite = meta('og:site_name');
      r0.desc = meta('description'); r0.twCard = meta('twitter:card');
    });
    await safe('R0 og image', async () => {
      const ogPath = `/api/og/magazine?brokerId=${encodeURIComponent(SLUG)}&date=${encodeURIComponent(FIX_DATE)}`;
      r0.shareCodeOgUrl = ogPath;
      const img = await request.get(`${BASE}${ogPath}`, { timeout: 120000 });
      const buf = await img.body();
      r0.ogStatus = img.status(); r0.ogType = img.headers()['content-type']; r0.ogBytes = buf.length;
      if (buf.slice(1, 4).toString('ascii') === 'PNG') r0.ogSize = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
      ensureOut(); fs.writeFileSync(path.join(OUT, 'R0_og_full.png'), buf);
      const b64 = buf.toString('base64');
      const title = r0.ogTitle || r0.title || ''; const desc = r0.ogDesc || '';
      const domain = (() => { try { return new URL(r0.ogUrl || 'https://credeal.net').host; } catch { return 'credeal.net'; } })();
      const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{margin:0;background:#b2c7da;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
        .row{display:flex;gap:8px;padding:14px 10px}
        .av{width:38px;height:38px;border-radius:14px;background:#8aa;flex:none}
        .name{font-size:12px;color:#333;margin-bottom:4px}
        .msg{background:#fff;border-radius:4px 14px 14px 14px;padding:8px 10px;font-size:14px;max-width:250px;margin-bottom:6px;word-break:keep-all}
        .card{width:250px;background:#fff;border-radius:6px;overflow:hidden}
        .card img{width:250px;height:${Math.round(250 * 630 / 1200)}px;object-fit:cover;display:block}
        .t{font-size:14px;font-weight:700;color:#111;padding:8px 10px 2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .d{font-size:12px;color:#777;padding:0 10px 2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .u{font-size:11px;color:#aaa;padding:2px 10px 8px}
      </style></head><body>
        <div class="row"><div class="av"></div><div><div class="name">김중개 (단톡/1:1 발신자)</div>
          <div class="msg">${esc(`https://${domain}${viewer()}`)}</div>
          <div class="card"><img src="data:image/png;base64,${b64}"><div class="t">${esc(title)}</div><div class="d">${esc(desc)}</div><div class="u">${esc(domain)}</div></div>
        </div></div></body></html>`);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, 'R0_kakao_link_preview_360.png') });
      await page.locator('.card img').screenshot({ path: path.join(OUT, 'R0_og_at_250css_dpr3.png') });
      await ctx.close();
      // 1:1 축소 (DPR1 250px) — 저해상 기기/썸네일 근사
      const ctx1 = await browser.newContext({ viewport: { width: 260, height: 160 }, deviceScaleFactor: 1 });
      const p1 = await ctx1.newPage();
      await p1.setContent(`<body style="margin:0;background:#fff"><img src="data:image/png;base64,${b64}" style="width:250px;display:block"></body>`);
      await p1.locator('img').screenshot({ path: path.join(OUT, 'R0_og_at_250css_dpr1.png') });
      await ctx1.close();
    });
    saveRep();
  });

  // ── R1 첫 화면 + 로딩 (Slow4G + CPU4x) ─────────────────────
  test('R1 첫 화면 · 로딩 체감', async ({ browser }) => {
    test.setTimeout(900_000);
    const r1: Record<string, any> = {};
    rep.R1 = r1;
    // (1) 정상 네트워크 3모드 접힘 위
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R1 fold ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode });
        const page = await ctx.newPage();
        const nav = await gotoViewer(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `R1_fold_${mode}.png`);
        const m = await metrics(page);
        r1[`fold_${mode}`] = { nav, fold: m.fold, bar: m.bar, calib: m.calib, zoomMult: m.zoomMult, headerH: await page.locator('header[data-section-id="cover"]').evaluate((e) => Math.round(e.getBoundingClientRect().height)).catch(() => null) };
        await ctx.close();
      });
    }
    // (2) Slow 4G + CPU 4x, 1회
    if (FULL) await safe('R1 slow4g', async () => {
      const ctx = await readerCtx(browser, { perf: true });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now();
      const marks: Record<string, number | null> = { h1: null, bar: null, roi: null, subscribe: null };
      const shots: string[] = [];
      const navP = page.goto(viewer(), { waitUntil: 'load', timeout: 300000 }).catch((e) => { r1.slowNavErr = String(e).slice(0, 120); });
      const plan = [500, 1000, 2000, 3000, 5000, 8000, 12000, 20000, 30000];
      let pi = 0;
      while (Date.now() - t0 < 60000) {
        const el = Date.now() - t0;
        if (marks.h1 === null && await page.locator('h1').first().isVisible().catch(() => false)) marks.h1 = el;
        if (marks.bar === null && await page.locator('[data-magazine-bottom-bar]').first().isVisible().catch(() => false)) marks.bar = el;
        if (marks.roi === null && await page.locator('#roi-price-range').count().catch(() => 0)) marks.roi = el;
        if (marks.subscribe === null && await page.locator('[data-section-id="subscribe_cta"] form button[type="submit"]').count().catch(() => 0)) marks.subscribe = el;
        if (pi < plan.length && el >= plan[pi]) { shots.push(`R1_slow_${plan[pi]}ms.png`); await page.screenshot({ path: path.join(OUT, `R1_slow_${plan[pi]}ms.png`), scale: 'css', timeout: 15000 }).catch(() => {}); pi++; }
        if (marks.h1 !== null && marks.bar !== null && marks.roi !== null && pi >= 7) break;
        await page.waitForTimeout(150);
      }
      await navP;
      const perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        return {
          ttfb: nav ? Math.round(nav.responseStart) : null, dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav ? Math.round(nav.loadEventEnd) : null,
          fcp: fcp ? Math.round(fcp.startTime) : null, lcp: Math.round((window as any).__lcp || 0) || null,
          jsKB: Math.round(res.filter((r) => /\.js(\?|$)/.test(r.name)).reduce((a, r) => a + (r.transferSize || 0), 0) / 1024),
          docKB: nav ? Math.round((nav.transferSize || 0) / 1024) : null,
        };
      });
      r1.slow4g = { marksMs: marks, perf, shots, note: 'dev 서버(next dev) 기준 — 운영 빌드보다 JS 가 크고 느림. 상대 지표.' };
      await ctx.close();
    });
    // (3) 문서 응답 5초 지연 (엘리베이터/지하) — 빈 화면 구간
    if (FULL) await safe('R1 doc delay', async () => {
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      await page.route(`**${viewer()}`, async (route) => { if (route.request().resourceType() === 'document') await new Promise((r) => setTimeout(r, 5000)); return route.fallback(); });
      const p = page.goto(viewer(), { waitUntil: 'load', timeout: 180000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(OUT, 'R1_docdelay_2s.png'), scale: 'css' }).catch(() => {});
      const blank = await page.evaluate(() => ({ url: location.href, text: (document.body?.innerText || '').slice(0, 80) })).catch(() => null);
      await p;
      r1.docDelay = { at2s: blank, note: '카톡 인앱은 상단 진행바만 보이고 본문은 빈 화면(이전 채팅 화면 유지)' };
      await ctx.close();
    });
    // (4) 미발행 날짜 / 없는 중개사
    if (FULL) await safe('R1 states', async () => {
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      const s1 = await page.goto(`/magazine/${SLUG}/2026-01-04`, { waitUntil: 'load', timeout: 120000 });
      await shot(page, 'R1_unpublished.png');
      const t1 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 400));
      const m1 = await metrics(page);
      const s2 = await page.goto(`/magazine/no-such-broker-ux60/${FIX_DATE}`, { waitUntil: 'load', timeout: 120000 });
      await shot(page, 'R1_no_broker.png');
      const t2 = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300));
      r1.states = { unpublished: { status: s1?.status(), text: t1, small: m1.small, lt14: m1.lt14Items }, noBroker: { status: s2?.status(), text: t2 } };
      await ctx.close();
    });
    // (5) 삼성 인터넷 UA 비교
    if (FULL) await safe('R1 samsung', async () => {
      const ctx = await readerCtx(browser, { ua: SAMSUNG_UA });
      const page = await ctx.newPage();
      await gotoViewer(page);
      await shot(page, 'R1_fold_samsung.png');
      const m = await metrics(page);
      r1.samsung = { screens: m.screens, lt14: m.textSum.lt14, small: m.smallN, bar: m.bar };
      await ctx.close();
    });
    saveRep();
  });

  // ── R2 본문 읽기 (3모드 측정) ───────────────────────────────
  test('R2 본문 읽기', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const r2: Record<string, any> = {};
    rep.R2 = r2;
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R2 ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const m = await metrics(page);
        const sc = await screens(page, `R2_${mode}`, mode === 'base' ? 30 : 40);
        const opened = await expandAll(page);
        await page.waitForTimeout(500);
        const m2 = await metrics(page);
        if (mode === 'base') await shot(page, 'R2_base_full_expanded.png', { fullPage: true });
        r2[mode] = {
          screens: m.screens, screenShots: sc.count, scrollH: m.scrollH, sections: m.sections, textSum: m.textSum, lt14Items: m.lt14Items, crItems: m.crItems,
          smallN: m.smallN, small: m.small, iconOnly: m.iconOnly, hScroll: m.hScroll, over: m.over, clipped: m.clipped, scrollers: m.scrollers,
          eng: m.eng, emoji: m.emoji, nums: m.nums, collapsed: m.collapsed, closedDetails: m.closedDetails, calib: m.calib, zoomMult: m.zoomMult,
          afterExpand: { opened, screens: m2.screens, lt14: m2.textSum.lt14, textTotal: m2.textSum.total, collapsedLeft: m2.collapsed.length, eng: m2.eng },
        };
        if (mode === 'base') {
          r2.base.sectionText = await page.evaluate(() => Array.from(document.querySelectorAll('main [data-section-id]')).map((el) => `### ${el.getAttribute('data-section-id')}\n${(el as HTMLElement).innerText.replace(/\n{2,}/g, '\n').slice(0, 900)}`));
          r2.base.footer = await page.evaluate(() => (document.querySelector('footer') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').slice(0, 400) ?? null);
        }
        await ctx.close();
      });
    }
    saveRep();
  });

  // ── R3 관심 매물 ────────────────────────────────────────────
  test('R3 관심 매물', async ({ browser }) => {
    test.setTimeout(600_000);
    const r3: Record<string, any> = {};
    rep.R3 = r3;
    await safe('R3', async () => {
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      await gotoViewer(page);
      const sec = page.locator('[data-section-id="featured_deals"]');
      r3.present = await sec.count();
      if (!r3.present) { await ctx.close(); return; }
      await sec.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
      await shot(page, 'R3_deals.png');
      r3.cards = await sec.evaluate((root) => Array.from(root.querySelectorAll('li')).map((li) => {
        const r = li.getBoundingClientRect();
        return { x: Math.round(r.left), w: Math.round(r.width), text: (li as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 120), links: Array.from(li.querySelectorAll('a')).map((a) => `${(a as HTMLElement).innerText.trim()} → ${a.getAttribute('href')}`) };
      }));
      r3.m = await metrics(page, '[data-section-id="featured_deals"]');
      const theme = page.locator('[data-section-id="theme_of_week"]');
      if (await theme.count()) { await theme.scrollIntoViewIfNeeded(); await shot(page, 'R3_theme.png'); r3.theme = await theme.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 500)); }
      // 가로 스와이프로 다음 카드 보기
      const ul = sec.locator('ul').first();
      r3.scroller = await ul.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, snap: getComputedStyle(e).scrollSnapType, scrollbar: getComputedStyle(e).scrollbarWidth }));
      await ul.evaluate((e) => e.scrollBy({ left: 270 }));
      await page.waitForTimeout(400);
      await shot(page, 'R3_deals_swiped.png');
      // '상세 정보' → 매물 상세
      const detail = sec.getByRole('link', { name: '상세 정보' }).first();
      const href = await detail.getAttribute('href');
      const resp = await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => null), detail.click()]).then(([r]) => r);
      await page.waitForTimeout(1500);
      r3.detail = { href, status: resp?.status() ?? null, url: page.url().replace(BASE, ''), title: await page.title(), text: (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300))) };
      await shot(page, 'R3_detail_page.png');
      await page.goBack({ timeout: 60000 }).catch(() => {});
      await page.waitForTimeout(1500);
      r3.afterBack = { url: page.url().replace(BASE, ''), scrollY: await page.evaluate(() => Math.round(window.scrollY)) };
      // '투자설명서' (stub) — 라벨/목적지 확인만
      r3.imLink = await sec.getByRole('link', { name: '투자설명서' }).first().getAttribute('href').catch(() => null);
      await ctx.close();
    });
    saveRep();
  });

  // ── R4 ROI 계산기 ───────────────────────────────────────────
  test('R4 ROI 계산기', async ({ browser }) => {
    test.setTimeout(600_000);
    const r4: Record<string, any> = {};
    rep.R4 = r4;
    for (const mode of ['base', 'a'] as Mode[]) {
      await safe(`R4 ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const sec = page.locator('[data-section-id="roi_calculator"]');
        await sec.scrollIntoViewIfNeeded();
        await page.evaluate(() => { const e = document.querySelector('[data-section-id="roi_calculator"]'); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 8); });
        await page.waitForTimeout(300);
        await shot(page, `R4_${mode}_top.png`);
        const m = await metrics(page, '[data-section-id="roi_calculator"]');
        const geo = await page.evaluate(() => {
          const out: any[] = [];
          for (const id of ['roi-price', 'roi-ltv', 'roi-rate', 'roi-deposit', 'roi-rent', 'roi-vacancy']) {
            const r = document.getElementById(`${id}-range`) as HTMLInputElement | null; if (!r) continue;
            const rr = r.getBoundingClientRect();
            const steps = (Number(r.max) - Number(r.min)) / Number(r.step);
            out.push({ id, trackW: Math.round(rr.width), h: Math.round(rr.height), steps: Math.round(steps), pxPerStep: Math.round((rr.width / steps) * 100) / 100, value: r.value, valuetext: r.getAttribute('aria-valuetext') });
          }
          const num = document.getElementById('roi-price-num') as HTMLInputElement | null;
          return { sliders: out, priceNum: num ? { im: num.inputMode, type: num.type, w: Math.round(num.getBoundingClientRect().width), value: num.value } : null };
        });
        r4[mode] = { m: { textSum: m.textSum, lt14Items: m.lt14Items, small: m.small, inputs: m.inputs, eng: m.eng, crItems: m.crItems }, geo };
        if (mode === 'base') {
          const before = await sec.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 600));
          r4.base.textBefore = before;
          // 시나리오 1: 매입가 '32' 입력 (기본값 지우고)
          const num = page.locator('#roi-price-num');
          await num.tap();
          await num.press('End');
          for (let i = 0; i < 6; i++) await num.press('Backspace');
          await num.type('32');
          await page.locator('[data-section-id="roi_calculator"] p').first().tap().catch(() => {});
          await page.waitForTimeout(300);
          r4.base.after32 = { num: await num.inputValue(), range: await page.locator('#roi-price-range').inputValue() };
          // 시나리오 2: '32억'(단위 포함) 입력 → ?
          await num.tap(); await num.press('End'); for (let i = 0; i < 6; i++) await num.press('Backspace');
          await num.type('25억');
          await page.locator('#roi-total-floors').tap().catch(() => {});
          await page.waitForTimeout(300);
          r4.base.after25eok = { num: await num.inputValue(), range: await page.locator('#roi-price-range').inputValue() };
          // 시나리오 3: '3,200,000,000'(원 단위) 입력 → ?
          await num.tap(); await num.press('End'); for (let i = 0; i < 6; i++) await num.press('Backspace');
          await num.type('3,200,000,000');
          await page.locator('#roi-total-floors').tap().catch(() => {});
          await page.waitForTimeout(300);
          r4.base.afterWon = { num: await num.inputValue(), range: await page.locator('#roi-price-range').inputValue() };
          // 시나리오 4: 월세 '1500'(만원)
          const rent = page.locator('#roi-rent-num');
          await rent.tap(); await rent.press('End'); for (let i = 0; i < 8; i++) await rent.press('Backspace');
          await rent.type('1500');
          await page.locator('#roi-total-floors').tap().catch(() => {});
          await page.waitForTimeout(300);
          r4.base.afterRent = { num: await rent.inputValue(), range: await page.locator('#roi-rent-range').inputValue() };
          // 공실 1개층
          await page.locator('#roi-vacancy-range').fill('1');
          await page.waitForTimeout(300);
          const res = page.locator('[data-section-id="roi_calculator"] .grid-cols-3').first();
          await res.scrollIntoViewIfNeeded();
          await shot(page, 'R4_base_results.png');
          r4.base.results = await sec.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 900));
          // 용어 풀이 탭
          const g = page.getByRole('button', { name: /Cap Rate 설명/ }).first();
          if (await g.count()) {
            await g.tap(); await page.waitForTimeout(300);
            await g.scrollIntoViewIfNeeded();
            await shot(page, 'R4_base_glossary.png');
            r4.base.glossary = await page.locator('[role="note"]:not([hidden])').allInnerTexts().catch(() => []);
            r4.base.glossaryBtn = await g.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(e).fontSize }; });
          }
          await page.locator('[data-section-id="roi_calculator"] details summary').first().tap().catch(() => {});
          await page.waitForTimeout(300);
          await page.locator('[data-testid="roi-disclaimer"]').scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, 'R4_base_disclaimer.png');
          r4.base.disclaimer = await page.locator('[data-testid="roi-disclaimer"]').evaluate((e) => ({ fs: getComputedStyle(e).fontSize, color: getComputedStyle(e).color, text: (e as HTMLElement).innerText })).catch(() => null);
          // 슬라이더 드래그로 정확히 32억 맞추기 시도 (떨림 ±3px)
          const range = page.locator('#roi-price-range');
          const box = await range.boundingBox();
          if (box) {
            const min = 5e8, max = 3e10; const targetX = box.x + 12 + ((32e8 - min) / (max - min)) * (box.width - 24);
            const vals: string[] = [];
            for (const jitter of [-3, -1.5, 0, 1.5, 3]) {
              await page.mouse.move(box.x + 12, box.y + box.height / 2); await page.mouse.down();
              await page.mouse.move(targetX + jitter, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
              vals.push(await range.getAttribute('aria-valuetext').catch(() => '') || '');
            }
            r4.base.dragTo32 = vals;
          }
        }
        await ctx.close();
      });
    }
    saveRep();
  });

  // ── R5 설문 ─────────────────────────────────────────────────
  test('R5 설문', async ({ browser }) => {
    test.setTimeout(600_000);
    const r5: Record<string, any> = {};
    rep.R5 = r5;
    for (const pm of ['ok', '500', 'slow'] as PollMock[]) {
      await safe(`R5 ${pm}`, async () => {
        const ctx = await readerCtx(browser, { poll: pm });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const sec = page.locator('[data-section-id="poll"]');
        if (!(await sec.count())) { r5.present = false; await ctx.close(); return; }
        await sec.scrollIntoViewIfNeeded();
        await page.evaluate(() => { const e = document.querySelector('[data-section-id="poll"]'); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 8); });
        if (pm === 'ok') { await shot(page, 'R5_before.png'); r5.m = await metrics(page, '[data-section-id="poll"]'); }
        const opt = sec.getByRole('button', { name: /가격 조정 후 매수/ }).first();
        const t0 = Date.now();
        await opt.tap();
        if (pm === 'slow') {
          await page.waitForTimeout(1200);
          await shot(page, 'R5_slow_1s.png');
          r5.slowAt1s = await sec.evaluate((e) => ({ text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 300), disabled: Array.from(e.querySelectorAll('button')).filter((b) => (b as HTMLButtonElement).disabled).length, busy: !!e.querySelector('[aria-busy="true"],.animate-spin') }));
          await page.waitForTimeout(5000);
        } else {
          await page.waitForTimeout(1200);
        }
        await shot(page, `R5_after_${pm}.png`);
        r5[pm] = { ms: Date.now() - t0, text: await sec.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 400)), alert: await sec.locator('[role="alert"]').allInnerTexts().catch(() => []), status: await sec.locator('[role="status"]').allInnerTexts().catch(() => []) };
        if (pm === '500') {
          const retry = sec.getByRole('button', { name: /다시 시도/ });
          r5['500'].retryBtn = await retry.count() ? await retry.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(e).fontSize }; }) : null;
          r5['500'].alertFs = await sec.locator('[role="alert"] p').first().evaluate((e) => getComputedStyle(e).fontSize).catch(() => null);
        }
        if (pm === 'ok') {
          const consult = sec.locator('a[href^="tel:"]');
          r5.ok.consult = await consult.count() ? await consult.first().evaluate((e) => ({ label: (e as HTMLElement).innerText, w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })) : null;
          if (await consult.count()) { await consult.first().tap(); r5.ok.telCaptured = await page.evaluate(() => (window as any).__tel || []); }
        }
        await ctx.close();
      });
    }
    saveRep();
  });

  // ── R6 중개인에게 연락 ──────────────────────────────────────
  test('R6 중개인 연락', async ({ browser }) => {
    test.setTimeout(600_000);
    const r6: Record<string, any> = {};
    rep.R6 = r6;
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R6 ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const bar = page.locator('[data-magazine-bottom-bar]');
        const items = await bar.evaluate((nav) => Array.from(nav.querySelectorAll('a,button')).map((el) => {
          const r = el.getBoundingClientRect(); const lab = el.querySelector('span:last-child') as HTMLElement | null;
          return { label: (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), href: el.getAttribute('href'), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), labelFs: lab ? getComputedStyle(lab).fontSize : null, clamped: lab ? lab.scrollHeight > lab.clientHeight + 1 : null };
        })).catch(() => []);
        const barBox = await bar.boundingBox();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);
        await shot(page, `R6_${mode}_bottom.png`);
        const overlap = await page.evaluate(() => {
          const bar = document.querySelector('[data-magazine-bottom-bar]') as HTMLElement | null;
          const main = document.getElementById('magazine-main');
          if (!bar || !main) return null;
          const last = Array.from(main.querySelectorAll('footer a, footer p, footer div')).pop() as HTMLElement | undefined;
          const br = bar.getBoundingClientRect(); const lr = last?.getBoundingClientRect();
          return { barTop: Math.round(br.top), lastBottom: lr ? Math.round(lr.bottom) : null, covered: lr ? lr.bottom > br.top : null };
        });
        r6[mode] = { items, barBox, overlap };
        if (mode === 'base') {
          // 화면 중간에서 바가 가리는 본문 비율
          r6.base.barCoverPct = barBox ? Math.round((barBox.height / VP.height) * 1000) / 10 : null;
          // 전화 상담 탭
          const call = bar.locator('a[href^="tel:"]').first();
          if (await call.count()) { await call.tap(); await page.waitForTimeout(300); r6.base.telCaptured = await page.evaluate(() => (window as any).__tel || []); }
          // 본문 안 tel: 링크(프로필 등) 위치
          const m = await metrics(page);
          r6.base.tels = m.tels;
          // 프로필 섹션
          const prof = page.locator('[data-section-id="broker_profile"]');
          if (await prof.count()) { await prof.scrollIntoViewIfNeeded(); await shot(page, 'R6_profile.png'); r6.base.profile = await prof.evaluate((e) => ({ text: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 400), links: Array.from(e.querySelectorAll('a')).map((a) => `${(a as HTMLElement).innerText.trim()} → ${a.getAttribute('href')}`) })); }
          // 'IM 요청' → 어디로?
          const im = bar.getByText('IM 요청').first();
          if (await im.count()) {
            await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => null), im.tap()]);
            await page.waitForTimeout(2000);
            await shot(page, 'R6_im_request_dest.png');
            const dm = await metrics(page);
            r6.base.imDest = { url: page.url().replace(BASE, ''), title: await page.title(), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600)), inputs: dm.inputs, lt14: dm.textSum.lt14, small: dm.smallN, eng: dm.eng };
            await screens(page, 'R6_im_dest', 6);
          }
        }
        await ctx.close();
      });
    }
    saveRep();
  });

  // ── R7 구독 (인라인 카드 · 구독 페이지 · 확인 페이지) ────────
  test('R7 구독 신청', async ({ browser, request }) => {
    test.setTimeout(1_200_000);
    const r7: Record<string, any> = {};
    rep.R7 = r7;
    // (1) 인라인 카드: 측정 + 기본(카톡) 흐름
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R7 card ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode, sub: 'pending_kakao' });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const sec = page.locator('[data-section-id="subscribe_cta"]');
        await page.evaluate(() => { const e = document.querySelector('[data-section-id="subscribe_cta"]'); if (e) window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 8); });
        await page.waitForTimeout(300);
        await shot(page, `R7_card_${mode}.png`);
        const secH = await sec.evaluate((e) => Math.round(e.getBoundingClientRect().height));
        const m = await metrics(page, '[data-section-id="subscribe_cta"]');
        const consent = await sec.evaluate((e) => Array.from(e.querySelectorAll('input[type=checkbox]')).map((c) => {
          const r = c.getBoundingClientRect(); const lab = c.closest('label') as HTMLElement | null; const lr = lab?.getBoundingClientRect(); const sp = lab?.querySelector('span') as HTMLElement | null;
          return { box: `${Math.round(r.width)}x${Math.round(r.height)}`, row: lr ? `${Math.round(lr.width)}x${Math.round(lr.height)}` : null, fs: sp ? getComputedStyle(sp).fontSize : null, chars: sp ? sp.innerText.length : 0, text: sp?.innerText.slice(0, 90) };
        }));
        r7[`card_${mode}`] = { secH, screensForCard: Math.round((secH / VP.height) * 10) / 10, textSum: m.textSum, lt14Items: m.lt14Items, small: m.small, inputs: m.inputs, consent, eng: m.eng, crItems: m.crItems };
        if (mode === 'base') {
          // 동의 전 제출 버튼 상태
          const submit = sec.locator('button[type="submit"]');
          r7.card_base.submitBefore = { disabled: await submit.isDisabled(), text: await submit.innerText(), hint: await sec.evaluate((e) => /모두 체크하면|동의.*필요/.test((e as HTMLElement).innerText)) };
          await submit.tap({ force: true }).catch(() => {});
          await page.waitForTimeout(300);
          r7.card_base.afterTapDisabled = await sec.locator('[role="alert"]').allInnerTexts().catch(() => []);
          // 전화번호 자동 하이픈 + 키보드
          const phone = sec.locator('input[type="tel"]');
          await phone.tap();
          await phone.pressSequentially(E2E_PHONE, { delay: 40 });
          r7.card_base.phoneValue = await phone.inputValue();
          r7.card_base.barWhenFocused = await page.evaluate(() => { const b = document.querySelector('[data-magazine-bottom-bar]'); return b ? { ariaHidden: b.getAttribute('aria-hidden'), cls: (b as HTMLElement).className.includes('translate-y-full') } : null; });
          // 가상 키보드 근사: 높이 780 → 460
          await page.setViewportSize({ width: 360, height: 460 });
          await page.waitForTimeout(400);
          await phone.scrollIntoViewIfNeeded();
          await shot(page, 'R7_card_keyboard460.png');
          r7.card_base.keyboard = await page.evaluate(() => {
            const sec = document.querySelector('[data-section-id="subscribe_cta"]')!; const btn = sec.querySelector('button[type="submit"]') as HTMLElement; const inp = sec.querySelector('input[type="tel"]') as HTMLElement;
            const br = btn.getBoundingClientRect(); const ir = inp.getBoundingClientRect();
            return { vh: window.innerHeight, inputTop: Math.round(ir.top), submitTop: Math.round(br.top), submitVisible: br.top >= 0 && br.bottom <= window.innerHeight, needScrollPx: Math.max(0, Math.round(br.bottom - window.innerHeight)) };
          });
          await page.setViewportSize(VP);
          // 동의 3종 체크 (문구 영역 탭)
          for (const c of await sec.locator('label:has(input[type=checkbox])').all()) await c.tap({ position: { x: 60, y: 10 } });
          r7.card_base.consentChecked = await sec.locator('input[type=checkbox]:checked').count();
          await sec.locator('button[type="submit"]').scrollIntoViewIfNeeded();
          await shot(page, 'R7_card_ready.png');
          await sec.locator('button[type="submit"]').tap();
          await page.waitForTimeout(1200);
          await sec.scrollIntoViewIfNeeded();
          await shot(page, 'R7_card_success_kakao_pending.png');
          r7.card_base.successKakao = await sec.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 500));
          r7.card_base.successFs = await sec.locator('[role="status"] p').evaluateAll((ps) => ps.map((p) => `${getComputedStyle(p).fontSize} ${(p as HTMLElement).innerText.slice(0, 30)}`)).catch(() => []);
        }
        await ctx.close();
      });
    }
    // (2) 인라인 카드: 둘 다(이메일) 성공 / 500 / 429 / 네트워크 / 5초 지연
    for (const sm of (FULL ? ['pending_sent', '500', '429', 'network', 'slow'] : []) as SubMock[]) {
      await safe(`R7 card ${sm}`, async () => {
        const ctx = await readerCtx(browser, { sub: sm });
        const page = await ctx.newPage();
        await gotoViewer(page);
        const sec = page.locator('[data-section-id="subscribe_cta"]');
        await sec.scrollIntoViewIfNeeded();
        if (sm === 'pending_sent') { await sec.getByRole('button', { name: '둘 다' }).tap(); }
        await sec.locator('input[type="tel"]').fill('010-0000-7241');
        if (sm === 'pending_sent') await sec.locator('input[type="email"]').fill('e2e-ux60-r@credeal.test');
        for (const c of await sec.locator('input[type=checkbox]').all()) await c.check();
        await sec.locator('button[type="submit"]').tap();
        if (sm === 'slow') { await page.waitForTimeout(1500); await shot(page, 'R7_card_slow_1.5s.png'); r7.slowAt1500 = await sec.locator('button[type="submit"]').innerText().catch(() => null); await page.waitForTimeout(5000); }
        else await page.waitForTimeout(1500);
        await sec.scrollIntoViewIfNeeded();
        await shot(page, `R7_card_${sm}.png`);
        r7[`card_${sm}`] = { text: await sec.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 500)), alert: await sec.locator('[role="alert"]').allInnerTexts().catch(() => []), alertFs: await sec.locator('[role="alert"]').first().evaluate((e) => getComputedStyle(e).fontSize).catch(() => null), formKept: await sec.locator('input[type="tel"]').inputValue().catch(() => null) };
        await ctx.close();
      });
    }
    // (3) 실서버 검증 실패 1회 (동의 미체크) — 쓰기 없음
    if (FULL) await safe('R7 server validation', async () => {
      const res = await request.post(`${BASE}/api/public/magazine/subscribe`, {
        data: { brokerId: SLUG, name: 'E2E_UX60_R', phone: E2E_PHONE, channel: 'kakao', source: 'magazine', consent: { privacy: false, marketing: false, age14: false, night: false } },
        headers: { 'content-type': 'application/json', 'x-playwright-test': 'true' }, timeout: 60000,
      });
      r7.serverValidation = { status: res.status(), body: (await res.text()).slice(0, 400) };
      const { count } = await sb().from('magazine_subscribers').select('id', { count: 'exact', head: true }).or(`subscriber_phone.eq.${E2E_PHONE},phone_e164.eq.+821000007241`);
      r7.serverValidation.rowsCreated = count;
    });
    // (4) 구독 페이지
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R7 page ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode, sub: 'pending_kakao' });
        const page = await ctx.newPage();
        const resp = await page.goto(`/magazine/${SLUG}/subscribe?ref=kakao-chat`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => null);
        await page.waitForTimeout(800);
        const m = await metrics(page);
        const sc = await screens(page, `R7_page_${mode}`, 12);
        r7[`page_${mode}`] = { status: resp?.status() ?? null, screens: m.screens, shots: sc.count, textSum: m.textSum, lt14Items: m.lt14Items, small: m.small, inputs: m.inputs, iconOnly: m.iconOnly, eng: m.eng, crItems: m.crItems, fold: m.fold, chips: await page.locator('form button[aria-pressed]').count() };
        if (mode === 'base') {
          r7.page_base.text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1500));
          // 잘못된 번호 → 토스트 수명
          for (const c of await page.locator('form input[type=checkbox]').all()) await c.check();
          await page.locator('#sub-phone').fill('0101');
          await page.locator('form button[type="submit"]').tap();
          await toastShot(page, 'R7_page_toast_invalid_phone.png');
          r7.page_base.toastInvalid = await toastWatch(page);
          // 키보드 근사
          await page.locator('#sub-phone').fill('');
          await page.locator('#sub-phone').tap();
          await page.locator('#sub-phone').pressSequentially(E2E_PHONE, { delay: 40 });
          r7.page_base.phoneValue = await page.locator('#sub-phone').inputValue();
          await page.setViewportSize({ width: 360, height: 460 });
          await page.waitForTimeout(300);
          await shot(page, 'R7_page_keyboard460.png');
          r7.page_base.keyboard = await page.evaluate(() => { const b = document.querySelector('form button[type="submit"]')!.getBoundingClientRect(); return { submitTop: Math.round(b.top), vh: window.innerHeight, needScrollPx: Math.max(0, Math.round(b.bottom - window.innerHeight)) }; });
          await page.setViewportSize(VP);
          await page.locator('form button[type="submit"]').tap();
          await page.waitForTimeout(1500);
          await page.evaluate(() => window.scrollTo(0, 0));
          await shot(page, 'R7_page_success_kakao_pending.png');
          r7.page_base.success = await page.evaluate(() => (document.querySelector('[role="status"]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').slice(0, 600) ?? null);
          r7.page_base.successToast = await toastWatch(page, 6000);
        }
        await ctx.close();
      });
    }
    // (5) 확인 링크 페이지 (GET — DB 조회/변경 없음)
    if (FULL) await safe('R7 confirm', async () => {
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      const fakeT = crypto.randomBytes(32).toString('base64url');
      const resp = await page.goto(`/api/public/magazine/confirm?t=${fakeT}&b=${SLUG}`, { waitUntil: 'load', timeout: 120000 });
      await shot(page, 'R7_confirm_get.png');
      const m = await metrics(page);
      r7.confirm = { status: resp?.status(), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)), lt14Items: m.lt14Items, small: m.small };
      const ctxA = await readerCtx(browser, { mode: 'a' }); const pa = await ctxA.newPage();
      await pa.goto(`/api/public/magazine/confirm?t=${fakeT}&b=${SLUG}`, { waitUntil: 'load', timeout: 120000 });
      const ma = await metrics(pa); r7.confirm.modeA_lt14 = ma.textSum.lt14; r7.confirm.modeA_minFs = ma.textSum.minFs;
      await ctxA.close();
      await ctx.close();
    });
    saveRep();
  });

  // ── R8 아카이브 · 공유 · 뒤로가기 ───────────────────────────
  test('R8 아카이브 · 공유 · 뒤로가기', async ({ browser }) => {
    test.setTimeout(900_000);
    const r8: Record<string, any> = {};
    rep.R8 = r8;
    await safe('R8 archive link', async () => {
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      await gotoViewer(page);
      r8.archiveLinks = await page.evaluate((slug) => Array.from(document.querySelectorAll('a')).filter((a) => new RegExp(`/magazine/${slug}/?$`).test(a.getAttribute('href') || '')).map((a) => `${(a as HTMLElement).innerText.trim()} @${a.closest('[data-section-id]')?.getAttribute('data-section-id') || '-'}`), SLUG);
      r8.allLinks = await page.evaluate(() => Array.from(document.querySelectorAll('main a, footer a')).map((a) => `${(a as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 20)} → ${(a.getAttribute('href') || '').slice(0, 70)}`));
      // 첫 진입에서 뒤로가기 (카톡 인앱: 히스토리 없음 → 인앱 브라우저 닫힘)
      r8.historyLenOnEntry = await page.evaluate(() => history.length);
      const back = await page.goBack({ timeout: 10000 }).catch(() => 'err');
      r8.goBackOnEntry = back === null ? 'null(이전 페이지 없음 → 인앱 브라우저 종료)' : String(back);
      await ctx.close();
    });
    for (const mode of ['base', 'a'] as Mode[]) {
      await safe(`R8 archive ${mode}`, async () => {
        const ctx = await readerCtx(browser, { mode });
        const page = await ctx.newPage();
        const resp = await page.goto(`/magazine/${SLUG}`, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => null);
        await page.waitForTimeout(600);
        await shot(page, `R8_archive_${mode}.png`, { fullPage: true });
        const m = await metrics(page);
        r8[`archive_${mode}`] = { status: resp?.status() ?? null, text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 900)), textSum: m.textSum, lt14Items: m.lt14Items, small: m.small, eng: m.eng, screens: m.screens };
        if (mode === 'base') {
          const first = page.locator('main ul li a').first();
          if (await first.count()) {
            await Promise.all([page.waitForNavigation({ timeout: 120000 }).catch(() => null), first.tap()]);
            await page.waitForTimeout(1200);
            r8.archiveToIssue = page.url().replace(BASE, '');
            await page.goBack({ timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(800);
            r8.archiveBackUrl = page.url().replace(BASE, '');
          }
        }
        await ctx.close();
      });
    }
    // 공유: 카카오 SDK (stub) 경로 → 피드 카드 모양 재현
    await safe('R8 share kakao', async () => {
      const ctx = await readerCtx(browser, { kakao: 'stub' });
      const page = await ctx.newPage();
      await gotoViewer(page);
      await page.waitForFunction(() => !!(window as any).Kakao, null, { timeout: 15000 }).catch(() => {});
      const btn = page.locator('[data-magazine-bottom-bar]').getByText('공유').first();
      await btn.tap();
      await page.waitForTimeout(800);
      const payload = await page.evaluate(() => (window as any).__kakaoShare || null);
      r8.kakaoShare = payload;
      r8.kakaoToast = await page.evaluate(() => Array.from(document.querySelectorAll('[data-sonner-toast]')).map((e) => (e as HTMLElement).innerText).join(' | '));
      if (payload) {
        const c = payload.content || {}; const img = String(c.imageUrl || '');
        const ogBuf = fs.existsSync(path.join(OUT, 'R0_og_full.png')) ? fs.readFileSync(path.join(OUT, 'R0_og_full.png')).toString('base64') : '';
        const p2 = await (await browser.newContext({ viewport: { width: 360, height: 520 }, deviceScaleFactor: 3 })).newPage();
        const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
        await p2.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#b2c7da;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;padding:14px 10px">
          <div style="font-size:12px;color:#333;margin:0 0 4px 46px">박정자 님에게 온 친구 공유</div>
          <div style="margin-left:46px;width:250px;background:#fff;border-radius:6px;overflow:hidden">
            ${ogBuf ? `<img src="data:image/png;base64,${ogBuf}" style="width:250px;height:131px;object-fit:cover;display:block">` : `<div style="height:131px;background:#ccc">${esc(img)}</div>`}
            <div style="padding:10px"><div style="font-size:14px;font-weight:700;color:#111">${esc(c.title)}</div><div style="font-size:12px;color:#777;margin-top:4px">${esc(c.description)}</div></div>
            ${(payload.buttons || []).map((b: any) => `<div style="border-top:1px solid #eee;text-align:center;font-size:13px;padding:10px">${esc(b.title)}</div>`).join('')}
          </div></body>`);
        await p2.screenshot({ path: path.join(OUT, 'R8_kakao_feed_mock.png') });
        await p2.context().close();
      }
      await ctx.close();
    });
    // 공유: SDK 실패 + Web Share 없음 → 링크 복사 (토스트 수명)
    await safe('R8 share copy', async () => {
      const ctx = await readerCtx(browser, { kakao: 'block', noShare: true });
      const page = await ctx.newPage();
      await gotoViewer(page);
      const btn = page.locator('[data-magazine-bottom-bar] button').filter({ hasText: '공유' }).first();
      await btn.tap();
      await toastShot(page, 'R8_share_copied_toast.png');
      r8.copyToast = await toastWatch(page);
      r8.copiedLabel = await page.locator('[data-magazine-bottom-bar]').innerText().catch(() => null);
      r8.clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
      // 전달하기 섹션
      const fwd = page.locator('[data-section-id="referral"]');
      if (await fwd.count()) {
        await fwd.scrollIntoViewIfNeeded();
        await shot(page, 'R8_forward_section.png');
        r8.forward = await fwd.evaluate((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 300));
        await fwd.getByRole('button', { name: /전달하기/ }).tap().catch(() => {});
        r8.forwardToast = await toastWatch(page, 6000);
        r8.forwardClipboard = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
      }
      await ctx.close();
    });
    saveRep();
  });

  // ── R9 수신거부 ─────────────────────────────────────────────
  test('R9 수신거부', async ({ browser }) => {
    test.setTimeout(600_000);
    const r9: Record<string, any> = {};
    rep.R9 = r9;
    r9.secretSet = !!process.env.UNSUBSCRIBE_SECRET;
    // (1) 유효 토큰 GET (가상 구독자 id — GET 은 DB 상태를 바꾸지 않음)
    for (const mode of M(['base', 'a', 'b'])) {
      await safe(`R9 get ${mode}`, async () => {
        const tok = issueUnsubToken({ subscriberId: 'E2E_UX60_R_fake0001', brokerId: SLUG });
        const ctx = await readerCtx(browser, { mode, allowUnsub: mode === 'base' });
        const page = await ctx.newPage();
        const resp = await page.goto(`/api/public/magazine/unsubscribe?t=${encodeURIComponent(tok)}`, { waitUntil: 'load', timeout: 120000 });
        await shot(page, `R9_get_${mode}.png`);
        const m = await metrics(page);
        r9[`get_${mode}`] = { status: resp?.status(), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')), textSum: m.textSum, lt14Items: m.lt14Items, small: m.small, crItems: m.crItems, btn: await page.locator('button').first().evaluate((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fs: getComputedStyle(e).fontSize }; }).catch(() => null) };
        if (mode === 'base') {
          // 실제 POST — 존재하지 않는 구독자 (쓰기 없음: NOT_FOUND)
          await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.locator('button').first().tap()]);
          await page.waitForTimeout(800);
          await shot(page, 'R9_post_notfound.png');
          r9.postNotFound = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
        }
        await ctx.close();
      });
    }
    // (2) 만료/깨진 토큰
    if (FULL) await safe('R9 expired', async () => {
      const secret = process.env.UNSUBSCRIBE_SECRET || '';
      const payload = Buffer.from(`v2.E2E_UX60_R_fake0001.${SLUG}.${Math.floor(Date.now() / 1000) - 86400}`).toString('base64url');
      const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
      const ctx = await readerCtx(browser);
      const page = await ctx.newPage();
      const r1 = await page.goto(`/api/public/magazine/unsubscribe?t=${payload}.${sig}`, { waitUntil: 'load', timeout: 60000 });
      await shot(page, 'R9_expired.png');
      r9.expired = { status: r1?.status(), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) };
      // 카톡이 링크 끝을 자른 경우(복사 실수)
      const tok = issueUnsubToken({ subscriberId: 'E2E_UX60_R_fake0001', brokerId: SLUG });
      const r2 = await page.goto(`/api/public/magazine/unsubscribe?t=${encodeURIComponent(tok.slice(0, -6))}`, { waitUntil: 'load', timeout: 60000 });
      await shot(page, 'R9_truncated.png');
      r9.truncated = { status: r2?.status(), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) };
      await ctx.close();
    });
    // (3) E2E 구독자(pending) 시드 → 실제 해지 완료 화면 → 정리
    if (FULL) await safe('R9 real unsubscribe (E2E subscriber)', async () => {
      const db = sb();
      const { data, error } = await db.from('magazine_subscribers').insert({
        broker_id: SLUG, subscriber_name: 'E2E_UX60_R', subscriber_phone: E2E_PHONE, channel: 'kakao', status: 'active', confirm_status: 'pending', source: 'magazine', metadata: { e2e: TAG },
      }).select('id').single();
      if (error || !data) { r9.seedError = error?.message; return; }
      seededSubId = data.id;
      const tok = issueUnsubToken({ subscriberId: data.id, brokerId: SLUG });
      const ctx = await readerCtx(browser, { allowUnsub: true });
      const page = await ctx.newPage();
      await page.goto(`/api/public/magazine/unsubscribe?t=${encodeURIComponent(tok)}`, { waitUntil: 'load', timeout: 60000 });
      const t0 = Date.now();
      await Promise.all([page.waitForNavigation({ timeout: 60000 }).catch(() => null), page.locator('button').first().tap()]);
      await page.waitForTimeout(600);
      r9.realPost = { ms: Date.now() - t0, url: page.url().replace(BASE, '').slice(0, 60), text: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')) };
      await shot(page, 'R9_done.png');
      const md = await metrics(page);
      r9.realPost.lt14Items = md.lt14Items; r9.realPost.links = await page.locator('a').count();
      const { data: after } = await db.from('magazine_subscribers').select('status').eq('id', data.id).maybeSingle();
      r9.realPost.dbStatus = (after as any)?.status ?? null;
      // 뒤로가기 → 다시 확인 화면 (이미 해지됨인지 알려주나?)
      await page.goBack({ timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(600);
      r9.realPost.afterBack = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
      await shot(page, 'R9_after_back.png');
      await ctx.close();
    });
    saveRep();
  });
});
