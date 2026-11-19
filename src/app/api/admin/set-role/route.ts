/**
 * POST /api/admin/set-role
 * 알파 테스트용: 이메일로 사용자 역할 변경 (admin 전용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('route');
const ALLOWED_ROLES = new Set(['broker', 'admin', 'public_user', 'vendor', 'expert']);

async function findAuthUserByEmail(
  supabase: ReturnType<typeof createServiceClient>,
  normalizedEmail: string,
): Promise<{ id: string } | null> {
  const perPage = 100;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    const match = batch.find((u) => (u.email || '').trim().toLowerCase() === normalizedEmail);
    if (match) return { id: match.id };
    if (batch.length < perPage) break;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth.error) return auth.error;

    const body = (await req.json()) as { email?: unknown; role?: unknown };
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    const role = typeof body?.role === 'string' ? body.role.trim() : '';

    if (!email || !role) {
      return NextResponse.json({ error: 'email과 role은 필수입니다.' }, { status: 400 });
    }
    if (!ALLOWED_ROLES.has(role)) {
      return NextResponse.json({ error: '유효하지 않은 역할(role)입니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const target = await findAuthUserByEmail(supabase, email.toLowerCase());
    if (!target) {
      return NextResponse.json({ error: '대상 사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ role })
      .eq('id', target.id);

    if (error) {
      log.error('[admin-set-role-post] Profile update error:', error);
      return NextResponse.json({ error: '역할 변경에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: target.id, email, role });
  } catch (err: unknown) {
    log.error('[admin-set-role-post] Error:', err);
    return NextResponse.json(
      { error: '요청 처리에 실패했습니다.' },
      { status: 500 },
    );
  }
}
