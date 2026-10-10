/**
 * 렌트롤 v1.5 P2 — lease-adapter 영속 계층 (원장 행·메타 행·sparse/prune 옵션·마이그레이션 미적용 폴백)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  /** lease_ledger upsert 호출 순서별로 돌려줄 에러 (소진되면 null) */
  ledgerUpsertErrors: [] as Array<{ message: string } | null>,
  metaError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => ({
      upsert: (...args: unknown[]) => {
        h.calls.push({ table, op: 'upsert', args });
        if (table === 'lease_ledger') return Promise.resolve({ error: h.ledgerUpsertErrors.shift() ?? null });
        return Promise.resolve({ error: table === 'lease_ledger_meta' ? h.metaError : null });
      },
      delete: () => {
        const chain: Record<string, unknown> = {};
        chain.eq = (...args: unknown[]) => { h.calls.push({ table, op: 'delete.eq', args }); return chain; };
        chain.not = (...args: unknown[]) => { h.calls.push({ table, op: 'delete.not', args }); return Promise.resolve({ error: null }); };
        return chain;
      },
    }),
  }),
}));

import {
  buildLeaseLedgerRows,
  buildLeaseLedgerMetaRow,
  floorLeaseToPersistUnit,
  persistLeaseUnits,
} from '@/domain/building/mobile-im/lease-adapter';

beforeEach(() => {
  h.calls.length = 0;
  h.ledgerUpsertErrors.length = 0;
  h.metaError = null;
});

describe('buildLeaseLedgerRows — v1.4/v1.5 컬럼', () => {
  it('evidence_level / rent_free_months / payment_status 는 허용값만, 관리비 빈 값은 null (0 아님)', () => {
    const [a, b] = buildLeaseLedgerRows('asset-1', [
      { floor: '1F', monthly_rent_krw: 3_000_000, deposit_krw: 30_000_000, mgmt_fee_krw: 300_000, evidence_level: '계약서 원본', rent_free_months: 2, payment_status: '정상' },
      { floor: '2F', contract_group: 'G1', evidence_level: '카톡', rent_free_months: -1, payment_status: '??' },
    ]);
    expect(a).toMatchObject({ evidence_level: '계약서 원본', rent_free_months: 2, payment_status: '정상', mgmt_fee_krw: 300_000 });
    expect(b).toMatchObject({ evidence_level: null, rent_free_months: null, payment_status: null, mgmt_fee_krw: null, contract_group: 'G1' });
  });
});

describe('floorLeaseToPersistUnit', () => {
  it('만원 → 원 환산 + v1.5 필드 통과, 0/빈 금액은 undefined', () => {
    const u = floorLeaseToPersistUnit({
      floor: '3F', rent_manwon: 250, deposit_manwon: 2500, mgmt_fee_manwon: 0,
      area_sqm: 100, exclusive_area_sqm: 60, contract_group: 'A', legal_basis: '상가',
      evidence_level: '구두', rent_free_months: 1, payment_status: '연체', lease_state: '임대중',
    });
    expect(u).toMatchObject({
      floor: '3F', monthly_rent_krw: 2_500_000, deposit_krw: 25_000_000, mgmt_fee_krw: undefined,
      lease_area_sqm: 100, exclusive_area_sqm: 60, contract_group: 'A', legal_basis: '상가',
      evidence_level: '구두', rent_free_months: 1, payment_status: '연체', lease_state: '임대중', source_tier: 'broker_input',
    });
  });

  it('대용(proxy) 면적은 임대면적으로 저장하지 않는다', () => {
    const u = floorLeaseToPersistUnit({ floor: '1F', area_sqm: 80, area_sqm_is_proxy: true });
    expect(u.lease_area_sqm).toBeUndefined();
  });
});

describe('buildLeaseLedgerMetaRow', () => {
  it('J4(㎡)·시장임대료는 환산 없이 보관, 해제 기록 포함', () => {
    const row = buildLeaseLedgerMetaRow('asset-1', {
      area_input_unit: 'pyeong',
      rentroll_version: '1.5',
      rentroll_as_of: '2026-10-01',
      asking_price_krw: 5_000_000_000,
      gfa_sqm: 1234.567,
      market_rent_1f: 150000,
      market_rent_1f_source: ' 출처 ',
      other_income_krw: 0,
      area_unit_override: { reason: '일부 매각', by: 'user-1', at: '2026-10-10T00:00:00.000Z' },
    });
    expect(row).toMatchObject({
      asset_id: 'asset-1', area_input_unit: 'pyeong', rentroll_version: '1.5', rentroll_as_of: '2026-10-01',
      asking_price_krw: 5_000_000_000, gfa_sqm: 1234.57, market_rent_1f: 150000, market_rent_1f_source: '출처',
      other_income_krw: 0, area_unit_override_reason: '일부 매각', area_unit_override_by: 'user-1',
      area_unit_override_at: '2026-10-10T00:00:00.000Z',
    });
  });

  it('기본은 sqm, 빈 값은 null', () => {
    const row = buildLeaseLedgerMetaRow('a', { area_input_unit: 'sqm' });
    expect(row).toMatchObject({ area_input_unit: 'sqm', gfa_sqm: null, area_unit_override_reason: null, other_income_krw: null });
  });
});

