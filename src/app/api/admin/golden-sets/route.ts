/**
 * GET  /api/admin/golden-sets  — 필터/페이지네이션으로 Golden Set 목록 조회
 * POST /api/admin/golden-sets  — 수동으로 Golden Set 생성
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

const SELECT_FIELDS = [
  'id', 'document_id', 'building_id', 'section_type', 'section_alias',
  'asset_type', 'price_band', 'markdown', 'judge_score', 'was_edited',
  'source_type', 'tags', 'version', 'usage_count', 'last_used_at',
  'is_active', 'source_file_name', 'created_at', 'approved_at',
].join(', ');

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const sectionType = sp.get('section_type');
    const assetType = sp.get('asset_type');
    const sourceType = sp.get('source_type');
    const isActive = sp.get('is_active') ?? 'true';
    const tagsParam = sp.get('tags');
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? '20')));
    const sort = sp.get('sort') ?? 'judge_score';
    const order = sp.get('order') ?? 'desc';

    const supabase = createServiceClient();

    // ── Build data query ───────────────────────────────────────────────
    let query = supabase
      .from('im_golden_sets')
      .select(SELECT_FIELDS)
      .eq('is_active', isActive === 'true')
      .order(sort, { ascending: order === 'asc' })
      .range((page - 1) * limit, page * limit - 1);

    if (sectionType) query = query.eq('section_type', sectionType);
    if (assetType) query = query.eq('asset_type', assetType);
    if (sourceType) query = query.eq('source_type', sourceType);
    if (tagsParam) {
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) query = query.contains('tags', tags);
    }

    const { data, error } = await query;
    if (error) throw error;

    // ── Count query (same filters) ────────────────────────────────────
    let countQuery = supabase
      .from('im_golden_sets')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', isActive === 'true');

    if (sectionType) countQuery = countQuery.eq('section_type', sectionType);
    if (assetType) countQuery = countQuery.eq('asset_type', assetType);
    if (sourceType) countQuery = countQuery.eq('source_type', sourceType);
    if (tagsParam) {
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
      if (tags.length > 0) countQuery = countQuery.contains('tags', tags);
    }

    const { count, error: countError } = await countQuery;
    if (countError) throw countError;

    return NextResponse.json({ ok: true, data, total: count ?? 0, page, limit });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/admin/golden-sets]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const {
      section_type,
      section_alias,
      asset_type,
      price_band,
      markdown,
      judge_score,
      tags,
    } = body as {
      section_type?: string;
      section_alias?: string;
      asset_type?: string;
      price_band?: string;
      markdown?: string;
      judge_score?: number;
      tags?: string[];
    };

    // ── Validation ────────────────────────────────────────────────────
    if (!section_type) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: 'section_type은 필수입니다.' } },
        { status: 400 },
      );
    }
    if (!markdown || markdown.length < 50) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION', message: 'markdown은 최소 50자 이상이어야 합니다.' } },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const documentId = `manual_${Date.now()}`;

    const { data, error } = await supabase
      .from('im_golden_sets')
      .insert({
        document_id: documentId,
        section_type,
        section_alias: section_alias ?? null,
        asset_type: asset_type ?? null,
        price_band: price_band ?? null,
        markdown,
        judge_score: judge_score ?? null,
        tags: tags ?? [],
        source_type: 'manual_input',
        is_active: true,
        version: 1,
        was_edited: false,
        approved_at: new Date().toISOString(),
      })
      .select(SELECT_FIELDS)
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/admin/golden-sets]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}
