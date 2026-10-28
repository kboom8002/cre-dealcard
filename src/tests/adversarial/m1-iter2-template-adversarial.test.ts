import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { parseRentRollWorkbook } from "@/lib/rentroll/parse-rentroll-workbook";

const ROOT = process.cwd();
const PUBLIC_TEMPLATE_PATH = path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.5.xlsx");
const DOCS_TEMPLATE_PATH = path.join(ROOT, "docs", "CREDEAL_rentroll_template_v1.5.xlsx");

const DEMO_INPUT_FILL = "FFECEFF4"; // Slate gray
const DEMO_AUTO_FILL = "FFE2E8F0";  // Light blue-gray for formula cols
const DEMO_FONT_COLOR = "FF64748B"; // Slate muted font
const NAVY_DIVIDER = "FF1F3864";    // Navy divider

const SOFT_YELLOW_INPUT_FILL = "FFFFF9DB"; // Soft yellow
const INPUT_FONT_COLOR = "FF0F172A";       // Dark ink font

const INPUT_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Z", "AA", "AB"];
const FORMULA_COLS = ["Q", "R", "S", "T", "U", "V", "W", "X", "Y", "AC", "AD", "AE", "AF"];
const ALL_COLS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF",
];

describe("Adversarial Template Parsing & Hygiene Stress Suite (Milestone 1 Iteration 2)", () => {
  // ==========================================================================
  // Section 1: Template Binary Static Visual Contrast & File Parity
  // ==========================================================================
  describe("1. Static Visual Contrast & File Parity across public/ and docs/ binaries", () => {
    const templates = [
      { name: "public template", path: PUBLIC_TEMPLATE_PATH },
      { name: "docs template", path: DOCS_TEMPLATE_PATH },
    ];

    for (const { name, path: tPath } of templates) {
      it(`${name} exists and contains valid '렌트롤' sheet`, async () => {
        expect(fs.existsSync(tPath), `Template binary must exist at ${tPath}`).toBe(true);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(tPath);
        const ws = wb.getWorksheet("렌트롤");
        expect(ws, "Sheet '렌트롤' must exist").toBeDefined();
      });

      it(`${name} Row 13 (demo) maintains slate gray, muted italic font, and medium navy bottom border across ALL columns`, async () => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(tPath);
        const ws = wb.getWorksheet("렌트롤")!;

        for (const col of ALL_COLS) {
          const cell = ws.getCell(`${col}13`);
          const fill = cell.fill as ExcelJS.FillPattern;
          const isInput = INPUT_COLS.includes(col);
          const expectedFill = isInput ? DEMO_INPUT_FILL : DEMO_AUTO_FILL;

          expect(fill?.fgColor?.argb, `${col}13 fill argb`).toBe(expectedFill);
          expect(cell.font?.italic, `${col}13 font italic`).toBe(true);
          expect(cell.font?.color?.argb, `${col}13 font color`).toBe(DEMO_FONT_COLOR);
          expect(cell.border?.bottom?.style, `${col}13 border bottom style`).toBe("medium");
          expect(cell.border?.bottom?.color?.argb, `${col}13 border bottom color`).toBe(NAVY_DIVIDER);
        }
      });

      it(`${name} Row 14 (user input start) maintains soft yellow, non-italic font, and medium navy top border across ALL columns`, async () => {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(tPath);
        const ws = wb.getWorksheet("렌트롤")!;

        for (const col of ALL_COLS) {
          const cell = ws.getCell(`${col}14`);
          const fill = cell.fill as ExcelJS.FillPattern;
          const isInput = INPUT_COLS.includes(col);
          const expectedFill = isInput ? SOFT_YELLOW_INPUT_FILL : DEMO_AUTO_FILL;
          const expectedFontColor = isInput ? INPUT_FONT_COLOR : DEMO_FONT_COLOR;

          expect(fill?.fgColor?.argb, `${col}14 fill argb`).toBe(expectedFill);
          expect(cell.font?.italic, `${col}14 font italic`).toBeFalsy();
          expect(cell.font?.color?.argb, `${col}14 font color`).toBe(expectedFontColor);
          expect(cell.border?.top?.style, `${col}14 border top style`).toBe("medium");
          expect(cell.border?.top?.color?.argb, `${col}14 border top color`).toBe(NAVY_DIVIDER);
        }
      });
    }
  });

  // ==========================================================================
  // Section 2: Programmatic Cell Mutation & Cross-Row Style Decoupling
  // ==========================================================================
  describe("2. Programmatic Cell Mutation & Cross-Row Decoupling", () => {
    it("Row 13 and Row 14 have decoupled style, font, and border objects across ALL 32 columns", async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PUBLIC_TEMPLATE_PATH);
      const ws = wb.getWorksheet("렌트롤")!;

      for (const col of ALL_COLS) {
        const c13 = ws.getCell(`${col}13`);
        const c14 = ws.getCell(`${col}14`);

        // Style object identity must NEVER be shared between row 13 and row 14
        expect(c13.style === c14.style, `${col}13 vs ${col}14 style reference`).toBe(false);
        // Font object identity must NEVER be shared (Row 13 italic: true, Row 14 italic: false)
        expect(c13.font === c14.font, `${col}13 vs ${col}14 font reference`).toBe(false);
        // Border object identity must NEVER be shared (Row 13 bottom medium vs Row 14 top medium)
        expect(c13.border === c14.border, `${col}13 vs ${col}14 border reference`).toBe(false);
      }
    });

    it("All 19 user input columns (A..P, Z..AB) strictly decouple fill objects between Row 13 and Row 14", async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PUBLIC_TEMPLATE_PATH);
      const ws = wb.getWorksheet("렌트롤")!;

      for (const col of INPUT_COLS) {
        const c13 = ws.getCell(`${col}13`);
        const c14 = ws.getCell(`${col}14`);

        // Input column fills are distinct: Slate Gray (FFECEFF4) vs Soft Yellow (FFFFF9DB)
        expect(c13.fill === c14.fill, `${col}13 vs ${col}14 fill reference`).toBe(false);
        expect((c13.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(DEMO_INPUT_FILL);
        expect((c14.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(SOFT_YELLOW_INPUT_FILL);
      }
    });

    it("Adversarially mutating Row 13 input cells in-memory does NOT pollute or mutate Row 14 input cells", async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PUBLIC_TEMPLATE_PATH);
      const ws = wb.getWorksheet("렌트롤")!;

      // 1. Capture snapshot of Row 14 input columns before mutation
      const r14Snapshot = INPUT_COLS.map((col) => {
        const cell = ws.getCell(`${col}14`);
        return {
          col,
          value: cell.value,
          fillArgb: (cell.fill as ExcelJS.FillPattern)?.fgColor?.argb,
          italic: cell.font?.italic,
          fontColor: cell.font?.color?.argb,
          fontName: cell.font?.name,
          fontSize: cell.font?.size,
          borderTopStyle: cell.border?.top?.style,
          borderTopColor: cell.border?.top?.color?.argb,
        };
      });

      // 2. Adversarially mutate input cells of Row 13 with extreme modifications
      for (const col of INPUT_COLS) {
        const c13 = ws.getCell(`${col}13`);
        c13.value = `MUTATED_POISON_${col}`;

        // In-place mutate internal properties if present
        if (c13.fill && "fgColor" in c13.fill) {
          (c13.fill as any).fgColor.argb = "FFFF0000"; // Red
        }
        if (c13.font) {
          c13.font.italic = false;
          c13.font.name = "Comic Sans MS";
          c13.font.size = 72;
          (c13.font as any).color = { argb: "FF00FF00" };
        }
        if (c13.border) {
          c13.border.bottom = { style: "double", color: { argb: "FFFF00FF" } };
        }
      }

      // 3. Assert Row 14 input cells remain 100% identical to snapshot
      for (const expected of r14Snapshot) {
        const c14 = ws.getCell(`${expected.col}14`);
        expect(c14.value, `${expected.col}14 value`).toEqual(expected.value);
        expect((c14.fill as ExcelJS.FillPattern)?.fgColor?.argb, `${expected.col}14 fill`).toBe(expected.fillArgb);
        expect(c14.font?.italic, `${expected.col}14 font italic`).toBe(expected.italic);
        expect(c14.font?.color?.argb, `${expected.col}14 font color`).toBe(expected.fontColor);
        expect(c14.font?.name, `${expected.col}14 font name`).toBe(expected.fontName);
        expect(c14.font?.size, `${expected.col}14 font size`).toBe(expected.fontSize);
        expect(c14.border?.top?.style, `${expected.col}14 border top style`).toBe(expected.borderTopStyle);
        expect(c14.border?.top?.color?.argb, `${expected.col}14 border top color`).toBe(expected.borderTopColor);
      }
    });

    it("Adversarially mutating Row 14 (user input) in-memory does NOT pollute or mutate Row 13 in any way", async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PUBLIC_TEMPLATE_PATH);
      const ws = wb.getWorksheet("렌트롤")!;

      // 1. Capture snapshot of Row 13 before mutation
      const r13Snapshot = ALL_COLS.map((col) => {
        const cell = ws.getCell(`${col}13`);
        return {
          col,
          value: cell.value,
          fillArgb: (cell.fill as ExcelJS.FillPattern)?.fgColor?.argb,
          italic: cell.font?.italic,
          fontColor: cell.font?.color?.argb,
          fontName: cell.font?.name,
          borderBottomStyle: cell.border?.bottom?.style,
        };
      });

      // 2. Mutate Row 14 with simulated broker input and formatting
      for (const col of ALL_COLS) {
        const c14 = ws.getCell(`${col}14`);
        c14.value = `BROKER_INPUT_${col}`;
        c14.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF000000" },
        };
        c14.font = {
          name: "Batang",
          italic: true,
          size: 18,
          color: { argb: "FFFFFFFF" },
        };
        c14.border = {
          top: { style: "dashDot", color: { argb: "FF112233" } },
        };
      }

      // 3. Assert Row 13 remains 100% intact
      for (const expected of r13Snapshot) {
        const c13 = ws.getCell(`${expected.col}13`);
        expect(c13.value, `${expected.col}13 value`).toEqual(expected.value);
        expect((c13.fill as ExcelJS.FillPattern)?.fgColor?.argb, `${expected.col}13 fill`).toBe(expected.fillArgb);
        expect(c13.font?.italic, `${expected.col}13 italic`).toBe(expected.italic);
        expect(c13.font?.color?.argb, `${expected.col}13 font color`).toBe(expected.fontColor);
        expect(c13.font?.name, `${expected.col}13 font name`).toBe(expected.fontName);
        expect(c13.border?.bottom?.style, `${expected.col}13 border bottom style`).toBe(expected.borderBottomStyle);
      }
    });

    it("Serializing mutated workbook to binary buffer and reloading preserves Row 13 and Row 14 decoupling", async () => {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(PUBLIC_TEMPLATE_PATH);
      const ws = wb.getWorksheet("렌트롤")!;

      // User enters legitimate row data into row 14
      ws.getCell("A14").value = "1F 101호";
      ws.getCell("E14").value = "스타벅스";
      ws.getCell("G14").value = 100000000;
      ws.getCell("H14").value = 5000000;

      // Serialize to buffer
      const buffer = await wb.xlsx.writeBuffer();

      // Reload fresh workbook from buffer
      const wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.load(buffer);
      const ws2 = wb2.getWorksheet("렌트롤")!;

      const a13 = ws2.getCell("A13");
      const a14 = ws2.getCell("A14");

      expect((a13.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(DEMO_INPUT_FILL);
      expect(a13.font?.italic).toBe(true);
      expect((a14.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe(SOFT_YELLOW_INPUT_FILL);
      expect(a14.font?.italic).toBeFalsy();
      expect(a13.style === a14.style).toBe(false);
      expect(a14.value).toBe("1F 101호");
      expect(a13.value).toBe("[예시] 1F 101호");
    });
  });

  // ==========================================================================
  // Section 3: Template Parsing Invariants & Poka-Yoke Behavior
  // ==========================================================================
  describe("3. Template Parsing Invariants with parseRentRollWorkbook", () => {
    it("Unmodified template throws expected user-friendly error and cleanly excludes demo Row 13", () => {
      const fileBuffer = fs.readFileSync(PUBLIC_TEMPLATE_PATH);
      const sheetJswb = XLSX.read(fileBuffer, { type: "buffer" });

      // Because Row 13 is excluded as an example row, an empty template has rowCount === 0
      // and parseRentRollData throws a clear, user-facing Korean instruction.
      expect(() => parseRentRollWorkbook(sheetJswb)).toThrowError(
        /읽을 수 있는 호실 데이터가 없습니다.*예시 행.*자동 제외/
      );
    });

    it("Broker entering single unit in Row 14 parses accurately without leaking demo data from Row 13", () => {
      const fileBuffer = fs.readFileSync(PUBLIC_TEMPLATE_PATH);
      const sheetJswb = XLSX.read(fileBuffer, { type: "buffer" });
      const ws = sheetJswb.Sheets["렌트롤"];

      // Simulate broker input in Row 14
      ws["A14"] = { t: "s", v: "101호" };
      ws["C14"] = { t: "n", v: 66.12 }; // 임대면적
      ws["D14"] = { t: "n", v: 49.59 }; // 전용면적
      ws["E14"] = { t: "s", v: "이디야커피" };
      ws["G14"] = { t: "n", v: 50000000 }; // 5천만원
      ws["H14"] = { t: "n", v: 3500000 };  // 350만원
      ws["I14"] = { t: "n", v: 300000 };   // 30만원

      const result = parseRentRollWorkbook(sheetJswb);
      expect(result.version).toBe("1.5");
      expect(result.rowCount).toBe(1);
      expect(result.parsedRows.length).toBe(1);

      const r14 = result.parsedRows[0];
      expect(r14.floor).toBe("101호");
      expect(r14.tenant_type).toBe("이디야커피");
      expect(r14.deposit_manwon).toBe(5000); // 50,000,000 / 10,000
      expect(r14.rent_manwon).toBe(350);     // 3,500,000 / 10,000
      expect(r14.mgmt_fee_manwon).toBe(30);

      // Verify no Row 13 pollution
      expect(r14.floor).not.toContain("[예시]");
      expect(r14.note).toBeUndefined();
    });

    it("Multiple user rows (Rows 14, 15, 16) parse cleanly with correct independence in result objects", () => {
      const fileBuffer = fs.readFileSync(PUBLIC_TEMPLATE_PATH);
      const sheetJswb = XLSX.read(fileBuffer, { type: "buffer" });
      const ws = sheetJswb.Sheets["렌트롤"];

      ws["A14"] = { t: "s", v: "1F 101호" };
      ws["E14"] = { t: "s", v: "편의점" };
      ws["G14"] = { t: "n", v: 30000000 };
      ws["H14"] = { t: "n", v: 2000000 };

      ws["A15"] = { t: "s", v: "2F 201호" };
      ws["E15"] = { t: "s", v: "병원" };
      ws["G15"] = { t: "n", v: 50000000 };
      ws["H15"] = { t: "n", v: 4000000 };

      ws["A16"] = { t: "s", v: "3F 301호" };
      ws["E16"] = { t: "s", v: "학원" };
      ws["G16"] = { t: "n", v: 40000000 };
      ws["H16"] = { t: "n", v: 3000000 };

      const result = parseRentRollWorkbook(sheetJswb);
      expect(result.parsedRows.length).toBe(3);
      expect(result.rowCount).toBe(3);
      expect(result.totalDeposit).toBe(12000); // 3000 + 5000 + 4000
      expect(result.monthlyRent).toBe(900);    // 200 + 400 + 300

      // Mutating result.parsedRows[0] does NOT affect parsedRows[1]
      result.parsedRows[0].floor = "MUTATED_FLOOR";
      expect(result.parsedRows[1].floor).toBe("2F 201호");
      expect(result.parsedRows[2].floor).toBe("3F 301호");
    });

    it("Poka-yoke: If user overwrites Row 13 with authentic tenant data (floor without [예시]), it parses as valid row", () => {
      const fileBuffer = fs.readFileSync(PUBLIC_TEMPLATE_PATH);
      const sheetJswb = XLSX.read(fileBuffer, { type: "buffer" });
      const ws = sheetJswb.Sheets["렌트롤"];

      // User overwrote Row 13 with actual data
      ws["A13"] = { t: "s", v: "1F 101호" };
      ws["E13"] = { t: "s", v: "올리브영" };
      ws["G13"] = { t: "n", v: 80000000 };
      ws["H13"] = { t: "n", v: 6000000 };
      ws["P13"] = { t: "s", v: "직영점" }; // Cleared example note

      const result = parseRentRollWorkbook(sheetJswb);
      expect(result.parsedRows.length).toBe(1);
      expect(result.parsedRows[0].floor).toBe("1F 101호");
      expect(result.parsedRows[0].tenant_type).toBe("올리브영");
      expect(result.parsedRows[0].deposit_manwon).toBe(8000);
      expect(result.parsedRows[0].rent_manwon).toBe(600);
      expect(result.monthlyRent).toBe(600);
    });
  });
});
