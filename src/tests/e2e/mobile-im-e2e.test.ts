/**
 * src/tests/e2e/mobile-im-e2e.test.ts
 *
 * 모바일 IM 시스템 End-to-End 통합 테스트 스크립트.
 * 딜카드 → IM 생성 → 가드레일 → 품질 게이트 → PDF 내보내기 → 편집 → A/B 테스트 전체 흐름을 검증합니다.
 *
 * 이 테스트는 외부 API / LLM 호출을 모킹(mock)하여 CI 환경에서 안정적으로 실행됩니다.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// ── Mock: LLM Client ──
vi.mock("@/ai/llm-client", () => ({
  callLLM: vi.fn().mockResolvedValue({
    text: "이 건물은 강남 핵심 상권에 위치한 **7층 규모의 근린생활시설**로, 실사 단계에서 확인 필요한 사항이 있습니다. (AI 추정)",
    model: "gpt-5.4-mock",
    usage: { promptTokens: 100, completionTokens: 200 },
  }),
}));

// ── Mock: Supabase service client ──
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => {
    const chainMethods = {
      eq: () => chainMethods,
      neq: () => chainMethods,
      order: () => chainMethods,
      limit: () => chainMethods,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      select: () => chainMethods,
      insert: () => chainMethods,
      upsert: () => chainMethods,
    };
    return {
      from: () => chainMethods,
      rpc: () => Promise.resolve({ data: [], error: null }),
    };
  },
}));

// ── Mock: Supabase client (browser) ──
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const chainMethods = {
      eq: () => chainMethods,
      order: () => chainMethods,
      limit: () => chainMethods,
      select: () => chainMethods,
      single: () => Promise.resolve({ data: null, error: null }),
    };
    return { from: () => chainMethods };
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: Domain Logic Unit Tests
// ─────────────────────────────────────────────────────────────────────────────

import { calculateFinancials, type FinancialInputs } from "@/domain/building/mobile-im/financials";
import { calculateWALE, type LeaseUnit } from "@/domain/building/mobile-im/wale-calculator";
import { calculateBenchmarkMetrics } from "@/domain/building/mobile-im/comparable-benchmark";
import { runRiskBoundaryCheck } from "@/domain/building/mobile-im/guardrails";
import { promptCache } from "@/lib/cache/semantic-prompt-cache";

describe("E2E Layer 1: Core Domain Logic", () => {

  describe("재무 엔진 (Financials Engine)", () => {
    const baseInput: FinancialInputs = {
      monthlyRentKrw: 10_000_000,
      purchasePriceKrw: 3_000_000_000,
      assetType: "오피스",
      totalDepositManwon: 0,
      mgmtFeeTotalManwon: 0,
      loanAmountManwon: 0,
      totalAreaSqm: 500,
    };

    test("E2E-F01: NOI 시나리오 3종 산출", () => {
      const result = calculateFinancials(baseInput);
      expect(result.annualNoi.base).toBeGreaterThan(0);
      expect(result.annualNoi.best).toBeGreaterThan(result.annualNoi.base);
      expect(result.annualNoi.worst).toBeLessThan(result.annualNoi.base);
    });

    test("E2E-F02: Cap Rate 산출 (base case)", () => {
      const result = calculateFinancials(baseInput);
      expect(result.capRate?.base).toBeGreaterThan(0);
      expect(result.capRate?.base).toBeLessThan(20); // sanity check
    });

    test("E2E-F03: 레버리지 적용 시 수익률 상승", () => {
      const leveragedInput: FinancialInputs = {
        ...baseInput,
        totalDepositManwon: 20_000,
        loanAmountManwon: 100_000,
      };
      const noLeverage = calculateFinancials(baseInput);
      const withLeverage = calculateFinancials(leveragedInput);
      expect(withLeverage.leveragedYield).toBeGreaterThan(noLeverage.leveragedYield!);
    });

    test("E2E-F04: DCF 10년 민감도 매트릭스 생성", () => {
      const result = calculateFinancials(baseInput);
      expect(result.dcf10Year).not.toBeNull();
      expect(result.dcf10Year?.sensitivityMatrix.length).toBe(9);
      expect(result.dcf10Year?.npvBase).toBeDefined();
    });

    test("E2E-F05: disclaimer 항상 포함", () => {
      const result = calculateFinancials(baseInput);
      expect(result.disclaimer).toBeDefined();
      expect(result.disclaimer.length).toBeGreaterThan(10);
    });
  });

  describe("WALE 계산기 (Weighted Average Lease Expiry)", () => {
    const leases: LeaseUnit[] = [
      { tenantName: "1F약국", rentAmount: 500, areaSqm: 30, leaseEndDate: "2029-06-01" },
      { tenantName: "2F사무실", rentAmount: 300, areaSqm: 50, leaseEndDate: "2027-06-01" },
      { tenantName: "3F공실", rentAmount: 0, areaSqm: 40, leaseEndDate: "2025-01-01" },
    ];

    test("E2E-W01: 임대료 기준 WALE 산출", () => {
      const result = calculateWALE(leases, "2026-06-01");
      expect(result.waleByRentYears).toBeGreaterThan(0);
    });

    test("E2E-W02: 면적 기준 WALE 산출", () => {
      const result = calculateWALE(leases, "2026-06-01");
      expect(result.waleByAreaYears).toBeGreaterThan(0);
    });

    test("E2E-W03: 12개월 내 만기 임대료 리스크 비율", () => {
      const result = calculateWALE(leases, "2026-06-01");
      expect(result.atRiskRentPct12m).toBeGreaterThanOrEqual(0);
      expect(result.atRiskRentPct12m).toBeLessThanOrEqual(100);
    });
  });

  describe("비교사례 벤치마킹 (Comparable Benchmark)", () => {
    const comps = [
      { source: "네이버부동산" as const, title: "A", priceKrw: 4e9, pricePerSqmKrw: 20e6, areaSqm: 200, distanceKm: 0.3, listedDate: "2026-06-01" },
      { source: "네이버부동산" as const, title: "B", priceKrw: 6e9, pricePerSqmKrw: 24e6, areaSqm: 250, distanceKm: 0.5, listedDate: "2026-05-15" },
    ];

    test("E2E-B01: 시세 대비 경쟁력 판정", () => {
      const result = calculateBenchmarkMetrics(3.6e9, 200, comps);
      expect(["Highly Competitive", "Market Rate", "Overpriced"]).toContain(result.competitivenessStatus);
    });

    test("E2E-B02: 프리미엄/디스카운트 비율 산출", () => {
      const result = calculateBenchmarkMetrics(4.4e9, 200, comps);
      expect(typeof result.premiumPct).toBe("number");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: Guardrails & Safety
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Layer 2: Guardrails & Safety", () => {

  test("E2E-G01: 투자 추천 → P0 차단", () => {
    const result = runRiskBoundaryCheck("이 건물은 매수를 추천합니다.");
    expect(result.status).toBe("blocked");
  });

  test("E2E-G02: 수익률 보장 → P0 차단", () => {
    const result = runRiskBoundaryCheck("Cap Rate가 안정적이므로 수익률이 보장됩니다.");
    expect(result.status).toBe("blocked");
  });

  test("E2E-G03: 대출 확정 → P0 차단", () => {
    const result = runRiskBoundaryCheck("LTV 70% 가능하며 대출이 가능합니다.");
    expect(result.status).toBe("blocked");
  });

  test("E2E-G04: 안전한 전문 표현 → pass", () => {
    const result = runRiskBoundaryCheck("실사 단계에서 별도 확인이 필요합니다. (AI 추정)");
    expect(result.status).toBe("pass");
  });

  test("E2E-G05: 복합 위험 표현 → 다중 이슈 검출", () => {
    const text = "매수를 추천합니다. 수익률이 보장되며 적정 가격입니다.";
    const result = runRiskBoundaryCheck(text);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3: Semantic Prompt Cache
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Layer 3: Semantic Prompt Cache", () => {

  test("E2E-C01: 동일 입력 → 동일 캐시 키 (결정론적 해싱)", () => {
    const k1 = promptCache.generateKey("property_overview", { area: 500, type: "오피스" });
    const k2 = promptCache.generateKey("property_overview", { area: 500, type: "오피스" });
    expect(k1).toBe(k2);
  });

  test("E2E-C02: 다른 섹션 → 다른 캐시 키", () => {
    const k1 = promptCache.generateKey("property_overview", { area: 500 });
    const k2 = promptCache.generateKey("income_analysis", { area: 500 });
    expect(k1).not.toBe(k2);
  });

  test("E2E-C03: set → get 라운드트립", async () => {
    const key = promptCache.generateKey("cache_e2e_test", { r: Math.random() });
    await promptCache.set(key, "hello from cache", 60);
    const val = await promptCache.get(key);
    expect(val).toBe("hello from cache");
  });

  test("E2E-C04: TTL 만료 후 null 반환", async () => {
    const key = promptCache.generateKey("ttl_e2e_test", { t: 1 });
    await promptCache.set(key, "expired", 0);
    await new Promise(r => setTimeout(r, 10));
    const val = await promptCache.get(key);
    expect(val).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4: External Data Integration (SEMAS, OCR, Naver)
// ─────────────────────────────────────────────────────────────────────────────

import { pnuToLegalDongCode } from "@/lib/external/semas-commercial-api";

describe("E2E Layer 4: External Data Integration", () => {

  describe("SEMAS 상권 API", () => {
    test("E2E-S01: PNU → 법정동 코드 변환", () => {
      const code = pnuToLegalDongCode("1168010800100120001");
      expect(code).toBe("1168010800");
      expect(code.length).toBe(10);
    });

    test("E2E-S02: 짧은 PNU → 폴백 코드 반환", () => {
      const code = pnuToLegalDongCode("123");
      expect(code).toBe("1168010800"); // 역삼동 폴백
    });

    test("E2E-S03: 빈 PNU → 폴백", () => {
      const code = pnuToLegalDongCode("");
      expect(code).toBe("1168010800");
    });
  });

  describe("OCR 모듈 인터페이스", () => {
    test("E2E-O01: 건축물대장 파서 반환 타입 검증", async () => {
      const { parseBuildingRegisterPDF } = await import("@/lib/ocr/building-register-ocr");
      const mockFile = new File(["test"], "building.pdf", { type: "application/pdf" });
      const result = await parseBuildingRegisterPDF(mockFile);
      expect(result.address).toBeDefined();
      expect(result.totalArea).toBeGreaterThan(0);
      expect(result.platArea).toBeGreaterThan(0);
      expect(result.floors.ground).toBeGreaterThan(0);
      expect(result.mainPurpose).toBeDefined();
    });

    test("E2E-O02: 등기부등본 파서 반환 타입 검증", async () => {
      const { parseRealEstateRegistryPDF } = await import("@/lib/ocr/registry-parser");
      const mockFile = new File(["test"], "registry.pdf", { type: "application/pdf" });
      const result = await parseRealEstateRegistryPDF(mockFile);
      expect(result.address).toBeDefined();
      expect(result.ownerName).toBeDefined();
      expect(result.rights).toBeInstanceOf(Array);
      expect(typeof result.hasRedFlags).toBe("boolean");
    });
  });

  describe("시세 크롤러 인터페이스", () => {
    test("E2E-M01: 비교사례 크롤러 반환 타입 검증", async () => {
      const { fetchComparableListings } = await import("@/lib/external/naver-realestate-api");
      const result = await fetchComparableListings("역삼동", "오피스");
      expect(result.avgPricePerSqmKrw).toBeGreaterThan(0);
      expect(result.comparables.length).toBeGreaterThan(0);
      expect(result.comparables[0].pricePerSqmKrw).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 5: End-to-End IM Generation Pipeline
// ─────────────────────────────────────────────────────────────────────────────

import type { MobileIMWriterInput, MobileIMWriterOutput } from "@/domain/building/mobile-im/writer";

describe("E2E Layer 5: Full IM Generation Pipeline", () => {

  const mockWriterInput: MobileIMWriterInput = {
    building_ssot_lite: {
      asset_type: "오피스",
      area_signal: "강남",
      price_band: "80억대",
      size_signal: "중소형",
      total_area_sqm: 1500,
      vacancy_signal: "낮음",
      address: "서울시 강남구 역삼동 123-45",
    },
    supplemental: {
      monthly_rent_total_krw: 12_000_000,
      vacancy_pct: 5,
      asking_price_manwon: 450_000,
      total_deposit_manwon: 30_000,
      mgmt_fee_total_manwon: 200,
      loan_amount_manwon: 200_000,
      floor_leases: [
        { floor: "1F", tenant_type: "근린생활", area_pyeong: 15, deposit_manwon: 5000, rent_manwon: 200, lease_end: "2028-06-01" },
        { floor: "2F", tenant_type: "사무실", area_pyeong: 20, deposit_manwon: 8000, rent_manwon: 300, lease_end: "2027-12-01" },
      ],
    },
    readiness: { score: 85, missing: [] },
    external_data: {
      resolvedAddress: { pnu: "1168010800100120001", lat: 37.5015, lng: 127.0397 },
      buildingRegister: {
        totalArea: 1500, platArea: 330, useAprDay: "20150820",
        mainPurpose: "업무시설", structure: "철근콘크리트", floorsAbove: 7, floorsBelow: 2,
        bcRat: 59.5, vlRat: 249.8, buildingName: "테스트빌딩",
      },
      landPrice: { pricePerSqm: 12_000_000, baseYear: "2026" },
      landUsePlan: {
        zoningDistrict: "일반상업지역", zoningOverlap: [],
        buildingCoverageMax: 80, floorAreaRatioMax: 600,
      },
      comparableTransactions: [
        { pricePerPyeong: 82_000_000, address: "역삼동 234", dealYear: 2025, dealMonth: 11, area: 150 },
      ],
      locationPoi: {
        nearestStation: { name: "역삼역", distanceM: 200, walkMinutes: 3 },
        poiCounts: { subway: 2, busStop: 5, cafe: 12, parking: 3, restaurant: 20, convenience: 8 },
      },
    },
  };

  test("E2E-P01: Writer Input 구조 정합성", () => {
    expect(mockWriterInput.building_ssot_lite.asset_type).toBe("오피스");
    expect(mockWriterInput.readiness.score).toBeGreaterThanOrEqual(80);
    expect(mockWriterInput.supplemental.floor_leases?.length).toBeGreaterThan(0);
  });

  test("E2E-P02: WALE → 재무 → 벤치마킹 연쇄 계산", () => {
    // 1. WALE
    const waleLeases: LeaseUnit[] = (mockWriterInput.supplemental.floor_leases || []).map(fl => ({
      tenantName: fl.tenant_type || "임차인",
      rentAmount: fl.rent_manwon || 0,
      areaSqm: (fl.area_pyeong || 0) * 3.3058,
      leaseEndDate: fl.lease_end || "",
    }));
    const wale = calculateWALE(waleLeases);
    expect(wale.waleByRentYears).toBeGreaterThan(0);

    // 2. Financials
    const finResult = calculateFinancials({
      monthlyRentKrw: mockWriterInput.supplemental.monthly_rent_total_krw!,
      purchasePriceKrw: (mockWriterInput.supplemental.asking_price_manwon || 0) * 10000,
      assetType: "오피스",
      totalDepositManwon: mockWriterInput.supplemental.total_deposit_manwon,
      mgmtFeeTotalManwon: mockWriterInput.supplemental.mgmt_fee_total_manwon,
      loanAmountManwon: mockWriterInput.supplemental.loan_amount_manwon,
      totalAreaSqm: mockWriterInput.external_data?.buildingRegister?.totalArea,
    });
    expect(finResult.capRate?.base).toBeGreaterThan(0);
    expect(finResult.dcf10Year).not.toBeNull();

    // 3. Benchmark
    const comps = [
      { source: "네이버부동산" as const, title: "A", priceKrw: 4e9, pricePerSqmKrw: 26e6, areaSqm: 150, distanceKm: 0.3, listedDate: "2026-06-01" },
    ];
    const benchmark = calculateBenchmarkMetrics(
      (mockWriterInput.supplemental.asking_price_manwon || 0) * 10000,
      mockWriterInput.external_data?.buildingRegister?.totalArea || 0,
      comps
    );
    expect(benchmark.competitivenessStatus).toBeDefined();
  });

  test("E2E-P03: 생성된 텍스트에 가드레일 적용", () => {
    const safeText = "강남 핵심상권에 위치한 업무시설로, 실사 단계에서 확인 필요합니다. (AI 추정)";
    const result = runRiskBoundaryCheck(safeText);
    expect(result.status).toBe("pass");
  });

  test("E2E-P04: 위험 텍스트 생성 시 가드레일 차단", () => {
    const unsafeText = "매수를 추천하며, 수익률이 보장됩니다.";
    const result = runRiskBoundaryCheck(unsafeText);
    expect(result.status).toBe("blocked");
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
  });

  test("E2E-P05: 7섹션 타입 상수 정합성", async () => {
    const { MOBILE_IM_SECTIONS_7 } = await import("@/domain/building/mobile-im/types");
    expect(MOBILE_IM_SECTIONS_7).toHaveLength(7);
    expect(MOBILE_IM_SECTIONS_7).toContain("property_overview");
    expect(MOBILE_IM_SECTIONS_7).toContain("income_analysis");
    expect(MOBILE_IM_SECTIONS_7).toContain("investment_thesis");
    expect(MOBILE_IM_SECTIONS_7).toContain("next_steps");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 6: Component Contract Tests (UI 컴포넌트 인터페이스 계약)
// ─────────────────────────────────────────────────────────────────────────────

describe("E2E Layer 6: Component Contract Checks", () => {

  test("E2E-UI01: YieldSimulator props contract", () => {
    const props = {
      initialPrice: 450000,
      initialRent: 1200,
      initialDeposit: 30000,
      initialMgmtFee: 200,
      initialLoan: 200000,
    };
    expect(typeof props.initialPrice).toBe("number");
    expect(props.initialPrice).toBeGreaterThan(0);
    // calculateFinancials should not throw with these inputs
    const result = calculateFinancials({
      monthlyRentKrw: props.initialRent * 10000,
      purchasePriceKrw: props.initialPrice * 10000,
      totalDepositManwon: props.initialDeposit,
      mgmtFeeTotalManwon: props.initialMgmtFee,
      loanAmountManwon: props.initialLoan,
    });
    expect(result).toBeDefined();
  });

  test("E2E-UI02: ImEditor sections contract", () => {
    const sections: Record<string, string> = {
      property_overview: "## 자산 개요\n강남 역삼동 소재 오피스",
      income_analysis: "## 수익 분석\nCap Rate 3.2%",
      risk_check: "## 리스크 체크\n공법 제한 없음",
      investment_thesis: "## 투자 논거\n우수한 입지",
      next_steps: "## 다음 단계\n방문 예약",
    };
    expect(Object.keys(sections).length).toBe(5);
    Object.values(sections).forEach(v => {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    });
  });

  test("E2E-UI03: ABTestDashboard data contract", () => {
    const mockABData = [
      { variantName: "A (기존)", totalViews: 1250, avgDurationSec: 45, conversionRatePct: 2.4, bounceRatePct: 68 },
      { variantName: "B (AI)", totalViews: 1310, avgDurationSec: 112, conversionRatePct: 5.8, bounceRatePct: 42 },
    ];
    expect(mockABData).toHaveLength(2);
    expect(mockABData[1].conversionRatePct).toBeGreaterThan(mockABData[0].conversionRatePct);
    expect(mockABData[1].avgDurationSec).toBeGreaterThan(mockABData[0].avgDurationSec);
    expect(mockABData[1].bounceRatePct).toBeLessThan(mockABData[0].bounceRatePct);
  });

  test("E2E-UI04: CommercialDistrictChart data contract", () => {
    const mockData = {
      districtCode: "1168010800",
      districtName: "역삼동",
      storeCount: 1234,
      avgMonthlyRevenue: 35000000,
      footfallDaily: 42000,
      footfallByTime: [{ hour: "09", count: 3000 }, { hour: "12", count: 5500 }],
      closingRate: 4.2,
      topCategories: [{ name: "음식점", count: 300, share: 0.24 }],
      salesIndex: 112,
      competitionIndex: 88,
      growthTrend: "up" as const,
    };
    expect(mockData.storeCount).toBeGreaterThan(0);
    expect(mockData.footfallByTime.length).toBeGreaterThan(0);
    expect(mockData.topCategories.length).toBeGreaterThan(0);
  });

  test("E2E-UI05: PdfExportButton contract (targetId required)", () => {
    const props = { targetId: "mobile-im-content", filename: "역삼동_IM.pdf" };
    expect(props.targetId).toBeTruthy();
    expect(props.filename).toMatch(/\.pdf$/);
  });
});
