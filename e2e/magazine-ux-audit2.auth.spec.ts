/**
 * 🔎 매거진 UI/UX 2차 심층 감사 (감사 전용 — 앱 코드 수정 없음)
 *
 * A. 독자 페이지 axe(WCAG 2.1 AA) × 390/360/1440 + 터치타깃/작은 글자 요소별 상세
 * B. 독자 키보드 탐색·포커스 가시성·200% 확대·320 reflow·다크/라이트·reduced-motion·레이어링·가상키보드 가림
 * C. 독자 상태 매트릭스 (클라이언트 API 500/지연/오프라인, Kakao SDK 차단, 이미지 404, 미존재 slug)
 * D. 성능 체감 (CDP CPU 4x + Slow 4G, LCP/CLS/JS 전송량) — dev 모드 상대 지표
 * E. 에디터 8탭 axe + 모달(QR/상세패널/통화브리핑/공유/속보) 포커스 트랩·Esc·복귀·hit-test
 * F. 에디터/대시보드 상태 매트릭스 (GET 500/빈/3s 지연/오프라인)
 * G. 이메일 템플릿 HTML 렌더 + axe
 *
 * 안전: 모든 non-GET /api/** · /rest/v1/** 요청은 mock(200), sendBeacon 무력화, Kakao SDK stub.
 * 산출물: brain/93f8.../scratch/audit2-ux/*.json, *.png
 */
import { test, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { buildMagazineHtml } from '../src/domain/magazine/email-template';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const OUT = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\93f8ca59-e154-4bf8-adb4-2396b2b1ee90\\scratch\\audit2-ux';
const BASE = 'http://localhost:3000';
const SLUG = 'test-broker-kim';
const DATE = '2026-09-20';
const VIEWER = `/magazine/${SLUG}/${DATE}`;
const OWNED_BUILDING = '073de8e9-dbea-410d-9c5b-f8021ffff5ab';
const AUTH = path.resolve(__dirname, '.auth/user.json');
const AXE_SRC = fs.readFileSync(path.resolve(__dirname, '../node_modules/axe-core/axe.min.js'), 'utf8');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 e2e-ux-audit2';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 e2e-ux-audit2';
const KAKAO_STUB = `window.Kakao={init:function(){},isInitialized:function(){return true},Share:{sendDefault:function(o){window.__kakaoShare=o;}}};`;

const VPS = [
  { name: '390', width: 390, height: 844 },
  { name: '360', width: 360, height: 740 },
  { name: '1440', width: 1440, height: 900 },
];

const blockedWrites: string[] = [];

function ensureOut() { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); }
function save(name: string, obj: any) { ensureOut(); fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1), 'utf8'); }
async function shot(page: Page, name: string, fullPage = false) {
  ensureOut();
  try { await page.screenshot({ path: path.join(OUT, name), fullPage, timeout: 20000 }); } catch (e: any) { /* noop */ }
}
async function safe<T>(label: string, rep: Record<string, any>, fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch (e: any) { rep[`__error:${label}`] = String(e?.message || e).slice(0, 300); return undefined; }
}

function unsubToken(subscriberId: string, brokerId: string) {
  const sig = crypto.createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || 'x').update(subscriberId + brokerId).digest('hex');
  return `${subscriberId}.${brokerId}.${sig}`;
}

async function installSafety(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { configurable: true, value: () => true }); } catch { /* noop */ }
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const m = req.method();
    if (/kakao_js_sdk/.test(url)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_STUB });
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(m);
    const hdr = req.headers();
    if (isWrite && (/\/api\//.test(url) || /\/rest\/v1\//.test(url) || hdr['next-action'])) {
      blockedWrites.push(`${m} ${url.replace(BASE, '').slice(0, 120)}`);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, success: true, mocked: true }) });
    }
    return route.fallback();
  });
}

async function readerCtx(browser: Browser, vp: { width: number; height: number }, extra: Record<string, any> = {}) {
  const mobile = vp.width < 800;
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: { cookies: [], origins: [] },
    viewport: vp,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
    userAgent: mobile ? IPHONE_UA : DESKTOP_UA,
    locale: 'ko-KR',
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
    ...extra,
  });
  ctx.setDefaultTimeout(20000);
  await installSafety(ctx);
  return ctx;
}

async function brokerCtx(browser: Browser, vp: { width: number; height: number }, extra: Record<string, any> = {}) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: AUTH,
    viewport: vp,
    locale: 'ko-KR',
    userAgent: DESKTOP_UA,
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
    ...extra,
  });
  ctx.setDefaultTimeout(30000);
  await installSafety(ctx);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  return ctx;
}

async function slowScroll(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function runAxe(page: Page, only?: string[]) {
  const has = await page.evaluate(() => !!(window as any).axe).catch(() => false);
  if (!has) await page.evaluate(AXE_SRC);
  return page.evaluate(async (onlyRules) => {
    const opts: any = onlyRules
      ? { runOnly: { type: 'rule', values: onlyRules }, resultTypes: ['violations'] }
      : { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] };
    const res = await (window as any).axe.run(document, opts);
    return res.violations.map((v: any) => ({
      id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n: any) => n.target.join(' ').slice(0, 120)),
      html: v.nodes.slice(0, 3).map((n: any) => (n.html || '').replace(/\s+/g, ' ').slice(0, 140)),
      summary: (v.nodes[0]?.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220),
    }));
  }, only ?? null);
}

async function measureTargets(page: Page) {
  return page.evaluate(() => {
    const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],summary';
    const out: any[] = [];
    for (const el of Array.from(document.querySelectorAll(sel)) as HTMLElement[]) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if ((el as HTMLInputElement).type === 'file') continue;
      out.push({
        tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '',
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || (el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim().slice(0, 32),
        w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.top + window.scrollY),
        section: el.closest('[data-section-id]')?.getAttribute('data-section-id') || '',
        fixed: !!(function f(e: HTMLElement | null): boolean { while (e) { if (getComputedStyle(e).position === 'fixed') return true; e = e.parentElement; } return false; })(el),
      });
    }
    return out;
  });
}

async function measureText(page: Page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const rows: any[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const t = (n.textContent || '').trim();
      if (!t) continue;
      const el = n.parentElement!;
      if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || cs.display === 'none' || cs.visibility === 'hidden') continue;
      rows.push({ fs: parseFloat(cs.fontSize), t: t.slice(0, 34), color: cs.color, section: el.closest('[data-section-id]')?.getAttribute('data-section-id') || '', y: Math.round(r.top + window.scrollY) });
    }
    return rows;
  });
}

function summarizeText(rows: any[]) {
  const byFs: Record<string, number> = {};
  for (const r of rows) byFs[String(r.fs)] = (byFs[String(r.fs)] || 0) + 1;
  const small = rows.filter((r) => r.fs < 12);
  const twelve = rows.filter((r) => r.fs === 12).length;
  return { total: rows.length, byFs, lt11: rows.filter((r) => r.fs < 11).length, lt12: small.length, eq12: twelve, smallItems: small.map((r) => `${r.fs}px [${r.section || '-'}] ${r.t}`) };
}

async function tabWalk(page: Page, n: number) {
  const rows: any[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(60);
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { tag: 'body' };
      const rect = el.getBoundingClientRect();
      const fcs = getComputedStyle(el);
      const focused = { o: `${fcs.outlineStyle}|${fcs.outlineWidth}|${fcs.outlineColor}`, s: fcs.boxShadow, b: fcs.borderColor, bg: fcs.backgroundColor };
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 1), window.innerWidth - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 1), window.innerHeight - 1);
      const top = document.elementFromPoint(cx, cy);
      const obscuredBy = top && !(top === el || el.contains(top) || top.contains(el)) ? `${top.tagName.toLowerCase()}.${String((top as HTMLElement).className || '').slice(0, 50)}` : '';
      el.blur();
      const bcs = getComputedStyle(el);
      const blurred = { o: `${bcs.outlineStyle}|${bcs.outlineWidth}|${bcs.outlineColor}`, s: bcs.boxShadow, b: bcs.borderColor, bg: bcs.backgroundColor };
      el.focus();
      const indicator = focused.o !== blurred.o || focused.s !== blurred.s || focused.b !== blurred.b || focused.bg !== blurred.bg;
      return {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 28),
        y: Math.round(rect.top), h: Math.round(rect.height), inView: rect.bottom > 0 && rect.top < window.innerHeight,
        obscuredBy, indicator, outline: focused.o,
        section: el.closest('[data-section-id]')?.getAttribute('data-section-id') || '',
      };
    });
    rows.push(r);
  }
  return rows;
}

