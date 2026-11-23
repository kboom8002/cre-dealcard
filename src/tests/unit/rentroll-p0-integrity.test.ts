/**
 * P0 렌트롤 데이터 무결성 통합 단위 테스트 (A1-01 ~ A1-05)
 *
 * 검증 범위:
 *  - A1-01/A1-02: 템플릿·CASE-04/05 워크북 Row 10 합계 및 자동검증 수식의 13행('[예시]'/'예시 행') 제외 + B1 B102호 15행 정합성
 *  - A1-03: isExampleRentRollRow 단일 SSOT 및 Excel/TSV/AI-text 파서 3종 일관 제외 + 정상 '3F 치과'/'5F 사무실' 보존
 *  - A1-04: parse-text API 구조화 TSV/마크다운 파이프 표 결정론적 단락(LLM 미호출) + AI 스키마 11개 신규 필드 및 maxTokens 4096
 *  - A1-05: 가짜 `${idx + 1}01호` / `1301호` 호실 합성 제거 (전층 계약은 빈 unit 유지)
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCallLLM, mockRequireBroker } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockRequireBroker: vi.fn(async () => ({ error: null, broker: { id: "broker-test" } })),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireBroker: mockRequireBroker,
}));

vi.mock("@/ai/llm-client", () => ({
  callLLM: mockCallLLM,
}));

vi.mock("@/ai/model-selector", () => ({
  getModel: vi.fn(() => "mock-luna-model"),
}));

import { POST as parseTextPost } from "@/app/api/broker/rent-roll/parse-text/route";
import { mapRentRollImportPayloadToRows } from "@/app/(broker)/broker/w/im/_components/im-workspace-types";
import { synthesizeQuickRecordFromImItem } from "@/lib/im-lite/quick-generate-store";
import { parseTsvRentRoll } from "@/lib/rent-roll/tsv-parser";
import { isExampleRentRollRow } from "@/lib/rentroll/example-row";
import { parseRentRollData } from "@/lib/rentroll/parse-rentroll-sheet";
import { parseRentRollWorkbook } from "@/lib/rentroll/parse-rentroll-workbook";
import { normalizeTextParsedRentRoll } from "@/lib/rentroll/text-parse-normalize";
import { HOLDOUT_V2_CASE04_STABILIZED_TSV } from "@/lib/testguide/full-loop-v2-holdout-data";
import { mapDocumentRowToImSummary } from "@/lib/workspace/summary/get-summary-mergers";

const ROOT = process.cwd();
const CASE04_DIR = path.join(ROOT, "docs", "finaltest", "testdata", "CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합");
const CASE05_DIR = path.join(ROOT, "docs", "finaltest", "testdata", "CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스");
const CASE04_STABILIZED_XLSX = path.join(CASE04_DIR, "03_안정화_렌트롤_v1.5_sqm.xlsx");
const CASE04_STABILIZED_TSV_FILE = path.join(CASE04_DIR, "04_안정화_서브탭_화면붙여넣기.tsv");
const CASE05_STABILIZED_XLSX = path.join(CASE05_DIR, "03_안정화_렌트롤_v1.5_pyeong.xlsx");

function formulaOf(cell: ExcelJS.Cell): string {
  const v = cell.value as { formula?: string } | null | undefined;
  return v && typeof v === "object" && typeof v.formula === "string" ? v.formula : "";
}

describe("A1-01 & A1-02: CASE-04/05 Row 13 제외 수식·캐시값 및 15행 TSV 정합성", () => {
  it("CASE-04 안정화 xlsx Row 10 합계와 자동검증 캐시값이 13행 예시를 제외하고 정확히 계산된다", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CASE04_STABILIZED_XLSX);
    const ws = wb.getWorksheet("렌트롤")!;
    const chk = wb.getWorksheet("자동검증")!;

    for (const col of ["C", "D", "G", "H", "I", "AE", "AF"]) {
      const f = formulaOf(ws.getCell(`${col}10`));
      expect(f, `${col}10 formula`).toContain("SUMIFS");
      expect(f, `${col}10 formula`).toContain('"<>[예시]*"');
      expect(f, `${col}10 formula`).toContain('"<>*예시 행*"');
    }

    expect(ws.getCell("C10").result).toBeCloseTo(1441.15, 2);
    expect(ws.getCell("D10").result).toBeCloseTo(1157.9, 2);
    expect(ws.getCell("G10").result).toBe(590_000_000);
    expect(ws.getCell("H10").result).toBe(34_800_000);
    expect(ws.getCell("I10").result).toBe(2_740_000);
    expect(ws.getCell("AE10").result).toBeCloseTo(1441.15, 2);
    expect(ws.getCell("AF10").result).toBeCloseTo(1157.9, 2);

    expect(chk.getCell("C4").result).toBe("34,800,000원");
    expect(chk.getCell("C37").result).toBe("100.0%");
    expect(chk.getCell("C38").result).toBe("3.83%");
    expect(chk.getCell("C39").result).toBe("3.92%");
    expect(chk.getCell("C46").result).toBe("정상");
  });

  it("CASE-05 평 입력 안정화 xlsx도 Row 10 SUMIFS가 13행 예시(30평/300만원)를 제외한다", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CASE05_STABILIZED_XLSX);
    const ws = wb.getWorksheet("렌트롤")!;
    expect(formulaOf(ws.getCell("C10"))).toContain("SUMIFS");
    expect(ws.getCell("B13").value ?? "").toBe("");

    const parsed = parseRentRollWorkbook(XLSX.read(fs.readFileSync(CASE05_STABILIZED_XLSX), { type: "buffer" }));
    expect(parsed.parsedRows.some((r) => /\[예시\]/.test(r.floor))).toBe(false);
    expect(Number(ws.getCell("H10").result)).toBe(parsed.monthlyRent * 10_000);
  });

  it("CASE-04 안정화 TSV 파일·홀드아웃 상수·안정화 xlsx가 모두 B1 B102호 기계실 포함 15행으로 일치한다", () => {
    const fileTsv = fs.readFileSync(CASE04_STABILIZED_TSV_FILE, "utf-8");
    const parsedFileTsv = parseTsvRentRoll(fileTsv);
    const parsedConstTsv = parseTsvRentRoll(HOLDOUT_V2_CASE04_STABILIZED_TSV);
    const parsedXlsx = parseRentRollWorkbook(XLSX.read(fs.readFileSync(CASE04_STABILIZED_XLSX), { type: "buffer" }));

    expect(parsedFileTsv.rows).toHaveLength(15);
    expect(parsedConstTsv.rows).toHaveLength(15);
    expect(parsedXlsx.parsedRows).toHaveLength(15);

    const mechFile = parsedFileTsv.rows.find((r) => r.floor === "B1" && r.unit === "B102호");
    const mechConst = parsedConstTsv.rows.find((r) => r.floor === "B1" && r.unit === "B102호");
    const mechXlsx = parsedXlsx.parsedRows.find((r) => r.floor.includes("B102호") || r.unit_label === "B102호");
    expect(mechFile?.status).toBe("owner");
    expect(mechFile?.areaSqm).toBe(45);
    expect(mechConst?.status).toBe("owner");
    expect(mechXlsx?.lease_state).toBe("자가사용");
    expect(mechXlsx?.area_sqm).toBe(45);

    expect(parsedFileTsv.totalDepositManwon).toBe(59_000);
    expect(parsedFileTsv.totalMonthlyRentManwon).toBe(3_480);
    expect(parsedFileTsv.totalMaintenanceManwon).toBe(274);
    expect(parsedConstTsv.totalDepositManwon).toBe(59_000);
    expect(parsedConstTsv.totalMonthlyRentManwon).toBe(3_480);
    expect(parsedXlsx.totalDeposit).toBe(59_000);
    expect(parsedXlsx.monthlyRent).toBe(3_480);
  });
});

describe("A1-03: [예시] 13행 통합 제외 및 정상 3F/사무실 보존", () => {
  it("isExampleRentRollRow는 [예시] 행과 무수정 레거시(3F+사무실+예시 행)만 제외하고 실제 3F 치과·5F 사무실은 살린다", () => {
    expect(isExampleRentRollRow({ floor: "[예시] 3F", biz: "사무실" })).toBe(true);
    expect(isExampleRentRollRow({ floor: "3F", biz: "사무실", note: "예시 행 — 참고용" })).toBe(true);
    expect(isExampleRentRollRow({ floor: "", biz: "아무개", note: "예시 행" })).toBe(true);

    expect(isExampleRentRollRow({ floor: "3F", biz: "치과", note: "예시 행 참고" })).toBe(false);
    expect(isExampleRentRollRow({ floor: "5F", biz: "사무실", note: "" })).toBe(false);
    expect(isExampleRentRollRow({ floor: "3F", biz: "한강소프트", tenantName: "한강소프트", note: "예시 행 아님" })).toBe(false);
  });

  it("parseRentRollData, parseTsvRentRoll, normalizeTextParsedRentRoll 모두 일관되게 [예시] 행을 제외한다", () => {
    const aoa = [
      ["층", "호실", "업종", "임차인", "임대면적(㎡)", "보증금(만원)", "월세(만원)", "비고"],
      ["[예시] 3F", "", "사무실", "예시상사", 99, 5000, 300, "예시 행 — 입력 시 삭제"],
      ["3F", "301호", "치과", "연세치과", 120, 4000, 250, ""],
      ["5F", "", "사무실", "한강소프트", 180, 3000, 200, ""],
    ];
    const sheetRes = parseRentRollData(aoa);
    expect(sheetRes.parsedRows).toHaveLength(2);
    expect(sheetRes.monthlyRent).toBe(450);

    const tsv = [
      "층\t호실\t업종\t임차인\t임대면적(㎡)\t보증금(만원)\t월세(만원)\t비고",
      "[예시] 3F\t\t사무실\t예시상사\t99\t5000\t300\t예시 행",
      "3F\t301호\t치과\t연세치과\t120\t4000\t250\t",
      "합계\t\t\t\t120\t4000\t250\t",
    ].join("\n");
    const tsvRes = parseTsvRentRoll(tsv);
    expect(tsvRes.rows).toHaveLength(1);
    expect(tsvRes.rows[0].floor).toBe("3F");
    expect(tsvRes.totalMonthlyRentManwon).toBe(250);

    const normRes = normalizeTextParsedRentRoll({
      floorLeases: [
        { floor: "[예시] 3F", tenant_type: "사무실", deposit_manwon: 5000, rent_manwon: 300, is_vacant: false },
        { floor: "3F", tenant_type: "치과", deposit_manwon: 4000, rent_manwon: 250, is_vacant: false },
      ],
      monthlyRent: 550,
      totalDeposit: 9000,
      mgmtFeeTotal: 0,
      vacancyPct: 0,
    });
    expect(normRes.floorLeases).toHaveLength(1);
    expect(normRes.monthlyRent).toBe(250);
    expect(normRes.totalDeposit).toBe(4000);
  });
});

describe("A1-04: parse-text 구조화 표 결정론적 단락 및 AI 스키마 확장", () => {
  beforeEach(() => {
    mockCallLLM.mockReset();
    mockRequireBroker.mockClear();
  });

  it("구조화 TSV([예시]/합계 포함) 입력 시 LLM을 호출하지 않고 15행 호실·면적·비고·통합계약을 그대로 파싱한다", async () => {
    const tsvWithExampleAndTotal = [
      HOLDOUT_V2_CASE04_STABILIZED_TSV,
      "[예시] 3F\t\t사무실\t예시상사\t100\t80\t5000\t300\t20\t2029-12-31\t임대중",
      "합계\t\t\t\t1441.15\t1157.9\t59000\t3480\t274\t-\t",
    ].join("\n");

    const req = new NextRequest("http://localhost/api/broker/rent-roll/parse-text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: tsvWithExampleAndTotal }),
    });
    const res = await parseTextPost(req);
    expect(res.status).toBe(200);
    expect(mockCallLLM).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.floorLeases).toHaveLength(15);
    expect(body.monthlyRent).toBe(3480);
    expect(body.totalDeposit).toBe(59000);
    expect(body.mgmtFeeTotal).toBe(274);

    const b101 = body.floorLeases.find((r: any) => r.unit_label === "B101호");
    expect(b101).toMatchObject({
      floor: "B1",
      unit_label: "B101호",
      tenant_name: "데이르젤라또",
      tenant_type: "디저트카페",
      area_sqm: 196.15,
      exclusive_area_sqm: 156.9,
      lease_state: "임대중",
    });

    const f201 = body.floorLeases.find((r: any) => r.floor === "2F" && r.unit_label === "201호");
    expect(f201).toMatchObject({
      is_vacant: false,
      lease_state: "임대중",
    });

    const b102 = body.floorLeases.find((r: any) => r.unit_label === "B102호");
    expect(b102).toMatchObject({
      lease_state: "자가사용",
      is_vacant: false,
    });
  });

  it("마크다운 파이프 표 입력 시에도 LLM 호출 없이 결정론적으로 단락 파싱한다", async () => {
    const mdTable = [
      "| 층 | 호실 | 업종 | 임차인 | 임대면적(㎡) | 전용면적(㎡) | 보증금(만원) | 월세(만원) | 관리비(만원) | 비고 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 1F | 101호 | 카페 | 모모커피 | 82.5 | 66.0 | 5000 | 350 | 30 | 코너 전면 |",
      "| 2F | | 사무실 | 피크랩 | 165.0 | 132.0 | 4000 | 280 | 25 | 전층 |",
    ].join("\n");

    const req = new NextRequest("http://localhost/api/broker/rent-roll/parse-text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: mdTable }),
    });
    const res = await parseTextPost(req);
    expect(res.status).toBe(200);
    expect(mockCallLLM).not.toHaveBeenCalled();

    const body = await res.json();
    expect(body.floorLeases).toHaveLength(2);
    expect(body.floorLeases[0]).toMatchObject({
      floor: "1F",
      unit_label: "101호",
      exclusive_area_sqm: 66,
      note: "코너 전면",
    });
    expect(body.floorLeases[1].unit_label).toBeUndefined();
    expect(body.floorLeases[1].note).toBe("전층");
  });

  it("비정형 자유 텍스트 입력 시 maxTokens 4096으로 LLM을 호출하고 확장된 11개 스키마 필드를 보존한다", async () => {
    mockCallLLM.mockResolvedValueOnce({
      content: JSON.stringify({
        floorLeases: [
          {
            floor: "1F",
            unit_label: "101호",
            tenant_type: "카페",
            tenant_name: "스타벅스",
            deposit_manwon: 10000,
            rent_manwon: 800,
            mgmt_fee_manwon: 50,
            is_vacant: false,
            lease_state: "임대중",
            area_sqm: 130,
            exclusive_area_sqm: 105,
            contract_group: "스타벅스통합",
            legal_basis: "상가",
            first_contract_date: "2022-01-01",
            renewal_exercised: "있음",
            opposing_power: "사업자등록",
            evidence_level: "계약서 원본",
            rent_free_months: 2,
            payment_status: "정상",
            note: "1~2층 통합계약 대표",
          },
        ],
        monthlyRent: 9999,
        totalDeposit: 9999,
        mgmtFeeTotal: 9999,
        vacancyPct: 50,
      }),
    });

    const req = new NextRequest("http://localhost/api/broker/rent-roll/parse-text", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "1층 101호 스타벅스 보증금 1억 월세 800만 관리비 50만 렌트프리 2개월" }),
    });
    const res = await parseTextPost(req);
    expect(res.status).toBe(200);
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
    expect(mockCallLLM.mock.calls[0][0].maxTokens).toBe(4096);

    const body = await res.json();
    expect(body.monthlyRent).toBe(800);
    expect(body.totalDeposit).toBe(10000);
    expect(body.vacancyPct).toBe(0);
    expect(body.floorLeases[0]).toMatchObject({
      unit_label: "101호",
      exclusive_area_sqm: 105,
      contract_group: "스타벅스통합",
      legal_basis: "상가",
      first_contract_date: "2022-01-01",
      renewal_exercised: "있음",
      opposing_power: "사업자등록",
      evidence_level: "계약서 원본",
      rent_free_months: 2,
      payment_status: "정상",
      note: "1~2층 통합계약 대표",
    });
  });
});

describe("A1-05: 가짜 `${idx+1}01호` / `1301호` 호실 합성 제거", () => {
  it("TSV·IM 워크스페이스·QuickStore·요약머저 모두 호실 없는 전층 계약에 빈 unit을 유지한다", () => {
    const wholeFloorTsv = Array.from({ length: 14 }, (_, i) => `${i + 1}F\t사무실\t5000\t300\t30\t2028-12-31`).join("\n");
    const tsvParsed = parseTsvRentRoll(wholeFloorTsv);
    expect(tsvParsed.rows).toHaveLength(14);
    for (const r of tsvParsed.rows) {
      expect(r.unit).toBe("");
      expect(r.unit).not.toMatch(/^\d+01호$|^\d+호$/);
    }

    const wsRows = mapRentRollImportPayloadToRows({
      floorLeases: Array.from({ length: 15 }, (_, i) => ({
        floor: `${i + 1}F`,
        tenant_type: "사무실",
        deposit_manwon: 5000,
        rent_manwon: 300,
        is_vacant: false,
      })),
    });
    expect(wsRows).toHaveLength(15);
    expect(wsRows.every((r) => r.unit === "")).toBe(true);

    const quickRec = synthesizeQuickRecordFromImItem({
      buildingId: "bld-whole-floor",
      rentRoll: Array.from({ length: 15 }, (_, i) => ({
        floor: `${i + 1}F`,
        tenant_type: "사무실",
        deposit_manwon: 5000,
        rent_manwon: 300,
      })),
    });
    expect(quickRec.rentRoll).toHaveLength(15);
    expect(quickRec.rentRoll.every((r) => r.unit === "")).toBe(true);

    const summary = mapDocumentRowToImSummary(
      {
        id: "doc-1",
        building_id: "bld-1",
        status: "published",
        ssot_summary: { asking_price_manwon: 100_000 },
        floor_leases: Array.from({ length: 15 }, (_, i) => ({
          floor: `${i + 1}F`,
          tenant_type: "사무실",
          deposit_manwon: 5000,
          rent_manwon: 300,
        })),
      },
      [{ id: "bld-1", layers: {} }],
      new Map(),
    );
    expect(summary.rentRoll).toHaveLength(15);
    expect(summary.rentRoll?.every((r) => r.unit === "")).toBe(true);
  });
});