describe('persistLeaseUnits', () => {
  const unit = { floor: '1F', monthly_rent_krw: 1_000_000, source_tier: 'broker_input' };

  it('meta 가 없으면 lease_ledger_meta 를 건드리지 않는다', async () => {
    await persistLeaseUnits('asset-1', [unit]);
    expect(h.calls.some((c) => c.table === 'lease_ledger_meta')).toBe(false);
  });

  it('meta 가 있으면 lease_ledger_meta 를 asset_id 충돌키로 upsert', async () => {
    const r = await persistLeaseUnits('asset-1', [unit], undefined, { meta: { area_input_unit: 'pyeong' } });
    const m = h.calls.find((c) => c.table === 'lease_ledger_meta');
    expect(m).toBeTruthy();
    expect(m!.args[1]).toEqual({ onConflict: 'asset_id' });
    expect((m!.args[0] as Record<string, unknown>).area_input_unit).toBe('pyeong');
    expect(r.errors).toEqual([]);
  });

  it('메타 쓰기 실패는 비차단 — 호실 저장 결과는 유지, 에러만 기록', async () => {
    h.metaError = { message: 'relation "lease_ledger_meta" does not exist' };
    const r = await persistLeaseUnits('asset-1', [unit], undefined, { meta: { area_input_unit: 'sqm' } });
    expect(r.inserted).toBe(1);
    expect(r.errors.some((e) => e.startsWith('lease_ledger_meta'))).toBe(true);
  });

  it('마이그레이션 미적용(새 컬럼 오류)이면 v1.4 컬럼을 빼고 재시도', async () => {
    h.ledgerUpsertErrors.push({ message: "Could not find the 'evidence_level' column of 'lease_ledger' in the schema cache" });
    const r = await persistLeaseUnits('asset-1', [{ ...unit, evidence_level: '구두' }]);
    const upserts = h.calls.filter((c) => c.table === 'lease_ledger' && c.op === 'upsert');
    expect(upserts).toHaveLength(2);
    expect((upserts[0].args[0] as Array<Record<string, unknown>>)[0]).toHaveProperty('evidence_level');
    const retryRow = (upserts[1].args[0] as Array<Record<string, unknown>>)[0];
    expect(retryRow).not.toHaveProperty('evidence_level');
    expect(retryRow).not.toHaveProperty('rent_free_months');
    expect(retryRow).not.toHaveProperty('payment_status');
    expect(r.errors).toEqual([]);
    expect(r.inserted).toBe(1);
  });

  it('sparse: 전부 null 인 컬럼은 페이로드에서 제외, lease_state 는 명시값이 있을 때만', async () => {
    await persistLeaseUnits('asset-1', [{ floor: '1F', monthly_rent_krw: 1_000_000 }], undefined, { sparse: true });
    const row = (h.calls.find((c) => c.table === 'lease_ledger' && c.op === 'upsert')!.args[0] as Array<Record<string, unknown>>)[0];
    expect(row).toHaveProperty('monthly_rent_krw', 1_000_000);
    expect(row).toHaveProperty('unit_label');
    expect(row).not.toHaveProperty('contract_group');
    expect(row).not.toHaveProperty('evidence_level');
    expect(row).not.toHaveProperty('mgmt_fee_krw');
    expect(row).not.toHaveProperty('lease_state');
  });

  it('pruneSourceTier: prune 을 해당 source_tier 로 한정, 미지정이면 asset_id 만', async () => {
    await persistLeaseUnits('asset-1', [unit], undefined, { pruneSourceTier: 'studio_input' });
    expect(h.calls.filter((c) => c.op === 'delete.eq').map((c) => c.args)).toEqual([
      ['asset_id', 'asset-1'],
      ['source_tier', 'studio_input'],
    ]);
    h.calls.length = 0;
    await persistLeaseUnits('asset-1', [unit]);
    expect(h.calls.filter((c) => c.op === 'delete.eq').map((c) => c.args)).toEqual([['asset_id', 'asset-1']]);
  });
});
