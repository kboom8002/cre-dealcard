// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { NextRequest } from "next/server";

const BROKER_A_ID = "11111111-1111-4111-8111-111111111111";
const BROKER_A_SLUG = "gangnam-ace";
const BROKER_B_ID = "22222222-2222-4222-8222-222222222222";
const BROKER_B_SLUG = "other-broker";
const BUILDING_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EDITION_1_ID = "eeeeeeee-1111-4111-8111-111111111111";
const EDITION_2_ID = "eeeeeeee-2222-4222-8222-222222222222";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const authState = {
  currentUserId: BROKER_A_ID,
  currentEmail: "ace@cre-dealcard.kr",
};

interface TableStore {
  broker_profiles: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  magazine_editions: Array<Record<string, unknown>>;
  magazine_issues: Array<Record<string, unknown>>;
  magazine_subscribers: Array<Record<string, unknown>>;
  broker_clients: Array<Record<string, unknown>>;
  activity_events: Array<Record<string, unknown>>;
  building_ssot_lite: Array<Record<string, unknown>>;
  document_objects: Array<Record<string, unknown>>;
  external_news: Array<Record<string, unknown>>;
  [key: string]: Array<Record<string, unknown>>;
}

const dbTables: TableStore = {
  broker_profiles: [],
  profiles: [],
  magazine_editions: [],
  magazine_issues: [],
  magazine_subscribers: [],
  broker_clients: [],
  activity_events: [],
  building_ssot_lite: [],
  document_objects: [],
  external_news: [],
};

