/**
 * 60대 UX E2E — 중개인 B(김영수, 62세) 발행자 여정 감사 (2026-10-16)
 *
 * 브리프: brain/93f8ca59.../scratch/ux60/brief.md
 *  - 데스크톱: 노트북 1366×768 + 브라우저 확대 125% ≈ viewport 1093×614 @ DPR 1.25
 *  - 모바일(외근): 360×780 @ DPR 3, isMobile/hasTouch, 일반 Chrome Android UA (+ 큰 글꼴 근사 2방식)
 *  - 과업 B1~B10 단계별: 클릭/화면전환/입력/대기, 14px 미만 글자, 48px 미만 터치 타깃, 아이콘 단독 버튼,
 *    영어 노출, 가로 넘침·잘림·가림, 토스트 지속시간, 모달 포커스·Esc, 오류 문구.
 *
 * 안전
 *  - 앱 소스 수정 없음. 실발송 0: distribute/special POST/구독자 POST·PATCH·DELETE/프로필 쓰기 전부 route mock.
 *  - 초안 로드(POST /editions/draft)만 실서버 1회(골든 Part1 방식) → created=true 면 afterAll 에서 그 행만 삭제.
 *  - 그 밖의 모든 non-GET /api/** · /rest/v1/** 는 컨텍스트 가드가 기록 후 가짜 200 (누출 0 확인용 로그).
 *  - LLM 실호출 최대 1회(ai-comment 첫 호출만 실서버, 이후 502 mock).
 *  - 분석 비콘(/api/public/magazine/analytics, track 계열) 차단.
 *
 * 실행:
 *  $env:E2E_PORT="3242"; $env:UNSUBSCRIBE_SECRET="e2e-only-unsub-secret-0001"; $env:MAGAZINE_SID_SECRET="e2e-only-sid-secret-0001"
 *  npx playwright test e2e/magazine-ux60-broker.auth.spec.ts --project=authenticated --no-deps --workers=1 --reporter=line
 */
import { test, expect, type Page, type Route, type Request, type BrowserContext, type Browser, type Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true } as any);

const OUT =
  process.env.UX60_BROKER_OUT ||
  'C:\\Users\\User\\.gemini\\antigravity\\brain\\93f8ca59-e154-4bf8-adb4-2396b2b1ee90\\scratch\\ux60\\broker';
const AUTH_STATE = path.resolve(__dirname, '.auth/user.json');
const BROKER_SLUG = 'test-broker-kim';
const OWNED_BUILDING = '073de8e9-dbea-410d-9c5b-f8021ffff5ab'; // E2E 계정 소유 딜카드(골든 Part2와 동일)
const RUN_START = new Date().toISOString();
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Mobile Safari/537.36';

// ─────────────────────────────── 공통 상태 ───────────────────────────────
type PhaseStat = { clicks: number; transitions: number; inputs: number; typedChars: number; waitMs: number; steps: string[] };
const phases: Record<string, PhaseStat> = {};
let curPhase = 'init';
const audits: Record<string, any> = {};
const notes: Record<string, any> = {};
const modalChecks: any[] = [];
const toastLog: any[] = [];
const dialogs: string[] = [];
const blockedWrites: string[] = [];
const pageErrors: string[] = [];
const badResponses: string[] = [];
const shots: string[] = [];
const errors: Record<string, string> = {};
let realLlmCalls = 0;

const store: { edition: any | null; failNextPatch: boolean; failNextPublish: boolean; realDraft: any; realMeta: any } = {
  edition: null,
  failNextPatch: false,
  failNextPublish: false,
  realDraft: null,
  realMeta: null,
};

function kstDate(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}
function ph(name: string) {
  curPhase = name;
  phases[name] ??= { clicks: 0, transitions: 0, inputs: 0, typedChars: 0, waitMs: 0, steps: [] };
}
function P(): PhaseStat {
  ph(curPhase);
  return phases[curPhase];
}
function step(desc: string) {
  P().steps.push(desc);
}
async function tap(loc: Locator, desc: string, opts: { force?: boolean; timeout?: number } = {}) {
  P().clicks += 1;
  P().steps.push(`클릭: ${desc}`);
  await loc.click({ force: opts.force, timeout: opts.timeout ?? 20_000 });
}
async function typeIn(loc: Locator, text: string, desc: string) {
  P().inputs += 1;
  P().typedChars += text.length;
  P().steps.push(`입력: ${desc} (${text.length}자)`);
  await loc.fill(text);
}
function screen(desc: string) {
  P().transitions += 1;
  P().steps.push(`화면전환: ${desc}`);
}
async function timed<T>(desc: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    const dt = Date.now() - t0;
    P().waitMs += dt;
    P().steps.push(`대기: ${desc} ${dt}ms`);
  }
}
let currentPage: Page | null = null;
async function safe(label: string, fn: () => Promise<void>) {
  if (currentPage && !currentPage.isClosed()) await resetUi(currentPage).catch(() => {});
  try {
    await fn();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 3).join(' | ').slice(0, 400);
    errors[label] = msg;
    console.log(`[UX60-B][ERR] ${label}: ${msg}`);
  }
}
async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  try {
    await page.waitForTimeout(350);
    const p = path.join(OUT, name);
    await page.screenshot({ path: p, fullPage: !!opts.fullPage });
    shots.push(name);
  } catch (e) {
    notes[`shot_fail_${name}`] = String(e).slice(0, 160);
  }
}
function jsonBody(req: Request): any {
  try {
    return req.postDataJSON();
  } catch {
    return req.postData();
  }
}
/** 이전 단계에서 열린 모달이 남아 있으면 닫는다(측정 외 동작) */
async function resetUi(page: Page) {
  for (let i = 0; i < 3; i++) {
    const d = page.getByRole('dialog').first();
    if (!(await d.isVisible().catch(() => false))) return;
    const close = d.getByRole('button', { name: /^(닫기|취소)$/ }).first();
    if (await close.isVisible().catch(() => false)) await close.click({ timeout: 3000 }).catch(() => {});
    else await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
}

// ─────────────────────────────── 페이지 내 감사 함수 ───────────────────────────────
/** 60대 기준 측정: 14px 미만 글자 / 48px 미만 타깃 / 아이콘 단독 / 영어 / 넘침 / 잘림 / 가림 / 대비 */
const AUDIT_FN = (arg: { scope: string | null; max: number }) => {
  const scopeEl: Element = (arg.scope && document.querySelector(arg.scope)) || document.body;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shown = (el: Element) => {
    const anyEl = el as any;
    if (typeof anyEl.checkVisibility === 'function' && !anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const nameOf = (el: Element) =>
    clean(el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || el.getAttribute('placeholder') || (el as HTMLInputElement).value || '').slice(0, 40);
  // 색 파싱(캔버스)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const rgba = (c: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrastOf = (el: Element): number | null => {
    const cs = getComputedStyle(el);
    const fg = rgba(cs.color);
    let n: Element | null = el;
    let bg: number[] | null = null;
    while (n) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url(')) return null; // 그라디언트 → 판정 보류
      const c = rgba(s.backgroundColor);
      if (c[3] > 0.5) {
        bg = c.slice(0, 3);
        break;
      }
      n = n.parentElement;
    }
    bg ??= [11, 17, 32];
    // 반투명 전경 합성
    const a = fg[3];
    const fgc = [0, 1, 2].map((i) => fg[i] * a + bg![i] * (1 - a));
    const [L1, L2] = [lum(fgc), lum(bg)].sort((x, y) => y - x);
    return Math.round(((L1 + 0.05) / (L2 + 0.05)) * 100) / 100;
  };

  // 1) 글자
  const textEls: HTMLElement[] = [];
  scopeEl.querySelectorAll('*').forEach((el) => {
    if (el.closest('nextjs-portal,script,style,svg,noscript,[aria-hidden="true"]')) return;
    const has = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
    if (has && shown(el)) textEls.push(el as HTMLElement);
  });
  const sizeHist: Record<string, number> = {};
  const small: any[] = [];
  const lowContrast: any[] = [];
  let under16 = 0;
  for (const el of textEls) {
    const fs = parseFloat(getComputedStyle(el).fontSize);
    const k = String(Math.round(fs));
    sizeHist[k] = (sizeHist[k] || 0) + 1;
    const txt = clean(Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
    if (fs < 14) small.push({ px: Math.round(fs * 10) / 10, t: txt.slice(0, 40) });
    if (fs < 16) under16 += 1;
    const cr = contrastOf(el);
    if (cr !== null && cr < 4.5) lowContrast.push({ cr, px: Math.round(fs), t: txt.slice(0, 30) });
  }

  // 2) 터치 타깃 + 아이콘 단독 + 가림
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=checkbox], [role=menuitem], summary';
  const targets = Array.from(scopeEl.querySelectorAll(sel)).filter((el) => shown(el) && !el.closest('nextjs-portal'));
  const smallTargets: any[] = [];
  const iconOnly: any[] = [];
  const covered: any[] = [];
  let under44 = 0;
  for (const el of targets) {
    let r = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const type = (el as HTMLInputElement).type;
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      const lab = el.closest('label');
      if (lab) r = lab.getBoundingClientRect();
    }
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w < 48 || h < 48) smallTargets.push({ w, h, tag, n: nameOf(el) });
    if (w < 44 || h < 44) under44 += 1;
    if ((tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab') && !['input', 'textarea', 'select'].includes(tag)) {
      const visText = clean((el as HTMLElement).innerText || '').replace(/[^\p{L}\p{N}]/gu, '');
      if (!visText) iconOnly.push({ n: nameOf(el) || '(이름 없음)', hasLabel: !!(el.getAttribute('aria-label') || el.getAttribute('title')), w, h });
    }
    // 가림(뷰포트 안 요소만)
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx > 0 && cy > 0 && cx < vw && cy < vh) {
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.closest('label') && el.closest('label')!.contains(top))) {
        covered.push({ n: nameOf(el), by: `${top.tagName}.${String((top as HTMLElement).className || '').slice(0, 40)}` });
      }
    }
  }

  // 3) 영어 노출 (URL·이메일 제외)
  const rawText = ((scopeEl as HTMLElement).innerText || '').replace(/https?:\/\/\S+|\S+@\S+|[\w.-]+\.(net|com|kr|io)(\/\S*)?/g, ' ');
  const eng: Record<string, number> = {};
  for (const m of rawText.matchAll(/[A-Za-z][A-Za-z0-9&+\-]*/g)) {
    const w = m[0];
    if (w.length < 2 && !/^[A-Z]$/.test(w)) continue;
    eng[w] = (eng[w] || 0) + 1;
  }

  // 4) 가로 넘침 / 잘림
  const docOverflow = document.documentElement.scrollWidth - vw;
  const offRight: any[] = [];
  const truncated: any[] = [];
  const scrollAncestor = (el: Element) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true;
      n = n.parentElement;
    }
    return false;
  };
  scopeEl.querySelectorAll('*').forEach((el) => {
    if (el.closest('nextjs-portal')) return;
    if (!shown(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 && r.left < vw && !scrollAncestor(el) && offRight.length < 30) offRight.push({ n: nameOf(el) || el.tagName, right: Math.round(r.right) });
    const he = el as HTMLElement;
    const s = getComputedStyle(he);
    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 0);
    if (hasOwnText && (s.overflow === 'hidden' || s.overflowX === 'hidden' || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none')) {
      if (he.scrollWidth > he.clientWidth + 1 || he.scrollHeight > he.clientHeight + 2) truncated.push({ t: clean(he.innerText).slice(0, 40), sw: he.scrollWidth, cw: he.clientWidth });
    }
  });

  const top = (arr: any[]) => arr.slice(0, arg.max);
  return {
    viewport: { vw, vh, dpr: window.devicePixelRatio, rootFont: getComputedStyle(document.documentElement).fontSize },
    textCount: textEls.length,
    sizeHist,
    smallTextCount: small.length,
    smallText: top(small),
    under16,
    lowContrastCount: lowContrast.length,
    lowContrast: top(lowContrast.sort((a, b) => a.cr - b.cr)),
    targets: targets.length,
    smallTargetCount: smallTargets.length,
    under44,
    smallTargets: top(smallTargets),
    iconOnly: top(iconOnly),
    coveredCount: covered.length,
    covered: top(covered),
    english: eng,
    docOverflowPx: docOverflow,
    offRight: top(offRight),
    truncatedCount: truncated.length,
    truncated: top(truncated),
  };
};

