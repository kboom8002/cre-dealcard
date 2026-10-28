/**
 * @file src/tests/unit/domain-ssot-hygiene.test.ts
 * @description Domain SSOT & Pipeline Hygiene Regression Test Suite
 *
 * Verifies Core Invariants:
 * 1. Zero occurrences of '/ 3.3058' across production source code
 * 2. Rent facts calculation returns clean zeroed facts without mock units when empty
 * 3. a02-stat-grid.ts uses 1-decimal pyeong formatting
 * 4. Photo caption presets exist across all 11 categories and are fully wired in both
 *    bottom-sheet and im-approval-client
 * 5. Pro archetype builders (A11, A12) return clean empty structures without mock fallbacks
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";
import AdmZip from "adm-zip";
import { extractRentFacts } from "@/domain/building/im-core/facts/rent";
import { PHOTO_CAPTION_PRESETS, getPhotoCaptionPresets } from "@/domain/building/mobile-im/photo-url-transformer";
import { buildA02StatGrid } from "@/domain/building/mobile-im/pptx/archetypes/a02-stat-grid";
import { buildA11Props, buildA12Props } from "@/domain/building/mobile-im/pptx/binder/archetype-builders";
import { PYEONG_RATIO, SQM_RATIO, m2ToPyeong, pyeongToM2, formatPyeong } from "@/domain/building/im-core/facts/area";

describe("Domain SSOT Hygiene Regression Suite", () => {
  // --------------------------------------------------------------------------
  // Invariant 1: Area Conversion SSOT (Zero '/ 3.3058' in Production Code)
  // --------------------------------------------------------------------------
  describe("1. Area Conversion SSOT Invariant", () => {
    it("exports SSOT constants and conversion functions from area facts", () => {
      expect(PYEONG_RATIO).toBe(0.3025);
      expect(SQM_RATIO).toBeCloseTo(3.305785, 5);
      expect(m2ToPyeong(100)).toBe(30.25);
      expect(pyeongToM2(30.25)).toBe(100);
      expect(formatPyeong(1230.46, 1)).toBe("372.2");
      expect(formatPyeong(440, 1)).toBe("133.1");
    });

    it("has ZERO occurrences of '/ 3.3058' across production source files", () => {
      const srcDir = path.resolve(process.cwd(), "src");
      const violations: Array<{ file: string; line: number; text: string }> = [];

      function scan(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "tests") continue;
            scan(fullPath);
          } else if (
            /\.(ts|tsx|js|mjs)$/.test(entry.name) &&
            !entry.name.includes(".test.") &&
            !entry.name.includes(".spec.")
          ) {
            const content = fs.readFileSync(fullPath, "utf-8");
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
              // Ignore comments that describe legacy context
              if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) return;
              if (/\/\s*3\.3058\b/.test(line)) {
                violations.push({
                  file: path.relative(process.cwd(), fullPath),
                  line: idx + 1,
                  text: line.trim(),
                });
              }
            });
          }
        }
      }

      scan(srcDir);
      expect(
        violations,
        `Found / 3.3058 violations in src/: ${JSON.stringify(violations, null, 2)}`
      ).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 2: Rent Facts Zero-Mock Fallback
  // --------------------------------------------------------------------------
  describe("2. Rent Facts Pure Domain Cleanliness", () => {
    it("returns clean zeroed facts without mock units when input is empty", () => {
      const facts = extractRentFacts({});
      expect(facts.units).toEqual([]);
      expect(facts.depositTotalKrw).toBe(0);
      expect(facts.monthlyRentTotalKrw).toBe(0);
      expect(facts.annualRentKrw).toBe(0);
      expect(facts.unitCount).toBe(1);
      expect(facts.occupiedCount).toBe(0);
      expect(facts.vacantCount).toBe(1);
      expect(facts.occupancyRatePct).toBe(0);
    });

    it("does NOT inject 45%/55% mock summary units even when monthly rent totals exist", () => {
      const facts = extractRentFacts({
        monthly_rent_total_krw: 15_000_000,
        deposit_total_krw: 100_000_000,
        maintenance_fee_monthly_krw: 1_000_000,
      });

      // Pure domain rule: do not invent fake lease units
      expect(facts.units).toEqual([]);
      expect(facts.monthlyRentTotalKrw).toBe(15_000_000);
      expect(facts.depositTotalKrw).toBe(100_000_000);
      expect(facts.annualRentKrw).toBe(180_000_000);
      // No synthetic tenant names
      expect(JSON.stringify(facts.units)).not.toContain("근린생활시설");
      expect(JSON.stringify(facts.units)).not.toContain("업무/근생");
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 3: a02-stat-grid.ts 1-Decimal Pyeong Formatting
  // --------------------------------------------------------------------------
  describe("3. a02-stat-grid.ts Pyeong Formatting Precision", () => {
    it("does not use 0-decimal pyeong formatting in a02-stat-grid.ts source code", () => {
      const filePath = path.resolve(
        process.cwd(),
        "src/domain/building/mobile-im/pptx/archetypes/a02-stat-grid.ts"
      );
      const content = fs.readFileSync(filePath, "utf-8");

      // Must not contain formatPyeong(..., 0)
      const hasZeroDecimals = /formatPyeong\([^,)]+,\s*0\)/.test(content);
      expect(
        hasZeroDecimals,
        "a02-stat-grid.ts still contains formatPyeong with 0 decimals!"
      ).toBe(false);

      // Must explicitly use formatPyeong with 1 decimal
      const hasOneDecimal = /formatPyeong\([^,)]+,\s*1\)/.test(content);
      expect(
        hasOneDecimal,
        "a02-stat-grid.ts should use formatPyeong with 1 decimal"
      ).toBe(true);
    });

    it("renders PPTX binary slide XML with 1-decimal pyeong precision", async () => {
      const pres = new pptxgen();
      buildA02StatGrid({
        pres,
        slideNum: 2,
        docno: "F3-TEST",
        data: {
          kicker: "INVESTMENT HIGHLIGHTS",
          title: "핵심 투자 하이라이트",
          heroCard: {
            askingPriceDisplay: "28억 원",
            totalGrossAreaM2: "1230.46",
            landAreaM2: "440.0",
          },
        },
        grade: "A",
        provenance: {},
      });

      const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
      const zip = new AdmZip(buffer);
      const slideXml =
        zip.getEntries().find((e) => e.entryName.includes("slide1.xml"))?.getData().toString("utf-8") || "";

      // Must format with 1 decimal place: 1230.46 * 0.3025 = 372.2평, 440 * 0.3025 = 133.1평
      expect(slideXml).toContain("372.2평");
      expect(slideXml).toContain("133.1평");
      expect(slideXml).not.toMatch(/372평(?!·)/);
      expect(slideXml).not.toMatch(/133평(?!·)/);
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 4: Photo Caption Presets SSOT & Wiring
  // --------------------------------------------------------------------------
  describe("4. Photo Caption Presets SSOT & Full Wiring", () => {
    const EXPECTED_CATEGORIES = [
      "exterior",
      "lobby",
      "interior",
      "parking",
      "rooftop",
      "entrance",
      "mechanical",
      "floor_plan",
      "location_map",
      "district_plan_map",
      "cadastral",
    ];

    it("PHOTO_CAPTION_PRESETS contains all 11 required categories with rich Korean presets", () => {
      const keys = Object.keys(PHOTO_CAPTION_PRESETS);
      for (const cat of EXPECTED_CATEGORIES) {
        expect(keys, `Missing category '${cat}' in PHOTO_CAPTION_PRESETS`).toContain(cat);
        expect(PHOTO_CAPTION_PRESETS[cat].length).toBeGreaterThanOrEqual(1);
        PHOTO_CAPTION_PRESETS[cat].forEach((preset) => {
          expect(typeof preset).toBe("string");
          expect(preset.length).toBeGreaterThan(1);
        });
      }
    });

    it("getPhotoCaptionPresets provides safe fallback when category is missing", () => {
      expect(getPhotoCaptionPresets("unknown_xyz")).toEqual(PHOTO_CAPTION_PRESETS.interior);
      expect(getPhotoCaptionPresets(undefined)).toEqual(PHOTO_CAPTION_PRESETS.exterior);
      expect(getPhotoCaptionPresets("lobby")).toEqual(PHOTO_CAPTION_PRESETS.lobby);
    });

    it("im-data-bottom-sheet.tsx has no .slice(0, 2) on photo caption presets", () => {
      const bsheetPath = path.resolve(
        process.cwd(),
        "src/app/(broker)/broker/deal-card/[id]/im-data-bottom-sheet.tsx"
      );
      const content = fs.readFileSync(bsheetPath, "utf-8");

      // Verify that PHOTO_CAPTION_PRESETS is not sliced to 2
      const hasSlicedPresets = /PHOTO_CAPTION_PRESETS[\s\S]+?\.slice\(0,\s*2\)/.test(content);
      expect(
        hasSlicedPresets,
        "im-data-bottom-sheet.tsx still truncates presets with .slice(0, 2)"
      ).toBe(false);

      // Verify that horizontal scrolling is enabled
      expect(content).toMatch(/overflow-x-auto/);
      expect(content).toMatch(/no-scrollbar/);
    });

    it("im-approval-client.tsx wires PHOTO_CAPTION_PRESETS with datalist and quick chips", () => {
      const approvalPath = path.resolve(
        process.cwd(),
        "src/app/(broker)/broker/im-approval/[id]/im-approval-client.tsx"
      );
      const content = fs.readFileSync(approvalPath, "utf-8");

      expect(content).toContain("PHOTO_CAPTION_PRESETS");
      expect(content).toMatch(/datalist\s+id=.*approval-caption-presets/);
      expect(content).toMatch(/updatePhotoCaption/);
      expect(content).toMatch(/overflow-x-auto/);
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 5: Zero Mock Fallback in Pro Archetype Builders (Rule 34/41)
  // --------------------------------------------------------------------------
  describe("5. Zero Mock Fallback in Pro Archetype Builders", () => {
    it("buildA11Props returns empty roomTypes, stats, and calloutBody when no input data exists", () => {
      const props = buildA11Props("", [], []);
      expect(props.roomTypes).toEqual([]);
      expect(props.stats).toEqual([]);
      expect(props.calloutBody).toBe("");
      // Verify complete absence of dummy data
      expect(JSON.stringify(props)).not.toContain("Standard");
      expect(JSON.stringify(props)).not.toContain("Deluxe");
      expect(JSON.stringify(props)).not.toContain("91.2");
      expect(JSON.stringify(props)).not.toContain("독립 배관");
    });

    it("buildA12Props returns empty ownershipRows and callouts when no input data exists", () => {
      const props = buildA12Props("", [], []);
      expect(props.ownershipRows).toEqual([]);
      expect(props.callouts).toEqual([]);
      // Verify complete absence of dummy data
      expect(JSON.stringify(props)).not.toContain("개인 단독 소유");
      expect(JSON.stringify(props)).not.toContain("2016년 08월");
      expect(JSON.stringify(props)).not.toContain("말소 서류 동시 교부");
    });
  });

  // --------------------------------------------------------------------------
  // Invariant 6: Rent Roll Template Pre-attentive Contrast & Style Decoupling
  // --------------------------------------------------------------------------
  describe("6. Rent Roll Template Pre-attentive Contrast & Style Decoupling", () => {
    it("public and docs v1.5 templates maintain strict visual contrast between Row 13 demo and Row 14 user input", async () => {
      const templatePaths = [
        path.join(process.cwd(), "public", "CREDEAL_rentroll_template_v1.5.xlsx"),
        path.join(process.cwd(), "docs", "CREDEAL_rentroll_template_v1.5.xlsx"),
      ];

      for (const tPath of templatePaths) {
        expect(fs.existsSync(tPath), `Template file must exist: ${tPath}`).toBe(true);
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(tPath);
        const ws = wb.getWorksheet("렌트롤");
        expect(ws, `Worksheet '렌트롤' must exist in ${tPath}`).toBeDefined();

        const a13 = ws!.getCell("A13");
        const a14 = ws!.getCell("A14");

        // Row 13 demo row must be slate gray and italic
        const a13Fill = a13.fill as ExcelJS.FillPattern;
        expect(a13Fill?.fgColor?.argb, `A13 in ${tPath} must have slate gray fill`).toBe("FFECEFF4");
        expect(a13.font?.italic, `A13 in ${tPath} must be italic`).toBe(true);

        // Row 14 user input must be soft yellow and non-italic
        const a14Fill = a14.fill as ExcelJS.FillPattern;
        expect(a14Fill?.fgColor?.argb, `A14 in ${tPath} must have soft yellow fill`).toBe("FFFFF9DB");
        expect(a14.font?.italic, `A14 in ${tPath} must NOT be italic`).toBeFalsy();

        // Object identity: cell styles must not be the identical shared reference
        expect(a13.style === a14.style, `A13 and A14 in ${tPath} must not share identical style object`).toBe(false);

        // All input columns in row 14 must have yellow fill
        const inputCols = [
          "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
          "K", "L", "M", "N", "O", "P", "Z", "AA", "AB",
        ];
        for (const col of inputCols) {
          const c14 = ws!.getCell(`${col}14`);
          const c14Fill = c14.fill as ExcelJS.FillPattern;
          expect(c14Fill?.fgColor?.argb, `${col}14 in ${tPath} must have yellow fill`).toBe("FFFFF9DB");
          expect(c14.font?.italic, `${col}14 in ${tPath} must NOT be italic`).toBeFalsy();
        }
      }
    });
  });
});
