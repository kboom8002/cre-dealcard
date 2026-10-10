// CREDEAL 렌트롤 v1.5 테스트 픽스처 생성기
//
// docs/CREDEAL_rentroll_template_v1.5.xlsx(+ public v1.3 템플릿)를 ExcelJS 로 채워
// src/tests/fixtures/rentroll-v15/ 에 생성한다. 같은 가상 물건(당산동5가 11-47 스타일, 8행, 기준일 2025-05-15,
// 매각가 11,500,000,000원, 연면적 1,441.15㎡)이며 값은 스펙 docs/RENTROLL_v1.3_to_v1.5.md §7 오라클을 재현한다
// (데이터 도출 근거: scripts/rentroll-v15/derive-dataset.mjs).
//
// - 예시 행 13 을 비우고, Q..AF · C10/D10/AE10 등 모든 수식 캐시를 지운다 (템플릿 예시 값이 새지 않게)
// - uncached_v1.5.xlsx 만 재계산하지 않는다 (수식 캐시 없음 → 파서가 직접 환산하는지 검증)
// - 나머지는 LibreOffice headless 로 재계산해 캐시를 채운다
//
// 사용: node scripts/rentroll-v15/build-fixtures.mjs   (soffice 필요: SOFFICE 환경변수 또는 C:\Program Files\LibreOffice)
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeOracle, sqmToPy, P2S } from "./oracle-calc.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const TPL_V15 = path.join(ROOT, "docs", "CREDEAL_rentroll_template_v1.5.xlsx");
const TPL_V13 = path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.3.xlsx");
const OUT_DIR = path.join(ROOT, "src", "tests", "fixtures", "rentroll-v15");
const SHEET = "렌트롤";
const SQM = "㎡";
const PY = "평";

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const AS_OF = utc(2025, 5, 15);

/**
 * 8행 데이터 (㎡ 정본). 행 순서 = 엑셀 13~20행.
 * 면적은 스펙 §7 (ΣAE 1441.15 / ΣAF 1175.00 / 평 입력 1441.16·1175.05 / 혼동 4764.14 / Y14 108,238·108,203 / Y15 111,299·111,302) 를
 * 재현하도록 derive-dataset.mjs 가 도출한 값이다. 내과 통합계약 A = 15·16·20행, 금액은 대표 행(15)에만.
 */
const ROWS = [
  { A: "B1", E: "카페(자가)", O: "자가사용", C: 317.22, D: 257.05 },
  { A: "1F", E: "약국", O: "임대중", C: 36.92, D: 31.0, G: 30_000_000, H: 1_000_000, I: 15_000, J: utc(2018, 3, 1), K: utc(2023, 3, 1), L: utc(2026, 2, 28), M: "없음", Z: "계약서 원본", AB: "정상" },
  { A: "1F", B: "A", E: "내과", O: "임대중", C: 105.7, D: 84.0, G: 150_000_000, H: 9_000_000, I: 730_000, J: utc(2014, 9, 1), K: utc(2024, 9, 1), L: utc(2026, 8, 31), M: "없음", Z: "계약서 원본", AB: "정상", P: "로뎀나무내과 통합계약 A (대표 행)" },
  { A: "2F", B: "A", E: "내과", O: "임대중", C: 135.44, D: 113.19, J: utc(2014, 9, 1), K: utc(2024, 9, 1), L: utc(2026, 8, 31), M: "없음", Z: "계약서 원본", AB: "정상", P: "로뎀나무내과 통합계약 A (금액은 대표 행)" },
  { A: "3F", E: "헬스장", O: "임대중", C: 335.23, D: 282.57, G: 60_000_000, H: 5_260_000, I: 300_000, J: utc(2022, 4, 18), K: utc(2024, 4, 18), L: utc(2026, 4, 17), M: "모름", Z: "매도인 렌트롤", AA: 2, AB: "정상" },
  { A: "4F", E: "와인매장", O: "임대중", C: 289.13, D: 229.34, G: 50_000_000, H: 4_200_000, I: 250_000, J: utc(2020, 5, 1), K: utc(2023, 5, 1), L: utc(2025, 4, 30), M: "없음", Z: "구두", AB: "연체" },
  { A: "4F", E: "사무실(자가)", O: "자가사용", C: 109.64, D: 86.04 },
  { A: "5F", B: "A", E: "내과", O: "임대중", C: 111.87, D: 91.81, J: utc(2014, 9, 1), K: utc(2024, 9, 1), L: utc(2026, 8, 31), M: "없음", Z: "계약서 원본", AB: "정상", P: "로뎀나무내과 통합계약 A (금액은 대표 행)" },
];
for (const r of ROWS) if (r.O === "임대중") { r.F = "상가"; r.N = "사업자등록"; r.AA = r.AA ?? 0; } else { r.F = "상가"; }

