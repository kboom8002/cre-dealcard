// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock sonner
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
  },
}));

// Mock next/navigation
let mockPathname = "/broker/clients";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

import { SeniorHelpProvider, useSeniorHelp } from "@/components/help/SeniorHelpContext";
import { SeniorTermTooltip, BUILTIN_TERMS } from "@/components/help/SeniorTermTooltip";
import { FieldCoachBanner } from "@/components/help/FieldCoachBanner";
import { KakaoTemplatePicker } from "@/components/help/KakaoTemplatePicker";
import {
  QuickFeedbackReportModal,
  resolveScreenNameFromPathname,
} from "@/components/help/QuickFeedbackReportModal";
import { BrokerSeniorLayout } from "@/components/layout/BrokerSeniorLayout";

describe("Milestone 3: Screens 4-6 Contextual Help & Global Layout Integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockPathname = "/broker/clients";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    localStorage.clear();
  });

  describe("1. BUILTIN_TERMS Resolution for Screens 4, 5, and 6", () => {
    const SCREEN_4_TERMS = [
      "고객 유형(매도/매수/양쪽)",
      "고객 등급(VIP/잠재)",
      "딜 매칭 연동",
      "소식지 구독 연동",
    ];

    const SCREEN_5_TERMS = [
      "G1~G3 비밀유지 승인",
      "열람 온도(3회 이상 열람)",
    ];

    const SCREEN_6_TERMS = [
      "대표자 성함 인쇄 위치",
      "직통 연락처 인쇄 위치",
      "중개법인 상호 인쇄 위치",
      "개설등록번호 인쇄 위치",
      "공인중개사 자격증 번호",
      "프로필 사진 인쇄 위치",
    ];

    const ALL_M3_TERMS = [...SCREEN_4_TERMS, ...SCREEN_5_TERMS, ...SCREEN_6_TERMS];

    it.each(ALL_M3_TERMS)("termKey '%s' resolves to concrete, senior-friendly domain definition", (termKey) => {
      const entry = BUILTIN_TERMS[termKey];
      expect(entry, `Term key ${termKey} must exist in BUILTIN_TERMS`).toBeDefined();
      expect(entry.title).not.toBe("쉬운 용어 설명");
      expect(entry.title.length).toBeGreaterThan(3);
      expect(entry.easyMeaning).not.toBe("이 항목에 대한 쉬운 설명입니다.");
      expect(entry.easyMeaning.length).toBeGreaterThan(15);
      expect(entry.tip).toBeDefined();
      expect(entry.tip?.length).toBeGreaterThan(10);
    });

    it("renders SeniorTermTooltip with resolved title and meaning on click", () => {
      act(() => {
        root.render(
          <SeniorHelpProvider>
            <SeniorTermTooltip termKey="G1~G3 비밀유지 승인" buttonLabel="❓ NDA 승인 안내" />
          </SeniorHelpProvider>
        );
      });

      const triggerBtn = container.querySelector("button");
      expect(triggerBtn).not.toBeNull();
      expect(triggerBtn?.textContent).toContain("❓ NDA 승인 안내");

      // Click to open (Click-to-Pin)
      act(() => {
        triggerBtn?.click();
      });

      expect(container.textContent).toContain("G1~G3 비밀유지 승인");
      expect(container.textContent).toContain("3단계");

      // Click close button inside popover
      const closeBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("닫기")
      );
      expect(closeBtn).toBeDefined();
      act(() => {
        closeBtn?.click();
      });

      expect(container.textContent).not.toContain("3단계");
    });

    it("hides SeniorTermTooltip when helperEnabled is false", () => {
      let toggleFn: () => void = () => {};
      function TestComponent() {
        const { toggleHelperEnabled } = useSeniorHelp();
        toggleFn = toggleHelperEnabled;
        return <SeniorTermTooltip termKey="딜 매칭 연동" buttonLabel="❓ 매칭 안내" />;
      }

      act(() => {
        root.render(
          <SeniorHelpProvider>
            <TestComponent />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("❓ 매칭 안내");

      // Turn helper off
      act(() => {
        toggleFn();
      });

      expect(container.textContent).toBe("");
    });
  });

  describe("2. FieldCoachBanner Behavior across Screens 4-6", () => {
    it("Screen 4 clients banner renders headline, guidance, mistake warning, and copy action", async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      act(() => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="👥 고객 명단 등록과 주간 소식지 · 매칭 연동 안내"
              guidance="등록하신 고객님은 매주 월요일 발행되는 모바일 주간 소식지 일괄 발송 대상이 됩니다."
              sampleText="[VIP 고객 메모 예시]"
              sampleButtonLabel="📋 예시 메모 복사"
              copySample={true}
              mistakeWarning="고객 연락처나 상담 메모에 주민등록번호 등 민감한 개인정보를 직접 적지 마세요."
              variant="amber"
            />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("👥 고객 명단 등록과 주간 소식지 · 매칭 연동 안내");
      expect(container.textContent).toContain("모바일 주간 소식지 일괄 발송");
      expect(container.textContent).toContain("민감한 개인정보를 직접 적지 마세요");

      // Click copy button
      const copyBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();
      await act(async () => {
        copyBtn.click();
      });

      expect(mockWriteText).toHaveBeenCalledWith("[VIP 고객 메모 예시]");
    });

    it("Screen 4 new client banner triggers onApplySample to fill notes in 1 click", () => {
      const handleApplySample = vi.fn();

      act(() => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              headline="💡 고객 성향 및 매수 희망 조건 메모 코칭"
              sampleText="희망 조건: 강남·서초 역세권 80억~150억 수익형 빌딩"
              sampleButtonLabel="✨ 1초 예시 채우기"
              onApplySample={handleApplySample}
            />
          </SeniorHelpProvider>
        );
      });

      const fillBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      expect(fillBtn).not.toBeNull();

      act(() => {
        fillBtn.click();
      });

      expect(handleApplySample).toHaveBeenCalledWith("희망 조건: 강남·서초 역세권 80억~150억 수익형 빌딩");
    });

    it("Screen 5 inbox banner renders headline and mistake warning", () => {
      act(() => {
        root.render(
          <SeniorHelpProvider>
            <FieldCoachBanner
              variant="amber"
              headline="🔔 소통 관리함 & 핫리드(3회 이상 반복 열람) 팔로업 가이드"
              guidance="3회 이상 열람한 핫리드 고객에게는 전화를 걸기 전 카톡 안부 인사를 먼저 보내시면 미팅 성사율이 높아집니다."
              mistakeWarning="자료 요청(NDA) 승인 시 고객의 신원을 반드시 확인하세요."
            />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("🔔 소통 관리함 & 핫리드(3회 이상 반복 열람) 팔로업 가이드");
      expect(container.textContent).toContain("핫리드 고객에게는 전화를 걸기 전 카톡 안부 인사");
      expect(container.textContent).toContain("고객의 신원을 반드시 확인하세요");
    });

    it("Screen 6 profile banner renders print locations guidance and sample fill action", () => {
      const handleFillDefaults = vi.fn();

      act(() => {
        root.render(
          <SeniorHelpProvider>
            <div data-testid="profile-where-it-shows-banner">
              <FieldCoachBanner
                headline="🏛️ 중개사무소 정보 인쇄 위치 및 명함 등록 안내"
                guidance="PPTX Slide 01 표지 & Slide 10 문의/유의사항에 자동 인쇄됩니다."
                sampleText="[표준 공인중개사무소 프로필 예시]"
                sampleButtonLabel="✨ 표준 양식 1초 예시 채우기"
                onApplySample={handleFillDefaults}
              />
            </div>
          </SeniorHelpProvider>
        );
      });

      expect(container.querySelector('[data-testid="profile-where-it-shows-banner"]')).not.toBeNull();
      expect(container.textContent).toContain("🏛️ 중개사무소 정보 인쇄 위치 및 명함 등록 안내");

      const sampleBtn = container.querySelector('[data-testid="field-coach-sample-btn"]') as HTMLButtonElement;
      act(() => {
        sampleBtn.click();
      });
      expect(handleFillDefaults).toHaveBeenCalledWith("[표준 공인중개사무소 프로필 예시]");
    });

    it("FieldCoachBanner returns null when helperEnabled is false", () => {
      let toggleFn: () => void = () => {};
      function TestComponent() {
        const { toggleHelperEnabled } = useSeniorHelp();
        toggleFn = toggleHelperEnabled;
        return <FieldCoachBanner headline="테스트 배너" />;
      }

      act(() => {
        root.render(
          <SeniorHelpProvider>
            <TestComponent />
          </SeniorHelpProvider>
        );
      });

      expect(container.textContent).toContain("테스트 배너");

      // Disable helper
      act(() => {
        toggleFn();
      });

      expect(container.textContent).toBe("");
    });
  });

  describe("3. KakaoTemplatePicker Integration for Hot-Lead Follow-up", () => {
    it("renders KakaoTemplatePicker button with custom label and opens dialog with tpl-06 highlighted", () => {
      act(() => {
        root.render(
          <SeniorHelpProvider>
            <KakaoTemplatePicker
              defaultTemplateId="tpl-06"
              buttonLabel="💬 인사말 복사"
              buildingId="bld-123"
            />
          </SeniorHelpProvider>
        );
      });

      const btn = container.querySelector('[data-testid="kakao-template-picker-btn"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.textContent).toContain("💬 인사말 복사");

      act(() => {
        btn.click();
      });

      // Dialog opens in document.body via Portal
      expect(document.body.textContent).toContain("상황별 카카오톡 발송 인사말 6선");
      expect(document.body.textContent).toContain("상황 6 · 제안서 3회 이상 반복 열람");
    });
  });

  describe("4. QuickFeedbackReportModal Screen Detection & Formatting", () => {
    it("resolves accurate Korean screen names from pathname", () => {
      expect(resolveScreenNameFromPathname("/broker/clients")).toBe("👥 고객 명단 · 구독 관리 (VIP/일반/잠재)");
      expect(resolveScreenNameFromPathname("/broker/inbox")).toBe("🔔 소통 관리함 (열람 알림 · G1~G3 게이트 요청)");
      expect(resolveScreenNameFromPathname("/broker/profile")).toBe("👤 중개사 프로필 · 디지털 명함 설정");
      expect(resolveScreenNameFromPathname("/broker")).toBe("🏠 홈 화면 (대시보드 · 퀵액션 · 알림)");
      expect(resolveScreenNameFromPathname("/broker/buildings")).toBe("🏢 내 물건 보관함 · IM 목록 (딜카드 vs 모바일 IM)");
      expect(resolveScreenNameFromPathname("/broker/basic-im-studio/123")).toBe("🎨 Basic IM 슬라이드 편집 스튜디오 (16:9 프리뷰 · 테마)");
    });

    it("pre-fills screen context and copies formatted report template to clipboard", async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: mockWriteText },
      });

      act(() => {
        root.render(
          <QuickFeedbackReportModal
            isOpen={true}
            onClose={vi.fn()}
            defaultAddress="서울 강남구 테헤란로 123"
          />
        );
      });

      expect(document.body.textContent).toContain("10초 현장 불편 제보 · 개선 요청");
      const inputs = Array.from(document.body.querySelectorAll("input"));
      const addressInput = inputs[1] as HTMLInputElement;
      expect(addressInput).toBeDefined();
      expect(addressInput.value).toBe("서울 강남구 테헤란로 123");

      const copyBtn = document.body.querySelector('[data-testid="copy-feedback-report-btn"]') as HTMLButtonElement;
      expect(copyBtn).not.toBeNull();

      await act(async () => {
        copyBtn.click();
      });

      expect(mockWriteText).toHaveBeenCalled();
      const callArg = mockWriteText.mock.calls[0][0];
      expect(callArg).toContain("[크리딜(CRE DealCard) 중개인 현장 피드백 / 개선 요청]");
      expect(callArg).toContain("서울 강남구 테헤란로 123");
      expect(callArg).toContain("👥 고객 명단 · 구독 관리 (VIP/일반/잠재)");
    });
  });

  describe("5. BrokerSeniorLayout Global Integration (R3 Compliance)", () => {
    it("renders topbar feedback trigger button and drawer button", () => {
      act(() => {
        root.render(
          <BrokerSeniorLayout>
            <div>Page Content</div>
          </BrokerSeniorLayout>
        );
      });

      const feedbackBtn = container.querySelector('[data-testid="broker-feedback-btn"]');
      expect(feedbackBtn).not.toBeNull();
      expect(feedbackBtn?.textContent).toContain("🛠️ 10초 불편 제보");

      const drawerBtn = container.querySelector('[data-testid="broker-contextual-help-btn"]');
      expect(drawerBtn).not.toBeNull();
      expect(drawerBtn?.textContent).toContain("🎬 이 화면 20초 사용법");
    });

    it("opens QuickFeedbackReportModal when broker-feedback-btn is clicked", () => {
      act(() => {
        root.render(
          <BrokerSeniorLayout>
            <div>Page Content</div>
          </BrokerSeniorLayout>
        );
      });

      const feedbackBtn = container.querySelector('[data-testid="broker-feedback-btn"]') as HTMLButtonElement;
      act(() => {
        feedbackBtn.click();
      });

      expect(document.body.textContent).toContain("10초 현장 불편 제보 · 개선 요청");

      // Close modal
      const closeBtn = Array.from(document.body.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("닫기")
      );
      expect(closeBtn).toBeDefined();

      act(() => {
        closeBtn?.click();
      });

      expect(document.body.textContent).not.toContain("10초 현장 불편 제보 · 개선 요청");
    });

    it("keeps feedback-btn and drawer-btn visible and active even when helperEnabled is false (R3)", () => {
      act(() => {
        root.render(
          <BrokerSeniorLayout>
            <div>Page Content</div>
          </BrokerSeniorLayout>
        );
      });

      const helperToggleBtn = container.querySelector('[data-testid="broker-helper-toggle-btn"]') as HTMLButtonElement;
      expect(helperToggleBtn.textContent).toContain("💡 친절 도우미 (켜짐)");

      // Turn helper off
      act(() => {
        helperToggleBtn.click();
      });
      expect(helperToggleBtn.textContent).toContain("💡 도우미 (꺼짐)");

      // Both buttons remain in DOM and functional
      const feedbackBtn = container.querySelector('[data-testid="broker-feedback-btn"]') as HTMLButtonElement;
      expect(feedbackBtn).not.toBeNull();

      const drawerBtn = container.querySelector('[data-testid="broker-contextual-help-btn"]');
      expect(drawerBtn).not.toBeNull();

      // Clicking feedback still opens modal
      act(() => {
        feedbackBtn.click();
      });
      expect(document.body.textContent).toContain("10초 현장 불편 제보 · 개선 요청");
    });
  });
});
