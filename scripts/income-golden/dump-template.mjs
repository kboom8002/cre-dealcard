// 템플릿 v1.3 '렌트롤' 시트 구조 덤프 (헤더 행, 열, 샘플 행, 수식 열)
import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('public/CREDEAL_rentroll_template_v1.3.xlsx');
for (const ws of wb.worksheets) console.log('sheet:', ws.name, ws.rowCount, 'x', ws.columnCount);
const ws = wb.getWorksheet('렌트롤');
for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
  const row = ws.getRow(r);
  const cells = [];
  row.eachCell({ includeEmpty: false }, (c, n) => {
    const v = c.formula ? `=${c.formula}` : (typeof c.value === 'object' && c.value?.richText ? c.value.richText.map(t => t.text).join('') : c.value);
    cells.push(`${n}:${String(v).slice(0, 40)}`);
  });
  console.log(r, cells.join(' | '));
}
const dv = ws.dataValidations?.model;
console.log('validations:', JSON.stringify(dv ? Object.keys(dv).slice(0, 30) : []));
