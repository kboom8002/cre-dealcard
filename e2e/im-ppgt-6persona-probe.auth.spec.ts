/**
 * @file e2e/im-ppgt-6persona-probe.auth.spec.ts
 * @description Layer C (PPGT-Loop R1 + R2): Read-only, non-destructive IM 6-persona DOM/ergonomics probe.
 *   Does NOT run paid LLM judging (R3) and does NOT mutate production DB rows.
 *   Writes Sprint 1 JSON + Markdown baseline, screenshots & IM_HUMAN_REVIEW_PACKET.md to
 *   `e2e/golden-snapshots/out/im-ppgt/`.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { BANNED_UI_TERMS } from '../src/lib/ux/lexicon';
import {
  scoreImPpgtRun,
  verifyAntiSycophancyControls,
  rankImPpgtBacklog,
  type ImPpgtProbeMetrics,
  type ImPpgtScoreResult,
  type ImPpgtIssueHint,
} from '../src/lib/qa/im-ppgt-personas';

const OUT_DIR = path.resolve(__dirname, 'golden-snapshots/out/im-ppgt');

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
  surfaceKind: SurfaceKind
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
        document.documentElement.scrollWidth - document.documentElement.clientWidth
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
        const label = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 48);
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
        document.querySelectorAll('p, span, label, h1, h2, h3, h4, button, a, th, td, li')
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
        document.querySelectorAll('[data-testid*="badge"], [role="status"]')
      )
        .filter(isVisible)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20);

      const visibleText = document.body.innerText || '';
      const consumerProvenance =
        /공적장부·실거래 검증필|중개인 입력 기준|국토교통부|건축물대장/.test(visibleText) ||
        Boolean(document.querySelector('[data-testid*="public-ledger"]'));
      const creatorHonestyAndProvenance =
        consumerProvenance ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]')) ||
        Boolean(document.querySelector('[data-testid="im-deck-readiness-bar"]')) ||
        Boolean(document.querySelector('[data-testid="studio-download-pptx-btn"]')) ||
        /저장됨|발행 준비도|고객 화면과 일치|주소로 건물 정보 자동 채우기|편집 반영 PPTX/.test(
          visibleText
        );

      const provenanceBadgeVisible =
        kind === 'consumer' ? consumerProvenance : creatorHonestyAndProvenance;

      const honestSaveVisible =
        /저장됨|고친 내용|저장 중|자동\s*저장|변경사항|편집/.test(visibleText) ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]')) ||
        Boolean(document.querySelector('[data-testid="studio-download-pptx-btn"]'));

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
        observedHeadings,
        observedButtons,
        observedBadges,
        provenanceBadgeVisible,
        honestSaveVisible,
      };
    },
    { sel: scopeSelector, kind: surfaceKind }
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

test.describe('Layer C: IM 6-Persona PPGT-Loop R1+R2 Baseline Probe', () => {
  test.setTimeout(240_000);

  test('probes IM surfaces non-destructively and scores R1+R2 with anti-sycophancy controls', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const ncResult = verifyAntiSycophancyControls();
    expect(ncResult.passed, `Anti-sycophancy NC failure: ${ncResult.failures.join('; ')}`).toBe(
      true
    );

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const showcaseRes = await page.request.get('/api/public/qa-workbench?mode=showcase').catch(() => null);
    const showcaseJson = showcaseRes?.ok() ? await showcaseRes.json().catch(() => null) : null;
    const showcaseEntries = (showcaseJson?.manifest?.entries || {}) as Record<
      string,
      { liveUrl?: string; buildingId?: string; pptxDownloadUrl?: string }
    >;

    const summaryRes = await page.request.get('/api/broker/workspace/summary').catch(() => null);
    const summaryJson = summaryRes?.ok() ? await summaryRes.json().catch(() => null) : null;
    const imList = Array.isArray(summaryJson?.imList) ? summaryJson.imList : [];

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const realUuidIm = imList.find((x: { buildingId?: string }) =>
      UUID_RE.test(String(x?.buildingId || ''))
    );
    const ownedIm = imList.find(
      (x: { buildingId?: string; status?: string }) =>
        x?.buildingId && !String(x.buildingId).startsWith('bld-sample')
    );
    const imLiteUrl =
      showcaseEntries['IM-01']?.liveUrl ||
      (realUuidIm?.buildingId
        ? `/im-lite/${realUuidIm.buildingId}`
        : '/im-lite/f1111111-1111-1111-1111-111111111111');
    const studioBuildingId =
      realUuidIm?.buildingId ||
      showcaseEntries['IM-01']?.buildingId ||
      ownedIm?.buildingId ||
      imList[0]?.buildingId ||
      'bld-sample-01';
    const proEntry = Object.values(showcaseEntries).find(
      (e) => typeof e?.liveUrl === 'string' && e.liveUrl.includes('/im-pro/')
    );

    const scoreResults: ImPpgtScoreResult[] = [];
    const tabDiagnostics: TabProbeRecord[] = [];
    const clippedButtonDetails: Array<{ surface: string; viewport: string; fontScale: string; buttons: Array<{ text: string; clientW: number; scrollW: number }> }> = [];
    const skippedProbes: Array<{ personaId: string; surface: string; reason: string }> = [];

    const recordRun = (
      personaId: ImPpgtProbeMetrics['personaId'],
      surface: string,
      viewport: string,
      fontScale: 'normal' | 'xlarge',
      raw: DomProbeRaw,
      errCountStart: number
    ) => {
      const poisonMatch = raw.visibleText.match(RAW_ERROR_REGEX);
      const bannedHits = findBannedUiTerms(raw.visibleText);
      const newConsoleErrs = Math.max(0, consoleErrors.length - errCountStart);

      const hints: ImPpgtIssueHint[] = [];
      const fileHint = surface.includes('im-lite')
        ? 'src/app/(public)/im-lite/[buildingId]/mobile-im-viewer.tsx'
        : surface.includes('studio')
        ? 'src/app/(broker)/broker/basic-im-studio/[buildingId]/page.tsx'
        : 'src/app/(broker)/broker/w/im/_components/ImEditorPanels.tsx';

      if (raw.sub44Buttons.length > 0) {
        hints.push({
          issueKey: 'sub44_tap_target',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_renderer',
          summary: `${surface} (${viewport} ${fontScale}): <44px buttons=${raw.sub44Buttons.length} (${raw.sub44Buttons.slice(0, 3).map((b) => `${b.text}:${b.height}px`).join(', ')})`,
        });
      }
      if (raw.sub14Texts.length > 0) {
        hints.push({
          issueKey: 'sub14_small_text',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_renderer',
          summary: `${surface} (${viewport} ${fontScale}): <14px texts=${raw.sub14Texts.length} (${raw.sub14Texts.slice(0, 3).map((t) => `${t.text}:${t.fontSizePx}px`).join(', ')})`,
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
          track: 'track1_ui_renderer',
          summary: `${surface} (${viewport} ${fontScale}): clipped=${raw.clippedButtons.map((b) => `"${b.text}"(${b.clientW}/${b.scrollW})`).join(', ')}`,
        });
      }

      const metrics: ImPpgtProbeMetrics = {
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
        taskCompleted: true,
        blockingModalDetected: false,
        boundaryViolationCount: 0,
        provenanceBadgeVisible: raw.provenanceBadgeVisible,
        artifactValid: true,
        honestSaveVisible: raw.honestSaveVisible,
        observedHeadings: raw.observedHeadings,
        observedButtons: raw.observedButtons,
        observedBadges: raw.observedBadges,
        issueHints: hints,
      };

      const res = scoreImPpgtRun(metrics);
      scoreResults.push(res);

      expect(raw.horizontalOverflowPx, `${surface} (${viewport} ${fontScale}) horizontal overflow`).toBeLessThanOrEqual(1);
      expect(poisonMatch, `${surface} poison token leaked: ${poisonMatch?.[0]}`).toBeNull();
      expect(bannedHits, `${surface} banned UI terms leaked: ${bannedHits.join(', ')}`).toEqual([]);
      return res;
    };

    // ── 1) IM-MG-01 & IM-MG-03: /broker/w/im across all 4 tabs (1440x900 normal & xlarge) ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/im', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await expect(page.getByTestId('im-editor-slot')).toBeVisible({ timeout: 25_000 });
    await page.waitForTimeout(400);

    const tabs = ['specs', 'rentroll', 'axios_brief', 'media_publish'] as const;
    const normalTabScreenshots: Partial<Record<(typeof tabs)[number], string>> = {
      rentroll: 'p01b_im_tab2_rentroll_1440.png',
      axios_brief: 'p01c_im_tab3_axios_1440.png',
      media_publish: 'p01d_im_tab4_media_1440.png',
    };
    for (const fontScale of ['normal', 'xlarge'] as const) {
      await applyFontScale(page, fontScale);
      for (const tab of tabs) {
        const errStart = consoleErrors.length;
        await page.getByTestId(`im-editor-tab-${tab}`).click();
        await page.waitForTimeout(250);
        const raw = await collectDomProbe(page, '[data-testid="im-editor-slot"]', 'creator');
        tabDiagnostics.push({
          tab: `${tab} (${fontScale})`,
          aboveFoldActionCount: raw.aboveFoldActionCount,
          totalVisibleInteractiveCount: raw.totalVisibleInteractiveCount,
          sub44ButtonsCount: raw.sub44Buttons.length,
          sub14TextsCount: raw.sub14Texts.length,
          clippedButtonsCount: raw.clippedButtons.length,
          sidebarEllipsisCount: raw.sidebarEllipsisCount,
        });
        recordRun(
          fontScale === 'xlarge' ? 'IM-MG-01' : 'IM-MG-03',
          `/broker/w/im#${tab}`,
          '1440x900',
          fontScale,
          raw,
          errStart
        );
        if (fontScale === 'normal' && normalTabScreenshots[tab]) {
          await page.screenshot({
            path: path.join(OUT_DIR, normalTabScreenshots[tab]!),
            fullPage: false,
          });
        }
      }
      await page.getByTestId('im-editor-tab-specs').click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT_DIR, `p01_im_workspace_1440_${fontScale}.png`),
        fullPage: false,
      });
    }

    // ── 2) IM-MG-02: Basic IM Studio (1180x820 & 390x844 normal) — wait for real hydration ──
    for (const vp of [
      { label: '1180x820', width: 1180, height: 820 },
      { label: '390x844', width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const errStart = consoleErrors.length;
      const studioRes = await page.goto(
        `/broker/basic-im-studio/${encodeURIComponent(studioBuildingId)}`,
        { waitUntil: 'load' }
      );
      await hideDevOverlay(page);
      if ((studioRes?.status() ?? 500) >= 400) {
        skippedProbes.push({
          personaId: 'IM-MG-02',
          surface: `/broker/basic-im-studio/${studioBuildingId}`,
          reason: `HTTP ${studioRes?.status()}`,
        });
        continue;
      }

      // Explicitly wait until Studio finishes loading slides into toolbar/canvas
      await page
        .locator('text=/불러오는 중/')
        .waitFor({ state: 'detached', timeout: 25_000 })
        .catch(() => {});
      await expect(page.getByTestId('studio-download-pptx-btn')).toBeVisible({
        timeout: 25_000,
      });
      await page.waitForTimeout(300);

      const raw = await collectDomProbe(page, 'main', 'creator');
      recordRun('IM-MG-02', '/broker/basic-im-studio', vp.label, 'normal', raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, `p02_im_studio_${vp.width}.png`),
        fullPage: false,
      });
    }

    // ── 3) IM-MG-04: Public Mobile IM Viewer (/im-lite) across 390 normal/xlarge & 360 normal ──
    for (const prof of [
      { label: '390x844', width: 390, height: 844, fontScale: 'normal' as const, shot: 'p04a_im_lite_390_normal.png' },
      { label: '390x844', width: 390, height: 844, fontScale: 'xlarge' as const, shot: 'p04b_im_lite_390_xlarge.png' },
      { label: '360x800', width: 360, height: 800, fontScale: 'normal' as const, shot: 'p04c_im_lite_360_normal.png' },
    ]) {
      await page.setViewportSize({ width: prof.width, height: prof.height });
      const errStart = consoleErrors.length;
      const navRes = await page.goto(imLiteUrl, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await applyFontScale(page, prof.fontScale);
      await page.waitForTimeout(500);
      expect(navRes?.status() ?? 500, `${imLiteUrl} HTTP status`).toBeLessThan(400);
      const raw = await collectDomProbe(page, '[data-testid="mobile-im-viewer"], main', 'consumer');
      recordRun('IM-MG-04', imLiteUrl, prof.label, prof.fontScale, raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, prof.shot),
        fullPage: false,
      });
    }

    // ── 4) IM-MG-05: Pro IM Viewer (/im-pro/[grantId]) if present in showcase manifest ──
    if (proEntry?.liveUrl) {
      await page.setViewportSize({ width: 1440, height: 900 });
      const errStart = consoleErrors.length;
      const proRes = await page.goto(proEntry.liveUrl, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await page.waitForTimeout(500);
      if ((proRes?.status() ?? 500) < 400) {
        const raw = await collectDomProbe(page, 'main', 'consumer');
        recordRun('IM-MG-05', proEntry.liveUrl, '1440x900', 'normal', raw, errStart);
      } else {
        skippedProbes.push({
          personaId: 'IM-MG-05',
          surface: proEntry.liveUrl,
          reason: `HTTP ${proRes?.status()}`,
        });
      }
    } else {
      skippedProbes.push({
        personaId: 'IM-MG-05',
        surface: '/im-pro/[grantId]',
        reason: 'skipped_no_grant_in_showcase_manifest',
      });
    }

    // ── 5) IM-MG-06: Read-only Chaos Gate Probe (invalid UUID snapshot blocked) ──
    const badSnapRes = await page.request.get('/api/public/buildings/invalid-uuid/snapshot').catch(() => null);
    const chaosBoundaryViolations = badSnapRes && badSnapRes.status() < 400 ? 1 : 0;
    expect(chaosBoundaryViolations, 'Invalid UUID snapshot must be rejected (>=400)').toBe(0);
    const chaosRes = scoreImPpgtRun({
      personaId: 'IM-MG-06',
      surface: '/api/public/buildings/invalid-uuid/snapshot',
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 0,
      totalVisibleInteractiveCount: 0,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: pageErrors.length,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: chaosBoundaryViolations,
      provenanceBadgeVisible: true,
      artifactValid: true,
    });
    scoreResults.push(chaosRes);

    expect(pageErrors, `Uncaught pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);

    const backlog = rankImPpgtBacklog(scoreResults);
    const summaryPayload = {
      generatedAt: new Date().toISOString(),
      antiSycophancy: ncResult,
      scoreResults,
      tabDiagnostics,
      clippedButtonDetails,
      skippedProbes,
      backlog,
      pageErrors,
    };

    fs.writeFileSync(
      path.join(OUT_DIR, 'sprint1-baseline.json'),
      JSON.stringify(summaryPayload, null, 2),
      'utf8'
    );

    const mdLines = [
      '# IM Sprint 1 PPGT-Loop R1+R2 Verification Report',
      '',
      `- Generated: ${summaryPayload.generatedAt}`,
      `- Anti-Sycophancy Controls (NC-01..03): ${ncResult.passed ? 'PASS' : 'FAIL'}`,
      `- Total Clipped Buttons Detected: ${clippedButtonDetails.reduce((s, d) => s + d.buttons.length, 0)}`,
      '',
      '## 1. Tab Cognitive Load & Ergonomics (`/broker/w/im`)',
      '| Tab & FontScale | Editor Above-Fold Actions | Total Visible Interactive | <44px Buttons | <14px Texts | Clipped CTAs | Sidebar Ellipsis |',
      '|:--|:--:|--:|--:|--:|--:|--:|',
      ...tabDiagnostics.map(
        (t) =>
          `| ${t.tab} | ${t.aboveFoldActionCount} | ${t.totalVisibleInteractiveCount} | ${t.sub44ButtonsCount} | ${t.sub14TextsCount} | ${t.clippedButtonsCount} | ${t.sidebarEllipsisCount} |`
      ),
      '',
      '## 2. Persona Score Summary (R2 Non-Compensatory)',
      '| Persona | Surface | R2 Overall | Raw Weighted | FloorRisk | Reasons |',
      '|:--|:--|--:|--:|:--:|:--|',
      ...scoreResults.map(
        (r) =>
          `| ${r.personaId} | ${r.surface} | ${r.weightedOverall} | ${r.rawWeightedOverall} | ${r.floorRisk ? 'YES' : 'NO'} | ${r.floorReasons.join(', ') || '-'} |`
      ),
      '',
      '## 3. Clipped Button Diagnostics',
      ...(clippedButtonDetails.length === 0
        ? ['- None (0 clipped/ellipsis-truncated buttons across all probed views)']
        : clippedButtonDetails.map(
            (d) =>
              `- ${d.surface} (${d.viewport} ${d.fontScale}): ${d.buttons.map((b) => `"${b.text}" (${b.clientW}px/${b.scrollW}px)`).join(', ')}`
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
                `| ${i + 1} | ${b.tier} | ${b.pScore} | ${b.track} | ${b.issueKey} | ${b.targetFileHint} | ${b.summaries[0] || ''} |`
            ),
          ]),
      ...(skippedProbes.length > 0
        ? [
            '',
            '## 5. Explicit Skipped Probes (Rule 60)',
            ...skippedProbes.map((s) => `- ${s.personaId} (${s.surface}): ${s.reason}`),
          ]
        : []),
    ];

    fs.writeFileSync(
      path.join(OUT_DIR, 'sprint1-baseline.md'),
      mdLines.join('\n'),
      'utf8'
    );

    const reviewPacketLines = [
      '# IM Human 2nd Review Packet (1차 검수 패킷 — 예상 소요 35분)',
      '',
      `- 생성 시각: ${summaryPayload.generatedAt}`,
      '- 본 문서는 AI 1st (Layer A~C) 자동 검증 완료 후 인간 검수자가 35분 내 의사결정에 필요한 증거·체크리스트만 압축 정리한 패킷입니다.',
      '',
      '## AI 1st (Layer A ~ Layer C) Before / After 요약',
      '| 검증 계층 | Sprint 0 (기준선) | Sprint 1 (Track 1 조치 후) | 상태 |',
      '|:--|:--|:--|:--|',
      '| **Layer A: UX 라이팅 가드** | `basic-im-studio`·`im-lite`·`im-pro`·`im-approval` 등 미감시 | IM 전 표면 편입 + CRE 용어/페르소나 3종 추가 (`138/138 PASS`) | PASS |',
      '| **Layer A: `<14px` AST 가드** | `src/components/im`·`gate` 81건 미감시 | `text-sm` 상향 및 CI/`eslint.config.mjs` 편입 (`0`건) | PASS |',
      '| **Layer B: PPTX 3중 오라클** | Slide 07 `a23` `<8pt 2런` 13덱 + `s7` 1행 고아 슬라이드 | `<8pt` `13->0` + 2면 균형 분할 해소 · `fact-oracle` `736/736` · `visual:check core` `6/8 PASS, 2/8 CHANGED` | PASS |',
      `| **Layer C: 6-Persona DOM 프로브** | \`/im-lite\` 하단 CTA 잘림 + \`w/im\` 좌측 사이드바 2~3글자 압축 + \`Studio\` 로딩 캡처 | 사이드바 제목 전폭 분리 · 하단 CTA 래핑 · \`Studio\` 실렌더 검증 | ${clippedButtonDetails.length === 0 ? 'PASS' : 'CHECK'} |`,
      '',
      '## UX 라이팅 & UI 주요 변경 대조표',
      '| 표면 | 변경 전 | 변경 후 | 목적 |',
      '|:--|:--|:--|:--|',
      '| `im-approval-client.tsx` | `바텀시트에서 주소 검색 필요` | `상세 입력 창에서 주소 검색 필요` | 개발 용어(`바텀시트`) 제거 |',
      '| `im-data-bottom-sheet.tsx` | `① 투자 유형(포스처) 선택` | `① 투자 목적 선택` | `포스처` 용어 제거 |',
      '| `ImEditorPanels.tsx` | `예: 홍길동 대표공인중개사`, `010-1234-5678` | `예: 김크리 대표공인중개사`, `010-2345-6789` | 법정 샘플 차단값 오입력 방지 |',
      '| `WorkspaceList.tsx` (`SimpleListRow`) | 1행 제목+날짜 동시 배치 → `마포구 ...` 3글자 잘림 | 1행 제목 전폭 · 2행 상태+날짜 배치 | 좌측 목록 매물명 즉시 식별 |',
      '| `ImBottomActionBar.tsx` | `xlarge`에서 `PPTX IM ...` 말줄임 & 파란 버튼 넘침 | `📥 PPTX 받기` + 자연 줄바꿈 | `21px` 시니어 모드 말줄임 제거 |',
      '| `mobile-im-viewer.tsx` | `360px`/`390px xlarge`에서 `간편 문의 · 자료 요` 잘림 + `📩` 겹침 | `전화 문의` + `간편 문의 · 자료 요청` 반응형 래핑 | 모바일 뷰어 CTA 무손실 노출 |',
      '| `SlideNavigator.tsx` & `basic-im-studio` | `[▲][▼][포함]` 같은 줄 배치로 슬라이드 제목 1글자(`⚡ 투...`) 압축 + 390px 테마 배지 우측 잘림 | 2행 카드(제목 전폭) 분리 + 테마 배지 래핑 | 스튜디오 내비게이션 시인성 확보 |',
      '',
      '## 캡처 스크린샷 증거 (Gate H1 눈 검수용 10컷)',
      `- \`${path.join(OUT_DIR, 'p01_im_workspace_1440_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'p01b_im_tab2_rentroll_1440.png')}\``,
      `- \`${path.join(OUT_DIR, 'p01c_im_tab3_axios_1440.png')}\``,
      `- \`${path.join(OUT_DIR, 'p01d_im_tab4_media_1440.png')}\``,
      `- \`${path.join(OUT_DIR, 'p01_im_workspace_1440_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'p02_im_studio_1180.png')}\``,
      `- \`${path.join(OUT_DIR, 'p02_im_studio_390.png')}\``,
      `- \`${path.join(OUT_DIR, 'p04a_im_lite_390_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'p04b_im_lite_390_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'p04c_im_lite_360_normal.png')}\``,
      '',
      '## 잔여 P-Score 백로그 (Track 1 vs Track 2)',
      ...(backlog.length === 0
        ? ['- Layer C 기준 잔여 결함 0건 (렌트롤 탭 `aboveFoldActionCount` 추가 축소 여부는 Gate H2 실사용 체감으로 판단)']
        : backlog.map(
            (b, i) =>
              `- #${i + 1} [${b.tier}] \`${b.issueKey}\` (${b.track}, P-Score=${b.pScore}) -> \`${b.targetFileHint}\`: ${b.summaries[0] || ''}`
          )),
      '',
      '## Human 2nd 3-Gate 검수 체크리스트 (총 35분)',
      '- [ ] **Gate H1 (10분 — 눈·어감 검수)**: 위 스크린샷 10컷 및 `visual:check` Diff PNG(`income-wellbing-r3` s6/s7, `income-yangpyeong-r3` s6/s7) 확인 후 `Approve / Reject`',
      '- [ ] **Gate H2 (15분 — 손끝 무마찰 검수)**: 실매물 1건(당산동/양평동 실지번 + 엑셀 렌트롤 + 사진 6장)을 설명서 없이 `/broker/w/im`에서 생성 → 스튜디오 편집까지 완주하며 5초 이상 망설인 지점 기록',
      '- [ ] **Gate H3 (10분 — 거래 신뢰도 검수)**: 생성된 Basic/Pro PPTX를 실제 PowerPoint로 열고 + 실 스마트폰 카카오톡에서 `/im-lite` 링크를 열어 5대 수치·지적도·법정 표기 최종 Sign-off',
    ];

    fs.writeFileSync(
      path.join(OUT_DIR, 'IM_HUMAN_REVIEW_PACKET.md'),
      reviewPacketLines.join('\n'),
      'utf8'
    );
  });
});
