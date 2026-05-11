/**
 * POST /api/expert-note/request
 *
 * Create an expert 3-line note request.
 * Auth: Optional — contact details required if anonymous.
 *
 * Source: docs/08-api-contracts.md section 14
 */
import { z } from "zod/v4";
import { createExpertNoteRequest } from "@/domain/owner/expert-note-request";
import { toApiError } from "@/lib/api-error";

const ExpertNoteRequestSchema = z.object({
  buildingId: z.string().uuid().optional(),
  aiReportId: z.string().uuid().optional(),
  userGoal: z.enum([
    "my_building",
    "buy_consideration",
    "client_listing",
    "client_recommendation",
    "learning",
  ]),
  contact: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
  }),
  memo: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = ExpertNoteRequestSchema.parse(json);

    const result = await createExpertNoteRequest(input, null);

    return Response.json({ ok: true, data: result });
  } catch (error) {
    return toApiError(error);
  }
}