async function audit(page: Page, key: string, scope: string | null = null) {
  try {
    const r = await page.evaluate(AUDIT_FN, { scope, max: 25 });
    audits[key] = r;
    console.log(
      `[UX60-B][AUDIT] ${key}: text<14=${r.smallTextCount}/${r.textCount} tgt<48=${r.smallTargetCount}/${r.targets} icon=${r.iconOnly.length} eng=${Object.keys(r.english).length} ovf=${r.docOverflowPx} offR=${r.offRight.length} trunc=${r.truncatedCount} cover=${r.coveredCount} lowCR=${r.lowContrastCount}`,
    );
    return r;
  } catch (e) {
    audits[key] = { error: String(e).slice(0, 200) };
    return null;
  }
}

/** 모달 검사: role=dialog·aria-modal·포커스 이동·닫기 버튼 크기·Esc 닫힘 */
async function checkModal(page: Page, dlg: Locator, name: string, opts: { esc?: boolean } = { esc: true }) {
  const r: any = { name };
  try {
    await dlg.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(400);
    r.ariaModal = await dlg.getAttribute('aria-modal');
    r.focusInside = await dlg.evaluate((d) => d.contains(document.activeElement));
    r.focused = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      return a ? `${a.tagName}:${(a.getAttribute('aria-label') || a.innerText || '').trim().slice(0, 30)}` : null;
    });
    const close = dlg.getByRole('button', { name: /닫기|취소/ }).first();
    const cb = await close.boundingBox().catch(() => null);
    r.closeBtn = cb ? { w: Math.round(cb.width), h: Math.round(cb.height), text: (await close.innerText().catch(() => '')).trim().slice(0, 20) } : null;
    const box = await dlg.boundingBox();
    r.box = box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null;
    r.scrollable = await dlg.evaluate((d) => {
      let max = 0;
      d.querySelectorAll('*').forEach((el) => {
        const he = el as HTMLElement;
        if (he.scrollHeight > he.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(he).overflowY)) max = Math.max(max, he.scrollHeight - he.clientHeight);
      });
      return max;
    });
    if (opts.esc) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      r.escCloses = !(await dlg.isVisible().catch(() => false));
    }
  } catch (e) {
    r.error = String(e).slice(0, 200);
  }
  modalChecks.push(r);
  console.log(`[UX60-B][MODAL] ${JSON.stringify(r).slice(0, 300)}`);
  return r;
}

async function flushToasts(page: Page, label: string) {
  try {
    const arr = await page.evaluate(() => (window as any).__toastLog || []);
    for (const t of arr) toastLog.push({ page: label, ...t, lifetimeMs: t.removed ? t.removed - t.added : null });
    await page.evaluate(() => ((window as any).__toastLog = []));
  } catch {
    /* page closed */
  }
}

// ─────────────────────────────── 안전 mock ───────────────────────────────
async function installGuards(ctx: BrowserContext) {
  // 토스트 수명 관측 + dev 인디케이터 숨김
  await ctx.addInitScript(() => {
    (window as any).__toastLog = [];
    const mark = (n: Node, added: boolean) => {
      if (n.nodeType !== 1) return;
      const el = n as Element;
      const list = el.matches?.('[data-sonner-toast]') ? [el] : Array.from(el.querySelectorAll?.('[data-sonner-toast]') || []);
      for (const t of list) {
        const anyT = t as any;
        if (added) {
          (window as any).__toastLog.push({ text: (t.textContent || '').trim().slice(0, 90), type: t.getAttribute('data-type'), added: Date.now(), removed: null });
          anyT.__idx = (window as any).__toastLog.length - 1;
        } else if (anyT.__idx !== undefined) {
          (window as any).__toastLog[anyT.__idx].removed = Date.now();
          (window as any).__toastLog[anyT.__idx].lastText = (t.textContent || '').trim().slice(0, 90);
        }
      }
    };
    const startObs = () =>
      new MutationObserver((ms) => {
        for (const m of ms) {
          m.addedNodes.forEach((n) => mark(n, true));
          m.removedNodes.forEach((n) => mark(n, false));
        }
      }).observe(document, { childList: true, subtree: true });
    startObs();
    const add = () => {
      if (document.getElementById('__e2e_hide_dev')) return;
      const s = document.createElement('style');
      s.id = '__e2e_hide_dev';
      s.textContent = 'nextjs-portal{display:none!important}';
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  });

  // (0) 최하위 가드: non-GET /api/** · /rest/v1/** (rpc 제외) 를 기록 후 가짜 200 — 실쓰기 누출 0
  await ctx.route(
    (u) => u.pathname.startsWith('/api/') || u.pathname.startsWith('/rest/v1/'),
    async (route) => {
      const req = route.request();
      const m = req.method();
      const u = new URL(req.url());
      if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        blockedWrites.push(`ALLOW-RPC ${m} ${u.pathname}`);
        return route.continue();
      }
      blockedWrites.push(`GUARD ${m} ${u.pathname}`);
      return route.fulfill({ status: 200, json: { ok: true, success: true, mocked: true } });
    },
  );
  // 분석 비콘 / track
  await ctx.route(/\/api\/public\/magazine\/(analytics|poll)|\/track(\/|\?|$)/, (r) => {
    blockedWrites.push(`BEACON ${r.request().method()} ${new URL(r.request().url()).pathname}`);
    return r.fulfill({ status: 204, body: '' });
  });
  // 카카오 SDK 차단 → 공유는 폴백 경로(SDK 실패 상황 재현)
  await ctx.route(/kakaocdn\.net|developers\.kakao\.com|kapi\.kakao\.com/, (r) => r.abort());
}

async function installEditorMocks(page: Page) {
  // 이번 호 초안: 첫 호출만 실서버 → 깨끗한 초안으로 store 초기화
  await page.route('**/api/magazine/editions/draft', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    if (!store.edition) {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      store.realDraft = { status: resp.status(), created: j?.created, label: j?.edition?.edition_label, editionStatus: j?.edition?.status, id: j?.edition?.id };
      notes.draftCalls = [...(notes.draftCalls || []), { ...store.realDraft, at: new Date().toISOString() }];
      if (j?.created === true) notes.draftCreatedId = j?.edition?.id;
      store.realMeta = j?.meta ?? null;
      if (!resp.ok() || !j?.edition) return route.fulfill({ response: resp });
      store.edition = {
        ...j.edition,
        status: 'draft',
        published_at: null,
        title: '',
        market_temp: null,
        cover_keywords: [],
        cover_image_url: null,
        field_note: {},
        theme_title: '',
        theme_body_md: '',
        featured_deal_ids: [],
        target_segments: ['all'],
        content: {},
        updated_at: new Date().toISOString(),
      };
      return route.fulfill({ status: 200, json: { edition: store.edition, created: false, meta: j.meta } });
    }
    return route.fulfill({ status: 200, json: { edition: store.edition, created: false, meta: store.realMeta ?? {} } });
  });
  // 자동저장 PATCH (실패 주입 가능)
  await page.route('**/api/magazine/editions', async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.fallback();
    const body = jsonBody(req) || {};
    const ed = store.edition;
    notes.patchCount = (notes.patchCount || 0) + 1;
    if (store.failNextPatch) {
      store.failNextPatch = false;
      return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다.' } } });
    }
    if (!ed || body.id !== ed.id) return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND', message: '찾을 수 없습니다.' } } });
    if (ed.status === 'published') return route.fulfill({ status: 409, json: { ok: false, error: { code: 'PUBLISHED_LOCKED', message: '이미 발행된 호수입니다.' } } });
    if ('expected_updated_at' in body && body.expected_updated_at !== ed.updated_at) {
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: '다른 곳에서 수정됨' }, currentUpdatedAt: ed.updated_at } });
    }
    const { id: _i, expected_updated_at: _e, ...cols } = body;
    store.edition = { ...ed, ...cols, updated_at: new Date(Date.now() + 1).toISOString() };
    return route.fulfill({ status: 200, json: { edition: store.edition } });
  });
  // 발행 / 정정 발행 (실패 주입 가능)
  await page.route(/\/api\/magazine\/editions\/[^/]+\/publish$/, async (route) => {
    const body = jsonBody(route.request()) || {};
    notes.publishCalls = (notes.publishCalls || 0) + 1;
    if (store.failNextPublish) {
      store.failNextPublish = false;
      return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR', message: '발행 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' } } });
    }
    const ed = store.edition;
    if (!ed) return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND', message: '찾을 수 없습니다.' } } });
    if (ed.status === 'published' && !body.correction) {
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'ALREADY_PUBLISHED', message: '이미 발행된 호수입니다. 수정하려면 정정 발행을 이용해 주세요.' } } });
    }
    const now = new Date().toISOString();
    const { content, ...cols } = body.payload || {};
    store.edition = { ...ed, ...cols, ...(content ? { content } : {}), status: 'published', published_at: ed.published_at || now, updated_at: now };
    return route.fulfill({ status: 200, json: { edition: store.edition, issueDate: kstDate() } });
  });
  // 발송(배포) — 서버 기본값(MAGAZINE_SEND_ENABLED=false)과 같은 SEND_DISABLED 응답
  await page.route('**/api/broker/magazine/distribute**', async (route) => {
    blockedWrites.push(`MOCK distribute ${route.request().method()}`);
    notes.distributeBody = jsonBody(route.request());
    return route.fulfill({ status: 200, json: { success: false, blocked: 'SEND_DISABLED', message: '발송이 중지되어 있습니다(관리자 설정).', published: true, sent: 0 } });
  });
  // AI 비서: 첫 호출만 실 LLM(최대 1회), 이후 502 mock
  await page.route('**/api/broker/studio/ai-comment', async (route) => {
    if (realLlmCalls < 1 && !notes.forceAiFail) {
      realLlmCalls += 1;
      const t0 = Date.now();
      const resp = await route.fetch({ timeout: 90_000 }).catch((e) => e as Error);
      if (resp instanceof Error) {
        notes.aiReal = { error: String(resp).slice(0, 200), ms: Date.now() - t0 };
        return route.fulfill({ status: 504, json: { ok: false, error: { code: 'TIMEOUT', message: 'AI 응답이 지연되고 있습니다.' } } });
      }
      const txt = await resp.text().catch(() => '');
      notes.aiReal = { status: resp.status(), ms: Date.now() - t0, body: txt.slice(0, 400) };
      return route.fulfill({ response: resp, body: txt });
    }
    notes.aiMockFail = (notes.aiMockFail || 0) + 1;
    return route.fulfill({ status: 502, json: { ok: false, error: { code: 'LLM_UNAVAILABLE', message: 'AI 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' } } });
  });
}

