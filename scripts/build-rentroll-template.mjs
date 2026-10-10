/**
 * [레거시] v1.3 생성기 — v1.5 양식은 수기 관리다 (public/CREDEAL_rentroll_template_v1.5.xlsx, 이 스크립트로 재생성하지 않는다)
 *
 * CREDEAL 렌트롤 표준양식 v1.3 생성기
 *
 *   node scripts/build-rentroll-template.mjs
 *   → public/CREDEAL_rentroll_template_v1.3.xlsx
 *
 * v1.2 → v1.3 변경점
 *  - 신규 입력열 「전용면적(㎡)」 (임대면적 옆) · 신규 자동열 「전용면적(평)」「전용률(%)」「전용평당 월비용」
 *  - 합계 행을 머리글 위(10행)로 이동: 입력 가능 행 25 → 100 (13~112), 합계 SUM 범위 누락 해소
 *  - 평가 기준일 기본값 =TODAY() (v1.2 는 작성일이 하드코딩되어 만료/임박 판정이 낡음)
 *  - 빈 행의 자동열이 "만료일 없음"을 출력해 자동검증(만료 24건)을 오염시키던 문제 수정
 *  - 4번째 시트 「컬럼정의」 : R1/R2/R3 해상도별 컬럼·설명·앱 필드·공란 영향
 *
 * 컬럼 정의(COLS)가 행 11(해상도)·행 12(머리글)·헤더 노트·「컬럼정의」 시트의 단일 출처(SSOT)다.
 * 해상도 요건은 src/domain/building/mobile-im/lease-math.ts resolveLedger() 와 일치해야 한다.
 */
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "CREDEAL_rentroll_template_v1.3.xlsx");

const FIRST = 13; // 데이터 시작 행
const LAST = 112; // 데이터 끝 행 (100호실)
const HEADER_ROW = 12;
const GRADE_ROW = 11;
const TOTAL_ROW = 10;
const SQM_PER_PYEONG = 3.305785;

