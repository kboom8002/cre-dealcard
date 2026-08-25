/**
 * im-core.d.ts — 지표 산출 계약
 *
 * `credeal/core.py` 의 TypeScript 대응입니다. **포팅 대상**입니다 —
 * 레지스트리와 달리 이쪽은 로직이라 옮겨야 합니다.
 * 옮긴 뒤에는 `parity.spec.ts` 로 Python 참조구현과 문자열까지 대조합니다.
 */

import type {
  Grade, Edition, SourceGrade, LeaseResolution, PropertyResolution,
  ExclusionKind, BuyerPurpose,
} from './im-registry';

// ═══════════════════════════════════════════════════════════════════════
// 값 — basis 없는 수치는 존재할 수 없습니다
// ═══════════════════════════════════════════════════════════════════════

/**
 * 화면에 나가는 모든 수치는 이 형태입니다.
 *
 * 🔴 `basis` 는 선택 인자가 아닙니다. 불변조건 2 가 "수익률에 basis 가 없으면
 *    렌더하지 않는다"이고, v4 PDF 사고의 직접 원인이 basis 누락이었습니다.
 *    타입 수준에서 강제하십시오 — 런타임 검사로는 늦습니다.
 */
export interface Val<T = number> {
  value: T;
  /** 이 수치가 무엇을 무엇으로 나눈 것인지. 예: '연 임대수입 ÷ 매매가' */
  basis: string;
  source: SourceGrade;
  /** 가정이 섞였으면 true — 화면에 ◇ 를 붙입니다. */
  assumed?: boolean;
  note?: string;
}

/** 값이 없는 상태. null 이 아니라 이것을 씁니다 — 왜 없는지가 남습니다. */
export interface Absent {
  value: null;
  reason: string;
  /** 이 필드를 채우면 값이 생깁니다. 바텀시트 유도 문구의 근거. */
  resolves_with: string[];
}

export type Maybe<T = number> = Val<T> | Absent;

export declare function isPresent<T>(v: Maybe<T>): v is Val<T>;

// ═══════════════════════════════════════════════════════════════════════
// 입력
// ═══════════════════════════════════════════════════════════════════════

export interface RentRollRow {
  floor: string;
  unit?: string;
  /** 업종. 원문 그대로 씁니다 — 추론하지 않습니다 (불변조건 6). */
  useType: string;
  /** 🔴 임차인 상호. 대외 문서에 나가지 않습니다 (불변조건 14). */
  tenantName?: string;
  areaSqm?: number;
  depositKrw?: number;
  monthlyRentKrw?: number;
  monthlyMgmtKrw?: number;
  startDate?: string;
  expiryDate?: string;
  firstContractDate?: string;
  /** 자가사용은 공실이 아닙니다 (불변조건 8). */
  occupancy: 'leased' | 'vacant' | 'owner_occupied';
}

// ═══════════════════════════════════════════════════════════════════════
// 필지 · 제척 (D22-8 · CATALOG_SLOTS §2.1 · CATALOG_RULES P01~P04)
// ═══════════════════════════════════════════════════════════════════════

export interface Exclusion {
  kind: ExclusionKind;
  areaSqm: number;
  /** 용적률 산정 대지면적에서 빠지는가. 기본값으로 넘기지 않습니다. */
  affectsFAR: boolean;
  /** 🔴 대개 'broker' — API 로 조회되지 않습니다. */
  provenance: 'broker' | 'official' | 'api';
  note?: string;
}

export interface Parcel {
  jibun: string;
  jimok: string;
  areaSqm: number;
  ownership: 'sole' | 'shared';
  /** 🔴 shared 인데 지분이 없으면 **던집니다.** 전체 면적으로 세지 않습니다. */
  shareNumerator?: number;
  shareDenominator?: number;
  officialPriceSqm?: number;
  exclusions: Exclusion[];
}

export interface LandSummary {
  count: number;
  /** P04 — Σ 필지 면적 */
  ledgerAreaSqm: number;
  ownedAreaSqm: number;
  excludedAreaSqm: number;
  /** P01 — Σ(면적 × 지분) − Σ(제척 where affectsFAR) */
  effectiveAreaSqm: number;
  /** P03 */
  exclusionImpactPct: number;
  ledgerFarPct: number | null;
  /**
   * P02 — 🔴 유효 대지가 작아지면 용적률은 **올라갑니다.**
   * 대장 면적으로 계산하면 증축 여유를 과대평가합니다.
   */
  effectiveFarPct: number | null;
}

