/**
 * Magazine Quality Gate
 *
 * AI 생성 매거진 콘텐츠의 수치적 정확성을 검증합니다.
 * 기존 hallucination-detector.ts / memo-quality-gate.ts 패턴을 따릅니다.
 *
 * 주요 기능:
 * 1. 본문에서 숫자+단위 클레임을 추출
 * 2. 소스 데이터와 대조 검증
 * 3. 불일치율 > 20%이면 불합격 판정
 */

// ── 타입 정의 ──────────────────────────────────────────────────────

export interface NumericClaim {
  raw: string;          // 원본 텍스트 (예: '65.3%', '250억', '320평')
  value: number;        // 추출된 숫자 값
  unit: string;         // 단위 ('％', '억', '만원', '평', '㎡' 등)
  context: string;      // 주변 텍스트 (±30자)
}

export interface ValidationIssue {
  claim: NumericClaim;
  expected: number | null;
  deviation: number;    // 퍼센트 편차
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface QualityGateResult {
  passed: boolean;
  score: number;        // 0-100
  totalClaims: number;
  matchedClaims: number;
  mismatchedClaims: number;
  issues: string[];
  details: ValidationIssue[];
}

// ── 숫자 클레임 추출 ───────────────────────────────────────────────

/**
 * 한국어 CRE 텍스트에서 숫자+단위 조합을 추출합니다.
 *
 * 지원 단위: %, 억, 만원, 만, 평, ㎡, 건, 호, 층, 세대, 조
 */
export const extractNumericClaims = (text: string): NumericClaim[] => {
  if (!text) return [];

  // 숫자 + 단위 패턴 (콤마 포함 숫자, 소수점 포함)
  const pattern =
    /(?<!\w)([\d,]+(?:\.\d+)?)\s*(％|%|억|만원|만|평|㎡|건|호|층|세대|조)/g;

  const claims: NumericClaim[] = [];
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const rawNumber = match[1].replace(/,/g, '');
    const value = parseFloat(rawNumber);
    const unit = match[2];

    if (isNaN(value)) continue;

    // 주변 컨텍스트 추출 (±30자)
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + match[0].length + 30);
    const context = text.slice(start, end).replace(/\n/g, ' ').trim();

    claims.push({
      raw: match[0],
      value,
      unit: unit === '％' ? '%' : unit,
      context,
    });
  }

  return claims;
};

// ── 소스 데이터에서 수치 추출 ──────────────────────────────────────

/**
 * JSONB 소스 데이터를 재귀적으로 순회하며 모든 숫자 값을 수집합니다.
 */
const flattenSourceNumbers = (
  data: unknown,
  prefix = '',
): Map<string, number> => {
  const result = new Map<string, number>();

  if (data === null || data === undefined) return result;

  if (typeof data === 'number') {
    result.set(prefix, data);
    return result;
  }

  if (typeof data === 'string') {
    // 문자열에서 숫자 추출 시도
    const cleaned = data.replace(/,/g, '');

    // 억 단위
    const eokMatch = cleaned.match(/([\d.]+)\s*억/);
    if (eokMatch) {
      result.set(`${prefix}_억`, parseFloat(eokMatch[1]));
    }

    // 만원 단위
    const manwonMatch = cleaned.match(/([\d.]+)\s*만원/);
    if (manwonMatch) {
      result.set(`${prefix}_만원`, parseFloat(manwonMatch[1]));
    }

    // 퍼센트
    const pctMatch = cleaned.match(/([\d.]+)\s*[%％]/);
    if (pctMatch) {
      result.set(`${prefix}_%`, parseFloat(pctMatch[1]));
    }

    // 평
    const pyeongMatch = cleaned.match(/([\d.]+)\s*평/);
    if (pyeongMatch) {
      result.set(`${prefix}_평`, parseFloat(pyeongMatch[1]));
    }

    // ㎡
    const sqmMatch = cleaned.match(/([\d.]+)\s*㎡/);
    if (sqmMatch) {
      result.set(`${prefix}_㎡`, parseFloat(sqmMatch[1]));
    }

    // 순수 숫자 문자열
    const numMatch = cleaned.match(/^([\d.]+)$/);
    if (numMatch) {
      result.set(prefix, parseFloat(numMatch[1]));
    }

    return result;
  }

  if (Array.isArray(data)) {
    data.forEach((item, i) => {
      const sub = flattenSourceNumbers(item, `${prefix}[${i}]`);
      sub.forEach((v, k) => result.set(k, v));
    });
    return result;
  }

  if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const sub = flattenSourceNumbers(val, prefix ? `${prefix}.${key}` : key);
      sub.forEach((v, k) => result.set(k, v));
    }
  }

  return result;
};

// ── 단위별 허용 편차 ───────────────────────────────────────────────

const TOLERANCE_BY_UNIT: Record<string, number> = {
  '%': 2,     // ±2 포인트
  '억': 5,    // ±5%
  '만원': 5,
  '만': 5,
  '평': 3,
  '㎡': 3,
  '건': 0,    // 정수 — 정확히 일치해야 함
  '호': 0,
  '층': 0,
  '세대': 0,
  '조': 5,
};

// ── 클레임 검증 ────────────────────────────────────────────────────

