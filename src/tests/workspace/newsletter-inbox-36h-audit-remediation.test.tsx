// @vitest-environment node
/**
 * @file src/tests/workspace/newsletter-inbox-36h-audit-remediation.test.tsx
 * @description Regression & integration verification suite for the 36-hour Newsletter + Inbox + QA Workbench forensic audit:
 *  - [C-1] POST /api/broker/inbox/actions resolves 403 caused by PGRST200 (gate_requests join) & 42703 (buildings.owner_id),
 *          supports inquiries on deleted DealCards (verifiedViaInquiry), blocks cross-broker hijack (403), and supports archive_thread.
 *  - [C-2 & B-2] Public magazine_subscribers (broker_id = slug) syncs into GET /api/broker/inbox (sub_<id>) AND
 *          GET /api/magazine/editions?broker_id=me without 42703 on magazine_subscribers.tags or broker_profiles.office_name,
 *          respecting PIPA newsletter_subscription_toggled events and excluding non-consented VIP clients.
 *  - [C-3] GET /api/broker/inbox/pending-count zeros out ghost unread counts from deleted buildings (deal_deleted) & archived threads.
 *  - [C-4] POST /api/broker/share-links/revoke emits a single link_revoked event (no duplicate), and GET /api/broker/inbox
 *          isolates anonymous mobile_im_view events by visitor_fp so 3 distinct 1-time visitors do not trigger false high_interest.
 *  - [B-1 & B-3] maskAddressForPublic, maskPublicAddresses, and sanitizeBrokerPhone mask lot/road numbers across address & areaSignal
 *          (featured_deals, featuredDeals, dealHighlights) without mangling "매각가 300", and strip email strings from broker.phone.
 *  - [B-5] OpenAIProvider sets max_completion_tokens floor (>= 2048) for gpt-5* reasoning models when small maxTokens (e.g. 200) is passed.
 *  - [A-1 ~ A-3] /api/public/qa-workbench persists sync/submit state in activity_events, probes live address leaks & link locks,
 *          and seeds Axis 4~6 test lead + subscriber fixtures idempotently.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  maskAddressForPublic,
  maskPublicAddresses,
  sanitizeBrokerPhone,
} from "@/lib/magazine/public-page-data";
import { saveInboxState } from "@/lib/im-lite/quick-generate-store";
import {
  issueShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from "@/lib/security/share-link-tokens";

const BROKER_A = "11111111-1111-4111-8111-111111111111";
const BROKER_B = "22222222-2222-4222-8222-222222222222";
const BLD_ACTIVE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const BLD_DELETED_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const BLD_VIEW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const BLD_ACTIVE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const INQ_ON_ACTIVE_A = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const INQ_ON_DELETED_A = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const INQ_ON_B = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const SUB_DEMO_1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const EDITION_LEAK_ID = "1542d7ab-b107-4118-be9a-5ba164fc1812";
const SESSION_QA_ID = "ffffffff-ffff-4fff-8fff-fffffffffff1";

interface StrictAuditDb {
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  deals: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  party: Array<Record<string, any>>;
  buyer_condition: Array<Record<string, any>>;
  track_event: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  magazine_editions: Array<Record<string, any>>;
  magazine_issues: Array<Record<string, any>>;
}

function createEmptyAuditDb(): StrictAuditDb {
  return {
    building_ssot_lite: [],
    buildings: [],
    deals: [],
    gate_requests: [],
    im_inquiry_requests: [],
    in_app_notifications: [],
    activity_events: [],
    im_share_links: [],
    broker_clients: [],
    broker_custom_clients: [],
    broker_profiles: [],
    profiles: [],
    document_objects: [],
    party: [],
    buyer_condition: [],
    track_event: [],
    magazine_subscribers: [],
    magazine_editions: [],
    magazine_issues: [],
  };
}

let sharedDb: StrictAuditDb = createEmptyAuditDb();
let currentAuthUser: { id: string; role?: string } | null = { id: BROKER_A, role: "broker" };
let currentBrokerCtx: {
  userId: string;
  slug: string | null;
  displayName: string | null;
  brokerKeys: string[];
} | null = {
  userId: BROKER_A,
  slug: "demo",
  displayName: "김중개 대표",
  brokerKeys: ["demo", BROKER_A],
};

/**
 * Mirrors real production Supabase PostgREST schema rules uncovered in the 36h audit:
 *  1) gate_requests -> buildings(...) embed fails with PGRST200 (no FK relationship)
 *  2) buildings.owner_id fails with 42703 (column does not exist in production)
 *  3) magazine_subscribers.tags fails with 42703 (column does not exist; tags live in interest_profile)
 *  4) broker_profiles.office_name fails with 42703 (column does not exist)
 */
