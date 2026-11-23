/**
 * CREDEAL 렌트롤 표준양식 v1.5 — 인지과학(Cognitive Science) & 포카요케(Poka-Yoke) 13행 예시 행 고도화 스크립트
 *
 * 대상 파일:
 *  - public/CREDEAL_rentroll_template_v1.5.xlsx
 *  - docs/CREDEAL_rentroll_template_v1.5.xlsx
 *
 * 기존 v1.5 수식·데이터 유효성·시트 구조 계약(src/tests/unit/rentroll-template-v15.test.ts)을 100% 보존하면서
 * 13행(예시 행)의 전주의적 시각 대비(Pre-attentive Contrast), 중심와 앵커링(Foveal Anchoring),
 * 계약그룹(B열) 오입력 방지 가이드를 적용합니다.
 * [ExcelJS 공유 스타일 객체 변이 방지]
 * ExcelJS에서 기존 워크시트 로드 시 동일한 xfId 스타일 인덱스를 가진 셀들은 JavaScript 힙 상에서
 * 동일한 `cell.style` 객체 참조를 공유합니다. cell.fill이나 cell.font를 직접 수정하면 참조를 공유하는
 * 다른 행의 셀까지 함께 변이(mutation)되므로, 반드시 독립 객체(JSON clone 기반)를 생성하여
 * `cell.style`에 재할당해야 행 간 스타일 누수가 원천 차단됩니다.
 */
import ExcelJS from "exceljs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const TARGETS = [
  path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.5.xlsx"),
  path.join(ROOT, "docs", "CREDEAL_rentroll_template_v1.5.xlsx"),
];
const CASE_WORKBOOKS = [
  path.join(
    ROOT,
    "docs",
    "finaltest",
    "testdata",
    "CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합",
    "02_현황_렌트롤_v1.5_sqm.xlsx"
  ),
  path.join(
    ROOT,
    "docs",
    "finaltest",
    "testdata",
    "CASE-04_영등포_당산동5가_11-47_XLSX입력_다호실복합",
    "03_안정화_렌트롤_v1.5_sqm.xlsx"
  ),
  path.join(
    ROOT,
    "docs",
    "finaltest",
    "testdata",
    "CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스",
    "02_현황_렌트롤_v1.5_pyeong.xlsx"
  ),
  path.join(
    ROOT,
    "docs",
    "finaltest",
    "testdata",
    "CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스",
    "03_안정화_렌트롤_v1.5_pyeong.xlsx"
  ),
  path.join(
    ROOT,
    "docs",
    "finaltest",
    "testdata",
    "CASE-05_영등포_양평동4가_117외2_XLSX입력_프라임오피스",
    "99_부록_V12_단위혼동_차단게이트_체험용.xlsx"
  ),
];

const DEMO_INPUT_FILL = "FFECEFF4"; // 슬레이트 그레이 (노란색 #FFFF00 입력 셀과 전주의적 분리)
const DEMO_AUTO_FILL = "FFE2E8F0";  // 자동계산 열 예시 배경
const DEMO_FONT_COLOR = "FF64748B"; // 뮤트 슬레이트 그레이
const NAVY_DIVIDER = "FF1F3864";    // 13행(예시)과 14행(실제 입력 시작) 사이 경계선

const thinGray = { style: "thin", color: { argb: "FFBFBFBF" } };
const mediumNavy = { style: "medium", color: { argb: NAVY_DIVIDER } };

const INPUT_COLS = new Set(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Z", "AA", "AB"]);
const ALL_COLS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF",
];

const ROW_EXCLUDE_CRITERIA = '$A$13:$A$112,"<>[예시]*",$P$13:$P$112,"<>*예시 행*"';
const CHK_EXCLUDE_CRITERIA = '렌트롤!$A$13:$A$112,"<>[예시]*",렌트롤!$P$13:$P$112,"<>*예시 행*"';

