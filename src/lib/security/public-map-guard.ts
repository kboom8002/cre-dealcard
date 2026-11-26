import type { NextRequest } from 'next/server';

function hostOf(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim().replace(/^["']|["']$/g, '');
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const add = (h: string | null) => {
    if (h) hosts.add(h.toLowerCase());
  };
  add(req.headers.get('host'));
  add(req.headers.get('x-forwarded-host'));
  add(req.nextUrl?.host || null);
  add(hostOf(process.env.NEXT_PUBLIC_SITE_URL));
  add(hostOf(process.env.NEXT_PUBLIC_APP_URL));
  add(hostOf(process.env.VWORLD_REFERER));
  add(process.env.VERCEL_URL ? String(process.env.VERCEL_URL).toLowerCase() : null);
  hosts.add('credeal.net');
  hosts.add('www.credeal.net');
  return hosts;
}

/**
 * Checks whether an incoming public map proxy request originates from a
 * first-party context (same-origin/same-site Sec-Fetch-Site or allowlisted Referer/Origin host).
 */
export function isFirstPartyMapRequest(req: NextRequest): boolean {
  const secFetchSite = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true;
  const hosts = allowedHosts(req);
  const refererHost = hostOf(req.headers.get('referer'));
  if (refererHost && hosts.has(refererHost)) return true;
  const originHost = hostOf(req.headers.get('origin'));
  if (originHost && hosts.has(originHost)) return true;
  return false;
}

/**
 * Extracts best-effort client IP address from proxy headers for rate limiting.
 */
export function clientIp(req: NextRequest): string {
  return (
    (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