function createProductionMirroredSupabase(db: StrictAuditDb) {
  let seq = 1;
  return {
    auth: {
      getUser: async () => ({
        data: { user: currentAuthUser ? { id: currentAuthUser.id } : null },
        error: null,
      }),
    },
    from(table: string) {
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      let pendingError: { code: string; message: string } | null = null;
      let orderCol: string | null = null;
      let orderAsc = true;
      let limitCount: number | null = null;
      let headOnly = false;
      let exactCount = false;
      let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
      let writePayload: any = null;

      const inspectSelectColumns = (cols?: string) => {
        const c = String(cols || "");
        if (table === "gate_requests" && /buildings\s*\(/.test(c)) {
          pendingError = {
            code: "PGRST200",
            message: "Could not find a relationship between 'gate_requests' and 'buildings' in the schema cache",
          };
        }
        if (table === "buildings" && /\bowner_id\b/.test(c)) {
          pendingError = {
            code: "42703",
            message: "column buildings.owner_id does not exist",
          };
        }
        if (table === "magazine_subscribers" && /\btags\b/.test(c)) {
          pendingError = {
            code: "42703",
            message: "column magazine_subscribers.tags does not exist",
          };
        }
        if (table === "broker_profiles" && /\boffice_name\b/.test(c)) {
          pendingError = {
            code: "42703",
            message: "column broker_profiles.office_name does not exist",
          };
        }
      };

      const execute = () => {
        if (pendingError) {
          return { data: null, error: pendingError, count: null };
        }
        const rows = (db as any)[table] as Array<Record<string, any>> | undefined;
        if (!rows) {
          return {
            data: null,
            error: { code: "42P01", message: `relation "${table}" does not exist` },
            count: null,
          };
        }

        if (op === "insert" || op === "upsert") {
          const items = Array.isArray(writePayload) ? writePayload : [writePayload];
          const inserted: Array<Record<string, any>> = [];
          for (const item of items) {
            const copy = {
              id: item.id ?? `00000000-0000-4000-8000-${String(seq++).padStart(12, "0")}`,
              created_at: item.created_at ?? new Date().toISOString(),
              ...item,
            };
            rows.push(copy);
            inserted.push(copy);
          }
          return { data: inserted, error: null, count: inserted.length };
        }

        if (op === "update") {
          const matched = rows.filter((r) => filters.every((fn) => fn(r)));
          for (const r of matched) {
            Object.assign(r, writePayload);
          }
          return { data: matched, error: null, count: matched.length };
        }

        if (op === "delete") {
          const kept = rows.filter((r) => !filters.every((fn) => fn(r)));
          const removed = rows.length - kept.length;
          rows.splice(0, rows.length, ...kept);
          return { data: [], error: null, count: removed };
        }

        let matched = rows.filter((r) => filters.every((fn) => fn(r)));
        const total = matched.length;
        if (orderCol) {
          matched = [...matched].sort((a, b) => {
            const av = String(a[orderCol!] ?? "");
            const bv = String(b[orderCol!] ?? "");
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (limitCount !== null && limitCount >= 0) {
          matched = matched.slice(0, limitCount);
        }
        return {
          data: headOnly ? null : matched.map((r) => ({ ...r })),
          error: null,
          count: exactCount ? total : matched.length,
        };
      };

      const builder: any = {
        select(cols?: string, opts?: { count?: string; head?: boolean }) {
          inspectSelectColumns(cols);
          if (opts?.count === "exact") exactCount = true;
          if (opts?.head) headOnly = true;
          return builder;
        },
        insert(payload: any) {
          op = "insert";
          writePayload = payload;
          return builder;
        },
        upsert(payload: any) {
          op = "upsert";
          writePayload = payload;
          return builder;
        },
        update(payload: any) {
          op = "update";
          writePayload = payload;
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        eq(col: string, val: any) {
          if (table === "buildings" && col === "owner_id") {
            pendingError = { code: "42703", message: "column buildings.owner_id does not exist" };
            return builder;
          }
          if (col.startsWith("metadata->>")) {
            const metaKey = col.slice("metadata->>".length);
            filters.push((r) => String(r?.metadata?.[metaKey] ?? "") === String(val ?? ""));
            return builder;
          }
          filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
          return builder;
        },
        neq(col: string, val: any) {
          filters.push((r) => String(r[col] ?? "") !== String(val ?? ""));
          return builder;
        },
        is(col: string, val: any) {
          filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val));
          return builder;
        },
        in(col: string, vals: any[]) {
          const set = new Set(vals.map((v) => String(v)));
          filters.push((r) => set.has(String(r[col] ?? "")));
          return builder;
        },
        gte(col: string, val: any) {
          filters.push((r) => String(r[col] ?? "") >= String(val));
          return builder;
        },
        lte(col: string, val: any) {
          filters.push((r) => String(r[col] ?? "") <= String(val));
          return builder;
        },
        lt(col: string, val: any) {
          filters.push((r) => Boolean(r[col]) && String(r[col]) < String(val));
          return builder;
        },
        or(expr: string) {
          const parts = expr.split(",");
          filters.push((r) =>
            parts.some((p) => {
              if (p === "actor_id.is.null") return !r.actor_id;
              if (p.startsWith("actor_id.neq.")) {
                const target = p.slice("actor_id.neq.".length);
                return String(r.actor_id ?? "") !== target;
              }
              if (p === "actor_role.eq.system") return r.actor_role === "system";
              return true;
            })
          );
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = opts?.ascending !== false;
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        maybeSingle() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          return Promise.resolve({ data: arr[0] ?? null, error: null });
        },
        single() {
          const res = execute();
          if (res.error) return Promise.resolve({ data: null, error: res.error });
          const arr = Array.isArray(res.data) ? res.data : [];
          if (arr.length === 0) {
            return Promise.resolve({ data: null, error: { code: "PGRST116", message: "0 rows" } });
          }
          return Promise.resolve({ data: arr[0], error: null });
        },
        then(onFulfilled: any, onRejected?: any) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
  };
}

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn(async () => {
    if (!currentAuthUser) {
      return {
        user: null,
        role: null,
        error: Response.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      };
    }
    return {
      user: { id: currentAuthUser.id, role: currentAuthUser.role || "broker" },
      role: currentAuthUser.role || "broker",
      error: null,
    };
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => createProductionMirroredSupabase(sharedDb)),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createProductionMirroredSupabase(sharedDb)),
}));

vi.mock("@/lib/magazine/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/magazine/authz")>();
  return {
    ...actual,
    requireBrokerContext: vi.fn(async () => {
      if (!currentBrokerCtx) {
        return { ctx: null, error: actual.jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401) };
      }
      return { ctx: currentBrokerCtx, error: null };
    }),
  };
});