async function fixedInventory(page: Page) {
  return page.evaluate(() => {
    const out: any[] = [];
    for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let anc: HTMLElement | null = el.parentElement; let cb = ''; let clip = '';
      while (anc && anc !== document.documentElement) {
        const a = getComputedStyle(anc);
        const reasons: string[] = [];
        if (a.transform !== 'none') reasons.push(`transform:${a.transform.slice(0, 30)}`);
        if (a.filter !== 'none') reasons.push(`filter`);
        if ((a as any).backdropFilter && (a as any).backdropFilter !== 'none') reasons.push('backdrop-filter');
        if (a.perspective !== 'none') reasons.push('perspective');
        if (/transform|filter/.test(a.willChange)) reasons.push(`will-change:${a.willChange}`);
        if (/paint|layout|strict|content/.test(a.contain)) reasons.push(`contain:${a.contain}`);
        if (reasons.length && !cb) cb = `${anc.tagName.toLowerCase()}.${String(anc.className || '').slice(0, 60)} [${reasons.join(',')}]`;
        if (cb && /(hidden|auto|scroll)/.test(a.overflow) && !clip) clip = `${anc.tagName.toLowerCase()}.${String(anc.className || '').slice(0, 50)} overflow:${a.overflow}`;
        anc = anc.parentElement;
      }
      out.push({
        pos: cs.position, z: cs.zIndex, cls: String(el.className || '').slice(0, 80),
        text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        containingBlock: cb, clippedBy: clip,
        paddingBottom: cs.paddingBottom,
      });
    }
    return out;
  });
}

async function hitTest(page: Page, locator: ReturnType<Page['locator']>) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]];
    const res = pts.map(([x, y]) => {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return 'offscreen';
      const t = document.elementFromPoint(x, y);
      return t && (t === el || el.contains(t)) ? 'ok' : `covered:${t?.tagName.toLowerCase()}.${String((t as HTMLElement)?.className || '').slice(0, 50)}`;
    });
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], res };
  }).catch((e) => ({ error: String(e).slice(0, 120) }));
}

// ═════════════════════════════════════════════════════════════════════
test.describe.configure({ mode: 'serial' });

