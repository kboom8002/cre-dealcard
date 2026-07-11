import crypto from "crypto";

/**
 * 통합 알림 서비스.
 * Solapi REST API v4를 통해 카카오 알림톡을 발송합니다.
 * env: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_PHONE, SOLAPI_PFID
 */

export interface NotificationPayload {
  recipientPhone: string;
  templateId: string;     // Solapi에 등록된 알림톡 템플릿 ID
  variables: Record<string, string>;
  fallbackSms?: string;   // 알림톡 실패 시 SMS 대체 문구
}

export async function sendKakaoAlimtalk(payload: NotificationPayload): Promise<boolean> {
  const apiKey = process.env.SOLAPI_API_KEY;
  const apiSecret = process.env.SOLAPI_API_SECRET;
  const senderPhone = process.env.SOLAPI_SENDER_PHONE;
  const pfId = process.env.SOLAPI_PFID;

  // 로컬 개발/테스트 시 환경변수가 없으면 시뮬레이션 로그만 남기고 성공 처리
  if (!apiKey || !apiSecret) {
    console.log(`[Notification STUB] Alimtalk sent to ${payload.recipientPhone}: template=${payload.templateId}, vars=`, payload.variables);
    return true;
  }

  try {
    const dateTime = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString("hex");
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(dateTime + salt)
      .digest("hex");

    const authHeader = `HMAC-SHA256 apiKey=${apiKey}, date=${dateTime}, salt=${salt}, signature=${signature}`;

    const formattedPhone = payload.recipientPhone.replace(/[^0-9]/g, "");

    const message: any = {
      to: formattedPhone,
      from: senderPhone?.replace(/[^0-9]/g, ""),
      type: "ATA", // 알림톡
      templateId: payload.templateId,
      pfId: pfId,
      country: "82", // 대한민국
    };

    // 알림톡 치환 변수 (Solapi v4는 양식에 맞춰 변수를 지정해야 함)
    // Solapi v4에서는 variables 필드가 아니라 text에 치환 결과를 넣거나 templateId와 매칭해서 변형해야 합니다.
    // Solapi v4 알림톡 가이드: 알림톡 템플릿의 변수를 채워 'text' 필드에 그대로 제공해야 발송됩니다.
    // 예: "안녕하세요 #{name}님" 이라면 text: "안녕하세요 홍길동님" 으로 변수를 수동 치환해서 보내야 합니다.
    let text = payload.fallbackSms || "";
    // 기본 변수 치환 로직 (templateId와 치환 문구 결합)
    // (보통 Solapi는 알림톡 발송 시 text 필드 내용과 템플릿 양식이 완전히 일치해야 발송 성공합니다.)
    if (payload.fallbackSms) {
      let replaced = payload.fallbackSms;
      for (const [key, value] of Object.entries(payload.variables)) {
        replaced = replaced.replaceAll(key, value);
      }
      text = replaced;
    }
    message.text = text;

    const res = await fetch("https://api.solapi.com/messages/v4/send-many", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({ messages: [message] }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Notification] Solapi error response:", err);
      return false;
    }

    const data = await res.json();
    console.log(`[Notification] Solapi success: msgId=${data.groupInfo?.groupId || "unknown"}`);
    return true;
  } catch (err: any) {
    console.error("[Notification] Solapi request failed:", err.message);
    return false;
  }
}
