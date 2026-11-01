/**
 * 📰 뉴스레터(모바일 매거진) SOTA MECE E2E 골든 테스트 — 60대 중개인 & 60대 독자 페르소나
 *
 * 대상: Wave 1~4 개편 이후 (b8ad6718) 상태.
 * 축(MECE):
 *   B. 중개인(김테스트, 62세 · 데스크톱 125% / 모바일 390)
 *     B1 진입·라우팅   B2 Warm Paper 테마·간단모드·단일 CTA   B3 상세 모드 8탭
 *     B4 실제 화면 보기 링크   B5 구독자 일괄 붙여넣기   B6 열람 성과 탭(기술 에러 비노출)
 *     B7 발행 확인 모달 → 공유 모달(카톡 패키지·문자)   B8 API 계약(PATCH 직접발행 차단)
 *   R. 독자(64세 · 카톡 인앱 360/390/430)
 *     R1 첫 화면·가로 넘침·글자 크기   R2 호외·매물 카드 스펙   R3 [이 매물 수지분석] 프리필
 *     R4 ROI 결과 카드   R5 상세·문의 시트(전화)   R6 구독 카드   R7 중복 안내문/배지
 *
 * 안전: 공개 데이터 오염 방지 — 발행/발송 POST, 구독 POST, 일괄 등록 POST 는 route mock(요청 본문은 단언).
 *       독자 픽스처는 service role 로 magazine_editions(E2E_SOTA60_*) 를 삽입하고 afterAll 에서 삭제.
 * 산출물: brain/<conv>/scratch/golden60/*.png + golden60_report.json (육안 검사용)
 *
 * 실행: $env:E2E_PORT="3201"; npx playwright test e2e/magazine-sota60-golden.auth.spec.ts --project=authenticated --no-deps --workers=1
 */
import { test, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const OUT = process.env.GOLDEN60_OUT
  || 'C:\\Users\\User\\.gemini\\antigravity\\brain\\81c019a6-0303-44db-bc94-8a1277019cc0\\scratch\\golden60';
const PORT = Number(process.env.E2E_PORT || 3000);
const BASE = `http://localhost:${PORT}`;
const AUTH = path.resolve(__dirname, '.auth/user.json');
const SLUG = 'test-broker-kim';
const BROKER_UUID = '204246a5-7c52-4549-9570-f089fbbf789c';
const TAG = `E2E_SOTA60_${Date.now()}`;
const LABEL_CANDIDATES = ['2026-08-30', '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26'];
const KAKAO_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S911N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36;KAKAOTALK 2410800';
const WARM_PAPER = 'rgb(250, 249, 245)';
const RAW_DB_ERROR = /PGRST|relation .* does not exist|column .* does not exist|violates|syntax error|42P01|42703|undefined|NaN|\[object Object\]/;

const rep: Record<string, any> = { tag: TAG, base: BASE, startedAt: new Date().toISOString(), checks: [], shots: [] };
let fixtureId: string | null = null;
let fixtureLabel = '';
let draftEditionId: string | null = null;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function ensureOut() { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); }
function saveRep() { ensureOut(); fs.writeFileSync(path.join(OUT, 'golden60_report.json'), JSON.stringify(rep, null, 1), 'utf8'); }
function note(id: string, ok: boolean, detail: unknown = '') { rep.checks.push({ id, ok, detail }); saveRep(); }

async function shot(page: Page, name: string, fullPage = false) {
  ensureOut();
  await page.addStyleTag({ content: 'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}' }).catch(() => {});
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, name), fullPage, scale: 'css', timeout: 30_000 });
  rep.shots.push(name); saveRep();
}

async function brokerCtx(browser: Browser, kind: 'desktop' | 'mobile'): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: AUTH,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
    ...(kind === 'desktop'
      ? { viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.25 }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }),
  });
  ctx.setDefaultTimeout(30_000);
  ctx.setDefaultNavigationTimeout(120_000);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  // 실제 발송은 어떤 경우에도 막는다
  await ctx.route('**/api/broker/magazine/distribute', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: false, blocked: 'SEND_DISABLED' }) }));
  return ctx;
}

