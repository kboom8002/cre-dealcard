/**
 * CREDEAL v3 Pro IM Watermark & NDA System (S3-T5)
 * 
 * Generates secure dynamic watermarks for Pro IM viewers to prevent unauthorized leaks.
 */

export interface WatermarkPayload {
  requesterName: string;
  requesterPhone: string;
  dealId: string;
  grantId: string;
}

export interface GeneratedWatermark {
  watermarkText: string;
  watermarkSeed: string;
  timestampIso: string;
  formattedDisplay: string;
}

export function generateProIMWatermark(payload: WatermarkPayload): GeneratedWatermark {
  const now = new Date();
  const timestampIso = now.toISOString();
  const formattedTime = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const maskedPhone = payload.requesterPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1-****-$2');
  const seed = Math.random().toString(36).substring(2, 10).toUpperCase();

  const watermarkText = `[PRO IM CONFIDENTIAL] ${payload.requesterName} (${maskedPhone}) | ${formattedTime} | ID:${payload.grantId.slice(0, 8)}`;

  return {
    watermarkText,
    watermarkSeed: seed,
    timestampIso,
    formattedDisplay: watermarkText,
  };
}
