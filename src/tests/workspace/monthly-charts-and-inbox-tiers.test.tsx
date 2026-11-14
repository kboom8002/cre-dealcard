// @vitest-environment jsdom
/**
 * @file src/tests/workspace/monthly-charts-and-inbox-tiers.test.tsx
 * @description Comprehensive verification for:
 *   - Track 1: Monthly Newsletter Option A (`molit_bok`), Option B (`molit_band`), whole-building median calculation, 70s jargon guard, and cadence sync (`monthly` vs `daily`).
 *   - Track 2: Per-client reaction attribution (`slk.*` -> public view/teaser -> `GET /api/broker/inbox`) without cross-client leakage.
 *   - Track 2: Free vs Paid Outbound Channels (Copy bundle + Resend Email + Pro/Transactional-basis Kakao Alimtalk) & Inbox UI integration.
 */
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";

import {
  buildDefaultMonthlyGraphicPair,
  hydrateMonthlyChartsFromDbRows,
} from "@/domain/magazine/monthly-stats-hydration";
import { applySimplePreset } from "@/lib/magazine/simple-format";
import { clusterArticlesIntoFiveIssues } from "@/domain/magazine/issue-clustering";
import { CURATED_CHANNEL_POOL } from "@/domain/magazine/news-channels";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import {
  issueShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from "@/lib/security/share-link-tokens";
import {
  getInboxState,
  saveInboxState,
} from "@/lib/im-lite/quick-generate-store";
import InboxWorkspacePage from "@/app/(broker)/broker/w/inbox/page";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const BROKER_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const BUILDING_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const CLIENT_A_ID = "custom_cli-alpha-1";
const CLIENT_B_ID = "custom_cli-beta-2";

const mockRequireBroker = vi.fn();

interface InMemDb {
  user_subscriptions: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  buildings: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  im_inquiry_requests: Array<Record<string, any>>;
  broker_custom_clients: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  in_app_notifications: Array<Record<string, any>>;
  activity_events: Array<Record<string, any>>;
  teaser_events: Array<Record<string, any>>;
}

function createInitialInMemDb(): InMemDb {
  return {
    user_subscriptions: [{ user_id: BROKER_ID, tier: "free", status: "active" }],
    broker_profiles: [
      {
        user_id: BROKER_ID,
        display_name: "이상은",
        company: "JS 부동산중개법인",
        phone: "02-555-1234",
        slug: "gangnam-lee",
      },
    ],
    building_ssot_lite: [
      {
        id: BUILDING_ID,
        owner_id: BROKER_ID,
        status: "published",
        area_signal: "강남구 역삼동",
        asset_type: "근생빌딩",
        price_band: "90억대",
        fit_summary: "역세권 코너 빌딩",
      },
    ],
    buildings: [],
    gate_requests: [],
    im_inquiry_requests: [],
    broker_custom_clients: [],
    broker_clients: [],
    im_share_links: [],
    magazine_subscribers: [],
    in_app_notifications: [],
    activity_events: [],
    teaser_events: [],
  };
}

let db: InMemDb = createInitialInMemDb();

function buildSupabaseStub() {
  const from = (table: keyof InMemDb | string) => {
    const rows = () => (db[table as keyof InMemDb] as Array<Record<string, any>>) || [];
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    let orderCol: string | null = null;
    let orderAsc = true;
    let maxRows: number | null = null;
    let pendingWrite: { op: "insert" | "upsert" | "update" | "delete"; payload?: any } | null =
      null;

    const applyFilters = (list: Array<Record<string, any>>) => {
      let res = list.filter((r) => filters.every((fn) => fn(r)));
      if (orderCol) {
        const col = orderCol;
        res = [...res].sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (typeof maxRows === "number") {
        res = res.slice(0, maxRows);
      }
      return res;
    };

    const execute = async () => {
      if (!pendingWrite) {
        return { data: applyFilters(rows()), error: null };
      }
      const list = db[table as keyof InMemDb] as Array<Record<string, any>>;
      if (!list) return { data: null, error: null };

      if (pendingWrite.op === "insert") {
        const items = Array.isArray(pendingWrite.payload)
          ? pendingWrite.payload
          : [pendingWrite.payload];
        const inserted = items.map((item, idx) => ({
          id: item.id || `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${idx}`,
          created_at: item.created_at || new Date().toISOString(),
          ...item,
        }));
        list.push(...inserted);
        return { data: inserted.length === 1 ? inserted[0] : inserted, error: null };
      }

      if (pendingWrite.op === "upsert") {
        const item = {
          id:
            pendingWrite.payload.id ||
            `${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          created_at: pendingWrite.payload.created_at || new Date().toISOString(),
          ...pendingWrite.payload,
        };
        const existingIdx = item.token
          ? list.findIndex((r) => r.token === item.token)
          : list.findIndex((r) => r.id === item.id);
        if (existingIdx >= 0) {
          list[existingIdx] = { ...list[existingIdx], ...item };
          return { data: list[existingIdx], error: null };
        }
        list.push(item);
        return { data: item, error: null };
      }

      if (pendingWrite.op === "update") {
        const matched = applyFilters(list);
        for (const m of matched) {
          Object.assign(m, pendingWrite.payload);
        }
        return { data: matched, error: null };
      }

      if (pendingWrite.op === "delete") {
        const matched = new Set(applyFilters(list));
        db[table as keyof InMemDb] = list.filter((r) => !matched.has(r)) as any;
        return { data: Array.from(matched), error: null };
      }

      return { data: [], error: null };
    };

    const builder: any = {
      select: () => builder,
      insert: (payload: any) => {
        pendingWrite = { op: "insert", payload };
        return builder;
      },
      upsert: (payload: any) => {
        pendingWrite = { op: "upsert", payload };
        return builder;
      },
      update: (payload: any) => {
        pendingWrite = { op: "update", payload };
        return builder;
      },
      delete: () => {
        pendingWrite = { op: "delete" };
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        const set = new Set((vals || []).map((v) => String(v)));
        filters.push((r) => set.has(String(r[col] ?? "")));
        return builder;
      },
      or: () => builder,
      gte: (col: string, val: string) => {
        filters.push((r) => String(r[col] ?? "") >= String(val));
        return builder;
      },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orderCol = col;
        orderAsc = opts?.ascending !== false;
        return builder;
      },
      limit: (n: number) => {
        maxRows = n;
        return builder;
      },
      maybeSingle: async () => {
        const res = await execute();
        const arr = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        return { data: arr[0] ?? null, error: res.error };
      },
      single: async () => {
        const res = await execute();
        const arr = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
        return { data: arr[0] ?? null, error: res.error };
      },
      then: (resolve: (val: any) => void, reject?: (err: any) => void) =>
        execute().then(resolve, reject),
    };

    return builder;
  };

  return { from };
}

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => buildSupabaseStub(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/w/inbox",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Monthly Top-2 Option A + Per-Client Attribution + Free/Paid Inbox Tiers", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    resetShareLinkTokenStoreForTests();
    saveInboxState({
      revokedBuildings: {},
      correctionNotices: {},
      gateDecisions: {},
      callNotes: {},
      customClients: [],
    });
    db = createInitialInMemDb();
    mockRequireBroker.mockReset();
    mockRequireBroker.mockResolvedValue({
      user: { id: BROKER_ID, role: "broker" },
      role: "broker",
      error: null,
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
    vi.unstubAllGlobals();
  });

  it("[Track 1] Option A (molit_bok) uses median whole-building prices excluding 집합/해제, renders BOK yield reference, and isolates daily cadence", () => {
    const hydrated = hydrateMonthlyChartsFromDbRows({
      regionKey: "gbd",
      transactions: [
        // 2026-09 whole-building deals: pyeong prices ~ 9,000만, 1억, 2.5억 (median = 1억/평 -> prevents skew)
        {
          transaction_date: "2026-09-05",
          transaction_price: 9_000_000_000,
          building_area: 330.58, // 100평 -> 9,000만/평
          building_type: "일반",
          cdeal_type: "",
        },
        {
          transaction_date: "2026-09-10",
          transaction_price: 10_000_000_000,
          building_area: 330.58, // 100평 -> 10,000만/평 (1.00억)
          building_type: "일반",
          cdeal_type: "",
        },
        {
          transaction_date: "2026-09-12",
          transaction_price: 25_000_000_000,
          building_area: 330.58, // outlier 25,000만/평
          building_type: "일반",
          cdeal_type: "",
        },
        // Noise that MUST be excluded (집합 & 해제)
        {
          transaction_date: "2026-09-15",
          transaction_price: 500_000_000,
          building_area: 66.1,
          building_type: "집합",
          cdeal_type: "",
        },
        {
          transaction_date: "2026-09-18",
          transaction_price: 60_000_000_000,
          building_area: 330.58,
          building_type: "일반",
          cdeal_type: "O",
        },
        // 2026-10 whole-building deal
        {
          transaction_date: "2026-10-12",
          transaction_price: 11_000_000_000,
          building_area: 330.58, // 11,000만/평
          building_type: "일반",
          cdeal_type: "",
        },
      ],
      bokLoanRates: [
        { ym: "202609", periodLabel: "26.09", corporateLoanRatePct: 4.32 },
        { ym: "202610", periodLabel: "26.10", corporateLoanRatePct: 4.18 },
      ],
    });

    expect(hydrated).toHaveLength(2);
    expect(hydrated[0].chartType).toBe("molit_tx_price_trend");
    expect(hydrated[0].sourceMode).toBe("public_db");
    // 2026-09 must count only 3 whole-building deals and report median ~10000만원/평 (1.00억), NOT inflated by cancelled deal or 집합!
    expect(hydrated[0].series[0].primaryValue).toBe(3);
    expect(hydrated[0].series[0].secondaryValue).toBe(10000);

    expect(hydrated[1].chartType).toBe("bok_loan_rate_cap_spread");
    expect(hydrated[1].sourceMode).toBe("public_db");
    expect(hydrated[1].referenceLine?.value).toBeGreaterThan(3);
    expect(hydrated[1].buyerImplication).not.toMatch(/Cap Rate|스프레드|레버리지/);

    // Verify MagazineView cadence isolation
    const issues = clusterArticlesIntoFiveIssues(CURATED_CHANNEL_POOL, { cadence: "monthly" });
    const monthlyDoc = applySimplePreset(
      {
        kind: "monthly",
        edition_type: "monthly",
        headline: "2026년 11월 강남 월간 빌딩 리포트",
        briefing: "이번 달 강남 통건물 매수는 역세권 코너 중심으로 꾸준합니다.",
        monthlyRegion: "gbd",
        monthlyCharts: buildDefaultMonthlyGraphicPair("gbd"),
        unitIssues: issues,
        broker: { name: "이상은", company: "JS 부동산중개법인", phone: "02-555-1234" },
      },
      { brokerName: "이상은" }
    );
    const dailyDoc = applySimplePreset(
      {
        kind: "daily",
        edition_type: "daily",
        headline: "오늘의 빌딩 브리핑",
        briefing: "금리 안정 속 소형 코너 매물 문의가 늘었습니다.",
        monthlyRegion: "gbd",
        monthlyCharts: buildDefaultMonthlyGraphicPair("gbd"),
        unitIssues: issues,
        broker: { name: "이상은", company: "JS 부동산중개법인", phone: "02-555-1234" },
      },
      { brokerName: "이상은" }
    );

    const monthlyHtml = renderToStaticMarkup(
      <MagazineView
        data={monthlyDoc}
        brokerId="gangnam-lee"
        brokerSlug="gangnam-lee"
        date="2026-11-01"
      />
    );
    const dailyHtml = renderToStaticMarkup(
      <MagazineView
        data={dailyDoc}
        brokerId="gangnam-lee"
        brokerSlug="gangnam-lee"
        date="2026-11-14"
      />
    );

    const chartPos = monthlyHtml.indexOf('data-testid="monthly-regional-charts-section"');
    const briefPos = monthlyHtml.indexOf('data-testid="viewer-market-briefing"');
    expect(chartPos).toBeGreaterThan(0);
    expect(chartPos).toBeLessThan(briefPos);
    expect(dailyHtml).not.toContain('data-testid="monthly-regional-charts-section"');
  });

  it("[Track 2-A] attributes im-lite & dealcard views/dwell strictly per recipient slk.* token without cross-client leakage", async () => {
    // 1. Register two distinct custom clients interested in the SAME building
    saveInboxState({
      ...getInboxState(),
      customClients: [
        {
          id: CLIENT_A_ID,
          ownerId: BROKER_ID,
          clientName: "김매수 대표",
          clientGrade: "VIP",
          clientPhone: "010-1111-2222",
          clientEmail: "kim@alpha.co.kr",
          transactionalBasis: "im_request",
          budget: "100억",
          preferredRegion: "강남구",
          buildingId: BUILDING_ID,
          buildingTitle: "강남구 역삼동 근생빌딩",
          newsletterSubscribed: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: CLIENT_B_ID,
          ownerId: BROKER_ID,
          clientName: "박투자 이사",
          clientGrade: "일반",
          clientPhone: "010-3333-4444",
          clientEmail: "park@beta.co.kr",
          transactionalBasis: null,
          budget: "80억",
          preferredRegion: "서초구",
          buildingId: BUILDING_ID,
          buildingTitle: "강남구 역삼동 근생빌딩",
          newsletterSubscribed: false,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const tokAIm = await issueShareLinkToken({
      buildingId: BUILDING_ID,
      brokerId: BROKER_ID,
      recipientId: CLIENT_A_ID,
      kind: "im",
      channel: "email",
    });
    const tokADc = await issueShareLinkToken({
      buildingId: BUILDING_ID,
      brokerId: BROKER_ID,
      recipientId: CLIENT_A_ID,
      kind: "dealcard",
      channel: "copy",
    });
    expect(tokADc.shareUrl).toContain(`/dc/${BUILDING_ID}?token=`);

    const { POST: postImView } = await import("@/app/api/public/im-lite/[buildingId]/view/route");
    const { POST: postTeaserEvent } = await import("@/app/api/public/teaser/event/route");
    const { GET: getInbox } = await import("@/app/api/broker/inbox/route");

    // Client A opens IM link + dwells 45s on 04_location + opens DealCard link
    await postImView(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${BUILDING_ID}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share_token: tokAIm.token,
          section_viewed: "04_location",
        }),
      }),
      { params: Promise.resolve({ buildingId: BUILDING_ID }) }
    );

    await postImView(
      new NextRequest(`http://localhost:3000/api/public/im-lite/${BUILDING_ID}/view`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          share_token: tokAIm.token,
          section_viewed: "04_location",
          dwell_seconds: 45,
        }),
      }),
      { params: Promise.resolve({ buildingId: BUILDING_ID }) }
    );

    await postTeaserEvent(
      new NextRequest("http://localhost:3000/api/public/teaser/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teaserConfigId: BUILDING_ID,
          buildingId: BUILDING_ID,
          eventType: "view",
          shareToken: tokADc.token,
          eventData: { url: `http://localhost:3000${tokADc.shareUrl}` },
        }),
      })
    );

    const inboxRes = await getInbox(
      new NextRequest("http://localhost:3000/api/broker/inbox?workspace=1")
    );
    expect(inboxRes.status).toBe(200);
    const json = await inboxRes.json();

    const threadA = json.threads.find((t: any) => t.id === CLIENT_A_ID);
    const threadB = json.threads.find((t: any) => t.id === CLIENT_B_ID);
    const anonLeak = json.threads.filter((t: any) => String(t.id).startsWith("view_"));

    expect(threadA).toBeDefined();
    expect(threadB).toBeDefined();
    expect(anonLeak).toHaveLength(0);

    // Client A got 2 open events (1 IM + 1 DealCard) & 45s dwell & 입지·교통 focused section
    expect(threadA.openCount).toBe(2);
    expect(threadA.dwellSeconds).toBe(45);
    expect(threadA.focusedSections).toContain("입지·교통");
    expect(threadA.clientEmail).toBe("kim@alpha.co.kr");
    expect(threadA.hasTransactionalBasis).toBe(true);

    // Client B on the SAME building must stay 0 opens / 0 dwell (zero cross-bleed!)
    expect(threadB.openCount).toBe(0);
    expect(threadB.dwellSeconds).toBe(0);
    expect(threadB.hasTransactionalBasis).toBe(false);
  });

  it("[Track 2-B] enforces Free (copy+email) vs Paid Pro Alimtalk + transactional basis rules & Inbox UI sheet", async () => {
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");

    // 1) Free broker: prepare_copy_bundle & send_inbox_email succeed; send_inbox_alimtalk blocked with 403 PLAN_UPGRADE_REQUIRED
    const copyRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare_copy_bundle",
          threadId: CLIENT_A_ID,
          buildingId: BUILDING_ID,
          buildingTitle: "강남구 역삼동 근생빌딩",
          clientName: "김매수 대표",
          assetKind: "dealcard",
        }),
      })
    );
    expect(copyRes.status).toBe(200);
    const copyJson = await copyRes.json();
    expect(copyJson.shareUrl).toContain(`/dc/${BUILDING_ID}?token=slk.`);
    expect(copyJson.messageText).toContain("김매수 대표");

    const badEmailRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_email",
          threadId: CLIENT_A_ID,
          buildingId: BUILDING_ID,
          clientName: "김매수 대표",
          clientEmail: "not-an-email",
        }),
      })
    );
    expect(badEmailRes.status).toBe(400);

    const emailRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_email",
          threadId: CLIENT_A_ID,
          buildingId: BUILDING_ID,
          buildingTitle: "강남구 역삼동 근생빌딩",
          clientName: "김매수 대표",
          clientEmail: "kim@alpha.co.kr",
          assetKind: "im",
        }),
      })
    );
    expect(emailRes.status).toBe(200);
    const emailJson = await emailRes.json();
    expect(emailJson.ok).toBe(true);
    expect(emailJson.toEmail).toBe("kim@alpha.co.kr");

    const freeAlimRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_alimtalk",
          threadId: CLIENT_A_ID,
          buildingId: BUILDING_ID,
          clientName: "김매수 대표",
          clientPhone: "010-1111-2222",
          transactionalBasis: "im_request",
        }),
      })
    );
    expect(freeAlimRes.status).toBe(403);
    const freeAlimJson = await freeAlimRes.json();
    expect(freeAlimJson.code).toBe("PLAN_UPGRADE_REQUIRED");

    // 2) Upgrade broker to Pro: missing transactionalBasis blocked with 403 TRANSACTIONAL_BASIS_REQUIRED; valid basis succeeds cleanly without (광고)
    db.user_subscriptions = [{ user_id: BROKER_ID, tier: "pro", status: "active" }];

    const noBasisAlimRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_alimtalk",
          threadId: CLIENT_B_ID,
          buildingId: BUILDING_ID,
          clientName: "박투자 이사",
          clientPhone: "010-3333-4444",
        }),
      })
    );
    expect(noBasisAlimRes.status).toBe(403);
    expect((await noBasisAlimRes.json()).code).toBe("TRANSACTIONAL_BASIS_REQUIRED");

    const proAlimRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_inbox_alimtalk",
          threadId: CLIENT_A_ID,
          buildingId: BUILDING_ID,
          buildingTitle: "강남구 역삼동 근생빌딩",
          clientName: "김매수 대표",
          clientPhone: "010-1111-2222",
          transactionalBasis: "im_request",
          templateId: "TPL_INBOX_IM_APPROVED",
        }),
      })
    );
    expect(proAlimRes.status).toBe(200);
    const proAlimJson = await proAlimRes.json();
    expect(proAlimJson.ok).toBe(true);
    expect(proAlimJson.previewText).not.toContain("(광고)");
    expect(proAlimJson.previewText).toContain("고객 IM 열람 요청");

    // 3) Inbox UI renders channel bar, reaction badge, email, and Free Alimtalk upgrade sheet
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/broker/inbox/actions")) {
        return new Response(
          JSON.stringify({ ok: true, shareUrl: "/im-lite/bld?token=slk.test" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/broker/inbox")) {
        return new Response(
          JSON.stringify({
            ok: true,
            userId: BROKER_ID,
            subscription: { tier: "free", isPaid: false, status: "active" },
            threads: [
              {
                id: CLIENT_A_ID,
                clientName: "김매수 대표",
                clientPhone: "010-1111-2222",
                clientEmail: "kim@alpha.co.kr",
                transactionalBasis: "im_request",
                hasTransactionalBasis: true,
                clientGrade: "VIP",
                buildingTitle: "강남구 역삼동 근생빌딩",
                buildingId: BUILDING_ID,
                latestEvent: "자료 열람",
                updatedAt: "방금",
                openCount: 2,
                dwellSeconds: 75,
                isRead: true,
                status: "active",
                shareToken: "slk.mock",
                shareUrl: `/im-lite/${BUILDING_ID}?token=slk.mock`,
                focusedSections: ["입지·교통"],
                events: [],
              },
            ],
            inventory: [
              {
                buildingId: BUILDING_ID,
                title: "강남구 역삼동 근생빌딩",
                region: "강남구",
                priceBand: "90억대",
                askingPriceManwon: 900000,
                capRatePct: 4.5,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await act(async () => {
      root.render(<InboxWorkspacePage />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    const summaryCard = container.querySelector('[data-testid="inbox-client-summary-card"]');
    const reactionBadge = container.querySelector('[data-testid="inbox-client-reaction-badge"]');
    const channelBar = container.querySelector('[data-testid="inbox-outbound-channel-bar"]');
    const alimBtn = container.querySelector(
      '[data-testid="inbox-send-alimtalk-btn"]'
    ) as HTMLButtonElement;

    expect(summaryCard?.textContent).toContain("kim@alpha.co.kr");
    expect(reactionBadge?.textContent).toContain("열람 2회 · 체류 75초");
    expect(summaryCard?.textContent).toContain("입지·교통");
    expect(channelBar?.textContent).toContain("무료 플랜");

    await act(async () => {
      alimBtn.click();
    });
    const upgradeSheet = container.querySelector('[data-testid="inbox-alimtalk-upgrade-sheet"]');
    expect(upgradeSheet).not.toBeNull();
    expect(upgradeSheet?.textContent).toContain("Pro 플랜");
  });
});
