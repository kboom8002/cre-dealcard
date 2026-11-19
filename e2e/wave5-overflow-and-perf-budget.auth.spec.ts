import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const QA_TESTER_KEY = process.env.QA_TESTER_ACCESS_KEY || 'test-qa-tester-key';
const QA_BROKER_KEY = process.env.QA_BROKER_ACCESS_KEY || 'test-qa-broker-key';
const QA_API_KEY = process.env.QA_ACCESS_KEY || QA_TESTER_KEY;
const OUT_FILE =
  process.env.WAVE5_PERF_OUT_FILE ||
  path.join(process.cwd(), 'test-results', 'wave5-perf-and-inner-overflow.json');

interface ViewProfile {
  name: string;
  width: number;
  height: number;
  fontScale: 'normal' | 'xlarge';
}

const PROFILES: ViewProfile[] = [
  { name: 'desktop_1440', width: 1440, height: 900, fontScale: 'normal' },
  { name: 'mobile_390_normal', width: 390, height: 844, fontScale: 'normal' },
  { name: 'mobile_390_xlarge', width: 390, height: 844, fontScale: 'xlarge' },
];

test.describe('WP 5-C & 5-E: 48-View Element-Level Overflow, XLarge Scale & LCP/JS Budgets', () => {
  test('Audits all 48 views with 0 offscreen/clipped controls, 0 5xx APIs, and enforces perf budgets', async ({
    page,
    request,
  }) => {
    test.setTimeout(360_000);

    const showcaseRes = await request.get('/api/public/qa-workbench?mode=showcase', {
      headers: { 'x-qa-access-key': QA_API_KEY },
    });
    const showcaseJson = await showcaseRes.json().catch(() => ({}));
    const entries = showcaseJson?.manifest?.entries || {};
    const dcUrl = entries['DC-01']?.liveUrl || '/dc/5c0ca5e0-0001-4000-8000-000000000001';
    const imUrl = entries['IM-01']?.liveUrl || '/im-lite/5c0ca5e0-0002-4000-8000-000000000001';
    const nlUrl = entries['NL-M1']?.liveUrl || '/magazine/test-broker-kim/2026-10-01';

    const routes = [
      { id: 'home', url: '/', guardedText: true },
      { id: 'login', url: '/login', guardedText: true },
      { id: 'broker_home', url: '/broker', guardedText: true },
      { id: 'broker_profile', url: '/broker/profile', guardedText: true },
      { id: 'broker_tutorial', url: '/broker/tutorial', guardedText: true },
      { id: 'dealcards', url: '/broker/w/dealcards?fresh=1', guardedText: true },
      { id: 'im', url: '/broker/w/im?fresh=1', guardedText: true },
      { id: 'newsletter', url: '/broker/w/newsletter', guardedText: true },
      { id: 'inbox', url: '/broker/w/inbox', guardedText: true },
      { id: 'public_dc', url: dcUrl, guardedText: true },
      { id: 'public_im', url: imUrl, guardedText: true },
      { id: 'public_magazine', url: nlUrl, guardedText: true },
      {
        id: 'qa_tester_signoff',
        url: `/qa-tester/signoff?qa=1&qaKey=${encodeURIComponent(QA_TESTER_KEY)}`,
        guardedText: false,
      },
      {
        id: 'qa_broker_signoff',
        url: `/qa-broker/signoff?qa=1&qaKey=${encodeURIComponent(QA_BROKER_KEY)}`,
        guardedText: false,
      },
      { id: 'terms', url: '/terms', guardedText: false },
      { id: 'privacy', url: '/privacy', guardedText: false },
    ];

    expect(routes.length * PROFILES.length).toBe(48);

    await page.addInitScript(() => {
      (window as any).__perfMetrics = { lcp: 0, cls: 0, longTasksMs: 0, longTaskCount: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.startTime > (window as any).__perfMetrics.lcp) {
              (window as any).__perfMetrics.lcp = e.startTime;
            }
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as any[]) {
            if (!e.hadRecentInput) (window as any).__perfMetrics.cls += e.value || 0;
          }
        }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            (window as any).__perfMetrics.longTasksMs += e.duration || 0;
            (window as any).__perfMetrics.longTaskCount += 1;
          }
        }).observe({ type: 'longtask', buffered: true });
      } catch {
        // Unsupported perf observer
      }
    });

    const apiTimings: Array<{ path: string; status: number; responseEndMs: number }> = [];
    page.on('requestfinished', async (req) => {
      const url = req.url();
      if (url.includes('/api/')) {
        const t = req.timing();
        const res = await req.response().catch(() => null);
        apiTimings.push({
          path: new URL(url).pathname,
          status: res?.status() ?? 0,
          responseEndMs: Math.round(t?.responseEnd > 0 ? t.responseEnd : 0),
        });
      }
    });

    const results: Array<Record<string, any>> = [];
    const hardFailures: string[] = [];

    for (const profile of PROFILES) {
      await page.setViewportSize({ width: profile.width, height: profile.height });
      await page.evaluate((scale) => {
        if (!window.location.href.startsWith('http')) return;
        try {
          window.localStorage.setItem('credeal-workspace-font-scale-v1', scale);
          window.localStorage.setItem('cre-font-scale', scale);
        } catch {
          // ignore cross-origin/blank page storage access
        }
      }, profile.fontScale);
      for (const r of routes) {
        const pageErrors: string[] = [];
        const onPageErr = (e: Error) => pageErrors.push(e.message);
        page.on('pageerror', onPageErr);

        const apiStartIdx = apiTimings.length;
        const navRes = await page.goto(r.url, { waitUntil: 'load', timeout: 45_000 });
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => null);
        await page.evaluate((scale) => {
          document.documentElement.setAttribute('data-font-scale', scale);
          window.localStorage.setItem('credeal-workspace-font-scale-v1', scale);
          window.localStorage.setItem('cre-font-scale', scale);
        }, profile.fontScale);
        await page.waitForTimeout(350);

        const audit = await page.evaluate(() => {
          const vw = window.innerWidth;
          const docOverflow = Math.max(0, Math.round(document.documentElement.scrollWidth - vw));
          const rootFontPx = Number(parseFloat(getComputedStyle(document.documentElement).fontSize).toFixed(2));
          const offscreenEls: Array<Record<string, any>> = [];
          const clippedControls: Array<Record<string, any>> = [];
          let sub14PxCount = 0;

          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            if (
              el.childNodes.length === 1 &&
              el.firstChild?.nodeType === 3 &&
              el.firstChild.textContent?.trim()
            ) {
              const fsPx = parseFloat(cs.fontSize);
              if (fsPx > 0 && fsPx < 14) sub14PxCount += 1;
            }

            if (rect.right > vw + 4 && cs.position !== 'fixed') {
              let p = el.parentElement;
              let inScroll = false;
              while (p && p !== document.documentElement) {
                const pcs = getComputedStyle(p);
                if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') {
                  inScroll = true;
                  break;
                }
                p = p.parentElement;
              }
              if (!inScroll && offscreenEls.length < 8) {
                offscreenEls.push({
                  tag: el.tagName.toLowerCase(),
                  testid: el.getAttribute('data-testid') || null,
                  rightOverflow: Math.round(rect.right - vw),
                  text: (el.textContent || '').trim().slice(0, 40),
                });
              }
            }

            const isIntentionalEllipsis =
              cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
            const isButtonOrHeaderOrChart =
              el.matches('button, a, input, select, h1, h2, h3, svg, nav') ||
              Boolean(el.getAttribute('role') === 'tab');

            if (
              !isIntentionalEllipsis &&
              (isButtonOrHeaderOrChart || el.getAttribute('data-testid')) &&
              (cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
              el.clientWidth > 20 &&
              el.scrollWidth > el.clientWidth + 6 &&
              el !== document.documentElement &&
              el !== document.body
            ) {
              if (clippedControls.length < 8) {
                clippedControls.push({
                  tag: el.tagName.toLowerCase(),
                  testid: el.getAttribute('data-testid') || null,
                  clipPx: Math.round(el.scrollWidth - el.clientWidth),
                  text: (el.textContent || '').trim().slice(0, 40),
                });
              }
            }
          }

          const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          const resources = performance.getEntriesByType('resource').filter((x) => x.name.includes('.js'));
          const jsTransferKB = Number(
            (resources.reduce((s, x: any) => s + (x.transferSize || 0), 0) / 1024).toFixed(1)
          );
          const jsDecodedKB = Number(
            (resources.reduce((s, x: any) => s + (x.decodedBodySize || 0), 0) / 1024).toFixed(1)
          );

          return {
            docOverflow,
            rootFontPx,
            offscreenCount: offscreenEls.length,
            offscreenEls,
            clippedControlCount: clippedControls.length,
            clippedControls,
            sub14PxCount,
            domNodes: document.querySelectorAll('*').length,
            ttfbMs: navEntry ? Math.round(navEntry.responseStart - navEntry.requestStart) : null,
            lcpMs: Math.round((window as any).__perfMetrics?.lcp || 0),
            cls: Number(((window as any).__perfMetrics?.cls || 0).toFixed(4)),
            tbtMs: Math.round((window as any).__perfMetrics?.longTasksMs || 0),
            jsTransferKB,
            jsDecodedKB,
          };
        });

        page.off('pageerror', onPageErr);
        const routeApis = apiTimings.slice(apiStartIdx);
        const api5xx = routeApis.filter((a) => a.status >= 500);

        const row = {
          id: r.id,
          profile: profile.name,
          url: r.url.split('?')[0],
          status: navRes?.status() ?? 0,
          pageErrorCount: pageErrors.length,
          pageErrors,
          api5xxCount: api5xx.length,
          api5xx,
          ...audit,
        };
        results.push(row);

        if (row.status >= 400) hardFailures.push(`${r.id}/${profile.name}: HTTP ${row.status}`);
        if (row.pageErrorCount > 0) hardFailures.push(`${r.id}/${profile.name}: pageerror=${pageErrors[0]}`);
        if (row.api5xxCount > 0) hardFailures.push(`${r.id}/${profile.name}: api5xx=${JSON.stringify(api5xx)}`);
        if (row.docOverflow > 1) hardFailures.push(`${r.id}/${profile.name}: docOverflow=${row.docOverflow}`);
        if (row.offscreenCount > 0) {
          hardFailures.push(`${r.id}/${profile.name}: offscreen=${JSON.stringify(row.offscreenEls)}`);
        }
        if (row.clippedControlCount > 0) {
          hardFailures.push(`${r.id}/${profile.name}: clipped=${JSON.stringify(row.clippedControls)}`);
        }
        if (profile.fontScale === 'xlarge' && row.rootFontPx < 19) {
          hardFailures.push(`${r.id}/${profile.name}: xlarge rootFontPx=${row.rootFontPx} (<19)`);
        }
        if (r.guardedText && row.sub14PxCount > 0) {
          hardFailures.push(`${r.id}/${profile.name}: sub14PxCount=${row.sub14PxCount}`);
        }
        if (row.cls > 0.15) {
          hardFailures.push(`${r.id}/${profile.name}: cls=${row.cls} (>0.15)`);
        }
        const mobileLcpBudgetMs = r.id === 'public_im' || r.id === 'newsletter' ? 3500 : 2600;
        const mobileTbtBudgetMs = Number(process.env.WAVE5_TBT_BUDGET_MS || 600);
        const mobileJsBudgetKB = Number(process.env.WAVE5_JS_BUDGET_KB || 1500);
        if (profile.name === 'mobile_390_normal') {
          if (row.lcpMs > mobileLcpBudgetMs) {
            hardFailures.push(`${r.id}/${profile.name}: mobile LCP ${row.lcpMs}ms > ${mobileLcpBudgetMs}ms`);
          }
          if (row.tbtMs > mobileTbtBudgetMs) {
            hardFailures.push(`${r.id}/${profile.name}: mobile TBT ${row.tbtMs}ms > ${mobileTbtBudgetMs}ms`);
          }
          if (row.jsTransferKB > mobileJsBudgetKB) {
            hardFailures.push(`${r.id}/${profile.name}: mobile JS transfer ${row.jsTransferKB}KB > ${mobileJsBudgetKB}KB`);
          }
        }
      }
    }

    const sortedApis = [...apiTimings].sort((a, b) => b.responseEndMs - a.responseEndMs);
    const p95Idx = Math.floor(sortedApis.length * 0.05);
    const summary = {
      generatedAt: new Date().toISOString(),
      viewsAudited: results.length,
      apiCallsObserved: sortedApis.length,
      api5xxCalls: sortedApis.filter((a) => a.status >= 500),
      apiP95Ms: sortedApis[p95Idx]?.responseEndMs ?? null,
      top10SlowestApis: sortedApis.slice(0, 10),
      hiddenOverflowViews: results.filter((x) => x.offscreenCount > 0 || x.clippedControlCount > 0),
      hardFailures,
      results,
    };

    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));

    expect(results.length).toBe(48);
    expect(hardFailures, `WP 5-C/5-E failures:\n${hardFailures.join('\n')}`).toEqual([]);
  });

  test('Audits 360x780 narrow Android mobile horizontal overflow and >=14px text across core broker/public routes', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 360, height: 780 });
    for (const url of [
      '/broker',
      '/broker/profile',
      '/broker/tutorial',
      '/broker/w/dealcards?fresh=1',
      '/broker/w/im?fresh=1',
      '/broker/w/newsletter',
      '/broker/w/inbox',
      '/powered-by',
      '/guide',
    ]) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(300);
      const check = await page.evaluate(() => {
        const overflowPx = Math.max(0, Math.round(document.documentElement.scrollWidth - window.innerWidth));
        const badEls: string[] = [];
        for (const el of document.querySelectorAll('p, span, a, button, label, td, th')) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const text = (el.textContent || '').trim();
          if (!text) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize || '14');
          if (fs < 13.9 && badEls.length < 5) {
            badEls.push(`${el.tagName}(${fs.toFixed(1)}px):${text.slice(0, 20)}`);
          }
        }
        return { overflowPx, badEls };
      });
      expect(check.overflowPx, `${url} overflow at 360x780`).toBeLessThanOrEqual(2);
      expect(check.badEls, `${url} sub-14px elements at 360x780`).toEqual([]);
    }
  });
});
