/**
 * Magazine Quality Gate (fail-closed)
 *
 * AI 생성 매거진 콘텐츠의 수치적 정확성을 검증합니다. (C-02, M2-07, T3-45)
 *
 * 원칙 (이전 버전의 fail-open 제거)
 *  1. 본문에서 숫자+단위 클레임을 추출한다.
 *  2. 클레임마다 **같은 단위 차원**의 근거 숫자와 대조한다. 임의의 "가장 가까운 숫자" 매칭은 없다.
 *     - 일치 판정 = 클레임이 표기한 소수 자릿수 기준 반올림 허용오차(±0.5×10^-자릿수) 이내.
 *       (예: "65.3%" ↔ 65.34 ✓, "65억" ↔ 65.4억 ✓, "65억" ↔ 70억 ✗) — 건/호/층/세대는 정확 일치.
 *     - 금액(억/조/만원/원)과 면적(평/㎡)은 단위 환산 후 비교.
 *  3. 매칭되지 않는 클레임이 하나라도 있거나, 근거 숫자가 0개인데 클레임이 있으면 **불합격(needs_review)**.
 *  4. 지표 간 모순(예: 심리 "과열" 라벨 vs 공실 최고치 서술)을 검사한다.
 *  5. 빈 본문도 불합격이다. (클레임 0개이면서 비어 있지 않은 본문은 검증할 숫자가 없으므로 통과.)
 */

import { EDITION_STATUS_DRAFT, EDITION_STATUS_NEEDS_REVIEW } from './types';
import { FORBIDDEN_SOLICITATION_PHRASES } from '@/ai/prompts/magazine-taskflow';
import { hasReaderTextLeak } from '@/lib/magazine/llm-guard';
import { CURATED_CHANNEL_POOL, isCreRelevantArticle } from './news-channels';
import { isDanglingKoreanWord } from './issue-clustering';

// ── 타입 정의 ──────────────────────────────────────────────────────

export interface NumericClaim {
  raw: string;          // 원본 텍스트 (예: '65.3%', '250억', '320평')
  value: number;        // 추출된 숫자 값
  unit: string;         // 단위 ('%', '억', '만원', '평', '㎡', '점' 등)
  context: string;      // 주변 텍스트 (±30자)
  /** 표기된 소수 자릿수 (허용오차 계산용) */
  decimals?: number;
}

