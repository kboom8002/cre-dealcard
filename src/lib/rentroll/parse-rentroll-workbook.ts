/**
 * 렌트롤 워크북 파서 (CREDEAL 렌트롤 표준 양식 v1.3 / v1.4 / v1.5 + 비표준 파일 폴백)
 *
 * 스펙: docs/RENTROLL_v1.3_to_v1.5.md §6 (파서 계약)
 *  - 버전 판별(§6.1): A1 'v1.x' → AE12/AD12 보조 판별 → unknown
 *  - 템플릿 버전은 고정 위치(A~AF)로 읽고, 머리글은 접두어(startsWith)로만 검증한다(§6.2)
 *  - 면적(§6.3): v1.5는 G9(㎡/평)를 먼저 읽어 C·D를 직접 ㎡ 환산(ROUND 2). AE·AF 캐시는 대조용(0/빈 값이면 생략)
 *  - 엑셀 안의 판정·계산 캐시(Q~Y, AC, AD)는 읽지 않는다(§8). J4(연면적)·J5~J7(시장 임대료)은 환산하지 않는다
 *  - 단위는 추측해 자동 보정하지 않는다. 혼동 의심(V12)은 blocking+overridable 이슈로 낼 뿐이다(§6.4-7)
 *  - unknown(레거시/비표준)은 기존 키워드 경로(parseRentRollData)를 그대로 쓰고 VERSION_UNKNOWN 경고를 낸다
 *
 * 브라우저/노드 어디서나 동작하는 순수 모듈 — 워크북 읽기(XLSX.read)는 호출자가 한다.
 */
import * as XLSX from "xlsx";
import {
  parseRentRollData,
  excelDateToIso,
  type ParseResult,
  type RentRollLayout,
} from "@/lib/rentroll/parse-rentroll-sheet";
import type {
  AreaInputUnit,
  RentRollIssue,
  RentRollMeta,
  RentrollVersion,
} from "@/domain/building/mobile-im/rentroll-meta";
import { checkAreaUnit } from "@/domain/building/mobile-im/rentroll-checks";

export interface ParseRentRollWorkbookOptions {
  /** 기준일이 없을 때(C5 비어 있음) 만료 경고에 쓰는 '오늘' — 테스트 결정성용 */
  now?: Date;
}

const HEADER_ROW_IDX = 11; // 12행
const FIRST_DATA_ROW_IDX = 12; // 13행
const LAST_DATA_ROW_IDX = 111; // 112행

/** A~P 입력 열 머리글 접두어 (공백 제거 후 startsWith 비교) — C·D 는 v1.5 에서 수식 머리글 */
const INPUT_HEADER_PREFIX: Array<{ col: string; idx: number; prefix: string }> = [
  { col: "A", idx: 0, prefix: "호실" },
  { col: "B", idx: 1, prefix: "계약그룹" },
  { col: "C", idx: 2, prefix: "임대면적(" },
  { col: "D", idx: 3, prefix: "전용면적(" },
  { col: "E", idx: 4, prefix: "업종" },
  { col: "F", idx: 5, prefix: "적용법령" },
  { col: "G", idx: 6, prefix: "보증금" },
  { col: "H", idx: 7, prefix: "월세" },
  { col: "I", idx: 8, prefix: "관리비" },
  { col: "J", idx: 9, prefix: "최초계약" },
  { col: "K", idx: 10, prefix: "현계약시작" },
  { col: "L", idx: 11, prefix: "현계약만료" },
  { col: "M", idx: 12, prefix: "갱신요구" },
  { col: "N", idx: 13, prefix: "대항력" },
  { col: "O", idx: 14, prefix: "임대상태" },
  { col: "P", idx: 15, prefix: "비고" },
];
const V14_HEADER_PREFIX = [
  { col: "Z", idx: 25, prefix: "근거" },
  { col: "AA", idx: 26, prefix: "렌트프리" },
  { col: "AB", idx: 27, prefix: "입금" },
];
const V15_HEADER_PREFIX = [
  { col: "AE", idx: 30, prefix: "임대면적(㎡" },
  { col: "AF", idx: 31, prefix: "전용면적(㎡" },
];
/** 수식 머리글(C12·D12)은 미계산 파일에서 값이 비거나 0 — 위치로 읽으므로 경고만 낸다 */
const FORMULA_HEADER_COLS = new Set(["C", "D"]);

