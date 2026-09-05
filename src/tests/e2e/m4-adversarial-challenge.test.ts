import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { NextRequest } from 'next/server';

// ── In-Memory Mock Database for Adversarial Testing ──
interface MockDb {
  im_pro_grants: Map<string, any>;
  document_objects: Map<string, any>;
  gate_requests: Map<string, any>;
  activity_events: any[];
  building_ssot_lite: Map<string, any>;
  deals: Map<string, any>;
  profiles: Map<string, any>;
}

const mockDb: MockDb = {
  im_pro_grants: new Map(),
  document_objects: new Map(),
  gate_requests: new Map(),
  activity_events: [],
  building_ssot_lite: new Map(),
  deals: new Map(),
  profiles: new Map(),
};

const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

vi.mock('@/components/teaser/TeaserEventTracker', () => ({
  trackTeaserCta: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/supabase/service', () => {
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        if (table === 'im_pro_grants') {
          return {
            select: (columns = '*') => {
              const filters: { col: string; val: any }[] = [];
              const builder: any = {
                eq: (col: string, val: any) => {
                  filters.push({ col, val });
                  return builder;
                },
                maybeSingle: async () => {
                  for (const [, row] of mockDb.im_pro_grants) {
                    const match = filters.every((f) => row[f.col] === f.val);
                    if (match) return { data: { ...row }, error: null };
                  }
                  return { data: null, error: null };
                },
                single: async () => {
                  for (const [, row] of mockDb.im_pro_grants) {
                    const match = filters.every((f) => row[f.col] === f.val);
                    if (match) return { data: { ...row }, error: null };
                  }
                  return { data: null, error: new Error('Grant not found') };
                },
              };
              return builder;
            },
            update: (updates: any) => {
              let targetId: string | null = null;
              const builder: any = {
                eq: (col: string, val: any) => {
                  if (col === 'id') targetId = val;
                  return builder;
                },
                select: () => builder,
                maybeSingle: async () => {
                  if (targetId && mockDb.im_pro_grants.has(targetId)) {
                    const current = mockDb.im_pro_grants.get(targetId);
                    const updated = { ...current, ...updates };
                    mockDb.im_pro_grants.set(targetId, updated);
                    return { data: updated, error: null };
                  }
                  return { data: null, error: null };
                },
                single: async () => {
                  if (targetId && mockDb.im_pro_grants.has(targetId)) {
                    const current = mockDb.im_pro_grants.get(targetId);
                    const updated = { ...current, ...updates };
                    mockDb.im_pro_grants.set(targetId, updated);
                    return { data: updated, error: null };
                  }
                  return { data: null, error: new Error('Grant not found') };
                },
                then: (resolve: any) => {
                  if (targetId && mockDb.im_pro_grants.has(targetId)) {
                    const current = mockDb.im_pro_grants.get(targetId);
                    const updated = { ...current, ...updates };
                    mockDb.im_pro_grants.set(targetId, updated);
                    resolve({ data: updated, error: null });
                  } else {
                    resolve({ data: null, error: new Error('Grant not found') });
                  }
                },
              };
              return builder;
            },
          };
        }

        if (table === 'document_objects') {
          return {
            select: () => {
              const filters: { col: string; val: any }[] = [];
              const builder: any = {
                eq: (col: string, val: any) => {
                  filters.push({ col, val });
                  return builder;
                },
                in: (col: string, vals: any[]) => {
                  filters.push({ col, val: vals });
                  return builder;
                },
                order: () => builder,
                limit: () => builder,
                maybeSingle: async () => {
                  for (const [, row] of mockDb.document_objects) {
                    const match = filters.every((f) => {
                      if (Array.isArray(f.val)) return f.val.includes(row[f.col]);
                      return row[f.col] === f.val;
                    });
                    if (match) return { data: { ...row }, error: null };
                  }
                  return { data: null, error: null };
                },
              };
              return builder;
            },
          };
        }

        if (table === 'activity_events') {
          return {
            insert: async (payload: any) => {
              mockDb.activity_events.push(payload);
              return { data: payload, error: null };
            },
            select: () => ({
              eq: () => ({
                eq: () => ({
                  count: mockDb.activity_events.length,
                }),
              }),
            }),
          };
        }

        if (table === 'deals') {
          return {
            select: () => {
              let dealId: string | null = null;
              const builder: any = {
                eq: (col: string, val: any) => {
                  if (col === 'id') dealId = val;
                  return builder;
                },
                maybeSingle: async () => {
                  if (dealId && mockDb.deals.has(dealId)) {
                    return { data: mockDb.deals.get(dealId), error: null };
                  }
                  return { data: null, error: null };
                },
              };
              return builder;
            },
          };
        }

        if (table === 'building_ssot_lite') {
          return {
            select: () => {
              let bldgId: string | null = null;
              const builder: any = {
                eq: (col: string, val: any) => {
                  if (col === 'id') bldgId = val;
                  return builder;
                },
                maybeSingle: async () => {
                  if (bldgId && mockDb.building_ssot_lite.has(bldgId)) {
                    return { data: mockDb.building_ssot_lite.get(bldgId), error: null };
                  }
                  return { data: null, error: null };
                },
              };
              return builder;
            },
          };
        }

        if (table === 'gate_requests') {
          return {
            select: () => {
              const filters: { col: string; val: any }[] = [];
              const builder: any = {
                eq: (col: string, val: any) => {
                  filters.push({ col, val });
                  return builder;
                },
                order: () => builder,
                limit: () => builder,
                maybeSingle: async () => {
                  for (const [, row] of mockDb.gate_requests) {
                    const match = filters.every((f) => row[f.col] === f.val);
                    if (match) return { data: { ...row }, error: null };
                  }
                  return { data: null, error: null };
                },
                single: async () => {
                  for (const [, row] of mockDb.gate_requests) {
                    const match = filters.every((f) => row[f.col] === f.val);
                    if (match) return { data: { ...row }, error: null };
                  }
                  return { data: null, error: new Error('Request not found') };
                },
              };
              return builder;
            },
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    }),
  };
});