export interface ValidationIssue {
  claim: NumericClaim;
  expected: number | null;
  deviation: number;    // 가장 가까운 동일 차원 근거와의 퍼센트 편차 (근거 없으면 100)
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export type QualityGateFailureReason =
  | 'EMPTY_BODY'
  | 'NO_SOURCE_NUMBERS'
  | 'UNMATCHED_CLAIMS'
  | 'CONTRADICTION';

export interface QualityGateContext {
  /** 심리지수(0~100). 있으면 본문 라벨과의 모순을 검사한다. */
  sentimentScore?: number | null;
  /** 시장 온도 라벨 ('적극 매수' 등) */
  marketTemp?: string | null;
}

export interface QualityGateResult {
  passed: boolean;
  /** passed 이면 'draft'(저장 가능한 초안), 아니면 'needs_review' */
  status: typeof EDITION_STATUS_DRAFT | typeof EDITION_STATUS_NEEDS_REVIEW;
  score: number;        // 0-100
  totalClaims: number;
  matchedClaims: number;
  mismatchedClaims: number;
  sourceNumberCount: number;
  failureReasons: QualityGateFailureReason[];
  contradictions: string[];
  issues: string[];
  details: ValidationIssue[];
}

// ── 숫자 클레임 추출 ───────────────────────────────────────────────

const CLAIM_UNITS = '％|%|억|만원|만|평|㎡|건|호|층|세대|조|점';

/**
 * 한국어 CRE 텍스트에서 숫자+단위 조합을 추출합니다.
 *
 * 지원 단위: %, 억, 만원, 만, 평, ㎡, 건, 호, 층, 세대, 조, 점
 */
export const extractNumericClaims = (text: string): NumericClaim[] => {
  if (!text) return [];

  const pattern = new RegExp(`(?<![\\w.])([\\d,]+(?:\\.\\d+)?)\\s*(${CLAIM_UNITS})`, 'g');

  const claims: NumericClaim[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawNumber = match[1].replace(/,/g, '');
    const value = parseFloat(rawNumber);
    const unit = match[2];

    if (isNaN(value)) continue;

    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();
    const dot = rawNumber.indexOf('.');

    claims.push({
      raw: match[0],
      value,
      unit: unit === '％' ? '%' : unit,
      context,
      decimals: dot >= 0 ? rawNumber.length - dot - 1 : 0,
    });
  }

  return claims;
};

// ── 근거 숫자 수집 ─────────────────────────────────────────────────

interface SourceNumber {
  value: number;
  /** null = 단위 미상(원시 숫자). 같은 값이면 어떤 단위의 클레임과도 비교 가능(단위 환산 없음). */
  unit: string | null;
  path: string;
}

const MONEY_BASE: Record<string, number> = { 조: 1e12, 억: 1e8, 만원: 1e4, 원: 1 };
const AREA_UNITS = new Set(['평', '㎡']);
const PYEONG_PER_SQM = 0.3025;
const COUNT_UNITS = new Set(['건', '호', '층', '세대']);

/** '만'은 '만원'으로 간주 (CRE 문맥에서 단독 '만'은 금액 만원 단위). */
const normalizeUnit = (u: string): string => (u === '만' ? '만원' : u === '％' ? '%' : u);

const UNIT_RE = new RegExp(`([\\d]+(?:\\.\\d+)?)\\s*(${CLAIM_UNITS})`, 'g');

/** 키 이름으로 원시 숫자의 단위 후보를 추정한다 (환산 변형 포함). */
const expandByKey = (key: string, value: number, path: string): SourceNumber[] => {
  const out: SourceNumber[] = [{ value, unit: null, path }];
  const k = key.toLowerCase();
  if (/price|amount|bid|appraised|appraisal|value|krw|won|가격|금액|입찰|감정/.test(k)) {
    out.push({ value: value / 1e8, unit: '억', path }, { value: value / 1e4, unit: '만원', path }, { value, unit: '원', path });
  }
  if (/rate|pct|percent|ratio|vacancy|change|discount|yield|율/.test(k)) {
    out.push({ value, unit: '%', path });
  }
  if (/area|sqm|㎡|면적/.test(k)) {
    out.push({ value, unit: '㎡', path }, { value: value * PYEONG_PER_SQM, unit: '평', path });
  }
  if (/score|index|점수|지수/.test(k)) {
    out.push({ value, unit: '점', path });
  }
  if (/count|건수|total|개수/.test(k)) {
    out.push({ value, unit: '건', path });
  }
  return out;
};

/** JSONB 소스 데이터를 재귀적으로 순회하며 모든 숫자 값을 수집합니다. */
const collectSourceNumbers = (data: unknown, path = '', key = ''): SourceNumber[] => {
  if (data === null || data === undefined) return [];

  if (typeof data === 'number') {
    return Number.isFinite(data) ? expandByKey(key, data, path) : [];
  }

  if (typeof data === 'string') {
    const out: SourceNumber[] = [];
    const cleaned = data.replace(/(\d),(?=\d{3}\b)/g, '$1');
    for (const m of cleaned.matchAll(UNIT_RE)) {
      const v = parseFloat(m[1]);
      if (!Number.isFinite(v)) continue;
      const unit = normalizeUnit(m[2]);
      out.push({ value: v, unit, path });
      if (unit === '㎡') out.push({ value: v * PYEONG_PER_SQM, unit: '평', path });
      if (unit === '평') out.push({ value: v / PYEONG_PER_SQM, unit: '㎡', path });
    }
    const pure = cleaned.trim().match(/^-?\d+(?:\.\d+)?$/);
    if (pure) out.push(...expandByKey(key, parseFloat(pure[0]), path));
    return out;
  }

  if (Array.isArray(data)) {
    return data.flatMap((item, i) => collectSourceNumbers(item, `${path}[${i}]`, key));
  }

  if (typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>).flatMap(([k, v]) =>
      collectSourceNumbers(v, path ? `${path}.${k}` : k, k),
    );
  }

