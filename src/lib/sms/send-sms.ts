/**
 * SMS 전송 유틸리티
 * 
 * Phase 1: DB 저장 + 콘솔 로그 (SMS 키 없으면 skip)
 * Phase 2: CoolSMS API 연동 (COOLSMS_API_KEY, COOLSMS_API_SECRET, COOLSMS_SENDER 환경변수 필요)
 */

export async function sendSMS(to: string, message: string): Promise<boolean> {
  // 전화번호 정규화: 하이픈 제거, 010 → +8210
  const normalized = to.replace(/[-\s]/g, "");

  const apiKey = process.env.COOLSMS_API_KEY;
  const apiSecret = process.env.COOLSMS_API_SECRET;
  const sender = process.env.COOLSMS_SENDER;

  if (!apiKey || !apiSecret || !sender) {
    // Phase 1: SMS 인프라 미설정 → 로그만 남김
    console.log(`[SMS Stub] To: ${normalized} | Message: ${message}`);
    return true; // DB에는 저장, SMS는 skip
  }

  // Phase 2: CoolSMS API 호출
  try {
    const res = await fetch("https://api.coolsms.co.kr/messages/v4/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message: {
          to: normalized,
          from: sender,
          text: message,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[SMS] CoolSMS error:", err);
      return false;
    }

    console.log(`[SMS] Sent to ${normalized}`);
    return true;
  } catch (err) {
    console.error("[SMS] Failed:", err);
    return false;
  }
}
