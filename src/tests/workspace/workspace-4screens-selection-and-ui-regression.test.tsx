// @vitest-environment jsdom
/**
 * @file src/tests/workspace/workspace-4screens-selection-and-ui-regression.test.tsx
 * @description End-to-end JSDOM regression suite for the 4-Screen Broker Workspace UI Audit:
 *   - Track S: WorkspaceShell (?tab=list bubbling snap-back guard) & useWorkspaceAutosave.cancelPending
 *   - Track A: IM Workspace (tester's ?buildingId= left-list snap-back lock, KRW 10,000x guard, >=25억 RentRollGrid guard, zero \'원\' escape)
 *   - Track B: DealCard Workspace (ghost ?buildingId= input freeze guard, left-list selection, cleared area "" parity, IM handoff & MemoImport wiring)
 *   - Track C: Newsletter Workspace (?editionId= left-list switch, draft save vs live publish, lexicon guard)
 *   - Track D: Inbox Workspace (?thread= left-list switch without snap-back, per-thread form reset, IM/DealCard deep-links)
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { useWorkspaceAutosave } from "@/lib/hooks/useWorkspaceAutosave";
import ImWorkspacePage, { parseKrwInputToManwon } from "@/app/(broker)/broker/w/im/page";
import { RentRollGrid } from "@/components/workspace/RentRollGrid";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import InboxWorkspacePage from "@/app/(broker)/broker/w/inbox/page";
import type { RentRollRowItem } from "@/lib/rent-roll/tsv-parser";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockPathname = "/broker/w/im";
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Workspace 4-Screens Selection Lock & UI Malfunction Regression Suite", () => {
  let root: Root;
  let container: HTMLDivElement;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockPush.mockReset();
    mockReplace.mockReset();
    mockPathname = "/broker/w/im";
    mockSearchParams = new URLSearchParams();
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
    global.fetch = originalFetch;
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Track S — Shared Shell & Autosave Hook
   * ────────────────────────────────────────────────────────────────────────── */
  describe("Track S: WorkspaceShell & useWorkspaceAutosave", () => {
    it("[SH-01] does not snap back child router.replace when clicking a different item under ?buildingId=AAA&tab=list", async () => {
      mockPathname = "/broker/w/dealcards";
      mockSearchParams = new URLSearchParams("buildingId=bld-aaa&tab=list");
      window.history.replaceState({}, "", "/broker/w/dealcards?buildingId=bld-aaa&tab=list");

      mockReplace.mockImplementation((url: string) => {
        window.history.replaceState({}, "", url);
      });

      await act(async () => {
        root.render(
          <WorkspaceShell
            workspace="dealcards"
            selectedBuildingId="bld-aaa"
            listSlot={
              <div>
                <div
                  role="button"
                  tabIndex={0}
                  data-testid="dealcard-item-bld-bbb"
                  onClick={() => {
                    mockReplace("/broker/w/dealcards?buildingId=bld-bbb&tab=editor");
                  }}
                >
                  두 번째 매물
                </div>
              </div>
            }
            editorSlot={<div>편집기</div>}
            previewSlot={<div>미리보기</div>}
          />
        );
      });

      const cardB = container.querySelector(
        '[data-testid="dealcard-item-bld-bbb"]'
      ) as HTMLElement;
      expect(cardB).not.toBeNull();

      await act(async () => {
        cardB.click();
      });

      const lastCallUrl = String(mockReplace.mock.calls.at(-1)?.[0] ?? "");
      expect(lastCallUrl).toContain("buildingId=bld-bbb");
      expect(lastCallUrl).not.toContain("buildingId=bld-aaa");
    });

    it("[SH-02] cancelPending suppresses pending debounced save so deleted items are never resurrected", async () => {
      vi.useFakeTimers();
      const saveSpy = vi.fn().mockResolvedValue(undefined);
      let cancelFn: ((targetKey?: string) => void) | null = null;

      function Harness({ id, text }: { id: string; text: string }) {
        const autosave = useWorkspaceAutosave({
          id,
          data: { text },
          debounceMs: 300,
          onSave: saveSpy,
        });
        cancelFn = autosave.cancelPending;
        return <div data-status={autosave.status}>{text}</div>;
      }

      try {
        await act(async () => {
          root.render(<Harness id="bld-del-1" text="초기값" />);
        });
        await act(async () => {
          root.render(<Harness id="bld-del-1" text="삭제 직전 수정값" />);
        });

        // User immediately deletes bld-del-1 before debounce fires
        act(() => {
          cancelFn?.("bld-del-1");
        });

        await act(async () => {
          vi.advanceTimersByTime(1000);
        });

        expect(saveSpy).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Track A — IM Workspace (/broker/w/im) & RentRollGrid
   * ────────────────────────────────────────────────────────────────────────── */
  describe("Track A: IM Workspace Left-List Selection & Numeric Guards", () => {
    it("[IM-01 & IM-05] selects 3rd left-list card and creates new IM without snapping back when ?buildingId= is pinned in URL, and renders zero \\' escapes", async () => {
      const pinnedId = "5ace16f2-39d2-4da4-b5bb-ec766e1ce874";
      mockPathname = "/broker/w/im";
      // Intentionally keep mockSearchParams static (pinned to Card 1) to prove zero snap-back loop!
      mockSearchParams = new URLSearchParams(`buildingId=${pinnedId}`);

      const seededItems = [
        {
          id: pinnedId,
          buildingId: pinnedId,
          title: "강남구 신사동 상가주택",
          address: "서울시 강남구 신사동 540-12",
          askingPriceManwon: 1450000,
          grossYieldPct: 2.31,
          status: "draft",
          versionLabel: "작성 중",
          updatedAt: "방금",
          investmentPosture: "core_income",
        },
        {
          id: "im-doc-thepark",
          buildingId: "bld-thepark",
          title: "THE.PARK Building (더파크빌딩)",
          address: "서울특별시 마포구 동교동 147-8",
          askingPriceManwon: 770000,
          grossYieldPct: 3.2,
          status: "published",
          versionLabel: "발행됨",
          updatedAt: "어제",
          investmentPosture: "core_income",
        },
        {
          id: "im-doc-yangpyeong",
          buildingId: "bld-yangpyeong",
          title: "영등포구 양평동 근생빌딩",
          address: "서울시 영등포구 양평동4가 80-1",
          askingPriceManwon: 950000,
          grossYieldPct: 4.39,
          status: "draft",
          versionLabel: "작성 중",
          updatedAt: "방금",
          investmentPosture: "core_income",
        },
      ];
      window.localStorage.setItem("credeal-w-im-v4", JSON.stringify(seededItems));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          counts: { inboxPending: 0, buildings: 3, magazineTotal: 0, clients: 0 },
          items: [],
        }),
      }) as unknown as typeof fetch;

      await act(async () => {
        root.render(<ImWorkspacePage />);
      });

      // IM-05: Zero literal backslash quotes in rendered text
      expect(container.textContent).not.toContain("\\'원\\'");
      expect(container.textContent).toContain("2. 희망 매매가 ('원' 단위)");

      const card1 = container.querySelector(`[data-testid="im-item-${pinnedId}"]`) as HTMLElement;
      const card3 = container.querySelector(
        '[data-testid="im-item-im-doc-yangpyeong"]'
      ) as HTMLElement;
      expect(card1?.getAttribute("data-selected")).toBe("true");
      expect(card3?.getAttribute("data-selected")).toBe("false");

      // Tester clicks Card 3 ("영등포구 양평동 근생빌딩")
      await act(async () => {
        card3.click();
      });

      expect(card3.getAttribute("data-selected")).toBe("true");
      expect(card1.getAttribute("data-selected")).toBe("false");
      expect(mockReplace).toHaveBeenCalled();

      // Tester clicks "+ 새 IM 만들기" while URL param was originally pinned
      const createBtn = container.querySelector(
        '[data-testid="im-create-new-btn"]'
      ) as HTMLButtonElement;
      await act(async () => {
        createBtn.click();
      });

      expect(card1.getAttribute("data-selected")).toBe("false");
      expect(card3.getAttribute("data-selected")).toBe("false");
    });

    it("[IM-03 & IM-04] parses KRW <1억 without 10,000x explosion and keeps >=25억 (300,000 만원) intact in RentRollGrid on blur", async () => {
      // IM-03: 50,000,000 KRW = 5,000 만원 (never 500조 원)
      expect(parseKrwInputToManwon("50,000,000")).toBe(5000);
      expect(parseKrwInputToManwon("14,500,000,000")).toBe(1450000);
      expect(parseKrwInputToManwon("145억")).toBe(1450000);

      // IM-04: RentRollGrid 300,000 만원 (= 30억 원) deposit cell onBlur
      let latestRows: RentRollRowItem[] = [
        {
          id: "row-1",
          floor: "1F",
          unit: "101호",
          use: "우량 임차인",
          areaPyeong: 85,
          depositManwon: 50000,
          monthlyRentManwon: 2500,
          maintenanceManwon: 250,
          leaseExpiry: "2028-12",
          status: "occupied",
        },
      ];

      await act(async () => {
        root.render(
          <RentRollGrid
            rows={latestRows}
            onChange={(next) => {
              latestRows = next;
            }}
          />
        );
      });

      const depositInput = container.querySelector(
        'input[data-rr-cell="0:depositManwon"]'
      ) as HTMLInputElement;
      expect(depositInput).not.toBeNull();

      await act(async () => {
        depositInput.focus();
        setNativeInputValue(depositInput, "300,000");
        depositInput.blur();
      });

      expect(latestRows[0].depositManwon).toBe(300000);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Track B — DealCard Workspace (/broker/w/dealcards)
   * ────────────────────────────────────────────────────────────────────────── */
  describe("Track B: DealCard Workspace Selection, Ghost ID & Cleared Area Parity", () => {
    it("[DC-01, DC-05, DC-07 & DC-08] keeps editor editable under ghost ?buildingId=, switches cards cleanly, hides cleared area chip, and exposes IM/Memo tools", async () => {
      mockPathname = "/broker/w/dealcards";
      mockSearchParams = new URLSearchParams("buildingId=ghost-deleted-999");

      window.localStorage.setItem(
        "credeal-w-dealcards-v5",
        JSON.stringify([
          {
            id: "bld-01",
            title: "영등포구 양평동 근린생활시설",
            region: "영등포구 양평동",
            use: "근린생활시설",
            priceBand: "90~100억",
            status: "draft",
            updatedAt: "방금",
            card4: {
              headline: "대로변 코너 만실 운영 매물",
              posture: "income",
              region: "영등포구 양평동",
              use: "근린생활시설",
              area: "연면적 439평",
              gfaPyung: 439,
              landAreaPyung: 127,
              priceBand: "90~100억",
              points: ["역세권 도보 3분 코너", "우량 임차인 전층 만실", "안정적인 임대수익 구조"],
              pointTones: ["amber", "sky", "mint"],
              card4_version: 1,
            },
          },
          {
            id: "bld-02",
            title: "마포구 동교동 근린생활시설",
            region: "마포구 동교동",
            use: "근린생활시설",
            priceBand: "70~80억",
            status: "draft",
            updatedAt: "방금",
            card4: {
              headline: "홍대입구역 초역세권 빌딩",
              posture: "income",
              region: "마포구 동교동",
              use: "근린생활시설",
              area: "연면적 280평",
              gfaPyung: 280,
              landAreaPyung: 95,
              priceBand: "70~80억",
              points: ["홍대입구역 도보 2분", "전층 우량 리테일 입점", "공실 위험 낮은 상권"],
              pointTones: ["amber", "sky", "mint"],
              card4_version: 1,
            },
          },
        ])
      );

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          counts: { inboxPending: 0, buildings: 0, magazineTotal: 0, clients: 0 },
          items: [],
        }),
      }) as unknown as typeof fetch;

      await act(async () => {
        root.render(<DealCardsWorkspacePage />);
      });

      const firstCard = container.querySelector('[data-testid="dealcard-item-bld-01"]') as HTMLElement;
      const secondCard = container.querySelector('[data-testid="dealcard-item-bld-02"]') as HTMLElement;
      expect(firstCard?.getAttribute("data-selected")).toBe("true");

      // DC-01: Typing into headline must NOT freeze under ghost ?buildingId=
      const headlineInput = container.querySelector(
        '[data-testid="card4-headline-input"]'
      ) as HTMLInputElement;
      expect(headlineInput).not.toBeNull();

      await act(async () => {
        setNativeInputValue(headlineInput, "역세권 코너 우량빌딩");
      });
      expect(headlineInput.value).toBe("역세권 코너 우량빌딩");

      // DC-05: Explicitly clearing card4-area-input hides area chip in KakaoBubblePreview
      const areaInput = container.querySelector(
        '[data-testid="card4-area-input"]'
      ) as HTMLInputElement;
      await act(async () => {
        setNativeInputValue(areaInput, "");
      });
      expect(container.querySelector('[data-testid="dealcard-detail-area-chip"]')).toBeNull();

      // DC-07 & DC-08: Cross-tab IM link and MemoImportModal trigger exist
      expect(container.querySelector('[data-testid="dealcard-open-im-link"]')).not.toBeNull();
      expect(
        container.querySelector('[data-testid="dealcard-open-memo-import-btn"]')
      ).not.toBeNull();

      // Left-list switch to second card works without snap-back
      await act(async () => {
        secondCard.click();
      });
      expect(secondCard.getAttribute("data-selected")).toBe("true");
      expect(firstCard.getAttribute("data-selected")).toBe("false");
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Track C — Newsletter Workspace (/broker/magazine-editor)
   * ────────────────────────────────────────────────────────────────────────── */
  describe("Track C: Newsletter Left-List Switch, Draft Save & Lexicon", () => {
    it("[NL-01, NL-02, NL-11 & NL-15] switches saved editions without snap-back under ?editionId=, saves draft via saveAsDraft:true, and bans 콘텐츠 스튜디오 in error.tsx", async () => {
      // NL-15: Verify error.tsx lexicon compliance
      const errorTsx = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(broker)/broker/magazine-editor/error.tsx"),
        "utf-8"
      );
      expect(errorTsx).not.toContain("콘텐츠 스튜디오");

      mockPathname = "/broker/magazine-editor";
      mockSearchParams = new URLSearchParams("editionId=ed-101");

      const issuePostBodies: Array<Record<string, unknown>> = [];

      global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/magazine/editions")) {
          return new Response(
            JSON.stringify({
              brokerId: "11111111-1111-4111-8111-111111111111",
              brokerSlug: "gangnam-partner",
              hasSlug: true,
              subscriberCount: 12,
              editions: [
                {
                  id: "ed-101",
                  edition_type: "monthly",
                  edition_label: "2026-10",
                  status: "published",
                  published_at: "2026-10-15T09:00:00.000Z",
                  public_url: "/magazine/gangnam-partner/2026-10-15",
                  content: {
                    title: "10월 강남 빌딩 시장 리포트",
                    summary: "10월 요약",
                    theme_title: "10월 브리핑",
                    theme_body_md: "10월 본문입니다.",
                  },
                },
                {
                  id: "ed-202",
                  edition_type: "monthly",
                  edition_label: "2026-11",
                  status: "draft",
                  published_at: null,
                  content: {
                    title: "11월 금리 인하기 매수 전략",
                    summary: "11월 요약",
                    theme_title: "11월 브리핑",
                    theme_body_md: "11월 본문입니다.",
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (url.includes("/api/broker/buildings")) {
          return new Response(JSON.stringify({ buildings: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/api/magazine/issues") && init?.method === "POST") {
          const parsed = JSON.parse(String(init.body || "{}"));
          issuePostBodies.push(parsed);
          return new Response(
            JSON.stringify({
              ok: true,
              editionId: parsed.editionId || "ed-202",
              status: parsed.saveAsDraft ? "draft" : "published",
              issueDate: "2026-11-11",
              publicUrl: "/magazine/gangnam-partner/2026-11-11",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ counts: { inboxPending: 0, buildings: 0, magazineTotal: 2, clients: 0 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof fetch;

      await act(async () => {
        root.render(<MagazineEditorPage />);
      });
      // Allow initial workspace Promise.all hydration to settle
      await act(async () => {
        await Promise.resolve();
      });

      const ed1 = container.querySelector(
        '[data-testid="magazine-edition-item-ed-101"]'
      ) as HTMLElement;
      const ed2 = container.querySelector(
        '[data-testid="magazine-edition-item-ed-202"]'
      ) as HTMLElement;
      expect(ed1).not.toBeNull();
      expect(ed2).not.toBeNull();
      expect(ed1.getAttribute("data-selected")).toBe("true");

      // Click second edition in left list while ?editionId=ed-101 is pinned
      await act(async () => {
        ed2.click();
      });

      expect(ed2.getAttribute("data-selected")).toBe("true");
      expect(ed1.getAttribute("data-selected")).toBe("false");

      // NL-02: Clicking draft save sends saveAsDraft: true instead of publishing live
      const draftSaveBtn = container.querySelector(
        '[data-testid="newsletter-draft-save-btn"]'
      ) as HTMLButtonElement;
      expect(draftSaveBtn).not.toBeNull();

      await act(async () => {
        draftSaveBtn.click();
      });

      expect(issuePostBodies.length).toBeGreaterThanOrEqual(1);
      expect(issuePostBodies.at(-1)?.saveAsDraft).toBe(true);
    });
  });

  /* ──────────────────────────────────────────────────────────────────────────
   * Track D — Inbox Workspace (/broker/w/inbox)
   * ────────────────────────────────────────────────────────────────────────── */
  describe("Track D: Inbox Left-List Thread Selection, Form Reset & Deep Links", () => {
    it("[INBOX-01, INBOX-02 & INBOX-04] switches threads without snap-back under ?thread=, resets per-thread inputs, never prefills fake 450->480 text, and renders IM/DealCard links", async () => {
      mockPathname = "/broker/w/inbox";
      mockSearchParams = new URLSearchParams("thread=th-alpha");

      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/broker/inbox")) {
          return new Response(
            JSON.stringify({
              ok: true,
              viewerBrokerId: "11111111-1111-4111-8111-111111111111",
              threads: [
                {
                  id: "th-alpha",
                  clientName: "김알파 대표",
                  clientPhone: "010-1111-2222",
                  clientGrade: "VIP",
                  buildingId: "bld-alpha-1",
                  buildingTitle: "강남구 신사동 코너빌딩",
                  latestEvent: "IM 열람 요청",
                  detail: "상세 자료 요청드립니다.",
                  gateStatus: "pending",
                  status: "pending_gate",
                  updatedAt: "방금",
                  openCount: 2,
                  isRead: false,
                  shareUrl: "/im-lite/bld-alpha-1?token=tok-alpha",
                  events: [],
                },
                {
                  id: "th-beta",
                  clientName: "박베타 전무",
                  clientPhone: "010-3333-4444",
                  clientGrade: "VIP",
                  buildingId: "bld-beta-2",
                  buildingTitle: "마포구 동교동 수익형빌딩",
                  latestEvent: "IM 열람 요청",
                  detail: "수익률 검토 희망",
                  gateStatus: "pending",
                  status: "pending_gate",
                  updatedAt: "5분 전",
                  openCount: 4,
                  isRead: false,
                  shareUrl: "/im-lite/bld-beta-2?token=tok-beta",
                  events: [],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({ counts: { inboxPending: 2, buildings: 2, magazineTotal: 0, clients: 2 } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof fetch;

      await act(async () => {
        root.render(<InboxWorkspacePage />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      // INBOX-02: Never render fabricated 450->480 rent correction text
      expect(container.textContent).not.toContain("450만원→480만원");

      const rowAlpha = container.querySelector(
        '[data-testid="inbox-thread-row-th-alpha"]'
      ) as HTMLElement;
      const rowBeta = container.querySelector(
        '[data-testid="inbox-thread-row-th-beta"]'
      ) as HTMLElement;
      expect(rowAlpha).not.toBeNull();
      expect(rowBeta).not.toBeNull();
      expect(rowAlpha.getAttribute("data-selected")).toBe("true");

      // INBOX-04: IM & DealCard navigation links + direct Copy Share Link button exist
      expect(container.querySelector('[data-testid="inbox-open-dealcard-link"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-open-im-link"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="inbox-copy-share-link-btn"]')).not.toBeNull();

      // INBOX-01: Click second thread while ?thread=th-alpha was in initial URL
      await act(async () => {
        rowBeta.click();
      });

      expect(rowBeta.getAttribute("data-selected")).toBe("true");
      expect(rowAlpha.getAttribute("data-selected")).toBe("false");
      expect(
        container
          .querySelector('[data-testid="inbox-open-im-link"]')
          ?.getAttribute("href")
      ).toContain("bld-beta-2");
    });
  });
});