  return [];
};

// ── 허용오차 (명시) ────────────────────────────────────────────────

/**
 * 클레임이 표기한 자릿수 기준 반올림 허용오차. 건/호/층/세대는 정확 일치(0).
 * (예: 소수 1자리 → ±0.05, 정수 → ±0.5)
 */
export const claimTolerance = (claim: NumericClaim): number => {
  if (COUNT_UNITS.has(claim.unit)) return 1e-9;
  const decimals = claim.decimals ?? 0;
  return 0.5 * Math.pow(10, -decimals) + 1e-9;
};

const sameDimension = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (a in MONEY_BASE && b in MONEY_BASE) return true;
  if (AREA_UNITS.has(a) && AREA_UNITS.has(b)) return true;
  return false;
};

/** 클레임과 근거 후보를 같은 단위로 환산해 차이(클레임 단위 기준)를 반환. 비교 불가면 null. */
const diffInClaimUnit = (claim: NumericClaim, cand: SourceNumber): number | null => {
  const cu = normalizeUnit(claim.unit);
  if (cand.unit === null) return Math.abs(claim.value - cand.value);
  const su = normalizeUnit(cand.unit);
  if (!sameDimension(cu, su)) return null;
  if (cu in MONEY_BASE && su in MONEY_BASE) {
    const candInClaimUnit = (cand.value * MONEY_BASE[su]) / MONEY_BASE[cu];
    return Math.abs(claim.value - candInClaimUnit);
  }
  return Math.abs(claim.value - cand.value);
};

// ── 클레임 검증 ────────────────────────────────────────────────────

/**
 * 추출된 수치 클레임을 근거 숫자와 대조합니다. (fail-closed)
 *
 * - 근거 숫자가 0개이면 모든 클레임이 불일치(critical).
 * - 같은 단위 차원의 근거 중 허용오차 이내로 일치하는 값이 없으면 불일치.
 * - 불일치 메시지에는 "참고용" 가장 가까운 동일 차원 값만 표시하며 이를 일치로 인정하지 않는다.
 */
export const validateAgainstSource = (
  claims: NumericClaim[],
  sourceData: Record<string, unknown>,
): ValidationIssue[] => {
  if (claims.length === 0) return [];

  const candidates = collectSourceNumbers(sourceData);
  const issues: ValidationIssue[] = [];

  for (const claim of claims) {
    const tol = claimTolerance(claim);
    let matched = false;
    let nearest: { value: number; diff: number } | null = null;

    for (const cand of candidates) {
      const diff = diffInClaimUnit(claim, cand);
      if (diff === null) continue;
      if (diff <= tol) {
        matched = true;
        break;
      }
      if (cand.unit !== null && (nearest === null || diff < nearest.diff)) {
        nearest = { value: cand.value, diff };
      }
    }

    if (matched) continue;

    if (candidates.length === 0) {
      issues.push({
        claim,
        expected: null,
        deviation: 100,
        severity: 'critical',
        message: `"${claim.raw}" → 근거 데이터에 숫자가 없어 검증할 수 없음 (fail-closed)`,
      });
    } else {
      const expected = nearest?.value ?? null;
      const deviation =
        expected !== null && expected !== 0 ? Math.abs((claim.value - expected) / expected) * 100 : 100;
      issues.push({
        claim,
        expected,
        deviation,
        severity: 'critical',
        message:
          expected !== null
            ? `"${claim.raw}" → 근거와 일치하는 값 없음 (동일 단위 최근접 참고값: ${expected}${claim.unit}, 허용오차 ±${tol.toFixed(2)})`
            : `"${claim.raw}" → 근거에 같은 단위(${claim.unit})의 숫자가 없음`,
      });
    }
  }

  return issues;
};

// ── 지표 간 모순 검사 (T3-45) ──────────────────────────────────────

