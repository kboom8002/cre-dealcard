/**
 * src/lib/magazine/legal-constants.ts — 매거진 개인정보·동의·보유기간 법무 수치 및 문구 SSOT (U-F1-14 / C-10)
 *
 * ConsentCheckboxes.tsx, visitor-id.ts, privacy/page.tsx, terms/page.tsx 가 모두 동일한 수치·문구를 참조한다.
 * DB 마이그레이션(000014_magazine_retention.sql) 및 cron(retention-purge) 수치와 100% 일치해야 한다.
 */

export const RETENTION_UNSUBSCRIBED_DAYS = 30;
export const RETENTION_EVENTS_DAYS = 365;
export const RETENTION_EVENTS_MONTHS = 12;
export const VISITOR_ID_RETENTION_MONTHS = 13;
export const RECONFIRM_YEARS = 2;
export const CONFIRM_TTL_DAYS = 7;

export const RECONFIRM_YEARS_TEXT = `${RECONFIRM_YEARS}년`;
export const CONFIRM_TTL_DAYS_TEXT = `${CONFIRM_TTL_DAYS}일`;

/** 구독자 개인정보 보유·파기 문구 SSOT */
export const SUBSCRIBER_RETENTION_NOTICE = '구독 해지(수신 거부) 후 30일 보관 뒤 영구 파기·익명화';
export const SUBSCRIBER_RETENTION_LEGAL_NOTE = '관계 법령에 따른 동의·발송 이력 증빙은 법정 기간 보관';

/** 브라우저 임의 방문자 번호(localStorage) 보유 문구 SSOT */
export const VISITOR_ID_RETENTION_NOTICE = '13개월간 저장 (쿠키·기기 지문 아님)';

/** 서버 열람 통계 이벤트 보유·삭제 문구 SSOT */
export const ANALYTICS_EVENT_RETENTION_NOTICE = '수집일로부터 12개월(365일) 경과 시 자동 삭제';
