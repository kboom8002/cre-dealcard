/**
 * 렌트롤 면적 표기 / 계약그룹 / 원장 영속화 계약 테스트
 *
 *  1) 파서가 계약그룹·적용법령·최초계약일·갱신요구권·대항력을 앱으로 전달 (허용값 밖은 버림)
 *  2) PPTX 렌트롤 표: 사용자가 기입한 면적만 표기 (둘 다 / 임대만 / 전용만 / 없음) + 열 수 = 셀 수 (rule 68)
 *  3) 통합계약 대표 행 외 금액 빈 행은 '〃' 표기, 합계는 대표 행만
 *  4) lease_ledger 행 빌더: 전용면적·계약그룹 저장, 허용값 밖 값 제거, 중복 호실 라벨 구분
 */
import { describe, it, expect } from "vitest";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { parseRentRollData } from "@/lib/rentroll/parse-rentroll-sheet";
import {
  projectBasicRentRollColumns,
  detectAreaColumnMode,
  BASIC_RENTROLL_COL_W,
} from "@/domain/building/mobile-im/pptx/rentroll-area-columns";
import { bindRentRollTable } from "@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder";
import { buildA24RentrollStacking } from "@/domain/building/mobile-im/pptx/archetypes/a24-rentroll-stacking";
import { buildLeaseLedgerRows } from "@/domain/building/mobile-im/lease-adapter";

