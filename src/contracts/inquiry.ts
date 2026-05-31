/**
 * contracts/inquiry.ts
 *
 * Leasing inquiry, prospect, requirement, consent, and
 * AI qualification schemas.
 *
 * Inquiry data is private by default — RLS must protect it.
 * Prospect contact info MUST be redacted in handoffs and owner reports.
 *
 * Ported from cre-aipage contracts/inquiry.ts → Zod v4
 */

import { z } from "zod/v4";
import { InquiryStatusSchema, TenantTypeSchema } from "./enums";

// ── Fit Estimates ────────────────────────────────────────────────

export const FIT_ESTIMATES = [
  "strong",
  "moderate",
  "weak",
  "not_enough_info",
] as const;

export type FitEstimate = (typeof FIT_ESTIMATES)[number];

// ── Prospect (anonymized public form fields) ─────────────────────

export const InquiryProspectSchema = z.object({
  display_name: z.string().optional(),
  /** Internal only — MUST be redacted in handoffs and owner reports */
  contact_internal: z
    .object({
      phone: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  company_name: z.string().optional(),
});

export type InquiryProspect = z.infer<typeof InquiryProspectSchema>;

// ── Requirement ──────────────────────────────────────────────────

export const InquiryRequirementSchema = z.object({
  tenant_category: TenantTypeSchema.optional(),
  budget_deposit_min_krw: z.number().optional(),
  budget_deposit_max_krw: z.number().optional(),
  budget_rent_max_krw: z.number().optional(),
  move_in_timing: z.string().optional(),
  required_area_min_py: z.number().optional(),
  required_facilities: z.array(z.string()).optional(),
  tour_interest: z.boolean().optional(),
});

export type InquiryRequirement = z.infer<typeof InquiryRequirementSchema>;

// ── Consent ──────────────────────────────────────────────────────

export const InquiryConsentSchema = z.object({
  /** Privacy consent is REQUIRED for public inquiry submission */
  privacy_consent_given: z.boolean(),
  consented_at: z.string().optional(),
  consent_version: z.string().optional(),
});

export type InquiryConsent = z.infer<typeof InquiryConsentSchema>;

// ── Leasing Inquiry ──────────────────────────────────────────────

export const LeasingInquirySchema = z.object({
  id: z.string().uuid().optional(),
  leasing_page_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional(),

  status: InquiryStatusSchema.optional(),

  prospect: InquiryProspectSchema.optional(),
  requirement: InquiryRequirementSchema.optional(),
  question_text: z.string().optional(),
  source_channel: z.string().optional(),
  consent: InquiryConsentSchema.optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type LeasingInquiry = z.infer<typeof LeasingInquirySchema>;

// ── Public Inquiry Form Input ────────────────────────────────────

export const PublicInquiryInputSchema = z.object({
  space_id: z.string().uuid(),
  leasing_page_id: z.string().uuid().optional(),
  prospect: InquiryProspectSchema,
  requirement: InquiryRequirementSchema,
  question_text: z.string().optional(),
  consent: InquiryConsentSchema,
});

export type PublicInquiryInput = z.infer<typeof PublicInquiryInputSchema>;

// ── Inquiry Qualification (AI output) ────────────────────────────

export const InquiryQualificationSchema = z.object({
  id: z.string().uuid().optional(),
  inquiry_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  fit_estimate: z.enum(FIT_ESTIMATES).optional(),
  summary: z.string(),
  budget_fit: z.enum(["strong", "moderate", "weak", "unknown"]).optional(),
  timing_fit: z
    .enum(["immediate", "near_term", "flexible", "unknown"])
    .optional(),
  facility_fit: z.enum(["strong", "moderate", "weak", "unknown"]).optional(),

  key_concerns: z.array(z.string()).optional(),
  recommended_next_action: z.string(),
  kakao_reply_draft: z.string().optional(),
  missing_info_to_ask: z.array(z.string()).optional(),

  ai_generated: z.boolean().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),

  created_at: z.string().optional(),
});

export type InquiryQualification = z.infer<
  typeof InquiryQualificationSchema
>;
