/**
 * scripts/verify-m1-empirical.ts
 *
 * Empirical Challenger Verification Harness for Milestone 1:
 * In-App Contextual Tooltip, Micro-Coaching, and Help System
 *
 * Objective:
 * 1. BUILTIN_TERMS coverage: assert all 27 domain terms resolve to non-empty title, easyMeaning, and tip.
 * 2. resolveScreenNameFromPathname: test all 12+ paths including:
 *    - /broker
 *    - /broker/buildings
 *    - /broker/buildings/[id]/im-lite
 *    - /broker/clients
 *    - /broker/inbox
 *    - /broker/profile
 *    - /broker/deal-card/new
 *    - /broker/deal-card/[id]
 *    - /broker/basic-im-studio
 *    - /broker/im-approval/[id]
 *    - /broker/magazine-editor
 *    - /broker/tutorial
 *    - Edge cases: "", unknown, null
 * 3. FieldCoachBanner: test rendering and helperEnabled === false returns null.
 * 4. SeniorTermTooltip: test rendering and helperEnabled === false returns null.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUILTIN_TERMS, SeniorTermTooltip } from "../src/components/help/SeniorTermTooltip";
import { FieldCoachBanner } from "../src/components/help/FieldCoachBanner";
import { resolveScreenNameFromPathname } from "../src/components/help/QuickFeedbackReportModal";
import * as SeniorHelpContextModule from "../src/components/help/SeniorHelpContext";

interface TestResult {
  suite: string;
  test: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, suite: string, test: string, details?: string) {
  if (!condition) {
    const errorMsg = `Assertion Failed: ${test}${details ? ` -> ${details}` : ""}`;
    console.error(`  ❌ [FAIL] ${test}`);
    results.push({ suite, test, passed: false, error: errorMsg, details });
  } else {
    console.log(`  ✅ [PASS] ${test}`);
    results.push({ suite, test, passed: true, details });
  }
}

async function runEmpiricalVerification() {
  console.log("================================================================================");
  console.log("🚀 STARTING M1 EMPIRICAL VERIFICATION HARNESS");
  console.log("================================================================================");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: BUILTIN_TERMS Coverage & Integrity
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[SUITE 1] BUILTIN_TERMS Coverage & Content Assertions");

  const REQUIRED_27_DOMAIN_TERMS = [
    "수신자 화면",
    "안정화 수익률",
    "다필지",
    "투자 포스처",
    "모노 고대비",
    "렌트롤 AI 변환",
    "G1~G3 비밀유지 승인",
    "고객 등급(VIP/잠재)",
    "열람 온도(3회 이상 열람)",
    "완성도 점수",
    "중개사무소 등록번호 인쇄 위치",
    "딜카드",
    "모바일 IM",
    "외관/대표 사진",
    "고객 유형(매도/매수/양쪽)",
    "주간 소식지",
    "안전한 삭제 규칙",
    "권역/유형/가격 검색 팁",
    "고객 문의함",
    "매물 진행 단계",
    "필수 데이터 4항목",
    "준비도 점수",
    "딜 매칭 연동",
    "소식지 구독 연동",
    "대표자 성함 인쇄 위치",
    "직통 연락처 인쇄 위치",
    "중개법인 상호 인쇄 위치",
  ];

  const allKeys = Object.keys(BUILTIN_TERMS);
  assert(
    allKeys.length >= 27,
    "Suite 1",
    `BUILTIN_TERMS total keys count >= 27 (actual: ${allKeys.length})`
  );

  let all27Present = true;
  for (const term of REQUIRED_27_DOMAIN_TERMS) {
    const exists = Boolean(BUILTIN_TERMS[term]);
    if (!exists) all27Present = false;
    assert(exists, "Suite 1", `Required term "${term}" exists in BUILTIN_TERMS`);
  }

  let all27NonEmpty = true;
  for (const term of REQUIRED_27_DOMAIN_TERMS) {
    const entry = BUILTIN_TERMS[term];
    if (!entry) {
      all27NonEmpty = false;
      continue;
    }
    const hasTitle = typeof entry.title === "string" && entry.title.trim().length > 0;
    const hasMeaning = typeof entry.easyMeaning === "string" && entry.easyMeaning.trim().length >= 10;
    const hasTip = typeof entry.tip === "string" && entry.tip.trim().length >= 10;

    assert(
      hasTitle && hasMeaning && hasTip,
      "Suite 1",
      `Term "${term}" has non-empty title, easyMeaning (len=${entry.easyMeaning?.length}), and tip (len=${entry.tip?.length})`
    );
  }

  // Check all dictionary keys for zero poison / placeholder strings
  let zeroPoison = true;
  for (const [key, entry] of Object.entries(BUILTIN_TERMS)) {
    const poisonRegex = /TODO|TBD|undefined|null|\[object/i;
    if (poisonRegex.test(entry.title) || poisonRegex.test(entry.easyMeaning) || (entry.tip && poisonRegex.test(entry.tip))) {
      zeroPoison = false;
      assert(false, "Suite 1", `Term "${key}" contains placeholder or poison token!`);
    }
  }
  assert(zeroPoison, "Suite 1", "All BUILTIN_TERMS entries are free from poison / placeholder tokens");

  // ─────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: resolveScreenNameFromPathname Comprehensive Route Mapping
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[SUITE 2] resolveScreenNameFromPathname 12+ Routes & Edge Cases");

  const ROUTE_TESTS = [
    { path: "/broker", expected: "🏠 홈 화면 (대시보드 · 퀵액션 · 알림)" },
    { path: "/broker/buildings", expected: "🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)" },
    { path: "/broker/buildings/[id]/im-lite", expected: "📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)" },
    { path: "/broker/buildings/bld-gangnam-101/im-lite", expected: "📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)" },
    { path: "/broker/clients", expected: "👥 고객 명단 · 구독 관리 (VIP/일반/잠재)" },
    { path: "/broker/inbox", expected: "🔔 소통 관리함 (열람 알림 · G1~G3 게이트 요청)" },
    { path: "/broker/profile", expected: "👤 중개사 프로필 · 디지털 명함 설정" },
    { path: "/broker/deal-card/new", expected: "➕ 1분 딜카드 신규 등록 (카톡 메모 입력)" },
    { path: "/broker/deal-card/dc-1234", expected: "📱 1분 딜카드 상세 · 수신자 블라인드 화면 · 카톡 공유" },
    { path: "/broker/basic-im-studio", expected: "🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)" },
    { path: "/broker/basic-im-studio/b-999", expected: "🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)" },
    { path: "/broker/im-approval/appr-5678", expected: "✏️ IM 검토 · 공개 승인 · 사진 역할 큐레이션" },
    { path: "/broker/magazine-editor", expected: "📰 주간 고객 소식지 간편 발행" },
    { path: "/broker/tutorial", expected: "📖 60대 중개인 큰글씨 사용 설명서" },
  ];

  for (const rt of ROUTE_TESTS) {
    const actual = resolveScreenNameFromPathname(rt.path);
    assert(
      actual === rt.expected,
      "Suite 2",
      `Path "${rt.path}" resolves to "${rt.expected}" (actual: "${actual}")`
    );
  }

  // Edge cases
  const EDGE_TESTS = ["", "/", "/unknown/path", "/broker/unregistered-route", null as any, undefined as any];
  for (const edge of EDGE_TESTS) {
    const actual = resolveScreenNameFromPathname(edge);
    assert(
      actual === "기타 화면",
      "Suite 2",
      `Edge path "${edge}" safely resolves to fallback "기타 화면" (actual: "${actual}")`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: FieldCoachBanner Rendering & helperEnabled === false Isolation
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[SUITE 3] FieldCoachBanner Rendering & helperEnabled === false Isolation");

  // Helper function to mock useContext
  const origUseContext = React.useContext;
  function setMockContext(val: any) {
    React.useContext = () => val;
  }

  // 3.1: helperEnabled === true
  setMockContext({
    helperEnabled: true,
    toggleHelperEnabled: () => {},
    isDrawerOpen: false,
    activeModuleId: null,
    openHelpDrawer: () => {},
    closeHelpDrawer: () => {},
  });

  const bannerActiveMarkup = renderToStaticMarkup(
    React.createElement(FieldCoachBanner, {
      headline: "💡 메모 입력 전 10초 코칭",
      guidance: "카카오톡으로 받은 매물 메모를 그대로 붙여넣으세요.",
      sampleText: "강남구 역삼동 100억 빌딩 임대수익 4.5%",
      sampleButtonLabel: "✨ 1초 예시 채우기",
      mistakeWarning: "상세 지번(번지수)은 고객 전송 시 자동 블라인드 처리됩니다.",
      variant: "amber",
    })
  );

  assert(
    bannerActiveMarkup.includes('data-testid="field-coach-banner"'),
    "Suite 3",
    "FieldCoachBanner renders container div when helperEnabled === true"
  );
  assert(
    bannerActiveMarkup.includes("💡 메모 입력 전 10초 코칭"),
    "Suite 3",
    "FieldCoachBanner renders headline"
  );
  assert(
    bannerActiveMarkup.includes("카카오톡으로 받은 매물 메모를 그대로 붙여넣으세요."),
    "Suite 3",
    "FieldCoachBanner renders guidance"
  );
  assert(
    bannerActiveMarkup.includes('data-testid="field-coach-sample-btn"'),
    "Suite 3",
    "FieldCoachBanner renders sample button when sampleText provided"
  );
  assert(
    bannerActiveMarkup.includes("⚠️ 잠깐! 자주 하는 실수"),
    "Suite 3",
    "FieldCoachBanner renders mistake warning collapsible"
  );
  assert(
    bannerActiveMarkup.includes("border-amber-300"),
    "Suite 3",
    "FieldCoachBanner renders variant='amber' border styling"
  );

  // 3.2: helperEnabled === false -> MUST RETURN NULL (EMPTY STRING)
  setMockContext({
    helperEnabled: false,
    toggleHelperEnabled: () => {},
    isDrawerOpen: false,
    activeModuleId: null,
    openHelpDrawer: () => {},
    closeHelpDrawer: () => {},
  });

  const bannerDisabledMarkup = renderToStaticMarkup(
    React.createElement(FieldCoachBanner, {
      headline: "💡 메모 입력 전 10초 코칭",
      guidance: "카카오톡으로 받은 매물 메모를 그대로 붙여넣으세요.",
      sampleText: "강남구 역삼동 100억 빌딩",
      mistakeWarning: "자주 하는 실수 경고",
      variant: "blue",
    })
  );

  assert(
    bannerDisabledMarkup === "",
    "Suite 3",
    `FieldCoachBanner returns null (empty string) when helperEnabled === false (actual len: ${bannerDisabledMarkup.length})`
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: SeniorTermTooltip Rendering & helperEnabled === false Isolation
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[SUITE 4] SeniorTermTooltip Rendering & helperEnabled === false Isolation");

  // 4.1: helperEnabled === true
  setMockContext({
    helperEnabled: true,
    toggleHelperEnabled: () => {},
    isDrawerOpen: false,
    activeModuleId: null,
    openHelpDrawer: () => {},
    closeHelpDrawer: () => {},
  });

  const tooltipActiveMarkup = renderToStaticMarkup(
    React.createElement(SeniorTermTooltip, {
      termKey: "다필지",
      buttonLabel: "❓ 쉬운 설명",
    })
  );

  assert(
    tooltipActiveMarkup.includes('data-testid="senior-tooltip-trigger-다필지"'),
    "Suite 4",
    "SeniorTermTooltip renders trigger button with data-testid when helperEnabled === true"
  );
  assert(
    tooltipActiveMarkup.includes("❓ 쉬운 설명"),
    "Suite 4",
    "SeniorTermTooltip renders button label"
  );

  // Render all 38 BUILTIN_TERMS without error
  let allTooltipsRendered = true;
  for (const termKey of Object.keys(BUILTIN_TERMS)) {
    try {
      const markup = renderToStaticMarkup(
        React.createElement(SeniorTermTooltip, { termKey })
      );
      if (!markup || markup.length === 0) {
        allTooltipsRendered = false;
      }
    } catch (e) {
      allTooltipsRendered = false;
      assert(false, "Suite 4", `SeniorTermTooltip threw error on termKey: "${termKey}"`);
    }
  }
  assert(
    allTooltipsRendered,
    "Suite 4",
    `SeniorTermTooltip successfully renders triggers for all ${Object.keys(BUILTIN_TERMS).length} BUILTIN_TERMS`
  );

  // 4.2: helperEnabled === false -> MUST RETURN NULL (EMPTY STRING)
  setMockContext({
    helperEnabled: false,
    toggleHelperEnabled: () => {},
    isDrawerOpen: false,
    activeModuleId: null,
    openHelpDrawer: () => {},
    closeHelpDrawer: () => {},
  });

  const tooltipDisabledMarkup = renderToStaticMarkup(
    React.createElement(SeniorTermTooltip, {
      termKey: "다필지",
    })
  );

  assert(
    tooltipDisabledMarkup === "",
    "Suite 4",
    `SeniorTermTooltip returns null (empty string) when helperEnabled === false (actual len: ${tooltipDisabledMarkup.length})`
  );

  // Check all 38 BUILTIN_TERMS return empty string when disabled
  let allDisabledEmpty = true;
  for (const termKey of Object.keys(BUILTIN_TERMS)) {
    const markup = renderToStaticMarkup(
      React.createElement(SeniorTermTooltip, { termKey })
    );
    if (markup !== "") {
      allDisabledEmpty = false;
      assert(false, "Suite 4", `Term "${termKey}" did not return null when helperEnabled is false`);
    }
  }
  assert(
    allDisabledEmpty,
    "Suite 4",
    `All ${Object.keys(BUILTIN_TERMS).length} SeniorTermTooltip entries return strictly null when helperEnabled === false`
  );

  // Restore
  React.useContext = origUseContext;

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY & VERDICT
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("📊 EMPIRICAL VERIFICATION SUMMARY");
  console.log("================================================================================");

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Assertions : ${total}`);
  console.log(`Passed           : ${passed}`);
  console.log(`Failed           : ${failed}`);

  if (failed === 0) {
    console.log("\n🏆 VERDICT: APPROVE (100% empirical assertions passed)");
    console.log("================================================================================");
    process.exit(0);
  } else {
    console.error(`\n💥 VERDICT: FAIL (${failed} assertions failed)`);
    console.log("================================================================================");
    process.exit(1);
  }
}

runEmpiricalVerification().catch((err) => {
  console.error("Fatal exception in verification harness:", err);
  process.exit(1);
});
