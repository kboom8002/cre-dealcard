/**
 * @file src/lib/qa/unit-denominator-and-surface-oracle.ts
 * @description Pure, deterministic, zero-I/O oracle primitives for:
 *   1) Unit-Denominator Lock (`auditUnitDenominatorLock`) — catches dropped unit/denominator
 *      qualifiers within a ±20-character window (e.g. G-M3 `"공사비 950만원 부담"` missing `'평당'`,
 *      G-W2 `"한도 55~60%"` missing `'감정가 대비'`).
 *   2) Telegraphic Korean Particle-Drop Scanner (`auditTelegraphicJosaDrop`) — catches robotic
 *      headline/bullet particle omissions caught in R3 audits while allowing natural Korean.
 *   3) 7-Surface Cross-Parity & Non-Compensatory Floor-Cap Oracle (`evaluateSevenSurfaceParity`) —
 *      enforces Cap Rate parity (`tolerancePct <= 0.01`), Blind Boundary Invariants, Statutory
 *      5-Field Broker Footer Parity, Rule 66 Raster SVG CJK = 0, Poison/Evasive Token Zero-Tolerance,
 *      and Stateful Round-Trip Integrity under a strict non-compensatory floor cap
 *      (`FLOOR_CAP_5 = 2.85`, `FLOOR_CAP_100 = 46.25`).
 *   4) Mandatory Anti-Sycophancy Negative Controls (`NC-GOLD-01` .. `NC-GOLD-06`) +
 *      `verifyGoldenNegativeControls()`.
 */

import { scanUxWriting } from '@/lib/qa/ux-writing-and-content-oracle';
import { FLOOR_CAP_100 as RUBRIC_FLOOR_CAP_100 } from '@/lib/qa/unified-cre-rubric';

export const FLOOR_CAP_5 = 2.85 as const;
export const FLOOR_CAP_100 = RUBRIC_FLOOR_CAP_100; // 46.25

