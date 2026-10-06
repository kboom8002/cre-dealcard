/**
 * 📙 TUTORIAL_PART3_VIEWER_ANALYTICS.md — 골든 E2E (Wave4 D-01, 수정 후 코드 기준)
 *
 * - 튜토리얼 '실습 N' ↔ test.step 1:1 (실습1~10). 단언은 expect.soft (하드 단언 유지, 제품 버그를 숨기려 완화하지 않음)
 * - 독자 뷰어: 모바일 390x844 (+360x740 1회), storageState 없는 새 context
 * - 성과/발행설정: 1440x900 인증 context (비-GET API 차단 → 자동저장/LLM 호출/발송 방지)
 * - 데이터 안전
 *     · 픽스처: test-broker-kim 의 미사용 날짜에 magazine_issues 1행(content.e2e_fixture = TAG) → afterAll 에서 id 로 삭제
 *       (2026-10-04 실제 발행본 content 복제 + 설문/세무/시장온도/키워드. 근거 없는 62/100·심리지수는 제거)
 *     · sendBeacon 은 init script 로 가로채 서버 미전송(애널리틱스 DB 쓰기 0), 분석 fetch 폴백도 route 로 차단
 *     · 설문 실 POST 는 visitorId 를 TAG 로 바꿔 전송(@needs-migration: 현재 503 기대), 성공 경로는 route mock
 *     · 분석 API 직접 POST 는 metadata.pv = TAG, afterAll 에서 pv/HMAC 해시로 정리
 *     · 카카오 SDK·구독 POST·broker-profile 이동은 차단/목업, tel: 링크는 기본동작 차단
 * - 스크린샷: docs/magazine/tutorial_images/p3_NN_*.png (+ scratch 사본), 개발 인디케이터 숨김, 편집기 전화번호 마스킹
 * - 결과 JSON: brain/93f8.../scratch/part3/golden_report.json
 */
import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const OUT_DIR = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\93f8ca59-e154-4bf8-adb4-2396b2b1ee90\\scratch\\part3';
const DOC_IMG_DIR = path.resolve(__dirname, '../docs/magazine/tutorial_images');
const SLUG = 'test-broker-kim';
const BROKER_UUID = '204246a5-7c52-4549-9570-f089fbbf789c';
const REAL_DATE = '2026-09-20'; // 실제 발행본(설문/세무 없음) — 폴백 금지 검증용
const BASE_ISSUE_DATE = '2026-10-04'; // 픽스처 content 원본 (실제 발행본)
const FIXTURE_CANDIDATES = ['2026-09-27', '2026-09-13', '2026-09-06', '2026-08-30'];
const DRAFT_EDITION_ID_PREFIX = 'd770ae57';
const TS = Date.now();
const TAG = `e2e-tut3-${TS}`;
const READER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GREEN = 'rgb(52, 211, 153)';
const YELLOW = 'rgb(251, 191, 36)';
const RED = 'rgb(248, 113, 113)';

const SECTION_ORDER: Record<'all' | 'buyer' | 'seller', string[]> = {
  all: ['ai_briefing', 'field_note', 'theme_of_week', 'featured_deals', 'poll', 'subscribe_cta', 'broker_profile', 'market_data', 'news_curation', 'auction_picks', 'reports', 'sentiment_index', 'roi_calculator', 'tax_clinic', 'referral'],
  buyer: ['ai_briefing', 'field_note', 'featured_deals', 'theme_of_week', 'poll', 'subscribe_cta', 'broker_profile', 'market_data', 'news_curation', 'auction_picks', 'reports', 'sentiment_index', 'roi_calculator', 'tax_clinic', 'referral'],
  seller: ['ai_briefing', 'field_note', 'market_data', 'sentiment_index', 'featured_deals', 'theme_of_week', 'poll', 'subscribe_cta', 'broker_profile', 'news_curation', 'auction_picks', 'reports', 'tax_clinic', 'roi_calculator', 'referral'],
};

type Beacon = { url: string; body: any; at: number };
const beacons: Beacon[] = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const badResponses: string[] = [];
const report: Record<string, any> = { tag: TAG, steps: {} as Record<string, any> };
const directPostVisitors: string[] = [];
let fixtureId: string | null = null;
let FIX_DATE = '';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function baseURL(): string {
  return (test.info().project.use as any).baseURL || `http://localhost:${process.env.E2E_PORT || 3000}`;
}

function pngSize(buf: Buffer) {
  if (buf.length < 24 || buf.slice(1, 4).toString('ascii') !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function hmacVisitor(uuid: string): string | null {
  const secret = process.env.MAGAZINE_SID_SECRET;
  if (!secret || secret.length < 8) return null;
  return `v2_${crypto.createHmac('sha256', secret).update(`visitor:${uuid.toLowerCase()}`).digest('hex').slice(0, 40)}`;
}

/** 수기 계산 (roi-calc.ts 를 import 하지 않고 독립적으로 재유도) */
function handRoi(i: { price: number; ltv: number; rate: number; deposit: number; rent: number; vac: number; floors: number }) {
  const loan = i.price * i.ltv / 100;
  const occ = (i.floors - i.vac) / i.floors;
  const effRent = i.rent * 12 * occ;
  const noi = effRent + i.deposit * 0.03 * occ - effRent * 0.1;
  const interest = loan * i.rate / 100;
  const equity = i.price - loan - i.deposit * occ;
  const cf = noi - interest;
  const man = Math.round(cf / 12 / 10_000);
  return {
    cap: `${(noi / i.price * 100).toFixed(2)}%`,
    coc: `${(cf / equity * 100).toFixed(2)}%`,
    cf: man === 0 ? '0만' : `${man > 0 ? '+' : '−'}${Math.abs(man).toLocaleString('en-US')}만`,
    noiMan: `${Math.round(noi / 10_000).toLocaleString('en-US')}만원`,
    occPct: Math.round(occ * 100),
  };
}

async function hideDevChrome(page: Page) {
  // 메인 문서 + 미리보기 iframe 모두에서 Next dev 표시(N 배지/Compiling 토스트) 숨김
  for (const f of page.frames()) {
    await f.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button], #__next-build-watcher { display: none !important; }' }).catch(() => {});
  }
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean; doc?: boolean; mask?: any[]; locator?: any; clip?: { x: number; y: number; width: number; height: number }; maskPhones?: boolean } = {}) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  await hideDevChrome(page);
  if (opts.maskPhones) {
    // 고객 전화번호 텍스트를 DOM 에서 010-****-**** 로 치환 (mask 박스는 overflow 로 가려진 요소까지 칠해 화면을 오염시킴)
    for (const f of page.frames()) {
      await f.evaluate(() => {
        const re = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g;
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (re.test(n.nodeValue || '')) n.nodeValue = (n.nodeValue || '').replace(re, '010-****-****');
      }).catch(() => {});
    }
  }
  await page.waitForTimeout(150);
  const file = path.join(OUT_DIR, name);
  if (opts.locator) await opts.locator.screenshot({ path: file, mask: opts.mask });
  else await page.screenshot({ path: file, fullPage: !!opts.fullPage, mask: opts.mask, clip: opts.clip });
  if (opts.doc) {
    if (!fs.existsSync(DOC_IMG_DIR)) fs.mkdirSync(DOC_IMG_DIR, { recursive: true });
    fs.copyFileSync(file, path.join(DOC_IMG_DIR, name));
    (report.docImages ||= []).push(name);
  }
}

/** 에디터 좌측 패널(h-screen 내부 스크롤)을 잘림 없이 촬영: 뷰포트를 스크롤 높이만큼 늘린 뒤 좌측만 clip, 이후 원복 */
async function editorPanelShot(page: Page, name: string, mask?: any[]) {
  const vp = page.viewportSize() || { width: 1440, height: 900 };
  const m = await page.evaluate(() => {
    let extra = 0; let width = 460;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.left > 4 || r.width < 300 || r.width > 700) continue;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
        if (el.scrollHeight - el.clientHeight > extra) { extra = el.scrollHeight - el.clientHeight; width = Math.ceil(r.right); }
      }
    }
    return { extra, width };
  });
  const h = Math.min(vp.height + m.extra + 8, 6000);
  await page.setViewportSize({ width: vp.width, height: h });
  await page.waitForTimeout(600);
  await shot(page, name, { doc: true, mask, maskPhones: true, clip: { x: 0, y: 0, width: Math.min(m.width, vp.width), height: h } });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

function attachDiagnostics(page: Page, label: string) {
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED|kakao/i.test(m.text())) consoleErrors.push(`[${label}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => pageErrors.push(`[${label}] ${String(e.message).slice(0, 300)}`));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`[${label}] ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
}

async function newReaderContext(browser: Browser, viewport = { width: 390, height: 844 }): Promise<BrowserContext> {
  const ctx: BrowserContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: READER_UA, locale: 'ko-KR',
  });
  ctx.setDefaultTimeout(15000);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL() });
  await ctx.exposeBinding('__e2eBeacon', (_src, url: string, body: string) => {
    let parsed: any = body; try { parsed = JSON.parse(body); } catch { /* raw */ }
    beacons.push({ url, body: parsed, at: Date.now() });
  });
  await ctx.addInitScript(() => {
    // 1) sendBeacon 가로채기: 서버로 보내지 않고 테스트 러너로만 전달 (DB 오염 방지)
    Object.defineProperty(Navigator.prototype, 'sendBeacon', {
      configurable: true,
      value: function (url: string, data: any) {
        try { (window as any).__e2eBeacon(String(url), typeof data === 'string' ? data : '[non-string]'); } catch { /* noop */ }
        return true;
      },
    });
    // 2) Web Share 비활성 → 링크 복사 폴백 경로를 결정적으로 검증
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
    // 3) tel: 기본 동작 차단 (React onClick 추적은 그대로 실행됨)
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="tel:"]');
      if (a) e.preventDefault();
    }, true);
  });
  // 방어선: 애널리틱스 fetch 폴백/구독 쓰기/카카오 SDK/중개사 프로필 이동 차단
  await ctx.route('**/api/public/magazine/analytics', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"e2e":"blocked"}' }));
  await ctx.route('**/api/public/magazine/subscribe**', (r) => r.abort());
  await ctx.route('**/kakao_js_sdk/**', (r) => r.abort());
  await ctx.route('**/broker-profile/**', (r) => (r.request().resourceType() === 'document'
    ? r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>broker-profile (e2e stub)</title><p>stub</p>' })
    : r.abort()));
  return ctx;
}

