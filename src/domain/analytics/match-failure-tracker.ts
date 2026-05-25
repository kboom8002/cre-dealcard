import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "./record-event";

export interface MatchFailureInput {
  brokerId: string;
  matchResultId?: string | null;
  leaseSpaceId?: string | null;
  tenantIntentId?: string | null;
  entityType: "sale" | "lease";
  failureReason: string;
  priceGapPct?: number | null;
  rejectedBy: "buyer" | "tenant" | "owner" | "broker";
  rejectionDetail?: string | null;
}

/**
 * Tracks a match failure in the database and logs a corresponding event.
 */
export async function trackMatchFailure(
  supabase: SupabaseClient,
  input: MatchFailureInput,
): Promise<{ id: string } | null> {
  const row = {
    broker_id: input.brokerId,
    match_result_id: input.matchResultId ?? null,
    lease_space_id: input.leaseSpaceId ?? null,
    tenant_intent_id: input.tenantIntentId ?? null,
    entity_type: input.entityType,
    failure_reason: input.failureReason,
    price_gap_pct: input.priceGapPct ?? null,
    rejected_by: input.rejectedBy,
    rejection_detail: input.rejectionDetail ?? null,
  };

  const { data, error } = await supabase
    .from("match_failure_logs")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    console.error("[trackMatchFailure] Database insert failed:", error.message);
    return null;
  }

  await recordEvent(supabase, {
    actorId: input.brokerId,
    actorRole: "broker",
    eventType: "match_failure_recorded" as any, // record-event will be updated to accept this type
    entityType: "match_failure" as any,
    entityId: data.id,
    metadata: {
      entityType: input.entityType,
      failureReason: input.failureReason,
      rejectedBy: input.rejectedBy,
      priceGapPct: input.priceGapPct,
    },
  });

  return data;
}
