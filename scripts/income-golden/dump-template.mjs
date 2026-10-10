// 템플릿 v1.5 '렌트롤' 시트 구조 덤프 (헤더 블록·머리글 행·예시 행·수식 열·유효성 검사)
//   node scripts/income-golden/dump-template.mjs [xlsx경로]   (기본 docs/CREDEAL_rentroll_template_v1.5.xlsx)
// v1.5: A1 'v1.5' · G9 면적 단위(㎡/평) · J3 매각가 · J4 연면적 · C5 기준일 · C12/D12 수식 머리글 · Q..AF 자동 열(AE/AF = ㎡ 환산)
import ExcelJS from 'exceljs';
const file = process.argv[2] ?? 'docs/CREDEAL_rentroll_template_v1.5.xlsx';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
for (const ws of wb.worksheets) console.log('sheet:', ws.name, ws.rowCount, 'x', ws.columnCount);
const ws = wb.getWorksheet('렌트롤');
const show = (c) => {
  const v = c.value;
  if (v && typeof v === 'object' && v.richText) return v.richText.map((t) => t.text).join('');
  if (c.formula) return `=${c.formula}`;
  return v;
};
for (let r = 1; r <= Math.min(ws.rowCount, 13); r++) {
  const row = ws.getRow(r);
  const cells = [];
  row.eachCell({ includeEmpty: false }, (c, n) => cells.push(`${c.address}:${String(show(c)).slice(0, 40)}`));
  console.log(r, cells.join(' | '));
}
console.log('G9 면적 단위:', ws.getCell('G9').value, JSON.stringify(ws.getCell('G9').dataValidation ?? null));
console.log('J3 매각가 / J4 연면적 / C5 기준일:', ws.getCell('J3').value, ws.getCell('J4').value, ws.getCell('C5').value);
const dv = ws.dataValidations?.model;
console.log('validations:', JSON.stringify(dv ? Object.keys(dv).slice(0, 30) : []));
