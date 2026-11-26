/**
 * @file src/lib/im-lite/quick-generate/floor-area-synthesizer.ts
 * @description Rent-roll totals, effective physical specs, proportional floor-area allocation, and PPTX floor_leases mapping.
 */

import { m2ToPyeong, pyeongToM2 } from '@/domain/building/im-core/facts/area';

export interface RentRollSummaryMetrics {
  safeRentRoll: any[];
  totalDepositManwon: number;
  totalMonthlyRentManwon: number;
  totalMaintManwon: number;
  maxFloorAbove: number;
  maxFloorBelow: number;
  vacantUnitsCount: number;
}

export function summarizeRentRollTotalsAndFloors(rentRoll: unknown): RentRollSummaryMetrics {
  let totalDepositManwon = 0;
  let totalMonthlyRentManwon = 0;
  let totalMaintManwon = 0;
  let maxFloorAbove = 0;
  let maxFloorBelow = 0;
  let vacantUnitsCount = 0;

  const safeRentRoll = Array.isArray(rentRoll) ? rentRoll : [];
  for (const r of safeRentRoll) {
    if (!r) continue;
    const rawFloor = String(r.floor || '').trim();
    const isAuxFloor = /(주차|옥탑|기계식|루프탑|부대|관리)/.test(rawFloor);
    if (!isAuxFloor && rawFloor) {
      const segments = rawFloor.split(/[~,\s/]+/).filter(Boolean);
      for (const seg of segments) {
        const fStr = seg.trim().toUpperCase();
        if (!fStr) continue;
        const negMatch = fStr.match(/^-\s*(\d+)/);
        if (negMatch) {
          const n = parseInt(negMatch[1], 10);
          const fl = n >= 100 ? Math.floor(n / 100) : n;
          if (fl > 0 && fl < 20) maxFloorBelow = Math.max(maxFloorBelow, fl);
          continue;
        }
        const unitFloorMatch = fStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
        if (unitFloorMatch) {
          const parsedFl = parseInt(unitFloorMatch[2], 10);
          if (unitFloorMatch[1]) {
            maxFloorBelow = Math.max(maxFloorBelow, parsedFl || 1);
          } else if (parsedFl > 0 && parsedFl < 100) {
            maxFloorAbove = Math.max(maxFloorAbove, parsedFl);
          }
        } else if (fStr.startsWith('B') || fStr.includes('지하')) {
          const m = fStr.match(/(\d+)/);
          const rawBelow = m ? parseInt(m[1], 10) : 1;
          maxFloorBelow = Math.max(
            maxFloorBelow,
            rawBelow >= 100 ? Math.floor(rawBelow / 100) : rawBelow,
          );
        } else {
          const m = fStr.match(/(\d+)/);
          if (m) {
            const rawAbove = parseInt(m[1], 10);
            const normAbove = rawAbove >= 100 ? Math.floor(rawAbove / 100) : rawAbove;
            if (normAbove > 0 && normAbove < 100) {
              maxFloorAbove = Math.max(maxFloorAbove, normAbove);
            }
          }
        }
      }
    }

    const isVacant =
      r.status === 'vacant' ||
      r.is_vacant === true ||
      r.lease_state === '공실' ||
      r.use === '공실';
    const isOwner =
      !isVacant &&
      (r.status === 'owner' ||
        r.lease_state === '자가사용' ||
        r.use === '자가사용' ||
        r.use === '자가');
    if (isVacant) {
      vacantUnitsCount++;
    } else if (!isOwner) {
      totalDepositManwon += Number(r.depositManwon ?? r.deposit_manwon ?? r.deposit ?? 0);
      totalMonthlyRentManwon += Number(
        r.monthlyRentManwon ?? r.rent_manwon ?? r.monthlyRent ?? r.rent ?? 0,
      );
      totalMaintManwon += Number(
        r.maintenanceManwon ?? r.mgmt_fee_manwon ?? r.maintenance ?? 0,
      );
    }
  }

  return {
    safeRentRoll,
    totalDepositManwon: Math.round(totalDepositManwon * 10) / 10,
    totalMonthlyRentManwon: Math.round(totalMonthlyRentManwon * 10) / 10,
    totalMaintManwon: Math.round(totalMaintManwon * 10) / 10,
    maxFloorAbove,
    maxFloorBelow,
    vacantUnitsCount,
  };
}

