/**
 * POST / GET /api/space-ai-handoffs
 *
 * MVP side: sends a broker memo + space basics to Space AI Page (cre-aipage)
 * to start the leasing marketing flow.
 *
 * Auth: Required (`requireBroker(req)`), binding `brokerId` strictly to `guard.user.id`,
 * unless a valid HMAC-SHA256 inter-service signature (`x-handoff-signature`) is verified
 * via `crypto.timingSafeEqual`.
 *
 * Source: docs/23-handoff-api.md section 3 (Integration with JS MVP)
 */
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("space-ai-handoffs");

const SpaceAIHandoffRequest = z.object({
  /** building_ssot_lite_id to link the space to existing building data */
  buildingSsotLiteId: z.string().uuid().optional(),
  /** Broker memo text (from Kakao or manual input) */
  memoText: z.string().min(2),
  /** Basic space facts — used by SpaceStructuringAgent */
  spaceBasics: z
    .object({
      floor: z.string().optional(),
      areaPrivatePy: z.number().positive().optional(),
      depositKrw: z.number().nonnegative().optional(),
      monthlyRentKrw: z.number().nonnegative().optional(),
    })
    .optional(),
  /** Tenant type hints — e.g. ["clinic", "premium_office"] */
  targetTenantTypes: z.array(z.string()).default([]),
  brokerId: z.string().uuid().optional(),
});

