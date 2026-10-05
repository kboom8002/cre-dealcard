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
