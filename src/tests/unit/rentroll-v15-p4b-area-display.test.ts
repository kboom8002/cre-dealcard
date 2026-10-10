/**
 * 렌트롤 v1.5 P4b — Pro/Premium/뷰어 마크다운/A22 면적 표기 (§9.1) + V04 수익률 폴백 + 계약 단위 명도 집계
 *
 * - 면적 표기: 입력 단위 단일(㎡ 기본 | 평), 소수 2자리, 미기재 '-' (날조 금지)
 * - 정본은 ㎡. 평 = ㎡ ÷ 3.305785
 */
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import {
  formatLeaseAreaCell,
  sumLeaseAreaInUnit,
  leaseAreaHeaderLabel,
} from "@/domain/building/mobile-im/lease-area-cell";
import {
  normalizeFloorLeases,
  formatRentRollMarkdown,
  analyzeEviction,
  resolveRentRollNote,
} from "@/domain/building/mobile-im/lease-adapter";
import {
  protectBlock,
  normalizeTerminology,
  stripProtectMarkers,
} from "@/domain/building/mobile-im/terminology-normalizer";
import { parseFloorsFromMarkdown } from "@/components/im/stacking-plan-view";
import { bindProImChapterData } from "@/domain/building/mobile-im/pptx/binder/pro-chapter-binder";
import {
  bindCommercialTemplateData,
  bindInstitutionalTemplateData,
} from "@/domain/building/mobile-im/pptx/binder/premium-binders";
import { buildA22StackingPlan } from "@/domain/building/mobile-im/pptx/archetypes/a22-stacking-plan";
import type { StackingPlanFloor } from "@/domain/building/mobile-im/types";

describe("lease-area-cell — §9.1 단일 단위·소수 2자리", () => {
  it("㎡: 317.22 → '317.22', 평: 317.22㎡ → '95.96'", () => {
    expect(formatLeaseAreaCell(317.22, "sqm")).toBe("317.22");
    expect(formatLeaseAreaCell(317.22, "pyeong")).toBe("95.96");
  });
  it("천 단위 구분 / 미기재·0·NaN → '-' (Negative)", () => {
    expect(formatLeaseAreaCell(1234.5, "sqm")).toBe("1,234.50");
    expect(formatLeaseAreaCell(undefined, "sqm")).toBe("-");
    expect(formatLeaseAreaCell(0, "pyeong")).toBe("-");
    expect(formatLeaseAreaCell(Number.NaN, "sqm")).toBe("-");
  });
  it("합계는 표시된 행 값의 합 (평 모드에서도 행 합 = 합계)", () => {
    const rows = [100, 50.5, undefined];
    expect(sumLeaseAreaInUnit(rows, "sqm")).toBeCloseTo(150.5, 2);
    const perRow = rows.map((v) => (v ? Number(formatLeaseAreaCell(v, "pyeong")) : 0));
    expect(sumLeaseAreaInUnit(rows, "pyeong")).toBeCloseTo(perRow.reduce((a, b) => a + b, 0), 2);
  });
  it("헤더 라벨", () => {
    expect(leaseAreaHeaderLabel("임대면적", "sqm")).toBe("임대면적(㎡)");
    expect(leaseAreaHeaderLabel("전용면적", "pyeong")).toBe("전용면적(평)");
  });
});

