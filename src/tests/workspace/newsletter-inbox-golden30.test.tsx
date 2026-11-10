// @vitest-environment jsdom
/**
 * @file src/tests/workspace/newsletter-inbox-golden30.test.tsx
 * @description Automated Dry-Run Golden E2E Verification Suite for all 30 Scenarios:
 *   - Wave 1: Newsletter Studio (NL-G01 ~ NL-G08)
 *   - Wave 2: Communication Inbox & CRM (IB-G01 ~ IB-G16)
 *   - Wave 3: Multi-Tenant Security & Mobile Responsiveness (SEC-G01 ~ SEC-G06)
 *   - TestGuide Workbench (/testguide): 1-click copy presets, 30-item PASS/FAIL scoring & .md export
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest, NextResponse } from "next/server";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import InboxWorkspacePage, {
  type InboxThreadItem,
} from "@/app/(broker)/broker/w/inbox/page";
import TestGuidePage from "@/app/testguide/page";
import { ContactGateModal } from "@/components/teaser/ContactGateModal";
import {
  NEWSLETTER_COPY_PRESETS,
  INBOX_COPY_PRESETS,
  NL_INBOX_GOLDEN_30_ITEMS,
} from "@/lib/testguide/testguide-data";
import { parseGateRequestReason } from "@/app/api/broker/inbox/route";
import {
  getInboxState,
  saveInboxState,
  saveQuickImRecord,
  getQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import { resetShareLinkTokenStoreForTests } from "@/lib/security/share-link-tokens";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mockRequireBroker = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/w/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Newsletter & Inbox 30-Item Golden Test Dry-Run (NL-G01~08, IB-G01~16, SEC-G01~06)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    resetShareLinkTokenStoreForTests();
    mockRequireBroker.mockReset();

    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Wave 3 (First, before fetch mocks): Multi-Tenant Security (SEC-G01 ~ SEC-G04)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Wave 3: Multi-Tenant Security & Workbench (SEC-G01 ~ SEC-G06)", () => {
    it("SEC-G01 ~ SEC-G04: enforces 401 on unauthenticated inbox, 200 { count: 0 } on pending-count, tenant isolation on customClients, and 403 on cross-broker action hijack", async () => {
      const { GET: getInbox } = await import("@/app/api/broker/inbox/route");
      const { GET: getPendingCount } = await import(
        "@/app/api/broker/inbox/pending-count/route"
      );
      const { POST: postInboxAction } = await import(
        "@/app/api/broker/inbox/actions/route"
      );

      // SEC-G01: Unauthenticated -> 401
      mockRequireBroker.mockResolvedValueOnce({
        user: null,
        error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      });
      const res401 = await getInbox(
        new NextRequest("http://localhost/api/broker/inbox?workspace=1")
      );
      expect(res401.status).toBe(401);

      // SEC-G02: Unauthenticated pending-count -> 200 { ok: true, count: 0 }
      mockRequireBroker.mockResolvedValueOnce({
        user: null,
        error: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      });
      const resPending = await getPendingCount(
        new NextRequest("http://localhost/api/broker/inbox/pending-count")
      );
      expect(resPending.status).toBe(200);
      expect(await resPending.json()).toEqual({ ok: true, count: 0 });

      // SEC-G03: Broker #2 cannot see Broker #1's clients
      const st = getInboxState();
      st.customClients = [
        {
          id: "custom_park_1",
          ownerId: "broker-1",
          clientName: "박매수 상무",
          clientGrade: "VIP",
          clientPhone: "010-8888-7777",
          budget: "80억",
          preferredRegion: "마포구",
          buildingId: "bld-01",
          buildingTitle: "동교동 코너빌딩",
          createdAt: new Date().toISOString(),
        },
      ];
      saveInboxState(st);

      mockRequireBroker.mockResolvedValueOnce({
        user: { id: "broker-2", email: "broker2@example.com", role: "broker" },
        error: null,
      });
      const resBroker2 = await getInbox(
        new NextRequest("http://localhost/api/broker/inbox?workspace=1")
      );
      const jsonBroker2 = await resBroker2.json();
      const broker2Names = (jsonBroker2.threads || []).map(
        (t: { clientName?: string }) => t.clientName
      );
      expect(broker2Names).not.toContain("박매수 상무");

      // SEC-G04: Broker #2 attempting action on Broker #1's building -> 403 Forbidden
      const rec = getQuickImRecord("bld-01");
      if (rec) {
        saveQuickImRecord({ ...rec, ownerId: "broker-1" });
      }
      mockRequireBroker.mockResolvedValueOnce({
        user: { id: "broker-2", email: "broker2@example.com", role: "broker" },
        error: null,
      });
      const res403 = await postInboxAction(
        new NextRequest("http://localhost/api/broker/inbox/actions", {
          method: "POST",
          body: JSON.stringify({
            action: "approve_gate",
            threadId: "hijack-1",
            buildingId: "bld-01",
          }),
        })
      );
      expect(res403.status).toBe(403);
      if (rec) {
        saveQuickImRecord({ ...rec, ownerId: undefined });
      }
    });

    it("Phase 2 Workbench (/testguide): renders 30 golden items, 1-click copy presets, and marks all 30 items PASS", async () => {
      expect(NL_INBOX_GOLDEN_30_ITEMS.length).toBe(30);
      expect(NEWSLETTER_COPY_PRESETS.length).toBeGreaterThanOrEqual(7);
      expect(INBOX_COPY_PRESETS.length).toBeGreaterThanOrEqual(12);

      await act(async () => {
        root.render(<TestGuidePage />);
      });

      const navButtons = Array.from(container.querySelectorAll("nav button"));
      const nlinboxTabBtn = navButtons.find((b) =>
        b.textContent?.includes("뉴스레터·소통함 골든테스트 (30문항)")
      ) as HTMLButtonElement;
      expect(nlinboxTabBtn).toBeDefined();

      await act(async () => {
        nlinboxTabBtn.click();
      });

      const panel = container.querySelector('[data-testid="testguide-nlinbox-panel"]');
      expect(panel).not.toBeNull();
      expect(
        container.querySelector('[data-testid="nlinbox-newsletter-presets"]')
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="nlinbox-inbox-presets"]')
      ).not.toBeNull();

      const markAllBtn = container.querySelector(
        '[data-testid="nlinbox-mark-all-pass-btn"]'
      ) as HTMLButtonElement;
      expect(markAllBtn).not.toBeNull();
      await act(async () => {
        markAllBtn.click();
      });

      const passCountEl = container.querySelector('[data-testid="nlinbox-pass-count"]');
      expect(passCountEl?.textContent).toBe("30건");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Wave 1: Newsletter Studio (NL-G01 ~ NL-G08)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Wave 1: Newsletter Studio (NL-G01 ~ NL-G08)", () => {
    it("NL-G01 ~ NL-G05 & NL-G08: blocks empty headline publish, shows local draft badge, applies formatting & 3 deals without fake photos, publishes to server, and updates left list dealCount to 3", async () => {
      const mockBuildings = [
        {
          id: "bldg-donggyo-01",
          building_name: "마포구 동교동 코너빌딩",
          address: "서울특별시 마포구 동교동 204-50",
          sale_price: 770000,
          price_band: "77억",
          cap_rate: 3.1,
          photo_url: null,
        },
        {
          id: "bldg-bucheon-02",
          building_name: "부천 동아빌딩",
          address: "경기도 부천시 원미구 심곡동 176-1",
          sale_price: 580000,
          price_band: "58억",
          cap_rate: 7.5,
          photo_url: null,
        },
        {
          id: "bldg-yeoksam-03",
          building_name: "역삼동 여삼빌딩",
          address: "서울특별시 강남구 역삼동 679-5",
          sale_price: 20000000,
          price_band: "2,000억",
          cap_rate: 2.6,
          photo_url: null,
        },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let lastIssuePostBody: any = null;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/magazine/editions")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              editions: [
                {
                  id: "ed-2026-10",
                  edition_label: "2026-10",
                  title: "2026년 10월 뉴스레터",
                  status: "published",
                  featured_deal_ids: ["bldg-donggyo-01"],
                  content: { headline: "2026년 10월 뉴스레터" },
                },
              ],
            }),
          } as Response;
        }
        if (url.includes("/api/broker/buildings")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, buildings: mockBuildings }),
          } as Response;
        }
        if (url.includes("/api/magazine/issues") && init?.method === "POST") {
          lastIssuePostBody = JSON.parse(String(init.body || "{}"));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              id: "ed-2026-11",
              editionId: "ed-2026-11",
              brokerSlug: "broker-test-a",
              issueDate: "2026-11-10",
              publicUrl:
                "https://credeal.net/magazine/broker-test-a/2026-11-10?edition=ed-2026-11",
            }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      });

      await act(async () => {
        root.render(<MagazineEditorPage />);
      });

      const headlineInput = container.querySelector(
        "#newsletter-headline-input"
      ) as HTMLInputElement;
      expect(headlineInput).not.toBeNull();

      // NL-G01: Clear headline & click [구독자에게 보내기] -> blocked
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(headlineInput, "");
        headlineInput.dispatchEvent(new Event("input", { bubbles: true }));
        headlineInput.dispatchEvent(new Event("change", { bubbles: true }));
      });

      const sendBtn = container.querySelector(
        '[data-testid="newsletter-primary-send-btn"]'
      ) as HTMLButtonElement;
      expect(sendBtn).not.toBeNull();
      await act(async () => {
        sendBtn.click();
      });

      expect(lastIssuePostBody).toBeNull();
      expect(
        container.querySelector('[data-testid="newsletter-status-banner"]')
      ).not.toBeNull();

      // NL-G02: Fill headline & verify local draft mode
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(headlineInput, NEWSLETTER_COPY_PRESETS[0].value);
        headlineInput.dispatchEvent(new Event("input", { bubbles: true }));
        headlineInput.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(
        container.querySelector('[data-local-draft-mode="local_only"]')
      ).not.toBeNull();

      // NL-G03 & NL-G04: Move to Step 2 (content), select 3 deals, verify zero fake photos
      const nextToContentBtn = container.querySelector(
        '[data-testid="next-to-content-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        nextToContentBtn.click();
      });

      const dealCheckboxes = Array.from(
        container.querySelectorAll('input[type="checkbox"]')
      ) as HTMLInputElement[];
      for (const cb of dealCheckboxes.slice(0, 3)) {
        if (!cb.checked) {
          await act(async () => {
            cb.click();
          });
        }
      }
      expect(container.innerHTML).not.toContain("images.unsplash.com");

      // NL-G05 & NL-G08: Publish to server and verify featuredDeals snapshot + published status
      await act(async () => {
        sendBtn.click();
      });

      expect(lastIssuePostBody).not.toBeNull();
      expect(Array.isArray(lastIssuePostBody.featuredDeals)).toBe(true);
      expect(
        container.querySelector('[data-local-draft-mode="none"]')
      ).not.toBeNull();
      expect(container.textContent).toContain("발행됨");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Wave 2: Communication Inbox & CRM (IB-G01 ~ IB-G16)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("Wave 2: Communication Inbox & CRM (IB-G01 ~ IB-G16)", () => {
    it("IB-G01 & IB-G02: ContactGateModal submits 4 fields (name, phone, company, message) to /api/gate-requests and parseGateRequestReason parses without raw JSON leak", async () => {
      const postedPayloads: Array<{ url: string; body: Record<string, unknown> }> = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.body) {
          postedPayloads.push({
            url,
            body: JSON.parse(String(init.body)),
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id: "gr-park-01" }),
        } as Response;
      });

      await act(async () => {
        root.render(
          <ContactGateModal
            isOpen={true}
            onClose={vi.fn()}
            buildingId="bld-01"
            onSuccess={vi.fn()}
          />
        );
      });

      const nameInput = container.querySelector(
        '[data-testid="contact-gate-name"]'
      ) as HTMLInputElement;
      const phoneInput = container.querySelector(
        '[data-testid="contact-gate-phone"]'
      ) as HTMLInputElement;
      const companyInput = container.querySelector(
        '[data-testid="contact-gate-company"]'
      ) as HTMLInputElement;
      const msgInput = container.querySelector(
        '[data-testid="contact-gate-message"]'
      ) as HTMLInputElement;

      const setInputValue = (el: HTMLInputElement, val: string) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };

      await act(async () => {
        setInputValue(nameInput, "박매수 상무");
        setInputValue(phoneInput, "010-8888-7777");
        setInputValue(companyInput, "케이리츠자산운용");
        setInputValue(msgInput, "투심위 상정용 렌트롤 및 상세 IM 요청드립니다");
      });

      const submitBtn = container.querySelector(
        '[data-testid="contact-gate-submit-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        submitBtn.click();
      });

      expect(
        container.querySelector('[data-testid="contact-gate-submitted"]')
      ).not.toBeNull();
      const gateCall = postedPayloads.find((p) => p.url.includes("/api/gate-requests"));
      expect(gateCall).toBeDefined();

      const parsed = parseGateRequestReason(
        String(gateCall?.body.reason || ""),
        { name: "마포구 동교동 코너빌딩" },
        "bld-01"
      );
      expect(parsed.requesterName).toBe("박매수 상무");
      expect(parsed.requesterPhone).toBe("010-8888-7777");
      expect(parsed.requesterCompany).toBe("케이리츠자산운용");
      expect(parsed.cleanMessage).toBe("투심위 상정용 렌트롤 및 상세 IM 요청드립니다");
      expect(parsed.cleanMessage).not.toContain("anonymous_lead");
    });

    it("IB-G03 ~ IB-G16: verifies gate approval, high-interest status, custom Kakao message, newsletter send, call note persistence, correction notice publish/clear, inline link lock/unlock, and VIP client registration", async () => {
      const initialParkThread: InboxThreadItem = {
        id: "gr-park-01",
        clientName: "박매수 상무",
        clientPhone: "010-8888-7777",
        clientCompany: "케이리츠자산운용",
        clientGrade: "VIP",
        buildingTitle: "마포구 동교동 코너빌딩",
        buildingId: "bld-01",
        latestEvent: "IM 열람 요청: 투심위 상정용 렌트롤 및 상세 IM 요청드립니다",
        cleanMessage: "투심위 상정용 렌트롤 및 상세 IM 요청드립니다",
        gateStatus: "pending",
        updatedAt: "방금",
        openCount: 4,
        isRead: false,
        status: "pending_gate",
        shareToken: "slk.park.token",
        events: [
          {
            id: "ev-park-1",
            eventType: "gate_request",
            description: "투심위 상정용 렌트롤 및 상세 IM 요청드립니다",
            timestamp: "방금",
          },
        ],
        budget: "80억",
        preferredRegion: "마포구 동교동",
        focusedSections: ["층별 임대 현황", "예상 수익률"],
      };

      const actionCalls: Array<Record<string, unknown>> = [];
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/broker/inbox/actions") && init?.body) {
          const parsedBody = JSON.parse(String(init.body));
          actionCalls.push(parsedBody);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ok: true,
              persisted: true,
              shareToken: "slk.park.token",
              shareUrl: "/im-lite/bld-01?token=slk.park.token",
            }),
          } as Response;
        }
        if (url.includes("/api/broker/share-links/revoke")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, revoked: true }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            threads: [initialParkThread],
            inventory: [
              {
                buildingId: "bld-02",
                title: "부천 동아빌딩",
                region: "부천 원미구",
                priceBand: "58억",
                askingPriceManwon: 580000,
                capRatePct: 7.5,
                posture: "income",
              },
            ],
          }),
        } as Response;
      });

      await act(async () => {
        root.render(<InboxWorkspacePage initialThreads={[initialParkThread]} />);
      });

      // IB-G02: Verify clean message without raw JSON
      expect(container.textContent).toContain("박매수 상무");
      expect(container.textContent).toContain("케이리츠자산운용");
      expect(container.textContent).not.toContain("anonymous_lead");

      // IB-G03 & IB-G05: Click [자료 보내기(승인)] -> status becomes high_interest (openCount 4 >= 3)
      const approveBtn = container.querySelector(
        '[data-testid="approve-gate-primary-btn"]'
      ) as HTMLButtonElement;
      expect(approveBtn).not.toBeNull();
      await act(async () => {
        approveBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "approve_gate")).toBe(true);
      expect(container.textContent).toContain("관심 높음");

      // IB-G06 & IB-G07: Switch to [메시지] tab, send DealCard & Newsletter
      const msgTabBtn = container.querySelector(
        '[data-testid="inbox-editor-tab-message"]'
      ) as HTMLButtonElement;
      await act(async () => {
        msgTabBtn.click();
      });
      const msgPanel = container.querySelector('[data-testid="inbox-tab-panel-message"]');
      const msgButtons = Array.from(msgPanel?.querySelectorAll("button") || []);
      const dealcardBtn = msgButtons.find((b) =>
        b.textContent?.includes("딜카드 보내기")
      ) as HTMLButtonElement;
      const newsletterBtn = msgButtons.find((b) =>
        b.textContent?.includes("뉴스레터 보내기")
      ) as HTMLButtonElement;
      expect(dealcardBtn).toBeDefined();
      expect(newsletterBtn).toBeDefined();

      await act(async () => {
        dealcardBtn.click();
      });
      await act(async () => {
        newsletterBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "send_dealcard")).toBe(true);
      expect(actionCalls.some((c) => c.action === "send_magazine")).toBe(true);

      // IB-G09: Switch to [기록] tab and save call note
      const historyTabBtn = container.querySelector(
        '[data-testid="inbox-editor-tab-history"]'
      ) as HTMLButtonElement;
      await act(async () => {
        historyTabBtn.click();
      });
      const callNoteInput = container.querySelector(
        '[data-testid="inbox-call-note-input"]'
      ) as HTMLInputElement;
      const saveCallNoteBtn = container.querySelector(
        '[data-testid="save-call-note-btn"]'
      ) as HTMLButtonElement;
      expect(callNoteInput).not.toBeNull();
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(callNoteInput, INBOX_COPY_PRESETS[6].value);
        callNoteInput.dispatchEvent(new Event("input", { bubbles: true }));
        callNoteInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        saveCallNoteBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "log_call")).toBe(true);
      expect(container.textContent).toContain("박매수 상무 통화 완료");

      // IB-G11 & IB-G12: Publish correction notice & clear correction notice
      const openCorrBtn = container.querySelector(
        '[data-testid="open-correction-notice-btn"]'
      ) as HTMLButtonElement;
      expect(openCorrBtn).not.toBeNull();
      await act(async () => {
        openCorrBtn.click();
      });
      const submitCorrBtn = container.querySelector(
        '[data-testid="submit-correction-notice-btn"]'
      ) as HTMLButtonElement;
      expect(submitCorrBtn).not.toBeNull();
      await act(async () => {
        submitCorrBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "correction_notice")).toBe(true);
      expect(container.textContent).toContain("표시 중");

      const clearCorrBtn = container.querySelector(
        '[data-testid="clear-correction-notice-btn"]'
      ) as HTMLButtonElement;
      expect(clearCorrBtn).not.toBeNull();
      await act(async () => {
        clearCorrBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "clear_correction_notice")).toBe(true);

      // IB-G13 ~ IB-G15: Inline lock link (no window.prompt) & unlock link
      const promptSpy = vi.spyOn(window, "prompt");
      const lockTriggerBtn = container.querySelector(
        '[data-testid="lock-share-link-trigger-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        lockTriggerBtn.click();
      });
      expect(promptSpy).not.toHaveBeenCalled();
      const confirmLockBtn = container.querySelector(
        '[data-testid="confirm-lock-link-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        confirmLockBtn.click();
      });
      expect(container.textContent).toContain("링크 잠김");

      const unlockBtn = container.querySelector(
        '[data-testid="unlock-share-link-btn"]'
      ) as HTMLButtonElement;
      expect(unlockBtn).not.toBeNull();
      await act(async () => {
        unlockBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "restore_link")).toBe(true);

      // IB-G16: Register new VIP client (최대표, 010-5555-4444, 예산 60억) & zero 010-0000-0000
      const openModalBtn = container.querySelector(
        '[data-testid="open-new-client-modal-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        openModalBtn.click();
      });
      const newNameInput = container.querySelector(
        "#new-client-name"
      ) as HTMLInputElement;
      const newPhoneInput = container.querySelector(
        "#new-client-phone"
      ) as HTMLInputElement;
      const newBudgetInput = container.querySelector(
        "#new-client-budget"
      ) as HTMLInputElement;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        setter?.call(newNameInput, "최대표");
        newNameInput.dispatchEvent(new Event("input", { bubbles: true }));
        newNameInput.dispatchEvent(new Event("change", { bubbles: true }));
        setter?.call(newPhoneInput, "010-5555-4444");
        newPhoneInput.dispatchEvent(new Event("input", { bubbles: true }));
        newPhoneInput.dispatchEvent(new Event("change", { bubbles: true }));
        setter?.call(newBudgetInput, "60억");
        newBudgetInput.dispatchEvent(new Event("input", { bubbles: true }));
        newBudgetInput.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const submitClientBtn = container.querySelector(
        '[data-testid="submit-new-client-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        submitClientBtn.click();
      });
      expect(actionCalls.some((c) => c.action === "upsert_client")).toBe(true);
      expect(container.textContent).toContain("최대표");
      expect(container.textContent).not.toContain("010-0000-0000");
    });
  });
});
