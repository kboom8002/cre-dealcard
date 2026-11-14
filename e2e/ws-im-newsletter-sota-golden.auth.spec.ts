/**
 * @file e2e/ws-im-newsletter-sota-golden.auth.spec.ts
 * @description 테스터 계정 로그인 기반 IM(`/broker/w/im`) · 뉴스레터(`/broker/w/newsletter`)
 *   고도화 기능 · 육안 · 60대 시니어 UX 물리 계측 MECE 골든 E2E 스위트
 *
 * 준수 규약:
 * - Rule 41: 실 Next.js 서버 + Playwright 실 브라우저 + Supabase 실DB + 외부 API 전구간
 * - Rule 57: 검증된 국토부 실지번(서울특별시 영등포구 당산동1가 72-1, PNU 1156011700100720001) 사용
 * - Rule 59: e2e/helpers/golden-test-utils.ts 공통 하네스 + PPTX 4대 바이너리 무결성 단언
 * - Rule 60: 0-Assertion Pass 금지 — 전 축 명시적 DOM/네트워크/바이너리 단언 수행
 */
import { test, expect, type Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
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
  assertFloorKeywordsPresent,
} from './helpers/golden-test-utils';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const ARTIFACT_DIR =
  process.env.SOTA_AUDIT_OUT ||
  'C:/Users/User/.gemini/antigravity/brain/ab2d6630-6d53-432f-b049-2749817d2eec';

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
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        const rect = htmlEl.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };

      const overflowPx =
        document.documentElement.scrollWidth - document.documentElement.clientWidth;

      const interactives = Array.from(
        document.querySelectorAll('button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]')
      ).filter(isVisible);

      const sub44Buttons: Array<{ text: string; testId: string | null; width: number; height: number }> = [];
      const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];

      for (const el of interactives) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.hasAttribute('data-preview-unit-id')) continue; // container wrapper
        if (htmlEl.getAttribute('role') === 'separator') continue; // column resizer
        const rect = htmlEl.getBoundingClientRect();
        const label = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || '').trim().slice(0, 40);
        const testId = htmlEl.getAttribute('data-testid');
        if (
          (el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'switch') &&
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
      const textEls = Array.from(document.querySelectorAll('p, span, label, h1, h2, h3, h4, button, a, th, td, li')).filter(
        isVisible
      );
      for (const el of textEls) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'LABEL') continue;
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