// ─────────────────────────────────────────────────────────────
// 1) 파서: 원장 필드 전달
// ─────────────────────────────────────────────────────────────
describe("parseRentRollData — 계약그룹·R3 필드 전달", () => {
  const header = [
    "호실/층", "계약그룹", "임대면적(㎡)", "전용면적(㎡)", "업종/상호 (원문)", "적용법령", "보증금(원)", "월세(원,VAT별도)",
    "관리비(원,VAT별도)", "최초 계약일", "현 계약 시작일", "현 계약 만료일", "갱신요구권 행사", "대항력 요건", "임대상태", "비고",
    "임대면적(평)", "전용면적(평)", "전용률(%)", "환산보증금(자동)", "상임법 전면적용", "갱신권 잔여(자동)", "계약 상태(자동)",
  ];
  const row = (v: Record<string, any>) => header.map((h) => v[h] ?? "");

  it("같은 계약그룹 행에 값이 전달되고, 금액은 대표 행에만 있다", () => {
    const r = parseRentRollData([
      header,
      row({ "호실/층": "1F", 계약그룹: "A", "임대면적(㎡)": 100, "전용면적(㎡)": 75, "업종/상호 (원문)": "카페", 적용법령: "상가", "보증금(원)": 50000000, "월세(원,VAT별도)": 3000000, "최초 계약일": "2018-03-01", "현 계약 만료일": "2027-02-28", "갱신요구권 행사": "없음", "대항력 요건": "사업자등록", 임대상태: "임대중" }),
      row({ "호실/층": "2F", 계약그룹: "A", "임대면적(㎡)": 80, "전용면적(㎡)": 60, "업종/상호 (원문)": "카페", 적용법령: "상가", "현 계약 만료일": "2027-02-28", 임대상태: "임대중" }),
      row({ "호실/층": "3F", "임대면적(㎡)": 90, "업종/상호 (원문)": "법무법인", 적용법령: "상가", "보증금(원)": 30000000, "월세(원,VAT별도)": 2000000, 임대상태: "임대중" }),
    ]);
    const [f1, f2, f3] = r.parsedRows;
    expect(f1).toMatchObject({ contract_group: "A", legal_basis: "상가", first_contract_date: "2018-03-01", renewal_exercised: "없음", opposing_power: "사업자등록" });
    expect(f2).toMatchObject({ contract_group: "A", legal_basis: "상가" });
    expect(f2.deposit_manwon).toBeUndefined();
    expect(f2.rent_manwon).toBeUndefined();
    expect(f3.contract_group).toBeUndefined();
    // 합계는 대표 행 금액만 (중복 집계 없음)
    expect(r.monthlyRent).toBe(300 + 200);
    expect(r.totalDeposit).toBe(5000 + 3000);
  });

  it("허용값 밖 문구와 ISO가 아닌 최초계약일은 추측하지 않고 버린다 (원장 CHECK/DATE 보호)", () => {
    const r = parseRentRollData([
      header,
      row({ "호실/층": "1F", "임대면적(㎡)": 10, "업종/상호 (원문)": "x", 적용법령: "기타법", "보증금(원)": 1, "월세(원,VAT별도)": 1, "최초 계약일": "작년쯤", "갱신요구권 행사": "글쎄", "대항력 요건": "???", 임대상태: "임대중" }),
    ]);
    const p = r.parsedRows[0];
    expect(p.legal_basis).toBeUndefined();
    expect(p.first_contract_date).toBeUndefined();
    expect(p.renewal_exercised).toBeUndefined();
    expect(p.opposing_power).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// 2) 면적 열 선택
// ─────────────────────────────────────────────────────────────
const R = (floor: string, lease: string, exc: string, ...rest: string[]) =>
  [floor, "임차인", "용도", lease, exc, "5,000", "300", "30", "330", "2027-03-31", ...rest].slice(0, 10);

describe("projectBasicRentRollColumns — 기입한 면적만 표기", () => {
  it("임대·전용 모두 기입 → 10열 (표준)", () => {
    const p = projectBasicRentRollColumns([R("1F", "100.0", "75.0"), R("2F", "80.0", "60.0")]);
    expect(p.mode).toBe("both");
    expect(p.headers).toHaveLength(10);
    expect(p.headers).toContain("임대면적");
    expect(p.headers).toContain("전용면적");
  });

  it("임대면적만 기입 → 전용면적 열 제거 (9열)", () => {
    const p = projectBasicRentRollColumns([R("1F", "100.0", "-"), R("2F", "80.0", "-")]);
    expect(p.mode).toBe("lease");
    expect(p.headers).toHaveLength(9);
    expect(p.headers).toContain("임대면적");
    expect(p.headers).not.toContain("전용면적");
  });

  it("전용면적만 기입 → 임대면적 열 제거 (9열)", () => {
    const p = projectBasicRentRollColumns([R("1F", "-", "75.0"), R("2F", "-", "60.0")]);
    expect(p.mode).toBe("exclusive");
    expect(p.headers).toHaveLength(9);
    expect(p.headers).toContain("전용면적");
    expect(p.headers).not.toContain("임대면적");
  });

  it("호실 중 일부만 기입해도 그 면적 열은 유지, 둘 다 없으면 임대면적 열만 '-' 로 유지", () => {
    expect(detectAreaColumnMode([R("1F", "100.0", "-"), R("2F", "-", "60.0")])).toBe("both");
    const none = projectBasicRentRollColumns([R("1F", "-", "-")]);
    expect(none.headers).toHaveLength(9);
    expect(none.headers).toContain("임대면적");
  });

  it("합계 행의 면적은 판정에 쓰지 않는다", () => {
    expect(detectAreaColumnMode([R("1F", "-", "-"), ["합계", "1개 호실", "-", "100.0", "75.0", "-", "-", "-", "-", "-"]])).toBe("lease");
  });

  it("열 수를 줄여도 표 전체 폭은 변하지 않고 헤더·열폭·keep 길이가 일치한다 (rule 68)", () => {
    const total = BASIC_RENTROLL_COL_W.reduce((a, b) => a + b, 0);
    for (const rows of [[R("1F", "1", "1")], [R("1F", "1", "-")], [R("1F", "-", "1")], [R("1F", "-", "-")]]) {
      const p = projectBasicRentRollColumns(rows);
      expect(p.colW).toHaveLength(p.headers.length);
      expect(p.keep).toHaveLength(p.headers.length);
      expect(p.colW.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 1);
    }
  });

  const noMgmt = (r: string[], mgmt: string) => { const c = [...r]; c[7] = mgmt; c[8] = c[6]; return c; };

  it("관리비가 전 행 미기입('-'/빈 값/0)이면 관리비·월합계 열을 함께 생략하고 폭은 유지", () => {
    const total = BASIC_RENTROLL_COL_W.reduce((a, b) => a + b, 0);
    const rows = [noMgmt(R("1F", "100.0", "75.0"), "-"), noMgmt(R("2F", "80.0", "60.0"), "0"), noMgmt(R("3F", "80.0", "60.0"), "")];
    const p = projectBasicRentRollColumns(rows);
    expect(p.headers).not.toContain("관리비");
    expect(p.headers).not.toContain("월합계");
    expect(p.headers).toHaveLength(8);
    expect(p.keep).toHaveLength(p.headers.length);
    expect(p.colW.reduce((a, b) => a + b, 0)).toBeCloseTo(total, 1);
  });

  it("[NEG] 한 호실이라도 관리비가 있거나 '별도' 같은 비숫자 표기면 관리비·월합계 열 유지", () => {
    const one = projectBasicRentRollColumns([noMgmt(R("1F", "100.0", "75.0"), "-"), R("2F", "80.0", "60.0")]);
    expect(one.headers).toContain("관리비");
    expect(one.headers).toContain("월합계");
    const sep = projectBasicRentRollColumns([noMgmt(R("1F", "100.0", "75.0"), "별도")]);
    expect(sep.headers).toContain("관리비");
  });

  it("[NEG] 합계 행의 관리비는 판정에 쓰지 않는다", () => {
    const p = projectBasicRentRollColumns([
      noMgmt(R("1F", "100.0", "75.0"), "-"),
      ["합계", "1개 호실", "-", "100.0", "75.0", "5,000", "300", "30", "330", "-"],
    ]);
    expect(p.headers).not.toContain("관리비");
  });
});

// ─────────────────────────────────────────────────────────────
// 3) 바인더: 폴백 제거 + 통합계약 표기
// ─────────────────────────────────────────────────────────────
function bind(floorLeases: any[]) {
  const result: Record<string, any> = { rentRoll: { title: "x", content: "", tables: [] } };
  bindRentRollTable({ body: { preset: "credeal_basic", floor_leases: floorLeases } }, "", result);
  return result.rentRoll.tableRows as string[][];
}

describe("bindRentRollTable — 면적 폴백 제거 · 통합계약", () => {
  it("전용면적이 없으면 '-' (임대면적 값을 전용면적 칸에 복사하지 않는다)", () => {
    const rows = bind([{ floor: "1F", tenant_type: "카페", area_sqm: 100, deposit_manwon: 5000, rent_manwon: 300, lease_end: "2027-03-31" }]);
    expect(rows[0][3]).toBe("100.0 (30.3평)");
    expect(rows[0][4]).toBe("-");
  });

  it("레거시 대용 임대면적(area_sqm_is_proxy)은 임대면적 칸을 비우고 전용면적만 표기", () => {
    const rows = bind([{ floor: "1F", tenant_type: "카페", area_sqm: 75, exclusive_area_sqm: 75, area_sqm_is_proxy: true, deposit_manwon: 5000, rent_manwon: 300 }]);
    expect(rows[0][3]).toBe("-");
    expect(rows[0][4]).toBe("75.0");
  });

  it("계약그룹 대표 행 외 금액이 빈 행은 '〃', 단독 계약·공실 행은 그대로 '-'", () => {
    const rows = bind([
      { floor: "1F", tenant_type: "카페", contract_group: "A", area_sqm: 100, deposit_manwon: 5000, rent_manwon: 300, mgmt_fee_manwon: 30 },
      { floor: "2F", tenant_type: "카페", contract_group: "A", area_sqm: 80 },
      { floor: "3F", tenant_type: "공실", is_vacant: true, area_sqm: 90 },
    ]);
    expect(rows[0].slice(5, 9)).toEqual(["5,000", "300", "30", "330"]);
    expect(rows[1].slice(5, 9)).toEqual(["〃", "〃", "〃", "〃"]);
    expect(rows[2].slice(5, 9)).toEqual(["-", "-", "-", "-"]);
  });

  it("대표 행(금액)이 그룹 어디에도 없으면 '〃'를 쓰지 않는다", () => {
    const rows = bind([
      { floor: "1F", tenant_type: "카페", contract_group: "B", area_sqm: 100 },
      { floor: "2F", tenant_type: "카페", contract_group: "B", area_sqm: 80 },
    ]);
    expect(rows[0][5]).toBe("-");
    expect(rows[1][5]).toBe("-");
  });
});

// ─────────────────────────────────────────────────────────────
// 4) A24 슬라이드: 실제 OpenXML 의 열 수와 셀 수
// ─────────────────────────────────────────────────────────────
async function renderA24(tableRows: string[][]) {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  buildA24RentrollStacking({
    pres, slideNum: 1, docno: "DOC-T", grade: "A", provenance: {},
    data: { title: "임대차 현황", tableRows },
  });
  const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  const tbl = xml.match(/<a:tbl>[\s\S]*?<\/a:tbl>/)![0];
  const gridCols = (tbl.match(/<a:gridCol /g) ?? []).length;
  const trs = tbl.match(/<a:tr [\s\S]*?<\/a:tr>/g) ?? [];
  const cellCounts = trs.map((tr) => (tr.match(/<a:tc>|<a:tc /g) ?? []).length);
  const headerTexts = (trs[0]!.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ""));
  const lastRowTexts = (trs[trs.length - 1]!.match(/<a:t>([^<]*)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, ""));
  return { gridCols, cellCounts, headerTexts, lastRowTexts };
}

describe("A24 렌트롤 슬라이드 — 면적 열 렌더링 (OpenXML)", () => {
  it("임대·전용 모두 기입: 10열, 모든 행 셀 수 10", async () => {
    const r = await renderA24([R("1F", "100.0", "75.0"), R("2F", "80.0", "60.0")]);
    expect(r.gridCols).toBe(10);
    expect(new Set(r.cellCounts)).toEqual(new Set([10]));
    expect(r.headerTexts).toEqual(expect.arrayContaining(["임대면적", "전용면적"]));
  });

  it("임대면적만 기입: 9열 · 헤더에 전용면적 없음 · 모든 행 셀 수 9", async () => {
    const r = await renderA24([R("1F", "100.0", "-"), R("2F", "80.0", "-")]);
    expect(r.gridCols).toBe(9);
    expect(new Set(r.cellCounts)).toEqual(new Set([9]));
    expect(r.headerTexts).toContain("임대면적");
    expect(r.headerTexts).not.toContain("전용면적");
  });

  it("전용면적만 기입: 9열 · 헤더에 임대면적 없음 · 모든 행 셀 수 9", async () => {
    const r = await renderA24([R("1F", "-", "75.0"), R("2F", "-", "60.0")]);
    expect(r.gridCols).toBe(9);
    expect(new Set(r.cellCounts)).toEqual(new Set([9]));
    expect(r.headerTexts).toContain("전용면적");
    expect(r.headerTexts).not.toContain("임대면적");
  });

  it("18행을 넘겨 잘려도 합계 행은 마지막에 유지된다 (한글 뒤 \\b 정규식 결함 회귀 방지)", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => R(`${i + 1}F`, "100.0", "75.0"));
    const r = await renderA24(rows);
    expect(r.lastRowTexts).toContain("합계");
    expect(r.gridCols).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────
// 5) lease_ledger 행 빌더
// ─────────────────────────────────────────────────────────────
describe("buildLeaseLedgerRows — 원장 영속화", () => {
  it("전용면적·임대면적(㎡ 우선)·계약그룹·R3 필드를 저장한다", () => {
    const [row] = buildLeaseLedgerRows("asset-1", [
      {
        floor: "1F", tenant_sector: "카페", lease_area_sqm: 100.126, exclusive_area_sqm: 75, area_pyung: 30.29,
        contract_group: " A ", legal_basis: "상가", first_contract_date: "2018-03-01", lease_start: "2022-03-01", lease_end: "2027-02-28",
        renewal_exercised: "없음", opposing_power: "사업자등록", lease_state: "임대중", deposit_krw: 50_000_000, monthly_rent_krw: 3_000_000,
      },
    ]);
    expect(row).toMatchObject({
      asset_id: "asset-1", unit_label: "1F", contract_group: "A", lease_area_sqm: 100.13, exclusive_area_sqm: 75,
      legal_basis: "상가", first_contract_date: "2018-03-01", current_start_date: "2022-03-01", current_expiry_date: "2027-02-28",
      renewal_exercised: "없음", opposing_power: "사업자등록", lease_state: "임대중", building_id: null,
    });
  });

  it("임대면적 ㎡가 없으면 area_pyung 환산, 전용면적 미기입은 null", () => {
    const [row] = buildLeaseLedgerRows("a", [{ floor: "1F", area_pyung: 30 }]);
    expect(row.lease_area_sqm).toBeCloseTo(99.17, 1);
    expect(row.exclusive_area_sqm).toBeNull();
  });

  it("허용값 밖 문구·비 ISO 날짜는 null 로 정리해 일괄 upsert 를 깨지 않는다", () => {
    const [row] = buildLeaseLedgerRows("a", [
      { floor: "1F", legal_basis: "기타" as any, renewal_exercised: "글쎄" as any, opposing_power: "?" as any, lease_state: "x" as any, lease_end: "내년", first_contract_date: "2018.03" },
    ]);
    expect(row).toMatchObject({ legal_basis: null, renewal_exercised: null, opposing_power: null, lease_state: "임대중", current_expiry_date: null, first_contract_date: null });
  });

  it("같은 호실 라벨이 반복되면 접미사로 구분하고, 업종이 '공실'이면 공실 상태로 추정한다", () => {
    const rows = buildLeaseLedgerRows("a", [{ floor: "1F", tenant_sector: "공실" }, { floor: "1F" }, { floor: "1F" }]);
    expect(rows.map((r) => r.unit_label)).toEqual(["1F", "1F (2)", "1F (3)"]);
    expect(rows[0].lease_state).toBe("공실");
  });
});
