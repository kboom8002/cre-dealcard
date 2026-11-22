import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { matchQaKeyRole } from '@/lib/security/qa-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '중개인 전용 실전 풀루프 검수 (10장 골든 + 내 매물) | 크리딜',
  description:
    '현업 중개인을 위한 표준 사옥 골든 매물(실사진 10장) 및 본인 실매물(BYOD) 2단계 전 과정 클릭스루 검수 보드',
  robots: { index: false, follow: false },
};

function isQaGateEnforcedRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.CRE_ENFORCE_QA_GATE === '1';
}

export default async function QaBrokerFullLoopLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (isQaGateEnforcedRuntime()) {
    const hdrs = await headers();
    const proxyVerified = hdrs.get('x-qa-gate-verified') === '1';
    if (!proxyVerified) {
      const cookieStore = await cookies();
      const cookieKey = cookieStore.get('cre_qa_key')?.value?.trim() || '';
      const headerKey =
        hdrs.get('x-qa-access-key')?.trim() ||
        hdrs.get('x-qa-passcode')?.trim() ||
        '';
      const allowed =
        matchQaKeyRole(cookieKey) !== 'none' || matchQaKeyRole(headerKey) !== 'none';
      if (!allowed) {
        notFound();
      }
    }
  }

  return <>{children}</>;
}
