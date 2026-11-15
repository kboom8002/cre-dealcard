/**
 * Wave 6 — WP-21 Preventive Guard Suite:
 * 1. Supabase migration version uniqueness (`^\d+_[a-z0-9_]+\.sql$`), seed separation, `config.toml`,
 *    removal of `NEED_MIGRATION.flag`, and PGlite verification of `20261115000004_im_share_links_broker_rls.sql`.
 * 2. Observability (`error-reporter.ts`) & sanitized Error Boundaries (10 boundaries, zero raw `error.message`).
 * 3. Unified Cron authentication (`verifyCronRequest` SHA-256 + `timingSafeEqual`), idempotency slots,
 *    `morning-briefing` bounded concurrency (`maxDuration = 300`), and `/api/cron/subscription-expiry`.
 * 4. `vercel.json` function `maxDuration` & cron schedules registration.
 * 5. `.github/workflows/ci.yml` strict `npm ci`, `Lint Check`, and `SHARE_LINK_SECRET` injection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateErrorReferenceCode,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';

const REPO_ROOT = process.cwd();

const ERROR_BOUNDARY_FILES = [
  'src/app/global-error.tsx',
  'src/app/error.tsx',
  'src/app/(public)/error.tsx',
  'src/app/(broker)/error.tsx',
  'src/app/(admin)/error.tsx',
  'src/app/(public)/dc/[id]/error.tsx',
  'src/app/(public)/im-lite/[buildingId]/error.tsx',
  'src/app/(magazine)/magazine/error.tsx',
  'src/app/(broker)/broker/deal-card/[id]/error.tsx',
  'src/app/(broker)/broker/magazine-editor/error.tsx',
] as const;

const CRON_ROUTE_FILES = [
  'src/app/api/cron/ai-quality-monitor/route.ts',
  'src/app/api/cron/circle-approval-timeout/route.ts',
  'src/app/api/cron/consistency-check/route.ts',
  'src/app/api/cron/data-hygiene/route.ts',
  'src/app/api/cron/hold-expiry/route.ts',
  'src/app/api/cron/morning-briefing/route.ts',
  'src/app/api/cron/retention-purge/route.ts',
  'src/app/api/cron/weekly-magazine/route.ts',
  'src/app/api/cron/subscription-expiry/route.ts',
] as const;

// Mock state for subscription-expiry behavioral test
const mockDb = {
  user_subscriptions: [] as Array<{
    id: string;
    user_id: string;
    tier: string;
    status: string;
    current_period_end: string;
    updated_at?: string;
  }>,
  im_pro_grants: [] as Array<{
    id: string;
    user_id: string;
    status: string;
    expires_at: string;
  }>,
  magazine_cron_runs: [] as Array<{
    id: string;
    run_id: string;
    kind: string;
    status: string;
    reason: string;
    duration_ms: number;
  }>,
};

function createMockSupabaseClient() {
  return {
    from(table: string) {
      if (table === 'magazine_cron_runs') {
        return {
          select() {
            return {
              eq(_col: string, val: string) {
                return {
                  async limit(n: number) {
                    const matched = mockDb.magazine_cron_runs
                      .filter((r) => r.run_id === val)
                      .slice(0, n);
                    return { data: matched, error: null };
                  },
                };
              },
            };
          },
          async insert(payload: Record<string, unknown>) {
            mockDb.magazine_cron_runs.push({
              id: `slot-${mockDb.magazine_cron_runs.length + 1}`,
              run_id: String(payload.run_id ?? ''),
              kind: String(payload.kind ?? ''),
              status: String(payload.status ?? 'ok'),
              reason: String(payload.reason ?? ''),
              duration_ms: Number(payload.duration_ms ?? 0),
            });
            return { error: null };
          },
        };
      }

      if (table === 'user_subscriptions') {
        return {
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  async lt(ltCol: string, ltVal: string) {
                    const matched = mockDb.user_subscriptions.filter((row) => {
                      const rec = row as Record<string, string>;
                      return rec[col] === val && rec[ltCol] < ltVal;
                    });
                    return { data: matched, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, string>) {
            return {
              in(_col: string, ids: string[]) {
                return {
                  async eq(eqCol: string, eqVal: string) {
                    for (const row of mockDb.user_subscriptions) {
                      const rec = row as Record<string, string>;
                      if (ids.includes(row.id) && rec[eqCol] === eqVal) {
                        Object.assign(row, patch);
                      }
                    }
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }

      if (table === 'im_pro_grants') {
        return {
          select() {
            return {
              eq(col: string, val: string) {
                return {
                  async lt(ltCol: string, ltVal: string) {
                    const matched = mockDb.im_pro_grants.filter((row) => {
                      const rec = row as Record<string, string>;
                      return rec[col] === val && rec[ltCol] < ltVal;
                    });
                    return { data: matched, error: null };
                  },
                };
              },
            };
          },
          update(patch: Record<string, string>) {
            return {
              in(_col: string, ids: string[]) {
                return {
                  async eq(eqCol: string, eqVal: string) {
                    for (const row of mockDb.im_pro_grants) {
                      const rec = row as Record<string, string>;
                      if (ids.includes(row.id) && rec[eqCol] === eqVal) {
                        Object.assign(row, patch);
                      }
                    }
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      }

      return {
        select() {
          return {
            eq() {
              return {
                async lt() {
                  return { data: [], error: null };
                },
                async limit() {
                  return { data: [], error: null };
                },
              };
            },
          };
        },
        async insert() {
          return { error: null };
        },
      };
    },
  };
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => createMockSupabaseClient(),
}));

describe('Wave 6 — WP-21 Preventive Guard: Migrations, Error Boundaries, Cron Auth & CI', () => {
  const originalCronSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSlackWebhook = process.env.SLACK_WEBHOOK_URL;
  const originalErrorWebhook = process.env.ERROR_WEBHOOK_URL;

  beforeEach(() => {
    mockDb.user_subscriptions = [];
    mockDb.im_pro_grants = [];
    mockDb.magazine_cron_runs = [];
    process.env.CRON_SECRET = 'wp21-test-cron-secret-value-strong';
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.SLACK_WEBHOOK_URL;
    delete process.env.ERROR_WEBHOOK_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalNodeEnv !== undefined) vi.stubEnv('NODE_ENV', originalNodeEnv);
    if (originalSlackWebhook === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = originalSlackWebhook;
    if (originalErrorWebhook === undefined) delete process.env.ERROR_WEBHOOK_URL;
    else process.env.ERROR_WEBHOOK_URL = originalErrorWebhook;
    vi.restoreAllMocks();
  });

  describe('1. Supabase Migrations, Seed Separation, config.toml & im_share_links RLS', () => {
    it('enforces strict ^\\d+_[a-z0-9_]+\\.sql$ naming, zero duplicate numeric prefixes, and zero test seeds in supabase/migrations/', () => {
      const migrationsDir = path.join(REPO_ROOT, 'supabase', 'migrations');
      const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
      const sqlFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.sql')).map((e) => e.name);

      expect(sqlFiles.length).toBeGreaterThan(70);

      const seenPrefixStrings = new Map<string, string>();
      const seenPrefixBigInts = new Map<string, string>();

      for (const file of sqlFiles) {
        expect(
          file,
          `Migration "${file}" must match /^\\d+_[a-z0-9_]+\\.sql$/`,
        ).toMatch(/^\d+_[a-z0-9_]+\.sql$/);

        expect(file).not.toContain('comprehensive_test_seed');
        expect(file).not.toContain('vibe_card_demo_seed');
        expect(file).not.toContain('mobile_im_pipeline_demo_seed');

        const prefix = file.split('_')[0]!;
        expect(
          seenPrefixStrings.has(prefix),
          `Duplicate migration string prefix "${prefix}" between "${seenPrefixStrings.get(prefix)}" and "${file}"`,
        ).toBe(false);
        seenPrefixStrings.set(prefix, file);

        const numericKey = BigInt(prefix).toString();
        expect(
          seenPrefixBigInts.has(numericKey),
          `Duplicate migration numeric version ${numericKey} between "${seenPrefixBigInts.get(numericKey)}" and "${file}"`,
        ).toBe(false);
        seenPrefixBigInts.set(numericKey, file);
      }

      // Critical test-referenced migrations must remain untouched
      expect(sqlFiles).toContain('20261027000001_sec4_rls_public_read_lockdown.sql');
      expect(sqlFiles).toContain('20261027000002_p05_foundations.sql');
      expect(sqlFiles).toContain('20261027000003_p4a_im_versioning.sql');
      expect(sqlFiles).toContain('20261115000004_im_share_links_broker_rls.sql');
    });

    it('separates demo/test seeds into supabase/seed/, configures supabase/config.toml, and deletes NEED_MIGRATION.flag', () => {
      expect(fs.existsSync(path.join(REPO_ROOT, 'NEED_MIGRATION.flag'))).toBe(false);

      const seedDir = path.join(REPO_ROOT, 'supabase', 'seed');
      expect(fs.existsSync(seedDir)).toBe(true);
      const seedFiles = fs.readdirSync(seedDir).filter((f) => f.endsWith('.sql'));
      expect(seedFiles).toContain('00040_vibe_card_demo_seed.sql');
      expect(seedFiles).toContain('00042_mobile_im_pipeline_demo_seed.sql');
      expect(seedFiles).toContain('00050_comprehensive_test_seed.sql');

      const configTomlPath = path.join(REPO_ROOT, 'supabase', 'config.toml');
      expect(fs.existsSync(configTomlPath)).toBe(true);
      const configToml = fs.readFileSync(configTomlPath, 'utf8');
      expect(configToml).toContain('project_id = "cre-dealcard"');
      expect(configToml).toContain('./seed/*.sql');
    });

    it('applies 20261115000004_im_share_links_broker_rls.sql idempotently on PGlite and enforces broker own-row SELECT/UPDATE RLS', async () => {
      const sqlPath = path.join(
        REPO_ROOT,
        'supabase',
        'migrations',
        '20261115000004_im_share_links_broker_rls.sql',
      );
      const migrationSql = fs.readFileSync(sqlPath, 'utf8');

      const db = new PGlite();
      try {
        await db.exec(`
          CREATE ROLE authenticated;
          CREATE SCHEMA IF NOT EXISTS auth;
          CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
            SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
          $$ LANGUAGE sql;
        `);

        // 1. Safe no-op when im_share_links table does not exist yet
        await db.exec(migrationSql);

        // 2. Create im_share_links and apply migration twice (idempotency check)
        await db.exec(`
          CREATE TABLE public.im_share_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token TEXT NOT NULL UNIQUE,
            is_revoked BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          GRANT SELECT, UPDATE ON public.im_share_links TO authenticated;
        `);

        await db.exec(migrationSql);
        await db.exec(migrationSql);

        const policies = await db.query<{ policyname: string; cmd: string }>(`
          SELECT policyname, cmd
          FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'im_share_links'
          ORDER BY policyname;
        `);

        expect(policies.rows).toEqual([
          { policyname: 'im_share_links_broker_select_own', cmd: 'SELECT' },
          { policyname: 'im_share_links_broker_update_own', cmd: 'UPDATE' },
        ]);
      } finally {
        await db.close();
      }
    });
  });

  describe('2. Observability (error-reporter.ts) & Sanitized Error Boundaries', () => {
    it('prevents raw error.message rendering and wires reportClientOrServerError across all 10 error boundaries', () => {
      for (const relPath of ERROR_BOUNDARY_FILES) {
        const absPath = path.join(REPO_ROOT, relPath);
        expect(fs.existsSync(absPath), `Missing boundary file: ${relPath}`).toBe(true);
        const source = fs.readFileSync(absPath, 'utf8');

        expect(source, `${relPath} must not render or reference error.message`).not.toContain(
          'error.message',
        );
        expect(source, `${relPath} must not leak error.stack`).not.toContain('error.stack');
        expect(source, `${relPath} must call reportClientOrServerError`).toContain(
          'reportClientOrServerError',
        );
        expect(source, `${relPath} must show sanitized Korean message`).toContain(
          '일시적인 화면 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        );
        expect(source, `${relPath} must display reference code label`).toContain('오류 참조코드:');
        expect(source, `${relPath} must include 48px touch target`).toContain('min-h-[48px]');
        expect(source, `${relPath} must include retry CTA`).toContain('다시 시도하기');
        expect(source, `${relPath} must include home navigation CTA`).toContain('홈으로 이동');
      }
    });

    it('generates deterministic ERR-XXXX codes and never throws inside reportClientOrServerError', async () => {
      const err = Object.assign(new Error('Database connection timeout'), { digest: 'abc123xyz' });
      const code1 = generateErrorReferenceCode(err);
      const code2 = generateErrorReferenceCode(err);

      expect(code1).toBe(code2);
      expect(code1).toMatch(/^ERR-[0-9A-F]{4}-abc123xyz$/);
      expect(generateErrorReferenceCode(undefined)).toMatch(/^ERR-[0-9A-F]{4}$/);

      process.env.ERROR_WEBHOOK_URL = 'https://hooks.slack.com/services/T000/B000/XXXX';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('webhook network down'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const reportedCode = await reportClientOrServerError(err, {
        boundary: 'unit-test-boundary',
        url: '/broker/deal-card/test',
      });

      expect(reportedCode).toBe(code1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });

  describe('3. Unified Cron Auth, Idempotency & Subscription Expiry Route', () => {
    it('enforces constant-time CRON_SECRET verification (401 wrong/missing, 503 unset in prod, null on valid)', async () => {
      // 1. Wrong token (different lengths must not throw RangeError)
      const wrongShort = verifyCronRequest(
        new Request('http://localhost/api/cron/test', {
          headers: { authorization: 'Bearer short' },
        }),
      );
      expect(wrongShort?.status).toBe(401);

      const wrongLong = verifyCronRequest(
        new Request('http://localhost/api/cron/test', {
          headers: { authorization: 'Bearer ' + 'x'.repeat(128) },
        }),
      );
      expect(wrongLong?.status).toBe(401);

      // 2. Valid Bearer token & valid x-cron-secret header
      const validBearer = verifyCronRequest(
        new Request('http://localhost/api/cron/test', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(validBearer).toBeNull();

      const validCustomHeader = verifyCronRequest(
        new Request('http://localhost/api/cron/test', {
          headers: { 'x-cron-secret': process.env.CRON_SECRET! },
        }),
      );
      expect(validCustomHeader).toBeNull();

      // 3. Unset CRON_SECRET in production -> fail-closed 503
      delete process.env.CRON_SECRET;
      vi.stubEnv('NODE_ENV', 'production');
      const prodUnset = verifyCronRequest(
        new Request('http://localhost/api/cron/test', {
          headers: { authorization: 'Bearer anything' },
        }),
      );
      expect(prodUnset?.status).toBe(503);
      const prodBody = await prodUnset!.json();
      expect(prodBody.error).toBe('CRON_SECRET_NOT_CONFIGURED');
    });

    it('wires verifyCronRequest across all cron routes and sets maxDuration = 300 + bounded batches on morning-briefing', () => {
      for (const relPath of CRON_ROUTE_FILES) {
        const source = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
        expect(source, `${relPath} must use verifyCronRequest`).toContain('verifyCronRequest');
        expect(source, `${relPath} must not use raw authHeader !== string comparison`).not.toContain(
          'authHeader !==',
        );
      }

      const morningBriefingSrc = fs.readFileSync(
        path.join(REPO_ROOT, 'src/app/api/cron/morning-briefing/route.ts'),
        'utf8',
      );
      expect(morningBriefingSrc).toContain('export const maxDuration = 300');
      expect(morningBriefingSrc).toContain('BATCH_SIZE = 5');
      expect(morningBriefingSrc).not.toContain('33333333-0000-0000-0000-000000000001');
    });

    it('acquires idempotency slots once per bucket and falls back gracefully when table is missing', async () => {
      const client = createMockSupabaseClient();
      const first = await acquireCronIdempotencySlot(client, 'consistency-check', '2026-11-15');
      expect(first).toEqual({ acquired: true });

      const duplicate = await acquireCronIdempotencySlot(client, 'consistency-check', '2026-11-15');
      expect(duplicate).toEqual({ acquired: false });

      // Missing table / mock client without magazine_cron_runs must degrade gracefully
      const fallback = await acquireCronIdempotencySlot({}, 'consistency-check', '2026-11-15');
      expect(fallback).toEqual({ acquired: true });
    });

    it('/api/cron/subscription-expiry rejects unauthorized callers (401) and transitions overdue subscriptions & Pro grants', async () => {
      const { GET } = await import('@/app/api/cron/subscription-expiry/route');

      // Unauthorized -> 401
      const unauthRes = await GET(
        new NextRequest('http://localhost:3000/api/cron/subscription-expiry'),
      );
      expect(unauthRes.status).toBe(401);

      const pastIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const futureIso = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

      mockDb.user_subscriptions.push(
        {
          id: 'sub-overdue-1',
          user_id: 'user-1',
          tier: 'pro',
          status: 'active',
          current_period_end: pastIso,
        },
        {
          id: 'sub-valid-2',
          user_id: 'user-2',
          tier: 'pro',
          status: 'active',
          current_period_end: futureIso,
        },
      );
      mockDb.im_pro_grants.push(
        {
          id: 'grant-overdue-1',
          user_id: 'user-1',
          status: 'active',
          expires_at: pastIso,
        },
        {
          id: 'grant-valid-2',
          user_id: 'user-2',
          status: 'active',
          expires_at: futureIso,
        },
      );

      // Authorized first run -> expires overdue subscription + grant
      const authRes = await GET(
        new NextRequest('http://localhost:3000/api/cron/subscription-expiry', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(authRes.status).toBe(200);
      const body = await authRes.json();
      expect(body.ok).toBe(true);
      expect(body.expiredSubscriptions).toBe(1);
      expect(body.expiredGrants).toBe(1);

      expect(mockDb.user_subscriptions.find((s) => s.id === 'sub-overdue-1')).toMatchObject({
        status: 'expired',
        tier: 'free',
      });
      expect(mockDb.user_subscriptions.find((s) => s.id === 'sub-valid-2')).toMatchObject({
        status: 'active',
        tier: 'pro',
      });
      expect(mockDb.im_pro_grants.find((g) => g.id === 'grant-overdue-1')?.status).toBe('expired');
      expect(mockDb.im_pro_grants.find((g) => g.id === 'grant-valid-2')?.status).toBe('active');

      // Duplicate invocation in same daily bucket -> skipped via idempotency slot
      const dupRes = await GET(
        new NextRequest('http://localhost:3000/api/cron/subscription-expiry', {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(dupRes.status).toBe(200);
      const dupBody = await dupRes.json();
      expect(dupBody.skipped).toBe('DUPLICATE_SLOT');
    });
  });

  describe('4. vercel.json & .github/workflows/ci.yml Operational Quality Gates', () => {
    it('registers morning-briefing maxDuration: 300 and schedules ai-quality-monitor, consistency-check, and subscription-expiry in vercel.json', () => {
      const vercelJson = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'vercel.json'), 'utf8'),
      ) as {
        functions: Record<string, { maxDuration: number }>;
        crons: Array<{ path: string; schedule: string }>;
      };

      expect(vercelJson.functions['src/app/api/cron/morning-briefing/route.ts']).toEqual({
        maxDuration: 300,
      });
      expect(vercelJson.functions['src/app/api/cron/ai-quality-monitor/route.ts']).toEqual({
        maxDuration: 60,
      });
      expect(vercelJson.functions['src/app/api/cron/consistency-check/route.ts']).toEqual({
        maxDuration: 60,
      });
      expect(vercelJson.functions['src/app/api/cron/subscription-expiry/route.ts']).toEqual({
        maxDuration: 60,
      });

      const cronMap = new Map(vercelJson.crons.map((c) => [c.path, c.schedule]));
      expect(cronMap.get('/api/cron/morning-briefing')).toBe('0 23 * * *');
      expect(cronMap.get('/api/cron/ai-quality-monitor')).toBe('30 */6 * * *');
      expect(cronMap.get('/api/cron/consistency-check')).toBe('15 19 * * *');
      expect(cronMap.get('/api/cron/subscription-expiry')).toBe('5 15 * * *');
    });

    it('enforces strict npm ci, Lint Check step, and SHARE_LINK_SECRET in .github/workflows/ci.yml', () => {
      const ciYaml = fs.readFileSync(
        path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml'),
        'utf8',
      );

      expect(ciYaml).not.toContain('npm install');
      expect(ciYaml.match(/run:\s*npm ci\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(ciYaml).toContain('- name: Lint Check');
      expect(ciYaml).toMatch(/eslint|npm run lint/);

      const shareLinkMatches = ciYaml.match(/SHARE_LINK_SECRET:\s*"[^"]{32,}"/g) ?? [];
      expect(shareLinkMatches.length).toBeGreaterThanOrEqual(3);
    });
  });
});
