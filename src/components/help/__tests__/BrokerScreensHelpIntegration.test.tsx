// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { BrokerSeniorLayout } from "@/components/layout/BrokerSeniorLayout";
import { FieldCoachBanner } from "../FieldCoachBanner";
import { SeniorTermTooltip, BUILTIN_TERMS } from "../SeniorTermTooltip";
import { KakaoTemplatePicker } from "../KakaoTemplatePicker";
import { BrokerHomeCoachBanner } from "@/app/(broker)/broker/_components/BrokerHomeCoachBanner";
import { SeniorHelpProvider } from "../SeniorHelpContext";
import { BROKER_MESSAGE_TEMPLATES } from "@/lib/tutorial/broker-tutorial-data";
import { toast } from "sonner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let currentPathname = "/broker";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
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

vi.mock("motion/react", () => ({
  motion: {
    div: ({ children, layoutId, whileHover, whileTap, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, layoutId, whileHover, whileTap, transition, ...props }: any) => (
      <span {...props}>{children}</span>
    ),
    button: ({ children, layoutId, whileHover, whileTap, transition, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("BrokerScreensHelpIntegration", () => {
  let root: Root;
  let container: HTMLDivElement;
  let writeTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    currentPathname = "/broker";
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

  describe("BrokerSeniorLayout Global Helper Toggle Integration", () => {
    it("renders topbar buttons: contextual help, feedback modal, and helper toggle", async () => {
      await act(async () => {
        root.render(
          <BrokerSeniorLayout>
            <div data-testid="page-content">Broker Content</div>
          </BrokerSeniorLayout>
        );
      });

      const contextualHelpBtn = container.querySelector('[data-testid="broker-contextual-help-btn"]');
      const feedbackBtn = container.querySelector('[data-testid="broker-feedback-btn"]');
      const toggleBtn = container.querySelector('[data-testid="broker-helper-toggle-btn"]');

      expect(contextualHelpBtn).not.toBeNull();
      expect(contextualHelpBtn?.textContent).toContain("🎬 이 화면 20초 사용법");

      expect(feedbackBtn).not.toBeNull();
      expect(feedbackBtn?.textContent).toContain("🛠️ 10초 불편 제보");

      expect(toggleBtn).not.toBeNull();
      expect(toggleBtn?.textContent).toContain("💡 친절 도우미 (켜짐)");
    });

    it("toggling helperEnabled=false hides inline banners/tooltips while preserving topbar actions", async () => {
      await act(async () => {
        root.render(
          <BrokerSeniorLayout>
            <div data-testid="test-screen-area">
              <FieldCoachBanner
                headline="화면 입력 코칭"
                guidance="입력창 가이드"
              />
              <SeniorTermTooltip
                termKey="1분 딜카드"
                buttonLabel="❓ 딜카드 도움말"
              />
            </div>
          </BrokerSeniorLayout>
        );
      });

      // Initially enabled
      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      expect(container.querySelector('button[data-testid="senior-tooltip-trigger-1분 딜카드"]')).not.toBeNull();

      const toggleBtn = container.querySelector('[data-testid="broker-helper-toggle-btn"]') as HTMLButtonElement;
      expect(toggleBtn.textContent).toContain("💡 친절 도우미 (켜짐)");

      // Toggle off
      await act(async () => {
        toggleBtn.click();
      });

      expect(toggleBtn.textContent).toContain("💡 도우미 (꺼짐)");
      expect(container.querySelector('[data-testid="field-coach-banner"]')).toBeNull();
      expect(container.querySelector('button[data-testid="senior-tooltip-trigger-1분 딜카드"]')).toBeNull();

      // Topbar help and feedback buttons MUST remain visible and operational!
      const helpBtn = container.querySelector('[data-testid="broker-contextual-help-btn"]') as HTMLButtonElement;
      const feedbackBtn = container.querySelector('[data-testid="broker-feedback-btn"]') as HTMLButtonElement;
      expect(helpBtn).not.toBeNull();
      expect(feedbackBtn).not.toBeNull();

      // Open feedback modal even when inline helper is off
      await act(async () => {
        feedbackBtn.click();
      });
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();

      // Close modal
      const closeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("✕ 닫기")
      );
      await act(async () => {
        closeBtn?.click();
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();

      // Toggle back on
      await act(async () => {
        toggleBtn.click();
      });
      expect(toggleBtn.textContent).toContain("💡 친절 도우미 (켜짐)");
      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      expect(container.querySelector('button[data-testid="senior-tooltip-trigger-1분 딜카드"]')).not.toBeNull();
    });
  });

  describe("Broker Home Screen Integration: BrokerHomeCoachBanner", () => {
    it("renders 3-tier completion time coaching with 1-click tip copy", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <BrokerHomeCoachBanner />
          </SeniorHelpProvider>
        );
      });

      const banner = container.querySelector('[data-testid="field-coach-banner"]');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain("1분 딜카드 · 3분 기본 IM · 5분 주간 소식지");
      expect(banner?.textContent).toContain("첫 카톡 접촉용 블라인드 티저");
      expect(banner?.textContent).toContain("매수 결정용 12면 정식 투자설명서");
      expect(banner?.textContent).toContain("매주 월요일 안부와 추천 매물");

      const copyBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      expect(copyBtn.textContent).toContain("📋 3대 산출물 활용 팁 복사");

      await act(async () => {
        copyBtn.click();
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copiedText = writeTextMock.mock.calls[0][0] as string;
      expect(copiedText).toContain("[크리딜 3대 산출물 1초 활용 요령]");
      expect(copiedText).toContain("1. 첫 고객 접촉: 지번이 보호된 '1분 딜카드'");
      expect(toast.success).toHaveBeenCalledWith("✅ 3대 산출물 활용 팁이 복사되었습니다!");
    });
  });

  describe("KakaoTemplatePicker Integration (Inbox & Client Follow-up)", () => {
    it("opens template picker modal, presents 6 templates, and copies template tpl-06 with deal link", async () => {
      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <KakaoTemplatePicker
              buildingId="bldg-star-101"
              defaultTemplateId="tpl-06"
              buttonLabel="💬 팔로업 카톡 멘트 복사"
            />
          </SeniorHelpProvider>
        );
      });

      const triggerBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("💬 팔로업 카톡 멘트 복사")
      );
      expect(triggerBtn).toBeDefined();

      // Open picker
      await act(async () => {
        triggerBtn?.click();
      });

      const modal = document.querySelector('[role="dialog"]');
      expect(modal).not.toBeNull();
      expect(modal?.textContent).toContain("상황별 카카오톡 발송 인사말 6선");

      // Check all 6 templates are rendered
      for (const tpl of BROKER_MESSAGE_TEMPLATES) {
        expect(modal?.textContent).toContain(tpl.situation);
      }

      // Copy tpl-06 (3회 이상 열람 안부 팔로업)
      const tpl06Card = Array.from(document.querySelectorAll("div.rounded-2xl.border")).find(
        (el) => el.textContent?.includes("상황 6")
      );
      expect(tpl06Card).toBeDefined();

      const tpl06CopyBtn = tpl06Card?.querySelector("button");
      expect(tpl06CopyBtn).toBeDefined();

      await act(async () => {
        tpl06CopyBtn?.click();
      });

      expect(writeTextMock).toHaveBeenCalledTimes(1);
      const copied = writeTextMock.mock.calls[0][0] as string;
      expect(copied).toContain("🔗 매물 딜카드 바로 보기:");
      expect(copied).toContain("/dc/bldg-star-101");
      expect(toast.success).toHaveBeenCalled();

      // Close modal
      const closeBtn = Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("✕ 닫기")
      );
      await act(async () => {
        closeBtn?.click();
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it("returns null when helperEnabled is false", async () => {
      window.localStorage.setItem("credeal-senior-helper-enabled", "false");

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <KakaoTemplatePicker buildingId="bldg-test" />
          </SeniorHelpProvider>
        );
      });

      expect(container.innerHTML).toBe("");
    });
  });

  describe("Target Broker Screens Help Component Mapping", () => {
    it("renders Buildings Vault help components with verified termKeys", async () => {
      const keys = ["딜카드", "모바일 IM", "완성도 점수", "권역/유형/가격 검색 팁", "안전한 삭제 규칙"];

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="buildings-vault-help">
              <FieldCoachBanner
                headline="🏢 내 물건 보관함 10초 코칭"
                guidance="[딜카드] 탭은 첫 상담용 요약본이고, [모바일 IM] 탭은 정식 12면 제안서입니다."
              />
              {keys.map((k) => (
                <SeniorTermTooltip key={k} termKey={k} buttonLabel={k} />
              ))}
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      for (const k of keys) {
        const btn = container.querySelector(`button[data-testid="senior-tooltip-trigger-${k}"]`);
        expect(btn, `Missing button for key: ${k}`).not.toBeNull();
        expect(BUILTIN_TERMS[k]).toBeDefined();
      }
    });

    it("renders IM Lite & Approval help components with verified termKeys", async () => {
      const keys = ["필수 데이터 4항목", "준비도 점수", "외관/대표 사진", "완성도 점수"];

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="im-lite-help">
              <FieldCoachBanner
                headline="📊 IM 완성 검수 10초 코칭"
                guidance="완성도 80점 이상 충족 시 정식 PPTX 및 모바일 IM이 자동 발행됩니다."
              />
              {keys.map((k) => (
                <SeniorTermTooltip key={k} termKey={k} buttonLabel={k} />
              ))}
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      for (const k of keys) {
        const btn = container.querySelector(`button[data-testid="senior-tooltip-trigger-${k}"]`);
        expect(btn, `Missing button for key: ${k}`).not.toBeNull();
        expect(BUILTIN_TERMS[k]).toBeDefined();
      }
    });

    it("renders Clients Screen help components with verified termKeys", async () => {
      const keys = ["고객 유형(매도/매수/양쪽)", "고객 등급(VIP/잠재)", "딜 매칭 연동", "소식지 구독 연동"];

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="clients-help">
              <FieldCoachBanner
                headline="👥 고객 명단 등록 10초 코칭"
                guidance="매수자 희망 가격대와 관심 지역을 입력해 두시면 새 물건 등록 시 1초 만에 매칭 알림이 뜹니다."
              />
              {keys.map((k) => (
                <SeniorTermTooltip key={k} termKey={k} buttonLabel={k} />
              ))}
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      for (const k of keys) {
        const btn = container.querySelector(`button[data-testid="senior-tooltip-trigger-${k}"]`);
        expect(btn, `Missing button for key: ${k}`).not.toBeNull();
        expect(BUILTIN_TERMS[k]).toBeDefined();
      }
    });

    it("renders Inbox Screen help components with verified termKeys", async () => {
      const keys = ["G1~G3 비밀유지 승인", "열람 온도(3회 이상 열람)"];

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="inbox-help">
              <FieldCoachBanner
                headline="🔔 소통 관리함 10초 코칭"
                guidance="열람 3회 이상 알림이 뜨면 10분 이내에 팔로업 메시지를 보내보세요."
              />
              {keys.map((k) => (
                <SeniorTermTooltip key={k} termKey={k} buttonLabel={k} />
              ))}
              <KakaoTemplatePicker defaultTemplateId="tpl-06" />
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      for (const k of keys) {
        const btn = container.querySelector(`button[data-testid="senior-tooltip-trigger-${k}"]`);
        expect(btn, `Missing button for key: ${k}`).not.toBeNull();
        expect(BUILTIN_TERMS[k]).toBeDefined();
      }
    });

    it("renders Profile Screen help components with verified termKeys", async () => {
      const keys = [
        "대표자 성함 인쇄 위치",
        "직통 연락처 인쇄 위치",
        "중개법인 상호 인쇄 위치",
        "개설등록번호 인쇄 위치",
        "프로필 사진 인쇄 위치",
        "공인중개사 자격증 번호",
      ];

      await act(async () => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="profile-help">
              <FieldCoachBanner
                headline="👤 중개사 프로필 설정 10초 코칭"
                guidance="여기서 입력하신 상호, 대표자 성함, 개설등록번호는 모든 PPTX 제안서 표지와 슬라이드에 자동 인쇄됩니다."
              />
              {keys.map((k) => (
                <SeniorTermTooltip key={k} termKey={k} buttonLabel={k} />
              ))}
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="field-coach-banner"]')).not.toBeNull();
      for (const k of keys) {
        const btn = container.querySelector(`button[data-testid="senior-tooltip-trigger-${k}"]`);
        expect(btn, `Missing button for key: ${k}`).not.toBeNull();
        expect(BUILTIN_TERMS[k]).toBeDefined();
      }
    });
  });
});
