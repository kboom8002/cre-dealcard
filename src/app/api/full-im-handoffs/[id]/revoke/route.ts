/**
 * POST /api/full-im-handoffs/[id]/revoke
 * Revoke a handoff (owner or admin only).
 * Auth: required
 * Source: docs/06-handoff-api-contract.md §4.3
 */
import { revokeHandoff } from "@/domain/handoff/handoff";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return Response.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } },
        { status: 401 },
      );
    }

    const { id } = await params;

    const result = await revokeHandoff(id, user.id);

    return Response.json({ ok: true, data: result });
  } catch (err) {
    console.error("[POST /api/full-im-handoffs/:id/revoke]", err);
    return Response.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
