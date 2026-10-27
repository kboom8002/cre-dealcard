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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  // Strip any incoming internal verification headers so clients can never spoof them
  request.headers.delete('x-cre-proxy-secret');
  request.headers.delete('x-cre-verified-user');

  // Public routes (/hub, /dc/*, /m/*, /magazine/*, /im-lite/*, etc.) do not require
  // a blocking remote supabase.auth.getUser() round-trip in proxy.
  if (!isBrokerRoute && !isAdminRoute && !isAuthRoute) {
    return NextResponse.next({ request });
  }

  // Create Supabase client with cookie-based session
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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
    const g = globalThis as Record<string, unknown>;
    const secret =
      (g.__creProxySecret as string) ||
      ((g.__creProxySecret =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'cre-proxy-secret') as string);
    request.headers.set('x-cre-proxy-secret', secret);
    request.headers.set('x-cre-verified-user', encodeURIComponent(JSON.stringify(user)));
    const prevCookies = supabaseResponse.cookies.getAll();
    supabaseResponse = NextResponse.next({ request });
    prevCookies.forEach((c) => supabaseResponse.cookies.set(c));
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
      redirectUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(redirectUrl);
    }
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
