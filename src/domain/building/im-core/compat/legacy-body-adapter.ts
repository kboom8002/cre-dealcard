import type { PublicationPackage } from '../publication/package-builder';

export function adaptPublicationPackageToLegacyBody(
  pkg: PublicationPackage
): Record<string, unknown> {
  const { snapshot, claims, proposals } = pkg;

  return {
    packageId: pkg.packageId,
    packageHash: pkg.packageHash,
    snapshotHash: pkg.snapshotHash,
    tier: pkg.level === 'L1.5' ? 'decision_im' : 'fact_om',
    property_summary: {
      asking_price: snapshot.pricing.askingPriceKrw,
      land_area: snapshot.areas.landAreaTotal,
      gross_floor_area: snapshot.areas.grossFloorArea,
      building_area: snapshot.areas.buildingAreaTotal,
      price_per_pyeong_land: snapshot.unitPrices.pricePerPyeongLand,
      price_per_pyeong_gross: snapshot.unitPrices.pricePerPyeongGross,
    },
    financial_analysis: {
      asking_price_krw: snapshot.pricing.askingPriceKrw,
      monthly_rent_krw: snapshot.pricing.monthlyRentKrw,
      total_deposit_krw: snapshot.pricing.totalDepositKrw,
    },
    investment_thesis: proposals
      .filter((p) => p.approvalState === 'broker_confirmed')
      .map((p) => ({
        raw: p.brokerRawText,
        meaning: p.buyerIntentMeaning,
        copy: p.finalCopy,
      })),
    claims: Object.values(claims).map((c) => ({
      subject: c.subject,
      value: c.value,
      status: c.status,
      unit: c.unit,
      basis: c.basisLabel,
    })),
    asOf: snapshot.asOf,
    createdAt: pkg.createdAt,
  };
}
