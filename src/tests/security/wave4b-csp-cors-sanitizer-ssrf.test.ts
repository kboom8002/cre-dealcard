/**
 * Wave 4 Track 4B Security Verification Suite:
 * 1. `next.config.ts`: CSP `connect-src` drops wildcard `https://*.vercel.app` (scopes strictly to exact `VERCEL_URL` if valid) & `/api/:path*` CORS sets `Vary: Origin`
 * 2. `sanitizeHtmlIsomorphic`: strips CSS phishing overlay/redressing declarations & CSS hex-escaped `url(...)` while preserving safe typography/layout styles, and blocks entity/whitespace-obfuscated dangerous URI schemes
 * 3. `fetchSafeImageBuffer`: mitigates DNS-rebinding TOCTOU by pinning validated public IPs via Undici `Agent({ connect: { lookup } })` when `fetch` is unmocked while keeping `vi.spyOn(globalThis, 'fetch')` working
 * 4. `EditorAiAssistTab.tsx`: begins with `'use client'` directive on line 1
 */
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../../next.config';
import {
  sanitizeHtmlAllowlist,
  sanitizeHtmlIsomorphic,
  sanitizeInlineStyle,
} from '@/lib/security/sanitize-html-isomorphic';
import { fetchSafeImageBuffer } from '@/domain/building/mobile-im/pptx/utils/image-optimizer';

