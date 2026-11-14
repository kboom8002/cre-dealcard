// @vitest-environment jsdom
/**
 * @file src/tests/workspace/zero-mock-real-chain-audit.test.tsx
 * @description Zero-Mock Real-Chain Integration Audit Suite (Axis A ~ Axis E)
 *
 * Why this suite exists:
 * Earlier unit tests mocked `globalThis.fetch` with fake ideal JSON responses, hiding:
 *  - Axis A: Cross-Workspace SSOT disconnects (IM Workspace <-> Buildings <-> Inbox <-> Newsletter Studio)
 *  - Axis B: Vercel Serverless cold-start (`os.tmpdir()` wipe) state loss on link revocation & correction notices
 *  - Axis C: Producer (`POST /api/magazine/issues`) -> Consumer (`MagazineView` & `fetchIMData`) schema mismatches
 *  - Axis D: `F5` refresh state regression after server publish (`localStorage` overwriting `serverPublished` state)
 */
import React, { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextRequest } from "next/server";
import MagazineEditorPage from "@/app/(broker)/broker/magazine-editor/page";
import { MagazineView, type MagazineData } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { fetchIMData } from "@/app/(public)/im-lite/[buildingId]/fetch-im-data";
import {
  saveInboxState,
} from "@/lib/im-lite/quick-generate-store";
import {
  verifyShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from "@/lib/security/share-link-tokens";

function resetQuickImStoreForTests() {
  saveInboxState({
    revokedBuildings: {},
    correctionNotices: {},
    gateDecisions: {},
    callNotes: {},
    customClients: [],
  });
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// ---------------------------------------------------------------------------
// Stateful In-Memory Supabase Emulator (Zero canned route responses)
// ---------------------------------------------------------------------------
interface InMemoryTables {
  activity_events: Array<Record<string, any>>;
  building_ssot_lite: Array<Record<string, any>>;
  document_objects: Array<Record<string, any>>;
  magazine_editions: Array<Record<string, any>>;
  magazine_issues: Array<Record<string, any>>;
  magazine_subscribers: Array<Record<string, any>>;
  broker_clients: Array<Record<string, any>>;
  im_share_links: Array<Record<string, any>>;
  gate_requests: Array<Record<string, any>>;
  profiles: Array<Record<string, any>>;
  broker_profiles: Array<Record<string, any>>;
}

let db: InMemoryTables;
let activeBrokerUser = { id: "00000000-0000-4000-8000-000000000077", email: "lee@credeal.net" };

function resetInMemoryDb() {
  db = {
    activity_events: [],
    building_ssot_lite: [],
    document_objects: [],
    magazine_editions: [],
    magazine_issues: [],
    magazine_subscribers: [],
    broker_clients: [],
    im_share_links: [],
    gate_requests: [
      {
        id: "req-buyer-1",
        building_id: "im-doc-donggyo-77",
        requester_id: null,
        requested_level: 2,
        status: "pending",
        reason: JSON.stringify({
          name: "박매수 상무",
          phone: "010-2222-3333",
          company: "케이리츠자산운용",
          message: "동교동 더파크빌딩 렌트롤 및 상세 수지분석표 열람을 신청합니다.",
        }),
        created_at: "2026-11-10T10:00:00Z",
      },
    ],
    profiles: [
      {
        id: "00000000-0000-4000-8000-000000000077",
        display_name: "이상덕",
        company: "JS 부동산 중개법인",
        phone: "010-3355-5589",
        slug: "js-realty",
        tagline: "마포·홍대 상업용 빌딩 전문",
      },
    ],
    broker_profiles: [
      {
        user_id: "00000000-0000-4000-8000-000000000077",
        name: "이상덕",
        slug: "js-realty",
        company: "JS 부동산 중개법인",
        phone: "010-3355-5589",
        specialty_regions: ["홍대·연남·합정", "마포·공덕"],
      },
    ],
  };
}

function createStatefulSupabaseChain(tableName: string) {
  const filters: Array<(row: Record<string, any>) => boolean> = [];
  let sortCol: string | null = null;
  let sortAsc = true;
  let rowLimit: number | null = null;
  let pendingUpdate: Record<string, any> | null = null;

  const getRows = (): Array<Record<string, any>> => {
    const table = (db as unknown as Record<string, Array<Record<string, any>>>)[tableName];
    return Array.isArray(table) ? table : [];
  };

  const evaluateRows = () => {
    let rows = [...getRows()].filter((r) => filters.every((fn) => fn(r)));
    if (pendingUpdate) {
      for (const r of rows) {
        Object.assign(r, pendingUpdate);
      }
    }
    if (sortCol) {
      const col = sortCol;
      rows.sort((a, b) => {
        const va = String(a[col] ?? "");
        const vb = String(b[col] ?? "");
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    if (rowLimit !== null) {
      rows = rows.slice(0, rowLimit);
    }
    return rows;
  };

  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => {
      filters.push((r) => String(r[col] ?? "") === String(val ?? ""));
      return chain;
    },
    neq: (col: string, val: unknown) => {
      filters.push((r) => String(r[col] ?? "") !== String(val ?? ""));
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      const set = new Set((vals || []).map((v) => String(v)));
      filters.push((r) => set.has(String(r[col] ?? "")));
      return chain;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      sortCol = col;
      sortAsc = opts?.ascending !== false;
      return chain;
    },
    limit: (n: number) => {
      rowLimit = n;
      return chain;
    },
    range: () => chain,
    insert: (payload: Record<string, any> | Array<Record<string, any>>) => {
      const items = Array.isArray(payload) ? payload : [payload];
      const table = getRows();
      const inserted = items.map((item, idx) => {
        const row = {
          id: item.id || `${tableName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
          created_at: item.created_at || new Date(Date.now() + table.length * 10).toISOString(),
          updated_at: item.updated_at || new Date(Date.now() + table.length * 10).toISOString(),
          ...item,
        };
        table.push(row);
        return row;
      });
      return {
        select: () => ({
          single: async () => ({ data: inserted[0] ?? null, error: null }),
          maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }),
        }),
        then: (resolve: any) => resolve({ data: inserted, error: null }),
      };
    },
    upsert: (payload: Record<string, any> | Array<Record<string, any>>) => {
      const items = Array.isArray(payload) ? payload : [payload];
      const table = getRows();
      const upserted = items.map((item, idx) => {
        const existingIdx = table.findIndex(
          (r) =>
            (item.id && r.id === item.id) ||
            (item.token && r.token === item.token) ||
            (item.broker_id && item.edition_label && r.broker_id === item.broker_id && r.edition_label === item.edition_label)
        );
        const row = {
          id:
            item.id ||
            (existingIdx >= 0 ? table[existingIdx].id : `${tableName}-${Date.now()}-${idx}`),
          created_at:
            existingIdx >= 0
              ? table[existingIdx].created_at
              : item.created_at || new Date(Date.now() + table.length * 10).toISOString(),
          updated_at: new Date(Date.now() + table.length * 10).toISOString(),
          ...(existingIdx >= 0 ? table[existingIdx] : {}),
          ...item,
        };
        if (existingIdx >= 0) {
          table[existingIdx] = row;
        } else {
          table.push(row);
        }
        return row;
      });
      return {
        select: () => ({
          single: async () => ({ data: upserted[0] ?? null, error: null }),
          maybeSingle: async () => ({ data: upserted[0] ?? null, error: null }),
        }),
        then: (resolve: any) => resolve({ data: upserted, error: null }),
      };
    },
    update: (patch: Record<string, any>) => {
      pendingUpdate = patch;
      return chain;
    },
    maybeSingle: async () => {
      const rows = evaluateRows();
      return { data: rows[0] ?? null, error: null };
    },
    single: async () => {
      const rows = evaluateRows();
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "Row not found" } };
    },
    then: (resolve: any) => {
      const rows = evaluateRows();
      return resolve({ data: rows, count: rows.length, error: null });
    },
  };

  return chain;
}

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: vi.fn(async () => ({
    user: activeBrokerUser,
    role: "broker",
    error: null,
  })),
}));

vi.mock("@/lib/magazine/authz", () => ({
  requireBrokerContext: vi.fn(async () => ({
    ctx: {
      userId: activeBrokerUser.id,
      slug: "js-realty",
      displayName: "이상덕",
      brokerKeys: [activeBrokerUser.id, "js-realty"],
    },
    error: null,
  })),
  assertOwnsRow: vi.fn(() => true),
  notFoundResponse: () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
  jsonError: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ error: { code, message } }), { status }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: { id: activeBrokerUser.id, email: activeBrokerUser.email } },
        })),
      },
    },
    from: (table: string) => createStatefulSupabaseChain(table),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/broker/magazine-editor",
  useSearchParams: () => new URLSearchParams(),
}));

describe("Zero-Mock Real-Chain Integration Audit Suite (Axis A ~ Axis E)", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    window.localStorage.clear();
    resetInMemoryDb();
    resetQuickImStoreForTests();
    resetShareLinkTokenStoreForTests();

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

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Axis A: Cross-Workspace SSOT Sync (IM Workspace -> Buildings -> Inbox -> Newsletter Studio)
  // ═══════════════════════════════════════════════════════════════════════════
  it("[Axis A] synchronizes IM Workspace deal creation and Inbox VIP subscriber registration into Newsletter Studio even after a serverless cold-start cache wipe", async () => {
    const { PATCH: patchWorkspaceSummary } = await import("@/app/api/broker/workspace/summary/route");
    const { GET: getBuildings } = await import("@/app/api/broker/buildings/route");
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");
    const { GET: getInbox } = await import("@/app/api/broker/inbox/route");
    const { GET: getEditions } = await import("@/app/api/magazine/editions/route");

    // Step 1: Broker publishes a deal in ② IM 문서 만들기 (/broker/w/im)
    const imUpsertReq = new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_im",
        buildingId: "im-doc-donggyo-77",
        brokerProfile: {
          displayName: "이상덕",
          company: "JS 부동산 중개법인",
          phone: "010-3355-5589",
          slug: "js-realty",
        },
        imItem: {
          id: "im-doc-donggyo-77",
          buildingId: "im-doc-donggyo-77",
          title: "마포구 동교동 더파크빌딩",
          address: "서울특별시 마포구 동교동 189-6",
          askingPriceManwon: 770000,
          landAreaSqm: 244.6,
          gfaSqm: 696.97,
          zoning: "제2종일반주거지역",
          completionDate: "1991-06-21",
          grossYieldPct: 4.8,
          capRatePct: 4.8,
          occupancyPct: 100,
          investmentPosture: "core_income",
          status: "published",
          axiosHighlights: [
            "홍대입구역 도보 4분 경의선숲길 코너 우량 빌딩",
            "전 층 우량 임차인 100% 임대 완료 (보증금 2억 / 월세 2,850만)",
          ],
          rentRoll: [
            {
              id: "r1",
              floor: "1F",
              unit: "101호",
              use: "그랑핸드 플래그십",
              areaSqm: 140,
              depositManwon: 10000,
              monthlyRentManwon: 1500,
              maintenanceManwon: 100,
              status: "occupied",
            },
          ],
        },
      }),
    });
    const imUpsertRes = await patchWorkspaceSummary(imUpsertReq);
    expect(imUpsertRes.status).toBe(200);

    // Step 2: Broker registers a VIP client with newsletterSubscribed: true in ④ 소통 관리함 (/broker/w/inbox)
    const addClientReq = new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_client",
        clientName: "최대표",
        clientGrade: "VIP",
        clientPhone: "010-7777-8888",
        budget: "80억",
        preferredRegion: "홍대·연남·합정",
        buildingId: "im-doc-donggyo-77",
        buildingTitle: "마포구 동교동 더파크빌딩",
        newsletterSubscribed: true,
      }),
    });
    const addClientRes = await postInboxAction(addClientReq);
    expect(addClientRes.status).toBe(200);

    // Step 3: Simulate Vercel Serverless Cold Start (wipe all os.tmpdir() & globalThis stores!)
    resetQuickImStoreForTests();
    resetShareLinkTokenStoreForTests();

    // Step 4: Verify GET /api/broker/buildings recovers the published deal from activity_events
    const bldgRes = await getBuildings(new NextRequest("http://localhost:3000/api/broker/buildings"));
    const bldgJson = await bldgRes.json();
    expect(bldgRes.status).toBe(200);
    const matchedDeal = (bldgJson.buildings || []).find((b: any) => b.id === "im-doc-donggyo-77");
    expect(matchedDeal).toBeDefined();
    expect(matchedDeal.building_name).toBe("마포구 동교동 더파크빌딩");
    expect(matchedDeal.sale_price).toBe(770000 * 10000);
    expect(matchedDeal.cap_rate).toBe(2.34);

    // Step 5: Verify GET /api/broker/inbox recovers the VIP client thread after cold start
    const inboxRes = await getInbox(new NextRequest("http://localhost:3000/api/broker/inbox?workspace=1"));
    const inboxJson = await inboxRes.json();
    expect(inboxRes.status).toBe(200);
    const vipThread = (inboxJson.threads || []).find((t: any) => t.clientName === "최대표");
    expect(vipThread).toBeDefined();
    expect(vipThread.clientGrade).toBe("VIP");

    // Step 6: Verify GET /api/magazine/editions?broker_id=me reflects subscriberCount >= 1 & highInterestCount >= 1
    const editionsRes = await getEditions(
      new NextRequest("http://localhost:3000/api/magazine/editions?broker_id=me&type=all")
    );
    const editionsJson = await editionsRes.json();
    expect(editionsRes.status).toBe(200);
    expect(editionsJson.subscriberCount).toBeGreaterThanOrEqual(1);
    expect(editionsJson.highInterestCount).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Axis B: Serverless Cold-Start Resilience for Link Revocation & Correction Notice
  // ═══════════════════════════════════════════════════════════════════════════
  it("[Axis B] enforces share-link revocation and correction notices via Supabase activity_events even when os.tmpdir() is wiped on a new serverless instance", async () => {
    const { PATCH: patchWorkspaceSummary } = await import("@/app/api/broker/workspace/summary/route");
    const { POST: postInboxAction } = await import("@/app/api/broker/inbox/actions/route");

    // 1. Seed IM in activity_events
    await patchWorkspaceSummary(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_im",
          buildingId: "im-doc-donggyo-77",
          imItem: {
            id: "im-doc-donggyo-77",
            buildingId: "im-doc-donggyo-77",
            title: "마포구 동교동 더파크빌딩",
            address: "서울특별시 마포구 동교동 189-6",
            askingPriceManwon: 770000,
            landAreaSqm: 244.6,
            gfaSqm: 696.97,
            grossYieldPct: 4.8,
            capRatePct: 4.8,
            status: "published",
          },
        }),
      })
    );

    // 2. Approve Gate Request -> issue signed token (slk.*)
    const approveRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve_gate",
          threadId: "req-buyer-1",
          buildingId: "im-doc-donggyo-77",
        }),
      })
    );
    const approveJson = await approveRes.json();
    expect(approveRes.status).toBe(200);
    const issuedToken = approveJson.shareToken as string;
    expect(issuedToken).toMatch(/^slk\./);

    // Verify token works before revocation
    const beforeCheck = await verifyShareLinkToken({
      token: issuedToken,
      buildingId: "im-doc-donggyo-77",
    });
    expect(beforeCheck.valid).toBe(true);

    // 3. Broker revokes link AND publishes a correction notice
    const revokeRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_link",
          threadId: "req-buyer-1",
          buildingId: "im-doc-donggyo-77",
          shareToken: issuedToken,
        }),
      })
    );
    expect(revokeRes.status).toBe(200);

    const noticeRes = await postInboxAction(
      new NextRequest("http://localhost:3000/api/broker/inbox/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "correction_notice",
          threadId: "req-buyer-1",
          buildingId: "im-doc-donggyo-77",
          message: "1층 임대료가 월 1,550만 원으로 정정되었습니다.",
        }),
      })
    );
    expect(noticeRes.status).toBe(200);

    // 4. WIPE local/serverless memory & clear im_share_links to simulate cold-start on another Lambda
    resetQuickImStoreForTests();
    resetShareLinkTokenStoreForTests();
    db.im_share_links = [];

    // 5. Verify signed token is STILL rejected via activity_events('link_revoked')
    const afterColdStartCheck = await verifyShareLinkToken({
      token: issuedToken,
      buildingId: "im-doc-donggyo-77",
    });
    expect(afterColdStartCheck.valid).toBe(false);
    expect(afterColdStartCheck.reason).toBe("revoked");

    // 6. Verify fetchIMData with revoked token returns null (triggers revoked-im-screen)
    const blockedDoc = await fetchIMData("im-doc-donggyo-77", undefined, null, {
      token: issuedToken,
    });
    expect(blockedDoc).toBeNull();

    // 7. Verify fetchIMData without token carries isRevoked=true and correctionNotice from activity_events
    const overlayDoc = (await fetchIMData("im-doc-donggyo-77")) as any;
    expect(overlayDoc).not.toBeNull();
    expect(overlayDoc.isRevoked).toBe(true);
    expect(overlayDoc.correctionNotice?.message).toBe(
      "1층 임대료가 월 1,550만 원으로 정정되었습니다."
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Axis C: Producer -> Consumer 1:1 Parity (POST /api/magazine/issues -> MagazineView -> Mobile IM)
  // ═══════════════════════════════════════════════════════════════════════════
  it("[Axis C] publishes a newsletter via real POST /api/magazine/issues and renders MagazineView + Mobile IM with zero duplication, zero gossip, and valid /im-lite CTA", async () => {
    const { PATCH: patchWorkspaceSummary } = await import("@/app/api/broker/workspace/summary/route");
    const { POST: postMagazineIssue } = await import("@/app/api/magazine/issues/route");
    const { GET: getPublicImLite } = await import("@/app/api/public/im-lite/[buildingId]/route");

    // 1. Broker creates & publishes deal in IM Workspace
    await patchWorkspaceSummary(
      new NextRequest("http://localhost:3000/api/broker/workspace/summary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_im",
          buildingId: "im-doc-donggyo-77",
          brokerProfile: {
            displayName: "이상덕",
            company: "JS 부동산 중개법인",
            phone: "010-3355-5589",
            slug: "js-realty",
          },
          imItem: {
            id: "im-doc-donggyo-77",
            buildingId: "im-doc-donggyo-77",
            title: "마포구 동교동 더파크빌딩",
            address: "서울특별시 마포구 동교동 189-6",
            askingPriceManwon: 770000,
            landAreaSqm: 244.6,
            gfaSqm: 696.97,
            grossYieldPct: 4.8,
            capRatePct: 4.8,
            status: "published",
          },
        }),
      })
    );

    // Simulate cold start so POST /api/magazine/issues must hydrate the deal from Supabase activity_events!
    resetQuickImStoreForTests();

    // 2. Broker publishes newsletter via real POST /api/magazine/issues
    const publishReq = new NextRequest("http://localhost:3000/api/magazine/issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "2026-11",
        year: 2026,
        month: 11,
        headline: "2026년 11월 홍대·연남 핵심 수익형 빌딩 시장 리포트",
        summary: "금리 인하 기대감 속 마포구 역세권 우량 근생빌딩 매수세 유입 분석",
        briefingTitle: "홍대·연남 권역 꼬마빌딩 수익률 및 거래 동향",
        briefingBody:
          "연남동 및 동교동 핵심 상권의 공실률이 빠르게 하락하며 보증금 차감 기준 4.5% 이상의 안정적인 임대수익률을 기록하고 있습니다.",
        featuredDealIds: ["im-doc-donggyo-77"],
        featuredDeals: [], // Force server-side DB hydration!
        dealComments: {
          "im-doc-donggyo-77": "경의선숲길 코너 전 층 우량 임차인 100% 임대 완료 매물",
        },
        preferredRegions: ["홍대·연남·합정", "마포·공덕"],
        preferredChannels: ["commercial_market", "policy_tax_finance", "reits_pf_finance"],
        sections: [
          { id: "briefing", enabled: true },
          { id: "featured_deals", enabled: true },
          { id: "news_curation", enabled: true },
          { id: "market_data", enabled: false },
        ],
      }),
    });

    const publishRes = await postMagazineIssue(publishReq);
    const publishJson = await publishRes.json();
    expect(publishRes.status).toBe(200);
    expect(publishJson.ok).toBe(true);
    expect(db.magazine_editions.length).toBe(1);

    const savedEdition = db.magazine_editions[0];
    const consumerData = savedEdition.content as MagazineData;

    // 3. Render the ACTUAL public consumer component <MagazineView /> with savedEdition.content
    await act(async () => {
      root.render(
        <MagazineView
          data={consumerData}
          date="2026-11-10"
          brokerId="js-realty"
          brokerSlug="js-realty"
        />
      );
    });

    const fullText = container.textContent || "";

    // Verify unified 5-part structure (headline + briefingBody) without suppressed summary/briefingTitle clutter
    expect(fullText).toContain("2026년 11월 홍대·연남 핵심 수익형 빌딩 시장 리포트");
    expect(fullText).not.toContain("금리 인하 기대감 속 마포구 역세권 우량 근생빌딩 매수세 유입 분석");
    expect(fullText).not.toContain("홍대·연남 권역 꼬마빌딩 수익률 및 거래 동향");
    const briefingOccurrences = fullText.split(
      "연남동 및 동교동 핵심 상권의 공실률이 빠르게 하락하며"
    ).length - 1;
    expect(briefingOccurrences).toBe(1);
    expect(container.querySelector("nav[data-magazine-bottom-bar]")).toBeNull();
    expect(container.querySelector('[data-testid="minimal-subscribe-optin"]')).not.toBeNull();

    // Verify featured deal hydrated from DB and rendered with real title, price, comment, and /im-lite CTA
    expect(fullText).toContain("마포구 동교동 더파크빌딩");
    expect(fullText).toContain("77억");
    expect(fullText).toContain("경의선숲길 코너 전 층 우량 임차인 100% 임대 완료 매물");

    const dealCtaLink = container.querySelector(
      'a[href="/im-lite/im-doc-donggyo-77"]'
    ) as HTMLAnchorElement | null;
    expect(dealCtaLink).not.toBeNull();

    // Verify AXIOS 2-line post-it cards rendered with zero non-CRE gossip
    const postitCards = container.querySelectorAll('[data-testid="axios-postit-card"]');
    expect(postitCards.length).toBe(5);
    const postitTitles = container.querySelectorAll('[data-testid="axios-postit-title"]');
    expect(postitTitles.length).toBe(5);
    const postitBriefs = container.querySelectorAll('[data-testid="axios-postit-brief"]');
    expect(postitBriefs.length).toBe(5);
    expect(fullText).not.toMatch(/반도체|OpenAI|사설|대통령|야당|여당/i);

    // 4. Follow the CTA link (/im-lite/im-doc-donggyo-77) as an anonymous customer
    const customerImDoc = await fetchIMData("im-doc-donggyo-77");
    expect(customerImDoc).not.toBeNull();
    expect(customerImDoc?.fullName).toBe("마포구 동교동 더파크빌딩");
    expect(customerImDoc?.priceBand).toBe("70~80억");
    expect(
      (customerImDoc as any)?.basicImDocument?.facts?.transaction?.askingPriceKrw
    ).toBe(7_700_000_000);

    const apiImRes = await getPublicImLite(
      new NextRequest("http://localhost:3000/api/public/im-lite/im-doc-donggyo-77"),
      { params: Promise.resolve({ buildingId: "im-doc-donggyo-77" }) }
    );
    const apiImJson = await apiImRes.json();
    expect(apiImRes.status).toBe(200);
    expect(apiImJson.ok).toBe(true);
    expect(apiImJson.data.fullName).toBe("마포구 동교동 더파크빌딩");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Axis D: State Rehydration & F5 Refresh Round-Trip Lifecycle Defense
  // ═══════════════════════════════════════════════════════════════════════════
  it("[Axis D] preserves '서버 발행 완료' state and dealComments across F5 page remount after publishing to server", async () => {
    const { GET: getEditions } = await import("@/app/api/magazine/editions/route");
    const { GET: getBuildings } = await import("@/app/api/broker/buildings/route");
    const { POST: postMagazineIssue } = await import("@/app/api/magazine/issues/route");

    // Wire globalThis.fetch directly to the real Next.js Route Handlers
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const urlStr = typeof input === "string" ? input : input.toString();
      const fullUrl = urlStr.startsWith("http") ? urlStr : `http://localhost:3000${urlStr}`;
      const method = init?.method || "GET";
      const req = new NextRequest(fullUrl, {
        method,
        headers: init?.headers as HeadersInit | undefined,
        body: init?.body as BodyInit | null | undefined,
      });

      if (fullUrl.includes("/api/magazine/editions")) {
        return getEditions(req);
      }
      if (fullUrl.includes("/api/broker/buildings")) {
        return getBuildings(req);
      }
      if (fullUrl.includes("/api/magazine/issues") && method === "POST") {
        return postMagazineIssue(req);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await act(async () => {
      root.render(<MagazineEditorPage />);
    });

    // Enter headline in Step 1
    const headlineInput = container.querySelector(
      "#newsletter-headline-input"
    ) as HTMLInputElement;
    expect(headlineInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(headlineInput, "2026년 11월 마포·홍대 프리미엄 빌딩 뉴스레터");
      headlineInput.dispatchEvent(new Event("input", { bubbles: true }));
      headlineInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Before server publish, data-local-draft-mode must be 'local_only'
    const wrapperBefore = container.querySelector("[data-local-draft-mode]");
    expect(wrapperBefore?.getAttribute("data-local-draft-mode")).toBe("local_only");

    // Click primary send/publish button
    const publishBtn = container.querySelector(
      '[data-testid="newsletter-primary-send-btn"]'
    ) as HTMLButtonElement;
    expect(publishBtn).not.toBeNull();

    await act(async () => {
      publishBtn.click();
    });

    const wrapperAfterPublish = container.querySelector("[data-local-draft-mode]");
    expect(wrapperAfterPublish?.getAttribute("data-local-draft-mode")).toBe("none");
    const sendTabAfterPublish = container.querySelector('[data-testid="step-tab-send"]');
    expect(sendTabAfterPublish?.textContent).toContain("완료");

    // Simulate F5 Browser Refresh by unmounting and remounting MagazineEditorPage
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<MagazineEditorPage />);
    });

    // After F5 remount, headline AND published status (localStorageMode='none', send tab '완료') must remain intact!
    const headlineAfterReload = container.querySelector(
      "#newsletter-headline-input"
    ) as HTMLInputElement;
    expect(headlineAfterReload.value).toBe("2026년 11월 마포·홍대 프리미엄 빌딩 뉴스레터");

    const wrapperAfterReload = container.querySelector("[data-local-draft-mode]");
    expect(wrapperAfterReload?.getAttribute("data-local-draft-mode")).toBe("none");
    const sendTabAfterReload = container.querySelector('[data-testid="step-tab-send"]');
    expect(sendTabAfterReload?.textContent).toContain("완료");
  });
});
