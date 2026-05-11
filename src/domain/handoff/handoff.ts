/**
 * Domain service: Full IM Handoff
 *
 * MVP side of the handoff API contract (docs/06-handoff-api-contract.md).
 * Responsible for:
 *   - Creating handoff tokens
 *   - Fetching handoff payload by token
 *   - Revoking handoffs
 *   - Recording full_im_handoff events
 */
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";

export interface CreateHandoffInput {
  sourceBuildingSsotLiteId: string;
  sourceDocumentIds?: string[];
  sourceBuyerIntentId?: string;
  sourceOwnerReadinessId?: string;
  sourceExpertNoteRequestId?: string;
  requestedOutput: "im_lite" | "buyer_ready_full_im" | "expert_review" | "expert_full_build" | "dealroom_ready_package" | "mobile_im";
  packageIntent?: "ai_self_authoring" | "ai_expert_review" | "expert_full_build" | "dealroom_ready_package" | "unknown";
  actorRole?: "public_user" | "owner" | "broker" | "admin" | "system";
  sourceVisibilityLevel?: string;
  allowedImportScope?: string[];
  fullImStudioBaseUrl?: string;
}

export interface CreateHandoffResult {
  handoff_id: string;
  handoff_token: string;
  handoff_url: string;
  expires_at: string;
  status: "created";
}

export interface HandoffPayload {
  handoff_id: string;
  handoff_token: string;
  status: string;
  source_app: "js-building-ssot-mvp";
  source_app_version: string;
  contracts_version: string;
  payload_version: string;
  source_building_ssot_lite_id: string;
  source_document_ids: string[];
  source_buyer_intent_id?: string;
  source_owner_readiness_id?: string;
  source_expert_note_request_id?: string;
  requested_output: string;
  package_intent: string;
  actor_role: string;
  source_visibility_level: string;
  allowed_import_scope: string[];
  expires_at: string;
  created_at: string;
  // Enriched building_ssot_lite data (for Full IM to use)
  building_ssot_lite?: Record<string, unknown>;
}

export async function createHandoff(
  input: CreateHandoffInput,
  userId: string,
): Promise<CreateHandoffResult> {
  const supabase = createServiceClient();

  const fullImBaseUrl = input.fullImStudioBaseUrl ?? process.env.FULL_IM_STUDIO_URL ?? "http://localhost:3005";

  const { data: handoff, error } = await supabase
    .from("full_im_handoffs")
    .insert({
      source_building_ssot_lite_id: input.sourceBuildingSsotLiteId,
      source_document_ids: input.sourceDocumentIds ?? [],
      source_buyer_intent_id: input.sourceBuyerIntentId ?? null,
      source_owner_readiness_id: input.sourceOwnerReadinessId ?? null,
      source_expert_note_request_id: input.sourceExpertNoteRequestId ?? null,
      requested_output: input.requestedOutput,
      package_intent: input.packageIntent ?? "unknown",
      created_by: userId,
      actor_role: input.actorRole ?? "broker",
      source_visibility_level: input.sourceVisibilityLevel ?? "internal_only",
      allowed_import_scope: input.allowedImportScope ?? ["building_ssot_lite"],
      status: "created",
    })
    .select("id, handoff_token, expires_at")
    .single();

  if (error || !handoff) {
    throw new Error(`Failed to create handoff: ${error?.message}`);
  }

  // Record event on activity_events with source_app tag
  await supabase.from("activity_events").insert({
    actor_id: userId,
    actor_role: input.actorRole ?? "broker",
    event_type: "full_im_handoff_created",
    entity_type: "full_im_handoff",
    entity_id: handoff.id,
    source_app: "js-building-ssot-mvp",
    metadata: {
      source_building_ssot_lite_id: input.sourceBuildingSsotLiteId,
      requested_output: input.requestedOutput,
      package_intent: input.packageIntent ?? "unknown",
    },
  });

  return {
    handoff_id: handoff.id,
    handoff_token: handoff.handoff_token,
    handoff_url: `${fullImBaseUrl}/im-projects/import?handoff_token=${handoff.handoff_token}`,
    expires_at: handoff.expires_at,
    status: "created",
  };
}

export async function getHandoffByToken(token: string): Promise<HandoffPayload | null> {
  const supabase = createServiceClient();

  const { data: handoff, error } = await supabase
    .from("full_im_handoffs")
    .select(`
      id, handoff_token, status, contracts_version, payload_version,
      source_building_ssot_lite_id, source_document_ids,
      source_buyer_intent_id, source_owner_readiness_id, source_expert_note_request_id,
      requested_output, package_intent, actor_role,
      source_visibility_level, allowed_import_scope,
      expires_at, created_at,
      building_ssot_lite:source_building_ssot_lite_id (
        id, area_signal, asset_type, price_band, size_signal,
        current_use_signal, vacancy_signal, fit_summary, caution_summary,
        hidden_fields, status, disclosure, confidence
      )
    `)
    .eq("handoff_token", token)
    .single();

  if (error || !handoff) return null;

  // Mark as pending_import if still created
  if (handoff.status === "created") {
    await supabase
      .from("full_im_handoffs")
      .update({ status: "pending_import" })
      .eq("id", handoff.id);
  }

  return {
    handoff_id: handoff.id,
    handoff_token: handoff.handoff_token,
    status: handoff.status === "created" ? "pending_import" : handoff.status,
    source_app: "js-building-ssot-mvp",
    source_app_version: "0.1.0",
    contracts_version: handoff.contracts_version,
    payload_version: handoff.payload_version,
    source_building_ssot_lite_id: handoff.source_building_ssot_lite_id,
    source_document_ids: handoff.source_document_ids ?? [],
    source_buyer_intent_id: handoff.source_buyer_intent_id ?? undefined,
    source_owner_readiness_id: handoff.source_owner_readiness_id ?? undefined,
    source_expert_note_request_id: handoff.source_expert_note_request_id ?? undefined,
    requested_output: handoff.requested_output,
    package_intent: handoff.package_intent,
    actor_role: handoff.actor_role,
    source_visibility_level: handoff.source_visibility_level,
    allowed_import_scope: handoff.allowed_import_scope ?? ["building_ssot_lite"],
    expires_at: handoff.expires_at,
    created_at: handoff.created_at,
    building_ssot_lite: (handoff.building_ssot_lite as unknown as Record<string, unknown>) ?? undefined,
  };
}

export async function revokeHandoff(
  handoffId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("full_im_handoffs")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("id", handoffId)
    .eq("created_by", userId)  // only own handoffs
    .in("status", ["created", "pending_import"]);  // can only revoke active ones

  if (error) {
    throw new Error(`Failed to revoke handoff: ${error.message}`);
  }

  await supabase.from("activity_events").insert({
    actor_id: userId,
    actor_role: "broker",
    event_type: "full_im_handoff_revoked",
    entity_type: "full_im_handoff",
    entity_id: handoffId,
    source_app: "js-building-ssot-mvp",
    metadata: {},
  });

  return { ok: true };
}

export async function markHandoffImported(
  handoffId: string,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("full_im_handoffs")
    .update({ status: "imported", imported_at: new Date().toISOString() })
    .eq("id", handoffId);
}
