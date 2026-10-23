// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
  SeniorTermTooltip,
  BUILTIN_TERMS,
} from "../SeniorTermTooltip";
import { SeniorHelpProvider } from "../SeniorHelpContext";
import { POSTURE_GUIDE_ROWS, BROKER_GLOSSARY_LIST } from "@/lib/tutorial/broker-tutorial-data";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SeniorTermTooltip", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  describe("Built-in Terms Dictionary Integrity", () => {
    it("contains all 38 built-in terms with high-quality title, easyMeaning, and tip", () => {
      const keys = Object.keys(BUILTIN_TERMS);
      expect(keys.length).toBe(38);

      for (const [key, entry] of Object.entries(BUILTIN_TERMS)) {
        expect(entry.title, `Term [${key}] must have non-empty title`).toBeTruthy();
        expect(entry.title.length, `Term [${key}] title too short`).toBeGreaterThan(3);

        expect(entry.easyMeaning, `Term [${key}] must have non-empty easyMeaning`).toBeTruthy();
        expect(entry.easyMeaning.length, `Term [${key}] easyMeaning too short`).toBeGreaterThanOrEqual(10);

        if (entry.tip) {
          expect(entry.tip.length, `Term [${key}] tip too short`).toBeGreaterThanOrEqual(10);
        }
      }
    });

    it("verifies all newly added R3 domain keys exist in BUILTIN_TERMS", () => {
      const mandatoryKeys = [
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
        "개설등록번호 인쇄 위치",
        "프로필 사진 인쇄 위치",
        "공인중개사 자격증 번호",
        "1분 딜카드",
        "3분 기본 IM",
        "5분 주간 소식지",
        "📌 대표",
        "🏢 외관",
        "🚫 제외",
      ];

      for (const key of mandatoryKeys) {
        expect(BUILTIN_TERMS[key], `Missing mandatory key [${key}]`).toBeDefined();
        expect(BUILTIN_TERMS[key].easyMeaning).not.toContain("이 항목에 대한 쉬운 설명입니다.");
      }
    });
  });

  describe("Click-to-Pin Accessibility & UX Ergonomics", () => {
    it("renders trigger button and initially hides popover dialog", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="수신자 화면" buttonLabel="도움말" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-수신자 화면"]') as HTMLButtonElement;
      expect(trigger).not.toBeNull();
      expect(trigger.textContent).toContain("도움말");

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeNull();
    });

    it("does NOT open popover on mouseenter or mouseover (no hover-only triggers)", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="수신자 화면" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-수신자 화면"]') as HTMLButtonElement;
      trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("opens popover on click and toggles closed on second click", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="수신자 화면" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-수신자 화면"]') as HTMLButtonElement;

      // Click to open
      await act(async () => {
        trigger.click();
      });

      let dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("수신자 화면");
      expect(dialog?.textContent).toContain(BUILTIN_TERMS["수신자 화면"].easyMeaning);

      // Click again to close
      await act(async () => {
        trigger.click();
      });

      dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeNull();
    });

    it("closes popover when [✕ 닫기] button is clicked", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="수신자 화면" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-수신자 화면"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const closeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("✕ 닫기")
      );
      expect(closeBtn).toBeDefined();

      await act(async () => {
        closeBtn?.click();
      });

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("closes popover when Escape key is pressed", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="완성도 점수" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-완성도 점수"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("closes popover when clicking outside the container", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="안정화 수익률" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-안정화 수익률"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();

      // Click outside on body
      await act(async () => {
        document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("does NOT close popover when clicking inside the dialog card", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="다필지" />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-다필지"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();

      // Click inside dialog
      await act(async () => {
        dialog.click();
      });

      // Should still be open
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });

  describe("Posture Table & Action Callback", () => {
    it("renders all 5 posture rows when showPostureTable=true", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="투자 포스처" showPostureTable={true} />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-투자 포스처"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain("5가지 투자 목적별 추천 매물 한눈에 보기");

      for (const row of POSTURE_GUIDE_ROWS) {
        expect(dialog?.textContent).toContain(row.postureName);
      }
    });

    it("executes onAction callback and closes dialog when action button is clicked", async () => {
      const handleAction = vi.fn();

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip
              termKey="렌트롤 AI 변환"
              actionLabel="AI 변환 시작하기"
              onAction={handleAction}
            />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[data-testid="senior-tooltip-trigger-렌트롤 AI 변환"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const actionBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("AI 변환 시작하기")
      );
      expect(actionBtn).toBeDefined();

      await act(async () => {
        actionBtn?.click();
      });

      expect(handleAction).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe("Glossary Fallback & Custom Overrides", () => {
    it("resolves term from BROKER_GLOSSARY_LIST when omitted from BUILTIN_TERMS", async () => {
      // Find a term that exists in BROKER_GLOSSARY_LIST but not BUILTIN_TERMS
      const glossaryTerm = BROKER_GLOSSARY_LIST.find((g) => !(g.term in BUILTIN_TERMS));
      expect(glossaryTerm).toBeDefined();

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey={glossaryTerm?.term} />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[type="button"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.textContent).toContain(glossaryTerm?.easyMeaning);
    });

    it("uses custom title, easyMeaning, and tip when provided", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip
              title="커스텀 특약 안내"
              easyMeaning="대표님만을 위한 특별한 맞춤 설명입니다."
              tip="중개 시 계약서 특약 1호에 반드시 기재하세요."
            />
          </SeniorHelpProvider>
        );
      });

      const trigger = container.querySelector('button[type="button"]') as HTMLButtonElement;
      await act(async () => {
        trigger.click();
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog?.textContent).toContain("커스텀 특약 안내");
      expect(dialog?.textContent).toContain("대표님만을 위한 특별한 맞춤 설명입니다.");
      expect(dialog?.textContent).toContain("중개 시 계약서 특약 1호에 반드시 기재하세요.");
    });
  });

  describe("Global Helper Disabled Guard", () => {
    it("renders strictly null when helperEnabled is false", async () => {
      window.localStorage.setItem("credeal-senior-helper-enabled", "false");

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="수신자 화면" />
          </SeniorHelpProvider>
        );
      });

      // No elements should be rendered
      expect(container.children.length).toBe(0);
      expect(container.innerHTML).toBe("");
    });
  });
});
