import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { requireBrokerContext, assertOwnsRow, jsonError, notFoundResponse } from "@/lib/magazine/authz";
import { normalizeKrPhone, toE164Kr } from "@/lib/magazine/pii";
import { mergeInterestProfile } from "@/lib/magazine/tags";
import { toSubscriberView, isMissingColumnError, isUniqueViolation } from "@/lib/magazine/subscriber-view";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { isEmailSuppressed, recordEmailSuppression } from "@/lib/legal/email-suppression";
import { issueConfirmToken, sendOptInConfirmation } from "@/domain/magazine/consent-service";
import { loadOptInSenderIdentity } from "@/lib/magazine/opt-in-sender";

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
  broker_id?: string | null;
  subscriber_name?: string | null;
  status: string | null;
  unsubscribed_at?: string | null;
  consent_status?: string | null;
  email_delivery_status?: string | null;
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

    // 소유권 확인 — 타 브로커/없음 모두 404 (사전 스키마 호환을 위해 '*' 조회)
    const existing = await assertOwnsRow<SubscriberRow>(serviceClient, "magazine_subscribers", id, ctx, {
      select: "*",
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
      if (status === "unsubscribed") {
        updateFields.consent_status = "unsubscribed";
        if (!wasUnsubscribed) updateFields.unsubscribed_at = new Date().toISOString();
      }
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

    // P1-3 동의 우회 차단: 이메일 수신 대상(주소 변경 또는 이메일 채널 신규 추가)이 바뀌면
    // 기존 확인(confirmed)을 새 주소/채널로 이어받지 않는다 → 동의를 pending 으로 되돌리고 새 DOI 확인 메일을 보낸다.
    // sendGate 는 confirm_status!=='confirmed' 를 PENDING_CONFIRM 으로 차단하므로 재확인 전에는 발송되지 않는다.
    // marketing_consent_at 은 수동 추가(POST)와 같이 '브로커 보증 + 확인 토큰 발급 시각'으로 갱신한다
    // (confirmOptIn 이 이 값을 토큰 발급 시각으로 써 7일 TTL 을 판정한다 — null 이면 재확인 링크가 항상 만료된다).
    const isEmailChannel = (c: string | null | undefined) => c === "email" || c === "both";
    const prevEmail = (existing.subscriber_email ?? "").trim().toLowerCase() || null;
    const emailChanged = subscriber_email !== undefined && nextEmail !== prevEmail;
    const emailChannelAdded = channel !== undefined && isEmailChannel(channel) && !isEmailChannel(existing.channel);
    const requiresReconfirm =
      !wasUnsubscribed &&
      !isPurged &&
      status !== "unsubscribed" &&
      !!nextEmail &&
      isEmailChannel(nextChannel) &&
      (emailChanged || emailChannelAdded);

    let confirmToken: string | null = null;
    if (requiresReconfirm && nextEmail) {
      const supp = await isEmailSuppressed(serviceClient, {
        email: nextEmail,
        brokerId: ctx.userId,
        brokerKeys: ctx.brokerKeys,
      });
      if (supp.suppressed) {
        return jsonError("UNSUBSCRIBED", "수신거부 또는 발송 차단 이력이 있는 이메일입니다. 수신자 본인이 직접 다시 구독해야 합니다.", 409);
      }
      const issued = issueConfirmToken();
      confirmToken = issued.token;
      Object.assign(updateFields, {
        confirm_status: "pending",
        consent_status: "pending",
        consented_at: null,
        consent_channel: "broker_attested",
        marketing_consent_at: new Date().toISOString(),
        confirm_token_hash: issued.hash,
      });
    }

    const run = (fields: Record<string, unknown>) =>
      serviceClient
        .from("magazine_subscribers")
        .update(fields)
        .eq("id", id)
        .in("broker_id", ctx.brokerKeys)
        .select()
        .maybeSingle();

    const fullFields = phoneE164 ? { ...updateFields, phone_e164: phoneE164 } : updateFields;
    let res = await run(fullFields);
    if (res.error && isMissingColumnError(res.error)) {
      // 사전 컷오버(20261117000002 미적용): consent_status·consented_at·phone_e164 없이 재시도.
      // 동의 리셋의 핵심(confirm_status='pending' + 새 confirm_token_hash)은 000006 컬럼이라 유지된다.
      const { phone_e164: _p, consent_status: _c, consented_at: _ca, ...fallbackFields } = fullFields;
      void _p;
      void _c;
      void _ca;
      res = await run(fallbackFields);
    }

    if (res.error) {
      if (isUniqueViolation(res.error)) return jsonError("DUPLICATE", "이미 등록된 연락처입니다.", 409);
      if (requiresReconfirm && isMissingColumnError(res.error)) {
        // 동의 컬럼 자체가 없으면 동의 리셋 없이 연락처만 바꾸는 것을 허용하지 않는다(fail closed).
        log.error("[Subscriber PATCH] consent columns missing — refusing contact change without consent reset");
        return jsonError("CONSENT_SCHEMA_UNAVAILABLE", "구독 확인 정보를 갱신할 수 없어 이메일 수신 정보를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503);
      }
      log.error("[Subscriber PATCH] Update error:", res.error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    if (!res.data) return notFoundResponse();

    let confirmEmailSent = false;
    if (requiresReconfirm && confirmToken && nextEmail) {
      try {
        const sender = await loadOptInSenderIdentity(serviceClient, ctx.userId, ctx.displayName ?? null);
        const confirmRes = await sendOptInConfirmation({
          channel: nextChannel as "email" | "both",
          email: nextEmail,
          // confirmOptIn 은 구독자 행의 broker_id 로 토큰을 조회한다
          brokerSlug: String(existing.broker_id ?? ctx.slug ?? ctx.userId),
          brokerName: sender.brokerName,
          brokerContact: sender.brokerContact,
          subscriberName: (subscriber_name ?? existing.subscriber_name ?? null) as string | null,
          token: confirmToken,
        });
        confirmEmailSent = confirmRes.sent;
      } catch {
        // non-blocking (D4 allowlist / dry-run safe) — 구독자는 pending 으로 남아 발송되지 않는다
      }
    }

    const suppressionEmail = nextEmail || existing.subscriber_email;
    if (status === "unsubscribed" && suppressionEmail) {
      await recordEmailSuppression(serviceClient, {
        email: suppressionEmail,
        brokerId: ctx.userId,
        scope: "broker",
        reason: "unsubscribe",
        source: "broker_patch",
      });
    }

    return NextResponse.json({
      success: true,
      subscriber: toSubscriberView(res.data as Record<string, unknown>),
      ...(requiresReconfirm ? { reconfirmRequired: true, confirmEmailSent } : {}),
    });
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

    // 보안: 내 구독자만 삭제 가능 — 소유권 확인 후 삭제 (T2-11, 사전 스키마 호환을 위해 '*' 조회)
    const owned = await assertOwnsRow<SubscriberRow>(serviceClient, "magazine_subscribers", id, ctx, {
      select: "*",
    });
    if (!owned) return notFoundResponse();

    // 삭제 전 수신거부·반송 이력을 email_suppressions 에 보존한다
    const shouldPreserveSuppression =
      owned.status === "unsubscribed" ||
      Boolean(owned.unsubscribed_at) ||
      owned.consent_status === "unsubscribed" ||
      owned.email_delivery_status === "bounced" ||
      owned.email_delivery_status === "complained";
    if (shouldPreserveSuppression && owned.subscriber_email) {
      const reason =
        owned.email_delivery_status === "complained"
          ? "complaint"
          : owned.email_delivery_status === "bounced"
            ? "hard_bounce"
            : "unsubscribe";
      await recordEmailSuppression(serviceClient, {
        email: owned.subscriber_email,
        brokerId: ctx.userId,
        scope: "broker",
        reason,
        source: "broker_delete",
      });
    }

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
