// @vitest-environment jsdom
/**
 * @file src/tests/workspace/dealcard-inbox-sota-sync.test.tsx
 * @description Wave 1 Verification Suite: DealCard & Inbox Senior UX Physics
 *   (>=44px touch targets, >=15px text) + Bidirectional Editor <-> Preview Causality Sync.
 */

import React, { act } from "react";
import fs from "fs";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import { PreSendConfirmationSheet } from "@/components/broker/deal-card/PreSendConfirmationSheet";
import InboxWorkspacePage, {
  type InboxThreadItem,
} from "@/app/(broker)/broker/w/inbox/page";

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, prefetch: vi.fn() }),
  usePathname: () => "/broker/w/dealcards",
  useSearchParams: () => new URLSearchParams(),
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

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

describe("DealCard & Inbox SOTA Bidirectional Sync & Senior Physics (Wave 1)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    mockPush.mockReset();
    mockReplace.mockReset();

    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(
      (cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      }
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

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

  it("[DC-SYNC-01] transitions pre_generation -> live_draft, syncs click/focus bidirectionally, and tracks published_dirty -> published_clean", async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/profile")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              display_name: "김철수 공인중개사",
              company: "크리딜 중개법인",
              phone: "010-1234-5678",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        url.includes("/api/broker/workspace/summary") &&
        init?.method === "PATCH"
      ) {
        return new Response(
          JSON.stringify({ ok: true, card4: { card4_version: 2 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true, buildings: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });
    await flushMicrotasks();

    // 1. Default sample card renders in live_draft state with KakaoBubblePreview
    const bar0 = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(bar0?.getAttribute("data-lifecycle")).toBe("live_draft");
    expect(
      container.querySelector('[data-testid="kakao-bubble-preview"]')
    ).not.toBeNull();

    // 2. Click [+ 새 딜카드 만들기] -> enters pre_generation state
    const newBtn = container.querySelector(
      '[data-testid="workspace-new-dealcard-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      newBtn.click();
    });
    await flushMicrotasks();

    const barPre = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(barPre?.getAttribute("data-lifecycle")).toBe("pre_generation");
    expect(
      container.querySelector('[data-testid="dealcard-pregeneration-card"]')
    ).not.toBeNull();

    // 3. Click [✍️ 메모 없이 직접 입력하기] on Pregeneration card -> expands editor & switches to KakaoBubblePreview
    const manualBtn = container.querySelector(
      '[data-testid="dealcard-pregeneration-card-primary-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      manualBtn.click();
    });
    await flushMicrotasks();

    const card4Stage = container.querySelector(
      '[data-testid="dealcard-card4-stage"]'
    ) as HTMLElement;
    expect(card4Stage?.getAttribute("data-collapsed")).toBe("false");
    expect(
      container.querySelector('[data-testid="kakao-bubble-preview"]')
    ).not.toBeNull();

    // 4. Bidirectional click-to-edit from preview quadrant -> focuses #card4-region-input
    const regionCell = container.querySelector(
      '[data-testid="og-quadrant-region"]'
    ) as HTMLElement;
    await act(async () => {
      regionCell.click();
    });
    await flushMicrotasks();

    const regionInput = container.querySelector(
      "#card4-region-input"
    ) as HTMLInputElement;
    expect(document.activeElement).toBe(regionInput);
    expect(regionCell.getAttribute("data-preview-active")).toBe("true");

    // 5. Reverse focus sync: focusing #card4-headline-input activates preview-unit-headline
    const headlineInput = container.querySelector(
      "#card4-headline-input"
    ) as HTMLInputElement;
    await act(async () => {
      headlineInput.focus();
    });
    const headlinePreview = container.querySelector(
      '[data-testid="preview-unit-headline"]'
    ) as HTMLElement;
    expect(headlinePreview?.getAttribute("data-preview-active")).toBe("true");

    // Fill minimal valid blind values & headline so PreSend allows copy
    await act(async () => {
      setNativeInputValue(regionInput, "강남구 삼성동");
      setNativeInputValue(
        container.querySelector("#card4-use-input") as HTMLInputElement,
        "근린생활시설"
      );
      setNativeInputValue(
        container.querySelector("#card4-area-input") as HTMLInputElement,
        "연면적 220평"
      );
      setNativeInputValue(
        container.querySelector("#card4-priceband-input") as HTMLInputElement,
        "90억대"
      );
      setNativeInputValue(headlineInput, "삼성동 코너 빌딩");
      setNativeInputValue(
        container.querySelector("#card4-point-input-0") as HTMLInputElement,
        "역세권 코너 위치"
      );
    });
    await flushMicrotasks();

    // 6. Send / copy DealCard -> published_clean
    const sendBtn = container.querySelector(
      '[data-testid="workspace-primary-send-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      sendBtn.click();
    });
    await flushMicrotasks();

    const copyBtn = container.querySelector(
      '[data-testid="presend-copy-btn"]'
    ) as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    await act(async () => {
      copyBtn.click();
    });
    await flushMicrotasks();

    const barClean = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(barClean?.getAttribute("data-lifecycle")).toBe("published_clean");
    const liveLink = container.querySelector(
      '[data-testid="dealcard-live-link"]'
    ) as HTMLAnchorElement;
    expect(liveLink?.getAttribute("href")).toContain("/dc/");

    // 7. Edit after sending -> published_dirty -> resync -> published_clean
    await act(async () => {
      setNativeInputValue(
        container.querySelector("#card4-region-input") as HTMLInputElement,
        "강남구 청담동"
      );
    });
    await flushMicrotasks();

    const barDirty = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(barDirty?.getAttribute("data-lifecycle")).toBe("published_dirty");

    const resyncBtn = container.querySelector(
      '[data-testid="preview-causality-resync-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      resyncBtn.click();
    });
    await flushMicrotasks();

    const barResynced = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(barResynced?.getAttribute("data-lifecycle")).toBe("published_clean");
  });

  it("[IB-SYNC-01] links Inbox Column 3 summary/causality actions directly to Editor tabs and input focus", async () => {
    const pendingThread: InboxThreadItem = {
      id: "thread-pending-01",
      clientName: "박매수 대표",
      clientPhone: "010-2222-3333",
      clientGrade: "VIP",
      buildingTitle: "마포구 동교동 코너빌딩",
      buildingId: "bld-sync-01",
      latestEvent: "IM 열람 요청",
      cleanMessage: "내부 수익률 검토 요청드립니다.",
      gateStatus: "pending",
      updatedAt: "방금",
      openCount: 3,
      isRead: false,
      status: "pending_gate",
      shareToken: "tok-sync-01",
      shareUrl: "/im-lite/bld-sync-01?token=tok-sync-01",
      events: [],
      budget: "80억",
      preferredRegion: "마포구 동교동",
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/inbox/summary")) {
        return new Response(
          JSON.stringify({
            ok: true,
            brokerId: "brk-sync-01",
            threads: [pendingThread],
            inventory: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={[pendingThread]} />);
    });
    await flushMicrotasks();

    // Both Column 2 one-stop dispatch hub and Column 3 call-note/timeline are mounted simultaneously
    expect(
      container.querySelector('[data-testid="inbox-outbound-channel-bar"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-tab-panel-history"]')
    ).not.toBeNull();
    expect(
      container.querySelector("#inbox-kakao-headline-input")
    ).not.toBeNull();

    // Click Column 3 '열람 횟수' editable unit -> focuses #inbox-call-note-input directly
    const historyUnit = container.querySelector(
      '[data-testid="preview-unit-inbox-history"]'
    ) as HTMLElement;
    expect(historyUnit).not.toBeNull();

    await act(async () => {
      historyUnit.click();
    });
    await flushMicrotasks();

    expect(document.activeElement).toBe(
      container.querySelector("#inbox-call-note-input")
    );
  });

  it("[DC-P0-FAILCLOSED-01] blocks clipboard copy and 'sent' status transition when mark_sent returns 422 STATUTORY_DISCLOSURE_INCOMPLETE", async () => {
    const clipboardSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardSpy },
    });

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/profile")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              display_name: "홍길동",
              company: "크리딜 중개법인",
              phone: "010-1234-5678",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (
        url.includes("/api/broker/workspace/summary") &&
        init?.method === "PATCH"
      ) {
        const payload = JSON.parse(String(init.body || "{}"));
        if (payload.action === "mark_sent") {
          return new Response(
            JSON.stringify({
              ok: false,
              code: "STATUTORY_DISCLOSURE_INCOMPLETE",
              error:
                "법정 중개사무소 필수 정보(개설등록번호)를 입력해야 발행할 수 있습니다.",
              missingFields: ["office_reg_number"],
            }),
            { status: 422, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ ok: true, version: 2, card4: { card4_version: 2 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true, dealcards: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });
    await flushMicrotasks();

    const sendBtn = container.querySelector(
      '[data-testid="workspace-primary-send-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      sendBtn.click();
    });
    await flushMicrotasks();
    await flushMicrotasks();

    const copyBtn = container.querySelector(
      '[data-testid="presend-copy-btn"]'
    ) as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn.disabled).toBe(false);

    await act(async () => {
      copyBtn.click();
    });
    await flushMicrotasks();

    expect(clipboardSpy).not.toHaveBeenCalled();
    const bar = container.querySelector(
      '[data-testid="preview-causality-bar"]'
    ) as HTMLElement;
    expect(bar?.getAttribute("data-lifecycle")).toBe("live_draft");
    expect(container.querySelector('[data-testid="dealcard-live-link"]')).toBeNull();
    const errBox = container.querySelector(
      '[data-testid="presend-publish-error"]'
    ) as HTMLElement;
    expect(errBox?.textContent).toContain("개설등록번호");
    const profileLink = container.querySelector(
      '[data-testid="presend-profile-link"]'
    ) as HTMLAnchorElement;
    expect(profileLink?.getAttribute("href")).toBe("/broker/profile");
  });

  it("[DC-P0-PRICEBAND-01] disables PreSend actions when priceBand fails validateBlindPriceBand", async () => {
    await act(async () => {
      root.render(
        <PreSendConfirmationSheet
          isOpen={true}
          onClose={vi.fn()}
          dealId="deal-bad-band"
          isSaved={true}
          onFlushSave={vi.fn(async () => true)}
          card4={{
            card4_version: 1,
            headline: "역세권 코너 수익형 빌딩",
            posture: "income",
            region: "강남구 역삼동",
            use: "근린생활시설",
            area: "연면적 300평",
            priceBand: "95억대",
            points: ["역세권 입지", "전층 만실 운영", "안정적 수익 구조"],
            provenance: { points: ["broker", "broker", "broker"] },
          }}
        />
      );
    });

    expect(
      container.querySelector('[data-testid="presend-priceband-alert"]')
    ).not.toBeNull();
    const kakaoBtn = container.querySelector(
      '[data-testid="presend-kakao-btn"]'
    ) as HTMLButtonElement;
    const copyBtn = container.querySelector(
      '[data-testid="presend-copy-btn"]'
    ) as HTMLButtonElement;
    expect(kakaoBtn.disabled).toBe(true);
    expect(copyBtn.disabled).toBe(true);
  });

  it("[DC-P1-EMPTY-SEED-01] does not inject prod-blocked INITIAL_BUILDINGS (bld-01) when broker account is empty in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/broker/profile")) {
          return new Response(
            JSON.stringify({ ok: true, data: { display_name: "테스트 중개사" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ ok: true, dealcards: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      await act(async () => {
        root.render(<DealCardsWorkspacePage />);
      });
      await flushMicrotasks();

      expect(
        container.querySelector('[data-testid="dealcard-sample-badge"]')
      ).toBeNull();
      expect(container.textContent).not.toContain("마포구 서교동");
      expect(
        container.querySelector('[data-testid="dealcard-pregeneration-card"]')
      ).not.toBeNull();

      const memoBox = container.querySelector(
        '[data-testid="dealcard-top-memo-textarea"]'
      ) as HTMLTextAreaElement;
      expect(memoBox).not.toBeNull();
      await act(async () => {
        setNativeInputValue(memoBox, "강남구 논현동 120억 근생 빌딩");
      });
      await flushMicrotasks();
      expect(memoBox.value).toContain("논현동");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("[SENIOR-PHYSICS-01] has zero sub-44px interactive heights or text-xs tokens in upgraded DealCard & Inbox UI files", () => {
    const filesToCheck = [
      "src/components/workspace/list/WorkspaceList.tsx",
      "src/components/broker/deal-card/PairedMemoTopCard.tsx",
      "src/components/broker/deal-card/Card4ConfirmCard.tsx",
      "src/components/broker/deal-card/KakaoBubblePreview.tsx",
      "src/app/(broker)/broker/w/dealcards/page.tsx",
      "src/app/(broker)/broker/w/inbox/page.tsx",
    ];

    for (const rel of filesToCheck) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf-8");
      const matches = src.match(/min-h-\[(3[0-9]|4[0-3])px\]|\btext-xs\b/g);
      expect(matches, `${rel} contained sub-44px/text-xs: ${matches}`).toBeNull();
    }
  });
});
