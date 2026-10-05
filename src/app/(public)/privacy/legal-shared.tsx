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

/** retention-purge 코드 기준과 일치해야 하는 수치 */
export const RETENTION_UNSUBSCRIBED_DAYS = 30;
export const RETENTION_EVENTS_DAYS = 365;
export const RECONFIRM_YEARS_TEXT = '2년';
export const CONFIRM_TTL_DAYS_TEXT = '7일';

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
    <main className="mx-auto w-full max-w-3xl px-5 py-10 text-slate-800">
      <h1 className="text-2xl font-bold leading-snug text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">시행일: {LEGAL_EFFECTIVE_DATE}</p>
      <div className="mt-8 space-y-8 text-[15px] leading-7">{children}</div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
