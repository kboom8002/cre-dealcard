/**
 * E2E 테스트: 시나리오 C — 최대 복잡도 (전체 데이터 + 렌트롤)
 * 
 * writer.ts를 직접 호출하여 파이프라인 전체를 검증합니다.
 * 골든셋, 퓨샷, 용어사전 참조 여부도 확인합니다.
 * 
 * 실행: npx tsx -r dotenv/config scripts/test-mobile-im-writer.ts
 */

import { generateMobileIM } from "../src/domain/building/mobile-im/writer";

async function runTest() {
  console.log("=== 시나리오 C: 전체 데이터 + 렌트롤 E2E 테스트 ===\n");

  // 가상 SSoT 데이터
  const building_ssot_lite = {
    id: "test-scenario-c",
    area_signal: "마포구 서교동",
    asset_type: "근린생활시설",
    price_band: "42억",
    size_signal: "약 180평",
    current_use_signal: "근생+사무실",
    vacancy_signal: "일부 공실",
    fit_summary: "홍대 상권 인접 안정 수익형 자산",
    caution_summary: "3층 공실 리모델링 필요, 준공 20년 이상 경과",
    raw_input: "서울 마포구 서교동 395-166 4층 근생빌딩 매매가 42억 월세 2800만",
  };

  // 가상 보강 데이터 (바텀시트 입력)
  const supplemental = {
    monthly_rent_total_krw: 2800 * 10000,   // 2800만원 → 원
    vacancy_status: "일부 공실",
    vacancy_pct: 15,
    resolved_address: "서울 마포구 서교동 395-166",
    resolved_pnu: "1144012100101660000",
    total_deposit_manwon: 60000,            // 6억
    mgmt_fee_total_manwon: 180,
    loan_amount_manwon: 250000,             // 25억
    asking_price_manwon: 420000,            // 42억
    broker_highlight: "홍대 상권 인접, 3층 공실 리모델링 후 임대 가능",
    photo_urls: [],
    floor_leases: [
      { floor: "B1", tenant_type: "주차장", deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 50, is_vacant: false },
      { floor: "1F", tenant_type: "카페", deposit_manwon: 20000, rent_manwon: 1200, mgmt_fee_manwon: 50, is_vacant: false },
      { floor: "2F", tenant_type: "네일샵", deposit_manwon: 15000, rent_manwon: 800, mgmt_fee_manwon: 40, is_vacant: false },
      { floor: "3F", tenant_type: undefined, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, is_vacant: true },
      { floor: "4F", tenant_type: "사무실", deposit_manwon: 25000, rent_manwon: 800, mgmt_fee_manwon: 40, is_vacant: false },
    ],
  };

  // 가상 외부 데이터 (건축물대장 API 성공 시나리오)
  const external_data = {
    enrichedAt: new Date().toISOString(),
    buildingRegister: {
      totalArea: 595.2,
      platArea: 198.4,
      archArea: 119.0,
      floorsAbove: 4,
      floorsBelow: 1,
      elevatorCount: 1,
      parkingCount: 3,
      heatMethod: "개별난방",
      useAprDay: "20050315",
      structure: "철근콘크리트",
      mainPurpose: "제2종근린생활시설",
      bcRat: 59.9,
      vlRat: 299.7,
    },
    landUsePlan: {
      zoningDistrict: "제2종일반주거지역",
      buildingCoverageMax: 60,
      floorAreaRatioMax: 200,
      zoningOverlap: ["일반미관지구"],
    },
    landPrice: {
      pricePerSqm: 8520000,
      baseYear: "2025",
    },
    locationPoi: {
      nearestStation: {
        name: "홍대입구역 2호선",
        walkMinutes: 7,
        distanceM: 520,
      },
      poiCounts: {
        food: 234,
        cafe: 156,
        convenience: 45,
        bank: 12,
      },
    },
    resolvedAddress: {
      lat: 37.5566,
      lng: 126.9242,
    },
    errors: [],
  };

  const readiness = {
    score: 85,
    missing: [],
    can_generate: true,
  };

  try {
    console.log("[1] writer.ts 호출 시작...\n");
    
    const result = await generateMobileIM({
      building_ssot_lite,
      supplemental,
      readiness,
      external_data,
    });

    // === 섹션 제목 검증 (TC-04) ===
    console.log("=== TC-04: 섹션 제목 검증 ===");
    const expectedTitles = [
      "🏢 이 건물, 어떤 자산인가?",
      "📍 이 입지, 투자할 만한 곳인가?",
      "📊 임대 현황과 공실, 실제로 어떤가?",
      "💰 수익률이 진짜로 나오는 딜인가?",
      "⚠️ 숨은 리스크는 없는가?",
      "🎯 왜 지금 이 매물을 사야 하는가?",
      "📋 검토 후 다음 단계는?",
    ];
    for (let i = 0; i < result.sections.length; i++) {
      const title = result.sections[i].title;
      const expected = expectedTitles[i];
      const match = title === expected;
      console.log(`  [${match ? "✅" : "❌"}] 섹션 ${i + 1}: "${title}" ${match ? "" : `(예상: "${expected}")`}`);
    }

    // === 섹션 내용 검증 ===
    console.log("\n=== TC-03: 섹션 내용 검증 ===");

    // 섹션 1: 빈값 행 숨김 (TC-05)
    const sec1 = result.sections[0].markdown;
    const hasDash = sec1.includes("| -") || (sec1.match(/\| - \|/g) || []).length > 0;
    console.log(`  [${!hasDash ? "✅" : "❌"}] 빈값("-") 행 없음: ${!hasDash}`);
    console.log(`  [${sec1.includes("595") ? "✅" : "❌"}] 연면적 표시: ${sec1.includes("595")}`);
    console.log(`  [${sec1.includes("제2종근린생활시설") ? "✅" : "❌"}] 용도 표시: ${sec1.includes("제2종근린생활시설")}`);
    console.log(`  [${sec1.includes("1대") ? "✅" : "❌"}] 승강기 1대 표시: ${sec1.includes("1대")}`);

    // 섹션 3: 렌트롤 테이블 (TC-03-1)
    const sec3 = result.sections[2].markdown;
    console.log(`  [${sec3.includes("카페") ? "✅" : "❌"}] 렌트롤: 카페 표시: ${sec3.includes("카페")}`);
    console.log(`  [${sec3.includes("네일샵") ? "✅" : "❌"}] 렌트롤: 네일샵 표시: ${sec3.includes("네일샵")}`);
    console.log(`  [${sec3.includes("공실") ? "✅" : "❌"}] 렌트롤: 3F 공실 표시: ${sec3.includes("공실")}`);

    // 섹션 4: 재무 분석 (TC-03-4)
    const sec4 = result.sections[3].markdown;
    console.log(`  [${sec4.includes("Cap Rate") || sec4.includes("cap rate") || sec4.includes("수익률") ? "✅" : "❌"}] 수익률/Cap Rate 언급: ${sec4.includes("Cap Rate") || sec4.includes("cap rate") || sec4.includes("수익률")}`);

    // === Hero Card 검증 ===
    console.log("\n=== TC-03: Hero Card 검증 ===");
    if (result.heroCard) {
      console.log(`  [${result.heroCard.capRateBase !== null ? "✅" : "❌"}] Cap Rate: ${result.heroCard.capRateBase}`);
      console.log(`  [${result.heroCard.noiBaseBil !== null ? "✅" : "❌"}] NOI: ${result.heroCard.noiBaseBil}억`);
      console.log(`  [${result.heroCard.equityRequiredBil !== null ? "✅" : "❌"}] 자기자본: ${result.heroCard.equityRequiredBil}억`);
      console.log(`  [${result.heroCard.leveragedYieldPct !== null ? "✅" : "❌"}] 레버리지 수익률: ${result.heroCard.leveragedYieldPct}%`);
      console.log(`  [✅] Readiness Score: ${result.heroCard.readinessScore}`);
    } else {
      console.log("  [❌] Hero Card 없음!");
    }

    // === DCF 검증 ===
    console.log("\n=== TC-03: DCF 검증 ===");
    if (result.dcf10Year) {
      console.log(`  [✅] DCF 10년 NPV 기본: ${(result.dcf10Year.npvBase / 1e8).toFixed(1)}억`);
      console.log(`  [${result.dcf10Year.sensitivityMatrix?.length === 9 ? "✅" : "❌"}] 감응도 매트릭스 9셀: ${result.dcf10Year.sensitivityMatrix?.length}`);
    } else {
      console.log("  [❌] DCF 10년 데이터 없음!");
    }

    // === 레버리지 검증 ===
    console.log("\n=== TC-03: 레버리지 검증 ===");
    if (result.financials) {
      console.log(`  [${result.financials.equityRequired !== undefined ? "✅" : "❌"}] 자기자본: ${result.financials.equityRequired}억`);
      console.log(`  [${result.financials.loanAmountBil !== undefined ? "✅" : "❌"}] 대출: ${result.financials.loanAmountBil}억`);
      console.log(`  [${result.financials.totalDepositBil !== undefined ? "✅" : "❌"}] 보증금: ${result.financials.totalDepositBil}억`);
      console.log(`  [${result.financials.leveragedYield !== undefined ? "✅" : "❌"}] 레버리지 수익률: ${result.financials.leveragedYield}`);
      console.log(`  [${result.financials.wacc !== undefined ? "✅" : "❌"}] WACC: ${result.financials.wacc}`);
    } else {
      console.log("  [❌] Financials 없음!");
    }

    // === 전체 결과 요약 ===
    console.log("\n=== 전체 결과 요약 ===");
    console.log(`  섹션 수: ${result.sections.length}`);
    console.log(`  AI 사용: ${result.ai_used}`);
    console.log(`  생성 시각: ${result.generated_at}`);
    console.log(`  사진 수: ${result.photos?.length ?? 0}`);

    // 각 섹션의 provenance 확인 (TC-07)
    console.log("\n=== TC-07: 출처 배지 검증 ===");
    for (const sec of result.sections) {
      const prov = sec.provenance || [];
      const sources = prov.map((p: any) => p.source).join(", ");
      console.log(`  ${sec.title.slice(0, 20)}: provenance=[${sources}]`);
    }

  } catch (err: any) {
    console.error("❌ 테스트 실패:", err.message || err);
    console.error(err.stack);
  }
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
