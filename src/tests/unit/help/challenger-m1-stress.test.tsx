// @vitest-environment jsdom
/**
 * Challenger 2 (M1 Boundary & Stress Challenger)
 * Empirical Adversarial Test Suite for Milestone 1 Components:
 * 1. FieldCoachBanner (boundary values, extreme text, rapid clicks, missing sample/mistake)
 * 2. QuickFeedbackReportModal (missing clipboard, SSR, rapid open/close portals, pathname resolution)
 * 3. KakaoTemplatePicker (missing buildingId, undefined props, defaultTemplateId, portal cleanup)
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Set React act environment
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Mock Sonner ──
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
};

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
    info: (...args: unknown[]) => mockToast.info(...args),
    warning: (...args: unknown[]) => mockToast.warning(...args),
  },
}));

// ── Mock Next.js navigation ──
let mockPathname = "/broker";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// Import target components and helpers
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";
import {
  QuickFeedbackReportModal,
  resolveScreenNameFromPathname,
} from "@/components/help/QuickFeedbackReportModal";
import { KakaoTemplatePicker } from "@/components/help/KakaoTemplatePicker";
import { SeniorHelpProvider } from "@/components/help/SeniorHelpContext";
import { BROKER_MESSAGE_TEMPLATES } from "@/lib/tutorial/broker-tutorial-data";

describe("Empirical Challenger 2: Milestone 1 Boundary & Stress Testing", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalClipboard: Clipboard | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockPathname = "/broker";

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    // Save and prepare clipboard mock
    originalClipboard = navigator.clipboard;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();

    // Clean up any stray portals in document.body
    const dialogs = document.body.querySelectorAll('[role="dialog"]');
    dialogs.forEach((d) => d.parentElement?.remove());

    // Restore clipboard
    if (originalClipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
    }
  });

  // Helper to mount with SeniorHelpProvider
  async function renderWithProvider(ui: React.ReactNode, enabled = true) {
    if (!enabled) {
      window.localStorage.setItem("credeal-senior-helper-enabled", "false");
    } else {
      window.localStorage.removeItem("credeal-senior-helper-enabled");
    }

    await act(async () => {
      root.render(<SeniorHelpProvider>{ui}</SeniorHelpProvider>);
    });
  }

  // =========================================================================
  // SECTION 1: FieldCoachBanner Adversarial & Stress Probes
  // =========================================================================
  describe("1. FieldCoachBanner Adversarial Stress", () => {
    it("1.1 Empty / missing sampleText does not render sample button and prevents crash", async () => {
      await renderWithProvider(
        <FieldCoachBanner
          headline="테스트 헤드라인"
          guidance="가이드 안내문"
          sampleText={undefined}
        />
      );

      const banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner).not.toBeNull();
      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]');
      expect(sampleBtn).toBeNull();
    });

    it("1.2 Empty string sampleText does not render sample button", async () => {
      await renderWithProvider(
        <FieldCoachBanner
          headline="테스트 헤드라인"
          guidance="가이드 안내문"
          sampleText=""
        />
      );

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]');
      expect(sampleBtn).toBeNull();
    });

    it("1.3 Empty / missing mistakeWarning cleanly hides the entire warning section", async () => {
      await renderWithProvider(
        <FieldCoachBanner
          headline="헤드라인"
          guidance="가이드"
          mistakeWarning={undefined}
        />
      );

      expect(container.textContent).not.toContain("자주 하는 실수");
      expect(container.textContent).not.toContain("⚠️");
    });

    it("1.4 mistakeWarning='' (empty string) cleanly hides the mistake section", async () => {
      await renderWithProvider(
        <FieldCoachBanner
          headline="헤드라인"
          guidance="가이드"
          mistakeWarning=""
        />
      );

      expect(container.textContent).not.toContain("자주 하는 실수");
    });

    it("1.5 Collapsible mistake warning toggles aria-expanded and visibility on click", async () => {
      await renderWithProvider(
        <FieldCoachBanner
          headline="헤드라인"
          guidance="가이드"
          mistakeWarning="이것은 주의해야 할 실수입니다."
          defaultMistakeCollapsed={true}
        />
      );

      // Initially collapsed
      expect(container.textContent).toContain("자주 하는 실수");
      expect(container.textContent).not.toContain("이것은 주의해야 할 실수입니다.");
      const toggleBtn = container.querySelector('button[aria-expanded="false"]');
      expect(toggleBtn).not.toBeNull();

      // Click to expand
      await act(async () => {
        toggleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(container.textContent).toContain("이것은 주의해야 할 실수입니다.");
      expect(container.querySelector('button[aria-expanded="true"]')).not.toBeNull();

      // Click to collapse again
      await act(async () => {
        toggleBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(container.textContent).not.toContain("이것은 주의해야 할 실수입니다.");
    });

    it("1.6 Handles extremely long headline (5,000 chars) and guidance (10,000 chars) without crashing", async () => {
      const hugeHeadline = "대형헤드라인_".repeat(700); // ~5,600 chars
      const hugeGuidance = "긴상세안내문구_".repeat(1200); // ~10,800 chars

      await renderWithProvider(
        <FieldCoachBanner
          headline={hugeHeadline}
          guidance={hugeGuidance}
          sampleText="예시 텍스트"
        />
      );

      const banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain("대형헤드라인_");
      expect(banner?.textContent).toContain("긴상세안내문구_");
    });

    it("1.7 Rapid multiple clicks on sample button queue safely without corruption", async () => {
      const applyMock = vi.fn();
      await renderWithProvider(
        <FieldCoachBanner
          headline="클릭 스트레스 테스트"
          sampleText="테스트 예시"
          onApplySample={applyMock}
        />
      );

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(sampleBtn).not.toBeNull();

      // Rapidly click 20 times in succession
      await act(async () => {
        for (let i = 0; i < 20; i++) {
          sampleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      });

      expect(applyMock).toHaveBeenCalledTimes(20);
      expect(mockToast.success).toHaveBeenCalledTimes(20);
      expect(sampleBtn.textContent).toContain("적용 완료!");

      // Fast forward past the 2500ms timeout
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      // Returns to original label
      expect(sampleBtn.textContent).toContain("1초 예시 채우기");
    });

    it("1.8 Handles missing clipboard API gracefully with toast.error when copySample=true", async () => {
      // Intentionally break navigator.clipboard
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <FieldCoachBanner
          headline="클립보드 누락 테스트"
          sampleText="복사할 텍스트"
          copySample={true}
        />
      );

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(sampleBtn).not.toBeNull();

      await act(async () => {
        sampleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mockToast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });

    it("1.9 Handles clipboard promise rejection gracefully with toast.error", async () => {
      const rejectingClipboard = {
        writeText: vi.fn().mockRejectedValue(new Error("Clipboard write permission denied")),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: rejectingClipboard,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <FieldCoachBanner
          headline="클립보드 거부 테스트"
          sampleText="복사할 텍스트"
          copySample={true}
        />
      );

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;

      await act(async () => {
        sampleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mockToast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });

    it("1.10 Unmounting while copied timeout is pending does not crash or throw unhandled exceptions", async () => {
      const applyMock = vi.fn();
      await renderWithProvider(
        <FieldCoachBanner
          headline="언마운트 테스트"
          sampleText="예시"
          onApplySample={applyMock}
        />
      );

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      await act(async () => {
        sampleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Unmount before timeout finishes
      await act(async () => {
        root.unmount();
      });

      // Advance timers
      expect(() => {
        vi.advanceTimersByTime(3000);
      }).not.toThrow();
    });

    it("1.11 Returns null when helperEnabled is false", async () => {
      await renderWithProvider(
        <FieldCoachBanner headline="헤드라인" sampleText="예시" />,
        false // disabled
      );

      expect(container.innerHTML).toBe("");
    });
  });

  // =========================================================================
  // SECTION 2: QuickFeedbackReportModal Adversarial & Stress Probes
  // =========================================================================
  describe("2. QuickFeedbackReportModal Adversarial Stress", () => {
    it("2.1 Pathname resolver handles exhaustive boundary cases and precedence correctly", () => {
      // Boundary empty/null/unusual inputs
      expect(resolveScreenNameFromPathname("")).toBe("기타 화면");
      expect(resolveScreenNameFromPathname("/unknown/path")).toBe("기타 화면");

      // Exact match
      expect(resolveScreenNameFromPathname("/broker")).toContain("홈 화면");

      // Precedence: /im-lite must precede /broker/buildings
      expect(resolveScreenNameFromPathname("/broker/buildings/bld-999/im-lite")).toContain("IM 완성 검수");
      expect(resolveScreenNameFromPathname("/broker/buildings")).toContain("내 물건 보관함");

      // Other routes
      expect(resolveScreenNameFromPathname("/broker/deal-card/new")).toContain("1분 딜카드 신규 등록");
      expect(resolveScreenNameFromPathname("/broker/deal-card/bld-100")).toContain("1분 딜카드 상세");
      expect(resolveScreenNameFromPathname("/broker/basic-im-studio")).toContain("Basic IM");
      expect(resolveScreenNameFromPathname("/broker/im-approval/bld-2")).toContain("IM 검토");
      expect(resolveScreenNameFromPathname("/broker/clients")).toContain("고객 명단");
      expect(resolveScreenNameFromPathname("/broker/inbox")).toContain("소통 관리함");
      expect(resolveScreenNameFromPathname("/broker/profile")).toContain("중개사 프로필");
      expect(resolveScreenNameFromPathname("/broker/magazine-editor")).toContain("주간 고객 소식지");
      expect(resolveScreenNameFromPathname("/broker/tutorial")).toContain("사용 설명서");
    });

    it("2.2 Returns null when isOpen=false and leaves zero DOM footprint", async () => {
      await renderWithProvider(
        <QuickFeedbackReportModal isOpen={false} onClose={vi.fn()} />
      );

      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(0);
    });

    it("2.3 Rapid open/close toggles (50 cycles) leave zero zombie portal nodes in document.body", async () => {
      const onClose = vi.fn();

      for (let i = 0; i < 50; i++) {
        // Open
        await act(async () => {
          root.render(
            <SeniorHelpProvider>
              <QuickFeedbackReportModal isOpen={true} onClose={onClose} />
            </SeniorHelpProvider>
          );
        });

        const dialogOpen = document.body.querySelectorAll('[role="dialog"]');
        expect(dialogOpen.length).toBe(1);

        // Close
        await act(async () => {
          root.render(
            <SeniorHelpProvider>
              <QuickFeedbackReportModal isOpen={false} onClose={onClose} />
            </SeniorHelpProvider>
          );
        });

        const dialogClosed = document.body.querySelectorAll('[role="dialog"]');
        expect(dialogClosed.length).toBe(0);
      }

      // Final check: exactly 0 zombie dialog nodes
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(0);
    });

    it("2.4 Missing clipboard API handles copy click gracefully without crashing", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <QuickFeedbackReportModal
          isOpen={true}
          onClose={vi.fn()}
          buildingId="bld-fail-test"
        />
      );

      const copyBtn = document.body.querySelector('[data-testid="copy-feedback-report-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      await act(async () => {
        copyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mockToast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });

    it("2.5 Clipboard rejection handles copy click gracefully without unhandled rejection", async () => {
      const rejectingClipboard = {
        writeText: vi.fn().mockRejectedValue(new Error("OS Clipboard locked")),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: rejectingClipboard,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <QuickFeedbackReportModal
          isOpen={true}
          onClose={vi.fn()}
        />
      );

      const copyBtn = document.body.querySelector('[data-testid="copy-feedback-report-btn"]') as HTMLButtonElement;

      await act(async () => {
        copyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mockToast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });

    it("2.6 Copies complete pre-filled 5-point report to clipboard when clipboard is available", async () => {
      let copiedText = "";
      const successfulClipboard = {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        }),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: successfulClipboard,
        configurable: true,
        writable: true,
      });

      mockPathname = "/broker/buildings/bld-sample/im-lite";

      await renderWithProvider(
        <QuickFeedbackReportModal
          isOpen={true}
          onClose={vi.fn()}
          buildingId="bld-sample"
          defaultAddress="서울시 강남구 역삼동 700"
        />
      );

      const copyBtn = document.body.querySelector('[data-testid="copy-feedback-report-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      await act(async () => {
        copyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(successfulClipboard.writeText).toHaveBeenCalledTimes(1);
      expect(copiedText).toContain("[크리딜(CRE DealCard) 중개인 현장 피드백 / 개선 요청]");
      expect(copiedText).toContain("2. 작업 중이던 매물 주소(지번): 서울시 강남구 역삼동 700");
      expect(copiedText).toContain("3. 관련 화면: [O] 📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)");
      expect(mockToast.success).toHaveBeenCalledWith(expect.stringContaining("✅ 제보 양식이 복사되었습니다!"));
    });

    it("2.7 Escape key dismisses modal when open, and cleans up listener when closed", async () => {
      const onClose = vi.fn();
      await renderWithProvider(
        <QuickFeedbackReportModal isOpen={true} onClose={onClose} />
      );

      // Press Escape while open
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(onClose).toHaveBeenCalledTimes(1);

      // Now set isOpen to false
      await renderWithProvider(
        <QuickFeedbackReportModal isOpen={false} onClose={onClose} />
      );

      // Press Escape again while closed
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      // onClose should NOT be called again
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("2.8 Form inputs accept user typing and updates copied payload", async () => {
      let copiedText = "";
      const successfulClipboard = {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        }),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: successfulClipboard,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <QuickFeedbackReportModal isOpen={true} onClose={vi.fn()} />
      );

      const textareas = document.body.querySelectorAll("textarea");
      const inputs = document.body.querySelectorAll("input");

      const nativeInputSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;

      // brokerName is inputs[0], complaintText is textareas[0]
      await act(async () => {
        nativeInputSetter?.call(inputs[0], "역삼공인중개사사무소 박대표");
        inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
        inputs[0].dispatchEvent(new Event("change", { bubbles: true }));

        nativeTextareaSetter?.call(textareas[0], "글자 크기가 조금 더 컸으면 좋겠습니다.");
        textareas[0].dispatchEvent(new Event("input", { bubbles: true }));
        textareas[0].dispatchEvent(new Event("change", { bubbles: true }));
      });

      const copyBtn = document.body.querySelector('[data-testid="copy-feedback-report-btn"]') as HTMLButtonElement;
      await act(async () => {
        copyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(copiedText).toContain("역삼공인중개사사무소 박대표");
      expect(copiedText).toContain("글자 크기가 조금 더 컸으면 좋겠습니다.");
    });
  });

  // =========================================================================
  // SECTION 3: KakaoTemplatePicker Adversarial & Stress Probes
  // =========================================================================
  describe("3. KakaoTemplatePicker Adversarial Stress", () => {
    it("3.1 Missing buildingId and undefined props copies clean message body without 'undefined' or broken link", async () => {
      let copiedText = "";
      const successfulClipboard = {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        }),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: successfulClipboard,
        configurable: true,
        writable: true,
      });

      // Render with completely undefined props
      await renderWithProvider(<KakaoTemplatePicker />);

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      expect(triggerBtn).not.toBeNull();

      // Open modal
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      // Should not include '(링크 자동 포함)' in header when buildingId is absent
      expect(dialog?.textContent).not.toContain("(링크 자동 포함)");

      // Find first template copy button (without dealUrl it should say "📋 인사말 1초 복사")
      const copyButtons = dialog?.querySelectorAll("button");
      const templateCopyBtn = Array.from(copyButtons || []).find((b) =>
        b.textContent?.includes("인사말 1초 복사")
      );
      expect(templateCopyBtn).toBeDefined();

      await act(async () => {
        templateCopyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(successfulClipboard.writeText).toHaveBeenCalled();
      // Crucial assertion: copied text must NOT contain "undefined", "null", or broken link
      expect(copiedText).not.toContain("undefined");
      expect(copiedText).not.toContain("null");
      expect(copiedText).not.toContain("🔗 매물 딜카드 바로 보기:");
      expect(copiedText).toBe(BROKER_MESSAGE_TEMPLATES[0].body);

      // Toast must indicate body only
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining("카톡 인사말이 복사되었습니다!")
      );
      expect(mockToast.success).not.toHaveBeenCalledWith(
        expect.stringContaining("매물 링크가 함께")
      );
    });

    it("3.2 Valid buildingId appends proper URL and customizes button and toast", async () => {
      let copiedText = "";
      const successfulClipboard = {
        writeText: vi.fn().mockImplementation((text: string) => {
          copiedText = text;
          return Promise.resolve();
        }),
      };
      Object.defineProperty(navigator, "clipboard", {
        value: successfulClipboard,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(
        <KakaoTemplatePicker buildingId="bld-gangnam-01" />
      );

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain("(링크 자동 포함)");

      const templateCopyBtn = Array.from(dialog?.querySelectorAll("button") || []).find((b) =>
        b.textContent?.includes("인사말 + 딜카드 링크 한 번에 복사")
      );
      expect(templateCopyBtn).toBeDefined();

      await act(async () => {
        templateCopyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(copiedText).toContain("🔗 매물 딜카드 바로 보기:");
      expect(copiedText).toContain("/dc/bld-gangnam-01");
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining("카톡 인사말과 매물 링크가 함께 복사되었습니다!")
      );
    });

    it("3.3 defaultTemplateId='tpl-06' properly displays recommendation badge", async () => {
      await renderWithProvider(
        <KakaoTemplatePicker defaultTemplateId="tpl-06" />
      );

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain("⭐ 지금 추천");
    });

    it("3.4 Nonexistent defaultTemplateId does not crash and renders zero recommendation badges", async () => {
      await renderWithProvider(
        <KakaoTemplatePicker defaultTemplateId="tpl-nonexistent-99" />
      );

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).not.toContain("⭐ 지금 추천");
    });

    it("3.5 Missing clipboard API handles copy failure gracefully with toast.error", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      await renderWithProvider(<KakaoTemplatePicker />);

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      const dialog = document.body.querySelector('[role="dialog"]');
      const copyBtn = dialog?.querySelector("button:not([class*='bg-slate-100'])");

      await act(async () => {
        copyBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(mockToast.error).toHaveBeenCalledWith("복사에 실패했습니다. 다시 시도해 주세요.");
    });

    it("3.6 Escape key and backdrop click dismiss modal, while dialog content click is preserved", async () => {
      await renderWithProvider(<KakaoTemplatePicker />);

      const triggerBtn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;

      // Open
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);

      // Click inside dialog (should NOT close due to stopPropagation)
      const dialog = document.body.querySelector('[role="dialog"]');
      await act(async () => {
        dialog?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);

      // Press Escape -> closes
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(0);

      // Open again
      await act(async () => {
        triggerBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);

      // Click backdrop -> closes
      const backdrop = document.body.querySelector(".fixed.inset-0");
      await act(async () => {
        backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(0);
    });

    it("3.7 Returns null when helperEnabled is false", async () => {
      await renderWithProvider(<KakaoTemplatePicker />, false);
      expect(container.innerHTML).toBe("");
    });
  });
});
