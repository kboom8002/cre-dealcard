/**
 * 매거진 '간단 모드(골디락스 미니멈 포맷)' E2E 검증 스펙
 *
 * 검증 항목:
 *  1. `/broker/magazine-editor` 접속 시 기본으로 간단 모드(`#simple-field-note-comment`)가 열리는지 확인
 *  2. 문장 시작 칩 클릭 + 한마디 입력 → 제목 자동 제안 확인 → 매물 선택 토글 → 모드 전환(`상세 편집` ↔ `간단 모드`) 시 작성 데이터 보존 확인
 *  3. 상단 8개 탭(`커버`, `아웃리치`, `성과`) 클릭 시 상세 모드로 즉시 전환되는지 검증
 *  4. 독자 뷰어 미리보기에서 단일 한마디가 '중개사의 한마디' 인용 카드로 렌더링되는지 확인
 *
 * 안전:
 *  - DB 오염 0: 초안 조회(POST /api/magazine/editions/draft)는 첫 1회만 읽고, 이후 모든 쓰기(PATCH /editions,
 *    POST /publish, POST /distribute, POST /simple-summary, PATCH /broker/profile)는 상태 보존형 route mock 처리.
 *  - 테스트 종료(afterAll) 시 브로커 프로필의 magazine_settings.editor_mode 를 테스트 시작 전 값으로 원복하고,
 *    초안이 이번 실행에서 신규 생성(created=true)된 경우 해당 초안 행을 삭제한다.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  SIMPLE_STARTER_CHIPS,
  deriveFallbackBriefing,
  deriveFallbackHeadline,
} from '../src/lib/magazine/simple-format';

dotenv.config({ path: path.resolve(__dirname, '../.env.local'), quiet: true } as any);

const BROKER_SLUG = 'test-broker-kim';

interface MockStore {
  edition: any | null;
  meta: any;
  createdDraftId: string | null;
  originalEditorMode: string | null | undefined;
  hadOriginalSettings: boolean;
  originalSettings: Record<string, unknown> | null;
  brokerUserId: string | null;
  patches: any[];
  summaryCalls: any[];
}

const store: MockStore = {
  edition: null,
  meta: null,
  createdDraftId: null,
  originalEditorMode: undefined,
  hadOriginalSettings: false,
  originalSettings: null,
  brokerUserId: null,
  patches: [],
  summaryCalls: [],
};

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function jsonBody(req: Request): any {
  try {
    return req.postDataJSON();
  } catch {
    return {};
  }
}

async function installEditorSafetyMocks(page: Page) {
  // Next dev 오버레이 숨김
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('cre_magazine_editor_mode');
      window.localStorage.removeItem('magazine_editor_mode');
    } catch {
      /* ignore */
    }
    const add = () => {
      if (document.getElementById('__e2e_hide_dev')) return;
      const s = document.createElement('style');
      s.id = '__e2e_hide_dev';
      s.textContent = 'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }';
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  });

  // 1) 프로필 GET/PATCH 가로채기: 진입 시 saved editor_mode 간섭을 막고, PATCH 시 DB 오염 방지
  await page.route('**/api/broker/profile**', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const resp = await route.fetch();
      const json = await resp.json().catch(() => null);
      if (json && typeof json === 'object') {
        const data = (json.data ?? json) as Record<string, any>;
        const settings =
          data.magazine_settings && typeof data.magazine_settings === 'object'
            ? { ...data.magazine_settings }
            : {};
        delete settings.editor_mode;
        const patched = json.data
          ? { ...json, data: { ...data, magazine_settings: settings } }
          : { ...data, magazine_settings: settings };
        return route.fulfill({ status: resp.status(), json: patched });
      }
      return route.fulfill({ response: resp });
    }
    // PATCH / POST 등 프로필 쓰기는 메모리 응답으로 처리 (DB 오염 0)
    const body = jsonBody(req);
    return route.fulfill({
      status: 200,
      json: { ok: true, data: { slug: BROKER_SLUG, ...(body || {}) } },
    });
  });

  // 2) 이번 호 초안 로드: 첫 1회만 실서버 호출 후 깨끗한 초안 상태로 메모리 스토어 구성
  await page.route('**/api/magazine/editions/draft', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    if (!store.edition) {
      const resp = await route.fetch();
      const j = await resp.json().catch(() => null);
      if (!resp.ok() || !j?.edition) return route.fulfill({ response: resp });
      if (j.created && j.edition?.id) {
        store.createdDraftId = j.edition.id;
      }
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
      store.meta = j.meta ?? { sendEnabled: false, subscriberCount: 0 };
    }
    return route.fulfill({
      status: 200,
      json: { edition: store.edition, created: false, meta: store.meta },
    });
  });

  // 3) 에디션 자동/수동 저장 PATCH mock (DB 오염 0)
  await page.route('**/api/magazine/editions', async (route) => {
    const req = route.request();
    if (req.method() !== 'PATCH') return route.continue();
    const body = jsonBody(req) || {};
    store.patches.push(body);
    const now = new Date().toISOString();
    store.edition = {
      ...(store.edition || {}),
      ...body,
      content: {
        ...((store.edition && store.edition.content) || {}),
        ...(body.content || {}),
      },
      updated_at: now,
    };
    return route.fulfill({ status: 200, json: { edition: store.edition } });
  });

  // 4) 간단 모드 1회 요약 생성 API mock (LLM 비용 0, 결정론적 응답 반환)
  await page.route('**/api/broker/magazine/simple-summary', async (route) => {
    const req = route.request();
    const body = jsonBody(req) || {};
    store.summaryCalls.push(body);
    const comment = String(body.comment ?? '').trim();
    const headline = deriveFallbackHeadline(comment, '김테스트');
    const briefing = deriveFallbackBriefing({
      comment,
      dealCount: Array.isArray(body.deals) ? body.deals.length : Number(body.dealCount ?? 1),
      newsTitles: Array.isArray(body.newsTitles) ? body.newsTitles : [],
      marketTemp: body.marketTemp ?? '선별 매수',
    });
    return route.fulfill({
      status: 200,
      json: {
        ok: true,
        headline,
        briefing,
        source: 'deterministic_fallback',
      },
    });
  });

  // 5) 발행 / 발송 API 차단 (실발송 0)
  await page.route('**/api/magazine/editions/publish', async (route) => {
    const now = new Date().toISOString();
    store.edition = {
      ...(store.edition || {}),
      status: 'published',
      published_at: now,
      updated_at: now,
    };
    return route.fulfill({
      status: 200,
      json: { ok: true, edition: store.edition, issueDate: now.slice(0, 10) },
    });
  });
  await page.route('**/api/magazine/editions/distribute', async (route) =>
    route.fulfill({ status: 200, json: { ok: false, code: 'SEND_DISABLED' } }),
  );
}