function findSoffice() {
  const cands = [
    process.env.SOFFICE,
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    "soffice",
  ].filter(Boolean);
  for (const c of cands) {
    if (c === "soffice") return c;
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Row 10 합계 및 자동검증 시트 수식을 13행('[예시]' / '예시 행') 제외 동적 SUMIFS/COUNTIFS 로 갱신합니다.
 * 기존 $13:$112 범위 참조를 유지하므로 13행 덮어쓰기 레거시 픽스처도 정상 계산됩니다.
 */
export function applyRow13ExclusionFormulas(wb) {
  const ws = wb.getWorksheet("렌트롤");
  if (!ws) throw new Error("렌트롤 시트 없음");

  for (const col of ["C", "D", "G", "H", "I", "Q", "R", "X", "AE", "AF"]) {
    ws.getCell(`${col}10`).value = {
      formula: `SUMIFS(${col}13:${col}112,${ROW_EXCLUDE_CRITERIA})`,
    };
  }
  ws.getCell("S10").value = {
    formula: `IFERROR(SUMIFS(D13:D112,C13:C112,">0",D13:D112,">0",${ROW_EXCLUDE_CRITERIA})/SUMIFS(C13:C112,C13:C112,">0",D13:D112,">0",${ROW_EXCLUDE_CRITERIA})*100,"")`,
  };

  const chk = wb.getWorksheet("자동검증");
  if (!chk) return;

  const setFormula = (addr, formula) => {
    chk.getCell(addr).value = { formula };
  };

  setFormula("C4", `TEXT(SUMIFS(렌트롤!$H$13:$H$112,${CHK_EXCLUDE_CRITERIA}),"#,##0")&"원"`);
  setFormula(
    "C5",
    `TEXT(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA}),"#,##0.00")&"㎡ / "&TEXT(SUMIFS(렌트롤!$Q$13:$Q$112,${CHK_EXCLUDE_CRITERIA}),"#,##0.0")&"평"`
  );
  setFormula(
    "C6",
    `TEXT(SUMIFS(렌트롤!$AF$13:$AF$112,${CHK_EXCLUDE_CRITERIA}),"#,##0.00")&"㎡ / "&TEXT(SUMIFS(렌트롤!$R$13:$R$112,${CHK_EXCLUDE_CRITERIA}),"#,##0.0")&"평"`
  );
  setFormula(
    "C7",
    'IF(렌트롤!$S$10="","산출 불가 (임대·전용면적 쌍 없음)",TEXT(렌트롤!$S$10,"0.0")&"%")'
  );
  setFormula(
    "C8",
    `COUNTIFS(렌트롤!$A$13:$A$112,"<>",${CHK_EXCLUDE_CRITERIA},렌트롤!$C$13:$C$112,"")&"건"`
  );
  setFormula(
    "C9",
    `COUNTIFS(렌트롤!$A$13:$A$112,"<>",${CHK_EXCLUDE_CRITERIA},렌트롤!$D$13:$D$112,"")&"건"`
  );
  setFormula(
    "C10",
    `COUNTIFS(렌트롤!$S$13:$S$112,">100",${CHK_EXCLUDE_CRITERIA})&"건 100% 초과 / "&COUNTIFS(렌트롤!$S$13:$S$112,"<30",${CHK_EXCLUDE_CRITERIA})&"건 30% 미만"`
  );
  setFormula(
    "C11",
    `COUNTIFS(렌트롤!$W$13:$W$112,"만료*",${CHK_EXCLUDE_CRITERIA})&" / "&COUNTIFS(렌트롤!$O$13:$O$112,"임대중",${CHK_EXCLUDE_CRITERIA})&"건"`
  );
  setFormula(
    "C12",
    `IF(COUNTIFS(렌트롤!$W$13:$W$112,"만료*",${CHK_EXCLUDE_CRITERIA})>COUNTIFS(렌트롤!$O$13:$O$112,"임대중",${CHK_EXCLUDE_CRITERIA})/2,"발행 차단","통과")`
  );
  setFormula("C13", `COUNTIFS(렌트롤!$W$13:$W$112,"임박*",${CHK_EXCLUDE_CRITERIA})&"건"`);
  setFormula("C14", `COUNTIFS(렌트롤!$V$13:$V$112,"확인 필요",${CHK_EXCLUDE_CRITERIA})&"건"`);
  setFormula("C15", `COUNTIFS(렌트롤!$N$13:$N$112,"미확인",${CHK_EXCLUDE_CRITERIA})&"건"`);
  setFormula(
    "C16",
    `COUNTIFS(렌트롤!$A$13:$A$112,"<>",${CHK_EXCLUDE_CRITERIA},렌트롤!$E$13:$E$112,"")&"건"`
  );
  setFormula("C17", `COUNTIFS(렌트롤!$U$13:$U$112,"×*",${CHK_EXCLUDE_CRITERIA})&"건"`);
  setFormula(
    "C19",
    `COUNTIFS(렌트롤!$O$13:$O$112,"공실",${CHK_EXCLUDE_CRITERIA})&"건 / "&COUNTIFS(렌트롤!$O$13:$O$112,"자가사용",${CHK_EXCLUDE_CRITERIA})&"건"`
  );

  const validRowCount = `COUNTIFS(렌트롤!$A$13:$A$112,"<>",${CHK_EXCLUDE_CRITERIA})`;
  const validStateCount = `COUNTIFS(렌트롤!$O$13:$O$112,"<>",${CHK_EXCLUDE_CRITERIA})`;
  const validAreaCCount = `COUNTIFS(렌트롤!$C$13:$C$112,"<>",${CHK_EXCLUDE_CRITERIA})`;
  const validAreaDCount = `COUNTIFS(렌트롤!$D$13:$D$112,"<>",${CHK_EXCLUDE_CRITERIA})`;
  const validLawCount = `COUNTIFS(렌트롤!$F$13:$F$112,"<>",${CHK_EXCLUDE_CRITERIA})`;
  const leasedCount = `COUNTIFS(렌트롤!$O$13:$O$112,"임대중",${CHK_EXCLUDE_CRITERIA})`;

  setFormula(
    "C23",
    `IF(AND(${validRowCount}>0,${validStateCount}=${validRowCount},COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$E$13:$E$112,"<>",${CHK_EXCLUDE_CRITERIA})=${leasedCount},COUNTIFS(렌트롤!$AD$13:$AD$112,"월세 누락",${CHK_EXCLUDE_CRITERIA})=0,COUNTIFS(렌트롤!$AD$13:$AD$112,"금액 중복",${CHK_EXCLUDE_CRITERIA})=0,COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$L$13:$L$112,"<>",${CHK_EXCLUDE_CRITERIA})=${leasedCount}),"충족","미달")`
  );
  setFormula(
    "C24",
    `IF(AND(C23="충족",${validAreaCCount}=${validRowCount},${validLawCount}=${validRowCount},COUNTIFS(렌트롤!$AD$13:$AD$112,"관리비 누락",${CHK_EXCLUDE_CRITERIA})=0),"충족","미달")`
  );
  setFormula(
    "C25",
    `IF(AND(C24="충족",COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$J$13:$J$112,"<>",${CHK_EXCLUDE_CRITERIA})=${leasedCount},COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$N$13:$N$112,"<>",${CHK_EXCLUDE_CRITERIA})=${leasedCount},COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$N$13:$N$112,"미확인",${CHK_EXCLUDE_CRITERIA})=0),"충족","미달")`
  );
  setFormula(
    "C26",
    `IF(AND(${validRowCount}>0,${validAreaCCount}=${validRowCount},${validAreaDCount}=${validRowCount},COUNTIFS(렌트롤!$S$13:$S$112,">100",${CHK_EXCLUDE_CRITERIA})=0),"충족","미달")`
  );

  setFormula(
    "C35",
    `COUNTIFS(렌트롤!$AD$13:$AD$112,"월세 누락",${CHK_EXCLUDE_CRITERIA})&"건 월세 누락 / "&COUNTIFS(렌트롤!$AD$13:$AD$112,"금액 중복",${CHK_EXCLUDE_CRITERIA})&"건 그룹 금액 중복"`
  );
  setFormula(
    "C37",
    `IF(렌트롤!$J$4="","연면적 미입력",TEXT(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})/렌트롤!$J$4,"0.0%"))`
  );
  setFormula(
    "C38",
    `IF(OR(렌트롤!$J$3="",렌트롤!$J$3-SUMIFS(렌트롤!$G$13:$G$112,${CHK_EXCLUDE_CRITERIA})<=0),"매각가 미입력",TEXT(SUMIFS(렌트롤!$H$13:$H$112,${CHK_EXCLUDE_CRITERIA})*12/(렌트롤!$J$3-SUMIFS(렌트롤!$G$13:$G$112,${CHK_EXCLUDE_CRITERIA})),"0.00%"))`
  );
  setFormula(
    "C39",
    `IF(OR(렌트롤!$J$3="",렌트롤!$J$3-SUMIFS(렌트롤!$G$13:$G$112,${CHK_EXCLUDE_CRITERIA})<=0),"매각가 미입력",TEXT((SUMIFS(렌트롤!$H$13:$H$112,${CHK_EXCLUDE_CRITERIA})+N(렌트롤!$J$8))*12/(렌트롤!$J$3-SUMIFS(렌트롤!$G$13:$G$112,${CHK_EXCLUDE_CRITERIA})),"0.00%"))`
  );
  setFormula(
    "C40",
    `IF(SUMIFS(렌트롤!$H$13:$H$112,${CHK_EXCLUDE_CRITERIA})=0,"-",TEXT((SUMIFS(렌트롤!$H$13:$H$112,렌트롤!$AC$13:$AC$112,"12개월 내",${CHK_EXCLUDE_CRITERIA})+SUMIFS(렌트롤!$H$13:$H$112,렌트롤!$AC$13:$AC$112,"만료 경과",${CHK_EXCLUDE_CRITERIA}))/SUMIFS(렌트롤!$H$13:$H$112,${CHK_EXCLUDE_CRITERIA}),"0.0%"))`
  );
  setFormula(
    "C41",
    `COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$Z$13:$Z$112,"계약서 원본",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})&" 원본 / "&COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$Z$13:$Z$112,"매도인 렌트롤",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})&" 매도인 / "&COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$Z$13:$Z$112,"구두",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})&" 구두 / "&COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$Z$13:$Z$112,"",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})&" 미기재"`
  );
  setFormula(
    "C42",
    `COUNTIFS(렌트롤!$AB$13:$AB$112,"연체",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})&"건 연체 / "&(COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$AB$13:$AB$112,"미확인",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA})+COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$AB$13:$AB$112,"",렌트롤!$H$13:$H$112,"<>",${CHK_EXCLUDE_CRITERIA}))&"건 미확인"`
  );
  setFormula("C43", `COUNTIFS(렌트롤!$AA$13:$AA$112,">0",${CHK_EXCLUDE_CRITERIA})&"건"`);
  setFormula(
    "C45",
    `IF(AND(C25="충족",COUNT(렌트롤!$J$5:$J$7)>=1,COUNTA(렌트롤!$M$5:$M$7)>=COUNT(렌트롤!$J$5:$J$7),COUNTIFS(렌트롤!$O$13:$O$112,"임대중",렌트롤!$Z$13:$Z$112,"",${CHK_EXCLUDE_CRITERIA})=0),"충족","미달")`
  );
  setFormula(
    "C46",
    `IF(OR(렌트롤!$J$4="",SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})=0),"연면적 또는 면적 미입력 — 판정 보류",IF(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})/렌트롤!$J$4>2,"⚠ 단위 혼동 의심 — 임대면적 합이 연면적의 "&TEXT(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})/렌트롤!$J$4,"0.0")&"배 (G9가 평인데 ㎡ 숫자를 적었거나, J4를 평으로 적었을 수 있음)",IF(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})/렌트롤!$J$4<0.45,"⚠ 단위 혼동 의심 — 임대면적 합이 연면적의 "&TEXT(SUMIFS(렌트롤!$AE$13:$AE$112,${CHK_EXCLUDE_CRITERIA})/렌트롤!$J$4,"0%")&" (G9가 ㎡인데 평 숫자를 적었을 수 있음)","정상")))`
  );
}

/**
 * LibreOffice headless로 임시 사본의 수식 캐시(result)를 재계산한 뒤,
 * 원본 ExcelJS 워크북의 수식 셀 result에만 반영하여 스타일/유효성/activeCell을 100% 보존합니다.
 */
async function syncCachedResultsWithLibreOffice(wb, tagName) {
  const soffice = findSoffice();
  if (!soffice) {
    console.warn("[upgrade-v15-template] LibreOffice(soffice) 없음 — 수식 캐시 동기화 건너뜀");
    return false;
  }

  const tmpSrcDir = fs.mkdtempSync(path.join(os.tmpdir(), "v15-recalc-src-"));
  const tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "v15-recalc-out-"));
  const srcFile = path.join(tmpSrcDir, path.basename(tagName));
  const outFile = path.join(tmpOutDir, path.basename(tagName));
  const profile = path.join(os.tmpdir(), "lo-rentroll-profile").replace(/\\/g, "/");

  try {
    await wb.xlsx.writeFile(srcFile);
    const res = spawnSync(
      soffice,
      [
        `-env:UserInstallation=file:///${profile}`,
        "--headless",
        "--calc",
        "--convert-to",
        "xlsx:Calc MS Excel 2007 XML",
        "--outdir",
        tmpOutDir,
        srcFile,
      ],
      { encoding: "utf8", timeout: 180_000 }
    );
    if (res.status !== 0 || !fs.existsSync(outFile)) {
      throw new Error(`LibreOffice 재계산 실패: ${res.stderr || res.stdout || res.error}`);
    }

    const recalcWb = new ExcelJS.Workbook();
    await recalcWb.xlsx.readFile(outFile);

    for (const ws of wb.worksheets) {
      const recalcWs = recalcWb.getWorksheet(ws.name);
      if (!recalcWs) continue;
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const val = cell.value;
          if (!val || typeof val !== "object" || !("formula" in val) || val instanceof Date) return;
          const recalcVal = recalcWs.getCell(cell.address).value;
          if (recalcVal && typeof recalcVal === "object" && "result" in recalcVal) {
            cell.value = { formula: val.formula, result: recalcVal.result };
          } else if (recalcVal !== null && recalcVal !== undefined && typeof recalcVal !== "object") {
            cell.value = { formula: val.formula, result: recalcVal };
          } else {
            cell.value = { formula: val.formula };
          }
        });
      });
    }
    return true;
  } finally {
    fs.rmSync(tmpSrcDir, { recursive: true, force: true });
    fs.rmSync(tmpOutDir, { recursive: true, force: true });
  }
}

