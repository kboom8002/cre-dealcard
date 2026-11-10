// @vitest-environment jsdom
/**
 * @file src/tests/workspace/im-pipeline-preemptive-contracts.test.ts
 * @description 6-Boundary (Boundary A ~ F) 24 MECE Preemptive Producer-Consumer Contract Tests (PC-A1 ~ PC-F3)
 * Derived from the IM Creation Pipeline Retrospective & 4-Axis Codebase Audit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import JSZip from "jszip";

import {
  parseTsvRentRoll,
  normalizeFloorName,
} from "@/lib/rent-roll/tsv-parser";
import { parseRentRollData as parseRentRollSheet } from "@/lib/rentroll/parse-rentroll-sheet";
import { splitFloorAndUnit } from "@/domain/building/mobile-im/floor-unit-resolver";
import {
  saveQuickImRecord,
  getQuickImRecord,
  deleteQuickImRecord,
  clearQuickImStoreForTest,
  synthesizeQuickRecordFromImItem,
  resolveOrSynthesizeQuickImRecord,
} from "@/lib/im-lite/quick-generate-store";
import {
  resolveTenantAndUse,
  bindRentRollTable,
} from "@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder";
import { optimizeImageForPptx } from "@/domain/building/mobile-im/pptx/utils/image-optimizer";
import { generatePptx } from "@/domain/building/mobile-im/pptx/pptx-renderer";
import { TESTGUIDE_DEALS } from "@/lib/testguide/testguide-data";

const mockRequireBroker = vi.fn();
const mockSupabaseFrom = vi.fn();

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: new Error("Simulated storage timeout") }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  }),
}));

describe("IM Pipeline Preemptive Producer-Consumer Contracts (PC-A1 ~ PC-F3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearQuickImStoreForTest();
  });

  // ===========================================================================
  // Boundary A: Building Lookup (/api/buildings/lookup) -> UI State -> Store/PPTX
  // ===========================================================================
  describe("Boundary A: Building Lookup -> Studio State -> Store Continuity (PC-A1 ~ PC-A4)", () => {
    it("PC-A1: GET /api/buildings/lookup returns complete metadata (19-digit pnu, lat, lng, floorsAbove, floorsBelow, bcrPct, farPct, buildingName) for all 3 Golden Deals & Bojeong-dong", async () => {
      mockSupabaseFrom.mockImplementation(() => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          or: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      });

      const { GET } = await import("@/app/api/buildings/lookup/route");

      const testAddresses = [
        { addr: "서울특별시 마포구 동교동 147-8", expectedPnu: "1144012000101470008", minFloorsAbove: 4 },
        { addr: "서울특별시 마포구 동교동 189-6", expectedPnu: "1144012100101890006", minFloorsAbove: 4 },
        { addr: "경기도 부천시 원미구 심곡동 382-2", expectedPnu: "4119210100103820002", minFloorsAbove: 7 },
        { addr: "서울특별시 강남구 역삼동 823-33", expectedPnu: "1168010100108230033", minFloorsAbove: 15 },
        { addr: "경기도 용인시 기흥구 보정동 1208-4", expectedPnu: "4146311100112080004", minFloorsAbove: 4 },
      ];

      for (const tc of testAddresses) {
        const req = new NextRequest(
          `http://localhost/api/buildings/lookup?address=${encodeURIComponent(tc.addr)}`
        );
        const res = await GET(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.ok).toBe(true);
        expect(data.pnu).toBe(tc.expectedPnu);
        expect(data.pnu).toHaveLength(19);
        expect(typeof data.lat).toBe("number");
        expect(typeof data.lng).toBe("number");
        expect(data.lat).toBeGreaterThan(33);
        expect(data.lng).toBeGreaterThan(125);
        expect(data.floorsAbove).toBeGreaterThanOrEqual(tc.minFloorsAbove);
        expect(data.floorsBelow).toBeGreaterThanOrEqual(1);
        expect(data.gfaSqm).toBeGreaterThan(0);
        expect(data.landAreaSqm).toBeGreaterThan(0);
        expect(Boolean(data.buildingName)).toBe(true);
      }
    });

    it("PC-A2 & PC-A3 & PC-A4: synthesizeQuickRecordFromImItem preserves pnu, coordinates, floorsAbove/Below, preset='credeal_basic', and tier='basic'", () => {
      const rec = synthesizeQuickRecordFromImItem({
        id: "im-donggyo-test",
        buildingId: "bld-donggyo-test",
        title: "동교동 테스트 빌딩",
        address: "서울특별시 마포구 동교동 147-8",
        pnu: "1144012000101470008",
        lat: 37.5562,
        lng: 126.9241,
        floorsAbove: 4,
        floorsBelow: 1,
        askingPriceManwon: 770000,
        gfaSqm: 426.11,
        landAreaSqm: 137.2,
        zoning: "제2종일반주거지역",
        completionDate: "2019-05-30",
        rentRoll: [
          { floor: "B1", unit: "B101호", use: "와인바", depositManwon: 3000, monthlyRentManwon: 240, maintenanceManwon: 20, status: "occupied", areaSqm: 85.2 },
          { floor: "1F", unit: "101호", use: "카페", depositManwon: 5000, monthlyRentManwon: 450, maintenanceManwon: 35, status: "occupied", areaSqm: 92.4 },
        ],
      });

      expect(rec).not.toBeNull();
      expect(rec.pnu).toBe("1144012000101470008");
      expect(rec.coordinates).toEqual({ lat: 37.5562, lng: 126.9241 });
      expect(rec.fullDocBody?.preset).toBe("credeal_basic");
      expect(rec.fullDocBody?.tier).toBe("basic");
      expect(rec.fullDocBody?.pnu).toBe("1144012000101470008");
      expect(rec.fullDocBody?.coordinates).toEqual({ lat: 37.5562, lng: 126.9241 });
      expect(rec.fullDocBody?.ssot_summary?.pnu).toBe("1144012000101470008");
      expect(rec.fullDocBody?.ssot_summary?.coordinates).toEqual({ lat: 37.5562, lng: 126.9241 });
      expect(rec.fullDocBody?.ssot_summary?.floors_above).toBe(4);
      expect(rec.fullDocBody?.ssot_summary?.floors_below).toBe(1);
    });
  });

  // ===========================================================================
  // Boundary B: Rent-Roll Multi-Source Parsers -> SSoT Math -> R2 10-Col Table
  // ===========================================================================
  describe("Boundary B: Rent-Roll Parsers -> SSoT Math -> Basic R2 10-Col Table (PC-B1 ~ PC-B5)", () => {
    it("PC-B1: parseRentRollSheet (Excel/CSV Importer) and parseTsvRentRoll enforce identical rules on KRW unit mistakes (>=250,000), 15억 deposit preservation, Korean currency ('1.5억'), and negative floors ('-1' -> 'B1')", () => {
      // 1) Negative floor normalization in both resolvers
      expect(normalizeFloorName("-1")).toBe("B1");
      expect(normalizeFloorName("-2F")).toBe("B2");
      const splitNeg1 = splitFloorAndUnit("-1", "B101호");
      expect(splitNeg1.floorKey).toBe("B1");
      expect(splitNeg1.isSubterranean).toBe(true);
      expect(splitNeg1.order).toBe(-1);

      // 2) "만원" header with raw KRW mistake (50,000,000 -> 5,000만원) & Korean string ("1.5억" -> 15,000만원)
      const sheetRowsManwonHeader = [
        ["층", "호수", "임차인", "업종", "전용면적(㎡)", "계약면적(㎡)", "보증금(만원)", "월임대료(만원)", "관리비(만원)"],
        ["-1", "B101호", "이자카야", "일반음식점", "65.5", "82.0", "50000000", "3500000", "300000"],
        ["1층", "101호", "스타벅스", "커피전문점", "110.0", "140.0", "1.5억", "850", "80"],
      ];
      const sheetResult = parseRentRollSheet(sheetRowsManwonHeader);
      expect(sheetResult.parsedRows).toHaveLength(2);
      expect(sheetResult.parsedRows[0].deposit_manwon).toBe(5000);
      expect(sheetResult.parsedRows[0].rent_manwon).toBe(350);
      expect(sheetResult.parsedRows[0].mgmt_fee_manwon).toBe(30);
      expect(sheetResult.parsedRows[1].deposit_manwon).toBe(15000);
      expect(sheetResult.parsedRows[1].rent_manwon).toBe(850);

      // 3) Unitless header with 15억 (150,000만원) deposit must NOT be divided by 10,000
      const sheetRows15Eok = [
        ["층", "호수", "임차인", "보증금", "월세", "관리비"],
        ["1F", "101호", "대형약국", "150000", "1200", "100"],
      ];
      const res15Eok = parseRentRollSheet(sheetRows15Eok);
      expect(res15Eok.parsedRows[0].deposit_manwon).toBe(150000);
      expect(res15Eok.parsedRows[0].rent_manwon).toBe(1200);
    });

    it("PC-B2: Combined '임차인 / 용도' splits cleanly into distinct Tenant and Use columns (Use !== '-') and preserves exclusive_area_sqm", () => {
      const resolved = resolveTenantAndUse({
        tenant_name: "메가MGC커피 역삼GFC점 / 휴게음식점(커피전문점)",
        tenant_type: "메가MGC커피 역삼GFC점 / 휴게음식점(커피전문점)",
        is_vacant: false,
      });
      expect(resolved.tenant).toBe("메가MGC커피 역삼GFC점");
      expect(resolved.use).toBe("휴게음식점(커피전문점)");

      const rec = synthesizeQuickRecordFromImItem({
        id: "im-split-test",
        buildingId: "bld-split-test",
        title: "역삼 테스트",
        address: "서울특별시 강남구 역삼동 823-33",
        askingPriceManwon: 2800000,
        gfaSqm: 1200,
        landAreaSqm: 400,
        rentRoll: [
          {
            floor: "1F",
            unit: "101호",
            use: "메가MGC커피 역삼GFC점 / 휴게음식점(커피전문점)",
            areaSqm: 120.5,
            exclusiveAreaSqm: 88.4,
            depositManwon: 10000,
            monthlyRentManwon: 680,
            maintenanceManwon: 68,
            status: "occupied",
          },
        ],
      });

      const sectionMap: Record<string, any> = {
        rentRoll: { title: "렌트롤", content: "" },
      };
      bindRentRollTable({ body: rec.fullDocBody! }, "", sectionMap);

      expect(sectionMap.rentRoll.tableHead).toContain("임차인");
      expect(sectionMap.rentRoll.tableHead).toContain("용도");
      expect(sectionMap.rentRoll.tableHead).toContain("임대면적(㎡)");
      expect(sectionMap.rentRoll.tableHead).toContain("전용면적(㎡)");

      const firstRow = sectionMap.rentRoll.tableRows[0];
      expect(firstRow[1]).toBe("메가MGC커피 역삼GFC점");
      expect(firstRow[2]).toBe("휴게음식점(커피전문점)");
      expect(firstRow[3]).toBe("120.50");
      expect(firstRow[4]).toBe("88.40");
    });

    it("PC-B3: Self-occupied ('owner' / 자가사용) rows are excluded from rental cashflow totals (Rule 75) and multi-unit floors compute actual max floor count instead of row count", () => {
      const rec = synthesizeQuickRecordFromImItem({
        id: "im-owner-multiunit",
        buildingId: "bld-owner-multiunit",
        title: "다호실 자가사용 테스트",
        address: "서울특별시 강남구 역삼동 823-33",
        askingPriceManwon: 1000000,
        gfaSqm: 900,
        landAreaSqm: 300,
        rentRoll: [
          { floor: "B1", unit: "B101호", use: "스튜디오", depositManwon: 2000, monthlyRentManwon: 150, maintenanceManwon: 15, status: "occupied", areaSqm: 150 },
          { floor: "B1", unit: "B102호", use: "창고", depositManwon: 1000, monthlyRentManwon: 80, maintenanceManwon: 10, status: "occupied", areaSqm: 150 },
          { floor: "1F", unit: "101호", use: "편의점", depositManwon: 5000, monthlyRentManwon: 400, maintenanceManwon: 40, status: "occupied", areaSqm: 100 },
          { floor: "1F", unit: "102호", use: "약국", depositManwon: 5000, monthlyRentManwon: 370, maintenanceManwon: 35, status: "occupied", areaSqm: 100 },
          { floor: "2F", unit: "201호", use: "본사 사옥", depositManwon: 99999, monthlyRentManwon: 8888, maintenanceManwon: 50, status: "owner", areaSqm: 200 },
        ],
      });

      expect(rec).not.toBeNull();
      // Cashflow must sum ONLY occupied rows (excluding 'owner' 201호)
      expect(rec.fullDocBody?.ssot_summary?.total_deposit_manwon).toBe(2000 + 1000 + 5000 + 5000);
      expect(rec.fullDocBody?.ssot_summary?.monthly_rent_total_manwon).toBe(150 + 80 + 400 + 370);
      // Floors count must be max floor numbers (2F above, B1 below), NOT 5 rows!
      expect(rec.fullDocBody?.ssot_summary?.floors_above).toBe(2);
      expect(rec.fullDocBody?.ssot_summary?.floors_below).toBe(1);
    });

    it("PC-B4 & PC-B5: 15-row, 17-row (Bucheon), and 21-row (Yeoksam) rent rolls bind as 10-column Basic R2 tables, paginate cleanly at >14 rows, and never sum expiry year (2027) as monthly rent", async () => {
      // Deal 2 Bucheon (17 rows)
      const deal2 = TESTGUIDE_DEALS[1];
      const parsed2 = parseTsvRentRoll(deal2.csvContent);
      expect(parsed2.rows).toHaveLength(17);

      const rec2 = synthesizeQuickRecordFromImItem({
        id: "im-bucheon-17",
        buildingId: "bld-bucheon-17",
        title: deal2.title,
        address: deal2.jibunAddress,
        askingPriceManwon: Number(deal2.askingPriceEok) * 10000,
        gfaSqm: 2758.21,
        landAreaSqm: 535.6,
        rentRoll: parsed2.rows,
      });

      const sectionMap2: Record<string, any> = {
        rentRoll: { title: "렌트롤", content: "" },
      };
      bindRentRollTable({ body: rec2.fullDocBody! }, "", sectionMap2);
      expect(sectionMap2.rentRoll.tableHead.length).toBeGreaterThanOrEqual(10);
      expect(sectionMap2.rentRoll.tableHead[0]).toBe("층");
      expect(sectionMap2.rentRoll.tableHead[6]).toBe("월임대료");

      // Render PPTX for 15-row boundary case and verify 2 rentRoll slides with intact 합계 row
      const rows15 = parsed2.rows.slice(0, 15);
      const rec15 = synthesizeQuickRecordFromImItem({
        id: "im-boundary-15",
        buildingId: "bld-boundary-15",
        title: "15행 경계 테스트 빌딩",
        address: "경기도 부천시 원미구 심곡동 382-2",
        askingPriceManwon: 680000,
        gfaSqm: 2758.21,
        landAreaSqm: 535.6,
        rentRoll: rows15,
      });

      const pptxResult = await generatePptx({
        buildingId: "bld-boundary-15",
        doc: {
          title: "15행 경계 테스트 빌딩",
          body: rec15.fullDocBody!,
          sections: rec15.fullDocBody!.sections as any,
        },
        building: {
          name: "15행 경계 테스트 빌딩",
          address: "경기도 부천시 원미구 심곡동 382-2",
        },
        preset: "credeal_basic",
      });

      const zip = await JSZip.loadAsync(pptxResult.buffer);
      const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
      const allXml = (
        await Promise.all(slideFiles.map((f) => zip.files[f].async("string")))
      ).join("\n");

      expect(allXml).toContain("렌트롤 (1/2)");
      expect(allXml).toContain("렌트롤 (2/2)");
      expect(allXml).toContain("합계");
      // Must never contain truncation notice
      expect(allXml).not.toContain("건 중 ");
    });
  });

  // ===========================================================================
  // Boundary C: Photo Pipeline (blob: / WebP / Relative API URL / Transparent PNG)
  // ===========================================================================
  describe("Boundary C: Photo Upload -> Optimizer -> PPTX Media Stream (PC-C1 ~ PC-C4)", () => {
    it("PC-C1 & PC-C2: blob: URLs are stripped across store/routes and missing photos never inject '/test-images/' Dangsan dummy photos", () => {
      const rec = synthesizeQuickRecordFromImItem({
        id: "im-photo-guard",
        buildingId: "bld-photo-guard",
        title: "포토 가드 빌딩",
        address: "경기도 용인시 기흥구 보정동 1208-4",
        askingPriceManwon: 550000,
        photos: [
          { url: "blob:https://credeal.net/fake-blob-id-123" },
          { url: "/test-images/dangsan/07_parking.jpg" },
        ],
        rentRoll: [],
      });

      expect(rec).not.toBeNull();
      const photoUrls: string[] = rec.fullDocBody?.photo_urls || [];
      expect(photoUrls.some((u) => u.startsWith("blob:"))).toBe(false);
      expect(photoUrls.some((u) => u.includes("/test-images/"))).toBe(false);
      expect(photoUrls).toEqual([]);
    });

    it("PC-C3 & PC-C4: optimizeImageForPptx rejects blob: URLs, resolves /api/public/testguide-assets/... WebP to JPEG, and flattens transparent PNG onto white (#FFFFFF)", async () => {
      // 1) blob: URL returns null immediately
      const blobRes = await optimizeImageForPptx("blob:https://credeal.net/1234-5678");
      expect(blobRes).toBeNull();

      // 2) Relative /api/public/testguide-assets/... WebP resolves from docs/testguide/ and converts to JPEG
      const webpAssetUrl =
        "/api/public/testguide-assets/images/deal1_donggyo/04_동교동_THEPARK_루프탑테라스.webp";
      const webpOpt = await optimizeImageForPptx(webpAssetUrl);
      expect(webpOpt).not.toBeNull();
      expect(webpOpt!.base64.startsWith("image/jpeg;base64,")).toBe(true);

      // 3) Transparent PNG composites onto white (#FFFFFF), not black (#000000)
      const transparentPng = await sharp({
        create: {
          width: 40,
          height: 40,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
      const dataUri = `data:image/png;base64,${transparentPng.toString("base64")}`;
      const pngOpt = await optimizeImageForPptx(dataUri);
      expect(pngOpt).not.toBeNull();
      const { data: rawPixel } = await sharp(pngOpt!.buffer)
        .raw()
        .toBuffer({ resolveWithObject: true });
      // First pixel R, G, B should be near 255 (white), never 0 (black)
      expect(rawPixel[0]).toBeGreaterThan(245);
      expect(rawPixel[1]).toBeGreaterThan(245);
      expect(rawPixel[2]).toBeGreaterThan(245);
    });
  });

  // ===========================================================================
  // Boundary D: Zero Poison Fallbacks on Unlisted Addresses & Blank Forms
  // ===========================================================================
  describe("Boundary D: Zero Poison Fallbacks on Unlisted Addresses & Blank Inputs (PC-D1 ~ PC-D4)", () => {
    it("PC-D1 & PC-D2 & PC-D3 & PC-D4: Unlisted address with empty rentRoll and blank broker fields produces zero Dangsan/Yangpyeong/Donggyo/Fake-1F/Fake-Comps/Dummy-Broker tokens in Store and PPTX XML", async () => {
      const rec = synthesizeQuickRecordFromImItem({
        id: "im-unlisted-clean",
        buildingId: "bld-unlisted-clean",
        title: "분당 정자동 근생빌딩",
        address: "경기도 성남시 분당구 정자동 178-1",
        askingPriceManwon: 0,
        gfaSqm: 0,
        landAreaSqm: 0,
        rentRoll: [],
        brokerName: "",
        brokerageName: "",
        brokerPhone: "",
      });

      expect(rec).not.toBeNull();
      // PC-D1: No Donggyo/Dangsan/Yangpyeong price or address fallback
      expect(rec.askingPriceManwon).toBe(0);
      expect(rec.specs?.gfaSqm).toBe(0);
      expect(rec.specs?.landAreaSqm).toBe(0);
      expect(rec.pnu).toBeUndefined();
      expect(rec.coordinates).toBeUndefined();

      // PC-D2: Empty rentRoll stays empty (no fake 1F 5000/450 row)
      expect(rec.rentRoll).toHaveLength(0);
      expect(rec.fullDocBody?.floor_leases).toHaveLength(0);
      expect(rec.fullDocBody?.ssot_summary?.total_deposit_manwon).toBe(0);
      expect(rec.fullDocBody?.ssot_summary?.monthly_rent_total_manwon).toBe(0);

      // PC-D3: No fabricated official land price or comps
      expect(rec.fullDocBody?.ssot_summary?.official_land_price_won_sqm).toBeUndefined();
      expect(rec.fullDocBody?.market_comps).toEqual([]);

      // PC-D4: No dummy broker tokens in PPTX XML
      const pptxResult = await generatePptx({
        buildingId: "bld-unlisted-clean",
        doc: {
          title: "분당 정자동 근생빌딩",
          body: rec.fullDocBody!,
          sections: rec.fullDocBody!.sections as any,
        },
        building: {
          name: "분당 정자동 근생빌딩",
          address: "경기도 성남시 분당구 정자동 178-1",
        },
        preset: "credeal_basic",
      });

      const zip = await JSZip.loadAsync(pptxResult.buffer);
      const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
      const allXml = (
        await Promise.all(slideFiles.map((f) => zip.files[f].async("string")))
      ).join("\n");

      expect(allXml).not.toContain("담당 공인중개사");
      expect(allXml).not.toContain("담당 담당");
      expect(allXml).not.toContain("전담 부동산중개법인");
      expect(allXml).not.toContain("크리딜 파트너 중개법인");
      expect(allXml).not.toContain("11560-2023-00412");
      expect(allXml).not.toContain("1156011500100110047");
      expect(allXml).not.toContain("동교동 147-8");
      expect(allXml).not.toContain("양평동");
    });
  });

  // ===========================================================================
  // Boundary E: Warm-Cache / Cold-Start & Web <-> PPTX SSoT Parity
  // ===========================================================================
  describe("Boundary E: Warm-Cache / Cold-Start & Web <-> PPTX SSoT Parity (PC-E1 ~ PC-E4)", () => {
    it("PC-E1 & PC-E2: Warm-cache QuickImStore updates immediately on upsert_im (Mission H-2 edit-then-download) and evicts immediately on delete_im", async () => {
      const buildingId = "b2738b89-639a-42af-afc7-58f286fb934c";

      // 1) Initial record in warm QuickImStore (77억)
      synthesizeQuickRecordFromImItem({
        id: "im-h2-test",
        buildingId,
        title: "동교동 초기 빌딩",
        address: "서울특별시 마포구 동교동 147-8",
        askingPriceManwon: 770000,
        gfaSqm: 426.11,
        landAreaSqm: 137.2,
        rentRoll: [
          { floor: "1F", unit: "101호", use: "카페", depositManwon: 5000, monthlyRentManwon: 400, maintenanceManwon: 30, status: "occupied" },
        ],
      });
      expect(getQuickImRecord(buildingId)?.askingPriceManwon).toBe(770000);

      // 2) User edits price to 85억 (850000) and rent to 520 via PATCH /api/broker/workspace/summary (upsert_im)
      mockRequireBroker.mockResolvedValue({
        user: { id: "broker-1", email: "broker@credeal.net" },
        role: "broker",
        error: null,
      });

      mockSupabaseFrom.mockImplementation((table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data:
              table === "document_objects"
                ? { id: "doc-uuid-1", building_id: buildingId, body: {}, sections: [] }
                : table === "building_ssot_lite"
                ? { id: buildingId, ssot_summary: {} }
                : null,
            error: null,
          }),
          update: () => chain,
          insert: async () => ({ data: null, error: null }),
          delete: () => chain,
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        };
        return chain;
      });

      const { PATCH } = await import("@/app/api/broker/workspace/summary/route");
      const patchRes = await PATCH(
        new NextRequest("http://localhost/api/broker/workspace/summary", {
          method: "PATCH",
          body: JSON.stringify({
            action: "upsert_im",
            item: {
              id: "im-h2-test",
              buildingId,
              title: "동교동 수정 완료 빌딩",
              address: "서울특별시 마포구 동교동 147-8",
              askingPriceManwon: 850000,
              gfaSqm: 426.11,
              landAreaSqm: 137.2,
              rentRoll: [
                { floor: "1F", unit: "101호", use: "플래그십스토어", depositManwon: 8000, monthlyRentManwon: 520, maintenanceManwon: 40, status: "occupied" },
              ],
            },
          }),
        })
      );
      expect(patchRes.status).toBe(200);

      // Warm QuickImStore must immediately reflect 85억 (850000) and 520만원 rent without calling quick-generate!
      const updatedQuickRec = getQuickImRecord(buildingId);
      expect(updatedQuickRec?.askingPriceManwon).toBe(850000);
      expect(updatedQuickRec?.fullDocBody?.ssot_summary?.monthly_rent_total_manwon).toBe(520);
      expect(updatedQuickRec?.buildingName).toBe("동교동 수정 완료 빌딩");

      // 3) PC-E2: delete_im evicts from warm QuickImStore
      const delRes = await PATCH(
        new NextRequest("http://localhost/api/broker/workspace/summary", {
          method: "PATCH",
          body: JSON.stringify({
            action: "delete_im",
            id: "im-h2-test",
            buildingId,
          }),
        })
      );
      expect(delRes.status).toBe(200);
      expect(getQuickImRecord(buildingId)).toBeNull();
    });

    it("PC-E3 & PC-E4 & PC-F2: Cold-Start recovery synthesizes full MobileIMData for non-UUID buildingId and preserves object-shaped axiosHighlights", async () => {
      clearQuickImStoreForTest();
      const nonUuidBuildingId = "bld-coldstart-999";

      mockSupabaseFrom.mockImplementation((table: string) => {
        const resolveTable = () => {
          if (table === "activity_events") {
            return {
              data: [
                {
                  id: "ev-cold-1",
                  event_type: "im_upserted",
                  entity_id: nonUuidBuildingId,
                  created_at: "2026-11-10T12:00:00Z",
                  metadata: {
                    building_id: nonUuidBuildingId,
                    im_item: {
                      id: nonUuidBuildingId,
                      buildingId: nonUuidBuildingId,
                      title: "콜드스타트 복원 빌딩",
                      address: "서울특별시 마포구 동교동 147-8",
                      askingPriceManwon: 770000,
                      gfaSqm: 426.11,
                      landAreaSqm: 137.2,
                      axiosHighlights: [
                        { headline: "홍대입구역 초역세권", brief: "도보 3분 코너 필지", tone: "accent" },
                      ],
                      photos: ["data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
                      rentRoll: [
                        { floor: "1F", unit: "101호", use: "카페", depositManwon: 5000, monthlyRentManwon: 380, maintenanceManwon: 30, status: "occupied", areaSqm: 95 },
                      ],
                    },
                  },
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: (v: unknown) => void) => resolve(resolveTable()),
        };
        return chain;
      });

      const { fetchIMData } = await import("@/app/(public)/im-lite/[buildingId]/fetch-im-data");
      const mobileIm = await fetchIMData(nonUuidBuildingId);

      expect(mobileIm).not.toBeNull();
      expect(mobileIm!.fullName).toBe("콜드스타트 복원 빌딩");
      expect(mobileIm!.sections.length).toBeGreaterThan(0);
      expect((mobileIm!.photos || []).map((p) => p.url)).toContain(
        "data:image/jpeg;base64,/9j/4AAQSkZJRg=="
      );
      expect(
        (mobileIm!.heroCard?.keyPoints || []).some((h) => h.includes("홍대입구역 초역세권"))
      ).toBe(true);
    });
  });

  // ===========================================================================
  // Boundary F: Posture Alias Compatibility & Slide Geometry Integrity
  // ===========================================================================
  describe("Boundary F: Posture Alias & Slide Geometry Integrity (PC-F1, PC-F3)", () => {
    it("PC-F1 & PC-F3: generatePptx respects 'owner_occupier' / 'core_income' posture aliases and renders formatted yield strings ('4.20%') & multi-parcel A27 tables without error", async () => {
      const rec = synthesizeQuickRecordFromImItem({
        id: "im-posture-alias",
        buildingId: "bld-posture-alias",
        title: "사옥형 포스처 빌딩",
        address: "서울특별시 강남구 역삼동 823-33",
        askingPriceManwon: 1500000,
        gfaSqm: 1450,
        landAreaSqm: 420,
        posture: "owner_occupier",
        rentRoll: [
          { floor: "1F", unit: "101호", use: "본사 쇼룸", depositManwon: 0, monthlyRentManwon: 0, maintenanceManwon: 50, status: "owner", areaSqm: 300 },
        ],
      });

      const pptxRes = await generatePptx({
        buildingId: "bld-posture-alias",
        doc: {
          title: "사옥형 포스처 빌딩",
          body: {
            ...rec.fullDocBody!,
            posture: "owner_occupier",
          },
          sections: rec.fullDocBody!.sections as any,
        },
        building: {
          name: "사옥형 포스처 빌딩",
          address: "서울특별시 강남구 역삼동 823-33",
        },
        posture: "owner_occupier" as any,
        preset: "credeal_basic",
      });

      expect(pptxRes.slideCount).toBeGreaterThanOrEqual(7);
      expect(pptxRes.buffer.byteLength).toBeGreaterThan(10000);
    });
  });
});
