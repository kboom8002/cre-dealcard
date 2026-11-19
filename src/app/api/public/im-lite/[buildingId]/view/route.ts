/**
 * POST /api/public/im-lite/[buildingId]/view
 * Records a page view event for broker tracking.
 * Public endpoint — no auth required.
 * Uses activity_events table.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isUuid } from '@/lib/im-lite/quick-generate-store';
import {
  extractShareTokenFromInput,
  verifyShareLinkToken,
  type ShareLinkChannel,
} from '@/lib/security/share-link-tokens';
import { isAllowedPublicDemoIm, isDemoSeedDisabledForProd } from '@/lib/im-lite/im-public-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import { createHash } from 'node:crypto';

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

/**
 * WP-7.3D P2-3: this beacon used to accept unauthenticated, unlimited writes for ANY buildingId,
 * and a forged `dwell_seconds >= 60` triggered broker AlimTalk alerts + hot-lead scoring.
 *  - buildingId must be a safe identifier;
 *  - per (IP+building) and per-IP rate limits → 429;
 *  - an event is recorded only for a token-authorized IM view (valid share link for THIS
 *    building) or an allowed public demo IM. Non-demo public IMs are only viewable with a share
 *    token (fetchIMData enforceShareToken), so token-less beacons are owner previews or forgeries
 *    and are acknowledged without any write ({ ok: true, recorded: false });
 *  - broker alerts / hot-lead scoring fire only for token-authorized views;
 *  - dwell is clamped to [0, 1800] seconds.
 */
