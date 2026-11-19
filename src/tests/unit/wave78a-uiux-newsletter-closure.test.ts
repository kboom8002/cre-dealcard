// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  pathname: "/search",
  searchParams: "",
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  serviceClientFactory: vi.fn(),
  rateLimitAllowed: true,
  cronSlotAcquired: true,
  acquireCronSlotSpy: vi.fn(),
  requireBrokerCtxMock: vi.fn(),
  assertPublishableMock: vi.fn(),
  generateSpecialEditionMock: vi.fn(),
  distributeSpecialEditionMock: vi.fn(),
  requireAdminRscMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => hoisted.pathname,
  useSearchParams: () => new URLSearchParams(hoisted.searchParams),
  useRouter: () => ({
    push: hoisted.pushMock,
    replace: hoisted.replaceMock,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(async () => hoisted.rateLimitAllowed),
}));

vi.mock("@/lib/security/cron-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/cron-auth")>(
    "@/lib/security/cron-auth",
  );
  return {
    ...actual,
    acquireCronIdempotencySlot: async (...args: unknown[]) => {
      hoisted.acquireCronSlotSpy(...args);
      return { acquired: hoisted.cronSlotAcquired };
    },
  };
});

vi.mock("@/lib/magazine/authz", async () => {
  const actual = await vi.importActual<typeof import("@/lib/magazine/authz")>(
    "@/lib/magazine/authz",
  );
  return {
    ...actual,
    requireBrokerContext: (...args: unknown[]) => hoisted.requireBrokerCtxMock(...args),
  };
});

vi.mock("@/lib/legal/publish-gate", () => ({
  assertPublishable: (...args: unknown[]) => hoisted.assertPublishableMock(...args),
}));

vi.mock("@/domain/magazine/special-edition-generator", () => ({
  generateSpecialEdition: (...args: unknown[]) => hoisted.generateSpecialEditionMock(...args),
}));

vi.mock("@/domain/magazine/distribute-special-edition", async () => {
  const actual = await vi.importActual<
    typeof import("@/domain/magazine/distribute-special-edition")
  >("@/domain/magazine/distribute-special-edition");
  return {
    ...actual,
    distributeSpecialEdition: (...args: unknown[]) => hoisted.distributeSpecialEditionMock(...args),
  };
});

vi.mock("@/lib/auth/require-admin-rsc", () => ({
  requireAdminRsc: () => hoisted.requireAdminRscMock(),
}));

import { GET as getPublicSearch } from "@/app/api/public/search/route";
import { GET as getExploreSearch } from "@/app/api/public/explore/search/route";
import SearchPage from "@/app/(public)/search/page";
import SpaceRegionPage from "@/app/(public)/space/[region]/page";
import HubPage from "@/app/(public)/hub/page";
import GuidePage from "@/app/(public)/guide/page";
import PoweredByPage from "@/app/(public)/powered-by/page";
import BrokerProfilePage from "@/app/(public)/broker-profile/[slug]/page";
import CrossSystemAdminPage from "@/app/admin/cross-system/page";
import { CrossSystemFunnel } from "@/components/admin/cross-system-funnel";
import { POST as postPublicEvents } from "@/app/api/public/events/route";
import DealCardsWorkspaceError from "@/app/(broker)/broker/w/dealcards/error";
import { SeniorHelpProvider } from "@/components/help/SeniorHelpContext";
import { QuickRemedyPopover } from "@/components/help/QuickRemedyPopover";
import { RentRollAiHelperModal } from "@/components/help/RentRollAiHelperModal";
import {
  hashEmailForSuppression,
  isEmailSuppressed,
  loadSuppressedEmailHashesForBroker,
  SUPPRESSION_LOOKUP_FAILED,
} from "@/lib/legal/email-suppression";
import { loadActiveSubscribers, SUBSCRIBER_COLUMNS } from "@/domain/magazine/send-batch";
import { evaluateGate, sendGate } from "@/domain/magazine/send-gate";
import {
  GET as getConsentReconfirm2Yr,
  PRECUTOVER_SELECT_COLUMNS,
} from "@/app/api/cron/consent-reconfirm-2yr/route";
import { POST as postSpecialMagazine } from "@/app/api/broker/magazine/special/route";
import { formatDistributeOutcomeBanner } from "@/app/(broker)/broker/magazine-editor/_components/distribute-result-helper";
import { renderOptInConfirmEmail } from "@/domain/magazine/templates/opt-in-confirm";
import { generateMagazineTeaserCards } from "@/domain/magazine/magazine-teaser-cards";
import { GET as getMagazineEditions } from "@/app/api/magazine/editions/route";
import { resetWorkspaceRepositoryCacheForTests } from "@/lib/workspace/workspace-repository";
import { resetShareLinkTokenStoreForTests } from "@/lib/security/share-link-tokens";

const SUB14_CLASS_RE =
  /(?:^|\s)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/)/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

interface RecordedCall {
  table: string;
  selectCols?: string;
  eqCalls: Array<[string, unknown]>;
  inCalls: Array<[string, unknown[]]>;
  orCalls: string[];
  ilikeCalls: Array<[string, string]>;
  rangeCall?: [number, number];
  inserts: unknown[];
}