import { POST as postInboxAction } from "@/app/api/broker/inbox/actions/route";
import { GET as getInboxThreads } from "@/app/api/broker/inbox/route";
import { GET as getInboxPendingCount } from "@/app/api/broker/inbox/pending-count/route";
import { POST as postShareLinkRevoke } from "@/app/api/broker/share-links/revoke/route";
import { GET as getMagazineEditions } from "@/app/api/magazine/editions/route";
import {
  GET as getQaWorkbench,
  POST as postQaWorkbench,
} from "@/app/api/public/qa-workbench/route";
import { OpenAIProvider } from "@/ai/providers/openai";

describe("36-Hour Newsletter & Inbox Forensic Audit Remediation Suite", () => {
  beforeEach(() => {
    sharedDb = createEmptyAuditDb();
    currentAuthUser = { id: BROKER_A, role: "broker" };
    currentBrokerCtx = {
      userId: BROKER_A,
      slug: "demo",
      displayName: "김중개 대표",
      brokerKeys: ["demo", BROKER_A],
    };
    saveInboxState({
      gateDecisions: {},
      revokedBuildings: {},
      callNotes: {},
      customClients: [],
      correctionNotices: {},
    });
    resetShareLinkTokenStoreForTests();
  });

  it("[B-1 & B-3] masks lot/road numbers across address & areaSignal in all deal arrays without mangling '매각가 300', and strips '@' from broker.phone", () => {
    expect(maskAddressForPublic("당산동5가 11-47")).toBe("당산동5가 일대");
    expect(maskAddressForPublic("서울 영등포구 영신로 259")).toBe("서울 영등포구 영신로 일대");
    expect(maskAddressForPublic("서울 강남구 테헤란로 152, 3층")).toBe("서울 강남구 테헤란로 일대");
    expect(maskAddressForPublic("매각가 300")).toBe("매각가 300");

    expect(sanitizeBrokerPhone(" xanova@naver.com ")).toBe("");
    expect(sanitizeBrokerPhone("02-555-1234")).toBe("02-555-1234");

    const masked = maskPublicAddresses({
      headline: "영등포 핵심 수익형 리포트",
      broker: { name: "김중개", phone: " xanova@naver.com " },
      featured_deals: [
        {
          id: "d1",
          title: "영등포 당산동5가 11-47 메디컬 빌딩",
          address: "당산동5가 11-47",
          areaSignal: "서울 영등포구 영신로 259",
        },
      ],
      featuredDeals: [
        {
          id: "d2",
          title: "당산권역 우량 꼬마빌딩",
          address: "서울 영등포구 영신로 259",
          areaSignal: "당산동5가 11-47",
        },
      ],
      dealHighlights: [
        {
          id: "d3",
          title: "매각가 300억 역세권 빌딩",
          address: "서초동 1364-28",
          areaSignal: "매각가 300",
        },
      ],
    });

    expect((masked.broker as Record<string, unknown>).phone).toBe("");
    expect((masked.featured_deals as Array<Record<string, unknown>>)[0].address).toBe("당산동5가 일대");
    expect((masked.featured_deals as Array<Record<string, unknown>>)[0].areaSignal).toBe("서울 영등포구 영신로 일대");
    expect((masked.featured_deals as Array<Record<string, unknown>>)[0].title).toBe("영등포 당산동5가 일대 메디컬 빌딩");
    expect((masked.featuredDeals as Array<Record<string, unknown>>)[0].address).toBe("서울 영등포구 영신로 일대");
    expect((masked.featuredDeals as Array<Record<string, unknown>>)[0].areaSignal).toBe("당산동5가 일대");
    expect((masked.dealHighlights as Array<Record<string, unknown>>)[0].address).toBe("서초동 일대");
    expect((masked.dealHighlights as Array<Record<string, unknown>>)[0].areaSignal).toBe("매각가 300");
  });

  it("[C-1 & C-3] POST /api/broker/inbox/actions succeeds (200) under real PGRST200/42703 schema rules & deleted DealCards, blocks cross-broker 403, and archive_thread clears pending-count", async () => {
    sharedDb.building_ssot_lite.push(
      { id: BLD_ACTIVE_A, owner_id: BROKER_A, name: "당산 리버타워", address_road: "서울 영등포구 영신로 259", status: "active" },
      { id: BLD_ACTIVE_B, owner_id: BROKER_B, name: "타중개사 빌딩", address_road: "서울 강남구 역삼로 10", status: "active" }
    );
    // Record that BLD_DELETED_A was deleted by BROKER_A via deal_deleted
    sharedDb.activity_events.push({
      id: "00000000-0000-4000-8000-000000000901",
      actor_id: BROKER_A,
      actor_role: "broker",
      event_type: "deal_deleted",
      entity_type: "building",
      entity_id: BLD_DELETED_A,
      metadata: { building_id: BLD_DELETED_A },
      created_at: "2026-11-13T04:30:00.000Z",
    });

    sharedDb.im_inquiry_requests.push(
      {
        id: INQ_ON_ACTIVE_A,
        building_id: BLD_ACTIVE_A,
        broker_user_id: BROKER_A,
        requester_name: "이투자 대표",
        requester_phone: "01012345678",
        message: "수익률 자료 요청",
        status: "submitted",
        created_at: "2026-11-13T04:00:00.000Z",
      },
      {
        id: INQ_ON_DELETED_A,
        building_id: BLD_DELETED_A,
        broker_user_id: BROKER_A,
        requester_name: "삭제매물 문의자",
        requester_phone: "01022223333",
        message: "이전 삭제 매물 문의",
        status: "submitted",
        created_at: "2026-11-13T03:00:00.000Z",
      },
      {
        id: INQ_ON_B,
        building_id: BLD_ACTIVE_B,
        broker_user_id: BROKER_B,
        requester_name: "타사 고객",
        requester_phone: "01099990000",
        status: "submitted",
        created_at: "2026-11-13T04:10:00.000Z",
      }
    );

    // 1) Pending count must ONLY count INQ_ON_ACTIVE_A (1), NOT INQ_ON_DELETED_A (ghost badge eliminated)
    const countBeforeRes = await getInboxPendingCount(
      new NextRequest("http://localhost/api/broker/inbox/pending-count")
    );
    const countBefore = await countBeforeRes.json();
    expect(countBefore.count).toBe(1);

    // 2) Approving inquiry on active building succeeds (200) despite PGRST200 on gate_requests join & 42703 on buildings.owner_id
    const approveRes = await postInboxAction(
      new NextRequest("http://localhost/api/broker/inbox/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "approve_gate",
          threadId: INQ_ON_ACTIVE_A,
          buildingId: BLD_ACTIVE_A,
          buildingName: "당산 리버타워",
        }),
      })
    );
    expect(approveRes.status).toBe(200);
    expect(sharedDb.im_inquiry_requests.find((r) => r.id === INQ_ON_ACTIVE_A)?.status).toBe("approved");

    // 3) Archiving inquiry on BROKER_A's own deleted building succeeds (200 via verifiedViaInquiry)
    const archiveDeletedRes = await postInboxAction(
      new NextRequest("http://localhost/api/broker/inbox/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "archive_thread",
          threadId: INQ_ON_DELETED_A,
          buildingId: BLD_DELETED_A,
        }),
      })
    );
    expect(archiveDeletedRes.status).toBe(200);

    // 4) Cross-broker attempt against BROKER_B's inquiry still returns 403 Forbidden
    const crossTenantRes = await postInboxAction(
      new NextRequest("http://localhost/api/broker/inbox/actions", {
        method: "POST",
        body: JSON.stringify({
          action: "approve_gate",
          threadId: INQ_ON_B,
          buildingId: BLD_ACTIVE_B,
        }),
      })
    );
    expect(crossTenantRes.status).toBe(403);

    // 5) Pending count is now 0
    const countAfterRes = await getInboxPendingCount(
      new NextRequest("http://localhost/api/broker/inbox/pending-count")
    );
    const countAfter = await countAfterRes.json();
    expect(countAfter.count).toBe(0);
  });

  it("[C-2 & B-2] syncs public magazine_subscribers (broker_id = slug) into Inbox CRM AND Newsletter Studio subscriberCount with strict PIPA parity", async () => {
    sharedDb.broker_profiles.push({
      user_id: BROKER_A,
      slug: "demo",
      name: "김중개 대표",
      card_name: "크레딜 부동산중개법인",
    });
    sharedDb.profiles.push({
      id: BROKER_A,
      display_name: "김중개 대표",
      company: "크레딜 중개법인",
      phone: "02-555-7777",
    });

    // Public subscriber saved under slug "demo" (like /m/demo/subscribe)
    sharedDb.magazine_subscribers.push({
      id: SUB_DEMO_1,
      broker_id: "demo",
      subscriber_name: "최구독 전무",
      subscriber_phone: "010-7777-6666",
      subscriber_email: "choi@familyoffice.kr",
      status: "active",
      confirm_status: "confirmed",
      subscribed_at: "2026-11-13T05:00:00.000Z",
      interest_profile: {
        tags: {
          regions: ["강남/서초(GBD)"],
          assetTypes: ["꼬마빌딩"],
        },
      },
    });

    // VIP client WITHOUT newsletter consent must NOT inflate subscriberCount
    sharedDb.broker_clients.push({
      id: "99999999-9999-4999-8999-999999999999",
      broker_id: BROKER_A,
      name: "비동의 VIP 회장",
      phone: "010-8888-1111",
      grade: "VIP",
      notes: "매입 검토중",
    });

    const inboxRes = await getInboxThreads(new NextRequest("http://localhost/api/broker/inbox"));
    expect(inboxRes.status).toBe(200);
    const inboxData = await inboxRes.json();
    const subThread = (inboxData.threads as Array<Record<string, any>>).find(
      (t) => t.id === `sub_${SUB_DEMO_1}`
    );
    expect(subThread).toBeDefined();
    expect(subThread?.clientName).toBe("최구독 전무");
    expect(subThread?.newsletterSubscribed).toBe(true);
    expect(subThread?.tags).toEqual(expect.arrayContaining(["강남/서초(GBD)", "꼬마빌딩"]));

    const editionsRes = await getMagazineEditions(
      new NextRequest("http://localhost/api/magazine/editions?broker_id=me")
    );
    expect(editionsRes.status).toBe(200);
    const editionsData = await editionsRes.json();
    // Only the 1 consented subscriber is counted; non-consented VIP is excluded
    expect(editionsData.subscriberCount).toBe(1);
    expect(editionsData.brokerOffice).toBe("크레딜 중개법인");
    expect(editionsData.brokerPhone).toBe("02-555-7777");
  });

  it("[C-4] emits single link_revoked event on revoke and separates distinct anonymous visitor_fp viewers instead of false high_interest", async () => {
    sharedDb.building_ssot_lite.push(
      {
        id: BLD_ACTIVE_A,
        owner_id: BROKER_A,
        name: "성수 브릭타워",
        address_road: "서울 성동구 연무장길 45",
        status: "active",
      },
      {
        id: BLD_VIEW_A,
        owner_id: BROKER_A,
        name: "한남 프라임빌딩",
        address_road: "서울 용산구 이태원로 100",
        status: "active",
      }
    );

    const issued = await issueShareLinkToken({
      buildingId: BLD_ACTIVE_A,
      recipientId: "01055554444",
      brokerId: BROKER_A,
      ttlDays: 7,
    });

    const revokeRes = await postShareLinkRevoke(
      new NextRequest("http://localhost/api/broker/share-links/revoke", {
        method: "POST",
        body: JSON.stringify({ token: issued.token, buildingId: BLD_ACTIVE_A, reason: "manual_test" }),
      })
    );
    expect(revokeRes.status).toBe(200);
    const linkRevokedEvents = sharedDb.activity_events.filter(
      (ev) => ev.event_type === "link_revoked"
    );
    expect(linkRevokedEvents).toHaveLength(1);

    // 3 distinct anonymous visitors viewing BLD_VIEW_A once each (recent timestamp within 30d window)
    const recentIso = new Date(Date.now() - 60_000).toISOString();
    for (const fp of ["fp-alpha-01", "fp-bravo-02", "fp-charlie-03"]) {
      sharedDb.activity_events.push({
        id: `00000000-0000-4000-8000-00000000010${fp.slice(-1)}`,
        actor_id: null,
        actor_role: "anonymous",
        event_type: "mobile_im_view",
        entity_type: "building",
        entity_id: BLD_VIEW_A,
        metadata: {
          building_id: BLD_VIEW_A,
          visitor_fp: fp,
          dwell_seconds: 15,
        },
        created_at: recentIso,
      });
    }

    const inboxRes = await getInboxThreads(new NextRequest("http://localhost/api/broker/inbox"));
    const inboxData = await inboxRes.json();
    const anonThreads = (inboxData.threads as Array<Record<string, any>>).filter((t) =>
      String(t.id).startsWith(`view_${BLD_VIEW_A}_`)
    );
    expect(anonThreads).toHaveLength(3);
    for (const t of anonThreads) {
      expect(t.openCount).toBe(1);
      expect(t.status).toBe("active");
    }
  });

  it("[B-5] OpenAIProvider enforces >= 2048 max_completion_tokens floor for gpt-5* reasoning models so reasoning tokens cannot starve JSON output", async () => {
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-audit-key";
    const capturedBodies: Array<Record<string, any>> = [];

    const fakeFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBodies.push(JSON.parse(String(init?.body || "{}")));
      return new Response(
        JSON.stringify({
          id: "chatcmpl-test-1",
          object: "chat.completion",
          created: 1794560000,
          model: "gpt-5.6-luna",
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: { role: "assistant", content: '{"summary":"정상 요약"}' },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 320, total_tokens: 370 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fakeFetch);

    try {
      const provider = new OpenAIProvider();
      const res = await provider.chat({
        model: "gpt-5.6-luna",
        systemPrompt: "You are a CRE market analyst.",
        userPrompt: "Summarize market news",
        maxTokens: 200,
        responseFormat: "json_object",
      });
      expect(res.content).toBe('{"summary":"정상 요약"}');
      expect(capturedBodies).toHaveLength(1);
      expect(capturedBodies[0].max_completion_tokens).toBeGreaterThanOrEqual(2048);
    } finally {
      vi.unstubAllGlobals();
      if (prevKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = prevKey;
      }
    }
  });

  it("[A-1 ~ A-3] /api/public/qa-workbench persists sync/submit state, verifies clean masked edition in probe mode, and seeds Axis 4~6 fixtures idempotently", async () => {
    // 1) Sync + GET round-trip
    const syncRes = await postQaWorkbench(
      new NextRequest("http://localhost/api/public/qa-workbench", {
        method: "POST",
        body: JSON.stringify({
          mode: "sync",
          sessionId: SESSION_QA_ID,
          testerName: "홍길동 QA",
          testerOrg: "Desktop Chrome",
          records: {
            "NL-101": { status: "PASS", note: "" },
            "IB-401": { status: "FAIL", note: "승인 버튼 점검" },
          },
          scratchLinks: { newsletterPublicUrl: "https://credeal.net/m/demo/2026-11-13" },
        }),
      })
    );
    expect(syncRes.status).toBe(200);

    const getRes = await getQaWorkbench(
      new NextRequest(`http://localhost/api/public/qa-workbench?sessionId=${SESSION_QA_ID}`)
    );
    expect(getRes.status).toBe(200);
    const loaded = await getRes.json();
    expect(loaded.found).toBe(true);
    expect(loaded.session.testerName).toBe("홍길동 QA");
    expect(loaded.session.records["NL-101"].status).toBe("PASS");
    expect(loaded.session.records["IB-401"].status).toBe("FAIL");

    // 2) Probe mode verifies clean masked edition AND detects raw unmasked address leak when present
    sharedDb.broker_profiles.push({
      user_id: BROKER_A,
      slug: "demo",
      name: "김중개 대표",
    });
    sharedDb.magazine_editions.push({
      id: EDITION_LEAK_ID,
      broker_id: "demo",
      status: "published",
      title: "당산 위클리 브리핑",
      published_at: "2026-11-13T01:00:00.000Z",
      content: {
        headline: "당산 위클리 브리핑",
        broker: { name: "김중개 대표", phone: "02-555-7777" },
        featured_deals: [
          {
            id: "d1",
            title: "당산 역세권 빌딩",
            address: "당산동5가 일대",
            areaSignal: "서울 영등포구 영신로 일대",
          },
        ],
      },
    });

    const probeCleanRes = await postQaWorkbench(
      new NextRequest("http://localhost/api/public/qa-workbench", {
        method: "POST",
        body: JSON.stringify({
          mode: "probe",
          newsletterPublicUrl: `https://credeal.net/m/demo/2026-11-13?edition=${EDITION_LEAK_ID}`,
        }),
      })
    );
    const probeClean = await probeCleanRes.json();
    expect(probeClean.ok).toBe(true);
    expect(probeClean.newsletterCheck.existsAndPublished).toBe(true);
    expect(probeClean.newsletterCheck.addressBlindPass).toBe(true);
    expect(probeClean.newsletterCheck.brokerPhonePass).toBe(true);
    expect(probeClean.newsletterCheck.noRawUuidPass).toBe(true);

    // Inject raw lot address leak into DB and verify probe catches it!
    sharedDb.magazine_editions[0].content.featured_deals[0].areaSignal = "당산동5가 11-47";
    const probeLeakRes = await postQaWorkbench(
      new NextRequest("http://localhost/api/public/qa-workbench", {
        method: "POST",
        body: JSON.stringify({
          mode: "probe",
          newsletterPublicUrl: `https://credeal.net/m/demo/2026-11-13?edition=${EDITION_LEAK_ID}`,
        }),
      })
    );
    const probeLeak = await probeLeakRes.json();
    expect(probeLeak.newsletterCheck.addressBlindPass).toBe(false);
    expect(probeLeak.newsletterCheck.offendingAddresses).toContain("당산동5가 11-47");

    // 3) Axis 4~6 seeder creates inquiry + subscriber idempotently without duplicating subscriber on 2nd click
    sharedDb.building_ssot_lite.push({
      id: BLD_ACTIVE_A,
      owner_id: BROKER_A,
      name: "QA 시드 테스트 빌딩",
      status: "active",
      created_at: "2026-11-13T01:00:00.000Z",
    });

    const seedRes1 = await postQaWorkbench(
      new NextRequest("http://localhost/api/public/qa-workbench", {
        method: "POST",
        body: JSON.stringify({ mode: "seed_axis456" }),
      })
    );
    const seed1 = await seedRes1.json();
    expect(seed1.ok).toBe(true);
    expect(seed1.seededBuildingId).toBe(BLD_ACTIVE_A);
    expect(sharedDb.magazine_subscribers).toHaveLength(1);

    const seedRes2 = await postQaWorkbench(
      new NextRequest("http://localhost/api/public/qa-workbench", {
        method: "POST",
        body: JSON.stringify({ mode: "seed_axis456" }),
      })
    );
    const seed2 = await seedRes2.json();
    expect(seed2.ok).toBe(true);
    expect(sharedDb.magazine_subscribers).toHaveLength(1);
  });
});