type AnySheet = XLSX.WorkSheet;

/** 셀 원시값 (오류 셀·없는 셀은 undefined). Date/number/string 그대로 */
function cellRaw(ws: AnySheet, addr: string): unknown {
  const c = ws[addr] as XLSX.CellObject | undefined;
  if (!c || c.t === "e") return undefined;
  return c.v;
}

function cellText(ws: AnySheet, addr: string): string {
  const v = cellRaw(ws, addr);
  return v == null ? "" : String(v).trim();
}

function cellNumber(ws: AnySheet, addr: string): number | undefined {
  const v = cellRaw(ws, addr);
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

const stripSpaces = (s: string) => s.replace(/\s+/g, "");

/** §6.1 버전 판별. 1.3~1.5 이외(1.2, 비표준 등)는 'unknown' */
export function detectVersion(ws: AnySheet): RentrollVersion {
  const m = cellText(ws, "A1").match(/v(1\.\d)/i);
  if (m) return m[1] === "1.3" || m[1] === "1.4" || m[1] === "1.5" ? m[1] : "unknown";
  // 제목이 지워진 경우 보조 판별
  if (cellText(ws, "AE12").startsWith("임대면적(㎡")) return "1.5";
  if (cellText(ws, "AD12").startsWith("금액 판정")) return "1.4";
  return "unknown";
}

/** G9 → 입력 단위. 비어 있거나 알 수 없으면 ㎡ 기본 + 이슈(자동 보정 아님) */
export function readAreaUnit(
  ws: AnySheet,
  version: RentrollVersion,
): { unit: AreaInputUnit; issue?: RentRollIssue } {
  if (version !== "1.5") return { unit: "sqm" }; // v1.3·v1.4 는 항상 ㎡
  const v = cellText(ws, "G9");
  if (v === "평") return { unit: "pyeong" };
  if (/^(㎡|m2|m²|sqm)$/i.test(v)) return { unit: "sqm" };
  if (v === "") {
    return {
      unit: "sqm",
      issue: {
        code: "AREA_UNIT_UNKNOWN",
        level: "warning",
        message: "면적 단위(G9)가 비어 있어 ㎡로 읽었습니다. 평으로 적었다면 G9에서 '평'을 선택해 다시 올려 주세요 (자동 보정하지 않습니다).",
      },
    };
  }
  return {
    unit: "sqm",
    issue: {
      code: "AREA_UNIT_UNKNOWN",
      level: "warning",
      message: `알 수 없는 면적 단위 '${v}'(G9) — ㎡로 읽었습니다. ㎡ 또는 평 중에서 골라 다시 올려 주세요 (자동 보정하지 않습니다).`,
    },
  };
}

/** 렌트롤 시트 선택: 이름에 '렌트롤'/'rent' 포함 우선, 없으면 첫 시트 */
export function pickRentRollSheetName(wb: XLSX.WorkBook): string | undefined {
  return (
    wb.SheetNames.find((n) => n.includes("렌트롤") || n.toLowerCase().includes("rent")) ?? wb.SheetNames[0]
  );
}

function isWorkbook(x: XLSX.WorkBook | XLSX.WorkSheet): x is XLSX.WorkBook {
  return !!x && Array.isArray((x as XLSX.WorkBook).SheetNames) && !!(x as XLSX.WorkBook).Sheets;
}

/** 시트 → AoA (0-based 행/열 위치 보존, 빈 행 유지). 날짜는 시리얼/Date 원시값 그대로 */
function sheetToAoA(ws: AnySheet): any[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "", blankrows: true }) as any[][];
}

