/**
 * Wave 7.1A — Security & Hardening Verification Suite:
 * 1. requireAdminRsc() & (admin) RSC fail-closed guard before createServiceClient()
 * 2. qa-workbench, dealcard-im-test-assets, testguide-assets fail-closed QA gate
 * 3. next.config.ts enforced CSP & proxy.ts early untrusted-header stripping
 * 4. avatar & logo upload 5MB cap, strict MIME + binary magic-byte inspection, schema drift
 * 5. error-reporter URL query/hash stripping + logger deep PII redaction (server & browser)
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRedirect = vi.fn((target: string) => {
  const err = new Error(`NEXT_REDIRECT:${target}`);
  (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${target};307;`;
  throw err;
});
const mockCreateServerSupabaseClient = vi.fn();
const mockCreateServiceClient = vi.fn();
const mockRequireBroker = vi.fn();
const mockRequireRole = vi.fn();
const mockRequireAdmin = vi.fn();
const mockReadBuilding = vi.fn();
const mockGetPublicWorkspaceProjection = vi.fn();
const mockIsBuildingShareLinkRevoked = vi.fn();
const mockIsBuildingShareLinkRevokedAsync = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (target: string) => mockRedirect(target),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: (...args: unknown[]) => mockCreateServerSupabaseClient(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
}));

vi.mock('@/domain/building/im-core/read-building', () => ({
  readBuilding: (...args: unknown[]) => mockReadBuilding(...args),
}));

vi.mock('@/lib/workspace/workspace-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workspace/workspace-repository')>();
  return {
    ...actual,
    getPublicWorkspaceProjection: (...args: unknown[]) => mockGetPublicWorkspaceProjection(...args),
  };
});

vi.mock('@/lib/security/share-link-tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/share-link-tokens')>();
  return {
    ...actual,
    isBuildingShareLinkRevoked: (...args: unknown[]) => mockIsBuildingShareLinkRevoked(...args),
    isBuildingShareLinkRevokedAsync: (...args: unknown[]) => mockIsBuildingShareLinkRevokedAsync(...args),
  };
});

import nextConfig from '../../../../next.config';
import { requireAdminRsc } from '@/lib/auth/require-admin-rsc';
import AdminLayout from '@/app/(admin)/layout';
import AdminExpertNotesPage from '@/app/(admin)/admin/expert-notes/page';
import GoldenAdminLayout from '@/app/(broker)/broker/golden-admin/layout';
import PoweredByPage from '@/app/(public)/powered-by/page';
import { GET as getMarketDefaults } from '@/app/api/admin/market-defaults/route';
import { POST as postGoldenUpload } from '@/app/api/admin/golden-sets/upload/route';
import { GET as getGoldenSets } from '@/app/api/admin/golden-sets/route';
import { POST as postSetRole } from '@/app/api/admin/set-role/route';
import { GET as getQaWorkbench, POST as postQaWorkbench } from '@/app/api/public/qa-workbench/route';
import { GET as getImTestAssets } from '@/app/api/public/dealcard-im-test-assets/route';
import { GET as getTestguideAssets } from '@/app/api/public/testguide-assets/[...slug]/route';
import { POST as postAvatar } from '@/app/api/broker/profile/avatar/route';
import { POST as postLogo, DELETE as deleteLogo } from '@/app/api/broker/profile/logo/route';
import { reportClientOrServerError } from '@/lib/observability/error-reporter';
import { createModuleLogger, redactPiiDeep, redactStringPii } from '@/lib/logger';
import { proxy } from '@/proxy';

const REPO_ROOT = process.cwd();

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const WEBP_MAGIC = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from('VP8 ', 'ascii'),
]);

function makeServerAuthMock(user: { id: string; email?: string } | null, role: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: role ? { role } : null,
            error: null,
          }),
        })),
      })),
    })),
  };
}

describe('Wave 7.1A Security & Hardening Verification', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  describe('1. requireAdminRsc() & (admin) RSC Guards', () => {
    it('redirects unauthenticated callers to /login and non-admin brokers to /broker BEFORE any service query', async () => {
      mockCreateServerSupabaseClient.mockResolvedValue(makeServerAuthMock(null, null));
      await expect(requireAdminRsc()).rejects.toThrow('NEXT_REDIRECT:/login');

      mockCreateServerSupabaseClient.mockResolvedValue(
        makeServerAuthMock({ id: 'broker-1', email: 'b@credeal.net' }, 'broker'),
      );
      await expect(requireAdminRsc()).rejects.toThrow('NEXT_REDIRECT:/broker');
      await expect(AdminLayout({ children: 'ok' })).rejects.toThrow('NEXT_REDIRECT:/broker');
      await expect(AdminExpertNotesPage()).rejects.toThrow('NEXT_REDIRECT:/broker');
      expect(mockCreateServiceClient).not.toHaveBeenCalled();

      mockCreateServerSupabaseClient.mockResolvedValue(
        makeServerAuthMock({ id: 'admin-1', email: 'a@credeal.net' }, 'admin'),
      );
      const auth = await requireAdminRsc();
      expect(auth).toEqual({
        user: { id: 'admin-1', email: 'a@credeal.net' },
        role: 'admin',
      });
    });

    it('calls await requireAdminRsc() inside layout.tsx and all 7 (admin) subpages with D3 daylight chrome & >=14px typography', () => {
      const adminPages = [
        'src/app/(admin)/layout.tsx',
        'src/app/(admin)/admin/page.tsx',
        'src/app/(admin)/admin/expert-notes/page.tsx',
        'src/app/(admin)/admin/gate-requests/page.tsx',
        'src/app/(admin)/admin/analytics/page.tsx',
        'src/app/(admin)/admin/discrepancy-dashboard/page.tsx',
        'src/app/(admin)/admin/market/page.tsx',
        'src/app/(admin)/admin/pipeline/page.tsx',
      ];

      for (const rel of adminPages) {
        const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
        expect(src, `${rel} must invoke requireAdminRsc()`).toContain('requireAdminRsc');
        expect(src, `${rel} must not contain dark chrome bg-slate-950/bg-[#070B14]`).not.toMatch(
          /bg-slate-950|bg-\[#070B14\]|text-xs\b|text-\[([0-9]|1[0-3])px\]/,
        );
      }
    });
  });

  describe('2. QA API Gate & Public Test Asset Fail-Closed', () => {
    it('denies even logged-in brokers without QA access key in real production runtime', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CI;
      delete process.env.NEXT_PHASE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-instance.supabase.co';
      process.env.QA_ACCESS_KEY = 'prod-qa-key-2026';

      mockRequireBroker.mockResolvedValue({
        error: null,
        user: { id: 'broker-uuid-1', email: 'broker@credeal.net' },
      });

      // Logged-in broker WITHOUT QA key must fail closed on all QA endpoints in real prod
      const pinsRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=pins'),
      );
      expect(pinsRes.status).toBe(404);

      const showcaseRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=showcase'),
      );
      expect(showcaseRes.status).toBe(404);

      const syncRes = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'sync', sessionId: 'qa-sess-1', records: {} }),
        }),
      );
      expect(syncRes.status).toBe(401);

      const seedRes = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'seed_axis456' }),
        }),
      );
      expect(seedRes.status).toBe(404);

      // Valid QA key succeeds
      const keyPinsRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=pins', {
          headers: { 'x-qa-access-key': 'prod-qa-key-2026' },
        }),
      );
      expect(keyPinsRes.status).toBe(200);
    });

    it('enforces CRE_ENFORCE_QA_GATE=1 scoping (pins scoped to authorId===brokerUser.id, admin/manifest/seed 403/404)', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      process.env.CRE_ENFORCE_QA_GATE = '1';
      process.env.QA_ACCESS_KEY = 'gate-key-2026';

      globalThis.__CRE_QA_WORKBENCH_PINS__ = [
        {
          id: 'pin-mine',
          sessionId: 's1',
          workspace: 'dealcards',
          routePath: '/broker/w/dealcards',
          targetSelector: 'viewport',
          targetLabel: 'mine',
          note: 'my own pin',
          severity: 'major',
          viewport: null,
          fontScale: 'normal',
          createdAt: '2026-11-18T00:00:00Z',
          authorId: 'broker-a',
        },
        {
          id: 'pin-other',
          sessionId: 's1',
          workspace: 'dealcards',
          routePath: '/broker/w/dealcards',
          targetSelector: 'viewport',
          targetLabel: 'other',
          note: 'other broker pin',
          severity: 'major',
          viewport: null,
          fontScale: 'normal',
          createdAt: '2026-11-18T00:01:00Z',
          authorId: 'broker-b',
        },
      ];

      // Unauthenticated without QA key -> 404/401
      mockRequireBroker.mockResolvedValue({ error: 'unauthenticated', user: null });
      const unauthGet = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=pins'),
      );
      expect(unauthGet.status).toBe(404);

      // Authenticated broker without QA key -> mode=pins scoped strictly to authorId
      mockRequireBroker.mockResolvedValue({
        error: null,
        user: { id: 'broker-a', email: 'a@credeal.net' },
      });
      const brokerPinsRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=pins'),
      );
      expect(brokerPinsRes.status).toBe(200);
      const brokerPinsJson = await brokerPinsRes.json();
      expect(brokerPinsJson.pins.map((p: { id: string }) => p.id)).toEqual(['pin-mine']);

      // Manifest/seeding/sync without QA key -> 403
      const manifestRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=showcase'),
      );
      expect(manifestRes.status).toBe(403);

      const seedRes = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'seed_axis456' }),
        }),
      );
      expect(seedRes.status).toBe(403);

      // Asset routes return 404 without QA key under CRE_ENFORCE_QA_GATE=1 and 200 with QA key
      const imBlocked = await getImTestAssets(
        new NextRequest('http://localhost:3000/api/public/dealcard-im-test-assets?kind=xlsx'),
      );
      expect(imBlocked.status).toBe(404);

      const tgBlocked = await getTestguideAssets(
        new NextRequest('http://localhost:3000/api/public/testguide-assets/csv/test.csv'),
        { params: Promise.resolve({ slug: ['csv', 'test.csv'] }) },
      );
      expect(tgBlocked.status).toBe(404);

      const imAllowed = await getImTestAssets(
        new NextRequest('http://localhost:3000/api/public/dealcard-im-test-assets?kind=xlsx', {
          headers: { 'x-qa-access-key': 'gate-key-2026' },
        }),
      );
      expect(imAllowed.status).toBe(200);
    });
  });

  describe('3. Enforced CSP & Proxy Spoof-Header Stripping', () => {
    it('configures enforced Content-Security-Policy with frame-ancestors none, object-src none, base-uri self', async () => {
      const rules = await nextConfig.headers!();
      const globalRule = rules.find((r) => r.source === '/:path*');
      const cspHeader = globalRule?.headers.find((h) => h.key === 'Content-Security-Policy');
      expect(cspHeader).toBeDefined();
      expect(cspHeader!.value).toContain("frame-ancestors 'none'");
      expect(cspHeader!.value).toContain("object-src 'none'");
      expect(cspHeader!.value).toContain("base-uri 'self'");

      // Same-origin iframe routes override frame-ancestors to 'self'
      const dcRule = rules.find((r) => r.source === '/dc/:path*');
      const dcCsp = dcRule?.headers.find((h) => h.key === 'Content-Security-Policy');
      expect(dcCsp?.value).toContain("frame-ancestors 'self'");
    });

    it('strips untrusted x-cre-proxy-secret and x-cre-verified-user before any early return in proxy()', async () => {
      const req = new NextRequest('http://localhost:3000/testguide', {
        headers: {
          'x-cre-proxy-secret': 'spoofed-secret',
          'x-cre-verified-user': encodeURIComponent(JSON.stringify({ id: 'spoof-admin' })),
        },
      });
      await proxy(req);
      expect(req.headers.get('x-cre-proxy-secret')).toBeNull();
      expect(req.headers.get('x-cre-verified-user')).toBeNull();
    });
  });

  describe('4. Avatar & Logo Upload Hardening (5MB Cap, Magic Bytes, Schema Drift)', () => {
    function setupStorageMocks(updateError: { code?: string; message: string } | null = null) {
      const updateCalls: Array<{ table: string; payload: Record<string, unknown>; eqCol: string }> = [];
      const uploadCalls: Array<{ path: string; options: { contentType?: string } }> = [];

      const svcMock = {
        storage: {
          listBuckets: vi.fn().mockResolvedValue({ data: [{ name: 'broker-assets' }] }),
          createBucket: vi.fn().mockResolvedValue({ data: null, error: null }),
          from: vi.fn(() => ({
            upload: vi.fn(async (storagePath: string, _buf: Buffer, options: { contentType?: string }) => {
              uploadCalls.push({ path: storagePath, options });
              return { data: { path: storagePath }, error: null };
            }),
            getPublicUrl: vi.fn((storagePath: string) => ({
              data: { publicUrl: `https://cdn.example.supabase.co/storage/v1/object/public/${storagePath}` },
            })),
            remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        },
        from: vi.fn((table: string) => ({
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn(async (eqCol: string) => {
              updateCalls.push({ table, payload, eqCol });
              return { data: null, error: table === 'broker_profiles' ? updateError : null };
            }),
          })),
        })),
      };

      mockCreateServiceClient.mockReturnValue(svcMock);
      mockRequireBroker.mockResolvedValue({ error: null, user: { id: 'broker-u1' } });
      mockCreateServerSupabaseClient.mockResolvedValue({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'broker-u1' } } }) },
      });
      return { updateCalls, uploadCalls };
    }

    it('rejects SVG, HTML, text, mismatched MIME/magic bytes, and >5MB files with HTTP 400', async () => {
      setupStorageMocks();

      const cases: Array<{ file: File; expectedCode: string }> = [
        {
          file: new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'evil.svg', {
            type: 'image/svg+xml',
          }),
          expectedCode: 'UNSUPPORTED_IMAGE_FORMAT',
        },
        {
          file: new File(['<html><body>xss</body></html>'], 'xss.png', { type: 'image/png' }),
          expectedCode: 'UNSUPPORTED_IMAGE_FORMAT',
        },
        {
          file: new File([JPEG_MAGIC], 'spoof.png', { type: 'image/png' }),
          expectedCode: 'UNSUPPORTED_IMAGE_FORMAT',
        },
        {
          file: new File([Buffer.concat([PNG_MAGIC, Buffer.alloc(5 * 1024 * 1024 + 16)])], 'huge.png', {
            type: 'image/png',
          }),
          expectedCode: 'FILE_TOO_LARGE',
        },
      ];

      for (const tc of cases) {
        const fdAvatar = new FormData();
        fdAvatar.append('file', tc.file);
        const avRes = await postAvatar(
          new NextRequest('http://localhost:3000/api/broker/profile/avatar', {
            method: 'POST',
            body: fdAvatar,
          }),
        );
        expect(avRes.status).toBe(400);
        const avJson = await avRes.json();
        expect(avJson.code).toBe(tc.expectedCode);

        const fdLogo = new FormData();
        fdLogo.append('file', tc.file);
        fdLogo.append('type', 'company');
        const lgRes = await postLogo(
          new NextRequest('http://localhost:3000/api/broker/profile/logo', {
            method: 'POST',
            body: fdLogo,
          }),
        );
        expect(lgRes.status).toBe(400);
        const lgJson = await lgRes.json();
        expect(lgJson.code).toBe(tc.expectedCode);
      }
    });

    it('accepts valid magic-byte PNG/JPEG/WebP, updates broker_profiles in avatar route, and tolerates 42703/PGRST204 in logo route', async () => {
      const { updateCalls, uploadCalls } = setupStorageMocks({
        code: '42703',
        message: 'column broker_profiles.logo_company_url does not exist',
      });

      const fdAvatar = new FormData();
      fdAvatar.append('file', new File([JPEG_MAGIC], 'portrait.weird-ext.png', { type: 'image/jpeg' }));
      const avRes = await postAvatar(
        new NextRequest('http://localhost:3000/api/broker/profile/avatar', {
          method: 'POST',
          body: fdAvatar,
        }),
      );
      expect(avRes.status).toBe(200);
      expect(uploadCalls[0]?.path).toMatch(/\.jpg$/);
      expect(updateCalls.some((c) => c.table === 'profiles' && c.eqCol === 'id')).toBe(true);
      expect(updateCalls.some((c) => c.table === 'broker_profiles' && c.eqCol === 'user_id')).toBe(true);

      const fdLogo = new FormData();
      fdLogo.append('file', new File([WEBP_MAGIC], 'brand.svg', { type: 'image/webp' }));
      fdLogo.append('type', 'company');
      const lgRes = await postLogo(
        new NextRequest('http://localhost:3000/api/broker/profile/logo', {
          method: 'POST',
          body: fdLogo,
        }),
      );
      expect(lgRes.status).toBe(200);
      expect(uploadCalls[1]?.path).toMatch(/company\.webp$/);

      const delRes = await deleteLogo(
        new NextRequest('http://localhost:3000/api/broker/profile/logo?type=company', {
          method: 'DELETE',
        }),
      );
      expect(delRes.status).toBe(200);
    });
  });

  describe('5. Observability & Logger PII Redaction', () => {
    it('strips query parameters & hashes from URL and redacts emails/phones in error-reporter', async () => {
      process.env.ERROR_WEBHOOK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await reportClientOrServerError(
        new Error('Contact fail for user@credeal.net / 010-1234-5678'),
        {
          boundary: 'broker-boundary',
          url: 'https://credeal.net/broker/w/im?token=secret123&phone=010-9999-8888#access_token=abc',
        },
      );

      const consoleOutput = consoleSpy.mock.calls.map((c) => c.join(' ')).join(' ');
      expect(consoleOutput).not.toContain('secret123');
      expect(consoleOutput).not.toContain('access_token=abc');
      expect(consoleOutput).not.toContain('user@credeal.net');
      expect(consoleOutput).not.toContain('010-1234-5678');
      expect(consoleOutput).not.toContain('010-9999-8888');
      expect(consoleOutput).toContain('https://credeal.net/broker/w/im');

      const webhookBody = String(fetchSpy.mock.calls[0]?.[1]?.body ?? '');
      expect(webhookBody).not.toContain('secret123');
      expect(webhookBody).not.toContain('access_token=abc');
      expect(webhookBody).toContain('https://credeal.net/broker/w/im');
    });

    it('recursively redacts PII keys (depth <= 5), inline strings/Errors, and browser logger output', async () => {
      const nested = {
        meta: {
          user: {
            email: 'owner@example.kr',
            phone: '010-2222-3333',
            mobile: '+82-10-4444-5555',
            token: 'tok-xyz',
            secret: 'sec-123',
            password: 'pw',
            authorization: 'Bearer aaa',
            cookie: 'sid=bbb',
            resident: '900101-1234567',
            ssn: '123-45-6789',
            note: '연락처 010-5555-6666 또는 help@credeal.net 문의',
          },
          deep: { l3: { l4: { l5: { l6: { secretLeaf: 'must-not-leak' } } } } },
        },
      };

      const scrubbed = redactPiiDeep(nested) as Record<string, any>;
      expect(scrubbed.meta.user.email).toBe('[REDACTED]');
      expect(scrubbed.meta.user.phone).toBe('[REDACTED]');
      expect(scrubbed.meta.user.mobile).toBe('[REDACTED]');
      expect(scrubbed.meta.user.token).toBe('[REDACTED]');
      expect(scrubbed.meta.user.secret).toBe('[REDACTED]');
      expect(scrubbed.meta.user.password).toBe('[REDACTED]');
      expect(scrubbed.meta.user.authorization).toBe('[REDACTED]');
      expect(scrubbed.meta.user.cookie).toBe('[REDACTED]');
      expect(scrubbed.meta.user.resident).toBe('[REDACTED]');
      expect(scrubbed.meta.user.ssn).toBe('[REDACTED]');
      expect(scrubbed.meta.user.note).not.toContain('010-5555-6666');
      expect(scrubbed.meta.user.note).not.toContain('help@credeal.net');
      expect(scrubbed.meta.deep.l3.l4.l5.l6).toBe('[REDACTED]');
      expect(redactStringPii('문의: ceo@corp.kr / 010-8765-4321')).toBe(
        '문의: [REDACTED_EMAIL] / [REDACTED_PHONE]',
      );

      // Exercise browser logger branch by simulating window before dynamic re-import
      const originalWindow = (globalThis as Record<string, unknown>).window;
      try {
        (globalThis as Record<string, unknown>).window = {};
        vi.resetModules();
        const browserLoggerMod = await import('@/lib/logger');
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        const bLog = browserLoggerMod.createModuleLogger('test-ui');
        bLog.info('user failed ceo@test.kr', { phone: '010-1111-2222', nested: { token: 'abc' } });
        const serialized = JSON.stringify(infoSpy.mock.calls);
        expect(serialized).not.toContain('ceo@test.kr');
        expect(serialized).not.toContain('010-1111-2222');
        expect(serialized).not.toContain('abc');
      } finally {
        if (originalWindow === undefined) {
          delete (globalThis as Record<string, unknown>).window;
        } else {
          (globalThis as Record<string, unknown>).window = originalWindow;
        }
        vi.resetModules();
      }
      expect(typeof createModuleLogger).toBe('function');
    });
  });

  describe('6. Wave 7.2A Security & Blind-Guard Regressions', () => {
    const VALID_PDF_MAGIC = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n', 'ascii');
    const TEST_UUID = '11111111-2222-4333-8444-555555555555';

    it('/powered-by?ref=<draftOrPrivateBuildingId> returns no address and no building card, while published blind dealcard omits street address', async () => {
      mockIsBuildingShareLinkRevoked.mockReturnValue(false);
      mockIsBuildingShareLinkRevokedAsync.mockResolvedValue(false);

      // 1) Draft workspace item -> buildingData must be null, readBuilding never invoked
      mockGetPublicWorkspaceProjection.mockResolvedValue({
        found: true,
        revoked: false,
        deleted: false,
        status: 'draft',
        ownerId: 'broker-1',
        projection: null,
      });
      mockCreateServiceClient.mockReturnValue({ from: vi.fn() });

      const draftEl = await PoweredByPage({
        searchParams: Promise.resolve({ ref: TEST_UUID }),
      });
      const draftHtml = renderToStaticMarkup(draftEl as React.ReactElement);
      expect(draftHtml).not.toContain('방금 확인하신');
      expect(mockReadBuilding).not.toHaveBeenCalled();

      // 2) Draft / archived building_ssot_lite without workspace item -> buildingData must be null
      mockGetPublicWorkspaceProjection.mockResolvedValue({
        found: false,
        revoked: false,
        deleted: false,
        status: null,
        ownerId: null,
        projection: null,
      });
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            neq: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === 'building_ssot_lite') {
                return {
                  data: {
                    id: TEST_UUID,
                    status: 'draft',
                    area_signal: '역삼동',
                    asset_type: '근린생활시설',
                    price_band: '80억대',
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
          };
          return chain;
        }),
      });

      const draftBuildingEl = await PoweredByPage({
        searchParams: Promise.resolve({ ref: TEST_UUID }),
      });
      const draftBuildingHtml = renderToStaticMarkup(draftBuildingEl as React.ReactElement);
      expect(draftBuildingHtml).not.toContain('방금 확인하신');
      expect(mockReadBuilding).not.toHaveBeenCalled();

      // 3) Revoked share link -> buildingData must be null
      mockIsBuildingShareLinkRevoked.mockReturnValue(true);
      const revokedEl = await PoweredByPage({
        searchParams: Promise.resolve({ ref: TEST_UUID }),
      });
      const revokedHtml = renderToStaticMarkup(revokedEl as React.ReactElement);
      expect(revokedHtml).not.toContain('방금 확인하신');
      mockIsBuildingShareLinkRevoked.mockReturnValue(false);

      // 4) Published workspace item -> renders blind card ONLY, never leaks exact street address
      mockGetPublicWorkspaceProjection.mockResolvedValue({
        found: true,
        revoked: false,
        deleted: false,
        status: 'published',
        ownerId: 'broker-1',
        projection: {
          id: TEST_UUID,
          buildingId: TEST_UUID,
          ownerId: 'broker-1',
          kind: 'dealcard',
          status: 'published',
          title: '강남구 역삼동 근생 빌딩',
          address: '서울특별시 강남구 테헤란로 152 호산당빌딩',
          priceBand: '90~100억',
          snapshot: {
            card4: {
              headline: '강남 핵심권역 수익형 근생',
              region: '강남구 역삼동',
              use: '근린생활시설',
              priceBand: '90~100억',
            },
          },
          correctionNotice: null,
          version: 1,
          docHash: null,
          publishedAt: '2026-11-18T00:00:00Z',
          updatedAt: '2026-11-18T00:00:00Z',
        },
      });
      const pubWsEl = await PoweredByPage({
        searchParams: Promise.resolve({ ref: TEST_UUID }),
      });
      const pubWsHtml = renderToStaticMarkup(pubWsEl as React.ReactElement);
      expect(pubWsHtml).toContain('방금 확인하신');
      expect(pubWsHtml).toContain('강남 핵심권역 수익형 근생');
      expect(pubWsHtml).toContain('강남구 역삼동');
      expect(pubWsHtml).toContain('90~100억');
      expect(pubWsHtml).not.toContain('테헤란로 152');
      expect(pubWsHtml).not.toContain('호산당빌딩');

      // 5) Published building_ssot_lite (public_signal_ready) with leaked address in teaser -> sanitized!
      mockGetPublicWorkspaceProjection.mockResolvedValue({
        found: false,
        revoked: false,
        deleted: false,
        status: null,
        ownerId: null,
        projection: null,
      });
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            neq: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => {
              if (table === 'building_ssot_lite') {
                return {
                  data: {
                    id: TEST_UUID,
                    status: 'public_signal_ready',
                    area_signal: '영등포구 당산동',
                    asset_type: '근린생활시설',
                    price_band: '70억대',
                  },
                  error: null,
                };
              }
              if (table === 'building_signal_cards') {
                return {
                  data: {
                    id: 'sig-1',
                    title: '당산동 117-3번지 호산당빌딩 매각',
                    area_signal: '영등포구 당산동',
                    asset_type: '근린생활시설',
                    price_band: '70억대',
                    status: 'draft',
                    visibility: 'public_blind',
                    body: {},
                  },
                  error: null,
                };
              }
              return { data: null, error: null };
            }),
          };
          return chain;
        }),
      });
      mockReadBuilding.mockResolvedValue({
        id: TEST_UUID,
        address: '서울특별시 영등포구 당산동5가 117-3 호산당빌딩',
        area_signal: '영등포구 당산동',
        asset_type: '근린생활시설',
        price_band: '70억대',
      });

      const pubBuildingEl = await PoweredByPage({
        searchParams: Promise.resolve({ ref: TEST_UUID }),
      });
      const pubBuildingHtml = renderToStaticMarkup(pubBuildingEl as React.ReactElement);
      expect(pubBuildingHtml).toContain('방금 확인하신');
      expect(pubBuildingHtml).toContain('블라인드 검증 매물');
      expect(pubBuildingHtml).toContain('영등포구 당산동');
      expect(pubBuildingHtml).not.toContain('117-3');
      expect(pubBuildingHtml).not.toContain('호산당빌딩');
    });

    it('GET /api/admin/market-defaults returns 401/403 for unauthenticated/non-admin callers and enforces GoldenAdminLayout RSC guard', async () => {
      const { NextResponse } = await import('next/server');

      mockRequireRole.mockResolvedValue({
        user: null,
        role: null,
        profile: null,
        error: NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 }),
      });
      const unauthRes = await getMarketDefaults(
        new NextRequest('http://localhost:3000/api/admin/market-defaults'),
      );
      expect(unauthRes.status).toBe(401);
      expect(mockRequireRole).toHaveBeenCalledWith(expect.any(NextRequest), ['admin']);

      mockRequireRole.mockResolvedValue({
        user: { id: 'broker-1' },
        role: 'broker',
        profile: { role: 'broker', display_name: '김중개' },
        error: NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 }),
      });
      const forbiddenRes = await getMarketDefaults(
        new NextRequest('http://localhost:3000/api/admin/market-defaults'),
      );
      expect(forbiddenRes.status).toBe(403);

      mockCreateServerSupabaseClient.mockResolvedValue(
        makeServerAuthMock({ id: 'broker-1', email: 'b@credeal.net' }, 'broker'),
      );
      await expect(GoldenAdminLayout({ children: 'ok' })).rejects.toThrow('NEXT_REDIRECT:/broker');
    });

    it('POST /api/admin/golden-sets/upload rejects SVG, spoofed .html with application/pdf, and stores valid PDF under UUID path', async () => {
      const uploadCalls: Array<{ path: string; options: { contentType?: string } }> = [];
      mockRequireAdmin.mockResolvedValue({
        error: null,
        user: { id: 'admin-1' },
        role: 'admin',
      });
      mockCreateServiceClient.mockReturnValue({
        storage: {
          from: vi.fn(() => ({
            upload: vi.fn(async (storagePath: string, _buf: Buffer, options: { contentType?: string }) => {
              uploadCalls.push({ path: storagePath, options });
              return { data: { path: storagePath }, error: null };
            }),
            getPublicUrl: vi.fn((storagePath: string) => ({
              data: { publicUrl: `https://cdn.example.supabase.co/storage/v1/object/public/${storagePath}` },
            })),
          })),
        },
      });

      // 1) SVG upload -> 400
      const svgFd = new FormData();
      svgFd.append(
        'file',
        new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'evil.svg', {
          type: 'image/svg+xml',
        }),
      );
      const svgRes = await postGoldenUpload(
        new NextRequest('http://localhost:3000/api/admin/golden-sets/upload', { method: 'POST', body: svgFd }),
      );
      expect([400, 415]).toContain(svgRes.status);

      // 2) Spoofed .html with Content-Type: application/pdf -> 400
      const htmlSpoofFd = new FormData();
      htmlSpoofFd.append(
        'file',
        new File(['<html><body><script>alert(1)</script></body></html>'], 'payload.html', {
          type: 'application/pdf',
        }),
      );
      const htmlSpoofRes = await postGoldenUpload(
        new NextRequest('http://localhost:3000/api/admin/golden-sets/upload', { method: 'POST', body: htmlSpoofFd }),
      );
      expect([400, 415]).toContain(htmlSpoofRes.status);

      // 3) Spoofed .pdf with SVG/HTML body -> 415
      const pdfBodySpoofFd = new FormData();
      pdfBodySpoofFd.append(
        'file',
        new File(['<svg onload="alert(1)"></svg>'], 'fake.pdf', {
          type: 'application/pdf',
        }),
      );
      const pdfBodySpoofRes = await postGoldenUpload(
        new NextRequest('http://localhost:3000/api/admin/golden-sets/upload', { method: 'POST', body: pdfBodySpoofFd }),
      );
      expect([400, 415]).toContain(pdfBodySpoofRes.status);

      // 4) Valid PDF -> 201 and stored under golden-sets/<uuid>.pdf (no untrusted file.name in path)
      const validFd = new FormData();
      validFd.append('file', new File([VALID_PDF_MAGIC], '../evil-name.pdf', { type: 'application/pdf' }));
      const validRes = await postGoldenUpload(
        new NextRequest('http://localhost:3000/api/admin/golden-sets/upload', { method: 'POST', body: validFd }),
      );
      expect(validRes.status).toBe(201);
      expect(uploadCalls[0]?.path).toMatch(/^golden-sets\/[0-9a-f-]{36}\.pdf$/i);
      expect(uploadCalls[0]?.path).not.toContain('evil-name');
      expect(uploadCalls[0]?.options.contentType).toBe('application/pdf');
    });

    it('POST & DELETE /api/broker/profile/logo reject non-broker role via requireBroker (403)', async () => {
      const { NextResponse } = await import('next/server');
      mockRequireBroker.mockResolvedValue({
        user: null,
        role: 'public_user',
        profile: { role: 'public_user', display_name: '일반사용자' },
        error: NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 }),
      });

      const fd = new FormData();
      fd.append('file', new File([PNG_MAGIC], 'logo.png', { type: 'image/png' }));
      fd.append('type', 'company');

      const postRes = await postLogo(
        new NextRequest('http://localhost:3000/api/broker/profile/logo', { method: 'POST', body: fd }),
      );
      expect(postRes.status).toBe(403);

      const delRes = await deleteLogo(
        new NextRequest('http://localhost:3000/api/broker/profile/logo?type=company', { method: 'DELETE' }),
      );
      expect(delRes.status).toBe(403);
      expect(mockCreateServiceClient).not.toHaveBeenCalled();
    });

    it('admin golden-sets sort allowlist & set-role role allowlist + paginated user lookup', async () => {
      mockRequireAdmin.mockResolvedValue({
        error: null,
        user: { id: 'admin-1' },
        role: 'admin',
      });

      const orderCalls: string[] = [];
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn(() => {
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            order: vi.fn((col: string) => {
              orderCalls.push(col);
              return chain;
            }),
            range: vi.fn(() => chain),
            contains: vi.fn(() => chain),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], count: 0, error: null }),
          };
          return chain;
        }),
      });

      const gsRes = await getGoldenSets(
        new NextRequest('http://localhost:3000/api/admin/golden-sets?sort=malicious_col;drop'),
      );
      expect(gsRes.status).toBe(200);
      expect(orderCalls[0]).toBe('created_at');

      // set-role invalid role -> 400
      const badRoleRes = await postSetRole(
        new NextRequest('http://localhost:3000/api/admin/set-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'u@credeal.net', role: 'super_root' }),
        }),
      );
      expect(badRoleRes.status).toBe(400);

      // set-role paginated lookup finds user on page 2
      const updatedIds: string[] = [];
      const page1Users = Array.from({ length: 100 }, (_, i) => ({
        id: `u1-${i}`,
        email: `u1-${i}@credeal.net`,
      }));
      mockCreateServiceClient.mockReturnValue({
        auth: {
          admin: {
            listUsers: vi.fn(async ({ page }: { page: number }) => ({
              data: {
                users: page === 1 ? page1Users : [{ id: 'target-p2', email: 'page2@credeal.net' }],
              },
              error: null,
            })),
          },
        },
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn(async (_col: string, id: string) => {
              updatedIds.push(id);
              return { error: null };
            }),
          })),
        })),
      });

      const okRoleRes = await postSetRole(
        new NextRequest('http://localhost:3000/api/admin/set-role', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'page2@credeal.net', role: 'broker' }),
        }),
      );
      expect(okRoleRes.status).toBe(200);
      expect(updatedIds).toEqual(['target-p2']);
    });
  });
});
