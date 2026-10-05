/**
 * 렌트롤 시트 파서 (CREDEAL 렌트롤 표준양식 v1.3 + 레거시 양식 호환)
 *
 * rent-roll-importer.tsx 에서 분리한 순수 함수 모듈 — 브라우저/노드 어디서나 단위 테스트 가능.
 *
 * 면적 3종 (area-calculator.ts "4 Area Denominators" 와 동일 정의)
 *  - 임대면적(㎡)  → area_sqm              : 임대차계약서상 계약면적 (전용 + 공용 분담분). 임대료 단가·공실률 분모
 *  - 전용면적(㎡)  → exclusive_area_sqm    : 임차인이 독점 사용하는 면적. 전용평당 실질비용(NOC) 분모
 *  - 전용률(%)     → efficiency_ratio_pct  : 전용면적 ÷ 임대면적 × 100  (types/im.ts calculateEfficiencyRatio 와 동일 산식)
 */
import { pyeongToSqm } from "@/lib/utils/area-conversion";
import { calculateEfficiencyRatio } from "@/types/im";

export type RentRollLeaseState = "임대중" | "공실" | "자가사용";
/** lease_ledger CHECK 제약과 동일한 허용값 */
export type RentRollLegalBasis = "상가" | "주택" | "미확인";
export type RentRollRenewal = "있음" | "없음" | "모름";
export type RentRollOpposingPower = "사업자등록" | "주민등록" | "미확인";

export interface ParsedRentRollRow {
  floor: string;
  tenant_type?: string;
  tenant_name?: string;
  deposit_manwon?: number;
  rent_manwon?: number;
  mgmt_fee_manwon?: number;
  is_vacant?: boolean;
  /** 임대면적(㎡) */
  area_sqm?: number;
  /** 전용면적(㎡) */
  exclusive_area_sqm?: number;
  /**
   * true 이면 area_sqm 은 사용자가 '임대면적'으로 적은 값이 아니라,
   * 레거시 양식의 단일 '전용면적' 열 값을 면적 연산용(GFA·공실률 분모)으로 복사해 둔 대용값이다.
   * PPTX 표는 이 경우 임대면적 칸을 비우고 전용면적만 표기한다.
   */
  area_sqm_is_proxy?: boolean;
  /** 전용률(%) = 전용면적 / 임대면적 × 100 (두 면적이 모두 있을 때만) */
  efficiency_ratio_pct?: number;
  /** 계약그룹 — 같은 이름이면 하나의 통합계약(금액은 대표 행에만 기입) */
  contract_group?: string;
  legal_basis?: RentRollLegalBasis;
  /** 최초 계약일 YYYY-MM-DD (상가 갱신요구권 10년 기산점) */
  first_contract_date?: string;
  renewal_exercised?: RentRollRenewal;
  opposing_power?: RentRollOpposingPower;
  lease_start?: string;
  lease_end?: string;
  lease_state?: RentRollLeaseState;
  note?: string;
}

export interface RentRollAreaSummary {
  /** 임대면적 합계(㎡) — 임대면적이 있는 모든 호실 */
  leaseSqm: number;
  /** 전용면적 합계(㎡) — 전용면적이 있는 모든 호실 */
  exclusiveSqm: number;
  /** 가중 전용률(%) — 임대·전용면적이 둘 다 있는 호실만 (Σ전용 ÷ Σ임대). 산출 불가 시 undefined */
  weightedEfficiencyPct?: number;
  /** 임대·전용면적이 모두 있는 호실 수 */
  rowsWithBothAreas: number;
  /** 전용면적이 비어 있는 호실 수 */
  rowsMissingExclusive: number;
}

export interface ParseResult {
  monthlyRent: number;
  totalDeposit: number;
  mgmtFeeTotal: number;
  vacancyPct: number;
  rowCount: number;
  vacantCount: number;
  detectedHeaderRow: number;
  unitDetected: "manwon" | "won";
  parsedRows: ParsedRentRollRow[];
  areaSummary: RentRollAreaSummary;
  /** 사용자에게 보여줄 데이터 품질 경고 (최대 12건 + 요약) */
  warnings: string[];
}

type AmountUnit = "manwon" | "won" | "cheonwon" | "unknown";
type AreaUnit = "sqm" | "pyeong" | "unknown";

