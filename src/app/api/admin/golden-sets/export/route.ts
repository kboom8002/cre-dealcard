/**
 * GET /api/admin/golden-sets/export
 * Fine-tuning용 Golden Set 데이터 내보내기 (JSONL / JSON)
 *
 * Query params:
 *   format       — jsonl (default) | json
 *   min_score    — 최소 judge_score (default 3.5)
 *   section_type — 특정 섹션 필터
 *   source_type  — 특정 소스 필터
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';

const SYSTEM_PROMPT = '한국 상업용 부동산 투자설명서(IM) 전문 작성 AI입니다.';

interface GoldenRow {
  section_type: string;
  markdown: string;
  asset_type: string;
  price_band: string;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const format = sp.get('format') === 'json' ? 'json' : 'jsonl';
    const minScore = Number(sp.get('min_score') ?? '3.5');
    const sectionType = sp.get('section_type');
    const sourceType = sp.get('source_type');

    const supabase = createServiceClient();

    let query = supabase
      .from('im_golden_sets')
      .select('section_type, markdown, asset_type, price_band')
      .eq('is_active', true)
      .gte('judge_score', minScore)
      .order('judge_score', { ascending: false });

    if (sectionType) query = query.eq('section_type', sectionType);
    if (sourceType) query = query.eq('source_type', sourceType);

    const { data, error } = await query;
    if (error) throw error;

    const records = ((data ?? []) as GoldenRow[]).map(r => ({
      messages: [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        {
          role: 'user' as const,
          content: `자산유형: ${r.asset_type}, 가격대: ${r.price_band}, 섹션: ${r.section_type}`,
        },
        { role: 'assistant' as const, content: r.markdown },
      ],
    }));

    const timestamp = new Date().toISOString().slice(0, 10);
    const ext = format === 'jsonl' ? 'jsonl' : 'json';
    const filename = `golden-sets-export-${timestamp}.${ext}`;

    let body: string;
    if (format === 'jsonl') {
      body = records.map(r => JSON.stringify(r)).join('\n');
    } else {
      body = JSON.stringify(records, null, 2);
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': format === 'jsonl' ? 'application/x-ndjson' : 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[GET /api/admin/golden-sets/export]', message);
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL', message } },
      { status: 500 },
    );
  }
}
