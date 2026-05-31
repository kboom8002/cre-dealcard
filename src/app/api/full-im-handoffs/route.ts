/**
 * POST /api/full-im-handoffs
 * Create a handoff token for Full IM Studio import.
 * Auth: required (broker or admin)
 * Source: docs/06-handoff-api-contract.md §4.1
 */
import { z } from "zod/v4";
import { createHandoff } from "@/domain/handoff/handoff";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CreateHandoffSchema = z.object({
  source_building_ssot_lite_id: z.string().uuid(),
  source_document_ids: z.array(z.string().uuid()).optional().default([]),
  source_buyer_intent_id: z.string().uuid().optional(),
  source_owner_readiness_id: z.string().uuid().optional(),
  source_expert_note_request_id: z.string().uuid().optional(),
  requested_output: z.enum([
    "im_lite",
    "buyer_ready_full_im",
    "expert_review",
    "expert_full_build",
    "dealroom_ready_package",
  ]),
  package_intent: z
    .enum(["ai_self_authoring", "ai_expert_review", "expert_full_build", "dealroom_ready_package", "unknown"])
    .optional()
    .default("unknown"),
  full_im_studio_base_url: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Fallback to null if not logged in
    const userId = user?.id || null;

    const json = await req.json();
    const input = CreateHandoffSchema.parse(json);

    const result = await createHandoff(
      {
        sourceBuildingSsotLiteId: input.source_building_ssot_lite_id,
        sourceDocumentIds: input.source_document_ids,
        sourceBuyerIntentId: input.source_buyer_intent_id,
        sourceOwnerReadinessId: input.source_owner_readiness_id,
        sourceExpertNoteRequestId: input.source_expert_note_request_id,
        requestedOutput: input.requested_output,
        packageIntent: input.package_intent,
        fullImStudioBaseUrl: input.full_im_studio_base_url,
      },
      userId,
    );

    return Response.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "입력값을 확인해주세요.", details: err.issues } },
        { status: 400 },
      );
    }
    console.error("[POST /api/full-im-handoffs]", err);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
