/**
 * Domain service: gate requests
 *
 * Create gate request, review (approve/reject), enforce disclosure guardrails.
 * Source: docs/08-api-contracts.md sections 12-13
 *         docs/11-gate-disclosure-policy.md section 10
 */
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";
import type { GateLevel, GateRequestStatus } from "@/types/database";

// ---------------------------------------------------------------------------
// Create Gate Request
// ---------------------------------------------------------------------------

export interface CreateGateRequestInput {
  buildingId: string;
  requestedLevel: GateLevel;
  requestedFields: string[];
  reason?: string;
}

export interface CreateGateRequestResult {
  gateRequestId: string;
  status: "submitted";
}

export async function createGateRequest(
  input: CreateGateRequestInput,
  requesterId: string | null,
): Promise<CreateGateRequestResult> {
  const supabase = createServiceClient();

  // Validate level — G4/G5 not implemented in MVP
  const allowedLevels: GateLevel[] = ["G1", "G2", "G3"];
  if (!allowedLevels.includes(input.requestedLevel)) {
    throw new Error(`Gate level ${input.requestedLevel} is not supported in MVP v0.1`);
  }

  // Validate building exists before creating request
  const { data: building, error: buildingErr } = await supabase
    .from("building_ssot_lite")
    .select("id, status")
    .eq("id", input.buildingId)
    .single();

  if (buildingErr || !building) {
    throw new Error("건물 정보를 찾을 수 없습니다.");
  }

  // POLICY: Never auto-approve — always starts as submitted
  const { data: gateRequest, error } = await supabase
    .from("gate_requests")
    .insert({
      building_id: input.buildingId,
      requester_id: requesterId,
      requested_level: input.requestedLevel,
      requested_fields: input.requestedFields,
      reason: input.reason ?? null,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error || !gateRequest) {
    throw new Error(`Gate request 생성에 실패했습니다: ${error?.message}`);
  }

  // Fetch building owner for metadata tracking
  const { data: bldg } = await supabase
    .from("building_ssot_lite")
    .select("owner_id")
    .eq("id", input.buildingId)
    .single();

  await recordEvent(supabase, {
    actorId: requesterId ?? undefined,
    actorRole: requesterId ? "authenticated" : "anonymous",
    eventType: "gate_request_created",
    entityType: "gate_request",
    entityId: gateRequest.id,
    metadata: {
      building_id: input.buildingId,
      requested_level: input.requestedLevel,
      requested_fields: input.requestedFields,
      broker_id: bldg?.owner_id,
    },
  });

  return { gateRequestId: gateRequest.id, status: "submitted" };
}

// ---------------------------------------------------------------------------
// Review Gate Request (admin only)
// ---------------------------------------------------------------------------

export interface ReviewGateRequestInput {
  decision: "approved" | "rejected";
  reviewerNote?: string;
}

export interface ReviewGateRequestResult {
  gateRequestId: string;
  status: GateRequestStatus;
  reviewedAt: string;
}

export async function reviewGateRequest(
  gateRequestId: string,
  input: ReviewGateRequestInput,
  reviewerId: string,
): Promise<ReviewGateRequestResult> {
  const supabase = createServiceClient();

  // Fetch existing request
  const { data: existing, error: fetchErr } = await supabase
    .from("gate_requests")
    .select("id, status, building_id, requested_level, requested_fields")
    .eq("id", gateRequestId)
    .single();

  if (fetchErr || !existing) {
    throw new Error("Gate request를 찾을 수 없습니다.");
  }

  // Can only review from submitted or broker_review
  const reviewableStatuses = ["submitted", "broker_review"];
  if (!reviewableStatuses.includes(existing.status)) {
    throw new Error(`현재 상태 (${existing.status})에서는 검토할 수 없습니다.`);
  }

  const newStatus: GateRequestStatus =
    input.decision === "approved" ? "approved" : "rejected";
  const reviewedAt = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("gate_requests")
    .update({
      status: newStatus,
      reviewer_id: reviewerId,
      reviewed_at: reviewedAt,
    })
    .eq("id", gateRequestId);

  if (updateErr) {
    throw new Error(`Gate request 검토에 실패했습니다: ${updateErr.message}`);
  }

  await recordEvent(supabase, {
    actorId: reviewerId,
    actorRole: "admin",
    eventType: "gate_request_reviewed",
    entityType: "gate_request",
    entityId: gateRequestId,
    metadata: {
      decision: input.decision,
      building_id: existing.building_id,
      requested_level: existing.requested_level,
      reviewer_note: input.reviewerNote ?? null,
    },
  });

  return { gateRequestId, status: newStatus, reviewedAt };
}
