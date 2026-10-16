/**
 * /privacy, /terms 공용 레이아웃·상수 (G-01 동의 고지 — 구독폼의 /privacy 링크 대상)
 *
 * [내부 메모 — 고객 노출 페이지에는 표시하지 않음]
 * 본 문서의 문구는 **법무 검토 전 초안**이다. 검토 필요 사항은
 * docs/magazine/audit-2026-10-04/legal-review-needed.md 에 정리했다.
 * 동의 문구의 실질이 바뀌면 consent-service 의 CONSENT_VERSION('v1')을 올려 재동의 근거를 남길 것.
 *
 * 보유·파기 수치는 코드/DB 기준과 일치해야 한다:
 *  - 해지 후 30일 경과 시 식별정보 익명화: supabase/migrations/20261004000014_magazine_retention.sql
 *    magazine_purge_unsubscribed(p_days=30), 호출 src/app/api/cron/retention-purge/route.ts
 *  - 열람 이력(analytics 이벤트) 365일 후 삭제: magazine_purge_old_events(p_days=365)
 *  - 수신 동의 재확인 주기 2년: consent-service RECONFIRM_YEARS
 *  - 확인 링크 유효기간 7일: consent-service CONFIRM_TOKEN_TTL_DAYS
 * 위 수치를 바꾸면 이 페이지의 문구도 함께 수정해야 한다.
 */
import type { ReactNode } from 'react';

/** 시행일(초안 기준일). 법무 확정 후 갱신. */
export const LEGAL_EFFECTIVE_DATE = '2026년 10월 6일';

export {
  ANALYTICS_EVENT_RETENTION_NOTICE,
  CONFIRM_TTL_DAYS,
  CONFIRM_TTL_DAYS_TEXT,
  RECONFIRM_YEARS,
  RECONFIRM_YEARS_TEXT,
  RETENTION_EVENTS_DAYS,
  RETENTION_EVENTS_MONTHS,
  RETENTION_UNSUBSCRIBED_DAYS,
  SUBSCRIBER_RETENTION_LEGAL_NOTE,
  SUBSCRIBER_RETENTION_NOTICE,
  VISITOR_ID_RETENTION_MONTHS,
  VISITOR_ID_RETENTION_NOTICE,
} from '@/lib/magazine/legal-constants';

/**
 * 열람·정정·삭제·동의 철회 요청 연락처.
 * NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL 이 설정되면 그 주소를, 아니면 확정 전 대체 안내 문구를 표시한다.
 */
export function getPrivacyContactText(): string {
  const email = (process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL ?? '').trim();
  if (email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return `이메일: ${email}`;
  return '매거진 하단에 기재된 발행 중개사 연락처 또는 서비스 운영자 문의 채널';
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto w-full max-w-3xl px-5 py-10 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-2 text-[15px] font-medium text-slate-700">시행일: {LEGAL_EFFECTIVE_DATE}</p>
          <div className="mt-8 space-y-8 text-[17px] leading-[1.85] text-slate-800 break-keep">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="text-slate-800">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-3 text-[17px] leading-[1.85] text-slate-800">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-[17px] leading-[1.85] text-slate-800">
      {items.map((it, i) => (
        <li key={i} className="text-slate-800">
          {it}
        </li>
      ))}
    </ul>
  );
}
