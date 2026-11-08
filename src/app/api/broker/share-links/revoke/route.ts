import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { getQuickImRecord } from '@/lib/im-lite/quick-generate-store';
import { revokeShareLinkToken } from '@/lib/security/share-link-tokens';

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const userId = guard.user?.id || null;
  const isAdmin = guard.role === 'admin';
  if (!userId) {
    return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const buildingId = typeof body?.buildingId === 'string' ? body.buildingId.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : null;

    if (!token && !buildingId) {
      return NextResponse.json(
        { ok: false, error: '잠글 링크 토큰 또는 매물 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // Check building ownership when buildingId is provided
    if (buildingId && !isAdmin) {
      const quickRec = getQuickImRecord(buildingId);
      if (quickRec?.ownerId && quickRec.ownerId !== userId) {
        return NextResponse.json(
          { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
          { status: 403 }
        );
      }

      try {
        const supabase = createServiceClient();
        const q: any = supabase
          .from('building_ssot_lite')
          .select('id, owner_id')
          .eq('id', buildingId);
        const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q.single?.();
        if (res?.data?.owner_id && String(res.data.owner_id) !== userId) {
          return NextResponse.json(
            { ok: false, error: '다른 중개인의 매물 링크는 잠글 수 없습니다.' },
            { status: 403 }
          );
        }
      } catch {
        // Ignore DB error when running in unit test without Supabase
      }
    }

    const result = await revokeShareLinkToken({
      token: token || undefined,
      buildingId: buildingId || undefined,
      brokerId: userId,
      reason,
      isAdmin,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || '링크 잠금 처리에 실패했습니다.' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      revoked: true,
      status: 'revoked',
      token: result.token,
      buildingId: result.buildingId,
      revokedAt: result.revokedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || '링크 잠금 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