describe("formatRentRollMarkdown — v1.5 면적 열", () => {
  const raw = [
    { floor: "1F", tenant_type: "카페", tenant_name: "A사", area_sqm: 317.22, deposit_manwon: 1000, rent_manwon: 100, lease_end: "2028-12-31" },
    { floor: "2F", tenant_type: "사무", tenant_name: "B사", area_sqm: 100, deposit_manwon: 500, rent_manwon: 50, lease_end: "2027-06-30" },
  ] as any[];

  it("㎡(기본): 머리글 임대면적(㎡), 값 317.22, '평' 병기 없음", () => {
    const md = formatRentRollMarkdown(normalizeFloorLeases(raw));
    expect(md).toContain("| 임대면적(㎡) |");
    expect(md).toContain("317.22");
    expect(md).not.toContain("평");
    expect(md).not.toContain("전용면적");
    expect(md).not.toContain("비고");
  });

  it("평 모드: 머리글 임대면적(평), 값 95.96, '㎡' 단위 없음", () => {
    const md = formatRentRollMarkdown(normalizeFloorLeases(raw), { area_input_unit: "pyeong" });
    expect(md).toContain("임대면적(평)");
    expect(md).toContain("| 95.96 |");
    expect(md).not.toContain("㎡");
    expect(formatRentRollMarkdown(normalizeFloorLeases(raw), "pyeong")).toContain("임대면적(평)");
  });

  it("전용면적 값이 있을 때만 전용면적 열, 임대면적으로 대체하지 않음", () => {
    const withExc = normalizeFloorLeases([{ ...raw[0], exclusive_area_sqm: 200 }, raw[1]] as any[]);
    const md = formatRentRollMarkdown(withExc);
    expect(md).toContain("전용면적(㎡)");
    // 2F 는 전용 미기입 → '-' (임대면적 100.00 을 전용 칸에 복사하지 않는다)
    const row2 = md.split("\n").find((l) => l.startsWith("| 2F"))!;
    const cells = row2.split("|").map((c) => c.trim()).filter(Boolean);
    expect(cells.filter((c) => c === "100.00")).toHaveLength(1);
  });

  it("비고 열은 렌트프리/입금 상태가 있을 때만", () => {
    const withNote = normalizeFloorLeases([
      { ...raw[0], rent_free_months: 3, payment_status: "연체" },
      raw[1],
    ] as any[]);
    const md = formatRentRollMarkdown(withNote);
    expect(md).toContain("비고");
    expect(md).toContain("렌트프리 3개월, 입금 연체");
    expect(resolveRentRollNote(withNote[1])).toBe("");
  });

  it("프록시 면적(area_sqm_is_proxy)은 임대면적으로 표기하지 않고 '-'", () => {
    const md = formatRentRollMarkdown(
      normalizeFloorLeases([{ ...raw[0], area_sqm_is_proxy: true }] as any[]),
    );
    expect(md).not.toContain("317.22");
  });
});

describe("terminology-normalizer — 보호 블록 (렌트롤 표)", () => {
  const table = formatRentRollMarkdown(
    normalizeFloorLeases([{ floor: "1F", tenant_type: "카페", area_sqm: 317.22, deposit_manwon: 1000, rent_manwon: 100, lease_end: "2028-12-31" }] as any[]),
    "pyeong",
  );

  it("보호 블록 안의 평 값은 ㎡ 병기로 바뀌지 않고 마커는 제거된다", () => {
    const out = normalizeTerminology(`본문 100평 입니다.\n\n${protectBlock(table)}`);
    expect(out.text).toContain("| 95.96 |");
    expect(out.text).not.toContain("(약 ㎡)");
    expect(out.text).not.toMatch(/[\uE000\uE001]/);
  });

  it("보호 블록 밖의 텍스트는 기존대로 정규화된다 (Negative Pair)", () => {
    const out = normalizeTerminology(`본문 100평 입니다.\n\n${protectBlock(table)}`);
    expect(out.text).toContain("㎡");
  });

  it("stripProtectMarkers 는 마커만 제거한다", () => {
    expect(stripProtectMarkers(protectBlock("abc"))).toBe("abc");
  });
});

