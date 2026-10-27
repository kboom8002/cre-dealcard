/**
 * @file src/tests/foundations/flags-no-client-override.test.ts
 * @description P0.5 Foundation Automated Verification Suite:
 * 1. Verify `getServerFeatureFlag` reads from environment variables.
 * 2. Verify `getServerFeatureFlag` reads and parses `ff_ws` cookie cohorts.
 * 3. Verify client request body parameters CANNOT override server feature flags (tamper-proofing).
 * 4. Static Analysis: Verify API routes do NOT read feature flags from client request bodies.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.3, §5.5, WP-P05-04
 * - ORIGINAL_REQUEST.md (§ 2026-10-27T04:28:40Z)
 * - PROJECT.md (Milestone 1, Feature 8)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0.5 Foundation Verification: Server Feature Flags & Zero Client Override', () => {
  const flagsModulePath = path.resolve(process.cwd(), 'src/lib/flags.ts');
  const imGenerateRoutePath = path.resolve(process.cwd(), 'src/app/api/broker/im-lite/generate/route.ts');

  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Static Analysis: Zero Client Request Body Flag Overrides', () => {
    it('src/app/api/broker/im-lite/generate/route.ts does NOT allow body.ff_* overrides', () => {
      expect(fs.existsSync(imGenerateRoutePath)).toBe(true);
      const content = fs.readFileSync(imGenerateRoutePath, 'utf8');

      // The vulnerability was: const ffMobileCorePackage = body.ff_mobile_core_package === true || ...
      expect(content).not.toMatch(/body\s*\.\s*ff_mobile_core_package/);
      expect(content).not.toMatch(/body\s*\[\s*['"]ff_[^'"]+['"]\s*\]/);
    });

    it('scans all API routes to ensure no client body feature flag overrides exist', () => {
      const apiDir = path.resolve(process.cwd(), 'src/app/api');

      function scanDir(dir: string): string[] {
        let results: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            results = results.concat(scanDir(full));
          } else if (/\.(ts|tsx)$/.test(entry.name)) {
            results.push(full);
          }
        }
        return results;
      }

      const allApiFiles = scanDir(apiDir);
      const violations: string[] = [];

      for (const file of allApiFiles) {
        const text = fs.readFileSync(file, 'utf8');
        // Check for patterns like body.ff_* or req.json().ff_*
        if (/body\s*\.\s*ff_[a-zA-Z0-9_]+/i.test(text) || /json\(\)\s*\.\s*ff_[a-zA-Z0-9_]+/i.test(text)) {
          violations.push(path.relative(process.cwd(), file));
        }
      }

      expect(
        violations,
        `Found client-body feature flag overrides in: ${violations.join(', ')}`
      ).toEqual([]);
    });
  });

  describe('getServerFeatureFlag: Environment Variable Resolution', () => {
    it('resolves flag from environment variable when set', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      process.env.FF_WS_SHELL = 'true';
      const isEnabled = await getServerFeatureFlag('ws_shell');
      expect(isEnabled).toBe(true);

      process.env.FF_WS_SHELL = 'false';
      const isDisabled = await getServerFeatureFlag('ws_shell');
      expect(isDisabled).toBe(false);
    });

    it('returns default fallback when flag is not set in environment or cookies', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      delete process.env.FF_QUICK_IM;
      delete process.env.QUICK_IM;
      const result = await getServerFeatureFlag('quick_im');
      // By security default, unset flags must resolve to default (false)
      expect(result).toBe(false);
    });
  });

  describe('getServerFeatureFlag: ff_ws Cookie Cohort Resolution', () => {
    it('reads ff_ws cookie string and enables cohort flags', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      // Cookie format: ff_ws=card4_editor,quick_im
      const mockHeaders = new Headers({
        cookie: 'ff_ws=card4_editor,quick_im; session=abc123',
      });

      const enabled = await getServerFeatureFlag('card4_editor', { requestHeaders: mockHeaders });
      expect(enabled).toBe(true);

      const alsoEnabled = await getServerFeatureFlag('quick_im', { requestHeaders: mockHeaders });
      expect(alsoEnabled).toBe(true);

      const notInCohort = await getServerFeatureFlag('inbox_v2', { requestHeaders: mockHeaders });
      expect(notInCohort).toBe(false);
    });

    it('handles ff_ws=true global workspace cohort flag in ff_ws cookie', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      const mockHeaders = new Headers({
        cookie: 'ff_ws=true; theme=dark',
      });

      const wsShell = await getServerFeatureFlag('ws_shell', { requestHeaders: mockHeaders });
      const homeV2 = await getServerFeatureFlag('home_v2', { requestHeaders: mockHeaders });
      const card4Editor = await getServerFeatureFlag('card4_editor', { requestHeaders: mockHeaders });

      expect(wsShell).toBe(true);
      expect(homeV2).toBe(true);
      expect(card4Editor).toBe(true);
    });

    it('supports direct cookieString in FlagResolutionContext', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      const enabled = await getServerFeatureFlag('magazine_ws', {
        cookieString: 'ff_ws=magazine_ws,inbox_v2',
      });
      expect(enabled).toBe(true);
    });
  });

  describe('Client Body Tamper-Proofing (Security Boundary)', () => {
    it('getServerFeatureFlag rejects any attempt to pass flag overrides via request body', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      process.env.FF_WS_SHELL = 'false';

      // Malicious payload attempting to pass flag in body
      const maliciousContext = {
        requestHeaders: new Headers(),
        body: {
          ws_shell: true,
          flags: { ws_shell: true },
        },
      } as any;

      const result = await getServerFeatureFlag('ws_shell', maliciousContext);
      expect(result).toBe(false);
    });

    it('adversarial: handles malformed cookies, script injection, and extreme inputs safely', async () => {
      expect(fs.existsSync(flagsModulePath)).toBe(true);
      const { getServerFeatureFlag } = await import('@/lib/flags');

      const toxicCookies = [
        'ff_ws=<script>alert("xss")</script>',
        'ff_ws={"$ne": null, "admin": true}',
        'ff_ws=;;;;;;====',
        'ff_ws=' + 'A'.repeat(5000),
      ];

      for (const toxic of toxicCookies) {
        const headers = new Headers({ cookie: toxic });
        // Must never throw an unhandled exception or return true for unauthorized flags
        await expect(
          getServerFeatureFlag('ws_shell', { requestHeaders: headers })
        ).resolves.toBe(false);
      }
    });
  });
});
