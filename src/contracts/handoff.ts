/**
 * contracts/handoff.ts
 *
 * Cross-app handoff payload schemas.
 * Protected fields (tenant contact, internal notes) must be explicitly redacted.
 *
 * Ported from cre-aipage contracts/handoff.ts → Zod v4
 */

import { z } from "zod";
import { TenantTypeSchema } from "./enums";

// ── Handoff Statuses ─────────────────────────────────────────────

export const HANDOFF_STATUSES = [
  "created",
  "imported",
  "expired",
  "blocked",
  "failed",
] as const;

export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

// ── Redaction Rules ──────────────────────────────────────────────

/**
 * Fields that MUST be removed from handoff payloads.
 * These are always redacted regardless of the target app.
 */
export const HANDOFF_REDACTION_RULES = {
  /** Always remove from ALL handoffs */
  always_remove: [
    "tenant_phone",
    "tenant_email",
    "contact_internal",
    "broker_internal_memo",
    "negotiation_floor",
    "negotiation_ceiling",
    "owner_private_note",
  ],
  /** Remove from Full IM handoffs (but OK for internal) */
  remove_for_full_im: [
    "asking_price_internal",
    "commission_rate",
  ],
} as const;

// ── Demand Signal Summary ────────────────────────────────────────

export const DemandSignalSummarySchema = z.object({
  inquiry_count: z.number(),
  qualified_count: z.number(),
  tour_request_count: z.number(),
  top_tenant_categories: z.array(TenantTypeSchema),
  top_questions: z.array(z.string()),
  top_objections: z.array(z.string()),
  page_view_estimate: z.number().optional(),
  period_days: z.number().optional(),
});

export type DemandSignalSummary = z.infer<typeof DemandSignalSummarySchema>;

// ── Full IM Handoff Payload ──────────────────────────────────────

export const FullIMHandoffPayloadSchema = z.object({
  payload_version: z.string(),
  source_app: z.string(),
  target_app: z.string(),

  building_id: z.string().uuid().optional(),
  space_ids: z.array(z.string().uuid()),

  space_summary: z
    .object({
      display_name: z.string().optional(),
      blind_name: z.string().optional(),
      floor: z.string().optional(),
      area_private_py: z.number().optional(),
      space_type: z.string().optional(),
      available_from: z.string().optional(),
    })
    .optional(),

  lease_terms_safe: z
    .object({
      deposit_krw: z.number().optional(),
      monthly_rent_krw: z.number().optional(),
      maintenance_fee_krw: z.number().optional(),
    })
    .optional(),

  visual_album_refs: z
    .array(
      z.object({
        album_id: z.string().uuid(),
        album_type: z.string(),
        title: z.string(),
        item_count: z.number(),
      })
    )
    .optional(),

  tenant_fit_summaries: z
    .array(
      z.object({
        tenant_type: TenantTypeSchema,
        fit_level: z.string(),
        safe_summary: z.string(),
        boundary_note: z.string(),
      })
    )
    .optional(),

  vibe_fit_summary: z
    .object({
      vibe_summary: z.string(),
      vibe_tags: z.array(z.string()),
      boundary_note: z.string(),
    })
    .optional(),

  demand_signals: DemandSignalSummarySchema.optional(),

  leasing_page_slug: z.string().optional(),
  leasing_page_url: z.string().optional(),

  /** REQUIRED: List of fields removed for privacy/disclosure */
  protected_fields_removed: z.array(z.string()),
  /** REQUIRED: Overall boundary note */
  boundary_note: z.string(),

  created_at: z.string().optional(),
  expires_at: z.string().optional(),
});

export type FullIMHandoffPayload = z.infer<typeof FullIMHandoffPayloadSchema>;

// ── MVP Handoff (inbound) ────────────────────────────────────────

export const MVPHandoffPayloadSchema = z.object({
  payload_version: z.string(),
  source_app: z.literal("js-mvp"),
  broker_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional(),
  building_ssot_lite_id: z.string().uuid().optional(),
  memo_text: z.string(),
  space_basics: z
    .object({
      floor: z.string().optional(),
      area_private_py: z.number().optional(),
      deposit_krw: z.number().optional(),
      monthly_rent_krw: z.number().optional(),
    })
    .optional(),
  target_tenant_types: z.array(TenantTypeSchema).optional(),
  excluded_tenant_types: z.array(TenantTypeSchema).optional(),
  photo_refs: z.array(z.string()).optional(),
});

export type MVPHandoffPayload = z.infer<typeof MVPHandoffPayloadSchema>;
