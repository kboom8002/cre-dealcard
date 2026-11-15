// @vitest-environment jsdom
/**
 * @file src/tests/workspace/wave1-wp04-storage-isolation.test.ts
 * @description Wave 1 — WP-04 regression suite for Shared-PC localStorage Tenant Isolation & Logout Purge:
 *   1. Scoped storage keys, legacy migration ownership guard, and anonymous unit-test fallback
 *   2. Logout cookie signal (`credeal_purge_storage=1`) + `purgeWorkspaceClientStorage()` preserving UI prefs
 *   3. End-to-end JSDOM isolation across DealCards, IM, and Newsletter editors (`user-a` -> `user-b`)
 */

import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
  LAST_ACTIVE_USER_KEY,
  PURGE_STORAGE_COOKIE_NAME,
  consumeLogoutPurgeSignal,
  purgeWorkspaceClientStorage,
  readScopedWorkspaceJson,
  scopedWorkspaceStorageKey,
  syncActiveBrokerSessionStorage,
  writeScopedWorkspaceJson,
} from "@/lib/workspace/storage-namespace";
import { logout } from "@/app/actions/auth";
import DealCardsWorkspacePage from "@/app/(broker)/broker/w/dealcards/page";
import ImWorkspacePage from "@/app/(broker)/broker/w/im/page";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
const mockCookieSet = vi.fn();
const mockSignOut = vi.fn(async () => ({ error: null }));

let mockPathname = "/broker/w/dealcards";
let mockSearchParams = new URLSearchParams();
let mockCurrentBrowserUserId: string | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: mockCookieSet,
    get: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: mockCurrentBrowserUserId ? { id: mockCurrentBrowserUserId } : null,
        },
        error: null,
      }),
    },
  }),
}));

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function flushAsyncEffects(ms = 40): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

function collectRenderedTextAndValues(container: HTMLElement): string {
  const text = container.textContent || "";
  const inputs = Array.from(container.querySelectorAll("input, textarea")) as Array<
    HTMLInputElement | HTMLTextAreaElement
  >;
  const values = inputs.map((el) => el.value).join(" ");
  return `${text} ${values}`;
}

