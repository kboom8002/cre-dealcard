import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  imProGrants: new Map<string, Record<string, any>>(),
  gateRequests: new Map<string, Record<string, any>>(),
  documentObjects: new Map<string, Record<string, any>>(),
  buildings: new Map<string, Record<string, any>>(),
  workspaceItems: new Map<string, Record<string, any>>(),
  activityEvents: [] as Array<Record<string, any>>,
  studioProjects: new Map<string, Record<string, any>>(),
  slidePatches: [] as Array<{ projectId: string; slideId: string; patch: Record<string, any> }>,
  missingColumnsOnGrants: new Set<string>(),
  missingGrantsTable: false,
  simulateCasExhausted: false,
  injectActivityFkOnce: false,
  rpcMode: 'missing_rpc' as 'missing_rpc' | 'atomic_ok' | 'atomic_exhausted',
  rpcCalls: [] as Array<{ fn: string; params: Record<string, any> }>,
  pptxRenderSpy: vi.fn(),
  mockAuth: {
    user: { id: 'broker-1', email: 'broker1@credeal.kr' } as { id: string; email?: string } | null,
    role: 'broker' as string | null,
    error: null as Response | null,
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/im-lite/bldg-viewer-1',
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: vi.fn(async () => true),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: vi.fn(async () => {
    if (state.mockAuth.error) {
      return { user: null, role: null, profile: null, error: state.mockAuth.error };
    }
    if (!state.mockAuth.user) {
      return {
        user: null,
        role: null,
        profile: null,
        error: new Response(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      };
    }
    return {
      user: state.mockAuth.user,
      role: state.mockAuth.role,
      profile: { role: state.mockAuth.role, display_name: '테스트 공인중개사' },
      error: null,
    };
  }),
  verifyAuth: vi.fn(async () => ({
    user: state.mockAuth.user,
    role: state.mockAuth.role,
    profile: null,
    error: state.mockAuth.user ? null : new Response('{}', { status: 401 }),
  })),
}));

vi.mock('@/domain/broker/broker-contact', () => ({
  fetchBrokerContact: vi.fn(async () => null),
  toPptxBrokerInput: vi.fn(() => null),
}));

vi.mock('@/domain/building/mobile-im/pptx/pptx-renderer', () => ({
  MobileImPptxRenderer: class {
    async render() {
      state.pptxRenderSpy();
      return {
        buffer: Buffer.from('PK-pptx-mock'),
        slideCount: 30,
        fileSizeBytes: 12,
      };
    }
  },
}));

vi.mock('@/lib/ssot-adapter', () => ({
  readWithMigration: vi.fn(async (id: string) => ({
    data: state.buildings.get(id) ?? null,
    error: null,
  })),
}));

