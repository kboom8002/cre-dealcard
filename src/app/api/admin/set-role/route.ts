/**
 * POST /api/admin/set-role
 * 알파 테스트용: 이메일로 사용자 역할 변경 (admin 전용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { email, role } = await req.json();
  if (!email || !role) {
    return NextResponse.json({ error: 'email과 role은 필수입니다.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // profiles 테이블에서 이메일로 user_id 조회 (auth.users는 service role로만 접근)
  const { data: users, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const target = users.users.find(u => u.email === email);
  if (!target) return NextResponse.json({ error: `${email} 사용자를 찾을 수 없습니다.` }, { status: 404 });

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', target.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, userId: target.id, email, role });
}