// 구독자 목록에 E2E 행 주입(실 DB 무변경) + 모든 쓰기 mock (성공/실패 토글)
const subMock = { failNextPost: false, injected: [] as any[] };
async function installSubscriberMocks(page: Page) {
  await page.route('**/api/broker/magazine/subscribers**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const m = req.method();
    if (m === 'GET' && u.pathname.endsWith('/subscribers')) {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => ({}));
      const status = u.searchParams.get('status') || 'active';
      const real: any[] = Array.isArray(j.subscribers) ? j.subscribers : [];
      notes.realSubscriberCount = notes.realSubscriberCount ?? {};
      notes.realSubscriberCount[status] = { n: real.length, total: j.total };
      notes.subscriberKeys ??= real[0] ? Object.keys(real[0]) : null;
      const base = real[0] ? { ...real[0] } : {};
      const mk = (o: any) => ({
        ...base,
        id: o.id,
        subscriber_name: o.name,
        subscriber_phone: o.phone,
        subscriber_email: null,
        channel: 'kakao',
        status: o.status,
        source: 'manual',
        created_at: new Date(Date.now() - 86400_000 * 20).toISOString(),
        unsubscribed_at: o.status === 'unsubscribed' ? new Date(Date.now() - 86400_000 * 2).toISOString() : null,
        interest_profile: { tags: { regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] } },
        buyer_temperature: o.temp ?? base.buyer_temperature,
      });
      const inj =
        status === 'unsubscribed'
          ? [mk({ id: '00000000-0000-4000-8000-0000000ux602', name: 'E2E_UX60_해지고객', phone: '01000000602', status: 'unsubscribed' })]
          : status === 'active'
            ? [mk({ id: '00000000-0000-4000-8000-0000000ux601', name: 'E2E_UX60_김투자', phone: '01000000601', status: 'active' })]
            : [];
      subMock.injected = inj;
      return route.fulfill({ status: 200, json: { ...j, subscribers: [...inj, ...real], total: (j.total ?? real.length) + inj.length } });
    }
    if (m === 'GET') return route.fallback();
    blockedWrites.push(`MOCK subscribers ${m} ${u.pathname}`);
    if (m === 'POST' && u.pathname.endsWith('/subscribers')) {
      notes.subPostBodies = [...(notes.subPostBodies || []), jsonBody(req)];
      if (subMock.failNextPost) {
        subMock.failNextPost = false;
        return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다.' } } });
      }
      return route.fulfill({ status: 201, json: { success: true, subscriber: { id: '00000000-0000-4000-8000-0000000ux609' }, consentRecorded: true } });
    }
    if (m === 'POST' && u.pathname.endsWith('/intent')) return route.fulfill({ status: 200, json: { ok: true, count: 0, created: 0, reason: 'NO_EVIDENCE' } });
    if (m === 'PATCH') return route.fulfill({ status: 200, json: { success: true } });
    if (m === 'DELETE') return route.fulfill({ status: 200, json: { success: true } });
    return route.fulfill({ status: 200, json: { success: true } });
  });
}

async function injectHotLeadIfNone(page: Page) {
  await page.route(/\/api\/broker\/magazine\/analytics(\?|$)/, async (route) => {
    if (new URL(route.request().url()).searchParams.get('subscriberId')) return route.fallback();
    const resp = await route.fetch();
    const j = await resp.json().catch(() => ({}));
    notes.realHotLeads = Array.isArray(j.hotLeads) ? j.hotLeads.length : 'n/a';
    if (!Array.isArray(j.hotLeads) || j.hotLeads.length === 0) {
      j.hotLeads = [
        {
          id: '00000000-0000-4000-8000-0000000ux6a1',
          subscriber_name: 'E2E_UX60_박건물',
          subscriber_phone: '010-0000-0611',
          subscriber_email: null,
          segment: 'investor',
          channel: 'kakao',
          interest_tags: { regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] },
          buyerTemperature: '📈 관심',
          temperatureReason: 'intent_floor',
          score: 62,
          totalViews: 3,
          lastActiveAt: new Date(Date.now() - 3600_000 * 5).toISOString(),
          recentSections: ['featured_deals', 'field_note'],
        },
      ];
      notes.hotLeadInjected = true;
    }
    return route.fulfill({ status: 200, json: j });
  });
}

async function newCtx(browser: Browser, baseURL: string, kind: 'desktop125' | 'desktop125short' | 'mobile') {
  const common = {
    baseURL,
    storageState: AUTH_STATE,
    locale: 'ko-KR',
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  };
  const ctx =
    kind === 'mobile'
      ? await browser.newContext({ ...common, viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ANDROID_CHROME_UA })
      : await browser.newContext({
          ...common,
          // 1366×768 @125% ≈ 1093×614 CSS px (brief 기준). short = 작업표시줄·브라우저 UI 제외 실가용 ≈ 1093×515
          viewport: { width: 1093, height: kind === 'desktop125short' ? 515 : 614 },
          deviceScaleFactor: 1.25,
        });
  await installGuards(ctx);
  return ctx;
}