function createStrictQueryBuilder(table: string) {
  let rows = [...(dbTables[table] ?? [])];
  let pendingUpdate: Record<string, unknown> | null = null;
  let pendingDelete = false;
  let maxLimit: number | null = null;
  let schemaError: { code: string; message: string } | null = null;
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];

  const checkColumnExists = (col: string, val?: unknown) => {
    if (table === "activity_events" && (col === "user_id" || col === "broker_id")) {
      schemaError = {
        code: "42703",
        message: `column activity_events.${col} does not exist`,
      };
      return false;
    }
    if (
      table === "magazine_editions" &&
      col === "id" &&
      typeof val === "string" &&
      !UUID_RE.test(val)
    ) {
      schemaError = {
        code: "22P02",
        message: `invalid input syntax for type uuid: "${val}"`,
      };
      return false;
    }
    return true;
  };

  const applyFilters = () => {
    const matched = rows.filter((r) => filters.every((fn) => fn(r)));
    return maxLimit !== null ? matched.slice(0, maxLimit) : matched;
  };

  const executeMutationIfNeeded = () => {
    if (schemaError) return [];
    const matched = applyFilters();
    if (pendingUpdate && dbTables[table]) {
      for (const target of matched) {
        Object.assign(target, pendingUpdate);
      }
    }
    if (pendingDelete && dbTables[table]) {
      dbTables[table] = dbTables[table].filter((r) => !matched.includes(r));
    }
    return matched;
  };

  const builder: Record<string, any> = {
    select: (cols?: string, _opts?: unknown) => {
      if (
        table === "magazine_subscribers" &&
        typeof cols === "string" &&
        (/\bphone\b/.test(cols) || /\bemail\b/.test(cols)) &&
        !cols.includes("subscriber_phone") &&
        cols.trim() !== "*"
      ) {
        schemaError = {
          code: "42703",
          message: "column magazine_subscribers.email does not exist",
        };
      }
      return builder;
    },
    eq: (col: string, val: unknown) => {
      if (!checkColumnExists(col, val)) return builder;
      filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
      return builder;
    },
    neq: (col: string, val: unknown) => {
      if (!checkColumnExists(col, val)) return builder;
      filters.push((r) => String(r[col] ?? "") !== String(val ?? ""));
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      if (!checkColumnExists(col)) return builder;
      const set = new Set((vals ?? []).map((v) => String(v)));
      filters.push((r) => set.has(String(r[col] ?? "")));
      return builder;
    },
    gte: (col: string, val: unknown) => {
      if (!checkColumnExists(col)) return builder;
      filters.push((r) => String(r[col] ?? "") >= String(val ?? ""));
      return builder;
    },
    filter: (colExpr: string, _op: string, val: unknown) => {
      if (colExpr.startsWith("metadata->>")) {
        const key = colExpr.replace("metadata->>", "").replace(/'/g, "");
        filters.push((r) => {
          const meta = (r.metadata ?? {}) as Record<string, unknown>;
          return String(meta[key] ?? "") === String(val ?? "");
        });
      }
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      const asc = opts?.ascending !== false;
      rows.sort((a, b) => {
        const va = String(a[col] ?? "");
        const vb = String(b[col] ?? "");
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
      return builder;
    },
    limit: (n: number) => {
      maxLimit = n;
      return builder;
    },
    maybeSingle: async () => {
      if (schemaError) return { data: null, error: schemaError };
      const matched = executeMutationIfNeeded();
      return { data: matched[0] ?? null, error: null };
    },
    single: async () => {
      if (schemaError) return { data: null, error: schemaError };
      const matched = executeMutationIfNeeded();
      return {
        data: matched[0] ?? null,
        error: matched[0] ? null : { code: "PGRST116", message: "No rows" },
      };
    },
    insert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const arr = Array.isArray(payload) ? payload : [payload];
      for (const item of arr) {
        if (table === "activity_events") {
          if ("user_id" in item || "broker_id" in item) {
            schemaError = {
              code: "42703",
              message: "column user_id/broker_id of relation activity_events does not exist",
            };
          }
          if (
            item.entity_id !== undefined &&
            item.entity_id !== null &&
            !UUID_RE.test(String(item.entity_id))
          ) {
            schemaError = {
              code: "22P02",
              message: `invalid input syntax for type uuid: "${String(item.entity_id)}"`,
            };
          }
        }
      }
      if (!schemaError) {
        const inserted = arr.map((item, idx) => ({
          id:
            typeof item.id === "string" && UUID_RE.test(item.id)
              ? item.id
              : `99999999-9999-4999-8999-${String(Date.now() + idx).slice(-12).padStart(12, "0")}`,
          created_at: new Date().toISOString(),
          ...item,
        }));
        if (!dbTables[table]) dbTables[table] = [];
        dbTables[table].unshift(...inserted);
        rows = [...inserted];
      }
      return builder;
    },
    upsert: (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      return builder.insert(payload);
    },
    update: (patch: Record<string, unknown>) => {
      pendingUpdate = patch;
      return builder;
    },
    delete: () => {
      pendingDelete = true;
      return builder;
    },
    then: (resolve: (val: unknown) => unknown) => {
      if (schemaError) {
        return Promise.resolve({ data: null, count: null, error: schemaError }).then(resolve);
      }
      const matched = executeMutationIfNeeded();
      return Promise.resolve({
        data: matched,
        count: matched.length,
        error: null,
      }).then(resolve);
    },
  };

  return builder;
}

const mockSupabase = {
  from: (table: string) => createStrictQueryBuilder(table),
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: authState.currentUserId,
          email: authState.currentEmail,
        },
      },
      error: null,
    }),
  },
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => mockSupabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => mockSupabase,
}));

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: async () => ({
    user: { id: authState.currentUserId, email: authState.currentEmail },
    error: null,
  }),
}));

vi.mock("@/lib/notification/notification-service", () => ({
  sendKakaoAlimtalk: vi.fn(async () => true),
}));

const redirectSpy = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest: string };
  err.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw err;
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectSpy(url),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/broker/magazine-editor",
}));

import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import {
  GET as getPreferencesRoute,
  PATCH as patchPreferencesRoute,
} from "@/app/api/broker/magazine/preferences/route";
import { POST as postNewsChannelsRoute } from "@/app/api/broker/magazine/news-channels/route";
import { POST as postMagazineIssuesRoute } from "@/app/api/magazine/issues/route";
import { GET as getMagazineEditionsRoute } from "@/app/api/magazine/editions/route";
import { POST as postInboxActionsRoute } from "@/app/api/broker/inbox/actions/route";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { findIssueForDate } from "@/lib/magazine/public-page-data";
import ShortMagazineRedirectPage from "@/app/(public)/m/[slug]/page";
import { digitsOnly, formatKrPhoneInput } from "@/lib/magazine/phone-input";
import { normalizeKrPhone } from "@/lib/magazine/pii";
import { checkAndSendHotLeadAlert } from "@/domain/notification/hot-lead-alert";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";