describe("Wave 1 — WP-04: Shared-PC localStorage Tenant Isolation & Logout Purge", () => {
  let root: Root;
  let container: HTMLDivElement;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    mockPush.mockReset();
    mockReplace.mockReset();
    mockRedirect.mockClear();
    mockCookieSet.mockReset();
    mockSignOut.mockClear();
    mockCurrentBrowserUserId = null;
    mockPathname = "/broker/w/dealcards";
    mockSearchParams = new URLSearchParams();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = `${PURGE_STORAGE_COOKIE_NAME}=; path=/; max-age=0`;

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

  describe("1. Pure Storage Namespace & Purge Utilities", () => {
    it("scopes keys by trimmed userId and falls back to :anon when unauthenticated", () => {
      expect(scopedWorkspaceStorageKey("credeal-w-dealcards-v5", " user-a ")).toBe(
        "credeal-w-dealcards-v5:u:user-a"
      );
      expect(scopedWorkspaceStorageKey("credeal-w-dealcards-v5", null)).toBe(
        "credeal-w-dealcards-v5:anon"
      );
      expect(scopedWorkspaceStorageKey("credeal-w-dealcards-v5", "   ")).toBe(
        "credeal-w-dealcards-v5:anon"
      );
    });

    it("enforces ownerUserId check on legacy migration while preserving null-userId unit test compatibility", () => {
      // Seed legacy un-scoped DealCard array owned by user-a
      window.localStorage.setItem(
        "credeal-w-dealcards-v5",
        JSON.stringify([
          { id: "bld-secret-a", ownerUserId: "user-a", title: "User A Secret Building" },
        ])
      );

      // User B MUST NOT read or migrate User A's legacy payload
      const forUserB = readScopedWorkspaceJson<Array<{ id: string }>>(
        "credeal-w-dealcards-v5",
        "user-b",
        []
      );
      expect(forUserB).toEqual([]);
      expect(
        window.localStorage.getItem("credeal-w-dealcards-v5:u:user-b")
      ).toBeNull();

      // Anonymous unit-test mode (!userId) still reads legacy fixture seamlessly
      const forAnonTest = readScopedWorkspaceJson<Array<{ id: string; title: string }>>(
        "credeal-w-dealcards-v5",
        null,
        []
      );
      expect(forAnonTest).toHaveLength(1);
      expect(forAnonTest[0].title).toBe("User A Secret Building");

      // User A (matching ownerUserId) migrates cleanly into :u:user-a and removes raw legacy key
      const forUserA = readScopedWorkspaceJson<Array<{ id: string; title: string }>>(
        "credeal-w-dealcards-v5",
        "user-a",
        []
      );
      expect(forUserA).toHaveLength(1);
      expect(forUserA[0].id).toBe("bld-secret-a");
      expect(
        window.localStorage.getItem("credeal-w-dealcards-v5:u:user-a")
      ).not.toBeNull();
      expect(window.localStorage.getItem("credeal-w-dealcards-v5")).toBeNull();
    });

    it("removes raw un-namespaced baseKey on writeScopedWorkspaceJson and purges un-scoped keys on account switch", () => {
      window.localStorage.setItem(
        "credeal-w-im-v4",
        JSON.stringify([{ id: "legacy-im", title: "Stale Shared PC Draft" }])
      );
      window.localStorage.setItem("credeal-workspace-font-scale-v1", "large");

      writeScopedWorkspaceJson("credeal-w-im-v4", "user-a", [
        { id: "im-a", ownerUserId: "user-a", title: "Broker A IM" },
      ]);

      expect(window.localStorage.getItem("credeal-w-im-v4")).toBeNull();
      expect(window.localStorage.getItem("credeal-w-im-v4:u:user-a")).toContain(
        "Broker A IM"
      );

      // Simulate silent browser session switch from user-a to user-b without explicit logout
      syncActiveBrokerSessionStorage("user-a");
      window.localStorage.setItem(
        "credeal-magazine-draft",
        JSON.stringify({ headline: "Unscoped Legacy Draft" })
      );

      const switchState = syncActiveBrokerSessionStorage("user-b");
      expect(switchState.switched).toBe(true);
      expect(switchState.previousUserId).toBe("user-a");
      expect(window.localStorage.getItem(LAST_ACTIVE_USER_KEY)).toBe("user-b");
      expect(window.localStorage.getItem("credeal-magazine-draft")).toBeNull();
      expect(window.localStorage.getItem("credeal-workspace-font-scale-v1")).toBe("large");
    });

    it("purges all sensitive draft/memo keys while preserving harmless UI preferences", () => {
      // Sensitive keys that MUST be wiped
      window.localStorage.setItem(
        "credeal-w-dealcards-v5:u:user-a",
        JSON.stringify([{ id: "dc-a" }])
      );
      window.localStorage.setItem(
        "credeal-w-dealcards-memos-v1:u:user-a",
        JSON.stringify([{ id: "memo-a", text: "비공개 메모" }])
      );
      window.localStorage.setItem(
        "credeal-w-im-v4:u:user-a",
        JSON.stringify([{ id: "im-a" }])
      );
      window.localStorage.setItem("credeal-magazine-draft", "secret");
      window.localStorage.setItem("magazine-editor-draft-v1", "secret");
      window.localStorage.setItem(
        "cre-newsletter-draft-v3:monthly:2026-11:u:user-a",
        JSON.stringify({ headline: "secret" })
      );
      window.localStorage.setItem(LAST_ACTIVE_USER_KEY, "user-a");
      window.sessionStorage.setItem(
        "cre-newsletter-last-slot-v3:u:user-a",
        "cre-newsletter-draft-v3:monthly:2026-11"
      );

      // Harmless UI preferences that MUST survive
      window.localStorage.setItem("credeal-workspace-font-scale-v1", "1.1");
      window.localStorage.setItem("credeal-workspace-col-widths-v1", '{"list":320}');
      window.localStorage.setItem("credeal_remembered_email", "broker@credeal.kr");

      purgeWorkspaceClientStorage();

      expect(window.localStorage.getItem("credeal-w-dealcards-v5:u:user-a")).toBeNull();
      expect(
        window.localStorage.getItem("credeal-w-dealcards-memos-v1:u:user-a")
      ).toBeNull();
      expect(window.localStorage.getItem("credeal-w-im-v4:u:user-a")).toBeNull();
      expect(window.localStorage.getItem("credeal-magazine-draft")).toBeNull();
      expect(window.localStorage.getItem("magazine-editor-draft-v1")).toBeNull();
      expect(
        window.localStorage.getItem("cre-newsletter-draft-v3:monthly:2026-11:u:user-a")
      ).toBeNull();
      expect(window.localStorage.getItem(LAST_ACTIVE_USER_KEY)).toBeNull();
      expect(
        window.sessionStorage.getItem("cre-newsletter-last-slot-v3:u:user-a")
      ).toBeNull();

      // Preserved UI preferences
      expect(window.localStorage.getItem("credeal-workspace-font-scale-v1")).toBe("1.1");
      expect(window.localStorage.getItem("credeal-workspace-col-widths-v1")).toBe(
        '{"list":320}'
      );
      expect(window.localStorage.getItem("credeal_remembered_email")).toBe(
        "broker@credeal.kr"
      );
    });

    it("sets credeal_purge_storage=1 cookie on logout() and consumes it on client load", async () => {
      await expect(logout()).rejects.toThrow("NEXT_REDIRECT:/login");
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockCookieSet).toHaveBeenCalledWith(
        PURGE_STORAGE_COOKIE_NAME,
        "1",
        expect.objectContaining({
          path: "/",
          maxAge: 60,
          httpOnly: false,
        })
      );

      // Simulate browser landing on client after logout redirect with cookie set
      window.localStorage.setItem(
        "credeal-w-dealcards-v5:u:user-a",
        JSON.stringify([{ id: "dc-a", title: "Secret DealCard" }])
      );
      window.localStorage.setItem("credeal_remembered_email", "saved@credeal.kr");
      document.cookie = `${PURGE_STORAGE_COOKIE_NAME}=1; path=/`;

      const purged = consumeLogoutPurgeSignal();
      expect(purged).toBe(true);
      expect(window.localStorage.getItem("credeal-w-dealcards-v5:u:user-a")).toBeNull();
      expect(window.localStorage.getItem("credeal_remembered_email")).toBe(
        "saved@credeal.kr"
      );
      expect(document.cookie).not.toContain(`${PURGE_STORAGE_COOKIE_NAME}=1`);
    });
  });

  describe("2. End-to-End Shared-PC Broker A -> Broker B Isolation Across All 3 Editors", () => {
    it(
      "isolates DealCard drafts, private memos, IM drafts, and Newsletter drafts when Broker B logs in on Broker A's PC",
      async () => {
      // ─────────────────────────────────────────────────────────────────────
      // PHASE 1: Broker A (`user-a`) creates/stores DealCard drafts, private
      //          memos, IM drafts, and Newsletter drafts on shared PC storage
      // ─────────────────────────────────────────────────────────────────────
      mockCurrentBrowserUserId = "user-a";
      syncActiveBrokerSessionStorage("user-a");

      // 1A. Broker A writes DealCard draft & private unconverted memo
      writeScopedWorkspaceJson("credeal-w-dealcards-v5", "user-a", [
        {
          id: "bld-user-a-secret",
          ownerUserId: "user-a",
          title: "논현동 브로커A 극비 사옥안",
          address: "서울특별시 강남구 논현동 210-7",
          region: "강남구 논현동",
          use: "업무시설",
          priceBand: "180~200억",
          status: "draft",
          updatedAt: "방금",
          memoText: "브로커A 전용 비공개 매도인 협의 내역",
          generationSource: "manual",
          card4: {
            region: "강남구 논현동",
            use: "업무시설",
            gfaPyung: 450,
            landAreaPyung: 180,
            floors: "B2/7F",
            stationWalk: "언주역 도보 4분",
            priceBand: "180~200억",
            yieldDisplay: "4.1%",
            headline: "논현동 브로커A 극비 사옥안",
            posture: "owner_occupied",
            points: ["전층 명도 협의 완료", "자주식 주차 18대", "코너 가시성 우수"],
            provenance: { points: ["broker", "broker", "broker"] },
            card4_version: 3,
          },
        },
      ]);
      writeScopedWorkspaceJson("credeal-w-dealcards-memos-v1", "user-a", [
        {
          id: "memo-user-a-private",
          ownerUserId: "user-a",
          text: "브로커A 프라이빗 메모: 소유주 희망 하한가 비공개",
          routingType: "new_deal",
          createdAt: "2026-11-15T05:00:00.000Z",
        },
      ]);

      // Also plant a foreign-owned legacy un-scoped entry to verify cross-tenant merge block
      window.localStorage.setItem(
        "credeal-w-dealcards-v5",
        JSON.stringify([
          {
            id: "bld-legacy-user-a",
            ownerUserId: "user-a",
            title: "레거시 잔류 브로커A 딜카드",
            region: "서초구 잠원동",
            use: "근린생활시설",
            priceBand: "90~100억",
            status: "draft",
            updatedAt: "방금",
            card4: {
              region: "서초구 잠원동",
              use: "근린생활시설",
              gfaPyung: 200,
              floors: "B1/5F",
              stationWalk: "신사역 도보 5분",
              priceBand: "90~100억",
              yieldDisplay: "3.8%",
              headline: "레거시 잔류 브로커A 딜카드",
              posture: "income",
              points: ["포인트1", "포인트2", "포인트3"],
              provenance: { points: ["broker", "broker", "broker"] },
              card4_version: 2,
            },
          },
        ])
      );

      // 1B. Broker A writes IM draft
      writeScopedWorkspaceJson("credeal-w-im-v4", "user-a", [
        {
          id: "im-user-a-secret",
          buildingId: "bld-user-a-secret",
          ownerUserId: "user-a",
          title: "청담동 브로커A 비공개 IM 초안",
          address: "서울특별시 강남구 청담동 99-12",
          askingPriceManwon: 240000,
          grossYieldPct: 3.9,
          status: "draft",
          versionLabel: "작성 중",
          updatedAt: "2026-11-15T05:10:00.000Z",
          investmentPosture: "core_income",
          gfaSqm: "1250",
          completionDate: "2019-06",
          landAreaSqm: "410",
          zoning: "제3종일반주거지역",
          handoverNote: "브로커A 비공개 인수 조건",
          photoNames: [],
          rentRoll: [],
          isDirty: true,
        },
      ]);

      // 1C. Broker A mounts Newsletter editor and types an unsaved draft
      mockPathname = "/broker/magazine-editor";
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/magazine/editions")) {
          return Response.json({
            ok: true,
            brokerId: "user-a",
            brokerSlug: "broker-alpha",
            brokerName: "김알파",
            brokerOffice: "알파중개법인",
            brokerPhone: "02-555-0001",
            editions: [],
          });
        }
        return Response.json({ ok: true, buildings: [] });
      }) as unknown as typeof global.fetch;

      await act(async () => {
        root.render(React.createElement(MagazineEditorPage));
      });
      await flushAsyncEffects(50);

      const headlineInputA = Array.from(container.querySelectorAll("input")).find((el) =>
        (el.placeholder || "").includes("제목")
      );
      expect(headlineInputA).toBeDefined();
      await act(async () => {
        setNativeInputValue(headlineInputA!, "브로커A 전용 11월 VIP 비공개 뉴스레터");
      });
      expect(collectRenderedTextAndValues(container)).toContain(
        "브로커A 전용 11월 VIP 비공개 뉴스레터"
      );

      act(() => {
        root.unmount();
      });
      root = createRoot(container);

      // ─────────────────────────────────────────────────────────────────────
      // PHASE 2: Broker B (`user-b`) logs in on the EXACT SAME localStorage
      //          (without clearing window.localStorage beforehand!)
      // ─────────────────────────────────────────────────────────────────────
      mockCurrentBrowserUserId = "user-b";

      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/broker/workspace/summary")) {
          return Response.json({
            ok: true,
            userId: "user-b",
            dealcards: [],
            unconvertedMemos: [],
            imList: [],
            ims: [],
            brokerProfile: {
              displayName: "박베타",
              company: "베타중개법인",
              phone: "02-777-0002",
              registrationNo: "11680-2025-00002",
              slug: "broker-beta",
              photoUrl: null,
            },
          });
        }
        if (url.includes("/api/broker/profile")) {
          return Response.json({
            ok: true,
            data: {
              id: "user-b",
              display_name: "박베타",
              company: "베타중개법인",
              phone: "02-777-0002",
            },
          });
        }
        if (url.includes("/api/magazine/editions")) {
          return Response.json({
            ok: true,
            brokerId: "user-b",
            brokerSlug: "broker-beta",
            brokerName: "박베타",
            brokerOffice: "베타중개법인",
            brokerPhone: "02-777-0002",
            editions: [],
          });
        }
        return Response.json({ ok: true, buildings: [], items: [] });
      }) as unknown as typeof global.fetch;

      // 2A. Verify DealCardsWorkspacePage for Broker B
      mockPathname = "/broker/w/dealcards";
      await act(async () => {
        root.render(React.createElement(DealCardsWorkspacePage));
      });
      await flushAsyncEffects(60);

      const dealcardsContentB = collectRenderedTextAndValues(container);
      expect(dealcardsContentB).not.toContain("논현동 브로커A 극비 사옥안");
      expect(dealcardsContentB).not.toContain("브로커A 전용 비공개 매도인 협의 내역");
      expect(dealcardsContentB).not.toContain(
        "브로커A 프라이빗 메모: 소유주 희망 하한가 비공개"
      );
      expect(dealcardsContentB).not.toContain("레거시 잔류 브로커A 딜카드");

      act(() => {
        root.unmount();
      });
      root = createRoot(container);

      // 2B. Verify ImWorkspacePage for Broker B
      mockPathname = "/broker/w/im";
      await act(async () => {
        root.render(React.createElement(ImWorkspacePage));
      });
      await flushAsyncEffects(60);

      const imContentB = collectRenderedTextAndValues(container);
      expect(imContentB).not.toContain("청담동 브로커A 비공개 IM 초안");
      expect(imContentB).not.toContain("청담동 99-12");
      expect(imContentB).not.toContain("브로커A 비공개 인수 조건");

      act(() => {
        root.unmount();
      });
      root = createRoot(container);

      // 2C. Verify MagazineEditorPage for Broker B
      mockPathname = "/broker/magazine-editor";
      await act(async () => {
        root.render(React.createElement(MagazineEditorPage));
      });
      await flushAsyncEffects(60);

      const magazineContentB = collectRenderedTextAndValues(container);
      expect(magazineContentB).not.toContain("브로커A 전용 11월 VIP 비공개 뉴스레터");
      },
      60000
    );
  });

  describe("3. Anonymous Unit-Test Backward Compatibility (userId = null)", () => {
    it("hydrates legacy un-scoped DealCard seed when userId is null in unit tests", async () => {
      mockCurrentBrowserUserId = null;
      window.localStorage.setItem(
        "credeal-w-dealcards-v5",
        JSON.stringify([
          {
            id: "bld-anon-fixture",
            title: "익명 테스트 호환 빌딩",
            region: "성동구 성수동2가",
            use: "업무시설",
            priceBand: "110~120억",
            status: "draft",
            updatedAt: "방금",
            card4: {
              region: "성동구 성수동2가",
              use: "업무시설",
              gfaPyung: 310,
              floors: "B1/6F",
              stationWalk: "성수역 도보 3분",
              priceBand: "110~120억",
              yieldDisplay: "4.0%",
              headline: "익명 테스트 호환 빌딩",
              posture: "income",
              points: ["성수역 초역세권", "신축급 외관", "전층 우량 임차"],
              provenance: { points: ["broker", "broker", "broker"] },
              card4_version: 2,
            },
          },
        ])
      );

      global.fetch = vi.fn(async () =>
        Response.json({
          ok: true,
          dealcards: [],
          unconvertedMemos: [],
        })
      ) as unknown as typeof global.fetch;

      mockPathname = "/broker/w/dealcards";
      await act(async () => {
        root.render(React.createElement(DealCardsWorkspacePage));
      });
      await flushAsyncEffects(50);

      expect(collectRenderedTextAndValues(container)).toContain("익명 테스트 호환 빌딩");
    });
  });
});
