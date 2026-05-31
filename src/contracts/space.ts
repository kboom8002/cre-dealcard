/**
 * contracts/space.ts
 *
 * Space SSoT (Single Source of Truth) Zod v4 schema.
 * The core domain model for a leasable commercial space.
 *
 * Ported from cre-aipage contracts/space.ts → Zod v4
 */

import { z } from "zod/v4";
import {
  ConfidenceLevelSchema,
  SpaceStatusSchema,
  SpaceTypeSchema,
  SourceAppSchema,
  TenantTypeSchema,
} from "./enums";

// ── Sub-schemas ──────────────────────────────────────────────────

export const SpaceIdentitySchema = z.object({
  display_name: z.string().optional(),
  blind_name: z.string().optional(),
  floor: z.string().optional(),
  unit_name: z.string().optional(),
  space_type: SpaceTypeSchema.optional(),
  target_tenant_types: z.array(TenantTypeSchema).optional(),
});

export const LeaseTermsSchema = z.object({
  deposit_krw: z.number().optional(),
  monthly_rent_krw: z.number().optional(),
  maintenance_fee_krw: z.number().optional(),
  premium_krw: z.number().optional(),
  available_from: z.string().optional(),
  min_lease_years: z.number().optional(),
  negotiable_items: z.array(z.string()).optional(),
  terms_public_allowed: z.boolean().optional(),
});

export const PhysicalSchema = z.object({
  area_private_py: z.number().optional(),
  area_supply_py: z.number().optional(),
  ceiling_height_m: z.number().optional(),
  frontage_m: z.number().optional(),
  column_free: z.boolean().optional(),
  floor_load_kg_m2: z.number().optional(),
});

export const FacilitySchema = z.object({
  hvac: z.string().optional(),
  electrical_capacity_kw: z.number().optional(),
  water_supply: z.boolean().optional(),
  gas_supply: z.boolean().optional(),
  restroom_in_unit: z.boolean().optional(),
  elevator_access: z.boolean().optional(),
  parking_available: z.boolean().optional(),
  signage_possible: z.boolean().optional(),
});

export const MarketingSchema = z.object({
  headline: z.string().optional(),
  description: z.string().optional(),
  selling_points: z.array(z.string()).optional(),
  target_pitch: z.string().optional(),
});

import { MissingDataItemSchema } from "@/ai/envelope";
export { MissingDataItemSchema };

export const RiskNoteSchema = z.object({
  category: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const DisclosureSchema = z.object({
  boundary_note: z.string().optional(),
  safe_language_applied: z.boolean().optional(),
  last_reviewed_at: z.string().optional(),
});

// ── Main Schema ──────────────────────────────────────────────────

export const SpaceSSoTSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional(),
  building_ssot_lite_id: z.string().uuid().optional(),

  status: SpaceStatusSchema.optional(),

  // Identity
  identity: SpaceIdentitySchema.optional(),

  // Lease terms
  lease_terms: LeaseTermsSchema.optional(),

  // Physical attributes
  physical: PhysicalSchema.optional(),

  // Facilities
  facility: FacilitySchema.optional(),

  // Marketing
  marketing: MarketingSchema.optional(),

  // Data quality
  missing_data: z.array(MissingDataItemSchema).optional(),
  risk_notes: z.array(RiskNoteSchema).optional(),
  disclosure: DisclosureSchema.optional(),

  // Confidence & provenance
  confidence: ConfidenceLevelSchema.optional(),
  source_app: SourceAppSchema.optional(),
  source_object_id: z.string().optional(),

  // Timestamps
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type SpaceSSoT = z.infer<typeof SpaceSSoTSchema>;
export type SpaceIdentity = z.infer<typeof SpaceIdentitySchema>;
export type LeaseTerms = z.infer<typeof LeaseTermsSchema>;
export type { MissingDataItem } from "@/ai/envelope";
export type RiskNote = z.infer<typeof RiskNoteSchema>;