// ── 팔레트 (v1.2 계승)
const NAVY = "FF1F3864";
const INPUT_FILL = "FFFFFF00";
const AUTO_FILL = "FFE8E8E8";
const META_FILL = "FFD9E2F3";
const GRADE_FILL = { R1: "FFFFF2CC", R2: "FFDEEAF6", R3: "FFFCE4EC" };
const thin = { style: "thin", color: { argb: "FFBFBFBF" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * 컬럼 사양
 * grade: R1 발행 최소선 / R2 분석 가능 / R3 정밀 실사 / '' (등급 무관)
 * req: 필수 | 권장 | 조건부 | 선택 | 자동
 * app: 업로드(rent-roll-importer → floor_leases → lease_ledger) 반영 필드. '' = 엑셀 자동검증 전용
 * domain: LeaseRow(types/im.ts) 필드
 */
const COLS = [
  { c: "A", t: "호실/층", g: "R1", req: "필수", kind: "input", w: 10, fmt: "@", unit: "텍스트",
    d: "원본 표기 그대로 (예: B1, 1F, 101호). 한 층에 호실이 둘이면 행을 나눠 적습니다.",
    app: "floor", domain: "unitLabel", blank: "행 식별 불가 — 층 라벨이 'N F'로 대체됩니다.",
    note: "[R1·필수] 원본 표기 그대로. 한 층에 둘이면 행을 나눕니다." },
  { c: "B", t: "계약그룹", g: "R2", req: "조건부", kind: "input", w: 10, fmt: "@", unit: "텍스트",
    d: "통합계약 표시. 한 임차인이 한 계약서로 여러 호실·층을 쓸 때, 그 호실들에 같은 이름(A, B, 1…)을 적습니다. 보증금·월세·관리비는 대표 행 한 곳에만 적고 나머지 행은 비웁니다(면적·만료일 등은 행마다 적음). 호실별로 따로 계약했다면 비워 두세요.",
    app: "contract_group", domain: "contractGroup", blank: "통합계약 금액 중복 집계 위험(대표 행 외 금액을 비워 두면 영향 없음). 비우면 호실마다 별개 계약으로 취급됩니다.",
    note: "[R2·조건부] 통합계약(한 계약서로 여러 호실)일 때만 같은 이름. 금액은 대표 행에만." },
  { c: "C", t: "임대면적(㎡)", g: "R2", req: "권장", kind: "input", w: 12, fmt: "#,##0.00", unit: "㎡ (소수 2자리)",
    d: "임대차계약서상 계약면적 = 전용면적 + 공용면적 분담분. 임대료 평당 단가·면적 기준 공실률의 분모입니다. 공실·자가사용 호실도 적습니다.",
    app: "area_sqm", domain: "leaseAreaSqm", blank: "R2 미달 — 평당 임대단가·면적 공실률·임대료 정상화 산출 불가.",
    note: "[R2·권장] 계약면적(전용+공용분담). ㎡로 입력. 평 환산은 Q열이 자동 계산." },
  { c: "D", t: "전용면적(㎡)", g: "R2*", req: "권장", kind: "input", w: 12, fmt: "#,##0.00", unit: "㎡ (소수 2자리)",
    d: "임차인이 독점해 사용하는 면적(건축물대장 전유부 기준). 임대면적보다 클 수 없습니다. 전용률과 전용평당 월비용의 분모입니다. (* 등급 판정에는 영향 없는 보강 항목)",
    app: "exclusive_area_sqm", domain: "exclusiveAreaSqm", blank: "전용률·전용평당 월비용 보류. IM 렌트롤 표에서 전용면적 열이 빠지고 임대면적만 표기됩니다(다른 면적 값으로 대신 채우지 않음).",
    note: "[R2*·권장] 임차인 독점 사용면적. 임대면적 이하. 전용률(S열)이 자동 계산됩니다." },
  { c: "E", t: "업종/상호 (원문)", g: "R1", req: "필수", kind: "input", w: 20, fmt: "@", unit: "텍스트",
    d: "계약서·렌트롤에 적힌 문구를 그대로 옮깁니다. 업종을 추측해 바꾸지 마세요. 공실이면 '공실'.",
    app: "tenant_type · tenant_name", domain: "tenantBusiness", blank: "R1 미달 — 렌트롤 표를 그릴 수 없고, 임대상태 미기재 시 공실로 추정됩니다.",
    note: "[R1·필수] 원문 그대로. 추측 금지. 공실이면 '공실'." },
  { c: "F", t: "적용법령", g: "R2", req: "권장", kind: "input", w: 10, fmt: "@", unit: "드롭다운 상가/주택/미확인",
    d: "상가 / 주택 / 미확인. 주거로 쓰는 오피스텔은 '주택'. 갱신요구권 산식이 완전히 달라집니다.",
    app: "legal_basis", domain: "legalBasis", blank: "R2 미달 — 환산보증금·상임법 판정·갱신권 잔여 '확인 필요'.",
    note: "[R2·권장] 상가/주택/미확인. 주거용 오피스텔=주택." },
  { c: "G", t: "보증금(원)", g: "R1", req: "필수", kind: "input", w: 15, fmt: "#,##0", unit: "원 (VAT 별도)",
    d: "원 단위 숫자만. '5,000만'처럼 적지 마세요 (5,000만원 → 50000000).",
    app: "deposit_manwon (÷10,000)", domain: "depositKrw", blank: "R1 미달 — 보증금 합계·환산보증금 산출 불가.",
    note: "[R1·필수] 원 단위 숫자만. 5,000만원 → 50000000" },
  { c: "H", t: "월세(원,VAT별도)", g: "R1", req: "필수", kind: "input", w: 16, fmt: "#,##0", unit: "원 (VAT 별도)",
    d: "월 임대료. VAT·관리비 제외. 원 단위 숫자만.",
    app: "rent_manwon (÷10,000)", domain: "monthlyRentKrw", blank: "R1 미달 — 임대수입·수익률(Gross Yield) 산출 불가.",
    note: "[R1·필수] 월 임대료(VAT·관리비 제외). 원 단위." },
  { c: "I", t: "관리비(원,VAT별도)", g: "R2", req: "권장", kind: "input", w: 15, fmt: "#,##0", unit: "원 (VAT 별도)",
    d: "월 관리비 청구액. 원 단위 숫자만.",
    app: "mgmt_fee_manwon (÷10,000)", domain: "mgmtFeeKrw", blank: "R2 미달 — 월합계·관리비 포함 비용·NOI 계열 지표 보류.",
    note: "[R2·권장] 월 관리비 청구액. 원 단위." },
  { c: "J", t: "최초 계약일", g: "R3", req: "조건부", kind: "input", w: 13, fmt: "yyyy-mm-dd", unit: "날짜 YYYY-MM-DD",
    d: "이 임차인이 처음 입주한 날 (현 계약 시작일과 다릅니다). 상가 갱신요구권 10년은 이 날짜로 기산합니다.",
    app: "first_contract_date", domain: "firstContractDate", blank: "R3 미달 — 상가 갱신권 잔여 '확인 필요', 명도 시점 산출 불가.",
    note: "[R3·상가] 처음 입주한 날. 갱신요구권 10년 기산일." },
  { c: "K", t: "현 계약 시작일", g: "R2", req: "권장", kind: "input", w: 13, fmt: "yyyy-mm-dd", unit: "날짜 YYYY-MM-DD",
    d: "현재 유효한 계약의 시작일.",
    app: "lease_start", domain: "currentStartDate", blank: "계약 기간 계산(경과 기간) 보류. 등급 판정에는 영향 없음.",
    note: "[R2·권장] 현재 계약의 시작일." },
  { c: "L", t: "현 계약 만료일", g: "R1", req: "필수", kind: "input", w: 13, fmt: "yyyy-mm-dd", unit: "날짜 YYYY-MM-DD",
    d: "현재 계약의 만료일. 명도 시점·만기 스케줄·WALE 산출의 기준입니다. 임대중 호실은 필수.",
    app: "lease_end", domain: "currentExpiryDate", blank: "R1 미달 — 만기 타임라인·WALE 산출 불가.",
    note: "[R1·필수(임대중)] 현재 계약 만료일. 만기·WALE 기준." },
  { c: "M", t: "갱신요구권 행사", g: "R3", req: "조건부", kind: "input", w: 14, fmt: "@", unit: "드롭다운 있음/없음/모름",
    d: "있음 / 없음 / 모름. 주택은 1회 한정이라 이 값 없이는 계산할 수 없습니다. 묵시적 갱신은 '없음'입니다.",
    app: "renewal_exercised", domain: "renewalExercised", blank: "R3 미달 — 주택 갱신권 판정 '확인 필요'.",
    note: "[R3·주택] 있음/없음/모름. 묵시적 갱신=없음." },
  { c: "N", t: "대항력 요건", g: "R3", req: "권장", kind: "input", w: 13, fmt: "@", unit: "드롭다운 사업자등록/주민등록/미확인",
    d: "사업자등록 / 주민등록 / 미확인. 근거 없이 '없음'으로 적으면 발행이 막힙니다.",
    app: "opposing_power", domain: "opposingPower", blank: "R3 미달 — 대항력 미확인으로 집계, 명도 계획 보류.",
    note: "[R3] 사업자등록/주민등록/미확인." },
  { c: "O", t: "임대상태", g: "R1", req: "필수", kind: "input", w: 11, fmt: "@", unit: "드롭다운 임대중/공실/자가사용",
    d: "임대중 / 공실 / 자가사용. 소유자가 직접 쓰는 층은 '자가사용' — 공실이 아니지만 임대수입도 없습니다.",
    app: "is_vacant · lease_state · note('자가사용')", domain: "leaseState", blank: "R1 미달 — 업종/상호가 비어 있으면 공실로 추정(자가사용 구분 불가).",
    note: "[R1·필수] 임대중/공실/자가사용. 자가사용≠공실." },
  { c: "P", t: "비고", g: "", req: "선택", kind: "input", w: 24, fmt: "@", unit: "텍스트",
    d: "특이사항(앵커테넌트, 렌트프리 등). '← 예시 행' 문구가 있는 행은 업로드에서 자동 제외됩니다.",
    app: "note", domain: "note", blank: "영향 없음.", note: "[선택] 특이사항." },
  { c: "Q", t: "임대면적(평)", g: "", req: "자동", kind: "auto", w: 11, fmt: "#,##0.0", unit: "평",
    d: "= 임대면적(㎡) ÷ 3.305785", app: "(계산)", domain: "sqmToPyeong()", blank: "", note: "[자동] 임대면적 ÷ 3.305785" },
  { c: "R", t: "전용면적(평)", g: "", req: "자동", kind: "auto", w: 11, fmt: "#,##0.0", unit: "평",
    d: "= 전용면적(㎡) ÷ 3.305785", app: "(계산)", domain: "sqmToPyeong()", blank: "", note: "[자동] 전용면적 ÷ 3.305785" },
  { c: "S", t: "전용률(%)", g: "", req: "자동", kind: "auto", w: 10, fmt: '0.0"%"', unit: "%",
    d: "= 전용면적 ÷ 임대면적 × 100. 100% 초과(빨강)는 입력 오류, 30% 미만(주황)은 면적 기재 오류 의심.",
    app: "efficiency_ratio_pct", domain: "calculateEfficiencyRatio()", blank: "", note: "[자동] 전용면적 ÷ 임대면적 × 100" },
  { c: "T", t: "환산보증금(자동)", g: "", req: "자동", kind: "auto", w: 15, fmt: "#,##0", unit: "원",
    d: "= 보증금 + 월세 × 100. 상가·임대중 행만 계산(주택에는 이 개념이 없음).",
    app: "(계산)", domain: "convertedDeposit()", blank: "", note: "[자동] 보증금 + 월세×100 (상가·임대중)" },
  { c: "U", t: "상임법 전면적용", g: "", req: "자동", kind: "auto", w: 18, fmt: "@", unit: "○/×",
    d: "환산보증금이 지역 기준(C7) 이하이면 ○. 초과하면 5% 인상상한·우선변제권이 적용되지 않습니다(갱신요구권은 적용).",
    app: "(계산)", domain: "isFullyCovered()", blank: "", note: "[자동] 환산보증금 ≤ 지역기준(C7)이면 ○" },
  { c: "V", t: "갱신권 잔여(자동)", g: "", req: "자동", kind: "auto", w: 15, fmt: "@", unit: "년/까지",
    d: "상가 = 10년 − 최초계약일 경과. 주택 = 갱신요구권 행사 이력에 따라 판정. 근거가 없으면 '확인 필요'.",
    app: "(계산)", domain: "vacatePoint()", blank: "", note: "[자동] 상가=10년−경과, 주택=행사이력 기준" },
  { c: "W", t: "계약 상태(자동)", g: "", req: "자동", kind: "auto", w: 15, fmt: "@", unit: "유효/임박/만료",
    d: "평가 기준일(C6)과 만료일 비교. 30일 이내면 '임박', 지났으면 '만료 +N일'.",
    app: "(계산)", domain: "contractStatus()", blank: "", note: "[자동] 평가기준일 vs 만료일. 30일 이내=임박" },
  { c: "X", t: "월 총수입(자동)", g: "", req: "자동", kind: "auto", w: 15, fmt: "#,##0", unit: "원",
    d: "= 월세 + 관리비 (임대중 행만).", app: "(계산)", domain: "monthlyGross()", blank: "", note: "[자동] 월세 + 관리비 (임대중)" },
  { c: "Y", t: "전용평당 월비용(자동)", g: "", req: "자동", kind: "auto", w: 17, fmt: "#,##0", unit: "원/전용평",
    d: "= (월세 + 관리비) ÷ 전용면적(평). 임차인이 실제로 쓰는 면적 기준 실질 비용(NOC).",
    app: "(계산)", domain: "calculateNocPerExclusivePyeong()", blank: "", note: "[자동] (월세+관리비) ÷ 전용면적(평)" },
];
const colOf = Object.fromEntries(COLS.map((x) => [x.t, x.c]));
const LAST_COL = COLS[COLS.length - 1].c;

const R = (col) => `'렌트롤'!$${col}$${FIRST}:$${col}$${LAST}`; // 시트 간 참조 범위

const serial = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
const today = new Date();
const todaySerial = serial(today.getFullYear(), today.getMonth() + 1, today.getDate());

const wb = new ExcelJS.Workbook();
wb.creator = "CREDEAL";
wb.created = new Date();
wb.calcProperties.fullCalcOnLoad = true;

const setCell = (ws, addr, value, style = {}) => {
  const cell = ws.getCell(addr);
  cell.value = value;
  if (style.font) cell.font = style.font;
  if (style.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
  if (style.align) cell.alignment = style.align;
  if (style.border) cell.border = style.border;
  if (style.fmt) cell.numFmt = style.fmt;
  return cell;
};
const F = (o = {}) => ({ name: "맑은 고딕", size: 10, ...o });

// ═════════════════════════════════════════════════════════════
// 시트 1: 기입요령
// ═════════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("기입요령", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 26 }, { width: 110 }];
  setCell(ws, "A1", "CREDEAL 렌트롤 표준 양식 v1.3 — 기입요령", { font: F({ size: 15, bold: true, color: { argb: NAVY } }) });
  ws.getRow(1).height = 24;

  let r = 3;
  const section = (title) => {
    ws.mergeCells(`A${r}:B${r}`);
    setCell(ws, `A${r}`, title, { font: F({ size: 11, bold: true, color: { argb: "FFFFFFFF" } }), fill: NAVY });
    r++;
  };
  const line = (a, b) => {
    setCell(ws, `A${r}`, a, { font: F({ bold: true }), border: BORDER, align: { vertical: "top", wrapText: true } });
    setCell(ws, `B${r}`, b, { font: F(), border: BORDER, align: { vertical: "top", wrapText: true } });
    const wrapped = String(b).split("\n").reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / 62)), 0);
    ws.getRow(r).height = Math.max(18, wrapped * 15);
    r++;
  };
  const gap = () => r++;

  setCell(ws, `A${r}`, "모바일 IM 업로드용 표준 양식입니다. 「렌트롤」 시트의 노란색 셀만 입력하세요. (1행 = 1호실, 최대 100호실)", { font: F() });
  r += 2;

  section("계약그룹이란? — 한 임차인이 한 계약서로 여러 호실·층을 쓰는 경우 (통합계약)");
  line("뜻", "하나의 임대차계약서로 한 임차인이 여러 호실(예: 1F+2F)을 쓸 때, 그 호실들을 한 묶음으로 표시하는 이름표입니다. 호실마다 따로 계약했다면 비워 두세요.");
  line("쓰는 법", "같은 계약에 속한 호실에는 같은 이름(A, B, 1 …)을 적습니다. 이름은 자유이며, 서로 다른 계약은 다른 이름으로 구분합니다.");
  line("금액은 대표 행에만", "보증금·월세·관리비는 묶음 중 한 행(대표 행)에만 적고 나머지 행은 비웁니다. 면적(임대·전용)·호실/층·업종/상호·임대상태·만료일은 행마다 적습니다.");
  line("예시 (설명용)", "1F │ 그룹 A │ 임대 100㎡ │ ○○카페 │ 보증금·월세 입력   ← 대표 행\n2F │ 그룹 A │ 임대  80㎡ │ ○○카페 │ 보증금·월세 비움   ← 같은 계약\n3F │ (비움) │ 임대  90㎡ │ △△법무법인 │ 보증금·월세 입력  ← 단독 계약");
  line("왜 필요한가", "금액을 층마다 쪼개 적으면 한 계약이 여러 건으로 집계되고 환산보증금(상가법 적용 판정)이 쪼개져 틀어집니다. 대표 행에만 적으면 합계·환산보증금이 계약 1건으로 계산됩니다.");
  line("IM에서의 표기", "IM 렌트롤 표에서 같은 그룹의 금액 빈 행은 보증금·월임대료·관리비·월합계가 「〃」(위와 동일 계약)로 표시되고, 합계에는 대표 행 금액만 더해집니다. 계약그룹은 업로드 후 원장(lease_ledger)에도 저장됩니다.");
  gap();

  section("색상 규칙");
  line("노란색", "입력 셀 — 여기만 채웁니다.");
  line("회색", "자동계산 — 수식이 들어 있으니 건드리지 마세요.");
  line("파랑/주황/분홍 (11행)", "해상도 표시: 주황=R1 발행 최소선 · 파랑=R2 분석 가능 · 분홍=R3 정밀 실사. 자세한 정의는 「컬럼정의」 시트.");
  gap();

  section("해상도(R1·R2·R3) — 채울수록 열리는 기능이 늘어납니다");
  line("R1 최소형", "호실·업종·보증금·월세·만료일·임대상태 → 렌트롤 표 · 만료 타임라인 · 총액 수익률");
  line("R2 필요형", "R1 + 임대면적·적용법령·관리비 → 평당 단가 · 층별 단가 · 환산보증금 · 상임법 판정");
  line("R3 표준형", "R2 + 최초 계약일·대항력 → 갱신요구권 · 명도 계획 · 임대료 정상화 시뮬");
  line("면적 보강 (등급 무관)", "전 호실 전용면적 입력(전용 ≤ 임대) → 전용률 · 전용평당 월비용(NOC)");
  gap();

  section("면적 3종 — 임대면적 · 전용면적 · 전용률");
  line("임대면적 (C열)", "임대차계약서에 적힌 계약면적(㎡). 전용면적 + 공용면적 분담분입니다. 임대료 평당 단가·공실률의 분모이며, 공실·자가사용 호실도 적습니다.");
  line("전용면적 (D열)", "임차인이 독점해 사용하는 면적(㎡). 건축물대장 전유부 면적과 대조하세요. 임대면적보다 클 수 없습니다.");
  line("전용률 (S열, 자동)", "전용면적 ÷ 임대면적 × 100. 직접 입력하지 마세요. 합계 행(10행)의 전용률은 평균이 아니라 Σ전용 ÷ Σ임대(두 면적이 모두 있는 호실만)입니다.");
  line("단위", "면적은 ㎡로만 입력합니다. 평 환산은 Q·R열이 자동 계산합니다. 평으로 적으면 면적이 3.3배 어긋납니다.");
  line("IM 표 표기", "IM 렌트롤 표에는 입력한 면적만 나옵니다. 임대·전용면적을 모두 적으면 두 열, 하나만 적으면 그 열 하나만 표시합니다. 한 면적을 다른 면적 값으로 대신 채우지 않고, 비워 둔 호실은 「-」로 표시합니다.");
  line("전용면적을 모를 때", "임대면적만 입력해도 업로드됩니다. 전용률·전용평당 월비용만 보류되고 IM 표에는 임대면적 열만 나옵니다 (「자동검증」에 미기재 호실 수가 표시됩니다).");
  gap();

  section("반드시 채워야 하는 항목 (R1)");
  line("호실/층", "원본 표기 그대로. 「9F(1)」처럼 한 층에 둘이면 행을 나눠 적습니다.");
  line("업종/상호 (원문)", "⚠ 계약서·렌트롤에 적힌 문구를 그대로 옮깁니다. 「사무실」이면 「사무실」입니다. 업종을 추측해 바꾸지 마세요.");
  line("임대상태", "임대중 / 공실 / 자가사용. 소유자가 직접 쓰는 층은 「자가사용」 — 공실이 아니지만 임대수입도 없습니다.");
  line("보증금·월세·관리비", "원 단위 숫자만. VAT 별도. 「5,000만」처럼 적지 마세요 (5,000만원 → 50000000).");
  line("현 계약 만료일", "명도 시점·만기 스케줄 산출의 기준입니다. 날짜 형식은 YYYY-MM-DD.");
  gap();

  section("비면 판정이 보류되는 항목 (R2·R3)");
  line("적용법령 (R2)", "상가 / 주택 / 미확인. 주거로 쓰는 오피스텔은 「주택」입니다. 이 값에 따라 갱신요구권 계산이 완전히 달라집니다.");
  line("최초 계약일 (R3)", "이 임차인이 처음 입주한 날. 현 계약 시작일과 다릅니다. ★ 상가 갱신요구권 10년은 이 날짜로 기산합니다. 비면 「확인 필요」로 출력됩니다.");
  line("갱신요구권 행사 (R3)", "있음 / 없음 / 모름. ★ 주택은 1회 한정이라 이 값 없이는 계산할 수 없습니다. 묵시적 갱신은 「없음」입니다 — 갱신요구권을 쓴 것이 아닙니다.");
  line("대항력 요건 (R3)", "사업자등록 / 주민등록 / 미확인. 근거 없이 「없음」으로 적으면 발행이 막힙니다.");
  gap();

  section("자주 나는 실수");
  line("업종 추측", "「사무실」을 「IT스타트업」으로 바꿔 적는 경우. 실제로 있었던 오류입니다.");
  line("면적 혼동", "전용면적을 임대면적 칸에 적거나 평 단위를 그대로 적는 경우. 전용률이 100%를 넘으면(빨간색) 두 칸이 바뀌었는지 확인하세요.");
  line("경과년수로 갱신권 역산", "주택은 최초계약일로 계산할 수 없습니다. 행사 이력이 있어야 합니다.");
  line("합계를 손으로 입력", "합계(10행)는 자동입니다. 손으로 적으면 각 행 합과 어긋납니다. 실제로 있었던 오류입니다.");
  line("자가사용을 공실로", "자가사용은 임대 전환 여력이지 공실 손실이 아닙니다. 구분해 적으세요.");
  line("예시 행을 지우지 않음", "13행의 예시 행은 비고에 「예시 행」 문구가 있어 업로드에서 자동 제외되지만, 보기 혼란을 막기 위해 지우고 쓰세요.");
  gap();

  section("업로드 (CREDEAL 바텀시트)");
  line("지원 포맷", ".xlsx, .xls, .csv — 시스템이 「렌트롤」 시트를 자동으로 찾습니다.");
  line("자동 처리", "제목행·주소행이 위에 있어도 건너뜁니다. 합계/소계 행·빈 행·예시 행은 제외합니다. 금액은 머리글의 단위(원/만원)를 읽고 만원으로 변환합니다.");
  line("면적 반영", "임대면적 → area_sqm, 전용면적 → exclusive_area_sqm, 전용률 → 두 면적으로 재계산합니다 (입력값과 1%p 넘게 다르면 경고).");
  line("원장 저장", "계약그룹·적용법령·최초 계약일·갱신요구권 행사·대항력 요건은 렌트롤 표에는 그리지 않지만 업로드 후 원장(lease_ledger)에 저장됩니다. 드롭다운 값 외의 문구는 저장되지 않습니다.");
  gap();
  setCell(ws, `A${r}`, "문의: support@credeal.co.kr", { font: F({ color: { argb: "FF7F7F7F" } }) });
}