async function readerCtx(browser: Browser, width: number): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: BASE,
    storageState: { cookies: [], origins: [] },
    viewport: { width, height: 800 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: KAKAO_UA,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    extraHTTPHeaders: { 'x-playwright-test': 'true' },
  });
  ctx.setDefaultTimeout(30_000);
  ctx.setDefaultNavigationTimeout(120_000);
  await ctx.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'sendBeacon', { configurable: true, value: () => true }); } catch { /* noop */ }
    document.addEventListener('click', (e) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="tel:"],a[href^="sms:"]');
      if (a) { e.preventDefault(); ((window as any).__tel ||= []).push(a.getAttribute('href')); }
    }, true);
  });
  // 공개 쓰기 API 는 mock (요청만 기록)
  await ctx.route('**/api/public/magazine/subscribe', async (r) => {
    rep.subscribeBody = r.request().postData();
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, status: 'pending', confirmChannel: 'email' }) });
  });
  await ctx.route('**/api/public/**', async (r) => (r.request().method() === 'GET' ? r.continue() : r.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })));
  await ctx.route('**/im-lite/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>IM stub</h1></body></html>' }));
  return ctx;
}

async function openEditor(page: Page) {
  await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('editor-mode-bar').waitFor({ state: 'visible', timeout: 120_000 });
  const simple = page.getByTestId('editor-mode-simple');
  if (await simple.isVisible().catch(() => false)) await simple.click();
  await page.getByTestId('simple-editor-root').waitFor({ state: 'visible', timeout: 60_000 });
}

/** 보이는 인터랙티브 요소 중 탭 타깃 40px 미만 목록 */
async function smallTargets(page: Page, scope = 'body') {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel) || document.body;
    const out: string[] = [];
    root.querySelectorAll('button, a[href], [role="button"], input[type="checkbox"]').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const st = getComputedStyle(el as HTMLElement);
      if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') return;
      if ((el as HTMLInputElement).type === 'checkbox') return;
      if (r.height < 40) out.push(`${Math.round(r.height)}px「${((el as HTMLElement).innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24)}」`);
    });
    return out.slice(0, 20);
  }, scope);
}

async function overflowX(page: Page) {
  // isMobile 에뮬레이션은 레이아웃이 넓어지면 innerWidth 도 함께 커진다(축소 표시) → 기기 폭(viewport) 기준으로 잰다
  const vw = page.viewportSize()?.width ?? 0;
  return page.evaluate((w) => Math.max(document.documentElement.scrollWidth, window.innerWidth) - w, vw);
}

