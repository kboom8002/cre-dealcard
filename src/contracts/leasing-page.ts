/**
 * contracts/leasing-page.ts
 *
 * Leasing page, page section, campaign copy, and publication guard schemas.
 * Public pages MUST include boundary_note and pass disclosure guard.
 *
 * Ported from cre-aipage contracts/leasing-page.ts → Zod v4
 */

import { z } from "zod/v4";
import {
  TenantTypeSchema,
  VisibilityTierSchema,
} from "./enums";

// ── Leasing Page Statuses ────────────────────────────────────────

export const LEASING_PAGE_STATUSES = [
  "draft",
  "generated",
  "review_required",
  "published",
  "unpublished",
  "archived",
  "blocked",
] as const;

export type LeasingPageStatus = (typeof LEASING_PAGE_STATUSES)[number];

// ── Page Section Types ───────────────────────────────────────────

export const PAGE_SECTION_TYPES = [
  "answer_hero",
  "space_summary",
  "tenant_fit",
  "visual_answer_album",
  "vibe_and_experience",
  "facility_technical_check",
  "risk_check_needed",
  "inquiry_cta",
] as const;

export type PageSectionType = (typeof PAGE_SECTION_TYPES)[number];

// ── Section Statuses ─────────────────────────────────────────────

export const SECTION_STATUSES = [
  "draft",
  "generated",
  "reviewed",
  "published",
  "blocked",
] as const;

export type SectionStatus = (typeof SECTION_STATUSES)[number];

// ── SEO ──────────────────────────────────────────────────────────

export const LeasingPageSEOSchema = z.object({
  meta_title: z.string().optional(),
  meta_description: z.string().optional(),
  og_image_url: z.string().optional(),
  canonical_url: z.string().optional(),
  faq_questions: z.array(z.string()).optional(),
  noindex: z.boolean().optional(),
});

export type LeasingPageSEO = z.infer<typeof LeasingPageSEOSchema>;

// ── Section ──────────────────────────────────────────────────────

export const LeasingPageSectionSchema = z.object({
  id: z.string().uuid().optional(),
  page_id: z.string().uuid().optional(),

  section_type: z.enum(PAGE_SECTION_TYPES),
  title: z.string(),
  sort_order: z.number(),
  markdown: z.string().optional(),
  content_json: z.record(z.string(), z.unknown()).optional(),
  linked_album_ids: z.array(z.string()).optional(),
  linked_visual_asset_ids: z.array(z.string()).optional(),

  visibility: VisibilityTierSchema.optional(),
  status: z.enum(SECTION_STATUSES).optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type LeasingPageSection = z.infer<typeof LeasingPageSectionSchema>;

// ── Leasing Page ─────────────────────────────────────────────────

export const LeasingPageSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  slug: z.string(),

  status: z.enum(LEASING_PAGE_STATUSES).optional(),
  visibility: VisibilityTierSchema.optional(),

  title: z.string(),
  subtitle: z.string().optional(),

  /** Primary answer/hook at the top of the page */
  answer_hero: z.string(),

  target_tenant_types: z.array(TenantTypeSchema).optional(),
  visual_album_ids: z.array(z.string()).optional(),
  tenant_fit_result_ids: z.array(z.string()).optional(),
  vibe_fit_result_id: z.string().uuid().optional(),

  inquiry_form_enabled: z.boolean().optional(),

  /** REQUIRED: Must be present before publication */
  boundary_note: z.string(),

  seo: LeasingPageSEOSchema.optional(),
  sections: z.array(LeasingPageSectionSchema).optional(),

  created_by: z.string().uuid().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  published_at: z.string().optional(),
});

export type LeasingPage = z.infer<typeof LeasingPageSchema>;

// ── Publication Guard ────────────────────────────────────────────

export type PublicationGuardResult =
  | { allowed: true }
  | { allowed: false; reasons: string[] };

/**
 * Guards against publishing a leasing page without required safety fields.
 */
export function checkPublicationGuard(
  page: LeasingPage
): PublicationGuardResult {
  const reasons: string[] = [];

  if (!page.boundary_note || page.boundary_note.trim().length === 0) {
    reasons.push("boundary_note is required for publication");
  }

  if (page.status === "blocked") {
    reasons.push(
      "page is blocked — resolve content issues before publishing"
    );
  }

  if (!page.answer_hero || page.answer_hero.trim().length === 0) {
    reasons.push("answer_hero is required for publication");
  }

  if (reasons.length > 0) return { allowed: false, reasons };
  return { allowed: true };
}

// ── Copy Types ───────────────────────────────────────────────────

export const COPY_TYPES = [
  "kakao",
  "naver_listing",
  "sms",
  "instagram_caption",
  "tenant_specific_pitch",
  "owner_summary",
] as const;

export type CopyType = (typeof COPY_TYPES)[number];

export const COPY_STATUSES = [
  "generated",
  "copied",
  "edited",
  "archived",
  "blocked",
] as const;

export type CopyStatus = (typeof COPY_STATUSES)[number];

// ── Campaign Copy ────────────────────────────────────────────────

export const CampaignCopySchema = z.object({
  id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
  leasing_page_id: z.string().uuid().optional(),

  copy_type: z.enum(COPY_TYPES),
  target_tenant_type: TenantTypeSchema.optional(),
  title: z.string().optional(),
  body: z.string(),

  status: z.enum(COPY_STATUSES).optional(),
  boundary_note: z.string().optional(),

  ai_generated: z.boolean().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),

  created_by: z.string().uuid().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type CampaignCopy = z.infer<typeof CampaignCopySchema>;
