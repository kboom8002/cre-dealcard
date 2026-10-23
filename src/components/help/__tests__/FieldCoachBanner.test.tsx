// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { FieldCoachBanner } from "../FieldCoachBanner";
import { SeniorHelpProvider } from "../SeniorHelpContext";
import { toast } from "sonner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("FieldCoachBanner", () => {
  let root: Root;
  let container: HTMLDivElement;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
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

  describe("Rendering & Variant Styles", () => {
    it("renders headline and guidance text", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="💡 10초 메모 작성 코칭"
              guidance="매물 메모에 지번과 층별 보증금을 한 줄씩 적어주세요."
            />
          </SeniorHelpProvider>
        );
      });

      const banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain("💡 10초 메모 작성 코칭");
      expect(banner?.textContent).toContain("매물 메모에 지번과 층별 보증금을 한 줄씩 적어주세요.");
    });

    it("applies correct variant styles for amber, blue, emerald, and paper", async () => {
      // 1. amber
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner headline="Amber Variant" variant="amber" />
          </SeniorHelpProvider>
        );
      });
      let banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner?.className).toContain("bg-[#FFFBEB]");

      // 2. blue
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner headline="Blue Variant" variant="blue" />
          </SeniorHelpProvider>
        );
      });
      banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner?.className).toContain("bg-blue-50/80");

      // 3. emerald
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner headline="Emerald Variant" variant="emerald" />
          </SeniorHelpProvider>
        );
      });
      banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner?.className).toContain("bg-emerald-50/80");

      // 4. paper
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner headline="Paper Variant" variant="paper" />
          </SeniorHelpProvider>
        );
      });
      banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner?.className).toContain("bg-white");
    });

    it("renders optional actionExtra node", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="With Extra Action"
              actionExtra={<span data-testid="extra-badge">VIP 전용</span>}
            />
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="extra-badge"]')?.textContent).toBe("VIP 전용");
    });
  });

  describe("1-Click Sample Fill Callback", () => {
    it("calls onApplySample, updates button text to '✅ 적용 완료!', and fires toast.success", async () => {
      const applyMock = vi.fn();
      const sample = "역삼동 123-45 꼬마빌딩 85억 4.2%";

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="Sample Apply Test"
              sampleText={sample}
              sampleButtonLabel="✨ 1초 예시 채우기"
              onApplySample={applyMock}
              copyToastMessage="메모가 입력되었습니다."
            />
          </SeniorHelpProvider>
        );
      });

      const btn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.textContent).toBe("✨ 1초 예시 채우기");

      await act(async () => {
        btn.click();
      });

      expect(applyMock).toHaveBeenCalledWith(sample);
      expect(btn.textContent).toBe("✅ 적용 완료!");
      expect(toast.success).toHaveBeenCalledWith("메모가 입력되었습니다.");
    });
  });

  describe("1-Click Sample Copy Mode", () => {
    it("writes to navigator.clipboard, updates button to '✅ 복사 완료!', and triggers toast.success", async () => {
      const sample = "성수동 99-1 사옥용 나대지 150억";

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="Clipboard Copy Test"
              sampleText={sample}
              copySample={true}
              sampleButtonLabel="📋 예시 복사"
            />
          </SeniorHelpProvider>
        );
      });

      const btn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(btn.textContent).toBe("📋 예시 복사");

      await act(async () => {
        btn.click();
      });

      expect(writeTextMock).toHaveBeenCalledWith(sample);
      expect(btn.textContent).toBe("✅ 복사 완료!");
      expect(toast.success).toHaveBeenCalledWith(
        "✅ 예시가 복사되었습니다! 필요한 곳에 붙여넣기(Ctrl+V) 하세요."
      );
    });

    it("triggers toast.error when clipboard write fails", async () => {
      writeTextMock.mockRejectedValueOnce(new Error("Clipboard permission denied"));

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="Clipboard Failure Test"
              sampleText="에러 유발 텍스트"
              copySample={true}
            />
          </SeniorHelpProvider>
        );
      });

      const btn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      await act(async () => {
        btn.click();
      });

      expect(toast.error).toHaveBeenCalledWith("복사에 실패했습니다.");
    });
  });

  describe("Collapsible Mistake Warning", () => {
    it("renders mistake warning expanded by default and toggles on click", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="Mistake Warning Test"
              mistakeWarning="금액 단위(천원 vs 원)를 반드시 확인하세요."
            />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("⚠️ 잠깐! 자주 하는 실수");
      expect(container.textContent).toContain("금액 단위(천원 vs 원)를 반드시 확인하세요.");
      expect(container.textContent).toContain("접기 ▲");

      const toggleBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("⚠️ 잠깐! 자주 하는 실수")
      );
      expect(toggleBtn).toBeDefined();

      // Collapse
      await act(async () => {
        toggleBtn?.click();
      });

      expect(container.textContent).toContain("펼치기 ▼");
      expect(container.textContent).not.toContain("금액 단위(천원 vs 원)를 반드시 확인하세요.");

      // Re-expand
      await act(async () => {
        toggleBtn?.click();
      });

      expect(container.textContent).toContain("접기 ▲");
      expect(container.textContent).toContain("금액 단위(천원 vs 원)를 반드시 확인하세요.");
    });

    it("respects defaultMistakeCollapsed=true to start collapsed", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="Collapsed Start Test"
              mistakeWarning="초기 접힘 테스트"
              defaultMistakeCollapsed={true}
            />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("⚠️ 잠깐! 자주 하는 실수");
      expect(container.textContent).toContain("펼치기 ▼");
      expect(container.textContent).not.toContain("초기 접힘 테스트");
    });
  });

  describe("Global Helper Disabled Guard", () => {
    it("renders strictly null when helperEnabled is false", async () => {
      window.localStorage.setItem("credeal-senior-helper-enabled", "false");

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner headline="Hidden Banner" />
          </SeniorHelpProvider>
        );
      });

      expect(container.children.length).toBe(0);
      expect(container.innerHTML).toBe("");
    });
  });
});