const R1_COLS = ["A", "B", "E", "G", "H", "L", "O"]; // 해상도 R1: 호실·업종·보증금·월세·만료일·임대상태 (+그룹: 통합계약 금액 판정에 필요)
const R2_COLS = [...R1_COLS, "C", "D", "F", "I", "K"]; // R2: + 임대면적·전용면적·적용법령·관리비·현 계약 시작일
const R3_COLS = [...R2_COLS, "J", "M", "N", "P", "Z", "AA", "AB"]; // R3: + 최초계약일·갱신요구권·대항력 (+ 근거·렌트프리·입금)

/** 변형 정의 */
const VARIANTS = [
  { file: "example_R1_v1.5.xlsx", tpl: "v15", cols: R1_COLS, unit: SQM },
  { file: "example_R2_v1.5.xlsx", tpl: "v15", cols: R2_COLS, unit: SQM },
  { file: "example_R3_v1.5.xlsx", tpl: "v15", cols: R3_COLS, unit: SQM, marketBlock: true },
  { file: "example_R3_평입력_v1.5.xlsx", tpl: "v15", cols: R3_COLS, unit: PY, marketBlock: true },
  // 단위 혼동: G9=평 인데 C·D 에는 ㎡ 숫자 (ΣAE 4,764.14 → V03 330.6% → V12 차단)
  { file: "unit_confusion_v1.5.xlsx", tpl: "v15", cols: R3_COLS, unit: PY, rawSqmNumbers: true, marketBlock: true },
  // 수식 캐시 없음 (재계산하지 않음)
  { file: "uncached_v1.5.xlsx", tpl: "v15", cols: R3_COLS, unit: SQM, marketBlock: true, recalc: false },
  // v1.3 양식 + 통합계약 (v1.4 규칙으로 재판정되는지)
  { file: "group_v1.3.xlsx", tpl: "v13", cols: R3_COLS.filter((c) => !["Z", "AA", "AB"].includes(c)), unit: SQM },
];

function findSoffice() {
  const cands = [process.env.SOFFICE, "C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe", "soffice"].filter(Boolean);
  for (const c of cands) {
    if (c === "soffice") return c;
    if (fs.existsSync(c)) return c;
  }
  throw new Error("LibreOffice(soffice)를 찾을 수 없습니다. SOFFICE 환경변수를 지정하세요.");
}

/** 모든 수식 셀의 캐시 결과를 지운다 (템플릿 예시 값 누출 방지) */
function clearFormulaCaches(wb) {
  let n = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v && typeof v === "object" && "formula" in v && !(v instanceof Date)) {
          cell.value = { formula: v.formula };
          n++;
        } else if (v && typeof v === "object" && "sharedFormula" in v) {
          cell.value = { sharedFormula: v.sharedFormula };
          n++;
        }
      });
    });
  }
  return n;
}

