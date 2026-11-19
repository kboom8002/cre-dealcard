import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  serviceClientFactory: vi.fn(),
  requireBroker: vi.fn(),
  workspaceItemByAnyId: vi.fn(),
  publicWorkspaceProjection: vi.fn(),
  softDeleteWorkspaceItem: vi.fn(),
  upsertWorkspaceItem: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => hoisted.requireBroker(...args),
}));

vi.mock('@/lib/workspace/workspace-repository', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspace/workspace-repository')>(
    '@/lib/workspace/workspace-repository'
  );
  return {
    ...actual,
    getWorkspaceItemByAnyId: (...args: unknown[]) => hoisted.workspaceItemByAnyId(...args),
    getPublicWorkspaceProjection: (...args: unknown[]) => hoisted.publicWorkspaceProjection(...args),
    softDeleteWorkspaceItem: (...args: unknown[]) => hoisted.softDeleteWorkspaceItem(...args),
    upsertWorkspaceItem: (...args: unknown[]) => hoisted.upsertWorkspaceItem(...args),
  };
});

import { DELETE as deleteDealCardByRoute } from '@/app/api/broker/deal-card/[id]/delete/route';
import { PATCH as patchDealCard } from '@/app/api/broker/deal-card/[id]/route';
import { POST as gateSubmitPOST } from '@/app/api/public/gate/submit/route';
import { POST as gateRequestsPOST } from '@/app/api/gate-requests/route';
import { createGateRequest } from '@/domain/gate/gate-request';
import {
  deleteQuickImRecord,
  getQuickImRecord,
  saveQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import { WorkspaceRepositoryError } from '@/lib/workspace/workspace-repository';

const BROKER_A = '11111111-1111-4111-8111-111111111101';
const BLD_DRAFT_UUID = '22222222-2222-4222-8222-222222222202';

function makeDb(handler: (table: string, op: string) => { data?: unknown; error?: unknown }) {
  return {
    from: (table: string) => {
      let op = 'select';
      const run = () => Promise.resolve(handler(table, op));
      const chain: any = {
        select: () => chain,
        insert: () => {
          op = 'insert';
          return chain;
        },
        update: () => {
          op = 'update';
          return chain;
        },
        upsert: () => {
          op = 'upsert';
          return chain;
        },
        delete: () => {
          op = 'delete';
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: run,
        single: run,
        then: (onF: any, onR?: any) => run().then(onF, onR),
      };
      return chain;
    },
  };
}

describe('Kernel K2: DealCard SSoT Publish/Gate/Delete State Machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteQuickImRecord('quick-k2-delete-check');
    hoisted.requireBroker.mockResolvedValue({
      user: { id: BROKER_A, email: 'broker@test.local' },
      role: 'broker',
      error: null,
    });
  });

  it('1) blocks gate/submit (404), createGateRequest (NotFoundError), and /api/gate-requests (404 + no cookie) when workspace_items is draft even if building_ssot_lite row exists', async () => {
    // Co-existing building_ssot_lite row must NEVER allow bypassing draft workspace_items!
    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: true,
      revoked: false,
      deleted: false,
      status: 'draft',
      ownerId: BROKER_A,
      projection: null,
    });
    hoisted.serviceClientFactory.mockReturnValue(
      makeDb((table) => {
        if (table === 'building_ssot_lite') {
          return { data: { id: BLD_DRAFT_UUID, owner_id: BROKER_A, status: 'draft' }, error: null };
        }
        return { data: null, error: null };
      })
    );

    const submitRes = await gateSubmitPOST(
      new NextRequest('http://localhost/api/public/gate/submit', {
        method: 'POST',
        body: JSON.stringify({
          dealId: BLD_DRAFT_UUID,
          formData: {
            budgetBand: '100~200억',
            purpose: '임대수익',
            financing: '전액 자기자본',
            entityType: '법인',
            name: '김매수',
            phone: '010-1234-5678',
            consent: true,
          },
        }),
      })
    );
    expect(submitRes.status).toBe(404);
    expect(submitRes.headers.get('set-cookie')).toBeNull();

    await expect(
      createGateRequest(
        {
          buildingId: BLD_DRAFT_UUID,
          requestedLevel: 'G1',
          requestedFields: ['broker_contact_request'],
        },
        null
      )
    ).rejects.toThrow();

    const gateReqRes = await gateRequestsPOST(
      new NextRequest('http://localhost/api/gate-requests', {
        method: 'POST',
        body: JSON.stringify({
          buildingId: BLD_DRAFT_UUID,
          requestedLevel: 'G1',
          name: '김매수',
          phone: '010-1234-5678',
          privacyConsent: true,
        }),
      })
    );
    expect(gateReqRes.status).toBe(404);
    expect(gateReqRes.headers.get('set-cookie')).toBeNull();
  });

  it('2) also blocks legacy building_ssot_lite with status=draft when workspace_items row does not exist yet', async () => {
    hoisted.publicWorkspaceProjection.mockResolvedValue({
      found: false,
      revoked: false,
      deleted: false,
      status: null,
      ownerId: null,
      projection: null,
    });
    hoisted.serviceClientFactory.mockReturnValue(
      makeDb((table) => {
        if (table === 'building_ssot_lite') {
          return { data: { id: BLD_DRAFT_UUID, owner_id: BROKER_A, status: 'draft' }, error: null };
        }
        return { data: null, error: null };
      })
    );

    const res = await gateRequestsPOST(
      new NextRequest('http://localhost/api/gate-requests', {
        method: 'POST',
        body: JSON.stringify({
          buildingId: BLD_DRAFT_UUID,
          requestedLevel: 'G1',
          name: '박검토',
          phone: '010-9876-5432',
          privacyConsent: true,
        }),
      })
    );
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('3) non-UUID DELETE checks DB softDelete BEFORE evicting memory and preserves honest 403/500 on failure', async () => {
    const legacyId = 'quick-k2-delete-check';
    saveQuickImRecord({
      buildingId: legacyId,
      documentId: 'doc-k2-delete-check',
      ownerId: BROKER_A,
      address: '서울시 강남구 역삼동 1-1',
      buildingName: '역삼빌딩',
      askingPriceManwon: 1_000_000,
      posture: 'income',
      card4: {
        headline: '강남구 역삼동 상업빌딩 매각',
        posture: 'income',
        region: '강남구 역삼동',
        use: '업무시설',
        area: '연면적 500평',
        priceBand: '180~210억',
        points: ['역세권 코너 입지', '장기 임차인 입점', '안정적 수익 창출'],
      } as any,
      basicImDoc: {} as any,
      rentRoll: [],
      fullDocBody: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    hoisted.serviceClientFactory.mockReturnValue(makeDb(() => ({ data: null, error: null })));

    // 3a. Unexpected DB error (500) must NOT delete in-memory record and must return 500
    hoisted.softDeleteWorkspaceItem.mockRejectedValue(new Error('postgres connection reset'));
    const failRes = await deleteDealCardByRoute(
      new NextRequest(`http://localhost/api/broker/deal-card/${legacyId}/delete`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: legacyId }) }
    );
    expect(failRes.status).toBe(500);
    expect(getQuickImRecord(legacyId)).toBeDefined();

    // 3b. Cross-tenant WorkspaceRepositoryError 403 preserves 403 and keeps memory intact
    hoisted.softDeleteWorkspaceItem.mockRejectedValue(
      new WorkspaceRepositoryError(403, 'FORBIDDEN', '삭제 권한이 없습니다.')
    );
    const forbidRes = await deleteDealCardByRoute(
      new NextRequest(`http://localhost/api/broker/deal-card/${legacyId}/delete`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: legacyId }) }
    );
    expect(forbidRes.status).toBe(403);
    expect(getQuickImRecord(legacyId)).toBeDefined();
  });

  it('4) PATCH /api/broker/deal-card/[id] returns honest 500 DB_WRITE_FAILED when workspace_items upsert fails unexpectedly', async () => {
    hoisted.serviceClientFactory.mockReturnValue(
      makeDb((table) => {
        if (table === 'building_ssot_lite') {
          return { data: { id: BLD_DRAFT_UUID, owner_id: BROKER_A, status: 'draft' }, error: null };
        }
        return { data: null, error: null };
      })
    );
    hoisted.workspaceItemByAnyId.mockResolvedValue({
      id: BLD_DRAFT_UUID,
      ownerId: BROKER_A,
      kind: 'dealcard',
      status: 'draft',
      version: 1,
      draftPayload: {},
    });
    hoisted.upsertWorkspaceItem.mockRejectedValue(new Error('deadlock detected'));

    const res = await patchDealCard(
      new NextRequest(`http://localhost/api/broker/deal-card/${BLD_DRAFT_UUID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card4: {
            headline: '강남구 역삼동 상업빌딩 매각',
            posture: 'income',
            region: '강남구 역삼동',
            use: '업무시설',
            area: '연면적 500평',
            priceBand: '180~210억',
            points: ['역세권 코너 입지 확보', '장기 우량 임차인 입점', '안정적 임대수익 창출'],
          },
        }),
      }),
      { params: Promise.resolve({ id: BLD_DRAFT_UUID }) }
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe('DB_WRITE_FAILED');
  });
});
