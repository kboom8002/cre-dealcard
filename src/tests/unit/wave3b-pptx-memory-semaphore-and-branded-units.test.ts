import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { optimizeImageForPptx } from '@/domain/building/mobile-im/pptx/utils/image-optimizer';
import {
  MobileImPptxRenderer,
  getPptxRenderSemaphoreStats,
  type MobileImPptxInput,
  type MobileImPptxOutput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { KR, TITLE_KR, withThemeIsolation } from '@/domain/building/mobile-im/pptx/imlib';
import { getPptxTheme } from '@/domain/building/mobile-im/pptx/pptx-theme';
import {
  asKrw,
  asManwon,
  asEok,
  asSqm,
  asPyeong,
  asPct,
  asRatio,
  manwonToKrw,
  krwToManwon,
  sqmToPyeong,
  pyeongToSqm,
  normalizeCapRatePct,
  type Krw,
  type Manwon,
  type Sqm,
  type Pyeong,
} from '@/domain/units/branded';
import { verifyProGrantViewerAccess, createHmacGrantToken } from '@/domain/gate/im-pro-grant-service';

describe('Wave 3B: PPTX/Sharp Memory Physics, Render Semaphore, Branded Units & Domain Cycle Cleanup', () => {
  const originalMaxConcurrentEnv = process.env.PPTX_MAX_CONCURRENT_RENDERS;
  const originalGrantSecret = process.env.NDA_GRANT_TOKEN_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalMaxConcurrentEnv === undefined) {
      delete process.env.PPTX_MAX_CONCURRENT_RENDERS;
    } else {
      process.env.PPTX_MAX_CONCURRENT_RENDERS = originalMaxConcurrentEnv;
    }
    if (originalGrantSecret === undefined) {
      delete process.env.NDA_GRANT_TOKEN_SECRET;
    } else {
      process.env.NDA_GRANT_TOKEN_SECRET = originalGrantSecret;
    }
  });

  describe('1. optimizeImageForPptx: single-pass resolveWithObject & lazy memoized base64 getter', () => {
    it('[Positive] resolves output dimensions in one pass and defers base64 allocation until accessed', async () => {
      const samplePng = await sharp({
        create: {
          width: 320,
          height: 200,
          channels: 3,
          background: { r: 28, g: 64, b: 120 },
        },
      })
        .png()
        .toBuffer();

      const metadataSpy = vi.spyOn(sharp.prototype, 'metadata');

      const optimized = await optimizeImageForPptx(samplePng, 160, 75, 0);
      expect(optimized).not.toBeNull();
      const opt = optimized!;

      // Single-pass output dimensions: 320x200 resized to maxWidth=160 -> 160x100
      expect(opt.originalWidth).toBe(320);
      expect(opt.originalHeight).toBe(200);
      expect(opt.width).toBe(160);
      expect(opt.height).toBe(100);
      expect(Buffer.isBuffer(opt.buffer)).toBe(true);
      expect(opt.sizeBytes).toBe(opt.buffer.length);

      // metadata() called only ONCE (for inputBuffer), eliminating redundant sharp(resizedBuffer).metadata()
      expect(metadataSpy).toHaveBeenCalledTimes(1);

      // Lazy getter verification: buffer.toString('base64') is NOT called before .base64 is read
      const descriptor = Object.getOwnPropertyDescriptor(opt, 'base64');
      expect(descriptor).toBeDefined();
      expect(typeof descriptor?.get).toBe('function');
      expect(descriptor?.enumerable).toBe(true);
      expect(descriptor?.configurable).toBe(true);

      const toStringSpy = vi.spyOn(opt.buffer, 'toString');
      expect(toStringSpy).not.toHaveBeenCalled();

      // Reading .base64 triggers base64 encoding once, and subsequent reads/spreads reuse memoized string
      const firstRead = opt.base64;
      expect(firstRead.startsWith('image/jpeg;base64,')).toBe(true);
      expect(toStringSpy).toHaveBeenCalledTimes(1);

      const secondRead = opt.base64;
      const spreadCopy = { ...opt };
      expect(secondRead).toBe(firstRead);
      expect(spreadCopy.base64).toBe(firstRead);
      expect(Object.keys(opt)).toContain('base64');
      expect(toStringSpy).toHaveBeenCalledTimes(1);
    });

    it('[Negative Pair] rejects buffers exceeding 10MB serverless intake guard cleanly', async () => {
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 64, 0xff);
      const res = await optimizeImageForPptx(oversized);
      expect(res).toBeNull();
    });
  });

  describe('2. PPTX Render Concurrency Semaphore', () => {
    it('[Positive] queues excess concurrent renders beyond maxConcurrency and releases cleanly on error/completion', async () => {
      process.env.PPTX_MAX_CONCURRENT_RENDERS = '2';

      const resolvers: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
      let inFlightInsideBody = 0;
      let peakInFlight = 0;

      vi.spyOn(MobileImPptxRenderer.prototype, '_renderInternal').mockImplementation(async () => {
        inFlightInsideBody += 1;
        peakInFlight = Math.max(peakInFlight, inFlightInsideBody);
        try {
          await new Promise<void>((resolve, reject) => {
            resolvers.push({ resolve, reject });
          });
          return {
            buffer: Buffer.from('mock-pptx'),
            slideCount: 1,
            fileSizeBytes: 9,
            generatedAt: '2026-11-26T00:00:00.000Z',
            warnings: [],
          } satisfies MobileImPptxOutput;
        } finally {
          inFlightInsideBody -= 1;
        }
      });

      const renderer = new MobileImPptxRenderer();
      const dummyInput: MobileImPptxInput = {
        buildingId: 'bldg-sem-test',
        doc: { title: 'Semaphore Test', body: {} },
      };

      const tasks = [
        renderer.render(dummyInput),
        renderer.render(dummyInput),
        renderer.render(dummyInput),
        renderer.render(dummyInput),
        renderer.render(dummyInput),
      ];

      // Allow microtasks to settle so initial 2 enter _renderInternal and 3 wait in queue
      await Promise.resolve();
      await Promise.resolve();

      expect(getPptxRenderSemaphoreStats()).toEqual({
        active: 2,
        queued: 3,
        maxConcurrency: 2,
      });
      expect(resolvers).toHaveLength(2);

      // Fail slot #1 to prove error paths still hand off semaphore permits without leaking
      resolvers[0].reject(new Error('simulated render failure'));
      await expect(tasks[0]).rejects.toThrow('simulated render failure');
      await Promise.resolve();

      expect(getPptxRenderSemaphoreStats()).toEqual({
        active: 2,
        queued: 2,
        maxConcurrency: 2,
      });
      expect(resolvers).toHaveLength(3);

      // Drain remaining 4 tasks
      resolvers[1].resolve();
      await tasks[1];
      await Promise.resolve();
      expect(resolvers).toHaveLength(4);

      resolvers[2].resolve();
      await tasks[2];
      await Promise.resolve();
      expect(resolvers).toHaveLength(5);

      resolvers[3].resolve();
      resolvers[4].resolve();
      await Promise.all([tasks[3], tasks[4]]);

      expect(peakInFlight).toBe(2);
      expect(getPptxRenderSemaphoreStats()).toEqual({
        active: 0,
        queued: 0,
        maxConcurrency: 2,
      });
    });
  });

  describe('3. Branded CRE Unit Types & Converters', () => {
    it('[Positive] enforces compile-time branding and exact round-trip conversions', () => {
      const priceManwon: Manwon = asManwon(85_000); // 8.5억
      const priceKrw: Krw = manwonToKrw(priceManwon);
      expect(priceKrw).toBe(850_000_000);
      expect(krwToManwon(priceKrw)).toBe(85_000);

      // Compile-time nominal mismatch checks (verified by `npx tsc --noEmit`)
      // @ts-expect-error Manwon must not be assignable to Krw without conversion
      const _badKrw: Krw = priceManwon;
      void _badKrw;

      const areaSqm: Sqm = asSqm(1000);
      const areaPy: Pyeong = sqmToPyeong(areaSqm);
      expect(areaPy).toBe(302.5);
      expect(pyeongToSqm(areaPy)).toBeCloseTo(1000, 10);

      // @ts-expect-error Pyeong must not be assignable to Sqm without conversion
      const _badSqm: Sqm = areaPy;
      void _badSqm;

      expect(asEok(12.5)).toBe(12.5);
      expect(asPct(4.5)).toBe(4.5);
      expect(asRatio(0.045)).toBe(0.045);
    });

    it('[Positive & Negative Pair] normalizeCapRatePct converts decimals < 0.5 and preserves percentages >= 0.5 without IEEE-754 drift', () => {
      expect(normalizeCapRatePct(3.42)).toBe(3.42);
      expect(normalizeCapRatePct(0.0342)).toBe(3.42);
      expect(normalizeCapRatePct(0.07)).toBe(7);
      expect(normalizeCapRatePct(0.14)).toBe(14);
      expect(normalizeCapRatePct(0.5)).toBe(0.5);

      // Negative pair: non-positive or non-finite inputs safely clamp to 0%
      expect(normalizeCapRatePct(0)).toBe(0);
      expect(normalizeCapRatePct(-2.5)).toBe(0);
      expect(normalizeCapRatePct(Number.NaN)).toBe(0);
      expect(normalizeCapRatePct(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('4. Typography Proxy JSON Serialization (`imlib.ts`)', () => {
    it('[Positive] serializes KR and TITLE_KR as resolved font strings instead of `{}`', async () => {
      const serializedDefault = JSON.stringify({ font: KR, titleFont: TITLE_KR });
      expect(serializedDefault).toBe('{"font":"맑은 고딕","titleFont":"맑은 고딕"}');
      expect(`${KR}`).toBe('맑은 고딕');

      const customTheme = { ...getPptxTheme('credeal_pro'), bodyFont: 'Pretendard', titleFont: 'Noto Serif KR' };
      const serializedIsolated = await withThemeIsolation(customTheme, async () =>
        JSON.stringify({ font: KR, titleFont: TITLE_KR }),
      );
      expect(serializedIsolated).toBe('{"font":"Pretendard","titleFont":"Noto Serif KR"}');
    });
  });

  describe('5. Domain Cycle & Framework Coupling Guards', () => {
    const repoRoot = process.cwd();

    it('[Positive] im-title-golden-set.ts has zero self-imports (including comment/regex-visible imports)', () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src/lib/ai/im-title-golden-set.ts'), 'utf8');
      expect(src).not.toMatch(/from\s+['"][^'"]*im-title-golden-set['"]/);
      expect(src).not.toMatch(/import\s*\(\s*['"][^'"]*im-title-golden-set['"]\s*\)/);
    });

    it('[Positive] im-pro-grant-service.ts has zero next/server imports and accepts standard RequestLike objects', async () => {
      const src = fs.readFileSync(path.join(repoRoot, 'src/domain/gate/im-pro-grant-service.ts'), 'utf8');
      expect(src).not.toContain('next/server');

      process.env.NDA_GRANT_TOKEN_SECRET = 'wave3b-unit-test-hmac-secret-key-2026';
      const grantId = 'grant-wave3b-001';
      const validToken = createHmacGrantToken(grantId)!;

      const plainWebRequest = new Request(`https://credeal.kr/api/pro?token=${validToken}`, {
        headers: { 'x-test': '1' },
      });
      const allowed = await verifyProGrantViewerAccess(plainWebRequest, {
        id: grantId,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
      expect(allowed).toEqual({ ok: true, status: 200 });

      const denied = await verifyProGrantViewerAccess(
        { headers: new Headers(), url: 'https://credeal.kr/api/pro' },
        {
          id: grantId,
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        },
      );
      expect(denied.ok).toBe(false);
      expect(denied.status).toBe(403);
    });

    it('[Positive] binder-types.ts replaces 32 legacy `any` fields with structured interfaces and `[key: string]: unknown`', () => {
      const src = fs.readFileSync(
        path.join(repoRoot, 'src/domain/building/mobile-im/pptx/binder/binder-types.ts'),
        'utf8',
      );
      const codeWithoutComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeWithoutComments).toContain('[key: string]: unknown');
      expect(codeWithoutComments).not.toContain('[key: string]: any');
      expect(codeWithoutComments).not.toContain(': any');
      expect(codeWithoutComments).not.toContain('any[]');
      const anyMatches = codeWithoutComments.match(/\bany\b/g) ?? [];
      expect(anyMatches.length).toBeLessThanOrEqual(1);
    });
  });
});
