/**
 * GET /api/space-ai-handoffs/return
 *
 * MVP side: polls Space AI Page for return results (leasing_page_url, kakao_copy,
 * inquiry_summary) after the broker has completed Space AI Page setup.
 *
 * Usage:
 *   GET /api/space-ai-handoffs/return?spaceId=<uuid>
 *
 * In production, the Space AI Page would call POST /api/space-ai-handoffs/return-webhook,
 * but for MVP we use a pull pattern for simplicity.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { toApiError } from "@/lib/api-error";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const spaceId = url.searchParams.get("spaceId");

    if (!spaceId) {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "spaceId가 필요합니다." } },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const spaceAiBaseUrl =
      process.env.SPACE_AI_PAGE_URL || "http://localhost:3003";

    // 1. Find the handoff record for this space
    const { data: handoff } = await supabase
      .from("space_ai_handoffs")
      .select("id, space_ai_space_id, space_ai_handoff_id, status")
      .eq("space_ai_space_id", spaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!handoff || handoff.status !== "imported") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "NOT_FOUND",
            message: "해당 공간의 핸드오프 기록을 찾을 수 없습니다.",
          },
        },
        { status: 404 }
      );
    }

    // 2. Fetch return results from Space AI Page
    const res = await fetch(
      `${spaceAiBaseUrl}/api/handoffs/to-mvp`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: spaceId,
          include_kakao_copy: true,
          include_inquiry_summary: true,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return Response.json(
        {
          ok: false,
          error: {
            code: "SPACE_AI_RETURN_FAILED",
            message: "Space AI Page에서 결과를 가져오지 못했습니다.",
            detail: errText,
          },
        },
        { status: 502 }
      );
    }

    const returnData = await res.json();

    return Response.json({
      ok: true,
      data: {
        spaceId,
        leasingPageUrl: returnData.leasing_page_url,
        kakaoCopy: returnData.kakao_copy,
        inquirySummary: returnData.inquiry_summary,
        nextAction: returnData.next_action,
        boundaryNote: returnData.boundary_note,
      },
    });
  } catch (error) {
    return toApiError(error);
  }
}
