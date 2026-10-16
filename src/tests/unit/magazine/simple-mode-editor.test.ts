import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  resolveEditorMode,
  deriveFallbackHeadline,
  deriveFallbackBriefing,
  countPreservedAdvancedItems,
  applySimplePreset,
  SIMPLE_STARTER_CHIPS,
  SIMPLE_AUTO_FILLED_ITEMS,
  SIMPLE_DEAL_LIMIT,
} from "@/lib/magazine/simple-format";
import {
  EDITOR_MODE_STORAGE_KEY,
  readStoredEditorMode,
  persistEditorModePreference,
} from "@/hooks/useEditorMode";
import {
  NoteStarterChips,
  appendStarterTemplate,
} from "@/components/magazine-editor/simple/NoteStarterChips";
import { AutoFilledStrip } from "@/components/magazine-editor/simple/AutoFilledStrip";
import { SimpleDealPicker } from "@/components/magazine-editor/simple/SimpleDealPicker";
import {
  SimpleEditor,
  requestSimpleSummary,
} from "@/components/magazine-editor/simple/SimpleEditor";
import { MagazineInsightCard } from "@/components/dashboard/MagazineInsightCard";

describe("Simple Mode Editor (S2) — Mode Resolution & Persistence", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  it("defaults to 'simple' mode for all brokers when no query or saved preference exists", () => {
    expect(resolveEditorMode({})).toBe("simple");
    expect(readStoredEditorMode()).toBeNull();
  });

  it("prioritizes ?mode=full and ?tab=outreach|analytics over stored preference", () => {
    expect(resolveEditorMode({ queryMode: "full", savedMode: "simple" })).toBe("full");
    expect(resolveEditorMode({ queryMode: "simple", savedMode: "full" })).toBe("simple");
    expect(resolveEditorMode({ queryTab: "outreach", savedMode: "simple" })).toBe("full");
    expect(resolveEditorMode({ queryTab: "analytics" })).toBe("full");
  });

  it("persists mode to localStorage and calls PUT /api/broker/profile asynchronously", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    persistEditorModePreference("full", { fetchImpl: fetchMock as unknown as typeof fetch });

    expect(readStoredEditorMode()).toBe("full");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/broker/profile",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ magazine_editor_mode: "full" }),
      }),
    );
  });

  it("suppresses network errors when PUT /api/broker/profile fails or skipRemote is set", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("offline"));
    expect(() =>
      persistEditorModePreference("simple", {
        fetchImpl: failingFetch as unknown as typeof fetch,
      }),
    ).not.toThrow();
    expect(window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY)).toBe("simple");

    const skippedFetch = vi.fn();
    persistEditorModePreference("full", {
      skipRemote: true,
      fetchImpl: skippedFetch as unknown as typeof fetch,
    });
    expect(skippedFetch).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY)).toBe("full");
  });
});

describe("Simple Mode Editor (S2) — NoteStarterChips & AutoFilledStrip & SimpleDealPicker", () => {
  it("renders all 3 starter chips with >=44px height and appends template cleanly", () => {
    const html = renderToStaticMarkup(
      React.createElement(NoteStarterChips, {
        currentComment: "",
        onSelectTemplate: () => {},
      }),
    );
    for (const chip of SIMPLE_STARTER_CHIPS) {
      expect(html).toContain(chip.label);
      expect(html).toContain(`starter-chip-${chip.id}`);
    }
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("text-[15px]");

    const first = appendStarterTemplate("", SIMPLE_STARTER_CHIPS[0].template);
    expect(first).toBe(SIMPLE_STARTER_CHIPS[0].template);

    // 중복 클릭 시 같은 템플릿을 두 번 이어 붙이지 않음
    const duplicate = appendStarterTemplate(first, SIMPLE_STARTER_CHIPS[0].template);
    expect(duplicate).toBe(first);

    // 다른 칩 클릭 시 자연스럽게 이어 붙임
    const combined = appendStarterTemplate("역삼동 현장입니다.", SIMPLE_STARTER_CHIPS[1].template);
    expect(combined).toContain("역삼동 현장입니다.");
    expect(combined).toContain(SIMPLE_STARTER_CHIPS[1].template.trim());
  });

  it("renders reassuring empty state when deals is empty and deal cards when deals exist", () => {
    const emptyHtml = renderToStaticMarkup(
      React.createElement(SimpleDealPicker, {
        deals: [],
        selectedDealIds: new Set<string>(),
        onToggleDeal: () => {},
      }),
    );
    expect(emptyHtml).toContain(
      "등록된 매물이 없어도 괜찮습니다 — 이번 호는 시장 브리핑과 뉴스 중심으로 발행됩니다",
    );

    const dealsHtml = renderToStaticMarkup(
      React.createElement(SimpleDealPicker, {
        deals: [
          { id: "d1", areaSignal: "역삼역 코너 빌딩", address: "강남구 역삼동", price: 8500000000 },
          { id: "d2", areaSignal: "서초역 수익형 빌딩", address: "서초구 서초동", price: 6200000000 },
        ],
        selectedDealIds: new Set(["d1"]),
        onToggleDeal: () => {},
      }),
    );
    expect(dealsHtml).toContain("역삼역 코너 빌딩");
    expect(dealsHtml).toContain("85.0억");
    expect(dealsHtml).toContain(`1 / 최대 ${SIMPLE_DEAL_LIMIT}건 선택됨`);
    expect(dealsHtml).toContain("min-h-[56px]");
    expect(dealsHtml).toContain("w-6 h-6");
  });

  it("renders all 4 auto-filled items in AutoFilledStrip", () => {
    const html = renderToStaticMarkup(React.createElement(AutoFilledStrip)).replace(/&amp;/g, "&");
    for (const item of SIMPLE_AUTO_FILLED_ITEMS) {
      expect(html).toContain(item.label);
      expect(html).toContain(item.icon);
    }
    expect(html).toContain("자동 포함");
  });
});

