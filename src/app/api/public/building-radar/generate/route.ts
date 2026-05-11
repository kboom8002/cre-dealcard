/**
 * POST /api/public/building-radar/generate
 *
 * Public Deal Curiosity Report generation endpoint.
 * Auth: Optional.
 *
 * Source: docs/08-api-contracts.md section 5
 */
import { PublicBuildingRadarGenerateRequest } from "@/ai/schemas/api-building-radar";
import { generateBuildingRadar } from "@/domain/building/building-radar";
import { toApiError } from "@/lib/api-error";

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = PublicBuildingRadarGenerateRequest.parse(json);

    // Optional: extract user session if available
    // For MVP, anonymous access is allowed per docs/08
    const result = await generateBuildingRadar(input);

    return Response.json({
      ok: true,
      data: result,
    });
  } catch (error) {
    return toApiError(error);
  }
}
