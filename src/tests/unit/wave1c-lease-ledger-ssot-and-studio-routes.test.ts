/**
 * Wave 1 Track 1C — Relational Rent-Roll SSOT & Studio / Schedule-Confirm Schema Drift Remediation
 *
 * Verifies against real `supabase/schema-snapshot.json` (via `createSchemaAwareSupabase` + TypeScript AST scan):
 *  1) `POST /api/broker/buildings/[id]/lease` succeeds (200 OK), merges `lease_summary` / `layer_scores` /
 *     `completeness_score` into `building_ssot_lite.layers` (preserving existing keys), calls `persistLeaseUnits`
 *     (`lease_ledger` + `lease_ledger_meta`), and syncs `workspace_items` (`kind: 'im'`) `draft_payload.rentRoll`.
 *  2) `POST /evidence`, `POST /disclosure`, `GET /studio`, and `POST /snapshot/generate` succeed using ONLY real
 *     `schema-snapshot.json` columns on `building_ssot_lite` and `evidence_files`.
 *  3) `POST /api/broker/schedule/confirm` resolves broker phone from `profiles.phone` without referencing
 *     non-existent `broker_profiles.phone`.
 *  4) `lease-adapter.ts` (`persistLeaseUnits` + `syncLeaseLedgerToSummary` + `legacy_dual` `lease_units.lease_end_date`)
 *     and all touched route files produce 0 schema-drift violations against `supabase/schema-snapshot.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createSchemaAwareSupabase,
  loadSchema,
  type SchemaAwareSupabase,
} from '@/tests/helpers/schema-aware-supabase-mock';

const BROKER_ID = '11111111-1111-4111-8111-111111111101';
const BUILDING_ID = '22222222-2222-4222-8222-222222222202';
const SLOT_ID = '33333333-3333-4333-8333-333333333303';
const BOOKING_ID = '44444444-4444-4444-8444-444444444404';
const REQUESTER_ID = '55555555-5555-4555-8555-555555555505';
const WS_IM_ID = '66666666-6666-4666-8666-666666666606';

const h = vi.hoisted(() => ({
  db: null as SchemaAwareSupabase | null,
  authUser: null as { id: string; email?: string; phone?: string } | null,
  role: 'broker' as string,
  alimtalkCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => h.db,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => h.db,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: h.authUser },
        error: null,
      }),
    },
    from: (table: string) => h.db!.from(table),
    rpc: (name: string, args?: unknown) => h.db!.rpc(name, args),
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: async () =>
    h.authUser
      ? { user: h.authUser, role: h.role, error: null }
      : {
          user: null,
          role: null,
          error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
        },
}));

vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimit: async () => true,
}));

vi.mock('@/lib/ai-quota-guard', () => ({
  enforceBrokerAiQuota: async () => null,
}));

vi.mock('@/lib/notification/notification-service', () => ({
  sendKakaoAlimtalk: vi.fn(async (payload: Record<string, unknown>) => {
    h.alimtalkCalls.push(payload);
    return { success: true };
  }),
}));

vi.mock('@/ai/agents/BuildingSnapshotAgent', () => ({
  runBuildingSnapshotAgent: vi.fn().mockResolvedValue({
    snapshot: {
      headline: '역삼역 권역 근생빌딩 스냅샷 초안',
      area_signal: '강남구 역삼동 일대',
      asset_type: '근린생활시설',
      size_signal: '연면적 약 1,050㎡',
      price_band: '100억대',
      current_use_summary: '1층 리테일 및 상층부 오피스 운영',
      deal_thesis: '역세권 가시성과 안정적 임대 구성을 보유한 매물입니다.',
      risk_summary: '일부 호실 만기 도래 예정으로 재계약 조건 점검이 필요합니다.',
      financial_snapshot: {
        vacancy_rate_note: '공실률 약 0% (브로커 제공 기준)',
        walt_note: 'WALT 약 2.0년 수준',
        income_note: '연간 임대수입 참고 수준',
      },
      buyer_fit_types: ['수익형 투자자'],
      missing_data_note: '수선 이력 추가 확인 필요',
      boundary_disclaimer:
        '본 자료는 중개인이 제공한 참고용 정보로, 투자 권유나 법적 확약이 아닙니다. 상세 실사 및 전문가 검토가 필요합니다.',
      document_version: 'v0.3-snapshot',
    },
    model: 'gpt-5.4',
    promptVersion: 'v0.3-snapshot-prompt',
  }),
}));

import * as leaseAdapter from '@/domain/building/mobile-im/lease-adapter';
import { POST as postLease } from '@/app/api/broker/buildings/[id]/lease/route';
import { POST as postEvidence } from '@/app/api/broker/buildings/[id]/evidence/route';
import { POST as postDisclosure } from '@/app/api/broker/buildings/[id]/disclosure/route';
import { GET as getStudio } from '@/app/api/broker/buildings/[id]/studio/route';
import { POST as postSnapshotGenerate } from '@/app/api/broker/buildings/[id]/snapshot/generate/route';
import { POST as postScheduleConfirm } from '@/app/api/broker/schedule/confirm/route';

describe('Wave 1C: Relational Rent-Roll SSOT & Studio / Schedule-Confirm Schema Remediation', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    h.alimtalkCalls.length = 0;
    h.authUser = { id: BROKER_ID, email: 'broker1c@credeal.test' };
    h.role = 'broker';
    h.db = createSchemaAwareSupabase({
      profiles: [
        {
          id: BROKER_ID,
          role: 'broker',
          display_name: '김정석 대표',
          company: '정석중개법인',
          phone: '010-8888-7777',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      broker_profiles: [
        {
          id: '77777777-7777-4777-8777-777777777707',
          user_id: BROKER_ID,
          name: '김정석 공인중개사',
          representative_name: '김정석',
          is_verified: true,
          specialty_assets: ['office'],
          specialty_regions: ['강남구'],
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      building_ssot_lite: [
        {
          id: BUILDING_ID,
          owner_id: BROKER_ID,
          area_signal: '역삼역 권역',
          asset_type: '근린생활시설',
          price_band: '100억대',
          raw_input: '역삼역 인근 근생 100억대',
          input_type: 'broker_memo',
          created_by_role: 'broker',
          status: 'draft',
          confidence: {},
          disclosure: {},
          hidden_fields: [],
          layers: {
            building_register: { total_floor_area_pyung: 318, approval_date: '2019-05-10' },
            location: { sigungu: '강남구' },
          },
          matched_buyer_count: 0,
          promotion_score: 0,
          vacancy_demand_verified: false,
          vacancy_inquiry_count: 0,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      evidence_files: [
        {
          id: '88888888-8888-4888-8888-888888888808',
          building_id: BUILDING_ID,
          owner_id: BROKER_ID,
          file_type: 'building_register',
          storage_bucket: 'evidence-private',
          storage_path: `${BUILDING_ID}/building_register/reg.pdf`,
          visibility: 'private',
          contains_sensitive_data: false,
          training_allowed: false,
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      workspace_items: [
        {
          id: WS_IM_ID,
          owner_id: BROKER_ID,
          building_id: BUILDING_ID,
          kind: 'im',
          status: 'draft',
          title: '역삼역 근생 IM',
          address: '서울특별시 강남구 역삼동',
          price_band: '100억대',
          draft_payload: {
            id: WS_IM_ID,
            buildingId: BUILDING_ID,
            title: '역삼역 근생 IM',
            rentRoll: [],
          },
          version: 1,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      availability_slots: [
        {
          id: SLOT_ID,
          owner_id: BROKER_ID,
          building_id: BUILDING_ID,
          slot_date: '2026-12-01',
          slot_start: '2026-12-01T05:00:00.000Z',
          slot_end: '2026-12-01T06:00:00.000Z',
          slot_type: 'tour',
          status: 'hold',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
      bookings: [
        {
          id: BOOKING_ID,
          slot_id: SLOT_ID,
          requester_id: REQUESTER_ID,
          status: 'hold',
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
      ],
    });
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  });

  it('1) POST /lease succeeds (200 OK), merges into building_ssot_lite.layers, persists canonical lease_ledger (+ meta), and syncs workspace_items IM rentRoll', async () => {
    const persistSpy = vi.spyOn(leaseAdapter, 'persistLeaseUnits');

    const req = new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/lease`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenants: [
          {
            floor: '1F',
            area_sqm: 165.29,
            tenant_type: 'retail',
            monthly_rent: 6_500_000,
            deposit: 100_000_000,
            mgmt_fee_krw: 500_000,
            contract_end: '2028-12',
            is_anchor: true,
            tenant_name: '스타벅스',
          },
          {
            floor: '2F',
            area_sqm: 165.29,
            tenant_type: 'office',
            monthly_rent: 4_500_000,
            deposit: 50_000_000,
            contract_end: '2027-06-30',
            tenant_name: '정석테크',
          },
        ],
        rentRollMeta: {
          area_input_unit: 'pyeong',
          rentroll_version: '1.5',
        },
      }),
    });

    const res = await postLease(req, { params: Promise.resolve({ id: BUILDING_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // building_register (20) + rent_roll (25) + asking_price (5) = 50
    expect(body.newCompletenessScore).toBe(50);
    expect(persistSpy).toHaveBeenCalledTimes(1);

    // Verify building_ssot_lite.layers merged cleanly without losing pre-existing keys
    const [bldRow] = h.db!.__rows('building_ssot_lite');
    const layers = bldRow.layers as Record<string, any>;
    expect(layers.building_register).toEqual({ total_floor_area_pyung: 318, approval_date: '2019-05-10' });
    expect(layers.location).toEqual({ sigungu: '강남구' });
    expect(layers.completeness_score).toBe(50);
    expect(layers.layer_scores.total).toBe(50);
    expect(layers.lease_summary.tenants).toHaveLength(2);
    expect(layers.lease_summary.monthly_rent_total_krw).toBe(11_000_000);
    expect(layers.lease_summary.total_deposit_krw).toBe(150_000_000);

    // Verify canonical lease_ledger + lease_ledger_meta persisted
    const ledgerRows = h.db!.__rows('lease_ledger');
    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows.find((r) => r.unit_label === '1F')).toMatchObject({
      asset_id: BUILDING_ID,
      monthly_rent_krw: 6_500_000,
      deposit_krw: 100_000_000,
      mgmt_fee_krw: 500_000,
      current_expiry_date: '2028-12-01',
      source_tier: 'studio_input',
    });

    const metaRows = h.db!.__rows('lease_ledger_meta');
    expect(metaRows).toHaveLength(1);
    expect(metaRows[0]).toMatchObject({
      asset_id: BUILDING_ID,
      area_input_unit: 'pyeong',
      rentroll_version: '1.5',
    });

    // Verify matching workspace_items (kind: 'im') draft_payload.rentRoll synced
    const [wsRow] = h.db!.__rows('workspace_items');
    const draft = wsRow.draft_payload as Record<string, any>;
    expect(wsRow.version).toBe(2);
    expect(draft.rentRoll).toHaveLength(2);
    expect(draft.rentRoll[0]).toMatchObject({
      floor: '1F',
      tenantName: '스타벅스',
      depositManwon: 10000,
      monthlyRentManwon: 650,
      maintenanceManwon: 50,
      status: 'occupied',
    });
    expect(draft.monthlyRentTotalManwon).toBe(1100);
    expect(draft.totalDepositManwon).toBe(15000);
  });

  it('2) evidence, disclosure, studio, and snapshot/generate routes succeed against real schema-snapshot.json columns', async () => {
    // 2a. POST /evidence (floor_plan + registry_docs) -> stores metadata in evidence_files.file_type & layers
    const evFloorPlanRes = await postEvidence(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/evidence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'floorplan_1f.pdf',
          fileSizeBytes: 204800,
          mimeType: 'application/pdf',
          layerCategory: 'floor_plan',
          storageBucket: 'evidence-private',
          storagePath: `${BUILDING_ID}/floor_plan/floorplan_1f.pdf`,
          visibility: 'private',
        }),
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    const evFloorPlanJson = await evFloorPlanRes.json();
    expect(evFloorPlanRes.status).toBe(200);
    expect(evFloorPlanJson.ok).toBe(true);
    // building_register (20) + floor_plan (10) + asking_price (5) = 35
    expect(evFloorPlanJson.newCompletenessScore).toBe(35);

    const evRegistryRes = await postEvidence(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/evidence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'registry.pdf',
          fileSizeBytes: 102400,
          mimeType: 'application/pdf',
          layerCategory: 'registry_docs',
          storageBucket: 'evidence-private',
          storagePath: `${BUILDING_ID}/registry_docs/registry.pdf`,
          visibility: 'private',
        }),
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    expect(evRegistryRes.status).toBe(200);

    const evRows = h.db!.__rows('evidence_files');
    expect(evRows).toHaveLength(3);
    const parsedMeta = JSON.parse(String(evRows[1].file_type));
    expect(parsedMeta).toMatchObject({
      layer_category: 'floor_plan',
      file_name: 'floorplan_1f.pdf',
      file_size_bytes: 204800,
      mime_type: 'application/pdf',
      is_verified: false,
    });

    const layersAfterEv = h.db!.__rows('building_ssot_lite')[0].layers as Record<string, any>;
    expect(layersAfterEv.floor_plan_url).toBe(`${BUILDING_ID}/floor_plan/floorplan_1f.pdf`);
    expect(layersAfterEv.evidence_files_meta).toHaveLength(2);

    // 2b. POST /disclosure -> merges disclosure_prefs into building_ssot_lite.layers
    const discRes = await postDisclosure(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/disclosure`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          blind_teaser: true,
          disclosurePrefs: {
            show_area_signal: true,
            show_asset_type: true,
            show_price_band: true,
            hide_exact_address: false,
          },
        }),
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    const discJson = await discRes.json();
    expect(discRes.status).toBe(200);
    expect(discJson.ok).toBe(true);
    expect(discJson.disclosurePrefs.hide_exact_address).toBe(true);
    expect(discJson.disclosurePrefs.hide_tenant_names).toBe(true);
    expect(discJson.disclosurePrefs.hide_unit_rent).toBe(true);
    // building_register (20) + registry_docs (15) + floor_plan (10) + asking_price (5) + disclosure (5) = 55
    expect(discJson.newCompletenessScore).toBe(55);

    // Snapshot generate at 55 (< 60) -> 422 COMPLETENESS_INSUFFICIENT reading layers.completeness_score
    const lowSnapRes = await postSnapshotGenerate(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/snapshot/generate`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    expect(lowSnapRes.status).toBe(422);

    // Seed canonical lease_ledger row directly (simulating bottom-sheet / importer write) and verify GET /studio hydrates from lease_ledger!
    await leaseAdapter.persistLeaseUnits(
      BUILDING_ID,
      [
        {
          floor: '1F',
          tenant_sector: 'retail',
          lease_area_sqm: 150,
          deposit_krw: 80_000_000,
          monthly_rent_krw: 5_000_000,
          lease_end: '2028-09-30',
          lease_state: '임대중',
          source_tier: 'broker_input',
        },
      ],
      undefined,
      { supabaseClient: h.db },
    );

    // 2c. GET /studio -> hydrates leaseSummary from lease_ledger, updates layers.completeness_score to 80 (55 + 25)
    const studioRes = await getStudio(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/studio`, {
        method: 'GET',
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    const studioJson = await studioRes.json();
    expect(studioRes.status).toBe(200);
    expect(studioJson.ok).toBe(true);
    expect(studioJson.completenessScore).toBe(80);
    expect(studioJson.checklist.rentRoll).toBe(true);
    expect(studioJson.checklist.floorPlan).toBe(true);
    expect(studioJson.checklist.disclosurePolicy).toBe(true);
    expect(studioJson.leaseSummary.tenants).toHaveLength(1);
    expect(studioJson.financialSummary).not.toBeNull();

    // 2d. POST /snapshot/generate now succeeds (score 80 >= 60) with zero schema violations
    const okSnapRes = await postSnapshotGenerate(
      new NextRequest(`http://localhost:3000/api/broker/buildings/${BUILDING_ID}/snapshot/generate`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: BUILDING_ID }) },
    );
    const okSnapJson = await okSnapRes.json();
    expect(okSnapRes.status).toBe(200);
    expect(okSnapJson.ok).toBe(true);
    expect(okSnapJson.documentType).toBe('building_snapshot_draft');
    expect(h.db!.__rows('document_objects')).toHaveLength(1);
  });

  it('3) POST /api/broker/schedule/confirm resolves broker phone from profiles.phone and confirms booking', async () => {
    const res = await postScheduleConfirm(
      new Request('http://localhost:3000/api/broker/schedule/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookingId: BOOKING_ID }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(h.db!.__rows('bookings')[0].status).toBe('confirmed');
    expect(h.db!.__rows('availability_slots')[0].status).toBe('confirmed');
    expect(h.alimtalkCalls).toHaveLength(1);
    expect(h.alimtalkCalls[0]).toMatchObject({
      recipientPhone: '010-8888-7777',
      variables: expect.objectContaining({
        '#{brokerName}': '김정석 공인중개사',
      }),
    });
  });

  it('4a) lease-adapter: legacy_dual uses lease_units.lease_end_date, syncLeaseLedgerToSummary computes canonical metrics, and prune guards newer batches', async () => {
    process.env.LEASE_TABLE = 'legacy_dual';

    // Seed an old stale row (past timestamp) and a newer concurrent row (future timestamp)
    await h.db!.from('lease_ledger').insert([
      {
        id: '99999999-9999-4999-8999-999999999901',
        asset_id: BUILDING_ID,
        unit_label: 'OLD_STALE_FLOOR',
        lease_state: '임대중',
        source_tier: 'studio_input',
        created_at: '2020-01-01T00:00:00.000Z',
        updated_at: '2020-01-01T00:00:00.000Z',
      },
      {
        id: '99999999-9999-4999-8999-999999999902',
        asset_id: BUILDING_ID,
        unit_label: 'FUTURE_CONCURRENT_FLOOR',
        lease_state: '임대중',
        source_tier: 'studio_input',
        created_at: '2099-01-01T00:00:00.000Z',
        updated_at: '2099-01-01T00:00:00.000Z',
      },
    ]);

    const persistRes = await leaseAdapter.persistLeaseUnits(
      BUILDING_ID,
      [
        {
          floor: '1F',
          tenant_sector: 'retail',
          area_pyung: 45,
          deposit_krw: 50_000_000,
          monthly_rent_krw: 3_500_000,
          mgmt_fee_krw: 300_000,
          lease_start: '2025-01-01',
          lease_end: '2028-12-31',
          source_tier: 'studio_input',
        },
      ],
      undefined,
      { pruneSourceTier: 'studio_input', supabaseClient: h.db },
    );

    expect(persistRes.errors).toEqual([]);
    expect(persistRes.inserted).toBe(1);

    // Verify legacy_dual wrote `lease_end_date` (NOT `lease_end`) cleanly into `lease_units`
    const legacyUnits = h.db!.__rows('lease_units');
    expect(legacyUnits).toHaveLength(1);
    expect(legacyUnits[0]).toMatchObject({
      asset_id: BUILDING_ID,
      floor: '1F',
      lease_start: '2025-01-01',
      lease_end_date: '2028-12-31',
    });
    expect(legacyUnits[0]).not.toHaveProperty('lease_end');

    // Verify stale row <= batchStartedAt was pruned, while newer row > batchStartedAt was preserved
    const ledgerLabels = h.db!.__rows('lease_ledger').map((r) => r.unit_label);
    expect(ledgerLabels).toContain('1F');
    expect(ledgerLabels).toContain('FUTURE_CONCURRENT_FLOOR');
    expect(ledgerLabels).not.toContain('OLD_STALE_FLOOR');

    // Verify syncLeaseLedgerToSummary excludes owner-occupied units from vacancy denominator
    const summary = leaseAdapter.syncLeaseLedgerToSummary(
      [
        { floor: '1F', lease_area_sqm: 100, monthly_rent_krw: 4_000_000, deposit_krw: 40_000_000, lease_state: '임대중', current_expiry_date: '2028-11-01' },
        { floor: '2F', lease_area_sqm: 100, lease_state: '공실' },
        { floor: '3F', lease_area_sqm: 100, lease_state: '자가사용' },
      ],
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(summary.vacancy_rate).toBe(50);
    expect(summary.monthly_rent_total_krw).toBe(4_000_000);
    expect(summary.total_deposit_krw).toBe(40_000_000);
    expect(summary.walt_months).toBe(24);
    expect(summary.rentRollRows.map((r) => r.status)).toEqual(['occupied', 'vacant', 'owner']);
  });

  it('4b) AST static gate: 0 COL-MISSING / TABLE-MISSING violations across all 7 touched files against supabase/schema-snapshot.json', () => {
    const schema = loadSchema();
    const targetRelFiles = [
      'src/domain/building/mobile-im/lease-adapter.ts',
      'src/app/api/broker/buildings/[id]/lease/route.ts',
      'src/app/api/broker/buildings/[id]/evidence/route.ts',
      'src/app/api/broker/buildings/[id]/disclosure/route.ts',
      'src/app/api/broker/buildings/[id]/studio/route.ts',
      'src/app/api/broker/buildings/[id]/snapshot/generate/route.ts',
      'src/app/api/broker/schedule/confirm/route.ts',
    ];

    const colMethods = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'order', 'not']);
    const writeMethods = new Set(['insert', 'update', 'upsert']);
    const colRe = /^[A-Za-z_][A-Za-z0-9_]*$/;

    const strOf = (n: ts.Node | undefined): string | null =>
      n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

    const parseSelectCols = (s: string): string[] => {
      const parts: Array<{ raw: string; rel: boolean }> = [];
      let depth = 0;
      let cur = '';
      for (const ch of s) {
        if (ch === '(') {
          depth++;
          if (depth === 1) {
            parts.push({ raw: cur.trim(), rel: true });
            cur = '';
            continue;
          }
        }
        if (ch === ')') {
          depth--;
          continue;
        }
        if (depth > 0) continue;
        if (ch === ',') {
          if (cur.trim()) parts.push({ raw: cur.trim(), rel: false });
          cur = '';
          continue;
        }
        cur += ch;
      }
      if (cur.trim()) parts.push({ raw: cur.trim(), rel: false });
      return parts
        .filter((p) => !p.rel)
        .map((p) => p.raw.replace(/\s+/g, '').split('::')[0].split(':').pop()!.split('->')[0])
        .filter((c) => c && c !== '*' && !c.includes('!') && colRe.test(c));
    };

    const violations: string[] = [];

    for (const rel of targetRelFiles) {
      const abs = path.resolve(process.cwd(), rel);
      const src = fs.readFileSync(abs, 'utf8');
      const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

      const visit = (n: ts.Node): void => {
        if (
          ts.isCallExpression(n) &&
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === 'from' &&
          n.arguments.length === 1
        ) {
          const objTxt = n.expression.expression.getText(sf);
          if (!/storage/.test(objTxt)) {
            const table = strOf(n.arguments[0]);
            if (table && colRe.test(table)) {
              const tableCols = schema[table] ? new Set(schema[table]) : null;
              if (!tableCols) {
                violations.push(`${rel}: TABLE-MISSING ${table}`);
              } else {
                let cur: ts.Node = n;
                while (
                  cur.parent &&
                  ts.isPropertyAccessExpression(cur.parent) &&
                  cur.parent.parent &&
                  ts.isCallExpression(cur.parent.parent)
                ) {
                  const call = cur.parent.parent;
                  const meth = cur.parent.name.text;
                  const a0 = call.arguments[0];
                  if (meth === 'select') {
                    const s = strOf(a0);
                    if (s) {
                      for (const c of parseSelectCols(s)) {
                        if (!tableCols.has(c)) violations.push(`${rel}: COL-MISSING ${table}.${c} (select)`);
                      }
                    }
                  } else if (writeMethods.has(meth) && a0 && ts.isObjectLiteralExpression(a0)) {
                    for (const p of a0.properties) {
                      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name) {
                        const col = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
                        if (col && colRe.test(col) && !tableCols.has(col)) {
                          violations.push(`${rel}: COL-MISSING ${table}.${col} (${meth})`);
                        }
                      }
                    }
                  } else if (colMethods.has(meth)) {
                    const s = strOf(a0);
                    if (s) {
                      const c = s.split('->')[0].split('.')[0];
                      if (colRe.test(c) && !tableCols.has(c)) {
                        violations.push(`${rel}: COL-MISSING ${table}.${c} (${meth})`);
                      }
                    }
                  }
                  cur = call;
                }
              }
            }
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }

    expect(violations).toEqual([]);
  });
});