async function gotoViewer(page: Page, url: string) {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(async () => page.goto(url, { waitUntil: 'load', timeout: 120000 }));
  // 클라이언트 섬 하이드레이션 대기 (계산기는 next/dynamic 지연 로드)
  await page.locator('#roi-price-range').waitFor({ state: 'attached', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  return resp;
}

async function sectionOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => Array.from(document.querySelectorAll('main [data-section-id]'))
    .map((e) => e.getAttribute('data-section-id') || '')
    .filter((id) => id && id !== 'cover'));
}

async function sectionTitles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    document.querySelectorAll('main [data-section-id]').forEach((el) => {
      const id = el.getAttribute('data-section-id') || '';
      if (!id || id === 'cover') return;
      const h = el.querySelector('h2');
      out[id] = (h?.textContent || '').replace(/\s+/g, ' ').trim();
    });
    return out;
  });
}

async function slowScroll(page: Page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(140);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(500);
}

async function roiResults(page: Page) {
  return page.locator('[data-section-id="roi_calculator"]').evaluate((root) => {
    const pick = (sub: string) => {
      const p = Array.from(root.querySelectorAll('p')).find((e) => e.textContent?.trim() === sub);
      const tone = p?.previousElementSibling as HTMLElement | null;
      const v = tone?.previousElementSibling as HTMLElement | null;
      return { text: v?.textContent?.trim() ?? null, tone: tone?.textContent?.trim() ?? null, color: v ? getComputedStyle(v).color : null };
    };
    const warn = Array.from(root.querySelectorAll('[role="status"]')).find((d) => /층 공실 시/.test(d.textContent || ''));
    return { cap: pick('Cap Rate'), coc: pick('Cash-on-Cash'), cf: pick('Net Cash Flow'), warning: warn?.textContent?.replace(/\s+/g, ' ').trim() ?? null };
  });
}

async function roiDetail(page: Page): Promise<Record<string, string>> {
  return page.locator('[data-section-id="roi_calculator"] details dl').evaluate((dl) => {
    const out: Record<string, string> = {};
    dl.querySelectorAll('div').forEach((row) => {
      const dt = row.querySelector('dt')?.textContent?.trim();
      const dd = row.querySelector('dd')?.textContent?.trim();
      if (dt) out[dt] = dd ?? '';
    });
    return out;
  });
}

async function setRoi(page: Page, v: { price?: number; ltv?: number; rate?: number; deposit?: number; rent?: number; vac?: number }) {
  if (v.price !== undefined) await page.locator('#roi-price-range').fill(String(v.price));
  if (v.ltv !== undefined) await page.locator('#roi-ltv-range').fill(String(v.ltv));
  if (v.rate !== undefined) await page.locator('#roi-rate-range').fill(String(v.rate));
  if (v.deposit !== undefined) await page.locator('#roi-deposit-range').fill(String(v.deposit));
  if (v.rent !== undefined) await page.locator('#roi-rent-range').fill(String(v.rent));
  if (v.vac !== undefined) await page.locator('#roi-vacancy-range').fill(String(v.vac));
  await page.waitForTimeout(250);
}

function beaconsSince(n: number) { return beacons.slice(n); }
function pageViewSince(n: number) { return beaconsSince(n).find((b) => b.body?.event_type === 'page_view'); }
async function waitBeacon(pred: (b: Beacon) => boolean, from: number, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const hit = beacons.slice(from).find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

async function runStep(name: string, fn: () => Promise<void>) {
  const before = test.info().errors.length;
  const t0 = Date.now();
  await test.step(name, async () => {
    try { await fn(); } catch (e: any) {
      expect.soft(false, `[${name}] 예외: ${String(e?.message || e).slice(0, 400)}`).toBeTruthy();
    }
  });
  const errs = test.info().errors.slice(before).map((e) => (e.message || '').split('\n')[0].slice(0, 300));
  report.steps[name] = { ...(report.steps[name] || {}), result: errs.length === 0 ? 'PASS' : 'FAIL', failures: errs, ms: Date.now() - t0 };
}

function note(step: string, data: Record<string, any>) {
  report.steps[step] = { ...(report.steps[step] || {}), ...data };
}

// ─────────────────────────────────────────────────────────────
// 픽스처 (실제 발행본 복제 + 설문/세무/시장온도/키워드)
// ─────────────────────────────────────────────────────────────
/** 중단된 실행이 남긴 e2e-tut3 픽스처(TAG 시각 20분 경과)만 삭제 — 동시 실행 중인 픽스처는 건드리지 않음 */
async function purgeStaleFixtures(db: ReturnType<typeof sb>): Promise<string[]> {
  const { data } = await db.from('magazine_issues').select('id, issue_date, tag:content->>e2e_fixture').filter('content->>e2e_fixture', 'like', 'e2e-tut3-%');
  const stale = (data || []).filter((r: any) => r.tag !== TAG && Date.now() - Number(String(r.tag).replace('e2e-tut3-', '')) > 20 * 60_000);
  for (const r of stale as any[]) await db.from('magazine_issues').delete().eq('id', r.id);
  return (stale as any[]).map((r) => `${r.issue_date}:${r.tag}`);
}

async function createFixture() {
  const db = sb();
  const { data: base, error: baseErr } = await db.from('magazine_issues').select('content').eq('broker_id', SLUG).eq('issue_date', BASE_ISSUE_DATE).maybeSingle();
  if (baseErr || !base?.content) throw new Error(`base issue ${BASE_ISSUE_DATE} 없음: ${baseErr?.message}`);
  const { data: older } = await db.from('magazine_issues').select('content').eq('broker_id', SLUG).eq('issue_date', REAL_DATE).maybeSingle();
  report.stalePurged = await purgeStaleFixtures(db);
  const { data: taken } = await db.from('magazine_issues').select('issue_date').in('broker_id', [SLUG, BROKER_UUID]).in('issue_date', FIXTURE_CANDIDATES);
  const takenSet = new Set((taken || []).map((r: any) => r.issue_date));
  const date = FIXTURE_CANDIDATES.find((d) => !takenSet.has(d));
  if (!date) throw new Error('픽스처용 빈 날짜 없음');
  const c: any = JSON.parse(JSON.stringify(base.content));
  delete c.id;
  c.issueDate = date;
  // 근거 없는 지표 제거: 62/100(알려진 가짜값), items=[] 인 심리지수, 거기서 파생된 '시장 상태'
  c.keyStats = (Array.isArray(c.keyStats) ? c.keyStats : []).filter((s: any) => !/62\s*\/\s*100/.test(String(s?.value)) && s?.label !== '시장 상태');
  delete c.sentiment;
  // 시장 데이터: 실제 2026-09-20 발행본의 임대동향/상권 블록 재사용 (더미 생성 금지)
  if (older?.content?.rentalTrend) c.rentalTrend = older.content.rentalTrend;
  if (older?.content?.commercialDistrict) c.commercialDistrict = older.content.commercialDistrict;
  c.market_temp = '선별 매수';
  c.cover_keywords = ['공실 양극화', '강남', '꼬마빌딩'];
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
    answer: '법인은 취득세·보유세·양도 시 과세 방식이 개인과 다릅니다. 취득 전에 법인 설립 시점, 취득 지역(과밀억제권역 여부), 사업 계획을 세무사와 함께 검토하세요. 구체적인 세율과 중과 여부는 개별 사정에 따라 달라집니다.',
    source: '지방세법 제13조 (일반 안내)',
    asOf: date,
    disclaimer: '일반 정보이며 세무 자문이 아닙니다. 실제 신고 전 세무사와 상담하세요.',
  };
  c.e2e_fixture = TAG;
  const { data: ins, error } = await db.from('magazine_issues').insert({ broker_id: SLUG, issue_date: date, content: c }).select('id').single();
  if (error || !ins) throw new Error(`fixture insert 실패: ${error?.message}`);
  fixtureId = ins.id;
  FIX_DATE = date;
  report.fixture = { id: ins.id, date, base: BASE_ISSUE_DATE, marketBlocksFrom: REAL_DATE, keyStats: c.keyStats, topNewsSentiments: (c.topNews || []).slice(0, 6).map((n: any) => n.sentiment) };
  return c;
}