// ─────────────────────────────────────────────────────────────
// 독자 픽스처: 실발행 2026-10-04 호를 복제한 "호외" 에디션 + Wave1 매물 스펙
// ─────────────────────────────────────────────────────────────
async function createReaderFixture() {
  const db = sb();
  const { data: stale } = await db.from('magazine_editions').select('id, content').in('broker_id', [BROKER_UUID, SLUG]).filter('content->>e2e_fixture', 'like', 'E2E_SOTA60_%');
  for (const r of (stale || []) as any[]) await db.from('magazine_editions').delete().eq('id', r.id);
  const { data: base } = await db.from('magazine_issues').select('content').eq('broker_id', SLUG).eq('issue_date', '2026-10-04').maybeSingle();
  if (!base?.content) throw new Error('기준 발행본(2026-10-04) 없음');
  const { data: taken } = await db.from('magazine_editions').select('edition_label').in('broker_id', [BROKER_UUID, SLUG]).in('edition_label', LABEL_CANDIDATES);
  const { data: takenIss } = await db.from('magazine_issues').select('issue_date').in('broker_id', [BROKER_UUID, SLUG]).in('issue_date', LABEL_CANDIDATES);
  const used = new Set([...(taken || []).map((r: any) => r.edition_label), ...(takenIss || []).map((r: any) => r.issue_date)]);
  const label = LABEL_CANDIDATES.find((d) => !used.has(d));
  if (!label) throw new Error('픽스처 라벨 빈 날짜 없음');
  const c: any = JSON.parse(JSON.stringify(base.content));
  delete c.id;
  c.issueDate = label;
  c.e2e_fixture = TAG;
  c.edition_type = 'special';
  c.headline = '[호외] 마포 대흥동 역세권 꼬마빌딩 단독 매물 브리핑';
  c.dealHighlights = [
    {
      id: 'e2e-sota60-deal-1', assetType: '근린생활시설', address: '서울 마포구 대흥동 12-41', price: 4_550_000_000, priceWon: 4_550_000_000,
      deposit: 300_000_000, monthlyRent: 15_000_000, landAreaM2: 198.3, grossFloorAreaM2: 612.4, totalFloors: 5, zoning: '제2종일반주거',
      grossYieldNetOfDeposit: 4.24, investmentPoint: '대흥역 도보 3분 · 1층 카페 장기 임차', imUrl: '/im-lite/e2e-sota60-im', imEdited: true,
    },
    {
      id: 'e2e-sota60-deal-2', assetType: '오피스빌딩', address: '서울 강남구 역삼동 832-7', price: 12_000_000_000,
      deposit: 800_000_000, monthlyRent: 38_000_000, landAreaPyeong: 120, grossFloorAreaPyeong: 520, floors: '지하 1층 / 지상 7층',
      investmentPoint: '역삼역 코너 · 사옥 단독 명칭 표기 가능',
    },
  ];
  c.featured_deals = c.dealHighlights;
  const row = {
    broker_id: BROKER_UUID, status: 'published', edition_type: 'special', edition_label: label,
    title: c.headline, published_at: `${label}T01:00:00Z`, content: c,
  };
  const { data: ins, error } = await db.from('magazine_editions').insert(row).select('id').single();
  if (error || !ins) throw new Error(`fixture insert 실패: ${error?.message}`);
  fixtureId = ins.id; fixtureLabel = label;
  rep.fixture = { id: ins.id, label };
}

test.describe.configure({ mode: 'default' });