describe("Newsletter System Full-Pipeline MECE Audit & Hardening Suite", () => {
  beforeEach(() => {
    authState.currentUserId = BROKER_A_ID;
    authState.currentEmail = "ace@cre-dealcard.kr";
    redirectSpy.mockClear();

    for (const k of Object.keys(dbTables)) {
      dbTables[k] = [];
    }

    dbTables.broker_profiles.push(
      {
        id: "bp-a",
        user_id: BROKER_A_ID,
        slug: BROKER_A_SLUG,
        office_name: "강남 에이스 빌딩 중개법인",
        display_name: "김에이스 대표",
        phone: "010-1111-2222",
        specialty_regions: ["강남·서초"],
        updated_at: "2026-11-10T00:00:00Z",
      },
      {
        id: "bp-b",
        user_id: BROKER_B_ID,
        slug: BROKER_B_SLUG,
        office_name: "타사 중개법인",
        display_name: "박타사 대표",
        phone: "010-3333-4444",
      },
    );

    dbTables.profiles.push({
      id: BROKER_A_ID,
      display_name: "김에이스 대표",
      phone: "010-1111-2222",
    });

    dbTables.building_ssot_lite.push({
      id: BUILDING_A_ID,
      owner_id: BROKER_A_ID,
      address: "서울특별시 마포구 동교동 165-8",
      area_signal: "마포구 동교동",
      asset_type: "제2종근린생활시설 빌딩",
      price_band: "75억",
      fit_summary: "홍대입구역 도보 3분 코너 수익형 빌딩",
      layers: {
        deal_terms: {
          asking_price_manwon: 750000,
          cap_rate_pct: 4.65,
          deposit_manwon: 30000,
          monthly_rent_manwon: 2200,
        },
        physical: {
          land_area_m2: 244.63,
          gross_floor_area_m2: 696.86,
          zoning: "제2종일반주거지역",
          floors: "B1 / 5F",
          total_floors: 5,
        },
      },
    });

    dbTables.document_objects.push({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      owner_id: BROKER_A_ID,
      building_id: BUILDING_A_ID,
      title: "동교동 프라임 코너 빌딩",
      status: "published",
      ssot_summary: {
        building_name: "동교동 프라임 코너 빌딩",
        address: "서울특별시 마포구 동교동 165-8",
        asking_price_manwon: 750000,
        cap_rate_pct: 4.65,
        land_area_m2: 244.63,
        gross_floor_area_m2: 696.86,
        zoning: "제2종일반주거지역",
        floors: "B1 / 5F",
        total_floors: 5,
        deposit_manwon: 30000,
        monthly_rent_manwon: 2200,
      },
      photos_v2: [{ url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab" }],
    });

    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("[Pillar-A] preserves localStorage custom unitIssues on mount, re-saves on [링크 복사] after post-publish edits, isolates state on edition switch, and enforces send checklist when body+deals are empty", async () => {
    let issuesPostCalls = 0;

    // Seed localStorage with custom unitIssues and a previously published draft
    window.localStorage.setItem(
      "cre-newsletter-local-draft-v2",
      JSON.stringify({
        brokerId: BROKER_A_ID,
        brokerSlug: BROKER_A_SLUG,
        headline: "최초 발행된 11월호 제목",
        summary: "최초 한 줄 소개",
        briefingTitle: "최초 브리핑 소제목",
        briefingBody: "최초 작성된 브리핑 본문입니다.",
        issueYear: 2026,
        issueMonth: 11,
        selectedDealIds: [BUILDING_A_ID],
        dealComments: { [BUILDING_A_ID]: "역세권 코너 우량 매물" },
        unitIssues: [
          {
            id: "custom-local-1",
            title: "중개사가 직접 다듬은 커스텀 포스트잇 헤드라인",
            brief: "로컬 초안에 저장된 첫 번째 문장입니다. 새로고침 후에도 유지되어야 합니다.",
            memoTone: "canary",
            channel: "real_estate",
            topic: "transaction",
            sentiment: "bullish",
            sources: ["직접 큐레이션"],
            articleCount: 1,
          },
        ],
        editionId: EDITION_1_ID,
        publishedUrl: `https://cre-dealcard.vercel.app/magazine/${BROKER_A_SLUG}/2026-11-10?edition=${EDITION_1_ID}`,
        serverPublished: true,
        savedAt: "2026-11-10T09:00:00.000Z",
      }),
    );

    const writeTextSpy = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.startsWith("/api/magazine/editions?broker_id=me")) {
        return new Response(
          JSON.stringify({
            brokerId: BROKER_A_ID,
            brokerSlug: BROKER_A_SLUG,
            brokerName: "김에이스 대표",
            subscriberCount: 5,
            highInterestCount: 2,
            brokerPreferences: {
              preferredRegions: ["강남·서초"],
              preferredChannels: ["real_estate", "tax_wealth"],
              updatedAt: "2026-11-10T08:00:00Z",
            },
            editions: [
              {
                id: EDITION_1_ID,
                edition_label: "2026-11",
                title: "2026년 11월호 발행본",
                status: "published",
                published_at: "2026-11-10T08:00:00Z",
                updated_at: "2026-11-10T08:00:00Z",
                market_temp: "적극 매수",
                featured_deal_ids: [BUILDING_A_ID],
                content: {
                  headline: "2026년 11월호 발행본",
                  summary: "11월 요약",
                  briefingTitle: "11월 브리핑",
                  briefingBody: "11월 본문",
                  featured_deal_ids: [BUILDING_A_ID],
                  deal_comments: { [BUILDING_A_ID]: "11월 코멘트" },
                },
              },
              {
                id: EDITION_2_ID,
                edition_label: "2026-10",
                title: "2026년 10월호 빈 초안",
                status: "draft",
                updated_at: "2026-10-10T08:00:00Z",
                market_temp: null,
                featured_deal_ids: [],
                content: {
                  headline: "2026년 10월호 빈 초안",
                  summary: "",
                  briefingTitle: "",
                  briefingBody: "",
                  featured_deal_ids: [],
                  deal_comments: {},
                  unitIssues: [],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("/api/broker/buildings")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: BUILDING_A_ID,
                buildingName: "동교동 프라임 코너 빌딩",
                address: "서울특별시 마포구 동교동",
                askingPriceWon: 7500000000,
                capRatePct: 4.65,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "/api/magazine/issues" && method === "POST") {
        issuesPostCalls += 1;
        return new Response(
          JSON.stringify({
            ok: true,
            id: EDITION_1_ID,
            editionId: EDITION_1_ID,
            brokerSlug: BROKER_A_SLUG,
            publicUrl: `https://cre-dealcard.vercel.app/magazine/${BROKER_A_SLUG}/2026-11-10?edition=${EDITION_1_ID}&rev=${issuesPostCalls}`,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    render(<MagazineEditorPage />);

    // Wait for initial workspace fetch to settle
    await waitFor(() => {
      expect(screen.getByDisplayValue("최초 발행된 11월호 제목")).toBeTruthy();
    });

    // 1. A-S1-06: Custom unitIssues from localStorage must NOT be overwritten by loadInitialWorkspace
    fireEvent.click(screen.getByTestId("step-tab-content"));
    await waitFor(() => {
      expect(screen.getByText("중개사가 직접 다듬은 커스텀 포스트잇 헤드라인")).toBeTruthy();
    });

    // 2. A-S0-01: Editing headline after publish marks draft dirty; clicking [링크 복사] MUST call POST /api/magazine/issues
    fireEvent.click(screen.getByTestId("step-tab-title"));
    const headlineInput = screen.getByLabelText(/표지 제목/i);
    fireEvent.change(headlineInput, { target: { value: "발행 후 수정한 11월호 새 제목" } });

    fireEvent.click(screen.getByTestId("step-tab-send"));
    const copyBtn = await screen.findByTestId("copy-link-btn");
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(issuesPostCalls).toBe(1);
    });
    expect(writeTextSpy).toHaveBeenCalledWith(
      expect.stringContaining("rev=1"),
    );

    // 3. A-S1-02 & A-S1-09: Switching to Edition 2 (which has 0 deals & empty briefingBody) MUST clear selectedDealIds
    const edition2Btn = screen.getByTestId(`magazine-edition-item-${EDITION_2_ID}`);
    fireEvent.click(edition2Btn);

    // Now on Edition 2: headline="2026년 10월호 빈 초안", briefingBody="", selectedDealIds=[]
    // Clicking [구독자에게 보내기] MUST be blocked by checklist hint (A-S1-09) without calling POST /api/magazine/issues!
    fireEvent.click(screen.getByTestId("step-tab-send"));
    const sendBtns = await screen.findAllByTestId("newsletter-primary-send-btn");
    const prevPostCalls = issuesPostCalls;
    fireEvent.click(sendBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId("newsletter-status-banner").textContent).toContain(
        "시장 브리핑 글이나 추천 매물을 1건 이상 채우면 바로 보낼 수 있어요",
      );
    });
    expect(issuesPostCalls).toBe(prevPostCalls);
  });

  it("[Pillar-B] persists broker preferences via actor_id on activity_events (no 42703), eliminates all ellipsis and mid-clause Korean truncation in AXIOS 2-line Post-It cards, and blocks gossip in custom news", async () => {
    // 1. B-S0-01: PATCH /api/broker/magazine/preferences + GET /api/broker/magazine/preferences
    const patchReq = new NextRequest("http://localhost/api/broker/magazine/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferredRegions: ["성수·성동", "마포·홍대"],
        preferredChannels: ["tax_wealth", "commercial_trend"],
      }),
    });
    const patchRes = await patchPreferencesRoute(patchReq);
    expect(patchRes.status).toBe(200);

    const getReq = new NextRequest("http://localhost/api/broker/magazine/preferences", {
      method: "GET",
    });
    const getRes = await getPreferencesRoute(getReq);
    const getJson = (await getRes.json()) as {
      ok: boolean;
      preferences: { preferredRegions: string[]; preferredChannels: string[] };
    };
    expect(getJson.ok).toBe(true);
    expect(getJson.preferences.preferredRegions).toEqual(["성수·성동", "마포·홍대"]);
    expect(getJson.preferences.preferredChannels).toEqual(["tax_wealth", "commercial_trend"]);

    // 2. B-S0-02 & B-S1-01: Zero ellipsis (`…` or `...`) and zero mid-clause Korean particle truncation across all curated & clustered issues
    const danglingParticleRe =
      /(?:하고|하며|하는|되는|있는|위한|따른|통한|의|에|을|를|은|는|이|가|과|와|로|으로|에서|부터|까지|높일|낮출|늘릴|줄일)\.(?:\s|$)/;

    for (const poolItem of CURATED_CHANNEL_POOL) {
      expect(poolItem.title).not.toMatch(/…|\.\.\./);
    }

    const clustered = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, {
      cadence: "monthly",
      preferredRegions: ["강남·서초", "성수·성동"],
      preferredChannels: [
        "real_estate",
        "economy_finance",
        "tax_wealth",
        "culture_lifestyle",
        "commercial_trend",
      ],
    });
    expect(clustered).toHaveLength(5);
    for (const card of clustered) {
      expect(card.title).not.toMatch(/…|\.\.\./);
      expect(card.brief).not.toMatch(/…|\.\.\./);
      expect(card.brief).not.toMatch(danglingParticleRe);
    }

    // 3. B-S1-03: Custom article POST must block celebrity/gossip/political noise
    const gossipReq = new NextRequest("http://localhost/api/broker/magazine/news-channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "custom",
        title: "유명 개그우먼 이혼 소송 후 150억 빌라 경매 나왔다",
        summary: "연예인 사생활 가십 기사",
      }),
    });
    const gossipRes = await postNewsChannelsRoute(gossipReq);
    expect(gossipRes.status).toBe(400);
  });

  it("[Pillar-C] hydrates physical & lease specs in POST /api/magazine/issues for viewer spec grid + ROI calculator, handles non-UUID ?edition= without 22P02, and isolates /m/[slug] across tenants", async () => {
    // 1. C-S0-01: POST /api/magazine/issues must hydrate landAreaPyeong, grossFloorAreaPyeong, zoning, floors, deposit, monthlyRent
    const postReq = new NextRequest("http://localhost/api/magazine/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "2026-11",
        year: 2026,
        month: 11,
        headline: "마포·홍대 핵심 빌딩 리포트",
        summary: "11월 마포 수익형 빌딩 집중 분석",
        briefingTitle: "홍대입구역 코너 매수세 점검",
        briefingBody: "실수요 법인 매수 문의가 꾸준합니다.",
        featuredDealIds: [BUILDING_A_ID],
        dealComments: { [BUILDING_A_ID]: "연 수익률 4.65% 코너 우량 빌딩" },
        sections: [
          { id: "field_note", enabled: true },
          { id: "featured_deals", enabled: true },
          { id: "news_curation", enabled: true },
          { id: "roi_calculator", enabled: true },
        ],
      }),
    });

    const postRes = await postMagazineIssuesRoute(postReq);
    expect(postRes.status).toBe(200);
    const postJson = (await postRes.json()) as {
      ok: boolean;
      id: string;
      content: { featuredDeals: Array<Record<string, unknown>> };
    };
    expect(postJson.ok).toBe(true);
    const deal = postJson.content.featuredDeals[0];
    expect(deal).toBeDefined();
    expect(typeof deal.landAreaPyeong).toBe("number");
    expect(typeof deal.grossFloorAreaPyeong).toBe("number");
    expect(deal.zoning).toBe("제2종일반주거지역");
    expect(deal.deposit).toBe(300000000);
    expect(deal.monthlyRent).toBe(22000000);

    // Render MagazineView with the saved content and verify physical specs & ROI prefill attributes
    const { container } = render(
      <MagazineView
        brokerId={BROKER_A_SLUG}
        date="2026-11-10"
        data={
          {
            ...postJson.content,
            broker: {
              name: "김에이스 대표",
              company: "강남 에이스 빌딩 중개법인",
              phone: "010-1111-2222",
              photoUrl: null,
              specialtyRegions: ["강남·서초"],
            },
          } as any
        }
      />,
    );

    expect(container.textContent).toContain("제2종일반주거지역");
    expect(container.textContent).toMatch(/대지\s*74평/);
    // Must NEVER render neighborhood name under 면적 label
    expect(container.textContent).not.toContain("면적마포구 동교동");

    // 2026-11 Overhaul: 모바일 뷰어 하단 유틸리티(수익률 계산기 등) 제거 + 최소 뉴스레터 신청 옵트인만 유지
    expect(container.querySelector("[data-prefill-roi]")).toBeNull();
    expect(container.querySelector('[data-testid="minimal-subscribe-optin"]')).toBeTruthy();
    expect(container.querySelector(`a[href="/im-lite/${BUILDING_A_ID}"]`)).toBeTruthy();

    // 2. C-S1-02: findIssueForDate with non-UUID editionId ("2026-11") must NOT throw 22P02
    const foundByLabel = await findIssueForDate(
      mockSupabase as any,
      { user_id: BROKER_A_ID, slug: BROKER_A_SLUG },
      "2026-11-10",
      "2026-11",
    );
    expect(foundByLabel).toBeTruthy();
    expect(foundByLabel?.headline).toBe("마포·홍대 핵심 빌딩 리포트");

    // 3. C-S1-04: /m/[unknown-slug] must redirect to /pulse and NEVER leak another tenant's magazine_issues
    dbTables.magazine_issues.push({
      id: "99999999-8888-4777-8666-555555555555",
      broker_id: BROKER_B_SLUG,
      issue_date: "2026-11-10",
      content: { headline: "타 중개사 비공개 이슈" },
    });

    await expect(
      ShortMagazineRedirectPage({ params: Promise.resolve({ slug: "non-existent-label-2099" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/pulse");
  });

  it("[Pillar-D] normalizes +82 phone inputs without truncating last digit, subtracts unsubscribed contacts in editions?broker_id=me, logs magazine_sent in send_magazine, and prevents 22P02/42703 in hot-lead-alert", async () => {
    // 1. D-S1-01: +82 phone normalization without 11-char pre-slice truncation
    expect(digitsOnly("+82 10-1234-5678")).toBe("01012345678");
    expect(formatKrPhoneInput("+82 10-1234-5678")).toBe("010-1234-5678");
    expect(normalizeKrPhone("+82 10-1234-5678")).toBe("01012345678");
    expect(normalizeKrPhone("+82 010-1234-5678")).toBe("01012345678");
    expect(normalizeKrPhone("010-123-4567")).toBeNull(); // 010 requires 11 digits

    // 2. D-S0-01 & D-S1-02: magazine_subscribers uses subscriber_phone / subscriber_email and subtracts unsubscribed contacts
    dbTables.magazine_subscribers.push(
      {
        id: "sub-active-1",
        broker_id: BROKER_A_SLUG,
        subscriber_name: "정상구독자",
        subscriber_phone: "010-2222-3333",
        subscriber_email: "active@example.com",
        status: "active",
      },
      {
        id: "sub-unsub-1",
        broker_id: BROKER_A_SLUG,
        subscriber_name: "수신거부VIP",
        subscriber_phone: "010-9999-8888",
        subscriber_email: "unsub@example.com",
        status: "unsubscribed",
      },
    );

    // Even though 010-9999-8888 is in broker_clients as VIP, they unsubscribed in magazine_subscribers!
    dbTables.broker_clients.push({
      id: "client-vip-unsub",
      broker_id: BROKER_A_ID,
      display_name: "수신거부VIP",
      phone: "+82 10-9999-8888",
      tier: "vip",
      tags: ["VIP", "뉴스레터"],
    });

    const edReq = new NextRequest("http://localhost/api/magazine/editions?broker_id=me", {
      method: "GET",
    });
    const edRes = await getMagazineEditionsRoute(edReq);
    expect(edRes.status).toBe(200);
    const edJson = (await edRes.json()) as {
      subscriberCount: number;
      highInterestCount: number;
    };
    expect(edJson.subscriberCount).toBe(1);
    expect(edJson.highInterestCount).toBe(0);

    // 3. C-S0-02: send_magazine action calculates active deduplicated recipients and logs magazine_sent
    const sendReq = new NextRequest("http://localhost/api/broker/inbox/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "send_magazine",
        slug: "2026-11",
        publicUrl: `https://cre-dealcard.vercel.app/magazine/${BROKER_A_SLUG}/2026-11-10`,
        targetSegment: "all",
        headline: "11월 뉴스레터",
      }),
    });
    const sendRes = await postInboxActionsRoute(sendReq);
    expect(sendRes.status).toBe(200);
    const sendJson = (await sendRes.json()) as {
      ok: boolean;
      recipientCount: number;
      sentCount: number;
    };
    expect(sendJson.ok).toBe(true);
    expect(sendJson.recipientCount).toBe(1);
    expect(
      dbTables.activity_events.some((ev) => ev.event_type === "magazine_sent"),
    ).toBe(true);

    // 4. D-S0-02: checkAndSendHotLeadAlert must query/insert activity_events with actor_id and UUID entity_id (no 42703 / 22P02)
    process.env.MAGAZINE_SEND_ENABLED = "true";
    process.env.MAGAZINE_SEND_DRY_RUN = "false";
    process.env.SOLAPI_API_KEY = "test-key";
    process.env.SOLAPI_API_SECRET = "test-secret";
    process.env.SOLAPI_SENDER_PHONE = "0212345678";
    process.env.SOLAPI_PFID = "test-pfid";
    process.env.APP_BASE_URL = "https://cre-dealcard.vercel.app";

    const hotLeadSent = await checkAndSendHotLeadAlert(
      mockSupabase as any,
      BROKER_A_SLUG,
      {
        score: 92,
        isHotLead: true,
        touchpoints: ["magazine_view", "magazine_to_im_click"],
        channelCount: 2,
        buildingsViewed: [BUILDING_A_ID],
      },
      "sub:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    );
    expect(hotLeadSent).toBe(true);
    const hotLeadEvent = dbTables.activity_events.find(
      (ev) => ev.event_type === "hot_lead_alert_sent",
    );
    expect(hotLeadEvent).toBeDefined();
    expect(hotLeadEvent?.actor_id).toBe(BROKER_A_ID);
    expect(UUID_RE.test(String(hotLeadEvent?.entity_id ?? ""))).toBe(true);
  });
});
