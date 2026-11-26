/**
 * @file src/tests/unit/wave5a-request-tracing-error-stack-and-health.test.ts
 * @description Wave 5 Track 5A Verification Suite:
 *   1. Isomorphic-safe `AsyncLocalStorage` request correlation (`request-context.ts` + `logger.ts`),
 *      `createApiHandler` `X-Request-Id` header & 500 raw error masking, `/api/pulse/generate` 500 masking,
 *      and `src/instrumentation.ts` startup/error hooks.
 *   2. `reportClientOrServerError` PII-scrubbed `errorStack` + `requestId` preservation,
 *      `system_error_logs` DB persistence + `activity_events` `PGRST205` fallback, and PGlite RLS verification.
 *   3. `/api/health` 200 healthy / 503 degraded (error & 4000ms timeout), `X-Request-Id` + `Cache-Control: no-store`,
 *      and zero secret variable name leakage.
 *   4. `assertProductionSecretsReady()` & `isAiProviderConfigured()` production enforcement + structured AI logging.
 */

import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  verifyCronRequest: vi.fn(),
  generateAllWeeklyPulses: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => hoisted.createServiceClient(...args),
  createTypedServiceClient: (...args: unknown[]) => hoisted.createServiceClient(...args),
}));

vi.mock('@/lib/security/cron-auth', () => ({
  verifyCronRequest: (...args: unknown[]) => hoisted.verifyCronRequest(...args),
}));

vi.mock('@/domain/pulse/pulse-generator', () => ({
  generateAllWeeklyPulses: (...args: unknown[]) => hoisted.generateAllWeeklyPulses(...args),
}));

import { createModuleLogger, logger } from '@/lib/logger';
import {
  getRequestContext,
  getRequestId,
  resolveRequestIdFromHeaders,
  runWithRequestContext,
  setRequestContextUser,
} from '@/lib/observability/request-context';
import { createApiHandler } from '@/lib/api-handler';
import {
  buildSystemErrorActivityRow,
  buildSystemErrorLogRow,
  reportClientOrServerError,
} from '@/lib/observability/error-reporter';
import {
  assertProductionSecretsReady,
  getProductionReadinessWarnings,
  isAiProviderConfigured,
} from '@/lib/env';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getPulse, POST as postPulse } from '@/app/api/pulse/generate/route';
import { OpenAIProvider } from '@/ai/providers/openai';
import { register, onRequestError } from '@/instrumentation';

const REPO_ROOT = process.cwd();

function capturePinoJsonRecords(): { records: Array<Record<string, unknown>>; restore: () => void } {
  const records: Array<Record<string, unknown>> = [];
  const stream = (logger as unknown as Record<symbol, { write: (chunk: string) => boolean }>)[
    pino.symbols.streamSym
  ];
  const spy = vi.spyOn(stream, 'write').mockImplementation((chunk: string) => {
    for (const line of String(chunk).split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed) as Record<string, unknown>);
      } catch {
        // Ignore non-JSON lines
      }
    }
    return true;
  });
  return {
    records,
    restore: () => spy.mockRestore(),
  };
}

