/**
 * 생성된 골든 렌트롤 xlsx를 앱 업로드 경로와 동일하게 파싱해 기대값과 대조한다.
 *   npx tsx scripts/income-golden/verify-rentroll-xlsx.ts
 * (RentRollImporter: XLSX.read(type:'binary') → '렌트롤' 시트 → sheet_to_json(header:1) → parseRentRollData)
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseRentRollData } from '../../src/lib/rentroll/parse-rentroll-sheet';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'income-golden-data');

let fail = 0;
for (const id of fs.readdirSync(OUT).filter((n) => /^ig\d/.test(n))) {
  for (const variant of ['corrected', 'as-is']) {
    const dir = path.join(OUT, id, variant);
    const bs = JSON.parse(fs.readFileSync(path.join(dir, 'bottom_sheet.json'), 'utf8'));
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
    const bin = fs.readFileSync(path.join(dir, bs.rentRollXlsx)).toString('binary');
    const wb = XLSX.read(bin, { type: 'binary' });
    const name = wb.SheetNames.find((n) => n.includes('렌트롤') || n.toLowerCase().includes('rent')) || wb.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as any[][];
    const r = parseRentRollData(data);

    const rows = r.parsedRows;
    const groupFollowers = rows.filter((x) => x.contract_group && !x.deposit_manwon && !x.rent_manwon).length;
    const owner = rows.filter((x) => x.lease_state === '자가사용').length;
    const vacant = rows.filter((x) => x.lease_state === '공실' || x.is_vacant).length;
    const checks: Array<[string, unknown, unknown]> = [
      ['rows', r.rowCount, exp.rentRoll.rows],
      ['deposit(실수입)', r.totalDeposit, exp.rentRoll.incomeDepositManwon],
      ['rent(실수입)', r.monthlyRent, exp.rentRoll.incomeRentManwon],
      ['전용면적 합(스펙에 없음→0)', r.areaSummary.exclusiveSqm, 0],
    ];
    if (variant === 'corrected') {
      checks.push(['groupFollowers', groupFollowers, exp.rentRoll.contractGroupFollowers]);
      checks.push(['ownerUse', owner, exp.rentRoll.ownerUseRows]);
      checks.push(['vacant', vacant, exp.rentRoll.vacantRows]);
    }
    const bad = checks.filter(([, a, b]) => a !== b);
    const tag = bad.length ? '✖' : '✔';
    if (bad.length) fail++;
    console.log(`${tag} ${id}/${variant}: rows ${r.rowCount}, 보증금 ${r.totalDeposit}, 월세 ${r.monthlyRent}, 관리비 ${r.mgmtFeeTotal}, 공실률 ${r.vacancyPct}% | 그룹후속 ${groupFollowers} 자가 ${owner} 공실 ${vacant} | 바텀시트 ${bs.totalDepositManwon}/${bs.monthlyRentTotalManwon} | 면적 임대 ${r.areaSummary.leaseSqm.toFixed(2)}㎡`);
    for (const [k, a, b] of bad) console.log(`    - ${k}: parsed=${a} expected=${b}`);
    const dates = rows.filter((x) => x.lease_end).map((x) => `${x.floor}:${x.lease_end}`).join(' ');
    if (dates) console.log(`    만료: ${dates}`);
    if (r.warnings.length) console.log(`    경고(${r.warnings.length}): ${r.warnings.slice(0, 6).join(' / ')}`);
  }
}
process.exit(fail ? 1 : 0);