function verifyInterServiceHmac(req: NextRequest, messagePayload: string): boolean {
  const secret = (process.env.SPACE_AI_HANDOFF_SECRET || "").trim();
  const rawSigHeader = (req.headers.get("x-handoff-signature") || "").trim();
  if (!secret || secret.length < 16 || !rawSigHeader) {
    return false;
  }
  const providedHex = rawSigHeader.startsWith("sha256=")
    ? rawSigHeader.slice("sha256=".length).trim()
    : rawSigHeader;
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) {
    return false;
  }
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(messagePayload, "utf8")
    .digest("hex");
  const a = Buffer.from(providedHex.toLowerCase(), "utf8");
  const b = Buffer.from(expectedHex.toLowerCase(), "utf8");
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  try {
    const parsedUrl = new URL(req.url);
    const qsPayload = parsedUrl.searchParams.toString();
    const isInterService = verifyInterServiceHmac(req, qsPayload);

    let effectiveBrokerId = "";
    let isAdmin = false;

    if (isInterService) {
      effectiveBrokerId = (parsedUrl.searchParams.get("brokerId") || "").trim();
      if (!effectiveBrokerId) {
        return NextResponse.json(
          { ok: false, error: { code: "VALIDATION_ERROR", message: "brokerId가 필요합니다." } },
          { status: 400 },
        );
      }
    } else {
      const guard = await requireBroker(req);
      if (guard.error) return guard.error;
      effectiveBrokerId = guard.user?.id || "";
      isAdmin = guard.role === "admin";
      if (!effectiveBrokerId) {
        return NextResponse.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
          { status: 401 },
        );
      }
    }

    const supabase = createServiceClient();
    let query = supabase
      .from("space_ai_handoffs")
      .select("id, building_ssot_lite_id, broker_id, status, space_ai_space_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!isAdmin) {
      query = query.eq("broker_id", effectiveBrokerId);
    }

    const { data, error } = await query;
    if (error) {
      log.error("Failed to list space_ai_handoffs", { error: error.message });
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL_ERROR", message: "핸드오프 목록 조회에 실패했습니다." } },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (err) {
    log.error("GET /api/space-ai-handoffs unexpected error", err);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "요청 처리 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let rawBody = "";
    try {
      rawBody = await req.text();
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "요청 본문을 읽을 수 없습니다." } },
        { status: 400 },
      );
    }

    const isInterService = verifyInterServiceHmac(req, rawBody);
    let effectiveBrokerId = "";
    let actorRole = "broker";

    if (!isInterService) {
      const guard = await requireBroker(req);
      if (guard.error) return guard.error;
      effectiveBrokerId = guard.user?.id || "";
      actorRole = guard.role || "broker";
      if (!effectiveBrokerId) {
        return NextResponse.json(
          { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
          { status: 401 },
        );
      }
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_REQUEST", message: "유효한 JSON 형식이 아닙니다." } },
        { status: 400 },
      );
    }

    const parsed = SpaceAIHandoffRequest.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_ERROR", message: "입력 항목을 확인해주세요." } },
        { status: 400 },
      );
    }
    const input = parsed.data;

    if (isInterService) {
      if (!input.brokerId) {
        return NextResponse.json(
          { ok: false, error: { code: "VALIDATION_ERROR", message: "서비스 간 호출에는 brokerId가 필요합니다." } },
          { status: 400 },
        );
      }
      effectiveBrokerId = input.brokerId;
    } else if (input.brokerId && input.brokerId !== effectiveBrokerId && actorRole !== "admin") {
      return NextResponse.json(
        { ok: false, error: { code: "FORBIDDEN", message: "다른 중개사의 ID로 요청할 수 없습니다." } },
        { status: 403 },
      );
    }

    const supabase = createServiceClient();

    // Verify building ownership when buildingSsotLiteId is specified by a broker caller
    if (!isInterService && input.buildingSsotLiteId && supabase && typeof supabase.from === "function") {
      const ownership = await assertBuildingOwner(supabase, input.buildingSsotLiteId, effectiveBrokerId, {
        allowAdmin: true,
        role: actorRole,
      });
      if (!ownership.ok) {
        return ownership.response;
      }
    }

    const spaceAiBaseUrl = process.env.NODE_ENV === "production"
      ? "https://cre-aipage.vercel.app"
      : (process.env.SPACE_AI_PAGE_URL || "http://localhost:3003");

    // 1. Persist handoff intent on MVP side bound strictly to effectiveBrokerId
    const { data: handoffRow, error: insertErr } = await supabase
      .from("space_ai_handoffs")
      .insert({
        building_ssot_lite_id: input.buildingSsotLiteId ?? null,
        broker_id: effectiveBrokerId,
        memo_text: input.memoText,
        space_basics: input.spaceBasics ?? {},
        target_tenant_types: input.targetTenantTypes,
        status: "pending",
        source_app: "js-building-ssot-mvp",
        target_app: "js-space-ai-page",
      })
      .select("id")
      .single();

    if (insertErr || !handoffRow) {
      log.error("Failed to create handoff record", { error: insertErr?.message });
      return NextResponse.json(
        { ok: false, error: { code: "INTERNAL_ERROR", message: "핸드오프 요청 생성에 실패했습니다." } },
        { status: 500 },
      );
    }

    // 2. Call Space AI Page from-mvp endpoint
    const spaceAiPayload = {
      payload_version: "1.0",
      source_app: "js-mvp",
      broker_id: effectiveBrokerId,
      building_id: undefined as string | undefined,
      building_ssot_lite_id: input.buildingSsotLiteId,
      memo_text: input.memoText,
      space_basics: input.spaceBasics
        ? {
            floor: input.spaceBasics.floor,
            area_private_py: input.spaceBasics.areaPrivatePy,
            deposit_krw: input.spaceBasics.depositKrw,
            monthly_rent_krw: input.spaceBasics.monthlyRentKrw,
          }
        : undefined,
      target_tenant_types: input.targetTenantTypes,
      excluded_tenant_types: [],
    };

    let spaceAiResponse: {
      status: string;
      handoff_id: string;
      space_id: string;
      next_url: string;
    } | null = null;

    try {
      const res = await fetch(`${spaceAiBaseUrl}/api/handoffs/from-mvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spaceAiPayload),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Space AI Page responded ${res.status}: ${errBody.slice(0, 200)}`);
      }

      spaceAiResponse = await res.json();
    } catch (fetchErr) {
      log.warn("Space AI Page handoff HTTP failed", { handoffId: handoffRow.id, error: String(fetchErr) });
      // Mark handoff as failed but don't leak raw internal error to client
      await supabase
        .from("space_ai_handoffs")
        .update({ status: "failed", error: "upstream_handoff_failed" })
        .eq("id", handoffRow.id);

      await recordEvent(supabase, {
        actorId: effectiveBrokerId,
        actorRole: "broker",
        eventType: "building_ssot_lite_updated",
        entityType: "building_ssot_lite",
        entityId: input.buildingSsotLiteId,
        metadata: {
          event_subtype: "space_ai_handoff_failed",
          handoff_id: handoffRow.id,
        },
      });

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "SPACE_AI_HANDOFF_FAILED",
            message: "Space AI Page에 연결하지 못했습니다. 직접 접속하거나 잠시 후 다시 시도해주세요.",
            fallback_url: `${spaceAiBaseUrl}`,
          },
        },
        { status: 502 },
      );
    }

    // 3. Update handoff record with space_id from Space AI Page
    await supabase
      .from("space_ai_handoffs")
      .update({
        status: "imported",
        space_ai_space_id: spaceAiResponse!.space_id,
        space_ai_handoff_id: spaceAiResponse!.handoff_id,
      })
      .eq("id", handoffRow.id);

    // 4. Log event
    await recordEvent(supabase, {
      actorId: effectiveBrokerId,
      actorRole: "broker",
      eventType: "building_ssot_lite_updated",
      entityType: "building_ssot_lite",
      entityId: input.buildingSsotLiteId,
      metadata: {
        event_subtype: "space_ai_handoff_created",
        handoff_id: handoffRow.id,
        space_ai_space_id: spaceAiResponse!.space_id,
        target_tenant_types: input.targetTenantTypes,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        handoffId: handoffRow.id,
        spaceId: spaceAiResponse!.space_id,
        nextUrl: spaceAiResponse!.next_url,
        spaceAiPageUrl: `${spaceAiBaseUrl}${spaceAiResponse!.next_url}`,
        message: "Space AI Page로 공간 데이터를 전달했습니다. 사진 업로드 후 임대 페이지를 만들어보세요.",
      },
    });
  } catch (error) {
    log.error("POST /api/space-ai-handoffs unexpected error", error);
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "요청 처리 중 오류가 발생했습니다." } },
      { status: 500 },
    );
  }
}
