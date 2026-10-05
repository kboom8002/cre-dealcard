/**
 * src/lib/magazine/schedule-labels.ts — 발송 일정 표시 문구 단일 출처 (P0-07)
 *
 * `magazine_settings.send_day`(마이그레이션 000007)가 코드에 연동되기 전까지는
 * 구독 UI의 모든 "언제 발송되나" 문구가 이 상수 한 곳만 사용한다. (하드코딩 "화요일"/"월요일" 금지)
 * 기본 발송: 화 10:00 KST (DC-7). 21~08시(KST) 야간 발송은 하지 않는다.
 */
export const MAGAZINE_SEND_DAY_LABEL = '매주 화요일';

/** 광고성 정보 수신 동의 문구 안의 야간 제외 고지 */
export const MAGAZINE_QUIET_HOURS_LABEL = '21시~익일 08시 야간 제외';
