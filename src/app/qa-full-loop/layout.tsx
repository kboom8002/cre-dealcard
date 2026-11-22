import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { matchQaKeyRole } from '@/lib/security/qa-gate';

export const dynamic = 'force-dynamic';

function isQaGateEnforcedRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.CRE_ENFORCE_QA_GATE === '1';
}

export default async function QaFullLoopLayout({
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