const MAX_WARNINGS = 12;
const SQM_PER_PYEONG_ROUND = 100; // 소수 2자리

/**
 * 금액이 원 단위인지 만원 단위인지 자동 감지 (헤더에 단위가 없을 때만 사용되는 레거시 휴리스틱)
 * 값이 100,000 이상이면 원 단위로 판단
 */
function detectAndConvertToManwon(value: number): { manwon: number; unit: "won" | "manwon" } {
  if (value >= 100000) {
    return { manwon: Math.round(value / 10000), unit: "won" };
  }
  return { manwon: value, unit: "manwon" };
}

function normalizeHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s()（）]/g, "");
}

/** 키워드 우선순위(keyword-major)로 컬럼 탐색. exclude/skip 로 파생 컬럼(평·률·자동)을 걸러낸다. */
function findCol(
  header: string[],
  keywords: string[],
  opts: { exclude?: string[]; skip?: Set<number>; require?: string } = {},
): number {
  const { exclude = [], skip, require } = opts;
  for (const k of keywords) {
    const idx = header.findIndex(
      (h, i) =>
        !!h &&
        !(skip && skip.has(i)) &&
        h.includes(k) &&
        (!require || h.includes(require)) &&
        !exclude.some((e) => h.includes(e)),
    );
    if (idx >= 0) return idx;
  }
  return -1;
}

function amountUnitOfHeader(h: string | undefined): AmountUnit {
  if (!h) return "unknown";
  if (h.includes("천원")) return "cheonwon";
  if (h.includes("만원")) return "manwon";
  if (h.includes("원")) return "won";
  return "unknown";
}

function areaUnitOfHeader(h: string | undefined): AreaUnit {
  if (!h) return "unknown";
  if (h.includes("평")) return "pyeong";
  if (h.includes("㎡") || h.includes("m2") || h.includes("m²") || h.includes("sqm")) return "sqm";
  return "unknown";
}

function round2(n: number): number {
  return Math.round(n * SQM_PER_PYEONG_ROUND) / SQM_PER_PYEONG_ROUND;
}

/**
 * 면적 셀 → ㎡. 셀 문자열의 단위 표기('평'/'㎡') > 헤더 단위 > (단위 미표기) 레거시 휴리스틱 순.
 * 0 이하/숫자 아님은 undefined (공실 호실의 0 면적이 단가 분모를 오염시키지 않도록).
 */
