// 픽스처 검증용 SheetJS 덤프 (개발 보조) — node scripts/rentroll-v15/verify-fixtures.mjs <out.txt>
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "src", "tests", "fixtures", "rentroll-v15");
const out = process.argv[2];
const lines = [];
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".xlsx")).sort()) {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { type: "buffer" });
  const ws = wb.Sheets["렌트롤"];
  const v = (a) => { const c = ws[a]; return c ? `${c.v}${c.f ? " {f}" : ""} [${c.t}]` : "(none)"; };
  lines.push(`=== ${f} sheets=${wb.SheetNames.join("|")}`);
  for (const a of ["A1", "C3", "C5", "C6", "G9", "J3", "J4", "C10", "D10", "AE10", "AF10", "S10", "C12", "D12", "AE12", "C13", "D13", "AE13", "AF13", "P13", "Q13", "Y14", "Y15", "AC13", "AD15", "AD16", "AC18", "C14", "G15", "H15", "G16", "H16"]) lines.push(`${a}: ${v(a)}`);
  const chk = wb.Sheets["자동검증"];
  if (chk) for (const a of ["C37", "C38", "C46", "C47"]) lines.push(`자동검증 ${a}: ${chk[a] ? chk[a].v : "(none)"}`);
}
fs.writeFileSync(out, lines.join("\n"), "utf8");
