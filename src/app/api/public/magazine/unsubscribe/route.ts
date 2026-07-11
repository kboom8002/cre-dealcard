import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";

// 토큰 생성 및 검증을 위한 서명 검증 헬퍼
function verifyUnsubscribeToken(token: string): { subscriberId: string; brokerId: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [subscriberId, brokerId, signature] = parts;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback_secret";

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(subscriberId + brokerId)
      .digest("hex");

    if (signature === expectedSignature) {
      return { subscriberId, brokerId };
    }
  } catch (err) {
    console.error("[Unsubscribe Token Verification] Failed:", err);
  }
  return null;
}

// GET /api/public/magazine/unsubscribe - 수신 거부 화면용 간단한 HTML 또는 정보 반환
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse("유효하지 않은 수신 거부 링크입니다. (토큰 누락)", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const verified = verifyUnsubscribeToken(token);
  if (!verified) {
    return new NextResponse("수신 거부 링크의 서명이 만료되었거나 올바르지 않습니다.", {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 간단한 수신거부 컨펌 폼 제공
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>위클리 매거진 수신 거부</title>
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f9fafb; }
          .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; border: 1px border-border; }
          h2 { margin-top: 0; color: #111827; font-size: 18px; }
          p { color: #4b5563; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
          button { background-color: #ef4444; color: white; border: none; padding: 10px 20px; font-size: 14px; font-weight: 600; border-radius: 8px; cursor: pointer; transition: background-color 0.2s; }
          button:hover { background-color: #dc2626; }
          .success-msg { color: #059669; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>📧 주간 매거진 수신 거부</h2>
          <p>정말로 더 이상 위클리 CRE 시장 인사이트 매거진을 받지 않으시겠습니까?</p>
          <form method="POST" action="/api/public/magazine/unsubscribe">
            <input type="hidden" name="token" value="${token}">
            <button type="submit">매거진 구독 해지</button>
          </form>
        </div>
      </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// POST /api/public/magazine/unsubscribe - 실제 구독 해지 처리
export async function POST(request: Request) {
  try {
    let token = "";
    
    // form post 또는 json post 모두 대응
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      token = (formData.get("token") as string) || "";
    } else {
      const body = await request.json();
      token = body.token || "";
    }

    if (!token) {
      return NextResponse.json({ error: "토큰이 누락되었습니다." }, { status: 400 });
    }

    const verified = verifyUnsubscribeToken(token);
    if (!verified) {
      return NextResponse.json({ error: "올바르지 않은 토큰 서명입니다." }, { status: 400 });
    }

    const { subscriberId } = verified;
    const supabase = createServiceClient();

    // 구독자 해지 처리
    const { data: subscriber, error } = await supabase
      .from("magazine_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", subscriberId)
      .select()
      .single();

    if (error) {
      console.error("[Unsubscribe POST] Database update error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 시스템 이벤트 적재 (analytics 목적)
    await supabase.from("activity_events").insert({
      actor_id: subscriber.broker_id, // 이벤트를 일으킨 브로커 참조
      actor_role: "system",
      event_type: "magazine_unsubscribed",
      entity_type: "magazine_subscribers",
      entity_id: subscriberId,
      metadata: { subscriber_phone: subscriber.subscriber_phone },
    });

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>수신 거부 완료</title>
          <style>
            body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f9fafb; }
            .card { background: white; padding: 32px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 100%; border: 1px border-border; }
            h2 { margin-top: 0; color: #059669; font-size: 20px; }
            p { color: #4b5563; font-size: 14px; margin-bottom: 24px; line-height: 1.5; }
            .back-link { color: #3b82f6; text-decoration: none; font-size: 13px; font-weight: 500; }
            .back-link:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>✅ 수신 거부 처리가 완료되었습니다.</h2>
            <p>더 이상 위클리 매거진 알림톡을 발송하지 않습니다.<br/>언제든 중개인 프로필 명함을 통해 다시 구독하실 수 있습니다.</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(successHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("[Unsubscribe POST] Unexpected error:", err);
    return NextResponse.json({ error: err.message || "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
