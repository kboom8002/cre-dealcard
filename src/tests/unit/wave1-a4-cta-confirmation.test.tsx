// @vitest-environment jsdom
/**
 * Wave 1 Step 1.3 (Axis 4 P0: A4-04, A4-05) CTALadder & ContactGateModal Confirmation Flow Suite
 */
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";

const { routerPushSpy, copyTextSpy } = vi.hoisted(() => ({
  routerPushSpy: vi.fn(),
  copyTextSpy: vi.fn(async (_text: string) => true),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushSpy,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/components/teaser/TeaserEventTracker", () => ({
  trackTeaserCta: vi.fn(),
}));

vi.mock("@/lib/ux/clipboard", () => ({
  copyText: (text: string) => copyTextSpy(text),
  COPY_FAILED_MESSAGE: "복사에 실패했습니다.",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { CTALadder } from "@/components/teaser/CTALadder";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(el: HTMLInputElement, val: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, val);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Wave 1 Step 1.3 (A4-04 & A4-05): CTALadder & ContactGateModal Post-Submit Flow", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it.each([true, false])(
    "hasImDoc=%s: submit -> confirmed badge -> click opens confirmation card with broker phone copy & tel: link, no empty form or /im-lite?pro=true loop",
    async (hasImDoc) => {
      const buildingId = `bld-flow-${String(hasImDoc)}`;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/gate-requests") && (!init || !init.method || init.method === "GET")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ verified: false }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      });

      await act(async () => {
        root.render(
          <CTALadder
            buildingId={buildingId}
            teaserConfigId={`tc-${buildingId}`}
            brokerPhone="01012345678"
            hasImDoc={hasImDoc}
          />
        );
      });
      await act(async () => {});

      const primaryBtn = container.querySelector(
        '[data-testid="public-dealcard-im-request-btn"]'
      ) as HTMLButtonElement;
      expect(primaryBtn).not.toBeNull();
      expect(primaryBtn.textContent).toContain("상세 제안서(IM) 요청");

      await act(async () => {
        primaryBtn.click();
      });

      const nameInput = container.querySelector('[data-testid="contact-gate-name"]') as HTMLInputElement;
      const phoneInput = container.querySelector('[data-testid="contact-gate-phone"]') as HTMLInputElement;
      const consentBox = container.querySelector(
        '[data-testid="contact-gate-privacy-consent"]'
      ) as HTMLInputElement;
      const submitBtn = container.querySelector(
        '[data-testid="contact-gate-submit-btn"]'
      ) as HTMLButtonElement;

      await act(async () => {
        setInputValue(nameInput, "박투자");
        setInputValue(phoneInput, "010-9876-5432");
        consentBox.click();
      });
      await act(async () => {
        submitBtn.click();
      });

      // Modal shows unified confirmation card with copy button & tel: link
      const submittedBox = container.querySelector('[data-testid="contact-gate-submitted"]');
      expect(submittedBox).not.toBeNull();
      expect(submittedBox?.textContent).toContain(
        "요청이 정상 접수되었습니다. 담당 중개사가 확인 후 카톡·문자로 승인 전용 IM 링크를 보내드립니다."
      );
      expect(submittedBox?.textContent).toContain("010-1234-5678");
      expect(container.querySelector('[data-testid="contact-gate-preview-btn"]')).toBeNull();

      const copyPhoneBtn = container.querySelector(
        '[data-testid="contact-gate-copy-phone-btn"]'
      ) as HTMLButtonElement;
      expect(copyPhoneBtn).not.toBeNull();
      await act(async () => {
        copyPhoneBtn.click();
      });
      expect(copyTextSpy).toHaveBeenCalledWith("010-1234-5678");

      const callLink = container.querySelector('[data-testid="contact-gate-call-btn"]') as HTMLAnchorElement;
      expect(callLink).not.toBeNull();
      expect(callLink.getAttribute("href")).toBe("tel:01012345678");

      // Close modal -> button shows "✅ 상세 자료 요청 접수됨" (NOT <a href="tel:...">)
      const closeBtn = container.querySelector('[data-testid="contact-gate-close-btn"]') as HTMLButtonElement;
      await act(async () => {
        closeBtn.click();
      });

      const confirmedBtn = container.querySelector(
        '[data-testid="public-dealcard-im-request-btn"]'
      ) as HTMLButtonElement;
      expect(confirmedBtn.tagName).toBe("BUTTON");
      expect(confirmedBtn.getAttribute("href")).toBeNull();
      expect(confirmedBtn.textContent).toContain("상세 자료 요청 접수됨");

      // Re-clicking confirmed button opens confirmation modal directly (NOT empty form!)
      await act(async () => {
        confirmedBtn.click();
      });
      expect(container.querySelector('[data-testid="contact-gate-submitted"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="contact-gate-name"]')).toBeNull();
      expect(routerPushSpy).not.toHaveBeenCalled();
    }
  );

  it("after reload with localStorage verification, clicking confirmed button opens confirmation status directly instead of empty form", async () => {
    const buildingId = "bld-reloaded-verified";
    localStorage.setItem(`contact_verified_${buildingId}`, "true");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: false }),
    } as Response);

    await act(async () => {
      root.render(
        <CTALadder
          buildingId={buildingId}
          teaserConfigId="tc-reload"
          brokerPhone="02-555-0199"
          hasImDoc={true}
        />
      );
    });
    await act(async () => {});

    const confirmedBtn = container.querySelector(
      '[data-testid="public-dealcard-im-request-btn"]'
    ) as HTMLButtonElement;
    expect(confirmedBtn.tagName).toBe("BUTTON");
    expect(confirmedBtn.textContent).toContain("상세 자료 요청 접수됨");

    await act(async () => {
      confirmedBtn.click();
    });

    const submittedBox = container.querySelector('[data-testid="contact-gate-submitted"]');
    expect(submittedBox).not.toBeNull();
    expect(submittedBox?.textContent).toContain("02-555-0199");
    expect(container.querySelector('[data-testid="contact-gate-name"]')).toBeNull();
    expect(routerPushSpy).not.toHaveBeenCalled();
  });
});