// ═════════════════════════════════════════════════════════════
// 시트 2: 렌트롤
// ═════════════════════════════════════════════════════════════
const ws = wb.addWorksheet("렌트롤", {
  views: [{ state: "frozen", xSplit: 1, ySplit: HEADER_ROW, topLeftCell: `B${FIRST}`, showGridLines: false }],
  pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
});
ws.columns = COLS.map((x) => ({ width: x.w }));

ws.mergeCells("A1:H1");
setCell(ws, "A1", "CREDEAL 렌트롤 표준 양식 v1.3", { font: F({ size: 15, bold: true, color: { argb: NAVY } }) });
ws.getRow(1).height = 23;
ws.mergeCells("A2:O2");
setCell(ws, "A2", "노란색 셀만 입력 · 회색은 자동계산 · 1행=1호실 · 면적 ㎡ · 금액 원(VAT 별도) · 11행 R1/R2/R3 = 해상도(자세한 설명은 「컬럼정의」 시트)", { font: F({ size: 9, color: { argb: "FF595959" } }) });

const meta = [
  [3, "물건명", null, "⚠ 렌트롤 기준일이 비면 신선도 판정을 할 수 없습니다"],
  [4, "소재지", null, "※ 환산보증금: 서울 9억 · 과밀억제권역 6.9억 · 광역시 5.4억 · 그 밖 3.7억"],
  [5, "렌트롤 기준일", null, null],
  [6, "평가 기준일", { formula: "TODAY()", result: todaySerial }, "기본값 =TODAY(). 과거 시점 기준으로 평가하려면 날짜를 직접 입력하세요."],
  [7, "환산보증금 지역기준(원)", 900000000, "지역에 맞게 수정 (서울 900,000,000)"],
  [8, "작성자", null, null],
  [9, "작성일", null, null],
];
for (const [row, label, value, note] of meta) {
  ws.mergeCells(`A${row}:B${row}`);
  ws.mergeCells(`C${row}:E${row}`);
  setCell(ws, `A${row}`, label, { font: F({ bold: true }), fill: META_FILL, border: BORDER });
  ws.getCell(`B${row}`).border = BORDER;
  ws.getCell(`B${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: META_FILL } };
  const fmt = row === 5 || row === 6 || row === 9 ? "yyyy-mm-dd" : row === 7 ? "#,##0" : undefined;
  setCell(ws, `C${row}`, value, { font: F(), fill: INPUT_FILL, border: BORDER, fmt, align: { horizontal: "left" } });
  for (const c of ["D", "E"]) {
    ws.getCell(`${c}${row}`).border = BORDER;
    ws.getCell(`${c}${row}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
  }
  if (note) setCell(ws, `F${row}`, note, { font: F({ size: 9, color: { argb: row === 3 ? "FFC00000" : "FF595959" } }) });
}

