/**
 * src/lib/auth-guard.ts
 *
 * Server-side auth helpers for API Route Handlers.
 * Provides typed role verification without boilerplate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

type AllowedRole = 'broker' | 'admin' | 'expert' | 'public_user';

export interface AuthGuardResult {
  user: { id: string; email?: string } | null;
  role: string | null;
  profile: { role: string; display_name: string | null } | null;
  error: NextResponse | null;
}

export interface AuthGuardSuccess extends AuthGuardResult {
  user: { id: string; email?: string };
  error: null;
}

/**
 * Verifies the Bearer token and fetches the user's profile role.
 * Returns an error NextResponse if authentication fails.
 */
export async function verifyAuth(req: NextRequest): Promise<AuthGuardResult> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();

  let user: { id: string; email?: string } | null = null;

  if (token) {
    // Method 1: Bearer token auth
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: false } },
    );
    const { data, error: authErr } = await supabase.auth.getUser(token);
    if (!authErr && data?.user) {
      user = { id: data.user.id, email: data.user.email };
    }
  }

  if (!user) {
    // Method 2: Cookie-based auth (for client-side fetch from 'use client' pages)
    const { createServerClient } = await import('@supabase/ssr');
    const supabaseCookie = createServerClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {
            // Read-only in route handlers — no-op
          },
        },
      },
    );
    const { data, error: cookieErr } = await supabaseCookie.auth.getUser();
    if (!cookieErr && data?.user) {
      user = { id: data.user.id, email: data.user.email };
    }
  }

  if (!user) {
    return {
      user: null,
      role: null,
      profile: null,
      error: NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } },
        { status: 401 },
      ),
    };
  }

  // Profile lookup: prefer SERVICE_ROLE_KEY (bypasses RLS), fall back to
  // the user's own session token (satisfies RLS "id = auth.uid()" policy).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let profile: { role: string; display_name: string | null } | null = null;
  let profileErr: { message: string } | null = null;

  if (serviceKey) {
    const serviceClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey,
      { auth: { persistSession: false } },
    );
    const res = await serviceClient
      .from('profiles')
      .select('role, display_name')
      .eq('id', user.id)
      .single();
    profile = res.data;
    profileErr = res.error;
  } else {
    // Fallback: use authenticated user's token to query own profile through RLS
    console.warn('[auth-guard] SUPABASE_SERVICE_ROLE_KEY is not set. Using user token for profile lookup.');
    const userClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
    const res = await userClient
      .from('profiles')
      .select('role, display_name')
      .eq('id', user.id)
      .single();
    profile = res.data;
    profileErr = res.error;
  }

  if (profileErr) {
    console.error('[auth-guard] Profile lookup failed:', profileErr.message, '| userId:', user.id);
  }

  return {
    user,
    role: profile?.role ?? null,
    profile: profile ?? null,
    error: null,
  };
}

/**
 * Requires the user to have one of the allowed roles.
 * Returns an error NextResponse if the role check fails.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: AllowedRole[],
): Promise<AuthGuardResult> {
  const result = await verifyAuth(req);
  if (result.error) return result;

  if (!result.role || !allowedRoles.includes(result.role as AllowedRole)) {
    console.warn(
      `[auth-guard] Role check failed. userId=${result.user?.id}, actualRole=${result.role}, requiredRoles=${allowedRoles.join(',')}`,
    );
    return {
      ...result,
      error: NextResponse.json(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: `이 기능은 ${allowedRoles.join(', ')} 역할만 이용할 수 있습니다.`,
          },
        },
        { status: 403 },
      ),
    };
  }

  return result;
}

/**
 * Convenience: require broker or admin role.
 */
export function requireBroker(req: NextRequest) {
  return requireRole(req, ['broker', 'admin']);
}

/**
 * Convenience: require admin role only.
 */
export function requireAdmin(req: NextRequest) {
  return requireRole(req, ['admin']);
}
