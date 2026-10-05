/**
 * Pro IM 렌트롤 — "사용자가 기입한 면적만 표기" (임대/전용 상호 대체 금지)
 * - pro-rentroll-table: 모드별 헤더·셀 수 (rules/07 #68)
 * - bindProImChapterData: 프록시 면적/전용면적/계약그룹 매핑
 * - A03 슬라이드: 실제 OpenXML 열 수·셀 수
 */
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { bindProImChapterData } from "@/domain/building/mobile-im/pptx/binder/pro-chapter-binder";
import {
  buildProRentRollTable,
  detectProAreaMode,
  proRentRollHeaders,
} from "@/domain/building/mobile-im/pptx/binder/pro-rentroll-table";
import { buildA03LargeTable } from "@/domain/building/mobile-im/pptx/archetypes/a03-large-table";
import {
  calculateTenantRosterSubtotal,
  chunkTenantRoster,
  type InstitutionalTenantRosterItem,
} from "@/domain/building/im-core/pro-tenant-roster";

const lease = (o: Record<string, any>) => ({
  floor: "1F",
  unit_number: "101호",
  tenant_name: "A사",
  industry: "사무",
  deposit_manwon: 1000,
  monthly_rent_manwon: 100,
  lease_end_date: "2028-12-31",
  ...o,
});

const bind = (floor_leases: any[]) =>
  bindProImChapterData({ body: { floor_leases } } as any, undefined, {});

describe("Pro 렌트롤 — 면적 모드 선택", () => {
  const item = (o: Partial<InstitutionalTenantRosterItem>): InstitutionalTenantRosterItem => ({
    floor: "1F", unitNumber: "101", tenantName: "A", industry: "사무",
    leasedAreaM2: 0, leasedAreaPyeong: 0, depositKrw: 0, monthlyRentKrw: 0, monthlyMaintenanceKrw: 0,
    leaseStartDate: "", leaseEndDate: "", statutoryProtection10Y: true, ...o,
  });

  it("detectProAreaMode", () => {
    expect(detectProAreaMode([item({ leasedAreaM2: 10 })])).toBe("lease");
    expect(detectProAreaMode([item({ exclusiveAreaM2: 8 })])).toBe("exclusive");
    expect(detectProAreaMode([item({ leasedAreaM2: 10, exclusiveAreaM2: 8 })])).toBe("both");
    expect(detectProAreaMode([item({})])).toBe("none");
  });

  it("헤더: 임대만→임대(㎡/평), 전용만→전용(㎡/평), 둘다→11열", () => {
    expect(proRentRollHeaders("lease")).toContain("임대면적(㎡)");
    expect(proRentRollHeaders("lease")).not.toContain("전용면적(㎡)");
    expect(proRentRollHeaders("exclusive")).toContain("전용면적(평)");
    expect(proRentRollHeaders("exclusive")).not.toContain("임대면적(㎡)");
    expect(proRentRollHeaders("both")).toHaveLength(11);
    expect(proRentRollHeaders("lease")).toHaveLength(10);
  });

  it("모든 모드에서 헤더 수 = 본문/소계/합계 셀 수, 다른 면적 대체 없음", () => {
    const items = [
      item({ leasedAreaM2: 100, leasedAreaPyeong: 30.3, exclusiveAreaM2: 60, exclusiveAreaPyeong: 18.2 }),
      item({ unitNumber: "102", leasedAreaM2: 50, leasedAreaPyeong: 15.1 }),
    ];
    const [chunk] = chunkTenantRoster(items, 12);
    for (const mode of ["lease", "exclusive", "both", "none"] as const) {
      const { tableHead, tableRows } = buildProRentRollTable({
        chunk: chunk!, mode, allItems: items, grandTotal: calculateTenantRosterSubtotal(items),
      });
      expect(tableRows).toHaveLength(4); // 2행 + 소계 + 합계
      for (const r of tableRows) expect(r).toHaveLength(tableHead.length);
    }
    const both = buildProRentRollTable({ chunk: chunk!, mode: "both", allItems: items });
    const excIdx = both.tableHead.indexOf("전용면적(㎡)");
    expect(both.tableRows[0]![excIdx]).toBe("60");
    expect(both.tableRows[1]![excIdx]).toBe("-"); // 102호는 전용 미기입 → 임대값(50)으로 대체 금지
    expect(both.tableRows[2]![excIdx]).toBe("60"); // 소계: 기입된 전용면적만 합산
  });
});

