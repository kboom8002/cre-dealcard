/**
 * ai/envelope.ts
 *
 * Standardized input/output envelope for all AI agents.
 * Ensures consistent structure across the agent ecosystem:
 * - Status tracking (success/partial/error)
 * - Missing data signals
 * - Warnings & boundary notes
 * - Confidence levels
 * - Source references for traceability
 *
 * Ported from cre-aipage lib/agents/types.ts and adapted
 * for the cre-dealcard Zod v4 ecosystem.
 */

import { z } from "zod";

// ── Confidence Levels ────────────────────────────────────────────

export const CONFIDENCE_LEVELS = [
  "unknown",
  "memo_based_inference",
  "photo_based_inference",
  "broker_verified",
  "owner_verified",
  "expert_verified",
  "govt_data_verified",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);

// ── Agent Status ─────────────────────────────────────────────────

export const AGENT_STATUSES = [
  "success",
  "partial",
  "error",
  "blocked",
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number];

// ── Missing Data ─────────────────────────────────────────────────

export interface MissingDataItem {
  field: string;
  reason: string;
  priority: "low" | "medium" | "high";
}

export const MissingDataItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

// ── Source Reference ─────────────────────────────────────────────

export interface SourceRef {
  type: "memo" | "photo" | "db" | "api" | "manual" | "govt_data";
  id?: string;
  label?: string;
}

export const SourceRefSchema = z.object({
  type: z.enum(["memo", "photo", "db", "api", "manual", "govt_data"]),
  id: z.string().optional(),
  label: z.string().optional(),
});

// ── Agent Input Envelope ─────────────────────────────────────────

/**
 * Wraps the input payload sent TO an AI agent.
 * Provides context about the request: who's asking, what data is available,
 * and what visibility level the output should target.
 *
 * @template T The specific input payload type for the agent
 */
export interface AgentInputEnvelope<T> {
  /** The agent-specific input payload */
  payload: T;
  /** Target visibility for the output */
  targetVisibility?: "broker_internal" | "owner_visible" | "public_blind" | "public_named";
  /** Requesting user/broker ID */
  requestedBy?: string;
  /** Organization context */
  organizationId?: string;
  /** Additional context hints */
  context?: Record<string, unknown>;
}

// ── Agent Output Envelope ────────────────────────────────────────

/**
 * Wraps the output payload FROM an AI agent.
 * Provides metadata about the result quality, safety checks,
 * and data completeness.
 *
 * @template T The specific output payload type for the agent
 */
export interface AgentOutputEnvelope<T> {
  /** Processing status */
  status: AgentStatus;
  /** The agent-specific output payload */
  output: T;
  /** Data fields that were missing from input */
  missing_data: MissingDataItem[];
  /** Non-blocking warnings */
  warnings: string[];
  /** Fields detected as protected/sensitive (for disclosure guard) */
  protected_fields_detected: string[];
  /** Legal safety disclaimer (required for all public-facing content) */
  boundary_note: string;
  /** Overall confidence level of the output */
  confidence: ConfidenceLevel;
  /** Traceability: what data sources informed this output */
  source_refs: SourceRef[];
}

/**
 * Zod schema for validating AgentOutputEnvelope structure.
 * The `output` field is generic (z.unknown) — specific agents
 * should compose this with their own output schema.
 */
export const AgentOutputEnvelopeSchema = z.object({
  status: z.enum(AGENT_STATUSES),
  output: z.unknown(),
  missing_data: z.array(MissingDataItemSchema),
  warnings: z.array(z.string()),
  protected_fields_detected: z.array(z.string()),
  boundary_note: z.string(),
  confidence: ConfidenceLevelSchema,
  source_refs: z.array(SourceRefSchema),
});

// ── Factory Helpers ──────────────────────────────────────────────

/**
 * Creates a success envelope with sensible defaults.
 */
export function createSuccessEnvelope<T>(
  output: T,
  opts?: Partial<Omit<AgentOutputEnvelope<T>, "status" | "output">>
): AgentOutputEnvelope<T> {
  return {
    status: "success",
    output,
    missing_data: opts?.missing_data ?? [],
    warnings: opts?.warnings ?? [],
    protected_fields_detected: opts?.protected_fields_detected ?? [],
    boundary_note:
      opts?.boundary_note ??
      "이 결과는 AI 기반 예비 분석이며 현장 확인이 필요합니다.",
    confidence: opts?.confidence ?? "memo_based_inference",
    source_refs: opts?.source_refs ?? [],
  };
}

/**
 * Creates an error envelope.
 */
export function createErrorEnvelope<T>(
  errorMessage: string,
  partialOutput?: T
): AgentOutputEnvelope<T> {
  return {
    status: "error",
    output: partialOutput as T,
    missing_data: [],
    warnings: [errorMessage],
    protected_fields_detected: [],
    boundary_note: "",
    confidence: "unknown",
    source_refs: [],
  };
}