describe("Simple Mode Editor (S2) — SimpleEditor UI & Summary Fallback Contract", () => {
  it("renders 3-step single screen layout, preserved advanced items notice, and publish CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(SimpleEditor, {
        editionId: "ed-123",
        brokerName: "김중개",
        fieldNote: {
          question: "",
          buyerReaction: "",
          sellerReaction: "",
          marketJudgment: "",
          comment: "이번 주 역삼동 꼬마빌딩 매수 문의가 크게 늘었습니다. 50억대 코너 건물을 주목하세요.",
        },
        updateFieldNote: () => {},
        headline: "",
        setHeadline: () => {},
        briefing: "",
        setBriefing: () => {},
        marketTemp: "선별 매수",
        setMarketTemp: () => {},
        deals: [{ id: "d1", areaSignal: "역삼동 5층 코너", price: 5200000000 }],
        selectedDealIds: new Set(["d1"]),
        toggleDeal: () => {},
        pollQuestion: "하반기 가장 관심 있는 투자 전략은?",
        taxQuestion: "양도세 절세 포인트는?",
        taxAnswer: "장기보유특별공제를 확인하세요.",
        onPublish: () => {},
        onOpenTab: () => {},
        onSwitchToFullMode: () => {},
      }),
    );

    expect(html).toContain("⚡ 5분 간단 모드");
    expect(html).toContain("① 이번 주 한마디");
    expect(html).toContain("② 소개할 매물 확인");
    expect(html).toContain("③ 매거진 제목 &amp; 시장 온도 확인");
    expect(html).toContain('id="simple-field-note-comment"');
    expect(html).toContain("🚀 이번 주 매거진 발행하기");
    expect(html).toContain("고급 항목 2개(1-Click 투표·세무·법률 클리닉 등)도 함께 유지됩니다");
    expect(html).toContain("👥 구독자 관리 · QR 코드");
    expect(html).toContain("📈 독자 반응 · 핫리드 보기");
    expect(html).toContain("🛠️ 상세 편집 모드(투표·세무·테마)로 전환");
  });

  it("falls back deterministically when simple-summary and ai-comment APIs fail or are offline", async () => {
    const offlineFetch = vi.fn().mockRejectedValue(new Error("network down"));
    const comment =
      "이번 주 강남권 실수요 사옥 문의가 꾸준히 이어지고 있습니다. 특히 역세권 50억대 물건이 인기입니다.";
    const res = await requestSimpleSummary({
      editionId: "ed-1",
      comment,
      brokerName: "박대표",
      dealCount: 2,
      newsTitles: ["한국은행 기준금리 동결 시사"],
      marketTemp: "선별 매수",
      fetchImpl: offlineFetch as unknown as typeof fetch,
    });

    expect(res.source).toBe("fallback");
    expect(res.headline).toBe(deriveFallbackHeadline(comment, "박대표"));
    expect(res.briefing).toContain("추천 매물 2건");
    expect(res.briefing).toContain("한국은행 기준금리 동결 시사");
  });

  it("uses API response when simple-summary endpoint succeeds", async () => {
    const okFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: {
          headline: "강남 역세권 50억대 빌딩 매수세 집중",
          briefing: "실수요 문의가 증가하며 역세권 코너 물건 중심으로 거래가 활발합니다.",
        },
      }),
    });

    const res = await requestSimpleSummary({
      editionId: "ed-99",
      comment: "이번 주 강남 역세권 매수 문의가 늘었습니다.",
      brokerName: "박대표",
      fetchImpl: okFetch as unknown as typeof fetch,
    });

    expect(res.source).toBe("api");
    expect(res.headline).toBe("강남 역세권 50억대 빌딩 매수세 집중");
    expect(res.briefing).toContain("실수요 문의가 증가하며");
  });

  it("applies simple preset while preserving existing advanced sections and renders dashboard badge", () => {
    const preset = applySimplePreset(
      {
        headline: "",
        field_note: { comment: "이번 주 서초동 임대수익형 빌딩 문의가 활발합니다." },
        featured_deal_ids: ["1", "2", "3", "4"],
        selected_news_ids: ["n1", "n2", "n3", "n4", "n5"],
        poll: { question: "올해 매수 계획이 있으신가요?", choices: ["예", "아니오"] },
      },
      { brokerName: "김중개" },
    );

    expect(preset.format).toBe("simple");
    expect(preset.headline).toBe("이번 주 서초동 임대수익형 빌딩 문의가 활발합니다");
    expect((preset.featured_deal_ids as string[]).length).toBe(3);
    expect((preset.selected_news_ids as string[]).length).toBe(3);
    const sections = preset.sections as Array<{ id: string; enabled: boolean }>;
    expect(sections.find((s) => s.id === "roi_calculator")?.enabled).toBe(true);
    expect(sections.find((s) => s.id === "poll")?.enabled).toBe(true);
    expect(sections.find((s) => s.id === "tax_clinic")?.enabled).toBe(false);

    const cardHtml = renderToStaticMarkup(
      React.createElement(MagazineInsightCard, {
        viewCount: 12,
        subscriberCount: 34,
      }),
    );
    expect(cardHtml).toContain("/broker/magazine-editor?mode=simple");
    expect(cardHtml).toContain("⚡ 한마디만 적으면 5분 완성");
  });
});
