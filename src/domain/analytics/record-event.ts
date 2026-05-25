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
  | "funding_project_created";

/** Known entity types */
export type MvpEntityType =
  | "building_ssot_lite"
  | "building_signal_card"
  | "buyer_intent_lite"
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
  | "market_indicator"
  | "funding_project"
  | "investor_profile";

export interface RecordEventInput {
  actorId?: string | null;
  actorRole?: string;
  eventType: MvpEventType;
  entityType?: MvpEntityType;
  entityId?: string;
  metadata?: Record<string, unknown>;
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
  const row: ActivityEventInsert = {
    actor_id: input.actorId ?? null,
    actor_role: input.actorRole ?? null,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("activity_events")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[recordEvent] Failed:", error.message);
    return null;
  }

  return data;
}
