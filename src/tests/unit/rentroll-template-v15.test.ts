/**
 * 렌트롤 표준양식 v1.5 — 템플릿 구조 계약 테스트
 *
 * public/CREDEAL_rentroll_template_v1.5.xlsx 는 사용자 소유 수작업 정본이다(생성기 없음, scripts/build-rentroll-template.mjs 는 v1.3 레거시).
 * 이 테스트는 파서·픽스처 생성기가 의존하는 구조를 잠근다:
 *  A1 제목 · 4개 시트 · G9 유효성 목록 ㎡,평 · C12/D12 수식 머리글 · AE/AF/Q/R/Y/AC/AD 수식 · 자동검증 V01~V13 행
 * (스펙: docs/RENTROLL_v1.3_to_v1.5.md §2, §3.2)
 */
import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

const ROOT = process.cwd();
const V15 = path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.5.xlsx");

const formulaOf = (cell: ExcelJS.Cell): string => {
  const v = cell.value as any;
  return v && typeof v === "object" && typeof v.formula === "string" ? v.formula : "";
};
const textOf = (cell: ExcelJS.Cell): string => {
  const v = cell.value as any;
  if (v == null) return "";
  if (typeof v === "object" && Array.isArray(v.richText)) return v.richText.map((r: any) => r.text).join("");
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  return String(v);
};