vi.mock('@/domain/building/pptx-studio/studio-service', () => ({
  studioService: {
    getProject: vi.fn(async (id: string) => {
      const p = state.studioProjects.get(id);
      if (!p) throw new Error('Not found');
      return p;
    }),
    findProjectByDealId: vi.fn(async (dealId: string) => {
      for (const p of state.studioProjects.values()) {
        if (p.dealId === dealId) return p;
      }
      return null;
    }),
    patchSlideOverrides: vi.fn(async (projectId: string, slideId: string, patch: Record<string, any>) => {
      state.slidePatches.push({ projectId, slideId, patch });
      return { id: projectId, slideId, overrides: patch };
    }),
  },
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => {
    const makeGrantBuilder = () => {
      const eqFilters: Array<{ col: string; val: unknown }> = [];
      const ltFilters: Array<{ col: string; val: number }> = [];
      let op: 'select' | 'insert' | 'update' = 'select';
      let payload: Record<string, any> | null = null;
      let wantSelectAfterMutate = false;

      const checkDrift = (obj: Record<string, any>) => {
        if (state.missingGrantsTable) {
          return { code: '42P01', message: 'relation "public.im_pro_grants" does not exist' };
        }
        for (const col of Object.keys(obj)) {
          if (state.missingColumnsOnGrants.has(col)) {
            return {
              code: '42703',
              message: `Could not find the '${col}' column of 'im_pro_grants' in the schema cache`,
            };
          }
        }
        return null;
      };

      const execute = async (): Promise<{ data: any; error: any }> => {
        if (state.missingGrantsTable) {
          return {
            data: null,
            error: { code: '42P01', message: 'relation "public.im_pro_grants" does not exist' },
          };
        }
        for (const f of eqFilters) {
          if (state.missingColumnsOnGrants.has(f.col)) {
            return {
              data: null,
              error: { code: '42703', message: `column ${f.col} does not exist` },
            };
          }
        }

        if (op === 'insert' && payload) {
          const driftErr = checkDrift(payload);
          if (driftErr) return { data: null, error: driftErr };
          const id = String(payload.id || `grant-${Date.now()}`);
          const stored = { created_at: new Date().toISOString(), ...payload, id };
          state.imProGrants.set(id, stored);
          return { data: [{ ...stored }], error: null };
        }

        if (op === 'update' && payload) {
          const driftErr = checkDrift(payload);
          if (driftErr) return { data: null, error: driftErr };
          if (state.simulateCasExhausted && ltFilters.length > 0) {
            return { data: [], error: null };
          }
          const matched: Array<Record<string, any>> = [];
          for (const [k, row] of state.imProGrants.entries()) {
            const eqOk = eqFilters.every((f) => row[f.col] === f.val);
            const ltOk = ltFilters.every((f) => Number(row[f.col] ?? 0) < f.val);
            if (eqOk && ltOk) {
              const updated = { ...row, ...payload };
              state.imProGrants.set(k, updated);
              matched.push({ ...updated });
            }
          }
          return { data: wantSelectAfterMutate ? matched : matched[0] ?? null, error: null };
        }

        const matched: Array<Record<string, any>> = [];
        for (const row of state.imProGrants.values()) {
          if (eqFilters.every((f) => row[f.col] === f.val)) {
            matched.push({ ...row });
          }
        }
        return { data: matched, error: null };
      };

      const builder: any = {
        select: () => {
          if (op !== 'select') wantSelectAfterMutate = true;
          return builder;
        },
        insert: (p: Record<string, any>) => {
          op = 'insert';
          payload = p;
          return builder;
        },
        update: (p: Record<string, any>) => {
          op = 'update';
          payload = p;
          return builder;
        },
        eq: (col: string, val: unknown) => {
          eqFilters.push({ col, val });
          return builder;
        },
        lt: (col: string, val: number) => {
          ltFilters.push({ col, val });
          return builder;
        },
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const res = await execute();
          if (res.error) return { data: null, error: res.error };
          const row = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
          return { data: row, error: null };
        },
        single: async () => {
          const res = await execute();
          if (res.error) return { data: null, error: res.error };
          const row = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
          return { data: row, error: row ? null : { message: 'Not found' } };
        },
        then: (resolve: any, reject?: any) => execute().then(resolve, reject),
      };
      return builder;
    };

    const makeMapTableBuilder = (map: Map<string, Record<string, any>>) => {
      const filters: Array<(r: Record<string, any>) => boolean> = [];
      let op: 'select' | 'update' = 'select';
      let updatePayload: Record<string, any> | null = null;
      const execute = async () => {
        const matched: Array<Record<string, any>> = [];
        for (const [k, row] of map.entries()) {
          if (filters.every((fn) => fn(row))) {
            if (op === 'update' && updatePayload) {
              const next = { ...row, ...updatePayload };
              map.set(k, next);
              matched.push({ ...next });
            } else {
              matched.push({ ...row });
            }
          }
        }
        return { data: matched, error: null };
      };
      const b: any = {
        select: () => b,
        update: (p: Record<string, any>) => {
          op = 'update';
          updatePayload = p;
          return b;
        },
        eq: (col: string, val: unknown) => {
          filters.push((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => {
          filters.push((r) => vals.includes(r[col]));
          return b;
        },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          const res = await execute();
          return { data: res.data[0] ?? null, error: null };
        },
        single: async () => {
          const res = await execute();
          return { data: res.data[0] ?? null, error: res.data[0] ? null : { message: 'Not found' } };
        },
        then: (resolve: any, reject?: any) => execute().then(resolve, reject),
      };
      return b;
    };

    return {
      rpc: async (fn: string, params: Record<string, any>) => {
        state.rpcCalls.push({ fn, params });
        if (fn === 'consume_im_pro_grant_download') {
          if (state.rpcMode === 'missing_rpc') {
            return {
              data: null,
              error: { code: '42883', message: 'function consume_im_pro_grant_download does not exist' },
            };
          }
          if (state.rpcMode === 'atomic_exhausted') {
            return { data: [{ ok: false, used: Number(params.p_default_max ?? 5), limit: Number(params.p_default_max ?? 5) }], error: null };
          }
          const grant = state.imProGrants.get(String(params.p_grant_id));
          if (grant) {
            const limit = Number(grant.max_downloads || params.p_default_max || 5);
            const cur = Number(grant.download_count || 0);
            if (cur >= limit) {
              return { data: [{ ok: false, used: cur, limit }], error: null };
            }
            grant.download_count = cur + 1;
            state.imProGrants.set(String(params.p_grant_id), grant);
            return { data: [{ ok: true, used: grant.download_count, limit }], error: null };
          }
          return { data: [{ ok: true, used: 1, limit: Number(params.p_default_max ?? 5) }], error: null };
        }
        return { data: null, error: { code: '42883', message: 'function does not exist' } };
      },
      from: (table: string) => {
        if (table === 'im_pro_grants') return makeGrantBuilder();
        if (table === 'gate_requests') return makeMapTableBuilder(state.gateRequests);
        if (table === 'document_objects') return makeMapTableBuilder(state.documentObjects);
        if (table === 'building_ssot_lite' || table === 'buildings') return makeMapTableBuilder(state.buildings);
        if (table === 'workspace_items') return makeMapTableBuilder(state.workspaceItems);
        if (table === 'activity_events') {
          const filters: Array<(r: Record<string, any>) => boolean> = [];
          let isHeadCount = false;
          let insertedRows: Array<Record<string, any>> | null = null;
          const executeActivity = async () => {
            if (insertedRows) {
              if (state.injectActivityFkOnce) {
                state.injectActivityFkOnce = false;
                return {
                  data: null,
                  error: { code: '23503', message: 'violates foreign key constraint' },
                };
              }
              const withIds = insertedRows.map((r, i) => ({ id: `ev-${Date.now()}-${i}`, ...r }));
              state.activityEvents.push(...withIds);
              return { data: withIds, error: null };
            }
            const matched = state.activityEvents.filter((r) => filters.every((fn) => fn(r)));
            if (isHeadCount) {
              return { data: null, count: matched.length, error: null };
            }
            return { data: matched, error: null };
          };
          const b: any = {
            select: (_c?: string, opts?: { head?: boolean }) => {
              if (opts?.head) isHeadCount = true;
              return b;
            },
            eq: (col: string, val: unknown) => {
              filters.push((r) => r[col] === val);
              return b;
            },
            in: (col: string, vals: unknown[]) => {
              filters.push((r) => vals.includes(r[col]));
              return b;
            },
            order: () => b,
            limit: () => b,
            insert: (row: any) => {
              insertedRows = Array.isArray(row) ? row : [row];
              return b;
            },
            single: async () => {
              const res = await executeActivity();
              if (res.error) return { data: null, error: res.error };
              return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: null };
            },
            maybeSingle: async () => {
              const res = await executeActivity();
              if (res.error) return { data: null, error: res.error };
              return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: null };
            },
            then: (resolve: any, reject?: any) => executeActivity().then(resolve, reject),
          };
          return b;
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
            }),
          }),
          insert: async () => ({ data: null, error: null }),
        };
      },
      storage: {
        listBuckets: vi.fn(async () => ({ data: [{ name: 'building-photos' }], error: null })),
        createBucket: vi.fn(async () => ({ data: null, error: null })),
        from: () => ({
          upload: vi.fn(async () => ({ data: { path: 'ok' }, error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/photo.jpg' } })),
        }),
      },
    };
  },
}));

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  consumeProGrantDownload,
  issueOrRefreshProGrant,
  resolveProGrantByAnyId,
} from '@/domain/gate/im-pro-grant-service';
import { POST as postSignNda } from '@/app/api/gate-requests/[id]/sign/route';
import { GET as getImPro } from '@/app/api/public/im-pro/[grantId]/route';
import { GET as getImProExport } from '@/app/api/public/im-pro/[grantId]/export/route';
import { GET as getImProPptx } from '@/app/api/public/im-pro/[grantId]/pptx/route';
import { POST as postMapUpload } from '@/app/api/broker/basic-im-studio/[id]/map-upload/route';
import { POST as postPhotoUpload } from '@/app/api/broker/buildings/[id]/photos/upload/route';
import { POST as postImValidate } from '@/app/api/im/validate/route';
import { POST as postApproveOverride } from '@/app/api/broker/im-lite/[id]/approve-override/route';
import { PUT as putSaveSections } from '@/app/api/broker/im-lite/[id]/save-sections/route';
import { PATCH as patchReviewGate } from '@/app/api/gate-requests/[id]/review/route';
import { POST as postApproveProGrant } from '@/app/api/broker/pro-grants/[id]/approve/route';
import { POST as postImLiteView } from '@/app/api/public/im-lite/[buildingId]/view/route';
import { MobileIMViewer } from '@/app/(public)/im-lite/[buildingId]/mobile-im-viewer';
import { computeGrossYieldPct } from '@/lib/workspace/summary/patch-upsert-im';