function parseAreaCell(raw: unknown, headerUnit: AreaUnit): number | undefined {
  if (raw == null || raw === "") return undefined;
  const original = String(raw);
  const n = parseFloat(original.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;

  let unit: AreaUnit = headerUnit;
  if (original.includes("평")) unit = "pyeong";
  else if (/㎡|m2|m²/i.test(original)) unit = "sqm";

  if (unit === "pyeong") return round2(pyeongToSqm(n));
  if (unit === "sqm") return n;
  // 단위 미표기: 레거시 휴리스틱 — 소수점이 있고 50 미만이면 평으로 간주
  if (n < 50 && original.replace(/[^0-9.]/g, "").includes(".")) return round2(pyeongToSqm(n));
  return n;
}

/** 전용률 셀 → % (0~1 사이 소수이고 % 기호가 없으면 비율로 보고 ×100) */
function parseRatioCell(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const original = String(raw);
  const n = parseFloat(original.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return !original.includes("%") && n <= 1 ? n * 100 : n;
}

const SUMMARY_LABEL = /^(합계|소계|총계|총합계|계|total|subtotal|sum)(자동)?$/i;
const EXAMPLE_ROW_MARKER = /예시\s*행/;

/** 허용값 밖의 문구는 추측하지 않고 undefined — lease_ledger CHECK 제약을 깨지 않기 위함 */
function normalizeLegalBasis(raw: string): RentRollLegalBasis | undefined {
  const s = raw.replace(/\s/g, "");
  if (!s) return undefined;
  if (s.includes("미확인")) return "미확인";
  if (s.includes("상가") || s.includes("상임")) return "상가";
  if (s.includes("주택") || s.includes("주임") || s.includes("주거")) return "주택";
  return undefined;
}
function normalizeRenewal(raw: string): RentRollRenewal | undefined {
  const s = raw.replace(/\s/g, "");
  if (!s) return undefined;
  if (s.includes("모름") || s.includes("미확인")) return "모름";
  if (s.includes("없음") || s === "무" || s === "n" || s === "N") return "없음";
  if (s.includes("있음") || s.includes("행사") || s === "유" || s === "y" || s === "Y") return "있음";
  return undefined;
}
function normalizeOpposingPower(raw: string): RentRollOpposingPower | undefined {
  const s = raw.replace(/\s/g, "");
  if (!s) return undefined;
  if (s.includes("미확인")) return "미확인";
  if (s.includes("사업자")) return "사업자등록";
  if (s.includes("주민") || s.includes("전입")) return "주민등록";
  return undefined;
}

/**
 * CSV/Excel 렌트롤 파서 v3
 * - 멀티 헤더(실무 양식)에서 실제 컬럼 헤더 행 자동 탐지 (최대 30행, 키워드 최다 일치 행)
 * - 금액 단위(원/천원/만원): 헤더 표기 우선, 없으면 값 크기로 자동 감지
 * - 임대면적 / 전용면적 / 전용률 컬럼 분리 인식 (+ 평 단위 컬럼, 레거시 단일 '면적' 컬럼 호환)
 * - 임대상태(임대중/공실/자가사용) 컬럼 우선, 없으면 업종·임차인 공란으로 공실 추정
 * - 합계/소계 행, '예시 행' 표식 행, 자동계산 열만 채워진 빈 행은 건너뜀
 */
export function parseRentRollData(data: any[][]): ParseResult {
  const lines = data
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(
      ({ row }) =>
        row && row.length > 0 && row.some((cell) => String(cell ?? "").trim() !== ""),
    );

  if (lines.length < 2) throw new Error("데이터가 부족합니다 (최소 2행 필요)");

  // ── 헤더 행 자동 탐지: 앞 30행 중 키워드가 가장 많이 일치하는 행 (동률이면 가장 위)
  const HEADER_KEYWORDS = ["층", "호실", "면적", "보증금", "월세", "임대료", "rent", "deposit"];
  let headerLineIdx = 0;
  let bestMatch = 0;
  const maxScan = Math.min(30, lines.length - 1);
  for (let i = 0; i < maxScan; i++) {
    const rowText = lines[i].row.map((c) => String(c ?? "").toLowerCase()).join(" ");
    const matchCount = HEADER_KEYWORDS.filter((k) => rowText.includes(k)).length;
    if (matchCount >= 2 && matchCount > bestMatch) {
      bestMatch = matchCount;
      headerLineIdx = i;
    }
  }

  const header = lines[headerLineIdx].row.map(normalizeHeader);

  // ── 컬럼 인덱스 자동 매칭 (파생·자동 컬럼 제외)
  const AMOUNT_EXCLUDE = ["환산", "평당", "단가", "총수입", "noc"];
  const rentIdx = findCol(header, ["월임대료", "월세", "임대료", "rent", "월차임"], { exclude: AMOUNT_EXCLUDE });
  const depositIdx = findCol(header, ["보증금", "임대보증금", "deposit"], { exclude: AMOUNT_EXCLUDE });
  const mgmtIdx = findCol(header, ["관리비", "공용관리비", "mgmt", "maintenance"], { exclude: AMOUNT_EXCLUDE });
  const vacantIdx = findCol(header, ["공실", "vacant", "empty"]);
  const stateIdx = findCol(header, ["임대상태", "임대구분", "점유", "상태"], { exclude: ["계약상태", "자동"] });
  const bizTypeIdx = findCol(header, ["업종", "용도", "종류", "구분"], { exclude: ["임대구분"] });
  const floorIdx = findCol(header, ["층", "층수", "floor", "호", "위치"], { exclude: ["그룹"] });
  const tenantNameIdx = findCol(header, ["임차인", "입주사", "tenant", "상호"]);
  const leaseStartIdx = findCol(header, ["계약시작", "시작일", "개시일", "start"]);
  const leaseEndIdx = findCol(header, ["계약종료", "종료일", "만료일", "end", "만기"]);
  const noteIdx = findCol(header, ["비고", "note", "remark", "특이"]);
  // 원장(lease_ledger)에만 있고 렌트롤 표에는 그리지 않는 항목 — 값이 있으면 그대로 앱으로 전달
  const groupIdx = findCol(header, ["계약그룹", "통합계약", "그룹", "group"]);
  const legalIdx = findCol(header, ["적용법령", "법령", "legalbasis"], { exclude: ["상임법전면"] });
  const firstContractIdx = findCol(header, ["최초계약", "firstcontract"]);
  const renewalIdx = findCol(header, ["갱신요구", "renewal"], { exclude: ["잔여", "자동"] });
  const opposingIdx = findCol(header, ["대항력", "opposing"]);

  // ── 면적 컬럼 3종: ㎡ 컬럼 우선, 없으면 평 컬럼(→㎡ 환산), 마지막으로 레거시 단일 '면적' 컬럼
  const DERIVED_EXCLUDE = ["률", "율", "%", "당", "단가"];
  const leaseSqmIdx = findCol(header, ["임대면적", "계약면적", "공급면적"], { exclude: [...DERIVED_EXCLUDE, "평"] });
  const excSqmIdx = findCol(header, ["전용면적", "전유면적"], { exclude: [...DERIVED_EXCLUDE, "평"] });
  const leasePyIdx = findCol(header, ["임대면적", "계약면적", "공급면적"], { exclude: DERIVED_EXCLUDE, require: "평" });
  const excPyIdx = findCol(header, ["전용면적", "전유면적"], { exclude: DERIVED_EXCLUDE, require: "평" });
  const ratioIdx = findCol(header, ["전용률", "전용율", "efficiency"]);
  const claimed = new Set<number>([leaseSqmIdx, excSqmIdx, leasePyIdx, excPyIdx, ratioIdx].filter((i) => i >= 0));
  const genericAreaIdx = findCol(header, ["면적", "area", "㎡"], { exclude: [...DERIVED_EXCLUDE, "적용", "상임법"], skip: claimed });

  const leaseAreaIdx = leaseSqmIdx >= 0 ? leaseSqmIdx : leasePyIdx;
  const excAreaIdx = excSqmIdx >= 0 ? excSqmIdx : excPyIdx;
  // 레거시: 임대면적 컬럼이 전혀 없고 '면적' 한 칸뿐이면 그 값을 임대면적(area_sqm)으로 취급 (기존 동작 유지)
  const legacyAreaOnlyIdx = leaseAreaIdx < 0 ? genericAreaIdx : -1;
  const legacyExclusiveAsLease = leaseAreaIdx < 0 && legacyAreaOnlyIdx < 0 && excAreaIdx >= 0;

  const rentUnit = amountUnitOfHeader(header[rentIdx]);
  const depositUnit = amountUnitOfHeader(header[depositIdx]);
  const mgmtUnit = amountUnitOfHeader(header[mgmtIdx]);

  const toManwon = (value: number, unit: AmountUnit): { manwon: number; won: boolean } => {
    if (unit === "won") return { manwon: Math.round(value / 10000), won: true };
    if (unit === "cheonwon") return { manwon: Math.round(value / 10), won: false };
    if (unit === "manwon") return { manwon: value, won: false };
    const d = detectAndConvertToManwon(value);
    return { manwon: d.manwon, won: d.unit === "won" };
  };

  // 데이터 존재 판정은 '입력 컬럼'만 본다 (자동계산 열의 "만료일 없음" 같은 문구가 빈 행을 살리지 않도록)
  const coreIdxs = [
    floorIdx, bizTypeIdx, tenantNameIdx, depositIdx, rentIdx, mgmtIdx, stateIdx, vacantIdx,
    leaseAreaIdx, excAreaIdx, genericAreaIdx, leaseStartIdx, leaseEndIdx,
  ].filter((i, pos, arr) => i >= 0 && arr.indexOf(i) === pos);

  let totalRent = 0;
  let totalDeposit = 0;
  let totalMgmt = 0;
  let vacantCount = 0;
  let ownerUseCount = 0;
  let rowCount = 0;
  let unitDetected: "won" | "manwon" = "manwon";
  const warnings: string[] = [];
  let warningOverflow = 0;
  const warn = (msg: string) => {
    if (warnings.length < MAX_WARNINGS) warnings.push(msg);
    else warningOverflow++;
  };
  if (legacyExclusiveAsLease) {
    warn("임대면적 열이 없어 '전용면적' 열 값을 전용면적으로 보존했습니다 (면적 합계 연산에는 같은 값을 임대면적 대용으로 사용하며 전용률은 계산하지 않음). 최신 양식(v1.3)을 쓰면 임대·전용면적을 분리해 입력할 수 있습니다.");
  }

  const parsedRows: ParsedRentRollRow[] = [];

  for (let li = headerLineIdx + 1; li < lines.length; li++) {
    const cols = lines[li].row;
    if (!cols || cols.length < 2) continue;

    const cell = (idx: number): unknown => (idx >= 0 && idx < cols.length ? cols[idx] : undefined);
    const text = (idx: number): string => String(cell(idx) ?? "").trim();

    // 행에 입력값이 있는지 (입력 컬럼 기준; 컬럼 매칭이 전혀 안 되면 레거시처럼 전체 셀 기준)
    const hasValue = (v: unknown) => {
      const s = String(v ?? "").trim();
      return s !== "" && s !== "0";
    };
    const rowHasData = coreIdxs.length > 0 ? coreIdxs.some((i) => hasValue(cell(i))) : cols.some(hasValue);
    if (!rowHasData) continue;

    // 합계/소계 행 · 예시 행은 데이터가 아님
    const labelCandidates = [cols[0], cols[1], cell(floorIdx)].map((v) => String(v ?? "").replace(/[\s()（）]/g, ""));
    if (labelCandidates.some((l) => l && SUMMARY_LABEL.test(l))) continue;
    if (EXAMPLE_ROW_MARKER.test(text(noteIdx)) || (noteIdx < 0 && cols.some((c) => EXAMPLE_ROW_MARKER.test(String(c ?? ""))))) continue;

    rowCount++;

    const parseNum = (idx: number): number => {
      if (idx < 0 || idx >= cols.length || cols[idx] == null) return 0;
      const cleaned = String(cols[idx]).replace(/[^0-9.\-]/g, "");
      return parseFloat(cleaned) || 0;
    };

    const rawRent = parseNum(rentIdx >= 0 ? rentIdx : 4);
    const rawDeposit = parseNum(depositIdx >= 0 ? depositIdx : 3);
    const rawMgmt = parseNum(mgmtIdx >= 0 ? mgmtIdx : -1);

    const rentC = toManwon(rawRent, rentUnit);
    const depC = toManwon(rawDeposit, depositUnit);
    const mgmtC = toManwon(rawMgmt, mgmtUnit);
    if (rentC.won || depC.won || mgmtC.won) unitDetected = "won";

    totalRent += rentC.manwon;
    totalDeposit += depC.manwon;
    totalMgmt += mgmtC.manwon;

    // ── 임대상태 / 공실 판단
    let isVacant = false;
    let leaseState: RentRollLeaseState | undefined;
    const stateVal = stateIdx >= 0 ? text(stateIdx) : "";
    if (stateVal) {
      if (stateVal.includes("공실")) {
        isVacant = true;
        leaseState = "공실";
      } else if (/자가|오너|직영|사옥|owner/i.test(stateVal)) {
        leaseState = "자가사용";
      } else if (stateVal.includes("임대")) {
        leaseState = "임대중";
      }
    } else if (vacantIdx >= 0 && cols[vacantIdx] != null) {
      const val = String(cols[vacantIdx]).toLowerCase().trim();
      isVacant = val === "y" || val === "1" || val === "공실" || val === "true" || val === "yes" || val === "●";
    } else if (bizTypeIdx >= 0) {
      const bizVal = text(bizTypeIdx);
      if (bizVal === "" || bizVal === "-" || bizVal === "공실") isVacant = true;
    } else if (tenantNameIdx >= 0) {
      const tVal = text(tenantNameIdx);
      if (tVal === "" || tVal === "-" || tVal === "공실") isVacant = true;
    }
    if (isVacant) vacantCount++;
    if (leaseState === "자가사용") ownerUseCount++;
    if (isVacant && !leaseState) leaseState = "공실";

    // ── 층/업종/임차인/비고
    const floorRaw = cell(floorIdx >= 0 ? floorIdx : 0);
    const floorVal = floorRaw != null && String(floorRaw).trim() !== "" ? String(floorRaw).trim() : `${rowCount}F`;
    const bizVal = bizTypeIdx >= 0 && cols[bizTypeIdx] != null ? String(cols[bizTypeIdx]).trim() : undefined;
    const tName = tenantNameIdx >= 0 && cols[tenantNameIdx] != null ? String(cols[tenantNameIdx]).trim() : undefined;
    let noteVal = noteIdx >= 0 ? text(noteIdx) : "";
    // 자가사용은 downstream(im-lite handler isOwnerUse)이 note/업종 키워드로 만실 처리하므로 키워드를 보장한다
    if (leaseState === "자가사용" && !/자가|사옥|자사|본사|직영|owner/i.test(`${noteVal} ${bizVal ?? ""}`)) {
      noteVal = noteVal ? `자가사용 · ${noteVal}` : "자가사용";
    }

    // ── 면적 3종
    let areaVal: number | undefined;
    let exclusiveVal: number | undefined;
    if (leaseAreaIdx >= 0) {
      areaVal = parseAreaCell(cell(leaseAreaIdx), areaUnitOfHeader(header[leaseAreaIdx]));
    } else if (legacyAreaOnlyIdx >= 0) {
      areaVal = parseAreaCell(cell(legacyAreaOnlyIdx), areaUnitOfHeader(header[legacyAreaOnlyIdx]));
    }
    if (excAreaIdx >= 0) {
      exclusiveVal = parseAreaCell(cell(excAreaIdx), areaUnitOfHeader(header[excAreaIdx]));
    }
    let areaIsProxy = false;
    if (legacyExclusiveAsLease && exclusiveVal != null) {
      // 레거시 단일 '전용면적' 열: 사용자가 적은 것은 '전용면적'이므로 exclusive_area_sqm 으로 보존한다.
      // area_sqm 에는 기존 동작(GFA·공실률 등 면적 연산)을 깨지 않도록 같은 값을 '대용'으로 복사하되 플래그로 표시한다.
      // → PPTX 표는 임대면적 칸을 비우고 전용면적만 표기, 전용률은 계산하지 않아 가짜 100% 가 생기지 않는다.
      areaVal = exclusiveVal;
      areaIsProxy = true;
    }

    const ratioInput = ratioIdx >= 0 ? parseRatioCell(cell(ratioIdx)) : undefined;
    // 임대면적 + 전용률만 있고 전용면적이 없으면 전용면적 역산
    if (areaVal != null && exclusiveVal == null && ratioInput != null && ratioInput <= 100) {
      exclusiveVal = round2((areaVal * ratioInput) / 100);
    }

    let efficiency: number | undefined;
    if (!areaIsProxy && areaVal != null && exclusiveVal != null) {
      efficiency = calculateEfficiencyRatio(exclusiveVal, areaVal) ?? undefined;
      if (exclusiveVal > areaVal) {
        warn(`${floorVal}: 전용면적(${exclusiveVal}㎡)이 임대면적(${areaVal}㎡)보다 큽니다 — 값을 확인해 주세요.`);
      } else if (ratioInput != null && efficiency != null && Math.abs(ratioInput - efficiency) > 1) {
        warn(`${floorVal}: 입력된 전용률(${ratioInput.toFixed(1)}%)이 면적으로 계산한 값(${efficiency.toFixed(1)}%)과 다릅니다 — 면적 기준 값을 사용합니다.`);
      }
    }

    // ── 날짜
    const parseDate = (val: any) => {
      if (!val) return undefined;
      let s = String(val).trim();
      if (!isNaN(Number(s)) && Number(s) > 30000) {
        const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
        if (!isNaN(d.getTime())) {
          return d.toISOString().split("T")[0];
        }
      }
      s = s.replace(/\./g, "-").replace(/\//g, "-");
      const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }
      return s;
    };

    const lStart = leaseStartIdx >= 0 ? parseDate(cols[leaseStartIdx]) : undefined;
    const lEnd = leaseEndIdx >= 0 ? parseDate(cols[leaseEndIdx]) : undefined;
    const firstDateRaw = firstContractIdx >= 0 ? parseDate(cols[firstContractIdx]) : undefined;
    // 최초계약일은 DATE 컬럼으로 영속화되므로 ISO 형식만 허용 (그 외는 버림)
    const firstDate = firstDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(firstDateRaw) ? firstDateRaw : undefined;
    const groupVal = groupIdx >= 0 ? text(groupIdx) : "";

    parsedRows.push({
      floor: floorVal,
      tenant_type: bizVal || undefined,
      tenant_name: tName || undefined,
      deposit_manwon: depC.manwon || undefined,
      rent_manwon: rentC.manwon || undefined,
      mgmt_fee_manwon: mgmtC.manwon || undefined,
      is_vacant: isVacant || undefined,
      area_sqm: areaVal,
      exclusive_area_sqm: exclusiveVal,
      area_sqm_is_proxy: areaIsProxy || undefined,
      efficiency_ratio_pct: efficiency,
      contract_group: groupVal || undefined,
      legal_basis: legalIdx >= 0 ? normalizeLegalBasis(text(legalIdx)) : undefined,
      first_contract_date: firstDate,
      renewal_exercised: renewalIdx >= 0 ? normalizeRenewal(text(renewalIdx)) : undefined,
      opposing_power: opposingIdx >= 0 ? normalizeOpposingPower(text(opposingIdx)) : undefined,
      lease_start: lStart,
      lease_end: lEnd,
      lease_state: leaseState,
      note: noteVal || undefined,
    });
  }

  if (rowCount === 0) {
    throw new Error(
      "읽을 수 있는 호실 데이터가 없습니다. 헤더 아래에 실제 호실을 입력했는지 확인해 주세요 (예시 행·합계 행은 자동 제외됩니다).",
    );
  }
  if (warningOverflow > 0) warnings.push(`그 외 ${warningOverflow}건의 경고가 더 있습니다.`);

  // 자가사용은 공실률 분모에서 제외 (im-lite handler 의 isOwnerUse 처리와 동일 기준)
  const leasableRows = rowCount - ownerUseCount;
  const vacancyPct = leasableRows > 0 ? Math.round((vacantCount / leasableRows) * 100) : 0;

  return {
    monthlyRent: Math.round(totalRent),
    totalDeposit: Math.round(totalDeposit),
    mgmtFeeTotal: Math.round(totalMgmt),
    vacancyPct,
    rowCount,
    vacantCount,
    detectedHeaderRow: lines[headerLineIdx].rowIndex + 1,
    unitDetected,
    parsedRows,
    areaSummary: summarizeRentRollAreas(parsedRows),
    warnings,
  };
}

/**
 * 호실 배열 → 면적 요약. 파서와 프리뷰 표(사용자가 면적을 고칠 때)가 같은 산식을 쓰도록 공유한다.
 * 가중 전용률은 임대·전용면적이 모두 있는 호실만 합산한다 (호실별 전용률의 단순 평균이 아님).
 */
export function summarizeRentRollAreas(
  rows: Array<Pick<ParsedRentRollRow, "area_sqm" | "exclusive_area_sqm" | "area_sqm_is_proxy">>,
): RentRollAreaSummary {
  const pos = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
  let leaseSqm = 0;
  let exclusiveSqm = 0;
  let pairedLease = 0;
  let pairedExclusive = 0;
  let rowsWithBothAreas = 0;
  let rowsMissingExclusive = 0;
  for (const r of rows) {
    // 레거시 단일 '전용면적' 열에서 복사된 대용 area_sqm 은 '임대면적'이 아니므로 합계·전용률에 쓰지 않는다
    const lease = r.area_sqm_is_proxy ? undefined : r.area_sqm;
    if (pos(lease)) leaseSqm += lease;
    if (pos(r.exclusive_area_sqm)) exclusiveSqm += r.exclusive_area_sqm;
    if (pos(lease) && pos(r.exclusive_area_sqm)) {
      rowsWithBothAreas++;
      pairedLease += lease;
      pairedExclusive += r.exclusive_area_sqm;
    }
    if (!pos(r.exclusive_area_sqm)) rowsMissingExclusive++;
  }
  return {
    leaseSqm: round2(leaseSqm),
    exclusiveSqm: round2(exclusiveSqm),
    weightedEfficiencyPct: pairedLease > 0 ? Math.round((pairedExclusive / pairedLease) * 1000) / 10 : undefined,
    rowsWithBothAreas,
    rowsMissingExclusive,
  };
}
