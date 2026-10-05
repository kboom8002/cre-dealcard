/**
 * src/lib/magazine/user-message.ts — 사용자용 오류 문구 변환 (F-03 / U2-06)
 * 내부 오류 메시지(DB/네트워크/스택)를 독자·중개인에게 그대로 노출하지 않는다.
 */

const MAP: Array<[RegExp, string]> = [
  [/failed to fetch|networkerror|network request failed|load failed/i, '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'],
  [/timeout|timed out|aborted/i, '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'],
  [/unauthorized|401/i, '로그인이 필요합니다. 다시 로그인해 주세요.'],
  [/forbidden|403/i, '이 작업을 수행할 권한이 없습니다.'],
  [/not found|404/i, '요청하신 내용을 찾을 수 없습니다.'],
  [/rate.?limit|429|too many/i, '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
];

export const GENERIC_ERROR_MESSAGE = '일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';

/** 임의의 오류/응답 상태를 사용자 문구로 변환. */
export function toUserMessage(err: unknown, status?: number): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const probe = `${raw} ${status ?? ''}`;
  for (const [re, msg] of MAP) {
    if (re.test(probe)) return msg;
  }
  if (status && status >= 500) return GENERIC_ERROR_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

/** fetch Response가 !ok일 때 사용자 문구를 만든다. 서버가 사용자용 message를 준 경우(한글 포함)에만 그대로 사용. */
export async function messageFromResponse(res: Response): Promise<string> {
  try {
    const j = (await res.clone().json()) as { error?: unknown; message?: unknown };
    const cand =
      typeof j?.error === 'string'
        ? j.error
        : typeof (j?.error as { message?: unknown })?.message === 'string'
          ? ((j.error as { message: string }).message)
          : typeof j?.message === 'string'
            ? j.message
            : '';
    if (cand && /[가-힣]/.test(cand) && cand.length <= 120) return cand;
  } catch {
    /* ignore */
  }
  return toUserMessage(null, res.status);
}
