/**
 * POST /api/full-im-handoffs
 * Create a handoff token for Full IM Studio import.
 * Auth: required (broker or admin)
 * Source: docs/06-handoff-api-contract.md §4.1
 */
import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createHandoff } from "@/domain/handoff/handoff";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("route");

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
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const userId = guard.user!.id;
  const isAdmin = guard.role === "admin";

  try {
    const json = await req.json();
    const input = CreateHandoffSchema.parse(json);

    const supabase = createServiceClient();
    const { data: building, error: bldErr } = await supabase
      .from("building_ssot_lite")
      .select("id, owner_id")
      .eq("id", input.source_building_ssot_lite_id)
      .maybeSingle();

    if (bldErr || !building) {
      return Response.json(
        { ok: false, error: { code: "NOT_FOUND", message: "대상 매물을 찾을 수 없습니다." } },
        { status: 404 },
      );
    }

    if (!isAdmin && building.owner_id !== userId) {
      return Response.json(
        { ok: false, error: { code: "FORBIDDEN", message: "본인 소유 매물에 대해서만 핸드오프를 생성할 수 있습니다." } },
        { status: 403 },
      );
    }

    const uniqueDocIds = Array.from(new Set(input.source_document_ids ?? []));
    if (uniqueDocIds.length > 0) {
      const { data: docs, error: docsErr } = await supabase
        .from("document_objects")
        .select("id, owner_id, building_id, source_id")
        .in("id", uniqueDocIds);

      if (docsErr || !docs || docs.length !== uniqueDocIds.length) {
        return Response.json(
          { ok: false, error: { code: "FORBIDDEN", message: "유효하지 않거나 접근 권한이 없는 문서가 포함되어 있습니다." } },
          { status: 403 },
        );
      }

      for (const doc of docs) {
        const matchesBuilding =
          doc.building_id === input.source_building_ssot_lite_id ||
          doc.source_id === input.source_building_ssot_lite_id;
        const matchesOwner = isAdmin || !doc.owner_id || doc.owner_id === userId;
        if (!matchesBuilding || !matchesOwner) {
          return Response.json(
            { ok: false, error: { code: "FORBIDDEN", message: "해당 매물 또는 소유자에 속하지 않는 문서입니다." } },
            { status: 403 },
          );
        }
      }
    }

    const result = await createHandoff(
      {
        sourceBuildingSsotLiteId: input.source_building_ssot_lite_id,
        sourceDocumentIds: uniqueDocIds,
        sourceBuyerIntentId: input.source_buyer_intent_id,
        sourceOwnerReadinessId: input.source_owner_readiness_id,
        sourceExpertNoteRequestId: input.source_expert_note_request_id,
        requestedOutput: input.requested_output,
        packageIntent: input.package_intent,
        actorRole: isAdmin ? "admin" : "broker",
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
    log.error("[POST /api/full-im-handoffs]", err);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
