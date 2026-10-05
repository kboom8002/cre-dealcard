/**
 * 골든 E2E — TUTORIAL_PART1_MAGAZINE_CREATION.md (D-01 재작성판)
 *
 * 원칙
 *  - 튜토리얼의 "실습 N" = 이 파일의 test.step('실습 N …') (1:1). 튜토리얼 이미지는 이 스펙이 찍은 p1_NN_*.png 를 사용한다.
 *  - 주장(claim)마다 하드 단언(expect). 실패는 expect.soft 로 기록해 한 번 실행에 전 주장을 판정한다(if-visible 스킵 금지).
 *    제품 결함을 가리려고 단언을 약화하지 않는다. 데이터가 없어 판정 자체가 불가능한 경우만 NA 로 기록한다(사유 포함).
 *  - 안전
 *    · 에디션 쓰기(PATCH 자동저장/발행/정정 발행)는 상태 보존형 route mock(in-memory store)으로 처리한다.
 *      초안 로드(POST /editions/draft)만 실서버를 1회 호출해 실제 id/라벨/meta(sendEnabled·수신자 수)를 받는다.
 *    · distribute/special(실발송)은 항상 mock(서버 기본값과 같은 SEND_DISABLED 응답).
 *    · 운영 DB 실쓰기: 구독자 추가 1건(E2E_TUT1_ 이름, 0100000xxxx) + 그 구독자의 태그 PATCH 뿐. afterAll 에서 service role 로 정리.
 *    · LLM 실호출 금지(크레딧 소진) → ai-comment 는 서버 계약(ok/result/warnings, 502 LLM_UNAVAILABLE)을 재현한 mock.
 *  - @needs-migration: 마이그레이션 미적용 운영 DB 에서 정직 degrade 가 정상인 경로. (a) 현재 degrade 동작, (b) 요청 payload 계약을 각각 단언.
 *
 * 실행(전용 포트):
 *  $env:E2E_PORT="3201"; npx playwright test e2e/magazine-tutorial-part1-golden.auth.spec.ts --project=authenticated --no-deps --workers=1 --reporter=line
 */
import { test, expect, request as pwRequest, type Page, type Route, type Request } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true } as any);

const OUT_DIR =
  process.env.TUT1_OUT_DIR ||
  'C:\\Users\\User\\.gemini\\antigravity\\brain\\93f8ca59-e154-4bf8-adb4-2396b2b1ee90\\scratch\\part1_v2';
const BROKER_SLUG = 'test-broker-kim';
const SUB_NAME = 'E2E_TUT1_김투자';
const SUB_PHONE_DIGITS = '0100000' + String(Math.floor(1000 + Math.random() * 9000));
const RUN_START = new Date().toISOString();

// ── 튜토리얼 예시 입력값 (튜토리얼 본문과 동일) ──
const T = {
  keywords: ['금리 동결', '공실률 최저', '선별 매수'],
  headline: '하반기 금리 인하 기대 속, 강남 투자 기회 분석',
  briefing:
    '이번 주 강남권 중소형 빌딩 시장은 금리 동결 이후 매수 문의가 늘었지만, 매도 호가가 함께 올라 실제 거래는 선별적으로 이뤄지고 있습니다.',
  fieldNote: {
    question: '이번 주 강남 꼬마빌딩 시장은 어떤 분위기인가요?',
    buyerReaction: '금리 인하 기대감으로 매수 문의가 전주보다 늘었습니다. 특히 역삼·삼성 권역 50억 이하 물건에 집중됩니다.',
    sellerReaction: "아직 호가 조정 의사가 낮습니다. 매도자 대부분이 '급할 이유 없다'는 입장입니다.",
    marketJudgment: '선별적 매수 기회. Cap Rate 4% 이상 물건 우선 검토 권장.',
    comment: '이번 주 눈여겨볼 매물은 역삼동 5층 코너 건물입니다. 리모델링 후 임대료 상승 여력이 큽니다.',
  },
  themeTitle: '하반기 강남 역세권 투자 기회',
  themeBody:
    '최근 금리 동결 결정에도 불구하고 하반기 인하 기대감이 높아지면서 강남 역세권 꼬마빌딩에 대한 관심이 커지고 있습니다.\n\n특히 역삼역·삼성역 인근의 Cap Rate 4% 이상 물건은 리모델링을 통한 가치 상승 여지가 있어 투자 매력이 돋보입니다.',
  aiMemo: '이번주 역삼동 물건 좋다. 캡레이트 4.2% 리모델링하면 더 올라갈듯. 투자자한테 추천할만함.',
  // AI 응답 예시(튜토리얼에 실린 예시 문장 — LLM 실호출 대신 서버 계약 형태로 돌려준다)
  aiResult:
    '이번 주 주목할 매물은 역삼동 소재 빌딩으로, 현재 Cap Rate 4.2% 수준의 안정적인 수익률을 보이고 있습니다. 리모델링을 거치면 임대 수익 개선 여지가 있어 투자자께 검토를 권해 드립니다.',
  aiEdited: '이번 주 주목할 매물은 역삼동 소재 빌딩입니다. 현재 Cap Rate 4.2%로 안정적이며, 리모델링 후 임대 수익 개선 여지가 있습니다.',
  pollQuestion: '올해 하반기, 가장 관심 있는 투자 전략은?',
  pollChoices: ['적극적으로 매수 검토 중', '좋은 매물이 나오면 검토', '보유 건물 매각을 우선 고려'],
};

type ClaimResult = { step: string; id: string; claim: string; pass: boolean | 'NA'; detail?: string; needsMigration?: boolean };
const results: ClaimResult[] = [];
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const badResponses: string[] = [];
const dialogs: string[] = [];
const captured = {
  draftPost: [] as any[],
  editionsPatch: [] as { t: number; body: any; status: number }[],
  publish: [] as { t: number; body: any }[],
  legacyWrite: [] as any[],
  profileWrite: [] as any[],
  distribute: [] as any[],
  special: [] as any[],
  activityInsert: [] as any[],
  analyticsBeacon: [] as any[],
  pollPost: [] as any[],
  aiComment: [] as any[],
  subscriberPost: [] as any[],
  subscriberPatch: [] as any[],
};
const notes: Record<string, any> = {};

// ── 상태 보존형 에디션 store (mock) ──
const store: { edition: any | null; failNextPatch: boolean } = { edition: null, failNextPatch: false };

function kstNow(): Date {
  return new Date(Date.now() + 9 * 3600_000);
}
function kstDate(): string {
  return kstNow().toISOString().slice(0, 10);
}
function kstIsoWeekLabel(): string {
  const k = kstNow();
  const t = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t.getTime() - ys.getTime()) / 86400000 + 1) / 7);
  return `W${String(wk).padStart(2, '0')}-${t.getUTCFullYear()}`;
}
function fmtPhone(d: string): string {
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

async function claim(step: string, id: string, desc: string, fn: () => Promise<void>, opts: { needsMigration?: boolean } = {}) {
  const label = opts.needsMigration ? `[@needs-migration] ${desc}` : desc;
  try {
    await fn();
    results.push({ step, id, claim: label, pass: true, needsMigration: opts.needsMigration });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
      .replace(/\u001b\[[0-9;]*m/g, '')
      .split('\n')
      .filter((l) => l.trim())
      .slice(0, 4)
      .join(' | ')
      .slice(0, 400);
    results.push({ step, id, claim: label, pass: false, detail: msg, needsMigration: opts.needsMigration });
    expect.soft(false, `[${id}] ${label} → ${msg}`).toBe(true);
  }
}
function na(step: string, id: string, desc: string, reason: string) {
  results.push({ step, id, claim: desc, pass: 'NA', detail: reason });
}

async function shot(page: Page, name: string, fullPage = false) {
  try {
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, name), fullPage });
  } catch (e) {
    notes[`shot_fail_${name}`] = String(e).slice(0, 200);
  }
}

