/**
 * 렌트롤 표준양식 v1.3 — 파서 + 템플릿 계약 테스트
 *
 * 검증 대상
 *  1) public/CREDEAL_rentroll_template_v1.3.xlsx 의 구조(시트/머리글/해상도 행) — 생성기와 파서의 컬럼 계약
 *  2) 임대면적 · 전용면적 · 전용률 파싱 (㎡/평/레거시 단일 면적 컬럼)
 *  3) 합계 행 · 예시 행 · 자동열만 채워진 빈 행 제외, 임대상태(자가사용) 처리
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import path from "node:path";
import fs from "node:fs";
import { parseRentRollData } from "@/lib/rentroll/parse-rentroll-sheet";

const ROOT = process.cwd();
const V13 = path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.3.xlsx");
const V12 = path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.2.xlsx");

function sheetRows(file: string, sheetName: string): any[][] {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const ws = wb.Sheets[sheetName];
  expect(ws, `${sheetName} 시트`).toBeTruthy();
  return XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
}

/** 템플릿의 머리글(1~12행)을 그대로 쓰고 데이터 행만 교체한 AoA */
function withRows(file: string, sheetName: string, headerRowCount: number, dataRows: any[][]): any[][] {
  const rows = sheetRows(file, sheetName);
  return [...rows.slice(0, headerRowCount), ...dataRows];
}

const col = (letter: string) => letter.charCodeAt(0) - 65;
/** v1.3 렌트롤 행 생성 (A..P 입력 + Q..Y 자동열은 비움 또는 캐시 값) */
function v13Row(v: Record<string, any>, auto: Record<string, any> = {}): any[] {
  const row: any[] = new Array(25).fill("");
  for (const [k, val] of Object.entries({ ...v, ...auto })) row[col(k)] = val;
  return row;
}

describe("렌트롤 템플릿 v1.3 — 구조 계약", () => {
  const rows = sheetRows(V13, "렌트롤");
  const grade = rows[10]; // 11행
  const header = rows[11]; // 12행

  it("4개 시트(기입요령·렌트롤·자동검증·컬럼정의), 렌트롤이 업로더의 시트 탐지에 걸린다", () => {
    const wb = XLSX.read(fs.readFileSync(V13), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["기입요령", "렌트롤", "자동검증", "컬럼정의"]);
    // importer 의 시트 탐지: name.includes('렌트롤') || lower.includes('rent') — 첫 번째 일치가 '렌트롤'이어야 한다
    const found = wb.SheetNames.find((n) => n.includes("렌트롤") || n.toLowerCase().includes("rent"));
    expect(found).toBe("렌트롤");
  });

  it("임대면적·전용면적·전용률 컬럼이 존재하고 해상도(R2/R2*)가 표시된다", () => {
    expect(header[col("C")]).toBe("임대면적(㎡)");
    expect(header[col("D")]).toBe("전용면적(㎡)");
    expect(header[col("S")]).toBe("전용률(%)");
    expect(grade[col("C")]).toBe("R2");
    expect(grade[col("D")]).toBe("R2*");
  });

  it("R1/R2/R3 해상도 행이 resolveLedger 요건과 일치한다", () => {
    const gradeOf = (title: string) => grade[header.indexOf(title)];
    // R1: 호실·업종·보증금·월세·만료일·임대상태
    for (const t of ["호실/층", "업종/상호 (원문)", "보증금(원)", "월세(원,VAT별도)", "현 계약 만료일", "임대상태"]) {
      expect(gradeOf(t), t).toBe("R1");
    }
    // R2: 계약그룹·임대면적·적용법령·관리비·현 계약 시작일
    for (const t of ["계약그룹", "임대면적(㎡)", "적용법령", "관리비(원,VAT별도)", "현 계약 시작일"]) {
      expect(gradeOf(t), t).toBe("R2");
    }
    // R3: 최초계약일·갱신요구권·대항력
    for (const t of ["최초 계약일", "갱신요구권 행사", "대항력 요건"]) {
      expect(gradeOf(t), t).toBe("R3");
    }
  });

  it("빈 양식 업로드는 '읽을 수 있는 호실 없음' 오류 — 예시 행/합계 행/빈 자동열 행이 호실로 집계되지 않는다", () => {
    expect(() => parseRentRollData(rows)).toThrow(/읽을 수 있는 호실 데이터가 없습니다/);
  });
});

