/**
 * 렌트롤 v1.5 P2 — generate handler 영속 계약
 *  - body.rent_roll_meta (기본 sqm) / body.rentroll_checks / body.override_log / body.gateReport(V01·V12 범위 한정)
 *  - V12 해제 by/at 은 서버가 채움, 생성은 막지 않고 승인(gateReport.blocked)만 차단
 *  - J4 연면적은 최하위 폴백(대장·명시값이 이김), [PRICE-RECONCILE]/[AREA-RECONCILE] 경고
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  inserted: [] as Array<{ table: string; rows: any[] }>,
  warns: [] as string[],
  ssot: {} as any,
  enrichPnu: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: vi.fn() }, from: vi.fn() }),
}));

vi.mock('@/lib/logger', () => {
  const noop = () => {};
  const logger: any = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'warn') return (...args: unknown[]) => { h.warns.push(args.map((a) => (typeof a === 'string' ? a : '')).join(' ')); };
      if (prop === 'child') return () => logger;
      return noop;
    },
  });
  return { createModuleLogger: () => logger, logger };
});

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const chain: any = {
        insert: vi.fn((rows: any[]) => { h.inserted.push({ table, rows }); return chain; }),
        update: vi.fn(() => chain),
        upsert: vi.fn(() => chain),
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn().mockResolvedValue({ data: { id: 'mock-doc-id' }, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chain;
    },
    storage: { listBuckets: vi.fn().mockResolvedValue({ data: [] }) },
  }),
}));

vi.mock('@/ai/llm-client', () => ({
  callLLM: vi.fn().mockResolvedValue({ content: 'Generated AI text' }),
  embedText: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/external/external-data-orchestrator', () => ({
  enrichBuildingData: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/external/enrich-by-pnu', () => ({
  enrichBuildingDataByPNU: (...args: unknown[]) => h.enrichPnu(...args),
}));

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, readWithMigration: vi.fn().mockImplementation(async () => ({ data: h.ssot })) };
});

import { generateMobileIMHandler } from '@/app/api/broker/im-lite/generate/handler';

const row = (floor: string, area: number, over: Record<string, unknown> = {}) => ({
  floor, area_sqm: area, rent_manwon: 300, deposit_manwon: 3000, mgmt_fee_manwon: 30, ...over,
});

async function run(supplemental: Record<string, unknown>, userId = 'user-9') {
  h.inserted.length = 0;
  h.warns.length = 0;
  const res = await generateMobileIMHandler({
    buildingId: 'mock-bldg',
    userId,
    supplemental: supplemental as any,
    identity: { investmentPosture: 'income' },
    tier: 'basic',
  });
  const doc = h.inserted.find((i) => i.table === 'document_objects')?.rows?.[0];
  return { res, body: doc?.body as Record<string, any> | undefined, supplemental };
}

describe('generate handler — 렌트롤 v1.5 body 영속', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ssot = { id: 'mock-bldg', area_signal: 'gangnam', asset_type: 'building', price_band: '100', completeness_score: 80, layers: {} };
    h.enrichPnu.mockResolvedValue({});
  });

  it('메타 미전송: body.rent_roll_meta 는 area_input_unit sqm 기본, 정상 렌트롤은 게이트 통과', async () => {
    const { res, body } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 100), row('2F', 100)],
    });
    expect(res.ok).toBe(true);
    expect(body!.rent_roll_meta).toEqual({ area_input_unit: 'sqm' });
    expect(body!.override_log).toBeUndefined();
    expect(body!.gateReport).toMatchObject({ scope: 'rentroll_v15', blocked: false });
    expect(body!.gateReport.results.map((g: any) => g.id).sort()).toEqual(['V01', 'V12']);
    expect(body!.rentroll_checks).toBeTruthy();
    expect(body!.rentroll_checks.V13.value).toBe('sqm');
  });

  it('렌트롤 없음(레거시): rentroll_checks 생략, gateReport 는 통과 (기존 문서 승인 영향 없음)', async () => {
    const { res, body } = await run({ asking_price_manwon: 1_000_000, monthly_rent_total_krw: 50_000_000, resolved_pnu: '1111000000' });
    expect(res.ok).toBe(true);
    expect(body!.rentroll_checks).toBeUndefined();
    expect(body!.gateReport.blocked).toBe(false);
    expect(body!.rent_roll_meta.area_input_unit).toBe('sqm');
  });

  it('pyeong 입력 단위·메타 헤더가 body 에 그대로 영속된다', async () => {
    const { body } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 100), row('2F', 100)],
      rent_roll_meta: { area_input_unit: 'pyeong', rentroll_as_of: '2026-10-01', gfa_sqm: 300, market_rent_1f: 150000, market_rent_1f_source: '시세' },
    });
    expect(body!.rent_roll_meta).toMatchObject({ area_input_unit: 'pyeong', rentroll_as_of: '2026-10-01', gfa_sqm: 300, market_rent_1f: 150000 });
    expect(body!.rentroll_checks.V13.value).toBe('pyeong');
    expect(body!.rentroll_checks.V02.value).toBe('2026-10-01');
  });

  it('V12 면적 단위 혼동: 생성은 성공하지만 gateReport.blocked=true (승인 차단)', async () => {
    const { res, body } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 1000), row('2F', 1000)],
      rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 500 },
    });
    expect(res.ok).toBe(true);
    expect(body!.gateReport.blocked).toBe(true);
    expect(body!.gateReport.failedBlocks.map((g: any) => g.id)).toEqual(['V12']);
    expect(body!.rentroll_checks.V12.level).toBe('block');
    expect(body!.override_log).toBeUndefined();
  });

  it('V12 해제: 사유 → 승인 차단 해제, by/at 은 서버 값, override_log·note 기록', async () => {
    const before = Date.now();
    const { body, supplemental } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 1000), row('2F', 1000)],
      rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 500, area_unit_override: { reason: '  구분소유 일부 매각  ', by: 'attacker', at: '1999-01-01' } },
    }, 'user-9');
    const ov = body!.rent_roll_meta.area_unit_override;
    expect(ov.reason).toBe('구분소유 일부 매각');
    expect(ov.by).toBe('user-9');
    expect(new Date(ov.at).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(body!.override_log).toHaveLength(1);
    expect(body!.override_log[0]).toMatchObject({ code: 'AREA_UNIT_MISMATCH', reason: '구분소유 일부 매각', by: 'user-9', mismatch: true });
    expect(body!.gateReport.blocked).toBe(false);
    const v12 = body!.gateReport.results.find((g: any) => g.id === 'V12');
    expect(v12.passed).toBe(true);
    expect(v12.note).toContain('구분소유 일부 매각');
    expect(body!.rentroll_checks.V12).toMatchObject({ level: 'warn', overridden: true });
    // 라우트의 원장 메타 영속이 서버가 채운 by/at 을 쓰도록 같은 supplemental 에 반영된다
    expect((supplemental as any).rent_roll_meta.area_unit_override.by).toBe('user-9');
  });

  it('V01 월세 누락(임대중): 생성 성공 + 승인 차단, 해제 수단 없음', async () => {
    const { res, body } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 100, { rent_manwon: undefined }), row('2F', 100)],
    });
    expect(res.ok).toBe(true);
    expect(body!.gateReport.blocked).toBe(true);
    expect(body!.gateReport.failedBlocks.map((g: any) => g.id)).toEqual(['V01']);
  });

  it('J4: 대장·명시·메모가 없을 때만 연면적 폴백(area_source.total=rentroll_gfa)', async () => {
    const { body } = await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 100), row('2F', 100)],
      rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 300 },
    });
    expect(body!.ssot_summary.total_gross_area_sqm).toBe(300);
    expect(body!.ssot_summary.area_source.total).toBe('rentroll_gfa');
  });

  it('J4: 건축물대장이 있으면 대장이 이기고, 1% 초과 괴리는 [AREA-RECONCILE] 경고만', async () => {
    h.enrichPnu.mockResolvedValue({ buildingRegister: { platArea: 1000, totalArea: 5000 } });
    const { body } = await run({
      asking_price_manwon: 1_000_000,
      resolved_pnu: '1111000000000000000',
      floor_leases: [row('1F', 100), row('2F', 100)],
      rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 4000 },
    });
    expect(body!.ssot_summary.total_gross_area_sqm).toBe(5000);
    expect(body!.ssot_summary.area_source.total).toBe('public_register');
    expect(h.warns.some((w) => w.includes('[AREA-RECONCILE]'))).toBe(true);
  });

  it('J4 와 채택 연면적이 1% 이내면 [AREA-RECONCILE] 경고 없음', async () => {
    h.enrichPnu.mockResolvedValue({ buildingRegister: { platArea: 1000, totalArea: 5000 } });
    await run({
      asking_price_manwon: 1_000_000,
      resolved_pnu: '1111000000000000000',
      floor_leases: [row('1F', 100), row('2F', 100)],
      rent_roll_meta: { area_input_unit: 'sqm', gfa_sqm: 5020 },
    });
    expect(h.warns.some((w) => w.includes('[AREA-RECONCILE]'))).toBe(false);
  });

  it('[PRICE-RECONCILE]: 렌트롤 J3 와 바텀시트 매각가가 0.5% 초과 불일치하면 경고, 바텀시트 값 유지', async () => {
    const { body } = await run({
      asking_price_manwon: 1_000_000, // 100억
      floor_leases: [row('1F', 100)],
      rent_roll_meta: { area_input_unit: 'sqm', asking_price_krw: 6_000_000_000 },
    });
    expect(h.warns.some((w) => w.includes('[PRICE-RECONCILE]'))).toBe(true);
    expect(body!.asking_price_manwon).toBe(1_000_000);
    expect(body!.askingPrice).toBe(10_000_000_000);
  });

  it('[PRICE-RECONCILE]: 일치하면 경고 없음', async () => {
    await run({
      asking_price_manwon: 1_000_000,
      floor_leases: [row('1F', 100)],
      rent_roll_meta: { area_input_unit: 'sqm', asking_price_krw: 10_000_000_000 },
    });
    expect(h.warns.some((w) => w.includes('[PRICE-RECONCILE]'))).toBe(false);
  });
});
