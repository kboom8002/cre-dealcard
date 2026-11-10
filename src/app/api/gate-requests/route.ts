/**
 * POST /api/gate-requests
 *
 * Create a Gate Request Lite for a building.
 * Auth: Optional (anonymous requests permitted for G1).
 *
 * Source: docs/08-api-contracts.md section 12
 */
import { z } from "zod/v4";
import { createGateRequest } from "@/domain/gate/gate-request";
import { toApiError } from "@/lib/api-error";

const GateRequestCreateSchema = z.object({
  buildingId: z.string().min(1).optional(),
  building_id: z.string().min(1).optional(),
  requestedLevel: z.enum(["G1", "G2", "G3"]).default("G1"),
  requestedFields: z.array(z.string()).default([]),
  reason: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  message: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = GateRequestCreateSchema.parse(json);
    const effectiveBuildingId = (input.buildingId || input.building_id || "").trim();
    if (!effectiveBuildingId) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "buildingId is required" } },
        { status: 400 },
      );
    }

    const effectiveReason =
      input.reason ||
      (input.name || input.phone
        ? JSON.stringify({
            type: "anonymous_lead",
            name: input.name?.trim(),
            phone: input.phone?.trim(),
            company: input.company?.trim() || undefined,
            message: input.message?.trim() || "상세 IM 열람을 요청합니다.",
          })
        : undefined);

    const result = await createGateRequest(
      {
        buildingId: effectiveBuildingId,
        requestedLevel: input.requestedLevel,
        requestedFields: input.requestedFields,
        reason: effectiveReason,
      },
      null, // anonymous in MVP
    );

    return Response.json({ ok: true, id: result.gateRequestId, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
