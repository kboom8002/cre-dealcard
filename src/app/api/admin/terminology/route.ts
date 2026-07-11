/**
 * GET  /api/admin/terminology  — 용어 규칙 목록 조회
 * POST /api/admin/terminology  — 새 용어 규칙 생성
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const category = sp.get('category');
    const isActive = sp.get('is_active');
    const search = sp.get('search');
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '20')));

    const supabase = createServiceClient();

    let query = supabase
      .from('im_terminology_rules')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (category) {
      query = query.eq('category', category);
    }
    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }
    if (search) {
      query = query.or(`pattern.ilike.%${search}%,replacement.ilike.%${search}%,note.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Count query
    let countQuery = supabase
      .from('im_terminology_rules')
      .select('id', { count: 'exact', head: true });

    if (category) {
      countQuery = countQuery.eq('category', category);
    }
    if (isActive !== null) {
      countQuery = countQuery.eq('is_active', isActive === 'true');
    }
    if (search) {
      countQuery = countQuery.or(`pattern.ilike.%${search}%,replacement.ilike.%${search}%,note.ilike.%${search}%`);
    }

    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (err: any) {
    console.error('[terminology-api] GET error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { pattern, replacement, category, priority, is_regex, note } = body;

    if (!pattern || !replacement) {
      return NextResponse.json({ ok: false, error: 'pattern, replacement가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('im_terminology_rules')
      .insert({
        pattern,
        replacement,
        category: category || 'general',
        priority: priority ?? 100,
        is_regex: is_regex ?? true,
        note: note || '',
        created_by: auth.user?.id,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    console.error('[terminology-api] POST error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
