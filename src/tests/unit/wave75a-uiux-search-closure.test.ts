// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  pathname: "/search",
  searchParams: "",
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  serviceClientFactory: vi.fn(),
  rateLimitAllowed: true,
  quickRecords: [] as Array<Record<string, unknown>>,
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

vi.mock("@/lib/im-lite/quick-generate-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/im-lite/quick-generate-store")>(
    "@/lib/im-lite/quick-generate-store",
  );
  return {
    ...actual,
    listAllQuickImRecords: () => hoisted.quickRecords,
  };
});

import SearchPage from "@/app/(public)/search/page";
import { GET as getPublicSearch } from "@/app/api/public/search/route";
import DealRegionPage from "@/app/(public)/deal/[region]/page";
import SpaceRegionPage from "@/app/(public)/space/[region]/page";
import { UnifiedSearchBar } from "@/components/search/UnifiedSearchBar";
import { isFixedLightPaperRoute } from "@/components/ui/ThemeToggle";
import { getAggregatedBrokerHomeData, getInboxPendingCount } from "@/domain/broker/home-aggregated";
import { POST as postPublicEvents } from "@/app/api/public/events/route";
import { SurveyProvider, useSurvey } from "@/components/feedback/SurveyProvider";
import {
  revokeShareLinkToken,
  restoreShareLinkToken,
  resetShareLinkTokenStoreForTests as resetShareLinkTokensForTest,
} from "@/lib/security/share-link-tokens";
import { purgeWorkspaceClientStorage } from "@/lib/workspace/storage-namespace";
import { resetWorkspaceRepositoryCacheForTests } from "@/lib/workspace/workspace-repository";
import { buildCanonicalMagazineRedirectUrl } from "@/app/(broker)/broker/w/magazine/page";

const SUB14_CLASS_RE =
  /(?:^|\s)(?:(?:[a-z0-9-]+|\[[^\]\s]*\]):)*!?text-(?:xs|\[(?:[0-9]|1[0-3])(?:\.\d+)?px\])!?(?=$|\s|\/)/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf8");
}

interface RecordedQueryCall {
  table: string;
  selectCols?: string;
  eqCalls: Array<[string, unknown]>;
  inCalls: Array<[string, unknown[]]>;
  orCalls: string[];
  ilikeCalls: Array<[string, string]>;
  rangeCall?: [number, number];
  inserts: unknown[];
}

