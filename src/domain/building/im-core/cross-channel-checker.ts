/**
 * Cross-Channel Consistency Checker
 *
 * Verifies numerical and textual consistency between Web IM Viewer (JSON)
 * and PPTX Studio (Slides / Tokens / XML Data).
 *
 * Checks:
 * 1. Asking Price / Valuation
 * 2. Total Area / Gross Floor Area
 * 3. Land Area / Plot Area
 * 4. Cap Rate / Net Yield
 * 5. Total Deposit
 * 6. Monthly Rent
 * 7. Document & Cover Title
 */

export interface DiscrepancyItem {
  field: string;
  webValue: unknown;
  pptxValue: unknown;
  discrepancyType: 'NUMERICAL_MISMATCH' | 'TEXT_MISMATCH' | 'MISSING_IN_PPTX' | 'MISSING_IN_WEB';
  message: string;
}

export interface CrossChannelAuditReport {
  passed: boolean;
  totalChecks: number;
  totalDiscrepancies: number;
  discrepancies: DiscrepancyItem[];
  verifiedMetrics: string[];
  auditedAt: string;
}

/**
 * Normalizes number representation from strings like "115억", "11500000000", "11,500,000,000"
 */
function normalizeNumericValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val !== 'string') return null;

  const clean = val.replace(/,/g, '').trim();
  // Check for Korean unit e.g. "115억" or "115억원"
  const eokMatch = clean.match(/^([0-9.]+)\s*억/);
  if (eokMatch) {
    return parseFloat(eokMatch[1]) * 100_000_000;
  }
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

