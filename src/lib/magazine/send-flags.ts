/**
 * src/lib/magazine/send-flags.ts — 매거진 발송/생성 기능 스위치 (P0-04)
 *
 * 모두 **런타임**에 process.env를 읽는다(재배포 없이 Vercel env 변경으로 즉시 반영되도록 모듈 로드 시 캐시 금지).
 * 기본값은 fail-closed(발송 꺼짐).
 */

function isTrue(v: string | undefined): boolean {
  return v === 'true' || v === '1';
}

/** 마스터 스위치. 미설정이면 false → 모든 매거진 발송 차단. */
export function isMagazineSendEnabled(): boolean {
  return isTrue(process.env.MAGAZINE_SEND_ENABLED);
}

/**
 * dry-run: sendGate 판정·원장 기록만 하고 provider 호출은 하지 않는다.
 * 명시적으로 'false'로 설정한 경우에만 실발송 허용 (미설정 = dry-run).
 */
export function isMagazineSendDryRun(): boolean {
  const v = process.env.MAGAZINE_SEND_DRY_RUN;
  return !(v === 'false' || v === '0');
}

/** canary 수신자 허용목록(전화·이메일). 비어 있으면 allowlist 미적용(=전체 허용). */
export function getMagazineSendAllowlist(): Set<string> {
  const raw = process.env.MAGAZINE_SEND_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .map((s) => (s.includes('@') ? s : s.replace(/\D/g, ''))),
  );
}

/** 주간 생성 cron 활성 여부(기본 false). */
export function isMagazineCronGenerateEnabled(): boolean {
  return isTrue(process.env.MAGAZINE_CRON_GENERATE_ENABLED);
}

/** 브로커 자동 발송 옵트인 허용 여부(기본 false). */
export function isMagazineAutoSendAllowed(): boolean {
  return isTrue(process.env.MAGAZINE_AUTO_SEND_ALLOWED);
}

/** 매거진 LLM Mock 허용 여부. 운영(NODE_ENV=production)에서는 항상 false. */
export function isMagazineLlmMockAllowed(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return isTrue(process.env.MAGAZINE_ALLOW_LLM_MOCK);
}

/** 독자 행태 수집 활성(기본 true, 'false'로 끄기). */
export function isMagazineTrackingEnabled(): boolean {
  const v = process.env.MAGAZINE_TRACKING_ENABLED;
  return !(v === 'false' || v === '0');
}

/** 발송 차단 사유 */
export type SendBlockReason =
  | 'SEND_DISABLED'
  | 'NO_PROVIDER'
  | 'NO_CONSENT'
  | 'CHANNEL_NOT_CONSENTED'
  | 'CHANNEL_NOT_AVAILABLE'
  | 'QUIET_HOURS'
  | 'MISSING_UNSUB_LINK'
  | 'MISSING_AD_LABEL'
  | 'MISSING_SENDER'
  | 'DUPLICATE'
  | 'DAILY_CAP'
  | 'NOT_ALLOWLISTED'
  | 'PENDING_CONFIRM'
  | 'UNSUBSCRIBED';

export interface SendDisabledResult {
  ok: false;
  blocked: 'SEND_DISABLED';
  message: string;
}

export const SEND_DISABLED_MESSAGE = '매거진 발송이 일시 중지되었습니다. 발행은 완료되었으며, 발송은 관리자 확인 후 재개됩니다.';

export function sendDisabledResult(): SendDisabledResult {
  return { ok: false, blocked: 'SEND_DISABLED', message: SEND_DISABLED_MESSAGE };
}
