/**
 * 생성된 골든 렌트롤 xlsx(v1.5)를 앱 업로드 경로와 동일하게 파싱해 기대값과 대조한다.
 *
 *   npx tsx scripts/income-golden/verify-rentroll-xlsx.ts [--report <out.md>] [--uncached-dir <dir>]
 *
 * 앱 경로: RentRollImporter — XLSX.read(type:'binary') → parseRentRollWorkbook(workbook)
 *          (버전 판별 → v1.5 고정 위치 + G9 단위 → ㎡ 환산 → V12(AREA_UNIT_MISMATCH) 사전 판정).
 *
 * 검증 항목 (변형 폴더마다)
 *  - 버전 1.5 / 행 수 / 보증금·월세(실수입) / 계약그룹 후속·자가사용·공실 행 수 / 전용면적 합 0(명세에 없음)
 *  - 헤더 블록: G9 단위(areaInputUnit) · C5 기준일(=as-of) · J3 매각가(원) · J4 연면적(대장 ㎡)
 *  - 면적: ΣAE(파서 환산 ㎡ 합) · V03(ΣAE/J4) · V12 차단 여부 (unit-confusion 만 차단 기대; 그 외 차단은 보고)
 *  - 캐시 무관: 수식 셀 캐시를 0 으로 덮은 사본을 다시 파싱해 결과가 동일한지 (파서는 캐시를 읽지 않는다)
 *    · --uncached-dir 로 `build-golden-data.mjs --no-recalc --out <dir>` 산출물(ExcelJS 가 쓴 실제 캐시 없는 파일)과도 대조
 *
 * 종료 코드: corrected 계열(unit-confusion 포함) 기대값 불일치 또는 캐시 동치 실패 시 1.
 *            as-is 의 예상치 못한 V12 차단은 보고만 한다(원본 오기가 실제로 차단 사유일 수 있음).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { parseRentRollWorkbook } from '../../src/lib/rentroll/parse-rentroll-workbook';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'docs', 'income-golden-data');
const NOW = new Date('2026-10-10T00:00:00Z');

const argv = process.argv.slice(2);
const argVal = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const REPORT = argVal('--report');
const UNCACHED_DIR = argVal('--uncached-dir');

const r2 = (n: number) => Math.round(n * 100) / 100;
const readWb = (file: string) => XLSX.read(fs.readFileSync(file).toString('binary'), { type: 'binary' });

/** 수식 셀의 캐시를 지운 사본 — SheetJS 가 미계산 수식 셀을 읽는 모양(v:0)으로 */
function stripFormulaCaches(wb: XLSX.WorkBook): number {
  let n = 0;
  for (const ws of Object.values(wb.Sheets)) {
    for (const [addr, cell] of Object.entries(ws)) {
      if (addr.startsWith('!')) continue;
      const c = cell as XLSX.CellObject;
      if (c.f) { c.t = 'n'; c.v = 0; delete (c as any).w; n++; }
    }
  }
  return n;
}

/** 파서 결과 중 캐시와 무관해야 하는 부분만 비교용으로 직렬화 */
function fingerprint(r: ReturnType<typeof parseRentRollWorkbook>) {
  return JSON.stringify({
    version: r.version,
    meta: r.meta,
    rows: r.parsedRows,
    area: r.areaSummary,
    totals: [r.monthlyRent, r.totalDeposit, r.mgmtFeeTotal, r.vacancyPct, r.rowCount],
    // 캐시 대조 경고(AE/AF 불일치)·수식 머리글 경고는 캐시 유무에 따라 달라질 수 있어 제외
    issues: r.issues.filter((i) => i.code !== 'HEADER_MISMATCH').map((i) => [i.code, i.level, i.ratio ?? null]),
  });
}

const lines: string[] = [];
const log = (s: string) => { console.log(s); lines.push(s); };

let fail = 0;
const v12Reports: string[] = [];
const summaryRows: string[] = [];

