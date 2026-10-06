/**
 * 📗 TUTORIAL_PART2_SUBSCRIBE_VIRAL — Golden E2E (Wave4 D-01 재작성, 개선된 UI 기준)
 *
 * 원칙
 *  - 튜토리얼 "실습 N" ↔ 이 파일의 test('실습N: …') 1:1. 각 test.step 라벨 = 튜토리얼 단계.
 *  - 하드 단언(expect.soft + 결과 기록). 제품 결함을 숨기려고 단언을 약화하지 않는다(FAIL 유지 → 보고).
 *  - 고객·브로커 화면 모두 모바일 390x844 로 촬영(튜토리얼 이미지 = 이 스펙의 스크린샷).
 *  - 안전: 실제 발송 금지 — special POST / distribute 는 page.route 로 mock, 구독 API 는 실호출 1회(@needs-migration 503 확인)만.
 *  - 테스트 데이터: 이름 E2E_TUT2_*, 전화 0100000 71xx → afterAll 에서 service role 로 삭제. 실데이터·실구독자 불변.
 *  - 마이그레이션(동의 컬럼) 미적용 의존 경로는 @needs-migration 태그: (a) 현재의 정직한 강등(503+사용자 문구, 가짜 성공 없음)
 *    (b) page.route mock 으로 요청 payload 계약을 단언.
 *
 * 실행(격리 포트):
 *  $env:E2E_PORT="3202"; $env:UNSUBSCRIBE_SECRET="e2e-only-unsub-secret-0001"; $env:MAGAZINE_SID_SECRET="e2e-only-sid-secret-0001";
 *  npx playwright test e2e/magazine-tutorial-part2-golden.auth.spec.ts --project=authenticated --no-deps --workers=1 --reporter=line
 */
import { test, expect, type Page, type BrowserContext, type Browser, type Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true } as any);

const PORT = process.env.E2E_PORT || '3000';
const BASE = `http://localhost:${PORT}`;
const SLUG = 'test-broker-kim';
const UID = '204246a5-7c52-4549-9570-f089fbbf789c';
const OWNED_BUILDING = '073de8e9-dbea-410d-9c5b-f8021ffff5ab'; // E2E 계정 소유 딜카드
const NONEXIST_SLUG = 'e2e-tut2-nonexistent';
const AUTH_STATE = path.resolve(__dirname, '.auth/user.json');
const SHOT_DIR =
  process.env.TUT2_SHOT_DIR ||
  'C:\\Users\\User\\.gemini\\antigravity\\brain\\ec7b1f17-3496-440a-a4ce-486c2fe69333\\scratch\\part2w4';
const RESULT_FILE = path.join(SHOT_DIR, 'golden_results.jsonl');
const UNSUB_SECRET = process.env.UNSUBSCRIBE_SECRET || '';

const PH = {
  form: '01000007101',
  manual: '01000007103',
  unsub: '01000007104',
  oneClick: '01000007105',
};
const hyphen = (d: string) => `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
const TEST_PHONES = Object.values(PH).flatMap((p) => [p, hyphen(p)]);
const NAME = { manual: 'E2E_TUT2_수동추가', unsub: 'E2E_TUT2_수신거부', oneClick: 'E2E_TUT2_원클릭' };
// 실 POST 는 실행마다 다른 IP·번호로(레이트리밋 10/h·3/day 가 재실행을 오염시키지 않게). 응답은 503(미적용)이라 DB 에 남지 않는다.
const RUN_IP = `198.18.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
const RUN_PHONE = `010000071${String(60 + Math.floor(Math.random() * 39)).padStart(2, '0')}`;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// ── 결과 기록 ──
function record(practice: string, step: string, pass: boolean, detail = '') {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.appendFileSync(RESULT_FILE, JSON.stringify({ practice, step, pass, detail, at: new Date().toISOString() }) + '\n');
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${practice} | ${step}${detail ? ' | ' + detail : ''}`);
}
/** 하드 단언: 실패해도 다음 단계는 계속(soft) — 최종 결과는 FAIL. */
function check(practice: string, step: string, cond: boolean, detail = '') {
  record(practice, step, cond, detail);
  expect.soft(cond, `${practice} › ${step} ${detail}`).toBe(true);
}
/** 참고 기록(단언 아님) — 관찰/환경 정보. */
function note(practice: string, step: string, detail: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.appendFileSync(RESULT_FILE, JSON.stringify({ practice, step, note: true, detail, at: new Date().toISOString() }) + '\n');
  console.log(`NOTE | ${practice} | ${step} | ${detail}`);
}
/** 튜토리얼용 스크린샷 — Next dev 표시기(nextjs-portal)는 촬영 시에만 숨긴다(운영 빌드엔 없음). */
async function shot(page: Page, name: string, fullPage = false) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  // dev 인디케이터 숨김 — 에디터 미리보기 폰은 iframe 이므로 모든 프레임에 주입
  for (const f of page.frames()) {
    await f.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage }).catch(() => {});
}

// ── 콘솔/네트워크 수집 ──
const issues: string[] = [];
function watch(page: Page, label: string) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`[${label}] console.error: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => issues.push(`[${label}] pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(BASE) && !u.includes('/_next/')) issues.push(`[${label}] HTTP ${r.status()} ${r.request().method()} ${u.replace(BASE, '')}`);
  });
}

// ── 안전 가드 (발송 차단 + 추적 엔드포인트 mock + 카카오 SDK stub) ──
const blocked: string[] = [];
async function installSafety(ctx: BrowserContext) {
  await ctx.route('**/api/broker/magazine/distribute**', async (route) => {
    blocked.push(`distribute ${route.request().method()}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, mocked: true }) });
  });
  // 속보 POST(발행/발송) 기본 차단 — 실습10 에서만 page.route 로 계약 mock
  await ctx.route('**/api/broker/magazine/special**', async (route) => {
    if (route.request().method() === 'GET') return route.continue();
    blocked.push(`special ${route.request().method()} (context-guard)`);
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'blocked by e2e guard' }) });
  });
  await ctx.route('**/api/public/magazine/analytics**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await ctx.route('**/api/public/magazine/poll**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await ctx.route('**/kakao_js_sdk/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `window.Kakao={init:function(){},isInitialized:function(){return true},Share:{sendDefault:function(o){window.__kakaoShare=o;}}};`,
    }),
  );
}

async function mobileContext(browser: Browser, opts: { auth?: boolean; w?: number; h?: number } = {}) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: opts.auth ? AUTH_STATE : { cookies: [], origins: [] },
    viewport: { width: opts.w ?? 390, height: opts.h ?? 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    extraHTTPHeaders: { 'x-playwright-test': 'true', 'x-forwarded-for': RUN_IP },
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await installSafety(ctx);
  return ctx;
}

/** 브로커 에디터 = 데스크톱 1440x900 (Part1/3 과 동일 기준, 스크린샷 이름 *_1440) */
async function desktopContext(browser: Browser) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: AUTH_STATE,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'ko-KR',
    extraHTTPHeaders: { 'x-playwright-test': 'true', 'x-forwarded-for': RUN_IP },
  });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await installSafety(ctx);
  return ctx;
}

/** 20분 넘은 이전 실행 잔여 fixture(E2E_TUT2_) 정리 — Part1/3 과 같은 방식 */
async function purgeStaleFixtures(): Promise<number> {
  const cutoff = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data } = await sb
    .from('magazine_subscribers')
    .select('id')
    .like('subscriber_name', 'E2E_TUT2_%')
    .lt('created_at', cutoff);
  const ids = (data || []).map((r: any) => r.id);
  if (!ids.length) return 0;
  await sb.from('activity_events').delete().eq('event_type', 'magazine_unsubscribed').in('entity_id', ids);
  const { count } = await sb.from('magazine_subscribers').delete({ count: 'exact' }).in('id', ids);
  return count || 0;
}

/** 뷰어 하단 고정 바가 본문 조작 요소(버튼·링크·입력)를 가리는지 — 페이지 끝까지 스크롤한 상태와 구독 CTA 위치에서 검사 */
async function bottomBarOverlap(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const bar = document.querySelector('[aria-label="상담·공유 바로가기"]') as HTMLElement | null;
    if (!bar) return ['NO_BAR'];
    const hits: string[] = [];
    const scan = () => {
      const b = bar.getBoundingClientRect();
      document.querySelectorAll('main button, main a[href], main input, main label').forEach((el) => {
        if (bar.contains(el)) return;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) return;
        const overlap = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        const overlapX = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        // 가려진 채로 끝까지 스크롤해도 벗어날 수 없는 요소만 결함으로 본다(페이지 끝 상태)
        if (overlap > 4 && overlapX > 4) hits.push(`${el.tagName.toLowerCase()}:"${((el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || '').trim().slice(0, 24)}" overlap=${Math.round(overlap)}px`);
      });
    };
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    scan();
    return hits;
  });
}