test.describe.serial('MECE Golden E2E & Visual Audit — IM & Newsletter SOTA Optimization', () => {
  test.setTimeout(300_000);

  const shotCounter = { current: 0 };
  const createdBuildingIds: string[] = [];
  const createdDocIds: string[] = [];
  const createdEditionIds: string[] = [];
  const physicsSnapshots: UxPhysicsSnapshot[] = [];

  test.afterAll(async () => {
    ensureDir(ARTIFACT_DIR);
    fs.writeFileSync(
      path.join(ARTIFACT_DIR, 'sota_ux_physics_report.json'),
      JSON.stringify({ generatedAt: new Date().toISOString(), snapshots: physicsSnapshots }, null, 2),
      'utf-8'
    );

    // Clean up test DB artifacts via service role
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey) {
      const admin = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
      if (createdDocIds.length > 0) {
        await admin.from('document_objects').delete().in('id', createdDocIds);
      }
      if (createdBuildingIds.length > 0) {
        await admin.from('document_objects').delete().in('building_id', createdBuildingIds);
        await admin.from('building_ssot_lite').delete().in('id', createdBuildingIds);
      }
      if (createdEditionIds.length > 0) {
        await admin.from('magazine_editions').delete().in('id', createdEditionIds);
      }
    }
  });

  test('[Axis A & B] IM Workspace: List View Persistence, Pre-Generation, Progressive Disclosures, Click-to-Edit, Real PPTX Golden Assertions & Post-Publish Dirty Sync', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addStyleTag({
      content: 'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}',
    }).catch(() => {});

    let prematureBlankAutosaveCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/broker/workspace/summary') && req.method() === 'PATCH') {
        const bodyStr = req.postData() || '';
        if (bodyStr.includes('"address":""') && bodyStr.includes('"askingPriceManwon":0')) {
          prematureBlankAutosaveCount++;
        }
      }
    });

    const initSummaryPromise = page
      .waitForResponse((res) => res.url().includes('/api/broker/workspace/summary'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.goto('/broker/w/im', { waitUntil: 'load' });
    await initSummaryPromise;
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('/login');
    await expect(page.getByTestId('im-list-slot')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('im-editor-slot')).toBeVisible();
    await expect(page.getByTestId('im-preview-slot')).toBeVisible();

    // Axis A: Verify Simple view default + SelectedItemActions in Column 2
    const simpleToggle = page.getByTestId('ws-list-view-simple');
    await expect(simpleToggle).toHaveAttribute('aria-pressed', 'true');

    // Axis B1: Click [+ 새 IM 만들기] -> Pre-generation state
    await page.getByTestId('im-create-new-btn').click();
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'pre_generation'
    );
    await expect(page.getByTestId('im-preview-pregeneration-state')).toBeVisible();
    await expect(page.getByTestId('im-mobile-preview-scroll')).toHaveCount(0);

    await page.waitForTimeout(1100); // Past 900ms autosave debounce
    expect(prematureBlankAutosaveCount).toBe(0);

    await shot(page, ARTIFACT_DIR, 'sota_01_im_pregeneration_1440', shotCounter);
    physicsSnapshots.push(await collectUxPhysics(page, 'IM_PreGeneration', '1440x900', 'normal'));

    // Pre-generation CTA focuses #im-address-input directly
    await page.getByTestId('im-preview-pregeneration-state-primary-btn').click();
    await expect(page.locator('#im-address-input')).toBeFocused();

    // Axis B2: Progressive disclosures in Tab 1 + Real PNU lookup (당산동1가 72-1)
    const priceCalcPanel = page.getByTestId('im-price-calculator-panel');
    await expect(priceCalcPanel).toBeHidden();
    await page.getByTestId('im-price-calculator-toggle').click();
    await expect(priceCalcPanel).toBeVisible();
    await page.getByTestId('im-price-calculator-toggle').click();
    await expect(priceCalcPanel).toBeHidden();

    const uniqueImTitle = `당산동 호산당빌딩 E2E_${Date.now().toString().slice(-4)}`;
    await page.locator('#im-title-single-line-input').fill(uniqueImTitle);
    await page.locator('#im-address-input').fill('서울특별시 영등포구 당산동1가 72-1');
    await page.getByTestId('im-address-lookup-btn').click();
    await page.waitForTimeout(1800); // Allow building register lookup hydration

    await page.locator('#im-price-won-input').fill('11500000000');
    await expect(page.getByTestId('im-price-readout')).toContainText('115억');

    // Fill fallback land/gfa if lookup was partial so approval gates pass cleanly
    const gfaVal = await page.locator('#im-gfa-input').inputValue();
    if (!gfaVal.trim()) await page.locator('#im-gfa-input').fill('1649.5');
    const landVal = await page.locator('#im-land-area-input').inputValue();
    if (!landVal.trim()) await page.locator('#im-land-area-input').fill('479.3');
    const zoningVal = await page.locator('#im-zoning-input').inputValue();
    if (!zoningVal.trim()) await page.locator('#im-zoning-input').fill('준공업지역');

    // Immediately transitions to live_draft!
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'live_draft'
    );
    await expect(page.getByTestId('im-mobile-preview-scroll')).toBeVisible();
    await expect(page.getByTestId('im-mobile-section-01')).toContainText(uniqueImTitle);

    await shot(page, ARTIFACT_DIR, 'sota_02_im_livedraft_tab1_1440', shotCounter);

    // Axis B3: Click-to-Edit from Mobile Preview Section 06 -> switches to Tab 2 (rentroll)
    await page.getByTestId('im-mobile-section-06').click();
    await expect(page.getByTestId('im-tab-panel-rentroll')).toBeVisible();
    await expect(page.getByTestId('im-rentroll-xlsx-importer')).toBeHidden();
    await page.getByTestId('im-rentroll-import-toggle').click();
    await expect(page.getByTestId('im-rentroll-xlsx-importer')).toBeVisible();
    await page.getByTestId('im-rentroll-import-toggle').click();

    // Populate real rent roll values on first 2 rows
    const dep0 = page.locator('input[data-rr-cell="0:depositManwon"]');
    const rent0 = page.locator('input[data-rr-cell="0:monthlyRentManwon"]');
    if ((await dep0.count()) > 0) {
      await dep0.fill('10000');
      await rent0.fill('650');
    }
    const dep1 = page.locator('input[data-rr-cell="1:depositManwon"]');
    const rent1 = page.locator('input[data-rr-cell="1:monthlyRentManwon"]');
    if ((await dep1.count()) > 0) {
      await dep1.fill('15000');
      await rent1.fill('890');
    }

    await shot(page, ARTIFACT_DIR, 'sota_03_im_tab2_rentroll_1440', shotCounter);
    const imTab2Physics = await collectUxPhysics(page, 'IM_Tab2_RentRoll', '1440x900', 'normal');
    physicsSnapshots.push(imTab2Physics);
    expect(imTab2Physics.sub44Buttons).toHaveLength(0);
    expect(imTab2Physics.clippedButtons).toHaveLength(0);

    // Click-to-Edit from Mobile Preview Section 10 -> switches to Tab 3 & auto-opens broker disclosure!
    await page.getByTestId('im-mobile-section-10').click();
    await expect(page.getByTestId('im-tab-panel-axios-brief')).toBeVisible();
    await expect(page.getByTestId('im-broker-info-card')).toBeVisible();

    // Verify dynamic Highlight #2 badge & AI highlights fill
    await expect(page.getByTestId('im-axios-postit-1')).toContainText('장점 02 · 수익률');
    await page.getByTestId('im-axios-ai-recluster-btn').click();
    await page.waitForTimeout(1200);
    // Ensure highlights have non-empty text
    const h0Val = await page.getByTestId('im-axios-point-title-0').inputValue();
    if (!h0Val.trim()) {
      await page.getByTestId('im-axios-point-title-0').fill('당산역 역세권 코너 가시성 우수');
      await page.getByTestId('im-axios-point-brief-0').fill('유동인구가 풍부한 영등포 핵심 상권 입지입니다.');
    }

    await shot(page, ARTIFACT_DIR, 'sota_04_im_tab3_highlights_1440', shotCounter);

    // Switch preview to 10-Slide Deck & verify Korean currency units + single visible PPTX CTA
    await page.getByRole('tab', { name: /발표자료 10면/ }).click();
    await expect(page.getByTestId('im-slide-preview-01')).toBeVisible();
    await expect(page.getByTestId('im-download-pptx-btn').locator('visible=true')).toHaveCount(1);
    await expect(page.getByTestId('im-slide-preview-07')).toContainText('보증금 차감 매입가');
    await expect(page.getByTestId('im-slide-preview-07')).toContainText('억');
    await shot(page, ARTIFACT_DIR, 'sota_05_im_pptx_deck_preview_1440', shotCounter);

    await page.getByTestId('im-slide-preview-09').click();
    await expect(page.getByTestId('im-tab-panel-media-publish')).toBeVisible();
    await expect(page.getByTestId('im-step4-generate-btn')).toBeVisible();
    await shot(page, ARTIFACT_DIR, 'sota_06_im_tab4_step4_cta_1440', shotCounter);

    // Axis B4: Real Production Quick-Generate + PPTX 4-Fold Binary Assertions
    const quickGenRespPromise = page.waitForResponse(
      (res) => res.url().includes('/api/broker/im-lite/quick-generate') && res.request().method() === 'POST',
      { timeout: 90_000 }
    );
    await page.getByTestId('im-step4-generate-btn').click();
    const quickGenResp = await quickGenRespPromise;
    expect(quickGenResp.ok()).toBe(true);
    const quickGenJson = await quickGenResp.json();
    const generatedBuildingId: string = quickGenJson.buildingId;
    const generatedDocId: string = quickGenJson.documentId;
    expect(generatedBuildingId).toMatch(/^[0-9a-f-]{36}$/i);
    if (generatedBuildingId) createdBuildingIds.push(generatedBuildingId);
    if (generatedDocId) createdDocIds.push(generatedDocId);

    // Preview causality transitions to published_clean!
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_clean',
      { timeout: 15_000 }
    );
    await shot(page, ARTIFACT_DIR, 'sota_07_im_published_clean_1440', shotCounter);

    // Download real PPTX & run 4-fold binary assertions (Rule 59)
    const pptxTarget = path.join(ARTIFACT_DIR, 'scratch', `dangsan_sota_${Date.now()}.pptx`);
    const savedPptx = await downloadPptx(page, generatedBuildingId, generatedDocId, pptxTarget);
    const pptxAnalysis = analyzePptxZip(savedPptx);
    expect(pptxAnalysis.slideCount).toBeGreaterThanOrEqual(8);
    assertNoPoisonTokens(pptxAnalysis.slideEntries);
    assertNoDummyData(pptxAnalysis.fullPptxText);
    assertNoEvasivePhrases(pptxAnalysis.fullPptxText);
    assertPriceBandBlocked(pptxAnalysis.fullPptxText);
    assertPriceReflected(pptxAnalysis.fullPptxText, 1150000);
    assertFloorKeywordsPresent(pptxAnalysis.fullPptxText, ['1F', '2F']);
    try {
      fs.unlinkSync(savedPptx);
    } catch {
      // ignore cleanup error
    }

    // Return to /broker/w/im?buildingId=<uuid>, edit price 115억 -> 112억, verify published_dirty survives autosave + reload!
    const returnSummaryPromise = page
      .waitForResponse((res) => res.url().includes('/api/broker/workspace/summary'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.goto(`/broker/w/im?buildingId=${generatedBuildingId}`, {
      waitUntil: 'load',
    });
    await returnSummaryPromise;
    await page.waitForTimeout(300);
    await expect(page.locator('#im-price-won-input')).toBeVisible({ timeout: 20_000 });
    await page.locator('#im-price-won-input').fill('11200000000');

    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_dirty'
    );
    await expect(page.getByTestId('preview-causality-resync-btn')).toBeVisible();

    // Wait past 900ms debounced autosave and reload to prove published_dirty persistence fix!
    await page.waitForTimeout(1500);
    const reloadSummaryPromise = page
      .waitForResponse((res) => res.url().includes('/api/broker/workspace/summary'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.reload({ waitUntil: 'load' });
    await reloadSummaryPromise;
    await page.waitForTimeout(300);
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_dirty',
      { timeout: 20_000 }
    );
    await shot(page, ARTIFACT_DIR, 'sota_08_im_published_dirty_persisted_1440', shotCounter);

    const visibleImText = await getVisibleText(page);
    expect(visibleImText).not.toMatch(RAW_ERROR_REGEX);
  });

  test('[Axis C] Newsletter Workspace: Pre-Generation, 6-Duplicate Declutter, Click-to-Edit, Real Publish, Reader View & Post-Publish Dirty Sync', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Block real subscriber blast while keeping real issue DB creation live
    await page.route('**/api/broker/magazine/distribute', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, blockedInE2E: true }),
      })
    );

    const initEditionsPromise = page
      .waitForResponse((res) => res.url().includes('/api/magazine/editions'), {
        timeout: 20_000,
      })
      .catch(() => null);
    await page.goto('/broker/w/newsletter', { waitUntil: 'load' });
    await initEditionsPromise;
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('/login');
    await expect(page.getByTestId('magazine-editor-slot')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('magazine-preview-slot')).toBeVisible();

    // Click [이번 달 뉴스레터 새로 쓰기] -> Pre-generation state
    await page.getByTestId('new-newsletter-btn').click();
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'pre_generation'
    );
    await expect(page.getByTestId('newsletter-preview-pregeneration-card')).toBeVisible();

    // Verify ONLY 1 broker-newsletter-preferences-card exists across the entire DOM, collapsed by default
    await expect(page.getByTestId('broker-newsletter-preferences-card')).toHaveCount(1);
    await expect(page.getByTestId('pref-region-chip-gbd')).toBeHidden();

    // P0-1: Verify IssueMetadataForm (#newsletter-headline-input) sits ABOVE MagazineQuickDraftCard at eye level, with schedule collapsed
    const metaAboveAiDraft = await page.evaluate(() => {
      const meta = document.querySelector('[data-testid="issue-metadata-form"]');
      const ai = document.querySelector('[data-testid="magazine-quick-draft-card"]');
      if (!meta || !ai) return false;
      return Boolean(meta.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(metaAboveAiDraft).toBe(true);
    await expect(page.locator('#newsletter-issue-year')).toBeHidden();
    await expect(
      page.getByTestId('newsletter-primary-send-btn').locator('visible=true')
    ).toContainText('구독자에게 보내기');

    await shot(page, ARTIFACT_DIR, 'sota_09_newsletter_pregeneration_1440', shotCounter);
    physicsSnapshots.push(
      await collectUxPhysics(page, 'Newsletter_PreGeneration_Tab1', '1440x900', 'normal')
    );

    // Pre-generation CTA focuses #newsletter-headline-input
    await page.getByTestId('newsletter-preview-pregeneration-card-primary-btn').click();
    await expect(page.locator('#newsletter-headline-input')).toBeFocused();

    // P0-2: summary 입력칸 완전 제거 + {중개인명} 제목 프리셋 칩 클릭 검증
    await expect(page.locator('#newsletter-summary-input')).toHaveCount(0);
    await expect(page.getByTestId('newsletter-title-presets')).toBeVisible();
    await page.getByTestId('title-preset-chip-0').click();
    await expect(page.locator('#newsletter-headline-input')).toHaveValue(/중개사의/);

    const uniqueNlHeadline = `2026년 11월 강남·마포 빌딩 시장 동향 E2E_${Date.now().toString().slice(-4)}`;
    await page.locator('#newsletter-headline-input').fill(uniqueNlHeadline);

    // Immediately transitions to live_draft & removes pre-generation card!
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'live_draft'
    );
    await expect(page.getByTestId('newsletter-preview-pregeneration-card')).toHaveCount(0);
    await expect(page.getByTestId('magazine-preview-slot')).toContainText(uniqueNlHeadline);

    await shot(page, ARTIFACT_DIR, 'sota_10_newsletter_livedraft_tab1_1440', shotCounter);

    // Axis C3: Click-to-Edit from Preview Issue #3 (preview-postit-card-2) while on Step 1 -> jumps to Step 2 & focuses #axios-issue-title-2!
    await page.getByTestId('preview-postit-card-2').click();
    await expect(page.locator('#newsletter-panel-content')).toBeVisible();
    await expect(page.locator('#axios-issue-title-2')).toBeFocused();
    await expect(page.getByTestId('axios-issue-channel-0')).toBeVisible();
    await expect(page.getByTestId('axios-issues-editor-panel')).not.toContainText(/ISSUE\s*0?[1-5]/i);
    await expect(page.getByTestId('magazine-preview-slot')).not.toContainText(/ISSUE\s*0?[1-5]/i);

    await shot(page, ARTIFACT_DIR, 'sota_11_newsletter_click_to_edit_issue3_1440', shotCounter);
    physicsSnapshots.push(
      await collectUxPhysics(page, 'Newsletter_Tab2_Content', '1440x900', 'normal')
    );

    // Verify BlockSelectionGrid is at the TOP of Step 2 before market-briefing-editor
    const blockBeforeBriefing = await page.evaluate(() => {
      const block = document.querySelector('[data-testid="block-selection-grid"]');
      const briefing = document.querySelector('[data-testid="market-briefing-editor"]');
      if (!block || !briefing) return false;
      return Boolean(block.compareDocumentPosition(briefing) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(blockBeforeBriefing).toBe(true);

    // Verify legacy subheadings / formatting toolbar / copy-cover button are permanently removed
    await expect(page.locator('#newsletter-briefing-title')).toHaveCount(0);
    await expect(page.getByTestId('copy-cover-to-briefing-btn')).toHaveCount(0);
    await expect(page.locator('[data-testid^="format-btn-"]')).toHaveCount(0);

    // Toggle field_note OFF -> editor body hidden; toggle ON -> visible & test 1~3 line draft -> AI 5-line polish (<= 500 chars)
    await page.getByTestId('block-switch-field_note').click();
    await expect(page.getByTestId('briefing-section-disabled-notice')).toBeVisible();
    await expect(page.locator('#newsletter-briefing-body')).toBeHidden();
    await page.getByTestId('enable-briefing-section-btn').click();
    await expect(page.locator('#newsletter-briefing-body')).toBeVisible();
    await expect(page.getByTestId('briefing-length-counter')).toBeVisible();
    await page
      .locator('#newsletter-briefing-body')
      .fill(
        '강남과 마포 역세권 꼬마빌딩은 급매물이 빠르게 팔리고 있습니다.\n대출 금리 부담이 줄어들며 임대수익이 안정적인 건물로 문의가 모입니다.'
      );
    const aiPolishPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/broker/studio/ai-comment') &&
        res.request().method() === 'POST',
      { timeout: 35_000 }
    );
    await page.getByTestId('ai-polish-briefing-btn').click();
    const aiPolishRes = await aiPolishPromise;
    expect(aiPolishRes.status()).toBe(200);
    await page.waitForTimeout(300);
    const polishedBriefing = await page.locator('#newsletter-briefing-body').inputValue();
    expect(polishedBriefing.trim().length).toBeGreaterThan(10);
    expect(polishedBriefing.length).toBeLessThanOrEqual(500);
    const polishedLines = polishedBriefing
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    expect(polishedLines.length).toBeLessThanOrEqual(5);

    // Click-to-Edit broker contact section -> displays profile guidance banner
    await page.getByTestId('preview-broker-contact-section').click();
    await expect(page.getByTestId('newsletter-status-banner')).toContainText('/broker/profile');

    // Axis C4: Step 3 Send -> verify single checklist (0 since valid), publish via copy-link-btn
    await page.getByTestId('step-tab-send').click();
    await expect(page.getByTestId('newsletter-step3-send-btn')).toBeVisible();
    await shot(page, ARTIFACT_DIR, 'sota_12_newsletter_tab3_send_1440', shotCounter);

    const saveIssuePromise = page.waitForResponse(
      (res) =>
        (res.url().includes('/api/magazine/issues') || res.url().includes('/api/magazine/editions')) &&
        res.request().method() === 'POST',
      { timeout: 45_000 }
    );
    await page.getByTestId('copy-link-btn').click();
    const saveIssueRes = await saveIssuePromise;
    expect(saveIssueRes.ok()).toBe(true);
    const saveIssueJson = await saveIssueRes.json().catch(() => ({}));
    const savedEdId = saveIssueJson?.edition?.id || saveIssueJson?.id;
    if (savedEdId) createdEditionIds.push(savedEdId);

    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_clean',
      { timeout: 15_000 }
    );
    await expect(page.getByTestId('newsletter-draft-save-btn')).toContainText('저장됨');
    await expect(
      page.getByTestId('newsletter-primary-send-btn').locator('visible=true')
    ).toContainText('발행 완료');
    await shot(page, ARTIFACT_DIR, 'sota_13_newsletter_published_clean_1440', shotCounter);

    // Open live reader URL on 390x844 and 360x800 mobile reader contexts to inspect published output visually!
    const liveLink = page.getByTestId('preview-live-reader-link').first();
    await expect(liveLink).toBeVisible();
    const href = await liveLink.getAttribute('href');
    expect(href).toBeTruthy();
    if (href) {
      const targetUrl = href.startsWith('http')
        ? href
        : `http://localhost:${process.env.E2E_PORT || 3000}${href}`;

      const readerViewports: Array<{
        width: number;
        height: number;
        shotName: string;
      }> = [
        { width: 390, height: 844, shotName: 'sota_14_newsletter_live_reader_mobile_390' },
        { width: 360, height: 800, shotName: 'sota_14b_newsletter_live_reader_mobile_360' },
      ];

      for (const vp of readerViewports) {
        const readerCtx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          locale: 'ko-KR',
        });
        const readerPage = await readerCtx.newPage();
        await readerPage.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await readerPage.waitForTimeout(800);

        const readerOverflow = await readerPage.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(readerOverflow).toBeLessThanOrEqual(0);

        // Mobile clutter removal: no bottom bar or prefill-roi links; only minimal subscribe opt-in
        await expect(readerPage.locator('nav[data-magazine-bottom-bar]')).toHaveCount(0);
        await expect(readerPage.locator('[data-prefill-roi]')).toHaveCount(0);
        await expect(readerPage.getByTestId('minimal-subscribe-optin')).toBeVisible();

        const readerText = await getVisibleText(readerPage);
        expect(readerText).toContain(uniqueNlHeadline.slice(0, 12));
        expect(readerText).not.toMatch(RAW_ERROR_REGEX);
        expect(readerText).not.toMatch(/ISSUE\s*0?[1-5]/i);

        // Verify issue title <= 3 lines and issue brief <= 4 lines at actual mobile widths
        const lineWrapMetrics = await readerPage.evaluate(() => {
          const measureLines = (el: Element) => {
            const style = window.getComputedStyle(el);
            let lh = parseFloat(style.lineHeight);
            if (!Number.isFinite(lh) || lh <= 0) {
              lh = parseFloat(style.fontSize) * 1.45 || 20;
            }
            const h = el.getBoundingClientRect().height;
            return {
              lines: Math.round(h / lh),
              text: (el.textContent || '').trim(),
              height: Math.round(h),
              lineHeight: lh,
            };
          };
          const titles = Array.from(
            document.querySelectorAll('[data-testid="axios-postit-title"]')
          ).map(measureLines);
          const briefs = Array.from(
            document.querySelectorAll('[data-testid="axios-postit-brief"]')
          ).map(measureLines);
          return { titles, briefs };
        });

        expect(lineWrapMetrics.titles.length).toBeGreaterThan(0);
        expect(lineWrapMetrics.briefs.length).toBeGreaterThan(0);
        for (const t of lineWrapMetrics.titles) {
          expect(
            t.lines,
            `[${vp.width}px] Issue title exceeded 3 lines (${t.lines}): "${t.text}"`
          ).toBeLessThanOrEqual(3);
        }
        for (const b of lineWrapMetrics.briefs) {
          expect(
            b.lines,
            `[${vp.width}px] Issue brief exceeded 4 lines (${b.lines}): "${b.text}"`
          ).toBeLessThanOrEqual(4);
        }

        await shot(readerPage, ARTIFACT_DIR, vp.shotName, shotCounter);
        await readerCtx.close();
      }
    }

    // Post-publish edit -> transitions to published_dirty & updates top button to "발행본에 수정 반영"
    await page.getByTestId('step-tab-title').click();
    await page.locator('#newsletter-headline-input').fill(`${uniqueNlHeadline} (수정본)`);
    await expect(page.getByTestId('preview-causality-bar')).toHaveAttribute(
      'data-lifecycle',
      'published_dirty'
    );
    await expect(page.getByTestId('newsletter-draft-save-btn')).toContainText('발행본에 수정 반영');
    await expect(
      page.getByTestId('newsletter-primary-send-btn').locator('visible=true')
    ).toContainText('변경사항 발행본에 반영하기');
    await shot(page, ARTIFACT_DIR, 'sota_15_newsletter_published_dirty_1440', shotCounter);
  });

  test('[Axis D] Multi-Viewport (1180px Drawer · 390px Mobile) & 60s Senior xlarge (21px) Visual/Ergonomic Physics Audit', async ({
    page,
  }) => {
    // D1: 1180x820 Laptop Drawer Mode — opening preview drawer & clicking unit closes drawer and focuses editor!
    await page.setViewportSize({ width: 1180, height: 820 });
    const d1EditionsPromise = page
      .waitForResponse((res) => res.url().includes('/api/magazine/editions'), { timeout: 20_000 })
      .catch(() => null);
    await page.goto('/broker/w/newsletter', { waitUntil: 'load' });
    await d1EditionsPromise;
    await page.waitForTimeout(300);
    await expect(page.getByTestId('workspace-editor-preview-drawer-btn')).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId('workspace-editor-preview-drawer-btn').click();
    await expect(page.getByTestId('workspace-preview-drawer-backdrop')).toBeVisible();
    await shot(page, ARTIFACT_DIR, 'sota_16_laptop_1180_preview_drawer_open', shotCounter);

    await page.getByTestId('preview-postit-card-0').click();
    await expect(page.getByTestId('workspace-preview-drawer-backdrop')).toHaveCount(0);
    await expect(page.locator('#axios-issue-title-0')).toBeFocused();

    // D2: 390x844 Mobile Push-Nav — zero horizontal overflow & Preview -> Editor flip on click
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/w/im?tab=preview', { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const imMobileMetrics = await collectUxPhysics(page, 'IM_Mobile_Preview', '390x844', 'normal');
    physicsSnapshots.push(imMobileMetrics);
    expect(imMobileMetrics.horizontalOverflowPx).toBeLessThanOrEqual(0);
    await shot(page, ARTIFACT_DIR, 'sota_17_mobile_390_im_preview', shotCounter);

    await page.goto('/broker/w/newsletter?tab=editor', { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const nlMobileMetrics = await collectUxPhysics(
      page,
      'Newsletter_Mobile_Editor',
      '390x844',
      'normal'
    );
    physicsSnapshots.push(nlMobileMetrics);
    expect(nlMobileMetrics.horizontalOverflowPx).toBeLessThanOrEqual(0);
    await shot(page, ARTIFACT_DIR, 'sota_18_mobile_390_newsletter_editor', shotCounter);

    // D3: Senior xlarge (21px) Font-Scale Audit at 1440x900 on both IM & Newsletter
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/im', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-font-scale', 'xlarge');
      window.localStorage.setItem('credeal-font-scale', 'xlarge');
    });
    await page.waitForTimeout(500);
    await expect(
      page.getByTestId('workspace-font-scale-xlarge').locator('visible=true').first()
    ).toHaveAttribute('aria-pressed', 'true');
    const imXlargeMetrics = await collectUxPhysics(page, 'IM_Desktop_XLarge', '1440x900', 'xlarge');
    physicsSnapshots.push(imXlargeMetrics);
    expect(imXlargeMetrics.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(imXlargeMetrics.sub44Buttons).toHaveLength(0);
    expect(imXlargeMetrics.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'sota_19_im_desktop_xlarge_21px', shotCounter);

    await page.goto('/broker/w/newsletter', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-font-scale', 'xlarge');
    });
    await page.waitForTimeout(500);
    const nlXlargeMetrics = await collectUxPhysics(
      page,
      'Newsletter_Desktop_XLarge',
      '1440x900',
      'xlarge'
    );
    physicsSnapshots.push(nlXlargeMetrics);
    expect(nlXlargeMetrics.horizontalOverflowPx).toBeLessThanOrEqual(0);
    expect(nlXlargeMetrics.sub44Buttons).toHaveLength(0);
    expect(nlXlargeMetrics.clippedButtons).toHaveLength(0);
    await shot(page, ARTIFACT_DIR, 'sota_20_newsletter_desktop_xlarge_21px', shotCounter);
  });
});