test.describe('📙 Tutorial Part3 — Golden E2E (Wave4 D-01)', () => {
  test.afterAll(async () => {
    const db = sb();
    const cleanup: Record<string, any> = {};
    // 1) 픽스처
    if (fixtureId) {
      const { error } = await db.from('magazine_issues').delete().eq('id', fixtureId);
      const { count } = await db.from('magazine_issues').select('id', { count: 'exact', head: true }).eq('id', fixtureId);
      cleanup.fixtureIssue = { id: fixtureId, remaining: count, error: error?.message ?? null };
    }
    const { data: strayFix } = await db.from('magazine_issues').select('id').filter('content->>e2e_fixture', 'like', 'e2e-tut3-%');
    cleanup.strayFixtures = strayFix?.length ?? 0;
    // 2) 설문 응답 (테이블 미적용이면 오류만 기록)
    const pr = await db.from('magazine_poll_responses').delete().like('visitor_id', 'e2e-tut3-%');
    cleanup.pollResponses = { status: pr.status, error: pr.error?.code ?? null };
    // 3) 분석 이벤트 (직접 POST 분: pv = TAG / HMAC 해시)
    const an = await db.from('magazine_analytics_events').delete().filter('metadata->>pv', 'eq', TAG);
    const { count: anLeft } = await db.from('magazine_analytics_events').select('id', { count: 'exact', head: true }).filter('metadata->>pv', 'eq', TAG);
    cleanup.analyticsByPv = { remaining: anLeft, error: an.error?.message ?? null };
    for (const v of directPostVisitors) {
      const h = hmacVisitor(v);
      if (!h) continue;
      await db.from('magazine_analytics_events').delete().eq('visitor_id', h);
      await db.from('activity_events').delete().filter('metadata->>user_agent_hash', 'eq', h);
      const { count: a1 } = await db.from('magazine_analytics_events').select('id', { count: 'exact', head: true }).eq('visitor_id', h);
      const { count: a2 } = await db.from('activity_events').select('id', { count: 'exact', head: true }).filter('metadata->>user_agent_hash', 'eq', h);
      cleanup[`hash ${h.slice(0, 10)}…`] = { analytics: a1, activity: a2 };
    }
    report.cleanup = cleanup;
    report.consoleErrors = consoleErrors.slice(0, 40);
    report.pageErrors = pageErrors.slice(0, 40);
    report.badResponses = badResponses.slice(0, 60);
    report.beaconsSummary = beacons.map((b) => `${b.body?.event_type}:${b.body?.section_id ?? b.body?.scroll_pct ?? b.body?.target_param ?? b.body?.dwell_seconds ?? ''}`);
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'golden_report.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log('\n===== STEP RESULTS =====');
    for (const [k, v] of Object.entries(report.steps)) console.log(`${(v as any).result}\t${k}\t${((v as any).failures || []).length} fail`);
    console.log('cleanup', JSON.stringify(cleanup));
  });

  test('실습 1~10 따라하기 (수정 후 UI)', async ({ browser, request }) => {
    test.setTimeout(720_000);
    const db = sb();
    const content = await createFixture();
    const VIEWER = `/magazine/${SLUG}/${FIX_DATE}`;
    const ABS_VIEWER = `${baseURL()}${VIEWER}`;

    const reader = await newReaderContext(browser);
    const page = await reader.newPage();
    page.setDefaultTimeout(15000);
    attachDiagnostics(page, 'reader390');

    // ═════════════ 실습 1 ═════════════
    const S1 = '실습1 독자 뷰어 열기 — 커버·섹션 구성';
    await runStep(S1, async () => {
      const b0 = beacons.length;
      const resp = await gotoViewer(page, VIEWER);
      expect.soft(resp?.status(), '뷰어 HTTP 200').toBe(200);
      const cover = page.locator('[data-section-id="cover"]');
      const coverText = (await cover.innerText()).replace(/\s+/g, ' ');
      note(S1, { coverText: coverText.slice(0, 500) });
      await expect.soft(page.locator('h1'), 'h1 = 발행본 헤드라인').toHaveText(content.headline);
      await expect.soft(cover.getByText('김테스트', { exact: true }).first(), '커버 브로커 이름 (공개 이름 SSOT = broker_profiles.name)').toBeVisible();
      await expect.soft(cover.getByTestId('initial-avatar'), '사진 없음 → 이니셜 아바타').toBeVisible();
      expect.soft(coverText, '소속 표기').toContain('E2E 테스트 부동산중개법인');
      const expectedDate = await page.locator('[data-section-id="cover"] time').innerText();
      note(S1, { dateLabel: expectedDate });
      expect.soft(expectedDate, '날짜 형식 "YYYY년 M월 D일 (요일)"').toMatch(/^\d{4}년 \d{1,2}월 \d{1,2}일 \([일월화수목금토]\)$/);
      expect.soft(coverText, '완독 배지 "⏱ N분 완독"').toMatch(/⏱ \d+분 완독/);
      expect.soft(coverText, '시장 온도 배지 "시장 온도 선별 매수 · 설명"').toMatch(/시장 온도 선별 매수 · 선별적 기회 존재/);
      const kws = await cover.locator('span', { hasText: /^# / }).allInnerTexts();
      note(S1, { coverKeywords: kws });
      expect.soft(kws, '키워드 태그 = 발행 데이터 cover_keywords').toEqual(content.cover_keywords.map((k: string) => `# ${k}`));
      const stats = await cover.locator('ul > li').allInnerTexts();
      note(S1, { keyStats: stats.map((s) => s.replace(/\s+/g, ' ')) });
      expect.soft(stats.length, '핵심 지표 카드 수 = 발행 데이터 keyStats').toBe(content.keyStats.length);
      expect.soft(stats.join(' '), '근거 없는 62/100 미표시').not.toMatch(/62\s*\/\s*100/);

      await slowScroll(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const order = await sectionOrder(page);
      const titles = await sectionTitles(page);
      report.sectionOrderDefault = order;
      report.sectionTitles = titles;
      expect.soft(order, '섹션 순서 = 기본(all) 순서 중 데이터 있는 섹션').toEqual(SECTION_ORDER.all.filter((s) => order.includes(s)));
      report.sectionsAbsentDefault = SECTION_ORDER.all.filter((s) => !order.includes(s));
      test.info().annotations.push({ type: 'N/A(data)', description: `데이터 부재로 미표시: ${report.sectionsAbsentDefault.join(',')}` });
      const expectTitles: Record<string, RegExp> = {
        ai_briefing: /^AI 마켓 에디터 브리핑$/, featured_deals: /^주목 매물 하이라이트$/, poll: /📊 이번 주 투표/,
        market_data: /시장 데이터/, news_curation: /뉴스 큐레이션/, auction_picks: /경매 픽/,
        roi_calculator: /수지분석 계산기/, tax_clinic: /💰 세무·법률 클리닉/,
      };
      for (const [id, re] of Object.entries(expectTitles)) {
        if (order.includes(id)) expect.soft(titles[id] ?? '', `섹션 제목 ${id}`).toMatch(re);
      }
      await expect.soft(page.locator('main footer').getByTestId('tracking-notice'), '푸터 열람 통계 고지').toBeVisible();
      const metrics = await page.evaluate(() => {
        const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const small = Array.from(document.querySelectorAll('main button, main a, main input, main summary, nav a, nav button')).filter(vis).map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return { t: ((el as HTMLElement).innerText || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
        }).filter((x) => x.h < 44);
        return { scrollHeight: document.documentElement.scrollHeight, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, smallTargets: small.length, smallSamples: small.slice(0, 12) };
      });
      report.mobileMetrics390 = metrics;
      expect.soft(metrics.overflowX, '390px 가로 오버플로 없음').toBeFalsy();
      const pv = pageViewSince(b0);
      expect.soft(!!pv, '열기 → page_view 비콘').toBeTruthy();
      await shot(page, 'p3_01_cover_390.png', { doc: true });
      await shot(page, 'p3_01_full_390.png', { fullPage: true });

      // 실제 발행본(설문/세무 없음) — 다른 날짜 콘텐츠/기본 설문으로 폴백하지 않음
      const rp = await reader.newPage(); attachDiagnostics(rp, 'real0920');
      await gotoViewer(rp, `/magazine/${SLUG}/${REAL_DATE}`);
      expect.soft(await rp.locator('[data-section-id="poll"]').count(), `${REAL_DATE}: 설문 데이터 없음 → 설문 섹션 없음`).toBe(0);
      expect.soft(await rp.locator('[data-section-id="tax_clinic"]').count(), `${REAL_DATE}: 세무 데이터 없음 → 세무 섹션 없음`).toBe(0);
      const realCover = (await rp.locator('[data-section-id="cover"]').innerText()).replace(/\s+/g, ' ');
      note(S1, { realIssueCover: realCover.slice(0, 300), realIssueOrder: await sectionOrder(rp) });
      expect.soft(realCover, `${REAL_DATE}: 레거시 가짜 지표 "62/100" 뷰어 미노출 (이미지 라우트는 isSuspectStatValue 로 제외)`).not.toMatch(/62\s*\/\s*100/);
      await rp.close();
    });

    // ═════════════ 실습 2 ═════════════
    const S2a = '실습2a 1-Click 투표 — 현재 동작(DB 미적용 503 안내) @needs-migration';
    await runStep(S2a, async () => {
      test.info().annotations.push({ type: 'needs-migration', description: 'magazine_poll_responses 테이블 적용 후 실 투표/집계 경로로 전환' });
      const poll = page.locator('[data-section-id="poll"]');
      await poll.scrollIntoViewIfNeeded();
      await expect.soft(poll.locator('p').first(), '질문 = 발행 데이터 poll.question').toHaveText(content.poll.question);
      const options = poll.getByRole('group').getByRole('button');
      expect.soft(await options.count(), '선택지 3개').toBe(3);
      expect.soft(await options.allInnerTexts(), '선택지 문구').toEqual(content.poll.options.map((o: any) => o.label));
      let sentBody: any = null;
      await page.route('**/api/public/magazine/poll**', async (r) => {
        if (r.request().method() !== 'POST') return r.continue();
        try { sentBody = JSON.parse(r.request().postData() || '{}'); } catch { sentBody = null; }
        const rewritten = { ...(sentBody || {}), visitorId: TAG }; // 서버 기록 시 cleanup 식별자
        return r.continue({ postData: JSON.stringify(rewritten), headers: { ...r.request().headers(), 'content-type': 'application/json' } });
      });
      const b0 = beacons.length;
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/public/magazine/poll') && r.request().method() === 'POST', { timeout: 20000 }),
        options.nth(2).click(),
      ]);
      const status = resp.status();
      const json = await resp.json().catch(() => null);
      note(S2a, { requestBody: sentBody, status, response: json });
      expect.soft(Object.keys(sentBody || {}).sort(), '요청 바디 계약 {brokerId, editionDate, choice, visitorId}').toEqual(['brokerId', 'choice', 'editionDate', 'visitorId']);
      expect.soft(sentBody?.brokerId, 'brokerId = slug').toBe(SLUG);
      expect.soft(sentBody?.editionDate, 'editionDate = 호 날짜').toBe(FIX_DATE);
      expect.soft(sentBody?.choice, 'choice = 정수 index').toBe(2);
      expect.soft(/^[A-Za-z0-9_-]{8,64}$/.test(String(sentBody?.visitorId)), 'visitorId 형식').toBeTruthy();
      expect.soft(status, '테이블 미적용 → 503 (가짜 성공 금지)').toBe(503);
      expect.soft(json?.code ?? json?.error?.code ?? JSON.stringify(json), '오류 코드 POLL_UNAVAILABLE').toContain('POLL_UNAVAILABLE');
      await page.waitForTimeout(500);
      const alert = poll.getByRole('alert');
      await expect.soft(alert, '오류 안내(role=alert)').toBeVisible();
      note(S2a, { alertText: (await alert.innerText().catch(() => '')).replace(/\s+/g, ' ') });
      await expect.soft(alert.getByRole('button', { name: '다시 시도' }), '"다시 시도" 버튼').toBeVisible();
      expect.soft(await poll.getByText('응답이 접수되었습니다').count(), '성공 문구 없음').toBe(0);
      expect.soft(await poll.getByText(/\d+%/).count(), '결과(%) 미노출').toBe(0);
      expect.soft(await options.nth(0).isEnabled(), '선택지 잠기지 않음(재시도 가능)').toBeTruthy();
      expect.soft(await poll.locator('[aria-pressed="true"]').count(), '내 선택 표시 없음').toBe(0);
      expect.soft(beaconsSince(b0).some((b) => b.body?.target_param === 'poll_vote'), '실패한 투표는 poll_vote 로 추적하지 않음').toBeFalsy();
      await shot(page, 'p3_02_poll_unavailable_390.png', { doc: true, locator: poll });
      await page.unroute('**/api/public/magazine/poll**');
    });

    const S2b = '실습2b 1-Click 투표 — 응답 계약(route mock) @needs-migration';
    await runStep(S2b, async () => {
      const ctx = await newReaderContext(browser);
      const p = await ctx.newPage(); attachDiagnostics(p, 'pollmock');
      let postBody: any = null;
      let getCount = 0;
      await p.route('**/api/public/magazine/poll**', async (r) => {
        if (r.request().method() === 'POST') {
          postBody = JSON.parse(r.request().postData() || '{}');
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, intentSeller: true, results: { total: 7, counts: { 0: 2, 1: 1, 2: 4 } } }) });
        }
        getCount += 1;
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, results: { total: 3, counts: { 2: 3 } } }) });
      });
      const b0 = beacons.length;
      await gotoViewer(p, VIEWER);
      const pv1 = await waitBeacon((b) => b.body?.event_type === 'page_view', b0);
      const vid1 = pv1?.body?.visitor_id;
      const poll = p.locator('[data-section-id="poll"]');
      await poll.scrollIntoViewIfNeeded();
      const b1 = beacons.length;
      await poll.getByRole('group').getByRole('button').nth(2).click();
      await expect.soft(poll.getByRole('status'), '성공 + 표본 ≥5 → "응답이 접수되었습니다. 총 7명이 참여했습니다."').toHaveText(/응답이 접수되었습니다\.\s*총 7명이 참여했습니다\./);
      const texts = (await poll.getByRole('group').getByRole('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
      note(S2b, { postBody, optionsAfter: texts });
      expect.soft(texts.map((t) => (t.match(/(\d+)%/) || [])[1]), '퍼센트 = round(2/7,1/7,4/7)').toEqual(['29', '14', '57']);
      expect.soft(texts[2], '"✓ 내 선택" 표시').toContain('✓ 내 선택');
      const consult = poll.getByRole('link', { name: '매도 상담 문의하기' });
      await expect.soft(consult, '판매자 의도 선택지 → "매도 상담 문의하기"').toBeVisible();
      expect.soft(await consult.getAttribute('href'), '상담 링크 = 중개사 전화').toMatch(/^tel:\d{9,11}$/);
      const vote = await waitBeacon((b) => b.body?.target_param === 'poll_vote', b1);
      expect.soft(vote?.body?.metadata?.meta?.choice, 'poll_vote 비콘(choice=2)').toBe(2);
      const b2 = beacons.length;
      await consult.click();
      const inquiry = await waitBeacon((b) => b.body?.target_param === 'inquiry', b2);
      expect.soft(inquiry?.body?.metadata?.meta?.target_raw, '상담 클릭 → inquiry (target_raw=poll_consult)').toBe('poll_consult');
      const lsAfterVote = await p.evaluate(() => localStorage.getItem('cre_mag_vid'));
      // 새로고침: 내 선택 복원 + 표본 <5 결과 숨김 + 방문자 ID 유지
      const b3 = beacons.length;
      await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
      await p.waitForTimeout(1200);
      const pv2 = await waitBeacon((b) => b.body?.event_type === 'page_view', b3);
      const vid2 = pv2?.body?.visitor_id;
      const poll2 = p.locator('[data-section-id="poll"]');
      await expect.soft(poll2.getByRole('status'), '복원 + 표본 3건 → "결과는 응답이 5건 이상 모이면 공개됩니다."').toHaveText(/결과는 응답이 5건 이상 모이면 공개됩니다\./);
      expect.soft(await poll2.getByText(/\d+%/).count(), '표본 <5 → % 숨김').toBe(0);
      note(S2b, { analyticsVisitorBefore: vid1, localStorageAfterVote: lsAfterVote, analyticsVisitorAfterReload: vid2, restoreGetCalls: getCount });
      expect.soft(vid2, '투표 후에도 열람 방문자 ID 유지 (cre_mag_vid 키 충돌 없음)').toBe(vid1);
      await ctx.close();
    });

    // ═════════════ 실습 3 ═════════════
    const S3 = '실습3 수지분석 계산기';
    await runStep(S3, async () => {
      const roi = page.locator('[data-section-id="roi_calculator"]');
      await roi.scrollIntoViewIfNeeded();
      const ranges = roi.locator('input[type="range"]');
      expect.soft(await ranges.count(), '슬라이더 6개').toBe(6);
      const attrs = await ranges.evaluateAll((els) => els.map((e) => ({ id: e.id, label: e.getAttribute('aria-label'), min: Number((e as HTMLInputElement).min), max: Number((e as HTMLInputElement).max), step: Number((e as HTMLInputElement).step), value: Number((e as HTMLInputElement).value), h: Math.round(e.getBoundingClientRect().height) })));
      report.roiSliders = attrs;
      expect.soft(attrs.map((a) => a.label), '슬라이더 라벨').toEqual(['매입가', '대출비율 (LTV)', '대출금리', '보증금 합계', '월세 합계', '공실 (전체 5층)']);
      expect.soft(attrs.map((a) => [a.min, a.max]), '슬라이더 범위').toEqual([[5e8, 3e10], [0, 80], [2, 8], [0, 5e9], [0, 1e8], [0, 5]]);
      attrs.forEach((a) => expect.soft(a.h, `${a.label} 터치 트랙 ≥44px`).toBeGreaterThanOrEqual(44));
      await expect.soft(roi.locator('#roi-total-floors'), '"전체 층수" 입력').toHaveValue('5');
      // 기본값 수기 대조
      const def = handRoi({ price: 3e9, ltv: 60, rate: 4.5, deposit: 5e8, rent: 1.5e7, vac: 0, floors: 5 });
      const r0 = await roiResults(page);
      report.roiDefault = { ui: r0, hand: def };
      expect.soft([r0.cap.text, r0.coc.text, r0.cf.text], `기본값 수기계산 ${def.cap}/${def.coc}/${def.cf}`).toEqual([def.cap, def.coc, def.cf]);
      // 키보드 조작
      await page.locator('#roi-ltv-range').focus();
      await page.keyboard.press('ArrowRight');
      report.roiKeyboardLtv = await page.locator('#roi-ltv-range').inputValue();
      expect.soft(report.roiKeyboardLtv, '키보드 → LTV 60→65').toBe('65');
      const b0 = beacons.length;
      // ── 양호 시나리오: 매입가는 직접 입력, 나머지는 슬라이더 ──
      const priceText = roi.getByLabel('매입가 직접 입력 (억)');
      await priceText.fill('50');
      await priceText.press('Enter');
      await setRoi(page, { ltv: 50, rate: 4.5, deposit: 5e8, rent: 2.5e7, vac: 0 });
      expect.soft(await page.locator('#roi-price-range').inputValue(), '직접 입력 50억 → 슬라이더 반영').toBe('5000000000');
      const goodHand = handRoi({ price: 5e9, ltv: 50, rate: 4.5, deposit: 5e8, rent: 2.5e7, vac: 0, floors: 5 });
      const good = await roiResults(page);
      await roi.locator('summary').click();
      const goodDetail = await roiDetail(page);
      report.roiGood = { ui: good, hand: goodHand, detail: goodDetail };
      expect.soft(good.cap.text, `양호 Cap Rate = ${goodHand.cap}`).toBe(goodHand.cap);
      expect.soft(good.coc.text, `양호 CoC = ${goodHand.coc}`).toBe(goodHand.coc);
      expect.soft(good.cf.text, `양호 월 CF = ${goodHand.cf}`).toBe(goodHand.cf);
      expect.soft([good.cap.color, good.cap.tone], '양호 Cap 초록·"양호"').toEqual([GREEN, '양호']);
      expect.soft([good.coc.color, good.coc.tone], '양호 CoC 초록·"양호"').toEqual([GREEN, '양호']);
      expect.soft([good.cf.color, good.cf.tone], '양호 CF 초록·"흑자"').toEqual([GREEN, '흑자']);
      expect.soft(good.warning, '공실 0 → 경고 없음').toBeNull();
      expect.soft(goodDetail['NOI (순영업소득)'], `양호 NOI = ${goodHand.noiMan}`).toBe(goodHand.noiMan);
      expect.soft(goodDetail['대출금'], '대출금 25억').toBe('25억');
      expect.soft(goodDetail['자기자본'], '자기자본 20억').toBe('20억');
      await shot(page, 'p3_03_roi_good_390.png', { doc: true, locator: roi });
      // ── 위험 시나리오 ──
      await setRoi(page, { ltv: 70, rate: 6.0, deposit: 2e8, rent: 1.5e7, vac: 3 });
      const riskyHand = handRoi({ price: 5e9, ltv: 70, rate: 6.0, deposit: 2e8, rent: 1.5e7, vac: 3, floors: 5 });
      const risky = await roiResults(page);
      const riskyDetail = await roiDetail(page);
      report.roiRisky = { ui: risky, hand: riskyHand, detail: riskyDetail };
      expect.soft(risky.cap.text, `위험 Cap Rate = ${riskyHand.cap}`).toBe(riskyHand.cap);
      expect.soft(risky.coc.text, `위험 CoC = ${riskyHand.coc}`).toBe(riskyHand.coc);
      expect.soft(risky.cf.text, `위험 월 CF = ${riskyHand.cf}`).toBe(riskyHand.cf);
      expect.soft([risky.cap.color, risky.cap.tone], '위험 Cap 빨강·"낮음"').toEqual([RED, '낮음']);
      expect.soft([risky.cf.color, risky.cf.tone], '위험 CF 빨강·"적자"').toEqual([RED, '적자']);
      expect.soft(risky.warning ?? '', '공실 경고 문구').toMatch(/3개 층 공실 시 가동률 40%, Cap Rate 1\.34%로 하락합니다\.\s*월 1,190만원 적자가 발생합니다\./);
      expect.soft(riskyDetail['NOI (순영업소득)'], `위험 NOI = ${riskyHand.noiMan}`).toBe(riskyHand.noiMan);
      await shot(page, 'p3_04_roi_risky_390.png', { doc: true, locator: roi });
      // 면책·용어
      const disc = await roi.getByTestId('roi-disclaimer').evaluate((p) => {
        const cs = getComputedStyle(p);
        const toRgb = (c: string) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d')!; x.fillStyle = c; x.fillRect(0, 0, 1, 1); return Array.from(x.getImageData(0, 0, 1, 1).data).slice(0, 3); };
        const lum = (rgb: number[]) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const L1 = lum(toRgb(cs.color)), L2 = lum([10, 10, 26]);
        return { text: (p.textContent || '').replace(/\s+/g, ' ').trim(), fontSize: cs.fontSize, contrast: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100 };
      });
      report.roiDisclaimer = disc;
      expect.soft(disc.text, '면책 + 핵심 가정(관리비 10%, 보증금 운용 3%, 세금·원금 제외)').toMatch(/참고용 시뮬레이션이며 투자 자문이 아닙니다.*관리비는 임대수입의 10%.*연 3%.*세금과 원금 상환은 포함하지 않습니다/);
      expect.soft(parseFloat(disc.fontSize), '면책 글자 ≥12px').toBeGreaterThanOrEqual(12);
      expect.soft(disc.contrast, '면책 대비 ≥4.5:1').toBeGreaterThanOrEqual(4.5);
      const gloss = roi.getByRole('button', { name: /Cap Rate/ }).first();
      await gloss.click();
      expect.soft(await gloss.getAttribute('aria-expanded'), '용어 설명 펼침').toBe('true');
      const calc = beaconsSince(b0).filter((b) => b.body?.target_param === 'calc_simulate').map((b) => b.body?.metadata?.meta?.field);
      report.calcSimulateFields = calc;
      expect.soft(calc.length, '계산기 조작 → calc_simulate (필드별 1회)').toBeGreaterThan(0);
      expect.soft(new Set(calc).size, 'calc_simulate 필드 중복 없음').toBe(calc.length);
    });

    // ═════════════ 실습 4 ═════════════
    const S4 = '실습4 세무·법률 클리닉 + 타깃별 노출';
    await runStep(S4, async () => {
      const tax = page.locator('[data-section-id="tax_clinic"]');
      await tax.scrollIntoViewIfNeeded();
      const header = tax.getByRole('button', { name: /세무·법률 클리닉/ });
      expect.soft(await header.getAttribute('aria-expanded'), '기본 접힘').toBe('false');
      await header.click();
      await page.waitForTimeout(250);
      const t = (await tax.innerText()).replace(/\s+/g, ' ');
      note(S4, { taxText: t.slice(0, 700) });
      expect.soft(t, 'Q. 질문').toContain(`Q. ${content.tax_clinic.question}`);
      expect.soft(t, '답변 본문').toContain(content.tax_clinic.answer.slice(0, 20));
      expect.soft(t, '근거').toContain(`근거: ${content.tax_clinic.source}`);
      expect.soft(t, '기준일').toContain(`기준일: ${FIX_DATE}`);
      await expect.soft(tax.getByTestId('tax-disclaimer'), '면책 문구').toHaveText(`※ ${content.tax_clinic.disclaimer}`);
      const inq = tax.getByRole('link', { name: '세무 관련 문의는 중개사에게 전화하기' });
      expect.soft(await inq.getAttribute('href'), '문의 = 중개사 전화(강등된 텍스트 링크)').toMatch(/^tel:\d{9,11}$/);
      expect.soft(/추천/.test(t), '"추천" 표현 없음').toBeFalsy();
      const b0 = beacons.length;
      await inq.click();
      const ib = await waitBeacon((b) => b.body?.target_param === 'inquiry', b0);
      expect.soft(ib?.body?.metadata?.meta?.target_raw, '세무 문의 → inquiry(target_raw=tax_inquiry)').toBe('tax_inquiry');
      await shot(page, 'p3_05_tax_390.png', { doc: true, locator: tax });

      const orders: Record<string, string[]> = { all: report.sectionOrderDefault };
      for (const target of ['buyer', 'seller'] as const) {
        const p = await reader.newPage(); attachDiagnostics(p, target);
        await gotoViewer(p, `${VIEWER}?target=${target}`);
        await slowScroll(p);
        orders[target] = await sectionOrder(p);
        expect.soft(orders[target], `?target=${target} 순서 = ${target} 기본 순서`).toEqual(SECTION_ORDER[target].filter((s) => orders[target].includes(s)));
        if (target === 'buyer') expect.soft(orders.buyer.includes('tax_clinic'), 'buyer → 세무 섹션 숨김').toBeFalsy();
        if (target === 'seller') {
          expect.soft(orders.seller.includes('tax_clinic'), 'seller → 세무 섹션 노출').toBeTruthy();
          expect.soft(orders.seller.indexOf('tax_clinic'), 'seller → 세무가 계산기보다 앞').toBeLessThan(orders.seller.indexOf('roi_calculator'));
          expect.soft(orders.seller.indexOf('market_data'), 'seller → 시장 데이터가 매물보다 앞').toBeLessThan(orders.seller.indexOf('featured_deals'));
        }
        await p.close();
      }
      report.sectionOrderBuyer = orders.buyer;
      report.sectionOrderSeller = orders.seller;
      // 같은 데이터에서 all 에는 있고 buyer 에는 없는 섹션은 세무뿐
      expect.soft((orders.all ?? []).filter((s) => !orders.buyer.includes(s)), 'buyer 에서 빠지는 섹션 = tax_clinic').toEqual(['tax_clinic']);
    });

    // ═════════════ 실습 5 ═════════════
    const S5 = '실습5 시장 데이터·뉴스·경매 아코디언';
    await runStep(S5, async () => {
      const market = page.locator('[data-section-id="market_data"]');
      const dbTx = Array.isArray(content.recentTransactions) ? content.recentTransactions.length : 0;
      const hasMarket = dbTx > 0 || !!content.rentalTrend || !!content.commercialDistrict || !!content.monthlySummary;
      note(S5, { hasMarketData: hasMarket, dbTx });
      if (!hasMarket) {
        expect.soft(await market.count(), '시장 데이터 없음 → 섹션 숨김 (더미 실거래 주입 금지)').toBe(0);
        test.info().annotations.push({ type: 'N/A(data)', description: '테스트 브로커 발행본 전부 recentTransactions 0·rentalTrend/commercialDistrict null → 시장 데이터 펼침/seller 기본 펼침은 코드 확인만' });
      } else {
        await market.scrollIntoViewIfNeeded();
        const mh = market.getByRole('button', { name: /시장 데이터/ });
        expect.soft(await mh.getAttribute('aria-expanded'), '전체 독자: 시장 데이터 기본 접힘').toBe('false');
        await mh.click();
        await page.waitForTimeout(250);
        const mt = (await market.innerText()).replace(/\s+/g, ' ');
        note(S5, { marketText: mt.slice(0, 600) });
        expect.soft(await market.locator('tbody tr').count(), `실거래 행 = 발행 데이터 recentTransactions(${dbTx}) (더미 금지)`).toBe(Math.min(dbTx, 5));
        await expect.soft(market.getByTestId('market-source'), '출처·기준일 표기').toContainText('출처: 공공데이터 · 기준일:');
        await shot(page, 'p3_06_market_open_390.png', { doc: true, locator: market });
      }

      const news = page.locator('[data-section-id="news_curation"]');
      await news.scrollIntoViewIfNeeded();
      const nh = news.getByRole('button', { name: /뉴스 큐레이션/ });
      expect.soft(await nh.getAttribute('aria-expanded'), '뉴스 기본 접힘').toBe('false');
      await nh.click();
      await page.waitForTimeout(250);
      const items = await news.locator('li').allInnerTexts();
      const labels = items.map((t) => (t.match(/(호재|악재|중립)/) || [])[1] ?? '?');
      const expected = (content.topNews || []).filter((n: any) => String(n?.title ?? '').trim()).slice(0, 6).map((n: any) => (n.sentiment === 'bullish' ? '호재' : n.sentiment === 'bearish' ? '악재' : '중립'));
      note(S5, { newsLabels: labels });
      expect.soft(items.length, '뉴스 최대 6건').toBeLessThanOrEqual(6);
      expect.soft(labels, '감성 = 텍스트+기호(▲호재/▼악재/–중립), 발행 데이터와 일치').toEqual(expected);
      await shot(page, 'p3_07_news_open_390.png', { doc: true, locator: news });

      const auction = page.locator('[data-section-id="auction_picks"]');
      if ((await auction.count()) > 0) {
        await auction.getByRole('button', { name: /경매 픽/ }).click();
        await page.waitForTimeout(250);
        const at = (await auction.innerText()).replace(/\s+/g, ' ');
        note(S5, { auctionText: at.slice(0, 400) });
        expect.soft(at.length, '경매 픽 펼침 내용').toBeGreaterThan(10);
      }

      const sp = await reader.newPage(); attachDiagnostics(sp, 'seller-market');
      await gotoViewer(sp, `${VIEWER}?target=seller`);
      const sm = sp.locator('[data-section-id="market_data"]');
      if (hasMarket) {
        expect.soft(await sm.getByRole('button', { name: /시장 데이터/ }).getAttribute('aria-expanded'), 'seller: 시장 데이터 기본 펼침').toBe('true');
        await sm.scrollIntoViewIfNeeded();
      } else {
        expect.soft(await sm.count(), 'seller 에서도 시장 데이터 더미 없음').toBe(0);
        // 매도 타깃 고유 순서(세무 → 계산기)가 보이도록 세무 섹션 하단~계산기 머리로 스크롤
        await sp.locator('[data-section-id="roi_calculator"]').evaluate((el) => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -360); }).catch(() => {});
        await sp.waitForTimeout(300);
      }
      await shot(sp, 'p3_08_seller_view_390.png', { doc: true });
      await sp.close();
    });

    // ═════════════ 실습 6 ═════════════
    const S6 = '실습6 하단 고정 바 — 전화·IM·공유';
    await runStep(S6, async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const bar = page.getByRole('navigation', { name: '상담·공유 바로가기' });
      await expect.soft(bar, '하단 고정 바').toBeVisible();
      const call = bar.getByRole('link', { name: /전화 상담/ });
      const im = bar.getByRole('link', { name: /IM 요청/ });
      const share = bar.getByRole('button', { name: /공유/ });
      await expect.soft(call, '"전화 상담"(전화번호 있을 때 주 버튼)').toBeVisible();
      await expect.soft(im, '"IM 요청"').toBeVisible();
      await expect.soft(share, '"공유"').toBeVisible();
      const callHref = await call.getAttribute('href');
      const imHref = await im.getAttribute('href');
      note(S6, { callHref, imHref });
      expect.soft(callHref, '전화 = tel:숫자').toMatch(/^tel:\d{9,11}$/);
      expect.soft(imHref, 'IM 요청 → 중개사 프로필(ref=magazine-cta)').toBe(`/broker-profile/${SLUG}?ref=magazine-cta`);
      const boxes = await bar.locator('a, button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const s = e.querySelector('span.truncate') as HTMLElement | null; return { t: (s?.textContent || (e as HTMLElement).innerText).trim(), w: Math.round(r.width), h: Math.round(r.height), truncated: !!s && s.scrollWidth > s.clientWidth + 1 }; }));
      report.bottomBarBoxes = boxes;
      boxes.forEach((b) => expect.soft(b.h, `"${b.t}" 높이 ≥44px`).toBeGreaterThanOrEqual(44));
      boxes.forEach((b) => expect.soft(b.truncated, `390px 고정바 라벨 "${b.t}" 말줄임(…) 없음`).toBeFalsy());
      let b0 = beacons.length;
      await call.click();
      const cb = await waitBeacon((b) => b.body?.target_param === 'phone_click', b0);
      expect.soft(cb?.body?.metadata?.meta?.target_raw, '전화 → phone_click (target_raw=bottom_call)').toBe('bottom_call');
      b0 = beacons.length;
      await Promise.all([page.waitForURL(/broker-profile/, { timeout: 10000 }).catch(() => {}), im.click()]);
      const ib = await waitBeacon((b) => b.body?.target_param === 'im_request', b0);
      report.imClick = { url: page.url(), beacon: ib?.body ?? null };
      expect.soft(page.url(), 'IM 요청 → 중개사 프로필 이동').toContain(`/broker-profile/${SLUG}?ref=magazine-cta`);
      expect.soft(ib?.body?.metadata?.meta?.target_raw, 'IM → im_request (target_raw=bottom_im_request)').toBe('bottom_im_request');
      await gotoViewer(page, VIEWER);
      b0 = beacons.length;
      await page.getByRole('navigation', { name: '상담·공유 바로가기' }).getByRole('button', { name: /공유/ }).click();
      await expect.soft(page.getByRole('navigation', { name: '상담·공유 바로가기' }).getByText('복사됨'), '공유 → "복사됨"').toBeVisible({ timeout: 4000 });
      await expect.soft(page.getByText('링크를 복사했어요'), '토스트 "링크를 복사했어요"').toBeVisible({ timeout: 4000 });
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      report.shareClipboard = clip;
      expect.soft(clip, '복사 링크 = 이 호의 공개 URL').toMatch(new RegExp(`/magazine/${SLUG}/${FIX_DATE}$`));
      const sb2 = await waitBeacon((b) => b.body?.target_param === 'share', b0);
      expect.soft(sb2?.body?.metadata?.meta?.target_raw, '공유 → share (target_raw=bottom_share)').toBe('bottom_share');
      await shot(page, 'p3_09_bottom_bar_390.png', { doc: true });
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(500);
      const overlap = await page.evaluate(() => {
        const nav = document.querySelector('nav[data-magazine-bottom-bar]') as HTMLElement | null;
        const foot = document.querySelector('main footer') as HTMLElement | null;
        return { barTop: nav?.getBoundingClientRect().top ?? null, footerBottom: foot?.getBoundingClientRect().bottom ?? null };
      });
      report.bottomBarOverlap = overlap;
      expect.soft(overlap.barTop != null && overlap.footerBottom != null && overlap.footerBottom <= overlap.barTop, '최하단에서 고정 바가 푸터를 가리지 않음').toBeTruthy();
      await shot(page, 'p3_10_footer_notice_390.png', { doc: true });
      // seller 공유 링크에는 target 유지
      const sp = await reader.newPage(); attachDiagnostics(sp, 'share-seller');
      await gotoViewer(sp, `${VIEWER}?target=seller`);
      await sp.getByRole('navigation', { name: '상담·공유 바로가기' }).getByRole('button', { name: /공유/ }).click();
      await sp.waitForTimeout(600);
      const clip2 = await sp.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      report.shareClipboardSeller = clip2;
      expect.soft(clip2, 'seller 공유 링크에 ?target=seller 유지').toContain('target=seller');
      await sp.close();
    });

    // ═════════════ 실습 7 ═════════════
    const S7 = '실습7 독자 행동 추적';
    await runStep(S7, async () => {
      const b0 = beacons.length;
      await gotoViewer(page, VIEWER);
      await slowScroll(page);
      const mine = beaconsSince(b0);
      const pv = mine.find((b) => b.body?.event_type === 'page_view');
      report.editionIdSent = pv?.body?.edition_id;
      report.readerVisitorId = pv?.body?.visitor_id;
      expect.soft(pv?.body?.edition_id, 'page_view.edition_id = 이 호 id(UUID)').toBe(fixtureId);
      expect.soft(UUID_RE.test(String(pv?.body?.visitor_id)), 'visitor_id = 랜덤 UUID(지문 아님)').toBeTruthy();
      expect.soft(String(pv?.body?.metadata?.pv ?? ''), 'metadata.pv(페이지뷰 id)').toMatch(/^[A-Za-z0-9_-]{4,32}$/);
      const scrolls = Array.from(new Set(mine.filter((b) => b.body?.event_type === 'scroll_depth').map((b) => b.body.scroll_pct)));
      report.scrollMilestones = scrolls;
      for (const m of [25, 50, 75, 100]) expect.soft(scrolls.includes(m), `스크롤 ${m}%`).toBeTruthy();
      const secs = Array.from(new Set(mine.filter((b) => b.body?.event_type === 'section_view').map((b) => b.body.section_id)));
      report.sectionViewsTracked = secs;
      const rendered = await sectionOrder(page);
      expect.soft(secs.length, 'section_view: 렌더된 섹션 대부분(30% 노출 1회)').toBeGreaterThanOrEqual(Math.min(rendered.length, 6));
      expect.soft(mine.filter((b) => b.body?.event_type === 'section_view').length, 'section_view 섹션당 1회').toBe(secs.length);
      const n0 = beacons.length;
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(500);
      const dw = beaconsSince(n0).filter((b) => b.body?.event_type === 'dwell');
      report.dwellOnHidden = dw.map((b) => ({ section: b.body.section_id ?? 'page', sec: b.body.dwell_seconds }));
      expect.soft(dw.some((b) => !b.body.section_id && b.body.dwell_seconds >= 1), '탭 전환(visibilitychange) → 페이지 체류 기록').toBeTruthy();
      expect.soft(dw.some((b) => !!b.body.section_id), '섹션별 체류 기록').toBeTruthy();
      // 다른 브라우저(context) → 다른 방문자 ID
      const ctx2 = await newReaderContext(browser);
      const p2 = await ctx2.newPage();
      const b2 = beacons.length;
      await gotoViewer(p2, VIEWER);
      const pv2 = await waitBeacon((b) => b.body?.event_type === 'page_view', b2);
      report.secondVisitorId = pv2?.body?.visitor_id;
      expect.soft(pv2?.body?.visitor_id, '같은 기종 다른 브라우저 → 다른 visitor_id').not.toBe(pv?.body?.visitor_id);
      // 미리보기(?preview=1) → 비콘 0
      const b3 = beacons.length;
      await p2.goto(`${VIEWER}?preview=1`, { waitUntil: 'networkidle' }).catch(() => {});
      await p2.waitForTimeout(1500);
      expect.soft(beaconsSince(b3).length, '미리보기 → 분석 비콘 0').toBe(0);
      await ctx2.close();
      // 고지
      const noticeText = (await page.locator('main footer').getByTestId('tracking-notice').innerText()).replace(/\s+/g, ' ');
      report.trackingNotice = noticeText;
      expect.soft(noticeText, '고지: 임의 방문자 번호 13개월, 쿠키·기기 지문 아님').toMatch(/임의의 방문자 번호를 13개월간 저장.*쿠키·기기 지문 아님/);
      expect.soft(await page.locator('main footer').getByTestId('tracking-notice').getByRole('link', { name: '개인정보 처리방침' }).getAttribute('href'), '처리방침 링크').toBe('/privacy');
      // 서버 수집 경로 (직접 POST, 쓰기 시 afterAll 정리)
      const v1 = crypto.randomUUID(); directPostVisitors.push(v1);
      const r1 = await request.post('/api/public/magazine/analytics', { data: { edition_id: fixtureId, visitor_id: v1, event_type: 'page_view', metadata: { pv: TAG } } });
      const j1 = await r1.json().catch(() => null);
      const { data: drafts } = await db.from('magazine_editions').select('id').in('broker_id', [SLUG, BROKER_UUID]).neq('status', 'published').limit(5);
      const draftId: string | null = (drafts || []).find((d: any) => String(d.id).startsWith(DRAFT_EDITION_ID_PREFIX))?.id ?? drafts?.[0]?.id ?? null;
      const v2 = crypto.randomUUID(); directPostVisitors.push(v2);
      const r2 = draftId ? await request.post('/api/public/magazine/analytics', { data: { edition_id: draftId, visitor_id: v2, event_type: 'page_view', metadata: { pv: TAG } } }) : null;
      const j2 = r2 ? await r2.json().catch(() => null) : null;
      const r3 = await request.post('/api/public/magazine/analytics', { data: { edition_id: fixtureId, visitor_id: TAG, event_type: 'page_view' } });
      report.serverPipeline = { issueEdition: { status: r1.status(), body: j1 }, draftEdition: { id: draftId, status: r2?.status() ?? null, body: j2 }, badVisitor: { status: r3.status() } };
      expect.soft(r3.status(), '비-UUID visitor_id → 400').toBe(400);
      if (r2) expect.soft([r2.status(), j2?.tracked, j2?.reason], '미발행(draft) 에디션 → 200 tracked:false NOT_PUBLISHED').toEqual([200, false, 'NOT_PUBLISHED']);
      expect.soft(r1.status(), '뷰어가 보내는 edition_id(발행 호 id)로 수집 가능해야 함 — 현재 magazine_editions 만 조회').toBe(200);
    });
    await page.close();

    // ═════════════ 실습 8 ═════════════
    const S8 = '실습8 성과 대시보드 — 매수 온도·핫리드·통화 브리핑';
    const ed = await browser.newContext({ storageState: path.resolve(__dirname, '.auth/user.json'), viewport: { width: 1440, height: 900 }, locale: 'ko-KR' });
    // 비-GET 차단. 예외: 이번 호 초안 get-or-create(POST, LLM 없음 — 이번 주 초안 W41 이 이미 있어 반환만 함)
    await ed.route('**/api/**', (r) => (r.request().method() === 'GET' || /\/api\/magazine\/editions\/draft$/.test(new URL(r.request().url()).pathname) ? r.continue() : r.abort()));
    await ed.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL() });
    const ep = await ed.newPage(); ep.setDefaultTimeout(20000); attachDiagnostics(ep, 'editor');
    const phoneMask = (): any[] => []; // 전화번호는 shot({maskPhones}) 의 DOM 치환으로 가림
    await runStep(S8, async () => {
      await ep.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await ep.getByRole('tablist').first().waitFor({ timeout: 120000 }).catch(() => {});
      report.editorUrl = ep.url();
      report.editorBody = (await ep.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
      if ((await ep.getByRole('tab').count()) === 0) await shot(ep, 'p3_debug_editor.png');
      await ep.waitForLoadState('networkidle').catch(() => {});
      const tabs = (await ep.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
      report.editorTabs = tabs;
      expect.soft(tabs[tabs.length - 1] ?? '', '마지막 탭 = 성과').toContain('성과');
      const [aResp] = await Promise.all([
        ep.waitForResponse((r) => r.url().includes('/api/broker/magazine/analytics') && r.request().method() === 'GET', { timeout: 30000 }).catch(() => null),
        ep.getByRole('tab', { name: /성과/ }).click(),
      ]);
      await ep.getByText('독자 인텔리전스 & 성과 대시보드').waitFor({ timeout: 30000 });
      await ep.waitForTimeout(800);
      const aj: any = aResp ? await aResp.json().catch(() => null) : null;
      report.analyticsApi = aj ? { subscriberCount: aj.subscriberCount, viewStats: aj.viewStats, kpiNotice: aj.kpiNotice, pollUnavailable: aj.pollUnavailable, temperatureDistribution: aj.temperatureDistribution, hotLeads: (aj.hotLeads || []).map((h: any) => ({ t: h.buyerTemperature, s: h.score, v: h.totalViews })), sectionStats: (aj.sectionStats || []).length, latestPollResults: aj.latestPollResults ? { total: aj.latestPollResults.total, hourlyHidden: aj.latestPollResults.hourlyHidden } : null, editions: (aj.editions || []).length } : null;
      for (const k of ['30일 총 열람', '평균 체류시간', '완독률', '활성 구독자']) {
        await expect.soft(ep.getByText(k, { exact: true }).first(), `KPI "${k}"`).toBeVisible();
        await expect.soft(ep.getByRole('button', { name: `${k} 기준 보기` }), `KPI "${k}" 기준 설명 버튼`).toBeVisible();
      }
      await ep.getByRole('button', { name: '완독률 기준 보기' }).click();
      const kpiNote = await ep.getByRole('note').first().innerText().catch(() => '');
      report.kpiDefinitionCompletion = kpiNote;
      expect.soft(kpiNote.length, 'KPI 정의 툴팁(role=note)').toBeGreaterThan(5);
      await ep.getByRole('button', { name: '완독률 기준 보기' }).click(); // 토글로 닫기(Escape 미지원)
      await ep.mouse.move(1200, 50);
      await ep.waitForTimeout(300);
      const { count: dbActive } = await db.from('magazine_subscribers').select('id', { count: 'exact', head: true }).in('broker_id', [SLUG, BROKER_UUID]).eq('status', 'active');
      report.activeSubscribers = { api: aj?.subscriberCount, db: dbActive };
      expect.soft(aj?.subscriberCount, '활성 구독자 = DB 실측').toBe(dbActive);
      const notice = await ep.getByRole('status').filter({ hasText: /./ }).allInnerTexts();
      report.dashboardNotices = notice.map((t) => t.replace(/\s+/g, ' ').slice(0, 200));
      if (aj?.pollUnavailable === 'NOT_MIGRATED') {
        await expect.soft(ep.getByText(/독자 투표 집계를 사용하려면 데이터베이스 업데이트가 필요합니다/), '@needs-migration 투표 집계 미적용 안내').toBeVisible();
      }
      // 5단계 온도 분포 (표시 전용 — 전체 활성 구독자 기준)
      const tiers = ['🔥 적극검토', '📈 관심', '⏸️ 관망', '❄️ 냉각', '⚪ 미확인'];
      const distList = ep.getByRole('list', { name: '매수 온도 단계별 구독자 수' });
      await expect.soft(distList, '온도 분포 목록(표시 전용)').toBeVisible();
      const tierCounts: Record<string, number | null> = {};
      for (const t of tiers) {
        const label = await distList.locator(`[aria-label^="${t} "]`).first().getAttribute('aria-label', { timeout: 5000 }).catch(() => null);
        tierCounts[t] = label ? Number((label.match(/(\d+)명$/) || [])[1]) : null;
        expect.soft(label ?? '', `온도 분포 "${t} N명"`).toMatch(new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\d+명$`));
      }
      report.tierCounts = tierCounts;
      const apiDist = aj?.temperatureDistribution || {};
      expect.soft(tiers.map((t) => tierCounts[t]), 'UI 온도 분포 = API').toEqual(tiers.map((t) => apiDist[t] ?? 0));
      expect.soft(tiers.reduce((s, t) => s + (apiDist[t] ?? 0), 0), '온도 분포 합 = 활성 구독자').toBe(aj?.subscriberCount);

      // 핫리드 선별 기준 (서버 필터 ?tier=) — 기본 '관심 이상'(warm)
      const group = ep.getByRole('group', { name: '핫리드 선별 기준' });
      await expect.soft(group, '"핫리드 선별 기준" 그룹').toBeVisible();
      await expect.soft(group.getByRole('button', { name: /관심 이상/ }), '기본 선택 = 관심 이상').toHaveAttribute('aria-pressed', 'true');
      expect.soft(aResp?.url() ?? '', '최초 조회 = ?tier=warm').toContain('tier=warm');
      const leadCountUi = async () => Number(((await ep.getByText('지금 연락해야 할 핫리드').locator('xpath=following-sibling::span[1]').innerText().catch(() => '')).match(/(\d+)명/) || [])[1]);
      const tierRuns: Record<string, any> = {};
      const checkTier = (tier: string, leadsArr: any[]) => {
        if (tier === 'hot') return leadsArr.every((h) => h.buyerTemperature === '🔥 적극검토');
        if (tier === 'warm') return leadsArr.every((h) => ['🔥 적극검토', '📈 관심'].includes(h.buyerTemperature));
        return leadsArr.every((h) => h.score > 0);
      };
      const warmLeads = aj?.hotLeads || [];
      tierRuns.warm = { n: warmLeads.length, ui: await leadCountUi(), ok: checkTier('warm', warmLeads), rule: aj?.hotLeadThreshold?.rule, query: aj?.hotLeadQuery };
      expect.soft(tierRuns.warm.ok, 'warm: 🔥/📈 만').toBeTruthy();
      expect.soft(tierRuns.warm.ui, 'warm: UI 핫리드 수 = API').toBe(warmLeads.length);
      if (aj?.hotLeadThreshold?.rule) await expect.soft(ep.getByText(aj.hotLeadThreshold.rule).first(), '선별 기준 문구 표시').toBeVisible();
      if (warmLeads.length === 0) await expect.soft(ep.getByText('아직 관심 신호가 있는 구독자가 없습니다'), 'warm 0명 → 빈 상태 안내').toBeVisible();
      let allJson: any = null;
      for (const [tier, label] of [['hot', /적극검토만/], ['all', /반응 있는 전체/]] as const) {
        const [r] = await Promise.all([
          ep.waitForResponse((x) => x.url().includes(`/api/broker/magazine/analytics?tier=${tier}`), { timeout: 30000 }).catch(() => null),
          group.getByRole('button', { name: label }).click(),
        ]);
        await ep.waitForTimeout(600);
        const j: any = r ? await r.json().catch(() => null) : null;
        const ls = j?.hotLeads || [];
        tierRuns[tier] = { status: r?.status() ?? null, n: ls.length, ui: await leadCountUi(), ok: checkTier(tier, ls), pressed: await group.getByRole('button', { name: label }).getAttribute('aria-pressed'), rule: j?.hotLeadThreshold?.rule, query: j?.hotLeadQuery };
        expect.soft(tierRuns[tier].status, `${tier}: 서버 재조회 200`).toBe(200);
        expect.soft(tierRuns[tier].ok, `${tier}: 서버 선별 규칙 준수`).toBeTruthy();
        expect.soft(tierRuns[tier].ui, `${tier}: UI 핫리드 수 = API`).toBe(ls.length);
        expect.soft(tierRuns[tier].pressed, `${tier}: aria-pressed`).toBe('true');
        if (tier === 'all') allJson = j;
      }
      const bad = await ep.request.get('/api/broker/magazine/analytics?tier=bogus');
      tierRuns.invalid = { status: bad.status(), code: (await bad.json().catch(() => ({})))?.error?.code };
      expect.soft(tierRuns.invalid.status, '알 수 없는 tier → 400').toBe(400);
      report.hotLeadTiers = tierRuns;
      await editorPanelShot(ep, 'p3_11_dashboard_1440.png', phoneMask());
      // 핫리드('반응 있는 전체') → 상세 패널 / 통화 브리핑
      const leads = (allJson?.hotLeads || []).filter((h: any) => h.subscriber_name);
      report.hotLeadsAll = leads.map((h: any) => ({ t: h.buyerTemperature, s: h.score, v: h.totalViews }));
      if (leads.length > 0) {
        const name = leads[0].subscriber_name;
        await ep.getByRole('button', { name: `${name} 열람 상세 보기` }).first().click();
        const panel = ep.getByRole('dialog');
        await expect.soft(panel, '고객 이름 → 열람 이력 패널').toBeVisible({ timeout: 10000 });
        await expect.soft(panel.getByText(`${name} 열람 이력`), `패널 제목 "${name} 열람 이력"`).toBeVisible();
        await expect(panel.getByText('불러오는 중')).toHaveCount(0, { timeout: 30000 }).catch(() => {});
        await ep.waitForTimeout(300);
        const pt = (await panel.innerText()).replace(/\s+/g, ' ');
        report.detailPanel = pt.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, '010-****-****').slice(0, 500);
        for (const k of ['열람 횟수', '평균 체류', '마지막 활동']) expect.soft(pt, `패널 "${k}"`).toContain(k);
        await shot(ep, 'p3_12_subscriber_detail_1440.png', { doc: true, mask: phoneMask(), maskPhones: true });
        await panel.getByRole('button', { name: '닫기' }).first().click().catch(async () => ep.keyboard.press('Escape'));
        await ep.waitForTimeout(400);
        // 통화 브리핑(템플릿)
        const apiCalls: string[] = [];
        const onReq = (rq: any) => { if (rq.url().includes('/api/')) apiCalls.push(rq.url()); };
        ep.on('request', onReq);
        await ep.getByRole('button', { name: /통화 브리핑\(템플릿\)/ }).first().click();
        const modal = ep.getByRole('dialog');
        await expect.soft(modal, '통화 브리핑 모달').toBeVisible({ timeout: 10000 });
        await ep.waitForTimeout(800);
        ep.off('request', onReq);
        const mt = (await modal.innerText()).replace(/\s+/g, ' ');
        report.callBriefing = { text: mt.replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, '010-****-****').slice(0, 600), apiCalls };
        expect.soft(mt, '제목 "{이름} 고객 통화 브리핑"').toContain('고객 통화 브리핑');
        expect.soft(mt, '"AI 생성 아님" 명시').toContain('AI 생성 아님');
        expect.soft(apiCalls.length, '템플릿 → 생성 API 호출 0').toBe(0);
        await expect.soft(modal.getByRole('button', { name: /문구 복사/ }), '"문구 복사"').toBeVisible();
        await shot(ep, 'p3_13_call_briefing_1440.png', { doc: true, mask: phoneMask(), maskPhones: true });
        const closed = await modal.getByRole('button', { name: '닫기' }).first().click({ timeout: 5000 }).then(() => true).catch(() => false);
        report.callBriefingCloseClickable = closed;
        expect.soft(closed, '모달 "닫기" 클릭 가능').toBeTruthy();
        if (!closed) await ep.keyboard.press('Escape');
      } else {
        test.info().annotations.push({ type: 'N/A(data)', description: '반응 있는 구독자 0명 → 상세 패널/통화 브리핑 검증 불가' });
      }
      await expect.soft(ep.getByText('콘텐츠별 독자 관심도').first(), '섹션 관심도').toBeVisible();
      await expect.soft(ep.getByText('발행 에디션별 성과').first(), '에디션별 성과').toBeVisible();
    });

    // ═════════════ 실습 9 ═════════════
    const S9 = '실습9 발행설정·SNS 이미지 실측';
    await runStep(S9, async () => {
      await ep.getByRole('tab', { name: /발행설정/ }).click();
      await ep.waitForTimeout(800);
      const group = ep.getByRole('radiogroup', { name: '발송 대상' });
      await expect.soft(group, '"발송 대상" 선택').toBeVisible();
      const segTxt = (await group.innerText().catch(() => '')).replace(/\s+/g, ' ');
      report.publishTargets = segTxt;
      for (const s of ['전체 구독자', '매수 관심', '매도 관심']) expect.soft(segTxt, `발송 대상 "${s}"`).toContain(s);
      const pub = (await ep.locator('body').innerText()).replace(/\s+/g, ' ');
      const dl = ep.getByRole('button', { name: /이미지 다운로드/ });
      report.publishTab = {
        story: /원페이지 이미지 \(1080x1920\)/.test(pub),
        cardUi: /1080x1080|정사각형 카드/.test(pub),
        downloadDisabled: await dl.isDisabled().catch(() => null),
        pollEditor: /1-Click 투표 \(선택\)/.test(pub), taxEditor: /세무·법률 클리닉 \(선택\)/.test(pub), sectionOrder: /섹션 순서·노출/.test(pub),
      };
      expect.soft(report.publishTab.story, '"원페이지 이미지 (1080x1920)"').toBeTruthy();
      expect.soft(report.publishTab.pollEditor && report.publishTab.taxEditor && report.publishTab.sectionOrder, '설문/세무/섹션 순서 편집 UI').toBeTruthy();
      await editorPanelShot(ep, 'p3_14_publish_tab_1440.png', phoneMask());

      const fonts = { publicFonts: fs.existsSync(path.resolve(__dirname, '../public/fonts')), envFontPath: !!process.env.MAGAZINE_OG_FONT_PATH };
      report.fontStatus = { ...fonts, expected: fonts.publicFonts || fonts.envFontPath ? 'Noto Sans KR' : 'Latin fallback (한글 제거)' };
      // 한글 폰트가 없으면 latinSafe 가 한글을 지워 요약이 "9.4% 5 , 1 . . :" 같은 구두점 잔해가 됨 → 상용 불가 (제품 결함)
      expect.soft(fonts.publicFonts || fonts.envFontPath, 'SNS 이미지 한글 폰트 탑재 (public/fonts 또는 MAGAZINE_OG_FONT_PATH)').toBeTruthy();
      const assets: Record<string, any> = {};
      const targets: [string, string, number, number, string | null][] = [
        ['og', `/api/og/magazine?brokerId=${SLUG}&date=${FIX_DATE}`, 1200, 630, 'p3_17_og_image.png'],
        ['story', `/api/magazine/${SLUG}/${FIX_DATE}/image?format=story`, 1080, 1920, 'p3_15_story_image.png'],
        ['card', `/api/magazine/${SLUG}/${FIX_DATE}/image?format=card`, 1080, 1080, 'p3_16_card_image.png'],
        ['og_format', `/api/magazine/${SLUG}/${FIX_DATE}/image?format=og`, 1200, 630, null],
        ['neutral_missing', `/api/magazine/${SLUG}/2020-01-01/image?format=card`, 1080, 1080, null],
      ];
      for (const [k, url, w, h, docName] of targets) {
        const r = await request.get(url, { timeout: 90000 });
        const buf = Buffer.from(await r.body());
        const sz = pngSize(buf);
        assets[k] = { url, status: r.status(), type: r.headers()['content-type'], cache: r.headers()['cache-control'], bytes: buf.length, size: sz };
        fs.writeFileSync(path.join(OUT_DIR, `p3_asset_${k}.png`), buf);
        if (docName && sz) { fs.writeFileSync(path.join(DOC_IMG_DIR, docName), buf); (report.docImages ||= []).push(docName); }
        expect.soft(r.status(), `${k} 200`).toBe(200);
        expect.soft(r.headers()['content-type'] ?? '', `${k} image/png`).toContain('image/png');
        expect.soft(sz, `${k} ${w}x${h}`).toEqual({ w, h });
      }
      expect.soft(assets.story.cache ?? '', '발행본 이미지 캐시 s-maxage=3600 (1년 immutable 금지)').toContain('s-maxage=3600');
      expect.soft(assets.neutral_missing.cache ?? '', '미발행 날짜 → 중립 이미지(짧은 캐시)').toContain('max-age=60');
      const fut = await request.get(`/api/magazine/${SLUG}/2099-12-31/image?format=story`);
      assets.future = { status: fut.status(), cache: fut.headers()['cache-control'] };
      expect.soft([fut.status(), fut.headers()['cache-control']], '미래 날짜 → 400 no-store').toEqual([400, 'no-store']);
      const legacy = await request.get(`/api/og/magazine/${SLUG}`);
      assets.legacyPath = { status: legacy.status() };
      expect.soft(legacy.status(), '구 경로 /api/og/magazine/{slug} → 404 (쿼리형만 지원)').toBe(404);
      report.assets = assets;
      const html = await (await request.get(VIEWER)).text();
      const og = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || [])[1] ?? null;
      report.ogImageMeta = og;
      expect.soft(og ?? '', 'og:image = 절대 URL + 쿼리형 경로').toMatch(new RegExp(`^https?://[^/]+/api/og/magazine\\?brokerId=${SLUG}&(amp;)?date=${FIX_DATE}`));
    });
    await ed.close();

    // ═════════════ 실습 10 ═════════════
    const S10 = '실습10 미발행 날짜·360px';
    await runStep(S10, async () => {
      const p = await reader.newPage(); attachDiagnostics(p, 'unpub');
      const b0 = beacons.length;
      await p.goto(`/magazine/${SLUG}/2099-12-31`, { waitUntil: 'networkidle' });
      await expect.soft(p.getByRole('heading', { name: '아직 발행되지 않은 매거진입니다' }), '미래 날짜 → 미발행 안내').toBeVisible();
      const futText = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
      expect.soft(futText, '미래 날짜 설명').toMatch(/2099년 12월 31일 \([일월화수목금토]\) 호는 아직 발행일이 되지 않았습니다/);
      const latest = p.getByRole('link', { name: /가장 최근 호 보기/ });
      const latestText = await latest.innerText().catch(() => '');
      report.unpublished = { futText: futText.slice(0, 300), latestText, latestHref: await latest.getAttribute('href').catch(() => null) };
      expect.soft(report.unpublished.latestHref, '"가장 최근 호 보기" → 실제 최신 발행일').toBe(`/magazine/${SLUG}/${BASE_ISSUE_DATE}`);
      expect.soft(latestText, '최신호 날짜 표기').toContain('2026년 10월 4일 (일)');
      await expect.soft(p.getByRole('link', { name: '지난 매거진 목록' }), '"지난 매거진 목록"').toBeVisible();
      await expect.soft(p.getByRole('link', { name: '다음 호 구독하기' }), '"다음 호 구독하기"').toBeVisible();
      expect.soft(await p.locator('meta[name="robots"]').getAttribute('content'), 'noindex').toMatch(/noindex/);
      expect.soft(beaconsSince(b0).length, '미발행 화면 → 분석 비콘 0').toBe(0);
      await shot(p, 'p3_18_unpublished_390.png', { doc: true });
      await p.goto(`/magazine/${SLUG}/2020-01-01`, { waitUntil: 'networkidle' });
      const pastTxt = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
      report.unpublished.pastText = pastTxt.slice(0, 200);
      expect.soft(pastTxt, '과거 미발행 날짜 → 미발행 안내(다른 호로 대체하지 않음)').toMatch(/아직 발행되지 않은 매거진입니다.*2020년 1월 1일 \(수\) 호는 발행되지 않았거나 공개 대기 중입니다/);
      await p.close();
      const small = await newReaderContext(browser, { width: 360, height: 740 });
      const sp = await small.newPage(); attachDiagnostics(sp, 'reader360');
      await gotoViewer(sp, VIEWER);
      const m360 = await sp.evaluate(() => {
        const nav = document.querySelector('nav[data-magazine-bottom-bar]');
        const btns = nav ? Array.from(nav.querySelectorAll('a,button')).map((b) => { const r = b.getBoundingClientRect(); return { t: (b as HTMLElement).innerText.trim(), w: Math.round(r.width), h: Math.round(r.height) }; }) : [];
        return { overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, bar: btns };
      });
      report.mobileMetrics360 = m360;
      expect.soft(m360.overflowX, '360px 가로 오버플로 없음').toBeFalsy();
      m360.bar.forEach((b: any) => expect.soft(b.h, `360px 고정바 "${b.t}" 한 줄(높이 <60)`).toBeLessThan(60));
      await sp.locator('[data-section-id="roi_calculator"]').scrollIntoViewIfNeeded();
      await shot(sp, 'p3_19_roi_360.png', { doc: true });
      await small.close();
    });

    await reader.close();
    report.diagnostics = { consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, badResponses: badResponses.length };
  });
});