describe('Wave 5A — Request Correlation Tracing, Error Stack Preservation & Deep Health Readiness', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  describe('1. Isomorphic Request Context, Pino Correlation & Raw 500 Leak Masking', () => {
    it('keeps src/lib/logger.ts free of node:async_hooks for client-bundle safety and resolves/sanitizes request IDs', () => {
      const loggerSrc = fs.readFileSync(path.join(REPO_ROOT, 'src/lib/logger.ts'), 'utf8');
      expect(loggerSrc).not.toContain('async_hooks');
      expect(loggerSrc).not.toContain('AsyncLocalStorage');
      expect(loggerSrc).not.toContain('node:crypto');

      // Valid x-request-id preserved
      const h1 = new Headers({ 'x-request-id': 'req-alpha-12345678' });
      expect(resolveRequestIdFromHeaders(h1)).toBe('req-alpha-12345678');

      // Vercel x-vercel-id region prefix stripped safely
      const h2 = new Headers({ 'x-vercel-id': 'icn1::iad1::9f8e7d6c-1700000000-abcdef123456' });
      expect(resolveRequestIdFromHeaders(h2)).toBe('9f8e7d6c-1700000000-abcdef123456');

      // Invalid / header-injection / too-short request IDs rejected in favor of UUID
      const h3 = { get: (k: string) => (k === 'x-request-id' ? 'bad id\r\nSet-Cookie: evil=1' : null) };
      expect(resolveRequestIdFromHeaders(h3)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const h4 = new Headers({ 'x-request-id': 'short' });
      expect(resolveRequestIdFromHeaders(h4)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('propagates requestId, route, and userId across await boundaries into Pino JSON output without overwriting explicit caller keys', async () => {
      const { records, restore } = capturePinoJsonRecords();
      const modLog = createModuleLogger('wave5a-trace-test');

      try {
        await Promise.all([
          runWithRequestContext(
            { requestId: 'trace-req-first-0001', route: '/api/broker/deal-card' },
            async () => {
              await new Promise((r) => setTimeout(r, 10));
              setRequestContextUser('broker-user-01');
              expect(getRequestId()).toBe('trace-req-first-0001');
              expect(getRequestContext()?.userId).toBe('broker-user-01');
              modLog.info('step after await', { step: 1, email: 'secret@credeal.net' });
              modLog.info({ requestId: 'explicit-caller-override-9999' }, 'caller override check');
            },
          ),
          runWithRequestContext(
            { requestId: 'trace-req-second-0002', route: '/api/broker/match' },
            async () => {
              await new Promise((r) => setTimeout(r, 5));
              expect(getRequestId()).toBe('trace-req-second-0002');
              modLog.warn('parallel request isolated');
            },
          ),
        ]);
      } finally {
        restore();
      }

      const firstEntry = records.find((r) => r.msg === 'step after await');
      expect(firstEntry).toBeDefined();
      expect(firstEntry?.requestId).toBe('trace-req-first-0001');
      expect(firstEntry?.route).toBe('/api/broker/deal-card');
      expect(firstEntry?.userId).toBe('broker-user-01');
      expect(firstEntry?.email).toBe('[REDACTED]');

      const overrideEntry = records.find((r) => r.msg === 'caller override check');
      expect(overrideEntry?.requestId).toBe('explicit-caller-override-9999');

      const secondEntry = records.find((r) => r.msg === 'parallel request isolated');
      expect(secondEntry?.requestId).toBe('trace-req-second-0002');
      expect(secondEntry?.route).toBe('/api/broker/match');
      expect(secondEntry?.userId).toBeUndefined();
    });

    it('attaches X-Request-Id in createApiHandler and masks raw 500 err.message (plus /api/pulse/generate 500 leaks)', async () => {
      const schema = z.object({ name: z.string().min(1) });
      const { records, restore } = capturePinoJsonRecords();

      try {
        const failingHandler = createApiHandler(schema, async () => {
          await Promise.resolve();
          throw new Error('FATAL postgres://service_role:super_secret_pw@db.internal:5432/credeal');
        });

        const req = new NextRequest('http://localhost:3000/api/test-500', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'incoming-trace-500-abcd',
          },
          body: JSON.stringify({ name: '강남빌딩' }),
        });

        const res = await failingHandler(req);
        expect(res.status).toBe(500);
        expect(res.headers.get('X-Request-Id')).toBe('incoming-trace-500-abcd');

        const rawText = await res.text();
        const body = JSON.parse(rawText) as Record<string, unknown>;
        expect(body).toEqual({
          error: '서버 내부 오류가 발생했습니다.',
          code: 'INTERNAL_SERVER_ERROR',
          requestId: 'incoming-trace-500-abcd',
        });
        expect(rawText).not.toContain('super_secret_pw');
        expect(rawText).not.toContain('postgres://');

        const apiLog = records.find((r) => r.module === 'api-handler' && r.msg === 'Unhandled API error');
        expect(apiLog?.requestId).toBe('incoming-trace-500-abcd');

        // Verify /api/pulse/generate masks raw DB errors across POST and GET
        hoisted.verifyCronRequest.mockReturnValue(null);
        hoisted.generateAllWeeklyPulses.mockRejectedValueOnce(
          new Error('pulse internal sql leak: relation secret_table failed'),
        );
        const pulsePostRes = await postPulse(
          new NextRequest('http://localhost:3000/api/pulse/generate', { method: 'POST' }),
        );
        expect(pulsePostRes.status).toBe(500);
        const pulsePostBody = await pulsePostRes.json();
        expect(pulsePostBody).toEqual({ error: '펄스 처리 중 오류가 발생했습니다.' });

        hoisted.verifyCronRequest.mockReturnValue(new Response('unauth', { status: 401 }));
        hoisted.createServiceClient.mockReturnValue({
          from: () => {
            const result = {
              data: null,
              error: { message: 'postgrest raw internal column failure' },
            };
            const chain: Record<string, unknown> = {};
            chain.select = () => chain;
            chain.eq = () => chain;
            chain.order = () => chain;
            chain.limit = () => chain;
            chain.then = (resolve: (v: typeof result) => unknown) =>
              Promise.resolve(result).then(resolve);
            return chain;
          },
        });
        const pulseGetRes = await getPulse(
          new NextRequest('http://localhost:3000/api/pulse/generate?region=gbd'),
        );
        expect(pulseGetRes.status).toBe(500);
        const pulseGetBody = await pulseGetRes.json();
        expect(pulseGetBody).toEqual({ error: '펄스 처리 중 오류가 발생했습니다.' });
      } finally {
        restore();
      }
    });
  });

  describe('2. system_error_logs Migration, Stack Trace PII Scrubbing & PGRST205 Fallback', () => {
    it('preserves PII-scrubbed errorStack + requestId in structured log and inserts into system_error_logs without leaking stack to Slack webhook', async () => {
      process.env.ERROR_WEBHOOK_URL = 'https://hooks.slack.com/services/T000/B000/TEST';
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const insertedRows: Array<{ table: string; payload: Record<string, unknown> }> = [];
      hoisted.createServiceClient.mockReturnValue({
        from: (table: string) => ({
          insert: async (payload: Record<string, unknown>) => {
            insertedRows.push({ table, payload });
            return { data: { id: 'err-row-1' }, error: null };
          },
        }),
      });

      const err = new Error('Lease sync failed for broker@credeal.net / 010-1234-5678');
      err.stack = `Error: Lease sync failed for broker@credeal.net / 010-1234-5678\n    at syncLease (src/domain/lease.ts:42:11)\n    at contact (010-9876-5432)`;

      const refCode = await runWithRequestContext(
        { requestId: 'req-err-stack-778899', route: '/api/broker/lease' },
        () =>
          reportClientOrServerError(err, {
            boundary: 'broker-lease-route',
            url: 'https://credeal.net/api/broker/lease?secret=tok123',
          }),
      );

      expect(refCode).toMatch(/^ERR-[0-9A-F]{4}$/);

      // 1) Server structured log contains requestId + PII-scrubbed errorStack
      const parsedConsole = JSON.parse(String(consoleSpy.mock.calls[0]?.[0] ?? '{}')) as Record<
        string,
        unknown
      >;
      expect(parsedConsole.requestId).toBe('req-err-stack-778899');
      expect(typeof parsedConsole.errorStack).toBe('string');
      expect(String(parsedConsole.errorStack)).toContain('at syncLease');
      expect(String(parsedConsole.errorStack)).toContain('[REDACTED_EMAIL]');
      expect(String(parsedConsole.errorStack)).toContain('[REDACTED_PHONE]');
      expect(String(parsedConsole.errorStack)).not.toContain('broker@credeal.net');
      expect(String(parsedConsole.errorStack)).not.toContain('010-1234-5678');
      expect(String(parsedConsole.errorStack)).not.toContain('010-9876-5432');

      // 2) Slack webhook payload NEVER contains errorStack
      const webhookPayload = JSON.parse(
        String(fetchSpy.mock.calls[0]?.[1]?.body ?? '{}'),
      ) as Record<string, unknown>;
      expect(webhookPayload.refCode).toBe(refCode);
      expect(webhookPayload.requestId).toBe('req-err-stack-778899');
      expect('errorStack' in webhookPayload).toBe(false);
      expect('error_stack' in webhookPayload).toBe(false);

      // 3) DB insert targets system_error_logs with full scrubbed stack & request_id
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0]?.table).toBe('system_error_logs');
      expect(insertedRows[0]?.payload).toMatchObject({
        ref_code: refCode,
        request_id: 'req-err-stack-778899',
        boundary: 'broker-lease-route',
        url: 'https://credeal.net/api/broker/lease',
        error_name: 'Error',
      });
      expect(String(insertedRows[0]?.payload.error_stack)).toContain('at syncLease');
      expect(String(insertedRows[0]?.payload.error_stack)).not.toContain('broker@credeal.net');
    });

    it('falls back gracefully to activity_events when system_error_logs returns PGRST205 and verifies instrumentation hooks', async () => {
      delete process.env.ERROR_WEBHOOK_URL;
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const insertedRows: Array<{ table: string; payload: Record<string, unknown> }> = [];
      hoisted.createServiceClient.mockReturnValue({
        from: (table: string) => ({
          insert: async (payload: Record<string, unknown>) => {
            insertedRows.push({ table, payload });
            if (table === 'system_error_logs') {
              return {
                data: null,
                error: { code: 'PGRST205', message: 'Could not find table public.system_error_logs' },
              };
            }
            return { data: { id: 'act-1' }, error: null };
          },
        }),
      });

      const ref = await reportClientOrServerError(new Error('Unmigrated env failure'), {
        boundary: 'rsc-boundary',
        url: '/broker/w/im',
      });

      expect(insertedRows.map((r) => r.table)).toEqual(['system_error_logs', 'activity_events']);
      expect(insertedRows[1]?.payload).toEqual(
        buildSystemErrorActivityRow({
          refCode: ref,
          boundary: 'rsc-boundary',
          digest: null,
          url: '/broker/w/im',
          errorName: 'Error',
        }),
      );

      // Verify buildSystemErrorLogRow caps stack <= 4000 chars
      const hugeRow = buildSystemErrorLogRow({
        refCode: 'ERR-AAAA',
        requestId: 'req-long-stack-0001',
        boundary: 'test',
        digest: null,
        url: '/x',
        errorName: 'Error',
        errorMessage: 'msg',
        errorStack: 'x'.repeat(6000),
      });
      expect(hugeRow.error_stack?.length).toBe(4000);

      // Verify instrumentation register() + onRequestError() (ignoring NEXT_REDIRECT, reporting real errors)
      process.env.NEXT_RUNTIME = 'nodejs';
      await register();
      insertedRows.length = 0;

      const redirectErr = Object.assign(new Error('NEXT_REDIRECT'), {
        digest: 'NEXT_REDIRECT;replace;/login;307;',
      });
      await onRequestError(
        redirectErr,
        { path: '/admin', method: 'GET', headers: {} },
        {
          routerKind: 'App Router',
          routePath: '/(admin)/admin/page',
          routeType: 'render',
          renderSource: 'react-server-components',
          revalidateReason: undefined,
        },
      );
      expect(insertedRows).toHaveLength(0);

      const realRscErr = Object.assign(new Error('RSC crash'), { digest: 'rsc999' });
      await onRequestError(
        realRscErr,
        {
          path: '/broker/w/dealcards?token=secret',
          method: 'GET',
          headers: { 'x-request-id': 'instr-req-id-998877' },
        },
        {
          routerKind: 'App Router',
          routePath: '/(broker)/broker/w/dealcards/page',
          routeType: 'render',
          renderSource: 'react-server-components',
          revalidateReason: undefined,
        },
      );
      expect(insertedRows[0]?.table).toBe('system_error_logs');
      expect(insertedRows[0]?.payload.request_id).toBe('instr-req-id-998877');
      expect(insertedRows[0]?.payload.url).toBe('/broker/w/dealcards');
    });

    it('applies 20261126000005_sota_system_error_logs.sql idempotently on PGlite with RLS enabled and service_role policy', async () => {
      const sql = fs.readFileSync(
        path.join(
          REPO_ROOT,
          'supabase/migrations/20261126000005_sota_system_error_logs.sql',
        ),
        'utf8',
      );
      const db = new PGlite();
      try {
        await db.exec(sql);
        await db.exec(sql); // Idempotent second execution

        const rlsRes = await db.query<{ relrowsecurity: boolean }>(
          `SELECT c.relrowsecurity
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'system_error_logs'`,
        );
        expect(rlsRes.rows[0]?.relrowsecurity).toBe(true);

        const anonPriv = await db.query<{ can_select: boolean; can_insert: boolean }>(
          `SELECT has_table_privilege('anon', 'public.system_error_logs', 'SELECT') AS can_select,
                  has_table_privilege('anon', 'public.system_error_logs', 'INSERT') AS can_insert`,
        );
        expect(anonPriv.rows[0]).toEqual({ can_select: false, can_insert: false });
      } finally {
        await db.close();
      }
    });
  });

  describe('3. /api/health Deep Readiness, Timeout Bounding & Zero Secret Name Leakage', () => {
    const SECRET_ENV_NAMES = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'RESEND_API_KEY',
      'CRON_SECRET',
      'SHARE_LINK_SECRET',
      'UNSUBSCRIBE_SECRET',
      'VWORLD_API_KEY',
    ];

    it('returns 200 healthy normally, includes X-Request-Id + Cache-Control: no-store, and never leaks secret env names', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.CRON_SECRET;

      hoisted.createServiceClient.mockReturnValue({
        from: () => ({
          select: () => ({
            limit: async () => ({ data: [{ id: 'bld-1' }], error: null }),
          }),
        }),
      });

      const res = await getHealth(
        new NextRequest('http://localhost:3000/api/health', {
          headers: { 'x-request-id': 'health-probe-ok-1234' },
        }),
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Request-Id')).toBe('health-probe-ok-1234');

      const rawText = await res.text();
      const body = JSON.parse(rawText) as Record<string, unknown>;
      expect(body.status).toBe('healthy');
      expect(body.checks).toEqual({ database: 'ok', cache: 'ok' });
      expect(body.aiConfigured).toBe(false);
      expect(body.readinessWarningsCount).toBe(getProductionReadinessWarnings().length);
      expect(Number(body.readinessWarningsCount)).toBeGreaterThan(0);
      expect(body.requestId).toBe('health-probe-ok-1234');

      for (const secretName of SECRET_ENV_NAMES) {
        expect(rawText).not.toContain(secretName);
      }
    });

    it('returns 503 degraded when DB returns an error or hangs past 4000ms timeout', async () => {
      // 1) Immediate DB query error -> 503 degraded
      hoisted.createServiceClient.mockReturnValueOnce({
        from: () => ({
          select: () => ({
            limit: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }),
      });

      const errRes = await getHealth(new NextRequest('http://localhost:3000/api/health'));
      expect(errRes.status).toBe(503);
      expect(errRes.headers.get('Cache-Control')).toBe('no-store');
      expect(errRes.headers.get('X-Request-Id')).toBeTruthy();
      const errBody = await errRes.json();
      expect(errBody.status).toBe('degraded');
      expect(errBody.checks.database).toBe('error');

      // 2) Hung DB pool -> bounded at 4000ms -> 503 degraded
      vi.useFakeTimers();
      hoisted.createServiceClient.mockReturnValueOnce({
        from: () => ({
          select: () => ({
            limit: () => new Promise(() => undefined), // Never settles
          }),
        }),
      });

      const pendingHealth = getHealth(
        new NextRequest('http://localhost:3000/api/health', {
          headers: { 'x-vercel-id': 'icn1::hung-probe-99998888' },
        }),
      );
      await vi.advanceTimersByTimeAsync(4_000);
      const timeoutRes = await pendingHealth;

      expect(timeoutRes.status).toBe(503);
      expect(timeoutRes.headers.get('X-Request-Id')).toBe('hung-probe-99998888');
      const timeoutBody = await timeoutRes.json();
      expect(timeoutBody.status).toBe('degraded');
      expect(timeoutBody.checks.database).toBe('error');
    });
  });

  describe('4. assertProductionSecretsReady(), isAiProviderConfigured() & Structured AI Logging', () => {
    it('passes in test/dev and throws in simulated VERCEL_ENV=production when critical secrets are missing or mock', () => {
      // 1) Test/dev environment: passes even when secrets are unset
      (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
      delete process.env.VERCEL_ENV;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.CRON_SECRET;
      delete process.env.SHARE_LINK_SECRET;
      expect(() => assertProductionSecretsReady()).not.toThrow();

      // 2) Simulated VERCEL_ENV=production with missing/mock secrets -> throws
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      process.env.VERCEL_ENV = 'production';
      delete process.env.NEXT_PHASE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
      delete process.env.CRON_SECRET;
      delete process.env.SHARE_LINK_SECRET;

      expect(() => assertProductionSecretsReady()).toThrow(
        /NEXT_PUBLIC_SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY.*CRON_SECRET.*SHARE_LINK_SECRET/,
      );

      // 3) All 4 critical production secrets configured -> passes
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-project.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real_srv_role';
      process.env.CRON_SECRET = 'real-cron-secret-2026-credeal';
      process.env.SHARE_LINK_SECRET = 'real-share-link-secret-at-least-32-chars-2026';
      expect(() => assertProductionSecretsReady()).not.toThrow();

      // 4) isAiProviderConfigured check
      process.env.OPENAI_API_KEY = 'not-configured';
      delete process.env.GEMINI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      expect(isAiProviderConfigured()).toBe(false);

      process.env.OPENAI_API_KEY = 'sk-proj-real-configured-key';
      expect(isAiProviderConfigured()).toBe(true);
    });

    it('logs OpenAIProvider retries and errors through structured createModuleLogger with active requestId', async () => {
      const { records, restore } = capturePinoJsonRecords();
      let callCount = 0;
      const fakeOpenAiClient = {
        chat: {
          completions: {
            create: vi.fn(async () => {
              callCount += 1;
              if (callCount === 1) {
                return { choices: [{ message: { content: '' } }], usage: { total_tokens: 10 } };
              }
              return {
                choices: [{ message: { content: '{"ok":true}' } }],
                usage: { total_tokens: 25, prompt_tokens: 15, completion_tokens: 10 },
                model: 'gpt-6.1-terra',
              };
            }),
          },
        },
        embeddings: {
          create: vi.fn(async () => {
            throw new Error('Embedding quota error for vip@credeal.net');
          }),
        },
      };

      try {
        const provider = new OpenAIProvider(fakeOpenAiClient as never);
        await runWithRequestContext({ requestId: 'ai-req-trace-445566' }, async () => {
          const res = await provider.chat({
            systemPrompt: 'sys',
            userPrompt: 'usr',
            model: 'gpt-6.1-terra',
          });
          expect(res.content).toBe('{"ok":true}');

          await expect(provider.embed('sample text')).rejects.toThrow('Embedding quota error');
        });
      } finally {
        restore();
      }

      const retryWarn = records.find(
        (r) => r.module === 'ai-openai' && String(r.msg).includes('Empty response, retrying once'),
      );
      expect(retryWarn?.requestId).toBe('ai-req-trace-445566');

      const embedErr = records.find(
        (r) => r.module === 'ai-openai' && String(r.msg).includes('Embedding error'),
      );
      expect(embedErr?.requestId).toBe('ai-req-trace-445566');
      expect(JSON.stringify(embedErr)).not.toContain('vip@credeal.net');
    });
  });
});
