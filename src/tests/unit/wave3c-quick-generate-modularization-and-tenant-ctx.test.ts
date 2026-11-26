/**
 * @file src/tests/unit/wave3c-quick-generate-modularization-and-tenant-ctx.test.ts
 * @description Wave 3 Track 3C Verification Suite:
 *   1. Extracted `src/lib/im-lite/quick-generate/*` submodules pure unit contracts.
 *   2. `src/app/api/broker/im-lite/quick-generate/route.ts` monolith decomposition (< 900 LOC) & export parity.
 *   3. `withBrokerTenantContext` Zero-Trust 401/403 enforcement, RLS user-client provisioning, and 500 error masking,
 *      plus `/api/broker/brand-color` RLS tenant route integration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireBroker: vi.fn(),
  createTypedServerSupabaseClient: vi.fn(),
  createServiceClient: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => hoisted.requireBroker(...args),
}));

vi.mock('@/lib/supabase/server', () => ({
  createTypedServerSupabaseClient: (...args: unknown[]) =>
    hoisted.createTypedServerSupabaseClient(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: (...args: unknown[]) => hoisted.createServiceClient(...args),
}));

vi.mock('@/lib/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: (...args: unknown[]) => hoisted.logError(...args),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      error: (...args: unknown[]) => hoisted.logError(...args),
    }),
  }),
}));

import {
  mapPostureToCanonical,
  mapPostureToCard4,
  mapPostureToLegacy,
  resolveQuickGeneratePostures,
} from '@/lib/im-lite/quick-generate/posture-normalizer';
import {
  deriveBlindSafeRegion,
  isValidCoordsForAddress,
  isValidPnuForAddress,
  normalizeAddrDedupKey,
  sanitizeIncomingPnuAndCoords,
} from '@/lib/im-lite/quick-generate/poison-pnu-guard';
import {
  buildMappedFloorLeasesAndVacancy,
  normalizeExpectedRentRollRows,
  summarizeRentRollTotalsAndFloors,
  synthesizeRentRollFloorAreas,
} from '@/lib/im-lite/quick-generate/floor-area-synthesizer';
import {
  LARGE_INLINE_PHOTO_THRESHOLD_CHARS,
  filterPersistedPhotosForDb,
  normalizeUserSubmittedPhotos,
} from '@/lib/im-lite/quick-generate/photo-storage-offload';
import {
  buildPublicSanitizedCard4,
  checkUnmaskedLotNumber,
  createBlindIdentifierStripper,
  formatExactEokDisplay,
  stripLotNumbersSafe,
} from '@/lib/im-lite/quick-generate/card4-and-markdown-builder';
import { cleanBrokerVal } from '@/lib/im-lite/quick-generate/existing-building-resolver';
import { Card4Schema, computeCard4Hash } from '@/lib/deal-card/card4-schema';
import { withBrokerTenantContext } from '@/lib/supabase/tenant-context';
import {
  DELETE as brandColorDelete,
  GET as brandColorGet,
  PUT as brandColorPut,
} from '@/app/api/broker/brand-color/route';

describe('Wave 3C [1] quick-generate extracted submodules', () => {
  it('posture-normalizer maps canonical, legacy, and card4 postures deterministically', () => {
    expect(mapPostureToCanonical('presale_LP')).toBe('core_income');
    expect(mapPostureToCanonical('buyer_valueadd')).toBe('value_add');
    expect(mapPostureToCanonical('owner_occupied')).toBe('owner_occupier');
    expect(mapPostureToCanonical('buyer_developer')).toBe('development');
    expect(mapPostureToCanonical('operating')).toBe('repositioning');
    expect(mapPostureToCanonical('unknown_posture')).toBe('core_income');

    expect(mapPostureToLegacy('buyer_valueadd')).toBe('income');
    expect(mapPostureToLegacy('trading')).toBe('trading');
    expect(mapPostureToLegacy('owner_occupier')).toBe('owner_occupied');
    expect(mapPostureToLegacy('repositioning')).toBe('operating');

    expect(mapPostureToCard4('value_add')).toBe('value_add');
    expect(mapPostureToCard4('development')).toBe('value_add');
    expect(mapPostureToCard4('owner_occupier')).toBe('owner_occupied');
    expect(mapPostureToCard4('core_income')).toBe('income');

    expect(resolveQuickGeneratePostures(undefined, 'trading')).toEqual({
      rawPosture: 'trading',
      posture: 'value_add',
      legacyPosture: 'trading',
      card4Posture: 'value_add',
    });
  });

  it('poison-pnu-guard blocks seed/cross-dong PNUs & coordinates while preserving valid parcel data', () => {
    const mapoAddr = '서울특별시 마포구 동교동 168-4';
    const dangsanAddr = '서울특별시 영등포구 당산동5가 11-47';
    const yeoksamAddr = '서울특별시 강남구 역삼동 823-33';

    // Poison non-existent seed PNU is always blocked
    expect(isValidPnuForAddress(dangsanAddr, '1156012800100800001')).toBe(false);
    // Cross-dong Dangsan seed PNU blocked on Mapo address, allowed on Dangsan address
    expect(isValidPnuForAddress(mapoAddr, '1156011500100110047')).toBe(false);
    expect(isValidPnuForAddress(dangsanAddr, '1156011500100110047')).toBe(true);
    // Cross-dong Yeoksam seed PNU blocked on Mapo, allowed on Yeoksam
    expect(isValidPnuForAddress(mapoAddr, '1168010100108230033')).toBe(false);
    expect(isValidPnuForAddress(yeoksamAddr, '1168010100108230033')).toBe(true);

    // Out-of-Korea & cross-dong coordinates blocked
    expect(isValidCoordsForAddress(mapoAddr, { lat: 35.68, lng: 120.0 })).toBe(false);
    expect(isValidCoordsForAddress(mapoAddr, { lat: 37.4996, lng: 127.0344 })).toBe(false);
    expect(isValidCoordsForAddress(mapoAddr, { lat: 37.5568, lng: 126.9241 })).toBe(true);

    const sanitizedPoison = sanitizeIncomingPnuAndCoords({
      cleanAddress: mapoAddr,
      rawPnu: '1156011500100110047',
      rawCoordinates: { lat: 37.5342, lng: 126.9022 },
    });
    expect(sanitizedPoison).toEqual({ sanitizedRawPnu: '', sanitizedRawCoords: undefined });

    expect(normalizeAddrDedupKey('서울특별시 강남구 역삼동 823-10번지 (역삼타워)')).toBe(
      '강남구역삼동823-10',
    );
    expect(deriveBlindSafeRegion('서울특별시 성동구 성수동2가 280-1')).toBe('성동구 성수동2가');
    expect(cleanBrokerVal('11560-2023-00412')).toBe('');
    expect(cleanBrokerVal('강남프라임중개법인')).toBe('강남프라임중개법인');
  });

  it('floor-area-synthesizer excludes vacant/owner rows from rent sums and shares floor GFA proportionally', () => {
    const rawRows = [
      { floor: '101호', tenantName: '성수카페', depositManwon: 5000, monthlyRentManwon: 400 },
      { floor: '102호', tenantName: '성수약국', depositManwon: 7000, monthlyRentManwon: 500 },
      { floor: '2F', status: 'vacant', depositManwon: 3000, monthlyRentManwon: 250 },
      { floor: '3F', lease_state: '자가사용', depositManwon: 9000, monthlyRentManwon: 600 },
      { floor: 'B1', tenantName: '스튜디오', depositManwon: 2000, monthlyRentManwon: 150, area_sqm: 2.45 },
      { floor: '옥탑', use: '부대시설', depositManwon: 0, monthlyRentManwon: 0 },
    ];

    const summary = summarizeRentRollTotalsAndFloors(rawRows);
    expect(summary.totalDepositManwon).toBe(14000); // 5000 + 7000 + 2000 (vacant & owner excluded)
    expect(summary.totalMonthlyRentManwon).toBe(1050); // 400 + 500 + 150
    expect(summary.maxFloorAbove).toBe(3);
    expect(summary.maxFloorBelow).toBe(1);
    expect(summary.vacantUnitsCount).toBe(1);

    const withAreas = synthesizeRentRollFloorAreas({
      safeRentRoll: summary.safeRentRoll,
      existingFloorLeases: [],
      effectiveFloorsAbove: 3,
      totalFloorsCount: 4,
      effectiveGfaSqm: 400,
      perFloorAreaSqm: 100,
    });

    // 4 active non-aux floors (1F, 2F, 3F, B1) -> 100㎡ per floor; 101호 & 102호 split 1F -> 50㎡ each
    expect(withAreas[0].area_sqm).toBe(50);
    expect(withAreas[1].area_sqm).toBe(50);
    // Poison 2.45㎡ sentinel is ignored and replaced with floor budget (100㎡)
    expect(withAreas[4].area_sqm).toBe(100);
    // Auxiliary 옥탑 row gets 0㎡
    expect(withAreas[5].area_sqm).toBe(0);

    const { mappedFloorLeases, vacancyPct } = buildMappedFloorLeasesAndVacancy({
      safeRentRollWithAreas: withAreas,
      existingFloorLeases: [],
    });
    // Leasable rows: 101호, 102호, 2F(vacant), B1 (3F 자가사용 & 옥탑 excluded) -> 1 / 4 = 25%
    expect(vacancyPct).toBe(25);
    expect(mappedFloorLeases[0].floor).toBe('1F');
    expect(mappedFloorLeases[0].unit_label).toBe('101호');

    const expectedNormalized = normalizeExpectedRentRollRows({
      rawExpectedRentRoll: [{ floor: '2F', status: 'vacant', depositManwon: 4000, monthlyRentManwon: 320 }],
      rawExpectedRentRollSnake: [],
      safeRentRollWithAreas: withAreas,
    });
    expect(expectedNormalized[0].status).toBe('occupied');
    expect(expectedNormalized[0].area_sqm).toBe(100);
  });

  it('photo-storage-offload normalizes real vs test photos and filters >32KB data URIs for DB diet', () => {
    const realUrl = 'https://cdn.credeal.net/storage/v1/object/public/building_photos/u1/b1/hero.webp';
    const normalized = normalizeUserSubmittedPhotos([
      { url: realUrl, name: '01_전면_외관.jpg' },
      { url: 'blob:http://localhost:3000/abc' },
      { url: '/test-images/fake.png' },
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      url: realUrl,
      category: 'exterior',
      role: 'cover',
      isHero: true,
    });

    const smallDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const hugeDataUri = `data:image/jpeg;base64,${'A'.repeat(LARGE_INLINE_PHOTO_THRESHOLD_CHARS + 100)}`;
    const persisted = filterPersistedPhotosForDb([
      { url: realUrl },
      { url: smallDataUri },
      { url: hugeDataUri },
    ]);
    expect(persisted).toEqual([{ url: realUrl }, { url: smallDataUri }]);
  });

  it('card4-and-markdown-builder formats exact eok prices and scrubs blind identifiers/lot numbers', () => {
    expect(formatExactEokDisplay(2_422_680)).toEqual({
      exactEokNum: 242.27,
      exactEokDisplay: '242억 2,680만 원',
    });
    expect(formatExactEokDisplay(12_000_000).exactEokDisplay).toBe('1,200억 원');
    expect(formatExactEokDisplay(0).exactEokDisplay).toBe('가격 협의');

    const strippedRegion = stripLotNumbersSafe('영등포구 당산동5가 11-47').trim();
    expect(strippedRegion).toBe('영등포구 당산동5가');
    expect(checkUnmaskedLotNumber(strippedRegion)).toBe(false);
    expect(checkUnmaskedLotNumber('강남구 역삼동 823-10')).toBe(true);

    const stripper = createBlindIdentifierStripper({
      derivedRegion: '강남구 역삼동',
      buildingNameCandidates: ['역삼시그니처타워'],
      safeRentRoll: [{ tenantName: '스타벅스역삼점' }],
      mappedFloorLeases: [],
    });
    const draft = {
      posture: 'income' as const,
      region: '강남구 역삼동',
      use: '근린생활시설',
      headline: '역삼시그니처타워 급매',
      priceBand: '120억대',
      points: [
        '역삼시그니처타워 대로변 코너',
        '1층 스타벅스역삼점 장기 임차',
        '연 임대수익률 4.50%',
      ] as [string, string, string],
      provenance: { points: ['public', 'broker', 'ai'] as const },
      card4_version: 1,
    };
    const baseCard4 = Card4Schema.parse({ ...draft, card4_hash: computeCard4Hash(draft) });
    const pubCard4 = buildPublicSanitizedCard4({
      body: {},
      card4: baseCard4,
      cleanAddress: '서울특별시 강남구 역삼동 823-10',
      priceNum: 1_200_000,
      safePublicRegion: '강남구 역삼동',
      stripBlindIdentifiers: stripper,
    });
    expect(JSON.stringify(pubCard4)).not.toContain('역삼시그니처타워');
    expect(JSON.stringify(pubCard4)).not.toContain('스타벅스역삼점');
  });
});

describe('Wave 3C [2] quick-generate/route.ts monolith decomposition check', () => {
  it('reduces quick-generate/route.ts below 900 LOC while preserving POST & maxDuration=120 exports', async () => {
    const routePath = path.resolve(
      process.cwd(),
      'src/app/api/broker/im-lite/quick-generate/route.ts',
    );
    const routeSource = fs.readFileSync(routePath, 'utf8');
    const lineCount = routeSource.split(/\r?\n/).length;

    expect(lineCount).toBeLessThan(900);

    const expectedModules = [
      'posture-normalizer.ts',
      'poison-pnu-guard.ts',
      'existing-building-resolver.ts',
      'photo-storage-offload.ts',
      'parcel-and-spatial-enricher.ts',
      'floor-area-synthesizer.ts',
      'card4-and-markdown-builder.ts',
      'document-payload-and-persistence.ts',
    ];
    for (const modName of expectedModules) {
      const fullModPath = path.resolve(process.cwd(), 'src/lib/im-lite/quick-generate', modName);
      expect(fs.existsSync(fullModPath), `Missing extracted module ${modName}`).toBe(true);
    }

    const routeMod = await import('@/app/api/broker/im-lite/quick-generate/route');
    expect(routeMod.maxDuration).toBe(120);
    expect(typeof routeMod.POST).toBe('function');
  });
});

describe('Wave 3C [3] Zero-Trust withBrokerTenantContext & brand-color RLS route', () => {
  const BROKER_ID = '11111111-1111-4111-8111-111111111111';
  const ADMIN_ID = '99999999-9999-4999-8999-999999999999';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces 401 and 403 before creating RLS client or running handler', async () => {
    hoisted.requireBroker.mockResolvedValueOnce({
      user: null,
      role: null,
      profile: null,
      error: NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 }),
    });

    const handlerSpy = vi.fn();
    const res401 = await withBrokerTenantContext(
      new NextRequest('https://credeal.net/api/broker/brand-color'),
      handlerSpy,
    );
    expect(res401.status).toBe(401);
    expect(hoisted.createTypedServerSupabaseClient).not.toHaveBeenCalled();
    expect(handlerSpy).not.toHaveBeenCalled();

    hoisted.requireBroker.mockResolvedValueOnce({
      user: { id: '22222222-2222-4222-8222-222222222222' },
      role: 'public_user',
      profile: { role: 'public_user', display_name: '일반유저' },
      error: NextResponse.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 }),
    });

    const res403 = await withBrokerTenantContext(
      new NextRequest('https://credeal.net/api/broker/brand-color'),
      handlerSpy,
    );
    expect(res403.status).toBe(403);
    expect(hoisted.createTypedServerSupabaseClient).not.toHaveBeenCalled();
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it('provisions user-scoped RLS Supabase client (never service_role) and populates isAdmin accurately', async () => {
    const fakeRlsClient = { from: vi.fn() };
    hoisted.createTypedServerSupabaseClient.mockResolvedValue(fakeRlsClient);
    hoisted.requireBroker.mockResolvedValueOnce({
      user: { id: ADMIN_ID, email: 'admin@credeal.net' },
      role: 'admin',
      profile: { role: 'admin', display_name: '관리자' },
      error: null,
    });

    const res = await withBrokerTenantContext(
      new NextRequest('https://credeal.net/api/broker/brand-color'),
      async (ctx) => {
        expect(ctx.userId).toBe(ADMIN_ID);
        expect(ctx.role).toBe('admin');
        expect(ctx.isAdmin).toBe(true);
        expect(ctx.supabase).toBe(fakeRlsClient);
        return NextResponse.json({ ok: true, actor: ctx.userId });
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, actor: ADMIN_ID });
    expect(hoisted.createTypedServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(hoisted.createServiceClient).not.toHaveBeenCalled();
  });

  it('masks uncaught handler exceptions with structured server logs and non-leaking 500 JSON', async () => {
    hoisted.createTypedServerSupabaseClient.mockResolvedValue({ from: vi.fn() });
    hoisted.requireBroker.mockResolvedValueOnce({
      user: { id: BROKER_ID, email: 'broker@credeal.net' },
      role: 'broker',
      profile: { role: 'broker', display_name: '중개사' },
      error: null,
    });

    const res = await withBrokerTenantContext(
      new NextRequest('https://credeal.net/api/broker/brand-color', { method: 'PUT' }),
      async () => {
        throw new Error('FATAL postgres://service_role:top_secret_pw@db.internal:5432/postgres');
      },
    );

    const rawText = await res.text();
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    expect(res.status).toBe(500);
    expect(parsed).toEqual({
      ok: false,
      code: 'INTERNAL_SERVER_ERROR',
      error: '요청 처리에 실패했습니다.',
    });
    expect(rawText).not.toContain('top_secret_pw');
    expect(rawText).not.toContain('postgres://');
    expect(hoisted.logError).toHaveBeenCalledTimes(1);
  });

  it('executes /api/broker/brand-color GET/PUT/DELETE via RLS client and masks DB write errors', async () => {
    const filtersSeen: Array<{ table: string; col: string; val: unknown }> = [];
    let simulateWriteFailure = false;

    const rlsClient = {
      from(table: string) {
        let op: 'select' | 'update' | 'insert' = 'select';
        const chain: any = {
          select() {
            return chain;
          },
          update() {
            op = 'update';
            return chain;
          },
          insert() {
            op = 'insert';
            return chain;
          },
          eq(col: string, val: unknown) {
            filtersSeen.push({ table, col, val });
            return chain;
          },
          neq() {
            return chain;
          },
          order() {
            return chain;
          },
          limit() {
            return chain;
          },
          async maybeSingle() {
            if (table === 'broker_profiles') {
              return { data: { user_id: BROKER_ID, company_id: null }, error: null };
            }
            if (table === 'pptx_custom_presets') {
              return {
                data: { id: 'preset-1', tokens: { accent: '1F4E8C' } },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          async single() {
            if (simulateWriteFailure && (op === 'update' || op === 'insert')) {
              return {
                data: null,
                error: { message: 'new row violates row-level security policy internal_rls_detail' },
              };
            }
            return { data: { id: 'preset-1' }, error: null };
          },
          then(resolve: (v: unknown) => void) {
            resolve({
              data: null,
              error:
                simulateWriteFailure && op === 'update'
                  ? { message: 'db secret failure detail' }
                  : null,
            });
          },
        };
        return chain;
      },
    };

    hoisted.createTypedServerSupabaseClient.mockResolvedValue(rlsClient);
    hoisted.requireBroker.mockResolvedValue({
      user: { id: BROKER_ID, email: 'broker@credeal.net' },
      role: 'broker',
      profile: { role: 'broker', display_name: '박준호' },
      error: null,
    });

    // 1. GET resolves brand accent under RLS client
    const getRes = await brandColorGet(new NextRequest('https://credeal.net/api/broker/brand-color'));
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({
      accent: '1F4E8C',
      source: 'user_default',
      preset_id: 'preset-1',
    });

    // 2. PUT rejects invalid hex with 400
    const badPutRes = await brandColorPut(
      new NextRequest('https://credeal.net/api/broker/brand-color', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accent: 'not-a-hex' }),
      }),
    );
    expect(badPutRes.status).toBe(400);

    // 3. PUT succeeds with valid hex and scopes writes to userId
    const okPutRes = await brandColorPut(
      new NextRequest('https://credeal.net/api/broker/brand-color', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accent: '#0F766E' }),
      }),
    );
    expect(okPutRes.status).toBe(200);
    expect(await okPutRes.json()).toMatchObject({
      accent: '0F766E',
      preset_id: 'preset-1',
    });
    expect(filtersSeen.some((f) => f.table === 'pptx_custom_presets' && f.col === 'user_id' && f.val === BROKER_ID)).toBe(
      true,
    );

    // 4. DELETE masks raw DB error via withBrokerTenantContext
    simulateWriteFailure = true;
    const errDelRes = await brandColorDelete(
      new NextRequest('https://credeal.net/api/broker/brand-color', { method: 'DELETE' }),
    );
    const errDelText = await errDelRes.text();
    expect(errDelRes.status).toBe(500);
    expect(errDelText).not.toContain('db secret failure detail');
    expect(hoisted.createServiceClient).not.toHaveBeenCalled();
  });
});