// Mock Supabase JS client for auth-guard
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => {
        if (token === 'valid-broker-token') {
          return { data: { user: { id: 'usr-broker-1', email: 'broker@credeal.kr' } }, error: null };
        }
        if (token === 'valid-public-token') {
          return { data: { user: { id: 'usr-public-1', email: 'public@credeal.kr' } }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid JWT') };
      },
    },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          single: async () => {
            if (table === 'profiles') {
              if (val === 'usr-broker-1') return { data: { role: 'broker', display_name: '테스트 브로커' }, error: null };
              if (val === 'usr-public-1') return { data: { role: 'public_user', display_name: '일반 사용자' }, error: null };
            }
            return { data: null, error: new Error('Profile not found') };
          },
        }),
      }),
    }),
  }),
}));

import { CTALadder } from '@/components/teaser/CTALadder';
import NDASignatureForm from '@/components/gate/NDASignatureForm';
import NDAPage from '@/app/(public)/nda/[id]/page';
import { POST as postSignNda } from '@/app/api/gate-requests/[id]/sign/route';
import { POST as postApproveProGrant } from '@/app/api/broker/pro-grants/[id]/approve/route';
import { GET as getExportProIm } from '@/app/api/public/im-pro/[grantId]/export/route';
import { GET as getExportProPptx } from '@/app/api/public/im-pro/[grantId]/pptx/route';