export interface EffectiveBuildingSpecs {
  effectiveFloorsAbove: number;
  effectiveFloorsBelow: number;
  effectiveLandSqm: number;
  effectiveGfaSqm: number;
  effectiveZoning: string;
  effectiveCompletionDate: string;
  totalFloorsCount: number;
  perFloorAreaSqm: number;
  rawBcrPct: number;
  bcrPct: number;
  rawFarPct: number;
  farPct: number;
  parkingSpaces: number;
  elevators: number;
  rawOfficialLandPrice: number;
  officialLandPriceWonSqm: number;
}

export function resolveEffectiveBuildingSpecs(params: {
  body: Record<string, any>;
  knownMatch?: Record<string, any>;
  existingEnrichment?: Record<string, any>;
  existingSsot?: Record<string, any>;
  maxFloorAbove: number;
  maxFloorBelow: number;
}): EffectiveBuildingSpecs {
  const { body, knownMatch, existingEnrichment, existingSsot, maxFloorAbove, maxFloorBelow } =
    params;
  const rawFloorsAbove = body.floorsAbove;
  const rawFloorsBelow = body.floorsBelow;
  const landAreaSqm = body.landAreaSqm;
  const gfaSqm = body.gfaSqm;
  const zoning = body.zoning;
  const completionDate = body.completionDate;

  const existingFloorsAbove = Number(
    existingEnrichment?.buildingRegister?.floorsAbove ?? existingSsot?.floors_above ?? 0,
  );
  const existingFloorsBelow = Number(
    existingEnrichment?.buildingRegister?.floorsBelow ?? existingSsot?.floors_below ?? 0,
  );
  const effectiveFloorsAbove =
    Number(rawFloorsAbove) > 0 && Number(rawFloorsAbove) < 100
      ? Number(rawFloorsAbove)
      : knownMatch?.floorsAbove ??
        (existingFloorsAbove > 0 && existingFloorsAbove < 100
          ? existingFloorsAbove
          : maxFloorAbove > 0
            ? maxFloorAbove
            : 0);
  const effectiveFloorsBelow =
    rawFloorsBelow !== undefined &&
    rawFloorsBelow !== null &&
    rawFloorsBelow !== '' &&
    Number.isFinite(Number(rawFloorsBelow)) &&
    Number(rawFloorsBelow) >= 0 &&
    Number(rawFloorsBelow) < 20
      ? Number(rawFloorsBelow)
      : knownMatch?.floorsBelow ??
        (existingFloorsBelow > 0 && existingFloorsBelow < 20
          ? existingFloorsBelow
          : maxFloorBelow > 0
            ? maxFloorBelow
            : 0);
  const effectiveLandSqm =
    Number(landAreaSqm) > 0
      ? Number(landAreaSqm)
      : knownMatch?.landAreaSqm ?? Number(existingSsot?.land_area_sqm || 0);
  const effectiveGfaSqm =
    Number(gfaSqm) > 0
      ? Number(gfaSqm)
      : knownMatch?.gfaSqm ?? Number(existingSsot?.total_gross_area_sqm || 0);
  const rawZoning = typeof zoning === 'string' ? zoning.trim() : '';
  const effectiveZoning =
    rawZoning ||
    knownMatch?.zoning ||
    String(existingEnrichment?.landUsePlan?.zoning || existingSsot?.zoning || '').trim() ||
    '';
  const rawCompletionDate = typeof completionDate === 'string' ? completionDate.trim() : '';
  const effectiveCompletionDate =
    rawCompletionDate ||
    knownMatch?.completionDate ||
    String(
      existingEnrichment?.buildingRegister?.completionDate || existingSsot?.completion_date || '',
    ).trim() ||
    '';
  const totalFloorsCount = Math.max(1, effectiveFloorsAbove + effectiveFloorsBelow);
  const perFloorAreaSqm = Math.round((effectiveGfaSqm / totalFloorsCount) * 10) / 10;

  const rawBcrPct = Number(body.bcrPct);
  const bcrPct =
    rawBcrPct > 0
      ? rawBcrPct
      : knownMatch?.bcrPct ??
        (Number(existingEnrichment?.buildingRegister?.bcr) > 0
          ? Number(existingEnrichment?.buildingRegister?.bcr)
          : Number(existingSsot?.bcr_pct || 0));
  const rawFarPct = Number(body.farPct);
  const farPct =
    rawFarPct > 0
      ? rawFarPct
      : knownMatch?.farPct ??
        (Number(existingEnrichment?.buildingRegister?.far) > 0
          ? Number(existingEnrichment?.buildingRegister?.far)
          : Number(existingSsot?.far_pct || 0));
  const rawParkingSpaces = body.parkingSpaces ?? body.parkingTotal;
  const parkingSpaces =
    rawParkingSpaces !== undefined &&
    rawParkingSpaces !== null &&
    rawParkingSpaces !== '' &&
    Number.isFinite(Number(rawParkingSpaces)) &&
    (Number(rawParkingSpaces) > 0 || !knownMatch?.parkingSpaces)
      ? Number(rawParkingSpaces)
      : knownMatch?.parkingSpaces ??
        (Number(existingEnrichment?.buildingRegister?.parkingSpaces) > 0
          ? Number(existingEnrichment?.buildingRegister?.parkingSpaces)
          : Number(existingSsot?.parking_total ?? existingSsot?.parking_count ?? 0));
  const rawElevators = body.elevators ?? body.elevatorCount;
  const elevators =
    rawElevators !== undefined &&
    rawElevators !== null &&
    rawElevators !== '' &&
    Number.isFinite(Number(rawElevators)) &&
    (Number(rawElevators) > 0 || !knownMatch?.elevators)
      ? Number(rawElevators)
      : knownMatch?.elevators !== undefined
        ? knownMatch.elevators
        : Number(existingEnrichment?.buildingRegister?.elevators) > 0
          ? Number(existingEnrichment?.buildingRegister?.elevators)
          : Number(existingSsot?.elevator_count ?? 0);
  const rawOfficialLandPrice = Number(
    body.officialLandPriceWonSqm || body.officialLandPricePerSqm || 0,
  );
  const officialLandPriceWonSqm =
    rawOfficialLandPrice > 0
      ? rawOfficialLandPrice
      : knownMatch?.officialLandPriceWonSqm ??
        (Number(existingEnrichment?.landPrice?.officialPricePerM2) > 0
          ? Number(existingEnrichment?.landPrice?.officialPricePerM2)
          : Number(existingSsot?.official_land_price_per_sqm) > 0 &&
              Number(existingSsot?.official_land_price_per_sqm) !== 8950000 &&
              Number(existingSsot?.official_land_price_per_sqm) !== 22000000 &&
              Number(existingSsot?.official_land_price_per_sqm) !== 14200000
            ? Number(existingSsot?.official_land_price_per_sqm)
            : 0);

  return {
    effectiveFloorsAbove,
    effectiveFloorsBelow,
    effectiveLandSqm,
    effectiveGfaSqm,
    effectiveZoning,
    effectiveCompletionDate,
    totalFloorsCount,
    perFloorAreaSqm,
    rawBcrPct,
    bcrPct,
    rawFarPct,
    farPct,
    parkingSpaces,
    elevators,
    rawOfficialLandPrice,
    officialLandPriceWonSqm,
  };
}

