/**
 * im-registry.d.ts — SSoT 레지스트리 소비 계약
 *
 * `credeal/ssot/*.yaml` 11종을 TypeScript 에서 읽을 때의 타입입니다.
 *
 * 🔴 이 파일은 **YAML 을 코드로 옮기지 않습니다.** 타입만 선언합니다.
 *    값을 TS 상수로 복사하는 순간 두 벌이 되고, 두 벌은 어긋납니다.
 *    빌드 시 YAML → JSON 으로 변환해 번들에 넣고, 이 타입으로 읽으십시오.
 *
 * 생성 경로:
 *    credeal/ssot/*.yaml  →  (build) →  registry.json  →  loadRegistry()
 */

// ═══════════════════════════════════════════════════════════════════════
// 공통
// ═══════════════════════════════════════════════════════════════════════

export type Level = '차단' | '경고' | '치환';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type LeaseResolution = 'R0' | 'R1' | 'R2' | 'R3';
export type PropertyResolution = 'P0' | 'P1' | 'P2' | 'P3';
export type Edition = 'R1' | 'R2';
export type Stage = 'public' | 'nda' | 'pro';

/** 출처 등급. S2a 와 S2b 의 구분이 중요합니다 — 아래 주석 참고. */
export type SourceGrade =
  | 'S1'   // 공부 — 건축물대장·등기부·토지대장
  | 'S2a'  // 공공 API 원시 — 지번이 마스킹되어 있고 집합건물 대지면적이 없습니다
  | 'S2b'  // 공공 API + 중개인 보강 — 중개인이 지번·대지면적·층수를 채운 것
  | 'S3'   // 중개인 입력 (원장)
  | 'S4'   // 파생 — 위 값들로 계산한 것
  | 'S5';  // 가정 — 화면에 ◇ 를 붙입니다

/**
 * 저장용 출처값. v0.5에서 5종 → 9종.
 * `SourceGrade` 는 **표시** 티어이고 이쪽이 **저장** 값입니다.
 * 둘을 겸하게 두었더니 공공 API 원시와 중개인 보강본이 같은 배지를 달았습니다.
 * 매핑은 CATALOG_SLOTS §1.2.
 */
export type Provenance =
  | 'registry'    // S1  공부
  | 'public_api'  // S2a 공공 API 원시
  | 'broker_aug'  // S2b 공공 API + 중개인 보강
  | 'expert'      // S3  감정평가·구조진단
  | 'ledger'      // S3  임대차·관리비 원장
  | 'seller'      // S3  매도인 진술
  | 'broker'      // S3  중개인 진술
  | 'derived'     // S4  파생 — 신뢰도는 최약 고리 승계
  | 'assumed';    // S5  가정

export type InvestmentPosture =
  | 'income' | 'owner_occupied' | 'development' | 'operating' | 'trading';

/** 어휘 규칙의 적용 범위. CATALOG_LEXICON §7.1. */
export type LexiconScope =
  /** IM 본문·딜카드·캡션 — 금지어·치환 적용 */
  | 'reader_facing'
  /** 🔴 enum 값·아키타입 이름·슬롯 라벨 — **지면에 나갑니다.** 적용 */
  | 'internal_label'
  /** 명세 문서·코드 주석·로그 — 미적용 */
  | 'engineering';

/**
 * 포스처 확장 계약. 13칸이 전부 차야 발행할 수 있습니다 (게이트 G30).
 * ONTOLOGY_V0.5_SPEC §3.
 */
export interface PostureContract {
  posture: InvestmentPosture;
  /** ≥ 3. 실증 딜이 없으면 hypothesis: true */
  archetypes: string[];
  hypothesis?: boolean;
  sections: string[];          // ≥ 7
  emphasis_sections: string[]; // ≥ 2
  required_slots: string[];
  value_metric: string;
  /** 🔴 없으면 'none' 을 **명시**합니다. 빈 값과 구분되어야 합니다. */
  yield_basis: string | 'none';
  /** 🔴 포스처마다 다릅니다 — 수익형은 임대 현황, 개발형은 명도·인허가. */
  l_axis_slots: string[];
  min_resolution: { L: LeaseResolution; P: PropertyResolution };
  grade_adjustment: Record<string, number>;
  layout_rules: string[];      // ≥ 1
  constraints: string[];       // ≥ 1
  gates: string[];
  nlg_masks: string[];         // ≥ 2
  status: 'commercial' | 'beta' | 'internal_only';
}