function buildProgrammableSupabase(handlers: {
  onTableRows?: (table: string, rec: RecordedQueryCall) => {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
    count?: number | null;
  };
}) {
  const calls: RecordedQueryCall[] = [];

  const client = {
    from: (table: string) => {
      const rec: RecordedQueryCall = {
        table,
        eqCalls: [],
        inCalls: [],
        orCalls: [],
        ilikeCalls: [],
        inserts: [],
      };
      calls.push(rec);

      const resolveNow = async () => {
        const out = handlers.onTableRows?.(table, rec) ?? { data: [], error: null, count: 0 };
        return {
          data: out.data ?? [],
          error: out.error ?? null,
          count: out.count ?? (Array.isArray(out.data) ? out.data.length : 0),
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
        or: (expr: string) => {
          rec.orCalls.push(expr);
          return chain;
        },
        ilike: (col: string, pattern: string) => {
          rec.ilikeCalls.push([col, pattern]);
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
          const res = await resolveNow();
          const row = Array.isArray(res.data) ? (res.data[0] ?? { id: "ev-1" }) : res.data;
          return { data: row, error: res.error };
        },
        maybeSingle: async () => {
          const res = await resolveNow();
          const row = Array.isArray(res.data) ? (res.data[0] ?? null) : res.data;
          return { data: row, error: res.error };
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

describe("Wave 7.5A — Global UI/UX & Public Search/Region Security Closure", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  beforeEach(() => {
    hoisted.pathname = "/search";
    hoisted.searchParams = "";
    hoisted.pushMock.mockReset();
    hoisted.replaceMock.mockReset();
    hoisted.rateLimitAllowed = true;
    hoisted.quickRecords = [];
    resetWorkspaceRepositoryCacheForTests();
    if (typeof resetShareLinkTokensForTest === "function") {
      resetShareLinkTokensForTest();
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
  });

  describe("1. P0-1: /search & /api/public/search PostgREST .or() injection, blind columns, page clamping, visibility & links", () => {
    const PUB_ID = "11111111-1111-4111-8111-111111111111";
    const DRAFT_WS_ID = "22222222-2222-4222-8222-222222222222";
    const REVOKED_WS_ID = "33333333-3333-4333-8333-333333333333";
    const INTERNAL_SC_ID = "44444444-4444-4444-8444-444444444444";
    const DRAFT_BLD_ID = "55555555-5555-4555-8555-555555555555";

    function createSearchFixtureClient() {
      return buildProgrammableSupabase({
        onTableRows: (table, rec) => {
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: PUB_ID,
                  area_signal: "GBD 강남역 역세권",
                  asset_type: "업무시설",
                  price_band: "180~200억",
                  size_signal: "연면적 450평",
                  status: "public_signal_ready",
                  updated_at: "2026-11-18T00:00:00Z",
                  owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                },
                {
                  id: DRAFT_WS_ID,
                  area_signal: "GBD 논현동 비공개초안",
                  asset_type: "근린생활시설",
                  price_band: "90억",
                  status: "public_signal_ready",
                  updated_at: "2026-11-18T00:00:00Z",
                },
                {
                  id: REVOKED_WS_ID,
                  area_signal: "GBD 역삼동 회수매물",
                  asset_type: "업무시설",
                  price_band: "150억",
                  status: "public_signal_ready",
                  updated_at: "2026-11-18T00:00:00Z",
                },
                {
                  id: INTERNAL_SC_ID,
                  area_signal: "GBD 삼성동 내부전용",
                  asset_type: "업무시설",
                  price_band: "300억",
                  status: "public_signal_ready",
                  updated_at: "2026-11-18T00:00:00Z",
                },
                {
                  id: DRAFT_BLD_ID,
                  area_signal: "GBD 청담동 미발행초안",
                  asset_type: "근린생활시설",
                  price_band: "120억",
                  status: "draft",
                  updated_at: "2026-11-18T00:00:00Z",
                },
              ],
              count: 5,
            };
          }
          if (table === "building_signal_cards") {
            return {
              data: [
                { building_id: PUB_ID, visibility: "public_blind", status: "draft" },
                { building_id: INTERNAL_SC_ID, visibility: "internal_only", status: "draft" },
              ],
            };
          }
          if (table === "workspace_items") {
            const orExpr = rec.orCalls[0] || "";
            if (orExpr.includes(PUB_ID)) {
              return {
                data: [
                  {
                    id: PUB_ID,
                    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    kind: "dealcard",
                    building_id: PUB_ID,
                    status: "published",
                    title: "강남역 오피스",
                    address: "GBD 강남역",
                    published_snapshot: { headline: "강남역 오피스" },
                    draft_payload: {},
                  },
                ],
              };
            }
            if (orExpr.includes(DRAFT_WS_ID)) {
              return {
                data: [
                  {
                    id: DRAFT_WS_ID,
                    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    kind: "dealcard",
                    building_id: DRAFT_WS_ID,
                    status: "draft",
                    title: "논현동 초안",
                    address: "논현동",
                    published_snapshot: null,
                    draft_payload: { secret: true },
                  },
                ],
              };
            }
            if (orExpr.includes(REVOKED_WS_ID)) {
              return {
                data: [
                  {
                    id: REVOKED_WS_ID,
                    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    kind: "dealcard",
                    building_id: REVOKED_WS_ID,
                    status: "revoked",
                    revoked_at: "2026-11-18T01:00:00Z",
                    title: "회수 매물",
                    address: "역삼동",
                    published_snapshot: { headline: "회수 매물" },
                    draft_payload: {},
                  },
                ],
              };
            }
            return { data: [] };
          }
          if (table === "lease_spaces") {
            return {
              data: [
                {
                  id: "sp-with-slug",
                  building_id: PUB_ID,
                  floor: "3F",
                  area_sqm: 165,
                  space_type: "office",
                  deposit: 10000,
                  monthly_rent: 850,
                  status: "active",
                  is_marketplace_listed: true,
                },
                {
                  id: "sp-no-slug",
                  floor: "2F",
                  area_sqm: 99,
                  space_type: "retail",
                  deposit: 5000,
                  monthly_rent: 420,
                  area_signal: "성수동",
                  title: "성수 스튜디오 임대",
                  status: "active",
                  is_marketplace_listed: true,
                },
              ],
              count: 2,
            };
          }
          return { data: [], count: 0 };
        },
      });
    }

    it("blocks PostgREST .or() filter injection, clamps NaN/negative/huge page, selects only blind columns, and hides unpublished/revoked/internal_only deals on /api/public/search", async () => {
      const { client, calls } = createSearchFixtureClient();
      hoisted.serviceClientFactory.mockReturnValue(client);

      const injectedUrl =
        "http://localhost/api/public/search?type=deal&q=" +
        encodeURIComponent("zz,raw_input.ilike.*테헤란로152*") +
        "&page=-9";
      const res = await getPublicSearch(new NextRequest(injectedUrl));
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.page).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(PUB_ID);
      expect(body.data[0].raw_input).toBeUndefined();
      expect(body.data[0].raw_address).toBeUndefined();
      expect(body.data[0].layers).toBeUndefined();

      const bldCall = calls.find((c) => c.table === "building_ssot_lite")!;
      expect(bldCall.selectCols).toBe(
        "id, area_signal, asset_type, price_band, size_signal, status, updated_at, owner_id",
      );
      expect(bldCall.selectCols).not.toMatch(/raw_input|raw_address|layers/);
      expect(bldCall.eqCalls).toContainEqual(["status", "public_signal_ready"]);
      expect(bldCall.rangeCall).toEqual([0, 199]);

      // Exactly 1 comma separating area_signal and asset_type — injected comma & '*' stripped!
      expect(bldCall.orCalls).toHaveLength(1);
      expect(bldCall.orCalls[0].split(",")).toHaveLength(2);
      expect(bldCall.orCalls[0]).not.toContain("*");
      expect(bldCall.orCalls[0]).toMatch(/^area_signal\.ilike\.%[^,()*:"']+%,asset_type\.ilike\.%[^,()*:"']+%$/);

      // Huge page clamps to 100, NaN clamps to 1
      const hugeRes = await getPublicSearch(
        new NextRequest("http://localhost/api/public/search?type=deal&page=9999&limit=10"),
      );
      const hugeBody = await hugeRes.json();
      expect(hugeBody.page).toBe(100);
      expect(hugeBody.data).toEqual([]);
      const lastBldCall = calls.filter((c) => c.table === "building_ssot_lite").pop()!;
      expect(lastBldCall.rangeCall).toEqual([0, 199]);

      const nanRes = await getPublicSearch(
        new NextRequest("http://localhost/api/public/search?type=deal&page=not-a-number"),
      );
      const nanBody = await nanRes.json();
      expect(nanBody.page).toBe(1);
    });

    it("renders /search deal results linking to /dc/[id] and space results linking to /space/[region] using real 00021 lease_spaces columns", async () => {
      const { client, calls } = createSearchFixtureClient();
      hoisted.serviceClientFactory.mockReturnValue(client);

      const dealElement = await SearchPage({
        searchParams: Promise.resolve({
          q: "zz,raw_input.ilike.*테헤란로152*",
          type: "deal",
          page: "NaN",
        }),
      });
      const dealHtml = renderToStaticMarkup(dealElement);

      expect(dealHtml).toContain(`href="/dc/${PUB_ID}"`);
      expect(dealHtml).not.toContain(`/deal/`);
      expect(dealHtml).not.toContain(DRAFT_WS_ID);
      expect(dealHtml).not.toContain(REVOKED_WS_ID);
      expect(dealHtml).not.toContain(INTERNAL_SC_ID);
      expect(dealHtml).not.toContain(DRAFT_BLD_ID);

      const searchBldCall = calls.find((c) => c.table === "building_ssot_lite")!;
      expect(searchBldCall.rangeCall).toEqual([0, 199]);
      expect(searchBldCall.orCalls[0].split(",")).toHaveLength(2);

      // Space results: always link to live /space/[region] (never dormant /leasing/[slug] or /space/[region]/[id])
      const allSpacesElement = await SearchPage({
        searchParams: Promise.resolve({
          type: "space",
          region: "all",
          page: "-3",
        }),
      });
      const allSpacesHtml = renderToStaticMarkup(allSpacesElement);
      expect(allSpacesHtml).toContain('href="/space/gbd"');
      expect(allSpacesHtml).toContain('href="/space/seongsu"');
      expect(allSpacesHtml).not.toContain("/leasing/");
      expect(allSpacesHtml).not.toContain("/space/seongsu/sp-");
      expect(allSpacesHtml).not.toContain("sp-no-slug");

      const seongsuSpaceElement = await SearchPage({
        searchParams: Promise.resolve({
          type: "space",
          region: "seongsu",
          page: "-3",
        }),
      });
      const seongsuSpaceHtml = renderToStaticMarkup(seongsuSpaceElement);
      expect(seongsuSpaceHtml).toContain('href="/space/seongsu"');
      expect(seongsuSpaceHtml).not.toContain('href="/space/gbd"');

      // Verify lease_spaces query never selects non-existent slug/area_signal/title columns
      const realSchemaDb = buildProgrammableSupabase({
        onTableRows: (table, rec) => {
          if (table === "lease_spaces") {
            if (rec.selectCols && /slug|area_signal|title/.test(rec.selectCols)) {
              return {
                data: null,
                error: { code: "42703", message: "column does not exist" },
              };
            }
            return {
              data: [
                {
                  id: "sp-legacy-1",
                  floor: "3F",
                  space_type: "office",
                  area_sqm: 120,
                  deposit: 3000,
                  monthly_rent: 300,
                  area_signal: "강남",
                  title: "강남 레거시 임대 공간",
                  status: "active",
                  is_marketplace_listed: true,
                },
              ],
              count: 1,
            };
          }
          return { data: [], count: 0 };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(realSchemaDb.client);

      const legacySpaceEl = await SearchPage({
        searchParams: Promise.resolve({ type: "space" }),
      });
      const legacySpaceHtml = renderToStaticMarkup(legacySpaceEl);
      expect(legacySpaceHtml).toContain("강남 레거시 임대 공간");
      expect(legacySpaceHtml).toContain('href="/space/gbd"');
      expect(legacySpaceHtml).not.toContain("sp-legacy-1");
    });
  });

  describe("2. P0-2 & P1-4: /deal/[region], /space/[region] visibility filtering + Daylight paper & >=14px enforcement", () => {
    it("filters out draft/archived/revoked items on /deal/[region] and /space/[region] and links cards to /dc/[id]", async () => {
      const VISIBLE_ID = "66666666-6666-4666-8666-666666666666";
      const DRAFT_ID = "77777777-7777-4777-8777-777777777777";
      const REVOKED_ID = "88888888-8888-4888-8888-888888888888";

      const { client, calls } = buildProgrammableSupabase({
        onTableRows: (table, rec) => {
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: VISIBLE_ID,
                  area_signal: "GBD 역삼역",
                  asset_type: "오피스",
                  price_band: "210억",
                  status: "public_signal_ready",
                },
                {
                  id: DRAFT_ID,
                  area_signal: "GBD 삼성역 초안",
                  asset_type: "근린생활시설",
                  price_band: "95억",
                  status: "draft",
                },
                {
                  id: REVOKED_ID,
                  area_signal: "GBD 선릉역 회수",
                  asset_type: "오피스",
                  price_band: "140억",
                  status: "public_signal_ready",
                },
              ],
            };
          }
          if (table === "workspace_items") {
            const orExpr = rec.orCalls[0] || "";
            if (orExpr.includes(REVOKED_ID)) {
              return {
                data: [
                  {
                    id: REVOKED_ID,
                    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    kind: "dealcard",
                    building_id: REVOKED_ID,
                    status: "revoked",
                    revoked_at: "2026-11-18T02:00:00Z",
                    title: "회수 빌딩",
                    address: "선릉역",
                  },
                ],
              };
            }
            return { data: [] };
          }
          return { data: [] };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const dealRegionHtml = renderToStaticMarkup(
        await DealRegionPage({ params: Promise.resolve({ region: "gbd" }) }),
      );
      expect(dealRegionHtml).toContain(`href="/dc/${VISIBLE_ID}"`);
      expect(dealRegionHtml).not.toContain(DRAFT_ID);
      expect(dealRegionHtml).not.toContain(REVOKED_ID);
      expect(dealRegionHtml).not.toContain("draft");
      expect(dealRegionHtml).not.toContain("/deal/gbd/");

      const spaceRegionHtml = renderToStaticMarkup(
        await SpaceRegionPage({ params: Promise.resolve({ region: "gbd" }) }),
      );
      expect(spaceRegionHtml).toContain(`href="/dc/${VISIBLE_ID}"`);
      expect(spaceRegionHtml).not.toContain(DRAFT_ID);
      expect(spaceRegionHtml).not.toContain(REVOKED_ID);
      expect(spaceRegionHtml).not.toContain("draft");

      const regionBldCalls = calls.filter((c) => c.table === "building_ssot_lite");
      expect(regionBldCalls).toHaveLength(2);
      for (const c of regionBldCalls) {
        expect(c.eqCalls).toContainEqual(["status", "public_signal_ready"]);
        expect(c.selectCols).not.toMatch(/raw_input|raw_address|layers/);
      }
    });

    it("enforces Daylight paper, zero sub-14px text tokens, ThemeToggle fixed-light routes, and UnifiedSearchBar Korean a11y labels", () => {
      const targetUiFiles = [
        "src/app/(public)/search/page.tsx",
        "src/app/(public)/deal/[region]/page.tsx",
        "src/app/(public)/space/[region]/page.tsx",
        "src/components/search/UnifiedSearchBar.tsx",
      ];

      for (const relPath of targetUiFiles) {
        const src = readRepoFile(relPath);
        expect(src, `${relPath} must have zero sub-14px text classes`).not.toMatch(
          SUB14_CLASS_RE,
        );
        expect(src, `${relPath} must omit legacy dark canvas hexes`).not.toMatch(
          /#070b13|#0a0f1d|#0b0f19|#0d1424|#131b2e|#121824/i,
        );
      }

      expect(isFixedLightPaperRoute("/search")).toBe(true);
      expect(isFixedLightPaperRoute("/space/gbd")).toBe(true);
      expect(isFixedLightPaperRoute("/deal/gbd")).toBe(true);
      expect(isFixedLightPaperRoute("/hub")).toBe(true);

      const searchBarSrc = readRepoFile("src/components/search/UnifiedSearchBar.tsx");
      expect(searchBarSrc).toContain('aria-label="검색어 지우기"');
      expect(searchBarSrc).toContain('aria-label="검색창 닫기"');
      expect(searchBarSrc).toContain('aria-label="최근 검색어 삭제"');
      expect(searchBarSrc).toContain("min-h-[44px] min-w-[44px]");

      const barHtml = renderToStaticMarkup(
        React.createElement(UnifiedSearchBar, { initialValue: "강남" }),
      );
      expect(barHtml).toContain('aria-label="검색어 지우기"');
      expect(barHtml).toContain("bg-white");
    });
  });

  describe("3. P1-1: home-aggregated.ts pendingInboxCount, workspace_items SSOT & owner-filtered quick records", () => {
    it("computes pendingInboxCount via submitted/broker_review gate_requests + pending im_inquiry_requests, merges workspace_items, and blocks foreign in-memory IM leaks", async () => {
      const BROKER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const BROKER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      const WS_DEAL_ID = "d1111111-1111-4111-8111-111111111111";
      const WS_IM_ID = "d2222222-2222-4222-8222-222222222222";
      const WS_DELETED_ID = "d3333333-3333-4333-8333-333333333333";

      hoisted.quickRecords = [
        {
          buildingId: "quick-owned-a",
          ownerId: BROKER_A,
          address: "강남구 역삼동",
          buildingName: "브로커A 메모리 매물",
          card4: { region: "강남구 역삼동", use: "오피스" },
          createdAt: "2026-11-18T01:00:00Z",
          updatedAt: "2026-11-18T01:00:00Z",
        },
        {
          buildingId: "quick-foreign-b",
          ownerId: BROKER_B,
          address: "서초구 서초동",
          buildingName: "타중개사 비공개 매물",
          card4: { region: "서초구 서초동", use: "근린생활시설" },
          createdAt: "2026-11-18T05:00:00Z",
          updatedAt: "2026-11-18T05:00:00Z",
        },
      ];

      const { client, calls } = buildProgrammableSupabase({
        onTableRows: (table) => {
          if (table === "profiles") {
            return {
              data: [{ display_name: "김중개", photo_url: null, role: "broker" }],
            };
          }
          if (table === "workspace_items") {
            return {
              data: [
                {
                  id: WS_DEAL_ID,
                  owner_id: BROKER_A,
                  kind: "dealcard",
                  building_id: WS_DEAL_ID,
                  status: "published",
                  title: "성수동 코너 딜카드",
                  address: "성동구 성수동2가",
                  created_at: "2026-11-18T02:00:00Z",
                  updated_at: "2026-11-18T03:00:00Z",
                },
                {
                  id: WS_IM_ID,
                  owner_id: BROKER_A,
                  kind: "im",
                  building_id: WS_IM_ID,
                  status: "draft",
                  title: "여의도 오피스 IM",
                  address: "영등포구 여의도동",
                  created_at: "2026-11-18T02:30:00Z",
                  updated_at: "2026-11-18T04:00:00Z",
                },
                {
                  id: WS_DELETED_ID,
                  owner_id: BROKER_A,
                  kind: "dealcard",
                  building_id: WS_DELETED_ID,
                  status: "archived",
                  deleted_at: "2026-11-18T01:00:00Z",
                  title: "삭제된 매물",
                  address: "종로구",
                },
              ],
            };
          }
          if (table === "gate_requests") {
            return {
              data: [
                { id: "gr-sub-1", building_id: WS_DEAL_ID, status: "submitted" },
                { id: "gr-rev-2", building_id: WS_IM_ID, status: "broker_review" },
              ],
            };
          }
          if (table === "im_inquiry_requests") {
            return {
              data: [{ id: "inq-pend-1", building_id: WS_IM_ID, status: "pending" }],
            };
          }
          return { data: [] };
        },
      });

      const home = await getAggregatedBrokerHomeData(
        client as unknown as SupabaseClient,
        BROKER_A,
      );

      // Dealcards = 1 canonical ws dealcard + 1 owned quick record (foreign quick-foreign-b & deleted excluded!)
      expect(home.doors.dealcards.badge.count).toBe(2);
      // IM = 1 canonical ws im + 1 owned quick record
      expect(home.doors.im.badge.count).toBe(2);
      // Pending inbox = 2 gate_requests (submitted + broker_review) + 1 im_inquiry_requests (pending) = 3
      expect(home.doors.inbox.badge.count).toBe(3);
      expect(home.doors.inbox.badge.label).toBe("요청 대기 3건");
      expect(home.resumeItem?.title).not.toContain("타중개사 비공개 매물");
      expect(home.resumeItem?.title).toBe("여의도 오피스 IM");

      // Never queries gate_requests with invalid .eq("status", "pending")
      const gateCalls = calls.filter((c) => c.table === "gate_requests");
      expect(gateCalls.length).toBeGreaterThan(0);
      for (const gc of gateCalls) {
        expect(gc.eqCalls).not.toContainEqual(["status", "pending"]);
        expect(gc.inCalls).toContainEqual(["status", ["submitted", "broker_review"]]);
      }

      const directCount = await getInboxPendingCount(
        client as unknown as SupabaseClient,
        BROKER_A,
      );
      expect(directCount).toBe(3);
    });
  });

  describe("4. P1-2: POST /api/public/events survey_response sanitization & SurveyProvider res.ok + Escape handling", () => {
    it("accepts survey_response (200) on POST /api/public/events while stripping non-allowlisted PII keys, redacting phone/email, and truncating comment <= 500 chars", async () => {
      const { client, calls } = buildProgrammableSupabase({
        onTableRows: () => ({ data: [{ id: "ev-survey-1" }], error: null }),
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const longCommentWithPii =
        "상담 문의 leaker@example.com 연락처 010-9876-5432 입니다. " + "가".repeat(600);

      const res = await postPublicEvents(
        new NextRequest("http://localhost/api/public/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "activity_event",
            eventType: "survey_response",
            entityType: "system",
            metadata: {
              survey_id: "ux-nps-v1",
              rating: 5,
              category: "usability",
              page: "/hub",
              comment: longCommentWithPii,
              email: "secret@attacker.io",
              phone: "010-1111-2222",
              raw_address: "강남구 테헤란로 152",
            },
          }),
        }),
      );

      expect(res.status).toBe(200);
      const evCall = calls.find((c) => c.table === "activity_events")!;
      expect(evCall).toBeDefined();
      const inserted = evCall.inserts[0] as Record<string, unknown>;
      expect(inserted.actor_id).toBeNull();
      expect(inserted.actor_role).toBe("anonymous");
      expect(inserted.event_type).toBe("survey_response");

      const savedMeta = inserted.metadata as Record<string, unknown>;
      expect(savedMeta.survey_id).toBe("ux-nps-v1");
      expect(savedMeta.rating).toBe(5);
      expect(savedMeta.category).toBe("usability");
      expect(savedMeta.page).toBe("/hub");
      expect(savedMeta.email).toBeUndefined();
      expect(savedMeta.phone).toBeUndefined();
      expect(savedMeta.raw_address).toBeUndefined();

      const savedComment = String(savedMeta.comment || "");
      expect(savedComment.length).toBeLessThanOrEqual(500);
      expect(savedComment).not.toContain("leaker@example.com");
      expect(savedComment).not.toContain("010-9876-5432");
      expect(savedComment).toContain("[REDACTED]");
    });

    it("keeps SurveyProvider open with role=alert Korean error when !res.ok, succeeds when res.ok, and closes on Escape", async () => {
      function SurveyHarness() {
        const { triggerSurvey } = useSurvey();
        return React.createElement(
          "button",
          {
            type: "button",
            "data-testid": "open-survey-btn",
            onClick: () =>
              triggerSurvey({
                id: "test-survey",
                title: "화면 만족도 조사",
                question: "얼마나 편리하셨나요?",
                type: "rating",
              }),
          },
          "설문 열기",
        );
      }

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "fail" }), { status: 500 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root!.render(
          React.createElement(SurveyProvider, null, React.createElement(SurveyHarness)),
        );
      });

      // Open survey
      const openBtn = container.querySelector('[data-testid="open-survey-btn"]') as HTMLButtonElement;
      await act(async () => {
        openBtn.click();
      });
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();

      // Select rating 5 and submit -> first call returns 500 (!res.ok)
      const rating5Btn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "5",
      )!;
      await act(async () => {
        rating5Btn.click();
      });
      const submitBtn = Array.from(container.querySelectorAll("button")).find((b) =>
        b.textContent?.includes("제출하기"),
      )!;
      await act(async () => {
        submitBtn.click();
      });

      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).not.toBeNull();
      expect(alertEl?.textContent).toBe(
        "의견 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      );
      expect(container.textContent).not.toContain("소중한 의견 감사합니다!");

      // Retry submit -> second call returns 200 (res.ok)
      await act(async () => {
        submitBtn.click();
      });
      expect(container.textContent).toContain("소중한 의견 감사합니다!");

      // Re-open and press Escape -> closes dialog
      await act(async () => {
        openBtn.click();
      });
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      });
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe("5. P1-3 & P2-1..4: revokeShareLinkToken actor_id null safety, QA storage key purge, Toast >=14px & canonical newsletter links", () => {
    it("passes actor_id: null (never entityId) on revokeShareLinkToken & restoreShareLinkToken when brokerId is omitted", async () => {
      const BUILDING_UUID = "99999999-9999-4999-8999-999999999999";
      const BROKER_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

      const { client, calls } = buildProgrammableSupabase({
        onTableRows: () => ({ data: [], error: null }),
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      // 1) Omitted brokerId -> actor_id MUST be null (preventing 23503 FK error against profiles)
      const resNoBroker = await revokeShareLinkToken({
        buildingId: BUILDING_UUID,
        reason: "system_cleanup",
      });
      expect(resNoBroker.ok).toBe(true);

      const revokeEvCall = calls.find((c) => c.table === "activity_events")!;
      expect(revokeEvCall).toBeDefined();
      const revokePayload = revokeEvCall.inserts[0] as Record<string, unknown>;
      expect(revokePayload.event_type).toBe("link_revoked");
      expect(revokePayload.actor_id).toBeNull();
      expect(revokePayload.entity_id).toBe(BUILDING_UUID);

      // 2) Restore without brokerId -> actor_id MUST also be null
      const restoreRes = await restoreShareLinkToken({
        buildingId: BUILDING_UUID,
      });
      expect(restoreRes.ok).toBe(true);
      const restoreEvCall = calls.filter((c) => c.table === "activity_events").pop()!;
      const restorePayload = restoreEvCall.inserts[0] as Record<string, unknown>;
      expect(restorePayload.event_type).toBe("link_restored");
      expect(restorePayload.actor_id).toBeNull();

      // 3) Valid UUID brokerId -> actor_id equals brokerId
      await revokeShareLinkToken({
        buildingId: BUILDING_UUID,
        brokerId: BROKER_UUID,
        reason: "broker_lock",
      });
      const brokerEvCall = calls.filter((c) => c.table === "activity_events").pop()!;
      const brokerPayload = brokerEvCall.inserts[0] as Record<string, unknown>;
      expect(brokerPayload.actor_id).toBe(BROKER_UUID);
    });

    it("purges credeal-qa-*-key-v1 on purgeWorkspaceClientStorage while preserving UI preferences, and enforces Toast >=14px & /broker/w/newsletter canonical links", () => {
      window.localStorage.setItem("credeal-qa-tester-key-v1", "qa-secret-tester");
      window.localStorage.setItem("credeal-qa-broker-key-v1", "qa-secret-broker");
      window.localStorage.setItem("credeal-qa-access-key", "qa-secret-master");
      window.sessionStorage.setItem("credeal-qa-session-key-v1", "qa-session");
      window.localStorage.setItem("credeal-workspace-font-scale-v1", "large");

      purgeWorkspaceClientStorage();

      expect(window.localStorage.getItem("credeal-qa-tester-key-v1")).toBeNull();
      expect(window.localStorage.getItem("credeal-qa-broker-key-v1")).toBeNull();
      expect(window.localStorage.getItem("credeal-qa-access-key")).toBeNull();
      expect(window.sessionStorage.getItem("credeal-qa-session-key-v1")).toBeNull();
      expect(window.localStorage.getItem("credeal-workspace-font-scale-v1")).toBe("large");

      const toastSrc = readRepoFile("src/components/ui/toast-provider.tsx");
      expect(toastSrc).toContain("fontSize: 'max(14px, 0.875rem)'");
      expect(toastSrc).toContain("fontFamily: 'var(--font-noto-kr), system-ui, sans-serif'");

      const magPageSrc = readRepoFile("src/app/(magazine)/magazine/page.tsx");
      expect(magPageSrc).toContain('href="/broker/w/newsletter"');
      expect(magPageSrc).not.toContain('href="/broker/magazine-editor"');

      expect(buildCanonicalMagazineRedirectUrl("edition=ed-9&step=send", "")).toBe(
        "/broker/w/newsletter?edition=ed-9&step=send",
      );
      expect(buildCanonicalMagazineRedirectUrl("", "")).toBe("/broker/w/newsletter");
    });
  });
});
