/**
 * contracts/events.ts
 *
 * Activity event, AI run, and processing job schemas for audit trails.
 * All significant actions should emit an activity event.
 *
 * Ported from cre-aipage contracts/events.ts → Zod v4
 */

import { z } from "zod/v4";

// ── AI Run Statuses ──────────────────────────────────────────────

export const AI_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "blocked",
] as const;

export type AIRunStatus = (typeof AI_RUN_STATUSES)[number];

// ── Processing Job Statuses ──────────────────────────────────────

export const PROCESSING_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "blocked",
] as const;

export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number];

// ── Activity Event ───────────────────────────────────────────────

export const ActivityEventSchema = z.object({
  id: z.string().uuid().optional(),
  source_app: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  actor_role: z.string().optional(),
  event_name: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurred_at: z.string().optional(),
});

export type ActivityEvent = z.infer<typeof ActivityEventSchema>;

// ── P0 Event Names ───────────────────────────────────────────────

export const ACTIVITY_EVENTS = {
  // Space lifecycle
  SPACE_CREATED: "space.created",
  SPACE_UPDATED: "space.updated",
  SPACE_PUBLISHED: "space.published",
  SPACE_ARCHIVED: "space.archived",

  // Photos
  PHOTOS_UPLOADED: "photos.uploaded",
  PHOTOS_CLASSIFIED: "photos.classified",

  // Albums
  ALBUMS_GENERATED: "albums.generated",

  // Fit analysis
  TENANT_FIT_GENERATED: "tenant_fit.generated",
  VIBE_FIT_GENERATED: "vibe_fit.generated",

  // Leasing page
  LEASING_PAGE_GENERATED: "leasing_page.generated",
  LEASING_PAGE_PUBLISHED: "leasing_page.published",
  LEASING_PAGE_UNPUBLISHED: "leasing_page.unpublished",

  // Campaign copy
  CAMPAIGN_COPY_GENERATED: "campaign_copy.generated",
  CAMPAIGN_COPY_COPIED: "campaign_copy.copied",

  // Inquiry
  INQUIRY_SUBMITTED: "inquiry.submitted",
  INQUIRY_QUALIFIED: "inquiry.qualified",
  TOUR_REQUESTED: "tour.requested",
  TOUR_COMPLETED: "tour.completed",

  // Handoff
  FULL_IM_HANDOFF_CREATED: "full_im_handoff.created",
  MVP_HANDOFF_RECEIVED: "mvp_handoff.received",

  // Guard
  PUBLICATION_BLOCKED: "publication.blocked",
  HANDOFF_BLOCKED: "handoff.blocked",

  // Deal card (existing dealcard events)
  DEAL_CARD_CREATED: "deal_card.created",
  DEAL_CARD_MATCHED: "deal_card.matched",
  PIPELINE_STAGE_CHANGED: "pipeline.stage_changed",
  BUILDING_SNAPSHOT_GENERATED: "building.snapshot_generated",
} as const;

export type ActivityEventName =
  (typeof ACTIVITY_EVENTS)[keyof typeof ACTIVITY_EVENTS];

// ── AI Run ───────────────────────────────────────────────────────

export const AIRunSchema = z.object({
  id: z.string().uuid().optional(),
  space_id: z.string().uuid().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),

  agent_name: z.string(),
  model: z.string().optional(),
  prompt_version: z.string().optional(),
  input_summary: z.record(z.string(), z.unknown()).optional(),
  output_summary: z.record(z.string(), z.unknown()).optional(),

  status: z.enum(AI_RUN_STATUSES).optional(),
  error_message: z.string().optional(),

  created_by: z.string().uuid().optional(),
  created_at: z.string().optional(),
  completed_at: z.string().optional(),
});

export type AIRun = z.infer<typeof AIRunSchema>;

// ── Processing Job ───────────────────────────────────────────────

export const ProcessingJobSchema = z.object({
  id: z.string().uuid().optional(),
  job_type: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid().optional(),
  status: z.enum(PROCESSING_JOB_STATUSES).optional(),
  payload_json: z.record(z.string(), z.unknown()).optional(),
  error_message: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ProcessingJob = z.infer<typeof ProcessingJobSchema>;
