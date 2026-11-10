// @vitest-environment jsdom
/**
 * @file src/tests/workspace/mece-preemptive-defense-audit.test.tsx
 * @description 8-Axis MECE Preemptive Defense Audit Suite (T0 ~ T7)
 *
 * Derived from the Newsletter & Inbox Retrospective Audit:
 *  - T0: Typed Supabase Fake (enforces 22P02 on UUID columns + Error Injection) & True Cold-Start Harness
 *  - T1: Tenancy & Fail-Closed Ownership (S0-1, S0-2, S0-3, S0-5, S1-10)
 *  - T2: Durability & Event Window Eviction Defense (S0-4, S1-1, S1-2, S1-3, S1-4)
 *  - T3: Producer -> Consumer Contract & Revocation Matrix (S1-5, S1-6, S1-7, T3-01)
 *  - T4: Client State Account Isolation (S1-11)
 *  - T6: Failure Honesty on DB Errors (S1-13)
 *  - T7: Content Integrity, Phone Normalization & Seed Isolation (T7-01, T7-02, T7-03)
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { saveInboxState } from "@/lib/im-lite/quick-generate-store";
import {
  verifyShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from "@/lib/security/share-link-tokens";
import { fetchIMData } from "@/app/(public)/im-lite/[buildingId]/fetch-im-data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: unknown): boolean {
  return typeof val === "string" && UUID_RE.test(val.trim());
}

/**
 * Real Postgres UUID columns from supabase/schema-snapshot.json.
 * Comparing these columns against a non-UUID string in Postgres throws SQLSTATE 22P02.
 */
const UUID_COLUMNS_BY_TABLE: Record<string, Set<string>> = {
  building_ssot_lite: new Set(["id", "owner_id"]),
  buildings: new Set(["id", "owner_id"]),
  gate_requests: new Set(["id", "building_id", "requester_id"]),
  magazine_editions: new Set(["id"]),
  magazine_issues: new Set(["id", "broker_id"]),
  document_objects: new Set(["id", "building_id"]),
};

/**
 * T0-04: True Serverless Cold-Start Harness
 * Wipes in-memory globalThis stores AND os.tmpdir() persistence files.
 */
