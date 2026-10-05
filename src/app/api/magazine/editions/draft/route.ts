import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, jsonError } from "@/lib/magazine/authz";
import { currentWeekLabel } from "@/lib/magazine/kst";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { isMagazineSendEnabled, isMagazineSendDryRun } from "@/lib/magazine/send-flags";
import { getOrCreateDraftEdition } from "@/lib/magazine/edition-draft";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("api-magazine-editions-draft");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[a-z][a-z0-9_]{0,29}$/;

const BodySchema = z.object({
  edition_type: z.string().regex(TOKEN_RE).default("weekly"),
  edition_label: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9가-힣][A-Za-z0-9가-힣 _.\-]{0,39}$/)
    .optional(),
});

/**
 * POST /api/magazine/editions/draft
 * 에디터 진입 시 호출: 이번 호 초안(없으면 빈 초안 생성, 발행본이 있으면 발행본)을 돌려준다.
 * magazine_issues(공개 행)는 건드리지 않는다. body.broker_id 는 무시(서버가 ctx 로 결정).
 * meta: 발송 플래그(서버 전용 env)와 수신자 수 — 확인 모달/안내 문구용.
 */
export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request, { requireSlug: true });
    if (authError || !ctx || !ctx.slug) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown = {};
    try {
      const text = await request.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }
    const parsed = BodySchema.safeParse(raw ?? {});
    if (!parsed.success) return jsonError("INVALID_INPUT", "입력값을 확인해 주세요.", 400);

    const supabase = createServiceClient();
    const { edition, created } = await getOrCreateDraftEdition(
      supabase,
      { slug: ctx.slug, brokerKeys: ctx.brokerKeys },
      {
        editionType: parsed.data.edition_type,
        editionLabel: parsed.data.edition_label ?? currentWeekLabel(),
      },
    );

    // 수신자 수(활성 구독자) — 실패해도 초안 로드는 성공시킨다(null = 확인 불가)
    let subscriberCount: number | null = null;
    const { count, error: cntErr } = await supabase
      .from("magazine_subscribers")
      .select("id", { count: "exact", head: true })
      .in("broker_id", ctx.brokerKeys)
      .eq("status", "active");
    if (cntErr) log.warn("subscriber count failed", { error: cntErr.message });
    else subscriberCount = count ?? 0;

    return NextResponse.json(
      {
        edition,
        created,
        meta: {
          sendEnabled: isMagazineSendEnabled(),
          dryRun: isMagazineSendDryRun(),
          subscriberCount,
        },
      },
      { status: created ? 201 : 200 },
    );
  } catch (err: unknown) {
    log.error("[api/magazine/editions/draft]", err instanceof Error ? err.message : String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
