/**
 * domain/guardrails/disclosure-guard.ts
 *
 * Controls what data fields can be exposed at each visibility tier.
 * Prevents PII leaks, private notes, and negotiation details
 * from reaching unauthorized audiences.
 *
 * 5-tier visibility model:
 *   broker_internal → owner_visible → public_blind → public_named → blocked
 *
 * Ported from cre-aipage disclosure-guard-agent.ts
 * and adapted for the cre-dealcard ecosystem.
 */

// ── Visibility Tiers ─────────────────────────────────────────────

export const VISIBILITY_TIERS = [
  "broker_internal",
  "owner_visible",
  "public_blind",
  "public_named",
  "blocked",
] as const;

export type VisibilityTier = (typeof VISIBILITY_TIERS)[number];

// ── Field-Level Access Control ───────────────────────────────────

/** Fields that must NEVER appear at certain visibility levels */
const BLOCKED_FIELDS: Record<string, VisibilityTier[]> = {
  // Always block on public
  owner_private_note: ["public_blind", "public_named"],
  broker_internal_memo: ["public_blind", "public_named", "owner_visible"],
  negotiation_floor: ["public_blind", "public_named", "owner_visible"],
  negotiation_ceiling: ["public_blind", "public_named", "owner_visible"],
  asking_price_internal: ["public_blind", "public_named"],
  commission_rate: ["public_blind", "public_named"],

  // PII — redact on all non-internal tiers
  tenant_phone: ["public_blind", "public_named", "owner_visible"],
  tenant_email: ["public_blind", "public_named", "owner_visible"],
  owner_phone: ["public_blind", "public_named"],
  owner_email: ["public_blind", "public_named"],
  owner_name: ["public_blind"], // allowed on public_named
};

/** Regex patterns for PII detection in free-text fields */
const PII_PATTERNS = [
  { name: "phone_kr", pattern: /01[0-9]-?\d{3,4}-?\d{4}/g },
  { name: "phone_landline", pattern: /0[2-6][0-9]-?\d{3,4}-?\d{4}/g },
  { name: "email", pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "resident_id", pattern: /\d{6}-?[1-4]\d{6}/g },
] as const;

// ── Types ────────────────────────────────────────────────────────

export type DisclosureStatus = "pass" | "redacted" | "blocked";

export interface DisclosureResult {
  status: DisclosureStatus;
  /** Fields that were redacted or blocked */
  redactedFields: string[];
  /** PII patterns found in free text */
  piiDetected: { field: string; patternName: string }[];
  /** The sanitized payload (if applicable) */
  sanitizedPayload?: Record<string, unknown>;
}

// ── Guard Functions ──────────────────────────────────────────────

/**
 * Checks whether a specific field is allowed at the given visibility tier.
 */
export function isFieldAllowed(
  fieldName: string,
  targetVisibility: VisibilityTier
): boolean {
  const blockedAt = BLOCKED_FIELDS[fieldName];
  if (!blockedAt) return true; // field not in blocklist → allowed
  return !blockedAt.includes(targetVisibility);
}

/**
 * Scans a flat key-value payload and redacts fields that are
 * not allowed at the target visibility tier.
 */
export function redactPayload(
  payload: Record<string, unknown>,
  targetVisibility: VisibilityTier
): DisclosureResult {
  const redactedFields: string[] = [];
  const piiDetected: { field: string; patternName: string }[] = [];
  const sanitized = { ...payload };

  // 1. Field-level redaction
  for (const key of Object.keys(sanitized)) {
    if (!isFieldAllowed(key, targetVisibility)) {
      redactedFields.push(key);
      delete sanitized[key];
    }
  }

  // 2. PII scan in remaining string values
  if (
    targetVisibility === "public_blind" ||
    targetVisibility === "public_named"
  ) {
    for (const [key, value] of Object.entries(sanitized)) {
      if (typeof value !== "string") continue;
      for (const { name, pattern } of PII_PATTERNS) {
        // Reset regex state for global patterns
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
          piiDetected.push({ field: key, patternName: name });
          // Redact PII from value
          pattern.lastIndex = 0;
          sanitized[key] = (value as string).replace(pattern, "[REDACTED]");
        }
      }
    }
  }

  const hasRedactions = redactedFields.length > 0 || piiDetected.length > 0;

  return {
    status: hasRedactions ? "redacted" : "pass",
    redactedFields,
    piiDetected,
    sanitizedPayload: sanitized,
  };
}

/**
 * Quick check: does the payload contain any fields that would
 * be blocked at the target visibility? (No mutation.)
 */
export function wouldRequireRedaction(
  payload: Record<string, unknown>,
  targetVisibility: VisibilityTier
): boolean {
  return Object.keys(payload).some(
    (key) => !isFieldAllowed(key, targetVisibility)
  );
}

/**
 * Scans free text for PII patterns and returns matches.
 * Does NOT mutate the input.
 */
export function scanForPII(
  text: string
): { patternName: string; matches: string[] }[] {
  const results: { patternName: string; matches: string[] }[] = [];

  for (const { name, pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      results.push({ patternName: name, matches: [...matches] });
    }
  }

  return results;
}

/**
 * Redacts PII from free text. Returns the sanitized text.
 */
export function redactPII(text: string): string {
  let safe = text;
  for (const { pattern } of PII_PATTERNS) {
    pattern.lastIndex = 0;
    safe = safe.replace(pattern, "[REDACTED]");
  }
  return safe;
}

// ── Photo Visibility ─────────────────────────────────────────────

/** Photo statuses that should be blocked from public view */
const BLOCKED_PHOTO_STATUSES = [
  "private_only",
  "needs_review",
  "blocked",
  "uploaded", // not yet classified
] as const;

/**
 * Checks whether a photo with the given status can be shown publicly.
 */
export function isPhotoPublicReady(status: string): boolean {
  return !(BLOCKED_PHOTO_STATUSES as readonly string[]).includes(status);
}