// 10행: 합계 (자동)
ws.mergeCells(`A${TOTAL_ROW}:B${TOTAL_ROW}`);
const totalStyle = { font: F({ bold: true }), fill: META_FILL, border: BORDER, align: { horizontal: "center" } };
for (const x of COLS) setCell(ws, `${x.c}${TOTAL_ROW}`, null, totalStyle);
setCell(ws, `A${TOTAL_ROW}`, "합계 (자동)", { ...totalStyle, align: { horizontal: "left" } });
const sumRange = (col) => `${col}${FIRST}:${col}${LAST}`;
const totalFormulas = {
  C: [`SUM(${sumRange("C")})`, "#,##0.00"],
  D: [`SUM(${sumRange("D")})`, "#,##0.00"],
  G: [`SUM(${sumRange("G")})`, "#,##0"],
  H: [`SUM(${sumRange("H")})`, "#,##0"],
  I: [`SUM(${sumRange("I")})`, "#,##0"],
  Q: [`SUM(${sumRange("Q")})`, "#,##0.0"],
  R: [`SUM(${sumRange("R")})`, "#,##0.0"],
  // 가중 전용률: 임대·전용면적이 모두 있는 호실만 (Σ전용 ÷ Σ임대)
  S: [
    `IFERROR(SUMIFS(${sumRange("D")},${sumRange("C")},">0",${sumRange("D")},">0")/SUMIFS(${sumRange("C")},${sumRange("C")},">0",${sumRange("D")},">0")*100,"")`,
    '0.0"%"',
  ],
  X: [`SUM(${sumRange("X")})`, "#,##0"],
};

