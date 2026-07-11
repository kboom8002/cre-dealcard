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

    // ── 알림톡 템플릿 원본 텍스트 매핑 (Solapi 심사용 일치율 확보) ──
    const TEMPLATE_TEXTS: Record<string, string> = {
      TPL_HOT_LEAD: 
`[CRE Deal] 🔥 Hot Lead 감지
#{brokerName} 중개인님, 리드 스코어 #{leadScore} 고객이 감지되었습니다.
접촉 채널: #{channels}
조회 매물수: #{buildingCount}
상세 정보는 아래 대시보드에서 확인해 주세요.
👉 #{dashboardUrl}`,

      TPL_IM_VIEW_ALERT:
`[CRE Deal] 👀 IM 열람 알림
#{brokerName} 중개인님, 등록하신 [#{buildingName}] 매물의 IM Lite를 고객이 #{dwellTime} 동안 집중 검토하였습니다.
👉 열람 정보: #{viewUrl}`,

      TPL_MAGAZINE_NEW_ISSUE:
`[CRE Deal] 📰 신규 주간 매거진 발행
#{subscriberName}님, #{brokerName} 중개인이 발행한 위클리 CRE 시장 인사이트 매거진이 도착했습니다.
이번 주 핵심 매물 정보와 시장 동향을 확인해 보세요!
👉 #{magazineUrl}
수신 거부: #{unsubscribeUrl}`
    };

    let text = TEMPLATE_TEXTS[payload.templateId] || payload.fallbackSms || "";

    // variables 기반으로 템플릿 텍스트 치환 수행
    for (const [key, value] of Object.entries(payload.variables)) {
      text = text.replaceAll(key, value);
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
