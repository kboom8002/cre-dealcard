/**
 * TrackingNotice — 열람 통계(행동 추적) 고지 (G-01 개인정보 고지 계약)
 *  - 1st-party 익명 방문자 ID 사용 (개인 식별 불가), 해지·삭제 문의 경로 안내
 * 구독 폼 동의 하단과 뷰어 푸터에 공통으로 둔다. 서버/클라이언트 어디서나 렌더 가능(훅 없음).
 */
import React from 'react';
import { ANALYTICS_NOTICE_TEXT } from '@/lib/magazine/visitor-id';

/** 고지 본문은 E4 의 계약 상수(구현과 일치해야 함)를 그대로 쓴다. */
export const TRACKING_NOTICE_TEXT = ANALYTICS_NOTICE_TEXT;
export const TRACKING_OPTOUT_TEXT =
  '수신 해지·정보 삭제는 받은 메시지의 해지 링크 또는 담당 중개사에게 문의해 주세요.';

export function TrackingNotice({ className = '' }: { className?: string }) {
  return (
    <p className={`text-caption leading-relaxed text-ink-muted ${className}`} data-testid="tracking-notice">
      {TRACKING_NOTICE_TEXT} {TRACKING_OPTOUT_TEXT}{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-indigo-200">
        개인정보 처리방침
      </a>
    </p>
  );
}
