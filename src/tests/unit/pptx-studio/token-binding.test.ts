import { describe, it, expect } from 'vitest';
import { TokenBinder } from '@/domain/building/pptx-studio/composition/token-binder';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';

describe('PptxStudio Token Binder (PR-B3-02 / Negative-Pair Obligation)', () => {
  const binder = new TokenBinder();
  const builder = new PublicationPackageBuilder();

  const snapshot = buildEffectiveSnapshot({
    dealId: 'deal-pptx-bind',
    parcels: [{ parcelId: 'p-1', address: '테헤란로 1', landAreaSqm: 600, status: 'SUCCESS' }],
    grossFloorArea: 2400,
    pricing: { askingPriceKrw: 30000000000 },
  });

  const pkg = builder.build({
    dealId: 'deal-pptx-bind',
    targetLevel: 'L1',
    snapshot,
    claims: {},
    rentrollTier: 'standard',
  });

  it('Positive Pair: Registered claim tokens resolve strictly to package-approved numbers', () => {
    const template =
      '본 자산의 매매가는 {{claim.asking_price}}이며, 대지면적은 {{claim.land_area}}입니다.';
    const result = binder.bindTokens(template, pkg);

    expect(result).toBe('본 자산의 매매가는 300억 원이며, 대지면적은 600 ㎡입니다.');
  });

  it('Negative Pair: Unverified or unmapped tokens are immediately rejected', () => {
    const template = '본 자산의 예상 수익률은 {{claim.fabricated_yield}}에 달합니다.';
    expect(() => binder.bindTokens(template, pkg)).toThrowError(/UNKNOWN_TOKEN_VIOLATION/);
  });
});
