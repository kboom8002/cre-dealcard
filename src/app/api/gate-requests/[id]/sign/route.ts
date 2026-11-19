/**
 * POST /api/gate-requests/[id]/sign
 * Self-service NDA signing for Pro IM access (hardened against blind UUID enumeration & PII overwrite)
 */
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyAuth } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createModuleLogger } from '@/lib/logger';
import { generateProIMWatermark } from '@/domain/gate/nda-watermark';
import {
  createHmacGrantToken,
  isMissingColumnError,
  issueOrRefreshProGrant,
  parseGateReasonRequesterMeta,
  resolveProGrantByAnyId,
  timingSafeStringEqual,
  verifyHmacGrantToken,
} from '@/domain/gate/im-pro-grant-service';

const log = createModuleLogger('gate-nda-sign');
const SAFE_GRANT_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const ELIGIBLE_UNSIGNED_STATUSES = new Set(['pending', 'pending_nda', 'approved', 'granted']);
const PLACEHOLDER_PHONE_DIGITS = new Set(['01000000000', '00000000000', '0000']);

function normalizePhoneDigits(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown';
  const allowed = await checkRateLimit(ip, 'gate_nda_sign', 15, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { agreedToTerms, signerName, signerPhone, phoneLast4, grantToken } = body;

  if (
    agreedToTerms !== true ||
    !signerName ||
    typeof signerName !== 'string' ||
    signerName.trim() === ''
  ) {
    return NextResponse.json({ error: 'NDA agreement and signer name required' }, { status: 400 });
  }

  if (!id || !SAFE_GRANT_ID_RE.test(id) || id.includes('..')) {
    return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
  }

  const trimmedSignerName = signerName.trim();
  const supabase = createServiceClient();

  try {
    // Resolve strictly by im_pro_grants.id, grant_token, or gate_request_id (NEVER public building_id)
    const resolved = await resolveProGrantByAnyId(supabase, id, { allowBuildingLookup: false });
    let grant = resolved.grant;
    let gateRequest = resolved.gateRequest;

    // Direct gate_requests.id lookup (per-request ID only — never building_id)
    if (!grant && !gateRequest) {
      try {
        const grTable = supabase.from('gate_requests') as unknown as {
          select?: (cols: string) => {
            eq?: (col: string, val: string) => {
              maybeSingle?: () => PromiseLike<{
                data?: Record<string, unknown> | null;
                error?: unknown;
              }>;
            };
          };
        };
        const grQuery = grTable?.select?.('*')?.eq?.('id', id);
        if (grQuery && typeof grQuery.maybeSingle === 'function') {
          const grRes = await grQuery.maybeSingle();
          if (!grRes?.error && grRes?.data && String(grRes.data.id || '') === id) {
            gateRequest = grRes.data as typeof resolved.gateRequest;
          }
        }
      } catch {
        gateRequest = null;
      }
    }

    // Fallback: if an approved gate_request exists without a pre-issued grant row, issue one now
    if (!grant && gateRequest) {
      const gateStatus = String(gateRequest.status || '').trim().toLowerCase();
      if (!['approved', 'granted'].includes(gateStatus)) {
        return NextResponse.json(
          { ok: false, error: 'Grant is not eligible for NDA signing' },
          { status: 403 },
        );
      }
      const meta = parseGateReasonRequesterMeta(gateRequest.reason);
      const issued = await issueOrRefreshProGrant(supabase, {
        gateRequestId: String(gateRequest.id),
        buildingId: gateRequest.building_id ? String(gateRequest.building_id) : null,
        requesterId: gateRequest.requester_id ?? null,
        requesterName: meta.name,
        requesterEmail: meta.email,
        requesterPhone: meta.phone,
        ttlHours: 72,
        maxDownloads: 5,
        status: 'pending_nda',
      });
      if (issued.ok && issued.grant) {
        grant = issued.grant;
      }
    }

    if (!grant) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
    }

    const targetGrantId = String(grant.id || id);

    if (grant.nda_signed_at) {
      return NextResponse.json({ error: 'NDA already signed', grantId: targetGrantId }, { status: 409 });
    }

    const currentStatus = typeof grant.status === 'string' ? grant.status.trim().toLowerCase() : '';
    if (!currentStatus || !ELIGIBLE_UNSIGNED_STATUSES.has(currentStatus)) {
      return NextResponse.json(
        { ok: false, error: 'Grant is not eligible for NDA signing' },
        { status: 403 },
      );
    }

    // Per-grant brute-force lockout before checking phone/token
    const grantAllowed = await checkRateLimit(
      `nda_grant:${targetGrantId}`,
      'gate_nda_sign_grant',
      8,
      15 * 60_000,
    );
    if (!grantAllowed) {
      return NextResponse.json(
        { ok: false, error: '본인 확인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }

    // Proof of requester identity (prevents blind UUID enumeration / unauthorized activation)
    const headerOrBodyToken =
      (typeof grantToken === 'string' ? grantToken.trim() : '') ||
      (req.headers.get('x-grant-token') || '').trim();

    let identityVerified = false;

    // 1. Grant token / HMAC proof
    if (headerOrBodyToken) {
      if (
        typeof grant.grant_token === 'string' &&
        grant.grant_token.trim().length >= 8 &&
        timingSafeStringEqual(headerOrBodyToken, grant.grant_token.trim())
      ) {
        identityVerified = true;
      } else if (verifyHmacGrantToken(targetGrantId, headerOrBodyToken) || verifyHmacGrantToken(id, headerOrBodyToken)) {
        identityVerified = true;
      }
    }

    // 2. Authenticated user session matching requester_id or requester_email
    if (
      !identityVerified &&
      (grant.requester_id || grant.requester_email) &&
      (Boolean(req.headers.get('authorization')) || req.cookies.getAll().length > 0)
    ) {
      const authRes = await verifyAuth(req);
      if (!authRes.error && authRes.user) {
        if (grant.requester_id && authRes.user.id === String(grant.requester_id)) {
          identityVerified = true;
        } else if (
          grant.requester_email &&
          authRes.user.email &&
          authRes.user.email.toLowerCase() === String(grant.requester_email).trim().toLowerCase()
        ) {
          identityVerified = true;
        }
      }
    }

    // 3. Normalized full phone match against recorded requester_phone (4-digit stub only if recorded phone is 4 digits)
    const recordedPhoneDigits = normalizePhoneDigits(grant.requester_phone);
    const hasRealRecordedPhone =
      recordedPhoneDigits.length >= 4 && !PLACEHOLDER_PHONE_DIGITS.has(recordedPhoneDigits);

    if (!identityVerified && hasRealRecordedPhone) {
      const providedPhoneRaw =
        typeof signerPhone === 'string' && signerPhone.trim() !== ''
          ? signerPhone
          : typeof phoneLast4 === 'string'
          ? phoneLast4
          : '';
      const providedDigits = normalizePhoneDigits(providedPhoneRaw);
      if (recordedPhoneDigits.length >= 8) {
        identityVerified =
          providedDigits.length >= 8 &&
          timingSafeStringEqual(recordedPhoneDigits, providedDigits);
      } else if (recordedPhoneDigits.length === 4 && providedDigits.length === 4) {
        identityVerified = timingSafeStringEqual(recordedPhoneDigits, providedDigits);
      } else if (providedDigits.length > 4) {
        identityVerified = timingSafeStringEqual(recordedPhoneDigits, providedDigits);
      }
    }

    // 4. Fallback ONLY when no phone/token/user_id was recorded on grant: exact recorded name match
    const existingName =
      typeof grant.requester_name === 'string' && grant.requester_name.trim() !== ''
        ? grant.requester_name.trim()
        : null;
    const existingPhone =
      typeof grant.requester_phone === 'string' && grant.requester_phone.trim() !== ''
        ? grant.requester_phone.trim()
        : null;

    if (
      !identityVerified &&
      !hasRealRecordedPhone &&
      !grant.requester_id &&
      !grant.requester_email &&
      !grant.grant_token &&
      existingName
    ) {
      identityVerified = timingSafeStringEqual(trimmedSignerName, existingName);
    }

    if (!identityVerified) {
      return NextResponse.json(
        {
          ok: false,
          error: '신청자 본인 확인에 실패했습니다. 열람 요청 시 입력한 연락처를 확인해주세요.',
          code: 'FORBIDDEN',
        },
        { status: 403 },
      );
    }

    // Preserve authoritative requester_name / requester_phone if already recorded on grant (NEVER overwrite!)
    const authoritativeName = existingName ?? trimmedSignerName;
    const cleanedSignerPhone =
      typeof signerPhone === 'string' && signerPhone.trim() !== '' ? signerPhone.trim() : null;
    const authoritativePhone = existingPhone ?? cleanedSignerPhone;

    const now = new Date();
    const minExpiryMs = now.getTime() + 72 * 60 * 60 * 1000;
    const existingExpiryMs = grant.expires_at ? Date.parse(String(grant.expires_at)) : 0;
    const expiresAt = new Date(
      Number.isFinite(existingExpiryMs) && existingExpiryMs > now.getTime() + 24 * 60 * 60 * 1000
        ? existingExpiryMs
        : minExpiryMs,
    );

    const wm = generateProIMWatermark({
      requesterName: authoritativeName,
      requesterPhone: authoritativePhone || '010-0000-0000',
      dealId: grant.deal_id || grant.building_id || targetGrantId,
      grantId: targetGrantId,
    });
    const last4ForSeed = normalizePhoneDigits(authoritativePhone || '').slice(-4);
    const watermarkSeed = `${authoritativeName}|${last4ForSeed}|${now.toISOString()}|${wm.watermarkSeed}`;

    const existingGrantToken =
      typeof grant.grant_token === 'string' && grant.grant_token.trim().length >= 8
        ? grant.grant_token.trim()
        : null;
    const issuedGrantToken = existingGrantToken || crypto.randomBytes(32).toString('hex');

    const updatePayload: Record<string, unknown> = {
      status: 'active',
      nda_signed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      watermark_seed: watermarkSeed,
      ...(existingGrantToken ? {} : { grant_token: issuedGrantToken }),
    };
    if (!existingName) {
      updatePayload.requester_name = trimmedSignerName;
    }
    if (!existingPhone && cleanedSignerPhone) {
      updatePayload.requester_phone = cleanedSignerPhone;
    }

    let persistedGrantToken: string | null = issuedGrantToken;
    let { error: updateError } = await supabase
      .from('im_pro_grants')
      .update(updatePayload)
      .eq('id', targetGrantId);

    if (updateError && isMissingColumnError(updateError) && 'grant_token' in updatePayload) {
      const { grant_token: _omitToken, ...fallbackPayload } = updatePayload;
      persistedGrantToken = existingGrantToken || null;
      const retry = await supabase
        .from('im_pro_grants')
        .update(fallbackPayload)
        .eq('id', targetGrantId);
      updateError = retry.error;
    }

    if (updateError) {
      log.error('Failed to update im_pro_grants on NDA sign', { id: targetGrantId, error: updateError.message });
      return NextResponse.json({ error: 'Failed to process NDA' }, { status: 500 });
    }

    const tokenParam = persistedGrantToken ? `?token=${encodeURIComponent(persistedGrantToken)}` : '';
    const redirectUrl = `/im-pro/${encodeURIComponent(targetGrantId)}${tokenParam}`;

    const res = NextResponse.json({
      ok: true,
      grantId: targetGrantId,
      ...(persistedGrantToken ? { grantToken: persistedGrantToken } : {}),
      redirectUrl,
      expiresAt: expiresAt.toISOString(),
      message: 'NDA signed successfully. Pro IM access granted.',
    });

    const cookieToken = persistedGrantToken || createHmacGrantToken(targetGrantId);
    if (cookieToken) {
      res.cookies.set('cre_pro_grant', `${targetGrantId}:${cookieToken}`, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 72 * 3600,
        secure: process.env.NODE_ENV === 'production',
      });
    }

    return res;
  } catch (err) {
    log.error('Unexpected NDA sign error', { id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to process NDA' }, { status: 500 });
  }
}