describe("parseRentRollData — v1.3 양식", () => {
  const base = sheetRows(V13, "렌트롤");

  it("임대면적·전용면적·전용률을 분리 파싱하고 전용률을 면적으로 계산한다", () => {
    const aoa = withRows(V13, "렌트롤", 12, [
      v13Row({ A: "1F", C: 100, D: 75, E: "카페", F: "상가", G: 50000000, H: 3000000, I: 300000, L: 46477, O: "임대중" }, { Q: 30.25, R: 22.69, S: 75, W: "유효" }),
      v13Row({ A: "2F", C: 120.5, D: 90.38, E: "사무실", F: "상가", G: 30000000, H: 2000000, I: 200000, L: 46477, O: "임대중" }),
      v13Row({ A: "3F", C: 80, E: "공실", O: "공실" }), // 전용면적 미기재
      v13Row({}, { W: "만료일 없음", X: 0 }), // 자동열만 채워진 빈 행 → 제외
      ["합계", "", 300.5, 165.38, "", "", 80000000, 5000000, 500000], // 합계 행 → 제외
    ]);
    const r = parseRentRollData(aoa);

    expect(r.rowCount).toBe(3);
    expect(r.detectedHeaderRow).toBe(12);
    const [f1, f2, f3] = r.parsedRows;
    expect(f1).toMatchObject({ floor: "1F", area_sqm: 100, exclusive_area_sqm: 75, efficiency_ratio_pct: 75 });
    expect(f2.area_sqm).toBe(120.5);
    expect(f2.exclusive_area_sqm).toBe(90.38);
    expect(f2.efficiency_ratio_pct).toBeCloseTo(75, 0);
    expect(f3).toMatchObject({ floor: "3F", area_sqm: 80, is_vacant: true, lease_state: "공실" });
    expect(f3.exclusive_area_sqm).toBeUndefined();
    expect(f3.efficiency_ratio_pct).toBeUndefined();

    // 금액: 머리글 '(원' → 만원 변환
    expect(f1.deposit_manwon).toBe(5000);
    expect(f1.rent_manwon).toBe(300);
    expect(f1.mgmt_fee_manwon).toBe(30);
    expect(r.unitDetected).toBe("won");
    expect(r.monthlyRent).toBe(300 + 200);
    // 만료일 시리얼 → ISO
    expect(f1.lease_end).toBe("2027-03-31"); // 시리얼 46477

    // 면적 요약: 가중 전용률은 두 면적이 모두 있는 호실만 (3F 제외)
    expect(r.areaSummary.leaseSqm).toBeCloseTo(300.5, 2);
    expect(r.areaSummary.exclusiveSqm).toBeCloseTo(165.38, 2);
    expect(r.areaSummary.rowsWithBothAreas).toBe(2);
    expect(r.areaSummary.rowsMissingExclusive).toBe(1);
    expect(r.areaSummary.weightedEfficiencyPct).toBeCloseTo(75, 0);
    expect(r.vacancyPct).toBe(33);
  });

  it("전용면적이 임대면적보다 크면 경고하고 값은 그대로 둔다(조용히 고치지 않음)", () => {
    const aoa = withRows(V13, "렌트롤", 12, [
      v13Row({ A: "1F", C: 50, D: 80, E: "약국", F: "상가", G: 1000000, H: 100000, O: "임대중", L: 46477 }),
    ]);
    const r = parseRentRollData(aoa);
    expect(r.parsedRows[0]).toMatchObject({ area_sqm: 50, exclusive_area_sqm: 80 });
    expect(r.parsedRows[0].efficiency_ratio_pct).toBeGreaterThan(100);
    expect(r.warnings.some((w) => w.includes("전용면적") && w.includes("보다 큽니다"))).toBe(true);
  });

  it("임대면적 + 전용률만 있으면 전용면적을 역산하고, 입력 전용률이 면적 계산과 1%p 넘게 다르면 경고한다", () => {
    const derive = parseRentRollData(
      withRows(V13, "렌트롤", 12, [v13Row({ A: "1F", C: 200, E: "의원", O: "임대중", L: 46477, H: 1000000, G: 1000000 }, { S: 70 })]),
    );
    expect(derive.parsedRows[0].exclusive_area_sqm).toBe(140);
    expect(derive.parsedRows[0].efficiency_ratio_pct).toBe(70);

    const mismatch = parseRentRollData(
      withRows(V13, "렌트롤", 12, [v13Row({ A: "1F", C: 100, D: 60, E: "의원", O: "임대중", L: 46477, H: 1000000, G: 1000000 }, { S: 80 })]),
    );
    expect(mismatch.parsedRows[0].efficiency_ratio_pct).toBe(60); // 면적 기준
    expect(mismatch.warnings.some((w) => w.includes("전용률"))).toBe(true);
  });

  it("자가사용은 공실로 세지 않고, downstream isOwnerUse 가 인식하도록 note 에 키워드를 보장한다", () => {
    const r = parseRentRollData(
      withRows(V13, "렌트롤", 12, [
        v13Row({ A: "B1", C: 300, D: 250, E: "카페", O: "자가사용", P: "소유자 직영" }),
        v13Row({ A: "1F", C: 100, D: 80, E: "공실", O: "공실" }),
        v13Row({ A: "2F", C: 100, D: 80, E: "학원", O: "임대중", H: 2000000, G: 10000000, L: 46477 }),
      ]),
    );
    const b1 = r.parsedRows[0];
    expect(b1.lease_state).toBe("자가사용");
    expect(b1.is_vacant).toBeUndefined();
    expect(b1.note).toMatch(/자가|직영/);
    // 공실률 분모에서 자가사용 제외: 공실 1 / (3-1)
    expect(r.vacancyPct).toBe(50);
  });

  it("㎡ 머리글이면 소수점이 있는 50㎡ 미만 면적을 평으로 오인하지 않는다 (레거시 휴리스틱 회귀 방지)", () => {
    const r = parseRentRollData(
      withRows(V13, "렌트롤", 12, [v13Row({ A: "1F", C: 45.6, D: 38.2, E: "편의점", O: "임대중", H: 1000000, G: 5000000, L: 46477 })]),
    );
    expect(r.parsedRows[0].area_sqm).toBe(45.6);
    expect(r.parsedRows[0].exclusive_area_sqm).toBe(38.2);
  });

  it("행이 100개를 넘지 않는 한 합계 행이 머리글 위에 있어도 헤더를 찾는다 (13행 이후 데이터)", () => {
    // base 의 1~12행은 (물건명 메타 + 합계 행 + 해상도 행 + 머리글) — 비어 있지 않은 행이 11개 이상이다
    expect(base.slice(0, 12).filter((r) => r.some((c: any) => String(c ?? "").trim() !== "")).length).toBeGreaterThanOrEqual(10);
    const r = parseRentRollData(withRows(V13, "렌트롤", 12, [v13Row({ A: "1F", C: 10, E: "x", O: "임대중", H: 1, G: 1, L: 46477 })]));
    expect(r.rowCount).toBe(1);
  });
});

