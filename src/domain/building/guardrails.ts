/**
 * @module Guardrails
 * @description Enforces legal compliance under the Korean Real Estate Act (공인중개사법) and product boundaries.
 * Specifically prohibits automatic price opinion / valuation generation in Cold Mode.
 * @see SDD §5 S0-T5
 */

/**
 * Context payload for evaluating pitch generation guardrails.
 */
export interface PitchGenerationContext {
  /** Generation mode: 'cold' for unverified leads, 'warm' for verified */
  mode: 'cold' | 'warm';
  /** Whether the user has a confirmed mandate (수임) from the owner */
  hasOwnerMandate: boolean;
  /** Stated asking price in KRW */
  askingPriceKrw?: number;
  /** Raw prompt or draft text generated */
  promptOrText?: string;
}

/**
 * Result of evaluating text against guardrails.
 */
export interface GuardrailCheckResult {
  /** True if text complies with all rules */
  passed: boolean;
  /** List of violation messages if any rules failed */
  violations: string[];
  /** Optional sanitized text if automatic fixes were applied */
  sanitizedText?: string;
}

/**
 * Keywords indicating forbidden price/valuation opinions in Cold Mode
 */
const FORBIDDEN_COLD_PRICE_KEYWORDS = [
  '적정매매가',
  '추천매매가',
  '목표매매가',
  '감정평가액',
  '시세추정가',
  '매수가격 제안',
  '확정 수익률',
];

/**
 * Validates Pitch generation request against Cold Mode price opinion restrictions.
 * Rule S0-T5: Cold mode pitches (unverified address-only leads) MUST NOT contain price opinions.
 * 
 * @param ctx - Pitch generation context to evaluate
 * @returns Result of the guardrail check
 * @see SDD §5 S0-T5
 */
export function validateColdModePitchGuard(ctx: PitchGenerationContext): GuardrailCheckResult {
  const violations: string[] = [];

  if (ctx.mode === 'cold') {
    if (!ctx.hasOwnerMandate && ctx.promptOrText) {
      for (const keyword of FORBIDDEN_COLD_PRICE_KEYWORDS) {
        if (ctx.promptOrText.includes(keyword)) {
          violations.push(
            `ColdModePriceOpinionViolation: Keyword "${keyword}" is strictly forbidden in Cold mode pitch without owner mandate.`
          );
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Filters out illegal performance guarantees (수익률 보장 등).
 * 
 * @param text - Raw text to sanitize
 * @returns Sanitized text with compliant wording
 * @see SDD §5 S0-T5
 */
export function sanitizeComplianceText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/수익률\s*보장/g, '수익률 추정');
  cleaned = cleaned.replace(/원금\s*보장/g, '원금 손실 가능성 있음');
  cleaned = cleaned.replace(/확정\s*수익/g, '예상 수익');
  return cleaned;
}
