/**
 * contracts/tenant-fit.ts
 *
 * Tenant fit evaluation and vibe/atmosphere analysis schemas.
 * Defines structures for space-tenant compatibility scoring
 * and the VAD (Valence-Arousal-Dominance) atmosphere model.
 *
 * Ported from cre-aipage contracts/tenant-fit.ts → Zod v4
 */

import { z } from "zod/v4";
import {
  ConfidenceLevelSchema,
  FitLevelSchema,
  TenantTypeSchema,
} from "./enums";

// ── Tenant Fit Result ────────────────────────────────────────────

export const TenantFitResultSchema = z.object({
  id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  target_tenant_type: TenantTypeSchema,
  fit_level: FitLevelSchema,
  fit_score: z.number().min(0).max(100),

  strengths: z.array(z.string()),
  check_needed: z.array(z.string()),
  weaker_points: z.array(z.string()).optional(),

  required_facility_checks: z.array(z.string()).optional(),
  legal_or_permit_checks: z.array(z.string()).optional(),
  suggested_visual_album_ids: z.array(z.string()).optional(),

  safe_summary: z.string(),
  boundary_note: z.string(),

  source_refs: z
    .array(
      z.object({
        type: z.string(),
        id: z.string().optional(),
        label: z.string().optional(),
      })
    )
    .optional(),

  confidence: ConfidenceLevelSchema.optional(),
  ai_generated: z.boolean().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type TenantFitResult = z.infer<typeof TenantFitResultSchema>;

// ── VAD (Valence-Arousal-Dominance) Model ────────────────────────

export const VADSchema = z.object({
  valence: z.enum(["very_negative", "negative", "neutral", "positive", "very_positive"]),
  arousal: z.enum(["very_low", "low", "medium", "high", "very_high"]),
  dominance: z.enum(["very_low", "low", "medium", "high", "very_high"]),
});

export type VAD = z.infer<typeof VADSchema>;

// ── Vibe Alignment per Tenant Type ───────────────────────────────

export const VibeAlignmentSchema = z.object({
  tenant_type: TenantTypeSchema,
  alignment_level: z.enum(["high", "medium", "low", "mismatch"]),
  reason: z.string(),
});

export type VibeAlignment = z.infer<typeof VibeAlignmentSchema>;

// ── Vibe Fit Result ──────────────────────────────────────────────

export const VibeFitResultSchema = z.object({
  id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  vibe_summary: z.string(),
  vibe_tags: z.array(z.string()),
  vad: VADSchema,

  tenant_vibe_alignment: z.array(VibeAlignmentSchema),
  mixed_signal_risks: z.array(z.string()).optional(),
  retrofit_vibe_opportunities: z.array(z.string()).optional(),
  missing_evidence: z.array(z.string()).optional(),

  boundary_note: z.string(),
  confidence: ConfidenceLevelSchema.optional(),

  ai_generated: z.boolean().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type VibeFitResult = z.infer<typeof VibeFitResultSchema>;
