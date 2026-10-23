/**
 * Empirical Challenger: Milestone 1 Verification Suite
 *
 * Verifies the 60s Broker In-App Contextual Help System:
 * 1. BUILTIN_TERMS coverage (27 domain terms + all 38 dictionary entries)
 * 2. resolveScreenNameFromPathname mapping (12+ broker routes + edge cases)
 * 3. FieldCoachBanner rendering & helperEnabled === false isolation
 * 4. SeniorTermTooltip rendering & helperEnabled === false isolation
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BUILTIN_TERMS, SeniorTermTooltip } from "@/components/help/SeniorTermTooltip";
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";
import {
  resolveScreenNameFromPathname,
  QuickFeedbackReportModal,
} from "@/components/help/QuickFeedbackReportModal";
import * as SeniorHelpContextModule from "@/components/help/SeniorHelpContext";
import { BROKER_GLOSSARY_LIST } from "@/lib/tutorial/broker-tutorial-data";

// ── Mock next/navigation & sonner ──
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/broker"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("M1 Empirical Verifier: 60s Broker Help & Micro-Coaching", () => {
  let useSeniorHelpSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    useSeniorHelpSpy = vi.spyOn(SeniorHelpContextModule, "useSeniorHelp");
  });

  afterEach(() => {
    useSeniorHelpSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // 1. BUILTIN_TERMS Coverage & Content Integrity
  // ─────────────────────────────────────────────────────────────
  describe("1. BUILTIN_TERMS Domain Glossary Verification", () => {
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

    it("covers at least 27 required domain terms and has >= 27 entries total", () => {
      const termKeys = Object.keys(BUILTIN_TERMS);
      expect(termKeys.length).toBeGreaterThanOrEqual(27);

      for (const reqTerm of REQUIRED_27_DOMAIN_TERMS) {
        expect(
          BUILTIN_TERMS[reqTerm],
          `Missing required domain term in BUILTIN_TERMS: "${reqTerm}"`
        ).toBeDefined();
      }
    });

    it("asserts all 27 required domain terms resolve to non-empty title, easyMeaning, and tip", () => {
      for (const term of REQUIRED_27_DOMAIN_TERMS) {
        const entry = BUILTIN_TERMS[term];
        expect(entry, `Term "${term}" entry must exist`).toBeDefined();

        // 1. Title verification
        expect(typeof entry.title).toBe("string");
        expect(entry.title.trim().length, `Term "${term}" title must not be empty`).toBeGreaterThan(0);
        expect(entry.title).not.toMatch(/TODO|TBD|undefined|null/i);

        // 2. easyMeaning verification
        expect(typeof entry.easyMeaning).toBe("string");
        expect(
          entry.easyMeaning.trim().length,
          `Term "${term}" easyMeaning must be substantive (>= 15 chars)`
        ).toBeGreaterThanOrEqual(15);
        expect(entry.easyMeaning).not.toMatch(/TODO|TBD|undefined|null|\[object/i);

        // 3. tip verification
        expect(typeof entry.tip).toBe("string");
        expect(
          (entry.tip || "").trim().length,
          `Term "${term}" tip must not be empty and be actionable (>= 10 chars)`
        ).toBeGreaterThanOrEqual(10);
        expect(entry.tip).not.toMatch(/TODO|TBD|undefined|null/i);
      }
    });

    it("verifies 100% of all entries in BUILTIN_TERMS (including aliases and photo badges) have non-empty title, easyMeaning, and tip", () => {
      const allEntries = Object.entries(BUILTIN_TERMS);
      expect(allEntries.length).toBeGreaterThanOrEqual(30);

      for (const [key, entry] of allEntries) {
        expect(entry.title.trim(), `Key "${key}" title must not be empty`).toBeTruthy();
        expect(entry.easyMeaning.trim(), `Key "${key}" easyMeaning must not be empty`).toBeTruthy();
        expect(entry.tip?.trim(), `Key "${key}" tip must not be empty`).toBeTruthy();
      }
    });

    it("verifies SeniorTermTooltip falls back gracefully to BROKER_GLOSSARY_LIST when termKey is not in BUILTIN_TERMS", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: true,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      // Sample term from BROKER_GLOSSARY_LIST (e.g., "공시지가" or first item)
      const glossaryTerm = BROKER_GLOSSARY_LIST[0];
      expect(glossaryTerm).toBeDefined();

      const html = renderToStaticMarkup(
        <SeniorTermTooltip termKey={glossaryTerm.term} />
      );
      expect(html).toContain("senior-tooltip-trigger");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. resolveScreenNameFromPathname Comprehensive Testing
  // ─────────────────────────────────────────────────────────────
  describe("2. resolveScreenNameFromPathname Route Resolution", () => {
    const TEST_CASES: Array<{ path: string; expectedName: string; description: string }> = [
      {
        path: "/broker",
        expectedName: "🏠 홈 화면 (대시보드 · 퀵액션 · 알림)",
        description: "Broker dashboard home",
      },
      {
        path: "/broker/buildings",
        expectedName: "🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)",
        description: "Buildings list & IM vault",
      },
      {
        path: "/broker/buildings/[id]/im-lite",
        expectedName: "📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)",
        description: "IM inspection literal pattern",
      },
      {
        path: "/broker/buildings/bld-gangnam-101/im-lite",
        expectedName: "📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)",
        description: "IM inspection dynamic building id",
      },
      {
        path: "/broker/clients",
        expectedName: "👥 고객 명단 · 구독 관리 (VIP/일반/잠재)",
        description: "Clients & subscribers directory",
      },
      {
        path: "/broker/inbox",
        expectedName: "🔔 소통 관리함 (열람 알림 · G1~G3 게이트 요청)",
        description: "Broker communication inbox & alerts",
      },
      {
        path: "/broker/profile",
        expectedName: "👤 중개사 프로필 · 디지털 명함 설정",
        description: "Broker profile & credentials",
      },
      {
        path: "/broker/deal-card/new",
        expectedName: "➕ 1분 딜카드 신규 등록 (카톡 메모 입력)",
        description: "New dealcard registration",
      },
      {
        path: "/broker/deal-card/dc-987",
        expectedName: "📱 1분 딜카드 상세 · 수신자 블라인드 화면 · 카톡 공유",
        description: "Dealcard detail / receiver blind view",
      },
      {
        path: "/broker/basic-im-studio",
        expectedName: "🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)",
        description: "Basic IM slide studio root",
      },
      {
        path: "/broker/basic-im-studio/b-555",
        expectedName: "🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)",
        description: "Basic IM slide studio specific building",
      },
      {
        path: "/broker/im-approval/appr-2026",
        expectedName: "✏️ IM 검토 · 공개 승인 · 사진 역할 큐레이션",
        description: "IM approval & photo curation",
      },
      {
        path: "/broker/magazine-editor",
        expectedName: "📰 주간 고객 소식지 간편 발행",
        description: "Weekly newsletter magazine editor",
      },
      {
        path: "/broker/tutorial",
        expectedName: "📖 60대 중개인 큰글씨 사용 설명서",
        description: "Senior broker visual guide",
      },
    ];

    it("correctly resolves all 12+ primary broker routes", () => {
      expect(TEST_CASES.length).toBeGreaterThanOrEqual(12);

      for (const tc of TEST_CASES) {
        const resolved = resolveScreenNameFromPathname(tc.path);
        expect(
          resolved,
          `Failed route resolution for "${tc.path}" (${tc.description})`
        ).toBe(tc.expectedName);
      }
    });

    it("handles edge cases and unknown routes safely by returning fallback '기타 화면'", () => {
      const EDGE_CASES = [
        "",
        "/",
        "/random-path",
        "/broker/unknown-feature",
        "/admin/settings",
        null as unknown as string,
        undefined as unknown as string,
      ];

      for (const edgePath of EDGE_CASES) {
        const resolved = resolveScreenNameFromPathname(edgePath);
        expect(resolved).toBe("기타 화면");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. FieldCoachBanner Rendering & helperEnabled === false Isolation
  // ─────────────────────────────────────────────────────────────
  describe("3. FieldCoachBanner Rendering & Isolation", () => {
    it("renders headline, guidance, sample button, and mistake warning when helperEnabled is true", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: true,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <FieldCoachBanner
          headline="💡 메모 입력 전 10초 코칭"
          guidance="카카오톡으로 받은 매물 메모를 그대로 붙여넣으세요."
          sampleText="강남구 역삼동 100억 빌딩 임대수익 4.5%"
          sampleButtonLabel="✨ 1초 예시 채우기"
          mistakeWarning="상세 지번(번지수)은 고객 전송 시 자동 블라인드 처리됩니다."
          variant="amber"
        />
      );

      // Verify DOM container and attributes
      expect(html).toContain('data-testid="field-coach-banner"');
      expect(html).toContain("💡 메모 입력 전 10초 코칭");
      expect(html).toContain("카카오톡으로 받은 매물 메모를 그대로 붙여넣으세요.");
      expect(html).toContain('data-testid="field-coach-sample-btn"');
      expect(html).toContain("✨ 1초 예시 채우기");
      expect(html).toContain("⚠️ 잠깐! 자주 하는 실수");
      expect(html).toContain("상세 지번(번지수)은 고객 전송 시 자동 블라인드 처리됩니다.");
      expect(html).toContain("border-amber-300");
    });

    it("renders all visual variants (amber, blue, emerald, paper) correctly", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: true,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      const variants = [
        { variant: "amber" as const, expectedClass: "border-amber-300" },
        { variant: "blue" as const, expectedClass: "border-blue-300" },
        { variant: "emerald" as const, expectedClass: "border-emerald-300" },
        { variant: "paper" as const, expectedClass: "border-slate-300" },
      ];

      for (const { variant, expectedClass } of variants) {
        const html = renderToStaticMarkup(
          <FieldCoachBanner
            headline={`${variant} headline`}
            variant={variant}
          />
        );
        expect(html).toContain(expectedClass);
      }
    });

    it("strictly returns null (empty markup) when helperEnabled is false", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: false,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      // 1. Full props test
      const fullPropsHtml = renderToStaticMarkup(
        <FieldCoachBanner
          headline="💡 메모 입력 전 10초 코칭"
          guidance="가이드 텍스트"
          sampleText="샘플 텍스트"
          mistakeWarning="실수 경고"
          variant="amber"
          actionExtra={<button>추가 버튼</button>}
        />
      );
      expect(fullPropsHtml).toBe("");

      // 2. Minimal props test
      const minimalPropsHtml = renderToStaticMarkup(
        <FieldCoachBanner headline="헤드라인" />
      );
      expect(minimalPropsHtml).toBe("");

      // 3. All variants under disabled state
      for (const variant of ["amber", "blue", "emerald", "paper"] as const) {
        const variantHtml = renderToStaticMarkup(
          <FieldCoachBanner headline="헤드라인" variant={variant} />
        );
        expect(variantHtml).toBe("");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. SeniorTermTooltip Rendering & helperEnabled === false Isolation
  // ─────────────────────────────────────────────────────────────
  describe("4. SeniorTermTooltip Rendering & Isolation", () => {
    it("renders trigger button with correct label and testid when helperEnabled is true", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: true,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      // Default label
      const html1 = renderToStaticMarkup(
        <SeniorTermTooltip termKey="다필지" />
      );
      expect(html1).toContain('data-testid="senior-tooltip-trigger-다필지"');
      expect(html1).toContain("❓ 쉬운 설명");

      // Custom label
      const html2 = renderToStaticMarkup(
        <SeniorTermTooltip termKey="안정화 수익률" buttonLabel="📈 수익률 도움말" />
      );
      expect(html2).toContain('data-testid="senior-tooltip-trigger-안정화 수익률"');
      expect(html2).toContain("📈 수익률 도움말");
    });

    it("successfully renders all 38 BUILTIN_TERMS entries without throwing errors", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: true,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      const allKeys = Object.keys(BUILTIN_TERMS);
      for (const termKey of allKeys) {
        const html = renderToStaticMarkup(
          <SeniorTermTooltip termKey={termKey} />
        );
        expect(html.length).toBeGreaterThan(0);
        expect(html).toContain("senior-tooltip-trigger");
      }
    });

    it("strictly returns null (empty markup) when helperEnabled is false", () => {
      useSeniorHelpSpy.mockReturnValue({
        helperEnabled: false,
        toggleHelperEnabled: vi.fn(),
        isDrawerOpen: false,
        activeModuleId: null,
        openHelpDrawer: vi.fn(),
        closeHelpDrawer: vi.fn(),
      });

      // 1. Single term test
      const singleHtml = renderToStaticMarkup(
        <SeniorTermTooltip termKey="다필지" />
      );
      expect(singleHtml).toBe("");

      // 2. Custom props test
      const customHtml = renderToStaticMarkup(
        <SeniorTermTooltip
          termKey="custom-key"
          title="커스텀 타이틀"
          easyMeaning="커스텀 설명"
          tip="커스텀 팁"
          showPostureTable={true}
        />
      );
      expect(customHtml).toBe("");

      // 3. Exhaustive check: all 38 BUILTIN_TERMS return empty markup when disabled
      for (const termKey of Object.keys(BUILTIN_TERMS)) {
        const html = renderToStaticMarkup(
          <SeniorTermTooltip termKey={termKey} />
        );
        expect(
          html,
          `SeniorTermTooltip for "${termKey}" must return null when helperEnabled is false`
        ).toBe("");
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. QuickFeedbackReportModal Verification
  // ─────────────────────────────────────────────────────────────
  describe("5. QuickFeedbackReportModal Basic Guard", () => {
    it("returns null when isOpen is false", () => {
      const html = renderToStaticMarkup(
        <QuickFeedbackReportModal isOpen={false} onClose={vi.fn()} />
      );
      expect(html).toBe("");
    });
  });
});