const OVERHEAT_RE = /(매수\s*과열|시장\s*과열|과열\s*(?:양상|국면|조짐|주의)|적극\s*매수|매수세\s*(?:강|확산|급증))/;
const VACANCY_PEAK_RE = /(공실[^\n.。]{0,14}(?:최고|사상|역대|급증|치솟)|(?:최고|사상|역대)[^\n.。]{0,10}공실)/;
const COLD_RE = /(위축|침체|냉각|거래\s*절벽|거래\s*급감|매수세\s*(?:약|위축|실종))/;

/**
 * 서로 모순되는 지표 서술을 찾는다. 규칙 (보수적으로 4개):
 *  R1. 본문에 "과열/적극 매수" 류와 "공실 최고치" 류가 동시에 있음 (T3-45 실사례)
 *  R2. 심리지수 ≥ 70 인데 본문이 위축·침체 서술
 *  R3. 심리지수 ≤ 40 인데 본문이 과열 서술
 *  R4. 시장 온도가 '적극/선별 매수'인데 본문이 공실 최고치 서술
 */
export const detectContradictions = (text: string, ctx: QualityGateContext = {}): string[] => {
  const out: string[] = [];
  if (!text) return out;
  const overheat = OVERHEAT_RE.test(text);
  const vacancyPeak = VACANCY_PEAK_RE.test(text);
  const cold = COLD_RE.test(text);
  const score = typeof ctx.sentimentScore === 'number' && Number.isFinite(ctx.sentimentScore) ? ctx.sentimentScore : null;

  if (overheat && vacancyPeak) out.push('모순: 투자 심리 "과열/적극 매수" 서술과 "공실 최고치" 서술이 함께 있음');
  if (score !== null && score >= 70 && cold) out.push(`모순: 심리지수 ${score}(과열권)인데 본문이 위축·침체를 서술함`);
  if (score !== null && score <= 40 && overheat) out.push(`모순: 심리지수 ${score}(위축권)인데 본문이 과열을 서술함`);
  if ((ctx.marketTemp === '적극 매수' || ctx.marketTemp === '선별 매수') && vacancyPeak && !overheat) {
    out.push(`모순: 시장 온도 "${ctx.marketTemp}"인데 본문이 공실 최고치를 서술함`);
  }
  return out;
};

// ── 메인: 품질 게이트 ──────────────────────────────────────────────

/**
 * 매거진 본문의 수치적 정확성을 검증하는 메인 품질 게이트입니다. (fail-closed)
 *
 * @param bodyMd     검증 대상 본문(여러 섹션이면 줄바꿈으로 이어 붙여 전달)
 * @param sourceData 근거 데이터(펄스·뉴스·거래·파생 카운트 등). 비어 있는데 클레임이 있으면 불합격.
 * @param ctx        지표 간 모순 검사용 컨텍스트(선택)
 */
export const runMagazineQualityGate = (
  bodyMd: string,
  sourceData: Record<string, unknown>,
  ctx: QualityGateContext = {},
): QualityGateResult => {
  const failureReasons: QualityGateFailureReason[] = [];
  const text = typeof bodyMd === 'string' ? bodyMd : '';

  const sourceNumberCount = collectSourceNumbers(sourceData ?? {}).length;
  const claims = extractNumericClaims(text);
  const validationIssues = validateAgainstSource(claims, sourceData ?? {});
  const contradictions = detectContradictions(text, ctx);

  if (text.trim().length === 0) failureReasons.push('EMPTY_BODY');
  if (claims.length > 0 && sourceNumberCount === 0) failureReasons.push('NO_SOURCE_NUMBERS');
  if (validationIssues.length > 0) failureReasons.push('UNMATCHED_CLAIMS');
  if (contradictions.length > 0) failureReasons.push('CONTRADICTION');

  const mismatchedClaims = validationIssues.length;
  const matchedClaims = claims.length - mismatchedClaims;
  const passed = failureReasons.length === 0;

  // 점수: 클레임 일치율 기반 (클레임 없으면 100, 모순 1건당 -20, 빈 본문 0)
  const baseScore = claims.length === 0 ? 100 : (matchedClaims / claims.length) * 100;
  const score = failureReasons.includes('EMPTY_BODY')
    ? 0
    : Math.max(0, Math.round(baseScore - contradictions.length * 20));

  const issueMessages: string[] = [];
  if (!passed) {
    issueMessages.push(
      `⚠️ 품질 게이트 불합격(needs_review): ${failureReasons.join(', ')}` +
        (claims.length > 0 ? ` — 수치 ${claims.length}개 중 ${mismatchedClaims}개 근거 불일치` : ''),
    );
  }
  issueMessages.push(...validationIssues.map((vi) => vi.message), ...contradictions);

  return {
    passed,
    status: passed ? EDITION_STATUS_DRAFT : EDITION_STATUS_NEEDS_REVIEW,
    score,
    totalClaims: claims.length,
    matchedClaims,
    mismatchedClaims,
    sourceNumberCount,
    failureReasons,
    contradictions,
    issues: issueMessages,
    details: validationIssues,
  };
};

