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
  buildingId: z.string().uuid(),
  requestedLevel: z.enum(["G1", "G2", "G3"]),
  requestedFields: z.array(z.string()).default([]),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = GateRequestCreateSchema.parse(json);

    const result = await createGateRequest(
      {
        buildingId: input.buildingId,
        requestedLevel: input.requestedLevel,
        requestedFields: input.requestedFields,
        reason: input.reason,
      },
      null, // anonymous in MVP
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
