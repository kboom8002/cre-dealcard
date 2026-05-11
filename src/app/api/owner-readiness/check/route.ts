/**
 * POST /api/owner-readiness/check
 *
 * Calculate readiness score from checklist and persist result.
 * Auth: Optional.
 *
 * Source: docs/08-api-contracts.md section 11
 */
import { z } from "zod/v4";
import { checkOwnerReadiness } from "@/domain/owner/owner-readiness";
import { toApiError } from "@/lib/api-error";

const ChecklistSchema = z.object({
  buildingRegister: z.boolean().default(false),
  registry: z.boolean().default(false),
  landUsePlan: z.boolean().default(false),
  rentRoll: z.boolean().default(false),
  photos: z.boolean().default(false),
  floorPlan: z.boolean().default(false),
  repairHistory: z.boolean().default(false),
  vacancyStatus: z.boolean().default(false),
  askingPrice: z.boolean().default(false),
  disclosurePolicy: z.boolean().default(false),
});

const OwnerReadinessCheckRequest = z.object({
  buildingId: z.string().uuid().optional(),
  checklist: ChecklistSchema,
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = OwnerReadinessCheckRequest.parse(json);

    const result = await checkOwnerReadiness(
      input.checklist,
      input.buildingId ?? null,
      null, // anonymous for MVP
    );

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