const SAFE_BUILDING_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const MAX_DWELL_SECONDS = 1800;
const VIEW_LIMIT_PER_BUILDING_PER_MIN = 30;
const VIEW_LIMIT_PER_IP_PER_MIN = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  if (!buildingId || !SAFE_BUILDING_ID_RE.test(buildingId)) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_BUILDING_ID', message: '잘못된 매물 식별자입니다.' } },
      { status: 400 }
    );
  }

  const forwardedForRaw = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const clientIp = forwardedForRaw.split(',')[0]?.trim() || 'unknown';
  const [perBuildingOk, perIpOk] = await Promise.all([
    checkRateLimit(`${clientIp}:${buildingId}`, 'im_lite_view_bld', VIEW_LIMIT_PER_BUILDING_PER_MIN, 60_000),
    checkRateLimit(clientIp, 'im_lite_view_ip', VIEW_LIMIT_PER_IP_PER_MIN, 60_000),
  ]);
  if (!perBuildingOk || !perIpOk) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  let sectionViewed: string | undefined;
  let dwellSeconds: number | undefined;
  let blindName: string | undefined;
  let shareTokenInput: string | undefined;

  try {
    const rawBody = await req.json().catch(() => null);
    const body =
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, any>)
        : {};
    sectionViewed = typeof body?.section_viewed === 'string' ? body.section_viewed : undefined;
    dwellSeconds = typeof body?.dwell_seconds === 'number' ? body.dwell_seconds : undefined;
    blindName = typeof body?.blind_name === 'string' ? body.blind_name : undefined;
    const rawTok = body?.share_token ?? body?.shareToken ?? body?.token;
    shareTokenInput = typeof rawTok === 'string' ? rawTok.trim() : undefined;
  } catch {
    // ignore parse errors
  }

  const userAgent = req.headers.get('user-agent') ?? '';
  const forwardedFor = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const referrer = req.headers.get('referer') ?? '';
  const resolvedShareToken = shareTokenInput || extractShareTokenFromInput(referrer);

  let verifiedRecipientId: string | null = null;
  let verifiedBrokerId: string | null = null;
  let verifiedChannel: ShareLinkChannel | null = null;
  let hasShareToken = false;

  if (resolvedShareToken) {
    try {
      const verified = await verifyShareLinkToken({
        token: resolvedShareToken,
        buildingId,
      });
      if (verified.valid) {
        hasShareToken = true;
        verifiedRecipientId = verified.recipientId || null;
        verifiedBrokerId = verified.brokerId || null;
        verifiedChannel = verified.channel || null;
      }
    } catch {
      // non-blocking attribution fallback
    }
  }

  // Hash UA + IP for anonymised fingerprinting (no PII stored)
  const fingerprintRaw = `${userAgent}|${forwardedFor}`;
  const userAgentHash = createHash('sha256').update(fingerprintRaw).digest('hex').slice(0, 16);

  // WP-7.3D P2-3: only token-authorized views (or allowed public demo IMs) are recorded.
  const isPublicDemo = !isDemoSeedDisabledForProd(buildingId) && isAllowedPublicDemoIm(buildingId);
  if (!hasShareToken && !isPublicDemo) {
    return NextResponse.json({ ok: true, recorded: false });
  }
  const allowLeadSideEffects = hasShareToken;

  const tokenMeta = {
    ...(verifiedRecipientId ? { recipient_id: verifiedRecipientId } : {}),
    ...(verifiedBrokerId ? { broker_id: verifiedBrokerId } : {}),
    ...(verifiedChannel ? { share_token_channel: verifiedChannel } : {}),
    ...(hasShareToken ? { has_share_token: true } : {}),
  };

  try {
    const supabase = createServiceClient();
    const isBldUuid = isUuid(buildingId);
    const entityId = isBldUuid ? buildingId : null;
    const safeDwell =
      typeof dwellSeconds === 'number' && Number.isFinite(dwellSeconds)
        ? Math.min(Math.max(Math.round(dwellSeconds), 0), MAX_DWELL_SECONDS)
        : undefined;
    const safeBlindName = blindName ? blindName.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : undefined;

    const insertEventWithFallback = async (fullRow: Record<string, any>) => {
      const res = await supabase.from('activity_events').insert([fullRow]);
      if (res?.error) {
        const msg = String(res.error.message || '');
        const code = String(res.error.code || '');
        if (
          code === '22P02' ||
          code === '23503' ||
          code === 'PGRST204' ||
          code === '42703' ||
          /invalid input syntax for type uuid|foreign key constraint|column .* does not exist/i.test(msg)
        ) {
          const { building_ssot_lite_id: _omitSsot, building_id: _omitBld, ...rest } = fullRow;
          const retryPayload =
            code === '23503' || (code === '22P02' && isBldUuid === false)
              ? { ...rest, building_id: buildingId, building_ssot_lite_id: null }
              : rest;
          const retryRes = await supabase.from('activity_events').insert([retryPayload]);
          if (retryRes?.error) {
            const retryCode = String(retryRes.error.code || '');
            const retryMsg = String(retryRes.error.message || '');
            log.warn('[im-lite/view] activity_events fallback insert error:', {
              code: retryCode,
              message: retryMsg,
              buildingId,
            });
            if (retryCode === '42703' || retryCode === 'PGRST204' || /column .* does not exist/i.test(retryMsg)) {
              const finalRes = await supabase.from('activity_events').insert([rest]);
              if (finalRes?.error) {
                log.warn('[im-lite/view] activity_events final fallback insert failed:', {
                  code: finalRes.error.code,
                  message: finalRes.error.message,
                  buildingId,
                });
              }
            }
          }
        } else {
          log.warn('[im-lite/view] activity_events insert failed:', {
            code,
            message: msg,
            buildingId,
          });
        }
      }
    };

    if (safeDwell !== undefined) {
      // 체류시간 이탈 기록
      await insertEventWithFallback({
        building_id: buildingId,
        building_ssot_lite_id: buildingId,
        entity_type: 'building',
        entity_id: entityId,
        event_type: 'im_lite_view',
        metadata: {
          building_id: buildingId,
          view_type: 'im_lite',
          referrer,
          user_agent_hash: userAgentHash,
          dwell_seconds: safeDwell,
          blind_name: safeBlindName ?? null,
          ...(sectionViewed ? { section_viewed: sectionViewed.slice(0, 60) } : {}),
          ...tokenMeta,
        },
        created_at: new Date().toISOString(),
      });

      // 체류시간 60초 이상 시 카카오 알림 발송 검토 및 비동기 발송
      if (safeDwell >= 60 && allowLeadSideEffects) {
        const { checkAndSendIMViewAlert } = await import('@/domain/notification/im-view-alert');
        checkAndSendIMViewAlert(supabase, {
          buildingId,
          blindName: safeBlindName || '매물',
          dwellSeconds: safeDwell,
          visitorHash: userAgentHash,
          referrer,
        }).catch((err) => {
          log.error('[im-lite/view] Alert trigger error:', err);
        });
      }
    } else {
      // 일반 조회 기록
      await insertEventWithFallback({
        building_id: buildingId,
        building_ssot_lite_id: buildingId,
        entity_type: 'building',
        entity_id: entityId,
        event_type: 'im_lite_view',
        metadata: {
          building_id: buildingId,
          view_type: 'im_lite',
          referrer,
          user_agent_hash: userAgentHash,
          section_viewed: sectionViewed ? sectionViewed.slice(0, 60) : null,
          ...tokenMeta,
        },
        created_at: new Date().toISOString(),
      });
    }

    // 관심 열람 스코어 검토 및 알림 비동기 트리거
    if (isBldUuid && allowLeadSideEffects) {
      const { data: bld } = await supabase
        .from('building_ssot_lite')
        .select('owner_id')
        .eq('id', buildingId)
        .maybeSingle();

      if (bld?.owner_id) {
        const { data: brk } = await supabase
          .from('broker_profiles')
          .select('slug')
          .eq('user_id', bld.owner_id)
          .maybeSingle();

        if (brk?.slug) {
          const { calculateLeadScore } = await import('@/domain/analytics/cross-channel-score');
          const { checkAndSendHotLeadAlert } = await import('@/domain/notification/hot-lead-alert');

          calculateLeadScore(supabase, brk.slug, userAgentHash)
            .then((scoreResult) => {
              if (scoreResult.isHotLead) {
                checkAndSendHotLeadAlert(supabase, brk.slug, scoreResult, userAgentHash).catch((err) => {
                  log.error('[Hot Lead Alert] Failed to send alert:', err);
                });
              }
            })
            .catch((err) => {
              log.error('[Hot Lead Alert] Scoring calculation failed:', err);
            });
        }
      }
    }
  } catch (err) {
    // Non-critical — tracking failure should not break the viewer
    log.error('[im-lite/view] Failed to record view event:', err);
  }

  return NextResponse.json({ ok: true, recorded: true });
}