function simulateServerlessColdStart() {
  delete (globalThis as any).__CRE_QUICK_IM_STORE__;
  saveInboxState({
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [],
  });
  resetShareLinkTokenStoreForTests();
  try {
    const tmp = os.tmpdir();
    const pidSuffix = `-${process.pid}.json`;
    for (const file of fs.readdirSync(tmp)) {
      if (
        (file.startsWith("cre-v3-quick-generate-store") ||
          file.startsWith("cre-v3-inbox-state-store") ||
          file.startsWith("cre-v4-")) &&
        (file.endsWith(pidSuffix) || !file.includes("-"))
      ) {
        try {
          fs.unlinkSync(path.join(tmp, file));
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
}

interface SharedDatabase {
  activity_events: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  magazine_editions: Array<Record<string, any>>;
  magazine_issues: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
}

const BROKER_A_ID = "11111111-1111-4111-8111-111111111111";
const BROKER_B_ID = "22222222-2222-4222-8222-222222222222";
const BROKER_A_BLDG_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let currentAuthBrokerId = BROKER_A_ID;
let currentAuthRole: "broker" | "admin" = "broker";

// T0-03: Error injection registry
const injectedErrors = new Map<string, { code: string; message: string }>();

function injectTableError(table: string, message = "Simulated DB failure", code = "PGRST500") {
  injectedErrors.set(table, { code, message });
}

function clearInjectedErrors() {
  injectedErrors.clear();
}

function createInitialDb(): SharedDatabase {
  return {
    activity_events: [],
    broker_profiles: [
      {
        id: BROKER_A_ID,
        user_id: BROKER_A_ID,
        broker_id: BROKER_A_ID,
        slug: "broker-a-realty",
        display_name: "이상덕",
        office_name: "제이에스부동산중개법인",
        company_name: "제이에스부동산중개법인",
        phone: "010-3773-9127",
        preferred_regions: ["홍대·연남(마포)"],
        preferred_channels: ["deal_completion"],
      },
      {
        id: BROKER_B_ID,
        user_id: BROKER_B_ID,
        broker_id: BROKER_B_ID,
        slug: "broker-b-rival",
        display_name: "김경쟁",
        office_name: "라이벌중개법인",
        company_name: "라이벌중개법인",
        phone: "010-9999-8888",
        preferred_regions: ["강남·서초"],
        preferred_channels: ["deal_completion"],
      },
    ],
    building_ssot_lite: [
      {
        id: BROKER_A_BLDG_UUID,
        owner_id: BROKER_A_ID,
        area_signal: "서울특별시 마포구 동교동 189-6",
        asset_type: "수익형 근생빌딩",
        price_band: "70~80억",
        fit_summary: "마포구 동교동 더파크빌딩",
        completeness_score: 75,
        status: "ready",
      },
    ],
    buildings: [
      {
        id: BROKER_A_BLDG_UUID,
        owner_id: BROKER_A_ID,
        name: "마포구 동교동 더파크빌딩",
        address_road: "서울특별시 마포구 월드컵북로4길 13",
        sale_price: 7_700_000_000,
      },
    ],
    document_objects: [],
    gate_requests: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        building_id: BROKER_A_BLDG_UUID,
        requester_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        requested_level: "G2",
        requested_fields: ["rent_roll"],
        reason: JSON.stringify({
          requesterName: "박매수 상무",
          requesterCompany: "케이리츠자산운용",
          requesterPhone: "010-7777-8888",
          cleanMessage: "동교동 더파크빌딩 렌트롤 열람 요청합니다.",
        }),
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ],
    im_inquiry_requests: [],
    broker_clients: [],
    broker_custom_clients: [],
    magazine_subscribers: [],
    magazine_editions: [],
    magazine_issues: [],
    im_share_links: [],
    in_app_notifications: [],
  };
}

let db: SharedDatabase = createInitialDb();

/**
 * T0-02: Typed & Error-Injecting Supabase Fake
 */
function makeTypedQueryChain(tableName: keyof SharedDatabase | string) {
  let filters: Array<(row: Record<string, any>) => boolean> = [];
  let sortCol: string | null = null;
  let sortAsc = false;
  let maxRows: number | null = null;
  let pendingUpdate: Record<string, any> | null = null;
  let typeError: { code: string; message: string } | null = null;

  const getTable = (): Array<Record<string, any>> => {
    if (!(tableName in db)) {
      (db as any)[tableName] = [];
    }
    return (db as any)[tableName];
  };

  const checkUuidColumn = (col: string, val: unknown) => {
    const uuidCols = UUID_COLUMNS_BY_TABLE[String(tableName)];
    if (uuidCols && uuidCols.has(col)) {
      if (typeof val === "string" && !isUuid(val)) {
        typeError = {
          code: "22P02",
          message: `invalid input syntax for type uuid: "${val}" (table=${String(tableName)}, column=${col})`,
        };
      }
    }
  };

  const executeRows = () => {
    const injected = injectedErrors.get(String(tableName));
    if (injected) {
      return { data: null, error: injected };
    }
    if (typeError) {
      return { data: null, error: typeError };
    }

    const table = getTable();
    let matched = table.filter((r) => filters.every((fn) => fn(r)));

    if (pendingUpdate) {
      for (const row of matched) {
        Object.assign(row, pendingUpdate);
      }
    }

    if (sortCol) {
      const col = sortCol;
      matched = [...matched].sort((a, b) => {
        const va = String(a[col] || "");
        const vb = String(b[col] || "");
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }

    if (typeof maxRows === "number") {
      matched = matched.slice(0, maxRows);
    }

    return { data: matched, error: null };
  };

  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      checkUuidColumn(col, val);
      filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
      return chain;
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => String(r[col] ?? "") !== String(val ?? ""));
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      if (Array.isArray(vals)) {
        for (const v of vals) checkUuidColumn(col, v);
      }
      const set = new Set((vals || []).map((v) => String(v)));
      filters.push((r) => set.has(String(r[col] ?? "")));
      return chain;
    },
    or: (expr: string) => {
      // Parse simple `col1.eq.val1,col2.eq.val2` expressions and enforce UUID typing
      const parts = String(expr || "").split(",");
      const orPredicates: Array<(r: Record<string, any>) => boolean> = [];
      for (const p of parts) {
        const m = p.trim().match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
        if (m) {
          const [, col, val] = m;
          checkUuidColumn(col, val);
          orPredicates.push((r) => String(r[col] ?? "") === String(val));
        }
      }
      if (orPredicates.length > 0) {
        filters.push((r) => orPredicates.some((fn) => fn(r)));
      }
      return chain;
    },
    gte: () => chain,
    order: (col: string, opts?: { ascending?: boolean }) => {
      sortCol = col;
      sortAsc = Boolean(opts?.ascending);
      return chain;
    },
    limit: (n: number) => {
      maxRows = n;
      return chain;
    },
    maybeSingle: async () => {
      const res = executeRows();
      if (res.error) return { data: null, error: res.error };
      return { data: res.data?.[0] ?? null, error: null };
    },
    single: async () => {
      const res = executeRows();
      if (res.error) return { data: null, error: res.error };
      if (!res.data || res.data.length === 0) {
        return { data: null, error: { code: "PGRST116", message: "0 rows" } };
      }
      return { data: res.data[0], error: null };
    },
    insert: (payload: Record<string, any> | Array<Record<string, any>>) => {
      const injected = injectedErrors.get(String(tableName));
      if (injected) {
        const errChain: any = {
          select: () => errChain,
          maybeSingle: async () => ({ data: null, error: injected }),
          single: async () => ({ data: null, error: injected }),
          then: (resolve: (v: any) => any) =>
            Promise.resolve({ data: null, error: injected }).then(resolve),
        };
        return errChain;
      }

      const rows = Array.isArray(payload) ? payload : [payload];
      const table = getTable();
      const inserted = rows.map((r, i) => {
        const row = {
          id: r.id || `00000000-0000-4000-8000-${String(table.length + i + 1).padStart(12, "0")}`,
          created_at: r.created_at || new Date(Date.now() + table.length + i).toISOString(),
          ...r,
        };
        table.unshift(row);
        return row;
      });
      const insChain: any = {
        select: () => insChain,
        maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }),
        single: async () => ({ data: inserted[0] ?? null, error: null }),
        then: (resolve: (v: any) => any) =>
          Promise.resolve({ data: inserted, error: null }).then(resolve),
      };
      return insChain;
    },
    upsert: (payload: Record<string, any> | Array<Record<string, any>>) => {
      const injected = injectedErrors.get(String(tableName));
      if (injected) {
        const errChain: any = {
          select: () => errChain,
          maybeSingle: async () => ({ data: null, error: injected }),
          single: async () => ({ data: null, error: injected }),
          then: (resolve: (v: any) => any) =>
            Promise.resolve({ data: null, error: injected }).then(resolve),
        };
        return errChain;
      }

      const rows = Array.isArray(payload) ? payload : [payload];
      const table = getTable();
      const upserted = rows.map((r, i) => {
        const idx = table.findIndex(
          (existing) =>
            (r.id && existing.id === r.id) ||
            (r.token && existing.token === r.token) ||
            (r.broker_id &&
              r.edition_label &&
              existing.broker_id === r.broker_id &&
              existing.edition_label === r.edition_label)
        );
        if (idx >= 0) {
          table[idx] = { ...table[idx], ...r };
          return table[idx];
        }
        const created = {
          id: r.id || `00000000-0000-4000-8000-${String(table.length + i + 1).padStart(12, "0")}`,
          created_at: r.created_at || new Date(Date.now() + table.length + i).toISOString(),
          ...r,
        };
        table.unshift(created);
        return created;
      });
      const upsChain: any = {
        select: () => upsChain,
        maybeSingle: async () => ({ data: upserted[0] ?? null, error: null }),
        single: async () => ({ data: upserted[0] ?? null, error: null }),
        then: (resolve: (v: any) => any) =>
          Promise.resolve({ data: upserted, error: null }).then(resolve),
      };
      return upsChain;
    },
    update: (patch: Record<string, any>) => {
      pendingUpdate = patch;
      return chain;
    },
    then: (resolve: (v: any) => any) => Promise.resolve(executeRows()).then(resolve),
  };

  return chain;
}

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn(async () => ({
    error: null,
    user: { id: currentAuthBrokerId, email: `${currentAuthBrokerId}@credeal.net` },
    role: currentAuthRole,
  })),
}));

