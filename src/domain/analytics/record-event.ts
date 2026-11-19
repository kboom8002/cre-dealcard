/**
 * Analytics domain service — activity_events
 *
 * Every important create/update/share action must create an activity_event.
 * Do not log raw sensitive data in metadata.
 *
 * Source: docs/13-event-analytics.md
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityEventInsert } from "@/types/database";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('record-event');


/** Known event types for the MVP */
export type MvpEventType =
  | "address_submitted"
  | "public_purpose_selected"
  | "building_ssot_lite_created"
  | "building_ssot_lite_updated"
  | "building_signal_card_created"
  | "deal_curiosity_report_generated"
  | "broker_memo_submitted"
  | "blind_teaser_generated"
  | "kakao_copy_clicked"
  | "document_shared"
  | "buyer_intent_created"
  | "buyer_memo_generated"
  | "owner_readiness_checked"
  | "missing_data_checklist_generated"
  | "gate_request_created"
  | "gate_request_reviewed"
  | "expert_note_requested"
  | "expert_note_completed"
  | "ai_run_completed"
  | "ai_run_failed"
  | "building_lease_roll_updated"
  | "building_evidence_uploaded"
  | "building_disclosure_updated"
  | "building_snapshot_generated"
  | "im_lite_generated"
  | "pipeline_stage_transitioned"
  | "match_failure_recorded"
  | "price_negotiation_logged"
  | "market_indicator_computed"
  | "lease_pipeline_transitioned"
  | "funding_project_created"
  | "booking_hold_created"
  | "slot_hold_expired"
  | "vibe_card_view"
  | "vibe_to_im_click"
  | "vibe_to_magazine_click"
  | "im_to_vibe_click"
  | "magazine_to_im_click"
  | "magazine_to_vibe_click"
  | "magazine_view"
  | "magazine_subscribe"
  | "magazine_distributed"
  | "im_view_alert_sent"
  | "hot_lead_detected"
  | "hot_lead_alert_sent"
  | "tenant_intent_created";

/** Known entity types */
export type MvpEntityType =
  | "building_ssot_lite"
  | "building_signal_card"
  | "buyer_intent_lite"
  | "tenant_intent"
  | "owner_readiness_check"
  | "document_object"
  | "gate_request"
  | "gate_request_lite"
  | "expert_note_request"
  | "evidence_file"
  | "ai_run"
  | "session"
  | "pipeline_transition"
  | "match_failure"
  | "price_negotiation"
  | "market_indicator"
  | "lease_pipeline_entry"
  | "funding_project"
  | "booking"
  | "availability_slot"
  | "investor_profile";

export interface RecordEventInput {
  actorId?: string | null;
  actorRole?: string;
  eventType: MvpEventType;
  entityType?: MvpEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `activity_events.entity_id` is a nullable uuid column (00001_mvp_schema.sql). */
export function isUuidLike(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * P1-1 (WP-7.3A): Build a row that satisfies the `activity_events` schema.
 * A non-uuid entity identifier (e.g. an `ERR-XXXX` reference code or a legacy slug)
 * would make the whole insert fail with 22P02 and the event would be lost silently,
 * so it is moved into `metadata.entity_ref` and `entity_id` is stored as NULL.
 * `source_app` is never set here (NULL passes the 00005 CHECK constraint).
 */
export function buildActivityEventRow(input: RecordEventInput): ActivityEventInsert {
  const rawEntityId = typeof input.entityId === "string" ? input.entityId.trim() : "";
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
  let entityId: string | null = null;
  if (rawEntityId) {
    if (isUuidLike(rawEntityId)) {
      entityId = rawEntityId;
    } else if (metadata.entity_ref === undefined) {
      metadata.entity_ref = rawEntityId.slice(0, 128);
    }
  }
  return {
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? null,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: entityId,
    metadata: metadata as ActivityEventInsert["metadata"],
  };
}

/**
 * Record an activity event using the provided Supabase client.
 *
 * Uses service-role client for server-side logging,
 * or authenticated client for client-initiated events.
 */
export async function recordEvent(
  supabase: SupabaseClient,
  input: RecordEventInput,
): Promise<{ id: string } | null> {
  const row: ActivityEventInsert = buildActivityEventRow(input);

  const { data, error } = await supabase
    .from("activity_events")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    log.error("[recordEvent] Failed:", error.message);
    return null;
  }

  return data;
}

/**
 * Record multiple activity events in a single batch.
 */
export async function recordEvents(
  supabase: SupabaseClient,
  inputs: RecordEventInput[],
): Promise<Array<{ id: string }>> {
  if (!inputs || inputs.length === 0) return [];
  const rows: ActivityEventInsert[] = inputs.map(input => buildActivityEventRow(input));

  const { data, error } = await supabase
    .from("activity_events")
    .insert(rows)
    .select("id");

  if (error) {
    log.error("[recordEvents] Failed:", error.message);
    return [];
  }

  return data ?? [];
}
