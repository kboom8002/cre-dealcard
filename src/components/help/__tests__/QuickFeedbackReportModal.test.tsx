// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
  QuickFeedbackReportModal,
  resolveScreenNameFromPathname,
} from "../QuickFeedbackReportModal";
import { BROKER_FEEDBACK_SYSTEM_GUIDE } from "@/lib/tutorial/broker-tutorial-data";
import { toast } from "sonner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockedPathname = "/broker";

vi.mock("next/navigation", () => ({
  usePathname: () => mockedPathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("QuickFeedbackReportModal", () => {
  let root: Root;
  let container: HTMLDivElement;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockedPathname = "/broker";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: writeTextMock,
        readText: vi.fn().mockResolvedValue(""),
      },
      writable: true,
      configurable: true,
    });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("resolveScreenNameFromPathname", () => {
    it("maps all 12+ broker routes accurately with /im-lite precedence over /broker/buildings", () => {
      expect(resolveScreenNameFromPathname("")).toBe("기타 화면");
      expect(resolveScreenNameFromPathname("/broker")).toBe("🏠 홈 화면 (대시보드 · 퀵액션 · 알림)");
      expect(resolveScreenNameFromPathname("/broker/deal-card/new")).toBe("➕ 1분 딜카드 신규 등록 (카톡 메모 입력)");
      expect(resolveScreenNameFromPathname("/broker/deal-card/dc-sample-1")).toBe("📱 1분 딜카드 상세 · 수신자 블라인드 화면 · 카톡 공유");
      
      // Crucial precedence test: /im-lite inside /broker/buildings/[id]/im-lite
      expect(resolveScreenNameFromPathname("/broker/buildings/bldg-99/im-lite")).toBe("📊 IM 완성 검수 · 웹 뷰어 (완성도 80점 점검)");
      
      expect(resolveScreenNameFromPathname("/broker/buildings")).toBe("🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)");
      expect(resolveScreenNameFromPathname("/broker/buildings/bldg-99")).toBe("🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)");
      expect(resolveScreenNameFromPathname("/broker/basic-im-studio/bldg-99")).toBe("🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)");
      expect(resolveScreenNameFromPathname("/broker/im-approval/bldg-99")).toBe("✏️ IM 검토 · 공개 승인 · 사진 역할 큐레이션");
      expect(resolveScreenNameFromPathname("/broker/clients")).toBe("👥 고객 명단 · 구독 관리 (VIP/일반/잠재)");
      expect(resolveScreenNameFromPathname("/broker/inbox")).toBe("🔔 소통 관리함 (열람 알림 · G1~G3 게이트 요청)");
      expect(resolveScreenNameFromPathname("/broker/profile")).toBe("👤 중개사 프로필 · 디지털 명함 설정");
      expect(resolveScreenNameFromPathname("/broker/magazine-editor")).toBe("📰 주간 고객 소식지 간편 발행");
      expect(resolveScreenNameFromPathname("/broker/tutorial")).toBe("📖 60대 중개인 큰글씨 사용 설명서");
      expect(resolveScreenNameFromPathname("/other/random")).toBe("기타 화면");
    });
  });

  describe("Modal Visibility & Dismissal Mechanics", () => {
    it("renders strictly null when isOpen is false", async () => {
      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={false} onClose={vi.fn()} />);
      });

      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it("renders into document.body when isOpen is true with readable header and badges", async () => {
      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={vi.fn()} />);
      });

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("10초 현장 불편 제보 · 개선 요청");
      expect(dialog?.textContent).toContain("🛠️ 현장 소통 창구");
    });

    it("calls onClose when [✕ 닫기] button is clicked", async () => {
      const handleClose = vi.fn();

      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={handleClose} />);
      });

      const closeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("✕ 닫기")
      );
      expect(closeBtn).toBeDefined();

      await act(async () => {
        closeBtn?.click();
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", async () => {
      const handleClose = vi.fn();

      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={handleClose} />);
      });

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when clicking backdrop overlay, but not dialog card", async () => {
      const handleClose = vi.fn();

      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={handleClose} />);
      });

      const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;

      // Click inside dialog
      await act(async () => {
        dialog.click();
      });
      expect(handleClose).not.toHaveBeenCalled();

      // Click backdrop
      await act(async () => {
        backdrop.click();
      });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Automatic Pathname Detection & 1-Click Report Generation", () => {
    it("pre-fills screen and address based on pathname and props", async () => {
      mockedPathname = "/broker/buildings/bldg-sample/im-lite";

      await act(async () => {
        root.render(
          <QuickFeedbackReportModal
            isOpen={true}
            onClose={vi.fn()}
            buildingId="bldg-sample"
            defaultAddress="서울 마포구 서교동 395"
          />
        );
      });

      const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
      const screenInput = inputs.find((i) =>
        i.value.includes("IM 완성 검수 · 웹 뷰어")
      );
      const addressInput = inputs.find((i) =>
        i.value.includes("서울 마포구 서교동 395")
      );

      expect(screenInput).toBeDefined();
      expect(addressInput).toBeDefined();
    });

    it("formats 5-point report and copies to clipboard on button click", async () => {
      mockedPathname = "/broker/buildings";

      await act(async () => {
        root.render(
          <QuickFeedbackReportModal
            isOpen={true}
            onClose={vi.fn()}
            buildingId="bldg-777"
            defaultAddress="서울 강남구 역삼동 600"
          />
        );
      });

      const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
      const brokerNameInput = inputs[0]; // 1. 작성자
      const addressInput = inputs[1]; // 2. 매물 주소
      const complaintTextarea = document.querySelector("textarea") as HTMLTextAreaElement; // 4. 불편 사항
      const improvementInput = inputs[3]; // 5. 희망 개선

      function setInputValue(input: HTMLInputElement, val: string) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, val);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function setTextareaValue(textarea: HTMLTextAreaElement, val: string) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(textarea, val);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }

      await act(async () => {
        setInputValue(brokerNameInput, "대성공인중개사 박대표");
        setTextareaValue(complaintTextarea, "검색 시 역세권 필터 반응이 1초 지연됩니다.");
        setInputValue(improvementInput, "검색 버튼 누르지 않아도 즉시 필터링되면 좋겠습니다.");
      });

      const copyBtn = document.querySelector(
        '[data-testid="copy-feedback-report-btn"]'
      ) as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      await act(async () => {
        copyBtn.click();
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copiedPayload = writeTextMock.mock.calls[0][0] as string;

      expect(copiedPayload).toContain("[크리딜(CRE DealCard) 중개인 현장 피드백 / 개선 요청]");
      expect(copiedPayload).toContain("1. 작성자(중개사무소 / 성함): 대성공인중개사 박대표");
      expect(copiedPayload).toContain("2. 작업 중이던 매물 주소(지번): 서울 강남구 역삼동 600");
      expect(copiedPayload).toContain("3. 관련 화면: [O] 🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)");
      expect(copiedPayload).toContain("4. 현장 불편 사항 또는 개선 건의 내용:");
      expect(copiedPayload).toContain("무엇이 불편하셨나요?: 검색 시 역세권 필터 반응이 1초 지연됩니다.");
      expect(copiedPayload).toContain("어떻게 바뀌면 좋겠나요?: 검색 버튼 누르지 않아도 즉시 필터링되면 좋겠습니다.");
      expect(copiedPayload).toContain("5. 접수 일시 및 경로:");
      expect(copiedPayload).toContain("/broker/buildings");

      expect(copyBtn.textContent).toContain("✅ 1초 복사 완료!");
      expect(toast.success).toHaveBeenCalledWith(
        "✅ 제보 양식이 복사되었습니다! 카톡이나 메일로 붙여넣기(Ctrl+V) 하세요."
      );
    });

    it("handles clipboard write rejection gracefully", async () => {
      writeTextMock.mockRejectedValueOnce(new Error("Clipboard blocked"));

      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={vi.fn()} />);
      });

      const copyBtn = document.querySelector(
        '[data-testid="copy-feedback-report-btn"]'
      ) as HTMLButtonElement;

      await act(async () => {
        copyBtn.click();
      });

      expect(toast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });
  });

  describe("Reflected Field Examples Rendering", () => {
    it("renders all real broker improvement examples from BROKER_FEEDBACK_SYSTEM_GUIDE", async () => {
      await act(async () => {
        root.render(<QuickFeedbackReportModal isOpen={true} onClose={vi.fn()} />);
      });

      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain("대표님들의 피드백으로 개선된 실제 사례");

      for (const example of BROKER_FEEDBACK_SYSTEM_GUIDE.reflectedExamples) {
        expect(dialog?.textContent).toContain(example.brokerVoice);
        expect(dialog?.textContent).toContain(example.systemSolution);
      }
    });
  });
});