function fillSheet(ws, variant) {
  // 예시 행 13 비우기 (A..P 입력, Z..AB). 수식 열(Q..Y, AC..AF)은 수식 유지 (캐시는 별도로 지움)
  const inputCols = "ABCDEFGHIJKLMNOP".split("").concat(["Z", "AA", "AB"]);
  for (const c of inputCols) ws.getCell(`${c}13`).value = null;

  const isV15 = variant.tpl === "v15";
  ws.getCell("C3").value = "당산동 근생빌딩 (가상 예시)";
  ws.getCell("C4").value = "서울특별시 영등포구 당산동5가 11-47";
  ws.getCell("C5").value = AS_OF;
  ws.getCell("C8").value = "CREDEAL 테스트 픽스처";
  ws.getCell("C9").value = utc(2025, 5, 16);
  if (isV15) {
    ws.getCell("G9").value = variant.unit;
    ws.getCell("J3").value = 11_500_000_000;
    ws.getCell("J4").value = 1441.15;
    if (variant.marketBlock) {
      ws.getCell("J5").value = 450_000;
      ws.getCell("M5").value = "인근 중개사 3곳 평균 (2025-04)";
      ws.getCell("J6").value = 240_000;
      ws.getCell("M6").value = "인근 중개사 3곳 평균 (2025-04)";
      ws.getCell("J7").value = 120_000;
      ws.getCell("M7").value = "인근 중개사 2곳 평균 (2025-04)";
      ws.getCell("J8").value = 600_000;
      ws.getCell("M8").value = "옥상 통신 안테나·주차";
    }
  }

  const put = new Set(variant.cols);
  ROWS.forEach((r, i) => {
    const row = 13 + i;
    for (const [k, v] of Object.entries(r)) {
      if (!put.has(k)) continue;
      let val = v;
      if (k === "C" || k === "D") {
        // G9=평 이면 중개인이 평으로 적은 숫자(소수 2자리). 단위 혼동 시험은 ㎡ 숫자를 그대로 적는다.
        val = variant.unit === PY && !variant.rawSqmNumbers ? sqmToPy(v) : v;
      }
      ws.getCell(`${k}${row}`).value = val;
    }
  });
}

function recalcWithLibreOffice(src, outFile) {
  const soffice = findSoffice();
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), "rr15-out-"));
  const profile = path.join(os.tmpdir(), "lo-rentroll-profile").replace(/\\/g, "/");
  const res = spawnSync(
    soffice,
    [`-env:UserInstallation=file:///${profile}`, "--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", tmpOut, src],
    { encoding: "utf8", timeout: 180_000 },
  );
  const produced = path.join(tmpOut, path.basename(src));
  if (!fs.existsSync(produced)) {
    throw new Error(`LibreOffice 변환 실패: ${res.stderr || res.stdout || res.error}`);
  }
  fs.copyFileSync(produced, outFile);
}

async function build(variant) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(variant.tpl === "v15" ? TPL_V15 : TPL_V13);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`${SHEET} 시트 없음`);
  fillSheet(ws, variant);
  const cleared = clearFormulaCaches(wb);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, variant.file);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr15-src-"));
  const tmpFile = path.join(tmpDir, variant.file);
  await wb.xlsx.writeFile(tmpFile);
  if (variant.recalc === false) fs.copyFileSync(tmpFile, outFile);
  else recalcWithLibreOffice(tmpFile, outFile);
  console.log(`${variant.file}  (formula caches cleared: ${cleared}, recalc: ${variant.recalc !== false})`);
}

// 데이터 자기 검증 (오라클) — 스펙 §7
function selfCheck() {
  const toRows = (unit) =>
    ROWS.map((r) => ({
      C: unit === PY ? sqmToPy(r.C) : r.C,
      D: unit === PY ? sqmToPy(r.D) : r.D,
      group: r.B ?? "",
      state: r.O,
      H: r.H ?? null,
      I: r.I ?? null,
      G: r.G ?? null,
    }));
  const a = computeOracle(toRows(SQM), SQM);
  const b = computeOracle(toRows(PY), PY);
  const checks = [
    [a.sumAE, 1441.15], [a.sumAF, 1175.0], [b.sumAE, 1441.16], [b.sumAF, 1175.05],
    [a.rentTotal, 19_460_000], [a.depositTotal, 290_000_000], [a.weightedExclusivePct, 81.5],
    [a.Y[1], 108_238], [b.Y[1], 108_203], [a.Y[2], 111_299], [b.Y[2], 111_302],
  ];
  const bad = checks.filter(([x, y]) => x !== y);
  if (bad.length) throw new Error(`오라클 불일치: ${JSON.stringify(bad)}`);
  const conf = computeOracle(ROWS.map((r) => ({ C: r.C, D: r.D, state: r.O })), PY);
  if (conf.sumAE !== 4764.14) throw new Error(`혼동 ΣAE ${conf.sumAE} != 4764.14`);
  void P2S;
}

selfCheck();
for (const v of VARIANTS) await build(v);
