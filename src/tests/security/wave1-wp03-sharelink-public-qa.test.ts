/**
 * Wave 1 — WP-03 Security Regression Suite:
 * 1. SHARE_LINK_SECRET enforcement, key-separation (no SUPABASE_SERVICE_ROLE_KEY fallback), & durable revocation
 * 2. Public IM / Translate / TTS guards (language allowlist, published-only, revocation 403/410, blind coordinate coarsening, Fallback #3 status filter)
 * 3. QA Workbench PII/screenshot/offendingAddresses sanitization & real-production write auth
 * 4. next.config.ts production CORS, api-error sanitization, morning-briefing DB-only public GET, & building-radar rate limit
 */
import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireBroker = vi.fn();
const mockGetServerViewer = vi.fn();
const mockTranslateIMSections = vi.fn();
const mockSearchNaverNews = vi.fn();
const mockCallLLM = vi.fn();
const mockGenerateBuildingRadar = vi.fn();
const mockCreateServiceClient = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: (...args: unknown[]) => mockGetServerViewer(...args),
}));

vi.mock('@/domain/building/mobile-im/translator', () => ({
  translateIMSections: (...args: unknown[]) => mockTranslateIMSections(...args),
}));

vi.mock('@/lib/external/naver-search', () => ({
  searchNaverNews: (...args: unknown[]) => mockSearchNaverNews(...args),
}));

vi.mock('@/ai/llm-client', () => ({
  callLLM: (...args: unknown[]) => mockCallLLM(...args),
}));

