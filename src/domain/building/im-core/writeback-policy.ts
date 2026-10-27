/**
 * @file src/domain/building/im-core/writeback-policy.ts
 * @description WP-P4a1-08: Split Write-Back Policy
 *
 * Enforces strict separation between physical building facts and transaction deal terms:
 * 1. Physical building facts (address, PNU, land area, GFA, structure, floors, photos)
 *    are automatically synchronized back to master SSOT (`building_ssot_lite`).
 * 2. Deal terms (asking price, deposit, rent roll, investment posture, target yield)
 *    are isolated to the version's input snapshot, and ONLY synchronized to SSOT
 *    when the broker explicitly opts in via `syncDealTermsToSsot: true`.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §5.7.6 (Rule 7), §5.7.4
 * - PROJECT.md (Split write-back policy)
 */

export interface SplitWriteBackOptions {
  syncDealTermsToSsot?: boolean;
}

export interface SplitWriteBackResult {
  /** Physical facts that can safely auto-sync to building_ssot_lite */
  physicalFactsToSync: {
    address?: string;
    road_address?: string;
    pnu?: string;
    land_area_sqm?: number;
    gross_floor_area_sqm?: number;
    building_coverage_ratio?: number;
    floor_area_ratio?: number;
    structure?: string;
    main_usage?: string;
    floors_above?: number;
    floors_below?: number;
    completion_date?: string;
    parking_spaces?: number;
    elevators?: number;
    photos?: any[];
  };

  /** Deal terms to sync to SSOT ONLY IF syncDealTermsToSsot === true; otherwise null */
  dealTermsToSync: {
    asking_price?: number;
    asking_price_manwon?: number;
    deposit_total_krw?: number;
    monthly_rent_total_krw?: number;
    maintenance_fee_monthly_krw?: number;
    rent_roll?: any[];
    investment_posture?: string;
  } | null;

  /** Complete immutable snapshot payload to record in im_input_snapshots */
  snapshotPayload: Record<string, any>;
}

export function partitionWriteBackPayload(
  rawInput: Record<string, any>,
  options: SplitWriteBackOptions = {}
): SplitWriteBackResult {
  const body = rawInput?.body || rawInput;

  // 1. Extract physical facts
  const physicalFactsToSync: SplitWriteBackResult['physicalFactsToSync'] = {};

  if (body.address) physicalFactsToSync.address = body.address;
  if (body.road_address) physicalFactsToSync.road_address = body.road_address;
  if (body.pnu) physicalFactsToSync.pnu = body.pnu;

  const landArea = body.land_area_sqm ?? body.plat_area_sqm ?? body.land?.landAreaSqm;
  if (landArea !== undefined) physicalFactsToSync.land_area_sqm = Number(landArea);

  const gfa = body.total_gross_area_sqm ?? body.gross_floor_area_sqm ?? body.building?.totalGrossAreaSqm;
  if (gfa !== undefined) physicalFactsToSync.gross_floor_area_sqm = Number(gfa);

  const bcr = body.building_coverage_ratio_pct ?? body.building_coverage_ratio ?? body.building?.buildingCoverageRatioPct;
  if (bcr !== undefined) physicalFactsToSync.building_coverage_ratio = Number(bcr);

  const far = body.floor_area_ratio_pct ?? body.floor_area_ratio ?? body.building?.floorAreaRatioPct;
  if (far !== undefined) physicalFactsToSync.floor_area_ratio = Number(far);

  const struct = body.structure ?? body.building?.structure;
  if (struct !== undefined) physicalFactsToSync.structure = String(struct);

  const usage = body.main_usage ?? body.building?.mainUsage;
  if (usage !== undefined) physicalFactsToSync.main_usage = String(usage);

  const flrAbove = body.floors_above ?? body.building?.floorsAbove;
  if (flrAbove !== undefined) physicalFactsToSync.floors_above = Number(flrAbove);

  const flrBelow = body.floors_below ?? body.building?.floorsBelow;
  if (flrBelow !== undefined) physicalFactsToSync.floors_below = Number(flrBelow);

  const compDate = body.completion_date ?? body.building?.completionDate;
  if (compDate !== undefined) physicalFactsToSync.completion_date = String(compDate);

  const prk = body.parking_spaces ?? body.building?.parkingSpaces;
  if (prk !== undefined) physicalFactsToSync.parking_spaces = Number(prk);

  const elev = body.elevators ?? body.building?.elevators;
  if (elev !== undefined) physicalFactsToSync.elevators = Number(elev);

  if (Array.isArray(body.photos)) {
    physicalFactsToSync.photos = body.photos;
  }

  // 2. Deal terms (explicit opt-in check)
  let dealTermsToSync: SplitWriteBackResult['dealTermsToSync'] = null;

  if (options.syncDealTermsToSsot === true) {
    dealTermsToSync = {};
    const askingPrice = body.asking_price_krw ?? body.asking_price ?? body.transaction?.askingPriceKrw;
    if (askingPrice !== undefined) dealTermsToSync.asking_price = Number(askingPrice);

    const askingManwon = body.asking_price_manwon ?? body.transaction?.askingPriceManwon;
    if (askingManwon !== undefined) dealTermsToSync.asking_price_manwon = Number(askingManwon);

    const dep = body.deposit_total_krw ?? body.rent?.depositTotalKrw;
    if (dep !== undefined) dealTermsToSync.deposit_total_krw = Number(dep);

    const mRent = body.monthly_rent_total_krw ?? body.rent?.monthlyRentTotalKrw;
    if (mRent !== undefined) dealTermsToSync.monthly_rent_total_krw = Number(mRent);

    const maint = body.maintenance_fee_monthly_krw ?? body.rent?.maintenanceFeeMonthlyKrw;
    if (maint !== undefined) dealTermsToSync.maintenance_fee_monthly_krw = Number(maint);

    const rr = body.rent_roll ?? body.rent?.units;
    if (Array.isArray(rr)) dealTermsToSync.rent_roll = rr;

    const posture = body.investment_posture ?? body.posture;
    if (posture !== undefined) dealTermsToSync.investment_posture = String(posture);
  }

  // 3. Snapshot payload
  const snapshotPayload = {
    captured_at: new Date().toISOString(),
    syncDealTermsToSsot: options.syncDealTermsToSsot === true,
    physicalFacts: physicalFactsToSync,
    dealTerms: {
      asking_price: body.asking_price_krw ?? body.asking_price,
      asking_price_manwon: body.asking_price_manwon,
      deposit_total_krw: body.deposit_total_krw,
      monthly_rent_total_krw: body.monthly_rent_total_krw,
      rent_roll: body.rent_roll ?? body.rent?.units,
      investment_posture: body.investment_posture ?? body.posture,
    },
    raw: rawInput,
  };

  return {
    physicalFactsToSync,
    dealTermsToSync,
    snapshotPayload,
  };
}
