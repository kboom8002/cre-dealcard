import type { NextRequest } from 'next/server';

export type QaKeyRole = 'none' | 'master' | 'tester' | 'broker';

export function constantTimeEqualStr(a: string, b: string): boolean {
  if (!a || !b) return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0);
  }
  return diff === 0;
}

export function isPublicQaFlagEnabled(
  envSource: Record<string, string | undefined> = process.env
): boolean {
  return envSource.CREDEAL_ENABLE_PUBLIC_QA === 'true';
}

export function getConfiguredQaSecrets(
  envSource: Record<string, string | undefined> = process.env
): {
  masterKey: string;
  portalPasscode: string;
  testerKey: string;
  brokerKey: string;
  anyConfigured: boolean;
} {
  const masterKey = (envSource.QA_ACCESS_KEY || '').trim();
  const portalPasscode = (envSource.QA_PORTAL_PASSCODE || '').trim();
  const testerKey = (envSource.QA_TESTER_ACCESS_KEY || '').trim();
  const brokerKey = (envSource.QA_BROKER_ACCESS_KEY || '').trim();
  return {
    masterKey,
    portalPasscode,
    testerKey,
    brokerKey,
    anyConfigured: Boolean(masterKey || portalPasscode || testerKey || brokerKey),
  };
}

export function matchQaKeyRole(
  candidate: string,
  envSource: Record<string, string | undefined> = process.env
): QaKeyRole {
  if (!candidate) return 'none';
  const { masterKey, portalPasscode, testerKey, brokerKey, anyConfigured } =
    getConfiguredQaSecrets(envSource);
  if (!anyConfigured) return 'none';

  if (constantTimeEqualStr(masterKey, candidate)) return 'master';
  if (constantTimeEqualStr(portalPasscode, candidate)) return 'master';
  if (constantTimeEqualStr(testerKey, candidate)) return 'tester';
  if (constantTimeEqualStr(brokerKey, candidate)) return 'broker';
  return 'none';
}

export function resolveQaKeyFromRequest(
  request: NextRequest,
  envSource: Record<string, string | undefined> = process.env
): { role: QaKeyRole; allowed: boolean; queryKey: string } {
  if (!getConfiguredQaSecrets(envSource).anyConfigured) {
    return { role: 'none', allowed: false, queryKey: '' };
  }
  const url = request.nextUrl;
  const queryKey = (
    url.searchParams.get('qaKey') ||
    url.searchParams.get('key') ||
    url.searchParams.get('passcode') ||
    ''
  ).trim();
  const headerKey = (request.headers.get('x-qa-access-key') || '').trim();
  const passcodeHeader = (request.headers.get('x-qa-passcode') || '').trim();
  const cookieKey = (request.cookies.get('cre_qa_key')?.value || '').trim();

  for (const candidate of [queryKey, headerKey, passcodeHeader, cookieKey]) {
    if (!candidate) continue;
    const role = matchQaKeyRole(candidate, envSource);
    if (role !== 'none') {
      return {
        role,
        allowed: true,
        queryKey: candidate === queryKey ? queryKey : '',
      };
    }
  }
  return { role: 'none', allowed: false, queryKey: '' };
}