vi.mock('@/domain/building/building-radar', () => ({
  generateBuildingRadar: (...args: unknown[]) => mockGenerateBuildingRadar(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => mockCreateServiceClient(...args),
}));

import { isRealProductionRuntime } from '@/lib/env';
import {
  issueShareLinkToken,
  verifyShareLinkToken,
  revokeShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from '@/lib/security/share-link-tokens';
import { BaseApiError, safeErrorMessage, toApiError } from '@/lib/api-error';
import nextConfig from '../../../next.config';
import { POST as postTranslate } from '@/app/api/public/im-lite/[buildingId]/translate/route';
import { GET as getTts } from '@/app/api/public/im-lite/[buildingId]/tts/route';
import { GET as getPublicImLite } from '@/app/api/public/im-lite/[buildingId]/route';
import { GET as getQaWorkbench, POST as postQaWorkbench } from '@/app/api/public/qa-workbench/route';
import { GET as getMorningBriefing } from '@/app/api/pulse/morning-briefing/route';
import { POST as postBuildingRadar } from '@/app/api/public/building-radar/generate/route';

function makeChain(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (onFulfilled: any, onRejected?: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

describe('Wave 1 — WP-03 Security Regression Suite', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetShareLinkTokenStoreForTests();
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
    mockRequireBroker.mockResolvedValue({ user: null, error: new Response('unauth', { status: 401 }) });
    mockGetServerViewer.mockResolvedValue(null);

    mockCreateServiceClient.mockReturnValue({
      from: vi.fn(() => makeChain({ data: null, error: null })),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(async () => ({ data: null, error: { message: 'not found' } })),
          upload: vi.fn(async () => ({ data: null, error: null })),
        })),
        createBucket: vi.fn(async () => ({ data: null, error: null })),
      },
    });
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SHARE_LINK_SECRET & Durable Revocation
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Share-Link Secret Separation & Production Enforcement', () => {
    it('refuses SUPABASE_SERVICE_ROLE_KEY as HMAC fallback and throws in real production without SHARE_LINK_SECRET', async () => {
      const fakeServiceRoleKey = 'service-role-secret-key-at-least-32-chars-long-9999';
      process.env.SUPABASE_SERVICE_ROLE_KEY = fakeServiceRoleKey;
      delete process.env.SHARE_LINK_SECRET;
      delete process.env.NEXTAUTH_SECRET;

      // Forge a token signed with SUPABASE_SERVICE_ROLE_KEY — must NEVER verify!
      const forgedPayloadB64 = Buffer.from(
        JSON.stringify({
          b: 'bld-sec-01',
          u: 'broker-1',
          r: 'client-1',
          exp: Date.now() + 86_400_000,
          n: 'deadbeef1234',
        }),
        'utf-8'
      ).toString('base64url');
      const forgedSig = crypto
        .createHmac('sha256', fakeServiceRoleKey)
        .update(forgedPayloadB64)
        .digest('base64url');
      const forgedToken = `slk.${forgedPayloadB64}.${forgedSig}`;

      const checkForged = await verifyShareLinkToken({
        token: forgedToken,
        buildingId: 'bld-sec-01',
      });
      expect(checkForged.valid).toBe(false);
      expect(checkForged.reason).toBe('invalid');

      // Switch to real production runtime WITHOUT SHARE_LINK_SECRET -> must throw fatal error
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CI;
      delete process.env.NEXT_PHASE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-instance.supabase.co';

      expect(isRealProductionRuntime()).toBe(true);
      await expect(
        issueShareLinkToken({ buildingId: 'bld-sec-01', brokerId: 'broker-1' })
      ).rejects.toThrow(/SHARE_LINK_SECRET/);
      await expect(
        verifyShareLinkToken({ token: forgedToken, buildingId: 'bld-sec-01' })
      ).rejects.toThrow(/SHARE_LINK_SECRET/);

      // Configure valid >= 32-char SHARE_LINK_SECRET -> succeeds in real production
      process.env.SHARE_LINK_SECRET = 'prod-share-link-hmac-secret-minimum-32-characters!!';
      const issued = await issueShareLinkToken({
        buildingId: 'bld-sec-01',
        brokerId: 'broker-1',
      });
      const verified = await verifyShareLinkToken({
        token: issued.token,
        buildingId: 'bld-sec-01',
      });
      expect(verified.valid).toBe(true);
    });

    it('returns 500 when both im_share_links and activity_events persistence fail in real production', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CI;
      delete process.env.NEXT_PHASE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-instance.supabase.co';
      process.env.SHARE_LINK_SECRET = 'prod-share-link-hmac-secret-minimum-32-characters!!';

      const issued = await issueShareLinkToken({
        buildingId: '11111111-1111-4111-8111-111111111111',
        brokerId: '22222222-2222-4222-8222-222222222222',
      });

      // Simulate total DB write failure on both im_share_links and activity_events
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn(() =>
          makeChain({
            data: null,
            error: { code: '57P01', message: 'terminating connection due to administrator command' },
          })
        ),
      });

      const revokeRes = await revokeShareLinkToken({
        token: issued.token,
        buildingId: '11111111-1111-4111-8111-111111111111',
        brokerId: '22222222-2222-4222-8222-222222222222',
        reason: 'deal_closed',
      });

      expect(revokeRes.ok).toBe(false);
      expect(revokeRes.revoked).toBe(false);
      expect(revokeRes.status).toBe(500);
      expect(revokeRes.error).toBe('링크 잠금 상태를 서버에 저장하지 못했습니다.');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Public IM / Translate / TTS Security
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Public IM / Translate / TTS Guards', () => {
    it('/translate rejects invalid language (400), draft documents (404), and revoked links (403/410)', async () => {
      const buildingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
      const docId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

      // 2a. Invalid language -> 400
      const badLangRes = await postTranslate(
        new NextRequest(`http://localhost:3000/api/public/im-lite/${buildingId}/translate`, {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.10' },
          body: JSON.stringify({ language: 'fr', doc_id: docId }),
        }),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(badLangRes.status).toBe(400);

      // 2b. Draft document -> 404 (never invokes LLM translator)
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'document_objects') {
            return makeChain({
              data: {
                id: docId,
                building_id: buildingId,
                status: 'draft',
                metadata: {},
                body: { sections: [{ title: '개요', markdown: '비공개 초안' }] },
              },
              error: null,
            });
          }
          return makeChain({ data: [], error: null });
        }),
      });

      const draftRes = await postTranslate(
        new NextRequest(`http://localhost:3000/api/public/im-lite/${buildingId}/translate`, {
          method: 'POST',
          headers: { 'x-forwarded-for': '203.0.113.11' },
          body: JSON.stringify({ language: 'en', doc_id: docId }),
        }),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(draftRes.status).toBe(404);
      expect(mockTranslateIMSections).not.toHaveBeenCalled();

      // 2c. Revoked share-link -> 403/410
      const issued = await issueShareLinkToken({ buildingId, brokerId: 'broker-owner-1' });
      await revokeShareLinkToken({ token: issued.token, buildingId, brokerId: 'broker-owner-1' });

      const revokedRes = await postTranslate(
        new NextRequest(
          `http://localhost:3000/api/public/im-lite/${buildingId}/translate?token=${encodeURIComponent(issued.token)}`,
          {
            method: 'POST',
            headers: { 'x-forwarded-for': '203.0.113.12' },
            body: JSON.stringify({ language: 'en', doc_id: docId }),
          }
        ),
        { params: Promise.resolve({ buildingId }) }
      );
      expect([403, 410]).toContain(revokedRes.status);
    });

    it('/tts rejects invalid language (400) before cache lookup, draft documents (404), and revoked links (403/410)', async () => {
      const buildingId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
      const storageDownloadSpy = vi.fn(async () => ({ data: null, error: null }));

      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'document_objects') {
            return makeChain({
              data: {
                building_id: buildingId,
                status: 'draft',
                document_type: 'im_lite_draft',
                body: { sections: [{ title: '개요', content: '초안 본문' }] },
              },
              error: null,
            });
          }
          return makeChain({ data: [], error: null });
        }),
        storage: {
          from: vi.fn(() => ({ download: storageDownloadSpy })),
        },
      });

      // 2a. Invalid ?language= -> 400 before storage cache download
      const badLangRes = await getTts(
        new NextRequest(
          `http://localhost:3000/api/public/im-lite/${buildingId}/tts?language=es_cache_bypass`,
          { headers: { 'x-forwarded-for': '198.51.100.21' } }
        ),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(badLangRes.status).toBe(400);
      expect(storageDownloadSpy).not.toHaveBeenCalled();

      // 2b. Draft document (status: 'draft') -> 404
      const draftRes = await getTts(
        new NextRequest(
          `http://localhost:3000/api/public/im-lite/${buildingId}/tts?language=ko`,
          { headers: { 'x-forwarded-for': '198.51.100.22' } }
        ),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(draftRes.status).toBe(404);

      // 2c. Revoked token -> 403/410
      const issued = await issueShareLinkToken({ buildingId, brokerId: 'broker-tts-1' });
      await revokeShareLinkToken({ token: issued.token, buildingId, brokerId: 'broker-tts-1' });

      const revokedRes = await getTts(
        new NextRequest(
          `http://localhost:3000/api/public/im-lite/${buildingId}/tts?language=ko&token=${encodeURIComponent(issued.token)}`,
          { headers: { 'x-forwarded-for': '198.51.100.23' } }
        ),
        { params: Promise.resolve({ buildingId }) }
      );
      expect([403, 410]).toContain(revokedRes.status);
    });

    it('GET /api/public/im-lite/[buildingId] coarsens blind teaser coordinates (~500m grid) and excludes draft/archived in Fallback #3', async () => {
      const buildingId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
      const exactCoords = { lat: 37.534219, lng: 126.902284 };

      // Blind teaser via public_signal_ready building_ssot_lite -> coarsened coordinates
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'building_ssot_lite') {
            return makeChain({
              data: {
                id: buildingId,
                owner_id: 'owner-blind-1',
                status: 'public_signal_ready',
                completeness_score: 85,
                area_signal: '영등포구 당산동 일대',
                asset_type: '근린생활시설',
                price_band: '100~120억',
                size_signal: '연면적 435평',
                disclosure: { guard_checked: true },
                layers: { coordinates: exactCoords },
              },
              error: null,
            });
          }
          return makeChain({ data: null, error: null });
        }),
      });

      const unauthBlindRes = await getPublicImLite(
        new NextRequest(`http://localhost:3000/api/public/im-lite/${buildingId}`),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(unauthBlindRes.status).toBe(403);

      const issuedBlindToken = await issueShareLinkToken({
        buildingId,
        brokerId: 'owner-blind-1',
      });
      const blindRes = await getPublicImLite(
        new NextRequest(
          `http://localhost:3000/api/public/im-lite/${buildingId}?token=${encodeURIComponent(issuedBlindToken.token)}`
        ),
        { params: Promise.resolve({ buildingId }) }
      );
      expect(blindRes.status).toBe(200);
      const blindJson = await blindRes.json();
      expect(blindJson.data.coordinates).toEqual({
        lat: Math.round(exactCoords.lat * 200) / 200,
        lng: Math.round(exactCoords.lng * 200) / 200,
      });
      expect(blindJson.data.coordinates.lat).not.toBe(exactCoords.lat);

      // Fallback #3 with draft status and no published document_objects -> 404
      for (const blockedStatus of ['draft', 'archived']) {
        mockCreateServiceClient.mockReturnValue({
          from: vi.fn((table: string) => {
            if (table === 'building_ssot_lite') {
              return makeChain({
                data: {
                  id: buildingId,
                  owner_id: 'owner-blind-1',
                  status: blockedStatus,
                  completeness_score: 90,
                  area_signal: '영등포구 당산동 일대',
                  asset_type: '근린생활시설',
                  price_band: '100~120억',
                  size_signal: '연면적 435평',
                },
                error: null,
              });
            }
            return makeChain({ data: null, error: null });
          }),
        });

        const blockedRes = await getPublicImLite(
          new NextRequest(`http://localhost:3000/api/public/im-lite/${buildingId}`),
          { params: Promise.resolve({ buildingId }) }
        );
        expect(blockedRes.status).toBe(404);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. QA Workbench Sanitization & Production Write Auth
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. QA Workbench PII, Screenshot & Probe Address Leak Sanitization', () => {
    it('strips authorEmail, screenshotDataUrl, offendingAddresses/offendingTexts, and subscriberCheck details for unauthenticated callers', async () => {
      // Seed a pin created by an authenticated broker with email + screenshot
      globalThis.__CRE_QA_WORKBENCH_PINS__ = [
        {
          id: 'pin-secret-1',
          sessionId: 'session-abc-123',
          workspace: 'dealcards',
          routePath: '/broker/w/dealcards',
          targetSelector: 'viewport',
          targetLabel: '화면 전체',
          note: '버튼 간격 조정 필요',
          severity: 'major',
          viewport: { width: 390, height: 844 },
          fontScale: 'default',
          createdAt: new Date().toISOString(),
          authorEmail: 'broker-private@credeal.net',
          screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
        },
      ];

      // 3a. Unauthenticated GET ?mode=pins -> redacts authorEmail & screenshotDataUrl
      const unauthPinsRes = await getQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench?mode=pins')
      );
      expect(unauthPinsRes.status).toBe(200);
      const unauthPinsJson = await unauthPinsRes.json();
      expect(unauthPinsJson.pins[0].authorEmail).toBeNull();
      expect(unauthPinsJson.pins[0].screenshotDataUrl).toBeNull();
      expect(unauthPinsJson.pins[0].note).toBe('버튼 간격 조정 필요');

      // 3b. Unauthenticated POST mode=probe -> never leaks raw offendingAddresses/offendingTexts or subscriber status
      const editionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
      const dcId = 'ffffffff-ffff-4fff-8fff-fffffffffff1';
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'magazine_editions') {
            return makeChain({
              data: [
                {
                  id: editionId,
                  broker_id: 'owner-broker-99',
                  status: 'published',
                  title: '위클리 리포트',
                  content: {
                    featured_deals: [
                      {
                        id: 'd1',
                        title: '비공개 매물',
                        address: '서울 강남구 역삼동 823-14',
                        areaSignal: '서울 강남구 테헤란로 152',
                      },
                    ],
                  },
                },
              ],
              error: null,
            });
          }
          if (table === 'building_ssot_lite') {
            return makeChain({
              data: {
                id: dcId,
                owner_id: 'owner-broker-99',
                area_signal: '서울 서초구 서초동 1321-7',
                asset_type: '오피스',
              },
              error: null,
            });
          }
          return makeChain({ data: null, error: null });
        }),
      });

      const probeRes = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'probe',
            newsletterPublicUrl: `https://credeal.net/m/demo/2026-11-15?edition=${editionId}`,
            dealCardUrl: `https://credeal.net/dc/${dcId}`,
            testClientContact: '010-9999-8888',
          }),
        })
      );
      expect(probeRes.status).toBe(200);
      const probeJson = await probeRes.json();
      const rawBodyStr = JSON.stringify(probeJson);

      expect(probeJson.newsletterCheck.addressBlindPass).toBe(false);
      expect(probeJson.newsletterCheck.offendingCount).toBeGreaterThan(0);
      expect(probeJson.newsletterCheck.offendingAddresses).toBeUndefined();

      expect(probeJson.dealCardCheck.addressBlindPass).toBe(false);
      expect(probeJson.dealCardCheck.offendingCount).toBeGreaterThan(0);
      expect(probeJson.dealCardCheck.offendingTexts).toBeUndefined();

      expect(probeJson.subscriberCheck).toEqual({
        checked: false,
        reason: 'AUTH_REQUIRED',
      });

      // Confirm zero raw lot/road leak anywhere in serialized HTTP response
      expect(rawBodyStr).not.toContain('823-14');
      expect(rawBodyStr).not.toContain('1321-7');
      expect(rawBodyStr).not.toContain('테헤란로 152');

      // 3c. Real production blocks unauthenticated session sync/pin write unless x-qa-access-key matches
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      delete process.env.CI;
      delete process.env.NEXT_PHASE;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod-instance.supabase.co';
      process.env.QA_ACCESS_KEY = 'super-secret-qa-key-2026';

      const blockedSync = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          headers: { 'x-forwarded-for': '198.51.100.77' },
          body: JSON.stringify({ mode: 'sync', sessionId: 'prod-session-1', records: {} }),
        })
      );
      expect(blockedSync.status).toBe(401);

      const allowedSync = await postQaWorkbench(
        new NextRequest('http://localhost:3000/api/public/qa-workbench', {
          method: 'POST',
          headers: {
            'x-forwarded-for': '198.51.100.77',
            'x-qa-access-key': 'super-secret-qa-key-2026',
          },
          body: JSON.stringify({ mode: 'sync', sessionId: 'prod-session-1', records: {} }),
        })
      );
      expect(allowedSync.status).toBe(200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. next.config.ts CORS, api-error, morning-briefing & building-radar guards
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Production CORS, Error Sanitization & AI Cost Guards', () => {
    it('removes localhost from next.config.ts CORS Origin allowlist in production', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const prodRules = await nextConfig.headers!();
      const prodOriginRule = prodRules.find(
        (r) => Array.isArray(r.has) && r.has.some((h: any) => h.key === 'Origin')
      );
      const prodOriginRegex = (prodOriginRule?.has?.[0] as any)?.value ?? '';
      expect(prodOriginRegex).not.toContain('localhost');
      expect(prodOriginRegex).toContain('credeal\\.net');

      (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
      const devRules = await nextConfig.headers!();
      const devOriginRule = devRules.find(
        (r) => Array.isArray(r.has) && r.has.some((h: any) => h.key === 'Origin')
      );
      const devOriginRegex = (devOriginRule?.has?.[0] as any)?.value ?? '';
      expect(devOriginRegex).toContain('localhost');
    });

    it('sanitizes SQL, PostgREST, and OpenAI SDK internals in toApiError and safeErrorMessage', async () => {
      (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
      const sqlErr = new Error('PGRST200: SELECT * FROM secret_table WHERE openai_key = sk-1234567890abcdef1234');
      expect(safeErrorMessage(sqlErr)).toBe('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');

      const res = toApiError(sqlErr);
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('PGRST200');
      expect(JSON.stringify(json)).not.toContain('secret_table');
      expect(JSON.stringify(json)).not.toContain('sk-1234567890');

      const baseLeak = new BaseApiError('INTERNAL_ERROR', 'relation "im_share_links" does not exist', 500);
      const res2 = toApiError(baseLeak);
      const json2 = await res2.json();
      expect(JSON.stringify(json2)).not.toContain('im_share_links');
    });

    it('serves DB-only morning-briefing on unauthenticated GET without triggering Naver crawler or callLLM', async () => {
      mockCreateServiceClient.mockReturnValue({
        from: vi.fn((table: string) => {
          if (table === 'external_news') {
            return makeChain({
              data: [{ title: '강남 오피스 공실률 하락', summary: '임차 수요 견조', source: '경제신문' }],
              error: null,
            });
          }
          if (table === 'market_sentiment_polls') {
            return makeChain({
              data: [{ score: 62, sentiment: 'bullish' }],
              error: null,
            });
          }
          return makeChain({ data: null, error: null });
        }),
      });

      const res = await getMorningBriefing(
        new NextRequest('http://localhost:3000/api/pulse/morning-briefing?region=gbd', {
          headers: { 'x-forwarded-for': '203.0.113.88' },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.briefing).toContain('강남 오피스 공실률 하락');
      expect(mockSearchNaverNews).not.toHaveBeenCalled();
      expect(mockCallLLM).not.toHaveBeenCalled();
    });

    it('enforces 5 req/hr IP rate limiting on POST /api/public/building-radar/generate', async () => {
      mockGenerateBuildingRadar.mockResolvedValue({
        buildingId: '11111111-1111-4111-8111-111111111111',
        reportId: '22222222-2222-4222-8222-222222222222',
        status: 'completed',
      });

      const testIp = '203.0.113.199';
      for (let i = 0; i < 5; i++) {
        const okRes = await postBuildingRadar(
          new Request('http://localhost:3000/api/public/building-radar/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-forwarded-for': `${testIp}, 10.0.0.1`,
            },
            body: JSON.stringify({
              input: '서울특별시 강남구 테헤란로 152',
              inputType: 'address',
              userPurpose: 'buy_consideration',
            }),
          })
        );
        expect(okRes.status).toBe(200);
      }

      const rateLimitedRes = await postBuildingRadar(
        new Request('http://localhost:3000/api/public/building-radar/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': `${testIp}, 10.0.0.2`,
          },
          body: JSON.stringify({
            input: '서울특별시 강남구 테헤란로 152',
            inputType: 'address',
            userPurpose: 'buy_consideration',
          }),
        })
      );
      expect(rateLimitedRes.status).toBe(429);
    });
  });
});