describe("bindProImChapterData — 렌트롤 매핑", () => {
  it("임대면적만 기입 → 임대 열, 전용 열 없음", () => {
    const r = bind([lease({ area_sqm: 100 }), lease({ unit_number: "102", area_sqm: 50 })]);
    const p = (r as any).rentRollPart1;
    expect(p.tableHead).toContain("임대면적(㎡)");
    expect(p.tableHead).not.toContain("전용면적(㎡)");
    expect(p.tableRows[0][p.tableHead.indexOf("임대면적(㎡)")]).toBe("100");
  });

  it("전용면적만 기입 → 전용 열, 임대 열 없음", () => {
    const r = bind([lease({ exclusive_area_sqm: 60 }), lease({ unit_number: "102", exclusive_area_sqm: 40 })]);
    const p = (r as any).rentRollPart1;
    expect(p.tableHead).toContain("전용면적(㎡)");
    expect(p.tableHead).not.toContain("임대면적(㎡)");
    expect(p.tableRows[0][p.tableHead.indexOf("전용면적(㎡)")]).toBe("60");
  });

  it("레거시 프록시(area_sqm_is_proxy) → 임대면적으로 표기하지 않음", () => {
    const r = bind([
      lease({ area_sqm: 60, area_sqm_is_proxy: true, exclusive_area_sqm: 60 }),
      lease({ unit_number: "102", area_sqm: 40, area_sqm_is_proxy: true, exclusive_area_sqm: 40 }),
    ]);
    const p = (r as any).rentRollPart1;
    expect(p.tableHead).toContain("전용면적(㎡)");
    expect(p.tableHead).not.toContain("임대면적(㎡)");
  });

  it("둘 다 기입 → 11열, 합계 행 포함", () => {
    const r = bind([lease({ area_sqm: 100, exclusive_area_sqm: 60 })]);
    const p = (r as any).rentRollPart1;
    expect(p.tableHead).toHaveLength(11);
    const last = p.tableRows[p.tableRows.length - 1];
    expect(last[0]).toBe("합계");
    expect(last).toHaveLength(11);
  });

  it("계약그룹 후행 행은 금액 '〃', 대표 행은 금액 유지", () => {
    const r = bind([
      lease({ contract_group: "G1", area_sqm: 100 }),
      lease({ unit_number: "102", contract_group: "G1", area_sqm: 50, deposit_manwon: 0, monthly_rent_manwon: 0 }),
    ]);
    const p = (r as any).rentRollPart1;
    const di = p.tableHead.indexOf("보증금(만원)");
    expect(p.tableRows[0][di]).toBe("1,000");
    expect(p.tableRows[1][di]).toBe("〃");
    expect(p.tableRows[2][0]).toBe("소계");
  });
});

describe("A03 슬라이드 — Pro 렌트롤 OpenXML", () => {
  it("전용면적만 기입한 표: 헤더·행 셀 수 일치, 임대면적 열 없음", async () => {
    const r = bind([lease({ exclusive_area_sqm: 60 }), lease({ unit_number: "102", exclusive_area_sqm: 40 })]);
    const p = (r as any).rentRollPart1;
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE";
    buildA03LargeTable({
      pres, slideNum: 1, docno: "DOC-T", grade: "A", provenance: {},
      data: { title: p.title, tableHead: p.tableHead, tableRows: p.tableRows },
    } as any);
    const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
    const tbl = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)![0];
    const trs = tbl.match(/<a:tr [\s\S]*?<\/a:tr>/g) ?? [];
    const counts = trs.map((tr) => (tr.match(/<a:tc>|<a:tc /g) ?? []).length);
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(10);
    expect(tbl).toContain("전용면적(㎡)");
    expect(tbl).not.toContain("임대면적(㎡)");
  });
});
