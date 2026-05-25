/**
 * src/lib/auth-guard.ts
 *
 * Server-side auth helpers for API Route Handlers.
 * Provides typed role verification without boilerplate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return {
      user: null,
      role: null,
      profile: null,
      error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .single();

  return {
    user: { id: user.id, email: user.email },
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
    return {
      ...result,
      error: NextResponse.json(
        { error: `이 기능은 ${allowedRoles.join(', ')} 역할만 이용할 수 있습니다.` },
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