async function subsByPhone(phones: string[]) {
  const { data } = await sb.from('magazine_subscribers').select('*').in('subscriber_phone', phones);
  return data || [];
}

// ── 수신거부 토큰 v2 (src/domain/magazine/unsub-token.ts 와 동일 포맷) ──
function unsubTokenV2(subscriberId: string, brokerId: string, expSec?: number, secret = UNSUB_SECRET) {
  const exp = expSec ?? Math.floor(Date.now() / 1000) + 7 * 86400;
  const payloadB64 = Buffer.from(`v2.${subscriberId}.${brokerId}.${exp}`).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest().toString('base64url');
  return `${payloadB64}.${sig}`;
}

/** 요소가 실제로 클릭 가능한지(다른 요소에 가려지지 않았는지) */
async function obstruct(loc: Locator) {
  return loc.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!top && (top === el || el.contains(top)) ? 'clickable' : `covered-by:${top?.tagName}.${String((top as HTMLElement)?.className || '').slice(0, 60)}`;
  });
}

let LATEST_DATE = ''; // 랜딩 "최근 발행" 카드가 가리키는 발행일 (뷰어 실습에 사용)

async function openOutreach(page: Page) {
  await page.goto('/broker/magazine-editor?tab=outreach', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: '구독자 관리' }).waitFor({ state: 'visible', timeout: 120_000 });
  // 목록 스켈레톤(aria-label="구독자 목록을 불러오는 중")이 사라질 때까지 대기 — 로딩 중 캡처 방지
  await expect.soft(page.getByLabel('구독자 목록을 불러오는 중')).toHaveCount(0, { timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await expect.soft(page.getByText(/총 \d+명 중 \d+명 표시/)).toBeVisible({ timeout: 60_000 });
}

// 직렬 모드는 쓰지 않는다: 한 실습의 제품 결함 FAIL 이 뒤 실습을 skip 시키지 않도록(--workers=1 로 순서 유지).
test.describe('📗 Tutorial Part 2 Golden — 구독자 모으기 & 확산 (개선 UI)', () => {
  test.beforeAll(async ({ request }) => {
    test.setTimeout(300_000); // 격리 포트 dev 서버 최초 컴파일 대기
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const purged = await purgeStaleFixtures();
    if (purged) note('setup', 'stale fixture purge', `E2E_TUT2_ 잔여 ${purged}건 삭제(20분 초과)`);
    // 테스트 전화번호가 실데이터와 충돌하지 않는지
    const pre = await subsByPhone(TEST_PHONES);
    const foreign = pre.filter((s: any) => !(s.subscriber_name || '').startsWith('E2E_TUT2_'));
    if (foreign.length) throw new Error(`테스트 전화번호가 실데이터와 충돌: ${foreign.map((f: any) => f.subscriber_phone).join(',')}`);
    // 랜딩 최근 발행일
    const html = await (await request.get(`/magazine/${SLUG}/subscribe`, { timeout: 240_000 })).text();
    const m = html.match(new RegExp(`/magazine/${SLUG}/(\\d{4}-\\d{2}-\\d{2})`));
    LATEST_DATE = m?.[1] || '';
    note('setup', 'env', `BASE=${BASE} RUN_IP=${RUN_IP} LATEST_DATE=${LATEST_DATE || '(none)'} UNSUB_SECRET=${UNSUB_SECRET ? 'set' : 'MISSING'}`);
  });

  test.afterAll(async () => {
    // ── 테스트 데이터 정리 (service role) — E2E_TUT2 이름 또는 예약 테스트 번호만 ──
    const brokerIds = [SLUG, UID, NONEXIST_SLUG];
    const { data: mine } = await sb
      .from('magazine_subscribers')
      .select('id, subscriber_name, subscriber_phone')
      .in('broker_id', brokerIds)
      .or(`subscriber_name.like.E2E_TUT2_%,subscriber_phone.in.(${TEST_PHONES.map((p) => `"${p}"`).join(',')})`);
    const ids = (mine || []).filter((m: any) => (m.subscriber_name || '').startsWith('E2E_TUT2_')).map((m: any) => m.id);
    let delSubs = 0;
    let ev2c = 0;
    if (ids.length) {
      const ev2 = await sb.from('activity_events').delete({ count: 'exact' }).eq('event_type', 'magazine_unsubscribed').in('entity_id', ids);
      ev2c = ev2.count || 0;
      const { error, count } = await sb.from('magazine_subscribers').delete({ count: 'exact' }).in('id', ids);
      delSubs = count || 0;
      if (error) console.log('cleanup subs error', error.message);
    }
    const left = await sb
      .from('magazine_subscribers')
      .select('id', { count: 'exact', head: true })
      .or(`subscriber_name.like.E2E_TUT2_%,subscriber_phone.in.(${TEST_PHONES.map((p) => `"${p}"`).join(',')})`);
    const summary = `CLEANUP subs_deleted=${delSubs} unsub_events_deleted=${ev2c} remaining_test_rows=${left.count}`;
    console.log(summary);
    fs.appendFileSync(RESULT_FILE, JSON.stringify({ practice: 'cleanup', step: summary, pass: left.count === 0 }) + '\n');
    console.log(`\n=== ISSUES (console/pageerror/4xx-5xx) ${issues.length} ===\n` + Array.from(new Set(issues)).slice(0, 60).join('\n'));
    console.log(`=== BLOCKED SEND REQUESTS === ${blocked.join(', ') || 'none'}`);
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 1: 내 구독 페이지 둘러보기 (고객 시점, 모바일)
  // ═════════════════════════════════════════════════════════════════════
  test('실습1: 내 구독 페이지 둘러보기', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const P = '실습1';
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'subscribe');

    await test.step('1-1 /magazine/내슬러그/subscribe 열기', async () => {
      const res = await page.goto(`/magazine/${SLUG}/subscribe`, { waitUntil: 'networkidle' });
      check(P, '구독 페이지 200', res?.status() === 200, `status=${res?.status()}`);
      await shot(page, 'p2_01_subscribe_landing.png');
    });

    await test.step('1-2 브로커 이름·소속·전문 태그 = 내 프로필', async () => {
      const { data: bp } = await sb.from('broker_profiles').select('name, specialty_regions, specialty_assets').eq('slug', SLUG).maybeSingle();
      const { data: pf } = await sb.from('profiles').select('company').eq('id', UID).maybeSingle();
      const h1 = (await page.locator('h1').first().innerText()).trim();
      check(P, 'h1 = "{이름} 중개사의 매거진 구독"', h1 === `${bp?.name} 중개사의 매거진 구독`, `h1="${h1}"`);
      check(P, '이름이 슬러그로 표시되지 않음', !h1.includes(SLUG), `h1="${h1}"`);
      const companyShown = pf?.company ? await page.getByText(pf.company, { exact: true }).count() : 0;
      check(P, '소속 회사 = profiles.company', companyShown > 0, `company="${pf?.company}" shown=${companyShown}`);
      const tagText = await page.locator('span:has-text("📍"), span:has-text("🏢")').allInnerTexts();
      const expected = [...((bp?.specialty_regions as string[]) || []), ...((bp?.specialty_assets as string[]) || [])];
      const allMatch = expected.length > 0 && expected.every((t) => tagText.some((x) => x.replace(/[📍🏢\s]/gu, '') === t));
      check(P, '전문 권역/자산 태그 = 프로필 설정값', allMatch, `shown=${JSON.stringify(tagText)} profile=${JSON.stringify(expected)}`);
    });

    await test.step('1-3 발송 요일 안내 + "최근 발행" 미리보기 카드', async () => {
      check(P, '"매주 화요일 카카오톡 무료 발송" 안내', (await page.getByText('매주 화요일 카카오톡 무료 발송').count()) > 0);
      const preview = page.getByTestId('recent-preview');
      check(P, '최근 발행 미리보기 카드 노출', await preview.isVisible().catch(() => false));
      const previewText = (await preview.innerText().catch(() => '')).replace(/\s+/g, ' ');
      check(P, '카드 문구 "최근 발행 · 날짜"', /최근 발행 ·/.test(previewText), previewText.slice(0, 120));
      const link = preview.getByRole('link', { name: /먼저 읽어보기/ });
      const href = (await link.getAttribute('href').catch(() => null)) || '';
      check(P, '"먼저 읽어보기" 링크 = 최근 호 뷰어', new RegExp(`/magazine/${SLUG}/\\d{4}-\\d{2}-\\d{2}$`).test(href), `href=${href}`);
      if (href) {
        const r = await request.get(href);
        check(P, '최근 호 뷰어 200', r.status() === 200, `status=${r.status()}`);
      }
    });

    await test.step('1-4 없는 슬러그 404 / UUID 주소는 슬러그로 308', async () => {
      const r404 = await request.get(`/magazine/${NONEXIST_SLUG}/subscribe`);
      const body404 = await r404.text();
      check(P, '존재하지 않는 슬러그 → HTTP 404', r404.status() === 404, `status=${r404.status()} (loading.tsx 스트리밍이면 200)`);
      check(P, '존재하지 않는 슬러그 → noindex', /<meta[^>]*name="robots"[^>]*noindex/.test(body404), `noindex=${/noindex/.test(body404)}`);
      const rUuid = await request.get(`/magazine/${UID}/subscribe`, { maxRedirects: 0 });
      const loc = rUuid.headers()['location'] || '';
      check(P, 'UUID 주소 → HTTP 308 슬러그 주소', rUuid.status() === 308 && loc.includes(`/magazine/${SLUG}/subscribe`), `status=${rUuid.status()} location=${loc}`);
      const p2 = await ctx.newPage();
      await p2.goto(`/magazine/${UID}/subscribe`, { waitUntil: 'networkidle' });
      check(P, 'UUID 주소 → 브라우저는 슬러그 주소에 도착', p2.url().includes(`/magazine/${SLUG}/subscribe`), `url=${p2.url()}`);
      await p2.close();
    });

    await test.step('1-5 작은 화면(360x740) 가로 넘침 없음', async () => {
      const small = await mobileContext(browser, { w: 360, h: 740 });
      const sp = await small.newPage();
      watch(sp, 'subscribe-360');
      await sp.goto(`/magazine/${SLUG}/subscribe`, { waitUntil: 'networkidle' });
      const ov = await sp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(P, '360px 가로 오버플로 없음', ov <= 0, `overflow=${ov}px`);
      const submit = sp.getByRole('button', { name: /무료 구독하기/ });
      check(P, '제출 버튼이 다른 요소에 가려지지 않음', (await obstruct(submit)) === 'clickable');
      await small.close();
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 2: 고객이 되어 구독 신청해 보기
  // ═════════════════════════════════════════════════════════════════════
  test('실습2: 고객이 되어 구독 신청해 보기 @needs-migration', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const P = '실습2';
    test.info().annotations.push({ type: 'needs-migration', description: '구독 동의 컬럼(000006) 적용 후 실 신청 성공 경로(200 pending)로 전환 — 현재는 503 정직 강등 + payload 계약(mock)' });
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'subscribe-form');
    await page.goto(`/magazine/${SLUG}/subscribe`, { waitUntil: 'networkidle' });

    await test.step('2-1 입력칸: 이름(선택)·휴대폰(필수)·이메일(선택)', async () => {
      check(P, '"성함 또는 닉네임 (선택)" 라벨-입력 연결', (await page.getByLabel(/성함 또는 닉네임/).count()) === 1);
      const phone = page.locator('#sub-phone');
      check(P, '"휴대폰 번호 *" 라벨-입력 연결', (await page.getByLabel(/휴대폰 번호/).count()) >= 1);
      const attrs = await phone.evaluate((el: HTMLInputElement) => ({ type: el.type, im: el.inputMode, ac: el.autocomplete, ph: el.placeholder }));
      check(P, '휴대폰 칸 type=tel·숫자 키패드·autocomplete=tel', attrs.type === 'tel' && attrs.im === 'numeric' && attrs.ac === 'tel', JSON.stringify(attrs));
      check(P, '이메일 칸 (선택)', (await page.getByLabel(/이메일/).count()) >= 1);
      await phone.fill('');
      await phone.pressSequentially(PH.form, { delay: 15 });
      const v = await phone.inputValue();
      check(P, '숫자만 입력 → 하이픈 자동 (010-0000-7101)', v === hyphen(PH.form), `value=${v}`);
    });

    await test.step('2-2 관심 권역·자산 칩 선택', async () => {
      const region = page.getByRole('group', { name: /관심 권역/ }).getByRole('button', { name: /강남·서초/ });
      const asset = page.getByRole('group', { name: /관심 자산|자산/ }).getByRole('button', { name: /꼬마빌딩/ });
      await region.click();
      await asset.click();
      check(P, '권역 칩 선택(aria-pressed=true, "✓ 강남·서초")', (await region.getAttribute('aria-pressed')) === 'true' && (await region.innerText()).includes('✓'), await region.innerText());
      check(P, '자산 칩 선택(aria-pressed=true, "✓ 꼬마빌딩")', (await asset.getAttribute('aria-pressed')) === 'true' && (await asset.innerText()).includes('✓'), await asset.innerText());
      const box = await region.boundingBox();
      check(P, '칩 터치 높이 ≥ 44px', !!box && box.height >= 44, `h=${box?.height}`);
    });

    await test.step('2-3 필수 동의 3개(기본 해제) → 체크 전 버튼 비활성', async () => {
      const ids = ['sub-page-privacy', 'sub-page-marketing', 'sub-page-age14'];
      const states = await Promise.all(ids.map((id) => page.locator(`#${id}`).isChecked()));
      check(P, '동의 3개 기본 미체크', states.every((s) => !s), JSON.stringify(states));
      const submit = page.getByRole('button', { name: /무료 구독하기/ });
      check(P, '동의 전 "무료 구독하기" 비활성', await submit.isDisabled());
      check(P, '안내 "필수 동의 3개를 모두 체크하면 신청할 수 있습니다."', (await page.getByText('필수 동의 3개를 모두 체크하면 신청할 수 있습니다.').count()) > 0);
      const privacyHref = await page.locator('a[href="/privacy"]').first().getAttribute('href').catch(() => null);
      check(P, '개인정보 처리방침 링크(/privacy)', privacyHref === '/privacy');
      const rp = await request.get('/privacy');
      check(P, '/privacy 200', rp.status() === 200, `status=${rp.status()}`);
      await page.locator('#sub-page-privacy').scrollIntoViewIfNeeded();
      await shot(page, 'p2_02_subscribe_form.png');
      for (const id of ids) await page.locator(`#${id}`).check();
      check(P, '동의 3개 체크 후 버튼 활성', await submit.isEnabled());
    });

    await test.step('2-4 [@needs-migration] 실제 신청 → 마이그레이션 미적용이면 503 + 사용자 문구, 가짜 성공 없음', async () => {
      const phone = page.locator('#sub-phone');
      await phone.fill('');
      await phone.pressSequentially(RUN_PHONE, { delay: 10 });
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/public/magazine/subscribe') && r.request().method() === 'POST', { timeout: 30_000 }),
        page.getByRole('button', { name: /무료 구독하기/ }).click(),
      ]);
      const st = resp.status();
      const body = await resp.json().catch(() => ({}));
      note(P, '실 구독 API 응답', `status=${st} body=${JSON.stringify(body).slice(0, 200)}`);
      check(P, '미적용 스키마 → 503 SERVICE_UNAVAILABLE (정직한 강등)', st === 503, `status=${st}`);
      await expect.soft(page.getByText('잠시 후 다시 시도해 주세요').first()).toBeVisible({ timeout: 10_000 });
      check(P, '사용자 문구 "잠시 후 다시 시도해 주세요" 토스트', (await page.getByText('잠시 후 다시 시도해 주세요').count()) > 0);
      check(P, '가짜 성공 화면 없음', (await page.getByText('구독 신청이 접수되었습니다').count()) === 0);
      const leaked = await subsByPhone([RUN_PHONE, hyphen(RUN_PHONE)]);
      check(P, '503 시 DB 에 구독자 행 생성 안 됨', leaked.length === 0, `rows=${leaked.length}`);
      await shot(page, 'p2_03_subscribe_503.png');
    });

    await test.step('2-5 [@needs-migration] 신청 payload 계약 + 접수 화면(이메일 없음 안내) — route mock', async () => {
      let payload: any = null;
      await page.route('**/api/public/magazine/subscribe', async (route) => {
        payload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            status: 'pending',
            pendingReason: 'NO_EMAIL_CONFIRM_CHANNEL',
            message:
              '구독 신청이 접수되었습니다. 다만 이메일 주소가 없어 확인 링크를 보내드릴 수 없으며, 구독 확인이 끝나기 전에는 매거진이 발송되지 않습니다. 이메일 주소를 함께 입력해 다시 신청해 주세요.',
          }),
        });
      });
      const phone = page.locator('#sub-phone');
      await phone.fill('');
      await phone.pressSequentially(PH.form, { delay: 10 });
      await page.locator('#sub-name').fill('E2E_TUT2_고객');
      for (const id of ['sub-page-privacy', 'sub-page-marketing', 'sub-page-age14']) {
        if (!(await page.locator(`#${id}`).isChecked())) await page.locator(`#${id}`).check();
      }
      await page.getByRole('button', { name: /무료 구독하기/ }).click();
      await expect.soft(page.getByRole('status').filter({ hasText: '구독 신청이 접수되었습니다' })).toBeVisible({ timeout: 10_000 });
      check(P, 'payload.brokerId = 슬러그', payload?.brokerId === SLUG, `brokerId=${payload?.brokerId}`);
      check(P, 'payload.phone = 숫자만', payload?.phone === PH.form, `phone=${payload?.phone}`);
      check(P, 'payload.channel = kakao (이메일 없음)', payload?.channel === 'kakao', `channel=${payload?.channel}`);
      check(P, 'payload.source = qr_card (기본)', payload?.source === 'qr_card', `source=${payload?.source}`);
      const tags: string[] = payload?.tags || [];
      check(P, 'payload.tags 에 선택 칩 포함', tags.includes('강남·서초') && tags.includes('꼬마빌딩'), JSON.stringify(tags));
      const c = payload?.consent || {};
      check(P, 'payload.consent = 필수 3종 true · 야간 false', c.privacy === true && c.marketing === true && c.age14 === true && c.night === false, JSON.stringify(c));
      check(P, '접수 화면: 이메일 없음 → 수신 미시작 안내', (await page.getByText(/이메일을 입력하지 않으면 확인 링크를 보낼 수 없어/).count()) > 0);
      check(P, '접수 화면: "최근 매거진 열람하기" 링크', (await page.getByRole('link', { name: /최근 매거진 열람하기/ }).count()) > 0);
      await page.getByRole('status').filter({ hasText: '구독 신청이 접수되었습니다' }).first().scrollIntoViewIfNeeded();
      await shot(page, 'p2_04_subscribe_pending.png');
      await page.unroute('**/api/public/magazine/subscribe');
    });

    await test.step('2-6 이메일 확인 링크 화면(GET 은 상태 변경 없음)', async () => {
      const t = crypto.randomBytes(32).toString('base64url');
      const res = await page.goto(`/api/public/magazine/confirm?t=${t}&b=${SLUG}`);
      check(P, '확인 화면 200', res?.status() === 200, `status=${res?.status()}`);
      check(P, '"구독 확인하기" 버튼', (await page.getByRole('button', { name: '구독 확인하기' }).count()) === 1);
      await shot(page, 'p2_05_confirm_page.png');
      const bad = await request.get(`/api/public/magazine/confirm?t=short&b=${SLUG}`);
      check(P, '형식 오류 링크 → 400', bad.status() === 400, `status=${bad.status()}`);
    });

    await test.step('2-7 API 방어: 동의 누락 400 / 없는 중개사 404', async () => {
      const h = { 'x-forwarded-for': RUN_IP };
      const noConsent = await request.post('/api/public/magazine/subscribe', {
        headers: h,
        data: { brokerId: SLUG, phone: RUN_PHONE, channel: 'kakao', source: 'qr_card', consent: { privacy: true, marketing: false, age14: true } },
      });
      check(P, '필수 동의 누락 → 400', noConsent.status() === 400, `status=${noConsent.status()}`);
      const noBroker = await request.post('/api/public/magazine/subscribe', {
        headers: h,
        data: { brokerId: NONEXIST_SLUG, phone: RUN_PHONE, channel: 'kakao', source: 'qr_card', consent: { privacy: true, marketing: true, age14: true } },
      });
      check(P, '없는 중개사 → 404', noBroker.status() === 404, `status=${noBroker.status()}`);
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 3: 명함용 QR 코드 만들기 (브로커 에디터)
  // ═════════════════════════════════════════════════════════════════════
  test('실습3: 명함용 QR 코드 만들기', async ({ browser }) => {
    test.setTimeout(240_000);
    const P = '실습3';
    const ctx = await desktopContext(browser);
    const page = await ctx.newPage();
    watch(page, 'editor-qr');

    await test.step('3-1 매거진 에디터 → 아웃리치 탭 → 구독자 관리', async () => {
      await openOutreach(page);
      check(P, '"구독자 관리" 탭 선택됨', (await page.getByRole('tab', { name: '구독자 관리' }).getAttribute('aria-selected')) === 'true');
      const sendOff = await page.getByRole('status').filter({ hasText: '현재 발송 기능이 꺼져 있어요' }).count();
      note(P, '발송 꺼짐 안내 노출', `count=${sendOff}`);
      await shot(page, 'p2_06_outreach_tab_1440.png');
    });

    await test.step('3-2 "QR 코드" → 오프라인 구독 QR 코드 팝업', async () => {
      await page.getByRole('button', { name: 'QR 코드' }).click();
      const dlg = page.getByRole('dialog', { name: '오프라인 구독 QR 코드' });
      await expect.soft(dlg).toBeVisible({ timeout: 15_000 });
      const url = (await dlg.locator('p.font-mono').first().innerText().catch(() => '')).trim();
      check(P, 'QR 주소 = {사이트}/magazine/내슬러그/subscribe?source=qr_card', /^https?:\/\/[^/]+\/magazine\/test-broker-kim\/subscribe\?source=qr_card$/.test(url), `qrUrl=${url}`);
      note(P, 'QR 주소 도메인', `${url} (NEXT_PUBLIC_SITE_URL 기준 — 운영은 credeal.net)`);
      await shot(page, 'p2_07_qr_modal_1440.png');
    });

    await test.step('3-3 "인쇄용 QR (8cm · 300DPI)" 다운로드', async () => {
      const dlg = page.getByRole('dialog', { name: '오프라인 구독 QR 코드' });
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        dlg.getByRole('button', { name: /인쇄용 QR/ }).click(),
      ]);
      const f = path.join(SHOT_DIR, 'p2_qr_download.png');
      await dl.saveAs(f);
      const buf = fs.readFileSync(f);
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const phys = buf.indexOf(Buffer.from('pHYs'));
      const dpi = phys > 0 ? Math.round(buf.readUInt32BE(phys + 4) * 0.0254) : null;
      check(P, 'PNG 파일', buf.slice(1, 4).toString() === 'PNG', `file=${dl.suggestedFilename()}`);
      check(P, '파일명 CREDEAL_매거진구독_QR_{slug}_8cm_300dpi.png', dl.suggestedFilename() === `CREDEAL_매거진구독_QR_${SLUG}_8cm_300dpi.png`, dl.suggestedFilename());
      check(P, '2400px 정사각형', w === 2400 && h === 2400, `${w}x${h}`);
      check(P, 'pHYs 300DPI', dpi === 300, `dpi=${dpi}`);
    });

    await test.step('3-4 닫기·링크 복사 클릭 가능, Esc 로 닫힘', async () => {
      const dlg = page.getByRole('dialog', { name: '오프라인 구독 QR 코드' });
      check(P, '"닫기" 클릭 가능', (await obstruct(dlg.getByRole('button', { name: '닫기' }).first())) === 'clickable');
      const copyBtn = dlg.getByRole('button', { name: /구독 링크 복사/ });
      check(P, '"구독 링크 복사" 클릭 가능', (await obstruct(copyBtn)) === 'clickable');
      await copyBtn.click();
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check(P, '복사된 링크 = QR 주소', clip.endsWith(`/magazine/${SLUG}/subscribe?source=qr_card`), `clipboard=${clip}`);
      await page.keyboard.press('Escape');
      await expect.soft(dlg).toHaveCount(0, { timeout: 5_000 });
      check(P, 'Esc 로 팝업 닫힘', (await dlg.count()) === 0);
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 4: 구독자 직접 추가하고 관리하기
  // ═════════════════════════════════════════════════════════════════════
  test('실습4: 구독자 직접 추가하고 관리하기', async ({ browser }) => {
    test.setTimeout(240_000);
    const P = '실습4';
    const ctx = await desktopContext(browser);
    const page = await ctx.newPage();
    watch(page, 'editor-subs');
    await openOutreach(page);

    await test.step('4-1 필터: 상태(수신 중/일시정지/수신거부)·매수 온도·채널', async () => {
      const status = page.getByRole('group', { name: '구독 상태 필터' }).getByRole('button');
      check(P, '상태 필터 = 수신 중·일시정지·수신거부', JSON.stringify(await status.allInnerTexts()) === JSON.stringify(['수신 중', '일시정지', '수신거부']), JSON.stringify(await status.allInnerTexts()));
      const temp = await page.getByRole('group', { name: '매수 온도 필터' }).getByRole('button').allInnerTexts();
      check(P, '매수 온도 필터 5종', temp.length === 5 && temp.some((t) => t.includes('적극검토')) && temp.some((t) => t.includes('미확인')), JSON.stringify(temp));
      const ch = await page.getByRole('group', { name: '수신 채널 필터' }).getByRole('button').allInnerTexts();
      note(P, '채널 필터 라벨', JSON.stringify(ch));
    });

    await test.step('4-2 "+ 추가" → 새 구독자 추가(동의 확인 필수)', async () => {
      await page.getByRole('button', { name: '추가', exact: true }).click();
      const dlg = page.getByRole('dialog', { name: '새 구독자 추가' });
      await expect.soft(dlg).toBeVisible();
      check(P, '안내 "수신 동의를 받은 고객만 추가할 수 있어요."', (await dlg.getByText('수신 동의를 받은 고객만 추가할 수 있어요.').count()) > 0);
      await dlg.getByLabel(/^이름/).fill(NAME.manual);
      const ph = dlg.getByLabel(/휴대폰 번호/);
      await ph.pressSequentially(PH.manual, { delay: 10 });
      check(P, '휴대폰 자동 하이픈', (await ph.inputValue()) === hyphen(PH.manual), await ph.inputValue());
      const radios = await dlg.getByRole('radiogroup', { name: '수신 채널' }).getByRole('radio').allInnerTexts();
      check(P, '수신 채널 = 카카오톡·이메일·둘 다', JSON.stringify(radios.map((r) => r.trim())) === JSON.stringify(['카카오톡', '이메일', '둘 다']), JSON.stringify(radios));
      await dlg.getByRole('radio', { name: '둘 다' }).click();
      await dlg.getByRole('button', { name: '구독자 추가' }).click();
      check(P, '둘 다 + 이메일 없음 → 이메일 필요 오류', (await dlg.getByText('이메일 수신을 선택하면 이메일 주소가 필요해요.').count()) > 0);
      check(P, '동의 미체크 → 오류', (await dlg.getByText('수신 동의 확인에 체크해 주세요.').count()) > 0);
      await dlg.getByRole('radio', { name: '카카오톡' }).click();
      // 채널을 카카오톡으로 되돌리면 이메일 요구 오류는 더 이상 유효하지 않으므로 사라져야 한다(제품 기대).
      const staleEmailErr = await dlg.getByText('이메일 수신을 선택하면 이메일 주소가 필요해요.').count();
      check(P, '카카오톡으로 되돌리면 이메일 필요 오류 해제', staleEmailErr === 0, `staleEmailErrorCount=${staleEmailErr} (AddSubscriberForm set()은 같은 키 오류만 지움)`);
      if (staleEmailErr) {
        // 캡처용 정상 상태 복원(테스트 조작): 이메일 칸 입력 이벤트로 오류를 지운 뒤 다시 비운다.
        const em = dlg.locator('input[type="email"]');
        await em.fill('x');
        await em.fill('');
      }
      await dlg.getByLabel('고객이 수신에 동의했음을 확인합니다').check();
      await shot(page, 'p2_08_add_subscriber_1440.png');
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/broker/magazine/subscribers') && r.request().method() === 'POST', { timeout: 30_000 }),
        dlg.getByRole('button', { name: '구독자 추가' }).click(),
      ]);
      const body = await resp.json().catch(() => ({}));
      check(P, '추가 API 201', resp.status() === 201, `status=${resp.status()} consentRecorded=${body?.consentRecorded}`);
      if (body?.consentRecorded === false) {
        check(P, '[@needs-migration] 동의 기록 미저장 사실을 안내', (await page.getByText(/동의 기록 저장 기능이 아직 준비되지 않아/).count()) > 0);
      }
      await expect.soft(page.getByRole('list', { name: '구독자 목록' }).getByText(NAME.manual)).toBeVisible({ timeout: 15_000 });
    });

    await test.step('4-3 검색으로 찾기', async () => {
      await page.getByPlaceholder('이름, 전화번호, 이메일 검색...').fill('E2E_TUT2_수동');
      await expect.soft(page.getByText(/총 \d+명 중 1명 표시/)).toBeVisible({ timeout: 5_000 });
      check(P, '검색 결과 1명', (await page.getByText(/총 \d+명 중 1명 표시/).count()) === 1);
    });

    await test.step('4-4 구독자 상세: 관심 태그 저장·열람 이력', async () => {
      await page.getByRole('list', { name: '구독자 목록' }).getByRole('button').filter({ hasText: NAME.manual }).click();
      const dlg = page.getByRole('dialog', { name: '구독자 상세' });
      await expect.soft(dlg).toBeVisible();
      await dlg.getByRole('button', { name: '관심 권역 강남·서초 추가' }).click();
      await dlg.getByRole('button', { name: '자산 유형 꼬마빌딩 추가' }).click();
      const [patch] = await Promise.all([
        page.waitForResponse((r) => /\/api\/broker\/magazine\/subscribers\/[^/?]+$/.test(r.url().split('?')[0]) && r.request().method() === 'PATCH', { timeout: 20_000 }),
        dlg.getByRole('button', { name: '변경사항 저장' }).click(),
      ]);
      check(P, '태그 저장 PATCH 200', patch.status() === 200, `status=${patch.status()}`);
      await expect.soft(dlg.getByText('변경사항을 저장했어요.')).toBeVisible({ timeout: 10_000 });
      const { data: row } = await sb.from('magazine_subscribers').select('interest_profile').eq('subscriber_name', NAME.manual).maybeSingle();
      const tags = (row?.interest_profile as any)?.tags || {};
      check(P, 'DB interest_profile.tags 반영', (tags.regions || []).includes('강남·서초') && (tags.assetTypes || []).includes('꼬마빌딩'), JSON.stringify(tags));
      check(P, '"열람 이력 (최근 30일)" 섹션', (await dlg.getByText('열람 이력').count()) > 0);
      await dlg.getByText('관심 권역').first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, 'p2_09_subscriber_detail_1440.png');
      await page.keyboard.press('Escape');
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 5: 매거진 독자가 동료에게 구독 링크 전달
  // ═════════════════════════════════════════════════════════════════════
  test('실습5: 동료에게 구독 링크 전달하기', async ({ browser }) => {
    test.setTimeout(180_000);
    const P = '실습5';
    test.skip(!LATEST_DATE, '최근 발행일 없음');
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'viewer-forward');
    const res = await page.goto(`/magazine/${SLUG}/${LATEST_DATE}`, { waitUntil: 'networkidle' });

    await test.step('5-1 매거진 하단 "동료에게 구독 링크 전달하기"', async () => {
      check(P, '뷰어 200', res?.status() === 200, `status=${res?.status()} date=${LATEST_DATE}`);
      const h2 = page.getByRole('heading', { name: '동료에게 구독 링크 전달하기' });
      await h2.scrollIntoViewIfNeeded({ timeout: 20_000 }).catch(() => {});
      check(P, '전달하기 섹션 노출', await h2.isVisible().catch(() => false));
      check(P, '"💬 전달하기"·"링크 복사" 버튼', (await page.getByRole('button', { name: /전달하기$/ }).count()) > 0 && (await page.getByRole('button', { name: '링크 복사' }).count()) > 0);
      const fake = await page.getByText(/명이 구독|추천 보상|리워드|마일스톤|명 달성/).count();
      check(P, '가짜 카운터·보상 문구 없음', fake === 0, `count=${fake}`);
    });

    await test.step('5-2 "링크 복사" → 구독 페이지 주소(?ref=forward)', async () => {
      await page.getByRole('button', { name: '링크 복사' }).click();
      await expect.soft(page.getByRole('button', { name: /복사완료/ })).toBeVisible({ timeout: 5_000 });
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check(P, '복사 링크 = /magazine/내슬러그/subscribe?ref=forward', /\/magazine\/test-broker-kim\/subscribe\?ref=forward$/.test(clip), `clipboard=${clip}`);
      await page.getByRole('heading', { name: '동료에게 구독 링크 전달하기' }).scrollIntoViewIfNeeded();
      await shot(page, 'p2_10_forward_section.png');
    });

    await test.step('5-3 전달받은 링크로 열면 구독 페이지 + 출처 기록(route mock)', async () => {
      const p2 = await ctx.newPage();
      let payload: any = null;
      await p2.route('**/api/public/magazine/subscribe', async (route) => {
        payload = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'pending', message: '구독 신청이 접수되었습니다. 본인 확인이 끝나면 매거진을 받아보실 수 있습니다.' }) });
      });
      const r = await p2.goto(`/magazine/${SLUG}/subscribe?ref=forward`, { waitUntil: 'networkidle' });
      check(P, '전달 링크 → 구독 페이지 200', r?.status() === 200);
      await p2.locator('#sub-phone').pressSequentially(PH.form, { delay: 10 });
      for (const id of ['sub-page-privacy', 'sub-page-marketing', 'sub-page-age14']) await p2.locator(`#${id}`).check();
      await p2.getByRole('button', { name: /무료 구독하기/ }).click();
      await expect.soft(p2.getByRole('status').filter({ hasText: '구독 신청이 접수되었습니다' })).toBeVisible({ timeout: 10_000 });
      check(P, 'payload.referrer = forward', payload?.referrer === 'forward', `referrer=${payload?.referrer} source=${payload?.source}`);
      note(P, '전달 링크 신청의 source', `source=${payload?.source} (ref=forward 이지만 source 는 기본값)`);
      await p2.close();
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 6: 매거진 안의 구독 카드 (채널 선택)
  // ═════════════════════════════════════════════════════════════════════
  test('실습6: 매거진 안 구독 카드로 신청 @needs-migration', async ({ browser }) => {
    test.setTimeout(180_000);
    const P = '실습6';
    test.info().annotations.push({ type: 'needs-migration', description: '구독 위젯 실 신청은 동의 컬럼 적용 후 — 현재 payload 계약(mock)만' });
    test.skip(!LATEST_DATE, '최근 발행일 없음');
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'viewer-subscribe-card');
    await page.goto(`/magazine/${SLUG}/${LATEST_DATE}`, { waitUntil: 'networkidle' });
    const cardHeading = page.getByRole('heading', { name: /주간 매거진 구독하기/ });
    const card = cardHeading.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');

    await test.step('6-1 "📰 주간 매거진 구독하기" 카드 · 채널 토글', async () => {
      await cardHeading.scrollIntoViewIfNeeded({ timeout: 20_000 }).catch(() => {});
      check(P, '구독 카드 노출', await cardHeading.isVisible().catch(() => false));
      const toggles = card.getByRole('group', { name: '수신 채널' }).getByRole('button');
      check(P, '채널 토글 = 카카오톡·이메일·둘 다', JSON.stringify(await toggles.allInnerTexts()) === JSON.stringify(['카카오톡', '이메일', '둘 다']), JSON.stringify(await toggles.allInnerTexts()));
      check(P, '기본 = 카카오톡(전화 칸만)', (await card.getByPlaceholder('휴대폰 번호 (010-0000-0000 형식)').count()) === 1 && (await card.getByPlaceholder('이메일 주소').count()) === 0);
      await card.getByRole('button', { name: '이메일', exact: true }).click();
      check(P, '이메일 → 이메일 칸만 · CTA "이메일로 받기"', (await card.getByPlaceholder('이메일 주소').count()) === 1 && (await card.getByPlaceholder(/휴대폰 번호/).count()) === 0 && (await card.getByRole('button', { name: '이메일로 받기' }).count()) === 1);
      await card.getByRole('button', { name: '둘 다' }).click();
      check(P, '둘 다 → 전화+이메일 · CTA "카톡·이메일로 받기"', (await card.getByPlaceholder('이메일 주소').count()) === 1 && (await card.getByPlaceholder(/휴대폰 번호/).count()) === 1 && (await card.getByRole('button', { name: '카톡·이메일로 받기' }).count()) === 1);
      check(P, '동의 전 CTA 비활성', await card.getByRole('button', { name: '카톡·이메일로 받기' }).isDisabled());
      check(P, '구독 CTA 가 하단 바에 가려지지 않음(390)', (await obstruct(card.getByRole('button', { name: '카톡·이메일로 받기' }))) === 'clickable');
      await cardHeading.scrollIntoViewIfNeeded();
      await shot(page, 'p2_11_viewer_subscribe_card.png');
    });

    await test.step('6-1b 하단 바 ↔ 구독 위젯·본문 겹침 (390x844 / 360x740)', async () => {
      const hits390 = await bottomBarOverlap(page);
      check(P, '390x844 페이지 끝에서 하단 바가 본문 조작 요소를 가리지 않음', hits390.length === 0, JSON.stringify(hits390).slice(0, 300));
      const small = await mobileContext(browser, { w: 360, h: 740 });
      const sp = await small.newPage();
      watch(sp, 'viewer-360');
      await sp.goto(`/magazine/${SLUG}/${LATEST_DATE}`, { waitUntil: 'networkidle' });
      const ov = await sp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(P, '360px 뷰어 가로 오버플로 없음', ov <= 0, `overflow=${ov}px`);
      const h360 = sp.getByRole('heading', { name: /주간 매거진 구독하기/ });
      const c360 = h360.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
      await h360.scrollIntoViewIfNeeded({ timeout: 20_000 }).catch(() => {});
      check(P, '구독 CTA 가 하단 바에 가려지지 않음(360)', (await obstruct(c360.getByRole('button', { name: '카카오톡으로 받기' }))) === 'clickable');
      const hits360 = await bottomBarOverlap(sp);
      check(P, '360x740 페이지 끝에서 하단 바가 본문 조작 요소를 가리지 않음', hits360.length === 0, JSON.stringify(hits360).slice(0, 300));
      await small.close();
    });

    await test.step('6-2 [@needs-migration] payload 계약(route mock)', async () => {
      let payload: any = null;
      await page.route('**/api/public/magazine/subscribe', async (route) => {
        payload = route.request().postDataJSON();
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, status: 'pending', message: '구독 신청이 접수되었습니다. 보내드린 확인 링크를 눌러 구독을 완료해 주세요.' }) });
      });
      await card.getByPlaceholder(/휴대폰 번호/).pressSequentially(PH.form, { delay: 10 });
      await card.getByPlaceholder('이메일 주소').fill('e2e-tut2+card@credeal.test');
      for (const k of ['privacy', 'marketing', 'age14']) await page.locator(`#sc-magazine-${k}`).check();
      await card.getByRole('button', { name: '카톡·이메일로 받기' }).click();
      await expect.soft(page.getByText('구독 신청이 접수되었습니다. 확인 후 발송이 시작됩니다.', { exact: false })).toBeVisible({ timeout: 10_000 });
      check(P, 'payload.channel = both', payload?.channel === 'both', `channel=${payload?.channel}`);
      check(P, 'payload.phone 숫자 · email', payload?.phone === PH.form && payload?.email === 'e2e-tut2+card@credeal.test', `phone=${payload?.phone} email=${payload?.email}`);
      check(P, 'payload.source = magazine', payload?.source === 'magazine', `source=${payload?.source}`);
      const c = payload?.consent || {};
      check(P, 'payload.consent 필수 3종', c.privacy === true && c.marketing === true && c.age14 === true, JSON.stringify(c));
      check(P, '접수 문구 "확인 후 발송이 시작됩니다"', (await page.getByText(/확인 후 발송이 시작됩니다/).count()) > 0);
      await page.unroute('**/api/public/magazine/subscribe');
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 7: 지난 호 모아보기(아카이브)
  // ═════════════════════════════════════════════════════════════════════
  test('실습7: 지난 호 모아보기(아카이브)', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const P = '실습7';
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'archive');

    await test.step('7-1 /magazine/내슬러그 → 주간 매거진 아카이브', async () => {
      const res = await page.goto(`/magazine/${SLUG}`, { waitUntil: 'networkidle' });
      check(P, '아카이브 200', res?.status() === 200, `status=${res?.status()}`);
      check(P, '제목 "주간 매거진 아카이브"', (await page.getByText('주간 매거진 아카이브').count()) > 0);
      const viewCount = await page.getByText(/조회\s*\d|\d+\s*회 조회/).count();
      check(P, '조회수 노출 없음', viewCount === 0, `count=${viewCount}`);
      await shot(page, 'p2_12_archive.png');
    });

    await test.step('7-2 발행된 호 카드 ≥ 1 (랜딩 "최근 발행" 과 일치)', async () => {
      const cards = page.locator(`main a[href*="/magazine/${SLUG}/20"]`);
      const n = await cards.count();
      const empty = await page.getByText('아직 발행된 매거진이 없습니다').count();
      check(P, '아카이브 카드 ≥ 1', n >= 1, `cards=${n} emptyState=${empty} landingLatest=${LATEST_DATE}`);
      if (LATEST_DATE) {
        const hasLatest = await page.locator(`main a[href$="/magazine/${SLUG}/${LATEST_DATE}"]`).count();
        check(P, '랜딩 최근 발행일이 아카이브에 존재', hasLatest > 0, `latest=${LATEST_DATE} found=${hasLatest}`);
      }
      const r404 = await request.get(`/magazine/${NONEXIST_SLUG}`);
      const b404 = await r404.text();
      check(P, '없는 슬러그 아카이브 → HTTP 404', r404.status() === 404, `status=${r404.status()} (loading.tsx 스트리밍이면 200)`);
      check(P, '없는 슬러그 아카이브 → noindex', /<meta[^>]*name="robots"[^>]*noindex/.test(b404));
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 8: 수신거부(해지) 흐름 확인
  // ═════════════════════════════════════════════════════════════════════
  test('실습8: 수신거부 흐름 확인', async ({ browser, request }) => {
    test.setTimeout(240_000);
    const P = '실습8';
    // 내가 만든 테스트 구독자만 사용
    const ins = await sb
      .from('magazine_subscribers')
      .insert([
        { broker_id: SLUG, subscriber_name: NAME.unsub, subscriber_phone: PH.unsub, channel: 'kakao', status: 'active', source: 'manual' },
        { broker_id: SLUG, subscriber_name: NAME.oneClick, subscriber_phone: PH.oneClick, channel: 'kakao', status: 'active', source: 'manual' },
      ])
      .select('id, subscriber_name');
    check(P, '테스트 구독자 2명 생성(E2E_TUT2)', !ins.error && (ins.data || []).length === 2, ins.error?.message || '');
    const sid = (ins.data || []).find((r: any) => r.subscriber_name === NAME.unsub)?.id as string;
    const sid2 = (ins.data || []).find((r: any) => r.subscriber_name === NAME.oneClick)?.id as string;
    const statusOf = async (id: string) => (await sb.from('magazine_subscribers').select('status').eq('id', id).maybeSingle()).data?.status;

    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'unsubscribe');

    await test.step('8-1 메시지의 수신거부 링크 → 확인 화면(아직 해지 안 됨)', async () => {
      const res = await page.goto(`/api/public/magazine/unsubscribe?t=${unsubTokenV2(sid, SLUG)}`);
      check(P, '확인 화면 200', res?.status() === 200, `status=${res?.status()}`);
      check(P, 'h1 "매거진 수신 거부"', (await page.getByRole('heading', { name: '매거진 수신 거부' }).count()) === 1);
      const brand = (await page.locator('p.brand').innerText().catch(() => '')).trim();
      check(P, '중개사 표시 "{이름} 매거진"', brand.endsWith(' 매거진') && !brand.includes(SLUG), `brand="${brand}"`);
      const btn = page.getByRole('button', { name: '수신 거부하기' });
      const box = await btn.boundingBox();
      check(P, '"수신 거부하기" 버튼 ≥ 44px', !!box && box.height >= 44, `h=${box?.height}`);
      check(P, 'GET 만으로 상태 변경 없음(active)', (await statusOf(sid)) === 'active', `status=${await statusOf(sid)}`);
      await shot(page, 'p2_13_unsubscribe_confirm.png');
    });

    await test.step('8-2 "수신 거부하기" → 완료 화면 + DB 해지', async () => {
      await page.getByRole('button', { name: '수신 거부하기' }).click();
      await expect.soft(page.getByText('수신 거부가 완료되었습니다').first()).toBeVisible({ timeout: 15_000 });
      check(P, '완료 문구 "수신 거부가 완료되었습니다"', (await page.getByText('수신 거부가 완료되었습니다').count()) > 0);
      check(P, 'DB status = unsubscribed', (await statusOf(sid)) === 'unsubscribed', `status=${await statusOf(sid)}`);
      await shot(page, 'p2_14_unsubscribe_done.png');
    });

    await test.step('8-3 위조·구형·만료·다른 중개사 링크 거부', async () => {
      const good = unsubTokenV2(sid2, SLUG);
      const forged = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
      const r1 = await request.get(`/api/public/magazine/unsubscribe?t=${forged}`);
      check(P, '위조 서명 → 400', r1.status() === 400, `status=${r1.status()}`);
      const legacySig = crypto.createHmac('sha256', 'x').update(sid2 + SLUG).digest('hex');
      const r2 = await request.get(`/api/public/magazine/unsubscribe?token=${sid2}.${SLUG}.${legacySig}`);
      check(P, '구형(v1) 링크 → 400', r2.status() === 400, `status=${r2.status()}`);
      const r3 = await request.get(`/api/public/magazine/unsubscribe?t=${unsubTokenV2(sid2, SLUG, Math.floor(Date.now() / 1000) - 60)}`);
      check(P, '만료 링크 → 410', r3.status() === 410, `status=${r3.status()}`);
      const r4 = await request.post('/api/public/magazine/unsubscribe', { form: { t: unsubTokenV2(sid2, 'e2e-tut2-other') } });
      check(P, '다른 중개사 바인딩 → 400', r4.status() === 400, `status=${r4.status()}`);
      check(P, '거부된 요청 후에도 active 유지', (await statusOf(sid2)) === 'active', `status=${await statusOf(sid2)}`);
    });

    await test.step('8-4 메일 앱 원클릭 수신거부(List-Unsubscribe-Post)', async () => {
      const r = await request.post(`/api/public/magazine/unsubscribe?t=${unsubTokenV2(sid2, SLUG)}`, { form: { 'List-Unsubscribe': 'One-Click' } });
      check(P, 'One-Click POST 200', r.status() === 200, `status=${r.status()}`);
      check(P, 'One-Click → DB unsubscribed', (await statusOf(sid2)) === 'unsubscribed', `status=${await statusOf(sid2)}`);
    });

    await test.step('8-5 에디터: 해지자는 "수신 중" 목록에서 빠지고 "수신거부" 필터에 표시', async () => {
      const ectx = await desktopContext(browser);
      const ep = await ectx.newPage();
      watch(ep, 'editor-unsub');
      await openOutreach(ep);
      const list = ep.getByRole('list', { name: '구독자 목록' });
      check(P, '"수신 중" 목록에 해지자 없음', (await list.getByText(NAME.unsub).count()) === 0);
      await ep.getByRole('group', { name: '구독 상태 필터' }).getByRole('button', { name: '수신거부' }).click();
      await expect.soft(list.getByText(NAME.unsub)).toBeVisible({ timeout: 20_000 });
      const row = list.getByRole('button').filter({ hasText: NAME.unsub });
      const rowN = await row.count();
      const rowText = rowN ? (await row.first().innerText()).replace(/\s+/g, ' ') : '';
      const listN = await list.getByRole('button').count();
      const countText = await ep.getByText(/총 \d+명 중 \d+명 표시/).innerText().catch(() => '');
      check(P, '"수신거부" 필터에 해지자 + 배지', rowN === 1 && /수신거부/.test(rowText), `rows=${rowN} text="${rowText}" listButtons=${listN} ${countText}`);
      await ep.getByPlaceholder('이름, 전화번호, 이메일 검색...').fill('E2E_TUT2');
      await shot(ep, 'p2_15_editor_unsubscribed_filter_1440.png');
      await ectx.close();
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 9: 매거진 카카오톡 공유
  // ═════════════════════════════════════════════════════════════════════
  test('실습9: 매거진 카카오톡 공유', async ({ browser, request }) => {
    test.setTimeout(180_000);
    const P = '실습9';
    test.skip(!LATEST_DATE, '최근 발행일 없음');
    const ctx = await mobileContext(browser);
    const page = await ctx.newPage();
    watch(page, 'viewer-share');
    await page.goto(`/magazine/${SLUG}/${LATEST_DATE}`, { waitUntil: 'networkidle' });

    await test.step('9-1 하단 바 "공유" → 선택 단계 없이 카카오톡 공유 창', async () => {
      const bar = page.getByRole('navigation', { name: '상담·공유 바로가기' }).or(page.locator('[aria-label="상담·공유 바로가기"]')).first();
      check(P, '하단 바 노출', await bar.isVisible().catch(() => false));
      await page.waitForFunction(() => !!(window as any).Kakao, null, { timeout: 15_000 }).catch(() => {});
      await shot(page, 'p2_16_viewer_share_bar.png');
      await bar.getByRole('button', { name: /공유/ }).click();
      await page.waitForFunction(() => !!(window as any).__kakaoShare, null, { timeout: 10_000 }).catch(() => {});
      const payload: any = await page.evaluate(() => (window as any).__kakaoShare || null);
      check(P, '카카오 sendDefault 호출(feed)', payload?.objectType === 'feed', JSON.stringify(payload)?.slice(0, 200));
      const { data: bp } = await sb.from('broker_profiles').select('name').eq('slug', SLUG).maybeSingle();
      const viewerName = (await page.locator('header[data-section-id="cover"] p.font-bold').first().innerText().catch(() => '')).trim();
      check(P, '제목 "[이름] 주간 부동산 AI 매거진" (이름 = 구독 페이지와 같은 프로필 이름)', payload?.content?.title === `[${bp?.name}] 주간 부동산 AI 매거진`, `title=${payload?.content?.title} profile=${bp?.name} viewerHeader=${viewerName}`);
      const nested = await page.evaluate(() => Array.from(document.querySelectorAll('button button')).map((b) => `outer="${((b.parentElement?.closest('button') as HTMLElement | null)?.innerText || '').replace(/\s+/g, ' ').slice(0, 30)}" inner="${(b as HTMLElement).innerText.slice(0, 20)}"`));
      check(P, '뷰어에 중첩 <button> 없음(하이드레이션 오류)', nested.length === 0, JSON.stringify(nested).slice(0, 200));
      check(P, '버튼 "매거진 열람"', payload?.buttons?.[0]?.title === '매거진 열람', payload?.buttons?.[0]?.title);
      const img: string = payload?.content?.imageUrl || '';
      check(P, '썸네일 = /api/og/magazine?brokerId=&date=', img.includes(`/api/og/magazine?brokerId=${SLUG}&date=${LATEST_DATE}`), img);
      if (img) {
        const u = new URL(img);
        const r = await request.get(`${u.pathname}${u.search}`);
        check(P, '썸네일 이미지 200 image/*', r.status() === 200 && (r.headers()['content-type'] || '').startsWith('image/'), `status=${r.status()} type=${r.headers()['content-type']}`);
      }
      const choice = await page.getByRole('dialog').count();
      check(P, '공유 방식 선택 단계 없음', choice === 0, `dialogs=${choice}`);
    });

    await test.step('9-2 링크 미리보기(og:image)', async () => {
      const og = await page.locator('meta[property="og:image"]').first().getAttribute('content').catch(() => null);
      check(P, 'og:image 메타 존재', !!og, `og=${og}`);
      if (og) {
        const u = new URL(og, BASE);
        const r = await request.get(`${u.pathname}${u.search}`);
        check(P, 'og:image 200 image/*', r.status() === 200 && (r.headers()['content-type'] || '').startsWith('image/'), `status=${r.status()} ${u.pathname}${u.search}`);
      }
    });
    await ctx.close();
  });

  // ═════════════════════════════════════════════════════════════════════
  // 실습 10: 딜카드에서 속보 매거진 발행(발송은 기본 꺼짐)
  // ═════════════════════════════════════════════════════════════════════
  test('실습10: 딜카드에서 속보 매거진 발행', async ({ browser }) => {
    test.setTimeout(240_000);
    const P = '실습10';
    const ctx = await desktopContext(browser);
    const page = await ctx.newPage();
    watch(page, 'special');

    await test.step('10-1 딜카드 ⋮(더 보기) → "⚡ 속보 매거진 발행"', async () => {
      await page.goto(`/broker/deal-card/${OWNED_BUILDING}`, { waitUntil: 'domcontentloaded' });
      const more = page.getByRole('button', { name: '더 보기' });
      await more.waitFor({ state: 'visible', timeout: 120_000 });
      const [getResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/broker/magazine/special') && r.request().method() === 'GET', { timeout: 60_000 }),
        (async () => {
          await more.click();
          await page.getByRole('menuitem', { name: /속보 매거진 발행/ }).click();
        })(),
      ]);
      check(P, '대상 미리보기 GET 200', getResp.status() === 200, `status=${getResp.status()}`);
      const dlg = page.getByRole('dialog', { name: '속보 매거진 발행' });
      await expect.soft(dlg).toBeVisible();
      await expect.soft(dlg.getByText('발송 대상 미리보기')).toBeVisible({ timeout: 20_000 });
      const tiles = await dlg.locator('dt').allInnerTexts();
      check(P, '대상 4칸 = 전체 구독자·매칭 대상·핫리드·태그 없음', ['전체 구독자', '매칭 대상', '핫리드', '태그 없음'].every((l) => tiles.some((t) => t.includes(l))), JSON.stringify(tiles));
      const distribute = dlg.getByRole('checkbox', { name: /매칭 구독자 \d+명에게 발송/ });
      check(P, '"발행과 함께 … 발송" 기본 꺼짐', (await distribute.count()) === 1 && !(await distribute.isChecked()));
      check(P, '버튼 "속보 발행"(발송 아님)', (await dlg.getByRole('button', { name: '속보 발행', exact: true }).count()) === 1);
      await shot(page, 'p2_17_special_modal_1440.png');
      await distribute.check();
      check(P, '발송 켜면 버튼 "속보 발행 및 발송"', (await dlg.getByRole('button', { name: '속보 발행 및 발송' }).count()) === 1);
      await distribute.uncheck();
    });

    await test.step('10-2 "속보 발행" → payload 계약(route mock, 발송 없음)', async () => {
      let payload: any = null;
      await page.route('**/api/broker/magazine/special', async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        payload = route.request().postDataJSON();
        blocked.push('special POST (mocked contract)');
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, edition: { id: 'e2e-mock' }, distributionResult: null }) });
      });
      const dlg = page.getByRole('dialog', { name: '속보 매거진 발행' });
      await dlg.getByLabel('속보 헤드라인').fill('E2E_TUT2 속보 테스트');
      await dlg.getByRole('button', { name: '속보 발행', exact: true }).click();
      await expect.soft(dlg.getByText('속보를 발행했어요')).toBeVisible({ timeout: 10_000 });
      check(P, 'payload.buildingId = 이 딜카드', payload?.buildingId === OWNED_BUILDING, `buildingId=${payload?.buildingId}`);
      check(P, 'payload.autoDistribute = false', payload?.autoDistribute === false, `autoDistribute=${payload?.autoDistribute}`);
      check(P, 'payload.includeUntagged = false', payload?.includeUntagged === false, `includeUntagged=${payload?.includeUntagged}`);
      check(P, 'payload.headline', payload?.headline === 'E2E_TUT2 속보 테스트', `headline=${payload?.headline}`);
      check(P, '결과 "독자에게는 발송하지 않았어요"', (await dlg.getByText(/독자에게는 발송하지 않았어요/).count()) > 0);
      await page.unroute('**/api/broker/magazine/special');
    });
    await ctx.close();
  });
});
