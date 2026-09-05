import type { PublicationPackage } from '../../im-core/publication/package-builder';

export class TokenBinder {
  bindTokens(templateText: string, pkg: PublicationPackage): string {
    const { snapshot, claims } = pkg;
    const snap = (snapshot ?? {}) as any;
    const areas = snapshot?.areas;
    const pricing = snapshot?.pricing;
    const unitPrices = snapshot?.unitPrices;

    const formatPriceInEok = (krw: number | undefined | null): string => {
      if (krw === undefined || krw === null || isNaN(krw)) return '-';
      return `${(krw / 100000000).toLocaleString()}억 원`;
    };

    const formatManWon = (krw: number | undefined | null): string => {
      if (krw === undefined || krw === null || isNaN(krw)) return '-';
      return `${Math.floor(krw / 10000).toLocaleString()}만 원`;
    };

    const formatArea = (val: number | undefined | null): string => {
      if (val === undefined || val === null || isNaN(val)) return '-';
      return `${val.toLocaleString()} ㎡`;
    };

    const tokenMap: Record<string, string> = {
      'claim.asking_price': formatPriceInEok(pricing?.askingPriceKrw),
      'claim.land_area': formatArea(areas?.landAreaTotal),
      'claim.gross_floor_area': formatArea(areas?.grossFloorArea),
      'claim.price_per_pyeong_land': formatManWon(unitPrices?.pricePerPyeongLand),
      'claim.price_per_pyeong_gross': formatManWon(unitPrices?.pricePerPyeongGross),
    };

    // snapshot.xxx tokens
    const address = snap.address || snapshot?.parcels?.[0]?.address || '-';
    const buildingName = snap.buildingName || snap.building_name || snap.title || '-';
    const rawBuiltYear = snap.builtYear ?? snap.built_year ?? snap.completionYear;
    const builtYear = rawBuiltYear !== undefined && rawBuiltYear !== null
      ? (typeof rawBuiltYear === 'number' || /^\d{4}$/.test(String(rawBuiltYear)) ? `${rawBuiltYear}년` : String(rawBuiltYear))
      : '-';

    const rawFloorsAbove = snap.floorsAbove ?? snap.floors_above ?? snap.groundFloors;
    const floorsAbove = rawFloorsAbove !== undefined && rawFloorsAbove !== null
      ? (typeof rawFloorsAbove === 'number' || /^\d+$/.test(String(rawFloorsAbove)) ? `지상 ${rawFloorsAbove}층` : String(rawFloorsAbove))
      : '-';

    const rawFloorsBelow = snap.floorsBelow ?? snap.floors_below ?? snap.undergroundFloors;
    const floorsBelow = rawFloorsBelow !== undefined && rawFloorsBelow !== null
      ? (typeof rawFloorsBelow === 'number' || /^\d+$/.test(String(rawFloorsBelow)) ? `지하 ${rawFloorsBelow}층` : String(rawFloorsBelow))
      : '-';

    const zoningDistrict = snap.zoningDistrict || snap.zoning_district || snap.zoning || snap.landUse || '-';

    tokenMap['snapshot.address'] = String(address);
    tokenMap['snapshot.building_name'] = String(buildingName);
    tokenMap['snapshot.land_area'] = formatArea(areas?.landAreaTotal);
    tokenMap['snapshot.gross_floor_area'] = formatArea(areas?.grossFloorArea);
    tokenMap['snapshot.building_area'] = formatArea(areas?.buildingAreaTotal);
    tokenMap['snapshot.exclusive_lease_area'] = formatArea(areas?.exclusiveLeaseArea);
    tokenMap['snapshot.built_year'] = builtYear;
    tokenMap['snapshot.floors_above'] = floorsAbove;
    tokenMap['snapshot.floors_below'] = floorsBelow;
    tokenMap['snapshot.zoning_district'] = String(zoningDistrict);
    tokenMap['snapshot.asking_price'] = formatPriceInEok(pricing?.askingPriceKrw);
    tokenMap['snapshot.monthly_rent'] = formatPriceInEok(pricing?.monthlyRentKrw);
    tokenMap['snapshot.deposit'] = formatPriceInEok(pricing?.totalDepositKrw);
    tokenMap['snapshot.monthly_admin_fee'] = formatManWon(pricing?.monthlyAdminFeeKrw);
    tokenMap['snapshot.price_per_pyeong_land'] = formatManWon(unitPrices?.pricePerPyeongLand);
    tokenMap['snapshot.price_per_pyeong_gross'] = formatManWon(unitPrices?.pricePerPyeongGross);
    tokenMap['snapshot.deal_id'] = String(snapshot?.dealId ?? '-');

    // Also populate any dynamic evaluated claims
    for (const [subj, claim] of Object.entries(claims ?? {})) {
      if (!claim) continue;
      const formattedVal = typeof claim.value === 'number'
        ? claim.value.toLocaleString()
        : (claim.value !== null && claim.value !== undefined ? String(claim.value) : '-');
      const unit = claim.unit ? ` ${claim.unit}` : '';
      tokenMap[`claim.${subj}`] = `${formattedVal}${unit}`;
    }

    let boundText = templateText.replace(/\{\{([^{}]+)\}\}/g, (match, tokenKey) => {
      const trimmed = tokenKey.trim();
      const val = tokenMap[trimmed];
      if (val === undefined) {
        throw new Error(`UNKNOWN_TOKEN_VIOLATION: Unrecognized claim token {{${trimmed}}}`);
      }
      return val;
    });

    // Check for leftover tokens
    if (/\{\{[^{}]+\}\}/.test(boundText)) {
      throw new Error(`TOKEN_BINDING_INCOMPLETE: 잔존 템플릿 변수가 검출되었습니다`);
    }

    return boundText;
  }
}
