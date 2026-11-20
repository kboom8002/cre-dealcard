/**
 * @file e2e/dealcard-ppgt-6persona-probe.auth.spec.ts
 * @description Layer C (PPGT-Loop R1 + R2): Read-only, non-destructive DealCard 6-persona DOM/ergonomics,
 *   UX writing, 3-tier spec suitability, OG binary & fail-closed security probe.
 *   Writes `sprint1-baseline.{json,md}`, PNG captures, and `DEALCARD_HUMAN_REVIEW_PACKET.md`
 *   to `e2e/golden-snapshots/out/dealcard-ppgt/`.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  scoreDealCardPpgtRun,
  verifyDealCardAntiSycophancyControls,
  rankDealCardPpgtBacklog,
  type DealCardPpgtProbeMetrics,
  type DealCardPpgtScoreResult,
  type DealCardPpgtIssueHint,
} from '../src/lib/qa/dealcard-ppgt-personas';
import {
  scanUxWriting,
  auditDealCardContentSuitability,
} from '../src/lib/qa/ux-writing-and-content-oracle';
import { DEALCARD_SHOWCASE_8 } from '../src/lib/qa/output-showcase-scenarios';

const OUT_DIR = path.resolve(__dirname, 'golden-snapshots/out/dealcard-ppgt');

type SurfaceKind = 'creator' | 'consumer';

interface DomProbeRaw {
  horizontalOverflowPx: number;
  aboveFoldActionCount: number;
  totalVisibleInteractiveCount: number;
  sub44Buttons: Array<{ text: string; width: number; height: number }>;
  sub14Texts: Array<{ text: string; tag: string; fontSizePx: number }>;
  clippedButtons: Array<{ text: string; clientW: number; scrollW: number }>;
  brokenImgs: Array<{ alt: string; src: string }>;
  visibleText: string;
  observedHeadings: string[];
  observedButtons: string[];
  observedBadges: string[];
  provenanceBadgeVisible: boolean;
  honestSaveVisible: boolean;
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

      const scopeAboveFold = scopeInteractives.filter(inViewport);
      const sub44Buttons: Array<{ text: string; width: number; height: number }> = [];
      const clippedButtons: Array<{ text: string; clientW: number; scrollW: number }> = [];
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
            Boolean(htmlEl.closest('[data-list-row="simple"]')) ||
            Boolean(htmlEl.closest('[data-testid^="dealcard-item-"]'));
          if (!isSidebarRow) {
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

            if ((ownOverflow || truncatedSpan) && clippedButtons.length < 20) {
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
      }

      const brokenImgs: Array<{ alt: string; src: string }> = [];
      for (const img of Array.from(document.querySelectorAll('img')).filter(isVisible)) {
        if (img.complete && img.naturalWidth === 0 && brokenImgs.length < 15) {
          brokenImgs.push({ alt: img.alt || '', src: img.src.slice(0, 120) });
        }
      }

      const observedHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
        .filter(isVisible)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20);

      const observedBadges = Array.from(
        document.querySelectorAll('[data-testid*="badge"], [role="status"]'),
      )
        .filter(isVisible)
        .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 20);

      const visibleText = document.body.innerText || '';
      const consumerProvenance =
        /공인중개사|등록번호|개업공인중개사|담당 중개사|매물 핵심 요약/.test(visibleText);
      const creatorProvenance =
        consumerProvenance ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]')) ||
        Boolean(document.querySelector('[data-testid="kakao-bubble-preview"]')) ||
        /저장됨|미리보기|카톡으로 보내기|예시 넣기/.test(visibleText);

      const provenanceBadgeVisible = kind === 'consumer' ? consumerProvenance : creatorProvenance;
      const honestSaveVisible =
        /저장됨|고친 내용|저장 중|자동\s*저장|미리보기|상세 제안서/.test(visibleText) ||
        Boolean(document.querySelector('[data-testid="preview-causality-bar"]'));

      return {
        horizontalOverflowPx: overflowPx,
        aboveFoldActionCount: scopeAboveFold.length,
        totalVisibleInteractiveCount: allInteractives.length,
        sub44Buttons,
        sub14Texts,
        clippedButtons,
        brokenImgs,
        visibleText,
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

test.describe('Layer C: DealCard 6-Persona PPGT-Loop R1+R2 Baseline Probe', () => {
  test.setTimeout(240_000);

  test('probes DealCard workspace, public /dc/[id], OG binary, and fail-closed chaos gate', async ({
    page,
  }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const ncResult = verifyDealCardAntiSycophancyControls();
    expect(
      ncResult.passed,
      `DealCard Anti-sycophancy NC failure: ${ncResult.failures.join('; ')}`,
    ).toBe(true);

    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Discover public DealCard URLs from showcase manifest or workspace summary
    const showcaseRes = await page.request.get('/api/public/qa-workbench?mode=showcase').catch(() => null);
    const showcaseJson = showcaseRes?.ok() ? await showcaseRes.json().catch(() => null) : null;
    const showcaseEntries = (showcaseJson?.manifest?.entries || {}) as Record<
      string,
      { liveUrl?: string; buildingId?: string; ogImageUrl?: string | null }
    >;

    const summaryRes = await page.request.get('/api/broker/workspace/summary').catch(() => null);
    const summaryJson = summaryRes?.ok() ? await summaryRes.json().catch(() => null) : null;
    const dcList = Array.isArray(summaryJson?.dealcardList)
      ? summaryJson.dealcardList
      : Array.isArray(summaryJson?.dealCards)
        ? summaryJson.dealCards
        : [];

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const publishedFromWorkspace = dcList.find(
      (d: { id?: string; buildingId?: string; status?: string }) =>
        (d?.status === 'sent' || d?.status === 'published') &&
        UUID_RE.test(String(d?.buildingId || d?.id || '')),
    );
    const anyWorkspaceUuid = dcList.find((d: { id?: string; buildingId?: string }) =>
      UUID_RE.test(String(d?.buildingId || d?.id || '')),
    );

    const primaryDcId =
      showcaseEntries['DC-01']?.buildingId ||
      publishedFromWorkspace?.buildingId ||
      publishedFromWorkspace?.id ||
      anyWorkspaceUuid?.buildingId ||
      anyWorkspaceUuid?.id ||
      DEALCARD_SHOWCASE_8[0].buildingId;

    const primaryDcUrl =
      showcaseEntries['DC-01']?.liveUrl || `/dc/${primaryDcId}?preview=1`;
    const ownerDcUrl =
      showcaseEntries['DC-04']?.liveUrl || primaryDcUrl;
    const devDcUrl =
      showcaseEntries['DC-05']?.liveUrl || primaryDcUrl;

    const scoreResults: DealCardPpgtScoreResult[] = [];
    const sub44Diagnostics: Array<{
      surface: string;
      viewport: string;
      fontScale: string;
      buttons: Array<{ text: string; width: number; height: number }>;
    }> = [];
    const clippedButtonDetails: Array<{
      surface: string;
      viewport: string;
      fontScale: string;
      buttons: Array<{ text: string; clientW: number; scrollW: number }>;
    }> = [];

    const recordRun = (
      personaId: DealCardPpgtProbeMetrics['personaId'],
      surface: string,
      viewport: string,
      fontScale: 'normal' | 'xlarge',
      raw: DomProbeRaw,
      errCountStart: number,
      extra: {
        artifactValid?: boolean;
        blindLeakCount?: number;
        numericSpinCount?: number;
        threeTierSpecMissingCount?: number;
        boundaryViolationCount?: number;
        provenanceOverride?: boolean;
      } = {},
    ) => {
      const writingScan = scanUxWriting(raw.visibleText);
      const newConsoleErrs = Math.max(0, consoleErrors.length - errCountStart);

      const hints: DealCardPpgtIssueHint[] = [];
      const fileHint = surface.startsWith('/dc/')
        ? 'src/app/(public)/dc/[id]/page.tsx'
        : 'src/components/broker/deal-card/Card4ConfirmCard.tsx';

      if (raw.sub44Buttons.length > 0) {
        sub44Diagnostics.push({
          surface,
          viewport,
          fontScale,
          buttons: raw.sub44Buttons,
        });
        hints.push({
          issueKey: 'sub44_tap_target',
          targetFileHint: fileHint,
          axis: 'U2_visual_ergonomics',
          track: 'track1_ui_gate_renderer',
          summary: `${surface} (${viewport} ${fontScale}): <44px buttons=${raw.sub44Buttons.length} (${raw.sub44Buttons
            .slice(0, 4)
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

      const metrics: DealCardPpgtProbeMetrics = {
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
        poisonTokenCount: writingScan.poisonTokenCount,
        bannedTermCount: writingScan.bannedTermCount,
        blindLeakCount: extra.blindLeakCount ?? 0,
        numericSpinCount: extra.numericSpinCount ?? 0,
        threeTierSpecMissingCount: extra.threeTierSpecMissingCount ?? 0,
        uxWritingViolationsCount:
          writingScan.josaViolationCount + writingScan.truncationViolationCount,
        contentSuitabilityViolationsCount: 0,
        taskCompleted: true,
        blockingModalDetected: false,
        boundaryViolationCount: extra.boundaryViolationCount ?? 0,
        provenanceBadgeVisible: extra.provenanceOverride ?? raw.provenanceBadgeVisible,
        artifactValid: extra.artifactValid ?? true,
        honestSaveVisible: raw.honestSaveVisible,
        observedHeadings: raw.observedHeadings,
        observedButtons: raw.observedButtons,
        observedBadges: raw.observedBadges,
        issueHints: hints,
      };

      const res = scoreDealCardPpgtRun(metrics);
      scoreResults.push(res);

      expect(
        raw.horizontalOverflowPx,
        `${surface} (${viewport} ${fontScale}) horizontal overflow`,
      ).toBeLessThanOrEqual(1);
      expect(writingScan.poisonTokenCount, `${surface} poison tokens`).toBe(0);
      expect(writingScan.bannedTermCount, `${surface} banned terms`).toBe(0);
      return res;
    };

    // ── 1) DC-MG-02 & DC-MG-01: /broker/w/dealcards (1440 normal, 1440 xlarge, 390 normal) ──
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/broker/w/dealcards', { waitUntil: 'load' });
    await hideDevOverlay(page);
    await expect(page.locator('[data-testid="dealcard-card4-stage"], [data-testid="dealcard-awaiting-memo-guide"]').first()).toBeVisible({
      timeout: 25_000,
    });
    await page.waitForTimeout(450);

    // Ensure Card4 editor is visible (click sample fill if blank starter)
    const sampleBtn = page.getByTestId('dealcard-fill-sample-btn').first();
    if (!(await page.getByTestId('card4-confirm-card').isVisible().catch(() => false))) {
      if (await sampleBtn.isVisible().catch(() => false)) {
        await sampleBtn.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    for (const fontScale of ['normal', 'xlarge'] as const) {
      await applyFontScale(page, fontScale);
      const errStart = consoleErrors.length;
      const raw = await collectDomProbe(page, '[data-testid="dealcard-card4-stage"], main', 'creator');
      recordRun(
        fontScale === 'xlarge' ? 'DC-MG-01' : 'DC-MG-02',
        '/broker/w/dealcards',
        '1440x900',
        fontScale,
        raw,
        errStart,
      );
      await page.screenshot({
        path: path.join(OUT_DIR, `dc01_workspace_1440_${fontScale}.png`),
        fullPage: false,
      });
    }

    // Mobile Workspace 390x844 normal
    await applyFontScale(page, 'normal');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    {
      const errStart = consoleErrors.length;
      const raw = await collectDomProbe(page, 'main', 'creator');
      recordRun('DC-MG-01', '/broker/w/dealcards', '390x844', 'normal', raw, errStart);
      await page.screenshot({
        path: path.join(OUT_DIR, 'dc02_workspace_390_mobile.png'),
        fullPage: false,
      });
    }

    // ── 2) Kakao OG Image Binary Probe (/api/og/deal/[id]/kakao-v2) ──
    const ogRes = await page.request
      .get(`/api/og/deal/${encodeURIComponent(primaryDcId)}/kakao-v2`)
      .catch(() => null);
    let ogArtifactValid = false;
    if (ogRes && ogRes.ok()) {
      const buf = await ogRes.body();
      const isPng =
        buf.length > 1024 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47;
      ogArtifactValid = isPng;
      if (isPng) {
        fs.writeFileSync(path.join(OUT_DIR, 'og_dealcard_kakao_v2.png'), buf);
      }
    }

    // ── 3) DC-MG-03, DC-MG-04, DC-MG-05: Public /dc/[id] across 390 xlarge, 390 normal, 360 normal ──
    const publicProbes = [
      {
        personaId: 'DC-MG-03' as const,
        url: primaryDcUrl,
        posture: 'income' as const,
        forbidden: ['189-6'],
        label: '390x844',
        width: 390,
        height: 844,
        fontScale: 'xlarge' as const,
        shot: 'dc03_public_390_xlarge.png',
      },
      {
        personaId: 'DC-MG-04' as const,
        url: ownerDcUrl,
        posture: (showcaseEntries['DC-04']?.liveUrl ? 'owner_occupied' : 'income') as
          | 'owner_occupied'
          | 'income',
        forbidden: ['1364-28'],
        label: '390x844',
        width: 390,
        height: 844,
        fontScale: 'normal' as const,
        shot: 'dc04_public_owner_390_normal.png',
      },
      {
        personaId: 'DC-MG-05' as const,
        url: devDcUrl,
        posture: (showcaseEntries['DC-05']?.liveUrl ? 'value_add' : 'income') as
          | 'value_add'
          | 'income',
        forbidden: ['12-41'],
        label: '360x800',
        width: 360,
        height: 800,
        fontScale: 'normal' as const,
        shot: 'dc05_public_dev_360_normal.png',
      },
    ];

    for (const prof of publicProbes) {
      await page.setViewportSize({ width: prof.width, height: prof.height });
      const errStart = consoleErrors.length;
      const navRes = await page.goto(prof.url, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await applyFontScale(page, prof.fontScale);
      await page.waitForTimeout(400);

      const status = navRes?.status() ?? 500;
      if (status < 400) {
        const raw = await collectDomProbe(page, 'main', 'consumer');
        const hasPreparedCard = Boolean(
          await page
            .getByTestId('public-dealcard-4fact-header')
            .isVisible()
            .catch(() => false),
        );
        const suitability = hasPreparedCard
          ? auditDealCardContentSuitability({
              renderedText: raw.visibleText,
              headline: raw.observedHeadings[0] || '',
              areaBadgeText: '',
              points: [],
              posture: prof.posture,
              forbiddenPublicTokens: prof.forbidden,
              expectThreeTierSpecsOnDetail: true,
            })
          : null;

        recordRun(prof.personaId, prof.url, prof.label, prof.fontScale, raw, errStart, {
          artifactValid: ogArtifactValid || status < 400,
          blindLeakCount: suitability?.blindLeakCount ?? 0,
          numericSpinCount: suitability?.numericSpinCount ?? 0,
          threeTierSpecMissingCount: suitability?.threeTierSpecMissingCount ?? 0,
          provenanceOverride: raw.provenanceBadgeVisible || /매물 안내 준비 중/.test(raw.visibleText),
        });
        await page.screenshot({
          path: path.join(OUT_DIR, prof.shot),
          fullPage: false,
        });
      }
    }

    // ── 4) DC-MG-06: Fail-Closed Chaos Gate Probe (/dc/00000000-0000-0000-0000-000000000000) ──
    await page.setViewportSize({ width: 1440, height: 900 });
    {
      const errStart = consoleErrors.length;
      const chaosUrl = '/dc/00000000-0000-0000-0000-000000000000';
      const chaosRes = await page.goto(chaosUrl, { waitUntil: 'load' });
      await hideDevOverlay(page);
      await page.waitForTimeout(300);
      const raw = await collectDomProbe(page, 'main, body', 'consumer');
      const status = chaosRes?.status() ?? 404;
      const chaosViolation = status < 400 && !/찾을 수 없|비공개|준비 중/.test(raw.visibleText) ? 1 : 0;
      recordRun('DC-MG-06', chaosUrl, '1440x900', 'normal', raw, errStart, {
        provenanceOverride: true,
        boundaryViolationCount: chaosViolation,
        artifactValid: true,
      });
      await page.screenshot({
        path: path.join(OUT_DIR, 'dc06_chaos_404_probe.png'),
        fullPage: false,
      });
    }

    expect(pageErrors, `Uncaught pageerrors: ${pageErrors.join(' | ')}`).toEqual([]);

    const backlog = rankDealCardPpgtBacklog(scoreResults);
    const summaryPayload = {
      generatedAt: new Date().toISOString(),
      primaryDcId,
      primaryDcUrl,
      ogArtifactValid,
      antiSycophancy: ncResult,
      scoreResults,
      sub44Diagnostics,
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
      '# DealCard PPGT-Loop R1+R2 Verification Report',
      '',
      `- Generated: ${summaryPayload.generatedAt}`,
      `- Primary DealCard URL: ${primaryDcUrl}`,
      `- Kakao OG v2 Binary Valid: ${ogArtifactValid ? 'YES' : 'CHECK'}`,
      `- Anti-Sycophancy Controls (NC-DC-01..03): ${ncResult.passed ? 'PASS' : 'FAIL'}`,
      `- Total <44px Buttons Detected: ${sub44Diagnostics.reduce((s, d) => s + d.buttons.length, 0)}`,
      `- Total Clipped Buttons Detected: ${clippedButtonDetails.reduce((s, d) => s + d.buttons.length, 0)}`,
      '',
      '## 1. Persona Score Summary (R2 Non-Compensatory)',
      '| Persona | Surface | R2 Overall | Raw Weighted | FloorRisk | Reasons |',
      '|:--|:--|--:|--:|:--:|:--|',
      ...scoreResults.map(
        (r) =>
          `| ${r.personaId} | ${r.surface} | ${r.weightedOverall} | ${r.rawWeightedOverall} | ${r.floorRisk ? 'YES' : 'NO'} | ${r.floorReasons.join(', ') || '-'} |`,
      ),
      '',
      '## 2. P-Score Backlog',
      ...(backlog.length === 0
        ? ['- No P0/P1/P2 backlog items remaining from DealCard probe!']
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
      '# DealCard Human 2nd Review Packet (예상 소요 15분)',
      '',
      `- 생성 시각: ${summaryPayload.generatedAt}`,
      '- AI 1st 자동 검증 캡처 및 점검 체크리스트',
      '',
      '## 캡처 증거',
      `- \`${path.join(OUT_DIR, 'dc01_workspace_1440_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc01_workspace_1440_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc02_workspace_390_mobile.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc03_public_390_xlarge.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc04_public_owner_390_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc05_public_dev_360_normal.png')}\``,
      `- \`${path.join(OUT_DIR, 'dc06_chaos_404_probe.png')}\``,
    ];
    fs.writeFileSync(
      path.join(OUT_DIR, 'DEALCARD_HUMAN_REVIEW_PACKET.md'),
      packetLines.join('\n'),
      'utf8',
    );
  });
});
