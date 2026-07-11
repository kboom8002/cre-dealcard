/**
 * POST /api/admin/terminology/seed  — 하드코딩된 46개 용어 정규화 규칙을 DB로 마이그레이션
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { HARDCODED_TERM_RULES } from '@/domain/building/mobile-im/terminology-normalizer';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const supabase = createServiceClient();

    // 1. 기존 데이터 존재 확인
    const { count } = await supabase
      .from('im_terminology_rules')
      .select('id', { count: 'exact', head: true });

    if (count && count > 0) {
      return NextResponse.json({
        ok: false,
        error: '이미 DB에 용어 규칙이 존재합니다. 중복 입력을 막기 위해 시드를 중단합니다.',
      }, { status: 400 });
    }

    // 2. 하드코딩된 규칙 데이터 매핑
    const rows = HARDCODED_TERM_RULES.map((rule, idx) => {
      // pattern.source를 저장
      const patternStr = rule.pattern.source;
      
      // replacement mapping: 함수형은 특수 키워드 'fn:...' 로 저장
      let replacementStr = '';
      if (typeof rule.replacement === 'function') {
        if (rule.id === 'hardcoded_pyeongToSqm') replacementStr = 'fn:pyeongToSqm';
        else if (rule.id === 'hardcoded_conjugateLease') replacementStr = 'fn:conjugateLease';
        else if (rule.id === 'hardcoded_conjugateFill') replacementStr = 'fn:conjugateFill';
      } else {
        replacementStr = rule.replacement;
      }

      return {
        pattern: patternStr,
        replacement: replacementStr,
        category: rule.category,
        priority: 100 + idx,
        is_regex: true,
        is_active: true,
        note: `시스템 기본 규칙 (${rule.category})`,
        created_by: auth.user?.id,
      };
    });

    const { data, error } = await supabase
      .from('im_terminology_rules')
      .insert(rows)
      .select('id');

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      message: '시드 성공',
      inserted_count: data?.length || 0,
    });
  } catch (err: any) {
    console.error('[terminology-seed-api] error:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