vi.mock("@/lib/magazine/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/magazine/authz")>();
  return {
    ...actual,
    requireBrokerContext: vi.fn(async () => {
      const profile = db.broker_profiles.find((p) => p.user_id === currentAuthBrokerId);
      const slug = profile?.slug || "broker-a-realty";
      return {
        ok: true,
        error: null,
        ctx: {
          userId: currentAuthBrokerId,
          brokerId: currentAuthBrokerId,
          slug,
          brokerSlug: slug,
          displayName: profile?.display_name || "이상덕",
          brokerName: profile?.display_name || "이상덕",
          brokerCompany: profile?.office_name || "제이에스부동산중개법인",
          brokerPhone: profile?.phone || "010-3773-9127",
          brokerKeys: [currentAuthBrokerId, slug],
          isAdmin: currentAuthRole === "admin",
        },
      };
    }),
  };
});

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: (table: string) => makeTypedQueryChain(table),
  })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/broker/magazine-editor",
  redirect: (url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest?: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("8-Axis MECE Preemptive Defense Audit Suite (T0 ~ T7)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    db = createInitialDb();
    currentAuthBrokerId = BROKER_A_ID;
    currentAuthRole = "broker";
    clearInjectedErrors();
    simulateServerlessColdStart();
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T0. Meta-Gate: Production DB Shield, Typed UUID Fake & Cold-Start Harness
  // ═══════════════════════════════════════════════════════════════════════════
  it("[T0-02/06] guards test environment from production Supabase URL and enforces SQLSTATE 22P02 on non-UUID lookups", async () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).not.toContain("supabase.co");

    const { createServiceClient } = await import("@/lib/supabase/service");
    const supabase = createServiceClient();

    // Non-UUID query against UUID column `building_ssot_lite.id` must fail with 22P02
    const badLookup = await supabase
      .from("building_ssot_lite")
      .select("id, owner_id")
      .eq("id", "im-doc-donggyo-77")
      .maybeSingle();
    expect(badLookup.data).toBeNull();
    expect(badLookup.error?.code).toBe("22P02");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T1. Tenancy & Fail-Closed Ownership (S0-1, S0-2, S0-3, S0-5, S1-10)
  // ═══════════════════════════════════════════════════════════════════════════
  it("[T1-01 / S0-1] blocks Broker B (403) from tampering with Broker A's non-UUID listing after cold start and fails closed on DB error", async () => {
    const { PATCH: patchWorkspaceSummary } = await import("@/app/api/broker/workspace/summary/route");
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");

    // 1. Broker A creates non-UUID deal "im-doc-donggyo-77"
    currentAuthBrokerId = BROKER_A_ID;
    const upsertRes = await patchWorkspaceSummary(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_im",
          buildingId: "im-doc-donggyo-77",
          imId: "im-doc-donggyo-77",
          imItem: {
            id: "im-doc-donggyo-77",
            buildingId: "im-doc-donggyo-77",
            title: "마포구 동교동 더파크빌딩",
            address: "서울특별시 마포구 동교동 189-6",
            askingPriceManwon: 770000,
          },
        }),
      })
    );
    expect(upsertRes.status).toBe(200);

    // 2. Simulate serverless cold start (wipes QuickImStore in memory & tmpdir)
    simulateServerlessColdStart();

    // 3. Switch to Broker B (rival) and attempt to post a correction notice or revoke Broker A's non-UUID deal
    currentAuthBrokerId = BROKER_B_ID;
    const tamperNoticeRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correction_notice",
          buildingId: "im-doc-donggyo-77",
          message: "해킹된 허위 정정 공지입니다.",
        }),
      })
    );
    expect(tamperNoticeRes.status).toBe(403);

    const tamperRevokeRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_link",
          buildingId: "im-doc-donggyo-77",
        }),
      })
    );
    expect(tamperRevokeRes.status).toBe(403);

    // 4. Inject DB error on building_ssot_lite and verify fail-closed (403/503, never 200)
    injectTableError("building_ssot_lite", "Connection refused");
    const dbDownRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_link",
          buildingId: BROKER_A_BLDG_UUID,
        }),
      })
    );
    expect(dbDownRes.status).toBeGreaterThanOrEqual(400);
    clearInjectedErrors();
  });

  it("[T1-03 & T1-04 / S0-2 & S0-3] isolates GET /api/broker/inbox so Broker B never receives Broker A's shareTokens, callNotes, or gate_requests even when building_ssot_lite errors", async () => {
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");
    const { GET: getInbox } = await import("@/app/api/broker/inbox/route");

    // 1. Broker A approves gate request and adds a confidential call note
    currentAuthBrokerId = BROKER_A_ID;
    const approveRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_gate",
          threadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          buildingId: BROKER_A_BLDG_UUID,
        }),
      })
    );
    const approveJson = await approveRes.json();
    expect(approveJson.ok).toBe(true);
    const secretToken = String(approveJson.shareToken || "");
    expect(secretToken).toMatch(/^slk\./);

    await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_call_note",
          threadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          buildingId: BROKER_A_BLDG_UUID,
          note: "이상덕 중개사 극비 메모: 매도인 74억까지 네고 의향 있음",
        }),
      })
    );

    // 2. Broker B queries GET /api/broker/inbox?workspace=1 on the SAME warm instance
    currentAuthBrokerId = BROKER_B_ID;
    const bInboxRes = await getInbox(
      new NextRequest("http://localhost:3000/api/broker/inbox?workspace=1")
    );
    const bInboxRawText = await bInboxRes.text();
    expect(bInboxRawText).not.toContain(secretToken);
    expect(bInboxRawText).not.toContain("이상덕 중개사 극비 메모");
    expect(bInboxRawText).not.toContain("010-7777-8888");

    // 3. Inject error on building_ssot_lite (S0-3) and verify Broker B still gets 0 gate_requests from Broker A
    injectTableError("building_ssot_lite", "Simulated timeout");
    const bErrorInboxRes = await getInbox(
      new NextRequest("http://localhost:3000/api/broker/inbox?workspace=1")
    );
    const bErrorInboxText = await bErrorInboxRes.text();
    expect(bErrorInboxText).not.toContain("박매수 상무");
    expect(bErrorInboxText).not.toContain("010-7777-8888");
    clearInjectedErrors();
  });

  it("[T1-05 & T1-06 / S0-5 & S1-10] prevents /m/[slug] from redirecting to draft editions and filters out another broker's featuredDealIds on publish", async () => {
    const { POST: postMagazineIssues } = await import("@/app/api/magazine/issues/route");
    const { default: ShortMagazineRedirectPage } = await import("@/app/(public)/m/[slug]/page");

    // Seed a draft edition for Broker B
    const draftEditionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    db.magazine_editions.push({
      id: draftEditionId,
      broker_id: BROKER_B_ID,
      edition_label: "2026-11",
      status: "draft",
      content: { headline: "미발행 초안", issueDate: "2026-11-10" },
      created_at: new Date().toISOString(),
    });

    // Requesting /m/[draftEditionId] must NOT redirect to /magazine/... for an unpublished draft
    let redirectTarget = "";
    try {
      await ShortMagazineRedirectPage({ params: Promise.resolve({ slug: draftEditionId }) });
    } catch (err: any) {
      redirectTarget = String(err?.message || "");
    }
    expect(redirectTarget).not.toContain(draftEditionId);

    // Broker B attempts to publish a newsletter featuring Broker A's building UUID
    currentAuthBrokerId = BROKER_B_ID;
    const pubRes = await postMagazineIssues(
      new NextRequest("http://localhost:3000/api/magazine/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueSlug: "2026-11",
          headline: "김경쟁 중개사 11월 리포트",
          summary: "강남권 빌딩 시장 동향",
          briefingBody: "강남 핵심 권역 거래 분석입니다.",
          featuredDealIds: [BROKER_A_BLDG_UUID],
        }),
      })
    );
    const pubJson = await pubRes.json();
    expect(pubRes.status).toBe(200);
    expect(pubJson.ok).toBe(true);
    const bEdition = db.magazine_editions.find(
      (e) => e.broker_id === BROKER_B_ID && e.status === "published"
    );
    expect(bEdition?.content?.featured_deals ?? []).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T2. Durability & Event Window Eviction Defense (S0-4, S1-1, S1-2, S1-3, S1-4)
  // ═══════════════════════════════════════════════════════════════════════════
  it("[T2-01..06 / S0-4 & S1-1..04] preserves UI lock->unlock->lock across cold start, survives 200+ event window flood, revokes older tokens, and lets newer DB state beat stale tmpdir", async () => {
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");
    const { POST: postShareLinkRevoke } = await import("@/app/api/broker/share-links/revoke/route");
    const { GET: getPublicImLite } = await import("@/app/api/public/im-lite/[buildingId]/route");

    currentAuthBrokerId = BROKER_A_ID;

    // 1. Issue T1 and T2 via two approvals for the same building
    const app1 = await (
      await postInboxAction(
        new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_gate",
            threadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            buildingId: BROKER_A_BLDG_UUID,
          }),
        })
      )
    ).json();
    const token1 = String(app1.shareToken);

    const app2 = await (
      await postInboxAction(
        new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "approve_gate",
            threadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            buildingId: BROKER_A_BLDG_UUID,
          }),
        })
      )
    ).json();
    const token2 = String(app2.shareToken);

    // 2. Lock via UI endpoint (/api/broker/share-links/revoke) -> Unlock via actions -> Lock again via UI endpoint (S0-4)
    await postShareLinkRevoke(
      new NextRequest("http://localhost:3000/api/broker/share-links/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token2, buildingId: BROKER_A_BLDG_UUID }),
      })
    );
    await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_link",
          buildingId: BROKER_A_BLDG_UUID,
          token: token2,
        }),
      })
    );
    const secondLockRes = await postShareLinkRevoke(
      new NextRequest("http://localhost:3000/api/broker/share-links/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token2, buildingId: BROKER_A_BLDG_UUID }),
      })
    );
    expect(secondLockRes.status).toBe(200);

    // 3. Flood activity_events with 150 unrelated im_upserted & call_note_recorded events (S1-1 & S1-2)
    for (let i = 0; i < 150; i++) {
      db.activity_events.unshift({
        id: `flood-ev-${i}`,
        actor_id: BROKER_B_ID,
        event_type: i % 2 === 0 ? "im_upserted" : "call_note_recorded",
        entity_type: "building",
        entity_id: BROKER_B_ID,
        metadata: { building_id: `im-doc-other-${i}`, note: `flood ${i}` },
        created_at: new Date(Date.now() + 10_000 + i).toISOString(),
      });
    }

    // 4. Simulate True Serverless Cold Start
    simulateServerlessColdStart();

    // Both token1 (older token, S1-3) and token2 must be rejected!
    const v1 = await verifyShareLinkToken({ token: token1, buildingId: BROKER_A_BLDG_UUID });
    const v2 = await verifyShareLinkToken({ token: token2, buildingId: BROKER_A_BLDG_UUID });
    expect(v1.valid).toBe(false);
    expect(v1.reason).toBe("revoked");
    expect(v2.valid).toBe(false);
    expect(v2.reason).toBe("revoked");

    // Untokened GET /api/public/im-lite/[id] must also reject (403) when building is revoked (S1-5)
    const pubRes = await getPublicImLite(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${BROKER_A_BLDG_UUID}`),
      { params: Promise.resolve({ buildingId: BROKER_A_BLDG_UUID }) }
    );
    expect(pubRes.status).toBe(403);

    // 5. S1-4: Stale warm-instance tmpdir says revoked, but newer DB event says link_restored
    saveInboxState({
      revokedBuildings: {
        [BROKER_A_BLDG_UUID]: {
          revoked: true,
          revokedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });
    await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore_link",
          buildingId: BROKER_A_BLDG_UUID,
          token: token2,
        }),
      })
    );
    // Simulate a DIFFERENT warm instance that still has the old tmpdir state
    saveInboxState({
      revokedBuildings: {
        [BROKER_A_BLDG_UUID]: {
          revoked: true,
          revokedAt: "2026-01-01T00:00:00.000Z",
        },
      },
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });
    const docAfterRestore = await fetchIMData(BROKER_A_BLDG_UUID);
    expect((docAfterRestore as any)?.isRevoked).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // T3 & T4 & T6 & T7. Re-Approve After Lock, LocalStorage Isolation, Error Honesty & Subscriber Dedupe
  // ═══════════════════════════════════════════════════════════════════════════
  it("[T3-04 & T6-01 & T7-01..03] re-activates building on approve_gate after lock, fails honestly on DB error, blocks empty buildingId fallback to bld-01, and deduplicates +82/010 subscribers", async () => {
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");
    const { GET: getMagazineEditions } = await import("@/app/api/magazine/editions/route");

    currentAuthBrokerId = BROKER_A_ID;

    // 1. T3-04 (S1-7): Lock building, then approve_gate -> new token must work immediately
    await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_link",
          buildingId: BROKER_A_BLDG_UUID,
        }),
      })
    );
    const reApproveRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_gate",
          threadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          buildingId: BROKER_A_BLDG_UUID,
        }),
      })
    );
    const reApproveJson = await reApproveRes.json();
    expect(reApproveJson.ok).toBe(true);
    const newVerification = await verifyShareLinkToken({
      token: reApproveJson.shareToken,
      buildingId: BROKER_A_BLDG_UUID,
    });
    expect(newVerification.valid).toBe(true);

    // 2. T7-02 (F14): revoke_link with empty buildingId must return 400 (never fallback to demo 'bld-01')
    const emptyBldRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_link",
          buildingId: "",
          threadId: "custom_no_bldg",
        }),
      })
    );
    expect(emptyBldRes.status).toBe(400);

    // 3. T6-01 (S1-13): Inject DB errors on broker_clients AND activity_events -> upsert_client must fail honestly
    injectTableError("broker_clients", "Disk full");
    injectTableError("activity_events", "Disk full");
    const failUpsertRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_client",
          clientName: "실패테스트고객",
          clientPhone: "010-1234-5678",
        }),
      })
    );
    expect(failUpsertRes.status).toBeGreaterThanOrEqual(500);
    clearInjectedErrors();

    // 4. T7-01 & T7-03: Same VIP in 3 sources with +82 10-5555-4444 / 010-5555-4444 + 1 untagged CRM client
    db = createInitialDb();
    simulateServerlessColdStart();
    db.magazine_subscribers.push({
      id: "sub-1",
      broker_id: BROKER_A_ID,
      name: "최대표",
      phone: "010-5555-4444",
      status: "active",
      consent_given: true,
    });
    db.broker_clients.push(
      {
        id: "cli-1",
        broker_id: BROKER_A_ID,
        display_name: "최대표",
        phone: "+82 10-5555-4444",
        tier: "VIP",
        tags: ["newsletter", "high_interest"],
      },
      {
        id: "cli-untagged",
        broker_id: BROKER_A_ID,
        display_name: "단순문의객",
        phone: "010-2222-3333",
        tier: "일반",
        tags: [], // Untagged CRM client without newsletter consent
      }
    );
    db.activity_events.push({
      id: "ev-sub-1",
      actor_id: BROKER_A_ID,
      event_type: "custom_client_upserted",
      entity_id: BROKER_A_ID,
      metadata: {
        name: "최대표",
        phone: "01055554444",
        grade: "VIP",
      },
      created_at: new Date().toISOString(),
    });

    const edRes = await getMagazineEditions(
      new NextRequest("http://localhost:3000/api/magazine/editions?broker_id=me&type=all")
    );
    const edJson = await edRes.json();
    expect(edJson.subscriberCount).toBe(1);
    expect(edJson.highInterestCount).toBe(1);
  });

  it("[T4-01 / S1-11] isolates localStorage newsletter draft by brokerId so Broker B never inherits Broker A's draft on a shared PC", async () => {
    const { default: MagazineEditorPage } = await import(
      "@/app/(broker)/broker/magazine-editor/page"
    );

    // Seed localStorage draft saved by Broker A
    window.localStorage.setItem(
      "cre-newsletter-local-draft-v2",
      JSON.stringify({
        brokerId: BROKER_A_ID,
        headline: "이상덕 중개사만의 비공개 11월 특집 초안",
        summary: "타 중개사에게 절대 노출되면 안 되는 요약",
        briefingBody: "비공개 본문",
        serverPublished: true,
        editionId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      })
    );

    // Mount editor as Broker B
    currentAuthBrokerId = BROKER_B_ID;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      if (urlStr.includes("/api/magazine/editions")) {
        const { GET } = await import("@/app/api/magazine/editions/route");
        return GET(new NextRequest(`http://localhost:3000${urlStr}`));
      }
      return new Response(JSON.stringify({ ok: true, items: [], buildings: [] }), { status: 200 });
    }) as any;

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const text = container.textContent || "";
    const inputs = Array.from(container.querySelectorAll("input, textarea")) as Array<
      HTMLInputElement | HTMLTextAreaElement
    >;
    const allInputValues = inputs.map((el) => el.value).join(" ");
    expect(text).not.toContain("이상덕 중개사만의 비공개 11월 특집 초안");
    expect(allInputValues).not.toContain("이상덕 중개사만의 비공개 11월 특집 초안");
  });
});