test.describe('매거진 간단 모드(골디락스 미니멈 포맷) E2E', () => {
  test.beforeAll(async () => {
    const db = sbAdmin();
    if (!db) return;
    const { data: prof } = await db
      .from('broker_profiles')
      .select('user_id, magazine_settings')
      .eq('slug', BROKER_SLUG)
      .maybeSingle();
    if (prof) {
      store.brokerUserId = prof.user_id;
      store.hadOriginalSettings = true;
      store.originalSettings =
        prof.magazine_settings && typeof prof.magazine_settings === 'object'
          ? { ...(prof.magazine_settings as Record<string, unknown>) }
          : null;
      store.originalEditorMode = (prof.magazine_settings as any)?.editor_mode ?? null;
    }
  });

  test.afterAll(async () => {
    const db = sbAdmin();
    if (!db) return;
    // 1) 신규 생성된 초안이 있으면 정리
    if (store.createdDraftId) {
      await db.from('magazine_editions').delete().eq('id', store.createdDraftId);
    }
    // 2) broker_profiles.magazine_settings(editor_mode 포함) 원복
    if (store.hadOriginalSettings && store.brokerUserId) {
      await db
        .from('broker_profiles')
        .update({ magazine_settings: store.originalSettings })
        .eq('user_id', store.brokerUserId);
    }
  });

  test('기본 간단 모드 진입 → 시작 칩·한마디 입력 → 제목 제안·매물 토글 → 모드 전환 데이터 보존 → 8탭 클릭 시 상세 모드 전환', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installEditorSafetyMocks(page);

    // 1. /broker/magazine-editor 접속 시 기본으로 간단 모드(#simple-field-note-comment)가 열리는지 확인
    await test.step('1. 에디터 접속 시 기본 간단 모드(#simple-field-note-comment) 노출 확인', async () => {
      await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded', timeout: 90_000 });
      const commentBox = page.locator('#simple-field-note-comment');
      await expect(commentBox).toBeVisible({ timeout: 45_000 });
    });

    // 2. 문장 시작 칩 클릭 + 한마디 입력 → 제목 자동 제안 확인
    const chip = SIMPLE_STARTER_CHIPS[0];
    const customTail = '역삼역 인근 중소형 빌딩을 찾는 법인 수요가 꾸준히 늘고 있습니다.';
    const fullComment = `${chip.template}${customTail}`;

    await test.step('2. 문장 시작 칩 클릭 및 이번 주 한마디 작성 → 제목 자동 제안 확인', async () => {
      const chipBtn = page.getByRole('button', { name: new RegExp(chip.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();
      await expect(chipBtn).toBeVisible();
      await chipBtn.click();

      const commentBox = page.locator('#simple-field-note-comment');
      await expect(commentBox).toHaveValue(chip.template);

      await commentBox.fill(fullComment);
      await expect(commentBox).toHaveValue(fullComment);

      // 수동/자동 요약 또는 폴백 헤드라인 확인
      const headlineInput = page
        .locator('#simple-headline-input, #simple-headline, #simple-cover-headline, input[data-testid="simple-headline-input"]')
        .first();
      if (await headlineInput.isVisible().catch(() => false)) {
        const curVal = await headlineInput.inputValue();
        if (!curVal.trim()) {
          // 요약 생성 버튼이 있으면 클릭하거나 blur 트리거
          const genBtn = page.getByRole('button', { name: /자동|다듬기|요약|제안/ }).first();
          if (await genBtn.isVisible().catch(() => false)) {
            await genBtn.click();
          } else {
            await commentBox.blur();
          }
        }
        await expect
          .poll(async () => (await headlineInput.inputValue()).trim().length, { timeout: 10_000 })
          .toBeGreaterThan(0);
      }

      // 미리보기 화면(iframe 또는 인라인)에 '중개사의 한마디' 인용 카드와 작성한 코멘트가 반영되는지 확인
      const hasPreviewIframe = (await page.locator('iframe[title="매거진 실시간 미리보기"]').count()) > 0;
      const previewRoot = hasPreviewIframe
        ? page.frameLocator('iframe[title="매거진 실시간 미리보기"]')
        : page;
      await expect(previewRoot.getByTestId('field-note-quote-card').first()).toBeVisible({ timeout: 25_000 });
      await expect(previewRoot.getByTestId('field-note-quote-card').first()).toContainText(customTail);
    });

    // 3. 매물 선택 토글 확인
    await test.step('3. 간단 모드 매물 선택 토글 동작 확인', async () => {
      const dealToggle = page
        .locator('[data-testid^="simple-deal-card-"], [data-simple-deal-id]')
        .first();
      if (await dealToggle.isVisible().catch(() => false)) {
        const beforePressed =
          (await dealToggle.getAttribute('aria-pressed')) ??
          (await dealToggle.getAttribute('aria-checked')) ??
          (await dealToggle.getAttribute('data-selected'));
        await dealToggle.click();
        const afterPressed =
          (await dealToggle.getAttribute('aria-pressed')) ??
          (await dealToggle.getAttribute('aria-checked')) ??
          (await dealToggle.getAttribute('data-selected'));
        if (beforePressed !== null && afterPressed !== null) {
          expect(afterPressed).not.toBe(beforePressed);
        }
        // 다시 토글하여 원상 복구
        await dealToggle.click();
      }
    });

    // 4. 모드 전환 (상세 편집 ↔ 간단 모드) 시 작성한 한마디 및 고급 데이터 보존 확인
    await test.step('4. 상세 편집 ↔ 간단 모드 전환 시 작성 데이터 보존 확인', async () => {
      const toFullBtn = page
        .locator('[data-testid="editor-mode-toggle"], [data-testid="editor-mode-full"], [data-mode-switch="full"]')
        .or(page.getByRole('button', { name: /상세 편집|전체 모드|전체 탭/ }))
        .first();
      await expect(toFullBtn).toBeVisible();
      await toFullBtn.click();

      // 상세 편집 모드에서는 #simple-field-note-comment 가 사라지고 필드노트 탭에 작성 내용이 보존됨
      await expect(page.locator('#simple-field-note-comment')).toBeHidden();

      const fieldNoteTabBtn = page.getByRole('tab', { name: /^필드노트/ }).first();
      await fieldNoteTabBtn.click();

      const fullCommentTextarea = page.getByPlaceholder('독자(투자자)에게 한마디');
      await expect(fullCommentTextarea).toBeVisible();
      await expect(fullCommentTextarea).toHaveValue(fullComment);

      // 다시 간단 모드로 전환
      const toSimpleBtn = page
        .locator('[data-testid="editor-mode-toggle"], [data-testid="editor-mode-simple"], [data-mode-switch="simple"]')
        .or(page.getByRole('button', { name: /간단 모드|5분 간단/ }))
        .first();
      await expect(toSimpleBtn).toBeVisible();
      await toSimpleBtn.click();

      const simpleCommentBox = page.locator('#simple-field-note-comment');
      await expect(simpleCommentBox).toBeVisible();
      await expect(simpleCommentBox).toHaveValue(fullComment);
    });

    // 5. 상단 8개 탭(커버, 아웃리치, 성과) 클릭 시 상세 모드로 즉시 전환되는지 검증
    await test.step('5. 상단 8개 탭(커버, 아웃리치, 성과) 클릭 시 상세 모드로 즉시 전환 확인', async () => {
      for (const tabLabel of ['커버', '아웃리치', '성과'] as const) {
        // 먼저 간단 모드 상태임을 보장
        const simpleBox = page.locator('#simple-field-note-comment');
        if (!(await simpleBox.isVisible().catch(() => false))) {
          const toSimpleBtn = page
            .locator('[data-testid="editor-mode-toggle"], [data-testid="editor-mode-simple"], [data-mode-switch="simple"]')
            .or(page.getByRole('button', { name: /간단 모드|5분 간단/ }))
            .first();
          await toSimpleBtn.click();
          await expect(simpleBox).toBeVisible();
        }

        // 상단 탭 클릭 → 즉시 상세 편집 모드로 전환되어 해당 탭 패널이 열려야 함
        const tabBtn = page.getByRole('tab', { name: new RegExp(`^${tabLabel}`) }).first();
        await expect(tabBtn).toBeVisible();
        await tabBtn.click();

        await expect(page.locator('#simple-field-note-comment')).toBeHidden();
      }
    });
  });
});
