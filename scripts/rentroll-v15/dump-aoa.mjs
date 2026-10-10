import * as XLSX from "xlsx";
import fs from "node:fs";
const [, , file, out] = process.argv;
const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
const lines = [];
for (const n of wb.SheetNames) {
  lines.push("=== " + n);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" });
  rows.slice(0, 40).forEach((r, i) => lines.push(`${i + 1}: ${JSON.stringify(r)}`));
}
fs.writeFileSync(out, lines.join("\n"), "utf8");