export function normalizeRentFloorKey(rawStr: string): string {
  const s = String(rawStr || '').trim();
  const uMatch = s.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
  if (uMatch) return `${uMatch[1] ? 'B' : ''}${parseInt(uMatch[2], 10)}F`;
  const bMatch = s.match(/^(?:B|지하)\s*(\d+)/i);
  if (bMatch) return `B${parseInt(bMatch[1], 10)}`;
  const fMatch = s.match(/^(\d+)\s*(?:F|층)?$/i);
  if (fMatch) return `${parseInt(fMatch[1], 10)}F`;
  return s.toUpperCase();
}

export function synthesizeRentRollFloorAreas(params: {
  safeRentRoll: any[];
  existingFloorLeases: any[];
  effectiveFloorsAbove: number;
  totalFloorsCount: number;
  effectiveGfaSqm: number;
  perFloorAreaSqm: number;
}): any[] {
  const {
    safeRentRoll,
    existingFloorLeases,
    effectiveFloorsAbove,
    totalFloorsCount,
    effectiveGfaSqm,
    perFloorAreaSqm,
  } = params;

  const floorUnitCounts = new Map<string, number>();
  safeRentRoll.forEach((r: any, idx: number) => {
    const isAux = /(주차|옥탑|기계식|루프탑|부대)/.test(
      `${r.floor || ''} ${r.unit || ''} ${r.use || ''}`,
    );
    if (isAux) return;
    const fk = normalizeRentFloorKey(String(r.floor || `${idx + 1}F`));
    floorUnitCounts.set(fk, (floorUnitCounts.get(fk) || 0) + 1);
  });

  const activeFloorCount =
    floorUnitCounts.size >= Math.max(2, effectiveFloorsAbove)
      ? floorUnitCounts.size
      : Math.max(totalFloorsCount, floorUnitCounts.size || 1);
  const floorBudgetSqm = effectiveGfaSqm > 0 ? effectiveGfaSqm / activeFloorCount : perFloorAreaSqm;

  return safeRentRoll.map((r: any, idx: number) => {
    const prevFl =
      existingFloorLeases.length === safeRentRoll.length ? existingFloorLeases[idx] || {} : {};
    const rawExplicitM2 = Number(r.area_m2 ?? r.area_sqm ?? r.areaSqm ?? 0);
    const prevM2 = Number(prevFl.area_sqm ?? prevFl.area_m2 ?? prevFl.exclusive_area_sqm ?? 0);
    const explicitM2 =
      rawExplicitM2 > 0 && Math.abs(rawExplicitM2 - 2.45) > 0.05
        ? rawExplicitM2
        : prevM2 > 0 && Math.abs(prevM2 - 2.45) > 0.05
          ? prevM2
          : 0;
    const rawExplicitPy = Number(r.area_pyeong ?? r.areaPyeong ?? 0);
    const explicitPy =
      rawExplicitPy > 0 && Math.abs(rawExplicitPy - 0.8) > 0.05 ? rawExplicitPy : 0;
    const isAuxRow = /(주차|옥탑|기계식|루프탑|부대)/.test(
      `${r.floor || ''} ${r.unit || ''} ${r.use || ''}`,
    );
    const fk = normalizeRentFloorKey(String(r.floor || `${idx + 1}F`));
    const unitsOnFloor = Math.max(1, floorUnitCounts.get(fk) || 1);
    const computedM2 =
      explicitM2 > 0
        ? explicitM2
        : explicitPy > 0
          ? Math.round(pyeongToM2(explicitPy) * 100) / 100
          : isAuxRow
            ? 0
            : Math.round((floorBudgetSqm / unitsOnFloor) * 100) / 100;
    const computedPy =
      explicitM2 > 0
        ? Math.round(m2ToPyeong(computedM2) * 10) / 10
        : explicitPy > 0
          ? explicitPy
          : computedM2 > 0
            ? Math.round(m2ToPyeong(computedM2) * 10) / 10
            : 0;
    const contractGroupVal =
      String(r.contract_group ?? r.contractGroup ?? prevFl.contract_group ?? '').trim() || undefined;
    const isProxyVal = Boolean(r.area_sqm_is_proxy ?? r.areaSqmIsProxy ?? prevFl.area_sqm_is_proxy);
    const legalBasisVal = r.legal_basis ?? r.legalBasis ?? prevFl.legal_basis;
    const firstContractVal =
      String(
        r.first_contract_date ?? r.firstContractDate ?? prevFl.first_contract_date ?? '',
      ).trim() || undefined;
    return {
      ...r,
      area_m2: computedM2,
      area_sqm: computedM2,
      areaSqm: computedM2,
      area_pyeong: computedPy,
      areaPyeong: computedPy,
      ...(isProxyVal ? { area_sqm_is_proxy: true, areaSqmIsProxy: true } : {}),
      ...(contractGroupVal ? { contract_group: contractGroupVal, contractGroup: contractGroupVal } : {}),
      ...(legalBasisVal ? { legal_basis: legalBasisVal, legalBasis: legalBasisVal } : {}),
      ...(firstContractVal
        ? { first_contract_date: firstContractVal, firstContractDate: firstContractVal }
        : {}),
    };
  });
}

