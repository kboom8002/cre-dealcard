// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface MockAuthResult {
  user: { id: string; email?: string } | null;
  role: string | null;
  profile: { role: string; display_name: string | null } | null;
  error: NextResponse | null;
}

const hoisted = vi.hoisted(() => ({
  pathname: "/hub",
  searchParams: "",
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  serviceClientFactory: vi.fn(),
  serverSupabaseFactory: vi.fn(),
  rateLimitAllowed: true,
  verifyAuthMock: vi.fn<() => Promise<MockAuthResult>>(),
  requireAdminMock: vi.fn<() => Promise<MockAuthResult>>(),
  requireBrokerMock: vi.fn<() => Promise<MockAuthResult>>(),
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

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    getAll: () => [],
    set: vi.fn(),
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => hoisted.serviceClientFactory(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => hoisted.serverSupabaseFactory(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(async () => hoisted.rateLimitAllowed),
}));

vi.mock("@/lib/auth-guard", () => ({
  verifyAuth: () => hoisted.verifyAuthMock(),
  requireAdmin: () => hoisted.requireAdminMock(),
  requireBroker: () => hoisted.requireBrokerMock(),
}));

import { GET as getPublicBrokerProfile } from "@/app/api/public/broker-profile/[slug]/route";
import { aggregateBrokerStats } from "@/domain/broker-card/broker-stats-aggregator";
import {
  GET as getPublicSurveys,
  POST as postPublicSurveys,
} from "@/app/api/public/surveys/route";
import { GET as getExploreSearch } from "@/app/api/public/explore/search/route";
import { GET as getPublicSearch } from "@/app/api/public/search/route";
import {
  GET as getQaWorkbench,
  POST as postQaWorkbench,
} from "@/app/api/public/qa-workbench/route";
import { PUT as putBrokerProfile } from "@/app/api/broker/profile/route";
import { signup } from "@/app/actions/auth";
import HubPage from "@/app/(public)/hub/page";
import BrokerProfilePage from "@/app/(public)/broker-profile/[slug]/page";
import SearchPage, { generateMetadata as generateSearchMetadata } from "@/app/(public)/search/page";
import SpaceRegionPage from "@/app/(public)/space/[region]/page";
import PoweredByPage from "@/app/(public)/powered-by/page";
import ImWorkspaceError from "@/app/(broker)/broker/w/im/error";
import NewsletterWorkspaceError from "@/app/(broker)/broker/w/newsletter/error";
import InboxWorkspaceError from "@/app/(broker)/broker/w/inbox/error";
import DealCardError from "@/app/(broker)/broker/deal-card/[id]/error";
import MagazineEditorError from "@/app/(broker)/broker/magazine-editor/error";
import {
  purgeWorkspaceClientStorage,
  isSensitiveWorkspaceStorageKey,
} from "@/lib/workspace/storage-namespace";
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
  inserts: unknown[];
  updates: unknown[];
  upserts: unknown[];
}

function buildMockSupabase(handlers: {
  onTable?: (
    table: string,
    rec: RecordedCall,
  ) => {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
    count?: number | null;
  };
}) {
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
        updates: [],
        upserts: [],
      };
      calls.push(rec);

      const evaluate = async () => {
        const res = handlers.onTable?.(table, rec) ?? {
          data: [],
          error: null,
          count: 0,
        };
        return {
          data: res.data ?? [],
          error: res.error ?? null,
          count:
            res.count ?? (Array.isArray(res.data) ? res.data.length : 0),
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
        gte: () => chain,
        lt: () => chain,
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
        range: () => chain,
        insert: (payload: unknown) => {
          rec.inserts.push(payload);
          return chain;
        },
        update: (payload: unknown) => {
          rec.updates.push(payload);
          return chain;
        },
        upsert: (payload: unknown) => {
          rec.upserts.push(payload);
          return chain;
        },
        single: async () => {
          const out = await evaluate();
          const base = Array.isArray(out.data)
            ? (out.data[0] ?? null)
            : out.data;
          const inserted = rec.inserts[0];
          const row =
            base ??
            (inserted && typeof inserted === "object"
              ? { id: "row-1", ...(inserted as Record<string, unknown>) }
              : { id: "row-1" });
          return { data: row, error: out.error };
        },
        maybeSingle: async () => {
          const out = await evaluate();
          const row = Array.isArray(out.data)
            ? (out.data[0] ?? null)
            : out.data;
          return { data: row, error: out.error };
        },
        then: (
          onFulfilled?: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => evaluate().then(onFulfilled, onRejected),
      };

      return chain;
    },
  };

  return { client, calls };
}

