import { test, expect } from '@playwright/test';

const FORBIDDEN_DEAD_PREFIXES = ['/agora', '/building-radar', '/services', '/vibe-card'] as const;

test.describe('Public UX Smoke (Daylight, Zero Overflow, Zero Dead Links)', () => {
  for (const vp of [
    { name: '390x844', width: 390, height: 844 },
    { name: '360x780', width: 360, height: 780 },
  ]) {
    test(`Public & Auth routes return 200, use daylight surface, have 0 horizontal overflow at ${vp.name}, and zero dead links`, async ({
      browser,
    }) => {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      try {
        for (const route of ['/', '/hub', '/terms', '/privacy', '/login', '/powered-by', '/guide']) {
          const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
          expect(res?.status(), `${route} (${vp.name}) must return HTTP 200`).toBe(200);
          await page.waitForTimeout(200);

          const metrics = await page.evaluate((deadPrefixes) => {
            const overflowPx = Math.max(
              0,
              Math.round(document.documentElement.scrollWidth - window.innerWidth)
            );
            const bodyBg = getComputedStyle(document.body).backgroundColor;
            const mainEl = document.querySelector('main, div');
            const surfaceBg = mainEl ? getComputedStyle(mainEl).backgroundColor : bodyBg;

            const parseRgb = (cssColor: string): [number, number, number] | null => {
              const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
              if (!m) return null;
              const alpha = m[4] !== undefined ? Number(m[4]) : 1;
              if (alpha === 0) return null;
              return [Number(m[1]), Number(m[2]), Number(m[3])];
            };

            const effectiveRgb = parseRgb(surfaceBg) || parseRgb(bodyBg) || [255, 255, 255];
            const avgLuminance = (effectiveRgb[0] + effectiveRgb[1] + effectiveRgb[2]) / 3;

            const badHrefs: string[] = [];
            for (const a of document.querySelectorAll('a[href]')) {
              const href = a.getAttribute('href') || '';
              if (
                deadPrefixes.some(
                  (prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`)
                )
              ) {
                badHrefs.push(href);
              }
            }

            return { overflowPx, avgLuminance, bodyBg, surfaceBg, badHrefs };
          }, FORBIDDEN_DEAD_PREFIXES as unknown as string[]);

          expect(metrics.overflowPx, `${route} horizontal overflow at ${vp.name}`).toBeLessThanOrEqual(1);
          expect(metrics.avgLuminance, `${route} daylight surface luminance (${metrics.surfaceBg}) at ${vp.name}`).toBeGreaterThan(180);
          expect(metrics.badHrefs, `${route} must contain zero dead links`).toEqual([]);
        }
      } finally {
        await context.close();
      }
    });
  }
});
