/**
 * POST /api/space-ai-handoffs
 *
 * MVP side: sends a broker memo + space basics to Space AI Page (cre-aipage)
 * to start the leasing marketing flow.
 *
 * Source: docs/23-handoff-api.md section 3 (Integration with JS MVP)
 *
 * Flow:
 *   1. Validate request
 *   2. Persist handoff record (space_ai_handoffs table)
 *   3. POST to Space AI Page /api/handoffs/from-mvp
 *   4. Record activity event
 *   5. Return space_id + next_url from Space AI Page
 */
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";
import { toApiError } from "@/lib/api-error";

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

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = SpaceAIHandoffRequest.parse(json);

    const supabase = createServiceClient();
    const spaceAiBaseUrl =
      process.env.SPACE_AI_PAGE_URL || "http://localhost:3003";

    // 1. Persist handoff intent on MVP side
    const { data: handoffRow, error: insertErr } = await supabase
      .from("space_ai_handoffs")
      .insert({
        building_ssot_lite_id: input.buildingSsotLiteId ?? null,
        broker_id: input.brokerId ?? null,
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
      throw new Error(`Failed to create handoff record: ${insertErr?.message}`);
    }

    // 2. Call Space AI Page from-mvp endpoint
    const spaceAiPayload = {
      payload_version: "1.0",
      source_app: "js-mvp",
      broker_id: input.brokerId,
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
        throw new Error(`Space AI Page responded ${res.status}: ${errBody}`);
      }

      spaceAiResponse = await res.json();
    } catch (fetchErr) {
      // Mark handoff as failed but don't throw — MVP can still show a fallback CTA
      await supabase
        .from("space_ai_handoffs")
        .update({ status: "failed", error: String(fetchErr) })
        .eq("id", handoffRow.id);

      await recordEvent(supabase, {
        actorId: input.brokerId ?? null,
        actorRole: "broker",
        eventType: "building_ssot_lite_updated",  // closest available event type
        entityType: "building_ssot_lite",
        entityId: input.buildingSsotLiteId,
        metadata: {
          event_subtype: "space_ai_handoff_failed",
          handoff_id: handoffRow.id,
          error: String(fetchErr),
        },
      });

      return Response.json(
        {
          ok: false,
          error: {
            code: "SPACE_AI_HANDOFF_FAILED",
            message: "Space AI Page에 연결하지 못했습니다. 직접 접속하거나 잠시 후 다시 시도해주세요.",
            fallback_url: `${spaceAiBaseUrl}`,
          },
        },
        { status: 502 }
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
      actorId: input.brokerId ?? null,
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

    return Response.json({
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
    return toApiError(error);
  }
}