// 11행 해상도 / 12행 머리글
for (const x of COLS) {
  const gradeKey = x.g.replace("*", "");
  setCell(ws, `${x.c}${GRADE_ROW}`, x.kind === "auto" ? "자동" : x.g || "—", {
    font: F({ size: 8, bold: true, color: { argb: "FF555555" } }),
    fill: GRADE_FILL[gradeKey] ?? (x.kind === "auto" ? "FFFFFFFF" : "FFF2F2F2"),
    align: { horizontal: "center" },
    border: BORDER,
  });
  const hc = setCell(ws, `${x.c}${HEADER_ROW}`, x.t, {
    font: F({ size: 9, bold: true, color: { argb: "FFFFFFFF" } }),
    fill: NAVY,
    align: { horizontal: "center", vertical: "middle", wrapText: true },
    border: BORDER,
  });
  hc.note = { texts: [{ font: { size: 9, name: "맑은 고딕" }, text: x.note }], margins: { insetmode: "custom", inset: [0.1, 0.1, 0.1, 0.1] } };
}
ws.getRow(GRADE_ROW).height = 13.5;
ws.getRow(HEADER_ROW).height = 31.5;

// 데이터 행
const exampleNote = "← 예시 행입니다. 지우고 쓰세요";
const example = {
  A: "3F", B: null, C: 132.5, D: 99.4, E: "사무실", F: "상가", G: 50000000, H: 4500000, I: 550000,
  J: serial(2023, 4, 1), K: serial(2024, 1, 1), L: serial(2027, 12, 31), M: "모름", N: "사업자등록", O: "임대중", P: exampleNote,
};

const formulaFor = (row) => ({
  Q: `IF(OR($A${row}="",C${row}=""),"",C${row}/${SQM_PER_PYEONG})`,
  R: `IF(OR($A${row}="",D${row}=""),"",D${row}/${SQM_PER_PYEONG})`,
  S: `IF(OR($A${row}="",C${row}="",D${row}=""),"",IF(C${row}>0,D${row}/C${row}*100,""))`,
  T: `IF(OR($A${row}="",O${row}<>"임대중",F${row}<>"상가",G${row}=""),"",G${row}+H${row}*100)`,
  U: `IF(T${row}="","",IF(T${row}<=$C$7,"○ 전면적용","× 초과 (5%상한 미적용)"))`,
  V: `IF(OR($A${row}="",O${row}<>"임대중"),"",IF(F${row}="상가",IF(J${row}="","확인 필요",TEXT(MAX(0,10-($C$6-J${row})/365.25),"0.0")&"년"),IF(F${row}="주택",IF(M${row}="있음","소진(1회)",IF(M${row}="없음",IF(L${row}="","확인 필요",TEXT(EDATE(L${row},24),"yyyy-mm")&"까지"),"확인 필요")),"확인 필요")))`,
  W: `IF($A${row}="","",IF(O${row}="공실","공실",IF(O${row}="자가사용","자가사용",IF(L${row}="","만료일 없음",IF(L${row}<$C$6,"만료 +"&TEXT($C$6-L${row},"0")&"일",IF(L${row}-$C$6<=30,"임박 "&TEXT(L${row}-$C$6,"0")&"일","유효"))))))`,
  X: `IF(OR($A${row}="",O${row}<>"임대중"),"",IF(H${row}="",0,H${row})+IF(I${row}="",0,I${row}))`,
  Y: `IF(OR($A${row}="",O${row}<>"임대중",D${row}="",H${row}=""),"",ROUND((H${row}+IF(I${row}="",0,I${row}))/(D${row}/${SQM_PER_PYEONG}),0))`,
});

// 예시 행 캐시 값 (JS 로 동일 산식 재현 — Excel/LibreOffice 는 열 때 재계산)
const exCached = (() => {
  const e = example;
  const ratio = (e.D / e.C) * 100;
  const remain = Math.max(0, 10 - (todaySerial - e.J) / 365.25);
  const diff = e.L - todaySerial;
  return {
    Q: e.C / SQM_PER_PYEONG,
    R: e.D / SQM_PER_PYEONG,
    S: ratio,
    T: e.G + e.H * 100,
    U: e.G + e.H * 100 <= 900000000 ? "○ 전면적용" : "× 초과 (5%상한 미적용)",
    V: `${remain.toFixed(1)}년`,
    W: diff < 0 ? `만료 +${-diff}일` : diff <= 30 ? `임박 ${diff}일` : "유효",
    X: e.H + e.I,
    Y: Math.round((e.H + e.I) / (e.D / SQM_PER_PYEONG)),
  };
})();

for (let row = FIRST; row <= LAST; row++) {
  ws.getRow(row).height = 18;
  const f = formulaFor(row);
  for (const x of COLS) {
    const addr = `${x.c}${row}`;
    const base = {
      font: F({ size: 9 }),
      fill: x.kind === "auto" ? AUTO_FILL : INPUT_FILL,
      align: { horizontal: x.c === "P" || x.c === "E" ? "left" : "center", vertical: "middle" },
      border: BORDER,
      fmt: x.fmt,
    };
    if (x.kind === "auto") {
      const cached = row === FIRST ? exCached[x.c] : "";
      setCell(ws, addr, { formula: f[x.c], result: cached }, base);
    } else {
      const v = row === FIRST ? example[x.c] ?? null : null;
      setCell(ws, addr, v, base);
    }
  }
}

