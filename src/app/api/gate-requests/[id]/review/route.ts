/**
 * PATCH /api/gate-requests/[id]/review
 *
 * Admin approves or rejects a gate request.
 * Auth: Required. Admin role only.
 *
 * POLICY: Protected fields are NEVER disclosed through this route.
 * Approval only changes status + provides next-step instructions.
 *
 * Source: docs/08-api-contracts.md section 13
 *         docs/11-gate-disclosure-policy.md section 10.5
 */
import { z } from "zod/v4";
import { reviewGateRequest } from "@/domain/gate/gate-request";
import { toApiError } from "@/lib/api-error";

const GateRequestReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerNote: z.string().optional(),
});

interface ReviewRouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: ReviewRouteParams) {
  try {
    const { id } = await params;
    const json = await req.json();
    const input = GateRequestReviewSchema.parse(json);

    // MVP placeholder reviewer ID — production uses session.user.id
    const ADMIN_REVIEWER_ID = "00000000-0000-0000-0000-000000000001";

    const result = await reviewGateRequest(id, input, ADMIN_REVIEWER_ID);

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
