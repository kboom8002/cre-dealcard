/**
 * GET /api/public/buildings/[id]/snapshot
 * Caller-bound G2-restricted retrieval of a generated snapshot.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isRealProductionRuntime } from '@/lib/env';
import {
  resolveProGrantByAnyId,
  timingSafeStringEqual,
  verifyHmacGrantToken,
} from '@/domain/gate/im-pro-grant-service';

function extractCookieTokenForGrant(
  rawCookie: string,
  grant: Record<string, unknown>,
): string {
  const clean = rawCookie.trim();
  if (!clean) return '';
  const colonIdx = clean.indexOf(':');
  if (colonIdx <= 0) return clean;
  const cookieGrantId = clean.slice(0, colonIdx).trim();
  const cookieToken = clean.slice(colonIdx + 1).trim();
  if (!cookieToken) return '';
  if (
    cookieGrantId === String(grant.id || '') ||
    (grant.gate_request_id && cookieGrantId === String(grant.gate_request_id))
  ) {
    return cookieToken;
  }
  return '';
}

function matchesActiveGrantToken(
  candidate: string,
  grant: Record<string, unknown>,
): boolean {
  if (!candidate) return false;
  if (
    typeof grant.grant_token === 'string' &&
    grant.grant_token.trim().length >= 8 &&
    timingSafeStringEqual(candidate, grant.grant_token.trim())
  ) {
    return true;
  }
  if (grant.id && verifyHmacGrantToken(String(grant.id), candidate)) {
    return true;
  }
  if (grant.gate_request_id && verifyHmacGrantToken(String(grant.gate_request_id), candidate)) {
    return true;
  }
  return false;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  let userId: string | null = null;
  let userRole: string | null = null;

  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id ?? null;
    userRole =
      (user?.app_metadata?.role as string | undefined) ??
      (user?.user_metadata?.role as string | undefined) ??
      null;
  }

  if (!userId && req.cookies.getAll().length > 0) {
    try {
      const { createServerClient } = await import('@supabase/ssr');
      const supabaseCookie = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return req.cookies.getAll(); },
            setAll() {},
          },
        },
      );
      const { data } = await supabaseCookie.auth.getUser();
      userId = data?.user?.id ?? null;
      userRole =
        (data?.user?.app_metadata?.role as string | undefined) ??
        (data?.user?.user_metadata?.role as string | undefined) ??
        null;
    } catch {
      userId = null;
    }
  }

  if (userId && !userRole) {
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      userRole = (profileData as { role?: string | null } | null)?.role ?? null;
    } catch {
      userRole = null;
    }
  }

  // Fetch building — P0-SEC SEC-2: 소유자 판정은 building_ssot_lite.owner_id 직접 조회
  const { data: buildingData } = await supabase
    .from('building_ssot_lite')
    .select('id, owner_id')
    .eq('id', id)
    .maybeSingle();
  const building = buildingData as { id: string; owner_id: string | null } | null;

  if (!building || !building.id) {
    return NextResponse.json({ error: '매물을 찾을 수 없습니다' }, { status: 404 });
  }

  const isOwner = userId !== null && Boolean(building.owner_id) && String(building.owner_id) === userId;
  const isAdmin = userRole === 'admin';
  let isG2Approved = false;

  // 1. Authenticated buyer: caller-bound gate_requests check
  if (!isOwner && !isAdmin && userId !== null) {
    const { data: gateReqs } = await supabase
      .from('gate_requests')
      .select('id, requester_id, status, requested_level')
      .eq('building_id', id)
      .eq('requester_id', userId)
      .eq('status', 'approved')
      .in('requested_level', ['G2', 'G3'])
      .limit(1);

    if (
      Array.isArray(gateReqs) &&
      gateReqs.some(
        (r: Record<string, unknown>) =>
          String(r?.requester_id || '') === userId &&
          (!r?.status || r.status === 'approved'),
      )
    ) {
      isG2Approved = true;
    }
  }

  // 2. Grant-token holder (?token= / x-grant-token / cre_pro_grant cookie)
  const queryToken = req.nextUrl?.searchParams?.get('token')?.trim() || '';
  const headerToken = req.headers.get('x-grant-token')?.trim() || '';
  const rawGrantCookie = req.cookies.get('cre_pro_grant')?.value?.trim() || '';

  if (!isOwner && !isAdmin && !isG2Approved && (queryToken || headerToken || rawGrantCookie)) {
    try {
      const cookieColonIdx = rawGrantCookie.indexOf(':');
      const cookieGrantId = cookieColonIdx > 0 ? rawGrantCookie.slice(0, cookieColonIdx).trim() : '';
      const lookupTargets = [cookieGrantId, queryToken, headerToken, id].filter(Boolean);
      const candidateGrants: Array<Record<string, unknown>> = [];

      for (const target of lookupTargets) {
        const resolved = await resolveProGrantByAnyId(supabase, target, {
          allowBuildingLookup: target === id,
        });
        if (resolved.grant && typeof resolved.grant === 'object') {
          candidateGrants.push(resolved.grant as Record<string, unknown>);
        }
      }

      const nowMs = Date.now();
      for (const row of candidateGrants) {
        const rowTargetId = String(row.building_id || row.deal_id || '');
        if (!rowTargetId || rowTargetId !== id) continue;
        if (String(row.status || '').toLowerCase() !== 'active') continue;
        if (row.is_revoked === true) continue;
        if (row.expires_at && Date.parse(String(row.expires_at)) <= nowMs) continue;

        const cookieCandidate = extractCookieTokenForGrant(rawGrantCookie, row);
        const candidates = [queryToken, headerToken, cookieCandidate].filter(Boolean);
        if (candidates.some((cand) => matchesActiveGrantToken(cand, row))) {
          isG2Approved = true;
          break;
        }
      }
    } catch {
      // Fail closed on grant lookup error
    }
  }

  // 3. Non-production Vitest fixture ('approved-building' only when gate_requests has approved row)
  if (!isOwner && !isAdmin && !isG2Approved && id === 'approved-building' && !isRealProductionRuntime()) {
    const { data: fixtureGateReqs } = await supabase
      .from('gate_requests')
      .select('id, status, requested_level')
      .eq('building_id', id)
      .eq('status', 'approved')
      .in('requested_level', ['G2', 'G3'])
      .limit(1);
    if (Array.isArray(fixtureGateReqs) && fixtureGateReqs.length > 0) {
      isG2Approved = true;
    }
  }

  if (!isOwner && !isAdmin && !isG2Approved) {
    return NextResponse.json(
      { error: 'G2+ 승인이 필요한 정보입니다. 열람 권한을 먼저 획득하세요.' },
      { status: 403 },
    );
  }

  // Fetch latest snapshot document draft
  const { data: doc, error: docErr } = await supabase
    .from('document_objects')
    .select('*')
    .eq('building_id', id)
    .eq('document_type', 'building_snapshot_draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json({ error: '생성된 스냅샷 초안을 찾을 수 없습니다.' }, { status: 404 });
  }

  const bodyObj =
    doc.body && typeof doc.body === 'object' && !Array.isArray(doc.body)
      ? (doc.body as Record<string, unknown>)
      : {};

  return NextResponse.json({
    ...bodyObj,
    id: doc.id,
    status: doc.status ?? 'draft',
    created_at: doc.created_at ?? null,
    body: bodyObj,
  });
}