// 합계 행 수식 (캐시 값: 예시 행 1건)
for (const [col, [formula, fmt]] of Object.entries(totalFormulas)) {
  const exVal = { C: example.C, D: example.D, G: example.G, H: example.H, I: example.I, Q: exCached.Q, R: exCached.R, S: exCached.S, X: exCached.X }[col];
  setCell(ws, `${col}${TOTAL_ROW}`, { formula, result: exVal }, { ...totalStyle, fmt, align: { horizontal: "center" } });
}

// 데이터 검증
const rng = (col) => `${col}${FIRST}:${col}${LAST}`;
const list = (col, items, title, prompt) =>
  ws.dataValidations.add(rng(col), {
    type: "list", allowBlank: true, formulae: [`"${items}"`],
    showErrorMessage: true, errorStyle: "warning", errorTitle: title, error: `${items.replaceAll(",", " / ")} 중에서 선택하세요.`,
    showInputMessage: !!prompt, promptTitle: title, prompt,
  });
list("F", "상가,주택,미확인", "적용법령", "주거로 쓰는 오피스텔은 '주택'입니다.");
list("M", "있음,없음,모름", "갱신요구권 행사", "묵시적 갱신은 '없음'입니다.");
list("N", "사업자등록,주민등록,미확인", "대항력 요건");
list("O", "임대중,공실,자가사용", "임대상태", "자가사용은 공실이 아닙니다.");
for (const col of ["G", "H", "I"]) {
  ws.dataValidations.add(rng(col), {
    type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0],
    showErrorMessage: true, errorStyle: "warning", errorTitle: "금액 단위", error: "원 단위 숫자만 입력하세요 (5,000만원 → 50000000).",
  });
}
for (const col of ["J", "K", "L"]) {
  ws.dataValidations.add(rng(col), {
    type: "date", operator: "greaterThan", allowBlank: true, formulae: [32874],
    showErrorMessage: true, errorStyle: "warning", errorTitle: "날짜 형식", error: "YYYY-MM-DD 형식의 날짜를 입력하세요.",
  });
}
ws.dataValidations.add(rng("C"), {
  type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0],
  showErrorMessage: true, errorStyle: "warning", errorTitle: "임대면적(㎡)", error: "㎡ 단위 숫자만 입력하세요. 평 단위로 적으면 면적이 3.3배 어긋납니다.",
  showInputMessage: true, promptTitle: "임대면적(㎡)", prompt: "계약면적(전용+공용 분담). ㎡로 입력.",
});
for (let row = FIRST; row <= LAST; row++) {
  // 전용면적 ≤ 임대면적 (호실별 상대 참조이므로 셀 단위로 등록)
  ws.dataValidations.add(`D${row}`, {
    type: "custom", allowBlank: true, formulae: [`AND(ISNUMBER(D${row}),D${row}>=0,OR(C${row}="",D${row}<=C${row}))`],
    showErrorMessage: true, errorStyle: "warning", errorTitle: "전용면적(㎡)", error: "전용면적은 임대면적 이하의 ㎡ 숫자여야 합니다. 두 칸이 바뀌지 않았는지 확인하세요.",
    showInputMessage: row === FIRST, promptTitle: "전용면적(㎡)", prompt: "임차인 독점 사용면적. 임대면적 이하.",
  });
}

// 조건부 서식
const fillStyle = (argb, font) => ({ fill: { type: "pattern", pattern: "solid", bgColor: { argb } }, font: { color: { argb: font } } });
ws.addConditionalFormatting({
  ref: rng("S"),
  rules: [
    { type: "expression", priority: 1, formulae: [`AND(ISNUMBER($S${FIRST}),$S${FIRST}>100)`], style: fillStyle("FFFFC7CE", "FF9C0006") },
    { type: "expression", priority: 2, formulae: [`AND(ISNUMBER($S${FIRST}),$S${FIRST}<30)`], style: fillStyle("FFFFEB9C", "FF9C5700") },
  ],
});
ws.addConditionalFormatting({
  ref: rng("D"),
  rules: [{ type: "expression", priority: 3, formulae: [`AND(ISNUMBER($C${FIRST}),ISNUMBER($D${FIRST}),$D${FIRST}>$C${FIRST})`], style: fillStyle("FFFFC7CE", "FF9C0006") }],
});
ws.addConditionalFormatting({
  ref: rng("W"),
  rules: [
    { type: "expression", priority: 4, formulae: [`LEFT($W${FIRST},2)="만료"`], style: fillStyle("FFFFC7CE", "FF9C0006") },
    { type: "expression", priority: 5, formulae: [`LEFT($W${FIRST},2)="임박"`], style: fillStyle("FFFFEB9C", "FF9C5700") },
  ],
});
for (const col of ["E", "G", "H", "L"]) {
  ws.addConditionalFormatting({
    ref: rng(col),
    rules: [{ type: "expression", priority: 6, formulae: [`AND($A${FIRST}<>"",$O${FIRST}="임대중",${col}${FIRST}="")`], style: fillStyle("FFFCE4EC", "FF9C0006") }],
  });
}

