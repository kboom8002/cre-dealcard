/**
 * proxy.ts — Route protection via Supabase Auth session cookie
 *
 * Next.js 16: middleware is deprecated, renamed to proxy.
 * This file runs before routes are rendered.
 *
 * Protected routes: /broker/*, /admin/*
 * Auth routes: /login, /signup (redirect to /broker if already logged in)
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import { isSocialBotUA } from '@/lib/social-bot';
import { resolveQaKeyFromRequest } from '@/lib/security/qa-gate';

const PROTECTED_BROKER = '/broker';
const PROTECTED_ADMIN = '/admin';
const AUTH_ROUTES = ['/login', '/signup'];

/**
 * Social crawler bot User-Agent patterns live in '@/lib/social-bot' (shared with pages).
 * These bots must be able to read OG meta tags on protected routes
 * (e.g. /broker/deal-card/[id]) without authentication.
 * P0-SEC (SEC-3): the allowed pages themselves render only a public-safe shell for
 * unauthenticated requests — the proxy exception never grants access to private data.
 */

/**
 * P0-02 (S2-02): 봇 예외는 OG 메타 목적의 정확히 2개 경로에만 적용한다.
 * 그 외 /broker/* (dashboard, magazine-editor, deal-card/x/edit, deal-card/new …)는 UA 위조와 무관하게 로그인 리다이렉트.
 * 순수 함수 — UA 는 소문자 비교.
 */
const SOCIAL_BOT_ALLOWED_PATHS = [
  /^\/broker\/deal-card\/(?!new$)[^/]+$/,
  /^\/broker\/leasing\/(?!new$)[^/]+$/,
];
export function isSocialBotAllowedPath(pathname: string, ua: string): boolean {
  return isSocialBotUA(ua)
    && SOCIAL_BOT_ALLOWED_PATHS.some((re) => re.test(pathname));
}

export const QA_GATED_PREFIXES = [
  '/qa-signoff',
  '/qa-tester',
  '/qa-broker',
  '/qa-showcase',
  '/qa-full-loop',
  '/testguide',
  '/newsletter-inbox-test',
  '/dealcard-im-test',
] as const;

export const DORMANT_PUBLIC_PREFIXES = [
  '/agora',
  '/services',
  '/building-radar',
] as const;

export const EXPERIMENTAL_VERTICAL_PREFIXES = [
  '/funding',
  '/broker/circles',
] as const;

const EXPERIMENTAL_SCHEDULE_RE = /^\/buildings\/[^/]+\/schedule(\/|$)/;

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isDormantPublicPath(pathname: string): boolean {
  return DORMANT_PUBLIC_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function isExperimentalVerticalPath(pathname: string): boolean {
  return (
    EXPERIMENTAL_VERTICAL_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix)) ||
    EXPERIMENTAL_SCHEDULE_RE.test(pathname)
  );
}

export function isQaGatedPath(pathname: string): boolean {
  return QA_GATED_PREFIXES.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function isValidQaGateRequest(request: NextRequest): {
  allowed: boolean;
  queryKey: string;
} {
  const { allowed, queryKey } = resolveQaKeyFromRequest(request);
  return { allowed, queryKey };
}

/**
 * QA gate enforcement switch: always on in production builds, and on in any other
 * runtime when CRE_ENFORCE_QA_GATE=1 (CI e2e runs `next dev`, so it sets the flag).
 */
export function isQaGateEnforced(
  envSource: Record<string, string | undefined> = process.env,
): boolean {
  return envSource.NODE_ENV === 'production' || envSource.CRE_ENFORCE_QA_GATE === '1';
}

/**
 * Per-process random secret that lets server.ts trust the proxy-verified user header.
 * Returns null (fail closed → no fast-path) when no CSPRNG is available; never a
 * hard-coded constant.
 */
export function resolveProxySecret(): string | null {
  const g = globalThis as Record<string, unknown>;
  const existing = g.__creProxySecret;
  if (typeof existing === 'string' && existing.length >= 32) return existing;
  let generated: string | null = null;
  try {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') {
        generated = crypto.randomUUID();
      } else if (typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        generated = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      }
    }
  } catch {
    generated = null;
  }
  if (!generated || generated.length < 32) return null;
  g.__creProxySecret = generated;
  return generated;
}

