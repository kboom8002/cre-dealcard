/**
 * src/components/magazine/subscribe-api.ts — 구독 폼 공용 전송/응답 해석 (SubscribeCard · SubscribeFormClient)
 *
 * - 서버 계약: POST /api/public/magazine/subscribe → `{ ok:true, status:'pending'|'confirmed', message?, pendingReason? }`
 *   실패는 `{ ok:false, error:{ message } }` 또는 503 SERVICE_UNAVAILABLE.
 * - 내부/DB 오류 문구를 그대로 노출하지 않는다: 서버가 준 한글 사용자 문구만 쓰고, 아니면 toUserMessage.
 */
import { toUserMessage } from '@/lib/magazine/user-message';

export interface SubscribePayload {
  brokerId: string;
  name?: string;
  phone?: string;
  email?: string;
  channel: 'kakao' | 'email' | 'both';
  source: string;
  tags?: string[];
  referrer?: string;
  consent: { privacy: boolean; marketing: boolean; age14: boolean; night: boolean };
}

export type SubscribeOutcome =
  | { ok: true; status: 'pending' | 'confirmed'; message?: string; notice?: string }
  | { ok: false; message: string };

/** pendingReason='NO_EMAIL_CONFIRM_CHANNEL' 안내 (B2 계약). */
export const NO_EMAIL_CONFIRM_NOTICE =
  '이메일을 입력하지 않으면 확인 링크를 보낼 수 없어 수신이 시작되지 않습니다.';

function userFacingText(v: unknown): string | null {
  return typeof v === 'string' && /[가-힣]/.test(v) && v.length <= 160 ? v : null;
}

/** 서버 응답 → 화면용 결과. 순수 함수(테스트 대상). */
export function interpretSubscribeResponse(
  res: { ok: boolean; status: number },
  json: unknown,
): SubscribeOutcome {
  const body = (json && typeof json === 'object' ? json : {}) as {
    ok?: unknown;
    status?: unknown;
    message?: unknown;
    pendingReason?: unknown;
    error?: unknown;
  };
  if (res.ok && body.ok === true) {
    return {
      ok: true,
      status: body.status === 'confirmed' ? 'confirmed' : 'pending',
      message: userFacingText(body.message) ?? undefined,
      notice: body.pendingReason === 'NO_EMAIL_CONFIRM_CHANNEL' ? NO_EMAIL_CONFIRM_NOTICE : undefined,
    };
  }
  const err = body.error;
  const serverMsg =
    userFacingText(typeof err === 'string' ? err : (err as { message?: unknown } | undefined)?.message) ??
    userFacingText(body.message);
  return { ok: false, message: serverMsg ?? toUserMessage(null, res.status) };
}

/** 구독 신청 전송. 네트워크 오류는 toUserMessage 로 일반화(원시 에러 비노출). */
export async function postSubscribe(
  payload: SubscribePayload,
  fetchImpl: typeof fetch = fetch,
): Promise<SubscribeOutcome> {
  try {
    const res = await fetchImpl('/api/public/magazine/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      /* 본문 없음 */
    }
    return interpretSubscribeResponse(res, json);
  } catch (err) {
    return { ok: false, message: toUserMessage(err) };
  }
}
