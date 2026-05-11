/**
 * Domain service: expert note request
 *
 * Creates an expert_note_request record and logs activity event.
 * Source: docs/08-api-contracts.md section 14
 */
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";

export interface ExpertNoteRequestInput {
  buildingId?: string;
  aiReportId?: string;
  userGoal:
    | "my_building"
    | "buy_consideration"
    | "client_listing"
    | "client_recommendation"
    | "learning";
  contact: {
    name?: string;
    phone?: string;
    email?: string;
  };
  memo?: string;
}

export interface ExpertNoteRequestResult {
  requestId: string;
  status: "requested";
}

export async function createExpertNoteRequest(
  input: ExpertNoteRequestInput,
  userId: string | null,
): Promise<ExpertNoteRequestResult> {
  const supabase = createServiceClient();

  const { data: request, error } = await supabase
    .from("expert_note_requests")
    .insert({
      user_id: userId,
      building_id: input.buildingId ?? null,
      ai_report_id: input.aiReportId ?? null,
      request_type: "expert_3_line_note",
      user_goal: input.userGoal,
      contact: input.contact as unknown as Record<string, unknown>,
      status: "requested",
    })
    .select("id")
    .single();

  if (error || !request) {
    throw new Error(`Failed to create expert note request: ${error?.message}`);
  }

  // Log activity event
  await recordEvent(supabase, {
    actorId: userId ?? undefined,
    actorRole: userId ? "authenticated" : "anonymous",
    eventType: "expert_note_requested",
    entityType: "expert_note_request",
    entityId: request.id,
    metadata: {
      user_goal: input.userGoal,
      building_id: input.buildingId ?? null,
      has_contact: !!(input.contact.phone || input.contact.email),
    },
  });

  return { requestId: request.id, status: "requested" };
}