for (const id of fs.readdirSync(OUT).filter((n) => /^ig\d/.test(n)).sort()) {
  const variants = fs.readdirSync(path.join(OUT, id), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(OUT, id, e.name, 'bottom_sheet.json')))
    .map((e) => e.name)
    .sort((a, b) => (a === 'corrected' ? -1 : b === 'corrected' ? 1 : a === 'as-is' ? -1 : b === 'as-is' ? 1 : a.localeCompare(b)));

  for (const variant of variants) {
    const dir = path.join(OUT, id, variant);
    const bs = JSON.parse(fs.readFileSync(path.join(dir, 'bottom_sheet.json'), 'utf8'));
    const exp = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8'));
    const xlsxPath = path.join(dir, bs.rentRollXlsx);
    const asIs = variant === 'as-is';
    const wb = readWb(xlsxPath);
    const r = parseRentRollWorkbook(wb, { now: NOW });

    const rows = r.parsedRows;
    const groupFollowers = rows.filter((x) => x.contract_group && !x.deposit_manwon && !x.rent_manwon).length;
    const owner = rows.filter((x) => x.lease_state === '자가사용').length;
    const vacant = rows.filter((x) => x.lease_state === '공실' || x.is_vacant).length;
    const sumAE = r2(r.areaSummary.leaseSqm);
    const gfa: number = exp.register?.totArea ?? bs.rentRollMeta?.gfaSqm;
    const v03 = gfa ? (sumAE / gfa) * 100 : null;
    const v12 = r.issues.find((i) => i.code === 'AREA_UNIT_MISMATCH');
    const blocked = r.issues.some((i) => i.level === 'blocking');
    const expectBlock = !!exp.expectV12Block;

    const checks: Array<[string, unknown, unknown]> = [
      ['version', r.version, '1.5'],
      ['rows', r.rowCount, exp.rentRoll.rows],
      ['deposit(실수입)', r.totalDeposit, exp.rentRoll.incomeDepositManwon],
      ['rent(실수입)', r.monthlyRent, exp.rentRoll.incomeRentManwon],
      ['전용면적 합(명세에 없음→0)', r.areaSummary.exclusiveSqm, 0],
      ['G9 면적 단위', r.meta.area_input_unit, exp.areaInputUnit],
      ['C5 기준일', r.meta.rentroll_as_of, exp.asOf],
      ['J3 매각가(원)', r.meta.asking_price_krw, exp.askingPriceManwon * 10000],
      ['J4 연면적(㎡)', r.meta.gfa_sqm, gfa],
      ['V12 차단', blocked, expectBlock],
    ];
    if (!asIs) {
      checks.push(['groupFollowers', groupFollowers, exp.rentRoll.contractGroupFollowers]);
      checks.push(['ownerUse', owner, exp.rentRoll.ownerUseRows]);
      checks.push(['vacant', vacant, exp.rentRoll.vacantRows]);
    }
    // 바텀시트 미러(㎡ 정본)의 면적 합과 파서 ΣAE 의 관계: ㎡ 변형은 같고, 평 변형은 되환산 반올림 오차(±0.02 이내), 혼동 변형은 ×3.305785
    const mirrorSum = r2((bs.floor_leases as any[]).reduce((s, l) => s + (l.area_sqm ?? 0), 0));
    if (mirrorSum > 0) {
      const factor = exp.expectV12Block ? 3.305785 : 1;
      const tol = exp.areaInputUnit === 'pyeong' && !exp.expectV12Block ? 0.05 : 0.01;
      const diff = Math.abs(sumAE - mirrorSum * factor);
      if (diff > tol + (exp.expectV12Block ? 0.05 : 0)) checks.push(['ΣAE vs 바텀시트 면적 합', sumAE, r2(mirrorSum * factor)]);
    }

    // 캐시 무관 동치 (1) 파일의 수식 캐시를 0 으로 덮은 사본
    const stripped = readWb(xlsxPath);
    const nStrip = stripFormulaCaches(stripped);
    const rStrip = parseRentRollWorkbook(stripped, { now: NOW });
    const cacheSame = fingerprint(r) === fingerprint(rStrip);
    if (!cacheSame) checks.push(['캐시 제거 사본 동치', 'DIFF', 'SAME']);

    // 캐시 무관 동치 (2) ExcelJS 가 쓴 실제 캐시 없는 파일 (--no-recalc 산출물)
    let uncachedNote = '';
    if (UNCACHED_DIR) {
      const up = path.join(UNCACHED_DIR, id, variant, bs.rentRollXlsx);
      if (fs.existsSync(up)) {
        const rU = parseRentRollWorkbook(readWb(up), { now: NOW });
        const same = fingerprint(r) === fingerprint(rU);
        uncachedNote = ` | 무캐시 파일 동치 ${same ? 'OK' : 'DIFF'}`;
        if (!same) checks.push(['무캐시 파일 동치', 'DIFF', 'SAME']);
      } else uncachedNote = ' | 무캐시 파일 없음';
    }

    const bad = checks.filter(([, a, b]) => a !== b);
    // as-is 의 예상치 못한 V12 는 보고만 한다
    const hardBad = bad.filter(([k]) => !(asIs && k === 'V12 차단'));
    const tag = hardBad.length ? '✖' : (asIs && blocked && !expectBlock ? '⚠' : '✔');
    if (hardBad.length) fail++;
    log(`${tag} ${id}/${variant}: v${r.version} G9=${r.meta.area_input_unit === 'pyeong' ? '평' : '㎡'} rows ${r.rowCount}, 보증금 ${r.totalDeposit}, 월세 ${r.monthlyRent}, 관리비 ${r.mgmtFeeTotal}, 공실률 ${r.vacancyPct}% | 그룹후속 ${groupFollowers} 자가 ${owner} 공실 ${vacant} | 바텀시트 ${bs.totalDepositManwon}/${bs.monthlyRentTotalManwon}`);
    log(`    ΣAE ${sumAE.toFixed(2)}㎡ / 연면적(J4) ${gfa} = V03 ${v03 == null ? '-' : v03.toFixed(1) + '%'} | V12 ${blocked ? `BLOCK(ratio ${(v12?.ratio ?? 0).toFixed(3)})` : r.issues.some((i) => i.code === 'AREA_UNIT_UNCHECKED') ? '보류' : 'OK'} | 수식캐시 ${nStrip}셀 제거 사본 ${cacheSame ? '동치' : 'DIFF'}${uncachedNote}`);
    for (const [k, a, b] of bad) log(`    - ${k}: parsed=${JSON.stringify(a)} expected=${JSON.stringify(b)}${asIs && k === 'V12 차단' ? '  (as-is: 보고만)' : ''}`);
    const dates = rows.filter((x) => x.lease_end).map((x) => `${x.floor}:${x.lease_end}`).join(' ');
    if (dates) log(`    만료: ${dates}`);
    if (r.warnings.length) log(`    경고(${r.warnings.length}): ${r.warnings.slice(0, 6).join(' / ')}`);
    const codes = [...new Set(r.issues.map((i) => `${i.code}/${i.level}`))];
    if (codes.length) log(`    이슈: ${codes.join(', ')}`);

    if (blocked && !expectBlock) v12Reports.push(`${id}/${variant}: V12 차단 (ΣAE ${sumAE} / J4 ${gfa} = ${v03?.toFixed(1)}%)`);
    summaryRows.push(`| ${id}/${variant} | ${r.meta.area_input_unit === 'pyeong' ? '평' : '㎡'} | ${r.rowCount} | ${sumAE.toFixed(2)} | ${gfa} | ${v03 == null ? '-' : v03.toFixed(1)}% | ${blocked ? 'BLOCK' : 'OK'} | ${hardBad.length ? 'FAIL' : 'ok'} |`);
  }
}

log('');
log(v12Reports.length ? `⚠ 예상 밖 V12 차단 ${v12Reports.length}건:\n  ${v12Reports.join('\n  ')}` : '예상 밖 V12 차단 0건');
if (REPORT) {
  const md = ['# 골든 렌트롤 xlsx v1.5 파싱 요약', '', '| 골든 | G9 | 행 | ΣAE(㎡) | J4 연면적 | V03 | V12 | 판정 |', '|---|---|---|---|---|---|---|---|', ...summaryRows, '', '```', ...lines, '```', ''].join('\n');
  fs.writeFileSync(REPORT, md, 'utf8');
}
process.exitCode = fail ? 1 : 0;