describe("Wave 7.7A — Global UI/UX & Platform Closure Suite", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    hoisted.pathname = "/hub";
    hoisted.searchParams = "";
    hoisted.pushMock.mockReset();
    hoisted.replaceMock.mockReset();
    hoisted.rateLimitAllowed = true;
    hoisted.verifyAuthMock.mockReset();
    hoisted.requireAdminMock.mockReset();
    hoisted.requireBrokerMock.mockReset();
    resetWorkspaceRepositoryCacheForTests();
    if (typeof resetShareLinkTokenStoreForTests === "function") {
      resetShareLinkTokenStoreForTests();
    }
    globalThis.__CRE_QA_WORKBENCH_PINS__ = [];
    globalThis.__CRE_QA_WORKBENCH_SESSIONS__ = new Map();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) {
        delete process.env[k];
      }
    }
    Object.assign(process.env, savedEnv);
  });

  describe("1. P0-1a: GET /api/public/broker-profile/[slug] & aggregateBrokerStats visibility lock-down", () => {
    const PUBLIC_BROKER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const PRIVATE_BROKER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const PUB_DEAL_ID = "11111111-1111-4111-8111-111111111111";
    const DRAFT_WS_DEAL_ID = "22222222-2222-4222-8222-222222222222";
    const REVOKED_WS_DEAL_ID = "33333333-3333-4333-8333-333333333333";
    const INTERNAL_SC_DEAL_ID = "44444444-4444-4444-8444-444444444444";

    function createBrokerFixture() {
      return buildMockSupabase({
        onTable: (table, rec) => {
          if (table === "broker_profiles") {
            const requiresPublic = rec.eqCalls.some(
              ([col, val]) => col === "is_public" && val === true,
            );
            const slugMatch = rec.eqCalls.find(([col]) => col === "slug")?.[1];
            const uidMatch = rec.eqCalls.find(([col]) => col === "user_id")?.[1];

            const rows = [
              {
                user_id: PUBLIC_BROKER_ID,
                slug: "gangnam-alpha",
                specialty_regions: ["GBD"],
                specialty_assets: ["오피스빌딩"],
                bio: "강남 20년 경력",
                is_verified: true,
                is_public: true,
              },
              {
                user_id: PRIVATE_BROKER_ID,
                slug: "secret-unlisted",
                specialty_regions: ["CBD"],
                specialty_assets: ["꼬마빌딩"],
                bio: "비공개 중개사",
                is_verified: false,
                is_public: false,
              },
            ].filter((r) => {
              if (requiresPublic && !r.is_public) return false;
              if (slugMatch !== undefined && r.slug !== slugMatch) return false;
              if (uidMatch !== undefined && r.user_id !== uidMatch) return false;
              return true;
            });
            return { data: rows };
          }
          if (table === "profiles") {
            const idEq = rec.eqCalls.find(([col]) => col === "id")?.[1];
            const ilikeName = rec.ilikeCalls.find(
              ([col]) => col === "display_name",
            )?.[1];
            const allProfiles = [
              {
                id: PUBLIC_BROKER_ID,
                role: "broker",
                display_name: "김알파대표",
                company: "알파중개법인",
                created_at: "2026-01-01T00:00:00Z",
              },
              {
                id: PRIVATE_BROKER_ID,
                role: "broker",
                display_name: "박비공개소장",
                company: "비공개사무소",
                created_at: "2026-01-01T00:00:00Z",
              },
            ];
            if (idEq !== undefined) {
              return { data: allProfiles.filter((p) => p.id === idEq) };
            }
            if (ilikeName !== undefined) {
              // Exact case-insensitive match (no substring %)
              const exact = allProfiles.filter(
                (p) => p.display_name.toLowerCase() === ilikeName.toLowerCase(),
              );
              return { data: exact };
            }
            return { data: [] };
          }
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: PUB_DEAL_ID,
                  status: "public_signal_ready",
                  area_signal: "GBD 역삼역",
                  asset_type: "오피스빌딩",
                  price_band: "180억",
                  created_at: "2026-11-18T10:00:00Z",
                },
                {
                  id: DRAFT_WS_DEAL_ID,
                  status: "public_signal_ready",
                  area_signal: "GBD 논현동 초안",
                  asset_type: "근린상가",
                  price_band: "90억",
                  created_at: "2026-11-18T11:00:00Z",
                },
                {
                  id: REVOKED_WS_DEAL_ID,
                  status: "public_signal_ready",
                  area_signal: "GBD 선릉역 회수",
                  asset_type: "오피스빌딩",
                  price_band: "140억",
                  created_at: "2026-11-18T12:00:00Z",
                },
                {
                  id: INTERNAL_SC_DEAL_ID,
                  status: "public_signal_ready",
                  area_signal: "GBD 삼성동 내부전용",
                  asset_type: "오피스빌딩",
                  price_band: "320억",
                  created_at: "2026-11-18T13:00:00Z",
                },
              ],
            };
          }
          if (table === "building_signal_cards") {
            return {
              data: [
                { building_id: PUB_DEAL_ID, visibility: "public_blind", status: "draft" },
                { building_id: INTERNAL_SC_DEAL_ID, visibility: "internal_only", status: "draft" },
              ],
            };
          }
          if (table === "workspace_items") {
            const orExpr = rec.orCalls[0] || "";
            if (orExpr.includes(PUB_DEAL_ID)) {
              return {
                data: [
                  {
                    id: PUB_DEAL_ID,
                    owner_id: PUBLIC_BROKER_ID,
                    kind: "dealcard",
                    building_id: PUB_DEAL_ID,
                    status: "published",
                    title: "역삼 오피스",
                    address: "역삼역",
                    published_snapshot: { headline: "역삼 오피스" },
                    draft_payload: {},
                  },
                ],
              };
            }
            if (orExpr.includes(DRAFT_WS_DEAL_ID)) {
              return {
                data: [
                  {
                    id: DRAFT_WS_DEAL_ID,
                    owner_id: PUBLIC_BROKER_ID,
                    kind: "dealcard",
                    building_id: DRAFT_WS_DEAL_ID,
                    status: "draft",
                    title: "논현 초안",
                    address: "논현동",
                    published_snapshot: null,
                    draft_payload: {},
                  },
                ],
              };
            }
            if (orExpr.includes(REVOKED_WS_DEAL_ID)) {
              return {
                data: [
                  {
                    id: REVOKED_WS_DEAL_ID,
                    owner_id: PUBLIC_BROKER_ID,
                    kind: "dealcard",
                    building_id: REVOKED_WS_DEAL_ID,
                    status: "revoked",
                    revoked_at: "2026-11-18T14:00:00Z",
                    title: "선릉 회수",
                    address: "선릉역",
                    published_snapshot: { headline: "선릉 회수" },
                    draft_payload: {},
                  },
                ],
              };
            }
            return { data: [] };
          }
          return { data: [], count: 0 };
        },
      });
    }

    it("returns 404 when is_public = false or on partial substring, validates slug/rate-limit, and filters non-public deals in aggregateBrokerStats", async () => {
      const { client, calls } = createBrokerFixture();
      hoisted.serviceClientFactory.mockReturnValue(client);

      // 1) Private broker (is_public = false) -> 404
      const privateRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/secret-unlisted"),
        { params: Promise.resolve({ slug: "secret-unlisted" }) },
      );
      expect(privateRes.status).toBe(404);

      // 2) Private broker by exact display_name -> 404
      const privateNameRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/%EB%B0%95%EB%B9%84%EA%B3%B5%EA%B0%9C%EC%86%8C%EC%9E%A5"),
        { params: Promise.resolve({ slug: encodeURIComponent("박비공개소장") }) },
      );
      expect(privateNameRes.status).toBe(404);

      // 3) Partial substring ("알파") -> 404 (no substring enumeration across profiles!)
      const substringRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/%EC%95%8C%ED%8C%8C"),
        { params: Promise.resolve({ slug: encodeURIComponent("알파") }) },
      );
      expect(substringRes.status).toBe(404);

      // 4) Invalid / oversized slug -> 400
      const invalidSlugRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/bad"),
        { params: Promise.resolve({ slug: "a".repeat(81) }) },
      );
      expect(invalidSlugRes.status).toBe(400);

      // 5) Rate limit exceeded -> 429
      hoisted.rateLimitAllowed = false;
      const rlRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/gangnam-alpha"),
        { params: Promise.resolve({ slug: "gangnam-alpha" }) },
      );
      expect(rlRes.status).toBe(429);
      hoisted.rateLimitAllowed = true;

      // 6) Public broker (is_public = true) -> 200 with ONLY verified public deal counted!
      const okRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/gangnam-alpha"),
        { params: Promise.resolve({ slug: "gangnam-alpha" }) },
      );
      expect(okRes.status).toBe(200);
      const body = await okRes.json();
      expect(body.ok).toBe(true);
      expect(body.data.profile.displayName).toBe("김알파대표");
      expect(body.data.stats.totalDealCards).toBe(1);
      expect(body.data.stats.activeDealCount).toBe(1);
      expect(body.data.recentDeals).toHaveLength(1);
      expect(body.data.recentDeals[0].buildingId).toBe(PUB_DEAL_ID);

      const ssotCall = calls.find((c) => c.table === "building_ssot_lite")!;
      expect(ssotCall.eqCalls).toContainEqual(["status", "public_signal_ready"]);
      expect(ssotCall.selectCols).toBe(
        "id, status, area_signal, asset_type, price_band, created_at",
      );

      // 7) Direct aggregateBrokerStats call also excludes demo seed IDs in production
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      delete process.env.ALLOW_DEMO_SEEDS_IN_PROD;
      const prodMock = buildMockSupabase({
        onTable: (table) => {
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: "f1111111-1111-4111-8111-111111111101",
                  status: "public_signal_ready",
                  area_signal: "GBD 데모",
                  asset_type: "오피스",
                  price_band: "100억",
                  created_at: "2026-11-18T00:00:00Z",
                },
              ],
            };
          }
          return { data: [] };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(prodMock.client);
      const prodStats = await aggregateBrokerStats(PUBLIC_BROKER_ID);
      expect(prodStats.totalDealCards).toBe(0);
      expect(prodStats.recentDeals).toEqual([]);
    });

    it("never exposes raw err.message on 500 in GET /api/public/broker-profile/[slug]", async () => {
      hoisted.serviceClientFactory.mockImplementation(() => {
        throw new Error("DB_PASSWORD_LEAK_SECRET_999");
      });

      const errRes = await getPublicBrokerProfile(
        new Request("http://localhost/api/public/broker-profile/gangnam-alpha"),
        { params: Promise.resolve({ slug: "gangnam-alpha" }) },
      );
      expect(errRes.status).toBe(500);
      const text = await errRes.text();
      expect(text).not.toContain("DB_PASSWORD_LEAK_SECRET_999");
    });
  });

  describe("2. P0-1b: GET & POST /api/public/surveys admin guard, spoofed userId rejection, prototype stripping & 16KB cap", () => {
    it("blocks non-admin GET /api/public/surveys (401/403) and allows admin (200)", async () => {
      hoisted.requireAdminMock.mockResolvedValueOnce({
        user: null,
        role: null,
        profile: null,
        error: NextResponse.json({ ok: false }, { status: 401 }),
      });
      const unauthRes = await getPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys"),
      );
      expect(unauthRes.status).toBe(401);

      hoisted.requireAdminMock.mockResolvedValueOnce({
        user: { id: "broker-1" },
        role: "broker",
        profile: { role: "broker", display_name: "중개사" },
        error: NextResponse.json({ ok: false }, { status: 403 }),
      });
      const forbiddenRes = await getPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys"),
      );
      expect(forbiddenRes.status).toBe(403);

      const { client } = buildMockSupabase({
        onTable: () => ({ data: [{ id: "sv-1", step_index: 1, answers: {} }] }),
      });
      hoisted.serviceClientFactory.mockReturnValue(client);
      hoisted.requireAdminMock.mockResolvedValueOnce({
        user: { id: "admin-1" },
        role: "admin",
        profile: { role: "admin", display_name: "관리자" },
        error: null,
      });
      const adminRes = await getPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys"),
      );
      expect(adminRes.status).toBe(200);
    });

    it("ignores spoofed body.userId on anonymous POST, resolves verified session UUID when authenticated, strips prototype keys, and enforces 16KB cap", async () => {
      const { client, calls } = buildMockSupabase({
        onTable: () => ({ data: null, error: null }),
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      // 1) Anonymous caller supplying spoofed userId + dangerous keys -> user_id MUST be null
      const rawJsonPayload =
        '{"userId":"99999999-9999-4999-8999-999999999999","stepIndex":1,"answers":{"preferredType":"꼬마빌딩","__proto__":{"polluted":true},"constructor":{"bad":1},"prototype":{"evil":1}}}';
      const anonRes = await postPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rawJsonPayload,
        }),
      );
      expect(anonRes.status).toBe(200);
      const anonJson = await anonRes.json();
      expect(anonJson.success).toBe(true);
      expect(anonJson.data.answers.preferredType).toBe("꼬마빌딩");

      const insertedAnon = calls[0].inserts[0] as {
        user_id: string | null;
        answers: Record<string, unknown>;
      };
      expect(insertedAnon.user_id).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(insertedAnon.answers, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(insertedAnon.answers, "constructor")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(insertedAnon.answers, "prototype")).toBe(false);

      // 2) Authenticated caller with Authorization header -> resolves verified session UUID (still ignoring body.userId)
      const SESSION_UUID = "12345678-1234-4234-8234-1234567890ab";
      hoisted.verifyAuthMock.mockResolvedValueOnce({
        user: { id: SESSION_UUID, email: "real@credeal.kr" },
        role: "broker",
        profile: { role: "broker", display_name: "실제유저" },
        error: null,
      });
      const authRes = await postPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer real-session-jwt",
          },
          body: JSON.stringify({
            userId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
            stepIndex: 2,
            answers: { budget: "100억" },
          }),
        }),
      );
      expect(authRes.status).toBe(200);
      const insertedAuth = calls[1].inserts[0] as { user_id: string | null };
      expect(insertedAuth.user_id).toBe(SESSION_UUID);

      // 3) Oversized >16KB payload -> 413
      const hugeRes = await postPublicSurveys(
        new NextRequest("http://localhost/api/public/surveys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stepIndex: 1,
            answers: { comment: "x".repeat(17 * 1024) },
          }),
        }),
      );
      expect(hugeRes.status).toBe(413);
    });
  });

  describe("3. P0-1c & P1-3: /api/public/explore/search & /api/public/search hardening + 500 sanitization", () => {
    it("enforces blind columns, .or() sanitization, and visibility guards on /api/public/explore/search and hides raw 500 errors", async () => {
      const PUB_ID = "11111111-1111-4111-8111-111111111111";
      const REVOKED_ID = "22222222-2222-4222-8222-222222222222";

      const { client, calls } = buildMockSupabase({
        onTable: (table, rec) => {
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: PUB_ID,
                  area_signal: "GBD 강남",
                  asset_type: "오피스",
                  price_band: "200억",
                  status: "public_signal_ready",
                },
                {
                  id: REVOKED_ID,
                  area_signal: "GBD 회수",
                  asset_type: "오피스",
                  price_band: "150억",
                  status: "public_signal_ready",
                },
              ],
            };
          }
          if (table === "workspace_items") {
            if ((rec.orCalls[0] || "").includes(REVOKED_ID)) {
              return {
                data: [
                  {
                    id: REVOKED_ID,
                    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    kind: "dealcard",
                    building_id: REVOKED_ID,
                    status: "revoked",
                    revoked_at: "2026-11-18T00:00:00Z",
                    title: "회수",
                    address: "강남",
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

      const res = await getExploreSearch(
        new NextRequest(
          `http://localhost/api/public/explore/search?type=deal&q=${encodeURIComponent(
            "강남,raw_address.ilike.*비밀*\\",
          )}`,
        ),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe(PUB_ID);

      const ssotCall = calls.find((c) => c.table === "building_ssot_lite")!;
      expect(ssotCall.eqCalls).toContainEqual(["status", "public_signal_ready"]);
      expect(ssotCall.orCalls[0].split(",")).toHaveLength(2);
      expect(ssotCall.orCalls[0]).not.toContain("*");

      // Generic 500 error check on both search endpoints
      const errClient = buildMockSupabase({
        onTable: () => ({
          data: null,
          error: { code: "XX000", message: "INTERNAL_PG_STACK_SECRET_777" },
        }),
      });
      hoisted.serviceClientFactory.mockReturnValue(errClient.client);

      const pubSearch500 = await getPublicSearch(
        new NextRequest("http://localhost/api/public/search?type=deal"),
      );
      expect(pubSearch500.status).toBe(500);
      const pubSearchErr = await pubSearch500.json();
      expect(pubSearchErr.error).toBe("검색 처리 중 오류가 발생했습니다.");
      expect(JSON.stringify(pubSearchErr)).not.toContain("INTERNAL_PG_STACK_SECRET_777");

      const explore500 = await getExploreSearch(
        new NextRequest("http://localhost/api/public/explore/search?type=deal"),
      );
      expect(explore500.status).toBe(500);
      const exploreErr = await explore500.json();
      expect(exploreErr.error).toBe("검색 처리 중 오류가 발생했습니다.");
    });
  });

  describe("4. P0-2, P1-1, P2-2, P2-4 & P2-5: /hub, /broker-profile/[slug], /search, /space/[region] & /powered-by", () => {
    it("filters /hub and /broker-profile/[slug] deals & broker counts through full visibility guards and deduplicates QUICK_TOOLS hrefs", async () => {
      const BROKER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const VISIBLE_DEAL = "11111111-1111-4111-8111-111111111111";
      const INTERNAL_DEAL = "22222222-2222-4222-8222-222222222222";
      const DRAFT_WS_DEAL = "33333333-3333-4333-8333-333333333333";

      const { client } = buildMockSupabase({
        onTable: (table, rec) => {
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: VISIBLE_DEAL,
                  owner_id: BROKER_ID,
                  area_signal: "GBD 역삼역 공개매물",
                  asset_type: "오피스빌딩",
                  price_band: "220억",
                  status: "public_signal_ready",
                  created_at: new Date().toISOString(),
                },
                {
                  id: INTERNAL_DEAL,
                  owner_id: BROKER_ID,
                  area_signal: "GBD 비공개내부전용",
                  asset_type: "근린상가",
                  price_band: "95억",
                  status: "public_signal_ready",
                  created_at: new Date().toISOString(),
                },
                {
                  id: DRAFT_WS_DEAL,
                  owner_id: BROKER_ID,
                  area_signal: "GBD 미발행워크스페이스",
                  asset_type: "오피스빌딩",
                  price_band: "130억",
                  status: "public_signal_ready",
                  created_at: new Date().toISOString(),
                },
              ],
            };
          }
          if (table === "building_signal_cards") {
            return {
              data: [
                { building_id: VISIBLE_DEAL, visibility: "public_blind", status: "draft" },
                { building_id: INTERNAL_DEAL, visibility: "internal_only", status: "draft" },
              ],
            };
          }
          if (table === "workspace_items") {
            if ((rec.orCalls[0] || "").includes(DRAFT_WS_DEAL)) {
              return {
                data: [
                  {
                    id: DRAFT_WS_DEAL,
                    owner_id: BROKER_ID,
                    kind: "dealcard",
                    building_id: DRAFT_WS_DEAL,
                    status: "draft",
                    title: "초안",
                    address: "역삼",
                  },
                ],
              };
            }
            return { data: [] };
          }
          if (table === "broker_profiles") {
            return {
              data: [
                {
                  user_id: BROKER_ID,
                  slug: "verified-kim",
                  is_public: true,
                  is_verified: true,
                },
              ],
              count: 1,
            };
          }
          if (table === "profiles") {
            return {
              data: [
                {
                  id: BROKER_ID,
                  role: "broker",
                  display_name: "김검증중개사",
                  company: "검증중개법인",
                  photo_url: null,
                  tagline: "강남 빌딩 전문",
                  broker_profiles: {
                    slug: "verified-kim",
                    specialty_regions: ["GBD"],
                    specialty_assets: ["오피스빌딩"],
                    is_public: true,
                    total_deal_count_self: 999,
                    is_verified: true,
                  },
                },
              ],
            };
          }
          return { data: [], count: 0 };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const hubHtml = renderToStaticMarkup(await HubPage());
      expect(hubHtml).toContain(`href="/dc/${VISIBLE_DEAL}"`);
      expect(hubHtml).not.toContain(INTERNAL_DEAL);
      expect(hubHtml).not.toContain("GBD 비공개내부전용");
      expect(hubHtml).not.toContain(DRAFT_WS_DEAL);
      // Broker deal count reflects verified public deals (1건), NOT unverified self count 999건!
      expect(hubHtml).not.toContain("999건");
      expect(hubHtml).toContain("1건");
      // Distinct QUICK_TOOLS destinations
      expect(hubHtml).toContain('href="/search?type=deal"');
      expect(hubHtml).toContain('href="/guide"');

      const bpHtml = renderToStaticMarkup(
        await BrokerProfilePage({ params: Promise.resolve({ slug: "verified-kim" }) }),
      );
      expect(bpHtml).toContain(`href="/dc/${VISIBLE_DEAL}"`);
      expect(bpHtml).not.toContain(INTERNAL_DEAL);
      expect(bpHtml).not.toContain(DRAFT_WS_DEAL);
      expect(bpHtml).toContain("📋 1건");
    });

    it("fixes /search market & space links, removes dead VTI claims, separates lease_spaces on /space/[region], and validates /powered-by broker slug", async () => {
      const { client } = buildMockSupabase({
        onTable: (table) => {
          if (table === "cre_pulses") {
            return {
              data: [
                {
                  region: "gbd",
                  period_type: "weekly",
                  pulse_score: 78,
                  trend: "up",
                  summary_ko: "강남 프라임 오피스 임차 수요 견조",
                  period_label: "2026-W46",
                },
              ],
              count: 1,
            };
          }
          if (table === "lease_spaces") {
            return {
              data: [
                {
                  id: "ls-pub-1",
                  floor: "5F",
                  area_sqm: 198,
                  space_type: "office",
                  deposit: 8000,
                  monthly_rent: 620,
                  area_signal: "판교",
                  title: "판교 테크노밸리 오피스 5층",
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
      hoisted.serviceClientFactory.mockReturnValue(client);

      // /search?type=market -> links to /deal/gbd with "해당 권역 매물 보기" (never /pulse/...)
      const marketHtml = renderToStaticMarkup(
        await SearchPage({ searchParams: Promise.resolve({ type: "market" }) }),
      );
      expect(marketHtml).toContain('href="/deal/gbd"');
      expect(marketHtml).toContain("해당 권역 매물 보기");
      expect(marketHtml).not.toContain("/pulse/");
      expect(marketHtml).not.toContain("VTI");
      expect(marketHtml).not.toContain("7개 차원");

      const meta = await generateSearchMetadata({
        searchParams: Promise.resolve({}),
      });
      expect(String(meta.description || "")).not.toContain("VTI");

      // /search?type=space -> links to /space/pangyo (never /leasing/...)
      const spaceSearchHtml = renderToStaticMarkup(
        await SearchPage({ searchParams: Promise.resolve({ type: "space" }) }),
      );
      expect(spaceSearchHtml).toContain('href="/space/pangyo"');
      expect(spaceSearchHtml).not.toContain("/leasing/");

      // /space/pangyo with published lease_spaces -> renders genuine lease space card
      const spaceWithRowsHtml = renderToStaticMarkup(
        await SpaceRegionPage({ params: Promise.resolve({ region: "pangyo" }) }),
      );
      expect(spaceWithRowsHtml).toContain("판교 테크노밸리 오피스 5층");
      expect(spaceWithRowsHtml).toContain("1건의 공개 임대 공간");

      // /space/gbd with 42P01 missing lease_spaces + 1 verified sale DealCard -> honest empty state + separate DealCard section
      const emptyLeaseMock = buildMockSupabase({
        onTable: (table) => {
          if (table === "lease_spaces") {
            return {
              data: null,
              error: { code: "42P01", message: 'relation "lease_spaces" does not exist' },
            };
          }
          if (table === "building_ssot_lite") {
            return {
              data: [
                {
                  id: "99999999-9999-4999-8999-999999999999",
                  area_signal: "GBD 강남역",
                  asset_type: "업무시설",
                  price_band: "250억",
                  status: "public_signal_ready",
                },
              ],
            };
          }
          return { data: [] };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(emptyLeaseMock.client);
      const emptySpaceHtml = renderToStaticMarkup(
        await SpaceRegionPage({ params: Promise.resolve({ region: "gbd" }) }),
      );
      expect(emptySpaceHtml).toContain("현재 등록된 공개 임대 공간이 없습니다");
      expect(emptySpaceHtml).toContain("함께 볼 만한 권역 매각 딜카드");
      expect(emptySpaceHtml).toContain('href="/dc/99999999-9999-4999-8999-999999999999"');

      // /powered-by broker slug validation
      const safePoweredHtml = renderToStaticMarkup(
        await PoweredByPage({
          searchParams: Promise.resolve({ broker: "kim-broker_01" }),
        }),
      );
      expect(safePoweredHtml).toContain('href="/magazine/kim-broker_01/subscribe?ref=powered-by"');

      const unsafePoweredHtml = renderToStaticMarkup(
        await PoweredByPage({
          searchParams: Promise.resolve({ broker: "../evil/path?inject=1" }),
        }),
      );
      expect(unsafePoweredHtml).not.toContain("../evil");
      expect(unsafePoweredHtml).toContain('href="/hub"');
    });
  });

  describe("5. P1-2: PUT /api/broker/profile admin role preservation & is_public toggle", () => {
    it("preserves role: 'admin' on profiles upsert and updates broker_profiles.is_public cleanly", async () => {
      const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      hoisted.requireBrokerMock.mockResolvedValue({
        user: { id: ADMIN_ID, email: "admin@credeal.kr" },
        role: "admin",
        profile: { role: "admin", display_name: "최고관리자" },
        error: null,
      });

      const { client, calls } = buildMockSupabase({
        onTable: (table) => {
          if (table === "broker_profiles") {
            return { data: [{ user_id: ADMIN_ID, slug: "admin-broker" }], error: null };
          }
          return { data: [], error: null };
        },
      });
      hoisted.serviceClientFactory.mockReturnValue(client);

      const res = await putBrokerProfile(
        new NextRequest("http://localhost/api/broker/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            display_name: "최고관리자",
            company: "크리딜 중개법인",
            is_public: true,
          }),
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const profileCall = calls.find(
        (c) => c.table === "profiles" && c.upserts.length > 0,
      )!;
      expect(profileCall).toBeDefined();
      expect((profileCall.upserts[0] as { role: string }).role).toBe("admin");

      const bpUpdateCall = calls.find(
        (c) => c.table === "broker_profiles" && c.updates.length > 0,
      )!;
      expect(bpUpdateCall).toBeDefined();
      expect((bpUpdateCall.updates[0] as { is_public: boolean }).is_public).toBe(true);

      const brokerProfilePageSrc = readRepoFile("src/app/(broker)/broker/profile/page.tsx");
      expect(brokerProfilePageSrc).toContain('data-testid="broker-public-profile-toggle"');
      expect(brokerProfilePageSrc).toContain('data-testid="broker-public-profile-preview-link"');
      expect(brokerProfilePageSrc).not.toMatch(SUB14_CLASS_RE);
    });
  });

  describe("6. P1-3, P1-5, P2-1 & P2-3: Shared-PC storage purge, QA fail-closed passcode gate, signup sanitization & workspace error.tsx", () => {
    it("purges all credeal_qa_*, credeal-qa-*, and dealcard_recent_searches keys from localStorage and sessionStorage", () => {
      const sensitiveKeys = [
        "credeal_qa_mode",
        "credeal_qa_pin_docked",
        "credeal-qa-pin-active",
        "credeal-qa-pin-role",
        "credeal-qa-signoff-session-v1",
        "credeal-qa-tester-key-v1",
        "credeal_qa_custom_token",
        "dealcard_recent_searches",
      ];

      for (const k of sensitiveKeys) {
        expect(isSensitiveWorkspaceStorageKey(k)).toBe(true);
        window.localStorage.setItem(k, "sensitive-val");
        window.sessionStorage.setItem(k, "sensitive-session-val");
      }
      window.localStorage.setItem("credeal-workspace-font-scale-v1", "large");

      purgeWorkspaceClientStorage();

      for (const k of sensitiveKeys) {
        expect(window.localStorage.getItem(k)).toBeNull();
        expect(window.sessionStorage.getItem(k)).toBeNull();
      }
      expect(window.localStorage.getItem("credeal-workspace-font-scale-v1")).toBe("large");
    });

    it("fails closed on /api/public/qa-workbench when CREDEAL_ENABLE_PUBLIC_QA=true with empty keys/passcodes, while allowing valid QA_ACCESS_KEY & E2E tester/broker keys", async () => {
      process.env.CREDEAL_ENABLE_PUBLIC_QA = "true";
      delete process.env.QA_ACCESS_KEY;
      delete process.env.QA_PORTAL_PASSCODE;
      delete process.env.QA_TESTER_ACCESS_KEY;
      delete process.env.QA_BROKER_ACCESS_KEY;

      hoisted.requireBrokerMock.mockResolvedValue({
        user: { id: "broker-1" },
        role: "broker",
        profile: { role: "broker", display_name: "중개사" },
        error: null,
      });

      // 1) CREDEAL_ENABLE_PUBLIC_QA=true with ALL keys unset -> MUST fail closed (404)!
      const deniedGet = await getQaWorkbench(
        new NextRequest("http://localhost/api/public/qa-workbench?mode=pins", {
          headers: { "x-qa-access-key": "any-guessed-value" },
        }),
      );
      expect(deniedGet.status).toBe(404);

      const deniedPost = await postQaWorkbench(
        new NextRequest("http://localhost/api/public/qa-workbench", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "sync", sessionId: "qa-sess-1", records: {} }),
        }),
      );
      expect(deniedPost.status).toBe(404);

      // 2) Valid QA_ACCESS_KEY / E2E tester & broker keys succeed 100%
      process.env.QA_ACCESS_KEY = "master-qa-secret";
      process.env.QA_TESTER_ACCESS_KEY = "test-qa-tester-key";
      process.env.QA_BROKER_ACCESS_KEY = "test-qa-broker-key";

      for (const validKey of [
        "master-qa-secret",
        "test-qa-tester-key",
        "test-qa-broker-key",
      ]) {
        const okRes = await getQaWorkbench(
          new NextRequest("http://localhost/api/public/qa-workbench?mode=pins", {
            headers: { "x-qa-access-key": validKey },
          }),
        );
        expect(okRes.status).toBe(200);
      }
    });

    it("sanitizes raw Supabase errors in signup server action and enforces Daylight >=14px + /broker links across workspace error boundaries", async () => {
      hoisted.serverSupabaseFactory.mockReturnValue({
        auth: {
          signUp: async () => ({
            data: null,
            error: {
              message: "Postgres internal detail: auth.users_pkey duplicate at 10.0.1.9",
              status: 500,
            },
          }),
        },
      });

      const fd = new FormData();
      fd.set("displayName", "김신규");
      fd.set("email", "newbroker@credeal.kr");
      fd.set("password", "SafePass123!");
      fd.set("agreeTerms", "on");
      fd.set("agreePrivacy", "on");

      const signupRes = await signup(undefined, fd);
      expect(signupRes?.message).toBe(
        "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
      );
      expect(JSON.stringify(signupRes)).not.toContain("Postgres internal detail");

      // Render all 5 broker error boundaries and verify ERR-XXXX + /broker recovery link + Daylight >=14px
      const sampleErr = Object.assign(new Error("Render failure"), { digest: "d77a" });
      const boundaries = [
        ImWorkspaceError,
        NewsletterWorkspaceError,
        InboxWorkspaceError,
        DealCardError,
        MagazineEditorError,
      ];
      for (const Boundary of boundaries) {
        const html = renderToStaticMarkup(
          React.createElement(Boundary, { error: sampleErr, reset: () => undefined }),
        );
        expect(html).toContain("ERR-");
        expect(html).toContain('href="/broker"');
        expect(html).not.toContain('href="/"');
      }

      const uiPaths = [
        "src/app/(public)/hub/page.tsx",
        "src/app/(public)/broker-profile/[slug]/page.tsx",
        "src/app/(public)/search/page.tsx",
        "src/app/(public)/space/[region]/page.tsx",
        "src/app/(public)/powered-by/page.tsx",
        "src/components/ui/toast-provider.tsx",
        "src/app/(broker)/broker/w/im/error.tsx",
        "src/app/(broker)/broker/w/newsletter/error.tsx",
        "src/app/(broker)/broker/w/inbox/error.tsx",
        "src/app/(broker)/broker/deal-card/[id]/error.tsx",
        "src/app/(broker)/broker/magazine-editor/error.tsx",
      ];
      for (const relPath of uiPaths) {
        const src = readRepoFile(relPath);
        expect(src, `${relPath} must have zero sub-14px classes`).not.toMatch(
          SUB14_CLASS_RE,
        );
      }
    });
  });
});
