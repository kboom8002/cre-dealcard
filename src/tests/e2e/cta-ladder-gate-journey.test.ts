import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { NextRequest } from 'next/server';

// ── In-Memory Mock Database ──
interface MockDb {
  im_pro_grants: Map<string, any>;
  document_objects: Map<string, any>;
  gate_requests: Map<string, any>;
  activity_events: any[];
  building_ssot_lite: Map<string, any>;
  deals: Map<string, any>;
  documentObjectsQueriedColumns: { filterCol: string; filterVal: any }[];
  proGrantsTableQueried: string[];
}

const mockDb: MockDb = {
  im_pro_grants: new Map(),
  document_objects: new Map(),
  gate_requests: new Map(),
  activity_events: [],
  building_ssot_lite: new Map(),
  deals: new Map(),
  documentObjectsQueriedColumns: [],
  proGrantsTableQueried: [],
};

// ── Mock Router & Navigation ──
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

// ── Mock Supabase Service ──
vi.mock('@/lib/supabase/service', () => {
  return {
    createServiceClient: () => ({
      from: (table: string) => {
        mockDb.proGrantsTableQueried.push(table);

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
            select: (columns = '*') => {
              const filters: { col: string; val: any }[] = [];
              const builder: any = {
                eq: (col: string, val: any) => {
                  filters.push({ col, val });
                  mockDb.documentObjectsQueriedColumns.push({ filterCol: col, filterVal: val });
                  return builder;
                },
                order: () => builder,
                limit: () => builder,
                maybeSingle: async () => {
                  for (const [, row] of mockDb.document_objects) {
                    const match = filters.every((f) => row[f.col] === f.val);
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

        // Default fallback builder
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

import { CTALadder } from '@/components/teaser/CTALadder';
import NDASignatureForm from '@/components/gate/NDASignatureForm';
import NDAPage from '@/app/(public)/nda/[id]/page';
import { POST as postSignNda } from '@/app/api/gate-requests/[id]/sign/route';
import { POST as postApproveProGrant } from '@/app/api/broker/pro-grants/[id]/approve/route';
import { GET as getExportProIm } from '@/app/api/public/im-pro/[grantId]/export/route';

describe('Milestone M4: Security, CTA Ladder & Gate Journey (R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.im_pro_grants.clear();
    mockDb.document_objects.clear();
    mockDb.gate_requests.clear();
    mockDb.activity_events = [];
    mockDb.building_ssot_lite.clear();
    mockDb.deals.clear();
    mockDb.documentObjectsQueriedColumns = [];
    mockDb.proGrantsTableQueried = [];
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
  // Journey 1: Teaser / Dealcard CTA Ladder Action
  // ══════════════════════════════════════════════════════════════════════════
  describe('Journey 1: Teaser CTA Ladder Navigation (Feature 14)', () => {
    it('Positive Pair: when requireNda is true, triggers direct navigation to /nda/${buildingId}', () => {
      setupReactDispatcher(false, vi.fn());

      const buildingId = 'bldg-gangnam-prime-101';
      const element = CTALadder({
        buildingId,
        teaserConfigId: 'cfg-teaser-001',
        requireNda: true,
        hasImDoc: true,
      });

      expect(element).toBeDefined();
      const fragmentChildren = React.Children.toArray(element.props.children);
      const stackDiv = fragmentChildren[0] as React.ReactElement<any>;
      const stackButtons = React.Children.toArray(stackDiv.props.children) as React.ReactElement<any>[];

      // Pro IM Request button is in stackButtons
      const proButton = stackButtons.find((btn) => {
        const text = JSON.stringify(btn.props);
        return text.includes('상세 IM 신청하기');
      });

      expect(proButton).toBeDefined();
      expect(typeof proButton!.props.onClick).toBe('function');

      // Click the button
      proButton!.props.onClick();

      // Output assertion: Router must navigate directly to /nda/${buildingId} without DOM lookup errors
      expect(mockRouter.push).toHaveBeenCalledWith(`/nda/${buildingId}`);
    });

    it('Negative Pair: when requireNda is false, does NOT navigate to /nda route', () => {
      const setModalOpen = vi.fn();
      setupReactDispatcher(false, setModalOpen);

      const buildingId = 'bldg-yeouido-tower-202';
      const element = CTALadder({
        buildingId,
        teaserConfigId: 'cfg-teaser-002',
        requireNda: false,
        hasImDoc: true,
      });

      const fragmentChildren = React.Children.toArray(element.props.children);
      const stackDiv = fragmentChildren[0] as React.ReactElement<any>;
      const stackButtons = React.Children.toArray(stackDiv.props.children) as React.ReactElement<any>[];

      const proButton = stackButtons.find((btn) => {
        const text = JSON.stringify(btn.props);
        return text.includes('상세 IM 신청하기');
      });

      expect(proButton).toBeDefined();
      proButton!.props.onClick();

      // Output assertion: Must NOT navigate to /nda/ when requireNda is false
      expect(mockRouter.push).not.toHaveBeenCalledWith(`/nda/${buildingId}`);
      expect(setModalOpen).toHaveBeenCalledWith(true);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Journey 2: NDA Signature API Endpoint (Feature 16)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Journey 2: NDA Signature API (/api/gate-requests/[id]/sign) (Feature 16)', () => {
    const testGrantId = 'grant-test-uuid-404';

    beforeEach(() => {
      // Seed a pending grant in im_pro_grants
      mockDb.im_pro_grants.set(testGrantId, {
        id: testGrantId,
        building_id: 'bldg-404',
        requester_name: '신청자',
        requester_phone: '010-9999-8888',
        status: 'pending',
        nda_signed_at: null,
      });
    });

    it('Positive Pair: valid payload activates grant with 200 OK, setting status and watermark', async () => {
      const payload = {
        agreedToTerms: true,
        signerName: '홍길동',
        signerPhone: '010-1234-5678',
        signature: '홍길동',
      };

      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${testGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: testGrantId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      // Output assertions (Rule 6)
      expect(json.ok).toBe(true);
      expect(json.grantId).toBe(testGrantId);
      expect(json.expiresAt).toBeDefined();
      expect(json.message).toContain('NDA signed successfully');

      // Verify persistent DB mutation in im_pro_grants
      const updatedGrant = mockDb.im_pro_grants.get(testGrantId);
      expect(updatedGrant.status).toBe('active');
      expect(updatedGrant.nda_signed_at).toBeDefined();
      expect(updatedGrant.requester_name).toBe('홍길동');
      expect(updatedGrant.watermark_seed).toContain('홍길동|5678');
    });

    it('Negative Pair A: missing agreedToTerms returns 400 Bad Request', async () => {
      const payload = {
        agreedToTerms: false,
        signerName: '홍길동',
        signerPhone: '010-1234-5678',
      };

      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${testGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: testGrantId }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('NDA agreement and signer name required');

      // Database state must NOT be modified
      const grant = mockDb.im_pro_grants.get(testGrantId);
      expect(grant.status).toBe('pending');
      expect(grant.nda_signed_at).toBeNull();
    });

    it('Negative Pair B: missing signerName returns 400 Bad Request', async () => {
      const payload = {
        agreedToTerms: true,
        signerName: '',
        signerPhone: '010-1234-5678',
      };

      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${testGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: testGrantId }) });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toBe('NDA agreement and signer name required');

      // Database state must NOT be modified
      const grant = mockDb.im_pro_grants.get(testGrantId);
      expect(grant.status).toBe('pending');
    });

    it('Negative Pair C: non-existent grant returns 404 Not Found', async () => {
      const req = new NextRequest(`http://localhost:3000/api/gate-requests/unknown-grant-id/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreedToTerms: true, signerName: '홍길동' }),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: 'unknown-grant-id' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.error).toBe('Grant not found');
    });

    it('Negative Pair D: already signed grant returns 409 Conflict', async () => {
      // Mark grant as already signed
      mockDb.im_pro_grants.set(testGrantId, {
        id: testGrantId,
        status: 'active',
        nda_signed_at: new Date().toISOString(),
      });

      const req = new NextRequest(`http://localhost:3000/api/gate-requests/${testGrantId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreedToTerms: true, signerName: '홍길동' }),
      });

      const res = await postSignNda(req, { params: Promise.resolve({ id: testGrantId }) });
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toBe('NDA already signed');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Journey 3: Pro-Grants Broker Approval API (Feature 17)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Journey 3: Pro-Grants Broker Approval API (Feature 17)', () => {
    const grantId = 'grant-broker-approval-777';

    beforeEach(() => {
      mockDb.im_pro_grants.set(grantId, {
        id: grantId,
        status: 'pending',
        requester_name: '잠재투자자',
        requester_phone: '010-7777-8888',
      });
    });

    it('Positive Pair: with valid broker auth, approves im_pro_grants and returns 200 OK', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/${grantId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: grantId }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.id).toBe(grantId);
      expect(json.status).toBe('approved');

      // Assert table queried is im_pro_grants (NOT legacy pro_grants)
      expect(mockDb.proGrantsTableQueried).toContain('im_pro_grants');
      expect(mockDb.proGrantsTableQueried).not.toContain('pro_grants');

      // Assert state updated in DB
      const updated = mockDb.im_pro_grants.get(grantId);
      expect(updated.status).toBe('approved');
    });

    it('Negative Pair A: without broker auth (no token), returns 401 Unauthorized', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/${grantId}/approve`, {
        method: 'POST',
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: grantId }) });
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error?.code).toBe('UNAUTHORIZED');

      // Grant in DB must NOT be modified
      const grant = mockDb.im_pro_grants.get(grantId);
      expect(grant.status).toBe('pending');
    });

    it('Negative Pair B: non-existent grant returns 404 Not Found', async () => {
      const req = new NextRequest(`http://localhost:3000/api/broker/pro-grants/missing-grant/approve`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token',
        },
      });

      const res = await postApproveProGrant(req, { params: Promise.resolve({ id: 'missing-grant' }) });
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toBe('Grant not found');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Journey 4: Pro-IM Export API & Column Verification (Feature 18)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Journey 4: Pro-IM Export API & Column Alignment (Feature 18 & 19)', () => {
    const grantId = 'grant-export-valid-888';
    const buildingId = 'bldg-seolleung-999';

    beforeEach(() => {
      mockDb.im_pro_grants.set(grantId, {
        id: grantId,
        building_id: buildingId,
        requester_name: 'VIP투자자',
        requester_phone: '010-5555-1234',
        status: 'active',
        nda_signed_at: new Date().toISOString(),
        pdf_export_allowed: true,
        watermark_seed: 'VIP투자자|1234',
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      mockDb.document_objects.set('doc-pro-1', {
        id: 'doc-pro-1',
        building_id: buildingId,
        document_type: 'mobile_im_lite', // Database column name is document_type
        title: '선릉역 프라임 오피스빌딩 Pro IM',
        body: {
          title: '선릉역 프라임 오피스빌딩 Pro IM',
          sections: [
            { title: '핵심 투자 포인트', markdown: '강남 테헤란로 핵심 업무지구에 위치한 우량 자산' },
          ],
        },
      });
    });

    it('Positive Pair: queries document_type on document_objects and returns watermarked 200 HTML', async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/${grantId}/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      // Output assertions (Rule 6)
      expect(html).toContain('STRICTLY CONFIDENTIAL');
      expect(html).toContain('VIP투자자');
      expect(html).toContain('선릉역 프라임 오피스빌딩 Pro IM');
      expect(html).toContain('핵심 투자 포인트');

      // Output assertion for Feature 18: Column query must be document_type, NOT doc_type
      expect(mockDb.documentObjectsQueriedColumns).toContainEqual({
        filterCol: 'document_type',
        filterVal: 'mobile_im_lite',
      });
      const hasOldDocType = mockDb.documentObjectsQueriedColumns.some((q) => q.filterCol === 'doc_type');
      expect(hasOldDocType).toBe(false);
    });

    it('Positive Pair: ?format=pptx redirects to official PPTX endpoint', async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/${grantId}/export?format=pptx`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId }) });

      // Should redirect to /pptx
      expect([302, 307]).toContain(res.status);
      const location = res.headers.get('location');
      expect(location).toContain(`/api/public/im-pro/${grantId}/pptx`);
    });

    it('Negative Pair A: inactive or non-existent grant returns 404 Not Found', async () => {
      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/non-existent-grant/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'non-existent-grant' }) });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Grant not found or inactive');
    });

    it('Negative Pair B: grant without NDA signature returns 403 Forbidden', async () => {
      mockDb.im_pro_grants.set('grant-unsigned', {
        id: 'grant-unsigned',
        building_id: buildingId,
        status: 'active',
        nda_signed_at: null, // NDA not yet signed
        pdf_export_allowed: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/grant-unsigned/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'grant-unsigned' }) });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('NDA signing required');
    });

    it('Negative Pair C: grant with pdf_export_allowed false returns 403 Forbidden', async () => {
      mockDb.im_pro_grants.set('grant-no-export', {
        id: 'grant-no-export',
        building_id: buildingId,
        status: 'active',
        nda_signed_at: new Date().toISOString(),
        pdf_export_allowed: false, // Disallowed
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      });

      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/grant-no-export/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'grant-no-export' }) });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('PDF export not permitted');
    });

    it('Negative Pair D: expired grant returns 410 Gone', async () => {
      mockDb.im_pro_grants.set('grant-expired', {
        id: 'grant-expired',
        building_id: buildingId,
        status: 'active',
        nda_signed_at: new Date().toISOString(),
        pdf_export_allowed: true,
        expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1h ago
      });

      const req = new NextRequest(`http://localhost:3000/api/public/im-pro/grant-expired/export`);
      const res = await getExportProIm(req, { params: Promise.resolve({ grantId: 'grant-expired' }) });

      expect(res.status).toBe(410);
      const json = await res.json();
      expect(json.error).toBe('Grant expired');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Journey 5: NDA Page Activation & Form Payload Alignment (Features 15 & 16)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Journey 5: NDA Page Activation & Form Payload Alignment (Features 15 & 16)', () => {
    it('Positive Pair: NDAPage renders NDA agreement and does not redirect to /hub', async () => {
      const bldgId = 'bldg-nda-page-test';
      mockDb.building_ssot_lite.set(bldgId, {
        id: bldgId,
        address: '서울시 강남구 테헤란로 123',
        asset_type: '오피스빌딩',
        area_signal: '역삼역 초역세권',
      });
      mockDb.gate_requests.set('req-123', {
        id: 'req-123',
        building_id: bldgId,
        status: 'submitted',
      });

      const pageElement = await NDAPage({ params: Promise.resolve({ id: 'req-123' }) });
      expect(pageElement).toBeDefined();

      const elementStr = JSON.stringify(pageElement);
      // Assert that agreement and building info are rendered
      expect(elementStr).toContain('비밀유지서약서');
      expect(elementStr).toContain('역삼역 초역세권');
    });

    it('Negative Pair: NDAPage calls notFound when ID cannot be resolved', async () => {
      await expect(
        NDAPage({ params: Promise.resolve({ id: 'non-existent-id' }) })
      ).rejects.toThrow('NOT_FOUND');
    });

    it('Positive Pair: NDASignatureForm renders input fields for name, phone, agreement checkbox, and signature', () => {
      setupReactDispatcher();
      const formElement = NDASignatureForm({
        requestId: 'req-form-test',
        buildingId: 'bldg-form-test',
        isAlreadySigned: false,
      });

      expect(formElement).toBeDefined();
      const formStr = JSON.stringify(formElement);
      expect(formStr).toContain('input-signer-name');
      expect(formStr).toContain('input-signer-phone');
      expect(formStr).toContain('input-signature');
      expect(formStr).toContain('checkbox-agree-terms');
    });

    it('Negative Pair: NDASignatureForm displays signed message when isAlreadySigned is true', () => {
      setupReactDispatcher();
      const formElement = NDASignatureForm({
        requestId: 'req-already-signed',
        buildingId: 'bldg-already-signed',
        isAlreadySigned: true,
      });

      expect(formElement).toBeDefined();
      const formStr = JSON.stringify(formElement);
      expect(formStr).toContain('이미 서명이 완료된 문서입니다');
      expect(formStr).not.toContain('input-signer-name');
    });
  });
});