describe('Wave 4B: CSP/CORS Cache Hardening, CSS-Redressing Sanitizer Guard, SSRF DNS Pinning & RSC Boundary', () => {
  const originalVercelUrl = process.env.VERCEL_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
  });

  describe('1. next.config.ts CSP Exfiltration Vector Removal & CORS Vary: Origin', () => {
    it('[Positive & Negative] omits wildcard https://*.vercel.app from CSP connect-src and scopes strictly to valid VERCEL_URL', async () => {
      delete process.env.VERCEL_URL;
      const baseRules = await nextConfig.headers!();
      const globalCsp = baseRules
        .find((r) => r.source === '/:path*')
        ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
      const dcCsp = baseRules
        .find((r) => r.source === '/dc/:path*')
        ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;

      expect(globalCsp).toBeDefined();
      expect(globalCsp).not.toContain('https://*.vercel.app');
      expect(globalCsp).not.toContain('*.vercel.app');
      expect(dcCsp).not.toContain('*.vercel.app');

      // Core allowlisted origins remain intact
      for (const expectedOrigin of [
        "connect-src 'self'",
        'https://*.supabase.co',
        'wss://*.supabase.co',
        'https://*.kakao.com',
        'https://*.kakaocdn.net',
        'https://*.daumcdn.net',
        'https://credeal.net',
        'https://www.credeal.net',
      ]) {
        expect(globalCsp).toContain(expectedOrigin);
      }

      // Exact preview deployment host is allowed when VERCEL_URL matches ^[a-z0-9-]+\.vercel\.app$
      process.env.VERCEL_URL = 'cre-dealcard-git-wave4b-preview.vercel.app';
      const previewRules = await nextConfig.headers!();
      const previewCsp = previewRules
        .find((r) => r.source === '/:path*')
        ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
      expect(previewCsp).toContain('https://cre-dealcard-git-wave4b-preview.vercel.app');
      expect(previewCsp).not.toContain('*.vercel.app');

      // Malformed / multi-subdomain / directive-injection VERCEL_URL values are rejected
      for (const unsafeHost of [
        'evil.example.com',
        'nested.sub.vercel.app',
        'preview.vercel.app; connect-src *',
        'https://preview.vercel.app',
      ]) {
        process.env.VERCEL_URL = unsafeHost;
        const unsafeRules = await nextConfig.headers!();
        const unsafeCsp = unsafeRules
          .find((r) => r.source === '/:path*')
          ?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
        expect(unsafeCsp).not.toContain(unsafeHost);
        expect(unsafeCsp).not.toContain('*.vercel.app');
      }
    });

    it('[Positive] includes Vary: Origin on both /api/:path* CORS header rules to prevent CDN cache poisoning across apex and www', async () => {
      const rules = await nextConfig.headers!();
      const apiCorsRules = rules.filter((r) => r.source === '/api/:path*');
      expect(apiCorsRules.length).toBeGreaterThanOrEqual(2);

      for (const rule of apiCorsRules) {
        const varyHeader = rule.headers.find((h) => h.key === 'Vary');
        expect(varyHeader).toEqual({ key: 'Vary', value: 'Origin' });
      }
    });
  });

  describe('2. sanitizeHtmlIsomorphic CSS-Redressing Guard & Entity-Decoded URI Scheme Validation', () => {
    it('[Positive & Negative] strips position:fixed, z-index, url(), CSS hex escapes, and negative margins while preserving safe typography/layout styles', () => {
      const payload = [
        '<div style="position: fixed; z-index: 99999; background: url(https://evil.test); color: #1e293b; font-weight: 700;">핵심 투자 포인트</div>',
        '<span style="inset: 0; pointer-events: none; margin-top: -120px; background-color: #f8fafc; padding: 8px 12px; border-radius: 6px;">배지</span>',
        '<p style="background: \\75\\72\\6c(https://evil.test/steal); width: 100%; max-width: 640px; line-height: 1.6; text-align: left;">본문</p>',
      ].join('');

      const clean = sanitizeHtmlIsomorphic(payload);

      expect(clean).not.toMatch(/position\s*:\s*fixed/i);
      expect(clean).not.toMatch(/z-index/i);
      expect(clean).not.toMatch(/url\s*\(/i);
      expect(clean).not.toContain('evil.test');
      expect(clean).not.toMatch(/inset/i);
      expect(clean).not.toMatch(/pointer-events/i);
      expect(clean).not.toMatch(/margin-top\s*:\s*-/i);

      expect(clean).toContain('color: #1e293b; font-weight: 700;');
      expect(clean).toContain('background-color: #f8fafc; padding: 8px 12px; border-radius: 6px;');
      expect(clean).toContain('width: 100%; max-width: 640px; line-height: 1.6; text-align: left;');

      // Direct unit checks on sanitizeInlineStyle for legacy CSS script/overlay vectors
      expect(
        sanitizeInlineStyle(
          'position: absolute; position: sticky; expression(alert(1)); @import "https://evil.test"; behavior: url(x.htc); -moz-binding: url(x.xml); margin: 0 -20px;',
        ),
      ).toBe('');
      expect(
        sanitizeInlineStyle('display: flex; gap: 8px; margin: 12px 0; border: 1px solid #cbd5e1; font-size: 14px;'),
      ).toBe('display: flex; gap: 8px; margin: 12px 0; border: 1px solid #cbd5e1; font-size: 14px;');
    });

    it('[Positive & Negative] blocks hex/decimal/named entity-encoded and whitespace-injected javascript: URIs in href and src', () => {
      const html = [
        '<a href="&#x6a;avascript:alert(1)">hex-js</a>',
        '<a href="&#106;avascript:alert(2)">dec-js</a>',
        '<a href="java&#09;script:alert(3)">tab-js</a>',
        '<a href="&Tab;javascript&colon;alert(4)">named-js</a>',
        '<a href="//evil.test/phish">proto-rel</a>',
        '<img src="&#x6A;avascript:alert(5)" alt="bad" />',
        '<a href="https://credeal.net/im-lite/abc">safe-https</a>',
        '<a href="mailto:deal@credeal.net">safe-mailto</a>',
        '<a href="tel:02-555-0100">safe-tel</a>',
        '<a href="/im-lite/abc">safe-path</a>',
        '<a href="#summary">safe-hash</a>',
      ].join('');

      const clean = sanitizeHtmlAllowlist(html);

      expect(clean).not.toMatch(/javascript|alert\(|evil\.test/i);
      expect(clean).toContain('<a>hex-js</a>');
      expect(clean).toContain('<a>dec-js</a>');
      expect(clean).toContain('<a>tab-js</a>');
      expect(clean).toContain('<a>named-js</a>');
      expect(clean).toContain('<a>proto-rel</a>');
      expect(clean).toContain('<img alt="bad" />');

      expect(clean).toContain('<a href="https://credeal.net/im-lite/abc">safe-https</a>');
      expect(clean).toContain('<a href="mailto:deal@credeal.net">safe-mailto</a>');
      expect(clean).toContain('<a href="tel:02-555-0100">safe-tel</a>');
      expect(clean).toContain('<a href="/im-lite/abc">safe-path</a>');
      expect(clean).toContain('<a href="#summary">safe-hash</a>');
    });
  });

  describe('3. fetchSafeImageBuffer DNS-Rebinding TOCTOU Pinning & SSRF Guard', () => {
    it('[Positive] attaches Undici pinned-DNS dispatcher when globalThis.fetch is unmocked while preserving vi.spyOn(globalThis, "fetch") compatibility', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(
        (async () => [{ address: '93.184.216.34', family: 4 }]) as unknown as typeof dns.promises.lookup,
      );

      // 1) Plain wrapper without `.mock` simulates real Node runtime fetch and verifies Undici Agent dispatcher attachment
      let capturedInit: (RequestInit & { dispatcher?: unknown }) | undefined;
      globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedInit = init as RequestInit & { dispatcher?: unknown };
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }) as typeof fetch;

      const buf = await fetchSafeImageBuffer('https://cdn.credeal-assets.example/building.jpg');
      expect(buf).not.toBeNull();
      expect(buf?.length).toBe(4);
      expect(capturedInit?.redirect).toBe('error');
      expect(capturedInit?.dispatcher).toBeDefined();

      // 2) Vitest spy (`vi.spyOn(globalThis, 'fetch')`) continues to work cleanly
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200 }),
      );
      const mockedBuf = await fetchSafeImageBuffer('https://cdn.credeal-assets.example/logo.png');
      expect(mockedBuf).not.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('[Negative] rejects mixed public+private DNS answers before issuing network fetch', async () => {
      vi.spyOn(dns.promises, 'lookup').mockImplementation(
        (async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '169.254.169.254', family: 4 },
        ]) as unknown as typeof dns.promises.lookup,
      );
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const res = await fetchSafeImageBuffer('https://rebinding.evil.example/photo.jpg');
      expect(res).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. EditorAiAssistTab RSC Client Boundary Directive', () => {
    it('[Positive] begins with "use client" directive on line 1', () => {
      const filePath = path.join(
        process.cwd(),
        'src/components/magazine-editor/EditorAiAssistTab.tsx',
      );
      const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0].trim();
      expect(firstLine === "'use client';" || firstLine === '"use client";').toBe(true);
    });
  });
});
