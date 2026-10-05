/**
 * 매거진 알림톡 템플릿 코드 상수 (T2-19b).
 *
 * - 문안 원본은 같은 폴더의 `*.kakao.md`에서 버전 관리한다. 카카오 심사 승인본과 1:1로 일치해야 한다.
 * - 아래 코드는 notification-service의 TEMPLATE_TEXTS 매핑에 **없는** 코드여야
 *   sendGate가 검증한 본문(`fallbackSms`)이 그대로 전송된다. (매핑이 있으면 매핑 문구가 우선되어 검증과 실제 본문이 달라진다)
 * - 심사 승인 번호는 승인 후 `*.kakao.md`의 "심사 이력"에 기록한다.
 */
export const KAKAO_TEMPLATE_FLASH_ISSUE = 'TPL_MAGAZINE_FLASH_ISSUE';
export const KAKAO_TEMPLATE_WEEKLY_ISSUE = 'TPL_MAGAZINE_WEEKLY_ISSUE';

/** 템플릿 문안 버전 — `*.kakao.md` 상단 version과 일치시킬 것 */
export const KAKAO_TEMPLATE_VERSIONS = {
  [KAKAO_TEMPLATE_FLASH_ISSUE]: 'v1-draft',
  [KAKAO_TEMPLATE_WEEKLY_ISSUE]: 'v1-draft',
} as const;