export function buildMappedFloorLeasesAndVacancy(params: {
  safeRentRollWithAreas: any[];
  existingFloorLeases: any[];
}): {
  mappedFloorLeases: any[];
  vacancyPct: number;
} {
  const { safeRentRollWithAreas, existingFloorLeases } = params;
  const mappedFloorLeases =
    safeRentRollWithAreas.length > 0
      ? safeRentRollWithAreas.map((r: any, idx: number) => {
          const prevFl =
            existingFloorLeases.length === safeRentRollWithAreas.length
              ? existingFloorLeases[idx] || {}
              : {};
          const isVacant =
            r.status === 'vacant' ||
            r.is_vacant === true ||
            r.lease_state === '공실' ||
            r.use === '공실';
          const isOwner =
            !isVacant &&
            (r.status === 'owner' ||
              r.lease_state === '자가사용' ||
              r.use === '자가사용' ||
              r.use === '자가');
          const depMan = Number(r.depositManwon ?? r.deposit_manwon ?? r.deposit ?? 0);
          const rentMan = Number(
            r.monthlyRentManwon ?? r.rent_manwon ?? r.monthlyRent ?? r.rent ?? 0,
          );
          const mgmtMan = Number(r.maintenanceManwon ?? r.mgmt_fee_manwon ?? r.maintenance ?? 0);
          const areaM2 = Number(r.area_m2 ?? r.area_sqm ?? r.areaSqm ?? 0);
          const areaPy = Number(r.area_pyeong ?? r.areaPyeong ?? 0);
          const exclusiveSqm =
            Number(
              r.exclusiveAreaSqm ??
                r.exclusive_area_sqm ??
                prevFl.exclusive_area_sqm ??
                prevFl.exclusiveAreaSqm ??
                0,
            ) || undefined;
          const rawUse = String(
            r.use ||
              r.tenant_type ||
              r.tenantName ||
              r.tenant_name ||
              (isVacant ? '공실' : isOwner ? '자가사용' : '근린생활시설'),
          ).trim();
          const slashParts = rawUse
            .split(/\s*\/\s*/)
            .map((s) => s.trim())
            .filter(Boolean);
          const splitUse = slashParts.length >= 2 ? slashParts[0] : rawUse;
          const splitTenantName =
            slashParts.length >= 2
              ? slashParts[0] === slashParts[1]
                ? slashParts[0]
                : slashParts.slice(1).join(' / ')
              : undefined;
          const rawFloorStr = String(r.floor || `${idx + 1}F`).trim();
          const rawUnitStr = String(r.unit || r.unit_label || '').trim();
          const unitFloorMatch = rawFloorStr.match(/^(B|지하\s*)?(\d{1,2})(\d{2})\s*호?$/i);
          const normFloor = unitFloorMatch
            ? `${unitFloorMatch[1] ? 'B' : ''}${parseInt(unitFloorMatch[2], 10)}F`
            : rawFloorStr;
          const normUnit = unitFloorMatch
            ? rawFloorStr.endsWith('호')
              ? rawFloorStr
              : `${rawFloorStr}호`
            : rawUnitStr || String(prevFl.unit_label || prevFl.unit || '');
          const explicitTenantName = String(r.tenantName || r.tenant_name || '').trim();
          const resolvedTenantName = isVacant
            ? '공실'
            : isOwner
              ? explicitTenantName || splitTenantName || '자가사용'
              : explicitTenantName || splitTenantName || splitUse;
          const rowNote =
            r.note !== undefined && String(r.note).trim().length > 0
              ? String(r.note).trim()
              : prevFl.note;
          const contractGroupVal =
            String(r.contract_group ?? r.contractGroup ?? prevFl.contract_group ?? '').trim() ||
            undefined;
          const isProxyVal = Boolean(
            r.area_sqm_is_proxy ?? r.areaSqmIsProxy ?? prevFl.area_sqm_is_proxy,
          );
          const legalBasisVal = r.legal_basis ?? r.legalBasis ?? prevFl.legal_basis;
          const firstContractVal =
            String(
              r.first_contract_date ?? r.firstContractDate ?? prevFl.first_contract_date ?? '',
            ).trim() || undefined;
          return {
            floor: normFloor,
            unit_label: normUnit,
            tenant_name: resolvedTenantName,
            tenant_type: isVacant ? '공실' : splitUse,
            use: isVacant ? '공실' : splitUse,
            area_sqm: areaM2,
            area_m2: areaM2,
            area_pyeong: areaPy,
            ...(exclusiveSqm ? { exclusive_area_sqm: exclusiveSqm } : {}),
            ...(isProxyVal ? { area_sqm_is_proxy: true } : {}),
            ...(contractGroupVal ? { contract_group: contractGroupVal } : {}),
            ...(legalBasisVal ? { legal_basis: legalBasisVal } : {}),
            ...(firstContractVal ? { first_contract_date: firstContractVal } : {}),
            deposit_manwon: isVacant ? 0 : depMan,
            deposit_krw: isVacant ? 0 : depMan * 10000,
            rent_manwon: isVacant ? 0 : rentMan,
            rent_krw: isVacant ? 0 : rentMan * 10000,
            mgmt_fee_manwon: isVacant ? 0 : mgmtMan,
            lease_state: isVacant ? '공실' : isOwner ? '자가사용' : '임대중',
            is_vacant: isVacant,
            lease_end: isVacant
              ? '-'
              : String(r.leaseExpiry || r.lease_end || r.expiryDate || prevFl.lease_end || '-'),
            ...(rowNote ? { note: rowNote, remark: rowNote } : {}),
            source: 'broker',
          };
        })
      : [];

  const leasableFloorLeases = mappedFloorLeases.filter(
    (fl) =>
      fl.lease_state !== '자가사용' &&
      !/(주차|옥탑|기계식|루프탑|부대)/.test(`${fl.floor} ${fl.unit_label} ${fl.tenant_name}`),
  );
  const vacantCount = leasableFloorLeases.filter((fl) => fl.is_vacant).length;
  const vacancyPct =
    leasableFloorLeases.length > 0
      ? Math.round((vacantCount / leasableFloorLeases.length) * 1000) / 10
      : 0;

  return { mappedFloorLeases, vacancyPct };
}

