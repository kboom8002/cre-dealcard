import { describe, it, expect } from 'vitest';
import { ClaimRegistry } from '@/domain/building/im-core/claim-registry';
import { runApprovalGate } from '@/domain/building/im-core/approval-gate';
import { FinancialCalculator } from '@/domain/building/im-core/financial-calculator';

function reg(entries: Array<[string, number | null, ('reconciled' | 'unverified')?]>): ClaimRegistry {
  const r = new ClaimRegistry();
  for (const [subject, value, status] of entries) {
    r.register({
      subject,
      value,
      unit: subject.includes('area') ? '㎡' : '원',
      evidence: [{ sourceId: 'broker' as any, asOf: '2026-10-05' }],
      provenance: 'broker',
      asOf: '2026-10-05',
      status: status ?? 'reconciled',
    });
  }
  return r;
}

const ids = (r: ReturnType<typeof runApprovalGate>, sev: 'block' | 'warn') =>
  (sev === 'warn' ? [...r.blockers, ...r.warnings] : r.blockers).filter(b => b.severity === sev).map(b => b.id);

describe('승인 게이트 — 포스처별 면적 필수 항목 매트릭스', () => {
  it('development: 매매가 + 대지면적>0, 연면적 없음 → 통과 (연면적은 warn)', () => {
    const g = runApprovalGate(reg([['asking_price', 8.9e9], ['land_area_sqm', 651.2]]), 'fact_om', { posture: 'development' });
    expect(g.passed).toBe(true);
    expect(ids(g, 'block')).toEqual([]);
    expect(ids(g, 'warn')).toContain('approval.optional_missing.total_area');
  });

  it('development: 대지면적 없음 → 차단 (연면적이 있어도)', () => {
    const g = runApprovalGate(reg([['asking_price', 8.9e9], ['total_area_sqm', 5000]]), 'fact_om', { posture: 'development' });
    expect(g.passed).toBe(false);
    expect(ids(g, 'block')).toContain('approval.required_missing.land_area');
  });

  it('development: plat_area_sqm / site_area_sqm 별칭도 대지면적으로 인정', () => {
    for (const alias of ['plat_area_sqm', 'site_area_sqm']) {
      const g = runApprovalGate(reg([['asking_price', 8.9e9], [alias, 651.2]]), 'fact_om', { posture: 'development' });
      expect(g.passed).toBe(true);
    }
  });

  it('operating: 매매가 + 연면적, 대지면적 없음 → warn 만 (통과)', () => {
    const g = runApprovalGate(reg([['asking_price', 3e10], ['total_area_sqm', 3842.6]]), 'fact_om', { posture: 'operating' });
    expect(g.passed).toBe(true);
    expect(ids(g, 'warn')).toContain('approval.optional_missing.land_area');
    expect(ids(g, 'block')).toEqual([]);
  });

  it.each(['owner_occupied', 'trading'] as const)('%s: 연면적 없음 → 차단, 대지 없음은 warn', posture => {
    const noTotal = runApprovalGate(reg([['asking_price', 3e10], ['land_area_sqm', 400]]), 'fact_om', { posture });
    expect(noTotal.passed).toBe(false);
    expect(ids(noTotal, 'block')).toContain('approval.required_missing.total_area');
    const ok = runApprovalGate(reg([['asking_price', 3e10], ['total_area_sqm', 400]]), 'fact_om', { posture });
    expect(ok.passed).toBe(true);
  });

  it('income: 연면적 + 수익률 필수, 대지면적 부재는 통과', () => {
    const g = runApprovalGate(
      reg([['asking_price', 3e10], ['total_area_sqm', 1000], ['gross_yield', 4.5]]),
      'fact_om',
      { posture: 'income' },
    );
    expect(g.passed).toBe(true);
  });

  it('방어선: 연면적 0 클레임이 들어오면 차단 (invalid_value)', () => {
    const g = runApprovalGate(reg([['asking_price', 3e10], ['total_area_sqm', 0], ['land_area_sqm', 400]]), 'fact_om', { posture: 'operating' });
    expect(g.passed).toBe(false);
    expect(ids(g, 'block')).toContain('approval.invalid_value.total_area_sqm');
  });

  it('방어선: 대지면적 0 클레임은 비개발 포스처에서도 차단 / 개발 포스처에서도 차단', () => {
    const op = runApprovalGate(reg([['asking_price', 3e10], ['total_area_sqm', 100], ['land_area_sqm', 0]]), 'fact_om', { posture: 'operating' });
    expect(ids(op, 'block')).toContain('approval.invalid_value.land_area_sqm');
    const dev = runApprovalGate(reg([['asking_price', 3e10], ['land_area_sqm', 0]]), 'fact_om', { posture: 'development' });
    expect(dev.passed).toBe(false);
    expect(ids(dev, 'block')).toContain('approval.invalid_value.land_area_sqm');
  });

  it('빈 레지스트리 / 매매가 없음은 여전히 차단', () => {
    expect(runApprovalGate(new ClaimRegistry(), 'fact_om', { posture: 'development' }).passed).toBe(false);
    const g = runApprovalGate(reg([['land_area_sqm', 400]]), 'fact_om', { posture: 'development' });
    expect(ids(g, 'block')).toContain('approval.required_missing.asking_price');
  });
});

describe('FinancialCalculator 입력 클레임 — 0/NaN/음수 미등록', () => {
  const run = (over: Record<string, unknown>) => {
    const registry = new ClaimRegistry();
    new FinancialCalculator(registry).calculate({
      posture: 'operating',
      purchasePriceKrw: 3e10,
      monthlyRentKrw: 0,
      totalAreaSqm: 3842.6,
      platAreaSqm: 486.2,
      ...over,
    } as any);
    return registry;
  };
  const subjects = (r: ClaimRegistry) => r.getAll().map(c => c.subject);

  it('정상값은 등록', () => {
    const r = run({});
    expect(subjects(r)).toEqual(expect.arrayContaining(['asking_price', 'total_area_sqm', 'land_area_sqm']));
  });

  it.each([0, NaN, -10])('platAreaSqm=%s → land_area_sqm 클레임 미등록', v => {
    const r = run({ platAreaSqm: v });
    expect(subjects(r)).not.toContain('land_area_sqm');
  });

  it.each([0, NaN, -10, Infinity])('totalAreaSqm=%s → total_area_sqm 클레임 미등록', v => {
    const r = run({ totalAreaSqm: v });
    expect(subjects(r)).not.toContain('total_area_sqm');
  });

  it('매매가 0/NaN → asking_price 미등록, monthly_rent 0 → 미등록', () => {
    expect(subjects(run({ purchasePriceKrw: 0 }))).not.toContain('asking_price');
    expect(subjects(run({ purchasePriceKrw: NaN }))).not.toContain('asking_price');
    expect(subjects(run({ monthlyRentKrw: 0 }))).not.toContain('monthly_rent_total');
  });

  it('등록된 면적 클레임 중 0 이하 값은 하나도 없다 (게이트 invalid_value 오탐 방지)', () => {
    const r = run({ platAreaSqm: 0, totalAreaSqm: 0 });
    const bad = r.getAll().filter(c => /area/.test(c.subject) && typeof c.value === 'number' && !(c.value > 0));
    expect(bad).toEqual([]);
  });
});