export async function proxy(request: NextRequest) {
  // Strip any untrusted internal verification headers at the very start before any early return
  request.headers.delete('x-cre-proxy-secret');
  request.headers.delete('x-cre-verified-user');
  request.headers.delete('x-qa-gate-verified');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-cre-proxy-secret');
  requestHeaders.delete('x-cre-verified-user');
  requestHeaders.delete('x-qa-gate-verified');

  const { pathname } = request.nextUrl;

  // Dormant public feature & unreleased experimental vertical routes return 404 until enabled
  if (
    isDormantPublicPath(pathname) ||
    (process.env.CRE_ENABLE_EXPERIMENTAL_VERTICALS !== '1' &&
      isExperimentalVerticalPath(pathname))
  ) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'X-Robots-Tag': 'noindex, nofollow' },
    });
  }

  // Internal QA/Tester workbench & showcase fail-closed gate in production (or CRE_ENFORCE_QA_GATE=1)
  if (isQaGatedPath(pathname)) {
    const enforceGate = isQaGateEnforced();
    if (enforceGate) {
      const { allowed, queryKey } = isValidQaGateRequest(request);
      if (!allowed) {
        return new NextResponse('Not Found', {
          status: 404,
          headers: { 'X-Robots-Tag': 'noindex, nofollow' },
        });
      }
      requestHeaders.set('x-qa-gate-verified', '1');
      const res = NextResponse.next({ request: { headers: requestHeaders } });
      res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      if (queryKey) {
        res.cookies.set('cre_qa_key', queryKey, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 12,
        });
      }
      return res;
    }
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  // Legacy short link redirect: /d/[id] -> /dc/[id]
  if (pathname.startsWith('/d/')) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = pathname.replace(/^\/d\//, '/dc/');
    return NextResponse.redirect(targetUrl, 308);
  }

  // WP-P1-11 & [A5-02]: Legacy /broker/deal-card/:id redirect to /broker/w/dealcards?id=:id
  // Social crawlers (kakaotalk-scrap, facebookexternalhit, etc.) are exempted so they can scrape OG metadata.
  const dealCardMatch = pathname.match(/^\/broker\/deal-card\/(?!new$)([^/]+)$/);
  if (dealCardMatch) {
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    if (!isSocialBotUA(ua)) {
      const targetUrl = new URL(`/broker/w/dealcards?id=${encodeURIComponent(dealCardMatch[1])}`, request.nextUrl);
      return NextResponse.redirect(targetUrl, 307);
    }
  }

  const isBrokerRoute = pathname.startsWith(PROTECTED_BROKER);
  const isAdminRoute = pathname.startsWith(PROTECTED_ADMIN);
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r);

  // Public routes (/hub, /dc/*, /m/*, /magazine/*, /im-lite/*, etc.) do not require
  // a blocking remote supabase.auth.getUser() round-trip in proxy.
  if (!isBrokerRoute && !isAdminRoute && !isAuthRoute) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Create Supabase client with cookie-based session
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,

    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Do not run logic between createServerClient and supabase.auth.getUser().
  // This pattern is required to keep session tokens in sync.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // P2 (WP-7.3A): never fall back to a guessable constant secret. When no CSPRNG is
    // available we fail closed — the verified-user fast-path header is simply not set
    // and server.ts falls back to the standard remote supabase.auth.getUser().
    const secret = resolveProxySecret();
    if (secret) {
      const serializedUser = encodeURIComponent(JSON.stringify(user));
      request.headers.set('x-cre-proxy-secret', secret);
      request.headers.set('x-cre-verified-user', serializedUser);
      requestHeaders.set('x-cre-proxy-secret', secret);
      requestHeaders.set('x-cre-verified-user', serializedUser);
      const prevCookies = supabaseResponse.cookies.getAll();
      supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
      prevCookies.forEach((c) => supabaseResponse.cookies.set(c));
    }
  }

  // 1. Unauthenticated user → redirect to /login if on protected route
  //    Exception: social crawlers are allowed through to read OG meta tags
  if ((isBrokerRoute || isAdminRoute) && !user) {
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const isSocialBot = !isAdminRoute && isSocialBotAllowedPath(pathname, ua);
    const isE2ETest =
      process.env.NODE_ENV !== 'production' &&
      (request.headers.get('x-playwright-test') === 'true' || ua.includes('playwright'));

    if (!isSocialBot && !isE2ETest) {
      const redirectUrl = new URL('/login', request.nextUrl);
      redirectUrl.searchParams.set('redirectTo', `${pathname}${request.nextUrl.search || ''}`);
      return NextResponse.redirect(redirectUrl);
    }
  }

  // Canonical newsletter & inbox workspace redirects (308 permanent, after auth gate):
  if (
    pathname === '/broker/w/magazine' ||
    pathname === '/broker/magazine-editor' ||
    pathname === '/broker/campaign'
  ) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = '/broker/w/newsletter';
    return NextResponse.redirect(targetUrl, 308);
  }
  if (pathname === '/broker/inbox') {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = '/broker/w/inbox';
    return NextResponse.redirect(targetUrl, 308);
  }

  // 2. Admin route → also check admin role via custom header set downstream
  //    (we can't query DB here without breaking performance; role guard in API layer)

  // 3. Authenticated user on auth routes → redirect to broker hub
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/broker', request.nextUrl));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static assets)
     * - api routes (handled by their own auth guards)
     * - favicon, robots, sitemap
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