function buildLayout(version: RentrollVersion, unit: AreaInputUnit): RentRollLayout {
  const v14 = version === "1.4" || version === "1.5";
  return {
    headerRowIdx: HEADER_ROW_IDX,
    firstDataRowIdx: FIRST_DATA_ROW_IDX,
    lastDataRowIdx: LAST_DATA_ROW_IDX,
    cols: {
      floor: 0,
      group: 1,
      leaseArea: 2,
      exclusiveArea: 3,
      bizTenant: 4,
      legal: 5,
      deposit: 6,
      rent: 7,
      mgmt: 8,
      firstContract: 9,
      leaseStart: 10,
      leaseEnd: 11,
      renewal: 12,
      opposing: 13,
      state: 14,
      note: 15,
      evidence: v14 ? 25 : -1,
      rentFree: v14 ? 26 : -1,
      payment: v14 ? 27 : -1,
      leaseSqmCache: version === "1.5" ? 30 : -1,
      exclusiveSqmCache: version === "1.5" ? 31 : -1,
    },
    areaInputUnit: unit,
    readV14Fields: v14,
  };
}

/** 머리글 접두어 검증 — 불일치 열 목록 반환 (수식 머리글 C·D 는 별도 분류) */
function verifyHeaders(ws: AnySheet, version: RentrollVersion): { bad: string[]; formulaUncached: string[] } {
  const checks = [
    ...INPUT_HEADER_PREFIX,
    ...(version === "1.4" || version === "1.5" ? V14_HEADER_PREFIX : []),
    ...(version === "1.5" ? V15_HEADER_PREFIX : []),
  ];
  const bad: string[] = [];
  const formulaUncached: string[] = [];
  for (const c of checks) {
    const text = stripSpaces(cellText(ws, `${c.col}12`));
    if (text.startsWith(stripSpaces(c.prefix))) continue;
    if (FORMULA_HEADER_COLS.has(c.col) && version === "1.5") formulaUncached.push(c.col);
    else bad.push(c.col);
  }
  return { bad, formulaUncached };
}

/** C3/C4/C5/J3~J8/M5~M8 — 셀 주소로 읽는 헤더 블록 */
function readHeaderBlock(ws: AnySheet, version: RentrollVersion, unit: AreaInputUnit) {
  const v14 = version === "1.4" || version === "1.5";
  const issues: RentRollIssue[] = [];
  const meta: RentRollMeta = { area_input_unit: unit, rentroll_version: version };

  const c5 = cellRaw(ws, "C5");
  const asOf = excelDateToIso(c5);
  if (asOf) {
    meta.rentroll_as_of = asOf;
  } else {
    meta.rentroll_as_of = null;
    issues.push({
      code: "AS_OF_MISSING",
      level: "warning",
      message:
        c5 == null || c5 === ""
          ? "렌트롤 기준일(C5)이 비어 있습니다 — 만기·갱신권 판정이 오늘 날짜 기준이 되어 시점마다 달라집니다."
          : `렌트롤 기준일(C5) '${String(c5)}'을(를) 날짜로 읽을 수 없습니다 — 오늘 날짜 기준으로 판정합니다.`,
    });
  }

  if (v14) {
    const price = cellNumber(ws, "J3");
    meta.asking_price_krw = price != null && price > 0 ? Math.round(price) : null;
    const gfa = cellNumber(ws, "J4");
    meta.gfa_sqm = gfa != null && gfa > 0 ? gfa : null; // J4 는 항상 ㎡ — 환산 금지
    const rent = (addr: string) => {
      const n = cellNumber(ws, addr);
      return n != null && n > 0 ? Math.round(n) : null; // J5~J7: 원/전용평·월 — 환산 금지
    };
    const src = (addr: string) => cellText(ws, addr) || null;
    meta.market_rent_1f = rent("J5");
    meta.market_rent_1f_source = src("M5");
    meta.market_rent_upper = rent("J6");
    meta.market_rent_upper_source = src("M6");
    meta.market_rent_basement = rent("J7");
    meta.market_rent_basement_source = src("M7");
    const other = cellNumber(ws, "J8");
    meta.other_income_krw = other != null && other > 0 ? Math.round(other) : null;
    meta.other_income_note = src("M8");
  }
  return { meta, issues, asOf };
}

/**
 * 렌트롤 워크북/시트 파서. 템플릿 v1.3~v1.5 는 고정 위치로, 그 외는 레거시 키워드 경로로 읽는다.
 * ParseResult 에 version / meta / issues 가 채워진다 (blocking 이슈는 warnings 문자열에 넣지 않는다).
 */