describe("parseRentRollData — 레거시 호환", () => {
  it("v1.2 양식(임대면적만, 합계 행 하단, 자동열)에서 합계/빈 행을 호실로 세지 않는다", () => {
    const row = (v: Record<string, any>, auto: Record<string, any> = {}) => {
      const a: any[] = new Array(21).fill("");
      for (const [k, val] of Object.entries({ ...v, ...auto })) a[col(k)] = val;
      return a;
    };
    const aoa = withRows(V12, "렌트롤", 12, [
      row({ A: "1F", C: 100, D: "카페", E: "상가", F: 50000000, G: 3000000, H: 300000, N: "임대중", K: 46477 }, { P: 30.2, T: "유효", U: 3300000 }),
      row({}, { T: "만료일 없음", U: 0 }),
      row({}, { T: "만료일 없음", U: 0 }),
      row({ A: "합계", C: 100, F: 50000000, G: 3000000, H: 300000 }),
    ]);
    const r = parseRentRollData(aoa);
    expect(r.rowCount).toBe(1);
    expect(r.parsedRows[0]).toMatchObject({ floor: "1F", area_sqm: 100, rent_manwon: 300, deposit_manwon: 5000 });
    expect(r.parsedRows[0].exclusive_area_sqm).toBeUndefined();
  });

  it("레거시: '전용면적'만 있는 양식은 전용면적으로 보존하되 area_sqm 은 대용 플래그로 표시하고 전용률은 만들지 않는다", () => {
    const aoa = sheetRows(path.join(ROOT, "docs", "prod-test", "01-dangsan-income", "level-2-standard", "rentroll.xlsx"), "임대차현황");
    const r = parseRentRollData(aoa);
    expect(r.rowCount).toBe(aoa.length - 1);
    for (const p of r.parsedRows) {
      expect(p.exclusive_area_sqm).toBeGreaterThan(0);
      expect(p.area_sqm).toBe(p.exclusive_area_sqm); // 면적 연산용 대용값(기존 동작 유지)
      expect(p.area_sqm_is_proxy).toBe(true);
      expect(p.efficiency_ratio_pct).toBeUndefined(); // 가짜 100% 전용률 금지
    }
    // 대용 임대면적은 임대면적 합계·가중 전용률에 섞이지 않는다
    expect(r.areaSummary.leaseSqm).toBe(0);
    expect(r.areaSummary.exclusiveSqm).toBeGreaterThan(0);
    expect(r.areaSummary.weightedEfficiencyPct).toBeUndefined();
    expect(r.warnings.some((w) => w.includes("임대면적 열이 없어"))).toBe(true);
  });

  it("골든 L3 상세원장(임대면적·전용면적·임대구분)을 읽는다", () => {
    const aoa = sheetRows(path.join(ROOT, "docs", "prod-test", "01-dangsan-income", "level-3-verified", "rentroll.xlsx"), "상세원장_검증본");
    const r = parseRentRollData(aoa);
    const b1 = r.parsedRows.find((p) => p.floor === "B1층")!;
    expect(b1).toMatchObject({ area_sqm: 317.22, exclusive_area_sqm: 265.4, lease_state: "자가사용" });
    expect(b1.efficiency_ratio_pct).toBeCloseTo(83.66, 1);
    expect(r.areaSummary.rowsWithBothAreas).toBe(r.rowCount);
    expect(r.warnings.filter((w) => w.includes("큽니다"))).toHaveLength(0);
  });

  it("평 단위 머리글/셀은 ㎡로 환산한다", () => {
    const aoa = [
      ["층", "임대면적(평)", "전용면적(평)", "업종", "보증금(만원)", "월세(만원)"],
      ["1F", 30, 20, "카페", 5000, 300],
      ["2F", "30평", "20평", "사무실", 3000, 200],
    ];
    const r = parseRentRollData(aoa);
    expect(r.parsedRows[0].area_sqm).toBeCloseTo(99.17, 1);
    expect(r.parsedRows[0].exclusive_area_sqm).toBeCloseTo(66.12, 1);
    expect(r.parsedRows[1].area_sqm).toBeCloseTo(99.17, 1);
    expect(r.unitDetected).toBe("manwon");
    expect(r.parsedRows[0].deposit_manwon).toBe(5000);
  });
});