test.describe('📰 뉴스레터 SOTA60 골든 — 중개인(B) · 독자(R)', () => {
  test.beforeAll(async () => {
    ensureOut();
    await createReaderFixture();
    saveRep();
  });

  test.afterAll(async () => {
    const db = sb();
    if (fixtureId) {
      await db.from('magazine_editions').delete().eq('id', fixtureId);
      const { count } = await db.from('magazine_editions').select('id', { count: 'exact', head: true }).eq('id', fixtureId);
      rep.cleanup = { fixtureDeleted: count === 0 };
    }
    if (draftEditionId) {
      // mock 발행 후 브라우저가 남긴 activity_events 정리
      await db.from('activity_events').delete().eq('entity_id', draftEditionId).eq('event_type', 'magazine_distributed').gte('created_at', rep.startedAt);
    }
    rep.finishedAt = new Date().toISOString();
    saveRep();
  });

  // ═════════════════ B. 중개인 ═════════════════
  test('B1 진입·라우팅 — 하단/상단 뉴스레터 탭 → 실DB 편집실, /broker/w/magazine 리다이렉트(쿼리 보존)', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await brokerCtx(browser, 'mobile');
    const page = await ctx.newPage();
    await page.goto('/broker/w/dealcards', { waitUntil: 'domcontentloaded' });
    const navLink = page.locator('a[href="/broker/magazine-editor"]').filter({ hasText: '뉴스레터' }).first();
    await navLink.waitFor({ state: 'visible', timeout: 120_000 });
    await shot(page, 'B1-01_workspace_nav_mobile390.png');
    await navLink.click();
    await page.waitForURL('**/broker/magazine-editor**', { timeout: 120_000 });
    await page.getByTestId('editor-mode-bar').waitFor({ state: 'visible', timeout: 120_000 });
    note('B1.nav→editor', true, page.url());

    await page.goto('/broker/w/magazine?buildingId=e2e-sota60-bldg&from=im', { waitUntil: 'domcontentloaded' });
    await page.waitForURL(/\/broker\/magazine-editor\?.*buildingId=e2e-sota60-bldg/, { timeout: 120_000 });
    const u = new URL(page.url());
    expect(u.pathname).toBe('/broker/magazine-editor');
    expect(u.searchParams.get('from')).toBe('im');
    note('B1.redirect-preserves-query', true, page.url());
    await ctx.close();
  });

  test('B2 Warm Paper 테마 · 간단 모드 · 단일 발행 CTA · 탭 타깃 (데스크톱 125% + 모바일 390)', async ({ browser }) => {
    test.setTimeout(300_000);
    for (const kind of ['desktop', 'mobile'] as const) {
      const ctx = await brokerCtx(browser, kind);
      const page = await ctx.newPage();
      await openEditor(page);
      const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#editor-tabpanel') as HTMLElement).backgroundColor);
      expect.soft(bg, `${kind} 편집 패널 배경`).toBe(WARM_PAPER);
      await expect.soft(page.getByRole('tablist', { name: '콘텐츠 편집 단계' }), `${kind} 간단 모드 8탭 숨김`).toHaveCount(0);
      const publishBtns = page.getByRole('button', { name: /^(발행하기|정정 발행)$/ });
      const visiblePublish = await publishBtns.evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).length);
      expect.soft(visiblePublish, `${kind} 하단 단일 발행 CTA`).toBe(1);
      const small = await smallTargets(page, '#editor-tabpanel');
      note(`B2.${kind}`, bg === WARM_PAPER && visiblePublish === 1, { bg, visiblePublish, smallTargets: small });
      await shot(page, `B2-01_editor_simple_${kind}.png`);
      await shot(page, `B2-02_editor_simple_${kind}_full.png`, true);
      if (kind === 'mobile') {
        const ov = await overflowX(page);
        expect.soft(ov, '모바일 편집실 가로 넘침').toBeLessThanOrEqual(1);
      }
      draftEditionId ||= await page.evaluate(async () => {
        const r = await fetch('/api/magazine/editions/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edition_type: 'weekly' }) }).catch(() => null);
        const j: any = r ? await r.json().catch(() => null) : null;
        return j?.edition?.id ?? j?.id ?? null;
      });
      await ctx.close();
    }
    rep.draftEditionId = draftEditionId; saveRep();
  });

  test('B3 상세 모드 전환 — 8개 한글 탭 노출 · 데이터 보존 · 간단 모드 복귀', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await brokerCtx(browser, 'desktop');
    const page = await ctx.newPage();
    await openEditor(page);
    const comment = '이번 주 마포·공덕 일대는 금리 인하 기대감으로 실수요 사옥 문의가 늘었습니다.';
    await page.locator('[data-testid="simple-editor-root"] textarea').first().fill(comment);
    await page.getByTestId('editor-mode-bar').locator('[data-mode-switch="full"]').click();
    const tabs = page.getByRole('tablist', { name: '콘텐츠 편집 단계' }).getByRole('tab');
    await expect(tabs).toHaveCount(8);
    const labels = await tabs.allInnerTexts();
    note('B3.full-tabs', labels.length === 8, labels.map((s) => s.trim()));
    await shot(page, 'B3-01_editor_full_mode_desktop.png');
    await page.getByTestId('editor-mode-bar').locator('[data-mode-switch="simple"]').click();
    await expect(page.locator('[data-testid="simple-editor-root"] textarea').first()).toHaveValue(comment);
    note('B3.mode-roundtrip-preserves', true);
    await ctx.close();
  });

  test('B4 [📱 실제 화면으로 보기] — 초안 링크 계약 및 새 탭 도착 화면', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await brokerCtx(browser, 'desktop');
    const page = await ctx.newPage();
    await openEditor(page);
    const link = page.getByRole('link', { name: /실제 화면으로 보기/ });
    const href = await link.getAttribute('href');
    expect(href).toMatch(new RegExp(`^/magazine/${SLUG}/\\d{4}-\\d{2}-\\d{2}(\\?preview=1&edition=[0-9a-f-]{36})?$`));
    const [popup] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForTimeout(3500);
    const bodyText = (await popup.locator('body').innerText()).slice(0, 400);
    const deadEnd = /에디터 미리보기 전용|에디터에서 열어/.test(bodyText);
    note('B4.preview-link', !deadEnd, { href, landing: bodyText.replace(/\s+/g, ' ').slice(0, 200), deadEnd });
    await shot(popup, 'B4-01_preview_link_landing.png');
    // 편집실 내장 미리보기(우측 패널) — 실제 독자가 보게 될 화면
    await shot(page, 'B4-02_editor_inline_phone_preview.png');
    await ctx.close();
  });

  test('B5 구독자 일괄 붙여넣기 — 3줄 파싱 · 동의 확인 · 요청 본문 단언(mock)', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await brokerCtx(browser, 'desktop');
    const page = await ctx.newPage();
    const posted: any[] = [];
    await page.route('**/api/broker/magazine/subscribers', async (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      posted.push(r.request().postDataJSON());
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, subscriber: { id: `mock-${posted.length}` }, consentRecorded: true }) });
    });
    await openEditor(page);
    await page.getByTestId('simple-quick-outreach').click();
    if (!(await page.getByTestId('bulk-import-tab').isVisible().catch(() => false))) {
      await page.locator('#editor-tabpanel').getByRole('button', { name: '추가', exact: true }).click();
    }
    await page.getByTestId('bulk-import-tab').click();
    await page.getByTestId('bulk-subscriber-textarea').fill('홍길동 010-0000-9101\n김영희, 010-0000-9102, kim@example.com\n박철수\t010-0000-9103');
    await page.waitForTimeout(400);
    await shot(page, 'B5-01_bulk_paste_parsed.png');
    await page.getByTestId('bulk-attest-checkbox').check();
    await page.getByTestId('bulk-submit-btn').click();
    await expect.poll(() => posted.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
    const flat = JSON.stringify(posted);
    expect(flat.replace(/-/g, '')).toContain('01000009101');
    expect(flat.replace(/-/g, '')).toContain('01000009103');
    expect(flat).toContain('kim@example.com');
    note('B5.bulk', true, { requests: posted.length, sample: flat.slice(0, 300) });
    await page.waitForTimeout(800);
    await shot(page, 'B5-02_bulk_after_submit.png');
    await ctx.close();
  });

  test('B6 열람 성과 탭 — KST 차트 · 한국어 역할명 · 기술 에러 비노출', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await brokerCtx(browser, 'desktop');
    const page = await ctx.newPage();
    const apiResp = page.waitForResponse((r) => r.url().includes('/api/broker/magazine/analytics'), { timeout: 120_000 });
    await openEditor(page);
    const resp = await apiResp;
    expect.soft(resp.status(), 'analytics API').toBe(200);
    await page.getByTestId('simple-quick-analytics').click();
    await page.waitForTimeout(2500);
    const panel = await page.locator('#editor-tabpanel').innerText();
    expect.soft(panel, '기술 에러 문자열 비노출').not.toMatch(RAW_DB_ERROR);
    expect.soft(panel, '영문 역할명 비노출').not.toMatch(/\bInvestor\b|\bOwner\b|\bTenant\b/);
    note('B6.analytics', !RAW_DB_ERROR.test(panel), { status: resp.status(), sample: panel.replace(/\s+/g, ' ').slice(0, 300) });
    await shot(page, 'B6-01_analytics_tab.png');
    await shot(page, 'B6-02_analytics_tab_full.png', true);
    await ctx.close();
  });

  test('B7 발행 확인 모달 → 공유 모달(카톡 단톡방 패키지 복사 · 문자) — 발행 API mock', async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await brokerCtx(browser, 'mobile');
    const page = await ctx.newPage();
    let publishBody: any = null;
    await page.route('**/api/magazine/editions/*/publish', async (r) => {
      publishBody = r.request().postDataJSON();
      const id = r.request().url().split('/editions/')[1].split('/')[0];
      const { data: row } = await sb().from('magazine_editions').select('*').eq('id', id).maybeSingle();
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ edition: { ...(row || { id }), status: 'published', published_at: new Date().toISOString() }, issueDate: today }) });
    });
    await openEditor(page);
    await page.locator('[data-testid="simple-editor-root"] textarea').first().fill('이번 주 마포·공덕 일대는 금리 인하 기대감으로 실수요 사옥 문의가 늘었습니다.');
    const publishCta = page.getByRole('button', { name: /^발행하기$/ }).last();
    await publishCta.scrollIntoViewIfNeeded();
    const hit = await publishCta.evaluate((b) => {
      const rc = b.getBoundingClientRect();
      const el = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2);
      return { self: !!el && (el === b || b.contains(el)), hit: el ? `${el.tagName} ${el.getAttribute('data-testid') || ''} ${(el.textContent || '').trim().slice(0, 24)}` : null, y: Math.round(rc.y), innerH: window.innerHeight };
    });
    expect.soft(hit.self, `하단 발행 CTA 가림 없음 (hit=${hit.hit})`).toBe(true);
    note('B7.publish-cta-hit-test', hit.self, hit);
    await shot(page, 'B7-00_publish_cta_hit_state.png');
    await publishCta.dispatchEvent('click');
    const dialog = page.getByRole('dialog').first();
    await dialog.waitFor({ state: 'visible', timeout: 60_000 });
    await shot(page, 'B7-01_publish_confirm_modal.png');
    const sendBox = dialog.locator('input[type="checkbox"]').first();
    if (await sendBox.isChecked().catch(() => false)) await sendBox.uncheck();
    const confirmBtn = dialog.getByRole('button', { name: /^발행하기$/ });
    const confirmHit = await confirmBtn.evaluate((b) => {
      const rc = b.getBoundingClientRect();
      const el = document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2);
      return { self: !!el && (el === b || b.contains(el)), x: Math.round(rc.x), w: Math.round(rc.width), vw: document.documentElement.clientWidth };
    });
    expect.soft(confirmHit.self, '발행 확인 모달 버튼 탭 가능').toBe(true);
    note('B7.confirm-modal-hit-test', confirmHit.self, confirmHit);
    await confirmBtn.dispatchEvent('click');
    const pkgBtn = page.getByTestId('copy-group-chat-pkg-btn');
    await pkgBtn.waitFor({ state: 'visible', timeout: 60_000 });
    expect(publishBody?.payload, '발행 요청 payload').toBeTruthy();
    await shot(page, 'B7-02_share_modal.png');
    await pkgBtn.dispatchEvent('click');
    await page.waitForTimeout(600);
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    const sms = await page.getByTestId('sms-dispatch-link').getAttribute('href');
    expect.soft(clip, '카톡 패키지 = 링크 포함').toMatch(/\/magazine\//);
    expect.soft(sms ?? '', '문자 앱 링크').toMatch(/^sms:/);
    note('B7.share', /\/magazine\//.test(clip) && /^sms:/.test(sms ?? ''), { clip: clip.slice(0, 300), sms: (sms ?? '').slice(0, 160) });
    await shot(page, 'B7-03_share_modal_after_copy.png');
    await ctx.close();
    // mock 발행 후 브라우저가 직접 남긴 activity_events(magazine_distributed) 즉시 정리 — 실제 발행이 아니므로
    if (publishBody) {
      const { data: d } = await sb().from('magazine_editions').select('id, status').in('broker_id', [BROKER_UUID, SLUG]).eq('status', 'draft').order('created_at', { ascending: false }).limit(1);
      const id = (d as any[])?.[0]?.id;
      if (id) await sb().from('activity_events').delete().eq('entity_id', id).eq('event_type', 'magazine_distributed').gte('created_at', rep.startedAt);
    }
  });

  test('B8 API 계약 — PATCH 직접 발행 차단 · 초안 상태 유지', async ({ browser }) => {
    const ctx = await brokerCtx(browser, 'desktop');
    const page = await ctx.newPage();
    await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
    if (!draftEditionId) {
      const dr = await page.request.post('/api/magazine/editions/draft', { data: { edition_type: 'weekly' } });
      draftEditionId = (await dr.json().catch(() => null))?.edition?.id ?? null;
    }
    expect(draftEditionId, '초안 에디션 ID 확보').toBeTruthy();
    const res = await page.request.patch('/api/magazine/editions', { data: { id: draftEditionId, status: 'published' } });
    expect(res.status()).toBe(400);
    const { data: row } = await sb().from('magazine_editions').select('status').eq('id', draftEditionId!).maybeSingle();
    expect(row?.status).toBe('draft');
    note('B8.patch-publish-blocked', true, { status: res.status(), body: (await res.text()).slice(0, 200), dbStatus: row?.status });
    await ctx.close();
  });

  // ═════════════════ R. 독자 ═════════════════
  for (const width of [360, 390, 430]) {
    test(`R1~R2 독자 첫 화면 · 호외 · 매물 카드 스펙 (${width}px)`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await readerCtx(browser, width);
      const page = await ctx.newPage();
      const resp = await page.goto(`/magazine/${SLUG}/${fixtureLabel}?edition=${fixtureId}`, { waitUntil: 'domcontentloaded' });
      expect(resp?.status()).toBe(200);
      await page.waitForLoadState('networkidle').catch(() => {});
      await shot(page, `R1-01_first_screen_${width}.png`);
      const ov = await overflowX(page);
      expect.soft(ov, `${width}px 가로 넘침`).toBeLessThanOrEqual(1);
      const body = await page.locator('body').innerText();
      expect.soft(body, '호외 표시').toMatch(/호외/);
      expect.soft(body, '포이즌 토큰').not.toMatch(/\bNaN\b|\bundefined\b|\[object Object\]/);
      const tinyText = await page.evaluate(() => {
        const out: string[] = [];
        document.querySelectorAll('main p, main li, main span, main a, main button').forEach((el) => {
          const t = (el as HTMLElement).innerText?.trim();
          if (!t || t.length < 4 || el.children.length > 0) return;
          const r = (el as HTMLElement).getBoundingClientRect();
          if (r.width === 0) return;
          const fs = parseFloat(getComputedStyle(el as HTMLElement).fontSize);
          if (fs < 12) out.push(`${fs}px「${t.slice(0, 20)}」`);
        });
        return out.slice(0, 15);
      });
      const deal = page.locator('li', { hasText: '대흥동' }).filter({ hasText: '이 매물 수지분석' }).first();
      await deal.scrollIntoViewIfNeeded();
      const dealText = await deal.innerText();
      expect.soft(dealText, '매매가 45.5억').toMatch(/45\.5억/);
      expect.soft(dealText, '면적 평 표기').toMatch(/평/);
      expect.soft(dealText, '층수').toMatch(/5층/);
      const imHref = await deal.getByRole('link', { name: /모바일 IM 열람/ }).getAttribute('href');
      expect.soft(imHref, 'IM 직결').toBe('/im-lite/e2e-sota60-im');
      note(`R1R2.${width}`, ov <= 1, { overflow: ov, tinyText, dealText: dealText.replace(/\s+/g, ' ').slice(0, 260), imHref });
      await deal.screenshot({ path: path.join(OUT, `R2-01_deal_card_${width}.png`) });
      rep.shots.push(`R2-01_deal_card_${width}.png`);
      if (width === 390) await shot(page, 'R1-02_full_page_390.png', true);
      await ctx.close();
    });
  }

  test('R3~R4 [🧮 이 매물 수지분석] 프리필 → ROI 결과 카드 · 한글 금액 입력 (360px)', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await readerCtx(browser, 360);
    const page = await ctx.newPage();
    await page.goto(`/magazine/${SLUG}/${fixtureLabel}?edition=${fixtureId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const roiCta = page.locator('li', { hasText: '대흥동' }).getByRole('link', { name: /이 매물 수지분석/ }).first();
    await roiCta.scrollIntoViewIfNeeded();
    await roiCta.click();
    await page.waitForTimeout(1500);
    const readRoi = () => page.evaluate(() => {
      const get = (re: RegExp) => ([...document.querySelectorAll('input[aria-label]')] as HTMLInputElement[]).find((i) => re.test(i.getAttribute('aria-label') || ''))?.value ?? null;
      return { price: get(/^매입가 직접 입력/), deposit: get(/^보증금 합계 직접 입력/), rent: get(/^월세 합계 직접 입력/), floors: (document.getElementById('roi-total-floors') as HTMLInputElement | null)?.value ?? null };
    });
    const vals = await readRoi();
    note('R3.prefill', true, vals);
    expect.soft(String(vals.price ?? ''), '매입가 프리필 45.5억').toBe('45.5');
    expect.soft(String(vals.deposit ?? ''), '보증금 프리필 3억').toBe('3');
    expect.soft(String(vals.rent ?? ''), '월세 프리필 1500만원').toBe('1500');
    expect.soft(String(vals.floors ?? ''), '층수 프리필 5').toBe('5');
    await shot(page, 'R3-01_roi_prefilled_360.png');
    const roiSection = page.locator('#section-roi_calculator');
    await roiSection.screenshot({ path: path.join(OUT, 'R4-01_roi_section_360.png') }).catch(() => {});
    rep.shots.push('R4-01_roi_section_360.png');
    // 한글 금액 직접 입력
    const rent = page.getByLabel(/^월세 합계 직접 입력/).first();
    await rent.fill('1,200만');
    await rent.blur();
    await page.waitForTimeout(600);
    const rentAfter = await rent.inputValue();
    expect.soft(rentAfter, '한글 금액 "1,200만" → 1200').toBe('1200');
    const roiText = (await roiSection.innerText().catch(() => '')).replace(/\s+/g, ' ');
    expect.soft(roiText, 'ROI 포이즌').not.toMatch(/NaN|Infinity|undefined/);
    note('R4.korean-input', !/NaN|Infinity/.test(roiText), { rentAfter, roiText: roiText.slice(0, 400) });
    await roiSection.screenshot({ path: path.join(OUT, 'R4-02_roi_after_korean_input_360.png') }).catch(() => {});
    rep.shots.push('R4-02_roi_after_korean_input_360.png');
    await ctx.close();
  });

  test('R5~R7 상세·문의 시트(전화) · 구독 카드 · 중복 안내문/배지 (390px)', async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await readerCtx(browser, 390);
    const page = await ctx.newPage();
    await page.goto(`/magazine/${SLUG}/${fixtureLabel}?edition=${fixtureId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const detail = page.locator('li', { hasText: '대흥동' }).getByRole('link', { name: /상세 정보 · 문의/ }).first();
    await detail.scrollIntoViewIfNeeded();
    await detail.click();
    const sheet = page.getByRole('dialog').first();
    await sheet.waitFor({ state: 'visible', timeout: 30_000 });
    const sheetText = await sheet.innerText();
    const telCount = await sheet.locator('a[href^="tel:"]').count();
    note('R5.inquiry-sheet', true, { telCount, text: sheetText.replace(/\s+/g, ' ').slice(0, 300) });
    await shot(page, 'R5-01_inquiry_sheet_390.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const trackingCount = await page.getByText(/열람 기록|열람 통계|추적/).count();
    const poweredCount = await page.locator('a[href*="powered-by"]').count();
    note('R7.dedupe', trackingCount <= 2, { trackingCount, poweredCount });

    const phone = page.getByPlaceholder('휴대폰 번호 (010-0000-0000 형식)').first();
    if (await phone.count()) {
      await phone.scrollIntoViewIfNeeded();
      await shot(page, 'R6-01_subscribe_card_390.png');
      await phone.fill('010-0000-9201');
      const email = page.getByPlaceholder('이메일 주소').first();
      if (await email.count()) await email.fill('e2e-sota60@example.com');
      const consent = page.locator('form input[type="checkbox"]');
      for (let i = 0; i < (await consent.count()); i++) await consent.nth(i).check().catch(() => {});
      await shot(page, 'R6-02_subscribe_filled_390.png');
      note('R6.subscribe-card', true, 'visible');
    } else {
      note('R6.subscribe-card', false, '구독 카드 미노출');
    }
    expect(rep.checks.length).toBeGreaterThan(0);
    await ctx.close();
  });
});