function watch(page: Page, label: string) {
  page.on('pageerror', (e) => pageErrors.push(`[${label}] ${String(e).slice(0, 200)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && !u.includes('/_next/') && !/kakao/.test(u)) badResponses.push(`[${label}] ${r.status()} ${r.request().method()} ${u.slice(0, 140)}`);
  });
  page.on('dialog', async (d) => {
    dialogs.push(`[${label}] ${d.type()}: ${d.message().slice(0, 100)}`);
    if (d.type() === 'beforeunload') await d.accept();
    else await d.dismiss();
  });
}

const tabLoc = (page: Page, label: string) => page.getByRole('tab', { name: new RegExp(`^${label.replace(/[&]/g, '\\$&')}(, 작성 완료)?$`) });

// ═══════════════════════════════════════════════════════════════════════════
test.describe.configure({ mode: 'serial' });

test.describe('UX60 중개인 B(김영수 62세) — 주간 매거진 루틴', () => {
  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  test.afterAll(async () => {
    const cleanup: Record<string, any> = {};
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const sb = createClient(url, key, { auth: { persistSession: false } });
        if (notes.draftCreatedId) {
          // 이번 실행이 만든 초안이고, 이후 아무도 수정하지 않았을 때만(모든 쓰기 mock → updated_at==created_at) 삭제
          const row = await sb.from('magazine_editions').select('id, created_at, updated_at, status').eq('id', notes.draftCreatedId).maybeSingle();
          if (row.data && row.data.status === 'draft' && row.data.created_at === row.data.updated_at && row.data.created_at >= RUN_START) {
            const ed = await sb.from('magazine_editions').delete().eq('id', notes.draftCreatedId).select('id');
            cleanup.createdDraft = ed.error ? `error: ${ed.error.message}` : ed.data;
          } else cleanup.createdDraft = { skipped: 'modified-or-missing', row: row.data };
        }
        const subs = await sb.from('magazine_subscribers').select('id').like('subscriber_name', 'E2E_UX60_%');
        cleanup.e2eSubscribersInDb = subs.error ? `error: ${subs.error.message}` : (subs.data || []).length;
        const iss = await sb.from('magazine_issues').select('id').eq('broker_id', BROKER_SLUG).gte('created_at', RUN_START);
        cleanup.issuesCreatedDuringRun = iss.error ? `error: ${iss.error.message}` : (iss.data || []).length;
      } else cleanup.skipped = 'no service role env';
    } catch (e) {
      cleanup.exception = String(e).slice(0, 200);
    }
    const summary = {
      runAt: new Date().toISOString(),
      realLlmCalls,
      phases,
      audits,
      modalChecks,
      toastLog,
      dialogs,
      blockedWrites,
      pageErrors: pageErrors.slice(0, 40),
      badResponses: badResponses.slice(0, 60),
      errors,
      notes,
      store: { realDraft: store.realDraft, realMeta: store.realMeta },
      shots,
      cleanup,
    };
    fs.writeFileSync(path.join(OUT, process.env.UX60_RESULTS || 'results.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n=== UX60 BROKER DONE — shots ${shots.length}, errors ${Object.keys(errors).length}, LLM ${realLlmCalls}, cleanup ${JSON.stringify(cleanup).slice(0, 200)}`);
    for (const [k, v] of Object.entries(phases)) console.log(`[PHASE] ${k}: clicks ${v.clicks} / screens ${v.transitions} / inputs ${v.inputs} (${v.typedChars}자) / wait ${v.waitMs}ms`);
    for (const [k, v] of Object.entries(errors)) console.log(`[ERR] ${k}: ${v}`);
  });

  // ─────────────────────────────── 데스크톱 125% ───────────────────────────────
  test('데스크톱 125% — B1~B10 주간 루틴', async ({ browser, baseURL }) => {
    test.setTimeout(1_800_000);
    const ctx = await newCtx(browser, baseURL!, 'desktop125');
    const page = await ctx.newPage();
    currentPage = page;
    page.setDefaultNavigationTimeout(120_000);
    watch(page, 'D');
    await installEditorMocks(page);
    await installSubscriberMocks(page);
    const panel = page.locator('#editor-tabpanel');
    const today = kstDate();

    // ══ B1 대시보드 → 매거진 진입점 ══
    ph('B1 진입점 찾기');
    await safe('B1', async () => {
      screen('로그인 후 대시보드(/broker)');
      await timed('대시보드 첫 화면', async () => {
        await page.goto('/broker', { waitUntil: 'domcontentloaded' });
        await page.locator('#quick-action-magazine-editor').waitFor({ state: 'visible', timeout: 120_000 });
      });
      await page.waitForTimeout(1500);
      await shot(page, 'D_B1_dashboard_125.png');
      await audit(page, 'D_B1_dashboard');
      const qa = page.locator('#quick-action-magazine-editor');
      const box = await qa.boundingBox();
      notes.B1 = {
        quickActionText: (await qa.innerText()).replace(/\s+/g, ' '),
        quickActionBox: box,
        aboveFold: box ? box.y + box.height <= 614 : null,
        insightCardOnHome: await page.getByText('내 매거진 성과').first().isVisible().catch(() => false),
        homeMentionsMagazine: await page.getByText(/매거진/).count(),
      };
      // 인텔리전스 탭에 MagazineInsightCard 가 있는지 (발견성)
      const intelTab = page.getByRole('button', { name: /인텔리전스/ }).or(page.getByRole('tab', { name: /인텔리전스/ })).first();
      if (await intelTab.isVisible().catch(() => false)) {
        await intelTab.click();
        await page.waitForTimeout(2500);
        notes.B1.insightCardInIntelTab = await page.getByText('내 매거진 성과').first().isVisible().catch(() => false);
        if (notes.B1.insightCardInIntelTab) {
          await page.getByText('내 매거진 성과').first().scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, 'D_B1_insight_card_125.png');
          await audit(page, 'D_B1_insight_card');
        }
        // 원래 탭 복귀(측정 외)
        await page.goto('/broker', { waitUntil: 'domcontentloaded' });
        await page.locator('#quick-action-magazine-editor').waitFor({ state: 'visible', timeout: 120_000 });
      }
      await flushToasts(page, 'dashboard');
      await tap(page.locator('#quick-action-magazine-editor'), '홈 퀵액션 "매거진 편집"');
      screen('매거진 에디터(Content Studio)');
      await timed('에디터 로딩(첫 컴파일 포함)', async () => {
        await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      });
      await timed('미리보기 렌더', async () => {
        await expect
          .poll(async () => {
            const f = page.frames().find((fr) => fr.url().includes('preview=1'));
            return f ? (await f.locator('body').innerText().catch(() => '')).trim().length : 0;
          }, { timeout: 45_000 })
          .toBeGreaterThan(20)
          .catch(() => (notes.previewRenderTimeout = true));
      });
    });

    // ══ B3 에디터 첫 화면 이해 ══
    ph('B3 이번 주 매거진 만들기');
    await safe('B3-overview', async () => {
      if (!(await page.getByRole('heading', { name: 'Content Studio', level: 1 }).isVisible().catch(() => false))) {
        notes.B1_fallbackDirectNav = true;
        await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
        await page.waitForTimeout(3000);
      }
      await shot(page, 'D_B3_editor_overview_125.png');
      await audit(page, 'D_B3_editor_overview');
      const tabs = await page.getByRole('tablist', { name: '콘텐츠 편집 단계' }).getByRole('tab').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const s = e.querySelector('span') as HTMLElement | null;
          return { label: e.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), labelPx: s ? parseFloat(getComputedStyle(s).fontSize) : null, labelVisible: s ? s.getBoundingClientRect().width > 0 : false };
        }),
      );
      notes.B3_tabs = tabs;
      notes.B3_header = {
        progress: await page.getByTestId('editor-progress').innerText().catch(() => null),
        saveBadge: await page.getByRole('status').first().innerText().catch(() => null),
        h1: 'Content Studio',
        badge: await page.getByTestId('my-magazine-badge').innerText().catch(() => null),
      };
      // 하단 발행 버튼이 첫 화면(614px) 안에 보이는가
      const pub = page.getByRole('button', { name: '발행하기' }).first();
      const pb = await pub.boundingBox();
      notes.B3_publishBtn = { box: pb, inFold: pb ? pb.y + pb.height <= 614 : null };
      // 미리보기 폰 프레임 위치(가운데 정렬 + overflow 로 위가 잘리는지)
      notes.B5_frame = await page.getByTestId('phone-frame').evaluate((f) => {
        const r = f.getBoundingClientRect();
        const sc = f.parentElement?.parentElement as HTMLElement | null;
        const sr = sc?.getBoundingClientRect();
        return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), containerTop: sr ? Math.round(sr.top) : null, containerScrollH: sc?.scrollHeight, containerClientH: sc?.clientHeight, containerScrollTopMax: sc ? sc.scrollHeight - sc.clientHeight : null };
      });
    });

    // 커버
    await safe('B3-cover', async () => {
      await tap(tabLoc(page, '커버'), '탭 "커버"');
      const tempGroup = page.getByRole('group', { name: /시장 온도/ });
      await tap(tempGroup.getByRole('button', { name: '선별 매수', exact: true }), '시장 온도 "선별 매수"');
      const kws = ['금리 동결', '공실률 최저', '선별 매수'];
      for (let i = 0; i < 3; i++) await typeIn(page.getByLabel(`키워드 ${i + 1}`, { exact: true }), kws[i], `키워드 ${i + 1}`);
      await typeIn(panel.getByPlaceholder('매거진 제목을 입력하세요'), '하반기 금리 인하 기대 속, 강남 투자 기회 분석', '헤드라인');
      await typeIn(
        panel.getByPlaceholder('고객에게 전달할 핵심 메시지를 입력하세요'),
        '이번 주 강남권 중소형 빌딩 시장은 금리 동결 이후 매수 문의가 늘었지만, 매도 호가가 함께 올라 실제 거래는 선별적으로 이뤄지고 있습니다.',
        '핵심 메시지(브리핑)',
      );
      notes.B3_coverInputs = await panel.locator('input, textarea').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const cs = getComputedStyle(e);
          const id = e.getAttribute('id');
          const lab = (id && document.querySelector(`label[for="${id}"]`)?.textContent) || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '';
          return { label: lab.trim().slice(0, 30), tag: e.tagName, px: parseFloat(cs.fontSize), h: Math.round(r.height), w: Math.round(r.width), maxlength: e.getAttribute('maxlength'), rows: e.getAttribute('rows') };
        }),
      );
      notes.B3_coverCounters = await panel.getByText(/\d+\s*\/\s*\d+/).allInnerTexts().catch(() => []);
      await shot(page, 'D_B3_cover_filled_125.png');
      await audit(page, 'D_B3_cover', '#editor-tabpanel');
    });

    // 필드노트
    await safe('B3-fieldnote', async () => {
      await tap(tabLoc(page, '필드노트'), '탭 "필드노트"');
      const fn: [string, string][] = [
        ['주간 시장 요약', '이번 주 강남 꼬마빌딩 시장은 어떤 분위기인가요?'],
        ['매수자 반응', '금리 인하 기대감으로 매수 문의가 전주보다 늘었습니다. 특히 역삼·삼성 권역 50억 이하 물건에 집중됩니다.'],
        ['매도자 반응', "아직 호가 조정 의사가 낮습니다. 매도자 대부분이 '급할 이유 없다'는 입장입니다."],
        ['시장 판단', '선별적 매수 기회. 연 수익률 4% 이상 물건 우선 검토 권장.'],
      ];
      for (const [l, v] of fn) await typeIn(panel.getByLabel(l, { exact: true }), v, `필드노트 ${l}`);
      notes.B3_fieldInputs = await panel.locator('textarea, input').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { aria: e.getAttribute('aria-label') || e.getAttribute('id'), px: parseFloat(getComputedStyle(e).fontSize), h: Math.round(r.height), w: Math.round(r.width), maxlength: e.getAttribute('maxlength'), rows: e.getAttribute('rows'), placeholder: (e.getAttribute('placeholder') || '').slice(0, 40) };
        }),
      );
      notes.B3_fieldCounters = await panel.getByText(/\d+\s*\/\s*\d+/).allInnerTexts().catch(() => []);
      const helpBtn = panel.getByRole('button', { name: '매수자 반응 작성 도움말' });
      const hb = await helpBtn.boundingBox().catch(() => null);
      notes.B3_helpBtn = hb ? { w: Math.round(hb.width), h: Math.round(hb.height), text: await helpBtn.innerText().catch(() => '') } : null;
      await shot(page, 'D_B3_fieldnote_125.png');
      await audit(page, 'D_B3_fieldnote', '#editor-tabpanel');
    });

    // 테마 & 매물
    await safe('B3-theme', async () => {
      await tap(tabLoc(page, '테마&매물'), '탭 "테마&매물"');
      await panel.getByText(/주목 매물 \(\d+\/\d+\)/).waitFor({ timeout: 30_000 }).catch(() => {});
      notes.B3_dealHeader = await panel.getByText(/주목 매물 \(\d+\/\d+\)/).innerText().catch(() => null);
      await typeIn(panel.getByLabel('테마 제목', { exact: true }), '하반기 강남 역세권 투자 기회', '테마 제목');
      notes.B3_themeBodyLabel = await panel.getByLabel(/테마 본문/).getAttribute('aria-label').catch(() => null);
      notes.B3_themeLabels = await panel.locator('label').allInnerTexts().catch(() => []);
      await shot(page, 'D_B3_theme_deals_125.png');
      await audit(page, 'D_B3_theme', '#editor-tabpanel');
      notes.B3_dealCards = await panel.locator('button[aria-pressed]').evaluateAll((els) =>
        els.slice(0, 4).map((e) => ({ t: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 80), h: Math.round(e.getBoundingClientRect().height), pressed: e.getAttribute('aria-pressed') })),
      );
    });

    // 뉴스
    await safe('B3-news', async () => {
      await tap(tabLoc(page, '뉴스'), '탭 "뉴스"');
      const hdr = panel.getByText(/뉴스 큐레이션 \(\d+\/6 선택\)/);
      await hdr.waitFor({ timeout: 30_000 }).catch(() => {});
      notes.B3_newsHeader = await hdr.innerText().catch(() => null);
      notes.B3_newsHasDrag = (await panel.locator('[draggable="true"], [aria-roledescription*="drag" i]').count()) > 0;
      notes.B3_newsCards = await panel.locator('button[aria-pressed]').evaluateAll((els) =>
        els.slice(0, 3).map((e) => ({ t: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 100), h: Math.round(e.getBoundingClientRect().height), pressed: e.getAttribute('aria-pressed') })),
      );
      // 6개 초과 시도 → 안내 토스트(지속시간 관측)
      const off = panel.locator('button[aria-pressed="false"]');
      for (let i = 0; i < 3 && (await off.count()) > 0; i++) await tap(off.first(), '뉴스 카드 선택(추가)');
      await page.waitForTimeout(600);
      notes.B3_newsLimitToast = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
      await shot(page, 'D_B3_news_125.png');
      await audit(page, 'D_B3_news', '#editor-tabpanel');
    });

    // AI 비서 (실 LLM 1회 + 실패 mock 1회)
    await safe('B3-ai', async () => {
      await tap(tabLoc(page, 'AI비서'), '탭 "AI비서"');
      await typeIn(panel.locator('#ai-assist-idea'), '이번주 역삼동 물건 좋다. 수익률 4.2% 리모델링하면 더 올라갈듯. 투자자한테 추천할만함.', 'AI 메모');
      const gen = panel.getByRole('button', { name: /AI 말투 생성하기/ });
      notes.B3_aiBtnText = await gen.innerText().catch(() => null);
      await tap(gen, '"✨ AI 말투 생성하기"(실 LLM)');
      await timed('AI 응답(실 LLM)', async () => {
        await Promise.race([
          panel.locator('#ai-assist-result').waitFor({ state: 'visible', timeout: 90_000 }),
          page.locator('[data-sonner-toast][data-type="error"]').first().waitFor({ state: 'visible', timeout: 90_000 }),
        ]).catch(() => {});
      });
      await page.waitForTimeout(500);
      notes.B3_aiRealOutcome = {
        resultVisible: await panel.locator('#ai-assist-result').isVisible().catch(() => false),
        result: (await panel.locator('#ai-assist-result').inputValue().catch(() => '')).slice(0, 200),
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
        inlineAlerts: await panel.getByRole('alert').allInnerTexts().catch(() => []),
        warningsText: await panel.getByText(/확인|검토|주의|AI/).allInnerTexts().then((a) => a.slice(0, 8)).catch(() => []),
      };
      await shot(page, 'D_B3_ai_real_125.png');
      await audit(page, 'D_B3_ai', '#editor-tabpanel');
      // 실패 경험 (mock 502)
      notes.forceAiFail = true;
      await tap(panel.getByRole('button', { name: /AI 말투 생성하기/ }), '"AI 말투 생성하기" 재시도(실패 mock)');
      await page.waitForTimeout(1500);
      notes.B3_aiFail = {
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
        inlineAlerts: await panel.getByRole('alert').allInnerTexts().catch(() => []),
        memoKept: (await panel.locator('#ai-assist-idea').inputValue().catch(() => '')).length > 0,
      };
      await shot(page, 'D_B3_ai_fail_125.png');
      // 결과를 필드노트에 넣기(있으면)
      const apply = panel.getByRole('button', { name: '필드노트에 넣기' });
      if (await apply.isVisible().catch(() => false)) {
        await tap(apply, '"필드노트에 넣기"');
        screen('필드노트 탭으로 자동 이동');
      } else {
        await tap(tabLoc(page, '필드노트'), '탭 "필드노트"(직접 한마디)');
        await typeIn(panel.getByLabel('독자에게 한마디', { exact: true }), '이번 주 눈여겨볼 매물은 역삼동 5층 코너 건물입니다.', '독자에게 한마디(직접)');
      }
    });

    // 발행설정: 섹션 켜기/끄기
    await safe('B3-publish-settings', async () => {
      await tap(tabLoc(page, '발행설정'), '탭 "발행설정"');
      await page.waitForTimeout(800);
      notes.B3_publishTabTexts = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 1500);
      const sentiment = panel.getByRole('checkbox', { name: /심리지수/ });
      if (await sentiment.isVisible().catch(() => false)) {
        const sb = await sentiment.boundingBox();
        notes.B3_sectionToggle = { checkbox: sb ? { w: Math.round(sb.width), h: Math.round(sb.height) } : null };
        await tap(sentiment, '섹션 "심리지수" 끄기');
      }
      notes.B3_sectionUpDown = await panel.getByRole('button', { name: /위로$|아래로$/ }).evaluateAll((els) =>
        els.slice(0, 4).map((e) => ({ n: e.getAttribute('aria-label'), text: (e as HTMLElement).innerText.trim(), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) })),
      );
      notes.B3_slugField = {
        value: await panel.locator('#editor-slug').inputValue().catch(() => null),
        label: await page.locator('label[for="editor-slug"]').innerText().catch(() => null),
      };
      await shot(page, 'D_B3_publish_settings_125.png');
      await audit(page, 'D_B3_publish_settings', '#editor-tabpanel');
      await panel.getByText('섹션 순서·노출').scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'D_B3_sections_125.png');
    });

    // ══ B4 저장 안심 ══
    ph('B4 저장 안심');
    await safe('B4', async () => {
      await tap(tabLoc(page, '커버'), '탭 "커버"');
      const badge = page.getByRole('status').filter({ hasText: /저장|변경|자동/ }).first();
      notes.B4_badgeStates = [];
      const t0 = Date.now();
      await typeIn(page.getByLabel('키워드 1', { exact: true }), '금리 동결!', '키워드 1 수정');
      for (let i = 0; i < 14; i++) {
        const txt = await badge.innerText().catch(() => '');
        if (!notes.B4_badgeStates.find((s: any) => s.t === txt)) notes.B4_badgeStates.push({ t: txt, ms: Date.now() - t0 });
        await page.waitForTimeout(500);
      }
      const bb = await badge.locator('span').first().boundingBox().catch(() => null);
      notes.B4_badgeBox = bb ? { w: Math.round(bb.width), h: Math.round(bb.height), px: await badge.locator('span').first().evaluate((e) => getComputedStyle(e).fontSize) } : null;
      await shot(page, 'D_B4_saved_badge_125.png');
      // 저장 실패 → 배지·문구·다시 시도
      store.failNextPatch = true;
      await typeIn(page.getByLabel('키워드 2', { exact: true }), '공실률 최저.', '키워드 2 수정(저장 실패 주입)');
      await page.getByText('저장 실패', { exact: true }).waitFor({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(500);
      const retry = page.getByRole('button', { name: '다시 시도' });
      const rb = await retry.boundingBox().catch(() => null);
      notes.B4_fail = {
        badge: await badge.innerText().catch(() => null),
        retryBtn: rb ? { w: Math.round(rb.width), h: Math.round(rb.height) } : null,
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
      };
      await shot(page, 'D_B4_save_failed_125.png');
      await audit(page, 'D_B4_save_failed');
      // 실패 상태에서 새로고침 시도 → beforeunload 경고?
      const dBefore = dialogs.length;
      await flushToasts(page, 'editor-before-reload1');
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      notes.B4_beforeunloadOnFailedReload = dialogs.slice(dBefore);
      await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      notes.B4_afterReloadKeyword2 = await page.getByLabel('키워드 2', { exact: true }).inputValue().catch(() => null);
      // 변경 직후(디바운스 전) 새로고침 → 경고?
      await tabLoc(page, '커버').click().catch(() => {});
      await typeIn(page.getByLabel('키워드 3', { exact: true }), '선별 매수!', '키워드 3 수정 직후 새로고침');
      const d2 = dialogs.length;
      await flushToasts(page, 'editor-before-reload2');
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      notes.B4_beforeunloadOnDirtyReload = dialogs.slice(d2);
      await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      notes.B4_afterReloadKeyword3 = await page.getByLabel('키워드 3', { exact: true }).inputValue().catch(() => null);
      // 수동 저장 버튼
      await typeIn(page.getByLabel('키워드 1', { exact: true }), '금리 동결', '키워드 1 되돌림');
      await tap(page.getByRole('button', { name: '저장', exact: true }), '헤더 "저장"');
      await page.waitForTimeout(800);
      notes.B4_manualSaveToast = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
    });

    // ══ B5 미리보기 ══
    ph('B5 미리보기');
    await safe('B5', async () => {
      const f = page.frames().find((fr) => fr.url().includes('preview=1'));
      if (f) {
        notes.B5_previewText = await f.evaluate(() => {
          const sizes: Record<string, number> = {};
          let n = 0;
          document.querySelectorAll('body *').forEach((el) => {
            const has = Array.from(el.childNodes).some((c) => c.nodeType === 3 && (c.textContent || '').trim());
            if (!has) return;
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            const k = String(Math.round(parseFloat(getComputedStyle(el).fontSize)));
            sizes[k] = (sizes[k] || 0) + 1;
            n++;
          });
          return { n, sizes, vw: innerWidth, vh: innerHeight };
        });
      }
      notes.B5_label = await page.getByText(/iPhone|미리보기/).allInnerTexts().catch(() => []);
      // 실제 화면으로 보기 → 새 탭(발행 전에는?)
      const link = page.getByRole('link', { name: /실제 화면으로 보기/ });
      notes.B5_realLink = { href: await link.getAttribute('href'), target: await link.getAttribute('target') };
      const [np] = await Promise.all([ctx.waitForEvent('page', { timeout: 20_000 }).catch(() => null), tap(link, '"📱 실제 화면으로 보기"')]);
      if (np) {
        screen('새 탭: 공개 매거진(발행 전)');
        await np.waitForLoadState('domcontentloaded', { timeout: 120_000 }).catch(() => {});
        await np.waitForTimeout(3000);
        notes.B5_realPage = { url: np.url(), text: (await np.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300) };
        await np.screenshot({ path: path.join(OUT, 'D_B5_real_view_before_publish_125.png') }).catch(() => {});
        shots.push('D_B5_real_view_before_publish_125.png');
        await np.close();
      }
      await shot(page, 'D_B5_preview_125.png');
    });

    // ══ B6 발행 ══
    ph('B6 발행');
    await safe('B6', async () => {
      notes.B6_meta = store.realMeta;
      // (1) 실패 케이스
      store.failNextPublish = true;
      await tap(page.getByRole('button', { name: '발행하기' }).first(), '하단 "발행하기"');
      const confirm = page.getByRole('dialog', { name: /발행 확인/ });
      await confirm.waitFor({ timeout: 20_000 });
      screen('발행 확인 모달');
      notes.B6_confirmText = (await confirm.innerText()).replace(/\s+/g, ' ');
      await shot(page, 'D_B6_publish_confirm_125.png');
      await audit(page, 'D_B6_confirm', '[role="dialog"]');
      await checkModal(page, confirm, '발행 확인', { esc: false });
      await tap(confirm.getByRole('button', { name: '발행하기' }), '모달 "발행하기"(실패 주입)');
      await page.waitForTimeout(2500);
      notes.B6_failOutcome = {
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
        dialogStillOpen: await confirm.isVisible().catch(() => false),
        alerts: await page.getByRole('alert').allInnerTexts().catch(() => []),
      };
      await shot(page, 'D_B6_publish_failed_125.png');
      if (await confirm.isVisible().catch(() => false)) {
        await tap(confirm.getByRole('button', { name: '취소' }), '모달 "취소"');
      }
      // (2) 성공 케이스 (발송 꺼짐)
      await tap(page.getByRole('button', { name: '발행하기' }).first(), '하단 "발행하기"(재시도)');
      await confirm.waitFor({ timeout: 20_000 });
      const sendCb = confirm.getByRole('checkbox');
      notes.B6_sendCheckbox = { count: await sendCb.count(), checked: (await sendCb.count()) ? await sendCb.first().isChecked() : null };
      await checkModal(page, confirm, '발행 확인(Esc)', { esc: true });
      notes.B6_escClosedConfirm = !(await confirm.isVisible().catch(() => false));
      if (!(await confirm.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: '발행하기' }).first(), '하단 "발행하기"(Esc 후 다시)');
      await confirm.waitFor({ timeout: 20_000 });
      await tap(confirm.getByRole('button', { name: '발행하기' }), '모달 "발행하기"');
      const share = page.getByRole('dialog', { name: /발행 완료/ });
      await timed('발행 처리', async () => {
        await share.waitFor({ timeout: 30_000 });
      });
      screen('발행 완료(공유) 모달');
      await page.waitForTimeout(500);
      notes.B6_shareText = (await share.innerText()).replace(/\s+/g, ' ');
      notes.B6_toastsAfterPublish = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
      await shot(page, 'D_B6_published_share_modal_125.png');
      await audit(page, 'D_B6_share_modal', '[role="dialog"]');

      // ══ B7 공유 ══
      ph('B7 공유');
      const kakaoBtn = share.getByRole('button', { name: /카카오톡/ });
      await tap(kakaoBtn, '"카카오톡으로 1:1 수동 공유"(SDK 차단)');
      await page.waitForTimeout(1200);
      notes.B7_kakaoFallback = {
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
        inline: (await share.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-200),
        clipboard: await page.evaluate(() => navigator.clipboard.readText()).catch(() => null),
      };
      await shot(page, 'D_B7_kakao_fallback_125.png');
      await tap(share.getByRole('button', { name: /링크 복사/ }), '"개인화 매거진 링크 복사하기"');
      await page.waitForTimeout(800);
      notes.B7_copy = {
        toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []),
        clipboard: await page.evaluate(() => navigator.clipboard.readText()).catch(() => null),
        btnLabels: await share.getByRole('button').allInnerTexts().catch(() => []),
      };
      await checkModal(page, share, '발행 완료(공유)', { esc: true });
      if (await share.isVisible().catch(() => false)) await tap(share.getByRole('button', { name: '닫기' }), '공유 모달 "닫기"');
      notes.B6_afterPublish = {
        note: await page.getByRole('note').allInnerTexts().catch(() => []),
        correctionBtn: await page.getByRole('button', { name: '정정 발행' }).isVisible().catch(() => false),
        statusBadge: await page.getByText('발행됨').first().isVisible().catch(() => false),
      };
      await shot(page, 'D_B6_after_publish_125.png');
    });

    // QR (아웃리치 탭)
    await safe('B7-QR', async () => {
      ph('B7 공유');
      await tap(tabLoc(page, '아웃리치'), '탭 "아웃리치"');
      await panel.getByText(/총 \d+명 중 \d+명 표시/).waitFor({ timeout: 30_000 }).catch(() => {});
      await tap(panel.getByRole('button', { name: 'QR 코드' }), '"QR 코드"');
      const qr = page.getByRole('dialog', { name: /QR/ });
      await qr.waitFor({ timeout: 10_000 });
      screen('QR 모달');
      notes.B7_qrText = (await qr.innerText()).replace(/\s+/g, ' ');
      notes.B7_qrPrintTextPx = await qr.getByText(/스마트폰 카메라로 비추시면/).evaluate((e) => getComputedStyle(e).fontSize).catch(() => null);
      notes.B7_qrUrlPx = await qr.getByText(/\/subscribe/).first().evaluate((e) => getComputedStyle(e).fontSize).catch(() => null);
      await shot(page, 'D_B7_qr_modal_125.png');
      await audit(page, 'D_B7_qr', '[role="dialog"]');
      const dlP = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
      await tap(qr.getByRole('button', { name: /인쇄용 QR/ }), '"인쇄용 QR (8cm · 300DPI)"');
      const dl = await dlP;
      notes.B7_qrDownload = dl ? { name: dl.suggestedFilename() } : null;
      await page.waitForTimeout(500);
      notes.B7_qrToast = await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []);
      await checkModal(page, qr, 'QR', { esc: true });
      if (await qr.isVisible().catch(() => false)) await qr.getByRole('button', { name: '닫기' }).click();
    });

    // ══ B8 구독자 관리 ══
    ph('B8 구독자 관리');
    await safe('B8', async () => {
      await panel.getByText(/총 \d+명 중 \d+명 표시/).waitFor({ timeout: 30_000 }).catch(() => {});
      notes.B8_header = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 900);
      await shot(page, 'D_B8_subscriber_list_125.png');
      await audit(page, 'D_B8_list', '#editor-tabpanel');
      notes.B8_rows = await panel.getByRole('list', { name: '구독자 목록' }).locator('li').evaluateAll((els) =>
        els.slice(0, 3).map((e) => ({ t: (e as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 120), h: Math.round(e.getBoundingClientRect().height) })),
      );
      // 수동 추가 — 실패(500) → 성공
      await tap(panel.getByRole('button', { name: '추가', exact: true }).first(), '"추가"');
      const add = page.getByRole('dialog', { name: '새 구독자 추가' });
      await add.waitFor({ timeout: 10_000 });
      screen('구독자 추가 모달');
      await typeIn(add.getByLabel(/^이름/), 'E2E_UX60_최고객', '이름');
      await typeIn(add.getByLabel(/휴대폰 번호/), '01000000603', '휴대폰');
      await tap(add.getByRole('button', { name: '구독자 추가' }), '"구독자 추가"(동의 미체크)');
      notes.B8_consentError = await add.getByRole('alert').allInnerTexts().catch(() => []);
      notes.B8_consentText = (await add.innerText()).replace(/\s+/g, ' ');
      await shot(page, 'D_B8_add_consent_error_125.png');
      await audit(page, 'D_B8_add', '[role="dialog"]');
      await tap(add.getByLabel('고객이 수신에 동의했음을 확인합니다'), '동의 확인 체크');
      subMock.failNextPost = true;
      await tap(add.getByRole('button', { name: '구독자 추가' }), '"구독자 추가"(서버 500 주입)');
      await page.waitForTimeout(1500);
      notes.B8_addFail = { alerts: await add.getByRole('alert').allInnerTexts().catch(() => []), toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []) };
      await shot(page, 'D_B8_add_failed_125.png');
      await tap(add.getByRole('button', { name: '구독자 추가' }), '"구독자 추가"(재시도 성공)');
      await page.waitForTimeout(1500);
      notes.B8_addOk = { toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []), dialogOpen: await add.isVisible().catch(() => false) };
      if (await add.isVisible().catch(() => false)) await checkModal(page, add, '구독자 추가', { esc: true });
      // 상세 → 태그 → 삭제 확인
      const row = panel.getByRole('list', { name: '구독자 목록' }).getByRole('button', { name: /E2E_UX60_김투자/ });
      await tap(row, '구독자 행 "E2E_UX60_김투자"');
      const detail = page.getByRole('dialog', { name: '구독자 상세' });
      await detail.waitFor({ timeout: 10_000 });
      screen('구독자 상세 패널');
      notes.B8_detailText = (await detail.innerText()).replace(/\s+/g, ' ').slice(0, 1200);
      await shot(page, 'D_B8_detail_125.png');
      await audit(page, 'D_B8_detail', '[role="dialog"]');
      const tagBtn = detail.getByRole('button', { name: /관심 권역 .* 추가/ }).first();
      if (await tagBtn.isVisible().catch(() => false)) await tap(tagBtn, '태그 추가(관심 권역)');
      await tap(detail.getByRole('button', { name: /구독자 삭제/ }), '"구독자 삭제"');
      await page.waitForTimeout(400);
      notes.B8_deleteConfirm = (await detail.innerText()).replace(/\s+/g, ' ').slice(-250);
      await detail.getByText(/정말 이 구독자를 삭제할까요/).scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'D_B8_delete_confirm_125.png');
      await tap(detail.getByRole('button', { name: '삭제', exact: true }), '삭제 확정(mock)');
      await page.waitForTimeout(1200);
      notes.B8_deleteOutcome = { toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []), detailOpen: await detail.isVisible().catch(() => false) };
      if (await detail.isVisible().catch(() => false)) await checkModal(page, detail, '구독자 상세', { esc: true });
      // 수신거부자 표시
      const unsubChip = panel.getByRole('group', { name: '구독 상태 필터' }).getByRole('button', { name: /수신거부/ });
      await tap(unsubChip, '필터 "수신거부"');
      await page.waitForTimeout(2000);
      notes.B8_unsubList = (await panel.getByRole('list', { name: '구독자 목록' }).innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
      await shot(page, 'D_B8_unsubscribed_125.png');
      await tap(panel.getByRole('group', { name: '구독 상태 필터' }).getByRole('button').first(), '필터 첫 칩(수신 중) 복귀');
    });

    // ══ B10 성과 / 핫리드 ══
    ph('B10 성과·핫리드');
    await safe('B10', async () => {
      await injectHotLeadIfNone(page);
      await tap(tabLoc(page, '성과'), '탭 "성과"');
      await panel.getByText(/독자 인텔리전스|성과/).first().waitFor({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2500);
      notes.B10_text = (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 2500);
      await shot(page, 'D_B10_analytics_top_125.png');
      await audit(page, 'D_B10_analytics', '#editor-tabpanel');
      const hot = panel.getByText('지금 연락해야 할 핫리드');
      const hb = await hot.boundingBox().catch(() => null);
      const pb = await panel.boundingBox().catch(() => null);
      notes.B10_hotLeadPosition = { hotLeadTop: hb?.y ?? null, panelTop: pb?.y ?? null, viewportH: 614, scrollsNeeded: hb ? Math.max(0, Math.ceil((hb.y - 614) / 450)) : null };
      await hot.scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'D_B10_hotleads_125.png');
      // 핫리드 기준 설명
      notes.B10_criteriaGroup = await panel.getByRole('group', { name: '핫리드 선별 기준' }).getByRole('button').allInnerTexts().catch(() => []);
      // 통화 브리핑
      const briefBtn = panel.getByRole('button', { name: /통화 브리핑/ }).first();
      if (!(await briefBtn.isVisible().catch(() => false))) {
        await panel.getByRole('button', { name: '새로고침' }).click().catch(() => {});
        await page.waitForTimeout(2500);
      }
      notes.B10_briefBtnText = await briefBtn.innerText().catch(() => null);
      await tap(briefBtn, '"통화 브리핑(템플릿)"');
      const m = page.getByRole('dialog', { name: /통화 브리핑/ });
      await m.waitFor({ timeout: 10_000 });
      screen('통화 브리핑 모달');
      notes.B10_briefText = (await m.innerText()).replace(/\s+/g, ' ').slice(0, 1200);
      const tel = m.locator('a[href^="tel:"]');
      notes.B10_tel = { count: await tel.count(), href: (await tel.count()) ? await tel.first().getAttribute('href') : null, text: (await tel.count()) ? await tel.first().innerText() : null };
      await shot(page, 'D_B10_call_briefing_125.png');
      await audit(page, 'D_B10_briefing', '[role="dialog"]');
      await checkModal(page, m, '통화 브리핑', { esc: true });
      if (await m.isVisible().catch(() => false)) await m.getByRole('button', { name: '닫기' }).click();
    });

    // ══ B2 매거진 주소(slug) 첫 설정 — 프로필 GET 에서 slug 제거(mock)로 재현 ══
    ph('B2 매거진 주소 설정');
    await safe('B2', async () => {
      let patchMode: 'taken' | 'ok' = 'taken';
      await page.route('**/api/broker/profile', async (route) => {
        const req = route.request();
        if (req.method() === 'GET') {
          const resp = await route.fetch();
          const j = await resp.json().catch(() => ({}));
          if (j?.data) {
            notes.B2_realSlug = j.data.slug ?? j.data.broker?.slug;
            j.data.slug = null;
            if (j.data.broker) j.data.broker.slug = null;
          }
          return route.fulfill({ status: resp.status(), json: j });
        }
        blockedWrites.push(`MOCK profile ${req.method()} ${JSON.stringify(jsonBody(req)).slice(0, 80)}`);
        if (patchMode === 'taken') return route.fulfill({ status: 409, json: { ok: false, error: { code: 'SLUG_TAKEN', message: '이미 사용 중인 주소입니다. 다른 주소를 선택해 주세요.' } } });
        return route.fulfill({ status: 200, json: { ok: true } });
      });
      await flushToasts(page, 'editor-before-slug');
      await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
      screen('매거진 주소 설정 화면');
      const gate = page.getByTestId('slug-setup-gate');
      await gate.waitFor({ timeout: 120_000 });
      notes.B2_gateText = (await gate.innerText()).replace(/\s+/g, ' ');
      await shot(page, 'D_B2_slug_gate_125.png');
      await audit(page, 'D_B2_gate', '[data-testid="slug-setup-gate"]');
      const inp = page.locator('#magazine-slug');
      const errs: Record<string, string | null> = {};
      for (const [k, v] of [
        ['korean', '김영수매거진'],
        ['space', 'kim young soo'],
        ['short', 'ab'],
        ['reserved', 'admin'],
      ] as const) {
        await typeIn(inp, v, `주소 입력(${k})`);
        await tap(page.getByRole('button', { name: /주소 저장하고 편집 시작/ }), `"주소 저장하고 편집 시작"(${k})`);
        await page.waitForTimeout(400);
        errs[k] = await gate.getByRole('alert').innerText().catch(() => null);
      }
      await typeIn(inp, 'gangnam-kim', '주소 입력(중복)');
      await tap(page.getByRole('button', { name: /주소 저장하고 편집 시작/ }), '"주소 저장하고 편집 시작"(중복 409)');
      await page.waitForTimeout(1000);
      errs.taken = await gate.getByRole('alert').innerText().catch(() => null);
      notes.B2_errors = errs;
      await shot(page, 'D_B2_slug_taken_125.png');
      notes.B2_hasPreviewOfUrl = (await gate.getByText(/credeal\.net\/magazine\//).count()) > 0;
      notes.B2_hasSuggestion = (await gate.getByText(/추천|예시|예:/).count()) > 0;
      patchMode = 'ok';
      await page.unroute('**/api/broker/profile');
    });

    // 30초 짜리 짧은 화면(실가용 높이 515px) 비교 스냅샷
    await flushToasts(page, 'editor-final');
    await ctx.close();

    await safe('D-short', async () => {
      ph('참고 실가용높이515');
      const c2 = await newCtx(browser, baseURL!, 'desktop125short');
      const p2 = await c2.newPage();
      currentPage = p2;
      watch(p2, 'Dshort');
      store.edition = null;
      await installEditorMocks(p2);
      await installSubscriberMocks(p2);
      await p2.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
      await expect(p2.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      await p2.waitForTimeout(2500);
      await shot(p2, 'D_short515_editor_overview.png');
      await audit(p2, 'D_short515_editor');
      const tp = p2.locator('#editor-tabpanel');
      const r = await tp.boundingBox();
      notes.short515 = { tabpanelHeight: r ? Math.round(r.height) : null, publishBtnVisible: await p2.getByRole('button', { name: '발행하기' }).first().isVisible() };
      await flushToasts(p2, 'short');
      await c2.close();
    });
  });

  // ─────────────────────────────── B1 재측정 + 토스트 수명 ───────────────────────────────
  test('데스크톱 125% — B1 재측정 및 토스트 수명', async ({ browser, baseURL }) => {
    test.setTimeout(900_000);
    const ctx = await newCtx(browser, baseURL!, 'desktop125');
    const page = await ctx.newPage();
    currentPage = page;
    page.setDefaultNavigationTimeout(240_000);
    watch(page, 'B1r');
    await installEditorMocks(page);
    ph('B1 진입점 찾기(재측정)');
    await safe('B1r', async () => {
      // 첫 컴파일 워밍업(측정 외)
      await page.goto('/broker', { waitUntil: 'domcontentloaded', timeout: 240_000 }).catch(() => {});
      screen('로그인 후 대시보드(/broker)');
      await timed('대시보드 첫 화면(워밍업 후)', async () => {
        await page.goto('/broker', { waitUntil: 'domcontentloaded' });
        await page.locator('#quick-action-magazine-editor').waitFor({ state: 'visible', timeout: 120_000 });
      });
      await page.waitForTimeout(2000);
      await shot(page, 'D_B1_dashboard_125.png');
      await audit(page, 'D_B1_dashboard');
      const qa = page.locator('#quick-action-magazine-editor');
      const box = await qa.boundingBox();
      notes.B1 = {
        quickActionText: (await qa.innerText()).replace(/\s+/g, ' '),
        quickActionBox: box,
        aboveFold: box ? box.y + box.height <= 614 : null,
        insightCardOnHome: await page.getByText('내 매거진 성과').first().isVisible().catch(() => false),
        homeTabs: await page.getByRole('button', { name: /지금 처리|현황|인텔리전스/ }).allInnerTexts().catch(() => []),
      };
      const intelTab = page.getByRole('button', { name: /인텔리전스/ }).or(page.getByRole('tab', { name: /인텔리전스/ })).first();
      if (await intelTab.isVisible().catch(() => false)) {
        await intelTab.click();
        await page.waitForTimeout(3000);
        notes.B1.insightCardInIntelTab = await page.getByText('내 매거진 성과').first().isVisible().catch(() => false);
        if (notes.B1.insightCardInIntelTab) {
          await page.getByText('내 매거진 성과').first().scrollIntoViewIfNeeded().catch(() => {});
          await shot(page, 'D_B1_insight_card_125.png');
          await audit(page, 'D_B1_insight_card');
        } else await shot(page, 'D_B1_intel_tab_125.png');
        await page.goto('/broker', { waitUntil: 'domcontentloaded' });
        await page.locator('#quick-action-magazine-editor').waitFor({ state: 'visible', timeout: 120_000 });
      }
      // 메뉴(더보기) 경로도 확인
      notes.B1.navLabels = await page.getByRole('navigation').allInnerTexts().catch(() => []);
      await tap(page.locator('#quick-action-magazine-editor'), '홈 퀵액션 "매거진 편집"');
      screen('매거진 에디터');
      await timed('에디터 로딩', async () => {
        await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      });
      await page.waitForTimeout(2500);
      // 토스트 수명: "주소 복사" → 토스트 표시~사라짐
      await flushToasts(page, 'pre-toast');
      await page.getByRole('button', { name: '공개 매거진 주소 복사' }).click();
      await page.waitForTimeout(9000);
      await page.getByRole('button', { name: '저장', exact: true }).click().catch(() => {});
      await page.waitForTimeout(9000);
      await flushToasts(page, 'toast-lifetime');
    });
    await ctx.close();
  });

  // ─────────────────────────────── 딜카드 속보 (B9) ───────────────────────────────
  test('데스크톱 125% — B9 딜카드 ⋮ 속보 보내기', async ({ browser, baseURL }) => {
    test.setTimeout(900_000);
    const ctx = await newCtx(browser, baseURL!, 'desktop125');
    const page = await ctx.newPage();
    currentPage = page;
    page.setDefaultNavigationTimeout(120_000);
    watch(page, 'B9');
    ph('B9 속보 보내기');
    await safe('B9', async () => {
      let mode: 'fail' | 'ok' = 'fail';
      await page.route('**/api/broker/magazine/special**', async (route) => {
        const req = route.request();
        if (req.method() === 'GET') return route.fallback();
        blockedWrites.push(`MOCK special ${req.method()} (${mode})`);
        notes.B9_postBody = jsonBody(req);
        if (mode === 'fail') return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다.' } } });
        return route.fulfill({ status: 200, json: { success: true, edition: { id: 'e2e-ux60-mock' }, distributionResult: null } });
      });
      screen('내 딜카드 상세');
      await timed('딜카드 상세 로딩', async () => {
        await page.goto(`/broker/deal-card/${OWNED_BUILDING}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: '더 보기' }).waitFor({ state: 'visible', timeout: 120_000 });
      });
      await page.waitForTimeout(1500);
      await shot(page, 'D_B9_dealcard_125.png');
      const more = page.getByRole('button', { name: '더 보기' });
      const mb = await more.boundingBox();
      notes.B9_moreBtn = { box: mb, text: (await more.innerText().catch(() => '')).trim() };
      await audit(page, 'D_B9_dealcard');
      await tap(more, '"⋮ 더 보기"');
      await page.waitForTimeout(500);
      notes.B9_menuItems = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
      await shot(page, 'D_B9_menu_125.png');
      await tap(page.getByRole('menuitem', { name: /속보 매거진 발행/ }), '메뉴 "⚡ 속보 매거진 발행"');
      const dlg = page.getByRole('dialog', { name: '속보 매거진 발행' });
      await dlg.waitFor({ timeout: 20_000 });
      screen('속보 모달');
      await dlg.getByText('발송 대상 미리보기').waitFor({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1500);
      notes.B9_modalText = (await dlg.innerText()).replace(/\s+/g, ' ').slice(0, 1500);
      notes.B9_tiles = await dlg.locator('dt').allInnerTexts().catch(() => []);
      notes.B9_tileValues = await dlg.locator('dd').allInnerTexts().catch(() => []);
      await shot(page, 'D_B9_special_modal_125.png');
      await audit(page, 'D_B9_special', '[role="dialog"]');
      const dist = dlg.getByRole('checkbox', { name: /발송/ }).first();
      if (await dist.isVisible().catch(() => false)) {
        await tap(dist, '"발행과 함께 매칭 구독자 n명에게 발송" 켜기');
        await page.waitForTimeout(400);
        notes.B9_sendOnText = (await dlg.innerText()).replace(/\s+/g, ' ').slice(-500);
        await shot(page, 'D_B9_special_send_on_125.png');
        await tap(dist, '발송 끄기');
      }
      await typeIn(dlg.getByLabel('속보 헤드라인'), 'E2E_UX60 [속보] 역삼동 코너 빌딩 신규 매물', '속보 헤드라인');
      await tap(dlg.getByRole('button', { name: '속보 발행', exact: true }), '"속보 발행"(실패 주입)');
      await page.waitForTimeout(2000);
      notes.B9_fail = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-400);
      await shot(page, 'D_B9_special_failed_125.png');
      mode = 'ok';
      const retry = dlg.getByRole('button', { name: /다시 시도|속보 발행/ }).first();
      await tap(retry, '"다시 시도"/"속보 발행"');
      await page.waitForTimeout(2000);
      if (await dlg.getByRole('button', { name: '속보 발행', exact: true }).isVisible().catch(() => false)) {
        await tap(dlg.getByRole('button', { name: '속보 발행', exact: true }), '"속보 발행"(성공)');
        await page.waitForTimeout(2000);
      }
      notes.B9_ok = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-400);
      await shot(page, 'D_B9_special_ok_125.png');
      await checkModal(page, dlg, '속보', { esc: true });
    });
    await flushToasts(page, 'B9');
    await ctx.close();
  });

  // ─────────────────────────────── 모바일 (외근) B3·B6·B10 ───────────────────────────────
  test('모바일 360 — B3·B6·B10 외근 중 급히', async ({ browser, baseURL }) => {
    test.setTimeout(1_200_000);
    const ctx = await newCtx(browser, baseURL!, 'mobile');
    const page = await ctx.newPage();
    currentPage = page;
    page.setDefaultNavigationTimeout(120_000);
    watch(page, 'M');
    store.edition = null; // 새 세션: 깨끗한 초안
    await installEditorMocks(page);
    await installSubscriberMocks(page);
    const panel = page.locator('#editor-tabpanel');

    ph('M-B3 모바일 편집');
    await safe('M-B3', async () => {
      screen('대시보드');
      await page.goto('/broker', { waitUntil: 'domcontentloaded' });
      await page.locator('#quick-action-magazine-editor').waitFor({ state: 'visible', timeout: 120_000 });
      await page.waitForTimeout(1500);
      await shot(page, 'M_B1_dashboard_360.png');
      await audit(page, 'M_B1_dashboard');
      await tap(page.locator('#quick-action-magazine-editor'), '홈 "매거진 편집"');
      screen('에디터');
      await timed('에디터 로딩', async () => {
        await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 120_000 });
      });
      await page.waitForTimeout(2000);
      await shot(page, 'M_B3_editor_360.png');
      await audit(page, 'M_B3_editor');
      notes.M_tabs = await page.getByRole('tab').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          const s = e.querySelector('span') as HTMLElement | null;
          return { label: e.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), labelShown: !!s && s.getBoundingClientRect().width > 0 };
        }),
      );
      const tl = await page.getByRole('tablist', { name: '콘텐츠 편집 단계' }).boundingBox();
      const ft = await page.getByRole('link', { name: /실제 화면으로 보기/ }).boundingBox();
      notes.M_editGap = tl && ft ? Math.round(ft.y - (tl.y + tl.height)) : null;
      notes.M_previewReachable = await page.getByTestId('phone-frame').evaluate((f) => {
        const r = f.getBoundingClientRect();
        return { top: Math.round(r.top), docH: document.documentElement.scrollHeight, vh: innerHeight };
      }).catch(() => null);
      // 탭 전환 (아이콘만 보이는 탭 맞히기)
      await tap(tabLoc(page, '필드노트'), '아이콘 탭 "필드노트"');
      await page.waitForTimeout(500);
      await typeIn(panel.getByLabel('시장 판단', { exact: true }), '선별적 매수 기회입니다.', '시장 판단');
      await shot(page, 'M_B3_fieldnote_360.png');
      await audit(page, 'M_B3_fieldnote', '#editor-tabpanel');
      await tap(tabLoc(page, '커버'), '아이콘 탭 "커버"');
      await typeIn(panel.getByPlaceholder('매거진 제목을 입력하세요'), '외근 중 급히 쓰는 이번 주 헤드라인', '헤드라인');
      await page.getByText(/저장됨 · \d{2}:\d{2}/).waitFor({ timeout: 15_000 }).catch(() => {});
      await shot(page, 'M_B3_cover_360.png');
      // 큰 글꼴 근사 (a) rem 130%  (b) zoom 1.3
      await page.evaluate(() => (document.documentElement.style.fontSize = '130%'));
      await page.waitForTimeout(600);
      await shot(page, 'M_B3_editor_font130rem_360.png');
      await audit(page, 'M_B3_editor_font130rem');
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
        (document.documentElement.style as any).zoom = '1.3';
      });
      await page.waitForTimeout(600);
      await shot(page, 'M_B3_editor_zoom130_360.png');
      await audit(page, 'M_B3_editor_zoom130');
      notes.M_zoom130_tabs = await page.getByRole('tab').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
      await page.evaluate(() => ((document.documentElement.style as any).zoom = ''));
    });

    ph('M-B6 모바일 발행');
    await safe('M-B6', async () => {
      const pub = page.getByRole('button', { name: '발행하기' }).first();
      const pb = await pub.boundingBox();
      notes.M_publishBtn = pb ? { y: Math.round(pb.y), h: Math.round(pb.height), w: Math.round(pb.width), inView: pb.y + pb.height <= 780 } : null;
      await tap(pub, '하단 "발행하기"');
      const confirm = page.getByRole('dialog', { name: /발행 확인/ });
      await confirm.waitFor({ timeout: 20_000 });
      screen('발행 확인 모달');
      await shot(page, 'M_B6_confirm_360.png');
      await audit(page, 'M_B6_confirm', '[role="dialog"]');
      await checkModal(page, confirm, 'M 발행 확인', { esc: false });
      await page.evaluate(() => ((document.documentElement.style as any).zoom = '1.3'));
      await page.waitForTimeout(500);
      await shot(page, 'M_B6_confirm_zoom130_360.png');
      await audit(page, 'M_B6_confirm_zoom130', '[role="dialog"]');
      await page.evaluate(() => ((document.documentElement.style as any).zoom = ''));
      await tap(confirm.getByRole('button', { name: '발행하기' }), '모달 "발행하기"');
      const share = page.getByRole('dialog', { name: /발행 완료/ });
      await timed('발행 처리', async () => share.waitFor({ timeout: 30_000 }));
      screen('공유 모달');
      await page.waitForTimeout(500);
      notes.M_shareText = (await share.innerText()).replace(/\s+/g, ' ').slice(0, 600);
      await shot(page, 'M_B6_share_360.png');
      await audit(page, 'M_B6_share', '[role="dialog"]');
      await tap(share.getByRole('button', { name: /카카오톡/ }), '"카카오톡으로 1:1 수동 공유"(SDK 차단)');
      await page.waitForTimeout(1200);
      notes.M_kakaoFallback = { toasts: await page.locator('[data-sonner-toast]').allInnerTexts().catch(() => []), inline: (await share.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(-200) };
      await shot(page, 'M_B7_kakao_fallback_360.png');
      await checkModal(page, share, 'M 공유', { esc: false });
      await share.getByRole('button', { name: '닫기' }).click().catch(() => {});
    });

    ph('M-B10 모바일 성과·전화');
    await safe('M-B10', async () => {
      await injectHotLeadIfNone(page);
      await tap(tabLoc(page, '성과'), '아이콘 탭 "성과"');
      await page.waitForTimeout(3000);
      await shot(page, 'M_B10_analytics_360.png');
      await audit(page, 'M_B10_analytics', '#editor-tabpanel');
      const hot = panel.getByText('지금 연락해야 할 핫리드');
      const scrolls = await panel.evaluate((p, label) => {
        const el = Array.from(p.querySelectorAll('*')).find((e) => (e.textContent || '').trim() === label) as HTMLElement | undefined;
        if (!el) return null;
        const pr = p.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        return { offset: Math.round(er.top - pr.top + p.scrollTop), panelH: Math.round(pr.height), screens: Math.round(((er.top - pr.top + p.scrollTop) / pr.height) * 10) / 10 };
      }, '지금 연락해야 할 핫리드');
      notes.M_hotLeadScroll = scrolls;
      await hot.scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'M_B10_hotleads_360.png');
      const briefBtn = panel.getByRole('button', { name: /통화 브리핑/ }).first();
      if (!(await briefBtn.isVisible().catch(() => false))) {
        await panel.getByRole('button', { name: '새로고침' }).click().catch(() => {});
        await page.waitForTimeout(2500);
      }
      await tap(briefBtn, '"통화 브리핑(템플릿)"');
      const m = page.getByRole('dialog', { name: /통화 브리핑/ });
      await m.waitFor({ timeout: 10_000 });
      screen('통화 브리핑 모달');
      const tel = m.locator('a[href^="tel:"]');
      const tb = (await tel.count()) ? await tel.first().boundingBox() : null;
      notes.M_tel = { count: await tel.count(), box: tb ? { w: Math.round(tb.width), h: Math.round(tb.height), y: Math.round(tb.y) } : null, text: (await tel.count()) ? await tel.first().innerText() : null };
      await shot(page, 'M_B10_briefing_360.png');
      await audit(page, 'M_B10_briefing', '[role="dialog"]');
      await page.evaluate(() => ((document.documentElement.style as any).zoom = '1.3'));
      await page.waitForTimeout(500);
      await shot(page, 'M_B10_briefing_zoom130_360.png');
      await audit(page, 'M_B10_briefing_zoom130', '[role="dialog"]');
      await page.evaluate(() => ((document.documentElement.style as any).zoom = ''));
      await checkModal(page, m, 'M 통화 브리핑', { esc: false });
    });
    await flushToasts(page, 'M');
    await ctx.close();
  });
});
