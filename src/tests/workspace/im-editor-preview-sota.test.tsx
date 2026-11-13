// @vitest-environment jsdom
/**
 * @file src/tests/workspace/im-editor-preview-sota.test.tsx
 * @description Verification suite for P1: IM Workspace Minimalist Cognitive-Science
 * Optimization & Bidirectional Editor <-> Preview Sync.
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/broker/w/im",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/broker/ImDataBottomSheet", () => ({
  ImDataBottomSheet: () => null,
}));

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  nextValue: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, nextValue);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("IM Workspace SOTA Minimalist Editor & Bidirectional Preview Sync (P1)", () => {
  let root: Root;
  let container: HTMLDivElement;
  let fetchSpy: ReturnType<typeof vi.fn>;

  const PUBLISHED_UUID = "11111111-2222-4333-8444-555555555555";

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    mockPush.mockReset();
    mockReplace.mockReset();

    // Ensure scrollIntoView and requestAnimationFrame work deterministically in JSDOM
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/profile")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              display_name: "김철수 대표중개사",
              company: "크리딜 부동산중개법인",
              phone: "010-9999-8888",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/broker/workspace/summary") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ ok: true, ims: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/broker/workspace/summary") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/broker/im-lite/quick-generate")) {
        return new Response(
          JSON.stringify({
            success: true,
            buildingId: PUBLISHED_UUID,
            documentId: "doc-pub-01",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("1. resets to Tab 1, shows honest pre_generation card (no fake 0/0 4-floor preview), skips premature blank upsert_im autosave, and jumps to address input", async () => {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    // Default sample (im-doc-01 서교동) has meaningful input -> live_draft
    const initialBar = container.querySelector('[data-testid="preview-causality-bar"]');
    expect(initialBar?.getAttribute("data-lifecycle")).toBe("live_draft");
    expect(container.querySelector('[data-testid="im-mobile-preview-scroll"]')).not.toBeNull();

    // Move to Tab 4 first
    const tab4Btn = container.querySelector(
      '[data-testid="im-editor-tab-media_publish"]'
    ) as HTMLButtonElement;
    await act(async () => {
      tab4Btn.click();
    });
    expect(
      container.querySelector('[data-testid="im-tab-panel-media-publish"]')?.classList.contains("hidden")
    ).toBe(false);

    // Click [+ 새 IM 만들기] while on Tab 4
    const createBtn = container.querySelector(
      '[data-testid="im-create-new-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      createBtn.click();
    });

    // Resets back to Tab 1 (specs)
    expect(
      container.querySelector('[data-testid="im-tab-panel-specs"]')?.classList.contains("hidden")
    ).toBe(false);
    expect(
      container.querySelector('[data-testid="im-tab-panel-media-publish"]')?.classList.contains("hidden")
    ).toBe(true);

    // Title input is blank (NOT polluted with "새 IM"), while list item still displays fallback "새 IM"
    const titleInput = container.querySelector(
      '[data-testid="im-title-single-line-input"]'
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("");
    expect(container.querySelector('[data-testid="im-list-slot"]')?.textContent).toContain("새 IM");

    // Column 3 shows pre_generation state and hides the fake 0/0 mobile preview frame
    const pregenBar = container.querySelector('[data-testid="preview-causality-bar"]');
    expect(pregenBar?.getAttribute("data-lifecycle")).toBe("pre_generation");
    const pregenCard = container.querySelector('[data-testid="im-preview-pregeneration-state"]');
    expect(pregenCard).not.toBeNull();
    expect(container.querySelector('[data-testid="im-mobile-preview-scroll"]')).toBeNull();

    // Top download & fullscreen links are muted in pre_generation
    expect(
      container.querySelector('[data-testid="im-download-pptx-btn"]')?.className
    ).toContain("opacity-50");
    expect(
      container.querySelector('[data-testid="im-open-fullscreen-link"]')?.className
    ).toContain("opacity-50");

    // Advance timers well past 900ms autosave debounce -> NO upsert_im network call on blank item
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    const upsertCalls = fetchSpy.mock.calls.filter(([url, init]) => {
      return (
        String(url).includes("/api/broker/workspace/summary") &&
        init?.method === "PATCH" &&
        String(init?.body || "").includes("upsert_im")
      );
    });
    expect(upsertCalls.length).toBe(0);

    // Clicking primary button in pregeneration card focuses #im-address-input
    const pregenPrimaryBtn = container.querySelector(
      '[data-testid="im-preview-pregeneration-state-primary-btn"]'
    ) as HTMLButtonElement;
    expect(pregenPrimaryBtn).not.toBeNull();
    await act(async () => {
      pregenPrimaryBtn.click();
    });
    expect(document.activeElement?.id).toBe("im-address-input");
  });

  it("2. transitions blank IM to live_draft immediately when address & price are entered and syncs editor focus to preview units", async () => {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    const createBtn = container.querySelector(
      '[data-testid="im-create-new-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      createBtn.click();
    });
    expect(container.querySelector('[data-testid="im-preview-pregeneration-state"]')).not.toBeNull();

    const addressInput = container.querySelector("#im-address-input") as HTMLInputElement;
    const priceInput = container.querySelector("#im-price-won-input") as HTMLInputElement;

    await act(async () => {
      setNativeInputValue(addressInput, "서울특별시 강남구 역삼동 823-1");
      setNativeInputValue(priceInput, "6500000000");
    });

    const causalityBar = container.querySelector('[data-testid="preview-causality-bar"]');
    expect(causalityBar?.getAttribute("data-lifecycle")).toBe("live_draft");
    expect(container.querySelector('[data-testid="im-preview-pregeneration-state"]')).toBeNull();

    const previewScroll = container.querySelector('[data-testid="im-mobile-preview-scroll"]');
    expect(previewScroll).not.toBeNull();
    expect(previewScroll?.textContent).toContain("서울특별시 강남구 역삼동 823-1");
    expect(previewScroll?.textContent).toContain("65억");
    // Blank title must NOT show "새 IM" on the cover card
    expect(
      container.querySelector('[data-testid="im-mobile-section-01"]')?.textContent
    ).not.toContain("새 IM");

    // Editor -> Preview focus sync: focusing address highlights section 04
    await act(async () => {
      addressInput.focus();
    });
    expect(
      container.querySelector('[data-testid="im-mobile-section-04"]')?.getAttribute("data-preview-active")
    ).toBe("true");
  });

  it("3. supports Click-to-Edit across Mobile IM 10 sections and PPTX 10 slides (including auto-expanding collapsed broker section)", async () => {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    // Broker profile hydrated -> broker section defaults to collapsed
    const brokerPanel = container.querySelector(
      '[data-testid="im-broker-handover-panel"]'
    ) as HTMLElement;
    expect(brokerPanel.classList.contains("hidden")).toBe(true);

    // Click Mobile Preview Section 06 (Rent Roll) -> switches to Tab 2 & focuses first rent roll floor input
    const section06 = container.querySelector(
      '[data-testid="im-mobile-section-06"]'
    ) as HTMLElement;
    await act(async () => {
      section06.click();
    });
    expect(
      container.querySelector('[data-testid="im-tab-panel-rentroll"]')?.classList.contains("hidden")
    ).toBe(false);
    expect(document.activeElement?.getAttribute("data-rr-cell")).toBe("0:floor");

    // Click nested Highlight #2 inside Section 02 -> switches to Tab 3 & focuses #im-axios-point-title-1
    const highlightItem1 = container.querySelector(
      '[data-testid="im-preview-axios-item-1"]'
    ) as HTMLElement;
    await act(async () => {
      highlightItem1.click();
    });
    expect(
      container.querySelector('[data-testid="im-tab-panel-axios-brief"]')?.classList.contains("hidden")
    ).toBe(false);
    expect(document.activeElement?.id).toBe("im-axios-point-title-1");

    // Click Mobile Preview Section 10 (Broker & Handover) -> auto-expands collapsed broker panel & focuses #im-handover-note-input
    const section10 = container.querySelector(
      '[data-testid="im-mobile-section-10"]'
    ) as HTMLElement;
    await act(async () => {
      section10.click();
    });
    expect(brokerPanel.classList.contains("hidden")).toBe(false);
    expect(document.activeElement?.id).toBe("im-handover-note-input");

    // Switch Column 3 to PPTX 10-slide preview & click Slide 09 -> switches to Tab 4 & focuses photo select button
    const pptxTabBtn = Array.from(
      container.querySelectorAll('[aria-label="IM 미리보기 방식"] button')
    ).find((b) => b.textContent?.includes("발표자료 10면")) as HTMLButtonElement;
    await act(async () => {
      pptxTabBtn.click();
    });

    const slide01 = container.querySelector('[data-testid="im-slide-preview-01"]') as HTMLElement;
    expect(slide01.className).toContain("bg-white");

    const slide09 = container.querySelector('[data-testid="im-slide-preview-09"]') as HTMLElement;
    await act(async () => {
      slide09.click();
    });
    expect(
      container.querySelector('[data-testid="im-tab-panel-media-publish"]')?.classList.contains("hidden")
    ).toBe(false);
    expect(document.activeElement?.getAttribute("data-testid")).toBe("im-photo-select-btn");
  });

  it("4. tracks published_clean -> post-publish edit -> published_dirty honestly across debounced upsert_im autosave and resyncs on demand", async () => {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    // Publish IM via primary generate button
    const quickGenBtn = container.querySelector(
      '[data-testid="im-quick-generate-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      quickGenBtn.click();
    });

    const causalityAfterPub = container.querySelector('[data-testid="preview-causality-bar"]');
    expect(causalityAfterPub?.getAttribute("data-lifecycle")).toBe("published_clean");
    const liveLink = container.querySelector(
      '[data-testid="preview-causality-live-link"]'
    ) as HTMLAnchorElement;
    expect(liveLink).not.toBeNull();
    expect(liveLink.getAttribute("href")).toBe(`/im-lite/${PUBLISHED_UUID}`);
    expect(quickGenBtn.textContent).toContain("완료");

    // Edit asking price AFTER publishing -> must immediately become published_dirty
    const priceInput = container.querySelector("#im-price-won-input") as HTMLInputElement;
    await act(async () => {
      setNativeInputValue(priceInput, "9800000000");
    });

    expect(
      container.querySelector('[data-testid="preview-causality-bar"]')?.getAttribute("data-lifecycle")
    ).toBe("published_dirty");
    expect(container.querySelector('[data-testid="preview-causality-resync-btn"]')).not.toBeNull();
    expect(quickGenBtn.textContent).toBe("변경사항 IM에 다시 반영하기");

    // Let debounced upsert_im autosave run (900ms+) -> isDirty becomes false in storage,
    // BUT hasUnpublishedEdits MUST remain true so published_dirty is NOT wiped out!
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(
      container.querySelector('[data-testid="preview-causality-bar"]')?.getAttribute("data-lifecycle")
    ).toBe("published_dirty");

    const storedRaw = window.localStorage.getItem("credeal-w-im-v4");
    expect(storedRaw).not.toBeNull();
    const storedList = JSON.parse(storedRaw || "[]");
    const publishedStored = storedList.find((it: { status?: string }) => it.status === "published");
    expect(publishedStored?.hasUnpublishedEdits).toBe(true);

    // Click [변경사항 IM에 다시 반영하기] in PreviewCausalityBar -> returns to published_clean
    const resyncBtn = container.querySelector(
      '[data-testid="preview-causality-resync-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      resyncBtn.click();
    });

    expect(
      container.querySelector('[data-testid="preview-causality-bar"]')?.getAttribute("data-lifecycle")
    ).toBe("published_clean");
    const storedAfterResync = JSON.parse(window.localStorage.getItem("credeal-w-im-v4") || "[]");
    const cleanPublished = storedAfterResync.find(
      (it: { status?: string }) => it.status === "published"
    );
    expect(cleanPublished?.hasUnpublishedEdits).toBe(false);
  });

  it("5. keeps progressive disclosures DOM-mounted via hidden class, updates Highlight #2 label by posture, and exposes Step 4 generate CTA", async () => {
    await act(async () => {
      root.render(<ImWorkspacePage />);
    });

    // Exact regression-guarded price label string
    expect(container.querySelector('[data-testid="im-tab-panel-specs"]')?.textContent).toContain(
      "2. 희망 매매가 ('원' 단위)"
    );

    // Price calculator toggle defaults collapsed, keeping DOM inputs mounted in strict order
    const priceCalcToggle = container.querySelector(
      '[data-testid="im-price-calculator-toggle"]'
    ) as HTMLButtonElement;
    const priceCalcPanel = container.querySelector(
      '[data-testid="im-price-calculator-panel"]'
    ) as HTMLElement;
    expect(priceCalcPanel.classList.contains("hidden")).toBe(true);

    const wonInput = container.querySelector('[data-testid="im-price-won-input"]')!;
    const eokInput = container.querySelector('[data-testid="im-price-eok-input"]')!;
    const manInput = container.querySelector('[data-testid="im-price-man-input"]')!;
    const srPriceInput = container.querySelector('[data-testid="im-asking-price-input"]')!;
    const gfaInput = container.querySelector('[data-testid="im-gfa-input"]')!;
    const landInput = container.querySelector('[data-testid="im-land-area-input"]')!;
    expect(eokInput).not.toBeNull();
    expect(manInput).not.toBeNull();
    expect(srPriceInput).not.toBeNull();
    expect(wonInput.compareDocumentPosition(gfaInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(gfaInput.compareDocumentPosition(landInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      priceCalcToggle.click();
    });
    expect(priceCalcPanel.classList.contains("hidden")).toBe(false);

    // Posture-dynamic Highlight #2 category label
    expect(container.querySelector('[data-testid="im-axios-postit-1"]')?.textContent).toContain(
      "장점 02 · 수익률"
    );
    const ownerPostureBtn = Array.from(
      container.querySelectorAll('[data-testid="im-posture-selector-section"] button')
    ).find((b) => b.textContent?.includes("사옥용")) as HTMLButtonElement;
    await act(async () => {
      ownerPostureBtn.click();
    });
    expect(container.querySelector('[data-testid="im-axios-postit-1"]')?.textContent).toContain(
      "장점 02 · 사옥 활용·입주"
    );
    const devPostureBtn = Array.from(
      container.querySelectorAll('[data-testid="im-posture-selector-section"] button')
    ).find((b) => b.textContent?.includes("신축·개발용")) as HTMLButtonElement;
    await act(async () => {
      devPostureBtn.click();
    });
    expect(container.querySelector('[data-testid="im-axios-postit-1"]')?.textContent).toContain(
      "장점 02 · 개발·토지 가치"
    );

    // Tab 2 RentRoll progressive importer toggle & plain Korean paste label
    const tab2Btn = container.querySelector(
      '[data-testid="im-editor-tab-rentroll"]'
    ) as HTMLButtonElement;
    await act(async () => {
      tab2Btn.click();
    });
    const rrImportToggle = container.querySelector(
      '[data-testid="im-rentroll-import-toggle"]'
    ) as HTMLButtonElement;
    const rrImporterWrap = container.querySelector(
      '[data-testid="im-rentroll-xlsx-importer"]'
    ) as HTMLElement;
    expect(rrImporterWrap.classList.contains("hidden")).toBe(true);
    expect(rrImporterWrap.querySelector('[data-testid="rentroll-file-input"]')).not.toBeNull();
    await act(async () => {
      rrImportToggle.click();
    });
    expect(rrImporterWrap.classList.contains("hidden")).toBe(false);

    const pasteBtn = container.querySelector('[data-testid="rent-roll-paste-btn"]');
    expect(pasteBtn?.textContent).toContain("복사한 임대 표 붙여넣기");
    expect(pasteBtn?.textContent).not.toContain("Ctrl");

    // Tab 4 keeps broker inputs mounted in DOM and triggers generation via im-step4-generate-btn
    const tab4Btn = container.querySelector(
      '[data-testid="im-editor-tab-media_publish"]'
    ) as HTMLButtonElement;
    await act(async () => {
      tab4Btn.click();
    });
    expect(container.querySelector('[data-testid="im-broker-name-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="im-brokerage-name-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="im-broker-phone-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="im-photo-dropzone"]')?.textContent).toContain(
      "지적도는 주소로 자동 생성됩니다"
    );

    const step4GenBtn = container.querySelector(
      '[data-testid="im-step4-generate-btn"]'
    ) as HTMLButtonElement;
    expect(step4GenBtn).not.toBeNull();
    await act(async () => {
      step4GenBtn.click();
    });
    expect(
      container.querySelector('[data-testid="preview-causality-bar"]')?.getAttribute("data-lifecycle")
    ).toBe("published_clean");
  });
});
