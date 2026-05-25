import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "./record-event";

export interface PipelineTransitionInput {
  brokerId: string;
  buildingSsotLiteId?: string | null;
  leaseSpaceId?: string | null;
  fromStage: string;
  toStage: string;
  transitionReason?: string | null;
  holdDays?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Tracks a pipeline stage transition in the database and logs a corresponding event.
 */
export async function trackPipelineTransition(
  supabase: SupabaseClient,
  input: PipelineTransitionInput,
): Promise<{ id: string } | null> {
  const row = {
    broker_id: input.brokerId,
    building_ssot_lite_id: input.buildingSsotLiteId ?? null,
    lease_space_id: input.leaseSpaceId ?? null,
    from_stage: input.fromStage,
    to_stage: input.toStage,
    transition_reason: input.transitionReason ?? null,
    hold_days: input.holdDays ?? 0,
    metadata: input.metadata ?? {},
  };

  const { data, error } = await supabase
    .from("pipeline_stage_transitions")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[trackPipelineTransition] Database insert failed:", error.message);
    return null;
  }

  // Determine whether it's a lease pipeline transition or sale pipeline transition
  const isLease = !!input.leaseSpaceId;
  const eventType = isLease ? "lease_pipeline_transitioned" : "pipeline_stage_transitioned";

  await recordEvent(supabase, {
    actorId: input.brokerId,
    actorRole: "broker",
    eventType: eventType as any, // record-event will be updated to accept this type
    entityType: "pipeline_transition" as any,
    entityId: data.id,
    metadata: {
      fromStage: input.fromStage,
      toStage: input.toStage,
      transitionReason: input.transitionReason,
      holdDays: input.holdDays,
    },
  });

  return data;
}