/** 요소 중심점의 최상단 요소가 자기 자신(또는 자손)인지 — 가림(오버레이) 검사 */
async function hitTest(page: Page, loc: ReturnType<Page['locator']>): Promise<string> {
  const box = await loc.boundingBox();
  if (!box) return 'NO_BOX';
  return page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return 'NULL';
      const btn = el.closest('button,a,input,textarea,select,[role=button]');
      return btn ? `${btn.tagName}:${(btn.getAttribute('aria-label') || btn.textContent || '').trim().slice(0, 40)}` : `${el.tagName}.${String(el.className).slice(0, 60)}`;
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

function jsonBody(req: Request): any {
  try {
    return req.postDataJSON();
  } catch {
    return req.postData();
  }
}

function pngInfo(buf: Buffer): { w: number; h: number; dpiX: number } {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const idx = buf.indexOf(Buffer.from('pHYs'));
  let dpiX = 0;
  if (idx > 0) {
    const ppmX = buf.readUInt32BE(idx + 4);
    const unit = buf.readUInt8(idx + 12);
    dpiX = unit === 1 ? Math.round(ppmX * 0.0254) : 0;
  }
  return { w, h, dpiX };
}

const RAW_DB_TOKENS = /PGRST|42703|42P01|column .* does not exist|relation .* does not exist|violates|duplicate key|undefined|null/i;

async function installSafetyMocks(page: Page) {
  // 0) dev 인디케이터(nextjs-portal) 숨김 — 스크린샷 오염 방지 (iframe 포함)
  await page.addInitScript(() => {
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

  // 1) 이번 호 초안: 첫 호출만 실서버(읽기) → id/라벨/meta 확보 후 깨끗한 초안으로 store 초기화. 이후엔 store 반환.
  await page.route('**/api/magazine/editions/draft', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    captured.draftPost.push({ t: Date.now(), body: jsonBody(req) });
    if (!store.edition) {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      notes.realDraft = { status: resp.status(), created: j?.created, meta: j?.meta, label: j?.edition?.edition_label, editionStatus: j?.edition?.status };
      if (!resp.ok() || !j?.edition) return route.fulfill({ response: resp });
      const now = new Date().toISOString();
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
        updated_at: now,
      };
      notes.realMeta = j.meta;
      return route.fulfill({ status: 200, json: { edition: store.edition, created: false, meta: j.meta } });
    }
    return route.fulfill({ status: 200, json: { edition: store.edition, created: false, meta: notes.realMeta ?? {} } });
  });

  // 2) 자동저장/수동저장 PATCH (단일 저장 경로) — 서버 계약 재현: expected_updated_at 낙관적 동시성, published 잠금, 강제 500
  await page.route('**/api/magazine/editions', async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.continue();
    const body = jsonBody(req) || {};
    const rec = { t: Date.now(), body, status: 200 };
    captured.editionsPatch.push(rec);
    const ed = store.edition;
    if (store.failNextPatch) {
      store.failNextPatch = false;
      rec.status = 500;
      return route.fulfill({ status: 500, json: { ok: false, error: { code: 'INTERNAL_ERROR', message: '일시적인 오류가 발생했습니다.' } } });
    }
    if (!ed || body.id !== ed.id) {
      rec.status = 404;
      return route.fulfill({ status: 404, json: { ok: false, error: { code: 'NOT_FOUND', message: '찾을 수 없습니다.' } } });
    }
    if (ed.status === 'published') {
      rec.status = 409;
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'PUBLISHED_LOCKED', message: '이미 발행된 호수입니다.' } } });
    }
    if ('expected_updated_at' in body && body.expected_updated_at !== ed.updated_at) {
      rec.status = 409;
      return route.fulfill({ status: 409, json: { ok: false, error: { code: 'EDIT_CONFLICT', message: '다른 곳에서 수정됨' }, currentUpdatedAt: ed.updated_at } });
    }
    const { id: _id, expected_updated_at: _e, ...cols } = body;
    store.edition = { ...ed, ...cols, updated_at: new Date(Date.now() + 1).toISOString() };
    return route.fulfill({ status: 200, json: { edition: store.edition } });
  });

  // 3) 원자 발행 / 정정 발행
  await page.route(/\/api\/magazine\/editions\/[^/]+\/publish$/, async (route) => {
    const req = route.request();
    const body = jsonBody(req) || {};
    captured.publish.push({ t: Date.now(), body });
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

  // 4) 레거시 공개 행 쓰기(/api/magazine/{slug} 비-GET) — 0건이어야 함(임시저장이 공개 URL 을 바꾸지 않음)
  await page.route(
    (u) => /^\/api\/magazine\/[^/]+$/.test(u.pathname) && !['/api/magazine/editions'].includes(u.pathname),
    async (route) => {
      const req = route.request();
      if (req.method() === 'GET') return route.fallback();
      captured.legacyWrite.push({ t: Date.now(), url: new URL(req.url()).pathname, method: req.method() });
      return route.fulfill({ status: 405, json: { ok: false } });
    },
  );

  // 5) 프로필 쓰기(발행 시 매거진 제목·컬러) — mock
  await page.route('**/api/broker/profile', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT' || req.method() === 'PATCH') {
      captured.profileWrite.push({ t: Date.now(), body: jsonBody(req) });
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  // 6) 실발송 — 항상 mock (서버 기본값 SEND_DISABLED 와 같은 응답)
  await page.route('**/api/broker/magazine/distribute**', async (route) => {
    captured.distribute.push({ t: Date.now(), body: jsonBody(route.request()) });
    return route.fulfill({
      status: 200,
      json: { success: false, blocked: 'SEND_DISABLED', message: '발송이 중지되어 있습니다(관리자 설정).', published: true, sent: 0 },
    });
  });
  await page.route('**/api/broker/magazine/special**', async (route) => {
    captured.special.push({ t: Date.now(), method: route.request().method() });
    return route.fulfill({ status: 200, json: { success: false, blocked: 'SEND_DISABLED', published: false, sent: 0 } });
  });

  // 7) activity_events 직접 insert — mock(기록만)
  await page.route('**/rest/v1/activity_events**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      captured.activityInsert.push({ t: Date.now(), body: jsonBody(req) });
      return route.fulfill({ status: 201, body: '' });
    }
    return route.continue();
  });

  // 8) 공개 독자 분석 비콘/투표 — 미리보기에서 발생하면 결함(T1-13). 기록 후 204.
  await page.route('**/api/public/magazine/analytics**', async (route) => {
    captured.analyticsBeacon.push({ t: Date.now(), frame: route.request().frame()?.url() });
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/public/magazine/poll**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      captured.pollPost.push({ t: Date.now(), body: jsonBody(req) });
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.continue();
  });

  // 9) 카카오 SDK 차단 → 공유는 클립보드 폴백 경로
  await page.route(/kakaocdn\.net|kakao\.com/, (route) => route.abort());

  // 10) 구독자 추가/수정 — 실서버로 보내되 payload 를 기록(계약 단언용)
  await page.route('**/api/broker/magazine/subscribers**', async (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /\/subscribers$/.test(new URL(req.url()).pathname)) {
      captured.subscriberPost.push({ t: Date.now(), body: jsonBody(req) });
    } else if (req.method() === 'PATCH') {
      captured.subscriberPatch.push({ t: Date.now(), url: new URL(req.url()).pathname, body: jsonBody(req) });
    } else if (req.method() === 'POST' && /\/intent$/.test(new URL(req.url()).pathname)) {
      return route.fulfill({ status: 200, json: { ok: true, count: 0, created: 0, reason: 'NO_EVIDENCE' } });
    }
    return route.continue();
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Tutorial Part1 Golden — 매거진 만들기 & 편집하기 (D-01)', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1440, height: 900 }, acceptDownloads: true });

  test.beforeAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(async () => {
    const cleanup: Record<string, any> = {};
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && key) {
        const sb = createClient(url, key, { auth: { persistSession: false } });
        const subs = await sb
          .from('magazine_subscribers')
          .delete()
          .like('subscriber_name', 'E2E_TUT1_%')
          .like('subscriber_phone', '0100000%')
          .select('id, subscriber_name, subscriber_phone');
        cleanup.subscribers = subs.error ? `error: ${subs.error.message}` : subs.data;
        // 실서버 초안 로드가 새 행을 만들었다면(created=true) 그 행만 되돌린다
        if (notes.realDraft?.created === true && store.edition?.id) {
          const ed = await sb.from('magazine_editions').delete().eq('id', store.edition.id).gte('created_at', RUN_START).select('id');
          cleanup.createdDraft = ed.error ? `error: ${ed.error.message}` : ed.data;
        }
        const iss = await sb.from('magazine_issues').select('id, broker_id, issue_date, created_at').eq('broker_id', BROKER_SLUG).gte('created_at', RUN_START);
        cleanup.issuesCreatedDuringRun = iss.error ? `error: ${iss.error.message}` : iss.data;
      } else cleanup.skipped = 'no service role env';
    } catch (e) {
      cleanup.exception = String(e);
    }
    const counted = (p: boolean | 'NA') => results.filter((r) => r.pass === p).length;
    const summary = {
      runAt: new Date().toISOString(),
      subPhone: SUB_PHONE_DIGITS,
      pass: counted(true),
      fail: counted(false),
      na: counted('NA'),
      results,
      consoleErrors: consoleErrors.slice(0, 60),
      pageErrors: pageErrors.slice(0, 30),
      badResponses: badResponses.slice(0, 80),
      dialogs,
      captured: {
        draftPost: captured.draftPost.length,
        editionsPatch: captured.editionsPatch.map((p) => ({ t: p.t, status: p.status, keys: Object.keys(p.body || {}) })),
        publish: captured.publish.map((p) => ({ correction: p.body?.correction, title: p.body?.payload?.title })),
        legacyWrite: captured.legacyWrite,
        profileWrite: captured.profileWrite,
        distribute: captured.distribute,
        special: captured.special,
        activityInsert: captured.activityInsert,
        analyticsBeacon: captured.analyticsBeacon.length,
        pollPost: captured.pollPost.length,
        aiComment: captured.aiComment,
        subscriberPost: captured.subscriberPost,
        subscriberPatch: captured.subscriberPatch,
      },
      notes,
      cleanup,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n=== TUT1 GOLDEN: PASS ${summary.pass} / FAIL ${summary.fail} / NA ${summary.na} — cleanup: ${JSON.stringify(cleanup).slice(0, 200)}`);
    for (const r of results) console.log(`${r.pass === true ? 'PASS' : r.pass === 'NA' ? 'NA  ' : 'FAIL'} ${r.id} ${r.claim}${r.pass === true ? '' : ' :: ' + (r.detail || '').slice(0, 160)}`);
  });

  test('실습 1~10 — 튜토리얼 그대로 따라하기', async ({ page, baseURL }) => {
    test.setTimeout(900_000);
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
    page.on('response', (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`);
    });
    page.on('dialog', async (d) => {
      dialogs.push(`${d.type()}: ${d.message().slice(0, 100)}`);
      if (d.type() === 'beforeunload') await d.accept();
      else await d.dismiss();
    });
    await installSafetyMocks(page);

    const panel = page.locator('#editor-tabpanel');
    const tab = (label: string) =>
      page.getByRole('tab', { name: new RegExp(`^${label.replace(/[&]/g, '\\$&')}(, 작성 완료)?$`) });
    const preview = page.frameLocator('iframe[title="매거진 실시간 미리보기"]');
    const toast = (text: string | RegExp) => page.locator('[data-sonner-toast]').filter({ hasText: text });

    // ═══════════════ 사전 준비 ═══════════════
    await test.step('사전준비 로그인 화면', async () => {
      const ctx = await pwRequest.newContext({ baseURL });
      const res = await ctx.get('/login');
      const html = await res.text();
      await claim('사전준비', 'P-1', '로그인 화면에 "비밀번호를 잊으셨나요?" 링크(/reset-password)가 있다', async () => {
        expect(res.status()).toBe(200);
        expect(html).toContain('비밀번호를 잊으셨나요?');
        expect(html).toContain('/reset-password');
      });
      await ctx.dispose();
    });

    // ═══════════════ 실습 1. 에디터 접속 ═══════════════
    await test.step('실습 1 매거진 에디터에 접속하기', async () => {
      const today = kstDate();
      await page.goto('/broker/magazine-editor');
      await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 90_000 });
      await claim('실습1', '1-1', '상단 제목 "Content Studio"와 "내 매거진: test-broker-kim" 배지가 보인다', async () => {
        await expect(page.getByTestId('my-magazine-badge')).toContainText(`내 매거진: ${BROKER_SLUG}`);
      });
      await claim('실습1', '1-2', '8개 탭이 순서대로: 커버/필드노트/테마&매물/뉴스/AI비서/아웃리치/발행설정/성과', async () => {
        const names = await page.getByRole('tablist', { name: '콘텐츠 편집 단계' }).getByRole('tab').evaluateAll((els) =>
          els.map((e) => (e.getAttribute('aria-label') || '').replace(/, 작성 완료$/, '')),
        );
        expect(names).toEqual(['커버', '필드노트', '테마&매물', '뉴스', 'AI비서', '아웃리치', '발행설정', '성과']);
      });
      await claim('실습1', '1-3', '탭 이름이 한 줄로 표시된다(1440px, 줄바꿈 없음)', async () => {
        const hs = await page.getByRole('tab').evaluateAll((els) =>
          els.map((e) => (e.querySelector('span') as HTMLElement | null)?.getBoundingClientRect().height ?? 0),
        );
        notes.tabLabelHeights = hs;
        for (const h of hs) expect(h).toBeLessThanOrEqual(20);
      });
      await claim('실습1', '1-4', '헤더에 "{라벨} · 위클리", 상태 "초안", "작성 n/8 완료", 저장 상태 배지가 있다', async () => {
        await expect(page.getByText(/W\d{2}-\d{4} · 위클리/)).toBeVisible();
        await expect(page.getByTestId('editor-progress')).toHaveText(/작성 \d\/8 완료/);
        await expect(page.getByText(/자동 저장 켜짐|저장됨/).first()).toBeVisible();
      });
      await claim('실습1', '1-5', '오른쪽 미리보기는 iframe(?preview=1&edition=…)으로 격리되어 있다', async () => {
        const frame = page.getByTestId('phone-frame');
        await expect(frame).toHaveAttribute('data-preview-mode', 'iframe');
        const src = await page.locator('iframe[title="매거진 실시간 미리보기"]').getAttribute('src');
        notes.previewSrc = src;
        expect(src).toContain(`/magazine/${BROKER_SLUG}/${today}?preview=1&edition=`);
      });
      await claim('실습1', '1-6', '하단 "발행하기" 버튼이 다른 요소에 가려지지 않는다(hit-test)', async () => {
        const hit = await hitTest(page, page.getByRole('button', { name: '발행하기' }).first());
        notes.footerPublishHit = hit;
        expect(hit).toContain('발행하기');
      });
      await claim('실습1', '1-7', '"📱 실제 화면으로 보기"는 내 매거진 오늘 주소로 연결된다', async () => {
        const href = await page.getByRole('link', { name: /실제 화면으로 보기/ }).getAttribute('href');
        notes.realViewHref = href;
        expect(href).toBe(`/magazine/${BROKER_SLUG}/${today}`);
      });
      await claim('실습1', '1-8', '미리보기(iframe) 안에서 독자 분석 비콘이 발생하지 않는다', async () => {
        await page.waitForTimeout(3000);
        expect(captured.analyticsBeacon.length).toBe(0);
      });
      await shot(page, 'p1_01_editor_overview.png');
    });

    // ═══════════════ 실습 2. 커버 ═══════════════
    await test.step('실습 2 커버(표지) 꾸미기', async () => {
      await tab('커버').click();
      const tempGroup = page.getByRole('group', { name: /시장 온도/ });
      await claim('실습2', '2-1', '시장 온도 5단계 🟩적극 매수/🟨선별 매수/🟦관망/🟧조정 대기/🟥위기 경계', async () => {
        const texts = await tempGroup.getByRole('button').allInnerTexts();
        notes.tempButtons = texts;
        const flat = texts.map((t) => t.replace(/\s+/g, ''));
        expect(flat).toEqual(['🟩적극매수', '🟨선별매수', '🟦관망', '🟧조정대기', '🟥위기경계']);
      });
      await tempGroup.getByRole('button', { name: '선별 매수', exact: true }).click();
      await claim('실습2', '2-2', '"선별 매수" 선택 → 눌림 상태 + 설명 "선별적 기회 존재 — 입지·가격 따져 진입 가능"', async () => {
        await expect(tempGroup.getByRole('button', { name: '선별 매수', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(panel.getByText('선별적 기회 존재 — 입지·가격 따져 진입 가능')).toBeVisible();
      });
      for (let i = 0; i < 3; i++) await page.getByLabel(`키워드 ${i + 1}`, { exact: true }).fill(T.keywords[i]);
      await claim('실습2', '2-3', '키워드 3칸(각 최대 12자)이 편집 패널 안에 잘리지 않고 보인다', async () => {
        for (let i = 0; i < 3; i++) {
          const inp = page.getByLabel(`키워드 ${i + 1}`, { exact: true });
          await expect(inp).toHaveAttribute('maxlength', '12');
          const b = await inp.boundingBox();
          expect((b?.x ?? 999) + (b?.width ?? 999)).toBeLessThanOrEqual(460);
        }
      });
      await panel.getByPlaceholder('매거진 제목을 입력하세요').fill(T.headline);
      await panel.getByPlaceholder('고객에게 전달할 핵심 메시지를 입력하세요').fill(T.briefing);
      await claim('실습2', '2-4', '헤드라인이 미리보기 표지 대제목(h1)에 표시된다', async () => {
        await expect(preview.getByRole('heading', { level: 1 }).first()).toContainText(T.headline, { timeout: 30_000 });
      });
      await claim('실습2', '2-5', '키워드가 미리보기에 # 뱃지로 표시된다', async () => {
        for (const k of T.keywords) await expect(preview.getByText(new RegExp(`#\\s?${k}`)).first()).toBeVisible({ timeout: 15_000 });
      });
      await claim('실습2', '2-6', '커버 탭이 "작성 완료"로 표시된다(탭 진행도)', async () => {
        await expect(page.getByRole('tab', { name: '커버, 작성 완료' })).toBeVisible({ timeout: 5000 });
      });
      await shot(page, 'p1_02_cover.png');
    });

    // ═══════════════ 실습 3. 필드노트 ═══════════════
    await test.step('실습 3 필드노트(현장 이야기) 작성하기', async () => {
      await tab('필드노트').click();
      const map: [string, string][] = [
        ['주간 시장 요약', T.fieldNote.question],
        ['매수자 반응', T.fieldNote.buyerReaction],
        ['매도자 반응', T.fieldNote.sellerReaction],
        ['시장 판단', T.fieldNote.marketJudgment],
        ['독자에게 한마디', T.fieldNote.comment],
      ];
      await claim('실습3', '3-1', '5개 칸 라벨: 주간 시장 요약/매수자 반응/매도자 반응/시장 판단/독자에게 한마디', async () => {
        for (const [label] of map) await expect(panel.getByLabel(label, { exact: true })).toBeVisible();
      });
      for (const [label, v] of map) await panel.getByLabel(label, { exact: true }).fill(v);
      await claim('실습3', '3-2', '"?" 도움말 버튼을 누르면 작성 요령이 펼쳐진다', async () => {
        await panel.getByRole('button', { name: '매수자 반응 작성 도움말' }).click();
        await expect(panel.getByText('실제 현장에서 느낀 매수자 분위기를 공유하세요.')).toBeVisible();
      });
      await claim('실습3', '3-3', '필드노트 내용이 미리보기에 표시된다', async () => {
        await expect(preview.getByText(T.fieldNote.buyerReaction.slice(0, 20)).first()).toBeVisible({ timeout: 20_000 });
      });
      await shot(page, 'p1_03_field_note.png');
    });

    // ═══════════════ 실습 4. 테마 & 매물 ═══════════════
    await test.step('실습 4 테마 & 추천 매물 연결하기', async () => {
      await tab('테마&매물').click();
      await expect(panel.getByText(/주목 매물 \(\d+\/\d+\)/)).toBeVisible({ timeout: 30_000 });
      const hdr0 = await panel.getByText(/주목 매물 \(\d+\/\d+\)/).innerText();
      notes.dealHeaderInitial = hdr0;
      const m0 = /\((\d+)\/(\d+)\)/.exec(hdr0);
      const total = Number(m0?.[2] ?? 0);
      await claim('실습4', '4-1', '새 초안에서는 최근 매물 3개가 기본 선택되어 있다(필요 없으면 해제)', async () => {
        expect(total).toBeGreaterThan(0);
        expect(Number(m0?.[1])).toBe(Math.min(3, total));
      });
      await panel.getByLabel('테마 제목', { exact: true }).fill(T.themeTitle);
      await panel.getByLabel('테마 본문 (마크다운)').fill(T.themeBody);
      if (total > 3) await panel.locator('button[aria-pressed="false"]').first().click();
      await claim('실습4', '4-2', '매물 카드를 눌러 선택/해제할 수 있다(선택 수가 헤더에 반영)', async () => {
        if (total <= 3) throw new Error(`추가 선택할 매물이 없음(total=${total})`);
        await expect(panel.getByText(/주목 매물 \(4\/\d+\)/)).toBeVisible();
      });
      await claim('실습4', '4-3', '테마 제목이 미리보기 "주간 테마" 영역에 표시된다', async () => {
        await expect(preview.getByText(T.themeTitle).first()).toBeVisible({ timeout: 20_000 });
      });
      await shot(page, 'p1_04_theme_deals.png');
    });

    // ═══════════════ 실습 5. 뉴스 ═══════════════
    await test.step('실습 5 뉴스 큐레이션 관리하기', async () => {
      await tab('뉴스').click();
      const hdr = panel.getByText(/뉴스 큐레이션 \(\d+\/6 선택\)/);
      await expect(hdr).toBeVisible({ timeout: 30_000 });
      notes.newsHeaderInitial = await hdr.innerText();
      await claim('실습5', '5-1', '새 초안에서는 중요도 상위 뉴스 4개가 기본 선택되어 있다', async () => {
        await expect(hdr).toHaveText(/\(4\/6 선택\)/);
      });
      const cardsText = await panel.locator('button[aria-pressed]').allInnerTexts();
      notes.newsCardSample = cardsText.slice(0, 2);
      await claim('실습5', '5-2', '뉴스 카드에 HTML 엔티티(&quot; 등)가 그대로 보이지 않는다', async () => {
        expect(cardsText.join('\n')).not.toMatch(/&quot;|&amp;|&#39;|&lt;|&gt;/);
      });
      await claim('실습5', '5-3', '토픽은 한글로 표시된다(영문 토픽 키 노출 없음)', async () => {
        expect(cardsText.join('\n')).not.toMatch(/\b(rental|policy|market|finance|regulation|investment|general|other)\b/);
      });
      // 6개까지 채우고 7번째 시도
      for (let i = 0; i < 2; i++) await panel.locator('button[aria-pressed="false"]').first().click();
      await expect(hdr).toHaveText(/\(6\/6 선택\)/);
      await panel.locator('button[aria-pressed="false"]').first().click();
      await claim('실습5', '5-4', '7번째 뉴스를 켜면 거부되고 "최대 6개" 안내가 뜬다', async () => {
        await expect(toast('뉴스는 최대 6개까지 선택할 수 있습니다')).toBeVisible({ timeout: 4000 });
        await expect(hdr).toHaveText(/\(6\/6 선택\)/);
      });
      await shot(page, 'p1_05_news.png');
    });

    // ═══════════════ 실습 6. AI 비서 ═══════════════
    await test.step('실습 6 AI 비서 활용하기', async () => {
      let aiMode: 'ok' | 'fail' = 'ok';
      await page.route('**/api/broker/studio/ai-comment', async (route: Route) => {
        const body = jsonBody(route.request());
        captured.aiComment.push({ mode: aiMode, body });
        if (aiMode === 'fail') {
          return route.fulfill({
            status: 502,
            json: { ok: false, error: { code: 'LLM_UNAVAILABLE', message: 'AI 서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' } },
          });
        }
        return route.fulfill({ status: 200, json: { ok: true, result: { comment: T.aiResult }, warnings: [] } });
      });
      await tab('AI비서').click();
      await panel.locator('#ai-assist-idea').fill(T.aiMemo);
      const gen = panel.getByRole('button', { name: '✨ AI 말투 생성하기' });
      await gen.click();
      await claim('실습6', '6-1', '"✨ AI 말투 생성하기" → 요청 본문이 {comment: 메모}(서버 계약)', async () => {
        await expect.poll(() => captured.aiComment.length).toBeGreaterThan(0);
        expect(captured.aiComment[0].body).toEqual({ comment: T.aiMemo });
      });
      await claim('실습6', '6-2', '결과가 "AI 추천 화법 (수정 가능)" 편집 칸에 표시되고 직접 고칠 수 있다', async () => {
        await expect(panel.getByText('AI 추천 화법 (수정 가능)')).toBeVisible({ timeout: 8000 });
        const r = panel.locator('#ai-assist-result');
        await expect(r).toHaveValue(T.aiResult);
        await r.fill(T.aiEdited);
        await expect(r).toHaveValue(T.aiEdited);
      });
      await claim('실습6', '6-3', '"복사" → 수정한 문장이 클립보드에 복사된다', async () => {
        await panel.getByRole('button', { name: '복사', exact: true }).click();
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        expect(clip).toBe(T.aiEdited);
      });
      await shot(page, 'p1_06_ai_assist.png');
      await claim('실습6', '6-4', '"필드노트에 넣기" → 필드노트 "독자에게 한마디"에 들어가고 필드노트 탭으로 이동', async () => {
        await panel.getByRole('button', { name: '필드노트에 넣기' }).click();
        await expect(tab('필드노트')).toHaveAttribute('aria-selected', 'true');
        await expect(panel.getByLabel('독자에게 한마디', { exact: true })).toHaveValue(T.aiEdited);
      });
      // 실패(크레딧 소진/LLM 장애) 1케이스: 사용자 언어 오류 + 원문 보존
      await tab('AI비서').click();
      aiMode = 'fail';
      const memoNow = await panel.locator('#ai-assist-idea').inputValue();
      await panel.getByRole('button', { name: '✨ AI 말투 생성하기' }).click();
      await claim('실습6', '6-5', 'AI 서비스 오류(502) 시 사용자 언어 오류 안내 + 입력 메모 보존', async () => {
        await expect(toast('AI 서비스를 일시적으로 사용할 수 없습니다')).toBeVisible({ timeout: 6000 });
        await expect(panel.locator('#ai-assist-idea')).toHaveValue(memoNow);
        expect(memoNow).toBe(T.aiMemo);
      });
      await shot(page, 'p1_06b_ai_error.png');
    });

    // ═══════════════ 실습 7. 구독자 & QR ═══════════════
    await test.step('실습 7 구독자 관리 & QR 코드', async () => {
      await tab('아웃리치').click();
      await expect(panel.getByText(/총 \d+명 중 \d+명 표시/)).toBeVisible({ timeout: 30_000 });
      await claim('실습7', '7-1', '발송 상태 안내가 정직하게 표시된다(발송 중지 시 "현재 발송 기능이 꺼져 있어요")', async () => {
        const sendEnabled = notes.realMeta?.sendEnabled;
        if (sendEnabled === false) await expect(panel.getByText(/현재 발송 기능이 꺼져 있어요/)).toBeVisible();
        else await expect(panel.getByText(/발송 일정: 매주 화요일 오전/)).toBeVisible();
      });
      await claim('실습7', '7-2', '매수 온도 필터 5종: 🔥 적극검토/📈 관심/⏸️ 관망/❄️ 냉각/⚪ 미확인', async () => {
        const g = panel.getByRole('group', { name: '매수 온도 필터' });
        for (const l of ['🔥 적극검토', '📈 관심', '⏸️ 관망', '❄️ 냉각', '⚪ 미확인']) await expect(g.getByRole('button', { name: l })).toBeVisible();
      });

      // 구독자 추가 (실서버 1건, E2E_TUT1_)
      await panel.getByRole('button', { name: '추가', exact: true }).first().click();
      const add = page.getByRole('dialog', { name: '새 구독자 추가' });
      await expect(add).toBeVisible();
      await add.getByLabel(/^이름/).fill(SUB_NAME);
      await add.getByLabel(/휴대폰 번호/).fill(SUB_PHONE_DIGITS);
      await add.getByRole('button', { name: '구독자 추가' }).click();
      await claim('실습7', '7-3', '동의 보증 체크 없이 추가하면 "수신 동의 확인에 체크해 주세요." 안내(요청 미전송)', async () => {
        await expect(add.getByText('수신 동의 확인에 체크해 주세요.')).toBeVisible();
        expect(captured.subscriberPost.length).toBe(0);
      });
      await claim('실습7', '7-4', '휴대폰 번호가 010-0000-0000 형식으로 자동 하이픈 처리된다', async () => {
        await expect(add.getByLabel(/휴대폰 번호/)).toHaveValue(fmtPhone(SUB_PHONE_DIGITS));
      });
      await add.getByLabel('고객이 수신에 동의했음을 확인합니다').check();
      await shot(page, 'p1_07_add_subscriber.png');
      const postResp = page.waitForResponse((r) => /\/api\/broker\/magazine\/subscribers$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST', { timeout: 20_000 });
      await add.getByRole('button', { name: '구독자 추가' }).click();
      const pr = await postResp.catch(() => null);
      const prJson = pr ? await pr.json().catch(() => null) : null;
      notes.subscriberPostResponse = { status: pr?.status(), consentRecorded: prJson?.consentRecorded, existing: prJson?.existing, error: prJson?.error };
      await claim('실습7', '7-5', '구독자 추가 요청 payload 계약 {name, phone(숫자만), channel:"kakao", consentAttested:true}', async () => {
        const b = captured.subscriberPost[0]?.body;
        expect(b).toMatchObject({ name: SUB_NAME, phone: SUB_PHONE_DIGITS, channel: 'kakao', consentAttested: true });
      }, { needsMigration: true });
      await claim('실습7', '7-6', '추가 결과를 정직하게 안내(동의 기록 컬럼 미적용이면 "동의 이력은 남지 않았어요" 고지)', async () => {
        expect(pr?.status()).toBe(201);
        if (prJson?.consentRecorded === false) await expect(toast(/동의 기록 저장 기능이 아직 준비되지 않아/)).toBeVisible({ timeout: 5000 });
        else await expect(toast('구독자를 추가했어요.')).toBeVisible({ timeout: 5000 });
      }, { needsMigration: true });
      const list = panel.getByRole('list', { name: '구독자 목록' });
      const row = list.getByRole('button', { name: new RegExp(SUB_NAME) });
      await claim('실습7', '7-7', '목록에 새 구독자가 "⚪ 미확인" 온도로 표시된다', async () => {
        await expect(row).toBeVisible({ timeout: 15_000 });
        await expect(row).toContainText('미확인');
      });

      // 구독자 상세 + 태그 사전
      await row.click();
      const detail = page.getByRole('dialog', { name: '구독자 상세' });
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: '관심 권역 강남·서초 추가' }).click();
      await detail.getByRole('button', { name: '자산 유형 꼬마빌딩 추가' }).click();
      await shot(page, 'p1_08_subscriber_detail.png');
      const patchResp = page.waitForResponse((r) => r.request().method() === 'PATCH' && /\/api\/broker\/magazine\/subscribers\//.test(r.url()), { timeout: 15_000 });
      await detail.getByRole('button', { name: '변경사항 저장' }).click();
      const ptr = await patchResp.catch(() => null);
      const ptrJson = ptr ? await ptr.json().catch(() => null) : null;
      notes.subscriberPatchResponse = { status: ptr?.status(), body: JSON.stringify(ptrJson)?.slice(0, 300) };
      await claim('실습7', '7-8', '태그 저장 payload 계약 {interest_profile:{tags:{regions:["강남·서초"], assetTypes:["꼬마빌딩"]}}}', async () => {
        const b = captured.subscriberPatch[0]?.body;
        expect(b?.interest_profile?.tags?.regions).toEqual(['강남·서초']);
        expect(b?.interest_profile?.tags?.assetTypes).toEqual(['꼬마빌딩']);
      }, { needsMigration: true });
      await claim('실습7', '7-9', '태그 저장 결과를 정직하게 안내(성공 "변경사항을 저장했어요." 또는 원시 DB 오류 없는 사용자 언어 오류)', async () => {
        expect(ptr).not.toBeNull();
        if (ptr!.ok()) {
          await expect(toast('변경사항을 저장했어요.').or(detail.getByText('변경사항을 저장했어요.'))).toBeVisible({ timeout: 5000 });
        } else {
          const alertTxt = (await detail.getByRole('alert').allInnerTexts()).join(' ') + ' ' + (await page.locator('[data-sonner-toast]').allInnerTexts()).join(' ');
          notes.subscriberPatchErrorText = alertTxt.slice(0, 200);
          expect(alertTxt).toMatch(/[가-힣]/);
          expect(alertTxt).not.toMatch(RAW_DB_TOKENS);
        }
      }, { needsMigration: true });
      await claim('실습7', '7-10', '구독자 상세 모달의 "닫기"가 가려지지 않고 닫힌다', async () => {
        const close = detail.getByRole('button', { name: '닫기' });
        const hit = await hitTest(page, close);
        notes.detailCloseHit = hit;
        expect(hit).toContain('닫기');
        await close.click();
        await expect(detail).toBeHidden();
      });

      // QR
      await panel.getByRole('button', { name: 'QR 코드' }).click();
      const qr = page.getByRole('dialog', { name: '오프라인 구독 QR 코드' });
      await expect(qr).toBeVisible();
      const expectedQr = `/magazine/${BROKER_SLUG}/subscribe?source=qr_card`;
      await claim('실습7', '7-11', `QR 이 내 구독 페이지(${expectedQr})를 가리킨다`, async () => {
        const al = await qr.getByRole('img', { name: /구독 페이지로 연결되는 QR 코드/ }).getAttribute('aria-label');
        notes.qrAria = al;
        expect(al).toContain(expectedQr);
        await expect(qr.getByText(new RegExp(expectedQr.replace(/[?]/g, '\\?')))).toBeVisible();
      });
      await claim('실습7', '7-12', '명함 인쇄 문구에 발송 요일과 내 이름이 들어간다("중개사중개사" 등 중복 없음)', async () => {
        const txt = await qr.getByText(/스마트폰 카메라로 비추시면/).innerText();
        notes.qrPrintText = txt;
        expect(txt).toContain('화요일');
        expect(txt).not.toMatch(/중개사중개사|undefined|null/);
        expect(txt).toMatch(new RegExp(`(${notes.displayName ?? '___'}|${BROKER_SLUG}|김테스트)`));
      });
      const dlP = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
      await qr.getByRole('button', { name: /인쇄용 QR \(8cm · 300DPI\)/ }).click();
      const dl = await dlP;
      await claim('실습7', '7-13', '"인쇄용 QR (8cm · 300DPI)" → 2400×2400 PNG, pHYs 300DPI', async () => {
        expect(dl).not.toBeNull();
        const p = path.join(OUT_DIR, 'qr_download.png');
        await dl!.saveAs(p);
        const info = pngInfo(fs.readFileSync(p));
        notes.qrPng = { ...info, name: dl!.suggestedFilename() };
        expect(info.w).toBe(2400);
        expect(info.h).toBe(2400);
        expect(info.dpiX).toBe(300);
        expect(dl!.suggestedFilename()).toContain(BROKER_SLUG);
      });
      await shot(page, 'p1_09_qr_modal.png');
      await claim('실습7', '7-14', 'QR 모달 "닫기"가 가려지지 않고 닫힌다(미리보기 위에 표시)', async () => {
        const close = qr.getByRole('button', { name: '닫기' });
        const hit = await hitTest(page, close);
        notes.qrCloseHit = hit;
        expect(hit).toContain('닫기');
        await close.click();
        await expect(qr).toBeHidden();
      });
    });

    // ═══════════════ 실습 8. 발행 설정 ═══════════════
    await test.step('실습 8 발행 설정하기', async () => {
      await tab('발행설정').click();
      await claim('실습8', '8-1', `에디션 라벨이 이번 주(KST ISO 주차 ${kstIsoWeekLabel()})로 자동 표시된다`, async () => {
        await expect(panel.getByText(kstIsoWeekLabel(), { exact: true })).toBeVisible();
      });
      await claim('실습8', '8-2', '매거진 주소(Slug)는 읽기 전용으로 표시된다', async () => {
        const s = panel.locator('#editor-slug');
        await expect(s).toHaveValue(BROKER_SLUG);
        expect(await s.getAttribute('readonly')).not.toBeNull();
      });
      await panel.getByRole('button', { name: '테마 컬러 #10b981' }).click();
      await claim('실습8', '8-3', '테마 컬러 스와치 선택 → 눌림 상태', async () => {
        await expect(panel.getByRole('button', { name: '테마 컬러 #10b981' })).toHaveAttribute('aria-pressed', 'true');
      });
      const seg = panel.getByRole('radiogroup', { name: '발송 대상' });
      await claim('실습8', '8-4', '발송 대상 3종: 전체 구독자(기본)/매수 관심/매도 관심', async () => {
        const names = await seg.getByRole('radio').allInnerTexts();
        notes.segments = names;
        expect(names.map((n) => n.trim().split('\n')[0])).toEqual(['전체 구독자', '매수 관심', '매도 관심']);
        await expect(seg.getByRole('radio', { name: /전체 구독자/ })).toHaveAttribute('aria-checked', 'true');
      });
      await panel.getByLabel('투표 질문').fill(T.pollQuestion);
      for (let i = 0; i < 3; i++) await panel.getByLabel(`선택지 ${i + 1}`, { exact: true }).fill(T.pollChoices[i]);
      await panel.getByRole('checkbox', { name: '판매자 의도' }).nth(2).check();
      await claim('실습8', '8-5', '"1-Click 투표 (선택)" — 질문·선택지 입력 + 3번에 "판매자 의도" 체크 → 미리보기에 투표 표시', async () => {
        await expect(panel.getByText('1-Click 투표 (선택)')).toBeVisible();
        await expect(preview.getByText(T.pollQuestion).first()).toBeVisible({ timeout: 20_000 });
      });
      const sentiment = panel.getByRole('checkbox', { name: '🌡️ 심리지수' });
      await sentiment.uncheck();
      await claim('실습8', '8-6', '"섹션 순서·노출"에서 체크를 끄면 해당 섹션이 숨겨진다(12개 섹션 목록)', async () => {
        await expect(panel.getByText('섹션 순서·노출')).toBeVisible();
        await expect(sentiment).not.toBeChecked();
        expect(await panel.getByRole('button', { name: /위로$/ }).count()).toBe(12);
      });
      await claim('실습8', '8-7', '"⬇️ 이미지 다운로드"(원페이지 1080x1920)는 발행 전에는 비활성', async () => {
        await expect(panel.getByRole('button', { name: '⬇️ 이미지 다운로드' })).toBeDisabled();
      });
      await shot(page, 'p1_10_publish_settings.png');
    });

    // ═══════════════ 실습 9. 저장·복원·발행 ═══════════════
    await test.step('실습 9 저장하고 발행하기', async () => {
      // (1) 자동 저장: 마지막 입력 3초 뒤 PATCH
      await expect(page.getByText(/저장됨 · \d{2}:\d{2}/)).toBeVisible({ timeout: 15_000 });
      await tab('커버').click();
      const before = captured.editionsPatch.length;
      const t0 = Date.now();
      await panel.getByPlaceholder('매거진 제목을 입력하세요').press('End');
      await panel.getByPlaceholder('매거진 제목을 입력하세요').pressSequentially(' ');
      await panel.getByPlaceholder('매거진 제목을 입력하세요').press('Backspace');
      await panel.getByLabel('키워드 3', { exact: true }).fill(T.keywords[2] + ' ');
      await panel.getByLabel('키워드 3', { exact: true }).fill(T.keywords[2]);
      await panel.getByLabel('키워드 1', { exact: true }).fill(T.keywords[0] + '!');
      const tEdit = Date.now();
      await expect.poll(() => captured.editionsPatch.length, { timeout: 15_000 }).toBeGreaterThan(before);
      const dt = captured.editionsPatch[before].t - tEdit;
      notes.autosaveDelayMs = dt;
      notes.autosaveSinceStepStartMs = captured.editionsPatch[before].t - t0;
      await claim('실습9', '9-1', '입력을 멈추고 약 3초 뒤 자동 저장(PATCH /api/magazine/editions)된다', async () => {
        expect(dt).toBeGreaterThanOrEqual(2500);
        expect(dt).toBeLessThanOrEqual(8000);
      });
      await claim('실습9', '9-2', '저장 상태 배지가 "저장됨 · HH:MM"으로 바뀐다', async () => {
        await expect(page.getByText(/저장됨 · \d{2}:\d{2}/)).toBeVisible({ timeout: 8000 });
      });
      await panel.getByLabel('키워드 1', { exact: true }).fill(T.keywords[0]);
      await expect(page.getByText(/저장됨 · \d{2}:\d{2}/)).toBeVisible({ timeout: 12_000 });
      await shot(page, 'p1_11_autosave_badge.png');
      const last = captured.editionsPatch[captured.editionsPatch.length - 1]?.body || {};
      await claim('실습9', '9-3', '저장 payload 에 실습 2~8 입력 전부(헤드라인·온도·키워드·필드노트·테마·매물·뉴스 6·투표·대상·섹션 노출)가 들어간다', async () => {
        expect(last.title).toBe(T.headline);
        expect(last.market_temp).toBe('선별 매수');
        expect(last.cover_keywords).toEqual(T.keywords);
        expect(last.field_note?.buyerReaction).toBe(T.fieldNote.buyerReaction);
        expect(last.field_note?.comment).toBe(T.aiEdited);
        expect(last.theme_title).toBe(T.themeTitle);
        expect(last.featured_deal_ids?.length).toBeGreaterThanOrEqual(3);
        expect(last.content?.selected_news_ids?.length).toBe(6);
        expect(last.content?.poll?.question).toBe(T.pollQuestion);
        expect(last.content?.poll?.options?.[2]).toMatchObject({ label: T.pollChoices[2], intent: 'seller' });
        expect(last.target_segments).toEqual(['all']);
        expect(last.theme_color).toBe('#10b981');
        expect((last.content?.sections || []).find((s: any) => s.id === 'sentiment_index')?.enabled).toBe(false);
        expect(last).not.toHaveProperty('status');
      });
      await claim('실습9', '9-4', '임시저장은 공개 주소를 바꾸지 않는다(레거시 공개 행 쓰기 0건, 공개 페이지에 초안 미노출)', async () => {
        expect(captured.legacyWrite.length).toBe(0);
        const ctx = await pwRequest.newContext({ baseURL });
        const r = await ctx.get(`/magazine/${BROKER_SLUG}/${kstDate()}`);
        const html = await r.text();
        notes.publicPageStatusBeforePublish = r.status();
        expect(html).not.toContain(T.headline);
        await ctx.dispose();
      });

      // (2) 저장 실패 → 빨간 배지 + 다시 시도
      store.failNextPatch = true;
      await panel.getByLabel('키워드 2', { exact: true }).fill(T.keywords[1] + '.');
      await claim('실습9', '9-5', '저장 실패(500) 시 "저장 실패" 배지와 "다시 시도" 버튼이 뜨고, 다시 시도하면 저장된다', async () => {
        await expect(page.getByText('저장 실패', { exact: true })).toBeVisible({ timeout: 12_000 });
        await expect(page.getByText('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.')).toBeVisible();
        await shot(page, 'p1_11b_save_failed.png');
        await panel.getByLabel('키워드 2', { exact: true }).fill(T.keywords[1]);
        await page.getByRole('button', { name: '다시 시도' }).click();
        await expect(page.getByText(/저장됨 · \d{2}:\d{2}/)).toBeVisible({ timeout: 12_000 });
      });

      // (3) 수동 저장 버튼
      await page.getByRole('button', { name: '저장', exact: true }).click();
      await claim('실습9', '9-6', '헤더 "저장" 버튼 → "저장되었습니다" 안내', async () => {
        await expect(toast('저장되었습니다')).toBeVisible({ timeout: 6000 });
      });

      // (4) 다시 접속(새로고침) → 전 필드 복원
      await page.waitForTimeout(500);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 60_000 });
      await tab('커버').click();
      const restored: Record<string, any> = {
        headline: await panel.getByPlaceholder('매거진 제목을 입력하세요').inputValue(),
        kw: [await page.getByLabel('키워드 1', { exact: true }).inputValue(), await page.getByLabel('키워드 2', { exact: true }).inputValue(), await page.getByLabel('키워드 3', { exact: true }).inputValue()],
        temp: await page.getByRole('group', { name: /시장 온도/ }).getByRole('button', { name: '선별 매수', exact: true }).getAttribute('aria-pressed'),
      };
      await tab('필드노트').click();
      restored.buyer = await panel.getByLabel('매수자 반응', { exact: true }).inputValue();
      await tab('테마&매물').click();
      restored.theme = await panel.getByLabel('테마 제목', { exact: true }).inputValue();
      restored.dealHdr = await panel.getByText(/주목 매물 \(\d+\/\d+\)/).innerText().catch(() => '');
      await tab('뉴스').click();
      restored.newsHdr = await panel.getByText(/뉴스 큐레이션 \(\d+\/6 선택\)/).innerText().catch(() => '');
      await tab('발행설정').click();
      restored.poll = await panel.getByLabel('투표 질문').inputValue();
      restored.sentimentChecked = await panel.getByRole('checkbox', { name: '🌡️ 심리지수' }).isChecked();
      notes.restored = restored;
      await claim('실습9', '9-7', '다시 접속하면 헤드라인뿐 아니라 키워드·온도·필드노트·테마·매물·뉴스·투표·섹션 노출이 모두 복원된다', async () => {
        expect(restored.headline).toBe(T.headline);
        expect(restored.kw).toEqual(T.keywords);
        expect(restored.temp).toBe('true');
        expect(restored.buyer).toBe(T.fieldNote.buyerReaction);
        expect(restored.theme).toBe(T.themeTitle);
        expect(restored.dealHdr).toMatch(/\(4\/\d+\)/);
        expect(restored.newsHdr).toMatch(/\(6\/6 선택\)/);
        expect(restored.poll).toBe(T.pollQuestion);
        expect(restored.sentimentChecked).toBe(false);
      });

      // (5) 발행: 확인 모달 → 원자 발행 → 발송(중지) 안내 → 공유 모달
      const pubBefore = captured.publish.length;
      await page.getByRole('button', { name: '발행하기' }).first().click();
      const confirm = page.getByRole('dialog', { name: '발행 확인' });
      await claim('실습9', '9-8', '"발행하기" → 발행 확인 모달(발행 날짜·발송 대상·수신자 수·발송 여부)이 먼저 뜨고, 아직 발행 요청은 없다', async () => {
        await expect(confirm).toBeVisible({ timeout: 10_000 });
        await expect(confirm.getByText(kstDate())).toBeVisible();
        await expect(confirm.getByText('전체 구독자')).toBeVisible();
        await expect(confirm.getByText(/\d+명|확인 중/).first()).toBeVisible();
        if (notes.realMeta?.sendEnabled === false) await expect(confirm.getByText('발행만 되고 구독자 발송은 중지 상태입니다(관리자 설정)')).toBeVisible();
        expect(captured.publish.length).toBe(pubBefore);
      });
      await shot(page, 'p1_12_publish_confirm.png');
      await confirm.getByRole('button', { name: '발행하기' }).click();
      const share = page.getByRole('dialog', { name: '매거진 발행 완료!' });
      await expect(share).toBeVisible({ timeout: 20_000 });
      const pub = captured.publish[captured.publish.length - 1]?.body || {};
      await claim('실습9', '9-9', '확인 → 원자 발행 요청(correction:false, 최신 폼 payload 포함)', async () => {
        expect(pub.correction).toBe(false);
        expect(pub.payload?.title).toBe(T.headline);
        expect(pub.payload?.content?.headline).toBe(T.headline);
      });
      const dist = captured.distribute[0]?.body || {};
      notes.distributePayload = dist;
      await claim('실습9', '9-10', '발송 요청 payload {editionId, date=오늘(KST), target:"all"} — 발송 중지면 "발행은 완료, 발송은 중지" 안내', async () => {
        expect(dist.editionId).toBe(store.edition?.id);
        expect(dist.date).toBe(kstDate());
        expect(dist.target).toBe('all');
        await expect(share.getByText(/발송은 현재 중지됨/)).toBeVisible();
      });
      await claim('실습9', '9-11', '공유 모달 "개인화 매거진 링크 복사하기" → 오늘(KST) 내 매거진 주소', async () => {
        await share.getByRole('button', { name: '개인화 매거진 링크 복사하기' }).click();
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        notes.copiedLink = clip;
        expect(clip).toBe(`${new URL(baseURL!).origin}/magazine/${BROKER_SLUG}/${kstDate()}`);
      });
      await claim('실습9', '9-12', '공유 모달에 "카카오톡으로 1:1 수동 공유" 버튼', async () => {
        await expect(share.getByRole('button', { name: '카카오톡으로 1:1 수동 공유' })).toBeVisible();
      });
      await shot(page, 'p1_13_share_modal.png');
      await share.getByRole('button', { name: '닫기' }).click();

      // (6) 발행 후: 잠금 + 정정 발행
      await claim('실습9', '9-13', '발행 후: 상태 "발행됨", 헤더 "저장" 버튼 사라짐, 하단 "정정 발행" + 되돌릴 수 없음 안내', async () => {
        await expect(page.getByText('발행됨').first()).toBeVisible();
        await expect(page.getByRole('button', { name: '저장', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: '정정 발행' })).toBeVisible();
        await expect(page.getByText(/초안으로 되돌릴 수 없습니다/)).toBeVisible();
      });
      const patchesBefore = captured.editionsPatch.length;
      await tab('커버').click();
      await panel.getByPlaceholder('매거진 제목을 입력하세요').fill(T.headline + ' (정정)');
      await page.waitForTimeout(4500);
      await claim('실습9', '9-14', '발행된 호수는 자동 저장되지 않는다(수정은 정정 발행으로만)', async () => {
        expect(captured.editionsPatch.length).toBe(patchesBefore);
      });
      await shot(page, 'p1_14_published_correction.png');
      await page.getByRole('button', { name: '정정 발행' }).click();
      const cconfirm = page.getByRole('dialog', { name: '정정 발행 확인' });
      await expect(cconfirm).toBeVisible({ timeout: 10_000 });
      await claim('실습9', '9-15', '정정 발행 확인: "정정 발행은 공개 페이지만 갱신하며 이메일을 다시 보내지 않습니다" → correction:true 요청', async () => {
        await expect(cconfirm.getByText('정정 발행은 공개 페이지만 갱신하며 이메일을 다시 보내지 않습니다')).toBeVisible();
        const n = captured.publish.length;
        const d = captured.distribute.length;
        await cconfirm.getByRole('button', { name: '정정 발행' }).click();
        await expect.poll(() => captured.publish.length).toBe(n + 1);
        expect(captured.publish[n].body.correction).toBe(true);
        expect(captured.publish[n].body.payload?.title).toBe(T.headline + ' (정정)');
        await expect(toast('정정 발행이 완료되었습니다')).toBeVisible({ timeout: 6000 });
        expect(captured.distribute.length).toBe(d);
      });
      const shareAgain = page.getByRole('dialog', { name: '매거진 발행 완료!' });
      if (await shareAgain.isVisible().catch(() => false)) await shareAgain.getByRole('button', { name: '닫기' }).click();
      await tab('발행설정').click();
      await claim('실습9', '9-16', '발행 후 "⬇️ 이미지 다운로드"·"🔗 URL 복사"가 활성화된다', async () => {
        await expect(panel.getByRole('button', { name: '⬇️ 이미지 다운로드' })).toBeEnabled();
        await expect(panel.getByRole('button', { name: '🔗 URL 복사' })).toBeEnabled();
      });
    });

    // ═══════════════ 실습 10. 성과 ═══════════════
    await test.step('실습 10 성과 확인하기', async () => {
      await tab('성과').click();
      await expect(panel.getByText('독자 인텔리전스 & 성과 대시보드')).toBeVisible({ timeout: 30_000 });
      await claim('실습10', '10-1', 'KPI 4종: 30일 총 열람 / 평균 체류시간 / 완독률 / 활성 구독자', async () => {
        for (const k of ['30일 총 열람', '평균 체류시간', '완독률', '활성 구독자']) {
          await expect(panel.getByRole('button', { name: `${k} 기준 보기` })).toBeVisible();
        }
      });
      await claim('실습10', '10-2', 'KPI 의 "기준 보기"를 누르면 정의가 펼쳐진다(30분 내 재열람은 1회)', async () => {
        await panel.getByRole('button', { name: '30일 총 열람 기준 보기' }).click();
        await expect(panel.getByRole('note').filter({ hasText: '30분' }).first()).toBeVisible();
      });
      await claim('실습10', '10-3', '매수 온도 정의 안내: 관심사·읽은 이력(40%) + 최근 행동(60%), 6개월 이상 미열람은 냉각', async () => {
        await expect(panel.getByText(/관심사·읽은 이력\(40%\)과 최근 열람·클릭 행동\(60%\)/).first()).toBeVisible();
        await expect(panel.getByText(/6개월 이상 열람이 없으면 냉각/).first()).toBeVisible();
      });
      await claim('실습10', '10-4', '매수 온도 단계 필터 5종(🔥 적극검토 등)', async () => {
        const g = panel.getByRole('group', { name: '매수 온도 단계 필터' });
        await expect(g.getByRole('button')).toHaveCount(5);
      });
      await claim('실습10', '10-5', '"지금 연락해야 할 핫리드" 영역(반응 점수 상위 10명)', async () => {
        await expect(panel.getByText('지금 연락해야 할 핫리드')).toBeVisible();
      });
      const briefBtns = panel.getByRole('button', { name: '통화 브리핑(템플릿)' });
      const realLeadCount = await briefBtns.count();
      notes.realHotLeadCount = realLeadCount;
      const pollNotMigrated = await panel.getByText('독자 투표 집계를 사용하려면 데이터베이스 업데이트가 필요합니다').isVisible().catch(() => false);
      notes.pollNotMigrated = pollNotMigrated;
      await shot(page, 'p1_15_analytics.png');

      // 통화 브리핑 UI 계약 — 실데이터에 핫리드가 없으면 응답에 1명을 주입해 UI 만 검증(스크린샷은 튜토리얼에 쓰지 않음)
      if (realLeadCount === 0) {
        await page.route('**/api/broker/magazine/analytics', async (route) => {
          if (new URL(route.request().url()).searchParams.get('subscriberId')) return route.continue();
          const resp = await route.fetch();
          const j = await resp.json().catch(() => ({}));
          j.hotLeads = [
            {
              id: 'e2e-lead-1',
              subscriber_name: 'E2E_TUT1_리드',
              subscriber_phone: '010-0000-0001',
              subscriber_email: null,
              segment: 'investor',
              channel: 'kakao',
              interest_tags: { regions: ['강남·서초'], assetTypes: ['꼬마빌딩'] },
              buyerTemperature: '📈 관심',
              temperatureReason: 'intent_floor',
              score: 62,
              totalViews: 3,
              lastActiveAt: new Date().toISOString(),
              recentSections: ['featured_deals'],
            },
          ];
          return route.fulfill({ status: 200, json: j });
        });
        await panel.getByRole('button', { name: '새로고침' }).click();
      }
      await claim('실습10', '10-6', '핫리드 "통화 브리핑(템플릿)" → "고객 통화 브리핑" 모달, "AI 생성 아님" 표기, "문구 복사"', async () => {
        await panel.getByRole('button', { name: '통화 브리핑(템플릿)' }).first().click();
        const m = page.getByRole('dialog', { name: /고객 통화 브리핑$/ });
        await expect(m).toBeVisible({ timeout: 8000 });
        await expect(m.getByText('통화 전 참고용 템플릿입니다 (AI 생성 아님).')).toBeVisible();
        await m.getByRole('button', { name: '문구 복사' }).click();
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        expect(clip).toContain('고객님, 안녕하세요');
        if (realLeadCount > 0) await shot(page, 'p1_15b_call_briefing.png');
        else await shot(page, 'x_call_briefing_contract_only.png');
        await m.getByRole('button', { name: '닫기' }).click();
      });
    });

    // ═══════════════ 부록: 모바일 390x844 ═══════════════
    await test.step('부록 모바일(390x844)에서 편집하기', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Content Studio', level: 1 })).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
      notes.mobile = m;
      await claim('모바일', 'M-1', '가로 스크롤(오버플로) 없음', async () => expect(m.sw).toBeLessThanOrEqual(m.vw + 1));
      await claim('모바일', 'M-2', '활성 탭은 이름이 보이고, 나머지 탭도 스크린리더 이름(aria-label)을 가진다', async () => {
        await expect(page.getByRole('tab', { selected: true }).locator('span').first()).toBeVisible();
        const labels = await page.getByRole('tab').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || ''));
        for (const l of labels) expect(l.length).toBeGreaterThan(0);
      });
      await claim('모바일', 'M-3', '하단 발행(정정 발행) 버튼이 가려지지 않는다', async () => {
        const btn = page.getByRole('button', { name: /^(발행하기|정정 발행)$/ }).first();
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        const hit = await hitTest(page, btn);
        notes.mobilePublishHit = hit;
        expect(hit).toMatch(/발행/);
      });
      await shot(page, 'p1_16_mobile.png');
    });

    // ═══════════════ 전체 불변식 ═══════════════
    await claim('전체', 'G-1', '세션 동안 미리보기에서 공개 분석 비콘/투표 요청 0건', async () => {
      expect(captured.analyticsBeacon.length).toBe(0);
      expect(captured.pollPost.length).toBe(0);
    });
    await claim('전체', 'G-2', '실발송 엔드포인트 호출은 발행 시 1회(mock)뿐, special 0회', async () => {
      expect(captured.distribute.length).toBe(1);
      expect(captured.special.length).toBe(0);
    });
    await claim('전체', 'G-3', '페이지 런타임 오류(pageerror) 0건', async () => {
      expect(pageErrors).toEqual([]);
    });
  });
});
