/**
 * Wave 2 Track C SSOT Regression Suite
 * Covers:
 *  - A2-02: imUrl emission strictly requires hasIm === true && UUID building ID (never /im-lite/bld-...)
 *  - A2-06: 4-way GFA key unification (gfaSqm, total_gross_area_m2, total_gross_area_sqm, total_floor_area_sqm, basicImDoc) + 3.305785 pyeong constant
 *  - A2-07: Broker custom headline preservation over `${areaSignal} ${assetType}` overwrite
 *  - A2-08: Posture-driven area priority (`income`/`owner_occupied` -> 연면적 X평, `development`/`value_add` -> 토지 X평) across editor, publish API, and MagazineView
 *  - A6-04: Sticky draft issueDate (`2026-11-15`) eliminated on editor resume/clone and server initial publish while preserving already-published correction dates
 *  - A6-05: Cadence-aware displayDateLabel & canonicalUrlDate (`published_at` KST over stale draft `issueDate`) across viewer, archive, and OG model
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { createFakeDb, filterRows, rowVisibleTo, type FakeCall } from "./magazine/authz-fake-db";

const BROKER_UID = "11111111-1111-4111-8111-111111111111";
const UUID_INCOME_BLDG = "22222222-2222-4222-8222-222222222222";
const UUID_DEV_BLDG = "33333333-3333-4333-8333-333333333333";
const UUID_NO_IM_BLDG = "44444444-4444-4444-8444-444444444444";

const h = vi.hoisted(() => ({
  db: null as unknown as { client: unknown; calls: FakeCall[] },
  quickRecords: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/script", () => ({ default: () => null }));
vi.mock("@/hooks/use-magazine-analytics", () => ({
  useMagazineAnalytics: () => ({
    trackSectionView: vi.fn(),
    trackSection: vi.fn(),
    trackClick: vi.fn(),
    trackInteraction: vi.fn(),
  }),
}));
vi.mock("@/components/magazine/LazyIslands", async () => {
  const roi = await import("@/components/magazine/RoiIsland");
  const fwd = await import("@/components/magazine/ForwardSection");
  return { LazyRoiCalculator: roi.default, LazyForwardSection: fwd.ForwardSection };
});
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => h.db.client }));
vi.mock("@/lib/magazine/authz", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/magazine/authz")>();
  return {
    ...actual,
    requireBrokerContext: async () => ({
      ctx: {
        userId: BROKER_UID,
        slug: "gangnam-ace",
        displayName: "김에이스",
        brokerKeys: ["gangnam-ace", BROKER_UID],
      },
      error: null,
    }),
  };
});
vi.mock("@/lib/im-lite/quick-generate-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/im-lite/quick-generate-store")>();
  return {
    ...actual,
    listAllQuickImRecords: () => h.quickRecords,
    resolveOrSynthesizeQuickImRecord: async (id: string) =>
      h.quickRecords.find((r) => r.buildingId === id) ?? null,
  };
});

import { todayKst } from "@/lib/magazine/kst";
import {
  SQM_PER_PYEONG,
  resolveCanonicalAreaLabel,
  resolveCanonicalDealHeadline,
  sqmToRoundedPyeong,
} from "@/lib/deal-card/canonical-summary";
import {
  parseCadenceFromEdition,
  resolveEditionPublicDateAndHeader,
} from "@/lib/magazine/edition-public-date";
import { buildSelectedDealSnapshots } from "@/app/(broker)/broker/magazine-editor/_lib/edition-payload";
import {
  buildSafePublicUrl,
  mapBuildingRowsToAssignableDeals,
  mapServerEditionRowToSummary,
} from "@/app/(broker)/broker/magazine-editor/_components/magazine-workspace-types";
import {
  parseHydratedDraftData,
  resolveAppliedEditionFields,
} from "@/app/(broker)/broker/magazine-editor/_lib/edition-bootstrap";
import { buildClonedEditionState } from "@/app/(broker)/broker/magazine-editor/_lib/edition-helpers";
import {
  buildArchiveEntries,
  mergeEditionContent,
} from "@/lib/magazine/public-page-data";
import { buildImageModel } from "@/lib/magazine/og-image-data";
import { MagazineView } from "@/app/(magazine)/magazine/[brokerId]/[date]/magazine-view";
import { POST as POST_ISSUES } from "@/app/api/magazine/issues/route";
import { POST as POST_PUBLISH } from "@/app/api/magazine/editions/[id]/publish/route";

type Row = Record<string, unknown>;

describe("Wave 2 Track C: Newsletter Metric/Posture SSOT & Issue Date/Cadence SSOT", () => {
  let editionRows: Row[] = [];
  let buildingRows: Row[] = [];
  let documentRows: Row[] = [];

  beforeEach(() => {
    editionRows = [];
    buildingRows = [];
    documentRows = [];
    h.quickRecords = [];

    h.db = createFakeDb((call: FakeCall) => {
      if (call.table === "broker_profiles") {
        return {
          data: {
            user_id: BROKER_UID,
            slug: "gangnam-ace",
            name: "김에이스",
            office_address: "서울특별시 강남구 테헤란로 152",
            office_reg_number: "11680-2024-00011",
            representative_name: "김에이스",
            specialty_regions: ["강남"],
            specialty_assets: ["꼬마빌딩"],
            is_public: true,
          },
        };
      }
      if (call.table === "profiles") {
        return {
          data: {
            id: BROKER_UID,
            display_name: "김에이스",
            company: "에이스공인중개사사무소",
            phone: "010-1234-5678",
          },
        };
      }
      if (call.table === "building_ssot_lite") {
        return { data: filterRows(buildingRows, call) };
      }
      if (call.table === "document_objects") {
        return { data: filterRows(documentRows, call) };
      }
      if (call.table === "magazine_editions") {
        if (call.op === "insert") {
          const newRow = {
            id: `ed-${editionRows.length + 1}`,
            created_at: "2026-11-15T01:00:00.000Z",
            updated_at: null,
            ...(call.payload as Row),
          };
          editionRows.push(newRow);
          return { data: newRow };
        }
        if (call.op === "update") {
          const found = rowVisibleTo(editionRows, call);
          if (!found) return { data: null };
          const merged = { ...found, ...(call.payload as Row) };
          Object.assign(found, merged);
          return { data: merged };
        }
        if (call.op === "select" && call.filters.some((f) => f[0] === "eq" && f[1] === "id")) {
          const found = rowVisibleTo(editionRows, call);
          return { data: found ? { ...found } : null };
        }
        return { data: filterRows(editionRows, call) };
      }
      if (call.table === "magazine_issues") {
        return { error: null };
      }
      return { data: [] };
    });
  });

  // ── A2-02: imUrl UUID + hasIm guard ─────────────────────────────────────────
  it("A2-02: never emits imUrl for non-UUID building IDs (bld-...) or deals without an IM document", () => {
    const snapshots = buildSelectedDealSnapshots(
      ["bld-nonuuid-1", UUID_NO_IM_BLDG, UUID_INCOME_BLDG],
      [
        {
          id: "bld-nonuuid-1",
          title: "논현역 코너 사옥",
          assetType: "업무시설",
          address: "서울 강남구 논현동",
          price: "120억",
          yield: "4.8%",
          photoUrl: null,
          hasIm: true,
        },
        {
          id: UUID_NO_IM_BLDG,
          title: "역삼역 수익형 빌딩",
          assetType: "제2종근린생활시설",
          address: "서울 강남구 역삼동",
          price: "90~100억",
          yield: "4.5%",
          photoUrl: null,
          hasIm: false,
        },
        {
          id: UUID_INCOME_BLDG,
          title: "테헤란로 역세권 꼬마빌딩",
          assetType: "근린생활시설",
          address: "서울 강남구 역삼동",
          price: "140~160억",
          yield: "5.1%",
          photoUrl: null,
          hasIm: true,
        },
      ],
      {},
    );

    expect(snapshots[0].imUrl).toBeUndefined();
    expect(snapshots[0].hasIm).toBe(false);
    expect(snapshots[1].imUrl).toBeUndefined();
    expect(snapshots[2].hasIm).toBe(true);
    expect(snapshots[2].imUrl).toBe(`/im-lite/${UUID_INCOME_BLDG}`);
  });

  // ── A2-07 + A2-06 + A2-08: Editor mapping & snapshot building ──────────────
  it("A2-06/07/08: maps m2 with 3.305785, honors posture area priority, and preserves custom broker headlines", () => {
    const mapped = mapBuildingRowsToAssignableDeals([
      {
        id: UUID_INCOME_BLDG,
        building_name: "서초역 8%대 코너 사옥",
        address: "서울 서초구 서초동 1300-1",
        area_signal: "서초구 서초동",
        asset_type: "근린생활시설",
        main_purpose: "업무시설",
        investment_posture: "income",
        total_gross_area_sqm: 1488.2, // / 3.305785 => 450평
        land_area_m2: 396.69, // / 3.305785 => 120평
        has_im: true,
      },
      {
        id: UUID_DEV_BLDG,
        building_name: "성수동 신축 부지 꼬마빌딩",
        address: "서울 성동구 성수동2가",
        area_signal: "성동구 성수동2가",
        asset_type: "근린생활시설",
        investment_posture: "development",
        grossFloorAreaM2: 661.16, // 200평
        land_area_sqm: 495.87, // 150평
        has_im: false,
      },
    ]);

    expect(SQM_PER_PYEONG).toBe(3.305785);
    expect(sqmToRoundedPyeong(1488.2)).toBe(450);

    // A2-07: custom headline kept, generic 근린생활시설 upgraded to specific main_purpose
    expect(mapped[0].title).toBe("서초역 8%대 코너 사옥");
    expect(mapped[0].assetType).toBe("업무시설");
    // A2-08 Loop 1 (income) -> 연면적 우선
    expect(mapped[0].areaLabel).toBe("연면적 450평");
    // A2-08 Loop 2 (development) -> 토지 우선
    expect(mapped[1].areaLabel).toBe("토지 150평");

    const snaps = buildSelectedDealSnapshots(
      [UUID_INCOME_BLDG, UUID_DEV_BLDG],
      mapped,
      { [UUID_INCOME_BLDG]: "핵심 임차인 장기 임대중" },
    );
    expect(snaps[0].title).toBe("서초역 8%대 코너 사옥");
    expect(snaps[0].posture).toBe("income");
    expect(snaps[0].areaLabel).toBe("연면적 450평");
    expect(snaps[0].imUrl).toBe(`/im-lite/${UUID_INCOME_BLDG}`);

    expect(snaps[1].title).toBe("성수동 신축 부지 꼬마빌딩");
    expect(snaps[1].posture).toBe("development");
    expect(snaps[1].areaLabel).toBe("토지 150평");
    expect(snaps[1].imUrl).toBeUndefined();

    // Verify generic fallback headline only replaces generic placeholders
    expect(
      resolveCanonicalDealHeadline({
        brokerHeadline: "강남구 역삼동 근린생활시설",
        region: "강남구 역삼동",
        assetType: "근린생활시설",
        card4Headline: "테헤란로 역세권 우량 사옥",
      }),
    ).toBe("테헤란로 역세권 우량 사옥");
  });

  // ── A2-02 + A2-06 + A2-08 + A6-04: POST /api/magazine/issues hydration ─────
  it("A2-02/06/08 & A6-04: POST /api/magazine/issues hydrates all GFA keys, posture areaLabel, UUID-only imUrl, and stamps todayKst on unpublished rolling draft publish", async () => {
    const today = todayKst();
    const staleDraftId = "dddddddd-1111-4111-8111-111111111111";

    editionRows.push({
      id: staleDraftId,
      broker_id: BROKER_UID,
      edition_type: "monthly",
      edition_label: "2026-11",
      status: "draft",
      published_at: null,
      content: { issueDate: "2026-11-15", headline: "오래된 초안" },
    });

    buildingRows.push(
      {
        id: UUID_INCOME_BLDG,
        owner_id: BROKER_UID,
        area_signal: "강남구 역삼동",
        asset_type: "근린생활시설",
        price_band: "120~140억",
        layers: {
          building: { investment_posture: "income", main_purpose: "오피스빌딩" },
          physical: { total_floor_area_sqm: 1322.31, land_area_m2: 330.58 }, // 400평, 100평
        },
      },
      {
        id: UUID_DEV_BLDG,
        owner_id: BROKER_UID,
        area_signal: "성동구 성수동",
        asset_type: "근린생활시설",
        price_band: "80~90억",
        layers: {
          building: { investment_posture: "value_add" },
          physical: { land_area_sqm: 528.93 }, // 160평
        },
      },
    );

    documentRows.push({
      id: "doc-income-1",
      owner_id: BROKER_UID,
      building_id: UUID_INCOME_BLDG,
      title: "역삼역 코너 오피스 IM",
      status: "published",
      ssot_summary: {
        investment_posture: "income",
        total_gross_area_sqm: 1322.31,
        land_area_m2: 330.58,
        og_title: "역삼역 도보 3분 코너 오피스 사옥",
      },
    });

    h.quickRecords.push(
      {
        buildingId: "bld-legacy-1",
        ownerId: BROKER_UID,
        buildingName: "비UUID 레거시 사옥",
        address: "서울 마포구 동교동",
        specs: { gfaSqm: 697.52, landAreaM2: 200 }, // 211평
        card4: { posture: "income", use: "근린생활시설", region: "마포구 동교동" },
        basicImDoc: {
          facts: {
            building: { totalGrossAreaSqm: 697.52, landAreaSqm: 200 },
          },
        },
      },
      {
        buildingId: UUID_DEV_BLDG,
        ownerId: BROKER_UID,
        buildingName: "성수동 밸류애드 부지",
        address: "서울 성동구 성수동2가",
        specs: { gfaSqm: 330.58, landAreaM2: 528.93 }, // 100평 GFA, 160평 토지
        card4: { posture: "value_add", use: "개발부지", region: "성동구 성수동", headline: "성수연무장길 밸류애드 부지" },
      },
    );

    const res = await POST_ISSUES(
      new NextRequest("http://localhost:3000/api/magazine/issues", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          editionId: staleDraftId,
          editionType: "monthly",
          slug: "2026-11",
          issueDate: "2026-11-15", // stale sticky draft date from client -> MUST be ignored!
          headline: "11월 강남·성수 핵심 빌딩 분석",
          briefingBody: "수익형과 밸류애드 자산 양극화가 뚜렷합니다.",
          featuredDealIds: [UUID_INCOME_BLDG, UUID_DEV_BLDG, "bld-legacy-1"],
          featuredDeals: [
            { id: UUID_INCOME_BLDG, title: "역삼역 도보 3분 코너 오피스 사옥" },
            { id: UUID_DEV_BLDG, total_gross_area_m2: 330.58 },
            { id: "bld-legacy-1", hasIm: true },
          ],
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();

    // A6-04: initial publish of monthly draft ignores stale 2026-11-15 and stamps todayKst()
    expect(json.issueDate).toBe(today);
    expect(json.content.issueDate).toBe(today);
    expect(json.publicUrl).toContain(`/${today}?edition=${staleDraftId}`);

    const issueUpsert = h.db.calls.find(
      (c) => c.table === "magazine_issues" && c.op === "upsert",
    );
    expect((issueUpsert?.payload as Row)?.issue_date).toBe(today);

    const deals = json.content.featured_deals as Array<Record<string, unknown>>;
    expect(deals).toHaveLength(3);

    // Deal 0 (income + UUID + document_object IM)
    expect(deals[0].posture).toBe("income");
    expect(deals[0].areaLabel).toBe("연면적 400평");
    expect(deals[0].hasIm).toBe(true);
    expect(deals[0].imUrl).toBe(`/im-lite/${UUID_INCOME_BLDG}`);

    // Deal 1 (value_add + UUID + no document_object/basicImDoc)
    expect(deals[1].posture).toBe("value_add");
    expect(deals[1].areaLabel).toBe("토지 160평");
    expect(deals[1].hasIm).toBe(false);
    expect(deals[1].imUrl).toBeUndefined();

    // Deal 2 (non-UUID bld-legacy-1 -> A2-02 blocks fake imUrl, A2-06 still hydrates specs.gfaSqm 697.52 -> 211평!)
    expect(deals[2].areaLabel).toBe("연면적 211평");
    expect(deals[2].hasIm).toBe(false);
    expect(deals[2].imUrl).toBeUndefined();
  });

  // ── A6-04: POST /api/magazine/editions/[id]/publish & correction preservation ──
  it("A6-04: /editions/[id]/publish ignores stale issueDate on initial monthly/weekly publish and preserves existing issueDate on correction", async () => {
    const today = todayKst();
    const draftId = "eeeeeeee-1111-4111-8111-111111111111";
    const pubId = "eeeeeeee-2222-4222-8222-222222222222";

    editionRows.push(
      {
        id: draftId,
        broker_id: BROKER_UID,
        edition_type: "weekly",
        edition_label: "W47-2026",
        status: "draft",
        published_at: null,
        title: "이번 주 주간 브리핑",
        content: {
          schemaVersion: 1,
          format: "simple",
          headline: "이번 주 강남 빌딩 주간 브리핑",
          briefing: "주간 시장 흐름 요약입니다.",
          issueDate: "2026-11-15",
        },
      },
      {
        id: pubId,
        broker_id: BROKER_UID,
        edition_type: "monthly",
        edition_label: "2026-10",
        status: "published",
        published_at: "2026-10-25T03:00:00.000Z",
        title: "10월 발행본",
        content: {
          schemaVersion: 1,
          format: "simple",
          headline: "10월 발행본",
          briefing: "10월 시장 정리입니다.",
          issueDate: "2026-10-25",
        },
      },
    );

    const resInit = await POST_PUBLISH(
      new NextRequest(`https://credeal.net/api/magazine/editions/${draftId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueDate: "2026-11-15" }),
      }),
      { params: Promise.resolve({ id: draftId }) },
    );
    expect(resInit.status).toBe(200);
    const jsonInit = await resInit.json();
    expect(jsonInit.issueDate).toBe(today);
    expect(jsonInit.edition.content.issueDate).toBe(today);
    expect(jsonInit.edition.content.edition_type).toBe("weekly");

    const resFix = await POST_PUBLISH(
      new NextRequest(`https://credeal.net/api/magazine/editions/${pubId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          correction: true,
          payload: {
            content: {
              schemaVersion: 1,
              format: "simple",
              headline: "10월 발행본 정정",
              briefing: "정정된 10월 브리핑입니다.",
            },
          },
        }),
      }),
      { params: Promise.resolve({ id: pubId }) },
    );
    expect(resFix.status).toBe(200);
    const jsonFix = await resFix.json();
    expect(jsonFix.issueDate).toBe("2026-10-25");
  });

  // ── A6-04: Editor resume, duplicate clone, and summary row date handling ────
  it("A6-04: Editor bootstrap/clone refreshes unpublished rolling draft issueDate to todayKst while preserving published issueDate", () => {
    const today = todayKst();

    const draftSummary = mapServerEditionRowToSummary(
      {
        id: "ed-draft-1",
        edition_type: "monthly",
        edition_label: "2026-11",
        title: "미발행 초안",
        status: "draft",
        content: { issueDate: "2026-11-15" },
      },
      "gangnam-ace",
      buildSafePublicUrl,
    );
    const appliedDraft = resolveAppliedEditionFields(draftSummary, "gangnam-ace");
    expect(appliedDraft.issueDateStr).toBe(today);

    const publishedSummary = mapServerEditionRowToSummary(
      {
        id: "ed-pub-1",
        edition_type: "monthly",
        edition_label: "2026-11",
        title: "발행 완료 호",
        status: "published",
        published_at: "2026-11-23T01:00:00.000Z",
        content: { issueDate: "2026-11-15" }, // stale issueDate in legacy row
      },
      "gangnam-ace",
      buildSafePublicUrl,
    );
    expect(publishedSummary.issueDate).toBe("2026-11-23");
    const appliedPublished = resolveAppliedEditionFields(publishedSummary, "gangnam-ace");
    expect(appliedPublished.issueDateStr).toBe("2026-11-23");

    const cloned = buildClonedEditionState(
      publishedSummary,
      (_cadence, baseSlug) => `${baseSlug}-2`,
    );
    expect(cloned.clonedIssueDateStr).toBe(today);

    const parsedLocal = parseHydratedDraftData({
      cadence: "weekly",
      slotSlug: "W47-2026",
      issueDateStr: "2026-11-15",
      serverPublished: false,
    });
    expect(parsedLocal.issueDateStr).toBe(today);
  });

  // ── A2-08 + A6-05: End-to-End MagazineView, Archive, OG Date/Posture SSOT ───
  it("A2-08 & A6-05: resolves cadence-aware public headers, canonical published_at URL dates, OG dateKorean, and renders Loop 1/Loop 2 posture areas in MagazineView", () => {
    const monthlyResolved = resolveEditionPublicDateAndHeader({
      editionType: "monthly",
      editionLabel: "2026-11",
      issueDate: "2026-11-15", // stale draft date must lose to publishedAt
      publishedAt: "2026-11-23T01:00:00.000Z",
    });
    expect(monthlyResolved.canonicalUrlDate).toBe("2026-11-23");
    expect(monthlyResolved.displayDateLabel).toBe("2026년 11월호 · 2026.11.23 발행");

    const weeklyResolved = resolveEditionPublicDateAndHeader({
      editionType: "weekly",
      editionLabel: "W47-2026",
      issueDate: "2026-11-15",
      publishedAt: "2026-11-23T01:00:00.000Z",
    });
    expect(weeklyResolved.canonicalUrlDate).toBe("2026-11-23");
    expect(weeklyResolved.displayDateLabel).toContain("주간호 · 2026.11.23 발행");

    const dailyResolved = resolveEditionPublicDateAndHeader({
      editionType: "daily",
      editionLabel: "2026-11-23",
      publishedAt: "2026-11-23T01:00:00.000Z",
    });
    expect(dailyResolved.canonicalUrlDate).toBe("2026-11-23");
    expect(dailyResolved.displayDateLabel).toBe("2026년 11월 23일 (월)");

    expect(parseCadenceFromEdition(undefined, undefined, "2026-11-2")).toBe("monthly");
    expect(parseCadenceFromEdition(undefined, "special", "2026-11-23")).toBe("daily");

    // Archive entries resolve monthly/weekly labels to published_at KST date
    const archive = buildArchiveEntries(
      [
        {
          id: "11111111-0000-4000-8000-000000000001",
          edition_type: "monthly",
          edition_label: "2026-11",
          title: "11월 월간호",
          published_at: "2026-11-23T02:00:00.000Z",
        },
        {
          id: "11111111-0000-4000-8000-000000000002",
          edition_type: "weekly",
          edition_label: "W47-2026",
          title: "11월 주간호",
          published_at: "2026-11-20T02:00:00.000Z",
        },
      ],
      new Date("2026-11-23T09:00:00.000Z"),
    );
    expect(archive.map((e) => e.date)).toEqual(["2026-11-23", "2026-11-20"]);

    // mergeEditionContent carries edition_label and published_at
    const merged = mergeEditionContent({
      id: "11111111-0000-4000-8000-000000000001",
      edition_type: "monthly",
      edition_label: "2026-11",
      published_at: "2026-11-23T02:00:00.000Z",
      content: { headline: "11월 강남 브리핑" },
    });
    expect(merged.published_at).toBe("2026-11-23T02:00:00.000Z");

    // OG model keeps dateLabel dot format while dateKorean is cadence-aware
    const ogModel = buildImageModel(merged, { name: "김에이스" }, "2026-11-23")!;
    expect(ogModel.dateLabel).toBe("2026.11.23");
    expect(ogModel.dateKorean).toBe("2026년 11월호 · 2026.11.23 발행");

    // Viewer renders canonical monthly header + Loop 1 (income -> 연면적) & Loop 2 (development -> 토지)
    const html = renderToStaticMarkup(
      React.createElement(MagazineView, {
        brokerId: "gangnam-ace",
        brokerSlug: "gangnam-ace",
        date: "2026-11-23",
        data: {
          broker: { name: "김에이스", company: "에이스부동산", phone: "010-1234-5678" },
          kind: "monthly",
          edition_label: "2026-11",
          published_at: "2026-11-23T02:00:00.000Z",
          issueDate: "2026-11-15",
          headline: "11월 강남·성수 포트폴리오",
          briefing: "수익형·개발형 양극화 점검입니다.",
          featured_deals: [
            {
              id: UUID_INCOME_BLDG,
              posture: "income",
              areaSignal: "강남구 역삼동",
              assetType: "업무시설",
              grossFloorAreaM2: 1488.2, // 450평
              landAreaM2: 396.69, // 120평
              priceBand: "140~160억",
            },
            {
              id: UUID_DEV_BLDG,
              posture: "development",
              areaSignal: "성동구 성수동2가",
              assetType: "개발부지",
              grossFloorAreaM2: 661.16, // 200평
              landAreaM2: 495.87, // 150평
              priceBand: "80~90억",
            },
          ],
        },
      }),
    );

    expect(html).toContain("2026년 11월호 · 2026.11.23 발행");
    expect(html).not.toContain("2026년 11월 15일");
    expect(html).toContain("연면적 450평");
    expect(html).toContain("토지 150평");

    // Consistency check on canonical utility directly
    expect(
      resolveCanonicalAreaLabel({
        posture: "development",
        explicitAreaLabel: "연면적 200평",
        gfaSqm: 661.16,
        landSqm: 495.87,
      }),
    ).toBe("토지 150평");
  });
});
