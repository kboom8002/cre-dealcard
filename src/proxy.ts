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

const PROTECTED_BROKER = '/broker';
const PROTECTED_ADMIN = '/admin';
const AUTH_ROUTES = ['/login', '/signup'];

/**
 * Social crawler bot User-Agent patterns.
 * These bots must be able to read OG meta tags on protected routes
 * (e.g. /broker/deal-card/[id]) without authentication.
 */
const SOCIAL_BOT_PATTERNS = [
  'kakaotalk-scrap', 'facebookexternalhit', 'facebot',
  'twitterbot', 'slackbot', 'linkedinbot', 'discordbot',
  'whatsapp', 'telegrambot', 'line/',
  'googlebot', 'bingbot', 'yandex', 'baiduspider',
  'duckduckbot', 'ia_archiver', 'applebot',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  const isBrokerRoute = pathname.startsWith(PROTECTED_BROKER);
  const isAdminRoute = pathname.startsWith(PROTECTED_ADMIN);
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname === r);

  // 1. Unauthenticated user → redirect to /login if on protected route
  //    Exception: social crawlers are allowed through to read OG meta tags
  if ((isBrokerRoute || isAdminRoute) && !user) {
    const ua = (request.headers.get('user-agent') || '').toLowerCase();
    const isSocialBot = SOCIAL_BOT_PATTERNS.some(p => ua.includes(p));
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