// ── 뉴스레터 콘텐츠 적합성 통합 게이트 (발행 관문 · 오라클 공용) ─────────────

export type NewsletterCadence = 'daily' | 'weekly' | 'monthly' | 'special';

export interface NewsletterSuitabilityResult {
  passed: boolean;
  /** 발행 422 차단 대상: 투자 권유 단정 표현, 시스템/내부 라벨 독자 문구 유출 */
  hardViolations: string[];
  /** 409 검토 경고 대상: 가십 기사, 미완결·말줄임 잘림, 발행 주기↔시점 표현 불일치, 지표 모순 */
  reviewWarnings: string[];
  /** 실시간 RSS 없이 CURATED_CHANNEL_POOL 정적 예시만 사용 중인지 여부 */
  isFallbackCuratedOnly: boolean;
  cadence: NewsletterCadence;
  detectedSolicitations: string[];
  gossipIssueTitles: string[];
  truncatedFields: string[];
  cadenceMismatches: string[];
}

const INTERNAL_READER_LABEL_RE =
  /(핵심\s*팩트|브로커\s*임플리케이션|Why\s*it\s*matters|Bottom\s*line)\s*[:：]/i;
const TRAILING_ELLIPSIS_RE = /(?:\.{3}|…)\s*$/;
const CURATED_ID_SET = new Set(CURATED_CHANNEL_POOL.map((item) => item.id));
const CURATED_TITLE_SET = new Set(
  CURATED_CHANNEL_POOL.flatMap((item) =>
    [item.title, item.cardTitle]
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.replace(/^\[.*?\]\s*/, '').trim()),
  ),
);

function normalizeNewsletterCadence(
  rawCadence: string | null | undefined,
  contentKind: unknown,
): NewsletterCadence {
  const candidate =
    typeof rawCadence === 'string' && rawCadence.trim()
      ? rawCadence.trim().toLowerCase()
      : typeof contentKind === 'string'
        ? contentKind.trim().toLowerCase()
        : 'weekly';
  if (candidate === 'daily') return 'daily';
  if (candidate === 'monthly') return 'monthly';
  if (candidate === 'special' || candidate === 'quick_flash') return 'special';
  return 'weekly';
}

function asSuitabilityRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asSuitabilityString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isCuratedFallbackEntry(item: Record<string, unknown>): boolean {
  if (item.isFallback === true) return true;
  const id = asSuitabilityString(item.id);
  if (id && (CURATED_ID_SET.has(id) || /^curated-/i.test(id))) return true;
  const rawTitle = asSuitabilityString(item.title ?? item.cardTitle);
  const normTitle = rawTitle.replace(/^\[.*?\]\s*/, '').trim();
  return Boolean(normTitle && CURATED_TITLE_SET.has(normTitle));
}