describe("stacking-plan-view — 마크다운 파싱 단위 (§9.1)", () => {
  it("㎡ 머리글의 순수 숫자는 ㎡로 해석 (평으로 가정하지 않음)", () => {
    const md = "| 층수 | 업종 | 임대면적(㎡) |\n|---|---|---|\n| 3F | 사무 | 330.58 |";
    const { floors, unit } = parseFloorsFromMarkdown(md);
    expect(unit).toBe("sqm");
    expect(floors[0].leasableAreaM2).toBeCloseTo(330.58, 2);
    expect(floors[0].leasableAreaPy).toBeCloseTo(100, 1);
  });
  it("평 머리글의 순수 숫자는 평으로 해석", () => {
    const md = "| 층수 | 업종 | 임대면적(평) |\n|---|---|---|\n| 3F | 사무 | 100.00 |";
    const { floors, unit } = parseFloorsFromMarkdown(md);
    expect(unit).toBe("pyeong");
    expect(floors[0].leasableAreaPy).toBeCloseTo(100, 2);
    expect(floors[0].leasableAreaM2).toBeCloseTo(330.58, 2);
  });
  it("단위 없는 머리글의 순수 숫자는 면적으로 해석하지 않음 (Negative)", () => {
    const md = "| 층수 | 업종 | 임대면적 |\n|---|---|---|\n| 3F | 사무 | 330 |";
    const { floors, unit } = parseFloorsFromMarkdown(md);
    expect(unit).toBeNull();
    expect(floors[0].leasableAreaPy).toBeUndefined();
  });
});

describe("A22 스태킹 플랜 — 단위 표기", () => {
  const floors: StackingPlanFloor[] = [
    { floor: "2F", use: "사무", tenant: "A사", floorAreaM2: 500, exclusiveAreaPy: 100, leasableAreaPy: 200, isVacant: false },
    { floor: "B1F", use: "주차장", tenant: "주차장", floorAreaM2: 500, exclusiveAreaPy: 0, leasableAreaPy: 0, isVacant: false },
  ];
  const render = (extra: Record<string, unknown>) => {
    const pres = new PptxGenJS();
    pres.layout = "LAYOUT_WIDE";
    buildA22StackingPlan({
      pres, slideNum: 1, docno: "T", grade: "B", provenance: {},
      data: { title: "스태킹", stackingPlan: floors, ...extra },
    } as any);
    const slides = (pres as any)._slides;
    const tableObj = slides[0]._slideObjects.find((o: any) => o._type === "table" || o.arrTabRows);
    const txt = (v: any): string =>
      v == null ? "" : typeof v === "string" ? v : Array.isArray(v) ? v.map(txt).join("") : v.text !== undefined ? txt(v.text) : v.t !== undefined ? txt(v.t) : String(v);
    return (tableObj.arrTabRows as any[][]).map((r) => r.map(txt));
  };

  it("기본 ㎡: 헤더 전용(㎡)/임대(㎡), 100평 → 330.58, 0 면적 → '-'", () => {
    const rows = render({});
    expect(rows[0]).toEqual(expect.arrayContaining(["전용(㎡)", "임대(㎡)"]));
    const flat = rows.flat().join("|");
    expect(flat).toContain("330.58");
    expect(flat).not.toContain("전용(평)");
    const b1 = rows.find((r) => r[0] === "B1F")!;
    expect(b1).toContain("-");
  });

  it("평 모드: 헤더 전용(평)/임대(평), 값 100.00", () => {
    const rows = render({ areaInputUnit: "pyeong" });
    expect(rows[0]).toEqual(expect.arrayContaining(["전용(평)", "임대(평)"]));
    expect(rows.flat().join("|")).toContain("100.00");
  });

  it("rentRollMeta 로도 단위를 받는다", () => {
    const rows = render({ rentRollMeta: { area_input_unit: "pyeong" } });
    expect(rows[0]).toContain("전용(평)");
  });
});

describe("Pro 챕터 — 수익률 폴백 V04 (Q1)", () => {
  const baseBody = {
    asking_price_manwon: 100000, // 10억
    monthly_rent_total_krw: 5_000_000, // 연 6천만
    floor_leases: [
      { floor: "1F", unit_number: "101호", tenant_name: "A사", industry: "사무", deposit_manwon: 10000, monthly_rent_manwon: 500, lease_end_date: "2028-12-31", area_sqm: 100 },
    ],
  };
  const stats = (body: any) => {
    const r: any = bindProImChapterData({ body } as any, undefined, {});
    return r["acquisition_highlights"].right.stats[1] as { label: string; value: string };
  };

  it("수익률 미기재 + 보증금 있음 → 월세×12÷(매매가−보증금) = 6.67% 와 기준 라벨", () => {
    const s = stats({ ...baseBody, total_deposit_manwon: 10000 }); // 보증금 1억 → 분모 9억
    expect(s.value).toBe("6.67%");
    expect(s.label).toContain("월세×12÷(매매가−보증금)");
  });

  it("문서에 Cap Rate 가 있으면 그 값과 '초기 Cap Rate' 라벨 유지 (Negative Pair)", () => {
    const s = stats({ ...baseBody, total_deposit_manwon: 10000, cap_rate_percent: 4.5 });
    expect(s.value).toBe("4.50%");
    expect(s.label).toBe("초기 Cap Rate");
  });
});