// ═════════════════════════════════════════════════════════════
// 시트 3: 자동검증
// ═════════════════════════════════════════════════════════════
{
  const wv = wb.addWorksheet("자동검증", { views: [{ showGridLines: false }] });
  wv.columns = [{ width: 8 }, { width: 30 }, { width: 34 }, { width: 70 }];
  setCell(wv, "A1", "자동 검증 — 발행 전 확인", { font: F({ size: 15, bold: true, color: { argb: NAVY } }) });
  wv.getRow(1).height = 24;
  const hdr = (row, labels) =>
    labels.forEach((t, i) =>
      setCell(wv, `${"ABCD"[i]}${row}`, t, { font: F({ bold: true, color: { argb: "FFFFFFFF" } }), fill: NAVY, align: { horizontal: "center" }, border: BORDER }),
    );
  hdr(3, ["#", "검증 항목", "결과", "판정 기준"]);

  // 검증 항목은 4행부터 16개(4~19행). 그 아래에 해상도 판정 블록을 배치한다.
  const G_TITLE = 21, G_HDR = 22, G_R1 = 23, G_R2 = 24, G_R3 = 25, G_AREA = 26, G_CUR = 28, G_NEXT = 29, G_NOTE = 31;

  const live = `COUNTIF(${R("O")},"임대중")`;
  const hasRows = `COUNTA(${R("A")})>0`;
  // 해상도 요건 — lease-math.ts resolveLedger() 와 동일 (R2 는 R1, R3 는 R2 충족을 전제)
  const r1 = `AND(${hasRows},COUNTA(${R("O")})=COUNTA(${R("A")}),COUNTIFS(${R("O")},"임대중",${R("E")},"<>")=${live},COUNTIFS(${R("O")},"임대중",${R("H")},"<>")=${live},COUNTIFS(${R("O")},"임대중",${R("L")},"<>")=${live})`;
  const r2 = `AND(C${G_R1}="충족",COUNTA(${R("C")})=COUNTA(${R("A")}),COUNTA(${R("F")})=COUNTA(${R("A")}),COUNTIFS(${R("O")},"임대중",${R("I")},"<>")=${live})`;
  const r3 = `AND(C${G_R2}="충족",COUNTIFS(${R("O")},"임대중",${R("J")},"<>")=${live},COUNTIFS(${R("O")},"임대중",${R("N")},"<>")=${live},COUNTIFS(${R("O")},"임대중",${R("N")},"미확인")=0)`;
  const area = `AND(${hasRows},COUNTA(${R("C")})=COUNTA(${R("A")}),COUNTA(${R("D")})=COUNTA(${R("A")}),COUNTIF(${R("S")},">100")=0)`;

  const items = [
    ["G19", "렌트롤 월세 합계 (정본)", `TEXT(SUM(${R("H")}),"#,##0")&"원"`, "표지 요약과 다르면 발행 차단. 이 표가 정본입니다."],
    ["C19", "임대면적 합계", `TEXT(SUM(${R("C")}),"#,##0.00")&"㎡ / "&TEXT(SUM(${R("Q")}),"#,##0.0")&"평"`, "건축물대장 연면적과 대조. 불일치 시 원인 규명 전까지 발행 보류."],
    ["C19-E", "전용면적 합계", `TEXT(SUM(${R("D")}),"#,##0.00")&"㎡ / "&TEXT(SUM(${R("R")}),"#,##0.0")&"평"`, "건축물대장 전유면적 합계와 0.5% 이내 일치해야 합니다 (A01 경고 기준)."],
    ["C19-R", "가중 전용률", `IF('렌트롤'!$S$${TOTAL_ROW}="","산출 불가 (임대·전용면적 쌍 없음)",TEXT('렌트롤'!$S$${TOTAL_ROW},"0.0")&"%")`, "Σ전용면적 ÷ Σ임대면적 (두 면적이 모두 있는 호실만). 호실별 전용률의 단순 평균이 아닙니다."],
    ["C19-M", "임대면적 미기재 호실", `COUNTIFS(${R("A")},"<>",${R("C")},"")&"건"`, "1건 이상이면 R2 미달 — 평당 단가·면적 공실률 산출 불가."],
    ["C19-X", "전용면적 미기재 호실", `COUNTIFS(${R("A")},"<>",${R("D")},"")&"건"`, "1건 이상이면 전용률·전용평당 월비용 보류. (공실 호실 포함)"],
    ["C19-V", "전용률 이상치", `COUNTIF(${R("S")},">100")&"건 100% 초과 / "&COUNTIF(${R("S")},"<30")&"건 30% 미만"`, "100% 초과 = 전용면적이 임대면적보다 큰 입력 오류(발행 보류). 30% 미만 = 면적 기재 오류 의심."],
    ["F11", "만료 계약 수", `COUNTIF(${R("W")},"만료*")&" / "&${live}&"건"`, "1건 이상이면 호실별 경고."],
    ["F12", "만료 비율 50% 초과", `IF(COUNTIF(${R("W")},"만료*")>${live}/2,"발행 차단","통과")`, "절반 초과 시 렌트롤 갱신 전까지 발행 불가."],
    ["F13", "30일 내 만료 임박", `COUNTIF(${R("W")},"임박*")&"건"`, "재계약 조건이 딜 구조를 바꿉니다. 협의 상태 확인 필요."],
    ["G18", "갱신권 판정 보류", `COUNTIF(${R("V")},"확인 필요")&"건"`, '최초계약일(상가)·행사이력(주택) 누락. 숫자 대신 "확인 필요" 출력.'],
    ["G13", "대항력 미확인", `COUNTIF(${R("N")},"미확인")&"건"`, '근거 없이 "없음" 표기 시 발행 차단.'],
    ["G17", "업종 미기재", `COUNTIFS(${R("A")},"<>",${R("E")},"")&"건"`, '비면 "미상"으로 출력. 추론 금지.'],
    ["T-C", "환산보증금 초과 호실", `COUNTIF(${R("U")},"×*")&"건"`, "초과 시 5% 인상상한·우선변제권 미적용. 갱신요구권은 적용됨."],
    ["F01", "렌트롤 기준일", `IF('렌트롤'!$C$5="","미기재",TEXT('렌트롤'!$C$5,"yyyy-mm-dd"))`, "없으면 신선도 판정 불가."],
    ["C21", "공실 / 자가사용", `COUNTIF(${R("O")},"공실")&"건 / "&COUNTIF(${R("O")},"자가사용")&"건"`, "자가사용은 임대 전환 여력. 공실 손실과 구분합니다."],
  ];
  let row = 4;
  for (const [id, label, formula, rule] of items) {
    setCell(wv, `A${row}`, id, { font: F({ size: 9, color: { argb: "FF7F7F7F" } }), border: BORDER, align: { horizontal: "center" } });
    setCell(wv, `B${row}`, label, { font: F({ bold: true }), border: BORDER });
    setCell(wv, `C${row}`, { formula }, { font: F(), fill: AUTO_FILL, border: BORDER, align: { horizontal: "center" } });
    setCell(wv, `D${row}`, rule, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    row++;
  }
  setCell(wv, `A${G_TITLE}`, "해상도 판정 — 이 렌트롤로 무엇을 만들 수 있나", { font: F({ size: 13, bold: true, color: { argb: NAVY } }) });
  wv.getRow(G_TITLE).height = 22;
  hdr(G_HDR, ["등급", "요건", "충족", "열리는 기능"]);
  const grades = [
    ["R1 최소형", "호실·업종·월세·만료일·임대상태 (임대중 호실 전부)", r1, "렌트롤 표 · 만료 타임라인 · 총액 수익률"],
    ["R2 필요형", "R1 + 임대면적(전 호실)·적용법령(전 호실)·관리비(임대중)", r2, "평당 단가 · 층별 단가 · 환산보증금 · 상임법 판정"],
    ["R3 표준형", "R2 + 최초계약일·대항력 (임대중 호실 전부, '미확인' 불가)", r3, "갱신요구권 · 명도 계획 · 임대료 정상화 시뮬"],
    ["면적 보강", "전 호실 임대면적·전용면적 입력, 전용률 100% 이하 (등급 무관)", area, "전용률 · 전용평당 월비용(NOC)"],
  ];
  grades.forEach(([g, req, f, cap], i) => {
    const rr = G_R1 + i;
    setCell(wv, `A${rr}`, g, { font: F({ bold: true, size: 9 }), border: BORDER, align: { horizontal: "center", wrapText: true } });
    setCell(wv, `B${rr}`, req, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    setCell(wv, `C${rr}`, { formula: `IF(${f},"충족","미달")` }, { font: F({ bold: true }), fill: AUTO_FILL, border: BORDER, align: { horizontal: "center" } });
    setCell(wv, `D${rr}`, cap, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    wv.getRow(rr).height = 28;
  });
  setCell(wv, `B${G_CUR}`, "현재 해상도", { font: F({ bold: true, size: 11 }) });
  setCell(wv, `C${G_CUR}`, { formula: `IF(C${G_R3}="충족","R3 표준형",IF(C${G_R2}="충족","R2 필요형",IF(C${G_R1}="충족","R1 최소형","R0 미달")))` }, { font: F({ bold: true, size: 14, color: { argb: NAVY } }), fill: AUTO_FILL, border: BORDER, align: { horizontal: "center" } });
  setCell(wv, `B${G_NEXT}`, "다음 한 칸", { font: F({ bold: true, size: 11 }) });
  wv.mergeCells(`C${G_NEXT}:D${G_NEXT}`);
  setCell(wv, `C${G_NEXT}`, {
    formula: `IF(C${G_R1}<>"충족","「업종」「월세」「현 계약 만료일」「임대상태」부터 채우세요. 렌트롤 표를 그릴 수 없습니다",IF(C${G_R2}<>"충족","「적용법령」「관리비」를 채우면 환산보증금·상임법 판정이 열립니다. 「임대면적」은 평당 단가를 엽니다",IF(C${G_R3}<>"충족","「최초 계약일」과 「대항력 요건」을 채우면 갱신요구권·명도 계획이 열립니다",IF(C${G_AREA}<>"충족","「전용면적」을 모든 호실에 채우면 전용률·전용평당 월비용이 열립니다","완료 — 모든 기능 사용 가능"))))`,
  }, { font: F({ bold: true }), fill: AUTO_FILL, border: BORDER, align: { wrapText: true, vertical: "middle" } });
  wv.getRow(G_NEXT).height = 32;
  setCell(wv, `B${G_NOTE}`, "※ 이 시트는 참고용입니다. 시스템은 '렌트롤' 시트를 자동으로 읽습니다.", { font: F({ size: 9, color: { argb: "FF7F7F7F" } }) });
}

// ═════════════════════════════════════════════════════════════
// 시트 4: 컬럼정의 (R1/R2/R3 해상도별 컬럼 + 설명)
// ═════════════════════════════════════════════════════════════
{
  const wd = wb.addWorksheet("컬럼정의", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
  wd.columns = [
    { width: 6 }, { width: 22 }, { width: 9 }, { width: 9 }, { width: 24 }, { width: 62 }, { width: 26 }, { width: 28 }, { width: 52 },
  ];
  setCell(wd, "A1", "컬럼 정의 — R1 / R2 / R3 해상도별 입력 항목과 설명", { font: F({ size: 15, bold: true, color: { argb: NAVY } }) });
  wd.getRow(1).height = 24;
  setCell(wd, "A2", "해상도 = 이 렌트롤로 만들 수 있는 분석의 깊이. 판정 로직: src/domain/building/mobile-im/lease-math.ts resolveLedger(). R0은 R1 요건 미달.", { font: F({ size: 9, color: { argb: "FF595959" } }) });
  const heads = ["열", "컬럼명", "해상도", "필수도", "입력 방식 · 단위", "설명", "업로드 반영 필드", "도메인 필드 (LeaseRow)", "비었을 때 영향"];
  heads.forEach((t, i) =>
    setCell(wd, `${String.fromCharCode(65 + i)}3`, t, { font: F({ bold: true, color: { argb: "FFFFFFFF" } }), fill: NAVY, align: { horizontal: "center", vertical: "middle", wrapText: true }, border: BORDER }),
  );
  wd.getRow(3).height = 24;
  let rr = 4;
  const bandFor = (g) => GRADE_FILL[g.replace("*", "")] ?? (g === "" ? "FFF2F2F2" : "FFFFFFFF");
  for (const x of COLS) {
    const vals = [x.c, x.t, x.kind === "auto" ? "자동" : x.g || "—", x.req, x.unit, x.d, x.app || "엑셀 자동검증 전용 (업로드 미반영)", x.domain, x.blank || "—"];
    vals.forEach((v, i) =>
      setCell(wd, `${String.fromCharCode(65 + i)}${rr}`, v, {
        font: F({ size: 9, bold: i === 1 }),
        fill: i === 2 ? bandFor(x.kind === "auto" ? "" : x.g) : x.kind === "auto" ? "FFF7F7F7" : undefined,
        border: BORDER,
        align: { vertical: "middle", wrapText: true, horizontal: i < 4 && i !== 1 ? "center" : "left" },
      }),
    );
    wd.getRow(rr).height = Math.max(30, Math.ceil(Math.max(x.d.length / 30, (x.blank || "").length / 25)) * 13);
    rr++;
  }
  rr += 1;
  setCell(wd, `A${rr}`, "해상도 정의", { font: F({ size: 12, bold: true, color: { argb: NAVY } }) });
  rr++;
  const levels = [
    ["R0", "미달", "임대중 호실의 업종·월세·만료일 누락 등 R1 요건 미충족", "렌트롤을 발행 수준으로 쓸 수 없음 — 보완 자료 요청"],
    ["R1", "발행 최소선", "호실/층 · 업종/상호 · 보증금 · 월세 · 만료일 · 임대상태", "렌트롤 표 · 만료 타임라인 · 총액 수익률"],
    ["R2", "분석 가능", "R1 + 임대면적(전 호실) · 적용법령(전 호실) · 관리비(임대중) · (권장) 전용면적·현 계약 시작일", "평당 단가 · 층별 단가 · 환산보증금 · 상임법 판정 (전용면적까지 있으면 전용률·전용평당 월비용)"],
    ["R3", "정밀 실사", "R2 + 최초계약일 · 대항력 (갱신요구권 행사는 주택 필수)", "갱신요구권 · 명도 계획 · 임대료 정상화 시뮬"],
  ];
  ["등급", "의미", "필수 입력", "열리는 기능"].forEach((t, i) =>
    setCell(wd, `${["A", "B", "E", "F"][i]}${rr}`, t, { font: F({ bold: true, color: { argb: "FFFFFFFF" } }), fill: NAVY, border: BORDER, align: { horizontal: "center" } }),
  );
  wd.mergeCells(`B${rr}:D${rr}`);
  rr++;
  for (const [g, name, req, cap] of levels) {
    wd.mergeCells(`B${rr}:D${rr}`);
    setCell(wd, `A${rr}`, g, { font: F({ bold: true, size: 9 }), fill: GRADE_FILL[g] ?? "FFF2F2F2", border: BORDER, align: { horizontal: "center", vertical: "middle" } });
    setCell(wd, `B${rr}`, name, { font: F({ bold: true, size: 9 }), border: BORDER, align: { vertical: "middle" } });
    setCell(wd, `E${rr}`, req, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    setCell(wd, `F${rr}`, cap, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    wd.getRow(rr).height = 34;
    rr++;
  }
  rr += 1;
  setCell(wd, `A${rr}`, "면적 4분모와 렌트롤 면적의 관계", { font: F({ size: 12, bold: true, color: { argb: NAVY } }) });
  rr++;
  const areas = [
    ["대지면적", "토지 평당 매각가의 분모. 렌트롤에 입력하지 않음."],
    ["연면적", "건축물대장 총 바닥면적. 임대면적 합계와 같지 않음(주차장·기계실 등 제외) — 자동 동일시 금지."],
    ["임대면적", "렌트롤 C열. 임대료 단가·공실률의 분모. 임대면적 = 전용면적 + 공용면적 분담분."],
    ["전용면적", "렌트롤 D열. 전용률·전용평당 월비용의 분모. 전용률(%) = 전용면적 ÷ 임대면적 × 100."],
  ];
  for (const [k, v] of areas) {
    wd.mergeCells(`B${rr}:D${rr}`);
    wd.mergeCells(`E${rr}:F${rr}`);
    setCell(wd, `B${rr}`, k, { font: F({ bold: true, size: 9 }), border: BORDER });
    setCell(wd, `E${rr}`, v, { font: F({ size: 9 }), border: BORDER, align: { wrapText: true, vertical: "middle" } });
    wd.getRow(rr).height = 28;
    rr++;
  }
}

await wb.xlsx.writeFile(OUT);
console.log(`OK → ${OUT}`);
console.log(`columns=${COLS.length} (last=${LAST_COL}), data rows=${LAST - FIRST + 1} (${FIRST}-${LAST}), 컬럼 map: ${JSON.stringify(colOf)}`);