async function upgradeTemplate(filePath) {
  if (!fs.existsSync(filePath)) return;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet("렌트롤");
  if (!ws) throw new Error(`렌트롤 시트 없음: ${filePath}`);

  // 1. 2행 안내 문구 고도화 (13행 회색 이탤릭 예시 안내 명시)
  ws.getCell("A2").value =
    "노란색 셀(14행~)만 입력 · 13행(회색 이탤릭)은 작성 예시(업로드 시 자동 제외) · 회색 열은 자동계산 · 1행=1호실 · 11행 R1/R2/R3 = 해상도";

  // 2. A12(호실/층) 및 B12(계약그룹) 헤더 노트 고도화
  ws.getCell("A12").note = {
    texts: [
      {
        font: { size: 9, name: "맑은 고딕" },
        text: "[R1·필수] 층·호실 표기 (예: 1F 101호, 101호, B1, 2F).\n한 층에 여러 호실이면 행을 나눠 적습니다.\n13행은 작성 예시이므로 14행(노란색 칸)부터 입력해 주세요.",
      },
    ],
    margins: { insetmode: "custom", inset: [0.1, 0.1, 0.1, 0.1] },
  };
  ws.getCell("B12").note = {
    texts: [
      {
        font: { size: 9, name: "맑은 고딕" },
        text: "[R2·조건부] 통합계약(한 임차인이 1개 계약서로 여러 호실·층 임차)일 때만 같은 기호(A, B)를 적습니다.\n단독 계약은 반드시 비워 두세요.\n⚠ '근린생활', '상가', '주거' 같은 건물 용도를 적는 칸이 아닙니다!",
      },
    ],
    margins: { insetmode: "custom", inset: [0.1, 0.1, 0.1, 0.1] },
  };

  // 3. 13행(예시 행) 중심와 앵커링(Foveal Anchoring) 텍스트 설정 (B13 통합계약 더미 문구는 비워 오작동 방지)
  ws.getCell("A13").value = "[예시] 1F 101호";
  ws.getCell("B13").value = null;
  ws.getCell("E13").value = "[예시] 사무실 (14행 노란 칸부터 입력)";
  ws.getCell("P13").value = "← 예시 행입니다 (업로드 시 자동 제외 · 14행 노란 칸부터 입력)";

  // 4. 13행 전체 셀 스타일(슬레이트 그레이 배경 + 뮤트 이탤릭 폰트 + 하단 네이비 구분선) 적용
  // ExcelJS 공유 스타일 객체 참조 분리를 위해 JSON clone 후 독립 객체 할당
  ws.getRow(13).height = 20;
  for (const col of ALL_COLS) {
    const cell = ws.getCell(`${col}13`);
    const isInput = INPUT_COLS.has(col);
    const existing = JSON.parse(JSON.stringify(cell.style || {}));
    cell.style = {
      ...existing,
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isInput ? DEMO_INPUT_FILL : DEMO_AUTO_FILL },
      },
      font: {
        name: "맑은 고딕",
        size: 9,
        italic: true,
        bold: col === "A" || col === "P",
        color: { argb: DEMO_FONT_COLOR },
      },
      border: {
        top: thinGray,
        left: thinGray,
        right: thinGray,
        bottom: mediumNavy,
      },
    };
  }

  // 4-B. 14~25행(첫 입력 영역) 연노랑 배경(#FFF9DB / FFFFF9DB) 및 일반 폰트 적용 (14행 노란 칸부터 입력 가이드와 일치)
  // 13행 및 타 행들과의 스타일 공유 오염을 원천 차단하기 위해 셀별 독립 style 객체 할당
  const SOFT_YELLOW_INPUT_FILL = "FFFFF9DB";
  const INPUT_FONT_COLOR = "FF0F172A";
  const THIN_BORDER = { style: "thin", color: { argb: "FFD9D9D9" } };

  for (let r = 14; r <= 25; r++) {
    ws.getRow(r).height = 20;
    for (const col of ALL_COLS) {
      const cell = ws.getCell(`${col}${r}`);
      const isInput = INPUT_COLS.has(col);
      const existing = JSON.parse(JSON.stringify(cell.style || {}));
      cell.style = {
        ...existing,
        fill: {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: isInput ? SOFT_YELLOW_INPUT_FILL : DEMO_AUTO_FILL },
        },
        font: {
          name: "맑은 고딕",
          size: 9,
          italic: false,
          color: { argb: isInput ? INPUT_FONT_COLOR : DEMO_FONT_COLOR },
        },
        border: {
          top: r === 14 ? mediumNavy : THIN_BORDER,
          left: THIN_BORDER,
          right: THIN_BORDER,
          bottom: THIN_BORDER,
        },
      };
    }
  }

  // 5. 오픈 시 기본 선택 셀을 A14(첫 번째 노란색 입력 행)로 지정
  if (Array.isArray(ws.views) && ws.views.length > 0) {
    ws.views[0] = {
      ...ws.views[0],
      activeCell: "A14",
    };
  }

  // 6. 기입요령 시트 내 예시 행 안내 업데이트
  const guide = wb.getWorksheet("기입요령");
  if (guide) {
    guide.eachRow((row) => {
      const aText = String(row.getCell(1).value ?? "");
      if (aText.includes("예시 행")) {
        row.getCell(1).value = "13행(회색 예시 행) 안내";
        row.getCell(2).value =
          "13행(회색 이탤릭 「[예시] 1F 101호」)은 입력 방법을 보여주는 가이드 행입니다. 업로드 시 자동으로 제외되므로 14행(노란색 첫 행)부터 입력하시면 됩니다. (만약 13행에 실제 호실 정보를 덮어써도 시스템이 실제 데이터임을 감지해 정상 반영합니다.)";
      }
    });
  }

  // 7. Row 10 합계 및 자동검증 수식에 13행 예시 제외(SUMIFS/COUNTIFS) 적용 + LibreOffice 수식 캐시 동기화
  applyRow13ExclusionFormulas(wb);
  await syncCachedResultsWithLibreOffice(wb, filePath);

  await wb.xlsx.writeFile(filePath);
  console.log(`[upgrade-v15-template] Updated: ${filePath}`);
}

async function upgradeCaseWorkbook(filePath) {
  if (!fs.existsSync(filePath)) return;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet("렌트롤");
  if (!ws) throw new Error(`렌트롤 시트 없음: ${filePath}`);

  // B13 통합계약 안내 더미 문구 제거 + Row 10/자동검증 수식 갱신 + LibreOffice 캐시 동기화
  if (ws.getCell("B13").value === "(통합계약만 기입)") {
    ws.getCell("B13").value = null;
  }
  applyRow13ExclusionFormulas(wb);
  await syncCachedResultsWithLibreOffice(wb, filePath);

  await wb.xlsx.writeFile(filePath);
  console.log(`[upgrade-v15-template] Updated case workbook: ${filePath}`);
}

const args = new Set(process.argv.slice(2));
const runTemplates = !args.has("--cases-only");
const runCases = args.has("--all") || args.has("--cases") || args.has("--cases-only");

if (runTemplates) {
  for (const target of TARGETS) {
    await upgradeTemplate(target);
  }
}
if (runCases) {
  for (const caseFile of CASE_WORKBOOKS) {
    await upgradeCaseWorkbook(caseFile);
  }
}
