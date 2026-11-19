// @vitest-environment jsdom
/**
 * Wave 4 — WP-12: Buyer Funnel Dead-End Closure, Dignified Unpublished/Revoked/404 Screens,
 * and SubscribeCard Separated Consent UX.
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  routerPush: vi.fn(),
  viewer: { userId: null as string | null, isAdmin: false },
  imData: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: h.routerPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/components/teaser/TeaserEventTracker", () => ({
  trackTeaserCta: vi.fn(),
}));

vi.mock("@/app/(public)/im-lite/[buildingId]/fetch-im-data", () => ({
  fetchIMData: vi.fn(async () => h.imData),
}));

vi.mock("@/lib/server-viewer", () => ({
  getServerViewer: vi.fn(async () => h.viewer),
}));

import { CTALadder } from "@/components/teaser/CTALadder";
import { ContactGateModal } from "@/components/teaser/ContactGateModal";
import MobileIMLitePage from "@/app/(public)/im-lite/[buildingId]/page";
import DealCardNotFound from "@/app/(public)/dc/[id]/not-found";
import { SubscribeCard } from "@/components/magazine/SubscribeCard";
import { SubscribeFormClient } from "@/app/(magazine)/magazine/[brokerId]/subscribe/SubscribeFormClient";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(el: HTMLInputElement, val: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(el, val);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Wave 4 WP-12: Buyer Funnel Dead-End Closure & Dignified Public UX", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    h.viewer = { userId: null, isAdmin: false };
    h.imData = null;
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

  describe("1. CTALadder hasImDoc Dead-End Closure", () => {
    it("renders '담당 중개사에게 상세 자료 요청' when hasImDoc={false} and NEVER links or navigates to /im-lite", async () => {
      await act(async () => {
        root.render(
          <CTALadder
            buildingId="bldg-no-im-01"
            teaserConfigId="cfg-01"
            brokerPhone="010-2345-6789"
            hasImDoc={false}
          />
        );
      });

      expect(container.textContent).toContain("담당 중개사에게 상세 자료 요청");
      expect(container.querySelector('a[href*="/im-lite"]')).toBeNull();

      const primaryBtn = container.querySelector(
        '[data-testid="public-dealcard-im-request-btn"]'
      ) as HTMLElement;
      expect(primaryBtn).not.toBeNull();

      await act(async () => {
        primaryBtn.click();
      });

      expect(h.routerPush).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="contact-gate-modal"]')).not.toBeNull();
    });

    it("shows confirmed state badge + tel: CTA when hasImDoc={false} and visitor is already verified", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ verified: true }),
      } as Response);

      await act(async () => {
        root.render(
          <CTALadder
            buildingId="bldg-no-im-02"
            teaserConfigId="cfg-02"
            brokerPhone="010-5555-7777"
            hasImDoc={false}
          />
        );
      });
      await act(async () => {});

      const confirmedEl = container.querySelector(
        '[data-testid="public-dealcard-im-request-btn"]'
      ) as HTMLAnchorElement;
      expect(confirmedEl).not.toBeNull();
      expect(confirmedEl.textContent).toContain("상세 자료 요청 접수됨");
      expect(confirmedEl.getAttribute("href")).toBe("tel:01055557777");
      expect(container.querySelector('a[href*="/im-lite"]')).toBeNull();
      expect(h.routerPush).not.toHaveBeenCalled();
    });

    it("preserves /im-lite/${buildingId}?pro=true navigation when hasImDoc={true}", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ verified: true }),
      } as Response);

      await act(async () => {
        root.render(
          <CTALadder
            buildingId="bldg-with-im-01"
            teaserConfigId="cfg-03"
            hasImDoc={true}
          />
        );
      });
      await act(async () => {});

      const primaryBtn = container.querySelector(
        '[data-testid="public-dealcard-im-request-btn"]'
      ) as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain("상세 제안서(IM) 요청");

      await act(async () => {
        primaryBtn.click();
      });

      expect(h.routerPush).toHaveBeenCalledWith("/im-lite/bldg-with-im-01?pro=true");
    });
  });

  describe("2. ContactGateModal PIPA Consent & hasImDoc={false} Confirmation", () => {
    it("requires explicit PIPA consent checkbox before submit, renders /privacy link & 16px inputs, and shows dignified confirmation without /im-lite redirect when hasImDoc={false}", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);
      const onClose = vi.fn();
      const onSuccess = vi.fn();

      await act(async () => {
        root.render(
          <ContactGateModal
            isOpen={true}
            onClose={onClose}
            buildingId="bldg-modal-01"
            onSuccess={onSuccess}
            hasImDoc={false}
            brokerPhone="010-9999-1111"
          />
        );
      });

      // All text/tel inputs use text-[16px] and min-h-[48px] with explicit label[for]
      const textInputs = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="tel"]')
      );
      expect(textInputs).toHaveLength(4);
      for (const inp of textInputs) {
        expect(inp.className).toContain("text-[16px]");
        expect(inp.className).toContain("min-h-[48px]");
        expect(inp.id).toBeTruthy();
        expect(container.querySelector(`label[for="${inp.id}"]`)).not.toBeNull();
      }

      // PIPA consent checkbox + /privacy link
      const consentBox = container.querySelector(
        '[data-testid="contact-gate-privacy-consent"]'
      ) as HTMLInputElement;
      expect(consentBox).not.toBeNull();
      expect(consentBox.checked).toBe(false);
      expect(container.textContent).toContain(
        "[필수] 매물 상담 및 자료 전달을 위한 개인정보(성함·연락처) 수집·이용에 동의합니다"
      );
      const privacyLink = container.querySelector('a[href="/privacy"]') as HTMLAnchorElement;
      expect(privacyLink).not.toBeNull();
      expect(privacyLink.getAttribute("target")).toBe("_blank");

      const submitBtn = container.querySelector(
        '[data-testid="contact-gate-submit-btn"]'
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      // Fill required fields, attempt submit BEFORE checking consent -> blocked
      const nameInput = container.querySelector('[data-testid="contact-gate-name"]') as HTMLInputElement;
      const phoneInput = container.querySelector('[data-testid="contact-gate-phone"]') as HTMLInputElement;
      await act(async () => {
        setInputValue(nameInput, "김매수 대표");
        setInputValue(phoneInput, "010-3333-4444");
      });
      expect(submitBtn.disabled).toBe(true);

      const form = container.querySelector("form") as HTMLFormElement;
      await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(fetchSpy).not.toHaveBeenCalled();

      // Check PIPA consent -> submit enabled & succeeds
      await act(async () => {
        consentBox.click();
      });
      expect(consentBox.checked).toBe(true);
      expect(submitBtn.disabled).toBe(false);

      await act(async () => {
        submitBtn.click();
      });

      expect(fetchSpy).toHaveBeenCalled();
      const submittedView = container.querySelector('[data-testid="contact-gate-submitted"]');
      expect(submittedView).not.toBeNull();
      expect(submittedView?.textContent).toContain(
        "담당 공인중개사에게 상세 자료 요청이 접수되었습니다. 준비되는 대로 입력하신 연락처(010-3333-4444)로 전용 링크를 안내해 드립니다."
      );
      // tel: call CTA rendered, preview button (/im-lite redirect trigger) omitted
      const callLink = container.querySelector('[data-testid="contact-gate-call-btn"]') as HTMLAnchorElement;
      expect(callLink).not.toBeNull();
      expect(callLink.getAttribute("href")).toBe("tel:01099991111");
      expect(container.querySelector('[data-testid="contact-gate-preview-btn"]')).toBeNull();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(h.routerPush).not.toHaveBeenCalled();
    });
  });

  describe("3. /im-lite/[buildingId] Dignified Not-Found & Revoked Screens", () => {
    it("im-notfound-screen for anonymous visitor removes /broker/w/im and links to /dc/${buildingId}", async () => {
      h.viewer = { userId: null, isAdmin: false };
      h.imData = null;

      const element = await MobileIMLitePage({
        params: Promise.resolve({ buildingId: "bldg-unpublished-99" }),
        searchParams: Promise.resolve({}),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-testid="im-notfound-screen"');
      expect(html).toContain("상세 투자설명서(IM) 준비 중인 매물입니다");
      expect(html).toContain(
        "담당 공인중개사가 최신 임대차 및 수익 자료를 검수하고 있습니다. 매물 요약 딜카드에서 간편 문의를 남겨주시면 우선 안내해 드립니다."
      );
      expect(html).toContain('href="/dc/bldg-unpublished-99"');
      expect(html).toContain("min-h-[48px]");
      expect(html).not.toContain("/broker/w/im");
      expect(html).not.toContain("/broker/");
    });

    it("im-notfound-screen renders secondary /broker/w/im link ONLY for authenticated viewer", async () => {
      h.viewer = { userId: "broker-auth-1", isAdmin: false };
      h.imData = null;

      const element = await MobileIMLitePage({
        params: Promise.resolve({ buildingId: "bldg-unpublished-99" }),
        searchParams: Promise.resolve({}),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('href="/dc/bldg-unpublished-99"');
      expect(html).toContain('href="/broker/w/im"');
    });

    it("revoked-im-screen renders dignified Korean copy and links to /dc/${buildingId} without harsh jargon or /broker URLs", async () => {
      h.viewer = { userId: null, isAdmin: false };
      h.imData = null;

      const element = await MobileIMLitePage({
        params: Promise.resolve({ buildingId: "bldg-revoked-77" }),
        searchParams: Promise.resolve({ token: "expired-share-token" }),
      });
      const html = renderToStaticMarkup(element);

      expect(html).toContain('data-testid="revoked-im-screen"');
      expect(html).toContain("매물 조건 업데이트 또는 거래 진행에 따라 열람이 종료된 링크입니다");
      expect(html).toContain("최신 매물 상태나 수정된 자료가 필요하시면 담당 공인중개사에게 문의해 주세요.");
      expect(html).toContain('href="/dc/bldg-revoked-77"');
      expect(html).not.toContain("열람 제한 안내");
      expect(html).not.toContain("링크 잠김");
      expect(html).not.toContain("권한 회수");
      expect(html).not.toContain("404");
      expect(html).not.toContain("/broker/");
    });
  });

  describe("4. /dc/[id]/not-found.tsx Dignified Closed Listing Screen", () => {
    it("renders light-paper dealcard-notfound-screen without 404 or /broker/ links", () => {
      const html = renderToStaticMarkup(<DealCardNotFound />);

      expect(html).toContain('data-testid="dealcard-notfound-screen"');
      expect(html).toContain("bg-[#FAF9F6]");
      expect(html).toContain("text-stone-900");
      expect(html).toContain("매물 안내 종료");
      expect(html).toContain("거래가 완료되었거나 비공개 전환된 매물입니다");
      expect(html).toContain(
        "요청하신 매물은 중개 진행 상황에 따라 공개가 종료되었습니다. 유사 조건의 다른 매물 안내는 공유받으신 담당 공인중개사에게 문의해 주세요."
      );
      expect(html).not.toContain("404");
      expect(html.toLowerCase()).not.toContain("not found");
      expect(html).not.toContain("/broker/");
    });
  });

  describe("5. SubscribeCard & SubscribeFormClient Separated Consent, Email Default & 16px Inputs", () => {
    it("SubscribeCard (minimal mode) defaults to email with auto-confirm helper, separated required consents, /privacy 새 창 link, and 16px inputs", async () => {
      await act(async () => {
        root.render(<SubscribeCard brokerId="seoul-broker" source="magazine" variant="minimal" />);
      });

      // Default channel is email
      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
      expect(emailInput).not.toBeNull();
      expect(emailInput.className).toContain("text-[16px]");
      expect(emailInput.className).toContain("min-h-[48px]");
      expect(container.textContent).toContain(
        "이메일로 신청하시면 확인 링크 클릭 즉시 매주 자동 발송됩니다."
      );

      // Separated required checkboxes + master checkbox
      const masterCb = container.querySelector(
        '[data-testid="minimal-subscribe-consent"]'
      ) as HTMLInputElement;
      const privacyCb = container.querySelector(
        '[data-testid="minimal-consent-privacy"]'
      ) as HTMLInputElement;
      const marketingCb = container.querySelector(
        '[data-testid="minimal-consent-marketing"]'
      ) as HTMLInputElement;
      const age14Cb = container.querySelector(
        '[data-testid="minimal-consent-age14"]'
      ) as HTMLInputElement;
      const submitBtn = container.querySelector(
        '[data-testid="minimal-subscribe-submit"]'
      ) as HTMLButtonElement;

      expect(masterCb).not.toBeNull();
      expect(privacyCb).not.toBeNull();
      expect(marketingCb).not.toBeNull();
      expect(age14Cb).not.toBeNull();
      expect(submitBtn.disabled).toBe(true);

      // Visible /privacy link with 새 창
      const privacyLink = container.querySelector('a[href="/privacy"]') as HTMLAnchorElement;
      expect(privacyLink).not.toBeNull();
      expect(privacyLink.getAttribute("target")).toBe("_blank");
      expect(privacyLink.textContent).toContain("새 창");

      // Partial consent (privacy only) keeps submit disabled
      await act(async () => {
        privacyCb.click();
      });
      expect(privacyCb.checked).toBe(true);
      expect(marketingCb.checked).toBe(false);
      expect(submitBtn.disabled).toBe(true);

      // Master 1-click consent checks all 3 and enables submit
      await act(async () => {
        masterCb.click();
      });
      expect(privacyCb.checked).toBe(true);
      expect(marketingCb.checked).toBe(true);
      expect(age14Cb.checked).toBe(true);
      expect(submitBtn.disabled).toBe(false);

      // Toggle to phone ('휴대폰으로 받기') updates helper text and renders 16px tel input
      const channelToggleBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("휴대폰으로 받기")
      );
      expect(channelToggleBtn).toBeDefined();
      await act(async () => {
        channelToggleBtn!.click();
      });
      expect(container.textContent).toContain(
        "휴대폰 번호 신청 시 담당 중개사가 확인 후 안내해 드리며, 이메일을 함께 등록하시면 즉시 자동 구독됩니다."
      );
      const telInput = container.querySelector('input[type="tel"]') as HTMLInputElement;
      expect(telInput).not.toBeNull();
      expect(telInput.className).toContain("text-[16px]");
      expect(telInput.className).toContain("min-h-[48px]");
    });

    it("SubscribeCard (default/full mode) and SubscribeFormClient render separated consents, /privacy (새 창) link, and 16px inputs", () => {
      const fullCardHtml = renderToStaticMarkup(
        <SubscribeCard brokerId="seoul-broker" source="im" />
      );
      expect(fullCardHtml).toContain(
        "이메일로 신청하시면 확인 링크 클릭 즉시 매주 자동 발송됩니다."
      );
      expect(fullCardHtml).toContain('href="/privacy"');
      expect(fullCardHtml).toContain("새 창");
      expect(fullCardHtml).toContain("text-[16px]");
      expect(fullCardHtml).toContain("min-h-[48px]");
      expect(fullCardHtml).toContain("개인정보 수집·이용에 동의합니다");
      expect(fullCardHtml).toContain("광고성 정보 수신에 동의합니다");

      const formPageHtml = renderToStaticMarkup(
        <SubscribeFormClient
          brokerId="seoul-broker"
          brokerName="박성수"
          regions={[]}
          assets={[]}
          initialSource="qr_card"
          referrer={null}
          latestDate="2026-11-10"
        />
      );
      expect(formPageHtml).toContain('href="/privacy"');
      expect(formPageHtml).toContain("새 창");
      expect(formPageHtml).toContain("text-[16px]");
      expect(formPageHtml).toContain("min-h-[48px]");
    });
  });
});