describe("렌트롤 템플릿 v1.5 — 구조 계약", () => {
  let wb: ExcelJS.Workbook;
  let ws: ExcelJS.Worksheet;
  let check: ExcelJS.Worksheet;

  beforeAll(async () => {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(V15);
    ws = wb.getWorksheet("렌트롤")!;
    check = wb.getWorksheet("자동검증")!;
  });

  it("v1.2·v1.3 템플릿은 레거시 회귀 테스트용으로 그대로 남아 있다", () => {
    expect(fs.existsSync(path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.2.xlsx"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.3.xlsx"))).toBe(true);
  });

  it("A1 제목에 v1.5, 시트 4개(기입요령·렌트롤·자동검증·컬럼정의)", () => {
    expect(wb.worksheets.map((s) => s.name)).toEqual(["기입요령", "렌트롤", "자동검증", "컬럼정의"]);
    expect(textOf(ws.getCell("A1"))).toMatch(/v1\.5/);
    // 업로더 시트 탐지(이름에 '렌트롤' 포함)가 '렌트롤'에 걸린다
    expect(wb.worksheets.map((s) => s.name).find((n) => n.includes("렌트롤"))).toBe("렌트롤");
  });

  it("G9 = 면적 단위 드롭다운(㎡,평) · 기본 ㎡ · F9 라벨", () => {
    const g9 = ws.getCell("G9");
    expect(g9.value).toBe("㎡");
    expect(g9.dataValidation?.type).toBe("list");
    expect(g9.dataValidation?.formulae?.[0]).toBe('"㎡,평"');
    expect(textOf(ws.getCell("F9"))).toContain("면적 단위");
  });

  it("C12/D12 는 G9 를 따라가는 수식 머리글 — 완전 일치가 아니라 접두어로 검증해야 한다", () => {
    expect(formulaOf(ws.getCell("C12"))).toBe('"임대면적("&$G$9&")"');
    expect(formulaOf(ws.getCell("D12"))).toBe('"전용면적("&$G$9&")"');
  });

  it("C6 평가 기준일 = IF(C5=\"\",TODAY(),C5)", () => {
    expect(formulaOf(ws.getCell("C6"))).toBe('IF(C5="",TODAY(),C5)');
  });

  it("머리글 12행: A..P 입력 / Q..Y 자동 / Z..AB 입력 / AC·AD 자동 / AE·AF ㎡ 환산", () => {
    const h = (a: string) => textOf(ws.getCell(`${a}12`));
    expect(h("A")).toBe("호실/층");
    expect(h("B")).toBe("계약그룹");
    for (const [c, p] of [["G", "보증금"], ["H", "월세"], ["I", "관리비"], ["O", "임대상태"], ["P", "비고"], ["Q", "임대면적(평)"], ["R", "전용면적(평)"], ["Y", "전용평당 월비용"], ["Z", "근거"], ["AA", "렌트프리"], ["AB", "입금 확인"], ["AC", "만기 구간"], ["AD", "금액 판정"], ["AE", "임대면적(㎡"], ["AF", "전용면적(㎡"]] as const) {
      expect(h(c).startsWith(p), `${c}12 '${h(c)}'`).toBe(true);
    }
  });

  it("AE/AF 환산 수식 (13·112행) — G9=평 이면 ×3.305785, ROUND 2", () => {
    for (const r of [13, 14, 112]) {
      expect(formulaOf(ws.getCell(`AE${r}`))).toBe(`IF(OR($A${r}="",C${r}=""),"",ROUND(C${r}*IF($G$9="평",3.305785,1),2))`);
      expect(formulaOf(ws.getCell(`AF${r}`))).toBe(`IF(OR($A${r}="",D${r}=""),"",ROUND(D${r}*IF($G$9="평",3.305785,1),2))`);
    }
    expect(formulaOf(ws.getCell("AE10"))).toBe("SUM(AE13:AE112)");
    expect(formulaOf(ws.getCell("AF10"))).toBe("SUM(AF13:AF112)");
    expect(formulaOf(ws.getCell("C10"))).toBe("SUM(C13:C112)");
  });

  it("Q/R 은 AE/AF(㎡ 환산) 기준, Y 는 통합계약 그룹 전용면적 합(AF) 기준", () => {
    expect(formulaOf(ws.getCell("Q13"))).toContain("AE13/3.305785");
    expect(formulaOf(ws.getCell("R13"))).toContain("AF13/3.305785");
    const y = formulaOf(ws.getCell("Y13"));
    expect(y).toContain("AF13/3.305785");
    expect(y).toContain("SUMIFS($AF$13:$AF$112,$B$13:$B$112,B13)/3.305785");
    expect(y).toContain('COUNTIFS($B$13:$B$112,B13,$D$13:$D$112,"")>0');
  });

  it("AC 만기 구간(EDATE 12개월)·AD 금액 판정(계약그룹 대표 행) 수식", () => {
    const ac = formulaOf(ws.getCell("AC13"));
    expect(ac).toContain("EDATE($C$6,12)");
    for (const w of ["만료 경과", "12개월 내", "12개월 초과", "만료일 없음"]) expect(ac).toContain(w);
    const ad = formulaOf(ws.getCell("AD13"));
    for (const w of ["월세 누락", "관리비 누락", "금액 중복", "OK"]) expect(ad).toContain(w);
    expect(ad).toContain('COUNTIFS($B$13:$B$112,B13,$H$13:$H$112,"<>")');
  });

  it("예시 행 13: 입력은 예시, P13 '예시 행' 표식 (파서 제외 규칙)", () => {
    expect(textOf(ws.getCell("P13"))).toMatch(/예시\s*행/);
  });

  it("데이터 입력 범위는 13~112행 (112행에도 환산 수식, 113행 이후 없음)", () => {
    expect(formulaOf(ws.getCell("AE112"))).not.toBe("");
    expect(formulaOf(ws.getCell("AE113"))).toBe("");
  });

  it("자동검증 V01~V13 행 (35~47행)", () => {
    const ids = Array.from({ length: 13 }, (_, i) => `V${String(i + 1).padStart(2, "0")}`);
    ids.forEach((id, i) => expect(textOf(check.getCell(`A${35 + i}`)), `A${35 + i}`).toBe(id));
    // 면적 합계는 ㎡ 환산 열(AE/AF)을 쓴다
    expect(formulaOf(check.getCell("C5"))).toContain("렌트롤!$AE$13:$AE$112");
    expect(formulaOf(check.getCell("C6"))).toContain("렌트롤!$AF$13:$AF$112");
    // V03/V12 는 J4 연면적(㎡ 고정)과 AE 합을 비교, V12 임계값 2 / 0.45
    expect(formulaOf(check.getCell("C37"))).toContain("렌트롤!$J$4");
    const v12 = formulaOf(check.getCell("C46"));
    expect(v12).toContain("AE");
    expect(v12).toContain(">2");
    expect(v12).toContain("<0.45");
    // V13 입력 단위 표시
    expect(formulaOf(check.getCell("C47"))).toContain("렌트롤!$G$9");
  });

  it("IM 연계 입력 블록: J3 매각가 / J4 연면적(㎡ 고정) / J5~J7 시장 임대료 / J8 기타수입", () => {
    expect(textOf(ws.getCell("H3"))).toContain("매각");
    expect(textOf(ws.getCell("H4"))).toMatch(/연면적.*㎡/);
    expect(textOf(ws.getCell("H5"))).toContain("1층");
    expect(textOf(ws.getCell("H6"))).toContain("지상층");
    expect(textOf(ws.getCell("H7"))).toContain("지하층");
    expect(textOf(ws.getCell("H8"))).toContain("기타수입");
  });
});
