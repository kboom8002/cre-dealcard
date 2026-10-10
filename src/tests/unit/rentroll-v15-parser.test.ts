/**
 * 렌트롤 워크북 파서 v1.5 — parseRentRollWorkbook 계약 테스트
 *
 * 스펙: docs/RENTROLL_v1.3_to_v1.5.md §6 (파서 계약) · §7 (픽스처 기대값) · §8 (하면 안 되는 것)
 * 픽스처: src/tests/fixtures/rentroll-v15/*.xlsx (scripts/rentroll-v15/build-fixtures.mjs 로 생성, LibreOffice 재계산)
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import {
  parseRentRollWorkbook,
  detectVersion,
  readAreaUnit,
} from "@/lib/rentroll/parse-rentroll-workbook";
import { parseRentRollData, excelDateToIso } from "@/lib/rentroll/parse-rentroll-sheet";
import { PYEONG_TO_SQM_V15, toSqmFromInput } from "@/domain/building/mobile-im/rentroll-meta";

const ROOT = process.cwd();
const FX = path.join(ROOT, "src", "tests", "fixtures", "rentroll-v15");
const NOW = new Date("2025-06-01T00:00:00Z");

const readWb = (file: string, opts: XLSX.ParsingOptions = {}) =>
  XLSX.read(fs.readFileSync(file), { type: "buffer", ...opts });
const fx = (name: string, opts: XLSX.ParsingOptions = {}) => readWb(path.join(FX, name), opts);
const sheetOf = (wb: XLSX.WorkBook) => wb.Sheets["렌트롤"];
const setCell = (ws: XLSX.WorkSheet, addr: string, v: string | number | Date | null) => {
  if (v === null) delete ws[addr];
  else if (v instanceof Date) ws[addr] = { t: "d", v } as XLSX.CellObject;
  else ws[addr] = typeof v === "number" ? { t: "n", v } : { t: "s", v };
};
const issueCodes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

describe("상수·단위 헬퍼 잠금", () => {
  it("평→㎡ 계수 3.305785, 직접 환산은 ROUND 2 (엑셀 AE 수식과 동일)", () => {
    expect(PYEONG_TO_SQM_V15).toBe(3.305785);
    expect(toSqmFromInput(95.96, "pyeong")).toBe(317.22); // 스펙 §7 B1 → AE13
    expect(toSqmFromInput(317.22, "sqm")).toBe(317.22);
    expect(toSqmFromInput(null, "pyeong")).toBeNull();
  });

  it("excelDateToIso: 시리얼 / Date / 문자열 변형", () => {
    expect(excelDateToIso(45792)).toBe("2025-05-15");
    expect(excelDateToIso(new Date("2025-05-15T00:00:00Z"))).toBe("2025-05-15");
    expect(excelDateToIso("2025.5.15")).toBe("2025-05-15");
    expect(excelDateToIso("2025/05/15")).toBe("2025-05-15");
    expect(excelDateToIso("")).toBeUndefined();
    expect(excelDateToIso("내일")).toBeUndefined();
  });
});

describe("detectVersion (§6.1)", () => {
  const ws = (cells: Record<string, string>) => {
    const s: XLSX.WorkSheet = {};
    for (const [k, v] of Object.entries(cells)) s[k] = { t: "s", v };
    return s;
  };
  it("A1 제목의 v1.x", () => {
    expect(detectVersion(ws({ A1: "CREDEAL 렌트롤 표준 양식 v1.3" }))).toBe("1.3");
    expect(detectVersion(ws({ A1: "CREDEAL 렌트롤 표준 양식 v1.4" }))).toBe("1.4");
    expect(detectVersion(ws({ A1: "CREDEAL 렌트롤 표준 양식 v1.5" }))).toBe("1.5");
    expect(detectVersion(ws({ A1: "CREDEAL 렌트롤 표준 양식 v1.2" }))).toBe("unknown");
  });
  it("제목이 지워지면 AE12 → 1.5, AD12 → 1.4, 아니면 unknown", () => {
    expect(detectVersion(ws({ AE12: "임대면적(㎡ 환산)" }))).toBe("1.5");
    expect(detectVersion(ws({ AD12: "금액 판정(자동)" }))).toBe("1.4");
    expect(detectVersion(ws({ A1: "임대차 현황" }))).toBe("unknown");
  });
  it("실제 파일", () => {
    expect(detectVersion(sheetOf(fx("example_R3_v1.5.xlsx")))).toBe("1.5");
    expect(detectVersion(sheetOf(fx("group_v1.3.xlsx")))).toBe("1.3");
  });
});

describe("§7 R3 (G9=㎡) — 오라클", () => {
  const r = parseRentRollWorkbook(fx("example_R3_v1.5.xlsx"), { now: NOW });

  it("버전·단위·헤더 블록 (C5/J3/J4/J5~J8 은 셀 주소로 읽고 환산하지 않는다)", () => {
    expect(r.version).toBe("1.5");
    expect(r.meta.area_input_unit).toBe("sqm");
    expect(r.meta.rentroll_version).toBe("1.5");
    expect(r.meta.rentroll_as_of).toBe("2025-05-15");
    expect(r.meta.asking_price_krw).toBe(11_500_000_000);
    expect(r.meta.gfa_sqm).toBe(1441.15); // J4 는 항상 ㎡
    expect(r.meta.market_rent_1f).toBe(450_000); // J5~J7 은 원/전용평·월 — 환산 없음
    expect(r.meta.market_rent_upper).toBe(240_000);
    expect(r.meta.market_rent_basement).toBe(120_000);
    expect(r.meta.market_rent_1f_source).toContain("중개사");
    expect(r.meta.other_income_krw).toBe(600_000);
    expect(r.meta.other_income_note).toContain("안테나");
  });

  it("8행: 예시 행·템플릿 예시 값이 새지 않는다", () => {
    expect(r.rowCount).toBe(8);
    expect(r.parsedRows.map((p) => p.floor)).toEqual(["B1", "1F", "1F", "2F", "3F", "4F", "4F", "5F"]);
    expect(r.parsedRows.some((p) => p.tenant_type === "사무실" && p.area_sqm === 132.5)).toBe(false);
  });

  it("면적: ΣAE 1,441.15 / ΣAF 1,175.00 / 가중 전용률 81.5%", () => {
    expect(r.areaSummary.leaseSqm).toBe(1441.15);
    expect(r.areaSummary.exclusiveSqm).toBe(1175);
    expect(r.areaSummary.weightedEfficiencyPct).toBe(81.5);
    expect(r.areaSummary.rowsMissingExclusive).toBe(0);
    expect(r.parsedRows[0]).toMatchObject({ floor: "B1", area_sqm: 317.22, exclusive_area_sqm: 257.05 });
    expect(r.parsedRows[2].exclusive_area_sqm).toBe(84); // 내과 대표 행
  });

  it("금액(만원): 월세 합 19,460,000원 / 보증금 합 290,000,000원", () => {
    expect(r.monthlyRent).toBe(1946);
    expect(r.totalDeposit).toBe(29000);
    expect(r.unitDetected).toBe("won");
  });

  it("내과 통합계약 A: 금액은 대표 행에만, 비대표 행은 undefined (0 저장 금지, §8)", () => {
    const group = r.parsedRows.filter((p) => p.contract_group === "A");
    expect(group.map((g) => g.floor)).toEqual(["1F", "2F", "5F"]);
    const [rep, ...rest] = group;
    expect(rep).toMatchObject({ deposit_manwon: 15000, rent_manwon: 900, mgmt_fee_manwon: 73 });
    for (const g of rest) {
      expect(g.deposit_manwon).toBeUndefined();
      expect(g.rent_manwon).toBeUndefined();
      expect(g.mgmt_fee_manwon).toBeUndefined();
      expect(g.exclusive_area_sqm).toBeGreaterThan(0); // 면적은 행마다
    }
    // 그룹 전용면적 합 289.00㎡ (NOC 분모)
    expect(Math.round(group.reduce((s, g) => s + (g.exclusive_area_sqm ?? 0), 0) * 100) / 100).toBe(289);
  });

  it("v1.4 행 필드: 근거 / 렌트프리 / 입금 확인 + 임대상태·법령·최초계약일", () => {
    const [b1, pharmacy, , , gym, wine] = r.parsedRows;
    expect(pharmacy).toMatchObject({ evidence_level: "계약서 원본", rent_free_months: 0, payment_status: "정상", legal_basis: "상가", first_contract_date: "2018-03-01", lease_end: "2026-02-28", opposing_power: "사업자등록", renewal_exercised: "없음" });
    expect(gym).toMatchObject({ evidence_level: "매도인 렌트롤", rent_free_months: 2 });
    expect(wine).toMatchObject({ evidence_level: "구두", payment_status: "연체" });
    expect(b1).toMatchObject({ lease_state: "자가사용", evidence_level: null, rent_free_months: null, payment_status: null });
  });

  it("V12 정상 — 차단/보류 이슈 없음, 캐시 불일치 없음", () => {
    expect(issueCodes(r)).not.toContain("AREA_UNIT_MISMATCH");
    expect(issueCodes(r)).not.toContain("AREA_UNIT_UNCHECKED");
    expect(issueCodes(r)).not.toContain("AREA_CACHE_DIFF");
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
  });

  it("만료 경고는 오늘이 아니라 C5(2025-05-15) 기준 (§6.4-1) — 와인매장 2025-04-30 경과", () => {
    expect(r.warnings.some((w) => w.includes("2025-05-15") && w.includes("2025-04-30"))).toBe(true);
  });
});

describe("§7 R3_평입력 (G9=평)", () => {
  const r = parseRentRollWorkbook(fx("example_R3_평입력_v1.5.xlsx"), { now: NOW });

  it("단위 pyeong · C13=95.96 → 317.22㎡, ΣAE 1,441.16 / ΣAF 1,175.05 (평 입력 반올림 차이)", () => {
    expect(r.meta.area_input_unit).toBe("pyeong");
    expect(r.parsedRows[0].area_sqm).toBe(317.22);
    expect(r.areaSummary.leaseSqm).toBe(1441.16);
    expect(r.areaSummary.exclusiveSqm).toBe(1175.05);
    expect(r.areaSummary.weightedEfficiencyPct).toBe(81.5);
  });

  it("J4 는 환산하지 않는다 (1,441.15 그대로) · 금액 동일 · V12 정상 · 캐시와 일치", () => {
    expect(r.meta.gfa_sqm).toBe(1441.15);
    expect(r.monthlyRent).toBe(1946);
    expect(r.totalDeposit).toBe(29000);
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
    expect(issueCodes(r)).not.toContain("AREA_CACHE_DIFF");
  });
});

describe("§7 R1 / R2 (해상도별 생략 필드)", () => {
  it("R1: 면적·법령·관리비·날짜 생략 — 금액은 동일, 면적 합 0 이면 V12 판정 보류(경고, 차단 아님)", () => {
    const r = parseRentRollWorkbook(fx("example_R1_v1.5.xlsx"), { now: NOW });
    expect(r.rowCount).toBe(8);
    expect(r.monthlyRent).toBe(1946);
    expect(r.totalDeposit).toBe(29000);
    expect(r.areaSummary.leaseSqm).toBe(0);
    expect(r.parsedRows[1].area_sqm).toBeUndefined();
    expect(r.parsedRows[1].legal_basis).toBeUndefined();
    expect(issueCodes(r)).toContain("AREA_UNIT_UNCHECKED");
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
    expect(r.parsedRows.find((p) => p.floor === "2F")!.rent_manwon).toBeUndefined(); // 통합계약 비대표
  });

  it("R2: 면적·법령·관리비 포함 — ΣAE 1,441.15, 근거/렌트프리/입금은 null", () => {
    const r = parseRentRollWorkbook(fx("example_R2_v1.5.xlsx"), { now: NOW });
    expect(r.areaSummary.leaseSqm).toBe(1441.15);
    expect(r.areaSummary.exclusiveSqm).toBe(1175);
    expect(r.parsedRows[1]).toMatchObject({ legal_basis: "상가", evidence_level: null, payment_status: null });
    expect(r.parsedRows[1].first_contract_date).toBeUndefined(); // R3 필드는 R2 에 없다
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
  });
});

describe("단위 혼동 (G9=평 + ㎡ 숫자) — V12 차단", () => {
  const r = parseRentRollWorkbook(fx("unit_confusion_v1.5.xlsx"), { now: NOW });

  it("ΣAE 4,764.14㎡, V03 330.6% → AREA_UNIT_MISMATCH (blocking, overridable)", () => {
    expect(r.meta.area_input_unit).toBe("pyeong");
    expect(r.areaSummary.leaseSqm).toBe(4764.14);
    const mismatch = r.issues.find((i) => i.code === "AREA_UNIT_MISMATCH");
    expect(mismatch).toBeTruthy();
    expect(mismatch!.level).toBe("blocking");
    expect(mismatch!.overridable).toBe(true);
    expect(Math.round(mismatch!.ratio! * 1000) / 10).toBe(330.6);
  });

  it("단위를 자동 보정하지 않는다 — 파서 면적은 입력 숫자 × 3.305785 그대로", () => {
    expect(r.parsedRows[0].area_sqm).toBe(1048.66); // 317.22 × 3.305785
    expect(r.parsedRows[0].area_sqm).not.toBe(317.22);
  });

  it("blocking 메시지는 warnings 문자열 채널에 넣지 않는다 (패널에서만 표시)", () => {
    const msg = r.issues.find((i) => i.code === "AREA_UNIT_MISMATCH")!.message;
    expect(r.warnings).not.toContain(msg);
  });
});

describe("수식 캐시가 없는 파일 (uncached) — 면적이 사라지지 않는다", () => {
  const raw = fx("uncached_v1.5.xlsx");
  const r = parseRentRollWorkbook(raw, { now: NOW });

  it("픽스처 전제: AE/AF 캐시·C12/D12 머리글 값이 정말 없다", () => {
    const ws = sheetOf(raw);
    expect(ws["AE13"]?.v).toBeUndefined();
    expect(ws["AF13"]?.v).toBeUndefined();
    expect(String(ws["C12"]?.v ?? "").startsWith("임대면적(")).toBe(false);
  });

  it("G9 + C·D 로 직접 환산해 ΣAE 1,441.15 / ΣAF 1,175.00, 캐시 대조는 생략(경고 없음)", () => {
    expect(r.version).toBe("1.5");
    expect(r.areaSummary.leaseSqm).toBe(1441.15);
    expect(r.areaSummary.exclusiveSqm).toBe(1175);
    expect(r.parsedRows[0].area_sqm).toBe(317.22);
    expect(issueCodes(r)).not.toContain("AREA_CACHE_DIFF");
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
  });

  it("수식 머리글이 미계산이면 경고만 내고 위치 기준으로 계속 읽는다", () => {
    expect(issueCodes(r)).toContain("HEADER_MISMATCH");
    expect(r.rowCount).toBe(8);
    expect(r.monthlyRent).toBe(1946);
  });
});

describe("AE/AF 캐시 대조 (§6.3)", () => {
  it("캐시가 파서 환산값과 0.01 넘게 다르면 AREA_CACHE_DIFF 경고 — 값은 파서 환산을 쓴다", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb), "AE13", 999);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(issueCodes(r)).toContain("AREA_CACHE_DIFF");
    expect(r.parsedRows[0].area_sqm).toBe(317.22);
    expect(r.warnings.some((w) => w.includes("AE/AF"))).toBe(true);
  });

  it("차이가 0.01 이하이면 경고하지 않고, 캐시 0 이면 건너뛴다", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb), "AE13", 317.23);
    setCell(sheetOf(wb), "AE14", 0);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(issueCodes(r)).not.toContain("AREA_CACHE_DIFF");
  });

  it("G9 를 바꿔도(㎡→평) stale 캐시와 달라지면 경고 — 숫자는 G9 단위로 해석", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb), "G9", "평");
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(issueCodes(r)).toContain("AREA_CACHE_DIFF");
    expect(r.meta.area_input_unit).toBe("pyeong");
    expect(issueCodes(r)).toContain("AREA_UNIT_MISMATCH");
  });
});

describe("G9 읽기 (readAreaUnit)", () => {
  it("비어 있거나 알 수 없는 값은 ㎡ + AREA_UNIT_UNKNOWN 경고 (자동 보정 아님)", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const ws = sheetOf(wb);
    setCell(ws, "G9", null);
    expect(readAreaUnit(ws, "1.5")).toMatchObject({ unit: "sqm", issue: { code: "AREA_UNIT_UNKNOWN", level: "warning" } });
    setCell(ws, "G9", "ft2");
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.meta.area_input_unit).toBe("sqm");
    expect(issueCodes(r)).toContain("AREA_UNIT_UNKNOWN");
    expect(r.parsedRows[0].area_sqm).toBe(317.22);
  });
  it("v1.3·v1.4 는 G9 를 보지 않고 항상 ㎡", () => {
    const ws: XLSX.WorkSheet = { G9: { t: "s", v: "평" } };
    expect(readAreaUnit(ws, "1.3")).toEqual({ unit: "sqm" });
    expect(readAreaUnit(ws, "1.4")).toEqual({ unit: "sqm" });
  });
  it("'㎡<50 소수=평' 레거시 휴리스틱은 템플릿 파일에서 꺼져 있다", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const ws = sheetOf(wb);
    setCell(ws, "C14", 45.6);
    setCell(ws, "D14", 38.2);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.parsedRows[1]).toMatchObject({ area_sqm: 45.6, exclusive_area_sqm: 38.2 });
  });
});

describe("렌트롤 기준일 C5", () => {
  it("비어 있으면 AS_OF_MISSING 경고 + meta.rentroll_as_of null (오늘 기준)", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb), "C5", null);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.meta.rentroll_as_of).toBeNull();
    expect(issueCodes(r)).toContain("AS_OF_MISSING");
    expect(r.warnings.some((w) => w.includes("2025-06-01") || w.includes("기준일"))).toBe(true);
  });
  it("Date(cellDates) · 문자열 날짜도 YYYY-MM-DD", () => {
    const wb = fx("example_R3_v1.5.xlsx", { cellDates: true });
    expect(parseRentRollWorkbook(wb, { now: NOW }).meta.rentroll_as_of).toBe("2025-05-15");
    const wb2 = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb2), "C5", "2025.05.15");
    expect(parseRentRollWorkbook(wb2, { now: NOW }).meta.rentroll_as_of).toBe("2025-05-15");
    // cellDates 로 읽어도 행 날짜가 같다
    expect(parseRentRollWorkbook(wb, { now: NOW }).parsedRows[1].lease_end).toBe("2026-02-28");
  });
});

describe("v1.3 통합계약 파일 (§6.5) — 그대로 받고 새 필드는 null, 엑셀 캐시를 믿지 않는다", () => {
  const r = parseRentRollWorkbook(fx("group_v1.3.xlsx"), { now: NOW });
  it("버전 1.3 · 면적 ㎡ · 새 행 필드 null · 헤더 블록 IM 필드는 없음", () => {
    expect(r.version).toBe("1.3");
    expect(r.meta.area_input_unit).toBe("sqm");
    expect(r.meta.asking_price_krw).toBeUndefined();
    expect(r.meta.rentroll_as_of).toBe("2025-05-15");
    expect(r.parsedRows.every((p) => p.evidence_level === null && p.rent_free_months === null && p.payment_status === null)).toBe(true);
  });
  it("통합계약 비대표 행 금액은 undefined, 면적 합·금액 합은 v1.5 와 동일", () => {
    expect(r.rowCount).toBe(8);
    expect(r.monthlyRent).toBe(1946);
    expect(r.areaSummary.leaseSqm).toBe(1441.15);
    const nonRep = r.parsedRows.filter((p) => p.contract_group === "A").slice(1);
    expect(nonRep).toHaveLength(2);
    for (const g of nonRep) expect([g.rent_manwon, g.deposit_manwon, g.mgmt_fee_manwon]).toEqual([undefined, undefined, undefined]);
  });
  it("엑셀 C6(=TODAY() 캐시)이 아니라 C5 기준 — 만료 경고에 2025-05-15", () => {
    expect(r.warnings.some((w) => w.includes("2025-05-15"))).toBe(true);
  });
  it("v1.3 에는 J4 가 없으므로 V12 판정을 하지 않는다 (UNCHECKED 경고 소음 없음)", () => {
    expect(issueCodes(r)).not.toContain("AREA_UNIT_UNCHECKED");
    expect(issueCodes(r)).not.toContain("AREA_UNIT_MISMATCH");
  });
});

describe("머리글 검증은 접두어로만 (§6.2)", () => {
  it("수식 머리글이 계산된 캐시(임대면적(평))여도, 평범한 문자열이어도 경고 없이 통과", () => {
    const wb = fx("example_R3_평입력_v1.5.xlsx");
    const ws = sheetOf(wb);
    expect(String(ws["C12"].v)).toBe("임대면적(평)");
    expect(issueCodes(parseRentRollWorkbook(wb, { now: NOW }))).not.toContain("HEADER_MISMATCH");
    delete (ws["C12"] as any).f;
    setCell(ws, "D12", "전용면적(평) — 중개인 수정");
    expect(issueCodes(parseRentRollWorkbook(wb, { now: NOW }))).not.toContain("HEADER_MISMATCH");
  });

  it("한두 열 머리글이 달라도 위치 기준으로 읽고 HEADER_MISMATCH 경고만 낸다", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    setCell(sheetOf(wb), "G12", "예치금");
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(issueCodes(r)).toContain("HEADER_MISMATCH");
    expect(r.version).toBe("1.5");
    expect(r.totalDeposit).toBe(29000);
  });

  it("머리글 대부분이 틀리면 키워드 경로로 폴백 + VERSION_UNKNOWN", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const ws = sheetOf(wb);
    for (const c of ["A", "B", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) setCell(ws, `${c}12`, `x${c}`);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.version).toBe("unknown");
    expect(issueCodes(r)).toContain("VERSION_UNKNOWN");
  });
});

describe("Z/AA/AB 허용값 검증 — 밖의 값은 추측하지 않고 null + 경고", () => {
  it("근거·입금 enum 밖, 렌트프리 음수·소수", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const ws = sheetOf(wb);
    setCell(ws, "Z14", "카톡 캡처");
    setCell(ws, "AB14", "지연");
    setCell(ws, "AA14", -1);
    setCell(ws, "AA17", 1.5);
    setCell(ws, "AA18", 3);
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.parsedRows[1]).toMatchObject({ evidence_level: null, payment_status: null, rent_free_months: null });
    expect(r.parsedRows[4].rent_free_months).toBeNull();
    expect(r.parsedRows[5].rent_free_months).toBe(3);
    expect(r.warnings.filter((w) => w.includes("허용값") || w.includes("정수")).length).toBeGreaterThanOrEqual(3);
  });
});

describe("행 범위·예시 행·빈 양식", () => {
  it("빈 v1.5 양식(예시 행 13 만 있음)은 '읽을 수 있는 호실 없음' — 예시 행은 P열 표식으로 제외", () => {
    const wb = readWb(path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.5.xlsx"));
    expect(() => parseRentRollWorkbook(wb, { now: NOW })).toThrow(/읽을 수 있는 호실 데이터가 없습니다/);
  });
  it("112행까지 읽고 113행 이후는 무시", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const ws = sheetOf(wb);
    setCell(ws, "A112", "9F");
    setCell(ws, "E112", "학원");
    setCell(ws, "O112", "임대중");
    setCell(ws, "A113", "10F");
    setCell(ws, "E113", "무시");
    setCell(ws, "O113", "임대중");
    const r = parseRentRollWorkbook(wb, { now: NOW });
    expect(r.rowCount).toBe(9);
    expect(r.parsedRows.some((p) => p.floor === "10F")).toBe(false);
  });
  it("워크북이면 '렌트롤' 시트를 고르고, 워크시트를 직접 넘겨도 같은 결과", () => {
    const wb = fx("example_R3_v1.5.xlsx");
    const a = parseRentRollWorkbook(wb, { now: NOW });
    const b = parseRentRollWorkbook(sheetOf(wb), { now: NOW });
    expect(b.areaSummary).toEqual(a.areaSummary);
    expect(b.monthlyRent).toBe(a.monthlyRent);
  });
});

describe("레거시 회귀 — 비표준 파일은 기존 키워드 경로 그대로 (+ VERSION_UNKNOWN)", () => {
  it("v1.2 템플릿(빈 양식)은 기존과 같은 오류", () => {
    const wb = readWb(path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.2.xlsx"));
    expect(() => parseRentRollWorkbook(wb, { now: NOW })).toThrow(/읽을 수 있는 호실 데이터가 없습니다/);
  });

  it("prod-test L2: 워크북 경로 결과 == parseRentRollData(AoA) 결과 (전용면적 대용값 포함)", () => {
    const file = path.join(ROOT, "docs", "prod-test", "01-dangsan-income", "level-2-standard", "rentroll.xlsx");
    const wb = readWb(file);
    const ws = wb.Sheets["임대차현황"];
    const legacy = parseRentRollData(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][], { asOf: NOW });
    const r = parseRentRollWorkbook(ws, { now: NOW });
    expect(r.version).toBe("unknown");
    expect(r.meta.area_input_unit).toBe("sqm");
    expect(issueCodes(r)).toContain("VERSION_UNKNOWN");
    expect(r.rowCount).toBe(legacy.rowCount);
    expect(r.monthlyRent).toBe(legacy.monthlyRent);
    expect(r.totalDeposit).toBe(legacy.totalDeposit);
    expect(r.parsedRows).toEqual(legacy.parsedRows);
    for (const p of r.parsedRows) {
      expect(p.area_sqm_is_proxy).toBe(true);
      expect(p.evidence_level).toBeUndefined(); // 레거시 행에는 새 키가 없다
    }
  });

  it("prod-test L3 상세원장: 워크북 경로도 B1 임대 317.22 / 전용 265.4 / 자가사용", () => {
    const file = path.join(ROOT, "docs", "prod-test", "01-dangsan-income", "level-3-verified", "rentroll.xlsx");
    const wb = readWb(file);
    const r = parseRentRollWorkbook(wb.Sheets["상세원장_검증본"], { now: NOW });
    const b1 = r.parsedRows.find((p) => p.floor === "B1층")!;
    expect(b1).toMatchObject({ area_sqm: 317.22, exclusive_area_sqm: 265.4, lease_state: "자가사용" });
    expect(r.issues.filter((i) => i.level === "blocking")).toHaveLength(0);
  });

  it("파서 경고 문구는 최신 양식을 v1.5 로 안내", () => {
    const file = path.join(ROOT, "docs", "prod-test", "01-dangsan-income", "level-2-standard", "rentroll.xlsx");
    const wb = readWb(file);
    const r = parseRentRollWorkbook(wb.Sheets["임대차현황"], { now: NOW });
    const w = r.warnings.find((x) => x.includes("임대면적 열이 없어"))!;
    expect(w).toContain("v1.5");
    expect(w).not.toContain("v1.3");
  });
});

describe("parseRentRollData(AoA) 레거시 시그니처 불변", () => {
  it("version unknown · meta sqm · issues [] 기본값", () => {
    const r = parseRentRollData([
      ["층", "임대면적(㎡)", "전용면적(㎡)", "업종", "보증금(만원)", "월세(만원)"],
      ["1F", 30, 20, "카페", 5000, 300],
    ]);
    expect(r.version).toBe("unknown");
    expect(r.meta).toEqual({ area_input_unit: "sqm" });
    expect(r.issues).toEqual([]);
    expect(r.parsedRows[0].evidence_level).toBeUndefined();
  });
});