/**
 * 추출된 수치 클레임을 소스 데이터의 숫자들과 비교합니다.
 *
 * 매칭 로직:
 * 1. 소스 데이터의 모든 숫자를 플랫하게 수집
 * 2. 각 클레임에 대해 가장 가까운 소스 값을 찾음
 * 3. 편차가 허용 범위를 초과하면 불일치로 판정
 */
export const validateAgainstSource = (
  claims: NumericClaim[],
  sourceData: Record<string, unknown>,
): ValidationIssue[] => {
  if (claims.length === 0) return [];

  const sourceNumbers = flattenSourceNumbers(sourceData);
  const sourceValues = Array.from(sourceNumbers.values());
  const issues: ValidationIssue[] = [];

  for (const claim of claims) {
    // 소스에 숫자가 없으면 검증 불가 → 스킵
    if (sourceValues.length === 0) continue;

    // 가장 가까운 소스 값 찾기
    let closestValue: number | null = null;
    let minDeviation = Infinity;

    for (const sv of sourceValues) {
      if (sv === 0 && claim.value === 0) {
        closestValue = 0;
        minDeviation = 0;
        break;
      }

      const deviation =
        sv !== 0
          ? Math.abs((claim.value - sv) / sv) * 100
          : claim.value === 0
            ? 0
            : 100;

      if (deviation < minDeviation) {
        minDeviation = deviation;
        closestValue = sv;
      }
    }

    const tolerancePct = TOLERANCE_BY_UNIT[claim.unit] ?? 5;

    // 정수 단위(건, 호, 층, 세대)는 절대 편차로 비교
    const isExactUnit = ['건', '호', '층', '세대'].includes(claim.unit);

    if (isExactUnit) {
      // 정확히 일치하는 값이 소스에 있는지 확인
      const exactMatch = sourceValues.some((sv) => sv === claim.value);
      if (!exactMatch && closestValue !== null) {
        const severity = minDeviation > 50 ? 'critical' : 'warning';
        issues.push({
          claim,
          expected: closestValue,
          deviation: minDeviation,
          severity,
          message: `"${claim.raw}" → 소스에서 정확히 일치하는 값 없음 (가장 가까운 값: ${closestValue}${claim.unit}, 편차: ${minDeviation.toFixed(1)}%)`,
        });
      }
    } else if (minDeviation > tolerancePct) {
      const severity = minDeviation > 30 ? 'critical' : 'warning';
      issues.push({
        claim,
        expected: closestValue,
        deviation: minDeviation,
        severity,
        message: `"${claim.raw}" → 소스 대비 ${minDeviation.toFixed(1)}% 편차 (소스: ${closestValue}, 허용: ±${tolerancePct}%)`,
      });
    }
  }

  return issues;
};

// ── 메인: 품질 게이트 ──────────────────────────────────────────────

/**
 * 매거진 본문의 수치적 정확성을 검증하는 메인 품질 게이트입니다.
 *
 * - 본문에서 모든 숫자+단위 클레임을 추출
 * - 소스 데이터(펄스, 뉴스, 거래 등)와 대조
 * - 불일치율 > 20% 이면 불합격
 *
 * @returns { passed, issues, score }
 */
export const runMagazineQualityGate = (
  bodyMd: string,
  sourceData: Record<string, unknown>,
): QualityGateResult => {
  // 1. 수치 클레임 추출
  const claims = extractNumericClaims(bodyMd);

  // 클레임이 없으면 검증 대상 없음 → 자동 통과
  if (claims.length === 0) {
    return {
      passed: true,
      score: 100,
      totalClaims: 0,
      matchedClaims: 0,
      mismatchedClaims: 0,
      issues: [],
      details: [],
    };
  }

  // 2. 소스 대조 검증
  const validationIssues = validateAgainstSource(claims, sourceData);

  // 3. 불일치율 계산
  const mismatchedClaims = validationIssues.length;
  const matchedClaims = claims.length - mismatchedClaims;
  const mismatchRate =
    claims.length > 0 ? mismatchedClaims / claims.length : 0;

  // 4. 점수 계산 (100점 만점)
  //    - 기본 점수: 일치율 × 80
  //    - critical 이슈 하나당 -10, warning 하나당 -5
  const baseScore = ((claims.length - mismatchedClaims) / claims.length) * 80;
  const criticalPenalty =
    validationIssues.filter((i) => i.severity === 'critical').length * 10;
  const warningPenalty =
    validationIssues.filter((i) => i.severity === 'warning').length * 5;
  const score = Math.max(0, Math.round(baseScore + 20 - criticalPenalty - warningPenalty));

  // 5. 합격 여부: 불일치율 20% 이하
  const passed = mismatchRate <= 0.2;

  // 6. 사람이 읽을 수 있는 이슈 메시지 목록
  const issueMessages = validationIssues.map((vi) => vi.message);
  if (!passed) {
    issueMessages.unshift(
      `⚠️ 품질 게이트 불합격: 전체 ${claims.length}개 수치 중 ${mismatchedClaims}개 불일치 (${(mismatchRate * 100).toFixed(1)}% > 20% 허용치)`,
    );
  }

  return {
    passed,
    score,
    totalClaims: claims.length,
    matchedClaims,
    mismatchedClaims,
    issues: issueMessages,
    details: validationIssues,
  };
};