export function normalizeExpectedRentRollRows(params: {
  rawExpectedRentRoll: unknown;
  rawExpectedRentRollSnake: unknown;
  safeRentRollWithAreas: any[];
}): any[] {
  const { rawExpectedRentRoll, rawExpectedRentRollSnake, safeRentRollWithAreas } = params;
  const expSrc =
    Array.isArray(rawExpectedRentRoll) && rawExpectedRentRoll.length > 0
      ? rawExpectedRentRoll
      : Array.isArray(rawExpectedRentRollSnake) && rawExpectedRentRollSnake.length > 0
        ? rawExpectedRentRollSnake
        : [];
  if (expSrc.length === 0) return [];

  return expSrc.map((er: any, idx: number) => {
    if (!er || typeof er !== 'object') return er;
    const fl = String(er.floor ?? '').trim();
    const un = String(er.unit ?? er.unit_label ?? '').trim();
    const baseMatch =
      safeRentRollWithAreas.find(
        (br: any) =>
          String(br.floor ?? '').trim() === fl &&
          (!un || String(br.unit ?? br.unit_label ?? '').trim() === un),
      ) ||
      safeRentRollWithAreas.find((br: any) => String(br.floor ?? '').trim() === fl) ||
      (expSrc.length === safeRentRollWithAreas.length ? safeRentRollWithAreas[idx] : undefined);
    const explicitErSqm = Number(er.areaSqm ?? er.area_sqm ?? er.area_m2 ?? 0);
    const areaSqm =
      explicitErSqm > 0
        ? explicitErSqm
        : Number(baseMatch?.areaSqm ?? baseMatch?.area_sqm ?? 0) || undefined;
    const exclSqm =
      Number(er.exclusiveAreaSqm ?? er.exclusive_area_sqm ?? 0) > 0
        ? Number(er.exclusiveAreaSqm ?? er.exclusive_area_sqm)
        : Number(baseMatch?.exclusiveAreaSqm ?? baseMatch?.exclusive_area_sqm ?? 0) || undefined;
    const areaPy =
      explicitErSqm > 0
        ? Math.round(m2ToPyeong(explicitErSqm) * 10) / 10
        : Number(er.areaPyeong ?? er.area_pyeong ?? 0) > 0
          ? Number(er.areaPyeong ?? er.area_pyeong)
          : areaSqm && areaSqm > 0
            ? Math.round(m2ToPyeong(areaSqm) * 10) / 10
            : Number(baseMatch?.areaPyeong ?? baseMatch?.area_pyeong ?? 0) || undefined;
    const depM = Number(er.depositManwon ?? er.deposit_manwon ?? 0) || 0;
    const rentM = Number(er.monthlyRentManwon ?? er.rent_manwon ?? er.monthlyRent ?? 0) || 0;
    const normalizedStatus =
      er.status === 'vacant' && (depM > 0 || rentM > 0) ? 'occupied' : er.status;
    const erContractGroup = String(er.contract_group ?? er.contractGroup ?? '').trim() || undefined;
    const erIsProxy = Boolean(er.area_sqm_is_proxy ?? er.areaSqmIsProxy);
    return {
      ...er,
      ...(normalizedStatus ? { status: normalizedStatus } : {}),
      ...(areaSqm ? { area_m2: areaSqm, area_sqm: areaSqm, areaSqm } : {}),
      ...(exclSqm ? { exclusive_area_sqm: exclSqm, exclusiveAreaSqm: exclSqm } : {}),
      ...(areaPy ? { area_pyeong: areaPy, areaPyeong: areaPy } : {}),
      ...(erIsProxy ? { area_sqm_is_proxy: true, areaSqmIsProxy: true } : {}),
      ...(erContractGroup ? { contract_group: erContractGroup, contractGroup: erContractGroup } : {}),
    };
  });
}