describe('Empirical Adversarial Challenge Suite: Milestone M4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.im_pro_grants.clear();
    mockDb.document_objects.clear();
    mockDb.gate_requests.clear();
    mockDb.activity_events = [];
    mockDb.building_ssot_lite.clear();
    mockDb.deals.clear();
    mockDb.profiles.clear();
  });

  function setupReactDispatcher(stateValue: any = false, setStateMock: any = vi.fn()) {
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    if (internals) {
      internals.H = {
        useState: (init: any) => [stateValue !== undefined ? stateValue : init, setStateMock],
        useMemo: (factory: any) => factory(),
        useCallback: (fn: any) => fn,
        useEffect: vi.fn(),
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHALLENGE 1: /api/gate-requests/[id]/sign Fuzzing & Error Handling
  // ══════════════════════════════════════════════════════════════════════════
  describe('Challenge 1: /api/gate-requests/[id]/sign Payload Fuzzing', () => {
    const validGrantId = 'grant-fuzz-target-001';

    beforeEach(() => {
      mockDb.im_pro_grants.set(validGrantId, {
        id: validGrantId,
        building_id: 'bldg-fuzz-1',
        requester_name: '초기신청자',
        requester_phone: '010-1111-2222',
        status: 'pending',
        nda_signed_at: null,
      });
    });

    it('Fuzz 1.1: Missing agreedToTerms field must return HTTP 400 Bad Request', async () => {
      const payload = { signerName: '홍길동', signerPhone: '010-1234-5678' };
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('Fuzz 1.2: agreedToTerms = false must return HTTP 400 Bad Request', async () => {
      const payload = { agreedToTerms: false, signerName: '홍길동' };
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('Fuzz 1.3: Missing signerName must return HTTP 400 Bad Request', async () => {
      const payload = { agreedToTerms: true };
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('Fuzz 1.4: Empty string signerName ("") must return HTTP 400 Bad Request', async () => {
      const payload = { agreedToTerms: true, signerName: '' };
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
    });

    it('Fuzz 1.5: Whitespace-only signerName ("   ") must return HTTP 400 Bad Request', async () => {
      const payload = { agreedToTerms: true, signerName: '   ' };
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
    });

    it('Fuzz 1.6: Malformed JSON syntax must return HTTP 400 Bad Request (zero 500)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ "agreedToTerms": true, "signerName": "홍길동", malformed... ',
      });

      let res: any;
      let errorThrown: any = null;
      try {
        res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      } catch (err) {
        errorThrown = err;
      }

      expect(errorThrown).toBeNull();
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid request');
    });

    it('Fuzz 1.7: Empty body ("") must return HTTP 400 Bad Request (zero 500)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '',
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      expect(res.status).toBe(400);
    });

    it('Fuzz 1.7b: JSON null payload ("null") must not cause uncaught 500 crash', async () => {
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${validGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      });

      let res: any;
      let error: any = null;
      try {
        res = await postSignNda(req, { params: Promise.resolve({ id: validGrantId }) });
      } catch (err) {
        error = err;
      }
      console.log('DEBUG Fuzz 1.7b error thrown:', error?.message, 'res status:', res?.status);
      expect(error).toBeNull();
      expect(res?.status).toBe(400);
    });

    it('Fuzz 1.8: Non-existent grant ID returns 404 Not Found without crashing', async () => {
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/non-existent-uuid/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreedToTerms: true, signerName: '홍길동' }),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: 'non-existent-uuid' }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Grant not found');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHALLENGE 2: /api/broker/pro-grants/[id]/approve Security & Auth Guard
  // ══════════════════════════════════════════════════════════════════════════
  describe('Challenge 2: /api/broker/pro-grants/[id]/approve Security Guard', () => {
    const targetGrantId = 'grant-approve-sec-001';

    beforeEach(() => {
      mockDb.im_pro_grants.set(targetGrantId, {
        id: targetGrantId,
        status: 'pending',
        requester_name: '신청인',
      });
    });

    it('Security 2.1: Request without any auth header or cookie returns HTTP 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/${targetGrantId}/approve`, {
        method: 'POST',
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: targetGrantId }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('Security 2.2: Request with invalid / forged token returns HTTP 401', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/${targetGrantId}/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer forged-or-expired-jwt' },
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: targetGrantId }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('Security 2.3: Request with empty Bearer token returns HTTP 401 Unauthorized', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/${targetGrantId}/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' },
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: targetGrantId }) });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('Security 2.4: Authenticated broker with non-existent grant ID returns clean 404 (zero 500 crash)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/ghost-grant-id/approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' }, // mock test token satisfies requireBroker in test env
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: 'ghost-grant-id' }) });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('Grant not found');
    });

    it('Security 2.5: Authenticated broker with empty string ID returns clean 400 Bad Request', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants//approve`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: '' }) });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('Missing grant ID');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHALLENGE 3: /api/public/im-pro/[grantId]/export API & PPTX Redirect
  // ══════════════════════════════════════════════════════════════════════════
  describe('Challenge 3: /api/public/im-pro/[grantId]/export and PPTX Stream', () => {
    const activeGrantId = 'grant-export-active-001';
    const bldgId = 'bldg-export-001';

    beforeEach(() => {
      mockDb.im_pro_grants.set(activeGrantId, {
        id: activeGrantId,
        building_id: bldgId,
        requester_name: '우수투자자',
        requester_phone: '010-8888-9999',
        status: 'active',
        nda_signed_at: new Date().toISOString(),
        pdf_export_allowed: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      mockDb.document_objects.set('doc-001', {
        id: 'doc-001',
        building_id: bldgId,
        document_type: 'mobile_im_lite',
        title: '역삼 테헤란 프라임 타워',
        body: {
          title: '역삼 테헤란 프라임 타워',
          sections: [{ title: '개요', markdown: '테헤란로 초역세권' }],
        },
      });
    });

    it('Export 3.1: Non-existent grantId returns clean 404 Not Found', async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/non-existent-grant-id/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'non-existent-grant-id' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Grant not found or inactive');
    });

    it('Export 3.2: ?format=pptx redirects cleanly to /api/public/im-pro/[grantId]/pptx without crashing', async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/${activeGrantId}/export?format=pptx`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: activeGrantId }) });

      expect([302, 307]).toContain(res.status);
      const location = res.headers.get('location');
      expect(location).toBeDefined();
      expect(location).toContain(`/api/public/im-pro/${activeGrantId}/pptx`);
    });

    it('Export 3.3: Inactive grant with export returns 404', async () => {
      mockDb.im_pro_grants.set('grant-inactive', {
        id: 'grant-inactive',
        status: 'pending',
      });

      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/grant-inactive/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'grant-inactive' }) });

      expect(res.status).toBe(404);
    });

    it('Export 3.4: Unsigned NDA returns 403 Forbidden', async () => {
      mockDb.im_pro_grants.set('grant-unsigned', {
        id: 'grant-unsigned',
        status: 'active',
        nda_signed_at: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/grant-unsigned/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'grant-unsigned' }) });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('NDA signing required');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CHALLENGE 4: SSR & Client Rendering Resilience (CTALadder & /nda/[id])
  // ══════════════════════════════════════════════════════════════════════════
  describe('Challenge 4: SSR and Client Rendering Resilience', () => {
    it('SSR 4.1: CTALadder does not crash when executed in Node/SSR environment (window undefined)', () => {
      setupReactDispatcher(false, vi.fn());

      // Simulate SSR environment where window might not be standard browser window
      expect(() => {
        CTALadder({
          buildingId: 'bldg-ssr-001',
          teaserConfigId: 'cfg-ssr-001',
          requireNda: true,
          hasImDoc: true,
          isPptxApproved: true,
          pptxDownloadUrl: 'https://example.com/test.pptx',
        });
      }).not.toThrow();
    });

    it('SSR 4.2: NDAPage handles ID resolution server-side without window/localStorage dependencies', async () => {
      const bldgId = 'bldg-ssr-nda-001';
      mockDb.building_ssot_lite.set(bldgId, {
        id: bldgId,
        address: '서울시 서초구 서초대로 456',
        asset_type: '근린생활시설',
        area_signal: '강남역 5분',
      });

      let pageOutput: any;
      expect(async () => {
        pageOutput = await NDAPage({ params: Promise.resolve({ id: bldgId }) });
      }).not.toThrow();

      pageOutput = await NDAPage({ params: Promise.resolve({ id: bldgId }) });
      expect(pageOutput).toBeDefined();
    });

    it('SSR 4.3: NDAPage throws NOT_FOUND error when ID cannot be matched to any building or request', async () => {
      await expect(
        NDAPage({ params: Promise.resolve({ id: 'completely-unknown-id' }) })
      ).rejects.toThrow('NOT_FOUND');
    });

    it('Client 4.4: NDASignatureForm renders properly in both initial and already-signed states', () => {
      setupReactDispatcher(false, vi.fn());

      // Initial state
      const formInitial = NDASignatureForm({
        requestId: 'req-001',
        buildingId: 'bldg-001',
        isAlreadySigned: false,
      });
      expect(formInitial).toBeDefined();
      const strInitial = JSON.stringify(formInitial);
      expect(strInitial).toContain('btn-submit-nda');

      // Already signed state
      const formSigned = NDASignatureForm({
        requestId: 'req-001',
        buildingId: 'bldg-001',
        isAlreadySigned: true,
      });
      expect(formSigned).toBeDefined();
      const strSigned = JSON.stringify(formSigned);
      expect(strSigned).toContain('이미 서명이 완료된 문서입니다');
      expect(strSigned).not.toContain('btn-submit-nda');
    });
  });
});