test.describe('🔎 Magazine UX Audit 2', () => {
  test.afterAll(async () => { save('blocked_writes.json', blockedWrites); });

  // ── A ────────────────────────────────────────────────────────────────
  test('A. 독자 페이지 axe × 뷰포트 + 터치/텍스트 상세', async ({ browser }) => {
    test.setTimeout(900_000);
    const rep: Record<string, any> = { axe: {}, targets: {}, text: {}, meta: {} };
    const fakeSid = '00000000-0000-4000-8000-000000000000';
    const pages = [
      { key: 'viewer', url: VIEWER },
      { key: 'viewer_buyer', url: `${VIEWER}?target=buyer` },
      { key: 'viewer_seller', url: `${VIEWER}?target=seller` },
      { key: 'subscribe', url: `/magazine/${SLUG}/subscribe` },
      { key: 'archive', url: `/magazine/${SLUG}` },
      { key: 'unsub_confirm', url: `/api/public/magazine/unsubscribe?token=${unsubToken(fakeSid, SLUG)}` },
      { key: 'unsub_invalid', url: `/api/public/magazine/unsubscribe?token=bad.bad.bad` },
    ];
    for (const vp of VPS) {
      const ctx = await readerCtx(browser, { width: vp.width, height: vp.height });
      const page = await ctx.newPage();
      for (const p of pages) {
        if (vp.name === '360' && /buyer|seller|unsub_invalid/.test(p.key)) continue;
        const k = `${p.key}@${vp.name}`;
        await safe(k, rep, async () => {
          const res = await page.goto(p.url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => page.goto(p.url, { waitUntil: 'load', timeout: 90000 }));
          await page.waitForTimeout(800);
          if (/viewer|subscribe|archive/.test(p.key)) await slowScroll(page);
          rep.meta[k] = await page.evaluate(() => ({
            lang: document.documentElement.lang, title: document.title, scrollH: document.documentElement.scrollHeight,
            hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            h1: Array.from(document.querySelectorAll('h1')).map((h) => (h as HTMLElement).innerText.slice(0, 30)),
            headings: Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => `${h.tagName}:${(h as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 24)}`).slice(0, 40),
            landmarks: { main: document.querySelectorAll('main,[role=main]').length, nav: document.querySelectorAll('nav').length, header: document.querySelectorAll('header').length, footer: document.querySelectorAll('footer').length },
            viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null,
            brokenImgs: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 100)),
            skipLink: !!Array.from(document.querySelectorAll('a')).find((a) => /본문|skip/i.test(a.textContent || '')),
          }));
          rep.meta[k].status = res?.status();
          rep.axe[k] = await runAxe(page);
          if (vp.name !== '1440') {
            const t = await measureTargets(page);
            rep.targets[k] = { total: t.length, lt44: t.filter((x) => Math.min(x.w, x.h) < 44).map((x) => `${x.h}h×${x.w}w ${x.tag}${x.type ? ':' + x.type : ''} [${x.section || (x.fixed ? 'fixed' : '-')}] ${x.text}`) };
            rep.text[k] = summarizeText(await measureText(page));
          }
          if (vp.name !== '360') await shot(page, `A_${p.key}_${vp.name}.png`, p.key === 'viewer' && vp.name === '390');
        });
      }
      await ctx.close();
    }
    // 아코디언 전부 펼친 상태 (390) — 숨겨진 섹션의 위반/텍스트까지 포함
    const ctx = await readerCtx(browser, { width: 390, height: 844 });
    const page = await ctx.newPage();
    await safe('viewer_expanded', rep, async () => {
      await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
      await slowScroll(page);
      const n = await page.evaluate(() => {
        let c = 0;
        document.querySelectorAll('[data-section-id] button').forEach((b) => {
          const el = b as HTMLButtonElement;
          if (el.querySelector('svg.lucide-chevron-down') && !/rotate-180/.test(el.querySelector('svg')?.getAttribute('class') || '')) { el.click(); c++; }
        });
        return c;
      });
      await page.waitForTimeout(800);
      await slowScroll(page);
      rep.meta['viewer_expanded@390'] = { expandedAccordions: n, scrollH: await page.evaluate(() => document.documentElement.scrollHeight) };
      rep.axe['viewer_expanded@390'] = await runAxe(page);
      const t = await measureTargets(page);
      rep.targets['viewer_expanded@390'] = { total: t.length, lt44: t.filter((x) => Math.min(x.w, x.h) < 44).map((x) => `${x.h}h×${x.w}w ${x.tag}${x.type ? ':' + x.type : ''} [${x.section || (x.fixed ? 'fixed' : '-')}] ${x.text}`) };
      rep.text['viewer_expanded@390'] = summarizeText(await measureText(page));
      // 섹션 위치 (정보 위계 / 몇 화면째에 등장하는지)
      rep.meta['viewer_sections@390'] = await page.evaluate(() => Array.from(document.querySelectorAll('[data-section-id]')).map((e) => {
        const r = e.getBoundingClientRect();
        const title = ((e.querySelector('button span, h2, h3, span') as HTMLElement)?.innerText || '').replace(/\s+/g, ' ').slice(0, 30);
        return { id: e.getAttribute('data-section-id'), y: Math.round(r.top + window.scrollY), h: Math.round(r.height), screen: +((r.top + window.scrollY) / 844).toFixed(2), title };
      }));
      // 영문 용어/이모지/숫자 표기 수집
      rep.meta['viewer_lexicon@390'] = await page.evaluate(() => {
        const txt = document.body.innerText;
        const eng = (txt.match(/\b[A-Za-z][A-Za-z\-]{1,}(?: [A-Z][A-Za-z\-]+)*\b/g) || []);
        const engCount: Record<string, number> = {};
        eng.forEach((w) => { engCount[w] = (engCount[w] || 0) + 1; });
        const emoji = (txt.match(/\p{Extended_Pictographic}/gu) || []).length;
        const money = (txt.match(/[\d,.]+\s?(억|만원|만|원)/g) || []).slice(0, 60);
        const pct = (txt.match(/[+\-−]?[\d,.]+\s?%p?/g) || []).slice(0, 40);
        const dates = (txt.match(/\d{4}[.\-년 ]+\d{1,2}[.\-월 ]+\d{1,2}일?|\d{4}\s?\dQ|기준[^\n]{0,20}/g) || []).slice(0, 30);
        const sources = (txt.match(/(출처|자료|기준일|source)[^\n]{0,40}/gi) || []).slice(0, 30);
        return { engCount, emoji, money, pct, dates, sources, chars: txt.length };
      });
      await shot(page, 'A_viewer_expanded_390_full.png', true);
    });
    await ctx.close();
    save('A_reader_axe.json', rep);
  });

  // ── B ────────────────────────────────────────────────────────────────
  test('B. 독자 키보드/확대/다크/모션/레이어링/가상키보드', async ({ browser }) => {
    test.setTimeout(900_000);
    const rep: Record<string, any> = {};

    // B1 키보드 탐색 (1440 데스크톱, 390 외장키보드 가정)
    for (const vp of [{ width: 1440, height: 900, n: 'kbd1440' }, { width: 390, height: 844, n: 'kbd390' }]) {
      const ctx = await readerCtx(browser, { width: vp.width, height: vp.height }, vp.width < 800 ? { isMobile: false, hasTouch: false } : {});
      const page = await ctx.newPage();
      await safe(vp.n, rep, async () => {
        await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        const rows = await tabWalk(page, 90);
        rep[vp.n] = {
          steps: rows.length,
          noIndicator: rows.filter((r) => r.tag !== 'body' && !r.indicator).map((r) => `${r.tag} [${r.section}] ${r.text}`),
          obscured: rows.filter((r) => r.obscuredBy).map((r) => `${r.tag} [${r.section}] ${r.text} ← ${r.obscuredBy}`),
          sequence: rows.map((r) => `${r.tag}|${r.section}|${r.text}|y${r.y}|${r.indicator ? 'ring' : 'NO-RING'}${r.obscuredBy ? '|OBSCURED' : ''}`),
        };
        // 스크린리더 관점: 접근 가능한 이름이 없는 인터랙티브 요소 / aria-expanded / aria-pressed
        rep[`${vp.n}_sr`] = await page.evaluate(() => {
          const name = (el: Element) => (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim();
          const btns = Array.from(document.querySelectorAll('button,a[href],[role=button]'));
          const unnamed = btns.filter((b) => !name(b)).map((b) => (b as HTMLElement).outerHTML.slice(0, 120));
          const accordions = Array.from(document.querySelectorAll('[data-section-id] button')).filter((b) => b.querySelector('svg.lucide-chevron-down'));
          const toggles = Array.from(document.querySelectorAll('button')).filter((b) => /카카오톡|이메일|둘 ?다|강남|서초|매수|매도|빌딩/.test(b.textContent || '') && (b.textContent || '').length < 12);
          const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]),select,textarea')).map((i) => {
            const id = i.id; const lab = id ? document.querySelector(`label[for="${id}"]`) : null; const wrap = i.closest('label');
            return { type: i.getAttribute('type'), ph: i.getAttribute('placeholder'), labelled: !!(lab || wrap || i.getAttribute('aria-label') || i.getAttribute('aria-labelledby')), inputmode: i.getAttribute('inputmode'), autocomplete: i.getAttribute('autocomplete') };
          });
          const ranges = Array.from(document.querySelectorAll('input[type=range]')).map((r) => ({ labelled: !!(r.getAttribute('aria-label') || r.getAttribute('aria-labelledby') || r.closest('label') || (r.id && document.querySelector(`label[for="${r.id}"]`))), valuetext: r.getAttribute('aria-valuetext') }));
          const live = document.querySelectorAll('[aria-live],[role=status],[role=alert]').length;
          const dataTrack = document.querySelectorAll('[data-track-click]').length;
          return { unnamedCount: unnamed.length, unnamed: unnamed.slice(0, 10), accordionCount: accordions.length, accordionWithAriaExpanded: accordions.filter((a) => a.hasAttribute('aria-expanded')).length, toggles: toggles.length, togglesWithAriaPressed: toggles.filter((t) => t.hasAttribute('aria-pressed')).length, inputs, ranges, liveRegions: live, dataTrack, svgNoHidden: document.querySelectorAll('svg:not([aria-hidden])').length };
        });
      });
      await ctx.close();
    }

    // B2 200% 텍스트 확대 (root font-size) + 320px reflow
    for (const key of ['viewer', 'subscribe']) {
      const url = key === 'viewer' ? VIEWER : `/magazine/${SLUG}/subscribe`;
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      await safe(`zoom_${key}`, rep, async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        const before = await measureText(page);
        await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
        await page.waitForTimeout(600);
        const after = await measureText(page);
        const scaled = after.filter((a, i) => before[i] && a.fs > before[i].fs * 1.5).length;
        rep[`zoom200_${key}`] = { textNodes: before.length, scaledNodes: scaled, unscaledRatio: +(1 - scaled / Math.max(1, before.length)).toFixed(2), hScroll: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth) };
        await shot(page, `B_zoom200_${key}_390.png`);
      });
      await page.setViewportSize({ width: 320, height: 640 });
      await safe(`reflow_${key}`, rep, async () => {
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        rep[`reflow320_${key}`] = await page.evaluate(() => {
          const clipped: string[] = [];
          for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) {
            const cs = getComputedStyle(el);
            if (el.children.length === 0 && el.innerText && el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflow + cs.textOverflow + cs.overflowX)) clipped.push(`${el.tagName.toLowerCase()} "${el.innerText.slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
          }
          const over: string[] = [];
          for (const el of Array.from(document.querySelectorAll('body *')) as HTMLElement[]) { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') over.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`); }
          return { hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, clipped: clipped.slice(0, 20), overflowRight: over.slice(0, 15) };
        });
        await shot(page, `B_reflow320_${key}.png`);
      });
      await ctx.close();
    }

    // B3 다크/라이트 colorScheme 비교
    for (const scheme of ['light', 'dark'] as const) {
      const ctx = await readerCtx(browser, { width: 390, height: 844 }, { colorScheme: scheme });
      const page = await ctx.newPage();
      for (const [key, url] of [['viewer', VIEWER], ['subscribe', `/magazine/${SLUG}/subscribe`], ['archive', `/magazine/${SLUG}`], ['unsub', `/api/public/magazine/unsubscribe?token=${unsubToken('00000000-0000-4000-8000-000000000000', SLUG)}`]] as const) {
        await safe(`scheme_${scheme}_${key}`, rep, async () => {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
          await page.waitForTimeout(600);
          rep[`scheme_${scheme}_${key}`] = {
            ...(await page.evaluate(() => ({ htmlClass: document.documentElement.className.slice(0, 80), colorSchemeProp: getComputedStyle(document.documentElement).colorScheme, bodyBg: getComputedStyle(document.body).backgroundColor, firstDivBg: getComputedStyle(document.body.firstElementChild as HTMLElement).backgroundColor, textColor: getComputedStyle(document.body).color }))),
            contrast: (await runAxe(page, ['color-contrast'])).map((v: any) => ({ n: v.n, targets: v.targets.slice(0, 3), summary: v.summary.slice(0, 140) })),
          };
          await shot(page, `B_scheme_${scheme}_${key}.png`);
        });
      }
      await ctx.close();
    }

    // B4 prefers-reduced-motion
    for (const rm of ['no-preference', 'reduce'] as const) {
      const ctx = await readerCtx(browser, { width: 390, height: 844 }, { reducedMotion: rm });
      const page = await ctx.newPage();
      await safe(`motion_${rm}`, rep, async () => {
        await page.goto(VIEWER, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(150);
        const early = await page.evaluate(() => Array.from(document.querySelectorAll('[style]')).filter((e) => /opacity: 0|transform/.test((e as HTMLElement).getAttribute('style') || '')).length);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(1500);
        const hiddenNoScroll = await page.evaluate(() => Array.from(document.querySelectorAll('[data-section-id]')).filter((s) => { const m = s.firstElementChild as HTMLElement | null; return m && parseFloat(getComputedStyle(m).opacity) < 0.1; }).map((s) => s.getAttribute('data-section-id')));
        const anims = await page.evaluate(() => document.getAnimations().map((a) => (a as any).animationName || a.constructor.name).slice(0, 20));
        rep[`motion_${rm}`] = { animatedInlineStylesAt150ms: early, sectionsInvisibleUntilScroll: hiddenNoScroll, runningAnimations: anims };
      });
      await ctx.close();
    }

    // B5 레이어링(독자) — 하단바·공용 내비·마지막 콘텐츠 가림, safe-area
    {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      await safe('layer_viewer', rep, async () => {
        await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);
        await page.evaluate(() => window.scrollBy(0, -30)); // 위로 살짝 → 공용 내비 재등장
        await page.waitForTimeout(700);
        rep.layer_viewer_fixed = await fixedInventory(page);
        rep.layer_viewer_bottom = await page.evaluate(() => {
          const fixed = (Array.from(document.querySelectorAll('body *')) as HTMLElement[]).filter((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().bottom >= window.innerHeight - 2);
          const topMostBottom = Math.min(...fixed.map((f) => f.getBoundingClientRect().top));
          const last = Array.from(document.querySelectorAll('[data-section-id]')).pop() as HTMLElement | undefined;
          const badge = Array.from(document.querySelectorAll('a,div')).filter((e) => /Powered|Data Verified/i.test(e.textContent || '')).pop() as HTMLElement | undefined;
          const probe = (el?: HTMLElement) => { if (!el) return null; const r = el.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 4, window.innerHeight - 2)); return { bottom: Math.round(r.bottom), coveredBy: t && !(el.contains(t)) ? `${t.tagName.toLowerCase()}.${String((t as HTMLElement).className).slice(0, 40)}` : '' }; };
          return { fixedBottomCount: fixed.length, fixedBottomTop: Math.round(topMostBottom), lastSection: probe(last), poweredBadge: probe(badge), docBottomGap: Math.round(window.innerHeight - topMostBottom) };
        });
        await shot(page, 'B_layer_viewer_bottom_390.png');
        // 전화 있는 브로커 가정: 하단바 3버튼(전화/IM/공유) 360px 폭 검증 — DOM 주입 대신 번호 길이 시뮬레이션
        await page.setViewportSize({ width: 360, height: 740 });
        await page.waitForTimeout(400);
        rep.layer_viewer_bar360 = await page.evaluate(() => {
          const bar = (Array.from(document.querySelectorAll('div.fixed')) as HTMLElement[]).find((d) => /공유/.test(d.innerText) && /IM/.test(d.innerText));
          if (!bar) return null;
          const row = bar.firstElementChild as HTMLElement;
          const clone = row.firstElementChild!.cloneNode(true) as HTMLElement;
          clone.innerHTML = '<svg width="16" height="16"></svg>010-1234-5678 상담';
          clone.className = 'flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-[13px] text-white';
          row.insertBefore(clone, row.firstChild);
          const items = Array.from(row.children).map((c) => { const r = (c as HTMLElement).getBoundingClientRect(); return { text: (c as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), overflow: (c as HTMLElement).scrollWidth > (c as HTMLElement).clientWidth + 1 }; });
          return { items, rowScrollW: row.scrollWidth, rowClientW: row.clientWidth };
        });
        await shot(page, 'B_layer_viewer_bar3_360_simulated.png');
      });
      await ctx.close();
    }

    // B6 가상 키보드 가림 (Android resize 시뮬레이션: 844 → 508)
    for (const key of ['viewer_inline', 'subscribe']) {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      await safe(`vkbd_${key}`, rep, async () => {
        const url = key === 'subscribe' ? `/magazine/${SLUG}/subscribe` : VIEWER;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        const input = key === 'subscribe' ? page.locator('input[type="tel"], input[placeholder*="010"], input').first() : page.locator('[data-section-id="subscribe_cta"] input').first();
        await input.scrollIntoViewIfNeeded();
        await input.click();
        await page.setViewportSize({ width: 390, height: 508 });
        await page.waitForTimeout(500);
        await input.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
        await page.waitForTimeout(300);
        rep[`vkbd_${key}`] = await input.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const fixed = (Array.from(document.querySelectorAll('body *')) as HTMLElement[]).filter((e) => getComputedStyle(e).position === 'fixed' && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().bottom >= window.innerHeight - 2);
          const covers = fixed.filter((f) => { const fr = f.getBoundingClientRect(); return fr.top < r.bottom && fr.bottom > r.top; }).map((f) => `${String(f.className).slice(0, 50)} top=${Math.round(f.getBoundingClientRect().top)}`);
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { inputTop: Math.round(r.top), inputBottom: Math.round(r.bottom), vh: window.innerHeight, fixedBottomTops: fixed.map((f) => Math.round(f.getBoundingClientRect().top)), coveredBy: covers, centerHit: hit === el ? 'ok' : `${hit?.tagName}.${String((hit as HTMLElement)?.className || '').slice(0, 40)}`, visibleAreaPx: Math.round(Math.min(...fixed.map((f) => f.getBoundingClientRect().top), window.innerHeight)) };
        });
        await shot(page, `B_vkbd_${key}_390x508.png`);
      });
      await ctx.close();
    }
    save('B_reader_kbd_zoom.json', rep);
  });

  // ── C ────────────────────────────────────────────────────────────────
  test('C. 독자 상태 매트릭스', async ({ browser }) => {
    test.setTimeout(900_000);
    const rep: Record<string, any> = {};
    const visibleMsgs = (page: Page) => page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/[^\n]*(실패|오류|에러|다시 시도|재시도|잠시 후|네트워크|error|Error|failed|완료|감사합니다|구독되었|참여|복사)[^\n]*/g) || [];
      return Array.from(new Set(m)).slice(0, 12).map((x) => x.slice(0, 80));
    });

    // C1 미존재 slug / 미존재 날짜
    {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      for (const [k, url] of [['noslug_viewer', `/magazine/e2e-ux2-none/${DATE}`], ['noslug_archive', '/magazine/e2e-ux2-none'], ['noslug_subscribe', '/magazine/e2e-ux2-none/subscribe'], ['baddate', `/magazine/${SLUG}/2026-13-45`]] as const) {
        await safe(k, rep, async () => {
          const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
          await page.waitForTimeout(500);
          rep[k] = { status: r?.status(), h1: await page.locator('h1').allInnerTexts().catch(() => []), text: (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 220))) };
          await shot(page, `C_${k}_390.png`);
        });
      }
      await ctx.close();
    }

    // C2 설문 POST 500 / 지연 / 오프라인
    for (const mode of ['500', 'delay3s', 'offline']) {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      let posts = 0;
      await safe(`poll_${mode}`, rep, async () => {
        await page.route('**/api/public/magazine/poll**', async (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          posts++;
          if (mode === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal"}' });
          if (mode === 'offline') return route.abort('internetdisconnected');
          await new Promise((r) => setTimeout(r, 3000));
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results: { total: 10, counts: { 0: 5, 1: 3, 2: 2 } } }) });
        });
        await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        const poll = page.locator('[data-section-id="poll"]');
        await poll.scrollIntoViewIfNeeded();
        const choice = poll.locator('button').first();
        await choice.click({ timeout: 8000 });
        await page.waitForTimeout(400);
        await choice.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(mode === 'delay3s' ? 600 : 1500);
        await shot(page, `C_poll_${mode}_during_390.png`);
        if (mode === 'delay3s') await page.waitForTimeout(3500);
        rep[`poll_${mode}`] = { posts, msgs: await visibleMsgs(page), pollText: (await poll.innerText()).replace(/\s+/g, ' ').slice(0, 260) };
        await shot(page, `C_poll_${mode}_after_390.png`);
        if (mode === 'offline') await ctx.setOffline(false);
      });
      await ctx.close();
    }

    // C3 인라인 구독 카드 + 구독 페이지 POST 500/지연(중복제출)/오프라인
    for (const where of ['inline', 'page']) {
      for (const mode of ['500', 'delay3s', 'offline']) {
        const ctx = await readerCtx(browser, { width: 390, height: 844 });
        const page = await ctx.newPage();
        let posts = 0;
        const k = `subscribe_${where}_${mode}`;
        await safe(k, rep, async () => {
          await page.route('**/api/public/magazine/subscribe**', async (route) => {
            if (route.request().method() !== 'POST') return route.fallback();
            posts++;
            if (mode === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' });
            if (mode === 'offline') return route.abort('internetdisconnected');
            await new Promise((r) => setTimeout(r, 3000));
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, success: true, mocked: true }) });
          });
          await page.goto(where === 'page' ? `/magazine/${SLUG}/subscribe` : VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
          if (where === 'inline') await slowScroll(page);
          const root = where === 'page' ? page.locator('form').first() : page.locator('[data-section-id="subscribe_cta"]');
          await root.scrollIntoViewIfNeeded();
          const inputs = root.locator('input:not([type=hidden]):not([type=checkbox])');
          const cnt = await inputs.count();
          for (let i = 0; i < cnt; i++) {
            const inp = inputs.nth(i);
            const type = await inp.getAttribute('type');
            const ph = (await inp.getAttribute('placeholder')) || '';
            if (!(await inp.isVisible())) continue;
            if (type === 'email' || /메일/.test(ph)) await inp.fill('e2e-ux2@credeal.test');
            else if (type === 'tel' || /010|전화|휴대/.test(ph)) await inp.fill('01000007299');
            else await inp.fill('E2E_UX2');
          }
          const cbs = root.locator('input[type=checkbox]');
          for (let i = 0; i < (await cbs.count()); i++) { if (!(await cbs.nth(i).isChecked())) await cbs.nth(i).check().catch(() => {}); }
          const submit = root.locator('button[type=submit], button').filter({ hasText: /구독|신청|받기/ }).last();
          await submit.click({ timeout: 8000 });
          await page.waitForTimeout(250);
          const disabledDuring = await submit.isDisabled().catch(() => null);
          const labelDuring = (await submit.innerText().catch(() => '')).trim();
          await submit.click({ timeout: 1500, force: true }).catch(() => {});
          await page.waitForTimeout(mode === 'delay3s' ? 300 : 1500);
          await shot(page, `C_${k}_during.png`);
          if (mode === 'delay3s') await page.waitForTimeout(3500);
          rep[k] = { posts, disabledDuring, labelDuring, msgs: await visibleMsgs(page), toast: await page.locator('[data-sonner-toast], [role=status], [role=alert]').allInnerTexts().catch(() => []) };
          await shot(page, `C_${k}_after.png`);
          if (mode === 'offline') await ctx.setOffline(false);
        });
        await ctx.close();
      }
    }

    // C4 Kakao SDK 차단 + Web Share 미지원 → 공유 버튼, 레퍼럴 전달 버튼
    {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
      await ctx.addInitScript(() => { try { Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined }); } catch { /* noop */ } });
      const page = await ctx.newPage();
      await safe('kakao_blocked', rep, async () => {
        await page.route('**/kakao_js_sdk/**', (r) => r.abort());
        await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        const bar = page.locator('div.fixed').filter({ hasText: '공유' }).last();
        await bar.getByRole('button', { name: /공유/ }).click();
        await page.waitForTimeout(600);
        const barText = (await bar.innerText()).replace(/\s+/g, ' ');
        const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => null));
        await shot(page, 'C_kakao_blocked_share_390.png');
        const ref = page.locator('[data-section-id="referral"]');
        let refRes: any = null;
        if (await ref.count()) {
          await ref.scrollIntoViewIfNeeded();
          const kbtn = ref.getByRole('button', { name: /카카오/ }).first();
          if (await kbtn.count()) {
            await kbtn.click().catch(() => {});
            await page.waitForTimeout(800);
            refRes = { msgs: await visibleMsgs(page), clip: await page.evaluate(() => navigator.clipboard.readText().catch(() => null)), toast: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []) };
            await shot(page, 'C_kakao_blocked_referral_390.png');
          }
        }
        rep.kakao_blocked = { barText, clipboard: clip, referral: refRes };
      });
      await ctx.close();
    }

    // C5 이미지/정적 404 수집 (뷰어/구독/아카이브) + 오프라인 상태에서 아코디언/새로고침
    {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      const bad: string[] = [];
      page.on('response', (r) => { if (r.status() >= 400 && !/_next\/webpack-hmr/.test(r.url())) bad.push(`${r.status()} ${r.request().resourceType()} ${r.url().replace(BASE, '').slice(0, 120)}`); });
      for (const url of [VIEWER, `/magazine/${SLUG}/subscribe`, `/magazine/${SLUG}`]) {
        await safe(`404_${url}`, rep, async () => { await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }); await slowScroll(page); });
      }
      rep.bad_responses = Array.from(new Set(bad));
      await safe('offline_reload', rep, async () => {
        await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 90000 });
        await ctx.setOffline(true);
        await page.reload({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
        rep.offline_reload = { text: (await page.evaluate(() => document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 160) || '')).toString() };
        await shot(page, 'C_offline_reload_390.png');
        await ctx.setOffline(false);
      });
      await ctx.close();
    }

    // C6 문서 지연(3s) → 첫 페인트까지 빈 화면 여부
    {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      const page = await ctx.newPage();
      await safe('doc_delay', rep, async () => {
        await page.route(`**${VIEWER}`, async (route) => { if (route.request().resourceType() === 'document') await new Promise((r) => setTimeout(r, 3000)); return route.fallback(); });
        const t0 = Date.now();
        const nav = page.goto(VIEWER, { waitUntil: 'commit', timeout: 90000 });
        await page.waitForTimeout(1500);
        await shot(page, 'C_doc_delay_1500ms_390.png');
        await nav;
        rep.doc_delay = { commitMs: Date.now() - t0 };
      });
      await ctx.close();
    }
    save('C_reader_states.json', rep);
  });

  // ── D ────────────────────────────────────────────────────────────────
  test('D. 성능 (CDP CPU 4x + Slow 4G)', async ({ browser }) => {
    test.setTimeout(600_000);
    const rep: Record<string, any> = {};
    for (const mode of ['baseline', 'throttled']) {
      const ctx = await readerCtx(browser, { width: 390, height: 844 });
      await ctx.addInitScript(() => {
        (window as any).__perf = { lcp: 0, lcpEl: '', cls: 0, clsEntries: [] as any[], longTasks: 0, longTaskMs: 0, fcp: 0 };
        try {
          new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) { (window as any).__perf.lcp = e.startTime; (window as any).__perf.lcpEl = `${e.element?.tagName || ''}.${String(e.element?.className || '').slice(0, 40)} ${e.size}`; } }).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) { if (!e.hadRecentInput) { (window as any).__perf.cls += e.value; (window as any).__perf.clsEntries.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), src: (e.sources || []).map((s: any) => `${s.node?.nodeName || ''}.${String(s.node?.className || '').slice(0, 30)}`).slice(0, 2) }); } } }).observe({ type: 'layout-shift', buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) { (window as any).__perf.longTasks++; (window as any).__perf.longTaskMs += e.duration; } }).observe({ type: 'longtask', buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') (window as any).__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
        } catch { /* noop */ }
      });
      const page = await ctx.newPage();
      await safe(`perf_${mode}`, rep, async () => {
        if (mode === 'throttled') {
          const cdp = await ctx.newCDPSession(page);
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        }
        // 워밍업(dev 컴파일 제외)
        if (mode === 'baseline') { await page.goto(VIEWER, { waitUntil: 'networkidle', timeout: 120000 }); }
        const t0 = Date.now();
        await page.goto(VIEWER, { waitUntil: 'load', timeout: 180000 });
        const loadMs = Date.now() - t0;
        await page.waitForTimeout(4000);
        const atLoad = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__perf)));
        await slowScroll(page);
        await page.waitForTimeout(1000);
        const afterScroll = await page.evaluate(() => JSON.parse(JSON.stringify((window as any).__perf)));
        const res = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const rs = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
          const agg: Record<string, { n: number; transfer: number; decoded: number }> = {};
          for (const r of rs) { const k = r.initiatorType; agg[k] = agg[k] || { n: 0, transfer: 0, decoded: 0 }; agg[k].n++; agg[k].transfer += r.transferSize; agg[k].decoded += r.decodedBodySize; }
          const js = rs.filter((r) => /\.js(\?|$)/.test(r.name) || r.initiatorType === 'script');
          const bigJs = js.sort((a, b) => b.decodedBodySize - a.decodedBodySize).slice(0, 8).map((r) => `${Math.round(r.decodedBodySize / 1024)}KB ${r.name.replace(location.origin, '').slice(0, 90)}`);
          const imgs = Array.from(document.images).map((i) => ({ src: i.currentSrc.replace(location.origin, '').slice(0, 80), natural: `${i.naturalWidth}x${i.naturalHeight}`, rendered: `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`, loading: i.loading, nextImage: i.hasAttribute('data-nimg') }));
          const bgImgs = (Array.from(document.querySelectorAll('[style*="background-image"]')) as HTMLElement[]).map((e) => e.style.backgroundImage.slice(0, 100));
          return { ttfb: Math.round(nav.responseStart), domContentLoaded: Math.round(nav.domContentLoadedEventEnd), docTransfer: nav.transferSize, docDecoded: nav.decodedBodySize, agg, jsCount: js.length, jsDecodedKB: Math.round(js.reduce((s, r) => s + r.decodedBodySize, 0) / 1024), jsTransferKB: Math.round(js.reduce((s, r) => s + r.transferSize, 0) / 1024), bigJs, imgs, bgImgs, domNodes: document.getElementsByTagName('*').length, motionStyled: document.querySelectorAll('[style*="transform"],[style*="opacity"]').length };
        });
        rep[`perf_${mode}`] = { loadMs, lcpMs: Math.round(atLoad.lcp), lcpEl: atLoad.lcpEl, fcpMs: Math.round(atLoad.fcp), clsAtLoad: +atLoad.cls.toFixed(4), clsAfterScroll: +afterScroll.cls.toFixed(4), clsEntries: afterScroll.clsEntries.slice(0, 12), longTasks: afterScroll.longTasks, longTaskMs: Math.round(afterScroll.longTaskMs), ...res };
      });
      await ctx.close();
    }
    save('D_perf.json', rep);
  });

  // ── E ────────────────────────────────────────────────────────────────
  test('E. 에디터 8탭 axe + 모달 포커스/레이어링', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const rep: Record<string, any> = { axe: {}, modals: {}, targets: {}, text: {}, layer: {}, editorReqs: [] as string[] };
    const ctx = await brokerCtx(browser, { width: 1440, height: 900 });
    const page = await ctx.newPage();
    page.on('request', (r) => { if (/\/api\//.test(r.url())) rep.editorReqs.push(`${r.method()} ${r.url().replace(BASE, '').split('?')[0]}`); });
    const TABS = ['커버', '필드노트', '테마&매물', '뉴스', 'AI비서', '아웃리치', '발행설정', '성과'];
    await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.getByRole('button', { name: '아웃리치' }).first().waitFor({ timeout: 120000 });
    await page.waitForTimeout(4000);
    rep.loadReqs = Array.from(new Set(rep.editorReqs));
    for (const t of TABS) {
      await safe(`tab_${t}`, rep, async () => {
        await page.getByRole('button', { name: t, exact: true }).first().click();
        await page.waitForTimeout(t === '성과' || t === '아웃리치' ? 3500 : 1200);
        rep.axe[`editor_${t}@1440`] = await runAxe(page);
        const tg = await measureTargets(page);
        rep.targets[`editor_${t}@1440`] = { total: tg.length, lt24: tg.filter((x) => Math.min(x.w, x.h) < 24).map((x) => `${x.h}h×${x.w}w ${x.tag}${x.type ? ':' + x.type : ''} ${x.text}`) };
        const tx = summarizeText(await measureText(page));
        rep.text[`editor_${t}@1440`] = { ...tx, smallItems: tx.smallItems.slice(0, 40) };
        rep.layer[`editor_${t}`] = (await fixedInventory(page)).filter((f: any) => f.containingBlock || f.pos === 'fixed');
        await shot(page, `E_tab_${t.replace('&', 'n')}_1440.png`);
      });
    }

    // 키보드: 탭 내비게이션 Tab 순회 (헤더→탭→내용)
    await safe('editor_kbd', rep, async () => {
      await page.getByRole('button', { name: '커버', exact: true }).first().click();
      await page.waitForTimeout(800);
      await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
      const rows = await tabWalk(page, 40);
      rep.editor_kbd = { noIndicator: rows.filter((r) => r.tag !== 'body' && !r.indicator).map((r) => `${r.tag} ${r.text}`), obscured: rows.filter((r) => r.obscuredBy).map((r) => `${r.tag} ${r.text} ← ${r.obscuredBy}`), sequence: rows.map((r) => `${r.tag}|${r.text}|${r.indicator ? 'ring' : 'NO-RING'}`) };
    });

    type ModalSpec = { key: string; open: () => Promise<void>; title: RegExp; close: () => Promise<void> };
    async function auditModal(m: ModalSpec) {
      const r: Record<string, any> = {};
      await safe(m.key, r, async () => {
        await m.open();
        await page.waitForTimeout(900);
        const info = await page.evaluate((src) => {
          const re = new RegExp(src);
          const fixed = (Array.from(document.querySelectorAll('body *')) as HTMLElement[]).filter((e) => getComputedStyle(e).position === 'fixed' && re.test(e.innerText || ''));
          const box = fixed.sort((a, b) => (a.innerText.length - b.innerText.length))[0] || fixed[0];
          if (!box) return { found: false };
          box.setAttribute('data-audit-modal', '1');
          const r = box.getBoundingClientRect();
          const ae = document.activeElement;
          let anc: HTMLElement | null = box.parentElement; let cb = ''; let clip = '';
          while (anc && anc !== document.documentElement) { const a = getComputedStyle(anc); if (!cb && (a.transform !== 'none' || a.filter !== 'none' || ((a as any).backdropFilter || 'none') !== 'none' || /transform/.test(a.willChange))) cb = `${anc.tagName.toLowerCase()}.${String(anc.className).slice(0, 50)} transform=${a.transform.slice(0, 24)}`; if (cb && !clip && /(hidden|auto|scroll)/.test(a.overflow)) clip = `${anc.tagName.toLowerCase()}.${String(anc.className).slice(0, 50)}`; anc = anc.parentElement; }
          const dialog = box.querySelector('[role=dialog]') || (box.getAttribute('role') === 'dialog' ? box : null);
          return { found: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], viewport: [window.innerWidth, window.innerHeight], coversViewport: r.left <= 1 && r.top <= 1 && r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2, role: dialog ? 'dialog' : null, ariaModal: !!box.querySelector('[aria-modal=true]') || box.getAttribute('aria-modal') === 'true', labelledby: !!box.querySelector('[aria-labelledby]'), focusInside: !!ae && box.contains(ae), activeEl: ae ? `${ae.tagName.toLowerCase()} ${(ae as HTMLElement).innerText?.slice(0, 20) || ''}` : null, containingBlock: cb, clippedBy: clip, bodyScrollLocked: getComputedStyle(document.body).overflow === 'hidden' };
        }, m.title.source);
        r.info = info;
        await shot(page, `E_modal_${m.key}_1440.png`);
        if (!(info as any).found) return;
        // 모달 내 버튼 hit-test
        const btns = page.locator('[data-audit-modal="1"] button, [data-audit-modal="1"] a[href]');
        const nb = Math.min(await btns.count(), 8);
        r.hit = [];
        for (let i = 0; i < nb; i++) {
          const b = btns.nth(i);
          const label = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || (await b.getAttribute('title')) || '(무명 아이콘)').replace(/\s+/g, ' ').slice(0, 24);
          r.hit.push({ label, ...(await hitTest(page, b)) as any });
        }
        // 포커스 트랩: Tab 12회 동안 모달 밖으로 나가는 횟수
        let escapes = 0; const seq: string[] = [];
        for (let i = 0; i < 12; i++) {
          await page.keyboard.press('Tab');
          const s = await page.evaluate(() => { const ae = document.activeElement as HTMLElement; const box = document.querySelector('[data-audit-modal="1"]'); return { inside: !!box && !!ae && box.contains(ae), t: `${ae?.tagName.toLowerCase()} ${(ae?.innerText || ae?.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 18)}` }; });
          if (!s.inside) escapes++;
          seq.push(`${s.inside ? 'IN' : 'OUT'}:${s.t}`);
        }
        r.trap = { escapes, seq };
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        r.escCloses = (await page.locator('[data-audit-modal="1"]').count()) === 0 || !(await page.locator('[data-audit-modal="1"]').isVisible().catch(() => false));
        if (!r.escCloses) {
          await m.close();
          await page.waitForTimeout(600);
        }
        r.closedFinally = (await page.locator('[data-audit-modal="1"]').count()) === 0;
        r.focusAfterClose = await page.evaluate(() => { const ae = document.activeElement as HTMLElement; return ae ? `${ae.tagName.toLowerCase()} ${(ae.innerText || '').replace(/\s+/g, ' ').slice(0, 24)}` : null; });
      });
      rep.modals[m.key] = r;
    }
    const clickOrDispatch = async (loc: ReturnType<Page['locator']>) => { try { await loc.click({ timeout: 5000 }); } catch { await loc.dispatchEvent('click'); } };

    // 1) QR 모달 (아웃리치) — 키보드로 열기
    await page.getByRole('button', { name: '아웃리치', exact: true }).first().click();
    await page.waitForTimeout(3000);
    await auditModal({
      key: 'qr', title: /오프라인 구독 QR/,
      open: async () => { const b = page.getByRole('button', { name: /QR/ }).first(); await b.focus(); await page.keyboard.press('Enter'); },
      close: async () => clickOrDispatch(page.locator('[data-audit-modal="1"]').getByRole('button', { name: '닫기', exact: true }).first().or(page.locator('[data-audit-modal="1"] button').first())),
    });
    rep.axe['modal_qr@1440'] = await safe('axe_qr', rep, async () => { const b = page.getByRole('button', { name: /QR/ }).first(); await b.click(); await page.waitForTimeout(700); const a = await runAxe(page); await page.locator('div.fixed').filter({ hasText: /오프라인 구독 QR/ }).getByRole('button', { name: '닫기', exact: true }).first().dispatchEvent('click').catch(() => {}); await page.waitForTimeout(500); return a; });

    // 2) 구독자 상세 패널
    await auditModal({
      key: 'subscriber_detail', title: /구독자 상세/,
      open: async () => { const row = page.locator('button').filter({ hasText: /박투자/ }).first(); const any = (await row.count()) ? row : page.locator('button').filter({ hasText: /010|\d{3}-\d{4}/ }).first(); await any.focus(); await page.keyboard.press('Enter'); },
      close: async () => clickOrDispatch(page.locator('[data-audit-modal="1"] button').first()),
    });

    // 잔존 오버레이(닫히지 않은 패널 backdrop) 대비: 클릭 실패 시 기록 후 리로드
    const gotoTab = async (name: string, wait: number) => {
      try { await page.getByRole('button', { name, exact: true }).first().click({ timeout: 6000 }); }
      catch {
        rep.leftoverOverlay = (rep.leftoverOverlay || []).concat(await page.evaluate(() => Array.from(document.querySelectorAll('div.fixed, div.absolute.inset-0')).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 300 && r.height > 300; }).map((e) => String((e as HTMLElement).className).slice(0, 60)).slice(0, 4)));
        await shot(page, `E_leftover_overlay_before_${name}.png`);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.getByRole('button', { name: '아웃리치' }).first().waitFor({ timeout: 120000 });
        await page.waitForTimeout(2500);
        await page.getByRole('button', { name, exact: true }).first().click({ timeout: 10000 });
      }
      await page.waitForTimeout(wait);
    };
    // 3) 통화 브리핑 (성과)
    await gotoTab('성과', 4000);
    await auditModal({
      key: 'call_briefing', title: /브리핑 치트시트|Call Preparation/,
      open: async () => { const b = page.getByRole('button', { name: /통화 브리핑/ }).first(); await b.focus(); await page.keyboard.press('Enter'); },
      close: async () => clickOrDispatch(page.locator('[data-audit-modal="1"] button').first()),
    });
    // 성과 탭 리드 목록 "집중:" 표기(내부 섹션 ID 노출 여부) + 데스크톱 tel: 링크
    rep.analytics_terms = await safe('analytics_terms', rep, async () => page.evaluate(() => {
      const t = document.body.innerText;
      return { focusLines: (t.match(/집중:[^\n]*/g) || []).slice(0, 5), snakeIds: (t.match(/\b[a-z]+_[a-z_]+\b/g) || []).slice(0, 15), telLinks: document.querySelectorAll('a[href^="tel:"]').length, kpiLabels: (t.match(/(30일[^\n]{0,12}|평균 체류[^\n]{0,10}|활성 구독자[^\n]{0,6}|조회수[^\n]{0,6}|열람[^\n]{0,6})/g) || []).slice(0, 12) };
    }));

    // 4) 공유 모달 (발행설정 → 발행 및 공유; POST 는 모두 mock)
    await gotoTab('발행설정', 1500);
    rep.publish_cta_dupes = await safe('publish_dupes', rep, async () => page.evaluate(() => {
      const vis = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < window.innerHeight * 3; };
      const all = Array.from(document.querySelectorAll('button,a')).filter(vis).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
      return { publish: all.filter((t) => /발행 및 공유/.test(t)).length, save: all.filter((t) => /^(💾 )?(임시)?저장$/.test(t)).length, saveLabels: all.filter((t) => /저장/.test(t)) };
    }));
    rep.publish_hit = await safe('publish_hit', rep, async () => { const out: any[] = []; const b = page.getByRole('button', { name: /발행 및 공유/ }); for (let i = 0; i < await b.count(); i++) out.push(await hitTest(page, b.nth(i))); return out; });
    await auditModal({
      key: 'share', title: /공유|발행 완료|발행되었/,
      open: async () => { const b = page.getByRole('button', { name: /발행 및 공유/ }).last(); await clickOrDispatch(b); await page.waitForTimeout(2500); },
      close: async () => clickOrDispatch(page.locator('[data-audit-modal="1"] button').last()),
    });

    // 5) 미리보기 프레임 hit-test: 폰 프레임 밖으로 새는 fixed
    rep.preview_fixed_escape = await safe('preview_escape', rep, async () => page.evaluate(() => {
      const frame = (Array.from(document.querySelectorAll('div')) as HTMLElement[]).find((d) => /w-\[375px\]/.test(d.className));
      const fr = frame?.getBoundingClientRect();
      const fixed = (Array.from(document.querySelectorAll('body *')) as HTMLElement[]).filter((e) => getComputedStyle(e).position === 'fixed' && frame?.contains(e));
      return { frame: fr ? [Math.round(fr.left), Math.round(fr.top), Math.round(fr.width), Math.round(fr.height)] : null, fixedInsideFrame: fixed.map((f) => { const r = f.getBoundingClientRect(); return { cls: String(f.className).slice(0, 50), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], escapes: fr ? (r.left < fr.left - 1 || r.right > fr.right + 1 || r.bottom > fr.bottom + 1) : null }; }) };
    }));

    // 6) 에디터 390 (모바일) — 탭 이름 없음/하단 겹침
    await safe('editor_390', rep, async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: '발행설정', exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      rep.axe['editor_publish@390'] = await runAxe(page);
      const tg = await measureTargets(page);
      rep.targets['editor@390'] = { total: tg.length, lt44: tg.filter((x) => Math.min(x.w, x.h) < 44).map((x) => `${x.h}h×${x.w}w ${x.tag} ${x.text}`) };
      rep.editor390_tabs = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((b) => b.querySelector('svg') && !(b as HTMLElement).innerText.trim() && b.getBoundingClientRect().top < 200).map((b) => ({ aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })));
      await shot(page, 'E_editor_390.png');
      await shot(page, 'E_editor_390_full.png', true);
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await ctx.close();

    // 7) 속보 모달 (딜카드 ⋮) — GET 실데이터(읽기), POST mock
    const ctx2 = await brokerCtx(browser, { width: 1440, height: 900 });
    const p2 = await ctx2.newPage();
    await safe('special', rep, async () => {
      await p2.goto(`/broker/deal-card/${OWNED_BUILDING}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      const more = p2.getByRole('button', { name: '더 보기' }).first();
      await more.waitFor({ timeout: 90000 });
      rep.special_menu_trigger = { aria: await more.getAttribute('aria-label'), ...(await hitTest(p2, more) as any) };
      await more.click();
      await p2.waitForTimeout(600);
      rep.special_menu = await p2.evaluate(() => { const items = Array.from(document.querySelectorAll('[role=menu] *, [role=menuitem]')).length; const ae = document.activeElement as HTMLElement; return { roleMenuItems: items, activeEl: `${ae?.tagName.toLowerCase()} ${(ae?.innerText || '').slice(0, 20)}` }; });
      await shot(p2, 'E_dealcard_menu_1440.png');
      const item = p2.getByRole('button', { name: /속보 매거진 발행/ }).first();
      await item.click();
      await p2.waitForTimeout(2500);
      const info = await p2.evaluate(() => {
        const fixed = (Array.from(document.querySelectorAll('body *')) as HTMLElement[]).filter((e) => getComputedStyle(e).position === 'fixed' && /속보/.test(e.innerText || ''));
        const box = fixed.sort((a, b) => a.innerText.length - b.innerText.length)[0];
        if (!box) return { found: false };
        box.setAttribute('data-audit-modal', '1');
        const ae = document.activeElement;
        return { found: true, role: !!box.querySelector('[role=dialog]'), focusInside: !!ae && box.contains(ae), text: box.innerText.replace(/\s+/g, ' ').slice(0, 200) };
      });
      rep.special_modal = info;
      await shot(p2, 'E_special_modal_1440.png');
      rep.axe['special_modal@1440'] = await runAxe(p2);
      let escapes = 0;
      for (let i = 0; i < 12; i++) { await p2.keyboard.press('Tab'); if (!(await p2.evaluate(() => { const b = document.querySelector('[data-audit-modal="1"]'); return !!b && b.contains(document.activeElement); }))) escapes++; }
      rep.special_modal_trap = { escapes };
      await p2.keyboard.press('Escape');
      await p2.waitForTimeout(400);
      rep.special_modal_esc = (await p2.locator('[data-audit-modal="1"]').count()) === 0;
      if (!rep.special_modal_esc) await p2.getByRole('button', { name: '취소' }).first().click().catch(() => {});
    });
    await ctx2.close();
    save('E_editor.json', rep);
  });

  // ── F ────────────────────────────────────────────────────────────────
  test('F. 에디터/대시보드 상태 매트릭스', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const rep: Record<string, any> = {};
    const API_RE = /\/api\/(broker|magazine)\//;
    const describe = (page: Page) => page.evaluate(() => {
      const t = document.body.innerText;
      return {
        skeleton: document.querySelectorAll('.skeleton,.animate-pulse,[class*="skeleton"]').length,
        spinners: document.querySelectorAll('.animate-spin').length,
        retry: Array.from(document.querySelectorAll('button')).filter((b) => /다시 시도|재시도|새로고침/.test(b.textContent || '')).length,
        errorBoundary: /문제가 발생|Application error|Unhandled Runtime Error|Something went wrong/.test(t),
        msgs: Array.from(new Set(t.match(/[^\n]*(실패|오류|에러|불러올 수|없습니다|로딩|불러오는 중|error|Error|failed)[^\n]*/g) || [])).slice(0, 12).map((x) => x.slice(0, 70)),
        toasts: Array.from(document.querySelectorAll('[data-sonner-toast]')).map((e) => (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 70)),
        demoLeak: /이상은|xanova/.test(t),
      };
    });
    for (const mode of ['500', 'empty', 'delay3s', 'offline']) {
      const ctx = await brokerCtx(browser, { width: 1440, height: 900 });
      const page = await ctx.newPage();
      const errs: string[] = [];
      page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
      await safe(`editor_${mode}`, rep, async () => {
        if (mode !== 'offline') {
          await page.route('**/api/**', async (route) => {
            const req = route.request();
            if (req.method() !== 'GET' || !API_RE.test(req.url())) return route.fallback();
            if (mode === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Internal Server Error"}' });
            if (mode === 'empty') {
              const u = req.url();
              const body = /subscribers/.test(u) ? { subscribers: [], total: 0 } : /editions/.test(u) ? { editions: [], data: [] } : /analytics/.test(u) ? {} : {};
              return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
            }
            await new Promise((r) => setTimeout(r, 3000));
            return route.fallback();
          });
        }
        await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.getByRole('button', { name: '아웃리치' }).first().waitFor({ timeout: 120000 });
        if (mode === 'delay3s') { await page.waitForTimeout(1000); rep[`editor_${mode}_early`] = await describe(page); await shot(page, `F_editor_${mode}_early_cover.png`); }
        await page.waitForTimeout(mode === 'delay3s' ? 4000 : 3000);
        if (mode === 'offline') {
          await ctx.setOffline(true);
          await page.getByRole('button', { name: '저장', exact: true }).first().click().catch(() => {});
          await page.waitForTimeout(1500);
        }
        rep[`editor_${mode}_cover`] = await describe(page);
        await shot(page, `F_editor_${mode}_cover.png`);
        for (const tab of ['아웃리치', '성과']) {
          await page.getByRole('button', { name: tab, exact: true }).first().click().catch(() => {});
          if (mode === 'delay3s') { await page.waitForTimeout(800); rep[`editor_${mode}_${tab}_early`] = await describe(page); await shot(page, `F_editor_${mode}_${tab}_early.png`); }
          await page.waitForTimeout(mode === 'delay3s' ? 4500 : 2500);
          rep[`editor_${mode}_${tab}`] = await describe(page);
          await shot(page, `F_editor_${mode}_${tab}.png`);
        }
        rep[`editor_${mode}_pageErrors`] = errs.slice(0, 6);
        if (mode === 'offline') await ctx.setOffline(false);
      });
      await ctx.close();
    }
    // 대시보드 (MagazineInsightCard) baseline / 500
    for (const mode of ['baseline', '500']) {
      const ctx = await brokerCtx(browser, { width: 1440, height: 900 });
      const page = await ctx.newPage();
      const reqs: string[] = [];
      page.on('request', (r) => { if (/\/api\//.test(r.url())) reqs.push(r.url().replace(BASE, '').split('?')[0]); });
      await safe(`dash_${mode}`, rep, async () => {
        if (mode === '500') await page.route('**/api/broker/**', (route) => route.request().method() === 'GET' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }) : route.fallback());
        await page.goto('/broker', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForTimeout(8000);
        const card = page.locator('div').filter({ hasText: /매거진 성과/ }).last();
        rep[`dash_${mode}`] = { ...(await describe(page)), insightCard: await card.count() ? (await card.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160) : null, apis: Array.from(new Set(reqs)).slice(0, 30) };
        if (mode === 'baseline' && await card.count()) {
          await card.scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, 'F_dash_insight_1440.png');
          // 딥링크 ?tab=analytics 동작 확인
          const link = page.getByRole('link', { name: /상세 성과 보기/ }).first();
          if (await link.count()) {
            await link.click();
            await page.waitForURL(/magazine-editor/, { timeout: 60000 }).catch(() => {});
            await page.getByRole('button', { name: '성과' }).first().waitFor({ timeout: 120000 }).catch(() => {});
            await page.waitForTimeout(2500);
            rep.dash_deeplink = { url: page.url().replace(BASE, ''), analyticsVisible: await page.getByText(/통화 브리핑|30일|활성 구독자/).first().isVisible().catch(() => false) };
          }
        } else await shot(page, `F_dash_${mode}_1440.png`);
      });
      await ctx.close();
    }
    save('F_editor_states.json', rep);
  });

  // ── G ────────────────────────────────────────────────────────────────
  test('G. 이메일 템플릿 렌더 + axe', async ({ browser }) => {
    test.setTimeout(240_000);
    const rep: Record<string, any> = {};
    const html = buildMagazineHtml({
      to: 'e2e@credeal.test', brokerName: '김테스트 공인중개사', subscriberName: '홍길동', magazineTitle: '강남 꼬마빌딩 위클리 2026-09-20',
      headline: '이번 주 강남 꼬마빌딩 거래량이 전주 대비 12% 늘었습니다.\n금리 동결 이후 매수 문의가 회복세입니다.', magazineUrl: `${BASE}${VIEWER}`, imageUrl: `${BASE}/api/magazine/${SLUG}/${DATE}/image?format=card`,
      marketTemp: '선별 매수', customInsert: '관심 권역(역삼) 신규 매물 2건이 있습니다.',
      fieldNote: { question: '요즘 매수자 반응은?', comment: '50억 이하 수익형 문의가 늘었습니다.' },
      featuredDeals: [{ address: '역삼동 123-4', assetType: '꼬마빌딩', price: 6500000000 }],
      topNews: [{ title: '기준금리 동결', sentiment: 'bullish', source: '연합뉴스' }, { title: '공실률 상승', sentiment: 'bearish', source: '한경' }],
      recentTransactions: [{ address: '논현동 45-6', transaction_price: 5200000000, transaction_date: '2026-09-12' }],
      poll: { question: '하반기 강남 빌딩 가격은?', choices: ['상승', '보합', '하락'] }, taxClinic: { question: '법인 취득세 중과?', answer: '일반 정보입니다.', source: '지방세법' },
    });
    for (const w of [390, 1440]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const page = await ctx.newPage();
      await page.route('**/*', (r) => r.request().resourceType() === 'image' ? r.fulfill({ status: 404, body: '' }) : r.fallback());
      await safe(`email_${w}`, rep, async () => {
        await page.setContent(html, { waitUntil: 'load' });
        rep[`axe@${w}`] = await runAxe(page);
        rep[`text@${w}`] = summarizeText(await measureText(page));
        rep[`meta@${w}`] = await page.evaluate(() => ({ hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth, links: Array.from(document.querySelectorAll('a')).map((a) => `${(a as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 24)} → ${a.getAttribute('href')?.slice(0, 50)}`), hasUnsub: /수신 ?거부|구독 ?해지|unsubscribe/i.test(document.body.innerHTML) && !!Array.from(document.querySelectorAll('a')).find((a) => /해지|거부|unsub/i.test(a.textContent || '')), hasPhone: /tel:|010-/.test(document.body.innerHTML), preheader: !!document.querySelector('[style*="display:none"],[style*="display: none"]'), rgbaCount: (document.body.innerHTML.match(/rgba\(/g) || []).length, gradientCount: (document.body.innerHTML.match(/linear-gradient/g) || []).length }));
        await shot(page, `G_email_${w}.png`, true);
      });
      await ctx.close();
    }
    save('G_email.json', rep);
  });

  // ── H ────────────────────────────────────────────────────────────────
  // axe 는 그라디언트/반투명 배경을 'incomplete' 로 빼므로, 반투명 레이어를 합성해 직접 대비를 계산
  test('H. 커스텀 대비 스캔 (반투명 합성)', async ({ browser }) => {
    test.setTimeout(600_000);
    const rep: Record<string, any> = {};
    const scan = (page: Page, base: string) => page.evaluate((baseHex) => {
      const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true })!; const cache = new Map<string, number[]>();
      const parse = (c: string): number[] | null => { if (!c) return null; if (c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return [0, 0, 0, 0]; const hit = cache.get(c); if (hit) return hit; cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; const v = [d[0], d[1], d[2], d[3] / 255]; cache.set(c, v); return v; };
      const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 1];
      const over = (top: number[], bot: number[]) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a: number[], b: number[]) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>(); const fails: any[] = []; let total = 0;
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = (n.textContent || '').trim(); if (!t || t.length < 2) continue;
        const el = n.parentElement!; if (!el || seen.has(el)) continue; seen.add(el);
        const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
        if (r.width === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (/\p{Extended_Pictographic}/u.test(t) && t.length <= 3) continue;
        // 배경 레이어 수집
        const layers: number[][] = []; let opacity = 1; let e: HTMLElement | null = el; let gradient = false;
        while (e) { const s = getComputedStyle(e); opacity *= parseFloat(s.opacity); const bg = parse(s.backgroundColor); if (bg && bg[3] > 0) layers.push(bg); if (s.backgroundImage && s.backgroundImage !== 'none') gradient = true; if (bg && bg[3] >= 1) break; e = e.parentElement; }
        let bgc = hex(baseHex);
        for (let i = layers.length - 1; i >= 0; i--) bgc = over(layers[i], bgc);
        const fg0 = parse(cs.color)!; const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * opacity], bgc);
        const cr = ratio(fg, bgc);
        const fs = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight) >= 700;
        const large = fs >= 24 || (bold && fs >= 18.66);
        total++;
        if (cr < (large ? 3 : 4.5)) fails.push({ cr: +cr.toFixed(2), fs, t: t.slice(0, 26), color: cs.color, gradient, section: el.closest('[data-section-id]')?.getAttribute('data-section-id') || '' });
      }
      fails.sort((a, b) => a.cr - b.cr);
      return { total, fails: fails.length, lt3: fails.filter((f) => f.cr < 3).length, lt2: fails.filter((f) => f.cr < 2).length, worst: fails.slice(0, 30).map((f) => `${f.cr}:1 ${f.fs}px [${f.section || '-'}] ${f.t} (${f.color})`) };
    }, base);

    const ctx = await readerCtx(browser, { width: 390, height: 844 });
    const page = await ctx.newPage();
    for (const [k, url] of [['viewer', VIEWER], ['subscribe', `/magazine/${SLUG}/subscribe`], ['archive', `/magazine/${SLUG}`]] as const) {
      await safe(k, rep, async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await slowScroll(page);
        if (k === 'viewer') {
          await page.evaluate(() => { document.querySelectorAll('[data-section-id] button').forEach((b) => { if (b.querySelector('svg.lucide-chevron-down')) (b as HTMLButtonElement).click(); }); document.querySelectorAll('details').forEach((d) => d.setAttribute('open', '')); });
          await page.waitForTimeout(600);
          await slowScroll(page);
        }
        rep[k] = await scan(page, '#0a0a1a');
      });
    }
    await ctx.close();
    const bctx = await brokerCtx(browser, { width: 1440, height: 900 });
    const bp = await bctx.newPage();
    await safe('editor', rep, async () => {
      await bp.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await bp.getByRole('button', { name: '아웃리치' }).first().waitFor({ timeout: 120000 });
      for (const t of ['커버', '아웃리치', '발행설정', '성과']) {
        await bp.getByRole('button', { name: t, exact: true }).first().click();
        await bp.waitForTimeout(t === '성과' || t === '아웃리치' ? 3500 : 1200);
        rep[`editor_${t}`] = await scan(bp, '#0B1120');
      }
    });
    await bctx.close();
    save('H_contrast.json', rep);
  });
});