describe("Premium 템플릿 — 면적 머리글/값 (§9.1, X6)", () => {
  it("상업용: 머리글 임대면적(㎡), 값 2자리 / 평 모드 임대면적(평)", () => {
    const leases = [{ floor: "1F", tenant_type: "카페", tenant_name: "A", area_sqm: 317.22, deposit_manwon: 1000, rent_manwon: 100 }];
    const sqm = bindCommercialTemplateData({ body: { floor_leases: leases } });
    expect(sqm["plan"].tableHead).toContain("임대면적(㎡)");
    expect(sqm["plan"].tableHead).not.toContain("전용면적");
    expect(sqm["plan"].tableRows![0][2]).toBe("317.22");
    const py = bindCommercialTemplateData({ body: { floor_leases: leases, rent_roll_meta: { area_input_unit: "pyeong" } } });
    expect(py["plan"].tableHead).toContain("임대면적(평)");
    expect(py["plan"].tableRows![0][2]).toBe("95.96");
  });

  it("오피스: 전용면적/임대면적 단위 머리글, 미기입 면적은 '-'", () => {
    const doc = {
      body: {
        rent_roll_meta: { area_input_unit: "pyeong" },
        leases: [{ unitLabel: "3F", tenantName: "A", areaSqm: 317.22, depositKrw: 1e7, monthlyRentKrw: 1e6, leaseEndDate: "2028-12-31" }],
      },
    };
    const r = bindInstitutionalTemplateData(doc);
    const head = r["rentRoll"].tableHead!;
    expect(head).toContain("전용면적(평)");
    expect(head).toContain("임대면적(평)");
    const row = r["rentRoll"].tableRows![0];
    expect(row[head.indexOf("전용면적(평)")]).toBe("-");
    expect(row[head.indexOf("임대면적(평)")]).toBe("95.96");
  });
});

describe("analyzeEviction — §6.4 계약 단위", () => {
  const mk = (o: Record<string, unknown>): any => ({
    floor: "1F", tenantType: "사무", areaSqm: 100, depositKrw: 1e7, monthlyRentKrw: 1e6,
    mgmtFeeKrw: 0, leaseStart: "", leaseEnd: "2099-12-31", isVacant: false, ...o,
  });

  it("같은 계약그룹의 비대표 행은 별도 임차인으로 세지 않는다", () => {
    const res = analyzeEviction([
      mk({ contractGroup: "G1" }),
      mk({ floor: "2F", contractGroup: "G1", depositKrw: 0, monthlyRentKrw: 0 }),
      mk({ floor: "3F" }),
    ]);
    expect(res.totalTenants).toBe(2);
  });

  it("그룹 없는 행은 행=계약, 공실은 제외 (Negative Pair)", () => {
    const res = analyzeEviction([mk({}), mk({ floor: "2F" }), mk({ floor: "3F", isVacant: true })]);
    expect(res.totalTenants).toBe(2);
  });

  it("asOf 를 주면 평가기준일 기준으로 소요 기간 계산 (기본 동작은 오늘)", () => {
    const leases = [mk({ leaseEnd: "2030-01-01" })];
    const early = analyzeEviction(leases, "2029-12-01");
    const late = analyzeEviction(leases, "2020-01-01");
    expect(late.estimatedMonths).toBeGreaterThan(early.estimatedMonths);
  });
});
