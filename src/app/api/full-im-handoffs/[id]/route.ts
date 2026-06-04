/**
 * GET /api/full-im-handoffs/[id]
 * Fetch handoff payload by id or token — callable by Full IM Studio server.
 * Auth: required (service-role or admin)
 * Source: docs/06-handoff-api-contract.md §4.2
 *
 * Note: Previously at [token]/route.ts — merged to [id] to avoid
 * Next.js dynamic segment naming conflict.
 */
import { getHandoffByToken } from "@/domain/handoff/handoff";
import { validateInterServiceRequest } from "@/lib/inter-service-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // 1. Inter-service key validation
    if (!validateInterServiceRequest(_req)) {
      if (process.env.NODE_ENV === "production") {
        return Response.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "API 키가 유효하지 않습니다." } },
          { status: 401 }
        );
      }
    }

    if (!id || typeof id !== "string") {
      return Response.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "토큰이 필요합니다." } },
        { status: 400 },
      );
    }

    // id may be a UUID or a token string — getHandoffByToken accepts both
    const handoff = await getHandoffByToken(id);

    if (!handoff) {
      return Response.json(
        { ok: false, error: { code: "HANDOFF_INVALID", message: "유효하지 않은 핸드오프 토큰입니다." } },
        { status: 404 },
      );
    }

    // Status checks
    if (handoff.status === "expired") {
      return Response.json(
        { ok: false, error: { code: "HANDOFF_EXPIRED", message: "만료된 핸드오프 토큰입니다." } },
        { status: 410 },
      );
    }
    if (handoff.status === "revoked") {
      return Response.json(
        { ok: false, error: { code: "HANDOFF_REVOKED", message: "취소된 핸드오프입니다." } },
        { status: 410 },
      );
    }
    if (handoff.status === "imported") {
      return Response.json(
        { ok: false, error: { code: "HANDOFF_ALREADY_IMPORTED", message: "이미 가져온 핸드오프입니다." } },
        { status: 409 },
      );
    }

    // Expiry check
    if (new Date(handoff.expires_at) < new Date()) {
      return Response.json(
        { ok: false, error: { code: "HANDOFF_EXPIRED", message: "만료된 핸드오프 토큰입니다." } },
        { status: 410 },
      );
    }

    return Response.json({ ok: true, data: handoff });
  } catch (err) {
    console.error("[GET /api/full-im-handoffs/:id]", err);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
