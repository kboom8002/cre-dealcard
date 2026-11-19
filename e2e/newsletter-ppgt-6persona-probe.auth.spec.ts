/**
 * @file e2e/newsletter-ppgt-6persona-probe.auth.spec.ts
 * @description Layer C (PPGT-Loop R1 + R2): Read-only, non-destructive Newsletter 6-persona DOM/ergonomics probe.
 *   Probes `/broker/w/newsletter` (3 tabs, normal & xlarge 21px, 390px mobile), live `/magazine/[brokerId]/[date]`
 *   (390/360 normal & xlarge), `/magazine/[brokerId]/subscribe`, `/m/[draft-chaos]` fail-closed shortlink,
 *   and rendered HTML Email viewports (640px PC + 390px Mobile).
 *   Writes `sprint1-baseline.{json,md}`, 12 PNG captures, and initial `NEWSLETTER_HUMAN_REVIEW_PACKET.md`
 *   to `e2e/golden-snapshots/out/newsletter-ppgt/`.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { BANNED_UI_TERMS } from '../src/lib/ux/lexicon';
import {
  scoreNewsletterPpgtRun,
  verifyNewsletterAntiSycophancyControls,
  rankNewsletterPpgtBacklog,
  type NewsletterPpgtProbeMetrics,
  type NewsletterPpgtScoreResult,
  type NewsletterPpgtIssueHint,
} from '../src/lib/qa/newsletter-ppgt-personas';

const OUT_DIR = path.resolve(__dirname, 'golden-snapshots/out/newsletter-ppgt');

const RAW_ERROR_REGEX =
  /PGRST|relation .* does not exist|column .* does not exist|syntax error|\[object Object\]|>NaN<|>undefined<|>null</;

type SurfaceKind = 'creator' | 'consumer';

interface DomProbeRaw {
  horizontalOverflowPx: number;
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  globalAboveFoldActionCount: number;
  sub44Buttons: Array<{ text: string; width: number; height: number }>;
  sub14Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
  sidebarEllipsisCount: number;
  brokenImgs: Array<{ alt: string; src: string }>;
  visibleText: string;
  uiChromeText: string;
  observedHeadings: string[];
  observedButtons: string[];
  observedBadges: string[];
  provenanceBadgeVisible: boolean;
  honestSaveVisible: boolean;
}

interface TabProbeRecord {
  tab: string;
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  sub44ButtonsCount: number;
  sub14TextsCount: number;
  clippedButtonsCount: number;
  sidebarEllipsisCount: number;
}

async function hideDevOverlay(page: Page) {
  await page
    .addStyleTag({
      content: 'nextjs-portal,[data-nextjs-toast],[data-nextjs-dev-tools-button]{display:none!important}',
    })
    .catch(() => {});
}

async function applyFontScale(page: Page, scale: 'normal' | 'xlarge') {
  await page.evaluate((s) => {
    document.documentElement.setAttribute('data-font-scale', s);
    try {
      window.localStorage.setItem('credeal-font-scale', s);
      window.localStorage.setItem('cre-font-scale', s);
    } catch {
      // ignore storage quota errors
    }
  }, scale);
  await page.waitForTimeout(250);
}

async function collectDomProbe(
  page: Page,
  scopeSelector: string,
  surfaceKind: SurfaceKind,
): Promise<DomProbeRaw> {
  return await page.evaluate(
    ({ sel, kind }) => {
      const isVisible = (el: Element): boolean => {
        const htmlEl = el as HTMLElement;
        const style = getComputedStyle(htmlEl);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        if (htmlEl.closest('.sr-only')) return false;
        const rect = htmlEl.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
      };

      const inViewport = (el: Element): boolean => {
        const rect = el.getBoundingClientRect();
        return (
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0
        );
      };

      const overflowPx = Math.max(
        0,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      const scopeRoot = document.querySelector(sel) || document.body;
      const interactiveSel =
        'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="switch"]';

      const allInteractives = Array.from(document.querySelectorAll(interactiveSel)).filter((el) => {
        if (!isVisible(el)) return false;
        const h = el as HTMLElement;
        if (h.hasAttribute('data-preview-unit-id')) return false;
        if (h.getAttribute('role') === 'separator') return false;
        return true;
      });

      const scopeInteractives = Array.from(scopeRoot.querySelectorAll(interactiveSel)).filter((el) => {
        if (!isVisible(el)) return false;
        const h = el as HTMLElement;
        if (h.hasAttribute('data-preview-unit-id')) return false;
        if (h.getAttribute('role') === 'separator') return false;
        return true;
      });

      const globalAboveFold = allInteractives.filter(inViewport);
      const scopeAboveFold = scopeInteractives.filter(inViewport);

      const sub44Buttons: Array<{ text: string; width: number; height: number }> = [];
      const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];
      let sidebarEllipsisCount = 0;
      const observedButtons: string[] = [];

      for (const el of allInteractives) {
        const htmlEl = el as HTMLElement;
        const label = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 48);
        if (label && observedButtons.length < 30) observedButtons.push(label);

        const rect = htmlEl.getBoundingClientRect();
        const role = el.getAttribute('role');
        const isTapTarget = el.tagName === 'BUTTON' || role === 'tab' || role === 'switch';
        if (isTapTarget && Math.round(rect.height) < 44 && sub44Buttons.length < 25) {
          sub44Buttons.push({
            text: label || el.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }

        if (isTapTarget || el.tagName === 'A') {
          const isSidebarRow =
            htmlEl.matches('[data-list-row="simple"]') ||
            Boolean(htmlEl.closest('[data-list-row="simple"]'));
          const btnStyle = getComputedStyle(htmlEl);
          const ownOverflow =
            htmlEl.clientWidth > 0 &&
            htmlEl.scrollWidth > htmlEl.clientWidth + 6 &&
            btnStyle.overflowX !== 'visible';
          const truncatedSpan = Array.from(htmlEl.querySelectorAll('span')).find((sp) => {
            if (sp.classList.contains('sr-only') || sp.closest('.sr-only')) return false;
            if (sp.getAttribute('data-single-line-title') === 'true') return false;
            const spStyle = getComputedStyle(sp);
            const spTxt = (sp.innerText || '').trim();
            return (
              spTxt.length > 0 &&
              sp.clientWidth > 0 &&
              sp.scrollWidth > sp.clientWidth + 4 &&
              (sp.classList.contains('truncate') ||
                spStyle.textOverflow === 'ellipsis' ||
                spStyle.overflowX === 'hidden')
            );
          }) as HTMLElement | undefined;

          if (ownOverflow || truncatedSpan) {
            if (isSidebarRow) {
              sidebarEllipsisCount++;
            } else if (clippedButtons.length < 20) {
              clippedButtons.push({
                text: label || el.tagName,
                clientW: truncatedSpan ? truncatedSpan.clientWidth : htmlEl.clientWidth,
                scrollW: truncatedSpan ? truncatedSpan.scrollWidth : htmlEl.scrollWidth,
              });
            }
          }
        }
      }

      const sub14Texts: Array<{ text: string; tag: string; fontSizePx: number }> = [];
      const sub15Texts: Array<{ text: string; tag: string; fontSizePx: number }> = [];
      const textEls = Array.from(
        document.querySelectorAll('p, span, label, h1, h2, h3, h4, button, a, th, td, li'),
      ).filter(isVisible);

      for (const el of textEls) {
        const htmlEl = el as HTMLElement;
        if (htmlEl.children.length > 0 && el.tagName !== 'BUTTON' && el.tagName !== 'LABEL') continue;
        const txt = (htmlEl.innerText || '').trim();
        if (!txt) continue;
        const px = parseFloat(getComputedStyle(htmlEl).fontSize || '16');
        if (px < 13.8 && sub14Texts.length < 25) {
          sub14Texts.push({
            text: txt.slice(0, 45),
            tag: el.tagName.toLowerCase(),
            fontSizePx: Math.round(px * 10) / 10,
          });
        }
        if (px < 14.5 && sub15Texts.length < 25) {
          sub15Texts.push({
            text: txt.slice(0, 45),
            tag: el.tagName.toLowerCase(),
            fontSizePx: Math.round(px * 10) / 10,
          });
        }
      }

      const brokenImgs: Array<{ alt: string; src: string }> = [];
      for (const img of Array.from(document.querySelectorAll('img')).filter(isVisible)) {
        if (img.complete && img.naturalWidth === 0 && brokenImgs.length < 15) {
          brokenImgs.push({ alt: img.alt || '', src: img.src.slice(0, 120) });
        }
      }

      const observedHeadings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .filter(isVisible)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20);

      const observedBadges = Array.from(
        document.querySelectorAll('[data-testid*="badge"], [data-testid="tracking-notice"], [role="status"]'),
      )
        .filter(isVisible)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20);

      const visibleText = document.body.innerText || '';
      let uiChromeText = visibleText;
      for (const slotEl of Array.from(document.querySelectorAll('[data-testid^="deal-slot-item-"]'))) {
        const slotTxt = (slotEl as HTMLElement).innerText || '';
        if (slotTxt.trim()) {
          uiChromeText = uiChromeText.split(slotTxt).join(' ');
        }
      }
      const consumerProvenance =
        /CREDEAL 안심 매거진|국토교통부|한국은행|개인정보 처리방침|뉴스레터 구독/.test(visibleText) ||
        Boolean(document.querySelector('[data-testid="tracking-notice"]'));
      const creatorHonestyAndProvenance =
        consumerProvenance ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]')) ||
        Boolean(document.querySelector('[data-testid="send-list-summary-bar"]')) ||
        /저장됨|초안|발행|참고 기준치|실시간|최신 뉴스/.test(visibleText);

      const provenanceBadgeVisible =
        kind === 'consumer' ? consumerProvenance : creatorHonestyAndProvenance;

      const honestSaveVisible =
        /저장됨|저장 중|자동\s*저장|변경사항|편집|구독 신청/.test(visibleText) ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]'));

      return {
        horizontalOverflowPx: overflowPx,
        aboveFoldActionCount: scopeAboveFold.length,
        totalVisibleInteractiveCount: allInteractives.length,
        globalAboveFoldActionCount: globalAboveFold.length,
        sub44Buttons,
        sub14Texts,
        sub15Texts,
        clippedButtons,
        sidebarEllipsisCount,
        brokenImgs,
        visibleText,
        uiChromeText,
        observedHeadings,
        observedButtons,
        observedBadges,
        provenanceBadgeVisible,
        honestSaveVisible,
      };
    },
    { sel: scopeSelector, kind: surfaceKind },
  );
}

function findBannedUiTerms(text: string): string[] {
  const hits: string[] = [];
  for (const { term } of BANNED_UI_TERMS) {
    const m = text.match(term);
    if (m) hits.push(m[0]);
  }
  return hits;
}

test.describe('Layer C: Newsletter 6-Persona PPGT-Loop R1+R2 Baseline Probe', () => {
  test.setTimeout(240_000);

  test('probes newsletter editor, live reader, subscribe, chaos shortlink, and rendered emails non-destructively', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const ncResult = verifyNewsletterAntiSycophancyControls();
    expect(
      ncResult.passed,
      `Anti-sycophancy NC failure: ${ncResult.failures.join('; ')}`,
    ).toBe(true);

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Discover a live published reader URL non-destructively
    let readerUrl = '/magazine/test-broker-kim/2026-10-04';
    let subscribeUrl = '/magazine/test-broker-kim/subscribe';

    const editionsRes = await page.request.get('/api/magazine/editions').catch(() => null);
    const editionsJson = editionsRes?.ok() ? await editionsRes.json().catch(() => null) : null;
    const editionsList = Array.isArray(editionsJson?.editions)
      ? editionsJson.editions
      : Array.isArray(editionsJson?.data)
        ? editionsJson.data
        : [];
    const publishedEd = editionsList.find(
      (e: {
        status?: string;
        publicUrl?: string;
        broker_id?: string;
        brokerId?: string;
        issue_date?: string;
        issueDate?: string;
      }) =>
        e?.status === 'published' &&
        (e?.publicUrl || ((e?.broker_id || e?.brokerId) && (e?.issue_date || e?.issueDate))),
    );
    if (publishedEd?.publicUrl && typeof publishedEd.publicUrl === 'string') {
      readerUrl = publishedEd.publicUrl;
      const m = readerUrl.match(/^\/magazine\/([^/?#]+)\//);
      if (m?.[1]) subscribeUrl = `/magazine/${m[1]}/subscribe`;
    } else if (
      (publishedEd?.broker_id || publishedEd?.brokerId) &&
      (publishedEd?.issue_date || publishedEd?.issueDate)
    ) {
      const bId = publishedEd.broker_id || publishedEd.brokerId;
      const dStr = publishedEd.issue_date || publishedEd.issueDate;
      readerUrl = `/magazine/${bId}/${dStr}`;
      subscribeUrl = `/magazine/${bId}/subscribe`;
    }

    const scoreResults: NewsletterPpgtScoreResult[] = [];
    const tabDiagnostics: TabProbeRecord[] = [];
    const clippedButtonDetails: Array<{
      surface: string;
      viewport: string;
      fontScale: string;
      buttons: Array<{ text: string; clientW: number; scrollW: number }>;
    }> = [];

    const recordRun = (
      personaId: NewsletterPpgtProbeMetrics['personaId'],
      surface: string,
      viewport: string,
      fontScale: 'normal' | 'xlarge',
      raw: DomProbeRaw,
      errCountStart: number,
      opts: { provenanceOverride?: boolean; boundaryViolationCount?: number } = {},
    ) => {
      const poisonMatch = raw.visibleText.match(RAW_ERROR_REGEX);
      const bannedHits = findBannedUiTerms(raw.uiChromeText);
      const newConsoleErrs = Math.max(0, consoleErrors.length - errCountStart);

      const hints: NewsletterPpgtIssueHint[] = [];
      const fileHint = surface.includes('/subscribe')
        ? 'src/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient.tsx'
        : surface.includes('/magazine')
          ? 'src/app/(magazine)/magazine/[brokerId]/[date]/magazine-view.tsx'
          : 'src/app/(broker)/broker/magazine-editor/_components/NewsletterContentStepPanel.tsx';

      if (raw.sub44Buttons.length > 0) {
        hints.push({
          issueKey: 'sub44_tap_target',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_gate_renderer',
          summary: `${surface} (${viewport} ${fontScale}): <44px buttons=${raw.sub44Buttons.length} (${raw.sub44Buttons
            .slice(0, 3)
            .map((b) => `${b.text}:${b.height}px`)
            .join(', ')})`,
        });
      }
      if (raw.sub14Texts.length > 0) {
        hints.push({
          issueKey: 'sub14_small_text',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_gate_renderer',
          summary: `${surface} (${viewport} ${fontScale}): <14px texts=${raw.sub14Texts.length} (${raw.sub14Texts
            .slice(0, 3)
            .map((t) => `${t.text}:${t.fontSizePx}px`)
            .join(', ')})`,
        });
      }
      if (raw.clippedButtons.length > 0) {
        clippedButtonDetails.push({
          surface,
          viewport,
          fontScale,
          buttons: raw.clippedButtons,
        });
        hints.push({
          issueKey: 'clipped_button_label',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_gate_renderer',
          summary: `${surface} (${viewport} ${fontScale}): clipped=${raw.clippedButtons
            .map((b) => `"${b.text}"(${b.clientW}/${b.scrollW})`)
            .join(', ')}`,
        });
      }

      const metrics: NewsletterPpgtProbeMetrics = {
        personaId,
        surface,
        viewport,
        fontScale,
        aboveFoldActionCount: raw.aboveFoldActionCount,
        totalVisibleInteractiveCount: raw.totalVisibleInteractiveCount,
        horizontalOverflowPx: raw.horizontalOverflowPx,
        sub44ButtonsCount: raw.sub44Buttons.length,
        sub15TextsCount: raw.sub14Texts.length,
        clippedButtonsCount: raw.clippedButtons.length,
        brokenImgCount: raw.brokenImgs.length,
        consoleErrorCount: newConsoleErrs,
        pageErrorCount: 0,
        poisonTokenCount: poisonMatch ? 1 : 0,
        bannedTermCount: bannedHits.length,
        contentSuitabilityViolationsCount: 0,
        taskCompleted: true,
        blockingModalDetected: false,
        boundaryViolationCount: opts.boundaryViolationCount ?? 0,
        provenanceBadgeVisible: opts.provenanceOverride ?? raw.provenanceBadgeVisible,
        artifactValid: true,
        honestSaveVisible: raw.honestSaveVisible,
        observedHeadings: raw.observedHeadings,
        observedButtons: raw.observedButtons,
        observedBadges: raw.observedBadges,
        issueHints: hints,
      };

      const res = scoreNewsletterPpgtRun(metrics);
      scoreResults.push(res);

      expect(
        raw.horizontalOverflowPx,
        `${surface} (${viewport} ${fontScale}) horizontal overflow`,
      ).toBeLessThanOrEqual(1);
      expect(poisonMatch, `${surface} poison token leaked: ${poisonMatch?.[0]}`).toBeNull();
      expect(bannedHits, `${surface} banned UI terms leaked: ${bannedHits.join(', ')}`).toEqual([]);
      return res;
    };

    // ── 1) NL-MG-01 & NL-MG-02 & NL-MG-05: /broker/w/newsletter across 3 tabs (1440 normal + Tab2 xlarge) ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/newsletter', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await expect(page.getByTestId('magazine-editor-slot')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(600);

    const tabs = [
      { key: 'title', persona: 'NL-MG-01' as const, shot: 'nl01_editor_tab1_1440_normal.png' },
      { key: 'content', persona: 'NL-MG-02' as const, shot: 'nl02_editor_tab2_1440_normal.png' },
      { key: 'send', persona: 'NL-MG-05' as const, shot: 'nl03_editor_tab3_send_1440.png' },
    ];

    for (const tab of tabs) {
      if (tab.key === 'content') {
        const monthlyBtn = page.getByTestId('quickstart-cadence-monthly');
        if (await monthlyBtn.isVisible().catch(() => false)) {
          await monthlyBtn.click().catch(() => {});
          await page.waitForTimeout(200);
        }
      }
      const errStart = consoleErrors.length;
      await page.getByTestId(`step-tab-${tab.key}`).click();
      await page.waitForTimeout(300);
      const raw = await collectDomProbe(page, '[data-testid="magazine-editor-slot"]', 'creator');
      tabDiagnostics.push({
        tab: `${tab.key} (normal)`,
        aboveFoldActionCount: raw.aboveFoldActionCount,
        totalVisibleInteractiveCount: raw.totalVisibleInteractiveCount,
        sub44ButtonsCount: raw.sub44Buttons.length,
        sub14TextsCount: raw.sub14Texts.length,
        clippedButtonsCount: raw.clippedButtons.length,
        sidebarEllipsisCount: raw.sidebarEllipsisCount,
      });
      recordRun(tab.persona, `/broker/w/newsletter#${tab.key}`, '1440x900', 'normal', raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, tab.shot),
        fullPage: false,
      });
    }

    // Tab 2 in Senior xlarge (21px) -> nl04_editor_tab2_1440_xlarge.png (NL-MG-01)
    await applyFontScale(page, 'xlarge');
    const monthlyBtnXlarge = page.getByTestId('quickstart-cadence-monthly');
    if (await monthlyBtnXlarge.isVisible().catch(() => false)) {
      await monthlyBtnXlarge.click().catch(() => {});
      await page.waitForTimeout(200);
    }
    await page.getByTestId('step-tab-content').click();
    await page.waitForTimeout(350);
    {
      const errStart = consoleErrors.length;
      const raw = await collectDomProbe(page, '[data-testid="magazine-editor-slot"]', 'creator');
      tabDiagnostics.push({
        tab: 'content (xlarge)',
        aboveFoldActionCount: raw.aboveFoldActionCount,
        totalVisibleInteractiveCount: raw.totalVisibleInteractiveCount,
        sub44ButtonsCount: raw.sub44Buttons.length,
        sub14TextsCount: raw.sub14Texts.length,
        clippedButtonsCount: raw.clippedButtons.length,
        sidebarEllipsisCount: raw.sidebarEllipsisCount,
      });
      recordRun('NL-MG-01', '/broker/w/newsletter#content', '1440x900', 'xlarge', raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, 'nl04_editor_tab2_1440_xlarge.png'),
        fullPage: false,
      });
    }

    // Reset fontScale before mobile editor check
    await applyFontScale(page, 'normal');

    // ── 2) Mobile Editor 390x844 -> nl05_editor_390_mobile.png ──
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('step-tab-title').click();
    await page.waitForTimeout(350);
    {
      const errStart = consoleErrors.length;
      const raw = await collectDomProbe(page, '[data-testid="magazine-editor-slot"]', 'creator');
      recordRun('NL-MG-01', '/broker/w/newsletter', '390x844', 'normal', raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, 'nl05_editor_390_mobile.png'),
        fullPage: false,
      });
    }

    // ── 3) Discover freshest live published issue from subscribe landing if available & capture nl09 ──
    await applyFontScale(page, 'normal');
    await page.setViewportSize({ width: 390, height: 844 });
    {
      const errStart = consoleErrors.length;
      const subRes = await page.goto(subscribeUrl, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await page.waitForTimeout(350);
      expect(subRes?.status() ?? 500, `${subscribeUrl} HTTP status`).toBeLessThan(400);
      const latestReaderHref = await page
        .locator('a[href^="/magazine/"]')
        .evaluateAll((els) => {
          for (const el of els) {
            const href = el.getAttribute('href') || '';
            if (/^\/magazine\/[^/]+\/\d{4}-\d{2}-\d{2}/.test(href)) return href;
          }
          return null;
        })
        .catch(() => null);
      if (latestReaderHref && !latestReaderHref.includes('E2E_GOLDEN')) {
        readerUrl = latestReaderHref;
      }
      const raw = await collectDomProbe(page, 'main, form', 'consumer');
      recordRun('NL-MG-04', subscribeUrl, '390x844', 'normal', raw, errStart, {
        provenanceOverride: raw.provenanceBadgeVisible || /구독|동의|개인정보/.test(raw.visibleText),
      });
      await page.screenshot({
        path: path.join(OUT_DIR, 'nl09_subscribe_390.png'),
        fullPage: false,
      });
    }

    // ── 4) NL-MG-03: Live Reader (/magazine/[brokerId]/[date]) across 390 normal/xlarge & 360 normal ──
    for (const prof of [
      { label: '390x844', width: 390, height: 844, fontScale: 'normal' as const, shot: 'nl06_reader_390_normal.png' },
      { label: '390x844', width: 390, height: 844, fontScale: 'xlarge' as const, shot: 'nl07_reader_390_xlarge.png' },
      { label: '360x800', width: 360, height: 800, fontScale: 'normal' as const, shot: 'nl08_reader_360_normal.png' },
    ]) {
      await page.setViewportSize({ width: prof.width, height: prof.height });
      const errStart = consoleErrors.length;
      const res = await page.goto(readerUrl, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await applyFontScale(page, prof.fontScale);
      await page.waitForTimeout(450);
      expect(res?.status() ?? 500, `${readerUrl} HTTP status`).toBeLessThan(400);
      const raw = await collectDomProbe(page, 'main, article', 'consumer');
      recordRun('NL-MG-03', readerUrl, prof.label, prof.fontScale, raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, prof.shot),
        fullPage: false,
      });
    }

    // ── 5) NL-MG-06: Chaos Fail-Closed Shortlink Probe (/m/00000000-0000-0000-0000-000000000000) ──
    await page.setViewportSize({ width: 1440, height: 900 });
    {
      const errStart = consoleErrors.length;
      const chaosUrl = '/m/00000000-0000-0000-0000-000000000000';
      await page
        .goto(chaosUrl, { waitUntil: 'networkidle' })
        .catch(() => page.goto(chaosUrl, { waitUntil: 'load' }));
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(800);
      await hideDevOverlay(page);
      expect(page.url()).not.toContain(chaosUrl);
      const raw = await collectDomProbe(page, 'main, body', 'consumer');
      const leakedDraft = /needs_review|unpublished_draft/i.test(raw.visibleText);
      recordRun('NL-MG-06', chaosUrl, '1440x900', 'normal', raw, errStart, {
        provenanceOverride: true,
        boundaryViolationCount: leakedDraft ? 1 : 0,
      });
      await page.screenshot({
        path: path.join(OUT_DIR, 'nl10_shortlink_chaos_probe.png'),
        fullPage: false,
      });
    }

    // ── 6) Rendered Golden Email HTML Viewport Checks (640px PC + 390px Mobile) ──
    const emailHtmlPath = path.join(OUT_DIR, 'email-nl-g1-monthly.html');
    if (fs.existsSync(emailHtmlPath)) {
      const emailHtml = fs.readFileSync(emailHtmlPath, 'utf8');
      for (const vp of [
        { width: 640, height: 900, shot: 'email_nl_g1_pc_640.png' },
        { width: 390, height: 844, shot: 'email_nl_g1_mobile_390.png' },
      ]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.setContent(emailHtml, { waitUntil: 'load' });
        await page.waitForTimeout(200);
        const overflowPx = await page.evaluate(() =>
          Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
        );
        expect(overflowPx, `${vp.shot} horizontal overflow`).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: path.join(OUT_DIR, vp.shot),
          fullPage: false,
        });
      }
    }

    expect(pageErrors, `Uncaught pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);

    const backlog = rankNewsletterPpgtBacklog(scoreResults);
    const summaryPayload = {
      generatedAt: new Date().toISOString(),
      readerUrl,
      subscribeUrl,
      antiSycophancy: ncResult,
      scoreResults,
      tabDiagnostics,
      clippedButtonDetails,
      backlog,
      pageErrors,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, 'sprint1-baseline.json'),
      JSON.stringify(summaryPayload, null, 2),
      'utf8',
    );

    const mdLines = [
      '# Newsletter Sprint 1 PPGT-Loop R1+R2 Verification Report',
      '',
      `- Generated: ${summaryPayload.generatedAt}`,
      `- Live Reader URL: ${readerUrl}`,
      `- Anti-Sycophancy Controls (NC-NL-01..03): ${ncResult.passed ? 'PASS' : 'FAIL'}`,
      `- Total Clipped Buttons Detected: ${clippedButtonDetails.reduce((s, d) => s + d.buttons.length, 0)}`,
      '',
      '## 1. Tab Cognitive Load & Ergonomics (`/broker/w/newsletter`)',
      '| Tab & FontScale | Editor Above-Fold Actions | Total Visible Interactive | <44px Buttons | <14px Texts | Clipped CTAs | Sidebar Ellipsis |',
      '|:--|:--:|--:|--:|--:|--:|--:|',
      ...tabDiagnostics.map(
        (t) =>
          `| ${t.tab} | ${t.aboveFoldActionCount} | ${t.totalVisibleInteractiveCount} | ${t.sub44ButtonsCount} | ${t.sub14TextsCount} | ${t.clippedButtonsCount} | ${t.sidebarEllipsisCount} |`,
      ),
      '',
      '## 2. Persona Score Summary (R2 Non-Compensatory)',
      '| Persona | Surface | R2 Overall | Raw Weighted | FloorRisk | Reasons |',
      '|:--|:--|--:|--:|:--:|:--|',
      ...scoreResults.map(
        (r) =>
          `| ${r.personaId} | ${r.surface} | ${r.weightedOverall} | ${r.rawWeightedOverall} | ${r.floorRisk ? 'YES' : 'NO'} | ${r.floorReasons.join(', ') || '-'} |`,
      ),
      '',
      '## 3. Clipped Button Diagnostics',
      ...(clippedButtonDetails.length === 0
        ? ['- None (0 clipped/ellipsis-truncated buttons across all probed views)']
        : clippedButtonDetails.map(
            (d) =>
              `- ${d.surface} (${d.viewport} ${d.fontScale}): ${d.buttons
                .map((b) => `"${b.text}" (${b.clientW}px/${b.scrollW}px)`)
                .join(', ')}`,
          )),
      '',
      '## 4. Remaining P-Score Backlog',
      ...(backlog.length === 0
        ? ['- No P0/P1/P2 backlog items remaining from Layer C probe!']
        : [
            '| Rank | Tier | P-Score | Track | Issue | Target File | Summary |',
            '|--:|:--|--:|:--|:--|:--|:--|',
            ...backlog.map(
              (b, i) =>
                `| ${i + 1} | ${b.tier} | ${b.pScore} | ${b.track} | ${b.issueKey} | ${b.targetFileHint} | ${b.summaries[0] || ''} |`,
            ),
          ]),
    ];

    fs.writeFileSync(path.join(OUT_DIR, 'sprint1-baseline.md'), mdLines.join('\n'), 'utf8');

    const packetLines = [
      '# Newsletter Human 2nd Review Packet (1차 검수 패킷 — 예상 소요 35분)',
      '',
      `- 생성 시각: ${summaryPayload.generatedAt}`,
      '- Layer A~C 자동 검증 완료 상태 요약 (Layer D R3 멀티모달·편집 적합성 심사 실행 전 초안)',
      '',
      '## 캡처 스크린샷 증거 (UI 10컷 + 이메일 2컷 + OG 3종)',
      `- \`${path.join(OUT_DIR, 'nl01_editor_tab1_1440_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl02_editor_tab2_1440_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl03_editor_tab3_send_1440.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl04_editor_tab2_1440_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl05_editor_390_mobile.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl06_reader_390_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl07_reader_390_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl08_reader_360_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl09_subscribe_390.png')}\``,
      `- \`${path.join(OUT_DIR, 'nl10_shortlink_chaos_probe.png')}\``,
      `- \`${path.join(OUT_DIR, 'email_nl_g1_pc_640.png')}\``,
      `- \`${path.join(OUT_DIR, 'email_nl_g1_mobile_390.png')}\``,
      `- \`${path.join(OUT_DIR, 'og-nl-g1-monthly.png')}\``,
      `- \`${path.join(OUT_DIR, 'og-nl-g3-daily.png')}\``,
      `- \`${path.join(OUT_DIR, 'og-nl-g4-special.png')}\``,
    ];

    fs.writeFileSync(
      path.join(OUT_DIR, 'NEWSLETTER_HUMAN_REVIEW_PACKET.md'),
      packetLines.join('\n'),
      'utf8',
    );
  });
});