export interface ReliefCross {
  thresholdPct: number;
  ledgerFarPct: number;
  effectiveFarPct: number;
  verdict: string;
  action: string;
}

/** L12 — 목적별 표시. 🔴 `부록`은 언제나 전체입니다. */
export interface ZoningView {
  본문: string[];
  접기: string[];
  부록: string[];
}

export interface PublicFact<T = number | string> {
  value: T;
  grade: SourceGrade;
  source: string;
  note?: string;
}

export interface IMInput {
  dealId: string;
  posture: 'income';
  edition: Edition;
  priceKrw: number;
  /** 노출 단계에 따라 잘립니다. public·nda 는 동까지. */
  addressFull: string;
  rentRoll: RentRollRow[];
  rentRollAsOf?: string;
  /** 지번으로 자동 조회한 공부·공시지가·실거래. */
  publicData: Record<string, PublicFact>;
  /**
   * 필지 배열. **비어 있으면 단일 필지 경로가 그대로 돕니다.**
   * 🔴 빈 배열을 넣어 "1필지 물건" 으로 표기하지 마십시오 — 없던 면이 생깁니다.
   */
  parcels?: Parcel[];
  zoningItems?: string[];
  temporaryRelief?: { name: string; thresholdPct: number; expiry?: string };
  buyerPurpose?: BuyerPurpose;
  /** 중개인이 채운 선택 입력. */
  brokerInputs: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════
// 해상도·등급
// ═══════════════════════════════════════════════════════════════════════

export interface ResolutionResult {
  L: LeaseResolution;
  P: PropertyResolution;
  grade: Grade;
  /** 다음 단계로 가려면 무엇이 더 필요한가. 화면에 그대로 씁니다. */
  missingForNext: Record<string, string[]>;
}

export declare function resolve(input: IMInput): ResolutionResult;

// ═══════════════════════════════════════════════════════════════════════
// 산출
// ═══════════════════════════════════════════════════════════════════════

/**
 * 지표 키. **`parity.golden.json` 의 `metrics` 키와 1:1 입니다.**
 *
 * 이름을 camelCase 로 예쁘게 바꾸고 싶은 유혹이 있는데, 그러면 기준표와
 * 대조할 때 매핑표가 하나 더 생깁니다. 매핑표는 어긋납니다.
 * 기준표가 정본이므로 이름을 기준표에 맞춥니다.
 */
export type MetricKey =
  // 취득
  | 'acq_tax'              // 매매가 × 4.6%
  | 'broker_fee'           // 매매가 × 0.9%
  | 'total_acq_cost'       // 매매가 + 취득세 + 중개보수
  // 수익률 — 전부 gross 계열입니다. "순수익률" 라벨을 붙이지 않습니다 (불변조건 3)
  | 'gross_price'          // 연 총임대료 ÷ 매매가
  | 'gross_price_deposit'  // 연 총임대료 ÷ (매매가 − 보증금)
  | 'roe_ceiling'          // 무차입 ROE — 역레버리지 구간의 이론 상한
  // 임대차
  | 'first_floor_share'    // 1층 월세 ÷ 월세 합계
  // 단가·공부
  | 'land_pyeong_price'    // 매매가 ÷ 대지 평수
  | 'gfa_pyeong_price'     // 매매가 ÷ 연면적 평수
  | 'gfa_confirmed'        // 교차검증으로 확정한 연면적
  | 'far_headroom'         // 법정 상한 − 현행 용적률
  | 'land_price_multiple'  // 매매가 ÷ 공시지가 총액
  | 'land_price_total'     // 대지면적 × ㎡당 공시지가
  | 'land_sqm';            // 건축물대장 대지면적

export interface BlockState {
  open: boolean;
  /** 잠겼을 때 화면에 그대로 나가는 문장. 문구가 바뀌면 시험이 실패합니다. */
  lockedMsg?: string;
}

export interface HeroItem {
  label: string;
  /** 이미 포맷된 문자열입니다 — '115억' · '7,492만원/평'. */
  value: string;
  basis: string;
}

export interface IMCore {
  readonly input: IMInput;
  readonly resolution: ResolutionResult;

  // ── 지표 ──
  /**
   * 🔴 지표 접근은 이 하나뿐입니다. 개별 메서드를 따로 두지 않습니다.
   *    두 경로가 있으면 한쪽만 고쳐지는 일이 반드시 생깁니다.
   */
  metric(key: MetricKey): Maybe;

  // ── 원장 합계 ──
  ledgerSumDeposit(): number;
  ledgerSumRent(): number;
  ledgerSumMgmt(): number | null;
  ledgerSumArea(): number | null;

