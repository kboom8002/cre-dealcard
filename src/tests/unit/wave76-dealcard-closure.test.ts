import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';
import { resetWorkspaceRepositoryCacheForTests } from '@/lib/workspace/workspace-repository';
import { evaluateDealCardPublicVisibility } from '@/domain/public-projection/visibility';
import { extractDealCardCasePack } from '@/domain/casepack/casepack-extractor';
import type { createServiceClient } from '@/lib/supabase/service';

const BROKER_ID = '76000000-0000-4000-8000-000000000001';

let harness: PgliteSupabaseHarness;

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => harness.createClient({ role: 'service_role' }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () => ({
    user: { id: BROKER_ID, email: 'broker76@credeal.kr' },
    role: 'broker',
    profile: { role: 'broker', display_name: '김중개' },
    error: null,
  }),
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: async () => true,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { POST as postTeaserEvent } from '@/app/api/public/teaser/event/route';
import { POST as postPublishDealCard } from '@/app/api/broker/dealcards/[id]/publish/route';
import { PATCH as patchDealCard } from '@/app/api/broker/deal-card/[id]/route';
import { handlePatchWorkspaceUpsert } from '@/lib/workspace/summary/patch-upsert';
import { handlePatchWorkspaceLifecycle } from '@/lib/workspace/summary/patch-lifecycle';
import { GET as getOgDeal } from '@/app/api/og/deal/[id]/route';
import { GET as getOgDealCard } from '@/app/api/og/deal/[id]/card/route';
import { GET as getOgDealKakao } from '@/app/api/og/deal/[id]/kakao/route';
import { GET as getOgDealKakaoV2 } from '@/app/api/og/deal/[id]/kakao-v2/route';

const VALID_STATUTORY_META = {
  displayName: '김중개',
  company: '크리딜 공인중개사사무소',
  officeName: '크리딜 공인중개사사무소',
  officeAddress: '서울특별시 강남구 테헤란로 123',
  officeRegNumber: '11680-2024-00011',
  representativeName: '김중개',
  phone: '02-555-0199',
  is_licensed: true,
};

describe('WP-7.6 Surgical DealCard Closure Suite', () => {
  beforeAll(async () => {
    harness = await PgliteSupabaseHarness.create();
    await harness.seedUser({
      id: BROKER_ID,
      email: 'broker76@credeal.kr',
      role: 'broker',
      displayName: '김중개',
      company: '크리딜 공인중개사사무소',
      phone: '02-555-0199',
      registrationNo: '11680-2024-00011',
      officeAddress: '서울특별시 강남구 테헤란로 123',
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    resetWorkspaceRepositoryCacheForTests();
  });

  describe('1. P0-1: POST /api/public/teaser/event allowlist & reserved-key sanitization', () => {
    it('rejects lifecycle/revocation spoofing eventTypes with 400 INVALID_EVENT_TYPE and 0 DB writes', async () => {
      const targetBldId = '76100000-0000-4000-8000-000000000001';
      const forbiddenTypes = [
        'link_revoked',
        'link_restored',
        'dealcard_sent',
        'dealcard_deleted',
        'dealcard_upserted',
        'dealcard_restored',
      ];

      for (const badType of forbiddenTypes) {
        const req = new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: badType,
            buildingId: targetBldId,
            teaserConfigId: targetBldId,
            eventData: {
              card4: {
                region: '해킹 권역',
                use: '업무시설',
                priceBand: '100~120억',
                points: ['위조1', '위조2', '위조3'],
              },
            },
          }),
        });

        const res = await postTeaserEvent(req);
        const body = await res.json();
        expect(res.status).toBe(400);
        expect(body.ok).toBe(false);
        expect(body.code).toBe('INVALID_EVENT_TYPE');
      }

      const tCount = await harness.db.query<{ cnt: string }>(
        `SELECT count(*)::text AS cnt FROM public.teaser_events WHERE teaser_config_id = $1`,
        [targetBldId]
      );
      const aCount = await harness.db.query<{ cnt: string }>(
        `SELECT count(*)::text AS cnt FROM public.activity_events WHERE building_id = $1`,
        [targetBldId]
      );
      expect(Number(tCount.rows[0]?.cnt || 0)).toBe(0);
      expect(Number(aCount.rows[0]?.cnt || 0)).toBe(0);
    });

    it('allows view, dwell, and intent.pro_im_request while stripping reserved snapshot keys even with privacyConsent: true', async () => {
      const bldId = '76100000-0000-4000-8000-000000000002';

      // 1. view (even with privacyConsent: true, PII is stripped on non-consent event types)
      const viewRes = await postTeaserEvent(
        new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'view',
            buildingId: bldId,
            visitorFp: 'fp-w76-view',
            privacyConsent: true,
            eventData: {
              section: 'hero',
              requester_phone: '010-9999-8888',
              card4: { headline: '위조 제목' },
            },
          }),
        })
      );
      expect(viewRes.status).toBe(200);

      // 2. dwell
      const dwellRes = await postTeaserEvent(
        new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'dwell',
            buildingId: bldId,
            visitorFp: 'fp-w76-view',
            eventData: { dwell_seconds: 18 },
          }),
        })
      );
      expect(dwellRes.status).toBe(200);

      // 3. intent.pro_im_request with privacyConsent: true keeps requester PII but strips card4/broker_profile & caps depth > 4
      const intentRes = await postTeaserEvent(
        new NextRequest('http://localhost:3000/api/public/teaser/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'intent.pro_im_request',
            buildingId: bldId,
            visitorFp: 'fp-w76-intent',
            privacyConsent: true,
            eventData: {
              requester_name: '박매수',
              requester_phone: '010-1234-5678',
              card4: { headline: '스푸핑 제목' },
              broker_profile: { phone: '010-0000-0000' },
              brokerProfile: { displayName: '가짜 중개사' },
              private_memo_text: '비밀 메모 주입',
              status: 'sent',
              nested: {
                card4: { headline: '깊은 스푸핑' },
                l2: { l3: { l4: { l5: { l6: { secret: 'too_deep' } } } } },
              },
            },
          }),
        })
      );
      expect(intentRes.status).toBe(200);

      const viewRows = await harness.db.query<{ event_data: Record<string, unknown> }>(
        `SELECT event_data FROM public.teaser_events WHERE visitor_fp = 'fp-w76-view' AND event_type = 'view'`
      );
      expect(viewRows.rows[0]?.event_data.section).toBe('hero');
      expect(viewRows.rows[0]?.event_data.requester_phone).toBeUndefined();
      expect(viewRows.rows[0]?.event_data.card4).toBeUndefined();

      const intentRows = await harness.db.query<{ event_data: Record<string, unknown> }>(
        `SELECT event_data FROM public.teaser_events WHERE visitor_fp = 'fp-w76-intent' AND event_type = 'intent.pro_im_request'`
      );
      const savedIntentData = intentRows.rows[0]?.event_data ?? {};
      expect(savedIntentData.requester_name).toBe('박매수');
      expect(savedIntentData.requester_phone).toBe('010-1234-5678');
      expect(savedIntentData.card4).toBeUndefined();
      expect(savedIntentData.broker_profile).toBeUndefined();
      expect(savedIntentData.brokerProfile).toBeUndefined();
      expect(savedIntentData.private_memo_text).toBeUndefined();
      expect(savedIntentData.status).toBeUndefined();
      const nested = savedIntentData.nested as Record<string, unknown>;
      expect(nested.card4).toBeUndefined();
      const l5 = (((nested.l2 as Record<string, unknown>).l3 as Record<string, unknown>)
        .l4 as Record<string, unknown>).l5 as Record<string, unknown>;
      expect(l5).toEqual({});
    });
  });

  describe('2. P1-1: POST /api/broker/dealcards/[id]/publish & building_signal_cards_status_check', () => {
    it('updates building_signal_cards with constraint-safe shared_external (0 23514 errors)', async () => {
      const bldId = '76200000-0000-4000-8000-000000000001';
      const validCard4 = {
        headline: '역삼역 도보 3분 코너 사옥',
        posture: 'income',
        region: '강남구 역삼동',
        use: '업무시설',
        area: '연면적 480평',
        priceBand: '120~140억',
        points: ['역세권 코너 가시성 우수', '전층 우량 법인 임차 중', '자주식 주차 14대 확보'],
        pointBriefs: ['도보 3분 초역세권 입지', '장기 임대차로 공실 위험 낮음', '중대형 차량 진출입 편리'],
        provenance: { points: ['broker', 'broker', 'broker'] },
      };

      await harness.db.query(
        `INSERT INTO public.building_ssot_lite (id, owner_id, raw_input, area_signal, asset_type, price_band, status)
         VALUES ($1, $2, '역삼 사옥 메모', '강남구 역삼동', '업무시설', '120~140억', 'draft')`,
        [bldId, BROKER_ID]
      );
      await harness.db.query(
        `INSERT INTO public.building_signal_cards (building_id, owner_id, title, visibility, status)
         VALUES ($1, $2, '역삼역 도보 3분 코너 사옥', 'public_blind', 'draft')`,
        [bldId, BROKER_ID]
      );
      await harness.db.query(
        `INSERT INTO public.document_objects (owner_id, building_id, document_type, visibility, status, title, body)
         VALUES ($1, $2, 'blind_teaser', 'public_blind', 'draft', '역삼 사옥', $3::jsonb)`,
        [BROKER_ID, bldId, JSON.stringify({ card4: validCard4 })]
      );
      await harness.db.query(
        `INSERT INTO public.workspace_items (id, owner_id, kind, building_id, status, title, address, price_band, draft_payload)
         VALUES ($1, $2, 'dealcard', $1, 'draft', '역삼역 도보 3분 코너 사옥', '강남구 역삼동', '120~140억', $3::jsonb)`,
        [bldId, BROKER_ID, JSON.stringify({ card4: validCard4 })]
      );

      const req = new NextRequest(`http://localhost:3000/api/broker/dealcards/${bldId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceBand: '120~140억' }),
      });

      const res = await postPublishDealCard(req, { params: Promise.resolve({ id: bldId }) });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);

      const sigRow = await harness.db.query<{ status: string; visibility: string }>(
        `SELECT status, visibility FROM public.building_signal_cards WHERE building_id = $1`,
        [bldId]
      );
      expect(sigRow.rows[0]?.status).toBe('shared_external');
      expect(sigRow.rows[0]?.visibility).toBe('public_blind');

      // Also verify widened migration constraint enforces valid set (rejects bogus status with 23514)
      await expect(
        harness.db.query(
          `UPDATE public.building_signal_cards SET status = 'not_a_valid_status' WHERE building_id = $1`,
          [bldId]
        )
      ).rejects.toThrow();
    });
  });

  describe('3. P1-2 & P1-3: patch-upsert.ts content gate, memo PII stripping & draft isolation', () => {
    it('rejects unblinded pointBriefs and placeholder copy on { action: "upsert", status: "sent" } with 422', async () => {
      const supabase = harness.createClient({
        role: 'service_role',
      }) as unknown as ReturnType<typeof createServiceClient>;

      // 3a. Unblinded street/lot number inside pointBriefs
      const unblindedRes = await handlePatchWorkspaceUpsert({
        supabase,
        userId: BROKER_ID,
        role: 'broker',
        action: 'upsert',
        buildingId: 'bld-w76-unblinded',
        uuidOwnerVerified: true,
        brokerProfileMeta: VALID_STATUTORY_META,
        body: {
          action: 'upsert',
          buildingId: 'bld-w76-unblinded',
          status: 'sent',
          card4: {
            headline: '강남 역세권 오피스 매물',
            region: '강남구 역삼동',
            use: '업무시설',
            priceBand: '100~120억',
            points: ['역세권 도보 3분 입지', '안정적인 우량 임차인', '자주식 주차 공간 확보'],
            pointBriefs: [
              '서울 강남구 역삼동 823-14번지 코너 필지',
              '공실 없이 운영 중',
              '전면 도로 접합 우수',
            ],
          },
        },
      });
      const unblindedJson = await unblindedRes.json();
      expect(unblindedRes.status).toBe(422);
      expect(unblindedJson.code).toBe('BLIND_GUARD_VIOLATION');

      // 3b. Placeholder fallback copy
      const placeholderRes = await handlePatchWorkspaceUpsert({
        supabase,
        userId: BROKER_ID,
        role: 'broker',
        action: 'upsert',
        buildingId: 'bld-w76-placeholder',
        uuidOwnerVerified: true,
        brokerProfileMeta: VALID_STATUTORY_META,
        body: {
          action: 'upsert',
          buildingId: 'bld-w76-placeholder',
          status: 'sent',
          card4: {
            headline: '서울 핵심 상권 매물',
            region: '서울시 핵심권역',
            use: '근린생활시설',
            priceBand: '80~95억',
            points: ['우수 입지', '추천 매물', '안정 수익'],
          },
        },
      });
      const placeholderJson = await placeholderRes.json();
      expect(placeholderRes.status).toBe(422);
      expect(placeholderJson.code).toBe('DEALCARD_PLACEHOLDER_COPY');
    });

    it('omits private_memo_text from activity_events and preserves live document_objects on draft autosave of a sent card', async () => {
      const bldId = '76300000-0000-4000-8000-000000000001';
      const supabase = harness.createClient({
        role: 'service_role',
      }) as unknown as ReturnType<typeof createServiceClient>;

      await harness.db.query(
        `INSERT INTO public.building_ssot_lite (id, owner_id, raw_input, area_signal, asset_type, price_band, status)
         VALUES ($1, $2, '초기 메모', '서초구 서초동', '업무시설', '150~170억', 'public_signal_ready')`,
        [bldId, BROKER_ID]
      );

      // Step 1: Explicit publish via upsert with status: 'sent' + private memoText
      const secretMemo = '소유주 김OO 010-7777-6666 급매 사유 비공개';
      const pubRes = await handlePatchWorkspaceUpsert({
        supabase,
        userId: BROKER_ID,
        role: 'broker',
        action: 'upsert',
        buildingId: bldId,
        uuidOwnerVerified: true,
        brokerProfileMeta: VALID_STATUTORY_META,
        body: {
          action: 'upsert',
          buildingId: bldId,
          status: 'sent',
          memoText: secretMemo,
          card4: {
            headline: '서초역 프라임 사옥',
            region: '서초구 서초동',
            use: '업무시설',
            priceBand: '150~170억',
            points: ['서초역 도보 4분 코너', '전층 사옥 명도 가능', '대지 효율 우수한 필지'],
          },
        },
      });
      expect(pubRes.status).toBe(200);

      // Verify activity_events has NO private_memo_text (only has_private_memo: true)
      const upsertEv = await harness.db.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM public.activity_events
         WHERE event_type = 'dealcard_upserted' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [bldId]
      );
      expect(upsertEv.rows[0]?.metadata.private_memo_text).toBeUndefined();
      expect(upsertEv.rows[0]?.metadata.has_private_memo).toBe(true);

      // Also verify update_memo_only in patch-lifecycle omits private_memo_text
      const memoOnlyRes = await handlePatchWorkspaceLifecycle({
        supabase,
        userId: BROKER_ID,
        role: 'broker',
        action: 'update_memo_only',
        buildingId: bldId,
        uuidOwnerVerified: true,
        brokerProfileMeta: VALID_STATUTORY_META,
        body: {
          action: 'update_memo_only',
          buildingId: bldId,
          memoText: '추가 비공개 메모 010-3333-2222',
        },
      });
      expect(memoOnlyRes?.status).toBe(200);
      const pairedEv = await harness.db.query<{ metadata: Record<string, unknown> }>(
        `SELECT metadata FROM public.activity_events
         WHERE event_type = 'dealcard_memo_paired' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        [bldId]
      );
      expect(pairedEv.rows[0]?.metadata.private_memo_text).toBeUndefined();
      expect(pairedEv.rows[0]?.metadata.has_private_memo).toBe(true);

      // Capture published blind_teaser body before draft autosave
      const beforeDoc = await harness.db.query<{ body: { card4?: { headline?: string } } }>(
        `SELECT body FROM public.document_objects WHERE building_id = $1 AND document_type = 'blind_teaser'`,
        [bldId]
      );
      const publishedHeadline = beforeDoc.rows[0]?.body?.card4?.headline;
      expect(publishedHeadline).toBe('서초역 프라임 사옥');

      // Step 2: Background draft autosave (status omitted) on already-'sent' DealCard
      const draftAutosaveRes = await handlePatchWorkspaceUpsert({
        supabase,
        userId: BROKER_ID,
        role: 'broker',
        action: 'upsert',
        buildingId: bldId,
        uuidOwnerVerified: true,
        brokerProfileMeta: VALID_STATUTORY_META,
        body: {
          action: 'upsert',
          buildingId: bldId,
          card4: {
            headline: '미발행 초안 제목',
            region: '서초구 서초동',
            use: '업무시설',
            priceBand: '160~180억',
            points: ['미발행 초안 포인트 1', '미발행 초안 포인트 2', '미발행 초안 포인트 3'],
          },
        },
      });
      const draftAutosaveBody = await draftAutosaveRes.clone().json().catch(() => null);
      expect(draftAutosaveRes.status, JSON.stringify(draftAutosaveBody)).toBe(200);

      // Live legacy document_objects AND workspace_items.published_snapshot must remain untouched!
      const afterDoc = await harness.db.query<{ body: { card4?: { headline?: string } } }>(
        `SELECT body FROM public.document_objects WHERE building_id = $1 AND document_type = 'blind_teaser'`,
        [bldId]
      );
      expect(afterDoc.rows[0]?.body?.card4?.headline).toBe('서초역 프라임 사옥');

      const wsRow = await harness.db.query<{
        status: string;
        draft_payload: Record<string, unknown>;
        published_snapshot: Record<string, unknown>;
      }>(`SELECT status, draft_payload, published_snapshot FROM public.workspace_items WHERE building_id = $1`, [
        bldId,
      ]);
      expect(wsRow.rows[0]?.status).toBe('sent');
      expect(wsRow.rows[0]?.draft_payload.hasUnpublishedEdits).toBe(true);
      expect((wsRow.rows[0]?.draft_payload.card4 as Record<string, unknown>)?.headline).toBe(
        '미발행 초안 제목'
      );
      expect((wsRow.rows[0]?.published_snapshot.card4 as Record<string, unknown>)?.headline).toBe(
        '서초역 프라임 사옥'
      );
    });
  });

  describe('4. P1-3: PATCH /api/broker/deal-card/[id] preserves published_snapshot when status omitted', () => {
    it('keeps status="sent", published_snapshot, and blind_teaser intact on non-publish PATCH', async () => {
      const bldId = '76400000-0000-4000-8000-000000000001';
      const publishedCard4 = {
        headline: '성수역 코너 수익형 빌딩',
        posture: 'income',
        region: '성동구 성수동',
        use: '근린생활시설',
        area: '연면적 260평',
        priceBand: '90~105억',
        points: ['성수 메인 상권 코너', '우량 리테일 만실 임차', '리모델링 완료 신축급'],
        provenance: { points: ['broker', 'broker', 'broker'] },
        card4_version: 2,
      };

      await harness.db.query(
        `INSERT INTO public.building_ssot_lite (id, owner_id, raw_input, area_signal, asset_type, price_band, status)
         VALUES ($1, $2, '성수 메모', '성동구 성수동', '근린생활시설', '90~105억', 'public_signal_ready')`,
        [bldId, BROKER_ID]
      );
      await harness.db.query(
        `INSERT INTO public.building_signal_cards (building_id, owner_id, title, visibility, status)
         VALUES ($1, $2, '성수역 코너 수익형 빌딩', 'public_blind', 'shared_external')`,
        [bldId, BROKER_ID]
      );
      await harness.db.query(
        `INSERT INTO public.document_objects (owner_id, building_id, document_type, visibility, status, title, body)
         VALUES ($1, $2, 'blind_teaser', 'public_blind', 'published', '성수역 코너 수익형 빌딩', $3::jsonb)`,
        [BROKER_ID, bldId, JSON.stringify({ card4: publishedCard4 })]
      );
      await harness.db.query(
        `INSERT INTO public.workspace_items (id, owner_id, kind, building_id, status, title, address, price_band, draft_payload, published_snapshot, version)
         VALUES ($1, $2, 'dealcard', $1, 'sent', '성수역 코너 수익형 빌딩', '성동구 성수동', '90~105억', $3::jsonb, $4::jsonb, 2)`,
        [
          bldId,
          BROKER_ID,
          JSON.stringify({ card4: publishedCard4 }),
          JSON.stringify({ card4: publishedCard4, brokerProfile: VALID_STATUTORY_META }),
        ]
      );

      // PATCH without status (draft edit)
      const req = new NextRequest(`http://localhost:3000/api/broker/deal-card/${bldId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card4: {
            headline: '성수 초안 제목',
            region: '성동구 성수동',
            use: '근린생활시설',
            priceBand: '95~110억',
            points: ['초안 수정 포인트 1', '초안 수정 포인트 2', '초안 수정 포인트 3'],
          },
        }),
      });

      const res = await patchDealCard(req, { params: Promise.resolve({ id: bldId }) });
      expect(res.status).toBe(200);

      const wsCheck = await harness.db.query<{
        status: string;
        draft_payload: Record<string, unknown>;
        published_snapshot: Record<string, unknown>;
      }>(`SELECT status, draft_payload, published_snapshot FROM public.workspace_items WHERE id = $1`, [
        bldId,
      ]);
      expect(wsCheck.rows[0]?.status).toBe('sent');
      expect(wsCheck.rows[0]?.draft_payload.hasUnpublishedEdits).toBe(true);
      expect((wsCheck.rows[0]?.draft_payload.card4 as Record<string, unknown>)?.headline).toBe(
        '성수 초안 제목'
      );
      expect((wsCheck.rows[0]?.published_snapshot.card4 as Record<string, unknown>)?.headline).toBe(
        '성수역 코너 수익형 빌딩'
      );

      const teaserCheck = await harness.db.query<{ body: { card4?: { headline?: string } } }>(
        `SELECT body FROM public.document_objects WHERE building_id = $1 AND document_type = 'blind_teaser'`,
        [bldId]
      );
      expect(teaserCheck.rows[0]?.body?.card4?.headline).toBe('성수역 코너 수익형 빌딩');
    });
  });

  describe('5. P1-4 & P2-1..2: Draft building_ssot_lite OG/visibility closure & CasePack null guards', () => {
    it('blocks bare draft building_ssot_lite across evaluateDealCardPublicVisibility and all 4 OG routes (404)', async () => {
      // Visibility unit assertions
      const bareDraftVis = evaluateDealCardPublicVisibility({
        buildingStatus: 'draft',
        signalCardStatus: null,
        teaserDocStatus: null,
        workspaceItemStatus: null,
      });
      expect(bareDraftVis.isPublic).toBe(false);
      expect(bareDraftVis.reasons).toContain('unpublished_draft_artifacts');

      const publishedSigVis = evaluateDealCardPublicVisibility({
        buildingStatus: 'draft',
        signalCardStatus: 'shared_external',
        teaserDocStatus: null,
        workspaceItemStatus: null,
      });
      expect(publishedSigVis.isPublic).toBe(true);

      // Bare unpublished draft building_ssot_lite row in DB (no workspace_items, no teaserDoc)
      const draftBldId = '76500000-0000-4000-8000-000000000001';
      await harness.db.query(
        `INSERT INTO public.building_ssot_lite (id, owner_id, raw_input, area_signal, asset_type, price_band, status)
         VALUES ($1, $2, '미발행 초안 매물', '마포구 연남동', '근린생활시설', '60~70억', 'draft')`,
        [draftBldId, BROKER_ID]
      );

      const params = Promise.resolve({ id: draftBldId });
      const [ogRes1, ogRes2, ogRes3, ogRes4] = await Promise.all([
        getOgDeal(new Request(`http://localhost:3000/api/og/deal/${draftBldId}`), { params }),
        getOgDealCard(new Request(`http://localhost:3000/api/og/deal/${draftBldId}/card`), { params }),
        getOgDealKakao(new Request(`http://localhost:3000/api/og/deal/${draftBldId}/kakao`), { params }),
        getOgDealKakaoV2(
          new NextRequest(`http://localhost:3000/api/og/deal/${draftBldId}/kakao-v2`),
          { params }
        ),
      ]);

      expect(ogRes1.status).toBe(404);
      expect(ogRes2.status).toBe(404);
      expect(ogRes3.status).toBe(404);
      expect(ogRes4.status).toBe(404);
    });

    it('extractDealCardCasePack succeeds without TypeError when missingData, kakaoText, and fitSummary are undefined', () => {
      const malformedInput = {
        buildingTruth: {
          areaSignal: '강남구 논현동',
          assetType: '근린생활시설',
          priceBand: '70~80억',
          hiddenFields: undefined,
          missingData: undefined,
          fitSummary: undefined,
        },
        blindTeaser: {
          kakaoText: undefined,
        },
      } as unknown as Parameters<typeof extractDealCardCasePack>[0];

      const pack = extractDealCardCasePack(
        malformedInput,
        '76500000-0000-4000-8000-000000000099',
        BROKER_ID
      );
      expect(pack.building_ssot_lite_id).toBe('76500000-0000-4000-8000-000000000099');
      expect(pack.output).toBe('');
      expect(pack.audience).toBe('');
      expect(pack.warning).toBe('');
    });
  });
});
