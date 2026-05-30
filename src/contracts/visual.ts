/**
 * contracts/visual.ts
 *
 * Visual asset, photo classification, and album schemas.
 * Defines the structure for AI-classified photos and
 * tenant-type-specific visual answer albums.
 *
 * Ported from cre-aipage contracts/visual.ts → Zod v4
 */

import { z } from "zod";
import {
  CaptureScopeSchema,
  ConfidenceLevelSchema,
  EvidenceStrengthSchema,
  TenantTypeSchema,
  VisibilityTierSchema,
  VisualAssetStatusSchema,
} from "./enums";

// ── Photo Quality ────────────────────────────────────────────────

export const PhotoQualitySchema = z.object({
  quality_score: z.number().min(0).max(100),
  blur: z.enum(["low", "medium", "high"]),
  brightness: z.enum(["dark", "low", "good", "overexposed"]),
  recommended_use: z.enum(["album", "backup", "needs_review", "unusable"]),
});

export type PhotoQuality = z.infer<typeof PhotoQualitySchema>;

// ── Visual Asset ─────────────────────────────────────────────────

export const VisualAssetSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  building_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  storage_bucket: z.string(),
  storage_path: z.string(),
  public_url: z.string().optional(),
  thumbnail_url: z.string().optional(),

  status: VisualAssetStatusSchema.optional(),

  // AI classification results
  capture_scope: CaptureScopeSchema.optional(),
  capture_subject: z.string().optional(),
  quality: PhotoQualitySchema.optional(),

  tags: z.array(z.string()).optional(),
  facility_tags: z.array(z.string()).optional(),
  risk_tags: z.array(z.string()).optional(),
  vibe_tags: z.array(z.string()).optional(),
  tenant_relevance: z.array(TenantTypeSchema).optional(),
  answers_questions: z.array(z.string()).optional(),

  visibility: VisibilityTierSchema.optional(),
  confidence: ConfidenceLevelSchema.optional(),

  ai_generated: z.boolean().optional(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type VisualAsset = z.infer<typeof VisualAssetSchema>;

// ── Photo Classification (Agent output) ──────────────────────────

export const PhotoClassificationSchema = z.object({
  visual_asset_id: z.string(),
  capture_scope: CaptureScopeSchema,
  capture_subject: z.string(),
  quality: PhotoQualitySchema,
  tags: z.array(z.string()),
  facility_tags: z.array(z.string()),
  risk_tags: z.array(z.string()),
  vibe_tags: z.array(z.string()),
  tenant_relevance: z.array(TenantTypeSchema),
  answers_questions: z.array(z.string()),
  visibility_recommendation: VisibilityTierSchema,
  confidence: ConfidenceLevelSchema,
  needs_review: z.boolean(),
});

export type PhotoClassification = z.infer<typeof PhotoClassificationSchema>;

// ── Album Answer Card ────────────────────────────────────────────

export const AlbumAnswerCardSchema = z.object({
  question: z.string(),
  answer: z.string(),
  related_visual_asset_ids: z.array(z.string()),
});

export type AlbumAnswerCard = z.infer<typeof AlbumAnswerCardSchema>;

// ── Visual Album ─────────────────────────────────────────────────

export const VisualAlbumSchema = z.object({
  id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),

  album_type: z.string(),
  target_tenant_type: TenantTypeSchema.optional(),
  target_question: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),

  evidence_strength: EvidenceStrengthSchema.optional(),
  main_answer: z.string().optional(),

  photos: z
    .array(
      z.object({
        visual_asset_id: z.string(),
        caption: z.string().optional(),
      })
    )
    .optional(),

  answer_cards: z.array(AlbumAnswerCardSchema).optional(),

  missing_checks: z.array(z.string()).optional(),

  visibility: VisibilityTierSchema.optional(),
  confidence: ConfidenceLevelSchema.optional(),

  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type VisualAlbum = z.infer<typeof VisualAlbumSchema>;

// ── Missing Shot Request ─────────────────────────────────────────

export const MissingShotRequestSchema = z.object({
  field: z.string(),
  reason: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

export type MissingShotRequest = z.infer<typeof MissingShotRequestSchema>;
