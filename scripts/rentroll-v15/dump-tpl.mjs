// 개발 보조: 템플릿/픽스처 셀 덤프 (UTF-8 파일 출력). 사용: node scripts/rentroll-v15/dump-tpl.mjs <xlsx> <out.txt> [sheet] [maxRow]
import ExcelJS from "exceljs";
import fs from "node:fs";

const [, , file, out, sheetArg, maxRowArg] = process.argv;
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const lines = [];
for (const ws of wb.worksheets) {
  if (sheetArg && ws.name !== sheetArg) continue;
  lines.push(`=== ${ws.name} dims=${ws.dimensions?.model ? JSON.stringify(ws.dimensions.model) : ""} merges=${JSON.stringify(ws.model.merges)}`);
  const maxRow = Number(maxRowArg || 60);
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r > maxRow) return;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      const v = cell.value;
      let s;
      if (v && typeof v === "object" && "formula" in v) s = `F[${v.formula}] => ${JSON.stringify(v.result)}`;
      else if (v && typeof v === "object" && "sharedFormula" in v) s = `SF[${v.sharedFormula}] => ${JSON.stringify(v.result)}`;
      else if (v instanceof Date) s = `DATE ${v.toISOString()}`;
      else s = JSON.stringify(v);
      lines.push(`${cell.address}: ${s}${cell.dataValidation && Object.keys(cell.dataValidation).length ? " DV=" + JSON.stringify(cell.dataValidation) : ""}`);
    });
  });
}
fs.writeFileSync(out, lines.join("\n"), "utf8");
