/**
 * POST /api/broker/share-link — 공유 링크 발급
 * GET  /api/broker/share-link — 내 링크 목록 조회 (dealId / buildingId 필터 지원)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServiceClient } from '@/lib/supabase/service';
import { createShareLink } from '@/domain/distribution/share-link-service';
import { requireBroker } from '@/lib/auth-guard';
import { assertBuildingOwner } from '@/lib/authz/assert-owner';
import { issueShareLinkToken } from '@/lib/security/share-link-tokens';
import { getQuickImRecord } from '@/lib/im-lite/quick-generate-store';
import {
  DEMO_SEED_LEGACY_IDS,
  getWorkspaceItemByAnyId,
  isMissingRelationOrColumnError,
} from '@/lib/workspace/workspace-repository';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('broker-share-link-route');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(raw: string): boolean {
  return UUID_RE.test(raw.trim());
}

function isInvalidUuidPgError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: unknown; pgCode?: unknown; message?: unknown };
  const code = String(rec.code || rec.pgCode || '');
  const msg = String(rec.message || '');
  return code === '22P02' || /invalid input syntax for type uuid/i.test(msg);
}

const CreateShareLinkSchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  dealId: z.string().min(1, 'dealId is required'),
  dealVersion: z.number().int().positive().optional(),
  tier: z.enum(['teaser', 'basic']),
  brokerId: z.string().min(1, 'brokerId is required'),
  recipientId: z.string().optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const MintBuildingShareTokenSchema = z.object({
  buildingId: z.string().min(1, 'buildingId is required'),
  kind: z.enum(['im', 'dealcard']).optional(),
  recipientId: z.string().optional(),
  ttlDays: z.number().int().min(1).max(365).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

const GetShareLinksQuerySchema = z.object({
  brokerId: z.string().min(1).optional(),
  dealId: z.string().optional(),
  buildingId: z.string().optional(),
});

async function verifyTargetOwnership(params: {
  supabase: ReturnType<typeof createServiceClient>;
  targetId: string;
  callerId: string;
  role: string | null | undefined;
  isAdmin: boolean;
  allowDemoSeed?: boolean;
}): Promise<NextResponse | null> {
  const { supabase, targetId, callerId, role, isAdmin, allowDemoSeed = false } = params;
  if (isAdmin) return null;

  if (isUuid(targetId)) {
    try {
      const { data: dealRow, error: dealErr } = await supabase
        .from('deals')
        .select('id, broker_id')
        .eq('id', targetId)
        .maybeSingle();

      if (dealErr && !isMissingRelationOrColumnError(dealErr) && !isInvalidUuidPgError(dealErr)) {
        log.error('deal ownership lookup failed', { dealId: targetId });
        return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
      }
      if (dealRow) {
        if (String(dealRow.broker_id) !== callerId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return null;
      }
    } catch {
      // Fall through to workspace_items / building_ssot_lite ownership checks
    }

    const ownedWs = await getWorkspaceItemByAnyId(supabase, targetId, undefined, callerId).catch(() => null);
    if (ownedWs) return null;

    const anyWs = await getWorkspaceItemByAnyId(supabase, targetId).catch(() => null);
    if (anyWs) {
      if (anyWs.ownerId !== callerId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return null;
    }

    const bldOwn = await assertBuildingOwner(supabase, targetId, callerId, {
      allowAdmin: true,
      role,
    });
    if (bldOwn.ok) return null;
    if (bldOwn.status !== 404) {
      return bldOwn.status === 403
        ? NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        : bldOwn.response;
    }

    // Check document_objects by building_id for IM-only UUID records
    try {
      const docQ = supabase
        .from('document_objects')
        .select('id, owner_id, broker_id')
        .eq('building_id', targetId)
        .limit(1);
      const docRes = typeof docQ.maybeSingle === 'function' ? await docQ.maybeSingle() : await docQ;
      const docRow = Array.isArray(docRes?.data) ? docRes.data[0] : docRes?.data;
      if (docRow) {
        const docOwner = String((docRow as Record<string, unknown>).owner_id || (docRow as Record<string, unknown>).broker_id || '');
        if (docOwner && docOwner === callerId) return null;
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      // Ignore if document_objects unavailable in mock
    }

    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }

  // Non-UUID targetId (e.g. bld-fresh-*, bld-dup-*, bld-01):
  // NEVER query deals.id or building_ssot_lite.id (UUID columns -> Postgres 22P02)
  if (allowDemoSeed && DEMO_SEED_LEGACY_IDS.has(targetId)) {
    return null;
  }

  const ownedWs = await getWorkspaceItemByAnyId(supabase, targetId, undefined, callerId).catch(() => null);
  if (ownedWs) return null;

  if (!DEMO_SEED_LEGACY_IDS.has(targetId)) {
    const anyWs = await getWorkspaceItemByAnyId(supabase, targetId).catch(() => null);
    if (anyWs) {
      if (anyWs.ownerId !== callerId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return null;
    }
  }

  const quickRec = getQuickImRecord(targetId);
  if (quickRec) {
    if (quickRec.ownerId && quickRec.ownerId !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return null;
  }

  return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
}

export async function POST(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const callerId = auth.user!.id;
  const isAdmin = auth.role === 'admin' || auth.profile?.role === 'admin';

  try {
    const body = await req.json();

    // Mode B: Direct building share-token minting ({ buildingId, kind? }) for owner preview copy/share
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as Record<string, unknown>).buildingId === 'string' &&
      !(body as Record<string, unknown>).tenantId &&
      !(body as Record<string, unknown>).dealId
    ) {
      const parsedMint = MintBuildingShareTokenSchema.safeParse(body);
      if (!parsedMint.success) {
        return NextResponse.json(
          { error: 'Invalid share link payload', details: parsedMint.error.issues },
          { status: 400 }
        );
      }

      const cleanBuildingId = parsedMint.data.buildingId.trim();
      const supabase = createServiceClient();
      const ownErr = await verifyTargetOwnership({
        supabase,
        targetId: cleanBuildingId,
        callerId,
        role: auth.role,
        isAdmin,
        allowDemoSeed: true,
      });
      if (ownErr) return ownErr;

      const issued = await issueShareLinkToken({
        buildingId: cleanBuildingId,
        brokerId: callerId,
        recipientId: parsedMint.data.recipientId,
        ttlDays: parsedMint.data.expiresInDays ?? parsedMint.data.ttlDays ?? 30,
        kind: parsedMint.data.kind ?? 'im',
        channel: 'copy',
      });

      return NextResponse.json(
        {
          ok: true,
          token: issued.token,
          shareToken: issued.token,
          shareUrl: issued.shareUrl,
          link: {
            token: issued.token,
            dealId: cleanBuildingId,
            buildingId: cleanBuildingId,
            brokerId: callerId,
            expiresAt: issued.expiresAt,
          },
        },
        { status: 201 }
      );
    }

    const parsed = CreateShareLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid share link payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { tenantId, dealId, dealVersion, tier, brokerId, recipientId, expiresInDays } = parsed.data;
    const cleanDealId = dealId.trim();

    if (!isAdmin && brokerId !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const effectiveBrokerId = isAdmin ? brokerId : callerId;
    const supabase = createServiceClient();

    const ownErr = await verifyTargetOwnership({
      supabase,
      targetId: cleanDealId,
      callerId,
      role: auth.role,
      isAdmin,
      allowDemoSeed: false,
    });
    if (ownErr) return ownErr;

    if (!isUuid(cleanDealId)) {
      const issued = await issueShareLinkToken({
        buildingId: cleanDealId,
        brokerId: effectiveBrokerId,
        recipientId,
        ttlDays: expiresInDays ?? 30,
        kind: 'im',
        channel: 'copy',
      });
      return NextResponse.json(
        {
          link: {
            token: issued.token,
            tenantId,
            dealId: cleanDealId,
            dealVersion: dealVersion || 1,
            tier,
            brokerId: effectiveBrokerId,
            recipientId: recipientId || null,
            distinctViewers: 0,
            contaminated: false,
            expiresAt: issued.expiresAt,
            revokedAt: null,
            createdAt: new Date().toISOString(),
          },
        },
        { status: 201 }
      );
    }

    const link = await createShareLink({
      tenantId,
      dealId: cleanDealId,
      dealVersion,
      tier,
      brokerId: effectiveBrokerId,
      recipientId,
      expiresInDays,
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (err) {
    log.error('POST /api/broker/share-link failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireBroker(req);
  if (auth.error) return auth.error;

  const callerId = auth.user!.id;
  const isAdmin = auth.role === 'admin' || auth.profile?.role === 'admin';

  try {
    const { searchParams } = new URL(req.url);
    const parsed = GetShareLinksQuerySchema.safeParse({
      brokerId: searchParams.get('brokerId') ?? undefined,
      dealId: searchParams.get('dealId') ?? undefined,
      buildingId: searchParams.get('buildingId') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { brokerId, dealId, buildingId } = parsed.data;
    const cleanDealId = dealId?.trim() || undefined;
    const cleanBuildingId = buildingId?.trim() || undefined;
    const targetFilterId = cleanDealId || cleanBuildingId;

    if (!isAdmin && brokerId && brokerId !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const effectiveBrokerId = isAdmin && brokerId ? brokerId : callerId;
    const supabase = createServiceClient();
    const collected: Array<Record<string, unknown>> = [];
    const seenTokens = new Set<string>();

    const matchesTargetFilter = (row: Record<string, unknown>): boolean => {
      if (!targetFilterId) return true;
      const rowDealId = String(row.deal_id ?? row.dealId ?? '').trim();
      const rowBuildingId = String(row.building_id ?? row.buildingId ?? '').trim();
      if (cleanDealId && cleanBuildingId) {
        return rowDealId === cleanDealId || rowBuildingId === cleanBuildingId;
      }
      return rowDealId === targetFilterId || rowBuildingId === targetFilterId;
    };

    // 1. Check im_share_links when querying by buildingId (supports both UUID and non-UUID building_id)
    if (cleanBuildingId) {
      try {
        let imQuery: any = supabase
          .from('im_share_links')
          .select()
          .eq('broker_id', effectiveBrokerId)
          .eq('building_id', cleanBuildingId);
        if (typeof imQuery.is === 'function') {
          imQuery = imQuery.is('revoked_at', null);
        }
        if (typeof imQuery.order === 'function') {
          imQuery = imQuery.order('created_at', { ascending: false });
        }
        const imRes = await imQuery;
        if (!imRes?.error && Array.isArray(imRes?.data)) {
          const nowMs = Date.now();
          for (const rawRow of imRes.data as Array<Record<string, unknown>>) {
            if (!rawRow || typeof rawRow !== 'object') continue;
            if (rawRow.revoked_at || String(rawRow.status || '').toLowerCase() === 'revoked') continue;
            if (rawRow.expires_at && new Date(String(rawRow.expires_at)).getTime() <= nowMs) continue;
            if (String(rawRow.broker_id || '') && String(rawRow.broker_id) !== effectiveBrokerId) continue;
            if (!matchesTargetFilter(rawRow)) continue;
            const tok = String(rawRow.token || '').trim();
            if (tok && !seenTokens.has(tok)) {
              seenTokens.add(tok);
              collected.push(rawRow);
            }
          }
        }
      } catch {
        // Ignore if im_share_links table is absent in mock/unmigrated DB
      }
    }

    // 2. Query share_link (guarding against 22P02 when targetFilterId is non-UUID)
    let shareLinkQuery: any = supabase
      .from('share_link')
      .select()
      .eq('broker_id', effectiveBrokerId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (targetFilterId) {
      shareLinkQuery = shareLinkQuery.eq('deal_id', targetFilterId);
    }

    const { data, error } = await shareLinkQuery;
    if (error && !isInvalidUuidPgError(error) && !(cleanBuildingId && isMissingRelationOrColumnError(error))) {
      throw error;
    }

    if (Array.isArray(data)) {
      for (const rawRow of data as Array<Record<string, unknown>>) {
        if (!rawRow || typeof rawRow !== 'object') continue;
        if (rawRow.revoked_at) continue;
        if (String(rawRow.broker_id || '') && String(rawRow.broker_id) !== effectiveBrokerId) continue;
        if (!matchesTargetFilter(rawRow)) continue;
        const tok = String(rawRow.token || '').trim();
        if (tok && seenTokens.has(tok)) continue;
        if (tok) seenTokens.add(tok);
        collected.push(rawRow);
      }
    }

    return NextResponse.json({ links: collected });
  } catch (err) {
    log.error('GET /api/broker/share-link failed', {
      message: err instanceof Error ? err.message : 'unknown_error',
    });
    return NextResponse.json({ error: '요청 처리에 실패했습니다.' }, { status: 500 });
  }
}
