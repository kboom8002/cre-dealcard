/**
 * /privacy, /terms 공용 레이아웃·상수·운영주체 고지 (PIPA 분리 동의 및 통합 B2B SaaS · 매거진 약관/개인정보처리방침)
 *
 * 보유·파기 수치는 코드/DB 기준과 일치해야 한다:
 *  - 해지 후 30일 경과 시 식별정보 익명화: supabase/migrations/20261004000014_magazine_retention.sql
 *    magazine_purge_unsubscribed(p_days=30), 호출 src/app/api/cron/retention-purge/route.ts
 *  - 열람 이력(analytics 이벤트) 365일 후 삭제: magazine_purge_old_events(p_days=365)
 *  - 수신 동의 재확인 주기 2년: consent-service RECONFIRM_YEARS
 *  - 확인 링크 유효기간 7일: consent-service CONFIRM_TOKEN_TTL_DAYS
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { COMPANY_LEGAL_CONFIG } from '@/config/company-legal';

export { COMPANY_LEGAL_CONFIG };

/** 시행일 (COMPANY_LEGAL_CONFIG SSOT 기준) */
export const LEGAL_EFFECTIVE_DATE = COMPANY_LEGAL_CONFIG.effectiveDate;

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
 * NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL(또는 COMPANY_LEGAL_CONFIG 기본값)을 표시한다.
 */
export function getPrivacyContactText(): string {
  const email = COMPANY_LEGAL_CONFIG.privacyContactEmail;
  if (email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    return `이메일: ${email} (${COMPANY_LEGAL_CONFIG.privacyOfficerName})`;
  }
  return '매거진 하단에 기재된 발행 중개사 연락처 또는 서비스 운영자 문의 채널';
}

export function LegalContextNav({ current }: { current: 'terms' | 'privacy' }) {
  return (
    <nav
      aria-label="이전 화면 및 관련 안내 이동"
      className="flex flex-wrap items-center gap-2.5"
    >
      <Link
        href="/magazine"
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[16px] font-bold text-slate-900 shadow-xs transition hover:bg-slate-100"
      >
        ← 매거진으로 돌아가기
      </Link>
      <Link
        href="/signup"
        className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[16px] font-semibold text-slate-800 shadow-xs transition hover:bg-slate-100"
      >
        회원가입 화면
      </Link>
      <Link
        href="/login"
        className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[16px] font-semibold text-slate-800 shadow-xs transition hover:bg-slate-100"
      >
        로그인 화면
      </Link>
      {current === 'terms' ? (
        <Link
          href="/privacy"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[16px] font-bold text-blue-900 transition hover:bg-blue-100"
        >
          개인정보처리방침 보기 →
        </Link>
      ) : (
        <Link
          href="/terms"
          className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[16px] font-bold text-blue-900 transition hover:bg-blue-100"
        >
          서비스 이용약관 보기 →
        </Link>
      )}
    </nav>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className="mx-auto w-full max-w-3xl px-5 py-10 text-slate-900">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-8">
          <div className="border-b border-slate-200 pb-5">
            <p className="text-[14px] font-bold tracking-wide text-blue-700">
              {COMPANY_LEGAL_CONFIG.serviceName} ({COMPANY_LEGAL_CONFIG.domain})
            </p>
            <h1 className="mt-1 text-2xl font-bold leading-snug text-slate-900 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-[15px] font-medium text-slate-700">
              시행일: {LEGAL_EFFECTIVE_DATE} · 동의 버전: {COMPANY_LEGAL_CONFIG.consentVersion}
            </p>
          </div>
          <div className="mt-8 space-y-8 text-[17px] leading-[1.85] text-slate-800 break-keep">{children}</div>

          <footer className="mt-10 rounded-xl border border-slate-200 bg-slate-50 p-5 text-[15px] leading-[1.75] text-slate-700">
            <p className="font-bold text-slate-900">서비스 운영 주체 및 고객지원 안내</p>
            <ul className="mt-2 space-y-1">
              <li>서비스명: {COMPANY_LEGAL_CONFIG.serviceName} ({COMPANY_LEGAL_CONFIG.domain})</li>
              <li>운영사/상호: {COMPANY_LEGAL_CONFIG.companyName} · 대표자: {COMPANY_LEGAL_CONFIG.representativeName}</li>
              {COMPANY_LEGAL_CONFIG.businessRegNumber ? (
                <li>사업자등록번호: {COMPANY_LEGAL_CONFIG.businessRegNumber}</li>
              ) : null}
              <li>소재지: {COMPANY_LEGAL_CONFIG.address}</li>
              <li>
                개인정보보호책임자: {COMPANY_LEGAL_CONFIG.privacyOfficerName} ({COMPANY_LEGAL_CONFIG.privacyContactEmail}) · 고객지원:{' '}
                {COMPANY_LEGAL_CONFIG.supportEmail}
              </li>
            </ul>
          </footer>
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