export function parseRentRollWorkbook(
  input: XLSX.WorkBook | XLSX.WorkSheet,
  opts: ParseRentRollWorkbookOptions = {},
): ParseResult {
  const now = opts.now ?? new Date();
  let ws: AnySheet | undefined;
  if (isWorkbook(input)) {
    const name = pickRentRollSheetName(input);
    if (!name) throw new Error("시트를 찾을 수 없습니다. 파일이 비어있는지 확인해주세요.");
    ws = input.Sheets[name];
    if (!ws) throw new Error(`시트 '${name}'를 읽을 수 없습니다.`);
  } else {
    ws = input;
  }

  const version = detectVersion(ws);
  const fallbackToLegacy = (extra?: RentRollIssue): ParseResult => {
    const aoa = sheetToAoA(ws!);
    if (!aoa.length) throw new Error("시트에 데이터가 없습니다. 다른 시트나 파일을 확인해주세요.");
    const issue: RentRollIssue = extra ?? {
      code: "VERSION_UNKNOWN",
      level: "warning",
      message:
        "CREDEAL 표준 양식(v1.5)이 아니라 열 이름으로 열을 추정했습니다. 면적 단위·계약그룹 등이 정확하지 않을 수 있어 최신 양식 사용을 권장합니다.",
    };
    const res = parseRentRollData(aoa, { asOf: now, preWarnings: [issue.message] });
    return { ...res, version: "unknown", meta: { area_input_unit: "sqm", rentroll_version: "unknown" }, issues: [issue, ...res.issues] };
  };

  if (version === "unknown") return fallbackToLegacy();

  // ── 템플릿 버전: 고정 위치 + 접두어 검증
  const { bad, formulaUncached } = verifyHeaders(ws, version);
  if (bad.length > 7) {
    return fallbackToLegacy({
      code: "VERSION_UNKNOWN",
      level: "warning",
      message: `양식 제목은 v${version}이지만 머리글(${bad.slice(0, 6).join("·")}…)이 표준 위치와 달라 열 이름으로 추정했습니다. 열을 옮기거나 지우지 않았는지 확인해 주세요.`,
    });
  }

  const { unit, issue: unitIssue } = readAreaUnit(ws, version);
  const { meta, issues: headerIssues, asOf } = readHeaderBlock(ws, version, unit);
  const issues: RentRollIssue[] = [];
  if (unitIssue) issues.push(unitIssue);
  if (bad.length > 0) {
    issues.push({
      code: "HEADER_MISMATCH",
      level: "warning",
      message: `머리글이 표준과 다른 열이 있습니다 (${bad.join(", ")}열) — 열 위치 기준으로 읽었으니 값이 맞는지 확인해 주세요.`,
    });
  }
  if (formulaUncached.length > 0) {
    issues.push({
      code: "HEADER_MISMATCH",
      level: "warning",
      message: `${formulaUncached.join("·")}열 머리글(수식)이 계산되지 않은 파일입니다 — 위치 기준으로 읽고 단위는 G9(${unit === "pyeong" ? "평" : "㎡"})를 따랐습니다.`,
    });
  }
  issues.push(...headerIssues);

  const layout = buildLayout(version, unit);
  const asOfDate = asOf ? new Date(`${asOf}T00:00:00Z`) : now;
  const aoa = sheetToAoA(ws);
  const core = parseRentRollData(aoa, {
    asOf: asOfDate,
    layout,
    preWarnings: issues.filter((i) => i.level === "warning").map((i) => i.message),
  });

  // ── V12 사전 판정 (연면적 J4 는 v1.4+ 에만 존재)
  const allIssues: RentRollIssue[] = [...issues, ...core.issues];
  const warnings = [...core.warnings];
  if (version === "1.4" || version === "1.5") {
    const v12 = checkAreaUnit(core.parsedRows, meta.gfa_sqm);
    if (v12) {
      allIssues.push(v12);
      if (v12.level === "warning") warnings.push(v12.message);
    }
  }

  return { ...core, warnings, version, meta, issues: allIssues };
}
