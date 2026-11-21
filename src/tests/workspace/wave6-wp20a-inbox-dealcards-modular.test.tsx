/**
 * @vitest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BANNED_UI_TERMS } from "@/lib/ux/lexicon";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let currentSearchString = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/broker/w/inbox",
  useSearchParams: () => new URLSearchParams(currentSearchString),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import InboxWorkspacePage from "@/app/(broker)/broker/w/inbox/page";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeSelectValue(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Wave 6 — WP-20A: Inbox & DealCards Modularization + CRM/Audit/Profile Wiring", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    currentSearchString = "";
    mockPush.mockReset();
    mockReplace.mockReset();
    window.localStorage.clear();
    window.sessionStorage.clear();
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

  it("wires ContactBulkImportModal CTA in header & empty state and refreshes threads on import", async () => {
    let importedDone = false;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes("/api/broker/inbox/import-contacts")) {
          importedDone = true;
          return new Response(
            JSON.stringify({
              ok: true,
              importedCount: 1,
              updatedCount: 0,
              skippedCount: 0,
              subscriberAddedCount: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/api/broker/inbox") && (!init?.method || init.method === "GET")) {
          const threads = importedDone
            ? [
                {
                  id: "custom_imported_1",
                  clientName: "일괄등록 VIP고객",
                  clientCompany: "메디컬그룹",
                  clientPhone: "010-7777-8888",
                  clientEmail: "vip@medical.example.com",
                  clientGrade: "VIP",
                  isVip: true,
                  clientRole: "buyer",
                  buildingId: "",
                  buildingTitle: "매물 배정 전 · 신규 고객",
                  status: "active",
                  openCount: 0,
                  updatedAt: "2026-11-15T10:00:00Z",
                  events: [],
                  dispatchHistory: [],
                },
              ]
            : [];
          return new Response(
            JSON.stringify({
              ok: true,
              userId: "broker-wp20a",
              subscriptionTier: "free",
              threads,
              inventory: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

    await act(async () => {
      root.render(<InboxWorkspacePage initialThreads={[]} />);
    });
    await flushMicrotasks();

    const headerBulkBtn = container.querySelector(
      '[data-testid="inbox-open-bulk-import-btn"]'
    ) as HTMLButtonElement;
    const emptyBulkBtn = container.querySelector(
      '[data-testid="inbox-empty-bulk-import-btn"]'
    ) as HTMLButtonElement;
    expect(headerBulkBtn).not.toBeNull();
    expect(headerBulkBtn.textContent).toContain("엑셀·명단 대량 등록");
    expect(headerBulkBtn.className).toContain("min-h-[44px]");
    expect(emptyBulkBtn).not.toBeNull();

    await act(async () => {
      headerBulkBtn.click();
    });

    const modalEl = document.body.querySelector(
      '[data-testid="contact-bulk-import-modal"]'
    );
    expect(modalEl).not.toBeNull();

    const pasteModeBtn = document.body.querySelector(
      '[data-testid="bulk-input-mode-paste"]'
    ) as HTMLButtonElement;
    await act(async () => {
      pasteModeBtn.click();
    });

    const pasteArea = document.body.querySelector(
      '[data-testid="bulk-contact-paste-textarea"]'
    ) as HTMLTextAreaElement;
    await act(async () => {
      setNativeInputValue(
        pasteArea,
        "일괄등록 VIP고객\t010-7777-8888\tvip@medical.example.com\t매수\tVIP\t수신동의"
      );
    });

    const parseNextBtn = document.body.querySelector(
      '[data-testid="bulk-parse-paste-next-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      parseNextBtn.click();
    });

    const step2NextBtn = document.body.querySelector(
      '[data-testid="step2-next-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      step2NextBtn.click();
    });

    const complianceCheckbox = document.body.querySelector(
      '[data-testid="compliance-confirm-checkbox"]'
    ) as HTMLInputElement;
    await act(async () => {
      complianceCheckbox.click();
    });

    const submitBulkBtn = document.body.querySelector(
      '[data-testid="bulk-import-submit-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      submitBulkBtn.click();
    });
    await flushMicrotasks();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/broker/inbox/import-contacts",
      expect.objectContaining({ method: "POST" })
    );
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_imported_1"]')
    ).not.toBeNull();
  });

  it("filters threads by structured CRM chips (VIP/매수/매도/이메일 가능) and sends structured fields on upsert_client", async () => {
    const actionPayloads: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/broker/inbox/actions") && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
        actionPayloads.push(body);
        return new Response(
          JSON.stringify({ ok: true, clientId: "custom_new_struct" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          userId: "broker-wp20a",
          subscriptionTier: "free",
          threads: [
            {
              id: "custom_vip_buyer",
              clientName: "박원장",
              clientCompany: "강남정형외과",
              clientPhone: "010-1111-2222",
              clientEmail: "park@clinic.example.com",
              clientGrade: "VIP",
              isVip: true,
              clientRole: "buyer",
              emailDeliveryStatus: "ok",
              buildingId: "bld-gangnam",
              buildingTitle: "강남구 역삼동 메디컬빌딩",
              status: "pending_gate",
              openCount: 2,
              updatedAt: "2026-11-15T10:00:00Z",
              events: [],
              dispatchHistory: [],
            },
            {
              id: "custom_seller_bounced",
              clientName: "최건물주",
              clientCompany: "서초자산",
              clientPhone: "010-3333-4444",
              clientEmail: "bounced@seller.example.com",
              clientGrade: "일반",
              isVip: false,
              clientRole: "seller",
              emailDeliveryStatus: "bounced",
              buildingId: "bld-seocho",
              buildingTitle: "서초구 서초동 근생빌딩",
              status: "active",
              openCount: 0,
              updatedAt: "2026-11-15T09:00:00Z",
              events: [],
              dispatchHistory: [],
            },
            {
              id: "view_anon_1",
              clientName: "링크 열람 고객",
              clientCompany: "공유 링크 열람",
              clientPhone: "",
              buildingId: "bld-gangnam",
              buildingTitle: "강남구 역삼동 메디컬빌딩",
              status: "active",
              openCount: 3,
              updatedAt: "2026-11-15T08:00:00Z",
              events: [],
              dispatchHistory: [],
            },
          ],
          inventory: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    await act(async () => {
      root.render(<InboxWorkspacePage />);
    });
    await flushMicrotasks();

    // VIP filter
    const vipChip = container.querySelector(
      '[data-testid="inbox-filter-chip-vip"]'
    ) as HTMLButtonElement;
    await act(async () => {
      vipChip.click();
    });
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_vip_buyer"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_seller_bounced"]')
    ).toBeNull();

    // 매수 filter (excludes seller AND excludes view_* anonymous threads)
    const buyerChip = container.querySelector(
      '[data-testid="inbox-filter-chip-buyer"]'
    ) as HTMLButtonElement;
    await act(async () => {
      buyerChip.click();
    });
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_vip_buyer"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_seller_bounced"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-view_anon_1"]')
    ).toBeNull();

    // 매도 filter
    const sellerChip = container.querySelector(
      '[data-testid="inbox-filter-chip-seller"]'
    ) as HTMLButtonElement;
    await act(async () => {
      sellerChip.click();
    });
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_seller_bounced"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_vip_buyer"]')
    ).toBeNull();

    // 이메일 가능 filter (excludes bounced email and missing email)
    const emailableChip = container.querySelector(
      '[data-testid="inbox-filter-chip-emailable"]'
    ) as HTMLButtonElement;
    await act(async () => {
      emailableChip.click();
    });
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_vip_buyer"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-custom_seller_bounced"]')
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-thread-row-view_anon_1"]')
    ).toBeNull();

    // Create new client with structured fields
    const openNewBtn = container.querySelector(
      '[data-testid="open-new-client-modal-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      openNewBtn.click();
    });

    await act(async () => {
      setNativeInputValue(
        container.querySelector("#new-client-name") as HTMLInputElement,
        "정대표"
      );
      setNativeInputValue(
        container.querySelector("#new-client-phone") as HTMLInputElement,
        "01055556666"
      );
      setNativeSelectValue(
        container.querySelector("#new-client-role") as HTMLSelectElement,
        "seller"
      );
      setNativeSelectValue(
        container.querySelector("#new-client-grade") as HTMLSelectElement,
        "VIP"
      );
      setNativeInputValue(
        container.querySelector("#new-client-budget") as HTMLInputElement,
        "120억"
      );
      setNativeInputValue(
        container.querySelector("#new-client-region") as HTMLInputElement,
        "강남구, 서초구"
      );
      setNativeInputValue(
        container.querySelector("#new-client-free-memo") as HTMLTextAreaElement,
        "코너 빌딩 매각 상담 희망"
      );
    });

    const submitForm = container.querySelector(
      '[data-testid="inbox-new-client-dialog"] form'
    ) as HTMLFormElement;
    await act(async () => {
      submitForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    const upsertCall = actionPayloads.find((p) => p.action === "upsert_client");
    expect(upsertCall).toBeDefined();
    expect(upsertCall).toMatchObject({
      action: "upsert_client",
      clientName: "정대표",
      isVip: true,
      clientRole: "seller",
      preferredRegions: ["강남구", "서초구"],
      budgetManwon: 1200000,
      freeMemo: "코너 빌딩 매각 상담 희망",
    });
  });

  it("renders Tab 3 기록 dispatchHistory + bounce warning, locks per-thread by default, uses ConfirmDeleteModal, and shows honest Alimtalk notice", async () => {
    const revokePayloads: Array<Record<string, unknown>> = [];
    const actionPayloads: Array<Record<string, unknown>> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/api/broker/share-links/revoke")) {
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
        revokePayloads.push(body);
        return new Response(
          JSON.stringify({ ok: true, scope: body.scope }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/broker/inbox/actions") && init?.method === "POST") {
        const body = JSON.parse(String(init.body || "{}")) as Record<string, unknown>;
        actionPayloads.push(body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          userId: "broker-wp20a",
          subscriptionTier: "free",
          threads: [
            {
              id: "custom_audit_1",
              clientName: "한대표",
              clientCompany: "한성홀딩스",
              clientPhone: "010-8888-9999",
              clientEmail: "bounce@hansung.example.com",
              emailDeliveryStatus: "bounced",
              clientGrade: "VIP",
              isVip: true,
              clientRole: "buyer",
              buildingId: "bld-audit-01",
              buildingTitle: "마포구 동교동 역세권 빌딩",
              shareToken: "slk.audit01",
              shareUrl: "/im-lite/bld-audit-01?token=slk.audit01",
              status: "active",
              openCount: 1,
              updatedAt: "2026-11-15T10:20:00Z",
              events: [
                {
                  id: "ev-1",
                  eventType: "dwell",
                  description: "통화 메모: 내일 현장 답사 예정",
                  timestamp: "오전 10:15",
                },
              ],
              dispatchHistory: [
                {
                  id: "disp-bounce-1",
                  eventType: "email_bounced",
                  channel: "email",
                  title: "마포구 동교동 Basic IM 발송",
                  status: "bounced",
                  createdAt: "2026-11-15T10:20:00Z",
                  bounceReason: "수신자 메일함 없음 (550)",
                },
                {
                  id: "disp-kakao-2",
                  eventType: "kakao_copied",
                  channel: "kakao_copy",
                  title: "마포구 동교동 딜카드 링크",
                  status: "sent",
                  createdAt: "2026-11-15T09:45:00Z",
                },
                {
                  id: "disp-nl-3",
                  eventType: "newsletter_sent",
                  channel: "newsletter",
                  title: "11월 2주차 상업용 부동산 시장 브리핑",
                  status: "delivered",
                  createdAt: "2026-11-14T08:30:00Z",
                },
              ],
            },
          ],
          inventory: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    await act(async () => {
      root.render(<InboxWorkspacePage />);
    });
    await flushMicrotasks();

    // Switch to Tab 3 (기록)
    const historyTabBtn = container.querySelector(
      '[data-testid="inbox-editor-tab-history"]'
    ) as HTMLButtonElement;
    await act(async () => {
      historyTabBtn.click();
    });

    const historyPanel = container.querySelector(
      '[data-testid="inbox-tab-panel-history"]'
    ) as HTMLElement;
    expect(historyPanel).not.toBeNull();
    expect(
      container.querySelector('[data-testid="inbox-email-bounce-warning"]')?.textContent
    ).toContain("⚠️ 이메일 반송됨");
    expect(
      container.querySelector('[data-testid="inbox-call-note-input"]')
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="save-call-note-btn"]')).not.toBeNull();

    const auditTimeline = container.querySelector(
      '[data-testid="inbox-dispatch-audit-timeline"]'
    ) as HTMLElement;
    expect(auditTimeline).not.toBeNull();
    expect(auditTimeline.textContent).toContain("이메일");
    expect(auditTimeline.textContent).toContain("카톡 복사");
    expect(auditTimeline.textContent).toContain("뉴스레터");
    expect(auditTimeline.textContent).toContain("마포구 동교동 Basic IM 발송");
    expect(auditTimeline.textContent).toContain("⚠️ 이메일 반송됨");

    // Honest Early-Access Alimtalk notice
    const alimtalkNotice = container.querySelector(
      '[data-testid="inbox-alimtalk-early-access-hint"]'
    );
    expect(alimtalkNotice?.textContent).toContain(
      "Pro 알림톡 정식 연동 오픈 예정 — 이메일 발송 또는 카톡 인사말+링크 1초 복사를 바로 이용하실 수 있습니다"
    );

    // Per-thread link lock by default (scope: "thread")
    const lockTriggerBtn = container.querySelector(
      '[data-testid="lock-share-link-trigger-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      lockTriggerBtn.click();
    });

    const confirmLockBtn = container.querySelector(
      '[data-testid="confirm-lock-link-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      confirmLockBtn.click();
    });
    await flushMicrotasks();

    expect(revokePayloads[0]).toMatchObject({
      buildingId: "bld-audit-01",
      threadId: "custom_audit_1",
      scope: "thread",
    });

    // Unlock, then toggle "이 건물 전체 열람 잠금", and lock with scope: "building"
    const unlockBtn = container.querySelector(
      '[data-testid="unlock-share-link-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      unlockBtn.click();
    });
    await flushMicrotasks();

    const lockTriggerAgain = container.querySelector(
      '[data-testid="lock-share-link-trigger-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      lockTriggerAgain.click();
    });

    const lockBuildingCheckbox = container.querySelector(
      '[data-testid="lock-entire-building-checkbox"]'
    ) as HTMLInputElement;
    await act(async () => {
      lockBuildingCheckbox.click();
    });

    const confirmLockAgain = container.querySelector(
      '[data-testid="confirm-lock-link-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      confirmLockAgain.click();
    });
    await flushMicrotasks();

    expect(revokePayloads[1]).toMatchObject({
      buildingId: "bld-audit-01",
      scope: "building",
    });

    // Delete custom client uses ConfirmDeleteModal
    const deleteClientBtn = container.querySelector(
      '[data-testid="delete-custom-client-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      deleteClientBtn.click();
    });

    const confirmModal = container.querySelector(
      '[data-testid="confirm-delete-modal"]'
    );
    expect(confirmModal).not.toBeNull();

    const confirmDeleteBtn = container.querySelector(
      '[data-testid="confirm-delete-confirm-btn"]'
    ) as HTMLButtonElement;
    // Decision 1-B: VIP 고객 삭제는 고객 성함 재입력 후 확정 활성화
    const matchInput = container.querySelector(
      '[data-testid="confirm-delete-match-input"]'
    ) as HTMLInputElement | null;
    expect(matchInput).not.toBeNull();
    expect(confirmDeleteBtn.disabled).toBe(true);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(matchInput, "한대표");
      matchInput!.dispatchEvent(new Event("input", { bubbles: true }));
      matchInput!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(confirmDeleteBtn.disabled).toBe(false);
    await act(async () => {
      confirmDeleteBtn.click();
    });
    await flushMicrotasks();

    expect(actionPayloads.some((p) => p.action === "delete_client")).toBe(true);
  });

  it("renders DealCardsWorkspacePage with /broker/profile link, [체험 예시] sample badge, and ConfirmDeleteModal", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          userId: "broker-dc-wp20a",
          dealcards: [],
          unconvertedMemos: [],
          brokerProfile: {
            displayName: "김중개 대표",
            company: "강남스타부동산중개법인",
            phone: "010-2222-3333",
            registrationNo: "11680-2024-00111",
            slug: "gangnam-star",
            photoUrl: null,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    await act(async () => {
      root.render(<DealCardsWorkspacePage />);
    });
    await flushMicrotasks();

    // [체험 예시] badge rendered on Day-0 sample card in editor banner & simple list row
    expect(
      container.querySelector('[data-testid="dealcard-sample-badge"]')?.textContent
    ).toBe("[체험 예시]");
    expect(
      container.querySelector('[data-testid="dealcard-item-bld-01"]')?.textContent
    ).toContain("[체험 예시]");

    // Switch to detailed view mode and verify [체험 예시] list badge + delete ConfirmDeleteModal
    const detailedViewBtn = container.querySelector(
      '[data-testid="ws-list-view-detailed"]'
    ) as HTMLButtonElement;
    await act(async () => {
      detailedViewBtn.click();
    });
    expect(
      container.querySelector('[data-testid="dealcard-list-sample-badge"]')?.textContent
    ).toBe("[체험 예시]");

    // Direct /broker/profile link rendered in preview column
    const profileLink = container.querySelector(
      '[data-testid="dealcard-broker-profile-link"]'
    ) as HTMLAnchorElement;
    expect(profileLink).not.toBeNull();
    expect(profileLink.getAttribute("href")).toBe("/broker/profile");

    // ConfirmDeleteModal opens when deleting DealCard (no native window.confirm)
    const confirmSpy = vi.spyOn(window, "confirm");
    const deleteBtn = container.querySelector(
      '[data-testid="dealcard-delete-bld-01"]'
    ) as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="confirm-delete-modal"]')).not.toBeNull();

    const cancelBtn = container.querySelector(
      '[data-testid="confirm-delete-cancel-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });
    expect(container.querySelector('[data-testid="confirm-delete-modal"]')).toBeNull();
  });

  it("enforces zero BANNED_UI_TERMS, zero /broker/settings in dealcards, and modular LOC reduction", () => {
    const repoRoot = process.cwd();
    const targetDirs = [
      path.join(repoRoot, "src/app/(broker)/broker/w/inbox"),
      path.join(repoRoot, "src/app/(broker)/broker/w/dealcards"),
    ];

    const collectTsFiles = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectTsFiles(full));
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          files.push(full);
        }
      }
      return files;
    };

    const allFiles = targetDirs.flatMap(collectTsFiles);
    expect(allFiles.length).toBeGreaterThanOrEqual(10);

    for (const filePath of allFiles) {
      const code = fs.readFileSync(filePath, "utf8");
      const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");

      // Zero '소식지' across all inbox & dealcards modules
      expect(code, `${rel} must not contain '소식지'`).not.toContain("소식지");

      // Zero text-xs across extracted/refactored modules
      expect(code, `${rel} must not use sub-14px text-xs`).not.toMatch(/\btext-xs\b/);

      // Zero /broker/settings in dealcards modules
      if (rel.includes("/w/dealcards/")) {
        expect(code, `${rel} must link to /broker/profile, never /broker/settings`).not.toContain(
          "/broker/settings"
        );
      }

      // Check Korean string literals and JSX text against BANNED_UI_TERMS
      const withoutComments = code
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const koreanLiterals =
        withoutComments.match(/(["'`])(?:\\.|(?!\1)[^\\])*?[가-힣](?:\\.|(?!\1)[^\\])*?\1/g) ||
        [];
      const jsxKoreanChunks = withoutComments.match(/>[^<{]*[가-힣][^<{]*</g) || [];

      for (const chunk of [...koreanLiterals, ...jsxKoreanChunks]) {
        for (const banned of BANNED_UI_TERMS) {
          expect(
            banned.term.test(chunk),
            `${rel} contains banned UI term ${banned.term} in: ${chunk}`
          ).toBe(false);
        }
      }
    }

    // Verify dealcards/page.tsx delegates to _components and links to /broker/profile
    const dealcardsPageCode = fs.readFileSync(
      path.join(repoRoot, "src/app/(broker)/broker/w/dealcards/page.tsx"),
      "utf8"
    );
    expect(dealcardsPageCode).toContain("./_components/DealCardListColumn");
    expect(dealcardsPageCode).toContain("./_components/DealCardEditorColumn");
    expect(dealcardsPageCode).toContain("./_components/DealCardPreviewColumn");
    expect(dealcardsPageCode).toContain('"/broker/profile"');
  });
});
