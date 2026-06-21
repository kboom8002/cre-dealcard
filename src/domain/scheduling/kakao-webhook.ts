import { createServiceClient } from "@/lib/supabase/service";

export interface KakaoWebhookPayload {
  event: "booking_hold" | "booking_confirmed" | "booking_cancelled";
  bookingId: string;
  recipientPhone: string;
}

export async function sendKakaoNotification(payload: KakaoWebhookPayload) {
  // 1. Log the webhook request for analytics/debugging
  const supabase = createServiceClient();
  await supabase.from("activity_events").insert({
    event_type: "kakao_notification_sent",
    actor_id: "system", // Or user id if initiated by user
    metadata: {
      payload,
      timestamp: new Date().toISOString()
    }
  });

  // 2. Simulate sending the message via Kakao Alimtalk API
  console.log(`[Kakao Webhook Simulated] Sending ${payload.event} to ${payload.recipientPhone} for booking ${payload.bookingId}`);
  
  // 3. Return a success response
  return { success: true, messageId: `msg_${Math.random().toString(36).substr(2, 9)}` };
}