const squash = (s: string): string => s.replace(/\s+/g, '');

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlMinimal(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtmlToVisibleText(html: string): string {
  return decodeHtmlMinimal(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|li|h[1-6]|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .trim();
}

// ── 1) Unit-Denominator Lock Oracle ─────────────────────────────────────────

export interface UnitDenominatorFact {
  numericToken: string;
  requiredQualifiers: readonly string[];
  label: string;
}

export interface UnitDenominatorViolation {
  label: string;
  numericToken: string;
  missingQualifiers: readonly string[];
  windowExcerpt: string;
  index: number;
}

export interface UnitDenominatorAuditResult {
  passed: boolean;
  checkedOccurrences: number;
  violationCount: number;
  violations: UnitDenominatorViolation[];
}

const UNIT_DENOMINATOR_WINDOW_CHARS = 20;

/**
 * Whenever `text` cites `numericToken`, inspects a `±20`-character window around each
 * occurrence and verifies at least one of `requiredQualifiers` is preserved.
 */
export function auditUnitDenominatorLock(
  text: string,
  referenceFacts: ReadonlyArray<UnitDenominatorFact>,
): UnitDenominatorAuditResult {
  const violations: UnitDenominatorViolation[] = [];
  if (!text || !referenceFacts || referenceFacts.length === 0) {
    return {
      passed: true,
      checkedOccurrences: 0,
      violationCount: 0,
      violations,
    };
  }

  let checkedOccurrences = 0;

  for (const fact of referenceFacts) {
    const token = (fact.numericToken || '').trim();
    if (!token || !fact.requiredQualifiers || fact.requiredQualifiers.length === 0) {
      continue;
    }

    const startsWithDigit = /^[0-9]/.test(token);
    const endsWithDigit = /[0-9]$/.test(token);
    const pattern = `${startsWithDigit ? '(?<![0-9.,])' : ''}${escapeRegExp(token)}${endsWithDigit ? '(?![0-9])' : ''}`;
    const re = new RegExp(pattern, 'gu');

    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      checkedOccurrences++;

      const winStart = Math.max(0, start - UNIT_DENOMINATOR_WINDOW_CHARS);
      const winEnd = Math.min(text.length, end + UNIT_DENOMINATOR_WINDOW_CHARS);
      const windowExcerpt = text.slice(winStart, winEnd);
      const squashedWindow = squash(windowExcerpt).toLowerCase();

      const hasQualifier = fact.requiredQualifiers.some((q) => {
        const cleanQ = (q || '').trim();
        if (!cleanQ) return false;
        return (
          windowExcerpt.includes(cleanQ) ||
          squashedWindow.includes(squash(cleanQ).toLowerCase())
        );
      });

      if (!hasQualifier) {
        violations.push({
          label: fact.label,
          numericToken: token,
          missingQualifiers: [...fact.requiredQualifiers],
          windowExcerpt: windowExcerpt.replace(/\s+/g, ' ').trim(),
          index: start,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    checkedOccurrences,
    violationCount: violations.length,
    violations,
  };
}

// ── 2) Telegraphic Korean Particle-Drop Scanner ─────────────────────────────

export interface TelegraphicJosaViolation {
  ruleId: string;
  match: string;
  suggestion: string;
  index: number;
}

export interface TelegraphicJosaAuditResult {
  passed: boolean;
  violationCount: number;
  violations: TelegraphicJosaViolation[];
}

const TELEGRAPHIC_JOSA_DROP_RULES: ReadonlyArray<{
  ruleId: string;
  re: RegExp;
  suggestion: string;
}> = [
  {
    ruleId: 'object_particle_drop_before_wihan',
    re: /(?:선점|확보|해소|방어|절감|검토|극대화|최적화|창출|개선)\s+위한/gu,
    suggestion: '목적격 조사(을/를)를 복원해 자연스러운 문장으로 표기 (예: "선점을 위한", "확보를 위한")',
  },
  {
    ruleId: 'subject_particle_drop_before_confirmed',
    re: /(?:방어력|수익성|안정성|가시성|접근성|환금성)\s+확인된/gu,
    suggestion: '주격 조사(이/가)를 복원해 자연스러운 수식절로 표기 (예: "방어력이 확인된")',
  },
  {
    ruleId: 'telegraphic_noun_stack_tax',
    re: /감정평가\s+세금\s+점검/gu,
    suggestion: '전보체 명사 나열 지양 — 자연스러운 구문(예: "감정평가 세액 점검" 또는 "감정평가를 통한 세금 점검")으로 표기',
  },
];

/**
 * Detects robotic Korean telegraphic particle omissions caught in R3 audits
 * while allowing natural Korean with particles intact.
 */
export function auditTelegraphicJosaDrop(text: string): TelegraphicJosaAuditResult {
  const violations: TelegraphicJosaViolation[] = [];
  if (!text || !text.trim()) {
    return {
      passed: true,
      violationCount: 0,
      violations,
    };
  }

  for (const rule of TELEGRAPHIC_JOSA_DROP_RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    for (const m of text.matchAll(re)) {
      violations.push({
        ruleId: rule.ruleId,
        match: m[0].replace(/\s+/g, ' ').trim(),
        suggestion: rule.suggestion,
        index: m.index ?? 0,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violationCount: violations.length,
    violations,
  };
}

// ── 3) 7-Surface Cross-Parity & Non-Compensatory Floor-Cap Oracle ───────────

export type SevenSurfaceKey =
  | 'dealcardPublicText'
  | 'mobileImViewerText'
  | 'basicPptxText'
  | 'proPptxText'
  | 'studioSlideText'
  | 'newsletterEmailHtml'
  | 'kakaoAndOgText';

export interface StatefulRoundTripCheckInput {
  expectedKakaoBrief?: string;
  actualOutboundText?: string;
  expectedToneStance?: 'positive' | 'neutral' | 'negative';
  actualToneStance?: string;
  expectedPointCandidateCount?: number;
  actualPointCandidates?: ReadonlyArray<{ text: string; axis?: string }>;
}

export interface SevenSurfaceBundle {
  /** 1) `/dc/[id]` public blind DealCard text */
  dealcardPublicText: string;
  /** 2) `/im-lite/[buildingId]` mobile IM viewer text */
  mobileImViewerText: string;
  /** 3) Basic PPTX (`A01..A10`) extracted slide text */
  basicPptxText: string;
  /** 4) Pro PPTX (`pro-chapter-binder`) extracted/bound text */
  proPptxText: string;
  /** 5) Basic IM Studio slide defaults/overrides serialized text */
  studioSlideText: string;
  /** 6) Newsletter outbound email HTML (`renderMagazineEmail` output) */
  newsletterEmailHtml: string;
  /** 7) Kakao Alimtalk / Inbox copy / OG model text */
  kakaoAndOgText: string;
  /** Optional Sharp SVG strings (`rasterSvg`) checked for Rule 66 zero-Hangul invariant */
  rasterSvgs?: readonly string[];
  /** Optional stateful lifecycle round-trip assertions */
  statefulChecks?: StatefulRoundTripCheckInput;
}

export interface StatutoryBrokerTruth {
  company: string;
  representativeName: string;
  officeRegNumber: string;
  officeAddress: string;
  phone: string;
}

export interface SevenSurfaceTruth {
  /** Expected baseline Cap Rate (%). Omit or set null for non-income postures without Cap Rate. */
  expectedCapRatePct?: number | null;
  /** Maximum allowed Cap Rate divergence in %p (clamped to <= 0.01). */
  capRateTolerancePct?: number;
  /** Exact tokens that MUST NEVER leak onto public blind surfaces. */
  forbiddenBlindTokens?: readonly string[];
  /** Legal numbered dong/ro names that ARE valid on blind surfaces (e.g. '양평동4가', '을지로3가'). */
  allowedLegalDongTokens?: readonly string[];
  /** Statutory 5-field broker footer truth verified across statutory surfaces. */
  statutoryBroker?: StatutoryBrokerTruth;
  /** Unit-denominator lock facts verified across all surfaces. */
  unitDenominatorFacts?: ReadonlyArray<UnitDenominatorFact>;
  /** Optional stateful round-trip truth (merged with `bundle.statefulChecks`). */
  statefulRoundTrip?: StatefulRoundTripCheckInput;
}

export type ParityViolationCategory =
  | 'cap_rate_parity'
  | 'blind_boundary'
  | 'statutory_footer'
  | 'rule66_svg_cjk'
  | 'unit_denominator'
  | 'telegraphic_josa'
  | 'poison_or_evasive'
  | 'stateful_roundtrip';

export interface SevenSurfaceViolation {
  category: ParityViolationCategory;
  surface: SevenSurfaceKey | 'rasterSvgs' | 'statefulChecks' | 'crossSurface';
  code: string;
  detail: string;
}

export interface SevenSurfaceParityResult {
  passed: boolean;
  floorRisk: boolean;
  floorReasons: string[];
  rawScore5: number;
  rawScore100: number;
  effectiveScore5: number;
  effectiveScore100: number;
  extractedCapRates: Partial<Record<SevenSurfaceKey, number>>;
  capRateMaxSpreadPct: number;
  violations: SevenSurfaceViolation[];
}

const ASSET_CAP_RATE_SURFACES: readonly SevenSurfaceKey[] = [
  'dealcardPublicText',
  'mobileImViewerText',
  'basicPptxText',
  'proPptxText',
  'studioSlideText',
];

const PUBLIC_BLIND_SURFACES: readonly SevenSurfaceKey[] = [
  'dealcardPublicText',
  'newsletterEmailHtml',
  'kakaoAndOgText',
];

const STATUTORY_FOOTER_SURFACES: readonly SevenSurfaceKey[] = [
  'dealcardPublicText',
  'mobileImViewerText',
  'newsletterEmailHtml',
  'basicPptxText',
];

const ALL_SEVEN_SURFACES: readonly SevenSurfaceKey[] = [
  'dealcardPublicText',
  'mobileImViewerText',
  'basicPptxText',
  'proPptxText',
  'studioSlideText',
  'newsletterEmailHtml',
  'kakaoAndOgText',
];

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/u;
const HANGUL_SPAN_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]+(?:\s+[가-힣ㄱ-ㅎㅏ-ㅣ0-9()·/-]+)*/gu;

const EVASIVE_OR_POISON_PATTERNS: ReadonlyArray<{ code: string; re: RegExp }> = [
  { code: 'poison_nan_pct', re: /(?:^|[^A-Za-z])NaN\s*%/gu },
  { code: 'poison_object_to_string', re: /\[object\s+Object\]/gu },
  { code: 'poison_undefined_unit', re: /(?:^|[\s(>:])(?:undefined|null|Infinity)\s*(?:%|억|만|원|평|㎡)/gu },
  { code: 'evasive_site_inspection_copout', re: /현장\s*실사\s*확인\s*사항입니다/gu },
  { code: 'evasive_tbd_placeholder', re: /추후\s*제공\s*예정|입력된\s*정보가\s*없습니다/gu },
];

const GENERIC_SAFE_ROAD_NAMES = new Set([
  '도로',
  '차로',
  '통로',
  '경로',
  '진로',
  '선로',
  '수로',
  '교차로',
  '고속도로',
  '보행로',
  '진입로',
  '출입로',
  '대로',
]);

const BLIND_ROAD_NUMBER_RE =
  /([가-힣]{2,10}(?:(?:대로|로|길)(?:\s*\d{1,4}(?:번)?길)?|\s*\d{1,4}(?:번)?길))\s+(\d{1,5}(?:-\d{1,5})?)(?![0-9-]|\s*(?:가|(?:번)?길|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|차선|차로|인|개|호|실)(?![가-힣]))/gu;

const BLIND_DONG_LOT_RE =
  /([가-힣]{1,10}(?:동|읍|면|리)(?:\s*\d+가)?|[가-힣]{1,10}\s*\d+가)\s+(?:산\s*)?(\d{1,5}(?:-\d{1,5})?(?:\s*번지)?)(?![0-9-]|\s*(?:가|층|F|호선|분|초|평|㎡|m|km|억|만|원|%|대|년|개월|일|호|실|번\s*출구|출구|차선|차로|인|개|곳|건)(?![가-힣]))/gu;

const BLIND_MOUNTAIN_LOT_RE = /(?<![가-힣])산\s*\d{1,5}(?:-\d{1,5})?(?:\s*번지)?(?![0-9])/gu;

const BLIND_EXPLICIT_JIBUN_RE = /(?<![0-9-])\d{1,5}-\d{1,5}\s*번지/gu;

const BLIND_PHONE_LEAK_RE = /(?:\+?82[-\s.]?0?|0)1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\b/gu;

/**
 * Extracts the baseline Cap Rate (%) from an asset surface text, ignoring stabilized/target/exit
 * Cap Rates and unrelated ratios (BCR, FAR, vacancy, etc.).
 */
export function extractBaselineCapRateFromText(rawText: string): {
  baselinePct: number | null;
  explodedRates: number[];
} {
  if (!rawText || !rawText.trim()) {
    return { baselinePct: null, explodedRates: [] };
  }

  const explodedRates: number[] = [];
  const explosionRe =
    /(?:Cap\s*Rate|자본환원율|임대수익률|운영수익률|capRateBase|capRatePct)[^\d%\n]{0,28}?(\d{2,6}(?:\.\d+)?)\s*%/giu;
  for (const m of rawText.matchAll(explosionRe)) {
    const val = Number(m[1]);
    if (Number.isFinite(val) && val >= 50) {
      explodedRates.push(val);
    }
  }

  const patterns: RegExp[] = [
    // Explicit baseline Cap Rate / 자본환원율 labels (excluding 안정화 / Stabilized / 목표 / Exit)
    /(?<!안정화\s*|Stabilized\s*|목표\s*|Target\s*|Exit\s*|매각\s*)(?:초기\s*Cap\s*Rate|현황\s*Cap\s*Rate|기준\s*Cap\s*Rate|자본환원율\s*\(\s*Cap\s*Rate\s*\)|연\s*임대수익률\s*\(\s*Cap\s*Rate\s*\)|Cap\s*Rate(?:\s*\(\s*NOI[^)]*\))?|자본환원율)(?:\s*\n\s*|\s*[:：=|]\s*|\s+)(?:약\s*)?(\d+(?:\.\d+)?)\s*%/iu,
    // Studio / Pro JSON serialized keys
    /"(?:capRateBase|capRatePct|cap_rate_percent|cap_rate_base)"\s*:\s*"?(\d+(?:\.\d+)?)\s*%?"?/iu,
    // Basic PPTX A23 / A02 primary yield label fallback when NOI Cap Rate is unified with V04 yield
    /(?<!안정화\s*)(?:현행\s*임대수익률(?:\s*\([^)]*\))?|임대수익률\s*\(보증금\s*차감\))(?:\s*\n\s*|\s*[:：=|]\s*|\s+)(\d+(?:\.\d+)?)\s*%/iu,
  ];

  for (const re of patterns) {
    const m = rawText.match(re);
    if (m && m[1] !== undefined) {
      const parsed = Number(m[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return { baselinePct: parsed, explodedRates };
      }
    }
  }

  return { baselinePct: null, explodedRates };
}

function scrubKnownStatutoryAndUrls(
  visibleText: string,
  broker?: StatutoryBrokerTruth,
): string {
  let out = visibleText.replace(/https?:\/\/\S+/gi, ' ');
  if (broker) {
    for (const val of [
      broker.officeAddress,
      broker.phone,
      broker.officeRegNumber,
      broker.company,
      broker.representativeName,
    ]) {
      const clean = (val || '').trim();
      if (clean) {
        out = out.split(clean).join(' ');
      }
    }
  }
  return out;
}

function detectBlindSurfacePatternLeaks(
  visibleText: string,
  broker?: StatutoryBrokerTruth,
): string[] {
  const scrubbed = scrubKnownStatutoryAndUrls(visibleText, broker);
  const hits: string[] = [];

  for (const m of scrubbed.matchAll(BLIND_ROAD_NUMBER_RE)) {
    const roadName = m[1].trim();
    const baseRoad = roadName.replace(/\s*\d{1,4}(?:번)?길$/u, '').trim();
    if (!GENERIC_SAFE_ROAD_NAMES.has(roadName) && !GENERIC_SAFE_ROAD_NAMES.has(baseRoad)) {
      hits.push(`road_number_leak("${m[0].trim()}")`);
    }
  }

  for (const m of scrubbed.matchAll(BLIND_DONG_LOT_RE)) {
    hits.push(`dong_lot_leak("${m[0].trim()}")`);
  }

  for (const m of scrubbed.matchAll(BLIND_MOUNTAIN_LOT_RE)) {
    hits.push(`mountain_lot_leak("${m[0].trim()}")`);
  }

  for (const m of scrubbed.matchAll(BLIND_EXPLICIT_JIBUN_RE)) {
    hits.push(`explicit_jibun_leak("${m[0].trim()}")`);
  }

  for (const m of scrubbed.matchAll(BLIND_PHONE_LEAK_RE)) {
    hits.push(`owner_phone_leak("${m[0].trim()}")`);
  }

  return hits;
}

/**
 * Evaluates all 7 surfaces against ground-truth financial, blind-guard, statutory,
 * Rule 66 SVG-CJK, UX-writing, and stateful round-trip invariants.
 */
export function evaluateSevenSurfaceParity(
  bundle: SevenSurfaceBundle,
  truth: SevenSurfaceTruth,
): SevenSurfaceParityResult {
  const violations: SevenSurfaceViolation[] = [];
  const tolerancePct = Math.min(0.01, Math.max(0, truth.capRateTolerancePct ?? 0.01));

  // ── A. Cap Rate / Yield Parity & ×100 Unit Explosion Check ──
  const extractedCapRates: Partial<Record<SevenSurfaceKey, number>> = {};
  for (const surface of ASSET_CAP_RATE_SURFACES) {
    const raw = bundle[surface] || '';
    const { baselinePct, explodedRates } = extractBaselineCapRateFromText(raw);
    if (baselinePct !== null) {
      extractedCapRates[surface] = baselinePct;
    }
    for (const exploded of explodedRates) {
      violations.push({
        category: 'cap_rate_parity',
        surface,
        code: 'cap_rate_x100_explosion',
        detail: `${surface}에서 비정상 ×100 수익률 폭주(${exploded.toFixed(2)}%) 탐지`,
      });
    }
  }

  const rateEntries = Object.entries(extractedCapRates) as Array<[SevenSurfaceKey, number]>;
  let capRateMaxSpreadPct = 0;
  if (rateEntries.length >= 2) {
    const vals = rateEntries.map(([, v]) => v);
    capRateMaxSpreadPct = round2(Math.max(...vals) - Math.min(...vals));
    if (Math.max(...vals) - Math.min(...vals) > tolerancePct + 1e-9) {
      const summary = rateEntries.map(([k, v]) => `${k}=${v.toFixed(2)}%`).join(', ');
      violations.push({
        category: 'cap_rate_parity',
        surface: 'crossSurface',
        code: 'cap_rate_cross_surface_divergence',
        detail: `표면 간 Cap Rate 편차 ${capRateMaxSpreadPct.toFixed(2)}%p > 허용치 ${tolerancePct.toFixed(2)}%p (${summary})`,
      });
    }
  }

  if (truth.expectedCapRatePct != null) {
    if (rateEntries.length === 0) {
      violations.push({
        category: 'cap_rate_parity',
        surface: 'crossSurface',
        code: 'cap_rate_missing_across_surfaces',
        detail: `기대 Cap Rate(${truth.expectedCapRatePct.toFixed(2)}%)가 5대 자산 표면 어디에서도 추출되지 않음`,
      });
    }
    for (const [surface, val] of rateEntries) {
      const diff = Math.abs(val - truth.expectedCapRatePct);
      if (diff > tolerancePct + 1e-9) {
        violations.push({
          category: 'cap_rate_parity',
          surface,
          code: 'cap_rate_truth_divergence',
          detail: `${surface} Cap Rate(${val.toFixed(2)}%)가 기준치(${truth.expectedCapRatePct.toFixed(2)}%)와 ${diff.toFixed(2)}%p 불일치`,
        });
      }
    }
  }

  // ── B. Blind Boundary Invariant (Public Surfaces Only) ──
  const forbiddenTokens = (truth.forbiddenBlindTokens ?? [])
    .map((t) => t.trim())
    .filter(Boolean);

  for (const surface of PUBLIC_BLIND_SURFACES) {
    const raw = bundle[surface] || '';
    const visible =
      surface === 'newsletterEmailHtml' ? stripHtmlToVisibleText(raw) : decodeHtmlMinimal(raw);

    for (const forbidden of forbiddenTokens) {
      if (raw.includes(forbidden) || visible.includes(forbidden)) {
        violations.push({
          category: 'blind_boundary',
          surface,
          code: 'blind_forbidden_token_leak',
          detail: `${surface} 공개 블라인드 표면에 금지 식별자/정확 매매가("${forbidden}") 노출`,
        });
      }
    }

    const patternLeaks = detectBlindSurfacePatternLeaks(visible, truth.statutoryBroker);
    for (const leak of patternLeaks) {
      violations.push({
        category: 'blind_boundary',
        surface,
        code: 'blind_address_or_pii_pattern_leak',
        detail: `${surface} 공개 블라인드 표면에 상세 지번/도로명 번호/연락처 유출: ${leak}`,
      });
    }
  }

  // ── C. Statutory 5-Field Broker Footer Parity ──
  if (truth.statutoryBroker) {
    const requiredFields: ReadonlyArray<[keyof StatutoryBrokerTruth, string]> = [
      ['company', truth.statutoryBroker.company],
      ['representativeName', truth.statutoryBroker.representativeName],
      ['officeRegNumber', truth.statutoryBroker.officeRegNumber],
      ['officeAddress', truth.statutoryBroker.officeAddress],
      ['phone', truth.statutoryBroker.phone],
    ];

    for (const surface of STATUTORY_FOOTER_SURFACES) {
      const raw = decodeHtmlMinimal(bundle[surface] || '');
      const squashedSurface = squash(raw);
      for (const [fieldKey, fieldValue] of requiredFields) {
        const cleanVal = (fieldValue || '').trim();
        if (!cleanVal) continue;
        if (!squashedSurface.includes(squash(cleanVal))) {
          violations.push({
            category: 'statutory_footer',
            surface,
            code: `missing_statutory_${fieldKey}`,
            detail: `${surface}에 공인중개사법 5대 법정 표기 누락: ${fieldKey}("${cleanVal}")`,
          });
        }
      }
    }
  }

  // ── D. Rule 66 Raster SVG CJK = 0 ──
  if (bundle.rasterSvgs && bundle.rasterSvgs.length > 0) {
    bundle.rasterSvgs.forEach((svg, idx) => {
      if (HANGUL_RE.test(svg)) {
        const snippets = Array.from(svg.matchAll(HANGUL_SPAN_RE))
          .slice(0, 4)
          .map((m) => m[0].trim());
        violations.push({
          category: 'rule66_svg_cjk',
          surface: 'rasterSvgs',
          code: 'rule66_raster_svg_hangul_tofu_risk',
          detail: `rasterSvgs[${idx}] 내부 한글 포함(Rule 66 위반 — Sharp 두부 깨짐 위험): ${snippets.join(', ')}`,
        });
      }
    });
  }

  // ── E. Unit-Denominator Lock, Telegraphic Josa Drop & Poison/Evasive Scan ──
  for (const surface of ALL_SEVEN_SURFACES) {
    const raw = bundle[surface] || '';
    const visible =
      surface === 'newsletterEmailHtml' ? stripHtmlToVisibleText(raw) : decodeHtmlMinimal(raw);

    if (truth.unitDenominatorFacts && truth.unitDenominatorFacts.length > 0) {
      const unitAudit = auditUnitDenominatorLock(visible, truth.unitDenominatorFacts);
      for (const v of unitAudit.violations) {
        violations.push({
          category: 'unit_denominator',
          surface,
          code: 'unit_denominator_dropped',
          detail: `${surface} 단위·분모 누락 [${v.label}]: "${v.numericToken}" 주변 ±20자("${v.windowExcerpt}")에 [${v.missingQualifiers.join(', ')}] 미표기`,
        });
      }
    }

    const telegraphicAudit = auditTelegraphicJosaDrop(visible);
    for (const tv of telegraphicAudit.violations) {
      violations.push({
        category: 'telegraphic_josa',
        surface,
        code: tv.ruleId,
        detail: `${surface} 전보체 조사 탈락("${tv.match}") — ${tv.suggestion}`,
      });
    }

    for (const pat of EVASIVE_OR_POISON_PATTERNS) {
      const re = new RegExp(pat.re.source, pat.re.flags);
      for (const m of visible.matchAll(re)) {
        violations.push({
          category: 'poison_or_evasive',
          surface,
          code: pat.code,
          detail: `${surface} 금지 Poison/회피 토큰 탐지: "${m[0].trim()}"`,
        });
      }
    }

    const uxScan = scanUxWriting(visible, { skipBannedTerms: true });
    for (const pv of uxScan.violations.filter((x) => x.kind === 'poison_or_raw_error')) {
      const alreadyRecorded = violations.some(
        (existing) =>
          existing.category === 'poison_or_evasive' &&
          existing.surface === surface &&
          existing.detail.includes(pv.match),
      );
      if (!alreadyRecorded) {
        violations.push({
          category: 'poison_or_evasive',
          surface,
          code: 'ux_poison_or_raw_error',
          detail: `${surface} 원시 오류/Poison 토큰 탐지: "${pv.match}"`,
        });
      }
    }
  }

  // ── F. Stateful Round-Trip Integrity Check ──
  const st =
    bundle.statefulChecks || truth.statefulRoundTrip
      ? { ...bundle.statefulChecks, ...truth.statefulRoundTrip }
      : undefined;
  if (st) {
    if (st.expectedKakaoBrief) {
      const outbound = st.actualOutboundText ?? bundle.kakaoAndOgText ?? '';
      if (!outbound.includes(st.expectedKakaoBrief)) {
        violations.push({
          category: 'stateful_roundtrip',
          surface: 'statefulChecks',
          code: 'stateful_kakao_brief_dropped',
          detail: `소통함 AI 답장(kakaoBrief) 유실: 발송 본문에 "${st.expectedKakaoBrief.slice(0, 40)}" 미포함`,
        });
      }
    }
    if (st.expectedToneStance && st.actualToneStance !== st.expectedToneStance) {
      violations.push({
        category: 'stateful_roundtrip',
        surface: 'statefulChecks',
        code: 'stateful_tone_stance_reset',
        detail: `뉴스레터 toneStance 상태 초기화 결함: 기대 "${st.expectedToneStance}" !== 실제 "${st.actualToneStance ?? 'undefined'}"`,
      });
    }
    if (
      typeof st.expectedPointCandidateCount === 'number' &&
      (st.actualPointCandidates?.length ?? 0) < st.expectedPointCandidateCount
    ) {
      violations.push({
        category: 'stateful_roundtrip',
        surface: 'statefulChecks',
        code: 'stateful_point_candidates_wiped',
        detail: `딜카드 pointCandidates 유실: 기대 ${st.expectedPointCandidateCount}건 > 실제 ${st.actualPointCandidates?.length ?? 0}건`,
      });
    }
  }

  // ── G. Non-Compensatory Floor Cap Calculation ──
  const floorReasons = Array.from(new Set(violations.map((v) => `${v.surface}:${v.code}`)));
  const floorRisk = violations.length > 0;

  const penalty5 = Math.min(4.0, violations.length * 0.65);
  const rawScore5 = round2(Math.max(1.0, 5.0 - penalty5));
  const rawScore100 = round2(25 * (rawScore5 - 1.0));

  const effectiveScore5 = floorRisk ? round2(Math.min(rawScore5, FLOOR_CAP_5)) : rawScore5;
  const effectiveScore100 = floorRisk
    ? round2(Math.min(rawScore100, FLOOR_CAP_100))
    : rawScore100;

  return {
    passed: !floorRisk,
    floorRisk,
    floorReasons,
    rawScore5,
    rawScore100,
    effectiveScore5,
    effectiveScore100,
    extractedCapRates,
    capRateMaxSpreadPct,
    violations,
  };
}

// ── 4) Mandatory Anti-Sycophancy Negative Controls (NC-GOLD-01 .. NC-GOLD-06) ──

export interface GoldenNegativeControlCase {
  id: 'NC-GOLD-01' | 'NC-GOLD-02' | 'NC-GOLD-03' | 'NC-GOLD-04' | 'NC-GOLD-05' | 'NC-GOLD-06';
  title: string;
  expectedCategories: readonly ParityViolationCategory[];
  bundle: SevenSurfaceBundle;
  truth: SevenSurfaceTruth;
}

export interface GoldenNegativeControlReportItem {
  id: GoldenNegativeControlCase['id'];
  title: string;
  caughtLoudly: boolean;
  result: SevenSurfaceParityResult;
}

export interface GoldenNegativeControlVerificationSummary {
  baselineCleanPassed: boolean;
  allCaughtLoudly: boolean;
  totalControls: number;
  caughtCount: number;
  items: GoldenNegativeControlReportItem[];
}

const BASELINE_STATUTORY_BROKER: StatutoryBrokerTruth = {
  company: '한성빌딩부동산중개법인',
  representativeName: '박준영',
  officeRegNumber: '11680-2025-04719',
  officeAddress: '서울특별시 강남구 테헤란로 318',
  phone: '010-3482-9104',
};

const BASELINE_FOOTER_TEXT =
  '상호: 한성빌딩부동산중개법인 · 대표자: 박준영 · 등록번호: 11680-2025-04719 · 소재지: 서울특별시 강남구 테헤란로 318 · 연락처: 010-3482-9104';

export const CLEAN_GOLDEN_BASELINE_TRUTH: SevenSurfaceTruth = {
  expectedCapRatePct: 3.42,
  capRateTolerancePct: 0.01,
  forbiddenBlindTokens: ['145억', '189-6', '연무장7길 11', '산 12-3', '010-9111-2233'],
  allowedLegalDongTokens: ['양평동4가', '을지로3가'],
  statutoryBroker: BASELINE_STATUTORY_BROKER,
  unitDenominatorFacts: [
    {
      numericToken: '950만원',
      requiredQualifiers: ['평당', '3.3㎡당', '㎡당'],
      label: 'G-M3 신축 공사비 단가 분모',
    },
    {
      numericToken: '55~60%',
      requiredQualifiers: ['감정가', 'LTV', '담보인정'],
      label: 'G-W2 담보대출 한도 분모',
    },
  ],
  statefulRoundTrip: {
    expectedKakaoBrief: '당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
    expectedToneStance: 'negative',
    expectedPointCandidateCount: 6,
  },
};

export const CLEAN_GOLDEN_BASELINE_BUNDLE: SevenSurfaceBundle = {
  dealcardPublicText: [
    '성동구 성수동2가 · 양평동4가 · 을지로3가 권역 코너 근린생활시설',
    '매매 희망 구간: 140~150억 · 연면적 390평 · 자본환원율(Cap Rate) 3.42%',
    '우량 매물 선점을 위한 핵심 입지 · 평당 공사비 950만원 수준 · 감정가 대비 한도 55~60% 검토 가능',
    BASELINE_FOOTER_TEXT,
  ].join('\n'),
  mobileImViewerText: [
    '성동구 연무장7길 일대 우량 근생빌딩 IM',
    '초기 Cap Rate: 3.42% · 공실 방어력이 확인된 메디컬·리테일 임차 구성',
    '평당 신축 공사비 950만원 가정 · 감정가 대비 대출 한도 55~60% 수준',
    BASELINE_FOOTER_TEXT,
  ].join('\n'),
  basicPptxText: [
    '01 표지: 성수동 근생빌딩 (140~150억)',
    '07 수익률 분석: 초기 Cap Rate 3.42% / 현행 임대수익률 (보증금 차감) 3.42%',
    '10 문의 및 유의사항: ' + BASELINE_FOOTER_TEXT,
  ].join('\n'),
  proPptxText: [
    'Chapter 2 Financial Model — 초기 Cap Rate: 3.42%',
    '감정평가 세액 점검 및 LTV(담보인정) 55~60% 조달 시나리오',
  ].join('\n'),
  studioSlideText: JSON.stringify({
    highlights: { capRateBase: '3.42%' },
    yield: { capRateBase: '3.42%' },
  }),
  newsletterEmailHtml: [
    '<!DOCTYPE html><html lang="ko"><body>',
    '<h1>(광고) [박준영] 성수·양평동4가·을지로3가 상업용 빌딩 리포트</h1>',
    '<p>추천 매물: 성동구 연무장7길 일대 올근생 빌딩 · 희망 구간 140~150억</p>',
    `<p>${BASELINE_FOOTER_TEXT}</p>`,
    '</body></html>',
  ].join(''),
  kakaoAndOgText: [
    '(광고) 박준영 중개인 브리핑',
    '성동구 연무장7길 인근 · 양평동4가 · 을지로3가 추천 매물 (140~150억)',
    '당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
  ].join('\n'),
  rasterSvgs: [
    '<svg width="1600" height="1200" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1E222D"/><circle cx="400" cy="300" r="95" stroke="#E8DEC8" fill="none"/></svg>',
  ],
  statefulChecks: {
    expectedKakaoBrief: '당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
    actualOutboundText:
      '고객님 안녕하세요. 당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
    expectedToneStance: 'negative',
    actualToneStance: 'negative',
    expectedPointCandidateCount: 6,
    actualPointCandidates: [
      { text: '역세권 도보 5분 접근성', axis: 'location' },
      { text: '우량 병의원 장기 임차', axis: 'tenant' },
      { text: '자본환원율 3.42% 현금흐름', axis: 'yield' },
      { text: '코너 가시성 확보 외관', axis: 'scarcity' },
      { text: '승강기·외벽 최근 정비', axis: 'building' },
      { text: '인근 개발 호재 수혜 권역', axis: 'value' },
    ],
  },
};

export const MANDATORY_GOLDEN_NEGATIVE_CONTROLS: readonly GoldenNegativeControlCase[] = [
  {
    id: 'NC-GOLD-01',
    title: 'Pro PPTX 342.00% (×100 Cap Rate unit explosion) vs Mobile IM 3.42%',
    expectedCategories: ['cap_rate_parity'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      proPptxText: 'Chapter 2 Financial Model — 초기 Cap Rate: 342.00% (NOI / Asking)',
    },
    truth: CLEAN_GOLDEN_BASELINE_TRUTH,
  },
  {
    id: 'NC-GOLD-02',
    title: '연무장7길 11 road-number blind leak + Newsletter Email exact priceWon (145억) leak',
    expectedCategories: ['blind_boundary'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      dealcardPublicText: [
        '서울 성동구 연무장7길 11 코너 근린생활시설 (140~150억)',
        '자본환원율(Cap Rate) 3.42%',
        BASELINE_FOOTER_TEXT,
      ].join('\n'),
      newsletterEmailHtml: [
        '<!DOCTYPE html><html lang="ko"><body>',
        '<h1>(광고) 성수동 추천 빌딩 안내</h1>',
        '<p>서울 성동구 연무장7길 일대 · 급매가 145억 확정 브리핑</p>',
        `<p>${BASELINE_FOOTER_TEXT}</p>`,
        '</body></html>',
      ].join(''),
    },
    truth: CLEAN_GOLDEN_BASELINE_TRUTH,
  },
  {
    id: 'NC-GOLD-03',
    title: '"공사비 950만원 부담" (평당 denominator dropped) + "우량 매물 선점 위한" telegraphic josa drop',
    expectedCategories: ['unit_denominator', 'telegraphic_josa'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      mobileImViewerText: [
        '성동구 연무장7길 일대 근생빌딩 IM · 초기 Cap Rate: 3.42%',
        '신축 시 총 공사비 950만원 부담 예상 및 우량 매물 선점 위한 발 빠른 의사결정 필요',
        BASELINE_FOOTER_TEXT,
      ].join('\n'),
    },
    truth: CLEAN_GOLDEN_BASELINE_TRUTH,
  },
  {
    id: 'NC-GOLD-04',
    title: 'Stateful round-trip drop (kakaoBrief missing, toneStance reset negative->positive, pointCandidates wiped to [])',
    expectedCategories: ['stateful_roundtrip'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      kakaoAndOgText: '(광고) 박준영 중개인 매물 링크 안내드립니다.',
      statefulChecks: {
        expectedKakaoBrief: '당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
        actualOutboundText: '고객님, 자료 링크만 전달드립니다.',
        expectedToneStance: 'negative',
        actualToneStance: 'positive',
        expectedPointCandidateCount: 6,
        actualPointCandidates: [],
      },
    },
    truth: {
      ...CLEAN_GOLDEN_BASELINE_TRUTH,
      statefulRoundTrip: {
        expectedKakaoBrief: '당산역 도보 5분 코너 근생빌딩으로 우량 병의원 임차가 안정적입니다.',
        actualOutboundText: '고객님, 자료 링크만 전달드립니다.',
        expectedToneStance: 'negative',
        actualToneStance: 'positive',
        expectedPointCandidateCount: 6,
        actualPointCandidates: [],
      },
    },
  },
  {
    id: 'NC-GOLD-05',
    title: 'Hangul <text>여의도역</text> inside Sharp rasterSvg (Rule 66 tofu defect)',
    expectedCategories: ['rule66_svg_cjk'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      rasterSvgs: [
        '<svg width="1600" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#1E222D"/><text x="400" y="300" fill="#FFFFFF">여의도역</text></svg>',
      ],
    },
    truth: CLEAN_GOLDEN_BASELINE_TRUTH,
  },
  {
    id: 'NC-GOLD-06',
    title: 'Poison token (NaN%, [object Object]) + evasive phrase (현장 실사 확인 사항입니다)',
    expectedCategories: ['poison_or_evasive'],
    bundle: {
      ...CLEAN_GOLDEN_BASELINE_BUNDLE,
      basicPptxText: [
        '01 표지: 성수동 근생빌딩 [object Object]',
        '07 수익률 분석: 초기 Cap Rate 3.42% / 레버리지 수익률 NaN%',
        '08 리스크 분석: 임대차 세부 내역은 현장 실사 확인 사항입니다.',
        '10 문의 및 유의사항: ' + BASELINE_FOOTER_TEXT,
      ].join('\n'),
    },
    truth: CLEAN_GOLDEN_BASELINE_TRUTH,
  },
] as const;

/**
 * Runs the clean counterfactual baseline AND all 6 mandatory negative controls
 * (`NC-GOLD-01` .. `NC-GOLD-06`), verifying every single control fails loudly with
 * `passed === false`, `floorRisk === true`, `effectiveScore5 <= 2.85`, and `effectiveScore100 <= 46.25`.
 */
export function verifyGoldenNegativeControls(): GoldenNegativeControlVerificationSummary {
  const baselineRes = evaluateSevenSurfaceParity(
    CLEAN_GOLDEN_BASELINE_BUNDLE,
    CLEAN_GOLDEN_BASELINE_TRUTH,
  );
  const baselineCleanPassed =
    baselineRes.passed === true &&
    baselineRes.floorRisk === false &&
    baselineRes.effectiveScore5 >= 4.9 &&
    baselineRes.effectiveScore100 >= 95;

  const items: GoldenNegativeControlReportItem[] = MANDATORY_GOLDEN_NEGATIVE_CONTROLS.map(
    (ctrl) => {
      const result = evaluateSevenSurfaceParity(ctrl.bundle, ctrl.truth);
      const observedCats = new Set(result.violations.map((v) => v.category));
      const matchedExpectedCategories = ctrl.expectedCategories.every((cat) =>
        observedCats.has(cat),
      );
      const caughtLoudly =
        result.passed === false &&
        result.floorRisk === true &&
        result.effectiveScore5 <= FLOOR_CAP_5 &&
        result.effectiveScore100 <= FLOOR_CAP_100 &&
        matchedExpectedCategories;

      return {
        id: ctrl.id,
        title: ctrl.title,
        caughtLoudly,
        result,
      };
    },
  );

  const caughtCount = items.filter((i) => i.caughtLoudly).length;

  return {
    baselineCleanPassed,
    allCaughtLoudly: baselineCleanPassed && caughtCount === items.length,
    totalControls: items.length,
    caughtCount,
    items,
  };
}