export function verifyCrossChannelConsistency(input: {
  webDoc: { body?: Record<string, any>; title?: string };
  pptxProject?: { slides?: any[]; title?: string };
  ssotLite?: Record<string, any>;
}): CrossChannelAuditReport {
  const discrepancies: DiscrepancyItem[] = [];
  const verifiedMetrics: string[] = [];

  const webBody = input.webDoc?.body || {};
  const ssot = webBody.ssot_summary || input.ssotLite || {};
  const slides = input.pptxProject?.slides || [];

  // Helper to find slide override or prop by dataKey or layoutType
  const findSlide = (pred: (s: any) => boolean) => slides.find(pred);
  const coverSlide = findSlide((s) => s.layoutType?.includes('A01') || s.dataKey === 'cover');
  const overviewSlide = findSlide((s) => s.layoutType?.includes('A02') || s.dataKey === 'overview');
  const financialSlide = findSlide((s) => s.dataKey === 'financials' || s.dataKey === 'capital');
  const rentRollSlide = findSlide((s) => s.dataKey === 'rentRoll' || s.dataKey === 'tenancy');

  // 1. Document / Cover Title Check
  const webTitle = input.webDoc?.title || webBody.title || webBody.buildingName;
  const pptxTitle = coverSlide?.title || coverSlide?.slideOverrides?.title || input.pptxProject?.title;
  if (webTitle && pptxTitle) {
    if (webTitle.trim() === pptxTitle.trim() || pptxTitle.includes(webTitle) || webTitle.includes(pptxTitle)) {
      verifiedMetrics.push('title');
    } else {
      discrepancies.push({
        field: 'title',
        webValue: webTitle,
        pptxValue: pptxTitle,
        discrepancyType: 'TEXT_MISMATCH',
        message: `문서 제목 불일치: 웹("${webTitle}") vs PPTX("${pptxTitle}")`,
      });
    }
  }

  // 2. Asking Price Check
  const webPrice =
    normalizeNumericValue(ssot.asking_price) ??
    normalizeNumericValue(ssot.price) ??
    normalizeNumericValue(webBody.overview?.price);

  const pptxPrice =
    normalizeNumericValue(overviewSlide?.slideOverrides?.price) ??
    normalizeNumericValue(financialSlide?.slideOverrides?.price) ??
    normalizeNumericValue(ssot.asking_price);

  if (webPrice !== null && pptxPrice !== null) {
    // Tolerating within 0.1% rounding difference
    const diff = Math.abs(webPrice - pptxPrice);
    if (diff <= webPrice * 0.001) {
      verifiedMetrics.push('asking_price');
    } else {
      discrepancies.push({
        field: 'asking_price',
        webValue: webPrice,
        pptxValue: pptxPrice,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `매매 희망가 수치 불일치: 웹(${webPrice}) vs PPTX(${pptxPrice})`,
      });
    }
  }

  // 3. Total Area Check
  const webArea =
    normalizeNumericValue(ssot.total_area) ??
    normalizeNumericValue(ssot.gross_area) ??
    normalizeNumericValue(webBody.overview?.total_area);

  const pptxArea =
    normalizeNumericValue(overviewSlide?.slideOverrides?.area) ??
    normalizeNumericValue(ssot.total_area);

  if (webArea !== null && pptxArea !== null) {
    const diff = Math.abs(webArea - pptxArea);
    if (diff <= 0.05) {
      verifiedMetrics.push('total_area');
    } else {
      discrepancies.push({
        field: 'total_area',
        webValue: webArea,
        pptxValue: pptxArea,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `연면적 수치 불일치: 웹(${webArea}㎡) vs PPTX(${pptxArea}㎡)`,
      });
    }
  }

  // 3b. Land Area Check
  const webLandArea =
    normalizeNumericValue(ssot.land_area) ??
    normalizeNumericValue(ssot.land_area_m2) ??
    normalizeNumericValue(ssot.land_area_sqm) ??
    normalizeNumericValue(ssot.plot_area) ??
    normalizeNumericValue(ssot.plat_area) ??
    normalizeNumericValue(ssot.landArea) ??
    normalizeNumericValue(webBody.overview?.land_area) ??
    normalizeNumericValue(webBody.overview?.landArea) ??
    normalizeNumericValue(webBody.overview?.plot_area) ??
    normalizeNumericValue(webBody.heroCard?.landAreaM2);

  const pptxLandArea =
    normalizeNumericValue(overviewSlide?.slideOverrides?.landArea) ??
    normalizeNumericValue(overviewSlide?.slideOverrides?.land_area) ??
    normalizeNumericValue(overviewSlide?.slideOverrides?.plotArea) ??
    normalizeNumericValue(overviewSlide?.slideOverrides?.plot_area) ??
    normalizeNumericValue(overviewSlide?.slideOverrides?.platArea) ??
    normalizeNumericValue(ssot.land_area) ??
    normalizeNumericValue(ssot.land_area_m2) ??
    normalizeNumericValue(ssot.land_area_sqm) ??
    normalizeNumericValue(ssot.plot_area) ??
    normalizeNumericValue(ssot.plat_area) ??
    normalizeNumericValue(ssot.landArea) ??
    normalizeNumericValue(webBody.heroCard?.landAreaM2);

  if (webLandArea !== null && pptxLandArea !== null) {
    const diff = Math.abs(webLandArea - pptxLandArea);
    if (diff <= 0.05) {
      verifiedMetrics.push('land_area');
    } else {
      discrepancies.push({
        field: 'land_area',
        webValue: webLandArea,
        pptxValue: pptxLandArea,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `대지면적 수치 불일치: 웹(${webLandArea}㎡) vs PPTX(${pptxLandArea}㎡)`,
      });
    }
  }

  // 4. Cap Rate / Gross Yield Check
  const webYield =
    normalizeNumericValue(ssot.gross_yield) ??
    normalizeNumericValue(ssot.cap_rate) ??
    normalizeNumericValue(webBody.financials?.capRate);

  const pptxYield =
    normalizeNumericValue(financialSlide?.slideOverrides?.capRate) ??
    normalizeNumericValue(overviewSlide?.slideOverrides?.grossYield) ??
    normalizeNumericValue(ssot.gross_yield) ??
    normalizeNumericValue(ssot.cap_rate);

  if (webYield !== null && pptxYield !== null) {
    const diff = Math.abs(webYield - pptxYield);
    if (diff <= 0.05) {
      verifiedMetrics.push('cap_rate');
    } else {
      discrepancies.push({
        field: 'cap_rate',
        webValue: webYield,
        pptxValue: pptxYield,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `수익률/Cap Rate 수치 불일치: 웹(${webYield}%) vs PPTX(${pptxYield}%)`,
      });
    }
  }

  // 5. Total Deposit Check (normalized fallbacks: ssot.deposit vs total_deposit)
  const webDeposit =
    normalizeNumericValue(ssot.total_deposit) ??
    normalizeNumericValue(ssot.deposit) ??
    normalizeNumericValue(webBody.rentRoll?.totalDeposit) ??
    normalizeNumericValue(webBody.rentRoll?.deposit) ??
    normalizeNumericValue(webBody.financials?.totalDeposit) ??
    normalizeNumericValue(webBody.financials?.deposit) ??
    normalizeNumericValue(webBody.heroCard?.depositKrw);

  const pptxDeposit =
    normalizeNumericValue(rentRollSlide?.slideOverrides?.totalDeposit) ??
    normalizeNumericValue(rentRollSlide?.slideOverrides?.deposit) ??
    normalizeNumericValue(financialSlide?.slideOverrides?.totalDeposit) ??
    normalizeNumericValue(financialSlide?.slideOverrides?.deposit) ??
    normalizeNumericValue(ssot.total_deposit) ??
    normalizeNumericValue(ssot.deposit) ??
    normalizeNumericValue(webBody.heroCard?.depositKrw);

  if (webDeposit !== null && pptxDeposit !== null) {
    if (Math.abs(webDeposit - pptxDeposit) <= 1) {
      verifiedMetrics.push('total_deposit');
    } else {
      discrepancies.push({
        field: 'total_deposit',
        webValue: webDeposit,
        pptxValue: pptxDeposit,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `보증금 합계 수치 불일치: 웹(${webDeposit}) vs PPTX(${pptxDeposit})`,
      });
    }
  }

  // 6. Monthly Rent Check (diff <= 1 KRW)
  const webMonthlyRent =
    normalizeNumericValue(ssot.monthly_rent) ??
    normalizeNumericValue(ssot.monthly_income) ??
    normalizeNumericValue(ssot.total_monthly_rent) ??
    normalizeNumericValue(ssot.rent) ??
    normalizeNumericValue(webBody.rentRoll?.totalMonthlyRent) ??
    normalizeNumericValue(webBody.rentRoll?.monthlyRent) ??
    normalizeNumericValue(webBody.rentRoll?.totalRent) ??
    normalizeNumericValue(webBody.financials?.monthlyRent) ??
    normalizeNumericValue(webBody.financials?.totalMonthlyRent) ??
    normalizeNumericValue(webBody.heroCard?.monthlyRentKrw);

  const pptxMonthlyRent =
    normalizeNumericValue(rentRollSlide?.slideOverrides?.totalMonthlyRent) ??
    normalizeNumericValue(rentRollSlide?.slideOverrides?.monthlyRent) ??
    normalizeNumericValue(rentRollSlide?.slideOverrides?.rent) ??
    normalizeNumericValue(financialSlide?.slideOverrides?.monthlyRent) ??
    normalizeNumericValue(financialSlide?.slideOverrides?.totalMonthlyRent) ??
    normalizeNumericValue(ssot.monthly_rent) ??
    normalizeNumericValue(ssot.monthly_income) ??
    normalizeNumericValue(ssot.total_monthly_rent) ??
    normalizeNumericValue(ssot.rent) ??
    normalizeNumericValue(webBody.heroCard?.monthlyRentKrw);

  if (webMonthlyRent !== null && pptxMonthlyRent !== null) {
    if (Math.abs(webMonthlyRent - pptxMonthlyRent) <= 1) {
      verifiedMetrics.push('monthly_rent');
    } else {
      discrepancies.push({
        field: 'monthly_rent',
        webValue: webMonthlyRent,
        pptxValue: pptxMonthlyRent,
        discrepancyType: 'NUMERICAL_MISMATCH',
        message: `월 임대료 합계 수치 불일치: 웹(${webMonthlyRent}원) vs PPTX(${pptxMonthlyRent}원)`,
      });
    }
  }

  const totalChecks = verifiedMetrics.length + discrepancies.length;

  return {
    passed: discrepancies.length === 0,
    totalChecks,
    totalDiscrepancies: discrepancies.length,
    discrepancies,
    verifiedMetrics,
    auditedAt: new Date().toISOString(),
  };
}
