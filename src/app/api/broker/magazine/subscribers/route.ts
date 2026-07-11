import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// GET /api/broker/magazine/subscribers - 내 구독자 목록 조회
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // active, paused, unsubscribed
    const channel = searchParams.get("channel"); // kakao, email, both
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

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
      console.error("[Subscribers GET] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      subscribers: data || [],
      total: count || 0,
    });
  } catch (err: any) {
    console.error("[Subscribers GET] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

// POST /api/broker/magazine/subscribers - 구독자 수동 추가
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { phone, name, email, channel } = body;

    if (!phone || !name) {
      return NextResponse.json({ error: "이름과 전화번호는 필수 입력 항목입니다." }, { status: 400 });
    }

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
          subscribed_at: new Date().toISOString(),
        },
        { onConflict: "broker_id,subscriber_phone" }
      )
      .select()
      .single();

    if (error) {
      console.error("[Subscribers POST] Upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, subscriber: data });
  } catch (err: any) {
    console.error("[Subscribers POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