export interface PostureRegistry {
  meta: Meta;
  contracts: Record<InvestmentPosture, PostureContract>;
  /** 계약 미충족 칸. 비어 있어야 status 가 commercial 이 됩니다. */
  unfilled(posture: InvestmentPosture): string[];
}

export interface Meta {
  id: string;
  version: number;
  owner: string;
  note?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// im.lexicon
// ═══════════════════════════════════════════════════════════════════════

export interface Substitution {
  from: string;
  /** null 이면 대체어 없이 그냥 쓰지 않습니다. */
  to: string | null;
  require?: string;
  reason?: string;
  scope?: string;
}

export interface Lexicon {
  meta: Meta;
  substitutions: Substitution[];
  keep_as_is: string[];
  banned: Record<string, string[]>;
  /** 더 긴 낱말 안에 우연히 포함된 경우 — '실제로' 속의 '제로' 등. */
  context_exclude: Record<string, string[]>;
  negation_markers: string[];
  corrections: { before: string; after: string }[];
}

// ═══════════════════════════════════════════════════════════════════════
// im.format
// ═══════════════════════════════════════════════════════════════════════

export interface FormatSpec {
  meta: Meta;
  date: { format: string; [k: string]: unknown };
  josa: Record<string, unknown>;
  unit_price: { bases: string[]; comparison_rule: string; [k: string]: unknown };
  money: {
    units: string[];
    switch_threshold: number;
    rules: string[];
  };
  percent: {
    /** true 면 basis 없이 렌더할 수 없습니다 (불변조건 2). */
    require_basis: boolean;
    decimals: number;
  };
  area: {
    pyeong_ratio: number;
    /** ㎡ 와 평을 함께 적습니다. */
    dual: boolean;
    decimals: number;
  };
  sign: { minus: string; up: string; down: string };
  missing: { token: string; forbidden: string[] };
  assumption: { mark: string };
}

// ═══════════════════════════════════════════════════════════════════════
// im.errors  —  코드 공간
// ═══════════════════════════════════════════════════════════════════════

export type RegistrationStatus = '등록' | '등록요청' | '폐기';

export interface GateDef {
  code: string;
  label: string;
  level: Level;
  status: RegistrationStatus;
  on_fail?: string;
  resolves_with?: string;
  invariant?: number | number[];
  /** 공공데이터 조회로 스스로 풀 수 있는가. false 면 사람이 필요합니다. */
  public_data_resolvable?: boolean;
  was?: string;
}

export interface CrosscheckDef {
  code: 'X01' | 'X02' | 'X03' | 'X04' | 'X05';
  label: string;
  tolerance_pct: number;
  level: Level;
  condition?: string;
  same_as?: string;
}

export interface CodeConflict {
  id: string;
  code: string;
  severity: Level | '중대';
  impact: string;
  resolution: Record<string, unknown>;
}

export interface ErrorRegistry {
  meta: Meta;
  namespaces: {
    prefix: string;
    label: string;
    owner: string;
    range?: string;
    status?: RegistrationStatus;
  }[];
  conflicts: CodeConflict[];
  renames: { from: string; to: string; scope?: string }[];
  gates: GateDef[];
  constraints_new: {
    code: string;
    label: string;
    level: Level;
    tolerance_pct?: number;
    status: RegistrationStatus;
    condition?: string;
  }[];
  crosschecks: CrosscheckDef[];
  /** 🔴 로그에 입력값을 담지 않습니다. 코드·심각도·필드명·해소 경로만. */
  log_format: { rule: string; template: string; good: string; bad: string };
}

// ═══════════════════════════════════════════════════════════════════════
// im.assumptions
// ═══════════════════════════════════════════════════════════════════════

export type AssumptionTier = 'measured' | 'legal' | 'market_default' | 'user_input';

export interface Assumption<T = number> {
  key: string;
  /** 🔴 null 은 "모른다"입니다. 0 이나 기본값으로 바꾸지 마십시오. */
  value: T | null;
  unit: string;
  confidence: 'high' | 'medium' | 'low';
  basis: string;
  editable: boolean;
  impact_if_wrong?: string;
  review_trigger?: string;
  on_lookup_fail?: string;
  invariant?: number;
}

export interface UserInputAssumption {
  key: string;
  /** 이 값이 null 이면 여기 적힌 지표들을 산출하지 않습니다. */
  blocks_if_null: string[];
  invariant?: number | number[];
}

export interface RetiredAssumption {
  key: string;
  was: unknown;
  reason: string;
  replacement: string;
}

export interface AssumptionRegistry {
  meta: Meta & { review_cycle: string; last_reviewed: string };
  tiers: Record<AssumptionTier, { label: string; default_allowed: boolean; rule?: string }>;
  governance: { change_via: string; approval: string; on_change: string[] };
  legal: Assumption[];
  market_default: Assumption<number | number[] | Record<string, number>>[];
  user_input: UserInputAssumption[];
  retired: RetiredAssumption[];
  comps_coverage: {
    main_band_krw: [number, number];
    auto_lookup_min_krw: number;
    auto_lookup_max_krw: number;
    gap: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// im.image
// ═══════════════════════════════════════════════════════════════════════

export interface ImageSlot {
  key: string;
  label: string;
  required: boolean;
  box_in: { w: number; h: number };
  /** cover-fit 크롭 **후** 만족해야 하는 화소입니다. */
  min_px: { long: number; short: number };
  kind?: '캡처';
  caution?: string;
}

export interface ImageRegistry {
  meta: Meta;
  /**
   * 🔴 구속력은 여기에 있습니다. ImageSlot.min_px 는 목표치일 뿐입니다.
   * 같은 2000px 도 표지(8.20in)에서는 244dpi, 갤러리(4.79in)에서는 417dpi.
   */
  min_dpi: { photo: number; capture: number };
  slots: ImageSlot[];
  minimum_set: { count: number; rule: string; on_shortfall: string };
  quality: { code: string; label: string; level: Level; rule?: string }[];
  pipeline: { step: number; name: string; action: string; gate?: string }[];
  storage: {
    buckets: Record<string, { access: string; exposure: string }>;
    naming: string;
    audit: { fields: string[] };
  };
  /** 아직 정하지 못한 것 — 인접 상호·지도 약관·검출 모델. */
  open: { key: string; question: string }[];
}

// ═══════════════════════════════════════════════════════════════════════
// im.parcel  —  다필지 · 제척 · 토지이용계획 표시
// ═══════════════════════════════════════════════════════════════════════

/** 제척 사유 7종. CATALOG_SLOTS §5 enum 표 8행. */
export type ExclusionKind =
  | 'planned_road'   // 도시계획도로 저촉 — 가장 흔합니다
  | 'buffer_green'   // 완충녹지
  | 'park'           // 공원
  | 'river'          // 하천구역
  | 'road_setback'   // 접도구역
  | 'slope'          // 법면 — 대지에는 남지만 건축 가능 범위에서 빠집니다
  | 'other_share';   // 타인 공유지분 — 지분으로 이미 차감되므로 중복 차감 금지

/** 매수 목적 5종. 토지이용계획 표시를 가릅니다 (L12). */
export type BuyerPurpose =
  | 'own_use' | 'income' | 'value_add' | 'development' | 'allocation';

export interface ExclusionKindDef {
  key: ExclusionKind;
  label: string;
  /** 🔴 **기본값일 뿐입니다.** 필지마다 다르므로 중개인이 확정합니다. */
  affects_far_default: boolean;
  note?: string;
}

export interface ParcelDerived {
  code: 'P01' | 'P02' | 'P03' | 'P04';
  key: string;
  label: string;
  formula: string;
  unit: string;
  warning?: string;
}

export interface ZoningRelevanceRow {
  item: string;
  own_use: 'high' | 'medium' | 'low';
  income: 'high' | 'medium' | 'low';
  value_add: 'high' | 'medium' | 'low';
  development: 'high' | 'medium' | 'low';
  allocation?: 'high' | 'medium' | 'low';
  why?: string;
}

export interface ParcelRegistry {
  meta: Meta;
  parcel: { fields: { key: string; type: string; source?: SourceGrade }[] };
  exclusion_kinds: ExclusionKindDef[];
  /** 🔴 제척은 API 로 나오지 않습니다. 도면 판독 → 중개인 입력 → 구청 확인. */
  acquisition: { rule: string; provenance: string; verify: string };
  derived: ParcelDerived[];
  crosschecks: {
    code: 'X05';
    label: string;
    tolerance_pct: number;
    level: Level;
    condition: string;
    rationale: string;
  }[];
  gates: GateDef[];
  layout: { code: 'L10' | 'L11' | 'L12'; condition: string; action: string }[];
  zoning_display: {
    purposes: BuyerPurpose[];
    purpose_labels: Record<BuyerPurpose, string>;
    levels: Record<'high' | 'medium' | 'low', string>;
    /** 🔴 관련도와 무관하게 전체를 부록에 싣습니다. 감추면 누락 책임입니다. */
    appendix_rule: string;
    relevance: ZoningRelevanceRow[];
  };
  temporary_relief_check: {
    rule: string;
    measured_case: Record<string, unknown>;
    on_cross: string;
  };
  discovery: {
    input: string;
    method: string;
    max_candidates: number;
    on_overflow: string;
    rule: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// im.pages
// ═══════════════════════════════════════════════════════════════════════

export interface PageDef {
  n: number;
  key: string;
  title: string;
  builder: string;
  needs?: string[];
  photo?: string[];
  min_grade: Grade;
  /** L10 — 필지가 이만큼 없으면 면을 내지 않습니다. */
  min_parcels?: number;
  needs_photos?: number;
  omit_policy?: 'skip' | 'placeholder' | 'placeholder_if_partial';
  switch?: string;
  requires_public?: boolean;
  invariant?: number | number[];
}

export interface PresetLayout {
  label: string;
  max_pages: number;
  order: string[];
  switches: Record<string, boolean>;
  cover_variant?: string;
  rationale?: string;
}

export interface PageRegistry {
  meta: Meta;
  sequence: PageDef[];
  presets: Record<string, PresetLayout>;
  rules: {
    min_pages: number;
    max_pages_absolute: number;
    tables_per_page_max: number;
  };
  by_grade: Record<Grade, { pages: number; omitted?: string[]; watermark?: string }>;
}

// ═══════════════════════════════════════════════════════════════════════
// im.gating
// ═══════════════════════════════════════════════════════════════════════

export interface FieldDef {
  key: string;
  group: string;
  label: string;
  tier: '필수' | '권장' | '선택';
  grade: SourceGrade;
  dtype: string;
  /** 이 필드가 올리는 해상도 축. */
  axis: 'L' | 'P' | null;
  /** 이 필드를 채우면 열리는 블록들 — 바텀시트 안내 문구의 근거입니다. */
  opens: string[];
  note?: string;
}

export interface BlockDef {
  key: string;
  page: string;
  label: string;
  needs: string[];
  /** 각 그룹에서 하나 이상 있으면 됩니다. */
  any_of: string[][] | null;
  locked_msg: string | null;
}

export interface GatingRegistry {
  meta: Meta & { fields: number; blocks: number };
  tiers: Record<string, string[]>;
  source_grades: Record<SourceGrade, string>;
  axes: {
    L: { label: string; levels: Record<LeaseResolution, string[]> };
    P: { label: string; levels: Record<PropertyResolution, string[]> };
  };
  grade_map: { grade: Grade; when: string; deck: string }[];
  public_auto: Record<string, string>;
  fields: FieldDef[];
  blocks: BlockDef[];
}

// ═══════════════════════════════════════════════════════════════════════
// im.masking
// ═══════════════════════════════════════════════════════════════════════

export interface MaskingRegistry {
  meta: Meta;
  stages: { key: Stage; label: string; audience: string }[];
  fields: Record<string, Record<Stage, string> & { invariant?: number; rule?: string }>;
  logs: { rule: string; example_bad: string; example_good: string };
  images: {
    status: '미구현' | '구현';
    blocking: boolean;
    targets: {
      key: string;
      label: string;
      stages: Stage[];
      action: string;
      severity: Level;
      legal?: string;
    }[];
    pipeline: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 통합 진입점
// ═══════════════════════════════════════════════════════════════════════

export interface Registry {
  lexicon: Lexicon;
  format: FormatSpec;
  masking: MaskingRegistry;
  invariants: InvariantRegistry;
  errors: ErrorRegistry;
  assumptions: AssumptionRegistry;
  image: ImageRegistry;
  pages: PageRegistry;
  parcel: ParcelRegistry;
  posture: PostureRegistry;
  ontology: OntologyRegistry;
  gating: GatingRegistry;
  tokens: TokenRegistry;
  budget: BudgetRegistry;
}

/**
 * 온톨로지 보완 요구. credeal/ssot/im.ontology.yaml.
 * 정본이 아니라 **정본에 무엇이 빠졌는가**를 담습니다.
 */
export interface OntologyRegistry {
  meta: Meta;
  upgrades: {
    id: string;
    title: string;
    severity: '차단' | '중대' | '보통';
    status: '미착수' | '진행' | '반영';
    action?: string[] | string;
  }[];
  layering: { layers: { layer: string; holds: string; test?: string }[] };
  misplaced: { what: string; now: string; should: string; why: string }[];
  targets: Record<string, number | boolean | string>;
}

export interface Invariant {
  n: number;
  text: string;
  /** 🔴 포스처 의존 여부. ONTOLOGY_V0.5_SPEC §7. */
  applies_to: InvestmentPosture[] | 'all';
  checked_by: string[];
  /** 값이 있으면 **자동 검사가 없다**는 뜻입니다. CI 가 이것을 셉니다. */
  gap?: string;
  plan?: string;
}

export interface InvariantRegistry {
  meta: Meta;
  invariants: Invariant[];
  gates: { code: string; label: string; level: Level }[];
  crosschecks: CrosscheckDef[];
  financial_assertions: { key: string; rule: string; checked_by?: string[] }[];
}

export interface TokenRegistry {
  meta: Meta;
  new_tokens: Record<string, string>;
  base: Record<string, string>;
  presets: {
    key: string;
    name: string;
    cover: string;
    layout: string;
    target: string;
    switches: Record<string, unknown>;
    tokens_override: Record<string, string>;
    wcag: { pair: string; ratio: number; need: number; ok: boolean }[];
    mono: { pair: string; gap: number; ok: boolean }[];
  }[];
  existing_presets: string[];
}

export interface BudgetRegistry {
  meta: Meta;
  deck: { required_pages: number; max_pages_default: number; max_pages_evidence: number };
  canvas: {
    w_in: number; h_in: number; margin_in: number;
    content_w_in: number; safe_right_in: number; safe_bottom_in: number;
  };
  type: Record<string, Record<string, number>>;
  truncation: { never: string[]; allowed: string[]; overflow_policy: string };
  table: { max_tables_per_page: number; note?: string };
  sentence: {
    pptx_line_max: number;
    mobile_sentence_max: number;
    mobile_oneliner_max: number;
    paragraph_max_sentences: number;
  };
}

/**
 * 레지스트리를 읽습니다. 프로세스당 한 번만 파싱합니다.
 *
 * @throws 버전이 코드가 기대하는 것과 다르면 던집니다.
 *         조용히 낡은 규칙으로 도는 것이 더 위험합니다.
 */
export declare function loadRegistry(): Registry;

/** 코드가 기대하는 레지스트리 버전. 불일치 시 부팅에 실패합니다. */
export declare const EXPECTED_VERSIONS: Record<keyof Registry, number>;