function collectSuitabilityTextEntries(
  content: Record<string, unknown>,
): Array<{ label: string; text: string }> {
  const entries: Array<{ label: string; text: string }> = [];
  const push = (label: string, v: unknown) => {
    const s = asSuitabilityString(v);
    if (s) entries.push({ label, text: s });
  };

  push('제목(headline)', content.headline);
  push('부제목(subheadline)', content.subheadline);
  push('브리핑(briefing)', content.briefing ?? content.ai_briefing ?? content.summary);
  push('테마 제목(theme_title)', content.theme_title);
  push('테마 본문(theme_body_md)', content.theme_body_md);
  push('한줄 메모(quickNote)', content.quickNote);

  const fieldNote = asSuitabilityRecord(content.field_note);
  if (fieldNote) {
    for (const [k, v] of Object.entries(fieldNote)) {
      push(`현장노트(${k})`, v);
    }
  }

  const unitIssues = Array.isArray(content.unitIssues) ? content.unitIssues : [];
  unitIssues.forEach((raw, idx) => {
    const issue = asSuitabilityRecord(raw);
    if (!issue) return;
    push(`핵심이슈#${idx + 1} 제목`, issue.title ?? issue.cardTitle);
    push(`핵심이슈#${idx + 1} 요약`, issue.brief ?? issue.cardBrief ?? issue.summary);
    push(`핵심이슈#${idx + 1} 시사점`, issue.whyMatters ?? issue.brokerImplication);
  });

  for (const dealKey of ['featured_deals', 'featuredDeals', 'dealHighlights'] as const) {
    const deals = Array.isArray(content[dealKey]) ? (content[dealKey] as unknown[]) : [];
    deals.forEach((raw, idx) => {
      const deal = asSuitabilityRecord(raw);
      if (!deal) return;
      push(`추천매물#${idx + 1} 제목`, deal.title);
      push(`추천매물#${idx + 1} 코멘트`, deal.comment ?? deal.brokerComment ?? deal.summary);
    });
  }

  const charts = Array.isArray(content.monthlyCharts) ? content.monthlyCharts : [];
  charts.forEach((raw, idx) => {
    const chart = asSuitabilityRecord(raw);
    if (!chart) return;
    push(`통계#${idx + 1} 제목`, chart.title);
    push(`통계#${idx + 1} 메모`, chart.brokerNote ?? chart.summary ?? chart.commentary);
  });

  return entries;
}

/**
 * 뉴스레터 발행 관문 및 오프라인 오라클 공용 콘텐츠 적합성 5축 검사.
 * - 투자 권유 단정 표현(FORBIDDEN_SOLICITATION_PHRASES) & 내부 문구/라벨 누출 → hardViolations (422 차단)
 * - 비CRE 연예·정치 가십(!isCreRelevantArticle), 말줄임·조사 미완결(isDanglingKoreanWord),
 *   발행 주기↔시점 불일치, 지표-서사 모순 → reviewWarnings (409 확인 필요)
 * - 실시간 기사 없이 정적 CURATED_CHANNEL_POOL만 사용 중인지 → isFallbackCuratedOnly 메타데이터 반환
 */
