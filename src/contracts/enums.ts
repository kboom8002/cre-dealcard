/**
 * contracts/enums.ts
 *
 * Shared enumeration constants for the CRE domain.
 * All enums are defined as Zod schemas AND as const arrays
 * for maximum reuse (runtime validation + TypeScript inference).
 *
 * Ported from cre-aipage contracts/enums.ts → Zod v4
 */

import { z } from "zod";

// ── Tenant Types ─────────────────────────────────────────────────

export const TENANT_TYPES = [
  "office",
  "premium_office",
  "coworking",
  "clinic",
  "dental",
  "dermatology",
  "pharmacy",
  "fnb",
  "cafe",
  "retail",
  "academy",
  "studio",
  "gym",
  "salon",
  "logistics",
  "warehouse",
  "factory",
  "other",
] as const;

export type TenantType = (typeof TENANT_TYPES)[number];
export const TenantTypeSchema = z.enum(TENANT_TYPES);

// ── Space Types ──────────────────────────────────────────────────

export const SPACE_TYPES = [
  "office",
  "retail",
  "fnb",
  "medical",
  "mixed",
  "warehouse",
  "factory",
  "other",
] as const;

export type SpaceType = (typeof SPACE_TYPES)[number];
export const SpaceTypeSchema = z.enum(SPACE_TYPES);

// ── Fit Levels ───────────────────────────────────────────────────

export const FIT_LEVELS = [
  "high_potential",
  "medium_potential",
  "limited_potential",
  "weak_fit",
  "unknown",
] as const;

export type FitLevel = (typeof FIT_LEVELS)[number];
export const FitLevelSchema = z.enum(FIT_LEVELS);

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

// ── Visibility Tiers ─────────────────────────────────────────────

export const VISIBILITY_TIERS = [
  "broker_internal",
  "owner_visible",
  "public_blind",
  "public_named",
  "blocked",
] as const;

export type VisibilityTier = (typeof VISIBILITY_TIERS)[number];
export const VisibilityTierSchema = z.enum(VISIBILITY_TIERS);

// ── Space Statuses ───────────────────────────────────────────────

export const SPACE_STATUSES = [
  "draft",
  "intake",
  "needs_photos",
  "visual_classified",
  "page_generated",
  "published",
  "leased",
  "archived",
  "blocked",
] as const;

export type SpaceStatus = (typeof SPACE_STATUSES)[number];
export const SpaceStatusSchema = z.enum(SPACE_STATUSES);

// ── Visual Asset Statuses ────────────────────────────────────────

export const VISUAL_ASSET_STATUSES = [
  "uploaded",
  "processing",
  "classified",
  "needs_review",
  "public_ready",
  "private_only",
  "blocked",
] as const;

export type VisualAssetStatus = (typeof VISUAL_ASSET_STATUSES)[number];
export const VisualAssetStatusSchema = z.enum(VISUAL_ASSET_STATUSES);

// ── Capture Scopes ───────────────────────────────────────────────

export const CAPTURE_SCOPES = [
  "exterior",
  "entrance",
  "lobby",
  "interior",
  "restroom",
  "kitchen",
  "ceiling",
  "floor",
  "window",
  "electrical",
  "hvac",
  "plumbing",
  "parking",
  "signage",
  "neighborhood",
  "unknown",
] as const;

export type CaptureScope = (typeof CAPTURE_SCOPES)[number];
export const CaptureScopeSchema = z.enum(CAPTURE_SCOPES);

// ── Evidence Strength ────────────────────────────────────────────

export const EVIDENCE_STRENGTHS = [
  "strong",
  "medium",
  "weak",
  "insufficient",
] as const;

export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];
export const EvidenceStrengthSchema = z.enum(EVIDENCE_STRENGTHS);

// ── Inquiry Statuses ─────────────────────────────────────────────

export const INQUIRY_STATUSES = [
  "submitted",
  "qualified",
  "contacted",
  "tour_requested",
  "tour_scheduled",
  "tour_completed",
  "not_fit",
  "closed",
  "archived",
] as const;

export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];
export const InquiryStatusSchema = z.enum(INQUIRY_STATUSES);

// ── Source Apps ───────────────────────────────────────────────────

export const SOURCE_APPS = [
  "js-mvp",
  "js-space-ai-page",
  "js-full-im-studio",
  "manual",
] as const;

export type SourceApp = (typeof SOURCE_APPS)[number];
export const SourceAppSchema = z.enum(SOURCE_APPS);
