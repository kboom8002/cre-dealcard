import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBuyerTemperature } from "@/domain/magazine/buyer-temperature";
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
  name: z.string().min(1, "이름과 전화번호는 필수 입력 항목입니다.").max(100),
  email: z.string().email().optional().nullable().or(z.literal("")),
  channel: z.enum(["kakao", "email", "both"]).default("kakao"),
  client_id: z.string().optional().nullable(),
  interest_tags: z.record(z.string(), z.any()).optional(),
  interest_profile: z.record(z.string(), z.any()).optional(),
});

// GET /api/broker/magazine/subscribers - 내 구독자 목록 조회 (매수 온도 포함)
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

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

    let query = supabase
      .from("magazine_subscribers")
      .select("*", { count: "exact" })
      .eq("broker_id", user.id);

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
      log.error("[Subscribers GET] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 매수 온도 5단계 자동 라벨링 병합
    const enrichedSubscribers = (data || []).map((sub: any) => {
      const tempTier = getBuyerTemperature(sub.interest_profile);
      return {
        ...sub,
        buyerTemperature: tempTier.label,
        temperatureConfig: tempTier,
      };
    });

    return NextResponse.json({
      subscribers: enrichedSubscribers,
      total: count || 0,
    });
  } catch (err: any) {
    log.error("[Subscribers GET] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/broker/magazine/subscribers - 구독자 추가 (관심사 및 client_id 지원)
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

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

    const { phone, name, email, channel, client_id, interest_tags, interest_profile } = parsed.data;
    const formattedPhone = phone.replace(/[^0-9]/g, "");

    const { data, error } = await supabase
      .from("magazine_subscribers")
      .upsert(
        {
          broker_id: user.id,
          subscriber_phone: formattedPhone,
          subscriber_name: name,
          subscriber_email: email || null,
          channel: channel || "kakao",
          status: "active",
          source: "manual",
          client_id: client_id || null,
          interest_tags: interest_tags || {},
          interest_profile: interest_profile || {},
          subscribed_at: new Date().toISOString(),
        },
        { onConflict: "broker_id,subscriber_phone" }
      )
      .select()
      .single();

    if (error) {
      log.error("[Subscribers POST] Upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscriber: data });
  } catch (err: any) {
    log.error("[Subscribers POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
