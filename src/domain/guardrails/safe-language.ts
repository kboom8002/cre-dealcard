/**
 * domain/guardrails/safe-language.ts
 *
 * Korean CRE safe-language guardrail system.
 * Scans AI-generated text for legally risky claims and rewrites them
 * with safe, conditional alternatives.
 *
 * Ported from cre-aipage packages/guardrails/safe-language.ts
 * and adapted for the cre-dealcard ecosystem.
 */

// ── Forbidden Claims ─────────────────────────────────────────────
// Expressions that imply certainty, guarantee, or recommendation
// which Korean real estate law prohibits in marketing materials.
export const FORBIDDEN_CLAIMS = [
  "가능합니다", // "병의원 가능합니다", "F&B 가능합니다"
  "문제 없습니다", // "인허가 문제 없습니다", "소음 문제 없습니다"
  "임대 잘 됩니다",
  "바로 계약 가능합니다",
  "비용 적게 듭니다",
  "수익률 보장",
  "수익률 상승",
  "추천합니다",
  "확실합니다",
  "보장합니다",
  "무조건",
  "절대",
  "반드시 수익",
  "손해 없",
  "안전한 투자",
] as const;

export type ForbiddenClaim = (typeof FORBIDDEN_CLAIMS)[number];

// ── Safe Rewrite Map ─────────────────────────────────────────────
// Maps forbidden phrases to legally safe alternatives.
export const SAFE_REWRITE_MAP: Record<string, string> = {
  가능합니다:
    "검토 여지가 있으나, 관련 법규·인허가·시설 요건의 현장 확인이 필요합니다.",
  "문제 없습니다":
    "위반건축물 여부는 건축물대장과 현황 확인이 필요합니다.",
  "임대 잘 됩니다":
    "임대 수요는 시장 상황과 입지 조건에 따라 달라질 수 있으며, 별도 확인이 필요합니다.",
  "바로 계약 가능합니다":
    "계약 조건은 건물주·임차인 간 협의 사항이며, 세부 조건 확인이 필요합니다.",
  "비용 적게 듭니다":
    "비용은 공사 범위·자재·시점에 따라 달라지며, 전문 업체 견적이 필요합니다.",
  "수익률 보장":
    "수익률은 공실률·관리비·시장 변동에 따라 달라지며, 확정 수치가 아닙니다.",
  "수익률 상승":
    "임대료 재검토 여지는 있으나, 임대차·공실·비용 확인이 필요합니다.",
  추천합니다:
    "조건에 부합할 수 있는 부분과 추가 확인이 필요한 부분을 구분해 검토하는 것이 좋습니다.",
  확실합니다:
    "해당 사항은 예비 검토 자료이므로 확인이 필요합니다.",
  보장합니다:
    "해당 조건은 예비 분석이며, 실제 계약 시 별도 확인이 필요합니다.",
  무조건:
    "해당 사항은 조건에 따라 달라질 수 있으며, 세부 확인이 필요합니다.",
  절대:
    "해당 사항은 상황에 따라 달라질 수 있습니다.",
  "반드시 수익":
    "수익 여부는 시장 상황·운영 조건에 따라 달라지며, 확정할 수 없습니다.",
  "손해 없":
    "손실 가능성은 시장 변동·운영 조건에 따라 존재할 수 있습니다.",
  "안전한 투자":
    "투자에는 항상 리스크가 수반되며, 전문가 상담을 권장합니다.",
};

// ── Standard Boundary Note ───────────────────────────────────────
// Legally required disclaimer appended to all AI-generated content.
export const STANDARD_BOUNDARY_NOTE =
  "이 리포트는 공개 데이터와 입력 정보를 바탕으로 한 예비 검토 자료입니다. " +
  "가격, 수익률, 법률, 세무, 대출 가능성을 확정하지 않습니다.";

export const SHORT_BOUNDARY_NOTE =
  "예비 검토용 자료이며 현장 확인이 필요합니다.";

// ── Rewrite Function ─────────────────────────────────────────────

export interface SafeLanguageResult {
  /** The rewritten safe text */
  safeText: string;
  /** List of forbidden phrases found */
  violations: string[];
  /** Whether any violations were found */
  hadViolations: boolean;
}

/**
 * Scans text for forbidden claims and rewrites them with safe alternatives.
 *
 * @example
 * ```ts
 * const result = rewriteUnsafeText("이 매물은 수익률 보장됩니다.");
 * // result.safeText: "이 매물은 수익률은 공실률·관리비·시장 변동에 따라 달라지며, 확정 수치가 아닙니다."
 * // result.violations: ["수익률 보장"]
 * // result.hadViolations: true
 * ```
 */
export function rewriteUnsafeText(text: string): SafeLanguageResult {
  let safeText = text;
  const violations: string[] = [];

  for (const claim of FORBIDDEN_CLAIMS) {
    if (safeText.includes(claim)) {
      violations.push(claim);
      const rewrite =
        SAFE_REWRITE_MAP[claim] ??
        "검토 여지가 있으나 현장 확인이 필요합니다.";
      safeText = safeText.replaceAll(claim, rewrite);
    }
  }

  return {
    safeText,
    violations,
    hadViolations: violations.length > 0,
  };
}

/**
 * Checks if text contains any forbidden claims without rewriting.
 * Useful for validation-only scenarios (e.g., publication guards).
 */
export function containsForbiddenClaims(text: string): {
  hasForbidden: boolean;
  found: string[];
} {
  const found = FORBIDDEN_CLAIMS.filter((claim) => text.includes(claim));
  return { hasForbidden: found.length > 0, found: [...found] };
}

/**
 * Ensures text ends with a boundary note.
 * If the note is already present, returns as-is.
 */
export function ensureBoundaryNote(
  text: string,
  note: string = STANDARD_BOUNDARY_NOTE
): string {
  if (text.includes(note)) return text;
  return `${text.trimEnd()}\n\n⚠️ ${note}`;
}