  // ── 레버리지 ──
  /** LTV 3안. 값은 im.assumptions.yaml 의 ltvScenarios 에서 읽습니다. */
  leverageTable(): LeverageRow[];
  /** 대출 금리 > 무차입 수익률이면 true. */
  negativeLeverage(): boolean;

  // ── 임대차 ──
  /** 호실별 만료 판정. 기준일을 인자로 받습니다 — 고정하지 않으면 시험이 흔들립니다. */
  expiryStateOf(row: RentRollRow, ref: Date): '만료 경과' | '만료 임박' | '유효' | '확인 필요';
  /** 환산보증금 = 보증금 + 월세 × 100. 상임법 적용 판단에 씁니다. */
  convertedDeposit(row: RentRollRow): Maybe;
  vacancyByUnit(): Maybe;
  vacancyByArea(): Maybe;
  /** 표에 넣을 행. **원장 전량입니다** (불변조건 18). */
  rentRollForDisplay(): RentRollRow[];

  // ── 필지·제척 (D22-8) ──
  /** 필지가 없으면 null. 단일 필지 물건에서 억지로 만들지 않습니다. */
  land(): LandSummary | null;
  /** L10·L11·L12 — 어떤 면을 켤지. */
  landLayout(): { L10: boolean; L11: boolean; L12: boolean };
  /** 대장 기준 충족인데 유효 기준 이탈이면 반환. 아니면 null. */
  reliefCross(): ReliefCross | null;
  /** 매수 목적이 없으면 전 항목을 본문에 냅니다 — 임의로 감추지 않습니다. */
  zoningView(): ZoningView;

  // ── 공부 ──
  crosscheck(): CrosscheckResult[];
  hasPublic(): boolean;
  /** 층별 합 vs 표 계 행. 모든 행에 면적이 있을 때만 판정합니다 (C33). */
  areaConflict(): { floorSum: number; stated: number; deltaPct: number } | null;

  // ── 게이트·결손 ──
  blockingGates(): string[];
  warningGates(): string[];
  /** 결손은 사라지지 않고 확인사항으로 이동합니다 (불변조건 13). */
  deficiencies(): string[];

  // ── 블록 ──
  blocks(): Record<string, BlockState>;

  // ── 표시 ──
  /** 표지 3지표. 매수인이 검산 가능한 것만 (불변조건 19). */
  hero(): [HeroItem, HeroItem, HeroItem];
  /** 25자 이내. */
  oneLiner(): string;
  /** 실제로 결합된 출처만 켭니다. */
  sourceChips(): string[];
}

export interface LeverageRow {
  ltv: number;
  loanKrw: number;
  equityKrw: number;
  monthlyInterestKrw: number;
  monthlyNetCashKrw: number;
  roe: Maybe;
  /** 대출 이율 > 무차입 수익률이면 true. 경고 문구를 붙입니다. */
  negativeLeverage: boolean;
}

export interface ExpiryState {
  totalRows: number;
  expiredRows: number;
  expiringIn30Days: number;
  expiredRentShare: number;
  gates: string[]; // G22 · G23 · G24
}

export interface CrosscheckResult {
  /** X05 는 다필지에서만 — 필지 합 = 공부 대지면적. */
  code: 'X01' | 'X02' | 'X03' | 'X04' | 'X05';
  label: string;
  expected: number;
  actual: number;
  deltaPct: number;
  tolerancePct: number;
  pass: boolean;
  note?: string;
}

export declare function buildCore(input: IMInput): IMCore;

// ═══════════════════════════════════════════════════════════════════════
// 표기 — 문자열까지 Python 과 일치해야 합니다
// ═══════════════════════════════════════════════════════════════════════

/**
 * 금액을 한국식으로 씁니다. 임계는 레지스트리(im.format)에서 읽습니다.
 * 예: 4_650_000_000 → '46억 5,000만원'
 *
 * 🔴 반올림 자리가 Python 과 다르면 IM 두 벌이 다른 값을 말합니다.
 *    parity.spec.ts 가 이것을 잡습니다.
 */
export declare function fmtMoney(krw: number): string;

/** 예: 2.24 → '2.24%'. 소수 자리는 레지스트리에서 읽습니다. */
export declare function fmtPercent(pct: number): string;

/** ㎡ 와 평을 함께 씁니다. 예: '1,441.15㎡(436.00평)' */
export declare function fmtArea(sqm: number): string;

/** 값이 없을 때의 문자열. 0 이나 '—' 이나 'N/A' 를 쓰지 않습니다. */
export declare const MISSING: string;
