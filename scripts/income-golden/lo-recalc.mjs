/**
 * LibreOffice headless 재계산 헬퍼 (골든 렌트롤 xlsx 용).
 *
 * ExcelJS 로 쓴 xlsx 는 수식 셀에 계산 캐시가 없다 (템플릿 예시 값은 build-golden-data 가 지운다).
 * 엑셀 없이 파일을 열어도 AE/AF·Q..Y·AC/AD 가 올바른 값으로 보이게 LibreOffice 로 한 번 열었다 저장한다.
 * (scripts/rentroll-v15/build-fixtures.mjs 의 재계산 로직과 동일 — 단 동시 실행 충돌을 피하려 프로필 폴더를 따로 쓴다.)
 *
 * soffice 경로: SOFFICE 환경변수 → C:\Program Files\LibreOffice → PATH 의 soffice
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function findSoffice() {
  const cands = [
    process.env.SOFFICE,
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'soffice',
  ].filter(Boolean);
  for (const c of cands) {
    if (c === 'soffice' || fs.existsSync(c)) return c;
  }
  throw new Error('LibreOffice(soffice)를 찾을 수 없습니다. SOFFICE 환경변수를 지정하세요.');
}

/** src(xlsx) 를 LibreOffice 로 열어 재계산·저장한 결과를 outFile 로 복사한다. */
export function recalcWithLibreOffice(src, outFile) {
  const soffice = findSoffice();
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-rr-out-'));
  const profile = path.join(os.tmpdir(), 'lo-income-golden-profile').replace(/\\/g, '/');
  const res = spawnSync(
    soffice,
    [`-env:UserInstallation=file:///${profile}`, '--headless', '--calc', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', tmpOut, src],
    { encoding: 'utf8', timeout: 180_000 },
  );
  const produced = path.join(tmpOut, path.basename(src));
  if (!fs.existsSync(produced)) {
    throw new Error(`LibreOffice 변환 실패: ${res.stderr || res.stdout || res.error}`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.copyFileSync(produced, outFile);
  fs.rmSync(tmpOut, { recursive: true, force: true });
}

/** 모든 시트의 수식 셀에서 계산 캐시(result)를 지운다 — 템플릿 예시 값(전용률 75% 등)이 새지 않게 */
export function clearFormulaCaches(wb) {
  let n = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v && typeof v === 'object' && !(v instanceof Date)) {
          if ('formula' in v) { cell.value = { formula: v.formula }; n++; }
          else if ('sharedFormula' in v) { cell.value = { sharedFormula: v.sharedFormula }; n++; }
        }
      });
    });
  }
  return n;
}
