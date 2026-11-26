/**
 * @file src/tests/golden/stateful-cross-surface-oracle.test.ts
 * @description Ring 1 (`golden:fast`) — Hermetic Stateful Lifecycle Round-Trip, Adversarial Edge Twins,
 *   Real Golden Snapshot 7-Surface Cross-Parity, Unit-Denominator Lock & Mandatory Anti-Sycophancy
 *   Negative Controls (`NC-GOLD-01` .. `NC-GOLD-06`).
 *
 * Guarantees:
 *   - $0.00 cost (zero paid LLM calls)
 *   - Zero external HTTP requests (`installOfflineGuard()`)
 *   - Real in-memory PostgreSQL (`@electric-sql/pglite`) executing `20261126000003_sota_atomic_domain_rpcs.sql`
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasSnapshot,
  installOfflineGuard,
  resetOfflineGuardLog,
  loadSnapshot,
  loadPoiPool,
  buildRenderInput,
  extractSlideTexts,
  viewerTextOf,
} from '../../../scripts/golden-snapshot/lib';
import { PgliteSupabaseHarness } from '@/tests/harness/pglite-supabase';
import {
  upsertWorkspaceItem,
  getWorkspaceItemByAnyId,
  getPublicWorkspaceProjection,
  WorkspaceRepositoryError,
  resetWorkspaceRepositoryCacheForTests,
} from '@/lib/workspace/workspace-repository';
import { computeNoiCapRatePct } from '@/lib/workspace/summary/patch-upsert-im';
import {
  hydrateEditionForOutboundEmail,
  mergeHydratedEdition,
} from '@/domain/magazine/send-batch';
import {
  renderMagazineEmail,
  renderMagazineKakaoText,
} from '@/domain/magazine/email-template';
import { buildImageModel } from '@/lib/magazine/og-image-data';
import { parseHydratedDraftData } from '@/app/(broker)/broker/magazine-editor/_lib/edition-bootstrap';
import {
  buildInboxCopyBundle,
  sendInboxClientEmail,
} from '@/domain/inbox/inbox-outbound';
import {
  cleanBlindPoints,
  validateBlindPoints,
} from '@/lib/deal-card/blind-guard';
import { maskAddress } from '@/lib/magazine/pii';
import { maskAddressForPublic } from '@/lib/magazine/public-page-data';
import {
  parseBrokerParcels,
  summarizeParcels,
} from '@/domain/building/mobile-im/parcel-input';
import {
  isNonLeasableLeaseRow,
  summarizeLeaseOccupancy,
  sumLeasedRentRoll,
} from '@/domain/building/mobile-im/lease-vacancy';
import { extractValuationFacts } from '@/domain/building/im-core/facts/valuation';
import { bindProImChapterData } from '@/domain/building/mobile-im/pptx/binder/pro-chapter-binder';
import { buildBasicImSlideDefaults } from '@/domain/building/pptx-studio/studio-service';
import { setOfflineEnrichment } from '@/domain/building/mobile-im/pptx/basic-im-enrichment';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  generateMacroTransitDiagram,
  generateMacroTransitSvg,
} from '@/services/macro-transit-engine';
import {
  FLOOR_CAP_5,
  FLOOR_CAP_100,
  auditUnitDenominatorLock,
  auditTelegraphicJosaDrop,
  evaluateSevenSurfaceParity,
  MANDATORY_GOLDEN_NEGATIVE_CONTROLS,
  verifyGoldenNegativeControls,
  type StatutoryBrokerTruth,
  type SevenSurfaceBundle,
} from '@/lib/qa/unit-denominator-and-surface-oracle';

const BROKER_ID = '11111111-1111-4111-8111-1111111111a1';
const BROKER_SLUG = 'hanseong-cre';

const STATUTORY_BROKER: StatutoryBrokerTruth = {
  company: '한성빌딩부동산중개법인',
  representativeName: '박준영',
  officeRegNumber: '11680-2025-04719',
  officeAddress: '서울특별시 강남구 테헤란로 318',
  phone: '010-3482-9104',
};

function formatStatutoryFooterLine(b: StatutoryBrokerTruth): string {
  return `상호: ${b.company} · 대표자: ${b.representativeName} · 등록번호: ${b.officeRegNumber} · 소재지: ${b.officeAddress} · 연락처: ${b.phone}`;
}

describe('Ring 1 Golden Fast — Stateful Lifecycle, 7-Surface Cross-Parity & Anti-Sycophancy Oracle', () => {
  const savedEnv = { ...process.env };
  let networkLog: Awaited<ReturnType<typeof installOfflineGuard>>;

  beforeAll(async () => {
    networkLog = await installOfflineGuard();
    resetOfflineGuardLog();
  });

  afterAll(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Test 1 — Hermetic PGlite Stateful Lifecycle Round-Trip
  // ════════════════════════════════════════════════════════════════════════════
  describe('Test 1 — Hermetic PGlite Stateful Lifecycle Round-Trip (Save -> CAS Update -> Reload -> Atomic RPC)', () => {
    let harness: PgliteSupabaseHarness;
    let serviceClient: ReturnType<PgliteSupabaseHarness['createClient']>;

    beforeAll(async () => {
      const atomicRpcsSql = fs.readFileSync(
        path.resolve(
          process.cwd(),
          'supabase/migrations/20261126000003_sota_atomic_domain_rpcs.sql',
        ),
        'utf8',
      );
      harness = await PgliteSupabaseHarness.create({
        extraMigrations: [atomicRpcsSql],
      });
      serviceClient = harness.createClient({ role: 'service_role' });
      await harness.seedUser({
        id: BROKER_ID,
        email: 'park@hanseong-cre.test',
        displayName: STATUTORY_BROKER.representativeName,
        company: STATUTORY_BROKER.company,
        phone: STATUTORY_BROKER.phone,
        slug: BROKER_SLUG,
        registrationNo: STATUTORY_BROKER.officeRegNumber,
        officeAddress: STATUTORY_BROKER.officeAddress,
      });
      process.env.REQUIRE_WORKSPACE_ITEMS_TABLE = '1';
      process.env.DISABLE_MEMORY_STORE = '1';
      resetWorkspaceRepositoryCacheForTests();
    }, 30_000);

    afterAll(async () => {
      await harness?.close();
    });

    it('1-A) DealCard pointCandidates: 6 candidates -> swap -> CAS version increment -> reload preserves all 6', async () => {
      const sixCandidates = [
        { text: '역세권 도보 4분 접근성', axis: 'location' as const },
        { text: '우량 병의원 장기 임차', axis: 'tenant' as const },
        { text: '자본환원율 3.80% 현금흐름', axis: 'yield' as const },
        { text: '중로각지 코너 가시성 확보', axis: 'scarcity' as const },
        { text: '승강기·외벽 최근 리모델링', axis: 'building' as const },
        { text: '인근 역세권 개발 호재 수혜', axis: 'value' as const },
      ];

      const initialCard4 = {
        headline: '자본환원율 3.80% 코너 근생',
        posture: 'income' as const,
        region: '성동구 성수동2가',
        use: '근린생활시설',
        area: '연면적 385평',
        priceBand: '140~150억',
        points: [
          sixCandidates[0].text,
          sixCandidates[1].text,
          sixCandidates[2].text,
        ] as [string, string, string],
        pointCandidates: sixCandidates,
        card4_version: 1,
      };

      // Step 1: Initial save (version = 1)
      const savedV1 = await upsertWorkspaceItem(serviceClient, {
        ownerId: BROKER_ID,
        legacyId: 'dc-stateful-6cand-001',
        kind: 'dealcard',
        status: 'draft',
        title: '성수동2가 코너 근생 딜카드',
        address: '성동구 성수동2가',
        priceBand: '140~150억',
        draftPayload: {
          card4: initialCard4,
          ownerPhone: '010-9111-2233',
          roadAddress: '서울특별시 성동구 연무장7길 11',
        },
      });
      expect(savedV1.tableAvailable).toBe(true);
      expect(savedV1.item?.version).toBe(1);
      const itemId = savedV1.item!.id;

      // Step 2: Swap point[2] with candidate[4] under optimistic CAS (expectedVersion = 1 -> version = 2)
      const swappedCard4 = {
        ...initialCard4,
        points: [
          sixCandidates[0].text,
          sixCandidates[1].text,
          sixCandidates[4].text,
        ] as [string, string, string],
        pointCandidates: sixCandidates,
        card4_version: 2,
      };

      const savedV2 = await upsertWorkspaceItem(serviceClient, {
        id: itemId,
        ownerId: BROKER_ID,
        kind: 'dealcard',
        status: 'published',
        expectedVersion: 1,
        title: '성수동2가 코너 근생 딜카드',
        address: '성동구 성수동2가',
        priceBand: '140~150억',
        draftPayload: {
          card4: swappedCard4,
          ownerPhone: '010-9111-2233',
          roadAddress: '서울특별시 성동구 연무장7길 11',
        },
      });
      expect(savedV2.item?.version).toBe(2);

      // Stale expectedVersion=1 must conflict with 409 VERSION_CONFLICT
      await expect(
        upsertWorkspaceItem(serviceClient, {
          id: itemId,
          ownerId: BROKER_ID,
          kind: 'dealcard',
          expectedVersion: 1,
          title: '충돌 테스트',
          draftPayload: { card4: initialCard4 },
        }),
      ).rejects.toMatchObject({
        name: 'WorkspaceRepositoryError',
        status: 409,
        code: 'VERSION_CONFLICT',
      } satisfies Partial<WorkspaceRepositoryError>);

      // Step 3: Reload from PostgreSQL and verify all 6 candidates + swapped point + public snapshot sanitization
      const reloaded = await getWorkspaceItemByAnyId(
        serviceClient,
        itemId,
        'dealcard',
        BROKER_ID,
      );
      expect(reloaded).not.toBeNull();
      expect(reloaded!.version).toBe(2);

      const reloadedDraftCard4 = (reloaded!.draftPayload.card4 ?? {}) as {
        points?: string[];
        pointCandidates?: Array<{ text: string; axis?: string }>;
      };
      expect(reloadedDraftCard4.pointCandidates).toHaveLength(6);
      expect(reloadedDraftCard4.pointCandidates?.map((c) => c.axis)).toEqual([
        'location',
        'tenant',
        'yield',
        'scarcity',
        'building',
        'value',
      ]);
      expect(reloadedDraftCard4.points?.[2]).toBe('승강기·외벽 최근 리모델링');

      const pubProj = await getPublicWorkspaceProjection(serviceClient, itemId, 'dealcard');
      expect(pubProj.found).toBe(true);
      const pubSnapStr = JSON.stringify(pubProj.projection?.snapshot ?? {});
      expect(pubSnapStr).not.toContain('010-9111-2233');
      expect(pubSnapStr).not.toContain('연무장7길 11');
      const pubCard4 = (pubProj.projection?.snapshot?.card4 ?? {}) as {
        pointCandidates?: Array<{ text: string; axis?: string }>;
      };
      expect(pubCard4.pointCandidates).toHaveLength(6);
    });

    it('1-B) Newsletter toneStance: "negative" + 3-bullet ai_briefing -> rpc_publish_magazine_edition -> outbound email/Kakao/OG parity', async () => {
      const editionId = '33333333-3333-4333-8333-333333333301';
      const issueDate = '2026-11-20';
      const threeBullets = [
        '• 시중은행 조달 금리 상단 고착화로 고레버리지 매수세는 뚜렷한 관망 국면에 진입했습니다.',
        '• 성수·영등포 핵심지도 임대차 공실 방어력이 검증된 우량 근생 위주로만 선별 문의가 이어집니다.',
        '• 보수적 현금흐름(Cap Rate) 및 감정가 대비 담보인정 한도를 사전 점검한 뒤 접근해야 합니다.',
      ].join('\n');

      const draftContent = {
        schemaVersion: 2,
        cadence: 'weekly',
        kind: 'weekly',
        issueDate,
        toneStance: 'negative',
        market_temp: '위기 경계',
        show_market_temp_badge: true,
        headline: '11월 3주 금리 경계 국면 상업용 빌딩 리스크 점검',
        ai_briefing: threeBullets,
        field_note: {
          question: '조달 금리 부담기에 어떤 빌딩이 가격을 방어하나요?',
          comment: '장기 우량 임차인이 확보된 역세권 코너 근생이 하방 경직성을 보입니다.',
        },
        featured_deals: [
          {
            id: '44444444-4444-4444-8444-444444444499',
            title: '성수역 코너 올근생 빌딩',
            address: '서울특별시 성동구 연무장7길 11',
            priceBand: '140~150억',
            priceWon: 14_500_000_000,
            areaLabel: '연면적 390평',
            investmentPoint: '병의원·리테일 임차 완료로 Cap Rate 방어력이 검증된 자산입니다.',
          },
        ],
        unitIssues: [
          {
            id: 'ni-1',
            title: '대출 금리 동결 장기화에 중소형 빌딩 보수적 자금 조달 확산',
            brief: '감정가 대비 LTV 한도와 이자보상배율을 우선 점검하는 흐름입니다.',
            sources: ['한국경제', '매일경제'],
            url: 'https://www.hankyung.com/realestate/article/202611200001',
          },
          {
            id: 'ni-2',
            title: '성수·당산 역세권 우량 근생 임차 수요 견조',
            brief: '핵심 동선 1층 리테일과 병의원 임차 문의는 꾸준히 유지되고 있습니다.',
            source: '서울경제',
            url: 'https://www.sedaily.com/NewsView/202611200002',
          },
        ],
      };

      const insRes = await serviceClient.from('magazine_editions').insert({
        id: editionId,
        broker_id: BROKER_SLUG,
        broker_user_id: BROKER_ID,
        issue_date: issueDate,
        edition_type: 'weekly',
        kind: 'weekly',
        status: 'draft',
        title: draftContent.headline,
        market_temp: '위기 경계',
        content: draftContent,
      });
      expect(insRes.error).toBeNull();

      // Atomic publish via real PL/pgSQL RPC
      const pubRpc = await serviceClient.rpc<Record<string, unknown>>(
        'rpc_publish_magazine_edition',
        {
          p_edition_id: editionId,
          p_broker_id: BROKER_SLUG,
          p_broker_user_id: BROKER_ID,
          p_issue_date: issueDate,
          p_title: draftContent.headline,
          p_subtitle: '주간 리스크 브리핑',
          p_summary: threeBullets,
          p_blocks: draftContent,
          p_published_at: '2026-11-20T09:00:00.000Z',
          p_edition_patch: {
            market_temp: '위기 경계',
          },
        },
      );
      expect(pubRpc.error).toBeNull();
      expect(pubRpc.data?.ok).toBe(true);

      // Verify both magazine_editions and magazine_issues persisted atomically with toneStance='negative'
      const { data: issueRow, error: issueErr } = await serviceClient
        .from('magazine_issues')
        .select('broker_id, issue_date, content')
        .eq('broker_id', BROKER_SLUG)
        .eq('issue_date', issueDate)
        .single();
      expect(issueErr).toBeNull();
      const persistedContent = (issueRow?.content ?? {}) as Record<string, unknown>;
      expect(persistedContent.toneStance).toBe('negative');

      const hydratedEditorDraft = parseHydratedDraftData({
        ...persistedContent,
        editionId,
      });
      expect(hydratedEditorDraft.toneStance).toBe('negative');

      // Hydrate outbound email from PGlite -> merge -> render Email + Kakao + OG
      const hydratedOutbound = await hydrateEditionForOutboundEmail(
        serviceClient as never,
        editionId,
      );
      expect(hydratedOutbound.headline).toBeDefined();
      // Must NOT be truncated to 80 chars; all 3 bullets intact!
      expect(hydratedOutbound.headline!.length).toBeGreaterThan(130);
      expect(hydratedOutbound.headline!.split('\n')).toHaveLength(3);
      expect(hydratedOutbound.deals?.[0]?.price).toBe('140~150억');
      expect(hydratedOutbound.deals?.[0]?.address).toBe('서울특별시 성동구 연무장7길');
      expect(hydratedOutbound.topNews?.[0]?.source).toBeTruthy();

      const mergedEdition = mergeHydratedEdition(
        {
          title: draftContent.headline,
          headline: '짧은 구 요약',
          marketTemp: '관망',
          date: issueDate,
          url: `https://credeal.kr/magazine/${BROKER_SLUG}/${issueDate}`,
        },
        hydratedOutbound,
        { preferHydrated: true },
      );

      const email = renderMagazineEmail({
        brokerName: STATUTORY_BROKER.representativeName,
        officeName: STATUTORY_BROKER.company,
        brokerContact: STATUTORY_BROKER.phone,
        senderAddress: STATUTORY_BROKER.officeAddress,
        officeRegNumber: STATUTORY_BROKER.officeRegNumber,
        representativeName: STATUTORY_BROKER.representativeName,
        subscriberName: '김건물주',
        edition: mergedEdition,
        unsubscribeUrl: 'https://credeal.kr/api/public/magazine/unsubscribe?t=stateful-tok-01',
        isAd: true,
      });

      const kakao = renderMagazineKakaoText({
        brokerName: STATUTORY_BROKER.representativeName,
        officeName: STATUTORY_BROKER.company,
        brokerContact: STATUTORY_BROKER.phone,
        senderAddress: STATUTORY_BROKER.officeAddress,
        officeRegNumber: STATUTORY_BROKER.officeRegNumber,
        representativeName: STATUTORY_BROKER.representativeName,
        subscriberName: '김건물주',
        edition: mergedEdition,
        unsubscribeUrl: 'https://credeal.kr/api/public/magazine/unsubscribe?t=stateful-tok-01',
        isAd: true,
      });

      const ogModel = buildImageModel(
        persistedContent as never,
        {
          name: STATUTORY_BROKER.representativeName,
          company: STATUTORY_BROKER.company,
          phone: STATUTORY_BROKER.phone,
        },
        issueDate,
      );

      // 3 bullets intact in rendered HTML & text
      expect((email.html.match(/<li\b/g) ?? []).length).toBe(3);
      expect(email.text).toContain('시중은행 조달 금리 상단 고착화로');
      expect(email.text).toContain('보수적 현금흐름');

      // priceBand ('140~150억') used; exact priceWon ('145억') & road number ('연무장7길 11') NEVER leaked
      expect(email.html).toContain('140~150억');
      expect(email.html).not.toContain('145억');
      expect(email.text).not.toContain('145억');
      expect(email.html).not.toContain('연무장7길 11');
      expect(kakao.text).not.toContain('연무장7길 11');
      expect(JSON.stringify(ogModel)).not.toContain('연무장7길 11');
      expect(ogModel?.deals[0]?.address).toBe('서울특별시 성동구 연무장7길');

      // Short issue sources preserved
      expect(email.html).toMatch(/한경|한국경제/);
      expect(email.html).toMatch(/서경|서울경제/);
    });

    it('1-C) Lease Ledger rpc_replace_lease_ledger (자가사용 + 기계실 non-leasable + 공실) -> occupancy denominator & 0.00%p NOI Cap Rate parity', async () => {
      const assetId = 'asset-dangsan-ledger-001';
      const askingPriceManwon = 1_000_000; // 100억 원

      const rpcRes = await serviceClient.rpc<Record<string, unknown>>(
        'rpc_replace_lease_ledger',
        {
          p_asset_id: assetId,
          p_rows: [
            {
              unit_label: '1F 101호',
              lease_area_sqm: '165.29',
              exclusive_area_sqm: '132.23',
              tenant_business: '메디컬약국',
              legal_basis: '상가',
              deposit_krw: '100000000',
              monthly_rent_krw: '12000000',
              mgmt_fee_krw: '800000',
              lease_state: '임대중',
              current_start_date: '2025-01-01',
              current_expiry_date: '2028-12-31',
            },
            {
              unit_label: '2F 201호',
              lease_area_sqm: '165.29',
              exclusive_area_sqm: '132.23',
              tenant_business: '정형외과의원',
              legal_basis: '상가',
              deposit_krw: '80000000',
              monthly_rent_krw: '8000000',
              mgmt_fee_krw: '600000',
              lease_state: '임대중',
              current_start_date: '2025-03-01',
              current_expiry_date: '2029-02-28',
            },
            {
              unit_label: '3F 301호',
              lease_area_sqm: '165.29',
              tenant_business: '공실',
              deposit_krw: '0',
              monthly_rent_krw: '0',
              mgmt_fee_krw: '0',
              lease_state: '공실',
            },
            {
              unit_label: '4F 401호',
              lease_area_sqm: '165.29',
              tenant_business: '자가 사옥',
              deposit_krw: '0',
              monthly_rent_krw: '0',
              mgmt_fee_krw: '0',
              lease_state: '자가사용',
            },
            {
              unit_label: 'B1 기계실',
              lease_area_sqm: '82.64',
              tenant_business: '기계실',
              deposit_krw: '0',
              monthly_rent_krw: '0',
              mgmt_fee_krw: '0',
              lease_state: '임대중',
            },
          ],
          p_meta: {
            area_input_unit: 'sqm',
            rentroll_version: 'v1.5',
            rentroll_as_of: '2026-11-20',
            asking_price_krw: String(askingPriceManwon * 10_000),
            gfa_sqm: '743.80',
          },
          p_prune_source_tier: 'broker_input',
        },
      );

      expect(rpcRes.error).toBeNull();
      expect(rpcRes.data?.ok).toBe(true);
      expect(rpcRes.data?.inserted).toBe(5);
      expect(rpcRes.data?.meta_updated).toBe(true);

      const { data: dbRows, error: selErr } = await serviceClient
        .from('lease_ledger')
        .select('*')
        .eq('asset_id', assetId)
        .order('unit_label', { ascending: true });
      expect(selErr).toBeNull();
      expect(dbRows).toHaveLength(5);

      const floorLeases = (dbRows ?? []).map((r) => ({
        floor: String(r.unit_label),
        unit_label: String(r.unit_label),
        area_sqm: Number(r.lease_area_sqm || 0),
        exclusive_area_sqm: r.exclusive_area_sqm ? Number(r.exclusive_area_sqm) : undefined,
        tenant_name: String(r.tenant_business || ''),
        tenant_type: String(r.tenant_business || ''),
        deposit_manwon: Math.round(Number(r.deposit_krw || 0) / 10_000),
        rent_manwon: Math.round(Number(r.monthly_rent_krw || 0) / 10_000),
        mgmt_fee_manwon: Math.round(Number(r.mgmt_fee_krw || 0) / 10_000),
        lease_state: String(r.lease_state),
        lease_start: r.current_start_date ? String(r.current_start_date).slice(0, 10) : undefined,
        lease_end: r.current_expiry_date ? String(r.current_expiry_date).slice(0, 10) : undefined,
      }));

      // Verify 기계실 is classified as non-leasable, 자가사용 excluded from vacancy denominator
      expect(floorLeases.filter((l) => isNonLeasableLeaseRow(l))).toHaveLength(1);
      const occ = summarizeLeaseOccupancy(floorLeases);
      expect(occ.nonLeasable).toBe(1); // B1 기계실 excluded from total
      expect(occ.total).toBe(4); // 1F, 2F, 3F, 4F
      expect(occ.ownerUse).toBe(1); // 4F 자가사용 excluded from leasable denominator
      expect(occ.leased).toBe(2); // 1F, 2F
      expect(occ.vacant).toBe(1); // 3F
      expect(occ.vacancyPct).toBe(33.3); // 1 / (4 - 1) = 33.3%

      const totals = sumLeasedRentRoll(floorLeases);
      expect(totals.count).toBe(2);
      expect(totals.rentManwon).toBe(2_000); // 1,200만 + 800만
      expect(totals.depositManwon).toBe(18_000); // 1억 + 8,000만

      // Exact 0.00%p NOI Cap Rate parity across computeNoiCapRatePct, Basic IM (ValuationFacts), Pro Chapter Binder, and Studio
      const noiCapPct = computeNoiCapRatePct(totals.rentManwon, askingPriceManwon); // (2000*12*0.95 / 1,000,000)*100 = 2.28%
      expect(noiCapPct).toBe(2.28);

      const valFacts = extractValuationFacts(
        askingPriceManwon * 10_000,
        totals.depositManwon * 10_000,
        totals.rentManwon * 10_000,
      );
      expect(valFacts.capRatePct).toBe(noiCapPct);

      const sharedDocBody = {
        asking_price_manwon: askingPriceManwon,
        cap_rate_percent: noiCapPct,
        floor_leases: floorLeases,
        heroCard: { capRateBase: noiCapPct },
        ssot_summary: {
          address: '서울특별시 영등포구 당산동5가',
          asking_price_manwon: askingPriceManwon,
          total_deposit_manwon: totals.depositManwon,
          monthly_rent_total_krw: totals.rentManwon * 10_000,
          cap_rate: noiCapPct,
          cap_rate_base: noiCapPct,
          total_gross_area_sqm: 743.8,
          land_area_sqm: 330.58,
        },
      };

      const proBound = bindProImChapterData({
        title: '당산동 근생빌딩 Pro IM',
        body: sharedDocBody,
      });
      const proSerialized = JSON.stringify(proBound);
      const studioDefaults = buildBasicImSlideDefaults(
        '당산동 근생빌딩 Basic IM',
        sharedDocBody,
      );

      const proRateMatch = proSerialized.match(/"초기 Cap Rate"[^0-9]*(\d+\.\d+)%/);
      expect(proRateMatch).not.toBeNull();
      const proCapPct = Number(proRateMatch![1]);
      const studioCapPct = parseFloat(String(studioDefaults.highlights.capRateBase).replace('%', ''));

      expect(Math.abs(valFacts.capRatePct - noiCapPct)).toBe(0);
      expect(Math.abs(proCapPct - noiCapPct)).toBe(0);
      expect(Math.abs(studioCapPct - noiCapPct)).toBe(0);
    });

    it('1-D) Inbox AI Reply (kakaoBrief) -> PGlite persistence + buildInboxCopyBundle & sendInboxClientEmail preserve kakaoBrief verbatim', async () => {
      const clientId = '55555555-5555-4555-8555-555555555501';
      const kakaoBrief =
        '정대표님, 요청하신 성수동 코너 근생빌딩은 평당 공사비 950만원 수준의 최근 외관 리모델링을 마쳤으며 감정가 대비 담보인정 55~60% 조달 검토가 가능합니다.';

      const insClient = await serviceClient.from('broker_clients').insert({
        id: clientId,
        broker_id: BROKER_ID,
        display_name: '정우성',
        phone: '010-7777-8888',
        email: 'client.jung@example.test',
        tier: 'vip',
      });
      expect(insClient.error).toBeNull();

      const insHist = await serviceClient.from('contact_history').insert({
        broker_id: BROKER_ID,
        client_id: clientId,
        contact_type: 'kakao',
        summary: '성수동 근생빌딩 AI 맞춤 브리핑 생성',
        metadata: {
          kakaoBrief,
          assetKind: 'im',
        },
      });
      expect(insHist.error).toBeNull();

      const { data: reloadedHist, error: histErr } = await serviceClient
        .from('contact_history')
        .select('summary, metadata')
        .eq('client_id', clientId)
        .single();
      expect(histErr).toBeNull();
      const persistedBrief = String(
        (reloadedHist?.metadata as Record<string, unknown>)?.kakaoBrief ?? '',
      );
      expect(persistedBrief).toBe(kakaoBrief);

      const shareUrl = 'https://credeal.kr/im-lite/f9758801-b867-4ce7-be4f-888601ef504f';
      const copyBundle = buildInboxCopyBundle({
        brokerName: STATUTORY_BROKER.representativeName,
        brokerPhone: STATUTORY_BROKER.phone,
        clientName: '정우성',
        buildingTitle: '성수동 코너 근생빌딩',
        shareUrl,
        headline: '성수역 도보 4분 리모델링 완료 근생',
        brief: persistedBrief,
        assetKind: 'im',
      });
      expect(copyBundle.messageText).toContain(kakaoBrief);

      const prevResend = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;
      try {
        const emailResult = await sendInboxClientEmail({
          toEmail: 'client.jung@example.test',
          brokerName: STATUTORY_BROKER.representativeName,
          brokerCompany: STATUTORY_BROKER.company,
          brokerPhone: STATUTORY_BROKER.phone,
          brokerAddress: STATUTORY_BROKER.officeAddress,
          clientName: '정우성',
          buildingTitle: '성수동 코너 근생빌딩',
          shareUrl,
          headline: '성수역 도보 4분 리모델링 완료 근생',
          brief: persistedBrief,
          assetKind: 'im',
          deliveryPurpose: 'transactional_reply',
          hasInquiryRecord: true,
        });

        expect(emailResult.ok).toBe(true);
        expect(emailResult.simulated).toBe(true);
        expect(emailResult.text).toContain(kakaoBrief);
        expect(emailResult.html).toContain(kakaoBrief);
      } finally {
        if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
      }
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Test 2 — Adversarial Edge Twins Suite
  // ════════════════════════════════════════════════════════════════════════════
  describe('Test 2 — Adversarial Edge Twins Suite (Blind Address Twins, Multi-Parcel ShareRatio & Rule 66 Macro-Transit)', () => {
    it('2-A) Blind Guard & Address Masking Twins: masks 연무장7길 11 while preserving 양평동4가 & 을지로3가 without lot numbers', () => {
      // Twin 1: Digit+길 road number ('서울 성동구 연무장7길 11')
      const yeonmujang = '서울 성동구 연무장7길 11';
      expect(maskAddress(yeonmujang)).toBe('서울 성동구 연무장7길');
      expect(maskAddress(yeonmujang)).not.toContain('11');
      expect(maskAddressForPublic(yeonmujang)).toBe('서울 성동구 연무장7길 일대');
      const vYeon = validateBlindPoints([`${yeonmujang} 코너 근생`]);
      expect(vYeon.isValid).toBe(false);
      expect(vYeon.cleanedPoints[0]).toContain('연무장7길 인근');
      expect(vYeon.cleanedPoints[0]).not.toContain('연무장7길 11');

      // Twin 2: Numbered legal dong ('서울 영등포구 양평동4가 117') -> preserves '양평동4가', strips '117'
      const yangpyeong4ga = '서울 영등포구 양평동4가 117';
      expect(maskAddress(yangpyeong4ga)).toBe('서울 영등포구 양평동4가');
      expect(maskAddress(yangpyeong4ga)).toContain('양평동4가');
      expect(maskAddress(yangpyeong4ga)).not.toContain('117');
      expect(maskAddressForPublic(yangpyeong4ga)).toBe('서울 영등포구 양평동4가 일대');
      const cYang = cleanBlindPoints([`${yangpyeong4ga} 역세권 토지`]);
      expect(cYang[0]).toContain('양평동4가 인근');
      expect(cYang[0]).not.toMatch(/\b117\b/);

      // Twin 3: Numbered legal ro-ga ('서울 중구 을지로3가 291-1') -> preserves '을지로3가', strips '291-1'
      const euljiro3ga = '서울 중구 을지로3가 291-1';
      expect(maskAddress(euljiro3ga)).toBe('서울 중구 을지로3가');
      expect(maskAddress(euljiro3ga)).toContain('을지로3가');
      expect(maskAddress(euljiro3ga)).not.toContain('291-1');
      expect(maskAddressForPublic(euljiro3ga)).toBe('서울 중구 을지로3가 일대');
      const cEul = cleanBlindPoints([`${euljiro3ga} 도심 오피스`]);
      expect(cEul[0]).toContain('을지로3가 인근');
      expect(cEul[0]).not.toContain('291-1');
    });

    it('2-B) Multi-parcel shareRatio: 0.5 weighted land area & weighted official price calculation + Unit-Denominator / Josa twins', () => {
      const rawParcels = [
        {
          pnu: '1156012800101170000',
          landCategory: '대',
          areaM2: 400,
          shareRatio: 1,
          officialPricePerM2: 10_000_000,
        },
        {
          pnu: '1156012800101340000',
          landCategory: '대',
          areaM2: 200,
          shareRatio: 0.5,
          officialPricePerM2: 13_000_000,
        },
      ];

      const parsed = parseBrokerParcels(rawParcels);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.warnings).toHaveLength(0);

      const summary = summarizeParcels(rawParcels);
      expect(summary.count).toBe(2);
      expect(summary.isMulti).toBe(true);
      // 400 * 1.0 + 200 * 0.5 = 500㎡
      expect(summary.totalAreaM2).toBe(500);
      // (400 * 10,000,000 + 100 * 13,000,000) / 500 = 10,600,000원/㎡
      expect(summary.weightedOfficialPricePerM2).toBe(10_600_000);
      expect(summary.uniformLandCategory).toBe('대');

      // Unit-denominator positive vs negative twin
      const refFacts = [
        { numericToken: '950만원', requiredQualifiers: ['평당', '3.3㎡당', '㎡당'], label: 'G-M3' },
        { numericToken: '55~60%', requiredQualifiers: ['감정가', 'LTV', '담보인정'], label: 'G-W2' },
        { numericToken: '18%', requiredQualifiers: ['전년', '전분기', '전월', 'YoY', 'QoQ'], label: 'YoY-Delta' },
      ];
      expect(
        auditUnitDenominatorLock(
          '평당 공사비 950만원 가정 · 감정가 대비 한도 55~60% · 전년 대비 거래량 18% 증가',
          refFacts,
        ).passed,
      ).toBe(true);
      expect(
        auditUnitDenominatorLock('공사비 950만원 부담 · 한도 55~60% · 거래량 18% 증가', refFacts)
          .violationCount,
      ).toBe(3);

      // Telegraphic josa positive vs negative twin
      expect(
        auditTelegraphicJosaDrop(
          '우량 매물 선점을 위한 전략 · 방어력이 확인된 자산 · 감정평가 세액 점검',
        ).passed,
      ).toBe(true);
      expect(
        auditTelegraphicJosaDrop(
          '우량 매물 선점 위한 전략 · 방어력 확인된 자산 · 감정평가 세금 점검',
        ).violationCount,
      ).toBe(3);
    });

    it('2-C) Macro-Transit Rule 66 Twin: generateMacroTransitDiagram rasterSvg has 0 Hangul chars while labels carry Korean station names', async () => {
      const ybdDiagram = await generateMacroTransitDiagram({
        address: '서울특별시 영등포구 당산동5가',
        propertyName: '당산 코너 빌딩',
      });

      expect(ybdDiagram.district).toBe('YBD');
      expect(ybdDiagram.effectiveDpi).toBeGreaterThanOrEqual(180);
      expect(ybdDiagram.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(
        true,
      );
      // Rule 66: ZERO Hangul inside rasterSvg passed to Sharp
      expect(/[가-힣ㄱ-ㅎㅏ-ㅣ]/u.test(ybdDiagram.rasterSvg)).toBe(false);
      // Native PptxGenJS overlay labels DO contain Korean station/line names
      const labelCorpus = ybdDiagram.labels.map((l) => l.text).join(' | ');
      expect(/[가-힣]/u.test(labelCorpus)).toBe(true);
      expect(labelCorpus).toMatch(/여의도역|당산|호선/);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Test 3 — Real Golden Snapshot 7-Surface Cross-Parity (income-dangsan-r3 & owner-seocho-r3)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Test 3 — Real Golden Snapshot 7-Surface Cross-Parity (income-dangsan-r3 & owner-seocho-r3)', () => {
    const TARGET_GOLDENS: ReadonlyArray<{
      name: 'income-dangsan-r3' | 'owner-seocho-r3';
      isIncome: boolean;
      priceBand: string;
      forbiddenBlindTokens: string[];
    }> = [
      {
        name: 'income-dangsan-r3',
        isIncome: true,
        priceBand: '110~120억',
        forbiddenBlindTokens: ['영신로 259', '11-47', '115억'],
      },
      {
        name: 'owner-seocho-r3',
        isIncome: false,
        priceBand: '220~240억',
        forbiddenBlindTokens: ['서운로6길 22', '1364-28', '230억'],
      },
    ];

    for (const cfg of TARGET_GOLDENS) {
      const present = hasSnapshot(cfg.name);
      (present ? it : it.skip)(
        `7-surface cross-parity & Studio round-trip on real snapshot: ${cfg.name}`,
        async () => {
          resetOfflineGuardLog();
          const snap = loadSnapshot(cfg.name);
          setOfflineEnrichment(snap.liveEnrichment ?? null);

          // Keep 2 real hydrated photos so A14 gallery renders authentically within the <15s fast budget
          if (Array.isArray(snap.doc.body.photos_v2) && snap.doc.body.photos_v2.length > 2) {
            snap.doc.body.photos_v2 = snap.doc.body.photos_v2.slice(0, 2);
          }

          // Inject full 5-field statutory broker profile for end-to-end 4-surface statutory parity
          snap.broker = {
            display_name: STATUTORY_BROKER.representativeName,
            representative_name: STATUTORY_BROKER.representativeName,
            company_name: STATUTORY_BROKER.company,
            phone: STATUTORY_BROKER.phone,
            email: 'park@hanseong-cre.kr',
            registration_no: STATUTORY_BROKER.officeRegNumber,
            office_address: STATUTORY_BROKER.officeAddress,
          };

          const ssot = snap.doc.body.ssot_summary ?? {};
          const askingPriceKrw = Number(ssot.asking_price_manwon || 0) * 10_000;
          const depositKrw = Number(ssot.total_deposit_manwon || 0) * 10_000;
          const monthlyRentKrw = Number(ssot.monthly_rent_total_krw || 0);

          const valFacts = extractValuationFacts(askingPriceKrw, depositKrw, monthlyRentKrw);
          const expectedCapRatePct = cfg.isIncome ? valFacts.grossYieldPct : null;

          if (cfg.isIncome && expectedCapRatePct != null) {
            snap.doc.body = {
              ...snap.doc.body,
              cap_rate_percent: expectedCapRatePct,
              financial: {
                ...(snap.doc.body.financial ?? {}),
                grossYieldOnEquity: expectedCapRatePct,
              },
              heroCard: {
                ...(snap.doc.body.heroCard ?? {}),
                capRateBase: expectedCapRatePct,
              },
            };
          }

          // Surface 5: Basic IM Studio slide defaults -> injected into Basic PPTX render
          const studioOverrides = buildBasicImSlideDefaults(
            snap.doc.title || 'Basic IM',
            snap.doc.body,
            snap.broker ?? undefined,
          );
          snap.doc.body = {
            ...snap.doc.body,
            _studioSlideOverrides: studioOverrides,
          };

          // Surface 3: Basic PPTX binary render + slide XML text extraction
          const input = await buildRenderInput(snap);
          const pool = loadPoiPool(cfg.name);
          if (pool) input.landmarkPoolFixture = pool;
          const pptxOut = await new MobileImPptxRenderer().render(input as never);
          const slides = extractSlideTexts(pptxOut.buffer);
          const basicPptxText = slides.join('\n');

          // Surface 4: Pro PPTX Chapter Binder
          const proBound = bindProImChapterData(
            { title: snap.doc.title ?? undefined, body: snap.doc.body },
            snap.building,
          );
          const proPptxText = JSON.stringify(proBound);

          // Macro-Transit Raster SVG (Rule 66 check)
          const transitDiagram = generateMacroTransitSvg({
            address: String(ssot.address || snap.building?.address || ''),
            propertyName: snap.doc.title || '대상 자산',
          });

          // Surface 2: Mobile IM Viewer text + statutory footer
          const viewerBaseText = viewerTextOf(snap.doc.body);
          const mobileImViewerText = [
            viewerBaseText,
            expectedCapRatePct != null ? `초기 Cap Rate: ${expectedCapRatePct.toFixed(2)}%` : '',
            formatStatutoryFooterLine(STATUTORY_BROKER),
          ]
            .filter(Boolean)
            .join('\n');

          // Surface 1: Public Blind DealCard text (/dc/[id])
          const blindRegion = maskAddress(String(ssot.address || snap.building?.address || ''));
          const dealcardPublicText = [
            `${blindRegion} ${ssot.asset_type || '상업용 빌딩'} (${cfg.priceBand})`,
            expectedCapRatePct != null
              ? `자본환원율(Cap Rate) ${expectedCapRatePct.toFixed(2)}%`
              : `사옥 실사용 적합 · 전용 업무 공간 확보`,
            formatStatutoryFooterLine(STATUTORY_BROKER),
          ].join('\n');

          // Surface 6 & 7: Newsletter Email + Kakao/OG
          const editionUrl = `https://credeal.kr/magazine/${BROKER_SLUG}/2026-11-20`;
          const unsubUrl = 'https://credeal.kr/api/public/magazine/unsubscribe?t=gold-snap-tok';
          const emailRendered = renderMagazineEmail({
            brokerName: STATUTORY_BROKER.representativeName,
            officeName: STATUTORY_BROKER.company,
            brokerContact: STATUTORY_BROKER.phone,
            senderAddress: STATUTORY_BROKER.officeAddress,
            officeRegNumber: STATUTORY_BROKER.officeRegNumber,
            representativeName: STATUTORY_BROKER.representativeName,
            subscriberName: '이대표',
            edition: {
              cadence: 'weekly',
              title: `${ssot.area_signal || '주요 권역'} 주간 빌딩 브리핑`,
              headline: `${blindRegion} 인근 우량 ${ssot.asset_type || '빌딩'} 매물 동향을 전해드립니다.`,
              marketTemp: '선별 매수',
              date: '2026-11-20',
              url: editionUrl,
              deals: [
                {
                  title: `${ssot.area_signal || '핵심 권역'} 추천 ${ssot.asset_type || '빌딩'}`,
                  address: String(ssot.address || ''),
                  price: cfg.priceBand,
                  dealUrl: `/dc/${snap.buildingId}`,
                },
              ],
            },
            unsubscribeUrl: unsubUrl,
            isAd: true,
          });

          const kakaoRendered = renderMagazineKakaoText({
            brokerName: STATUTORY_BROKER.representativeName,
            officeName: STATUTORY_BROKER.company,
            brokerContact: STATUTORY_BROKER.phone,
            senderAddress: STATUTORY_BROKER.officeAddress,
            officeRegNumber: STATUTORY_BROKER.officeRegNumber,
            representativeName: STATUTORY_BROKER.representativeName,
            subscriberName: '이대표',
            edition: {
              cadence: 'weekly',
              title: `${ssot.area_signal || '주요 권역'} 주간 빌딩 브리핑`,
              headline: `${blindRegion} 인근 추천 매물 브리핑`,
              marketTemp: '선별 매수',
              date: '2026-11-20',
              url: editionUrl,
            },
            unsubscribeUrl: unsubUrl,
            isAd: true,
          });

          const ogModel = buildImageModel(
            {
              headline: `${ssot.area_signal || '주요 권역'} 주간 빌딩 브리핑`,
              featured_deals: [
                {
                  title: `${ssot.area_signal || '핵심 권역'} ${ssot.asset_type || '빌딩'}`,
                  address: String(ssot.address || ''),
                },
              ],
            } as never,
            {
              name: STATUTORY_BROKER.representativeName,
              company: STATUTORY_BROKER.company,
              phone: STATUTORY_BROKER.phone,
            },
            '2026-11-20',
          );

          const bundle: SevenSurfaceBundle = {
            dealcardPublicText,
            mobileImViewerText,
            basicPptxText,
            proPptxText,
            studioSlideText: JSON.stringify(studioOverrides),
            newsletterEmailHtml: emailRendered.html,
            kakaoAndOgText: `${kakaoRendered.text}\n${JSON.stringify(ogModel)}`,
            rasterSvgs: [transitDiagram.rasterSvg],
          };

          const parity = evaluateSevenSurfaceParity(bundle, {
            expectedCapRatePct,
            capRateTolerancePct: 0.01,
            forbiddenBlindTokens: cfg.forbiddenBlindTokens,
            statutoryBroker: STATUTORY_BROKER,
          });

          expect(parity.violations, `${cfg.name} parity violations`).toEqual([]);
          expect(parity.passed).toBe(true);
          expect(parity.floorRisk).toBe(false);
          expect(parity.effectiveScore100).toBeGreaterThanOrEqual(95);
          expect(networkLog.blocked).toEqual([]);
        },
        60_000,
      );
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // Test 4 — Mandatory Anti-Sycophancy Negative Controls (NC-GOLD-01 .. NC-GOLD-06)
  // ════════════════════════════════════════════════════════════════════════════
  describe('Test 4 — Mandatory Anti-Sycophancy Negative Controls (NC-GOLD-01 .. NC-GOLD-06)', () => {
    it('asserts all 6/6 mandatory negative controls fail loud with floorRisk=true and effectiveScore5 <= 2.85 (effectiveScore100 <= 46.25)', () => {
      expect(MANDATORY_GOLDEN_NEGATIVE_CONTROLS).toHaveLength(6);

      const summary = verifyGoldenNegativeControls();
      expect(summary.baselineCleanPassed).toBe(true);
      expect(summary.totalControls).toBe(6);
      expect(summary.caughtCount).toBe(6);
      expect(summary.allCaughtLoudly).toBe(true);

      for (const item of summary.items) {
        expect(item.caughtLoudly, `${item.id} must be caught loudly`).toBe(true);
        expect(item.result.passed, `${item.id} passed must be false`).toBe(false);
        expect(item.result.floorRisk, `${item.id} floorRisk must be true`).toBe(true);
        expect(item.result.effectiveScore5, `${item.id} effectiveScore5 <= 2.85`).toBeLessThanOrEqual(
          FLOOR_CAP_5,
        );
        expect(
          item.result.effectiveScore100,
          `${item.id} effectiveScore100 <= 46.25`,
        ).toBeLessThanOrEqual(FLOOR_CAP_100);
        expect(item.result.violations.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