function buildMockDb(
  handler: (
    table: string,
    rec: RecordedCall,
  ) => {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
    count?: number | null;
  },
) {
  const calls: RecordedCall[] = [];
  const client = {
    from: (table: string) => {
      const rec: RecordedCall = {
        table,
        eqCalls: [],
        inCalls: [],
        orCalls: [],
        ilikeCalls: [],
        inserts: [],
      };
      calls.push(rec);

      const resolveNow = async () => {
        const res = handler(table, rec);
        return {
          data: res.data ?? [],
          error: res.error ?? null,
          count: res.count ?? (Array.isArray(res.data) ? res.data.length : 0),
        };
      };

      const chain: Record<string, unknown> = {
        select: (cols?: string) => {
          rec.selectCols = cols;
          return chain;
        },
        eq: (col: string, val: unknown) => {
          rec.eqCalls.push([col, val]);
          return chain;
        },
        neq: () => chain,
        in: (col: string, vals: unknown[]) => {
          rec.inCalls.push([col, vals]);
          return chain;
        },
        is: () => chain,
        lt: () => chain,
        lte: () => chain,
        gte: () => chain,
        or: (expr: string) => {
          rec.orCalls.push(expr);
          return chain;
        },
        ilike: (col: string, pat: string) => {
          rec.ilikeCalls.push([col, pat]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        range: (from: number, to: number) => {
          rec.rangeCall = [from, to];
          return chain;
        },
        insert: (payload: unknown) => {
          rec.inserts.push(payload);
          return chain;
        },
        update: () => chain,
        upsert: async () => ({ data: null, error: null }),
        single: async () => {
          const out = await resolveNow();
          const row = Array.isArray(out.data) ? (out.data[0] ?? { id: "row-1" }) : out.data;
          return { data: row, error: out.error };
        },
        maybeSingle: async () => {
          const out = await resolveNow();
          const row = Array.isArray(out.data) ? (out.data[0] ?? null) : out.data;
          return { data: row, error: out.error };
        },
        then: (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => resolveNow().then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
  return { client, calls };
}

describe("Wave 7.8A — Global UI/UX & Newsletter Surgical Closure Suite", () => {
  const savedEnv = { ...process.env };
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    hoisted.pathname = "/search";
    hoisted.searchParams = "";
    hoisted.rateLimitAllowed = true;
    hoisted.cronSlotAcquired = true;
    hoisted.acquireCronSlotSpy.mockReset();
    hoisted.requireBrokerCtxMock.mockReset();
    hoisted.assertPublishableMock.mockReset();
    hoisted.generateSpecialEditionMock.mockReset();
    hoisted.distributeSpecialEditionMock.mockReset();
    hoisted.requireAdminRscMock.mockReset();
    hoisted.requireAdminRscMock.mockResolvedValue({
      user: { id: "admin-1", email: "admin@credeal.kr" },
      role: "admin",
    });
    resetWorkspaceRepositoryCacheForTests();
    if (typeof resetShareLinkTokenStoreForTests === "function") {
      resetShareLinkTokenStoreForTests();
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container) {
      container.remove();
      container = null;
    }
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  describe("1. UI P0-1, P1-1 & P1-2: Real 00021 lease_spaces schema, post-filter deal pagination & verified broker counts/slugs", () => {
    const PUB_BLD_1 = "11111111-1111-4111-8111-111111111111";
    const PUB_BLD_2 = "22222222-2222-4222-8222-222222222222";
    const PRIVATE_BLD = "33333333-3333-4333-8333-333333333333";

    it("queries lease_spaces using ONLY real 00021 columns, filters is_marketplace_listed=true, resolves parent building area_signal, and guards /dc/[building_id] on /space/[region]", async () => {
      const { client, calls } = buildMockDb((table, rec) => {
        if (table === "lease_spaces") {
          // Strict schema enforcement: fail immediately if non-existent columns are queried!
          if (
            (rec.selectCols && /area_signal|title|slug/.test(rec.selectCols)) ||
            rec.ilikeCalls.some(([col]) => /area_signal|title|slug/.test(col)) ||
            rec.orCalls.some((expr) => /area_signal|title|slug/.test(expr))
          ) {
            return {
              data: null,
              error: { code: "42703", message: "schema drift on lease_spaces" },
            };
          }
          return {
            data: [
              {
                id: "aaaaaaaa-1111-4111-8111-111111111111",
                building_id: PUB_BLD_1,
                floor: "4F",
                area_sqm: 165,
                space_type: "office",
                deposit: 9000,
                monthly_rent: 680,
                status: "active",
                is_marketplace_listed: true,
              },
              {
                id: "aaaaaaaa-2222-4222-8222-222222222222",
                building_id: PRIVATE_BLD,
                floor: "1F",
                area_sqm: 99,
                space_type: "f_and_b",
                deposit: 5000,
                monthly_rent: 420,
                area_signal: "GBD 역삼",
                status: "active",
                is_marketplace_listed: true,
              },
              {
                id: "aaaaaaaa-3333-4333-8333-333333333333",
                building_id: PUB_BLD_1,
                floor: "5F",
                area_sqm: 165,
                space_type: "office",
                deposit: 9500,
                monthly_rent: 700,
                status: "active",
                is_marketplace_listed: false,
              },
            ],
          };
        }
        if (table === "building_ssot_lite") {
          return {
            data: [
              {
                id: PUB_BLD_1,
                area_signal: "GBD 강남역 역세권",
                asset_type: "오피스",
                price_band: "200억",
                status: "public_signal_ready",
              },
              {
                id: PRIVATE_BLD,
                area_signal: "GBD 비공개건물",
                asset_type: "근린상가",
                price_band: "100억",
                status: "draft",
              },
            ],
          };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      // 1) GET /api/public/search?type=space&region=gbd&q=오피스
      const res = await getPublicSearch(
        new NextRequest(
          `http://localhost/api/public/search?type=space&region=gbd&q=${encodeURIComponent("오피스")}`,
        ),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("aaaaaaaa-1111-4111-8111-111111111111");
      expect(body.data[0].area_signal).toBe("GBD 강남역 역세권");
      expect(body.data[0].title).toBe("GBD 강남역 역세권 오피스");

      const lsCall = calls.find((c) => c.table === "lease_spaces")!;
      expect(lsCall.selectCols).toBe(
        "id, building_id, floor, area_sqm, space_type, deposit, monthly_rent, status, is_marketplace_listed",
      );
      expect(lsCall.eqCalls).toContainEqual(["is_marketplace_listed", true]);

      // 2) GET /api/public/explore/search?type=space&q=상가 matches f_and_b via Korean alias
      const exploreRes = await getExploreSearch(
        new NextRequest(
          `http://localhost/api/public/explore/search?type=space&q=${encodeURIComponent("상가")}`,
        ),
      );
      expect(exploreRes.status).toBe(200);
      const exploreBody = await exploreRes.json();
      expect(exploreBody.data).toHaveLength(1);
      expect(exploreBody.data[0].space_type).toBe("f_and_b");

      // 3) /space/gbd category chip filtering + verified /dc/[building_id] guard
      const allGbdHtml = renderToStaticMarkup(
        await SpaceRegionPage({ params: Promise.resolve({ region: "gbd" }) }),
      );
      // PUB_BLD_1 is verified public -> renders /dc/PUB_BLD_1 link; PRIVATE_BLD is draft -> NO /dc/PRIVATE_BLD link!
      expect(allGbdHtml).toContain(`href="/dc/${PUB_BLD_1}"`);
      expect(allGbdHtml).not.toContain(`href="/dc/${PRIVATE_BLD}"`);

      const fnbOnlyHtml = renderToStaticMarkup(
        await SpaceRegionPage({
          params: Promise.resolve({ region: "gbd" }),
          searchParams: Promise.resolve({ category: "F&B" }),
        }),
      );
      expect(fnbOnlyHtml).toContain("1건의 공개 임대 공간");
      expect(fnbOnlyHtml).toContain("F&amp;B");
    });

    it("applies post-filter deal pagination so page 1 never falsely returns 0 results when early DB rows are non-public", async () => {
      const DRAFT_WS_1 = "d0000001-0000-4000-8000-000000000001";
      const REVOKED_WS_2 = "d0000002-0000-4000-8000-000000000002";
      const INTERNAL_SC_3 = "d0000003-0000-4000-8000-000000000003";

      const { client } = buildMockDb((table, rec) => {
        if (table === "building_ssot_lite") {
          return {
            data: [
              { id: DRAFT_WS_1, area_signal: "GBD 초안1", asset_type: "오피스", status: "public_signal_ready" },
              { id: REVOKED_WS_2, area_signal: "GBD 회수2", asset_type: "오피스", status: "public_signal_ready" },
              { id: INTERNAL_SC_3, area_signal: "GBD 내부3", asset_type: "오피스", status: "public_signal_ready" },
              { id: PUB_BLD_1, area_signal: "GBD 공개매물1", asset_type: "오피스", price_band: "180억", status: "public_signal_ready" },
              { id: PUB_BLD_2, area_signal: "GBD 공개매물2", asset_type: "근린상가", price_band: "95억", status: "public_signal_ready" },
            ],
            count: 5,
          };
        }
        if (table === "building_signal_cards") {
          return {
            data: [
              { building_id: INTERNAL_SC_3, visibility: "internal_only", status: "draft" },
              { building_id: PUB_BLD_1, visibility: "public_blind", status: "published" },
              { building_id: PUB_BLD_2, visibility: "public_blind", status: "published" },
            ],
          };
        }
        if (table === "workspace_items") {
          const expr = rec.orCalls[0] || "";
          if (expr.includes(DRAFT_WS_1)) {
            return { data: [{ id: DRAFT_WS_1, kind: "dealcard", building_id: DRAFT_WS_1, status: "draft" }] };
          }
          if (expr.includes(REVOKED_WS_2)) {
            return { data: [{ id: REVOKED_WS_2, kind: "dealcard", building_id: REVOKED_WS_2, status: "revoked", revoked_at: "2026-11-18T00:00:00Z" }] };
          }
          return { data: [] };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      // Even with limit=2 on page 1 (where raw DB rows 0..1 are non-public), post-filter pagination returns PUB_BLD_1 & PUB_BLD_2!
      const res = await getPublicSearch(
        new NextRequest("http://localhost/api/public/search?type=deal&limit=2&page=1"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(2);
      expect(body.data.map((r: { id: string }) => r.id)).toEqual([PUB_BLD_1, PUB_BLD_2]);

      const pageHtml = renderToStaticMarkup(
        await SearchPage({ searchParams: Promise.resolve({ type: "deal", page: "1" }) }),
      );
      expect(pageHtml).toContain("(2건)");
      expect(pageHtml).toContain(`href="/dc/${PUB_BLD_1}"`);
      expect(pageHtml).toContain(`href="/dc/${PUB_BLD_2}"`);
    });

    it("includes admin-role public brokers, falls back empty slug to user ID, ranks by verified public deals (never total_deal_count_self), and enriches /broker-profile/[slug]", async () => {
      const BROKER_INFLATED = "b1111111-1111-4111-8111-111111111111";
      const ADMIN_PUBLIC_BROKER = "b2222222-2222-4222-8222-222222222222";

      const { client } = buildMockDb((table, rec) => {
        if (table === "profiles") {
          const idEq = rec.eqCalls.find(([col]) => col === "id")?.[1];
          const rows = [
            {
              id: BROKER_INFLATED,
              role: "broker",
              display_name: "김과장입력",
              company: "과장중개",
              photo_url: null,
              tagline: "강남 중개",
              broker_profiles: {
                slug: "",
                specialty_regions: ["GBD"],
                specialty_assets: ["오피스"],
                is_public: true,
                total_deal_count_self: 999,
                is_verified: true,
              },
            },
            {
              id: ADMIN_PUBLIC_BROKER,
              role: "admin",
              display_name: "박검증대표",
              company: "정석중개법인",
              photo_url: "https://example.com/avatar.jpg",
              tagline: "기관급 빌딩 자문",
              broker_profiles: {
                slug: "park-verified",
                specialty_regions: ["GBD", "YBD"],
                specialty_assets: ["오피스빌딩", "리테일"],
                bio: "20년 상업용 빌딩 매입매각 자문",
                is_public: true,
                total_deal_count_self: 0,
                is_verified: true,
              },
            },
          ];
          if (idEq) return { data: rows.filter((r) => r.id === idEq) };
          return { data: rows };
        }
        if (table === "broker_profiles") {
          return {
            data: [
              {
                user_id: ADMIN_PUBLIC_BROKER,
                slug: "park-verified",
                is_verified: true,
                is_public: true,
                bio: "20년 상업용 빌딩 매입매각 자문",
                specialty_regions: ["GBD", "YBD"],
                specialty_assets: ["오피스빌딩", "리테일"],
              },
            ],
            count: 2,
          };
        }
        if (table === "building_ssot_lite") {
          return {
            data: [
              {
                id: PUB_BLD_1,
                owner_id: ADMIN_PUBLIC_BROKER,
                area_signal: "GBD 테헤란로",
                asset_type: "오피스빌딩",
                price_band: "250억",
                status: "public_signal_ready",
                created_at: "2026-11-18T00:00:00Z",
              },
              {
                id: PUB_BLD_2,
                owner_id: ADMIN_PUBLIC_BROKER,
                area_signal: "YBD 여의도",
                asset_type: "오피스빌딩",
                price_band: "310억",
                status: "public_signal_ready",
                created_at: "2026-11-18T00:00:00Z",
              },
            ],
          };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const res = await getPublicSearch(
        new NextRequest("http://localhost/api/public/search?type=broker"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(2);
      // ADMIN_PUBLIC_BROKER has 2 verified deals -> ranked #1 ahead of BROKER_INFLATED (0 verified deals despite self=999)!
      expect(body.data[0].id).toBe(ADMIN_PUBLIC_BROKER);
      expect(body.data[0].totalDealCount).toBe(2);
      expect(body.data[1].id).toBe(BROKER_INFLATED);
      expect(body.data[1].totalDealCount).toBe(0);
      expect(body.data[1].slug).toBe(BROKER_INFLATED); // never ""!

      const profileHtml = renderToStaticMarkup(
        await BrokerProfilePage({ params: Promise.resolve({ slug: "park-verified" }) }),
      );
      expect(profileHtml).toContain("정석중개법인");
      expect(profileHtml).toContain("기관급 빌딩 자문");
      expect(profileHtml).toContain("20년 상업용 빌딩 매입매각 자문");
      expect(profileHtml).toContain("공개 딜카드");
      expect(profileHtml).toContain("전문 권역");
      expect(profileHtml).toContain("주력 자산군");
    });
  });

  describe("2. UI P1-3..P1-5 & P2-1..P2-5: Statutory 0.9% guide copy, admin cross-system guard, recursive event PII redaction & Escape modals", () => {
    it("renders accurate 0.9% statutory CRE commission copy on /guide and updated /powered-by + /hub copy", async () => {
      const guideHtml = renderToStaticMarkup(GuidePage());
      expect(guideHtml).not.toContain("0.4~0.9%");
      expect(guideHtml).toContain("공인중개사법 시행규칙 제20조 제4항");
      expect(guideHtml).toContain("거래금액의 0.9%(1천분의 9) 이내");

      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.ALLOW_DEMO_SEEDS_IN_PROD;
      const { client, calls } = buildMockDb(() => ({ data: [] }));
      hoisted.serviceClientFactory.mockReturnValue(client);

      const poweredHtml = renderToStaticMarkup(
        await PoweredByPage({
          searchParams: Promise.resolve({ ref: "f1111111-1111-4111-8111-111111111101" }),
        }),
      );
      expect(poweredHtml).toContain("포스처 맞춤형 기관급 PPTX");
      expect(poweredHtml).not.toContain("30페이지 기관급 PPTX");
      // Demo seed refId rejected before hitting building_ssot_lite!
      expect(calls.some((c) => c.table === "building_ssot_lite")).toBe(false);

      const hubHtml = renderToStaticMarkup(await HubPage());
      expect(hubHtml).toContain("공개 딜카드 탐색");
      expect(hubHtml).toContain("권역·용도별 블라인드 매물 검색");
    });

    it("enforces requireAdminRsc, Daylight >=14px, and sanitized Korean error on /admin/cross-system, plus /broker link on dealcards/error.tsx", async () => {
      hoisted.requireAdminRscMock.mockImplementationOnce(async () => {
        throw new Error("NEXT_REDIRECT:/broker");
      });
      await expect(CrossSystemAdminPage()).rejects.toThrow("NEXT_REDIRECT:/broker");

      hoisted.requireAdminRscMock.mockResolvedValueOnce({
        user: { id: "admin-1" },
        role: "admin",
      });
      const adminHtml = renderToStaticMarkup(await CrossSystemAdminPage());
      expect(adminHtml).toContain("bg-slate-50 text-slate-900");

      for (const relPath of [
        "src/app/admin/cross-system/page.tsx",
        "src/components/admin/cross-system-funnel.tsx",
        "src/app/(broker)/broker/w/dealcards/error.tsx",
      ]) {
        expect(readRepoFile(relPath)).not.toMatch(SUB14_CLASS_RE);
      }

      // CrossSystemFunnel never leaks raw exception strings into DOM
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("RAW_SQL_INTERNAL_SECRET_LEAK_99")),
      );
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      await act(async () => {
        root!.render(React.createElement(CrossSystemFunnel));
      });
      expect(container.textContent).toContain(
        "크로스시스템 연계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      expect(container.textContent).not.toContain("RAW_SQL_INTERNAL_SECRET_LEAK_99");

      const errHtml = renderToStaticMarkup(
        React.createElement(DealCardsWorkspaceError, {
          error: new Error("test"),
          reset: () => undefined,
        }),
      );
      expect(errHtml).toContain('href="/broker"');
      expect(errHtml).toContain("워크스페이스 홈으로 이동");
      expect(errHtml).not.toContain('href="/broker/w/inbox"');
    });

    it("recursively redacts PII & strips prototype keys on POST /api/public/events for ALL event types, and closes Help modals on Escape", async () => {
      const { client, calls } = buildMockDb(() => ({ data: [{ id: "ev-1" }] }));
      hoisted.serviceClientFactory.mockReturnValue(client);

      const rawBody =
        '{"type":"activity_event","eventType":"client_error_reported","entityType":"system","metadata":{"message":"Failed for vip@client.co.kr / 010-2222-3333","nested":{"stack":"contact ceo@corp.kr or 02-555-7777","__proto__":{"polluted":1}}}}';
      const res = await postPublicEvents(
        new NextRequest("http://localhost/api/public/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rawBody,
        }),
      );
      expect(res.status).toBe(200);
      const evCall = calls.find((c) => c.table === "activity_events")!;
      const savedMeta = (evCall.inserts[0] as { metadata: Record<string, unknown> }).metadata;
      const serialized = JSON.stringify(savedMeta);
      expect(serialized).not.toContain("vip@client.co.kr");
      expect(serialized).not.toContain("010-2222-3333");
      expect(serialized).not.toContain("ceo@corp.kr");
      expect(serialized).not.toContain("02-555-7777");
      expect(serialized).toContain("[REDACTED]");

      // Help modals close on Escape key
      if (root) {
        act(() => root!.unmount());
        root = null;
      }
      if (container) container.remove();
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root!.render(
          React.createElement(
            SeniorHelpProvider,
            null,
            React.createElement(QuickRemedyPopover),
            React.createElement(RentRollAiHelperModal),
          ),
        );
      });

      const remedyBtn = container.querySelector(
        '[data-testid="studio-quick-remedy-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        remedyBtn.click();
      });
      expect(document.body.querySelector('[aria-label="고객 수정 요청 30초 해결 처방전"]')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(document.body.querySelector('[aria-label="고객 수정 요청 30초 해결 처방전"]')).toBeNull();

      const rentRollBtn = container.querySelector(
        '[data-testid="rentroll-ai-helper-btn"]',
      ) as HTMLButtonElement;
      await act(async () => {
        rentRollBtn.click();
      });
      expect(document.body.querySelector('[aria-label="렌트롤 AI 변환 도우미"]')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(document.body.querySelector('[aria-label="렌트롤 AI 변환 도우미"]')).toBeNull();
    });
  });

  describe("3. NL P0-1, P0-2 & P0-3: Fail-closed pre-cutover & batch email suppression, sendGate bounce block & SQL migration lock-down", () => {
    const BROKER_UUID = "11111111-1111-4111-8111-111111111111";

    it("retries legacy suppression tables on 42703 and fails closed (lookup_failed) on unexpected legacy DB errors in isEmailSuppressed", async () => {
      // 1) 42P01 on email_suppressions + 42703 on extended columns -> retries core columns and detects unsubscribed!
      const preCutoverDb = buildMockDb((table, rec) => {
        if (table === "email_suppressions") {
          return { data: null, error: { code: "42P01", message: 'relation "email_suppressions" does not exist' } };
        }
        if (table === "magazine_subscribers") {
          if (rec.selectCols?.includes("email_delivery_status")) {
            return { data: null, error: { code: "42703", message: 'column "email_delivery_status" does not exist' } };
          }
          return { data: [{ broker_id: BROKER_UUID, status: "unsubscribed", unsubscribed_at: null }] };
        }
        return { data: [] };
      });

      const subSupp = await isEmailSuppressed(preCutoverDb.client, {
        email: "unsub@legacy.kr",
        brokerId: BROKER_UUID,
      });
      expect(subSupp).toEqual({ suppressed: true, reason: "unsubscribe" });

      // 2) 42703 on broker_clients.consent_status -> retries .select('tags') and blocks '수신거부' tag
      const clientFallbackDb = buildMockDb((table, rec) => {
        if (table === "email_suppressions") {
          return { data: null, error: { code: "42P01", message: "missing table" } };
        }
        if (table === "magazine_subscribers") {
          return { data: [] };
        }
        if (table === "broker_clients") {
          if (rec.selectCols?.includes("consent_status")) {
            return { data: null, error: { code: "42703", message: 'column "consent_status" does not exist' } };
          }
          return { data: [{ tags: ["VIP", "수신거부"] }] };
        }
        return { data: [] };
      });

      const cliSupp = await isEmailSuppressed(clientFallbackDb.client, {
        email: "crm-optout@legacy.kr",
        brokerId: BROKER_UUID,
      });
      expect(cliSupp).toEqual({ suppressed: true, reason: "unsubscribe" });

      // 3) Unexpected DB error on legacy fallback -> fails closed (lookup_failed)!
      const brokenLegacyDb = buildMockDb((table) => {
        if (table === "email_suppressions") {
          return { data: null, error: { code: "42P01", message: "missing table" } };
        }
        if (table === "magazine_subscribers") {
          return { data: null, error: { code: "57014", message: "statement timeout" } };
        }
        return { data: [] };
      });

      const failClosed = await isEmailSuppressed(brokenLegacyDb.client, {
        email: "anyone@legacy.kr",
        brokerId: BROKER_UUID,
      });
      expect(failClosed).toEqual({ suppressed: true, reason: SUPPRESSION_LOOKUP_FAILED });
    });

    it("throws SUPPRESSION_LOOKUP_FAILED on unexpected DB failure and collects legacy hashes on 42P01 in loadSuppressedEmailHashesForBroker", async () => {
      const brokenBatchDb = buildMockDb(() => ({
        data: null,
        error: { code: "XX000", message: "connection pool exhausted" },
      }));

      await expect(
        loadSuppressedEmailHashesForBroker(brokenBatchDb.client, BROKER_UUID),
      ).rejects.toThrow(/SUPPRESSION_LOOKUP_FAILED/);

      const preCutoverBatchDb = buildMockDb((table, rec) => {
        if (table === "email_suppressions") {
          return { data: null, error: { code: "42P01", message: 'relation "email_suppressions" does not exist' } };
        }
        if (table === "broker_profiles") {
          return { data: [{ slug: "alpha-slug" }] };
        }
        if (table === "magazine_subscribers") {
          if (rec.selectCols?.includes("email_delivery_status")) {
            return { data: null, error: { code: "42703", message: "missing email_delivery_status" } };
          }
          return {
            data: [
              { subscriber_email: "SubUnsub@Test.kr", broker_id: "alpha-slug", status: "unsubscribed", unsubscribed_at: null },
            ],
          };
        }
        if (table === "broker_clients") {
          if (rec.selectCols?.includes("consent_status")) {
            return { data: null, error: { code: "42703", message: "missing consent_status" } };
          }
          return {
            data: [{ email: "CrmUnsub@Test.kr", tags: ["수신거부"] }],
          };
        }
        return { data: [] };
      });

      const hashes = await loadSuppressedEmailHashesForBroker(preCutoverBatchDb.client, BROKER_UUID);
      expect(hashes.has(hashEmailForSuppression("subunsub@test.kr"))).toBe(true);
      expect(hashes.has(hashEmailForSuppression("crmunsub@test.kr"))).toBe(true);
    });

    it("includes email_delivery_status in SUBSCRIBER_COLUMNS (with 42703 retry) and blocks bounced/complained subscribers in sendGate with SUPPRESSED", async () => {
      expect(SUBSCRIBER_COLUMNS).toContain("email_delivery_status");

      const retryDb = buildMockDb((table, rec) => {
        if (table === "magazine_subscribers") {
          if (rec.selectCols?.includes("email_delivery_status")) {
            return { data: null, error: { code: "42703", message: 'column "email_delivery_status" does not exist' } };
          }
          return {
            data: [
              {
                id: "sub-1",
                subscriber_email: "ok@test.kr",
                channel: "email",
                status: "active",
                marketing_consent_at: "2026-01-01T00:00:00Z",
                confirm_status: "confirmed",
              },
            ],
          };
        }
        return { data: [] };
      });

      const activeSubs = await loadActiveSubscribers(retryDb.client as never, ["alpha-slug"]);
      expect(activeSubs).toHaveLength(1);
      expect(activeSubs[0].id).toBe("sub-1");

      process.env.MAGAZINE_SEND_ENABLED = "true";
      process.env.MAGAZINE_SEND_DRY_RUN = "true";

      const baseInput = {
        channel: "email" as const,
        editionKey: "alpha:2026-11-18:weekly",
        brokerId: "alpha",
        kind: "weekly" as const,
        rendered: {
          subject: "(광고) 주간 브리핑",
          body: "<p>(광고) 본문</p>",
          hasUnsubscribeLink: true,
          hasAdLabel: true,
          senderName: "김중개",
          senderContact: "02-555-1234",
        },
      };

      const bouncedVerdict = evaluateGate(
        {
          ...baseInput,
          subscriber: {
            id: "sub-bounced",
            subscriber_email: "bounced@test.kr",
            channel: "email",
            status: "active",
            marketing_consent_at: "2026-01-01T00:00:00Z",
            confirm_status: "confirmed",
            email_delivery_status: "bounced",
          },
        },
        new Date("2026-11-18T03:00:00Z"), // 12:00 KST
        true,
      );
      expect(bouncedVerdict?.blocked).toBe("SUPPRESSED");

      const ledgerDb = buildMockDb(() => ({ data: [{ id: "log-1" }] }));
      const gateRes = await sendGate(
        {
          ...baseInput,
          subscriber: {
            id: "22222222-2222-4222-8222-222222222222",
            subscriber_email: "bounced@test.kr",
            channel: "email",
            status: "active",
            marketing_consent_at: "2026-01-01T00:00:00Z",
            confirm_status: "confirmed",
            email_delivery_status: "bounced",
          },
        },
        {
          supabase: ledgerDb.client as never,
          now: new Date("2026-11-18T03:00:00Z"),
          dryRun: true,
        },
      );
      expect(gateRes).toMatchObject({ ok: false, blocked: "SUPPRESSED" });

      // Verify SQL migration 20261117000002 has pgcrypto, historical backfill & contact_history FORCE RLS
      const migSql = readRepoFile("supabase/migrations/20261117000002_email_suppressions_and_consent.sql");
      expect(migSql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
      expect(migSql).toContain("migration_backfill");
      expect(migSql).toContain("ALTER TABLE public.contact_history FORCE ROW LEVEL SECURITY;");
      expect(migSql).toContain('"contact_history_select_own"');
      expect(migSql).toContain('"contact_history_service_all"');
    });
  });

  describe("4. NL P1-1..P1-4 & NL P2-1..P2-2: Cron pre-cutover probe, special QG needs_review gate, delete guard, >=14px email/SVG & helper dedup", () => {
    it("probes page 0 with 3rd-tier PRECUTOVER_SELECT_COLUMNS before acquiring cron slot so transient errors never burn the daily slot", async () => {
      process.env.CRON_SECRET = "cron-secret-78a";
      process.env.MAGAZINE_SEND_ENABLED = "false";
      process.env.MAGAZINE_SEND_DRY_RUN = "true";

      expect(PRECUTOVER_SELECT_COLUMNS).toBe(
        "id, broker_id, broker_user_id, subscriber_email, subscriber_name, marketing_consent_at, confirm_status, status, unsubscribed_at",
      );

      // 1) Transient DB failure -> returns 500 BEFORE acquireCronIdempotencySlot is ever called!
      const transientErrDb = buildMockDb(() => ({
        data: null,
        error: { code: "57014", message: "canceling statement due to statement timeout" },
      }));
      hoisted.serviceClientFactory.mockReturnValue(transientErrDb.client);

      const failRes = await getConsentReconfirm2Yr(
        new NextRequest("http://localhost/api/cron/consent-reconfirm-2yr", {
          headers: { authorization: "Bearer cron-secret-78a" },
        }),
      );
      expect(failRes.status).toBe(500);
      expect(hoisted.acquireCronSlotSpy).not.toHaveBeenCalled();

      // 2) Pre-cutover DB missing both email_delivery_status AND reconfirm_notified_at/consent_status -> succeeds on 3rd tier!
      const oldConsent = new Date(Date.now() - 730 * 86_400_000).toISOString();
      const preCutoverCronDb = buildMockDb((table, rec) => {
        if (table === "magazine_subscribers") {
          if (
            rec.selectCols?.includes("email_delivery_status") ||
            rec.selectCols?.includes("reconfirm_notified_at") ||
            rec.selectCols?.includes("consent_status")
          ) {
            return { data: null, error: { code: "42703", message: "column does not exist" } };
          }
          return {
            data: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                broker_id: "alpha-slug",
                broker_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                subscriber_email: "reader@credeal.kr",
                subscriber_name: "이독자",
                marketing_consent_at: oldConsent,
                confirm_status: "confirmed",
                status: "active",
                unsubscribed_at: null,
              },
            ],
          };
        }
        if (table === "email_suppressions") {
          return { data: null, error: { code: "42P01", message: "missing table" } };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(preCutoverCronDb.client);

      const okRes = await getConsentReconfirm2Yr(
        new NextRequest("http://localhost/api/cron/consent-reconfirm-2yr", {
          headers: { authorization: "Bearer cron-secret-78a" },
        }),
      );
      expect(okRes.status).toBe(200);
      const okJson = await okRes.json();
      expect(okJson.ok).toBe(true);
      expect(okJson.simulated).toBe(1);
      expect(hoisted.acquireCronSlotSpy).toHaveBeenCalledTimes(1);
    });

    it("skips distributeSpecialEdition and returns autoDistributeSkipped: NEEDS_REVIEW when QG marks special edition needs_review", async () => {
      const BROKER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const BLD_ID = "11111111-1111-4111-8111-111111111111";

      hoisted.requireBrokerCtxMock.mockResolvedValue({
        ctx: {
          userId: BROKER_ID,
          slug: "alpha-broker",
          brokerKeys: ["alpha-broker", BROKER_ID],
          displayName: "김알파",
        },
        error: null,
      });
      hoisted.assertPublishableMock.mockResolvedValue({ ok: true });
      hoisted.generateSpecialEditionMock.mockResolvedValueOnce({
        id: "22222222-2222-4222-8222-222222222222",
        broker_id: "alpha-broker",
        edition_type: "special",
        edition_label: "FLASH-20261118",
        title: "[단독 속보] 강남 오피스",
        status: "needs_review",
        published_at: null,
        content: {},
      });

      const { client } = buildMockDb((table) => {
        if (table === "building_ssot_lite") {
          return {
            data: [
              {
                id: BLD_ID,
                owner_id: BROKER_ID,
                raw_address: "서울 강남구 역삼동 123",
                area_signal: "GBD 역삼역",
                asset_type: "오피스",
                price_band: "180억",
                layers: {},
              },
            ],
          };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const res = await postSpecialMagazine(
        new NextRequest("http://localhost/api/broker/magazine/special", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildingId: BLD_ID,
            autoDistribute: true,
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.published).toBe(false);
      expect(body.sent).toBe(0);
      expect(body.autoDistributeSkipped).toBe("NEEDS_REVIEW");
      expect(hoisted.distributeSpecialEditionMock).not.toHaveBeenCalled();
    });

    it("enforces >=14px email/teaser HTML, deduplicates DAILY_CAP in formatDistributeOutcomeBanner, guards offline delete in magazine-editor, and preserves email on PGRST204 in editions/route.ts", async () => {
      const optIn = renderOptInConfirmEmail({
        brokerName: "김알파",
        confirmUrl: "https://credeal.net/magazine/confirm?token=abc",
        ttlDays: 7,
      });
      expect(optIn.html).not.toContain("font-size:13px");
      expect(optIn.html).not.toContain("font-size:12px");
      expect(optIn.html).toContain("font-size:14px");

      const cards = generateMagazineTeaserCards([
        {
          id: "deal-1",
          attrs: { areaSignal: "GBD 강남", assetType: "오피스", priceBand: "200억" },
        },
      ]);
      expect(cards).toHaveLength(1);
      expect(cards[0].cardHtml).not.toContain("font-size:12px");
      expect(cards[0].cardHtml).toContain("font-size:14px");

      // Deduplicate DAILY_CAP when present on both top-level `blocked` and `result.blocked`
      const banner = formatDistributeOutcomeBanner(
        {
          blocked: "DAILY_CAP",
          result: { blocked: { DAILY_CAP: 3 } },
        },
        200,
      );
      expect(banner.blockedReasons).toHaveLength(1);
      expect(banner.blockedReasons[0]).toMatchObject({ code: "DAILY_CAP", count: 3 });
      expect(banner.blockedTotal).toBe(3);

      // Magazine editor line cap & offline !delRes guard
      const editorSrc = readRepoFile("src/app/(broker)/broker/magazine-editor/page.tsx");
      expect(editorSrc.split(/\r?\n/).length).toBeLessThanOrEqual(3770);
      expect(editorSrc).toContain("if (!delRes || (!delRes.ok && delRes.status !== 404))");
      expect(editorSrc).toContain("삭제에 실패했습니다. 네트워크 연결을 확인해 주세요.");

      // editions/route.ts PGRST204 fallback keeps `email` in broker_clients select
      const BROKER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      hoisted.requireBrokerCtxMock.mockResolvedValue({
        ctx: {
          userId: BROKER_ID,
          slug: "alpha-broker",
          brokerKeys: ["alpha-broker", BROKER_ID],
          displayName: "김알파",
        },
        error: null,
      });
      const { client, calls } = buildMockDb((table, rec) => {
        if (table === "broker_clients") {
          if (rec.selectCols?.includes("consent_status")) {
            return { data: null, error: { code: "PGRST204", message: "consent_status not in schema cache" } };
          }
          return {
            data: [
              {
                id: "cli-1",
                display_name: "홍길동",
                email: "hong@buyer.kr",
                phone: null,
                tier: "vip",
                tags: ["뉴스레터구독"],
              },
            ],
          };
        }
        return { data: [] };
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const edRes = await getMagazineEditions(
        new NextRequest("http://localhost/api/magazine/editions?broker_id=me"),
      );
      expect(edRes.status).toBe(200);
      const edJson = await edRes.json();
      expect(edJson.subscriberCount).toBe(1);
      const bcFallbackCall = calls.filter((c) => c.table === "broker_clients").pop()!;
      expect(bcFallbackCall.selectCols).toBe("id, display_name, email, phone, tier, tags");
    });
  });
});
