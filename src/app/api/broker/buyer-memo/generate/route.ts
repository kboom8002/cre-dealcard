/**
 * POST /api/broker/buyer-memo/generate
 *
 * Generate a buyer-friendly memo from Building SSoT Lite and Buyer Intent Lite.
 * Auth: Required. User must own both or have admin rights.
 *
 * Source: docs/08-api-contracts.md section 10
 */
import { z } from "zod/v4";
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { enforceBrokerAiQuota } from "@/lib/ai-quota-guard";
import { assertBuildingOwner } from "@/lib/authz/assert-owner";
import { createServiceClient } from "@/lib/supabase/service";
import { generateBuyerMemo } from "@/domain/buyer/buyer-memo";
import { createModuleLogger } from "@/lib/logger";

const log = createModuleLogger("buyer-memo-generate");
const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

const BuyerMemoGenerateRequest = z.object({
  buildingId:     z.string().max(64).optional(),
  buyerIntentId:  z.string().max(64).optional(),
  buyerId:        z.string().max(64).optional(),
  dealId:         z.string().max(64).optional(),
  tone:           z.enum(["kakao", "professional", "brief"]).default("kakao"),
});

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) {
    return guard.error;
  }

  const userId = guard.user?.id || "";
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } },
      { status: 401 },
    );
  }
  const isAdmin = guard.role === "admin";

  try {
    let rawJson: unknown;
    try {
      rawJson = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = BuyerMemoGenerateRequest.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "입력 항목을 확인해주세요." },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const bId = (input.buildingId || input.dealId || "").trim();
    const biId = (input.buyerIntentId || input.buyerId || "").trim();

    if (!bId || !biId || !SAFE_ID_RE.test(bId) || !SAFE_ID_RE.test(biId)) {
      return NextResponse.json(
        { ok: false, error: "유효한 매물 ID와 매수자 의향서 ID가 필요합니다." },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    if (supabase && typeof supabase.from === "function") {
      // 1. Verify building ownership
      const bOwnership = await assertBuildingOwner(supabase, bId, userId, {
        allowAdmin: true,
        role: guard.role,
      });
      if (!bOwnership.ok) {
        return bOwnership.response;
      }

      // 2. Verify buyer_intent_lite ownership
      const { data: intentRow, error: intentErr } = await supabase
        .from("buyer_intent_lite")
        .select("id, owner_id")
        .eq("id", biId)
        .maybeSingle();

      if (intentErr) {
        log.error("Buyer intent lookup failed", { biId, error: intentErr.message });
        return NextResponse.json(
          { ok: false, error: "매수자 의향서 권한을 확인하지 못했습니다." },
          { status: 500 },
        );
      }
      if (!intentRow) {
        return NextResponse.json(
          { ok: false, error: "매수자 의향서를 찾을 수 없습니다.", code: "NOT_FOUND" },
          { status: 404 },
        );
      }
      const intentOwnerId = (intentRow.owner_id as string | null | undefined) ?? null;
      if (!isAdmin && (!intentOwnerId || intentOwnerId !== userId)) {
        return NextResponse.json(
          { ok: false, error: "이 매수자 의향서에 대한 권한이 없습니다.", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
    }

    const quotaErr = await enforceBrokerAiQuota(req, userId, "buyer_memo_generate");
    if (quotaErr) return quotaErr;

    let result: any = null;
    try {
      result = await generateBuyerMemo(
        {
          buildingId: bId,
          buyerIntentId: biId,
          tone: input.tone,
        },
        userId,
      );
    } catch (err) {
      log.error("[buyer-memo] generateBuyerMemo failed:", err);
      return NextResponse.json(
        { ok: false, error: "매수자 메모 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    const kakaoMessage = result?.kakaoMessage ?? null;
    const fitReasons = result?.fitReasons || [];
    const cautions = result?.cautions || result?.cautionReasons || [];

    return NextResponse.json({
      ok: true,
      data: result,
      kakaoMessage,
      fitReasons,
      cautions,
    });
  } catch (error) {
    log.error("API Route Error:", error);
    return NextResponse.json(
      { ok: false, error: "매수자 메모 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
