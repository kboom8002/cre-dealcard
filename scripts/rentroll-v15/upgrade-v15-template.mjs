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
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const TARGETS = [
  path.join(ROOT, "public", "CREDEAL_rentroll_template_v1.5.xlsx"),
  path.join(ROOT, "docs", "CREDEAL_rentroll_template_v1.5.xlsx"),
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

  // 3. 13행(예시 행) 중심와 앵커링(Foveal Anchoring) 텍스트 설정
  ws.getCell("A13").value = "[예시] 1F 101호";
  ws.getCell("B13").value = "(통합계약만 기입)";
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

  await wb.xlsx.writeFile(filePath);
  console.log(`[upgrade-v15-template] Updated: ${filePath}`);
}

for (const target of TARGETS) {
  await upgradeTemplate(target);
}
