import { describe, it, expect } from 'vitest';
import { MobileComposer } from '@/domain/building/mobile-im/composer/mobile-composer';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';

describe('MobileComposer M00~M50 6-Stage Pipeline (PR-B2-01 / Negative-Pair Obligation)', () => {
  const builder = new PublicationPackageBuilder();

  const snapshot = buildEffectiveSnapshot({
    dealId: 'deal-comp-test',
    parcels: [{ parcelId: 'p-1', address: '당산동 10', landAreaSqm: 500, status: 'SUCCESS' }],
    grossFloorArea: 1500,
    pricing: { askingPriceKrw: 15000000000, monthlyRentKrw: 50000000 },
  });

  it('Positive Pair: Valid package executes M00 through M50 and publishes active release', async () => {
    const pkg = builder.build({
      dealId: 'deal-comp-test',
      targetLevel: 'L1',
      snapshot,
      claims: {
        asking_price: {
          subject: 'asking_price',
          value: 15000000000,
          unit: 'KRW',
          basisLabel: '호가',
          status: 'confirmed',
        },
      },
      rentrollTier: 'standard',
    });

    const composer = new MobileComposer();
    const result = await composer.compose(pkg, 'L1', 'broker-senior');

    expect(result.level).toBe('L1');
    expect(result.sections.length).toBeGreaterThanOrEqual(4);
    expect(result.targetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.release.status).toBe('PUBLISHED');
    expect(result.release.publicUrl).toBe('/im-lite/deal-comp-test');
  });

  it('Negative Pair: Requesting L1.5 on an L1 package is rejected at Stage M00', async () => {
    const pkg = builder.build({
      dealId: 'deal-comp-test',
      targetLevel: 'L1', // Packaged at L1 capability
      snapshot,
      claims: {},
      rentrollTier: 'standard',
    });

    const composer = new MobileComposer();
    await expect(composer.compose(pkg, 'L1.5', 'broker-senior')).rejects.toThrowError(
      /M00_ERROR/
    );
  });
});
