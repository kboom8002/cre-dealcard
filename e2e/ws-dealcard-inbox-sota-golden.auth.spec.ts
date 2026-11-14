/**
 * @file e2e/ws-dealcard-inbox-sota-golden.auth.spec.ts
 * @description Wave 3 / Track C Golden E2E & Senior UX Physics Audit:
 *   - Axis A: DealCard (/broker/w/dealcards) Lifecycle, Bidirectional Sync & Multi-Viewport Senior Physics
 *   - Axis B: Inbox (/broker/w/inbox) Causality Bar, Preview->Editor Focus Sync & Multi-Viewport Senior Physics
 *   - Axis C: In-App QA Pin (?qa=1) <-> /qa-signoff Hub Roundtrip & Hub UX Physics
 *   - Axis D: 3-Deal Real-World Basic PPTX Generation, 4-Fold OpenXML Gate & LibreOffice/PyMuPDF Rasterization
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  ensureDir,
  shot,
  getVisibleText,
  downloadPptx,
  analyzePptxZip,
  assertNoPoisonTokens,
  assertNoDummyData,
  assertNoEvasivePhrases,
  assertPriceBandBlocked,
  assertPriceReflected,
} from './helpers/golden-test-utils';
import { BASIC_IM_BOUNDS } from '../src/domain/building/mobile-im/pptx/basic-im-contract';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const ARTIFACT_DIR =
  process.env.SOTA_AUDIT_OUT ||
  'C:/Users/User/.gemini/antigravity/brain/ab2d6630-6d53-432f-b049-2749817d2eec';

const SCRATCH_DIR = path.join(ARTIFACT_DIR, 'scratch');
const PPTX_AUDIT_DIR = path.join(ARTIFACT_DIR, 'pptx_3deals_audit');
const LO_PROFILE_DIR = path.join(SCRATCH_DIR, 'lo-profile-wave3');
const SOFFICE_EXE = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

interface UxPhysicsSnapshot {
  screen: string;
  viewport: string;
  fontScale: string;
  horizontalOverflowPx: number;
  visibleInteractiveCount: number;
  sub44Buttons: Array<{ text: string; testId: string | null; width: number; height: number }>;
  sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
}

async function collectUxPhysics(
  page: Page,
  screen: string,
  viewport: string,
  fontScale: string
): Promise<UxPhysicsSnapshot> {
  return await page.evaluate(
    ({ screenName, vp, fsMode }) => {
      const isVisible = (el: Element): boolean => {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.offsetParent && getComputedStyle(htmlEl).position !== 'fixed') return false;
        const style = getComputedStyle(htmlEl);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          Number(style.opacity) === 0
        ) {
          return false;
        }
        const rect = htmlEl.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };

      const overflowPx =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;

      const interactives = Array.from(
        document.querySelectorAll(
          'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]'
        )
      ).filter(isVisible);

      const sub44Buttons: Array<{
        text: string;
        testId: string | null;
        width: number;
        height: number;
      }> = [];
      const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];

      for (const el of interactives) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.hasAttribute('data-preview-unit-id')) continue;
        if (htmlEl.getAttribute('role') === 'separator') continue;
        const rect = htmlEl.getBoundingClientRect();
        const label = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || '')
          .trim()
          .slice(0, 40);
        const testId = htmlEl.getAttribute('data-testid');
        if (
          (el.tagName === 'BUTTON' ||
            el.getAttribute('role') === 'tab' ||
            el.getAttribute('role') === 'switch') &&
          Math.round(rect.height) < 44
        ) {
          sub44Buttons.push({
            text: label,
            testId,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
        if (
          el.tagName === 'BUTTON' &&
          htmlEl.scrollWidth > htmlEl.clientWidth + 6 &&
          getComputedStyle(htmlEl).textOverflow !== 'ellipsis'
        ) {
          clippedButtons.push({
            text: label,
            clientW: htmlEl.clientWidth,
            scrollW: htmlEl.scrollWidth,
          });
        }
      }

      const sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }> = [];
      const textEls = Array.from(
        document.querySelectorAll(
          'p, span, label, h1, h2, h3, h4, button, a, th, td, li'
        )
      ).filter(isVisible);
      for (const el of textEls) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'LABEL') {
          continue;
        }
        const txt = (htmlEl.innerText || '').trim();
        if (!txt) continue;
        const px = parseFloat(getComputedStyle(htmlEl).fontSize || '16');
        if (px < 14.5 && sub15Texts.length < 20) {
          sub15Texts.push({
            text: txt.slice(0, 40),
            tag: el.tagName.toLowerCase(),
            fontSizePx: Math.round(px * 10) / 10,
          });
        }
      }

      return {
        screen: screenName,
        viewport: vp,
        fontScale: fsMode,
        horizontalOverflowPx: overflowPx,
        visibleInteractiveCount: interactives.length,
        sub44Buttons: sub44Buttons.slice(0, 20),
        sub15Texts,
        clippedButtons: clippedButtons.slice(0, 15),
      };
    },
    { screenName: screen, vp: viewport, fsMode: fontScale }
  );
}

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}',
    })
    .catch(() => {});
}

async function setFontScale(page: Page, scale: 'normal' | 'xlarge') {
  await page.evaluate((s) => {
    document.documentElement.setAttribute('data-font-scale', s);
    window.localStorage.setItem('credeal-font-scale', s);
  }, scale);
  await page.waitForTimeout(350);
}

test.describe.serial('Wave 3 Track C — DealCard, Inbox, QA Signoff & 3-Deal Real PPTX Audit', () => {
  test.setTimeout(300_000);

  const shotCounter = { current: 0 };
  const physicsSnapshots: UxPhysicsSnapshot[] = [];
  const createdBuildingIds: string[] = [];
  const createdDocIds: string[] = [];
  const createdInquiryIds: string[] = [];
  let createdPinNote: string | null = null;

  test.afterAll(async () => {
    ensureDir(ARTIFACT_DIR);
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'dealcard_inbox_ux_physics_report.json'),
      JSON.stringify(
        { generatedAt: new Date().toISOString(), snapshots: physicsSnapshots },
        null,
        2
      ),
      'utf-8'
    );

    try {
      fs.rmSync(LO_PROFILE_DIR, { recursive: true, force: true });
    } catch {
      // ignore profile cleanup issues
    }

    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      if (createdDocIds.length > 0) {
        await admin.from('document_objects').delete().in('id', createdDocIds);
      }
      if (createdBuildingIds.length > 0) {
        await admin.from('document_objects').delete().in('building_id', createdBuildingIds);
        await admin.from('building_signal_cards').delete().in('building_id', createdBuildingIds);
        await admin.from('building_ssot_lite').delete().in('id', createdBuildingIds);
      }
      if (createdInquiryIds.length > 0) {
        await admin.from('im_inquiry_requests').delete().in('id', createdInquiryIds);
      }
      if (createdPinNote) {
        await admin
          .from('activity_events')
          .delete()
          .eq('entity_type', 'qa_pin')
          .eq('event_type', 'qa_pin_created')
          .filter('metadata->>note', 'eq', createdPinNote);
      }
    }
  });

  test('[Axis A] DealCard (/broker/w/dealcards) Lifecycle, Bidirectional Sync & Multi-Viewport Senior Physics', async ({
    page,
  }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.setViewportSize({ width: 1440, height: 900 });

    const summaryPromise = page
      .waitForResponse((res) => res.url().includes('/api/broker/workspace/summary'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.goto('/broker/w/dealcards', { waitUntil: 'load' });
    await summaryPromise;
    await hideDevOverlay(page);
    await page.waitForTimeout(400);

    expect(page.url()).not.toContain('/login');
    const bodyText = await getVisibleText(page);
    expect(bodyText).not.toMatch(RAW_ERROR_REGEX);

    // 1. Click [+ 새 딜카드 만들기] -> enters pre_generation
    await page.getByTestId('workspace-new-dealcard-btn').locator('visible=true').first().click();
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'pre_generation'
    );
    await expect(page.getByTestId('dealcard-pregeneration-card')).toBeVisible();
    await shot(page, ARTIFACT_DIR, 'w3_dc_01_pregeneration_1440', shotCounter);

    // 2. Click manual creation CTA -> expands Card4 editor & switches to KakaoBubblePreview
    await page.getByTestId('dealcard-pregeneration-card-primary-btn').click();
    await expect(page.getByTestId('dealcard-card4-stage')).toHaveAttribute(
      'data-collapsed',
      'false'
    );
    await expect(page.getByTestId('kakao-bubble-preview')).toBeVisible();

    // 3. Bidirectional sync: preview quadrant click -> focuses #card4-region-input
    await page.getByTestId('og-quadrant-region').click();
    await expect(page.locator('#card4-region-input')).toBeFocused();
    await expect(page.getByTestId('og-quadrant-region')).toHaveAttribute(
      'data-preview-active',
      'true'
    );

    // Reverse focus sync: focus #card4-headline-input -> activates preview-unit-headline
    await page.locator('#card4-headline-input').focus();
    await expect(page.getByTestId('preview-unit-headline')).toHaveAttribute(
      'data-preview-active',
      'true'
    );

    // Fill valid blind inputs
    await page.locator('#card4-region-input').fill('마포구 동교동 인근');
    await page.locator('#card4-use-input').fill('근린생활시설');
    await page.locator('#card4-area-input').fill('연면적 130평');
    await page.locator('#card4-priceband-input').fill('70억대');
    await page.locator('#card4-headline-input').fill('홍대입구역 역세권 코너 수익형');
    await page.locator('#card4-point-input-0').fill('도보 4분 코너 가시성 우수');

    // 4. Send / Copy -> published_clean -> edit -> published_dirty -> resync -> published_clean
    await page.getByTestId('workspace-primary-send-btn').locator('visible=true').first().click();
    await expect(page.getByTestId('presend-copy-btn')).toBeVisible();
    await page.getByTestId('presend-copy-btn').click();
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_clean',
      { timeout: 15_000 }
    );
    await page.getByTestId('presend-close-btn').click();
    await expect(page.getByTestId('presend-confirmation-sheet')).toHaveCount(0);

    await page.locator('#card4-region-input').fill('마포구 연남동 인근');
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_dirty'
    );
    await page.getByTestId('preview-causality-resync-btn').click();
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_clean'
    );
    await shot(page, ARTIFACT_DIR, 'w3_dc_02_published_clean_1440', shotCounter);

    // 5. Senior UX physics: 1440 normal
    const dcDesktopNormal = await collectUxPhysics(
      page,
      'DealCard_Desktop_Normal',
      '1440x900',
      'normal'
    );
    physicsSnapshots.push(dcDesktopNormal);
    expect(dcDesktopNormal.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(dcDesktopNormal.sub44Buttons).toHaveLength(0);
    expect(dcDesktopNormal.sub15Texts).toHaveLength(0);
    expect(dcDesktopNormal.clippedButtons).toHaveLength(0);

    // 6. Senior UX physics: 390 mobile (?tab=editor and ?tab=preview)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/w/dealcards?tab=editor', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    const dcMobileEditor = await collectUxPhysics(
      page,
      'DealCard_Mobile_Editor',
      '390x844',
      'normal'
    );
    physicsSnapshots.push(dcMobileEditor);
    expect(dcMobileEditor.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(dcMobileEditor.sub44Buttons).toHaveLength(0);
    expect(dcMobileEditor.sub15Texts).toHaveLength(0);
    expect(dcMobileEditor.clippedButtons).toHaveLength(0);

    await page.goto('/broker/w/dealcards?tab=preview', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    const dcMobilePreview = await collectUxPhysics(
      page,
      'DealCard_Mobile_Preview',
      '390x844',
      'normal'
    );
    physicsSnapshots.push(dcMobilePreview);
    expect(dcMobilePreview.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(dcMobilePreview.sub44Buttons).toHaveLength(0);
    expect(dcMobilePreview.sub15Texts).toHaveLength(0);
    expect(dcMobilePreview.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'w3_dc_03_mobile_preview_390', shotCounter);

    // 7. Senior UX physics: 1440 xlarge (21px), then reset to normal
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/dealcards', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await setFontScale(page, 'xlarge');
    const dcDesktopXlarge = await collectUxPhysics(
      page,
      'DealCard_Desktop_XLarge',
      '1440x900',
      'xlarge'
    );
    physicsSnapshots.push(dcDesktopXlarge);
    expect(dcDesktopXlarge.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(dcDesktopXlarge.sub44Buttons).toHaveLength(0);
    expect(dcDesktopXlarge.sub15Texts).toHaveLength(0);
    expect(dcDesktopXlarge.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'w3_dc_04_desktop_xlarge_1440', shotCounter);

    await setFontScale(page, 'normal');
  });

  test('[Axis B] Inbox (/broker/w/inbox) Causality Bar, Preview->Editor Focus Sync & Multi-Viewport Senior Physics', async ({
    page,
  }) => {
    const seedRes = await page.request.post('/api/public/qa-workbench', {
      data: { mode: 'seed_axis456' },
    });
    expect(seedRes.ok()).toBe(true);
    const seedJson = await seedRes.json();
    if (seedJson?.seededInquiryId && /^[0-9a-f-]{36}$/i.test(seedJson.seededInquiryId)) {
      createdInquiryIds.push(seedJson.seededInquiryId);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const inboxSummaryPromise = page
      .waitForResponse((res) => res.url().includes('/api/broker/inbox/summary'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.goto('/broker/w/inbox', { waitUntil: 'load' });
    await inboxSummaryPromise;
    await hideDevOverlay(page);
    await page.waitForTimeout(500);

    const bodyText = await getVisibleText(page);
    expect(bodyText).not.toMatch(RAW_ERROR_REGEX);
    await expect(page.getByTestId('inbox-causality-bar')).toBeVisible({ timeout: 20_000 });

    // Click Column 3 '열람 횟수' unit -> opens '기록' tab & focuses #inbox-call-note-input
    await page.getByTestId('preview-unit-inbox-history').click();
    await expect(page.getByTestId('inbox-tab-panel-history')).toBeVisible();
    await expect(page.locator('#inbox-call-note-input')).toBeFocused();
    await shot(page, ARTIFACT_DIR, 'w3_ib_01_history_sync_1440', shotCounter);

    // Click Column 3 causality bar jumps
    await page.getByTestId('inbox-causality-jump-message').click();
    await expect(page.locator('#inbox-kakao-headline-input')).toBeFocused();

    await page.getByTestId('inbox-causality-jump-todo').click();
    await expect(page.getByTestId('inbox-tab-panel-todo')).toBeVisible();

    // Desktop 1440 normal physics
    const ibDesktopNormal = await collectUxPhysics(
      page,
      'Inbox_Desktop_Normal',
      '1440x900',
      'normal'
    );
    physicsSnapshots.push(ibDesktopNormal);
    expect(ibDesktopNormal.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(ibDesktopNormal.sub44Buttons).toHaveLength(0);
    expect(ibDesktopNormal.sub15Texts).toHaveLength(0);
    expect(ibDesktopNormal.clippedButtons).toHaveLength(0);

    // Mobile 390x844 normal (List view -> select thread -> Editor view)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/w/inbox?tab=editor', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await page.waitForTimeout(500);
    const firstThreadRow = page.locator('[data-testid^="inbox-thread-row-"]').first();
    if ((await firstThreadRow.count()) > 0 && (await firstThreadRow.isVisible())) {
      const ibMobileList = await collectUxPhysics(
        page,
        'Inbox_Mobile_List',
        '390x844',
        'normal'
      );
      physicsSnapshots.push(ibMobileList);
      expect(ibMobileList.horizontalOverflowPx).toBeLessThanOrEqual(0);
      expect(ibMobileList.sub44Buttons).toHaveLength(0);
      expect(ibMobileList.sub15Texts).toHaveLength(0);
      expect(ibMobileList.clippedButtons).toHaveLength(0);
      await firstThreadRow.click();
      await page.waitForTimeout(400);
    }

    const ibMobileEditor = await collectUxPhysics(
      page,
      'Inbox_Mobile_Editor',
      '390x844',
      'normal'
    );
    physicsSnapshots.push(ibMobileEditor);
    expect(ibMobileEditor.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(ibMobileEditor.sub44Buttons).toHaveLength(0);
    expect(ibMobileEditor.sub15Texts).toHaveLength(0);
    expect(ibMobileEditor.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'w3_ib_02_mobile_editor_390', shotCounter);

    // Desktop 1440 xlarge (21px), then reset to normal
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/inbox', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await setFontScale(page, 'xlarge');
    const ibDesktopXlarge = await collectUxPhysics(
      page,
      'Inbox_Desktop_XLarge',
      '1440x900',
      'xlarge'
    );
    physicsSnapshots.push(ibDesktopXlarge);
    expect(ibDesktopXlarge.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(ibDesktopXlarge.sub44Buttons).toHaveLength(0);
    expect(ibDesktopXlarge.sub15Texts).toHaveLength(0);
    expect(ibDesktopXlarge.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'w3_ib_03_desktop_xlarge_1440', shotCounter);

    await setFontScale(page, 'normal');
  });

  test('[Axis C] In-App QA Pin (?qa=1) <-> /qa-signoff Hub Roundtrip & Hub UX Physics', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/dealcards?qa=1', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await page.waitForTimeout(400);

    const uniquePinNote = `[E2E검증] 딜카드 미리보기 여백 점검 ${Date.now()}`;
    createdPinNote = uniquePinNote;

    await page.getByTestId('qa-pin-fab').click();
    await page.getByTestId('qa-pin-severity-major').click();
    await page.getByTestId('qa-pin-note-input').fill(uniquePinNote);
    await page.getByTestId('qa-pin-submit-btn').click();
    await expect(page.getByTestId('qa-pin-feedback')).toContainText(
      '검수 허브에 화면 메모를 저장했습니다.'
    );
    await shot(page, ARTIFACT_DIR, 'w3_qa_01_pin_overlay_1440', shotCounter);

    // Turn off QA overlay cleanly before leaving workspace
    await page.getByTestId('qa-pin-disable-btn').click();

    await page.goto('/qa-signoff', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await page.waitForTimeout(400);

    await page.getByTestId('run-auto-probe-all-btn').click();
    await expect(page.getByTestId('auto-probe-results')).toContainText('4/4 자동 통과', {
      timeout: 15_000,
    });

    await page.getByTestId('refresh-qa-pins-btn').click();
    await expect(page.getByTestId('qa-pins-panel')).toContainText(uniquePinNote, {
      timeout: 15_000,
    });
    await shot(page, ARTIFACT_DIR, 'w3_qa_02_signoff_hub_1440', shotCounter);

    const qaDesktop = await collectUxPhysics(
      page,
      'QaSignoff_Desktop_Normal',
      '1440x900',
      'normal'
    );
    physicsSnapshots.push(qaDesktop);
    expect(qaDesktop.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(qaDesktop.sub44Buttons).toHaveLength(0);
    expect(qaDesktop.sub15Texts).toHaveLength(0);
    expect(qaDesktop.clippedButtons).toHaveLength(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const qaMobile = await collectUxPhysics(
      page,
      'QaSignoff_Mobile_Normal',
      '390x844',
      'normal'
    );
    physicsSnapshots.push(qaMobile);
    expect(qaMobile.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(qaMobile.sub44Buttons).toHaveLength(0);
    expect(qaMobile.sub15Texts).toHaveLength(0);
    expect(qaMobile.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'w3_qa_03_signoff_hub_mobile_390', shotCounter);
  });

  test('[Axis D] 3-Deal Real-World Basic PPTX Generation, 4-Fold OpenXML Gate & LibreOffice/PyMuPDF Rasterization', async ({
    page,
  }) => {
    const deals = [
      {
        slug: 'deal1_mapo_donggyo',
        address: '서울특별시 마포구 동교동 189-6',
        askingPriceManwon: 780000,
        posture: 'core_income',
        rentRoll: [
          {
            floor: '1F',
            use: '근린생활시설(카페)',
            depositManwon: 10000,
            monthlyRentManwon: 680,
            status: 'occupied',
          },
          {
            floor: '2F',
            use: '사무실',
            depositManwon: 8000,
            monthlyRentManwon: 520,
            status: 'occupied',
          },
          {
            floor: '3F',
            use: '사무실',
            depositManwon: 7000,
            monthlyRentManwon: 450,
            status: 'occupied',
          },
        ],
      },
      {
        slug: 'deal2_bucheon_simgok',
        address: '경기도 부천시 원미구 심곡동 385',
        askingPriceManwon: 520000,
        posture: 'owner_occupier',
        rentRoll: [
          {
            floor: '1F',
            use: '소매점',
            depositManwon: 8000,
            monthlyRentManwon: 520,
            status: 'occupied',
          },
          {
            floor: '2F',
            use: '사옥 직접사용 예정',
            depositManwon: 0,
            monthlyRentManwon: 0,
            status: 'vacant',
          },
          {
            floor: '3F',
            use: '의원',
            depositManwon: 6000,
            monthlyRentManwon: 380,
            status: 'occupied',
          },
        ],
      },
      {
        slug: 'deal3_yongin_bojeong',
        address: '경기도 용인시 기흥구 보정동 1263',
        askingPriceManwon: 1250000,
        posture: 'core_income',
        rentRoll: [
          {
            floor: '1F',
            use: '베이커리/카페',
            depositManwon: 20000,
            monthlyRentManwon: 1350,
            status: 'occupied',
          },
          {
            floor: '2F',
            use: '레스토랑',
            depositManwon: 15000,
            monthlyRentManwon: 980,
            status: 'occupied',
          },
          {
            floor: '3F',
            use: '클리닉',
            depositManwon: 12000,
            monthlyRentManwon: 780,
            status: 'occupied',
          },
          {
            floor: '4F',
            use: '오피스',
            depositManwon: 10000,
            monthlyRentManwon: 650,
            status: 'occupied',
          },
        ],
      },
    ];

    ensureDir(SCRATCH_DIR);
    ensureDir(PPTX_AUDIT_DIR);
    ensureDir(LO_PROFILE_DIR);
    const loProfileUri =
      'file:///' + LO_PROFILE_DIR.replace(/\\/g, '/').replace(/^\/+/, '');
    const auditManifest: Array<Record<string, unknown>> = [];

    for (const deal of deals) {
      const genRes = await page.request.post('/api/broker/im-lite/quick-generate', {
        data: {
          address: deal.address,
          askingPriceManwon: deal.askingPriceManwon,
          posture: deal.posture,
          rentRoll: deal.rentRoll,
        },
        timeout: 120_000,
      });
      expect(genRes.ok(), `${deal.slug} quick-generate status=${genRes.status()}`).toBe(true);
      const genJson = await genRes.json();
      const buildingId = String(genJson.buildingId || '');
      const documentId = String(genJson.documentId || '');
      expect(buildingId).toMatch(/^[0-9a-f-]{36}$/i);
      createdBuildingIds.push(buildingId);
      if (documentId) createdDocIds.push(documentId);

      const scratchPptx = path.join(SCRATCH_DIR, `${deal.slug}.pptx`);
      const scratchPdf = path.join(SCRATCH_DIR, `${deal.slug}.pdf`);
      const outDir = path.join(PPTX_AUDIT_DIR, deal.slug);
      ensureDir(outDir);

      try {
        const savedPptx = await downloadPptx(page, buildingId, documentId, scratchPptx);
        const analysis = analyzePptxZip(savedPptx);
        expect(analysis.slideCount).toBeGreaterThanOrEqual(BASIC_IM_BOUNDS.minSlides);
        expect(analysis.slideCount).toBeLessThanOrEqual(BASIC_IM_BOUNDS.maxSlides);
        assertNoPoisonTokens(analysis.slideEntries);
        assertNoDummyData(analysis.fullPptxText);
        assertNoEvasivePhrases(analysis.fullPptxText);
        assertPriceBandBlocked(analysis.fullPptxText);
        assertPriceReflected(analysis.fullPptxText, deal.askingPriceManwon);

        execFileSync(
          SOFFICE_EXE,
          [
            `-env:UserInstallation=${loProfileUri}`,
            '--headless',
            '--convert-to',
            'pdf',
            '--outdir',
            SCRATCH_DIR,
            savedPptx,
          ],
          { timeout: 120_000 }
        );

        const actualPdf = path.join(
          SCRATCH_DIR,
          path.basename(savedPptx, path.extname(savedPptx)) + '.pdf'
        );
        expect(fs.existsSync(actualPdf)).toBe(true);

        const renderOut = execFileSync(
          'python',
          [
            '-X',
            'utf8',
            path.resolve(process.cwd(), 'scripts/visual-regression-render.py'),
            '--width',
            '1280',
            `${actualPdf}=${outDir}`,
          ],
          { timeout: 120_000, encoding: 'utf-8' }
        );

        const pngs = fs
          .readdirSync(outDir)
          .filter((f) => f.startsWith('slide-') && f.endsWith('.png'))
          .sort();
        expect(pngs.length).toBe(analysis.slideCount);

        auditManifest.push({
          slug: deal.slug,
          address: deal.address,
          buildingId,
          documentId,
          pptxSlideCount: analysis.slideCount,
          mediaCount: analysis.mediaCount,
          pngCount: pngs.length,
          outDir,
          renderSummary: JSON.parse(renderOut.trim()),
        });

        try {
          if (fs.existsSync(savedPptx)) fs.unlinkSync(savedPptx);
          if (fs.existsSync(actualPdf)) fs.unlinkSync(actualPdf);
          if (fs.existsSync(scratchPdf)) fs.unlinkSync(scratchPdf);
        } catch {
          // best-effort temp cleanup
        }
      } finally {
        try {
          if (fs.existsSync(scratchPptx)) fs.unlinkSync(scratchPptx);
          if (fs.existsSync(scratchPdf)) fs.unlinkSync(scratchPdf);
        } catch {
          // ignore
        }
      }
    }

    fs.writeFileSync(
      path.join(PPTX_AUDIT_DIR, 'manifest.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), deals: auditManifest }, null, 2),
      'utf-8'
    );
  });
});
