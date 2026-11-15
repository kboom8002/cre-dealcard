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

const log = createModuleLogger('gate-nda-sign');
const SAFE_GRANT_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const ELIGIBLE_UNSIGNED_STATUSES = new Set(['pending', 'approved', 'granted']);
const PLACEHOLDER_PHONE_DIGITS = new Set(['01000000000', '00000000000', '0000']);

function normalizePhoneDigits(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '');
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.byteLength !== bufB.byteLength || bufA.byteLength === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyHmacGrantToken(grantId: string, providedToken: string): boolean {
  const secret = (process.env.NDA_GRANT_TOKEN_SECRET || process.env.GRANT_TOKEN_SECRET || '').trim();
  if (!secret || secret.length < 16 || !providedToken) return false;
  const cleanToken = providedToken.startsWith('sha256=')
    ? providedToken.slice('sha256='.length).trim()
    : providedToken.trim();
  if (!/^[0-9a-f]{64}$/i.test(cleanToken)) return false;
  const expected = crypto.createHmac('sha256', secret).update(grantId, 'utf8').digest('hex');
  return timingSafeStringEqual(cleanToken.toLowerCase(), expected.toLowerCase());
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
    // Fetch grant
    const selectQuery: any = supabase.from('im_pro_grants').select('*').eq('id', id);
    const { data: grant, error } =
      typeof selectQuery.maybeSingle === 'function'
        ? await selectQuery.maybeSingle()
        : await selectQuery.single();

    if (error || !grant) {
      return NextResponse.json({ error: 'Grant not found' }, { status: 404 });
    }

    if (grant.nda_signed_at) {
      return NextResponse.json({ error: 'NDA already signed', grantId: id }, { status: 409 });
    }

    const currentStatus = typeof grant.status === 'string' ? grant.status.trim().toLowerCase() : '';
    if (!currentStatus || !ELIGIBLE_UNSIGNED_STATUSES.has(currentStatus)) {
      return NextResponse.json(
        { ok: false, error: 'Grant is not eligible for NDA signing' },
        { status: 403 },
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
      } else if (verifyHmacGrantToken(id, headerOrBodyToken)) {
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

    // 3. Normalized phone digits or last-4 digits match against recorded requester_phone
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
      if (providedDigits.length === 4) {
        identityVerified = timingSafeStringEqual(recordedPhoneDigits.slice(-4), providedDigits);
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
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const wm = generateProIMWatermark({
      requesterName: authoritativeName,
      requesterPhone: authoritativePhone || '010-0000-0000',
      dealId: grant.deal_id || grant.building_id || id,
      grantId: id,
    });
    const last4ForSeed = normalizePhoneDigits(authoritativePhone || '').slice(-4);
    const watermarkSeed = `${authoritativeName}|${last4ForSeed}|${now.toISOString()}|${wm.watermarkSeed}`;

    const updatePayload: Record<string, unknown> = {
      status: 'active',
      nda_signed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      watermark_seed: watermarkSeed,
    };
    if (!existingName) {
      updatePayload.requester_name = trimmedSignerName;
    }
    if (!existingPhone && cleanedSignerPhone) {
      updatePayload.requester_phone = cleanedSignerPhone;
    }

    const { error: updateError } = await supabase
      .from('im_pro_grants')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      log.error('Failed to update im_pro_grants on NDA sign', { id, error: updateError.message });
      return NextResponse.json({ error: 'Failed to process NDA' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      grantId: id,
      expiresAt: expiresAt.toISOString(),
      message: 'NDA signed successfully. Pro IM access granted for 24 hours.',
    });
  } catch (err) {
    log.error('Unexpected NDA sign error', { id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to process NDA' }, { status: 500 });
  }
}
