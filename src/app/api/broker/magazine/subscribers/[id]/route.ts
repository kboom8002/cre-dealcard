import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, jsonError, notFoundResponse } from "@/lib/magazine/authz";
import { normalizeKrPhone, toE164Kr } from "@/lib/magazine/pii";
import { mergeInterestProfile } from "@/lib/magazine/tags";
import { toSubscriberView, isMissingColumnError, isUniqueViolation } from "@/lib/magazine/subscriber-view";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

const PatchSchema = z.object({
  status: z.enum(["active", "paused", "unsubscribed"]).optional(),
  // UI 키는 interest_profile.tags 로 통일. 기존 interest_tags 입력도 수용하되 interest_profile.tags 로 저장한다.
  interest_tags: z.record(z.string(), z.unknown()).optional(),
  interest_profile: z.record(z.string(), z.unknown()).optional(),
  channel: z.enum(["kakao", "email", "both"]).optional(),
  subscriber_name: z.string().trim().min(1).max(100).optional(),
  subscriber_email: z.string().trim().max(254).nullable().optional(),
  subscriber_phone: z.string().max(40).optional(),
});

interface SubscriberRow {
  id: string;
  status: string | null;
  unsubscribed_at?: string | null;
  channel: string | null;
  subscriber_email: string | null;
  interest_profile: unknown;
}

// PATCH /api/broker/magazine/subscribers/[id] - 구독자 상태 및 관심사 정보 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return jsonError("INVALID_INPUT", "구독자 ID가 필요합니다.", 400);

    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return jsonError("INVALID_JSON", "요청 형식이 올바르지 않습니다.", 400);
    }
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      const statusBad = parsed.error.issues.some((i) => i.path[0] === "status");
      return jsonError("INVALID_INPUT", statusBad ? "올바르지 않은 상태 값입니다." : "입력값을 확인해 주세요.", 400);
    }
    const { status, interest_tags, interest_profile, channel, subscriber_name, subscriber_email, subscriber_phone } = parsed.data;

    const serviceClient = createServiceClient();

    // 소유권 확인 — 타 브로커/없음 모두 404
    const existing = await assertOwnsRow<SubscriberRow>(serviceClient, "magazine_subscribers", id, ctx, {
      select: "id, status, unsubscribed_at, channel, subscriber_email, interest_profile",
    });
    if (!existing) return notFoundResponse();

    const wasUnsubscribed = existing.status === "unsubscribed" || !!existing.unsubscribed_at;
    const isPurged = existing.status === "purged";

    // 해지 상태는 본인 확인 흐름에서만 해제 (S2-07): 브로커 PATCH로 active/paused 전환 금지
    if ((wasUnsubscribed || isPurged) && status !== undefined && status !== "unsubscribed") {
      return jsonError("UNSUBSCRIBED", "수신거부한 구독자는 재활성화할 수 없습니다. 구독자 본인이 직접 다시 구독해야 합니다.", 409);
    }

    const updateFields: Record<string, unknown> = {};

    if (status) {
      updateFields.status = status;
      if (status === "unsubscribed" && !wasUnsubscribed) updateFields.unsubscribed_at = new Date().toISOString();
    }

    // 관심 태그: interest_profile 병합 업데이트 (기존 필드 보존, T2-10)
    if (interest_profile !== undefined || interest_tags !== undefined) {
      updateFields.interest_profile = mergeInterestProfile(existing.interest_profile, interest_profile, interest_tags);
    }

    if (channel) updateFields.channel = channel;
    if (subscriber_name !== undefined) updateFields.subscriber_name = subscriber_name;

    let nextEmail: string | null = existing.subscriber_email;
    if (subscriber_email !== undefined) {
      const e = subscriber_email ? subscriber_email.trim().toLowerCase() : "";
      if (e && !EMAIL_RE.test(e)) return jsonError("INVALID_EMAIL", "이메일 형식을 확인해 주세요.", 400);
      nextEmail = e || null;
      updateFields.subscriber_email = nextEmail;
    }

    // 채널 both/email 인데 이메일이 없으면 400 (T2-24c)
    const nextChannel = channel ?? existing.channel;
    if ((nextChannel === "email" || nextChannel === "both") && !nextEmail) {
      return jsonError("EMAIL_REQUIRED", "이메일 수신에는 이메일 주소가 필요합니다.", 400);
    }

    let phoneE164: string | null = null;
    if (subscriber_phone !== undefined) {
      const p = normalizeKrPhone(subscriber_phone);
      if (!p) return jsonError("INVALID_PHONE", "휴대폰 번호 형식을 확인해 주세요.", 400);
      updateFields.subscriber_phone = p;
      phoneE164 = toE164Kr(p);
    }

    if (Object.keys(updateFields).length === 0) {
      return jsonError("INVALID_INPUT", "수정할 항목이 제공되지 않았습니다.", 400);
    }

    const run = (fields: Record<string, unknown>) =>
      serviceClient
        .from("magazine_subscribers")
        .update(fields)
        .eq("id", id)
        .in("broker_id", ctx.brokerKeys)
        .select()
        .maybeSingle();

    let res = await run(phoneE164 ? { ...updateFields, phone_e164: phoneE164 } : updateFields);
    if (res.error && phoneE164 && isMissingColumnError(res.error)) {
      // phone_e164 컬럼 미적용(마이그레이션 000006 전) — 해당 필드만 제외하고 재시도
      res = await run(updateFields);
    }

    if (res.error) {
      if (isUniqueViolation(res.error)) return jsonError("DUPLICATE", "이미 등록된 연락처입니다.", 409);
      log.error("[Subscriber PATCH] Update error:", res.error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if (!res.data) return notFoundResponse();

    return NextResponse.json({ success: true, subscriber: toSubscriberView(res.data as Record<string, unknown>) });
  } catch (err: any) {
    log.error("[Subscriber PATCH] Unexpected error:", err?.message ?? String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// DELETE /api/broker/magazine/subscribers/[id] - 구독자 완전 삭제 (하드 삭제)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return jsonError("INVALID_INPUT", "구독자 ID가 필요합니다.", 400);

    const { ctx, error: authError } = await requireBrokerContext(req);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    const serviceClient = createServiceClient();

    // 보안: 내 구독자만 삭제 가능 — 소유권 확인 후 삭제 (T2-11)
    const owned = await assertOwnsRow(serviceClient, "magazine_subscribers", id, ctx, { select: "id" });
    if (!owned) return notFoundResponse();

    const { data, error } = await serviceClient
      .from("magazine_subscribers")
      .delete()
      .eq("id", id)
      .in("broker_id", ctx.brokerKeys)
      .select("id");

    if (error) {
      log.error("[Subscriber DELETE] Delete error:", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    // 0행 삭제는 성공으로 위장하지 않는다
    if (!data || data.length === 0) return notFoundResponse();

    return NextResponse.json({ success: true, message: "구독자가 완전히 삭제되었습니다." });
  } catch (err: any) {
    log.error("[Subscriber DELETE] Unexpected error:", err?.message ?? String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
