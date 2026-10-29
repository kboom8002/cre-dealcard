// @vitest-environment jsdom
/**
 * @file src/tests/unit/magazine/wave2-adversarial-challenge.test.tsx
 * @description Empirical Challenger Stress Test Suite for Wave 2
 *
 * Adversarially tests:
 * 1. Workspace redirect: /broker/w/magazine with query params, ensure no crash or loop, ensure magazine-workspace-redirect renders.
 * 2. Mode switcher: switching back and forth between Simple and Full mode, ensure state persistence and no lost form fields.
 * 3. Preview link: preview link generation with empty editionId, special characters, ensure ?preview=1&edition=${editionId} format.
 * 4. Bulk subscriber import: multi-line paste parser on edge cases (empty lines, whitespace, tabs/commas/spaces, invalid phone, emails with trailing spaces, missing names, 100+ lines).
 * 5. String price formatting: test edge cases ("협의", "미정", "12.5억", "100억 원", negative values, zero).
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import MagazineWorkspacePage from "@/app/(broker)/broker/w/magazine/page";
import {
  resolveEditorMode,
  applySimplePreset,
  countPreservedAdvancedItems,
  deriveFallbackHeadline,
  deriveFallbackBriefing,
  type EditorMode,
} from "@/lib/magazine/simple-format";
import { buildPreviewSrc, isPreviewQuery } from "@/lib/magazine/preview-bridge";
import { formatDealPrice as formatDealPriceTab } from "@/components/magazine-editor/EditorThemeDealsTab";
import { AddSubscriberForm } from "@/components/magazine-editor/outreach/AddSubscriberForm";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();
const stableRouter = { push: vi.fn(), replace: mockReplace, prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  usePathname: () => "/broker/w/magazine",
  useSearchParams: () => mockSearchParams,
}));

describe("Wave 2 Adversarial Stress Suite", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mockReplace.mockClear();
    mockSearchParams = new URLSearchParams();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    // Clean up any remaining portal elements in document.body
    document.body.querySelectorAll('[data-magazine-modal]').forEach((el) => el.remove());
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. Workspace Redirect (/broker/w/magazine)
   * ────────────────────────────────────────────────────────────────────────── */
  describe("1. Workspace redirect (/broker/w/magazine)", () => {
    it("renders magazine-workspace-redirect with empty query params without crashing or looping", async () => {
      mockSearchParams = new URLSearchParams("");
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      const redirectEl = container.querySelector('[data-testid="magazine-workspace-redirect"]');
      expect(redirectEl).not.toBeNull();
      expect(redirectEl?.textContent).toContain("고객 소식지 편집실로 이동 중입니다");
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/broker/magazine-editor");
    });

    it("renders safely when complex query params are passed (?tab=theme_deals&mode=simple&edition=ed-999&utm_source=kakao)", async () => {
      mockSearchParams = new URLSearchParams("tab=theme_deals&mode=simple&edition=ed-999&utm_source=kakao");
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      const redirectEl = container.querySelector('[data-testid="magazine-workspace-redirect"]');
      expect(redirectEl).not.toBeNull();
      expect(redirectEl?.textContent).toContain("고객 소식지 편집실로 이동 중입니다");
      expect(mockReplace).toHaveBeenCalledTimes(1);
      // Query parameters are forwarded to /broker/magazine-editor preserving deep links
      expect(mockReplace).toHaveBeenCalledWith("/broker/magazine-editor?tab=theme_deals&mode=simple&edition=ed-999&utm_source=kakao");
    });

    it("does not trigger infinite loop or multiple router.replace calls on re-renders when router reference is stable", async () => {
      mockSearchParams = new URLSearchParams("mode=full");
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });
      // Force second render pass on the same mounted tree
      await act(async () => {
        root.render(<MagazineWorkspacePage />);
      });

      expect(mockReplace).toHaveBeenCalledTimes(1);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. Mode Switcher & Form State Persistence
   * ────────────────────────────────────────────────────────────────────────── */
  describe("2. Mode Switcher & Form State Persistence", () => {
    it("resolves editor mode correctly across URL query, savedMode, and tab overrides", () => {
      // Default with no overrides is 'simple'
      expect(resolveEditorMode({})).toBe("simple");

      // URL ?mode=full overrides
      expect(resolveEditorMode({ queryMode: "full" })).toBe("full");

      // URL ?tab=outreach overrides to 'full' so target tab opens directly
      expect(resolveEditorMode({ queryTab: "outreach" })).toBe("full");

      // Saved preference 'full'
      expect(resolveEditorMode({ savedMode: "full" })).toBe("full");

      // Feature flag disabled forces 'full'
      expect(resolveEditorMode({ simpleModeEnabled: false, queryMode: "simple" })).toBe("full");
    });

    it("preserves advanced form fields when switching from Full mode to Simple mode and back", () => {
      const advancedState = {
        themeTitle: "강남 오피스 공실률 반전",
        themeBodyMd: "# 분석 내용\n- 공실률 2.1% 하락\n- 매수세 유입",
        pollQuestion: "하반기 금리 인하 시 투자 계획은?",
        taxQuestion: "법인 명의 취득세 중과 여부",
        taxAnswer: "과밀억제권역 외 5년 이상 대도시 법인은 일반세율 적용",
        fieldNote: {
          question: "강남권역 급매물 소진 속도 증가",
          buyerReaction: "실수요 법인 사옥 매수 문의 집중",
          sellerReaction: "호가 유지 및 추가 가격 절충 거부",
          marketJudgment: "선별 매수 추천",
          comment: "지금이 우량 자산 선점의 적기입니다.",
        },
      };

      // 1) Verify countPreservedAdvancedItems detects all 4 categories
      const preserved = countPreservedAdvancedItems(advancedState);
      expect(preserved.count).toBe(4);
      expect(preserved.labels).toEqual([
        "이번 주 테마",
        "1-Click 투표",
        "세무·법률 클리닉",
        "현장 Q&A 상세 항목",
      ]);

      // 2) Apply Simple Preset: ensure advanced fields are NOT wiped from content payload
      const fullContentPayload = {
        headline: "",
        format: "full",
        theme_title: advancedState.themeTitle,
        theme_body_md: advancedState.themeBodyMd,
        poll_question: advancedState.pollQuestion,
        tax_question: advancedState.taxQuestion,
        tax_answer: advancedState.taxAnswer,
        field_note: advancedState.fieldNote,
        selected_news_ids: ["n1", "n2", "n3", "n4", "n5"], // 5 items
      };

      const simplePreset = applySimplePreset(fullContentPayload, { brokerName: "김대표" });

      // Format marked as simple
      expect(simplePreset.format).toBe("simple");
      // Fallback headline derived deterministically from comment
      expect(simplePreset.headline).toBe("지금이 우량 자산 선점의 적기입니다");
      // News items capped to 3 in simple mode
      expect((simplePreset.selected_news_ids as string[]).length).toBe(3);
      // Advanced content retained intact (zero loss)
      expect(simplePreset.theme_title).toBe(advancedState.themeTitle);
      expect(simplePreset.poll_question).toBe(advancedState.pollQuestion);
      expect(simplePreset.tax_question).toBe(advancedState.taxQuestion);
      expect(simplePreset.field_note).toEqual(advancedState.fieldNote);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. Preview Link Generation
   * ────────────────────────────────────────────────────────────────────────── */
  describe("3. Preview Link Generation", () => {
    it("strictly constructs ?preview=1&edition=${editionId} using buildPreviewSrc", () => {
      const src = buildPreviewSrc("kim-broker", "2026-10-29", "ed-12345");
      expect(src).toBe("/magazine/kim-broker/2026-10-29?preview=1&edition=ed-12345");

      const parsed = isPreviewQuery(src.split("?")[1]);
      expect(parsed.preview).toBe(true);
      expect(parsed.editionId).toBe("ed-12345");
    });

    it("handles empty, null, or undefined editionId cleanly", () => {
      const srcNull = buildPreviewSrc("kim-broker", "2026-10-29", null);
      expect(srcNull).toBe("/magazine/kim-broker/2026-10-29?preview=1");
      expect(isPreviewQuery(srcNull.split("?")[1]).editionId).toBeNull();

      const srcEmpty = buildPreviewSrc("kim-broker", "2026-10-29", "");
      expect(srcEmpty).toBe("/magazine/kim-broker/2026-10-29?preview=1");
      expect(isPreviewQuery(srcEmpty.split("?")[1]).editionId).toBeNull();
    });

    it("handles special characters, whitespace, slashes, and Korean in editionId with strict URL encoding", () => {
      const specialIds = [
        "ed 123", // space
        "ed/456", // slash
        "ed?foo=bar&baz=1", // query delimiters
        "초안#호외-01", // Korean and hash
      ];

      for (const id of specialIds) {
        const src = buildPreviewSrc("slug", "2026-10-29", id);
        expect(src).toContain("preview=1");
        expect(src).toContain("edition=");

        // Must not contain raw unencoded space or hash in query string
        expect(src).not.toContain(" ");
        expect(src).not.toContain("#");

        const queryPart = src.slice(src.indexOf("?") + 1);
        const parsed = isPreviewQuery(queryPart);
        expect(parsed.preview).toBe(true);
        expect(parsed.editionId).toBe(id);
      }
    });

    it("tests broker editor page link logic for published vs unpublished editions", () => {
      const brokerSlug = "gangnam-pro";
      const publishedDate = "2026-10-20";
      const today = "2026-10-29";
      const editionId = "ed-abc";

      const getHref = (isPublished: boolean, edId: string | null) =>
        `/magazine/${encodeURIComponent(brokerSlug)}/${isPublished ? publishedDate : today}${!isPublished && edId ? `?preview=1&edition=${encodeURIComponent(edId)}` : ""}`;

      // Unpublished draft has ?preview=1&edition=ed-abc
      expect(getHref(false, editionId)).toBe(
        "/magazine/gangnam-pro/2026-10-29?preview=1&edition=ed-abc"
      );

      // Published edition does NOT have preview query
      expect(getHref(true, editionId)).toBe("/magazine/gangnam-pro/2026-10-20");

      // Unpublished draft with null editionId does not have preview query
      expect(getHref(false, null)).toBe("/magazine/gangnam-pro/2026-10-29");
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. Bulk Subscriber Import Multi-line Parser
   * ────────────────────────────────────────────────────────────────────────── */
  describe("4. Bulk Subscriber Import Edge Cases", () => {
    // Testing the bulk paste parsing via AddSubscriberForm component in JSDOM (via Modal portal on document.body)
    it("parses tabs, commas, and spaces cleanly into name, phone, and email", async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      // Switch to bulk import tab (located in document.body via Modal Portal)
      const bulkTab = document.body.querySelector('[data-testid="bulk-import-tab"]') as HTMLButtonElement;
      expect(bulkTab).not.toBeNull();
      await act(async () => {
        bulkTab.click();
      });

      const textarea = document.body.querySelector('[data-testid="bulk-subscriber-textarea"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      const inputLines = [
        "홍길동\t01012345678\thong@test.com", // tab separated
        "김철수,010-9876-5432,kim@test.com", // comma separated
        "이영희 010 1111 2222 lee@test.com", // space separated
        "박민수, 010-3333-4444, park@test.com", // comma + space
      ].join("\n");

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, inputLines);
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(document.body.textContent).toContain("인식된 고객: 4명");
      expect(document.body.textContent).toContain("홍길동");
      expect(document.body.textContent).toContain("김철수");
      expect(document.body.textContent).toContain("이영희");
      expect(document.body.textContent).toContain("박민수");
    });

    it("handles empty lines and whitespace-only lines without crashing or producing phantom subscribers", async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      const bulkTab = document.body.querySelector('[data-testid="bulk-import-tab"]') as HTMLButtonElement;
      await act(async () => {
        bulkTab.click();
      });

      const textarea = document.body.querySelector('[data-testid="bulk-subscriber-textarea"]') as HTMLTextAreaElement;

      const inputWithEmpties = [
        "",
        "   ",
        "\t\t",
        "홍길동 010-1234-5678",
        "",
        "   \r\n   ",
        "김철수 010-9876-5432",
        "",
      ].join("\n");

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, inputWithEmpties);
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Exactly 2 valid subscribers, empty lines ignored
      expect(document.body.textContent).toContain("인식된 고객: 2명");
    });

    it("handles emails with trailing spaces cleanly", async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      const bulkTab = document.body.querySelector('[data-testid="bulk-import-tab"]') as HTMLButtonElement;
      await act(async () => {
        bulkTab.click();
      });

      const textarea = document.body.querySelector('[data-testid="bulk-subscriber-textarea"]') as HTMLTextAreaElement;

      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, "홍길동 010-1234-5678  hong@test.com   \n");
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(document.body.textContent).toContain("인식된 고객: 1명");
      expect(document.body.textContent).toContain("hong@test.com");
    });

    it("stress-tests parsing 150 rows within performance threshold (<1000ms)", async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      const bulkTab = document.body.querySelector('[data-testid="bulk-import-tab"]') as HTMLButtonElement;
      await act(async () => {
        bulkTab.click();
      });

      const textarea = document.body.querySelector('[data-testid="bulk-subscriber-textarea"]') as HTMLTextAreaElement;

      const lines: string[] = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`고객${i} 010-1000-${String(i).padStart(4, "0")} client${i}@cre.com`);
      }
      const bulkPayload = lines.join("\n");

      const t0 = performance.now();
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, bulkPayload);
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const elapsed = performance.now() - t0;

      expect(document.body.textContent).toContain("인식된 고객: 150명");
      // Parsing and rendering 150 items should be snappy
      expect(elapsed).toBeLessThan(1000);
    });

    it("EMPIRICAL FINDING: examines behavior when input line has missing name or invalid phone number", async () => {
      await act(async () => {
        root.render(<AddSubscriberForm open={true} onClose={() => {}} onAdded={() => {}} />);
      });

      const bulkTab = document.body.querySelector('[data-testid="bulk-import-tab"]') as HTMLButtonElement;
      await act(async () => {
        bulkTab.click();
      });

      const textarea = document.body.querySelector('[data-testid="bulk-subscriber-textarea"]') as HTMLTextAreaElement;

      // 1) Only name, no contact info -> Invalid (⚠️ 확인 필요)
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, "이름만있음\n");
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(document.body.textContent).toContain("인식된 고객: 0명");
      expect(document.body.textContent).toContain("확인 필요");

      // 2) Phone only without name ("010-1234-5678"):
      // Remediation: Phone is not used as name; marked as needing a name (⚠️ 확인 필요, 0명).
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, "010-1234-5678\n");
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(document.body.textContent).toContain("인식된 고객: 0명");
      expect(document.body.textContent).toContain("이름 없음");
      expect(document.body.textContent).toContain("확인 필요");

      // 3) Invalid phone number ("홍길동 123"):
      // Remediation: "123" is not plausible phone digits (10~11 digits), flagged with 확인 필요
      await act(async () => {
        const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        nativeSetter?.call(textarea, "홍길동 123\n");
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(document.body.textContent).toContain("인식된 고객: 0명");
      expect(document.body.textContent).toContain("홍길동");
      expect(document.body.textContent).toContain("확인 필요");
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * 5. String Price Formatting (EditorThemeDealsTab formatDealPrice)
   * ────────────────────────────────────────────────────────────────────────── */
  describe("5. String Price Formatting Adversarial Tests", () => {
    it("verifies standard number and string 억 prices", () => {
      // Numbers
      expect(formatDealPriceTab(50)).toBe("50억 원");
      expect(formatDealPriceTab(120)).toBe("120억 원");

      // Strings ending in 억 or 원
      expect(formatDealPriceTab("12.5억")).toBe("12.5억");
      expect(formatDealPriceTab("100억 원")).toBe("100억 원");
      expect(formatDealPriceTab("  75억 원  ")).toBe("75억 원");

      // Numeric string < 10000
      expect(formatDealPriceTab("50")).toBe("50억 원");
      expect(formatDealPriceTab("225")).toBe("225억 원");
    });

    it("EMPIRICAL FINDING: checks edge cases '협의', '미정', 0, and negative values", () => {
      // 1) "협의" (Consultation / Negotiable)
      // Remediation: Returns "협의" cleanly without appending "억 원"
      const consultationResult = formatDealPriceTab("협의");
      expect(consultationResult).toBe("협의");

      // 2) "미정" (Undetermined)
      const undeterminedResult = formatDealPriceTab("미정");
      expect(undeterminedResult).toBe("미정");

      // 3) "상담" (Inquiry)
      expect(formatDealPriceTab("상담")).toBe("상담");

      // 4) Number 0 vs String "0" -> Both return ""
      expect(formatDealPriceTab(0)).toBe("");
      expect(formatDealPriceTab("0")).toBe("");

      // 5) Negative values -> Both return ""
      expect(formatDealPriceTab(-5)).toBe("");
      expect(formatDealPriceTab("-5")).toBe("");
    });
  });
});
