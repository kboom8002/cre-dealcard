/**
 * GET /api/broker/im-lite/[buildingId]/views
 * Returns view count and recent views for broker dashboard.
 * Requires broker auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { createServiceClient } from '@/lib/supabase/service';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import {
  assertLegacyOrDbOwnership,
  isMissingRelationOrColumnError,
  WorkspaceRepositoryError,
} from '@/lib/workspace/workspace-repository';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('im-lite-views-route');

const SAFE_ID_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

function isMissingColumnErr(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: unknown }).code || '');
  const msg = String((err as { message?: unknown }).message || '');
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist|could not find the column/i.test(msg)
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;

  const { id: rawBuildingId } = await params;
  const buildingId = String(rawBuildingId || '').trim();
  if (!buildingId || !SAFE_ID_RE.test(buildingId)) {
    return NextResponse.json(
      { ok: false, code: 'BAD_REQUEST', error: '유효하지 않은 매물 식별자입니다.' },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();
  const isAdmin = guard.role === 'admin';
  const isUuidId = isUuid(buildingId);

  // P0-SEC & WP-7.4D P1-5: 조회 이력은 매물 소유자(또는 admin)만 — 비-UUID(bld-* 등)도 22P02 없이 검증
  if (isUuidId) {
    const ownership = await assertBuildingOwner(supabase, buildingId, guard.user!.id, {
      allowAdmin: true,
      role: guard.role,
    });
    if (!ownership.ok) {
      if (ownership.status === 404) {
        try {
          await assertLegacyOrDbOwnership(supabase, {
            id: buildingId,
            userId: guard.user!.id,
            isAdmin,
            kind: 'im',
            requireExisting: true,
          });
        } catch (err) {
          if (err instanceof WorkspaceRepositoryError) {
            return NextResponse.json(
              { ok: false, code: err.code, error: err.status === 403 ? '이 매물에 대한 권한이 없습니다.' : '매물을 찾을 수 없습니다.' },
              { status: err.status }
            );
          }
          return ownership.response;
        }
      } else {
        return ownership.response;
      }
    }
  } else {
    try {
      await assertLegacyOrDbOwnership(supabase, {
        id: buildingId,
        userId: guard.user!.id,
        isAdmin,
        kind: 'im',
        requireExisting: true,
      });
    } catch (err) {
      if (err instanceof WorkspaceRepositoryError) {
        const status = err.status === 403 || err.status === 404 ? err.status : 500;
        const message =
          status === 403
            ? '이 매물에 대한 권한이 없습니다.'
            : status === 404
            ? '매물을 찾을 수 없습니다.'
            : '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
        return NextResponse.json({ ok: false, code: err.code, error: message }, { status });
      }
      log.error('[views] legacy ownership lookup failed:', { buildingId, err });
      return NextResponse.json(
        { ok: false, code: 'LOOKUP_FAILED', error: '권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 500 }
      );
    }
  }

  interface ViewEventRow {
    id?: string;
    entity_id?: string | null;
    building_id?: string | null;
    metadata?: unknown;
    created_at?: string | null;
  }
  interface DbErrLike {
    code?: string;
    message?: string;
  }
  interface ChainableSelect {
    or?: (expr: string) => ChainableSelect;
    eq: (col: string, val: unknown) => ChainableSelect;
    order: (col: string, opts: { ascending: boolean }) => {
      limit: (n: number) => Promise<{ data: ViewEventRow[] | null; error: DbErrLike | null }>;
    };
  }

  let events: ViewEventRow[] | null = null;
  let error: DbErrLike | null = null;

  let primaryQ = supabase
    .from('activity_events')
    .select('id, entity_id, building_id, metadata, created_at')
    .eq('event_type', 'im_lite_view') as unknown as ChainableSelect;
  if (typeof primaryQ?.or === 'function') {
    primaryQ = primaryQ.or(
      isUuidId
        ? `building_id.eq.${buildingId},entity_id.eq.${buildingId},metadata->>building_id.eq.${buildingId}`
        : `building_id.eq.${buildingId},metadata->>building_id.eq.${buildingId}`
    );
  } else if (typeof primaryQ?.eq === 'function') {
    primaryQ = primaryQ.eq('building_id', buildingId);
  }
  const primaryRes = await primaryQ.order('created_at', { ascending: false }).limit(100);
  events = primaryRes?.data ?? null;
  error = primaryRes?.error ?? null;

  if (error && isMissingColumnErr(error)) {
    let fallbackQ = supabase
      .from('activity_events')
      .select('id, entity_id, metadata, created_at')
      .eq('event_type', 'im_lite_view') as unknown as ChainableSelect;
    if (isUuidId && typeof fallbackQ?.or === 'function') {
      fallbackQ = fallbackQ.or(
        `entity_id.eq.${buildingId},metadata->>building_id.eq.${buildingId}`
      );
    } else if (typeof fallbackQ?.eq === 'function') {
      fallbackQ = fallbackQ.eq('metadata->>building_id', buildingId);
    }
    const fallbackRes = await fallbackQ.order('created_at', { ascending: false }).limit(100);
    events = fallbackRes?.data ?? null;
    error = fallbackRes?.error ?? null;
  }

  if (error) {
    if (isMissingRelationOrColumnError(error)) {
      events = [];
    } else {
      log.error('[views] activity_events query failed:', {
        code: error?.code,
        message: error?.message,
        buildingId,
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'VIEWS_FETCH_FAILED',
          error: '조회 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status: 500 }
      );
    }
  }

  const allViews = (events ?? []).filter((e) => {
    const meta =
      e?.metadata && typeof e.metadata === 'object'
        ? (e.metadata as Record<string, unknown>)
        : {};
    const rowBid = String(e?.building_id || meta.building_id || e?.entity_id || '').trim();
    return rowBid === buildingId;
  });
  const totalViews = allViews.length;

  // Count unique by user_agent_hash
  const uniqueHashes = new Set(
    allViews.map((e) => (e.metadata as Record<string, unknown>)?.user_agent_hash as string).filter(Boolean)
  );
  const uniqueViews = uniqueHashes.size;

  const recentViews = allViews.slice(0, 20).map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    metadata: e.metadata,
  }));

  return NextResponse.json({
    ok: true,
    buildingId,
    totalViews,
    uniqueViews,
    recentViews,
  });
}
