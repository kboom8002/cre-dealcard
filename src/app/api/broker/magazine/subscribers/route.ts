import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod/v4";
import { createServiceClient } from "@/lib/supabase/service";
import { computeTemperatures, loadSubscriberEvents } from "@/lib/magazine/subscriber-temperature";
import { requireBrokerContext, jsonError, notFoundResponse } from "@/lib/magazine/authz";
import { normalizeKrPhone, toE164Kr } from "@/lib/magazine/pii";
import { mergeInterestProfile } from "@/lib/magazine/tags";
import { toSubscriberView, isMissingColumnError, isUniqueViolation } from "@/lib/magazine/subscriber-view";
import { GENERIC_ERROR_MESSAGE } from "@/lib/magazine/user-message";
import { derivePendingReason } from "@/domain/magazine/consent-service";
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route');

const GetSubscribersQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'unsubscribed']).optional(),
  channel: z.enum(['kakao', 'email', 'both']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const CreateSubscriberSchema = z.object({
  phone: z.string().min(1, "이름과 전화번호는 필수 입력 항목입니다."),
  name: z.string().trim().min(1, "이름과 전화번호는 필수 입력 항목입니다.").max(100),
  email: z.string().trim().max(254).optional().nullable(),
  channel: z.enum(["kakao", "email", "both"]).default("kakao"),
  client_id: z.string().max(64).optional().nullable(),
  interest_tags: z.record(z.string(), z.unknown()).optional(),
  interest_profile: z.record(z.string(), z.unknown()).optional(),
  // 브로커가 "고객이 수신에 동의했음을 확인"했는지 (필수 true — 동의 없는 고객을 임의로 추가하지 못하게 한다)
  consentAttested: z.boolean().optional(),
});

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

// GET /api/broker/magazine/subscribers - 내 구독자 목록 조회 (매수 온도 포함)
export async function GET(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    const { searchParams } = new URL(request.url);
    const parsedQuery = GetSubscribersQuerySchema.safeParse({
      status: searchParams.get("status") || undefined,
      channel: searchParams.get("channel") || undefined,
      limit: searchParams.get("limit") || undefined,
      offset: searchParams.get("offset") || undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "잘못된 쿼리 파라미터입니다.", details: parsedQuery.error.issues }, { status: 400 });
    }

    const { status, channel, limit, offset } = parsedQuery.data;
    const serviceClient = createServiceClient();

    let query = serviceClient
      .from("magazine_subscribers")
      .select("*", { count: "exact" })
      .in("broker_id", ctx.brokerKeys);

    if (status) {
      query = query.eq("status", status);
    }
    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data, count, error } = await query
      .order("subscribed_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error("[Subscribers GET] Database error:", error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    // 매수 온도 5단계 — analytics 대시보드와 같은 함수·같은 입력(구독자 귀속 이벤트) (T3-ANL-1, E-04)
    const rows = (data || []) as any[];
    const loaded = await loadSubscriberEvents(serviceClient, ctx.brokerKeys, rows.map((s) => s.id));
    if (!loaded.ok) log.warn("[Subscribers GET] 열람 이벤트 조회 실패 — 프로필만으로 온도 계산:", loaded.message);
    const temps = computeTemperatures(rows, loaded.ok ? loaded.bySubscriber : null);
    const enrichedSubscribers = rows.map((sub: any) => {
      const temp = temps.get(sub.id)!;
      return {
        ...toSubscriberView(sub),
        // 확인 전(pending)인데 확인 링크를 보낼 채널(이메일)이 없으면 사유를 내려 UI가 정직하게 안내한다 (B2 consent-service)
        pendingReason: derivePendingReason(sub),
        buyerTemperature: temp.tier.label,
        temperatureConfig: temp.tier,
        temperatureScore: temp.composite,
        temperatureReason: temp.reason,
      };
    });

    return NextResponse.json({
      subscribers: enrichedSubscribers,
      total: count || 0,
      // 열람 이벤트를 읽지 못해 프로필만으로 계산했으면 true (온도가 실제보다 낮게 보일 수 있음)
      temperatureDegraded: !loaded.ok,
    });
  } catch (err: any) {
    log.error("[Subscribers GET] Unexpected error:", err?.message ?? String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}

// POST /api/broker/magazine/subscribers - 구독자 수동 추가 (관심사 및 client_id 지원)
//  - 브로커가 수동 추가한 구독자는 동의를 브로커가 보증(broker_attested)하는 것으로 기록한다.
//  - 동의 컬럼 마이그레이션(000006) 전이면 컬럼 없이 저장하되 consentRecorded:false로 정직하게 알린다.
//  - 수신거부자는 재활성화하지 않는다(409 UNSUBSCRIBED — 본인 재구독 필요, S2-07).
export async function POST(request: NextRequest) {
  try {
    const { ctx, error: authError } = await requireBrokerContext(request);
    if (authError || !ctx) return authError ?? jsonError("UNAUTHORIZED", "로그인이 필요합니다.", 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = CreateSubscriberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "이름과 전화번호는 필수 입력 항목입니다.", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { phone, name, email, channel, client_id, interest_tags, interest_profile, consentAttested } = parsed.data;

    if (consentAttested !== true) {
      return jsonError("CONSENT_REQUIRED", "고객이 수신에 동의했음을 확인해야 구독자를 추가할 수 있습니다.", 400);
    }

    const formattedPhone = normalizeKrPhone(phone);
    if (!formattedPhone) {
      return jsonError("INVALID_PHONE", "휴대폰 번호 형식을 확인해 주세요.", 400);
    }
    const emailNorm = email ? email.trim().toLowerCase() : "";
    if (emailNorm && !EMAIL_RE.test(emailNorm)) {
      return jsonError("INVALID_EMAIL", "이메일 형식을 확인해 주세요.", 400);
    }
    if ((channel === "email" || channel === "both") && !emailNorm) {
      return jsonError("EMAIL_REQUIRED", "이메일 수신에는 이메일 주소가 필요합니다.", 400);
    }

    const serviceClient = createServiceClient();

    // client_id는 본인 고객만 연결 가능 (타 브로커 broker_clients 연결 방지, S2-04)
    // broker_clients.broker_id 는 uuid(= 로그인 user.id). slug 를 섞으면 22P02 이므로 userId 로만 비교한다.
    if (client_id) {
      const { data: owned, error: ownedErr } = await serviceClient
        .from("broker_clients")
        .select("id")
        .eq("id", client_id)
        .eq("broker_id", ctx.userId)
        .maybeSingle();
      if (ownedErr) {
        log.warn("[Subscribers POST] client ownership lookup error:", ownedErr.message);
        return notFoundResponse("연결하려는 고객을 찾을 수 없습니다.");
      }
      if (!owned) return notFoundResponse("연결하려는 고객을 찾을 수 없습니다.");
    }

    // 중복 확인 (본인 broker 키 범위 내, 같은 전화번호)
    const { data: dupRows, error: dupErr } = await serviceClient
      .from("magazine_subscribers")
      .select("*")
      .in("broker_id", ctx.brokerKeys)
      .eq("subscriber_phone", formattedPhone)
      .limit(1);
    if (dupErr) {
      log.error("[Subscribers POST] duplicate lookup error:", dupErr.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }
    const dup = (dupRows ?? [])[0] as Record<string, any> | undefined;
    if (dup) {
      if (dup.status === "unsubscribed" || dup.unsubscribed_at) {
        return jsonError("UNSUBSCRIBED", "수신거부한 구독자입니다. 구독자 본인이 직접 다시 구독해야 합니다.", 409);
      }
      return NextResponse.json({ success: true, existing: true, subscriber: toSubscriberView(dup) });
    }

    const nowIso = new Date().toISOString();
    const brokerId = ctx.slug ?? ctx.userId;
    const base = {
      broker_id: brokerId,
      subscriber_phone: formattedPhone,
      subscriber_name: name,
      subscriber_email: emailNorm || null,
      channel,
      status: "active",
      source: "manual",
      client_id: client_id || null,
      interest_profile: mergeInterestProfile({}, interest_profile, interest_tags),
      subscribed_at: nowIso,
    };
    const consentFields = {
      broker_user_id: ctx.userId,
      phone_e164: toE164Kr(formattedPhone),
      consent_channel: "broker_attested",
      marketing_consent_at: nowIso,
      confirm_status: "confirmed",
      consent_version: "v1",
    };

    let consentRecorded = true;
    let ins = await serviceClient
      .from("magazine_subscribers")
      .insert({ ...base, ...consentFields })
      .select()
      .single();

    if (ins.error && isMissingColumnError(ins.error)) {
      // 마이그레이션 미적용: 동의 필드 없이 저장 — 응답에 consentRecorded:false로 알린다.
      consentRecorded = false;
      log.warn("[Subscribers POST] consent columns missing — inserted without consent fields");
      ins = await serviceClient.from("magazine_subscribers").insert(base).select().single();
    }

    if (ins.error) {
      if (isUniqueViolation(ins.error)) {
        return jsonError("DUPLICATE", "이미 등록된 연락처입니다.", 409);
      }
      log.error("[Subscribers POST] Insert error:", ins.error.message);
      return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
    }

    return NextResponse.json(
      { success: true, existing: false, consentRecorded, subscriber: toSubscriberView(ins.data as Record<string, unknown>) },
      { status: 201 },
    );
  } catch (err: any) {
    log.error("[Subscribers POST] Unexpected error:", err?.message ?? String(err));
    return jsonError("INTERNAL_ERROR", GENERIC_ERROR_MESSAGE, 500);
  }
}
