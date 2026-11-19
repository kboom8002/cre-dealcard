/**
 * Wave 5 (WP 5-A):
 * Real PostgreSQL + RLS Route Handler Integration Suite backed by @electric-sql/pglite.
 * Exercises actual HTTP route handlers for:
 *  - POST /api/broker/inbox/import-contacts & GET /api/broker/inbox (range pagination + pending consent)
 *  - POST /api/broker/inbox/actions (resubscribe block on suppressed/unsubscribed CRM clients + gateRequestId IDOR)
 *  - GET/PATCH /api/broker/workspace/summary (cross-tenant hijack, statutory 5-field 422 gate, canonical persistence)
 *  - PATCH /api/broker/deal-card/[id] (cross-tenant 403/404, blind guard & price band validation)
 *  - POST /api/public/im-lite/[buildingId]/view & GET /api/public/im-lite/[buildingId] (token/revoked/draft guards)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';

const h = vi.hoisted(() => ({
  serviceClient: null as ReturnType<PgliteSupabaseHarness['createClient']> | null,
  authUser: null as { id: string; email: string; role?: string } | null,
  viewer: null as { userId: string | null; isAdmin: boolean } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.serviceClient,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.serviceClient,
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, role: h.authUser.role || 'broker', error: null }
      : {
          user: null,
          role: null,
          error: new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
        },
}));

vi.mock('@/lib/server-viewer', () => ({
  getServerViewer: async () => h.viewer,
}));

import { GET as inboxGET } from '@/app/api/broker/inbox/route';
import { POST as importContactsPOST } from '@/app/api/broker/inbox/import-contacts/route';
import { POST as inboxActionsPOST } from '@/app/api/broker/inbox/actions/route';
import { GET as summaryGET, PATCH as summaryPATCH } from '@/app/api/broker/workspace/summary/route';
import { PATCH as dealCardPATCH } from '@/app/api/broker/deal-card/[id]/route';
import { GET as publicImGET } from '@/app/api/public/im-lite/[buildingId]/route';
import { POST as publicImViewPOST } from '@/app/api/public/im-lite/[buildingId]/view/route';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import { resetInboxSchemaCapsForTests } from '@/lib/inbox/inbox-schema-caps';
import { issueShareLinkToken, resetShareLinkTokenStoreForTests, revokeShareLinkToken } from '@/lib/security/share-link-tokens';
import { hashEmailForSuppression } from '@/lib/legal/email-suppression';

const BROKER_COMPLETE = 'aaaaaaaa-5555-4555-8555-555555555501';
const BROKER_INCOMPLETE = 'aaaaaaaa-5555-4555-8555-555555555502';
const BROKER_OTHER = 'bbbbbbbb-5555-4555-8555-555555555503';
const BLD_COMPLETE_UUID = '11111111-5555-4555-8555-555555555511';
const BLD_INCOMPLETE_UUID = '22222222-5555-4555-8555-555555555522';
const GATE_REQ_A_UUID = '33333333-5555-4555-8555-555555555533';

describe('Wave 5 PGlite Real-SQL Route Integration Suite', () => {
  let harness: PgliteSupabaseHarness;
  const savedEnv = { ...process.env };

  async function execSql<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await harness.db.query<T>(sql, params);
    return res.rows;
  }

  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    h.serviceClient = harness.createClient({ role: 'service_role' });

    await harness.seedUser({
      id: BROKER_COMPLETE,
      email: 'complete5@credeal.test',
      displayName: '김정석',
      company: '정석중개법인',
      phone: '02-555-1234',
      slug: 'broker-complete-5',
      registrationNo: '11680-2024-00999',
      officeAddress: '서울특별시 강남구 테헤란로 100',
    });

    await harness.seedUser({
      id: BROKER_INCOMPLETE,
      email: 'incomplete5@credeal.test',
      displayName: '박미비',
      company: '미비중개사무소',
      phone: '02-555-5678',
      slug: 'broker-incomplete-5',
      officeAddress: '서울특별시 서초구 서초대로 50',
    });
    await execSql(
      `UPDATE public.broker_profiles SET office_reg_number = NULL WHERE user_id = $1`,
      [BROKER_INCOMPLETE],
    );

    await harness.seedUser({
      id: BROKER_OTHER,
      email: 'other5@credeal.test',
      displayName: '이타인',
      company: '타인중개법인',
      phone: '02-555-9012',
      slug: 'broker-other-5',
      registrationNo: '11710-2024-00111',
      officeAddress: '서울특별시 송파구 올림픽로 30',
    });

    await execSql(
      `INSERT INTO public.building_ssot_lite (id, owner_id, area_signal, asset_type, price_band, status)
       VALUES ($1, $2, '역삼역 권역', '업무시설', '180~210억', 'draft'),
              ($3, $4, '서초역 권역', '근린생활시설', '90~110억', 'draft')`,
      [BLD_COMPLETE_UUID, BROKER_COMPLETE, BLD_INCOMPLETE_UUID, BROKER_INCOMPLETE],
    );

    await execSql(
      `INSERT INTO public.gate_requests (id, building_id, target_broker_id, requested_level, reason, status)
       VALUES ($1, $2, $3, 'G2', '투자검토 자료 요청', 'submitted')`,
      [GATE_REQ_A_UUID, BLD_COMPLETE_UUID, BROKER_COMPLETE],
    );
  }, 45_000);

  afterAll(async () => {
    await harness?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  });

  beforeEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = savedEnv.NODE_ENV;
    process.env.DISABLE_MEMORY_STORE = '1';
    process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
    process.env.SHARE_LINK_SECRET = 'wave5-share-link-secret-32-chars-minimum!';
    process.env.UNSUBSCRIBE_SECRET = 'wave5-unsubscribe-secret-32-chars-minimum!';
    process.env.RESEND_DRY_RUN = '1';
    resetWorkspaceRepositoryCacheForTests();
    resetInboxSchemaCapsForTests();
    resetShareLinkTokenStoreForTests();
    h.authUser = { id: BROKER_COMPLETE, email: 'complete5@credeal.test', role: 'broker' };
    h.viewer = null;
  });

  it('GET /api/broker/inbox & POST /api/broker/inbox/import-contacts: pending opt-in, SQL range pagination, and cross-tenant isolation', async () => {
    const contacts = Array.from({ length: 55 }, (_, i) => ({
      name: `웨이브고객-${String(i + 1).padStart(2, '0')}`,
      phone: `010-8100-${String(i + 1).padStart(4, '0')}`,
      email: `w5client_${i + 1}@credeal.test`,
      clientRole: 'buyer' as const,
      preferredRegions: '강남권역',
      budgetText: '150~200억',
      marketingConsent: true,
    }));

    const impRes = await importContactsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/import-contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contacts, registerAsNewsletterSubscriber: true }),
      }),
    );
    expect(impRes.status).toBe(200);
    const impJson = await impRes.json();
    expect(impJson.ok).toBe(true);
    expect(impJson.importedCount).toBe(55);

    const dbClients = await execSql<{ consent_status: string }>(
      `SELECT consent_status FROM public.broker_clients WHERE broker_id = $1`,
      [BROKER_COMPLETE],
    );
    expect(dbClients).toHaveLength(55);
    expect(dbClients.every((r) => r.consent_status === 'pending')).toBe(true);

    // SQL range pagination: page 1 (20) + page 2 (20) + page 3 (15) = 55 unique
    const p1 = await (await inboxGET(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=0&clientPageSize=20'))).json();
    const p2 = await (await inboxGET(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=20&clientPageSize=20'))).json();
    const p3 = await (await inboxGET(new NextRequest('http://localhost:3000/api/broker/inbox?clientOffset=40&clientPageSize=20'))).json();
    expect(p1.clients).toHaveLength(20);
    expect(p2.clients).toHaveLength(20);
    expect(p3.clients).toHaveLength(15);
    expect(p1.pagination.totalClients).toBe(55);
    expect(p1.pagination.hasMoreClients).toBe(true);
    expect(p3.pagination.hasMoreClients).toBe(false);

    // BROKER_OTHER must see zero clients/leads owned by BROKER_COMPLETE
    h.authUser = { id: BROKER_OTHER, email: 'other5@credeal.test', role: 'broker' };
    const otherInbox = await (await inboxGET(new NextRequest('http://localhost:3000/api/broker/inbox'))).json();
    expect(otherInbox.clients).toHaveLength(0);
    expect(otherInbox.gateRequests).toHaveLength(0);
  }, 30_000);

  it('POST /api/broker/inbox/actions: blocks re-subscribing suppressed CRM client (403) and cross-tenant gateRequestId IDOR (403)', async () => {
    const [clientRow] = await execSql<{ id: string; email: string }>(
      `SELECT id, email FROM public.broker_clients WHERE broker_id = $1 LIMIT 1`,
      [BROKER_COMPLETE],
    );
    expect(clientRow?.id).toBeTruthy();

    await execSql(
      `UPDATE public.broker_clients SET consent_status = 'unsubscribed', unsubscribed_at = now() WHERE id = $1`,
      [clientRow.id],
    );
    await execSql(
      `INSERT INTO public.email_suppressions (email_hash, scope, broker_id, reason)
       VALUES ($1, 'global', NULL, 'unsubscribe')
       ON CONFLICT DO NOTHING`,
      [hashEmailForSuppression(clientRow.email)],
    );

    const resubRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_newsletter',
          clientId: `cli-${clientRow.id}`,
          subscribed: true,
        }),
      }),
    );
    expect(resubRes.status).toBe(403);
    // WP-7.3E P2-11: consistent string `error` with top-level `code`
    const resubJson = await resubRes.json();
    expect(resubJson.code).toBe('RECIPIENT_SELF_OPTIN_REQUIRED');
    expect(typeof resubJson.error).toBe('string');

    // Cross-tenant IDOR attempt on BROKER_COMPLETE's gate_requests row
    h.authUser = { id: BROKER_OTHER, email: 'other5@credeal.test', role: 'broker' };
    const idorRes = await inboxActionsPOST(
      new NextRequest('http://localhost:3000/api/broker/inbox/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'approve_gate',
          threadId: `srv-${GATE_REQ_A_UUID}`,
          buildingId: BLD_COMPLETE_UUID,
        }),
      }),
    );
    expect(idorRes.status).toBe(403);
  });

  it('GET/PATCH /api/broker/workspace/summary & PATCH /api/broker/deal-card/[id]: statutory 422 gate, blind price band, canonical workspace_items, and IDOR 403', async () => {
    // 1. BROKER_INCOMPLETE blocked from publishing ('sent') without office_reg_number -> 422
    h.authUser = { id: BROKER_INCOMPLETE, email: 'incomplete5@credeal.test', role: 'broker' };
    const blockedPubRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          buildingId: BLD_INCOMPLETE_UUID,
          status: 'sent',
          card4: {
            region: '서초역 인근',
            use: '근린생활시설',
            priceBand: '90~110억',
            points: ['더블역세권', '우량 임차 구성', '리모델링 완료'],
            provenance: { points: ['broker', 'broker', 'broker'] },
          },
        }),
      }),
    );
    expect(blockedPubRes.status).toBe(422);
    const blockedJson = await blockedPubRes.json();
    expect(blockedJson.code).toBe('STATUTORY_DISCLOSURE_INCOMPLETE');
    expect(blockedJson.missingFields).toContain('office_reg_number');

    // 2. BROKER_COMPLETE publishes dealcard ('bld-w5-canon') -> 200 persisted in workspace_items
    h.authUser = { id: BROKER_COMPLETE, email: 'complete5@credeal.test', role: 'broker' };
    const pubRes = await summaryPATCH(
      new NextRequest('http://localhost:3000/api/broker/workspace/summary', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert',
          buildingId: 'bld-w5-canon',
          status: 'sent',
          card4: {
            region: '강남 역삼권역',
            use: '업무시설',
            priceBand: '180~210억',
            points: ['역세권 도보 3분', '전층 임차 완료', '신축급 컨디션'],
            provenance: { points: ['broker', 'broker', 'broker'] },
          },
        }),
      }),
    );
    expect(pubRes.status).toBe(200);
    const pubJson = await pubRes.json();
    expect(pubJson.ok).toBe(true);
    expect(pubJson.id).toMatch(/^[0-9a-f-]{36}$/i);

    const sumRes = await summaryGET(new NextRequest('http://localhost:3000/api/broker/workspace/summary'));
    expect(sumRes.status).toBe(200);
    const sumJson = await sumRes.json();
    expect(Array.isArray(sumJson.dealcards)).toBe(true);
    expect(sumJson.dealcards.some((x: any) => x.id === 'bld-w5-canon' || x.id === pubJson.id || x.legacyId === 'bld-w5-canon')).toBe(true);

    // 3. Cross-tenant hijack via PATCH /api/broker/deal-card/[id] -> 403
    h.authUser = { id: BROKER_OTHER, email: 'other5@credeal.test', role: 'broker' };
    const stealRes = await dealCardPATCH(
      new NextRequest('http://localhost:3000/api/broker/deal-card/bld-w5-canon', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          card4: {
            region: '강남권역',
            use: '업무시설',
            priceBand: '180~210억',
            points: ['탈취 시도', '우량 매물', '투자 추천'],
            provenance: { points: ['broker', 'broker', 'broker'] },
          },
        }),
      }),
      { params: Promise.resolve({ id: 'bld-w5-canon' }) },
    );
    expect(stealRes.status).toBe(403);

    // 4. Exact-price / address leak blind guard rejection via PATCH /api/broker/deal-card/[id] -> 422
    h.authUser = { id: BROKER_COMPLETE, email: 'complete5@credeal.test', role: 'broker' };
    const blindFailRes = await dealCardPATCH(
      new NextRequest('http://localhost:3000/api/broker/deal-card/bld-w5-canon', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          card4: {
            region: '역삼동 736-1',
            use: '업무시설',
            priceBand: '195억',
            points: ['테헤란로 100번지 빌딩', '우량 임차', '수익 우수'],
            provenance: { points: ['broker', 'broker', 'broker'] },
          },
        }),
      }),
      { params: Promise.resolve({ id: 'bld-w5-canon' }) },
    );
    expect(blindFailRes.status).toBe(422);
  });

  it('Public IM routes (/api/public/im-lite/[buildingId] & /view): enforces draft, token required, revoked, and valid view telemetry', async () => {
    const svc = h.serviceClient!;
    // Draft IM item -> anonymous 404
    const draftImId = '44444444-5555-4555-8555-555555555544';
    await svc.from('workspace_items').insert({
      id: draftImId,
      owner_id: BROKER_COMPLETE,
      building_id: BLD_COMPLETE_UUID,
      kind: 'im',
      status: 'draft',
      title: '비공개 IM 초안',
      draft_payload: {
        buildingId: draftImId,
        fullName: '비공개 IM 초안',
        sections: [{ title: '요약', markdown: '초안 본문' }],
      },
      published_snapshot: null,
    });

    const draftRes = await publicImGET(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${draftImId}`),
      { params: Promise.resolve({ buildingId: draftImId }) },
    );
    expect(draftRes.status).toBe(404);

    // Published IM item -> missing token 403 -> issued token 200 -> view telemetry 200 -> revoked 403
    const pubImId = '55555555-5555-4555-8555-555555555555';
    await svc.from('workspace_items').insert({
      id: pubImId,
      owner_id: BROKER_COMPLETE,
      building_id: BLD_COMPLETE_UUID,
      kind: 'im',
      status: 'published',
      title: '공개 검증 IM',
      draft_payload: { buildingId: pubImId, fullName: '내부 초안' },
      published_snapshot: {
        buildingId: pubImId,
        buildingName: '공개 검증 IM',
        fullName: '공개 검증 IM',
        address: '역삼역 권역',
        posture: 'income',
        sections: [{ id: 's1', section_type: 'summary', title: '요약', markdown: '검증 통과' }],
      },
    });

    const untokenedRes = await publicImGET(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubImId}`),
      { params: Promise.resolve({ buildingId: pubImId }) },
    );
    expect(untokenedRes.status).toBe(403);

    const issued = await issueShareLinkToken({ buildingId: pubImId, brokerId: BROKER_COMPLETE });
    const okRes = await publicImGET(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubImId}?token=${encodeURIComponent(issued.token)}`),
      { params: Promise.resolve({ buildingId: pubImId }) },
    );
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json();
    expect(okJson.data.fullName).toBe('공개 검증 IM');

    const viewRes = await publicImViewPOST(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubImId}/view`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventType: 'deal_card_view', durationSec: 12 }),
      }),
      { params: Promise.resolve({ buildingId: pubImId }) },
    );
    expect(viewRes.status).toBe(200);

    await revokeShareLinkToken({ token: issued.token, buildingId: pubImId, brokerId: BROKER_COMPLETE, reason: 'closed' });
    const revokedRes = await publicImGET(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${pubImId}?token=${encodeURIComponent(issued.token)}`),
      { params: Promise.resolve({ buildingId: pubImId }) },
    );
    expect(revokedRes.status).toBe(403);
  });
});
