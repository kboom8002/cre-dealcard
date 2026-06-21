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
import { requireBroker } from "@/lib/auth-guard";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const GateRequestReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewerNote: z.string().optional(),
});

interface ReviewRouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: ReviewRouteParams) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;

    const { id } = await params;
    const json = await req.json();
    const input = GateRequestReviewSchema.parse(json);

    const supabase = createServiceClient();
    
    // Verify ownership: the reviewer must be the owner of the building
    const { data: gateReq, error: fetchErr } = await supabase
      .from("gate_requests")
      .select("building_id")
      .eq("id", id)
      .single();
      
    if (fetchErr || !gateReq) {
      return NextResponse.json({ error: "Gate request not found" }, { status: 404 });
    }

    const { data: building, error: bldgErr } = await supabase
      .from("building_ssot_lite")
      .select("owner_id")
      .eq("id", gateReq.building_id)
      .single();

    if (bldgErr || !building || building.owner_id !== guard.user!.id) {
      return NextResponse.json({ error: "Forbidden: not your building" }, { status: 403 });
    }

    const result = await reviewGateRequest(id, input, guard.user!.id);

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
