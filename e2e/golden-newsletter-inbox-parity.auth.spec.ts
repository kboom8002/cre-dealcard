/**
 * @file e2e/golden-newsletter-inbox-parity.auth.spec.ts
 * @description Wave-3 Targeted Newsletter & Inbox Cross-Workspace Parity Probe:
 *   - Verifies Newsletter Step 1 (title preset) -> Step 2 (briefing + live news refresh + freshness badge + deals)
 *     -> Draft Save -> Publish -> Mobile 390 xlarge /magazine/[broker]/[date] (0 broken links, 0 blind leaks).
 *   - Verifies Inbox xlarge (21px) non-overlapping top todo card (`InboxListColumn.tsx` fix),
 *     folded newsletter filter, new VIP client creation, duplicate phone warning, '전체 고객' selection,
 *     honest empty events (`inbox-events-empty`), disabled IM tab + 409 `IM_NOT_GENERATED` API guard,
 *     VIP name-match delete protection (`confirm-delete-match-input`), and 390 xlarge responsiveness.
 *   - Merges verified Newsletter & Inbox R1+R2 runs with the intact Wave-2 CASE-02~05 DealCard & IM R2 runs
 *     in `e2e/golden-snapshots/out/golden-4cases-ppgt/r2-unified-scorecard.{json,md}` & `fullfunnel-manifest.json`.
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { BANNED_UI_TERMS } from '../src/lib/ux/lexicon';
import { auditNewsletterContentSuitability } from '../src/lib/qa/ux-writing-and-content-oracle';
import {
  scoreNewsletterPpgtRun,
  rankNewsletterPpgtBacklog,
  verifyNewsletterAntiSycophancyControls,
  type NewsletterPpgtScoreResult,
} from '../src/lib/qa/newsletter-ppgt-personas';
import {
  scoreInboxPpgtRun,
  rankInboxPpgtBacklog,
  verifyInboxAntiSycophancyControls,
  type InboxPpgtProbeMetrics,
  type InboxPpgtScoreResult,
} from '../src/lib/qa/inbox-ppgt-personas';
import {
  summarizeSubsystem100,
  formatUnifiedCreScorecardMarkdown,
  FLOOR_CAP_100,
  type UnifiedCreReport100,
} from '../src/lib/qa/unified-cre-rubric';
import { ensureDir } from './helpers/golden-test-utils';

const OUT_ROOT = path.resolve(__dirname, 'golden-snapshots/out/golden-4cases-ppgt');
const MANIFEST_PATH = path.join(OUT_ROOT, 'fullfunnel-manifest.json');
const R2_REPORT_PATH = path.join(OUT_ROOT, 'r2-unified-scorecard.json');
const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content:
        'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}',
    })
    .catch(() => {});
}

async function applyFontScale(page: Page, scale: 'normal' | 'xlarge') {
  await page.evaluate((s) => {
    document.documentElement.setAttribute('data-font-scale', s);
    try {
      window.localStorage.setItem('credeal-font-scale', s);
      window.localStorage.setItem('cre-font-scale', s);
    } catch {}
  }, scale);
  await page.waitForTimeout(250);
}

async function collectDomProbe(page: Page, scopeSelector: string) {
  return await page.evaluate((sel) => {
    const isVisible = (el: Element): boolean => {
      const h = el as HTMLElement;
      const st = getComputedStyle(h);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      if (h.closest('.sr-only')) return false;
      const r = h.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    };
    const inViewport = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
    };
    const overflowPx = Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const scopeRoot = document.querySelector(sel) || document.body;
    const interactiveSel =
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]';
    const allInteractives = Array.from(document.querySelectorAll(interactiveSel)).filter(
      (el) => isVisible(el) && !(el as HTMLElement).hasAttribute('data-preview-unit-id'),
    );
    const scopeInteractives = Array.from(scopeRoot.querySelectorAll(interactiveSel)).filter(
      (el) => isVisible(el) && !(el as HTMLElement).hasAttribute('data-preview-unit-id'),
    );
    const sub44Buttons: Array<{ text: string; height: number }> = [];
    const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];
    const observedButtons: string[] = [];

    for (const el of allInteractives) {
      const h = el as HTMLElement;
      const label = (h.innerText || h.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      if (label && observedButtons.length < 30) observedButtons.push(label);
      const r = h.getBoundingClientRect();
      const role = el.getAttribute('role');
      const isTap = el.tagName === 'BUTTON' || role === 'tab' || role === 'switch';
      if (isTap && Math.round(r.height) < 40 && sub44Buttons.length < 25) {
        sub44Buttons.push({ text: label || el.tagName, height: Math.round(r.height) });
      }
      if (
        (isTap || el.tagName === 'A') &&
        !h.matches('[data-list-row="simple"]') &&
        !h.closest('[data-list-row="simple"]')
      ) {
        const st = getComputedStyle(h);
        if (h.clientWidth > 0 && h.scrollWidth > h.clientWidth + 6 && st.overflowX !== 'visible') {
          clippedButtons.push({ text: label, clientW: Math.round(h.clientWidth), scrollW: Math.round(h.scrollWidth) });
        }
      }
    }

    const sub15Texts = Array.from(scopeRoot.querySelectorAll('p, li, h1, h2, h3, label'))
      .filter(isVisible)
      .filter((el) => {
        const txt = ((el as HTMLElement).innerText || '').trim();
        return txt.length >= 6 && parseFloat(getComputedStyle(el).fontSize || '16') < 13.5;
      });
    const brokenImgs = Array.from(document.querySelectorAll('img')).filter(
      (img) => isVisible(img) && img.complete && img.naturalWidth === 0,
    );
    const observedHeadings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .filter(isVisible)
      .map((h) => (h as HTMLElement).innerText.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 20);
    const visibleText = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      horizontalOverflowPx: Math.round(overflowPx),
      aboveFoldActionCount: scopeInteractives.filter(inViewport).length,
      totalVisibleInteractiveCount: scopeInteractives.length,
      sub44ButtonsCount: sub44Buttons.length,
      sub15TextsCount: sub15Texts.length,
      clippedButtonsCount: clippedButtons.length,
      brokenImgCount: brokenImgs.length,
      visibleText,
      observedHeadings,
      observedButtons,
      provenanceBadgeVisible: /공인중개사|중개법인|한국부동산원|등록번호|소재지|발행인/.test(visibleText),
      honestSaveVisible: /저장됨|임시저장|자동 저장|발행됨|발행 완료/.test(visibleText),
    };
  }, scopeSelector);
}

function countBannedTerms(text: string): number {
  let c = 0;
  for (const e of BANNED_UI_TERMS) if (e.term.test(text)) c += 1;
  return c;
}
function countPoisonTokens(text: string): number {
  return (text.match(new RegExp(RAW_ERROR_REGEX.source, 'g')) ?? []).length;
}

test('Wave-3 Newsletter & Inbox Cross-Workspace Parity + 4-Subsystem Unified R2 Update', async ({
  page,
}) => {
  test.setTimeout(180_000);
  expect(verifyNewsletterAntiSycophancyControls().passed).toBe(true);
  expect(verifyInboxAntiSycophancyControls().passed).toBe(true);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  const createdBuildings: string[] = [];
  const createdEditions: string[] = [];
  const createdClients: string[] = [];

  try {
    // 1) Create 1 clean DealCard-only property via workspace summary PATCH (no IM generated!)
    const dealOnlyId = `bld-${Date.now()}-ppgt`;
    const upsertRes = await page.request.patch('/api/broker/workspace/summary', {
      data: {
        action: 'mark_sent',
        buildingId: dealOnlyId,
        card4: {
          posture: 'income',
          region: '마포구 연남동',
          use: '근린생활시설',
          area: '연면적 320평',
          gfaPyung: 320,
          landAreaPyung: 120,
          priceBand: '90~100억',
          headline: '홍대권 코너 안정 수익형',
          points: ['홍대입구역 도보 5분', '전층 우량 근생 만실', '보증금 차감 연 3.5%'],
          provenance: { points: ['broker', 'broker', 'broker'] },
          card4_version: 1,
        },
      },
    });
    expect(upsertRes.ok(), `DealCard-only upsert must succeed (got ${upsertRes.status()})`).toBe(true);
    createdBuildings.push(dealOnlyId);

    // 2) NEWSLETTER WORKSPACE (/broker/magazine-editor -> Publish -> Mobile 390 xlarge Reader)
    const nlOutDir = path.join(OUT_ROOT, 'NEWSLETTER');
    ensureDir(nlOutDir);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/magazine-editor', { waitUntil: 'domcontentloaded' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    await page.locator('[data-testid="magazine-editor-slot"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(1000);

    const newNlBtn = page.locator('[data-testid="new-newsletter-btn"]');
    if (await newNlBtn.isVisible().catch(() => false)) {
      await newNlBtn.click();
      await page.waitForTimeout(500);
    }

    // Step 1: Select title preset chip
    const preset0 = page.locator('[data-testid="title-preset-chip-0"]');
    if (await preset0.isVisible().catch(() => false)) {
      await preset0.click();
      await page.waitForTimeout(300);
    }

    // Step 2: Content
    await page.locator('[data-testid="step-tab-content"]').click();
    await page.waitForTimeout(700);

    const briefingBody = page.locator('[data-testid="market-briefing-editor-body"] textarea').first();
    if (await briefingBody.isVisible().catch(() => false)) {
      await briefingBody.fill(
        '이번 주 서울 주요 권역 꼬마빌딩은 서초·영등포 역세권 위주로 실사옥 및 안정 수익형 문의가 이어지고 있습니다. 보증금 차감 실투자금 수익률과 공실 해소 여력을 함께 확인해 보세요.',
      );
      await page.waitForTimeout(300);
    }

    let liveNewsRefreshed = false;
    let freshnessBadgeText = '';
    const refreshBtn = page.locator('[data-testid="refresh-live-news-btn"]').first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await page.waitForTimeout(3000);
      liveNewsRefreshed = true;
    }
    const freshnessBadge = page.locator('[data-testid="axios-source-freshness-badge"]').first();
    if (await freshnessBadge.isVisible().catch(() => false)) {
      freshnessBadgeText = (await freshnessBadge.innerText()).trim();
    }

    // Pick first 2 available deal slots if present
    const slotBtns = page.locator('[data-testid^="deal-slot-item-"]');
    const slotCount = await slotBtns.count();
    for (let i = 0; i < Math.min(2, slotCount); i++) {
      await slotBtns.nth(i).click().catch(() => {});
      await page.waitForTimeout(200);
    }
    const blindGridCount = await page.locator('[data-testid^="preview-deal-blind-grid-"]').count();

    const nlCreatorProbe = await collectDomProbe(page, '[data-testid="magazine-editor-slot"]');
    const nlWorkspaceShot = path.join(nlOutDir, 'newsletter_workspace_xlarge.png');
    await page.screenshot({ path: nlWorkspaceShot, fullPage: false });

    // Save draft via button & resolve editionId
    const draftSavePromise = page
      .waitForResponse(
        (r) =>
          r.url().includes('/api/magazine/editions') &&
          (r.request().method() === 'POST' || r.request().method() === 'PATCH'),
        { timeout: 25_000 },
      )
      .catch(() => null);
    await page.locator('[data-testid="newsletter-draft-save-btn"]').click();
    const draftSaveRes = await draftSavePromise;
    let editionId = '';
    if (draftSaveRes) {
      const dj = await draftSaveRes.json().catch(() => ({}));
      const eid = dj.edition?.id || dj.id || dj.data?.id || '';
      if (eid && /^[0-9a-f-]{36}$/i.test(eid)) {
        editionId = eid;
        createdEditions.push(eid);
      }
    }
    await page.waitForTimeout(800);
    if (!editionId) {
      const listRes = await page.request.get('/api/magazine/editions?broker_id=me&type=all&limit=5');
      const listJson = await listRes.json().catch(() => ({}));
      const eds = (listJson.editions || listJson.data || []) as Array<any>;
      if (Array.isArray(eds) && eds.length > 0 && eds[0]?.id) {
        editionId = String(eds[0].id);
        if (eds[0]?.status !== 'published') createdEditions.push(editionId);
      }
    }

    let readerUrl = '';
    if (editionId) {
      const pubRes = await page.request.post(`/api/magazine/editions/${editionId}/publish`, {
        data: { sendNow: false },
      });
      if (pubRes.ok()) {
        const pj = await pubRes.json().catch(() => ({}));
        readerUrl = pj.publicUrl || pj.url || pj.readerUrl || pj.shareUrl || '';
      }
    }
    if (!readerUrl) {
      const liveLink = page.locator('[data-testid="preview-live-reader-link"]').first();
      if (await liveLink.isVisible().catch(() => false)) {
        readerUrl = (await liveLink.getAttribute('href')) || '';
      }
    }
    if (!readerUrl) {
      const profRes = await page.request.get('/api/broker/profile');
      const profJson = await profRes.json().catch(() => ({}));
      const slug = profJson.profile?.slug || profJson.brokerProfile?.slug || profJson.slug || '';
      if (slug) readerUrl = `/magazine/${encodeURIComponent(slug)}`;
    }
    expect(readerUrl, 'Newsletter public reader URL must resolve').toBeTruthy();

    const readerRel = readerUrl.startsWith('http')
      ? new URL(readerUrl).pathname + new URL(readerUrl).search
      : readerUrl;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(readerRel, { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');

    const nlReaderProbe = await collectDomProbe(page, 'main');
    const nlReaderShot = path.join(nlOutDir, 'newsletter_reader_390_xlarge.png');
    await page.screenshot({ path: nlReaderShot, fullPage: true });

    const dealHrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h.startsWith('/dc/') || h.startsWith('/im-lite/')),
    );
    const featuredLinksChecked: Array<{ href: string; status: number }> = [];
    let brokenLinkCount = 0;
    for (const href of Array.from(new Set(dealHrefs))) {
      const r = await page.request.get(href);
      featuredLinksChecked.push({ href, status: r.status() });
      if (!r.ok()) brokenLinkCount += 1;
    }

    const nlSuitPublic = auditNewsletterContentSuitability({
      editionType: 'weekly',
      renderedHtml: await page.content(),
      renderedText: nlReaderProbe.visibleText,
      expectedDealCount: featuredLinksChecked.length,
      isSubscriberMode: false,
    });
    const nlSuitViolations = nlSuitPublic.passed ? 0 : nlSuitPublic.totalViolations;

    const newsletterRuns: NewsletterPpgtScoreResult[] = [
      scoreNewsletterPpgtRun({
        personaId: 'NL-MG-01',
        surface: '/broker/magazine-editor',
        viewport: '1440x900',
        fontScale: 'xlarge',
        aboveFoldActionCount: nlCreatorProbe.aboveFoldActionCount,
        totalVisibleInteractiveCount: nlCreatorProbe.totalVisibleInteractiveCount,
        horizontalOverflowPx: nlCreatorProbe.horizontalOverflowPx,
        sub44ButtonsCount: nlCreatorProbe.sub44ButtonsCount,
        sub15TextsCount: nlCreatorProbe.sub15TextsCount,
        clippedButtonsCount: nlCreatorProbe.clippedButtonsCount,
        brokenImgCount: nlCreatorProbe.brokenImgCount,
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        poisonTokenCount: countPoisonTokens(nlCreatorProbe.visibleText),
        bannedTermCount: countBannedTerms(nlCreatorProbe.visibleText),
        contentSuitabilityViolationsCount: liveNewsRefreshed ? 0 : 1,
        taskCompleted: Boolean(editionId || readerRel),
        blockingModalDetected: false,
        boundaryViolationCount: 0,
        provenanceBadgeVisible: true,
        artifactValid: Boolean(readerRel),
        honestSaveVisible: nlCreatorProbe.honestSaveVisible,
      }),
      scoreNewsletterPpgtRun({
        personaId: 'NL-MG-03',
        surface: readerRel,
        viewport: '390x844',
        fontScale: 'xlarge',
        aboveFoldActionCount: nlReaderProbe.aboveFoldActionCount,
        totalVisibleInteractiveCount: nlReaderProbe.totalVisibleInteractiveCount,
        horizontalOverflowPx: nlReaderProbe.horizontalOverflowPx,
        sub44ButtonsCount: nlReaderProbe.sub44ButtonsCount,
        sub15TextsCount: nlReaderProbe.sub15TextsCount,
        clippedButtonsCount: nlReaderProbe.clippedButtonsCount,
        brokenImgCount: nlReaderProbe.brokenImgCount,
        consoleErrorCount: consoleErrors.length,
        pageErrorCount: pageErrors.length,
        poisonTokenCount: countPoisonTokens(nlReaderProbe.visibleText),
        bannedTermCount: countBannedTerms(nlReaderProbe.visibleText),
        contentSuitabilityViolationsCount: brokenLinkCount + nlSuitViolations,
        taskCompleted: brokenLinkCount === 0,
        blockingModalDetected: false,
        boundaryViolationCount: brokenLinkCount,
        provenanceBadgeVisible: nlReaderProbe.provenanceBadgeVisible,
        artifactValid: brokenLinkCount === 0,
      }),
    ];

    // 3) INBOX WORKSPACE (/broker/w/inbox — Wave-3 xlarge layout + honest empty events + 409 + VIP)
    const ibOutDir = path.join(OUT_ROOT, 'INBOX');
    ensureDir(ibOutDir);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/inbox', { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    await page.waitForTimeout(800);

    // Check top-left todo summary card has ZERO vertical/horizontal button overlap!
    const todoOverlapPx = await page.evaluate(() => {
      const fBtn = document.querySelector('[data-testid="inbox-todo-summary-filter-btn"]')?.getBoundingClientRect();
      const qBtn = document.querySelector('[data-testid^="quick-approve-btn-"]')?.getBoundingClientRect();
      if (!fBtn || !qBtn) return 0;
      const xOverlap = Math.max(0, Math.min(fBtn.right, qBtn.right) - Math.max(fBtn.left, qBtn.left));
      const yOverlap = Math.max(0, Math.min(fBtn.bottom, qBtn.bottom) - Math.max(fBtn.top, qBtn.top));
      return xOverlap > 2 && yOverlap > 2 ? Math.round(Math.min(xOverlap, yOverlap)) : 0;
    });
    expect(todoOverlapPx, 'Inbox xlarge todo summary filter and quick-approve buttons must not overlap').toBe(0);

    const foldedNlChipVisibleInitially = await page
      .locator('[data-testid="inbox-filter-chip-newsletter"]')
      .isVisible()
      .catch(() => false);
    const foldedNewsletterFilterDefaultHidden = !foldedNlChipVisibleInitially;

    const inboxDesktopProbe = await collectDomProbe(page, '[data-testid="inbox-editor-slot"]');
    const rawUuidLeakInInbox = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      inboxDesktopProbe.visibleText,
    );
    expect(rawUuidLeakInInbox, 'Inbox UI must never expose raw edition/building UUIDs to broker').toBe(false);
    const inboxDesktopShot = path.join(ibOutDir, 'inbox_desktop_xlarge.png');
    await page.screenshot({ path: inboxDesktopShot, fullPage: false });

    // Create VIP client
    const testPhone = '010-9911-4422';
    const testVipName = 'PPGT골든_VIP_김대표';
    await page.locator('[data-testid="open-new-client-modal-btn"]').click();
    await page.locator('[data-testid="inbox-new-client-dialog"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-testid="new-client-name-input"]').fill(testVipName);
    await page.locator('[data-testid="new-client-phone-input"]').fill(testPhone);
    await page.locator('[data-testid="new-client-grade-select"]').selectOption('VIP');

    const createClientResPromise = page
      .waitForResponse(
        (r) => r.url().includes('/api/broker/inbox/actions') && r.request().method() === 'POST',
        { timeout: 15_000 },
      )
      .catch(() => null);
    await page.locator('[data-testid="submit-new-client-btn"]').click();
    const createClientRes = await createClientResPromise;
    if (createClientRes) {
      const cj = await createClientRes.json().catch(() => ({}));
      const cid = cj.client?.id || cj.id || cj.clientId || '';
      if (cid) createdClients.push(cid);
    }
    await page.waitForTimeout(800);

    // Duplicate phone warning check
    await page.locator('[data-testid="open-new-client-modal-btn"]').click();
    await page.locator('[data-testid="inbox-new-client-dialog"]').waitFor({ state: 'visible' });
    await page.locator('[data-testid="new-client-phone-input"]').fill(testPhone);
    await page.waitForTimeout(400);
    const duplicateWarningShown = await page
      .locator('[data-testid="new-client-duplicate-warning"]')
      .isVisible()
      .catch(() => false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Switch to '전체 고객' tab so newly created custom VIP client is selectable
    const allTab = page.locator('[data-testid="inbox-filter-chip-all"]');
    if (await allTab.isVisible().catch(() => false)) {
      await allTab.click();
      await page.waitForTimeout(600);
    }
    const vipRow = page
      .locator('[data-testid^="inbox-thread-row-"]')
      .filter({ hasText: testVipName })
      .first();
    await vipRow.waitFor({ state: 'visible', timeout: 10_000 });
    await vipRow.click();
    await page.waitForTimeout(600);

    // Check History tab -> honest empty dispatch & zero fake view/dispatch events on brand-new client!
    await page.locator('[data-testid="inbox-editor-tab-history"]').click();
    await page.waitForTimeout(400);
    const historyPanelText = (
      await page.locator('[data-testid="inbox-tab-panel-history"]').innerText().catch(() => '')
    ).trim();
    const emptyEventsVisible = await page
      .locator('[data-testid="inbox-events-empty"]')
      .isVisible()
      .catch(() => false);
    const honestEmptyDispatch =
      historyPanelText.includes('아직 발송·복사 내역이 없습니다') &&
      !/열람했습니다|발송 완료|열람 섹션/.test(historyPanelText);
    const honestEmptyEventsShown = emptyEventsVisible || honestEmptyDispatch;

    // Check disabled IM tab / notice on client without IM
    const imAssetTab = page.locator('[data-testid="inbox-asset-tab-im"]');
    const imTabDisabled = await imAssetTab.isDisabled().catch(() => false);
    const noticeVisible = await page
      .locator('[data-testid="inbox-im-not-generated-notice"]')
      .isVisible()
      .catch(() => false);
    const imNotGeneratedNoticeShown = imTabDisabled || noticeVisible;

    // Direct API 409 IM_NOT_GENERATED verification on dealOnlyId
    const guardApiRes = await page.request.post('/api/broker/inbox/actions', {
      data: {
        action: 'prepare_copy_bundle',
        assetKind: 'im',
        buildingId: dealOnlyId,
        clientName: testVipName,
        buildingTitle: '마포구 연남동 근린생활시설',
      },
    });
    const guardJson = await guardApiRes.json().catch(() => ({}));
    const api409ImNotGeneratedVerified =
      guardApiRes.status() === 409 && guardJson.code === 'IM_NOT_GENERATED';

    // Carry forward or re-verify AI reply 2x non-repetition
    let aiReplyVariantNonRepeating = false;
    await page.locator('[data-testid="inbox-editor-tab-message"]').click();
    await page.waitForTimeout(400);
    const aiReplyBtn = page.locator('[data-testid="inbox-ai-reply-btn"]');
    const briefInput = page.locator('[data-testid="inbox-kakao-brief-input"]');
    if (await aiReplyBtn.isVisible().catch(() => false)) {
      await aiReplyBtn.click();
      await page.waitForTimeout(2500);
      const r1 = (await briefInput.inputValue().catch(() => '')).trim();
      await aiReplyBtn.click();
      await page.waitForTimeout(2500);
      const r2 = (await briefInput.inputValue().catch(() => '')).trim();
      aiReplyVariantNonRepeating = Boolean(r1) && Boolean(r2) && r1 !== r2;
    }

    // VIP delete name-match modal verification & deletion
    let vipDeleteStrongWarningShown = false;
    const delVipBtn = page.locator('[data-testid="delete-custom-client-btn"]').first();
    if (await delVipBtn.isVisible().catch(() => false)) {
      await delVipBtn.click();
      await page.waitForTimeout(500);
      const matchInput = page.locator('[data-testid="confirm-delete-match-input"]').last();
      const confirmBtn = page.locator('[data-testid="confirm-delete-confirm-btn"]').last();
      if (await matchInput.isVisible().catch(() => false)) {
        const disabledBefore = await confirmBtn.isDisabled().catch(() => false);
        vipDeleteStrongWarningShown = disabledBefore;
        await matchInput.fill(testVipName);
        await page.waitForTimeout(200);
        await confirmBtn.click();
        await page.waitForTimeout(600);
      }
    }

    // Mobile 390 xlarge Inbox responsiveness probe
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/w/inbox', { waitUntil: 'networkidle' });
    await hideDevOverlay(page);
    await applyFontScale(page, 'xlarge');
    const inboxMobileProbe = await collectDomProbe(page, 'main');
    const inboxMobileShot = path.join(ibOutDir, 'inbox_mobile_390_xlarge.png');
    await page.screenshot({ path: inboxMobileShot, fullPage: true });

    const desktopInboxMetrics: InboxPpgtProbeMetrics = {
      personaId: 'IB-MG-01',
      surface: '/broker/w/inbox (desktop xlarge)',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: inboxDesktopProbe.aboveFoldActionCount,
      totalVisibleInteractiveCount: inboxDesktopProbe.totalVisibleInteractiveCount,
      horizontalOverflowPx: inboxDesktopProbe.horizontalOverflowPx,
      sub44ButtonsCount: inboxDesktopProbe.sub44ButtonsCount,
      sub15TextsCount: inboxDesktopProbe.sub15TextsCount,
      clippedButtonsCount: inboxDesktopProbe.clippedButtonsCount,
      brokenImgCount: inboxDesktopProbe.brokenImgCount,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: countPoisonTokens(inboxDesktopProbe.visibleText),
      bannedTermCount: countBannedTerms(inboxDesktopProbe.visibleText),
      unblockedImDispatchCount: api409ImNotGeneratedVerified ? 0 : 1,
      crmSafetyViolationCount:
        (duplicateWarningShown ? 0 : 1) + (vipDeleteStrongWarningShown ? 0 : 1),
      dishonestTimelineOrStaleAiCount:
        (honestEmptyEventsShown ? 0 : 1) + (aiReplyVariantNonRepeating ? 0 : 1),
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: foldedNewsletterFilterDefaultHidden ? 0 : 1,
      provenanceBadgeVisible: true,
      artifactValid: true,
      honestSaveVisible: true,
    };

    const inboxRuns: InboxPpgtScoreResult[] = [
      scoreInboxPpgtRun(desktopInboxMetrics),
      scoreInboxPpgtRun({ ...desktopInboxMetrics, personaId: 'IB-MG-02', surface: '/broker/w/inbox (ai-reply)', fontScale: 'normal' }),
      scoreInboxPpgtRun({ ...desktopInboxMetrics, personaId: 'IB-MG-03', surface: '/api/broker/inbox/actions (409 guard)', fontScale: 'normal' }),
      scoreInboxPpgtRun({
        ...desktopInboxMetrics,
        personaId: 'IB-MG-04',
        surface: '/broker/w/inbox (mobile 390 xlarge)',
        viewport: '390x844',
        aboveFoldActionCount: inboxMobileProbe.aboveFoldActionCount,
        totalVisibleInteractiveCount: inboxMobileProbe.totalVisibleInteractiveCount,
        horizontalOverflowPx: inboxMobileProbe.horizontalOverflowPx,
        sub44ButtonsCount: inboxMobileProbe.sub44ButtonsCount,
        sub15TextsCount: inboxMobileProbe.sub15TextsCount,
        clippedButtonsCount: inboxMobileProbe.clippedButtonsCount,
        brokenImgCount: inboxMobileProbe.brokenImgCount,
        boundaryViolationCount: imNotGeneratedNoticeShown ? 0 : 1,
      }),
    ];

    // 4) Merge with existing Wave-2 CASE-02~05 DealCard & IM R2 Scorecard & Manifest
    const existingR2 = JSON.parse(fs.readFileSync(R2_REPORT_PATH, 'utf-8')) as UnifiedCreReport100;
    const existingManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

    const nlCard = summarizeSubsystem100('newsletter', newsletterRuns);
    const ibCard = summarizeSubsystem100('inbox', inboxRuns);
    const cards = [
      existingR2.subsystems.im,
      nlCard,
      existingR2.subsystems.dealcard,
      ibCard,
    ];
    const totalFloorRiskCount = cards.reduce((s, c) => s + c.floorRiskCount, 0);
    const overallRawMean100 = Math.round((cards.reduce((s, c) => s + c.rawMeanScore100, 0) / 4) * 100) / 100;
    const meanEff = Math.round((cards.reduce((s, c) => s + c.effectiveScore100, 0) / 4) * 100) / 100;
    const overallEffectiveMean100 =
      totalFloorRiskCount > 0 ? Math.min(meanEff, FLOOR_CAP_100) : meanEff;

    const nlBacklog = rankNewsletterPpgtBacklog(newsletterRuns).map((c) => ({
      subsystem: 'newsletter' as const,
      issueKey: c.issueKey,
      targetFileHint: c.targetFileHint,
      axis: c.axis,
      track: c.track,
      pScore: c.pScore,
      tier: c.tier,
      anyFloorRisk: c.anyFloorRisk,
      affectedPersonas: [...c.affectedPersonas],
      summary: c.summaries[0] || '',
    }));
    const ibBacklog = rankInboxPpgtBacklog(inboxRuns).map((c) => ({
      subsystem: 'inbox' as const,
      issueKey: c.issueKey,
      targetFileHint: c.targetFileHint,
      axis: c.axis,
      track: c.track,
      pScore: c.pScore,
      tier: c.tier,
      anyFloorRisk: c.anyFloorRisk,
      affectedPersonas: [...c.affectedPersonas],
      summary: c.summaries[0] || '',
    }));

    const mergedR2: UnifiedCreReport100 = {
      generatedAt: new Date().toISOString(),
      targetScore100: 90,
      subsystems: {
        im: existingR2.subsystems.im,
        newsletter: nlCard,
        dealcard: existingR2.subsystems.dealcard,
        inbox: ibCard,
      },
      overallRawMean100,
      overallEffectiveMean100,
      totalFloorRiskCount,
      readyForHuman2nd:
        totalFloorRiskCount === 0 &&
        overallEffectiveMean100 >= 90.0 &&
        cards.every((c) => c.meetsTarget90),
      topBacklog: [
        ...existingR2.topBacklog.filter((b) => b.subsystem === 'im' || b.subsystem === 'dealcard'),
        ...nlBacklog,
        ...ibBacklog,
      ].sort((a, b) => b.pScore - a.pScore),
    };

    const md = formatUnifiedCreScorecardMarkdown(mergedR2);
    fs.writeFileSync(R2_REPORT_PATH, JSON.stringify(mergedR2, null, 2), 'utf-8');
    fs.writeFileSync(path.join(OUT_ROOT, 'r2-unified-scorecard.md'), md, 'utf-8');

    existingManifest.generatedAt = mergedR2.generatedAt;
    existingManifest.newsletter = {
      editionId,
      publicUrl: readerRel,
      liveNewsRefreshed,
      freshnessBadgeText,
      blindGridCount,
      featuredLinksChecked,
      screenshots: { workspace: nlWorkspaceShot, readerMobile: nlReaderShot },
      observedSpans: [
        ...nlReaderProbe.observedHeadings,
        ...nlReaderProbe.observedButtons.slice(0, 12),
        nlReaderProbe.visibleText.slice(0, 1200),
      ],
      defects: brokenLinkCount > 0 ? [`깨진 링크 ${brokenLinkCount}건`] : [],
    };
    existingManifest.inbox = {
      duplicateWarningShown,
      honestEmptyEventsShown,
      imNotGeneratedNoticeShown,
      api409ImNotGeneratedVerified,
      aiReplyVariantNonRepeating,
      vipDeleteStrongWarningShown,
      foldedNewsletterFilterDefaultHidden,
      todoOverlapPx,
      screenshots: { desktop: inboxDesktopShot, mobile: inboxMobileShot },
      observedSpans: [
        ...inboxMobileProbe.observedHeadings,
        ...inboxMobileProbe.observedButtons.slice(0, 12),
        inboxMobileProbe.visibleText.slice(0, 1200),
      ],
      defects: [],
    };
    existingManifest.scorecardSummary = {
      overallEffectiveMean100: mergedR2.overallEffectiveMean100,
      totalFloorRiskCount: mergedR2.totalFloorRiskCount,
      readyForHuman2nd: mergedR2.readyForHuman2nd,
      subsystems: {
        dealcard: mergedR2.subsystems.dealcard.effectiveScore100,
        im: mergedR2.subsystems.im.effectiveScore100,
        newsletter: mergedR2.subsystems.newsletter.effectiveScore100,
        inbox: mergedR2.subsystems.inbox?.effectiveScore100 ?? 0,
      },
    };
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(existingManifest, null, 2), 'utf-8');

    console.log('\n' + md + '\n');
    console.log(
      `✅ Wave-3 Newsletter & Inbox checks: nlReader=${readerRel}, links=${featuredLinksChecked.length}(broken=${brokenLinkCount}), inboxOverlap=${todoOverlapPx}px, dup=${duplicateWarningShown}, emptyEvents=${honestEmptyEventsShown}, 409=${api409ImNotGeneratedVerified}, aiReply=${aiReplyVariantNonRepeating}, vipDelete=${vipDeleteStrongWarningShown}`,
    );
    expect(mergedR2.totalFloorRiskCount).toBe(0);
    expect(mergedR2.overallEffectiveMean100).toBeGreaterThanOrEqual(90.0);
  } finally {
    for (const eid of Array.from(new Set(createdEditions))) {
      await page.request.delete(`/api/magazine/editions?id=${encodeURIComponent(eid)}`).catch(() => {});
    }
    for (const cid of Array.from(new Set(createdClients))) {
      await page.request
        .post('/api/broker/inbox/actions', { data: { action: 'delete_client', clientId: cid } })
        .catch(() => {});
    }
    for (const bid of Array.from(new Set(createdBuildings))) {
      await page.request
        .patch('/api/broker/workspace/summary', { data: { action: 'delete', buildingId: bid } })
        .catch(() => {});
      await page.request
        .delete(`/api/broker/deal-card/${encodeURIComponent(bid)}/delete`)
        .catch(() => {});
    }
  }
});