describe('WP-7.1D: Pro IM Grant Lifecycle, Export Snake/Camel Mapping, Download Caps & Security Guards', () => {
  beforeEach(() => {
    state.imProGrants.clear();
    state.gateRequests.clear();
    state.documentObjects.clear();
    state.buildings.clear();
    state.workspaceItems.clear();
    state.activityEvents = [];
    state.studioProjects.clear();
    state.slidePatches = [];
    state.missingColumnsOnGrants.clear();
    state.missingGrantsTable = false;
    state.simulateCasExhausted = false;
    state.injectActivityFkOnce = false;
    state.rpcMode = 'missing_rpc';
    state.rpcCalls = [];
    state.pptxRenderSpy.mockClear();
    state.mockAuth.user = { id: 'broker-1', email: 'broker1@credeal.kr' };
    state.mockAuth.role = 'broker';
    state.mockAuth.error = null;
  });

  it('1. issueOrRefreshProGrant issues pending_nda grant with crypto token, 72h TTL, max_downloads=5 and handles 42703/42P01', async () => {
    const supabase = createServiceClient();

    const issued = await issueOrRefreshProGrant(supabase, {
      gateRequestId: 'gate-req-1',
      buildingId: 'bldg-pro-1',
      requesterName: '김매수',
      requesterPhone: '010-1111-2222',
      requesterEmail: 'buyer@fund.kr',
      brokerId: 'broker-1',
    });

    expect(issued.ok).toBe(true);
    expect(issued.created).toBe(true);
    expect(issued.grant?.status).toBe('pending_nda');
    expect(issued.grant?.max_downloads).toBe(5);
    expect(issued.grant?.download_count).toBe(0);
    expect(issued.grantToken).toMatch(/^[0-9a-f]{64}$/);
    const ttlHours =
      (Date.parse(issued.grant!.expires_at) - Date.now()) / (3600 * 1000);
    expect(ttlHours).toBeGreaterThan(71);
    expect(ttlHours).toBeLessThanOrEqual(72.1);

    // Schema drift 42703 (older table missing grant_token / max_downloads)
    state.missingColumnsOnGrants.add('grant_token');
    state.missingColumnsOnGrants.add('max_downloads');
    const driftIssued = await issueOrRefreshProGrant(supabase, {
      buildingId: 'bldg-pro-2',
      requesterName: '이매수',
      requesterPhone: '010-3333-4444',
      brokerId: 'broker-1',
    });
    expect(driftIssued.ok).toBe(true);
    expect(driftIssued.grant?.status).toBe('pending_nda');

    // Schema drift 42P01 (table absent)
    state.missingGrantsTable = true;
    const missingTblRes = await issueOrRefreshProGrant(supabase, {
      buildingId: 'bldg-pro-3',
      brokerId: 'broker-1',
    });
    expect(missingTblRes.ok).toBe(false);
    expect(missingTblRes.tableMissing).toBe(true);
  });

  it('2. End-to-end NDA sign resolves by id, gate_request_id, and building_id and returns /im-pro/[grantId]?token=... redirectUrl', async () => {
    const supabase = createServiceClient();
    const issued = await issueOrRefreshProGrant(supabase, {
      gateRequestId: 'gate-req-200',
      buildingId: 'bldg-200',
      requesterName: '박투자',
      requesterPhone: '010-5555-6666',
      brokerId: 'broker-1',
    });
    const grantId = issued.grant!.id;
    const grantToken = issued.grantToken!;

    // Verify resolveProGrantByAnyId works for all 3 key types
    expect((await resolveProGrantByAnyId(supabase, grantId)).grant?.id).toBe(grantId);
    expect((await resolveProGrantByAnyId(supabase, 'gate-req-200')).grant?.id).toBe(grantId);
    expect((await resolveProGrantByAnyId(supabase, 'bldg-200')).grant?.id).toBe(grantId);

    // Wrong phone & no token -> 403
    const badRes = await postSignNda(
      new NextRequest('http://localhost/api/gate-requests/gate-req-200/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreedToTerms: true,
          signerName: '박투자',
          signerPhone: '010-9999-9999',
        }),
      }),
      { params: Promise.resolve({ id: 'gate-req-200' }) },
    );
    expect(badRes.status).toBe(403);

    // Sign via gate_request_id using grantToken
    const okRes = await postSignNda(
      new NextRequest('http://localhost/api/gate-requests/gate-req-200/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agreedToTerms: true,
          signerName: '변조이름시도',
          signerPhone: '010-5555-6666',
          grantToken,
        }),
      }),
      { params: Promise.resolve({ id: 'gate-req-200' }) },
    );
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.ok).toBe(true);
    expect(json.grantId).toBe(grantId);
    expect(json.grantToken).toBe(grantToken);
    expect(json.redirectUrl).toBe(`/im-pro/${grantId}?token=${encodeURIComponent(grantToken)}`);

    const updated = state.imProGrants.get(grantId)!;
    expect(updated.status).toBe('active');
    expect(updated.nda_signed_at).toBeTruthy();
    expect(updated.requester_name).toBe('박투자'); // PII never overwritten

    // cre_pro_grant HttpOnly cookie is issued with `${grantId}:${grantToken}`
    const grantCookie = okRes.cookies.get('cre_pro_grant');
    expect(grantCookie?.value).toBe(`${grantId}:${grantToken}`);
    expect(grantCookie?.httpOnly).toBe(true);
  });

  it('3. GET /api/public/im-pro/[grantId] closes IDOR (rejects buildingId & untokened/forged requests), leaks zero PII when pending NDA, and loads standalone building', async () => {
    const grantId = 'grant-standalone-1';
    const bldgId = 'bldg-standalone-1';
    const grantToken = 'tok-standalone-3-valid-secret';
    state.imProGrants.set(grantId, {
      id: grantId,
      building_id: bldgId,
      deal_id: null,
      broker_id: 'owner-broker',
      grant_token: grantToken,
      requester_name: '정매수',
      requester_phone: '010-1234-5678',
      status: 'active',
      nda_signed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      max_downloads: 5,
      download_count: 0,
    });

    // Pending NDA grant returns 403 requiresNDA with zero PII/building/doc
    state.imProGrants.set('grant-pending-nda-3', {
      id: 'grant-pending-nda-3',
      building_id: bldgId,
      broker_id: 'owner-broker',
      grant_token: 'tok-pending-3',
      requester_name: '비밀매수자',
      requester_phone: '010-7777-8888',
      status: 'pending_nda',
      nda_signed_at: null,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      max_downloads: 5,
      download_count: 0,
    });
    const pendingRes = await getImPro(
      new NextRequest('http://localhost/api/public/im-pro/grant-pending-nda-3'),
      { params: Promise.resolve({ grantId: 'grant-pending-nda-3' }) },
    );
    expect(pendingRes.status).toBe(403);
    const pendingJson = await pendingRes.json();
    expect(pendingJson.requiresNDA).toBe(true);
    expect(pendingJson.building).toBeUndefined();
    expect(pendingJson.imDocument).toBeUndefined();
    expect(JSON.stringify(pendingJson)).not.toContain('비밀매수자');
    expect(JSON.stringify(pendingJson)).not.toContain('010-7777-8888');

    // Add published IM doc (still zero `deals` rows!)
    state.documentObjects.set('doc-standalone-1', {
      id: 'doc-standalone-1',
      building_id: bldgId,
      document_type: 'im_pro',
      status: 'published',
      title: '서초동 프라임 빌딩',
      body: {
        title: '서초동 프라임 빌딩',
        sections: [{ title: '개요', markdown: '핵심 입지 자산' }],
        dataGrade: 'B',
      },
    });

    // IDOR closed: passing buildingId as [grantId] MUST return 404
    const idorRes = await getImPro(
      new NextRequest(`http://localhost/api/public/im-pro/${bldgId}?token=${grantToken}`),
      { params: Promise.resolve({ grantId: bldgId }) },
    );
    expect(idorRes.status).toBe(404);

    // Fail-closed: untokened or forged token MUST return 403 GRANT_TOKEN_REQUIRED
    const untokenedRes = await getImPro(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(untokenedRes.status).toBe(403);
    expect((await untokenedRes.json()).code).toBe('GRANT_TOKEN_REQUIRED');

    const forgedRes = await getImPro(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}?token=forged-token`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(forgedRes.status).toBe(403);

    // Valid token + missing doc -> HTTP 404 (not swallowed as 200 { imDocument: null })
    const savedDoc = state.documentObjects.get('doc-standalone-1')!;
    state.documentObjects.delete('doc-standalone-1');
    const missingRes = await getImPro(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(missingRes.status).toBe(404);

    // Restore doc -> HTTP 200 via query token and via cre_pro_grant cookie
    state.documentObjects.set('doc-standalone-1', savedDoc);
    const okRes = await getImPro(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.ok).toBe(true);
    expect(body.imDocument.title).toBe('서초동 프라임 빌딩');

    const cookieReq = new NextRequest(`http://localhost/api/public/im-pro/${grantId}`, {
      headers: { cookie: `cre_pro_grant=${encodeURIComponent(`${grantId}:${grantToken}`)}` },
    });
    const cookieRes = await getImPro(cookieReq, { params: Promise.resolve({ grantId }) });
    expect(cookieRes.status).toBe(200);
  });

  it('4. Pro export supports snake_case & camelCase tables, enforces viewer token, AND checks quota before rendering', async () => {
    const grantId = 'grant-export-snake-1';
    const bldgId = 'bldg-export-snake-1';
    const grantToken = 'tok-snake-4-valid-secret';
    state.imProGrants.set(grantId, {
      id: grantId,
      building_id: bldgId,
      broker_id: 'owner-broker',
      grant_token: grantToken,
      requester_name: '강매수',
      requester_phone: '010-8888-7777',
      status: 'active',
      nda_signed_at: new Date().toISOString(),
      pdf_export_allowed: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      max_downloads: 2,
      download_count: 0,
    });
    state.documentObjects.set('doc-snake-1', {
      id: 'doc-snake-1',
      building_id: bldgId,
      document_type: 'im_pro',
      status: 'published',
      title: '테헤란로 랜드마크',
      body: {
        title: '테헤란로 랜드마크',
        sections: [{ title: '자산 개요', markdown: '강남 중심업무지구' }],
        floor_leases: [
          {
            floor: '3F',
            tenant_type: '오피스',
            area_sqm: 215.5,
            deposit_manwon: 15000,
            monthly_rent_manwon: 1250,
          },
        ],
        loan_scenario: {
          ltv_pct: 55,
          loan_amount_manwon: 550000,
          interest_rate_pct: 4.3,
        },
        tax_scenarios: [
          {
            scenario: '법인 매수',
            acquisition_tax_rate: '4.6%',
            acquisition_tax_manwon: 46000,
          },
        ],
      },
    });

    // IDOR & fail-closed token enforcement on /export & /pptx
    const idorExport = await getImProExport(
      new NextRequest(`http://localhost/api/public/im-pro/${bldgId}/export?token=${grantToken}`),
      { params: Promise.resolve({ grantId: bldgId }) },
    );
    expect(idorExport.status).toBe(404);

    const untokenedExport = await getImProExport(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/export`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(untokenedExport.status).toBe(403);

    const untokenedPptx = await getImProPptx(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/pptx`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(untokenedPptx.status).toBe(403);
    expect(state.pptxRenderSpy).not.toHaveBeenCalled();

    // 1st export -> 200, renders snake_case floor_leases, loan_scenario, tax_scenarios
    const res1 = await getImProExport(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/export?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(res1.status).toBe(200);
    const html1 = await res1.text();
    expect(html1).toContain('215.5');
    expect(html1).toContain('15,000');
    expect(html1).toContain('1,250');
    expect(html1).toContain('550,000');
    expect(html1).toContain('법인 매수');
    expect(html1).toContain('46,000');
    expect(state.imProGrants.get(grantId)?.download_count).toBe(1);

    // 2nd export (via PPTX + x-grant-token header) -> 200, increments download_count to 2 (limit = 2)
    const res2 = await getImProPptx(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/pptx`, {
        headers: { 'x-grant-token': grantToken },
      }),
      { params: Promise.resolve({ grantId }) },
    );
    expect(res2.status).toBe(200);
    expect(state.pptxRenderSpy).toHaveBeenCalledTimes(1);
    expect(state.imProGrants.get(grantId)?.download_count).toBe(2);

    // 3rd export (both export & pptx) -> 429 exhausted (no PPTX render!)
    state.pptxRenderSpy.mockClear();
    const res3Export = await getImProExport(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/export?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(res3Export.status).toBe(429);

    const res3Pptx = await getImProPptx(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/pptx?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(res3Pptx.status).toBe(429);
    expect(state.pptxRenderSpy).not.toHaveBeenCalled();

    // Atomic CAS contention simulation: pre-check passes (download_count=1 < 2), but CAS .lt matches 0 rows -> 429 BEFORE PPTX render!
    state.imProGrants.get(grantId)!.download_count = 1;
    state.activityEvents = [];
    state.simulateCasExhausted = true;
    const casRes = await getImProPptx(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/pptx?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(casRes.status).toBe(429);
    expect(state.pptxRenderSpy).not.toHaveBeenCalled();
  });

  it('5. map-upload rejects >5MB, invalid MIME, and spoofed magic bytes with 400; accepts valid PNG', async () => {
    const projectId = 'proj-map-1';
    const bldgId = 'bldg-map-1';
    state.studioProjects.set(projectId, { id: projectId, dealId: bldgId });
    state.buildings.set(bldgId, { id: bldgId, owner_id: 'broker-1' });

    const makeFormReq = (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slideId', 'slide-map');
      return new NextRequest(`http://localhost/api/broker/basic-im-studio/${projectId}/map-upload`, {
        method: 'POST',
        body: fd,
      });
    };

    // 1. Disallowed MIME (SVG)
    const svgFile = new File([Buffer.from('<svg></svg>')], 'map.svg', { type: 'image/svg+xml' });
    const svgRes = await postMapUpload(makeFormReq(svgFile), { params: Promise.resolve({ id: projectId }) });
    expect(svgRes.status).toBe(400);

    // 2. Spoofed MIME (declared image/png, payload is HTML script)
    const spoofedFile = new File([Buffer.from('<script>alert(1)</script>')], 'fake.png', {
      type: 'image/png',
    });
    const spoofRes = await postMapUpload(makeFormReq(spoofedFile), {
      params: Promise.resolve({ id: projectId }),
    });
    expect(spoofRes.status).toBe(400);

    // 3. Oversized >5MB
    const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 16, 0x00);
    bigBuf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const bigFile = new File([bigBuf], 'huge.png', { type: 'image/png' });
    const bigRes = await postMapUpload(makeFormReq(bigFile), { params: Promise.resolve({ id: projectId }) });
    expect(bigRes.status).toBe(400);

    // 4. Valid PNG header <= 5MB
    const validPng = new File(
      [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])],
      'valid.png',
      { type: 'image/png' },
    );
    const okRes = await postMapUpload(makeFormReq(validPng), { params: Promise.resolve({ id: projectId }) });
    expect(okRes.status).toBe(200);
    expect(state.slidePatches).toHaveLength(1);
  });

  it('6. /api/im/validate requires broker auth, aligns Pro IM to A|B, and admin bypasses approve-override/save-sections ownership', async () => {
    // Unauthenticated /api/im/validate -> 401
    state.mockAuth.user = null;
    const unauthRes = await postImValidate(
      new NextRequest('http://localhost/api/im/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investment_posture: 'income', asking_price_manwon: 50000 }),
      }),
    );
    expect(unauthRes.status).toBe(401);

    // Authenticated broker with Grade B data -> Pro eligible
    state.mockAuth.user = { id: 'broker-1', email: 'broker1@credeal.kr' };
    state.mockAuth.role = 'broker';
    const gradeBRes = await postImValidate(
      new NextRequest('http://localhost/api/im/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investment_posture: 'income',
          tier: 'pro',
          asking_price_manwon: 50000,
          monthly_rent_total_krw: 25_000_000,
          resolved_address: '서울특별시 강남구 역삼동 100',
          resolved_pnu: '1168010100101000000',
        }),
      }),
    );
    expect(gradeBRes.status).toBe(200);
    const gradeBJson = await gradeBRes.json();
    expect(gradeBJson.grade).toBe('B');
    expect(gradeBJson.isProEligible).toBe(true);
    expect(gradeBJson.canGenerate).toBe(true);

    // Admin bypass on save-sections & approve-override for foreign broker's doc
    const docId = 'doc-owned-by-other';
    state.documentObjects.set(docId, {
      id: docId,
      owner_id: 'other-broker',
      broker_id: 'other-broker',
      building_id: 'bldg-other',
      status: 'draft',
      body: {
        im_type: 'mobile_im_lite',
        releaseTier: 'fact_om',
        sections: [{ section_type: 'property_overview', title: '개요', markdown: '내용' }],
        floor_leases: [
          { floor: '1F', area_sqm: 100, rent_manwon: 300, deposit_manwon: 3000 },
          { floor: '2F', area_sqm: 100, rent_manwon: 300, deposit_manwon: 3000 },
          { floor: '3F', area_sqm: 100, rent_manwon: 300, deposit_manwon: 3000 },
        ],
        rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 100 },
        rentroll_checks: { V12: { code: 'V12', level: 'block', overridden: false, value: 3, message: '단위 혼동 의심' } },
        gateReport: { scope: 'rentroll_v15', blocked: true, failedBlocks: [{ id: 'V12' }], results: [] },
      },
    });

    // Foreign broker -> 403
    state.mockAuth.user = { id: 'intruder-broker' };
    state.mockAuth.role = 'broker';
    const foreignSave = await putSaveSections(
      new NextRequest(`http://localhost/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: [{ section_type: 'property_overview', title: '개요', markdown: '수정' }],
        }),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(foreignSave.status).toBe(403);

    const foreignOverride = await postApproveOverride(
      new NextRequest(`http://localhost/api/broker/im-lite/${docId}/approve-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: '권한 없는 타인의 해제 시도' }),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(foreignOverride.status).toBe(403);

    // Admin -> 200 on both save-sections and approve-override
    state.mockAuth.user = { id: 'admin-user' };
    state.mockAuth.role = 'admin';
    const adminSave = await putSaveSections(
      new NextRequest(`http://localhost/api/broker/im-lite/${docId}/save-sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sections: [{ section_type: 'property_overview', title: '개요', markdown: '관리자 수정' }],
        }),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(adminSave.status).toBe(200);

    const adminOverride = await postApproveOverride(
      new NextRequest(`http://localhost/api/broker/im-lite/${docId}/approve-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: '등기부등본 및 건축물대장 기준 평형 단위 교차 확인 완료' }),
      }),
      { params: Promise.resolve({ id: docId }) },
    );
    expect(adminOverride.status).toBe(200);
  });

  it('7. gate-requests/[id]/review and pro-grants/[id]/approve both issue im_pro_grants when not pre-created', async () => {
    const bldgId = 'bldg-gate-701';
    state.buildings.set(bldgId, { id: bldgId, owner_id: 'broker-1' });
    state.gateRequests.set('gr-review-701', {
      id: 'gr-review-701',
      building_id: bldgId,
      requester_id: null,
      requested_level: 'G2',
      status: 'submitted',
      reason: JSON.stringify({ name: '최매수', phone: '010-2222-3333', email: 'choi@reits.kr' }),
    });

    state.mockAuth.user = { id: 'broker-1', email: 'broker1@credeal.kr' };
    state.mockAuth.role = 'broker';

    const revRes = await patchReviewGate(
      new NextRequest('http://localhost/api/gate-requests/gr-review-701/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'gr-review-701' }) },
    );
    expect(revRes.status).toBe(200);
    const revJson = await revRes.json();
    expect(revJson.ok).toBe(true);
    expect(revJson.grant?.status).toBe('pending_nda');
    expect(revJson.grantToken).toMatch(/^[0-9a-f]{64}$/);
    expect(state.imProGrants.get(revJson.grantId)?.gate_request_id).toBe('gr-review-701');

    // Now test pro-grants/[id]/approve with a gate_requests id that has NO pre-created im_pro_grants row
    state.gateRequests.set('gr-approve-702', {
      id: 'gr-approve-702',
      building_id: bldgId,
      requester_id: null,
      requested_level: 'G3',
      status: 'submitted',
      reason: JSON.stringify({ name: '한매수', phone: '010-4444-5555' }),
    });
    const appRes = await postApproveProGrant(
      new NextRequest('http://localhost/api/broker/pro-grants/gr-approve-702/approve', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'gr-approve-702' }) },
    );
    expect(appRes.status).toBe(200);
    const appJson = await appRes.json();
    expect(appJson.ok).toBe(true);
    expect(appJson.status).toBe('pending_nda');
    expect(appJson.grantToken).toMatch(/^[0-9a-f]{64}$/);
    expect(state.imProGrants.get(appJson.id)?.gate_request_id).toBe('gr-approve-702');
  });

  it('8. camelCase Pro export fields render cleanly and view route handles 23503 FK fallback cleanly', async () => {
    const grantId = 'grant-camel-1';
    const bldgId = 'bldg-camel-1';
    const grantToken = 'tok-camel-8-valid';
    state.imProGrants.set(grantId, {
      id: grantId,
      building_id: bldgId,
      broker_id: 'owner-broker',
      grant_token: grantToken,
      requester_name: '오투자',
      requester_phone: '010-6666-7777',
      status: 'active',
      nda_signed_at: new Date().toISOString(),
      pdf_export_allowed: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      max_downloads: 5,
      download_count: 0,
    });
    state.documentObjects.set('doc-camel-1', {
      id: 'doc-camel-1',
      building_id: bldgId,
      document_type: 'im_pro',
      status: 'published',
      title: '서초 프라임',
      body: {
        title: '서초 프라임',
        sections: [{ title: '개요', markdown: '서초역 인근' }],
        floorLeases: [
          { floor: '5F', tenantType: '리테일', areaSqm: 150, depositManwon: 10000, monthlyRentManwon: 850 },
        ],
        loanSimulation: { ltvPct: 60, loanAmountManwon: 300000, interestRatePct: 4.5 },
        taxScenarios: { entityType: '법인', acquisitionTaxManwon: 23000 },
      },
    });

    const expRes = await getImProExport(
      new NextRequest(`http://localhost/api/public/im-pro/${grantId}/export?token=${grantToken}`),
      { params: Promise.resolve({ grantId }) },
    );
    expect(expRes.status).toBe(200);
    const html = await expRes.text();
    expect(html).toContain('리테일');
    expect(html).toContain('10,000');
    expect(html).toContain('850');
    expect(html).toContain('300,000');
    expect(html).toContain('23,000');

    // View route handles 23503 FK error gracefully with building_ssot_lite_id: null fallback
    // WP-7.3D P2-3 (intentional hardening): only share-token-authorized views are recorded,
    // so the beacon carries a real share token for this standalone workspace IM.
    const { issueShareLinkToken } = await import('@/lib/security/share-link-tokens');
    const viewToken = await issueShareLinkToken({ buildingId: 'standalone-ws-1', brokerId: 'broker-1' });
    state.injectActivityFkOnce = true;
    const viewRes = await postImLiteView(
      new NextRequest('http://localhost/api/public/im-lite/standalone-ws-1/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_viewed: 'cover', share_token: viewToken.token }),
      }),
      { params: Promise.resolve({ buildingId: 'standalone-ws-1' }) },
    );
    expect(viewRes.status).toBe(200);
    expect(state.activityEvents.some((ev) => ev.building_ssot_lite_id === null && ev.building_id === 'standalone-ws-1')).toBe(true);
  });

  it('9. Wave 7.2D: photos/upload <350KB SVG returns 415, MobileIMViewer forwards shareToken, RPC+CAS fallback works, and grossYield subtracts deposit', async () => {
    const supabase = createServiceClient();

    // 9a. photos/upload rejects <350KB SVG & spoofed PNG with HTTP 415
    const bldgId = 'bldg-photo-sec-1';
    state.buildings.set(bldgId, { id: bldgId, owner_id: 'broker-1', title: '포토 테스트 빌딩' });
    const makePhotoReq = (file: File) => {
      const fd = new FormData();
      fd.append('files', file);
      return new NextRequest(`http://localhost/api/broker/buildings/${bldgId}/photos/upload`, {
        method: 'POST',
        body: fd,
      });
    };

    const smallSvg = new File([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')], 'xss.svg', {
      type: 'image/svg+xml',
    });
    const svgRes = await postPhotoUpload(makePhotoReq(smallSvg), {
      params: Promise.resolve({ id: bldgId }),
    });
    expect(svgRes.status).toBe(415);

    const spoofedPng = new File([Buffer.from('<html><script>alert(1)</script></html>')], 'spoof.png', {
      type: 'image/png',
    });
    const spoofRes = await postPhotoUpload(makePhotoReq(spoofedPng), {
      params: Promise.resolve({ id: bldgId }),
    });
    expect(spoofRes.status).toBe(415);

    // 9b. MobileIMViewer forwards shareToken into resolved PPTX download anchor href
    const markup = renderToStaticMarkup(
      React.createElement(MobileIMViewer, {
        document: {
          buildingId: 'bldg-viewer-1',
          title: '테스트 빌딩',
          subtitle: '강남구 테헤란로',
          dataGrade: 'B',
          sections: [],
          facts: {
            buildingName: '테스트 빌딩',
            roadAddress: '서울 강남구 테헤란로 1',
            askPriceManwon: 1000000,
            depositManwon: 100000,
            monthlyRentManwon: 5000,
            landAreaSqm: 500,
            grossAreaSqm: 1500,
            builtYear: 2020,
            floorsText: 'B2/10F',
          },
          metadata: { title: '테스트 빌딩', generatedAt: '2026-01-01', tier: 'im_lite' },
        } as any,
        buildingId: 'bldg-viewer-1',
        docId: 'doc-viewer-1',
        shareToken: 'slk.buyer.tok',
      }),
    );
    expect(markup).toContain('/api/public/im-lite/bldg-viewer-1/pptx?direct=1&amp;doc_id=doc-viewer-1&amp;token=slk.buyer.tok');

    // 9c. consumeProGrantDownload prefers RPC when present and falls back cleanly on 42883
    state.imProGrants.set('grant-rpc-1', {
      id: 'grant-rpc-1',
      max_downloads: 2,
      download_count: 0,
    });
    state.rpcMode = 'atomic_ok';
    const rpcOk = await consumeProGrantDownload(supabase as any, 'grant-rpc-1', 2, 0);
    expect(rpcOk.ok).toBe(true);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.imProGrants.get('grant-rpc-1')?.download_count).toBe(1);

    state.rpcMode = 'missing_rpc';
    const casFallbackOk = await consumeProGrantDownload(supabase as any, 'grant-rpc-1', 2, 1);
    expect(casFallbackOk.ok).toBe(true);
    expect(state.imProGrants.get('grant-rpc-1')?.download_count).toBe(2);

    const quotaExhausted = await consumeProGrantDownload(supabase as any, 'grant-rpc-1', 2, 2);
    expect(quotaExhausted.ok).toBe(false);
    expect(quotaExhausted.status).toBe(429);

    // 9d. computeGrossYieldPct subtracts depositTotalManwon when askingPriceManwon > depositTotalManwon
    expect(computeGrossYieldPct(5000, 1000000, 100000)).toBe(6.67);
    expect(computeGrossYieldPct(5000, 1000000, 0)).toBe(6);
  });
});