export function runNewsletterContentSuitabilityGate(
  content: Record<string, unknown>,
  opts: { cadence?: string | null } = {},
): NewsletterSuitabilityResult {
  const safeContent = asSuitabilityRecord(content) ?? {};
  const cadence = normalizeNewsletterCadence(opts.cadence, safeContent.kind);

  const hardViolations: string[] = [];
  const reviewWarnings: string[] = [];
  const detectedSolicitations: string[] = [];
  const gossipIssueTitles: string[] = [];
  const truncatedFields: string[] = [];
  const cadenceMismatches: string[] = [];

  const textEntries = collectSuitabilityTextEntries(safeContent);
  const fullText = textEntries.map((e) => e.text).join('\n');

  // 1. 투자 권유·확정 수익 금지 표현 검사 (hardViolations)
  for (const phrase of FORBIDDEN_SOLICITATION_PHRASES) {
    if (fullText.includes(phrase)) {
      detectedSolicitations.push(phrase);
      hardViolations.push(`투자 권유·확정 수익 금지 표현("${phrase}")이 포함되어 있습니다.`);
    }
  }

  // 2. 시스템/내부 AI 라벨 독자 본문 유출 검사 (hardViolations)
  for (const entry of textEntries) {
    if (hasReaderTextLeak(entry.text)) {
      hardViolations.push(`${entry.label}에 시스템 오류 문자열(undefined/NaN/mocked 등)이 노출되었습니다.`);
    }
    const labelMatch = entry.text.match(INTERNAL_READER_LABEL_RE);
    if (labelMatch) {
      hardViolations.push(`${entry.label}에 내부 AI 라벨("${labelMatch[1]}:")이 제거되지 않고 남았습니다.`);
    }
  }

  // 3. 비CRE 가십 기사 포함 검사 (reviewWarnings)
  const unitIssues = Array.isArray(safeContent.unitIssues) ? safeContent.unitIssues : [];
  const topNews = Array.isArray(safeContent.topNews)
    ? safeContent.topNews
    : Array.isArray(safeContent.news_pool)
      ? safeContent.news_pool
      : [];

  for (const [idx, raw] of unitIssues.entries()) {
    const issue = asSuitabilityRecord(raw);
    if (!issue) continue;
    const title = asSuitabilityString(issue.title ?? issue.cardTitle);
    const summary = asSuitabilityString(issue.brief ?? issue.cardBrief ?? issue.summary);
    if (title && !isCreRelevantArticle({ title, summary })) {
      gossipIssueTitles.push(title);
      reviewWarnings.push(
        `핵심 이슈 #${idx + 1}("${title}")이 상업용 부동산·자산관리 품격에 맞지 않는 가십성 기사일 수 있습니다.`,
      );
    }

    // 4. 말줄임(…) 및 한국어 조사/어미 미완결 검사 (reviewWarnings)
    if (title && TRAILING_ELLIPSIS_RE.test(title)) {
      truncatedFields.push(`핵심이슈#${idx + 1} 제목(말줄임표 끊김)`);
      reviewWarnings.push(`핵심 이슈 #${idx + 1} 제목("${title}")이 말줄임표로 잘려 있습니다.`);
    } else if (title) {
      const lastToken = title.split(/\s+/).pop() ?? '';
      if (lastToken && isDanglingKoreanWord(lastToken)) {
        truncatedFields.push(`핵심이슈#${idx + 1} 제목(미완결 어절 "${lastToken}")`);
        reviewWarnings.push(
          `핵심 이슈 #${idx + 1} 제목("${title}")이 조사·수식어("${lastToken}")로 미완결 종료되었습니다.`,
        );
      }
    }

    if (summary && TRAILING_ELLIPSIS_RE.test(summary)) {
      truncatedFields.push(`핵심이슈#${idx + 1} 요약(말줄임표 끊김)`);
      reviewWarnings.push(`핵심 이슈 #${idx + 1} 요약 문장이 말줄임표(…)로 끊겨 있습니다.`);
    }
  }

  for (const [idx, raw] of topNews.entries()) {
    const item = asSuitabilityRecord(raw);
    if (!item) continue;
    const title = asSuitabilityString(item.title ?? item.cardTitle);
    const summary = asSuitabilityString(item.summary ?? item.brief ?? item.cardBrief);
    if (title && !isCreRelevantArticle({ title, summary })) {
      gossipIssueTitles.push(title);
      reviewWarnings.push(
        `추천 뉴스 #${idx + 1}("${title}")에 비부동산 가십·사건 키워드가 포함되어 있습니다.`,
      );
    }
  }

  // 헤드라인 미완결·말줄임 검사
  const headline = asSuitabilityString(safeContent.headline);
  if (headline) {
    if (TRAILING_ELLIPSIS_RE.test(headline)) {
      truncatedFields.push('제목(말줄임표 끊김)');
      reviewWarnings.push(`뉴스레터 제목("${headline}")이 말줄임표(…)로 잘려 있습니다.`);
    } else {
      const lastHeadlineWord = headline.split(/\s+/).pop() ?? '';
      if (lastHeadlineWord && isDanglingKoreanWord(lastHeadlineWord)) {
        truncatedFields.push(`제목(미완결 어절 "${lastHeadlineWord}")`);
        reviewWarnings.push(
          `뉴스레터 제목("${headline}")이 조사·어미("${lastHeadlineWord}")로 미완결 종료되었습니다.`,
        );
      }
    }
  }

  // 5. 발행 주기(daily/weekly/monthly/special) ↔ 시점 표현 불일치 검사 (reviewWarnings)
  const subheadline = asSuitabilityString(safeContent.subheadline);
  const themeTitle = asSuitabilityString(safeContent.theme_title);
  const framingHeader = [headline, subheadline, themeTitle].filter(Boolean).join(' ');
  const briefingFirstLine = asSuitabilityString(safeContent.briefing ?? safeContent.ai_briefing).split('\n')[0] ?? '';

  const pushMismatch = (reason: string) => {
    cadenceMismatches.push(reason);
    reviewWarnings.push(reason);
  };

  if (cadence === 'monthly') {
    const m = framingHeader.match(
      /(오늘의\s*일간|일간\s*(?:브리핑|이슈|요약|리포트|시황|뉴스)|오늘의\s*(?:핵심|브리핑|부동산)|데일리\s*(?:브리핑|리포트)|이번\s*주\s*(?:핵심|브리핑|리포트|시황|매거진)|금주\s*(?:핵심|브리핑|리포트))/,
    );
    if (m) {
      pushMismatch(`월간호인데 제목·부제에 다른 주기 표현("${m[1]}")이 포함되었습니다.`);
    } else if (/오늘의\s*(?:일간|데일리)|이번\s*주\s*브리핑/.test(briefingFirstLine)) {
      pushMismatch('월간호 브리핑 도입부에 일간·주간 시점 표현이 혼입되었습니다.');
    }
  } else if (cadence === 'daily') {
    const m = framingHeader.match(
      /(월간\s*(?:리포트|브리핑|매거진|시황|호)|이번\s*달\s*(?:핵심|브리핑|시황)|주간\s*(?:리포트|브리핑|매거진|시황)|이번\s*주\s*(?:브리핑|시황))/,
    );
    if (m) {
      pushMismatch(`일간 브리핑인데 제목·부제에 주간·월간 표현("${m[1]}")이 포함되었습니다.`);
    }
  } else if (cadence === 'weekly') {
    const m = framingHeader.match(
      /(월간\s*(?:리포트|종합|매거진|시황|정기호)|이번\s*달\s*(?:정기호|월간)|일간\s*(?:브리핑|리포트)|오늘의\s*데일리)/,
    );
    if (m) {
      pushMismatch(`주간 브리핑인데 제목·부제에 일간·월간 표현("${m[1]}")이 포함되었습니다.`);
    }
  } else if (cadence === 'special') {
    const m = framingHeader.match(/(일간\s*정기\s*브리핑|월간\s*정기호)/);
    if (m) {
      pushMismatch(`호외 특집인데 제목·부제에 정기호 표현("${m[1]}")이 포함되었습니다.`);
    }
  }

  // 6. 지표-서사 모순 재확인 (수동 편집으로 들어온 모순 차단)
  const marketTemp = asSuitabilityString(safeContent.market_temp);
  const contradictions = detectContradictions(fullText, {
    marketTemp: marketTemp || null,
  });
  for (const c of contradictions) {
    reviewWarnings.push(c);
  }

  // 7. 폴백 예시 기사 풀 단독 사용 여부 메타데이터
  const newsSourceList = unitIssues.length > 0 ? unitIssues : topNews;
  const issueRecords = newsSourceList
    .map(asSuitabilityRecord)
    .filter((r): r is Record<string, unknown> => r !== null);
  const isFallbackCuratedOnly =
    issueRecords.length > 0 && issueRecords.every((item) => isCuratedFallbackEntry(item));

  return {
    passed: hardViolations.length === 0 && reviewWarnings.length === 0,
    hardViolations: Array.from(new Set(hardViolations)),
    reviewWarnings: Array.from(new Set(reviewWarnings)),
    isFallbackCuratedOnly,
    cadence,
    detectedSolicitations: Array.from(new Set(detectedSolicitations)),
    gossipIssueTitles: Array.from(new Set(gossipIssueTitles)),
    truncatedFields: Array.from(new Set(truncatedFields)),
    cadenceMismatches: Array.from(new Set(cadenceMismatches)),
  };
}
