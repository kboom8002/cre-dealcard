/**
 * src/lib/magazine/subscriber-view.ts — 구독자 행 응답 정제 + 스키마 미적용 오류 판별 (I-03)
 *
 * - 브로커 응답에 토큰 해시·IP 해시 같은 내부 컬럼을 싣지 않는다.
 * - isMissingColumnError: 마이그레이션(000006/000011) 적용 전 DB에서 새 컬럼을 쓸 때의 오류(42703/PGRST204) 판별.
 */

const INTERNAL_COLUMNS = ['confirm_token_hash', 'consent_ip_hash'] as const;

export function toSubscriberView<T extends Record<string, unknown>>(row: T): Omit<T, (typeof INTERNAL_COLUMNS)[number]> {
  const out: Record<string, unknown> = { ...row };
  for (const k of INTERNAL_COLUMNS) delete out[k];
  return out as Omit<T, (typeof INTERNAL_COLUMNS)[number]>;
}

export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  const m = (err.message ?? '').toLowerCase();
  return (m.includes('column') && (m.includes('does not exist') || m.includes('schema cache'))) || false;
}

export function isUniqueViolation(err: { code?: string } | null | undefined): boolean {
  return err?.code === '23505';
}
