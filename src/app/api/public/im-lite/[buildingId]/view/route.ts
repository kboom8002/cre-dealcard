/**
 * POST /api/public/im-lite/[buildingId]/view
 * Records a page view event for broker tracking.
 * Public endpoint — no auth required.
 * Uses activity_events table.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createHash } from 'node:crypto';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  const { buildingId } = await params;

  let sectionViewed: string | undefined;
  let dwellSeconds: number | undefined;
  let blindName: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    sectionViewed = typeof body?.section_viewed === 'string' ? body.section_viewed : undefined;
    dwellSeconds = typeof body?.dwell_seconds === 'number' ? body.dwell_seconds : undefined;
    blindName = typeof body?.blind_name === 'string' ? body.blind_name : undefined;
  } catch {
    // ignore parse errors
  }

  const userAgent = req.headers.get('user-agent') ?? '';
  const forwardedFor = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '';
  const referrer = req.headers.get('referer') ?? '';

  // Hash UA + IP for anonymised fingerprinting (no PII stored)
  const fingerprintRaw = `${userAgent}|${forwardedFor}`;
  const userAgentHash = createHash('sha256').update(fingerprintRaw).digest('hex').slice(0, 16);

  try {
    const supabase = createServiceClient();

    if (dwellSeconds !== undefined) {
      // 체류시간 이탈 기록
      await supabase.from('activity_events').insert([
        {
          building_id: buildingId,
          event_type: 'im_lite_view',
          metadata: {
            referrer,
            user_agent_hash: userAgentHash,
            dwell_seconds: dwellSeconds,
            blind_name: blindName ?? null,
          },
          created_at: new Date().toISOString(),
        },
      ]);

      // 체류시간 60초 이상 시 카카오 알림 발송 검토 및 비동기 발송
      if (dwellSeconds >= 60) {
        const { checkAndSendIMViewAlert } = await import('@/domain/notification/im-view-alert');
        checkAndSendIMViewAlert(supabase, {
          buildingId,
          blindName: blindName || '매물',
          dwellSeconds,
          visitorHash: userAgentHash,
          referrer,
        }).catch((err) => {
          console.error('[im-lite/view] Alert trigger error:', err);
        });
      }
    } else {
      // 일반 조회 기록
      await supabase.from('activity_events').insert([
        {
          building_id: buildingId,
          event_type: 'im_lite_view',
          metadata: {
            referrer,
            user_agent_hash: userAgentHash,
            section_viewed: sectionViewed ?? null,
          },
          created_at: new Date().toISOString(),
        },
      ]);
    }

    // Hot Lead 스코어 검토 및 알림 비동기 트리거
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
                console.error('[Hot Lead Alert] Failed to send alert:', err);
              });
            }
          })
          .catch((err) => {
            console.error('[Hot Lead Alert] Scoring calculation failed:', err);
          });
      }
    }
  } catch (err) {
    // Non-critical — tracking failure should not break the viewer
    console.error('[im-lite/view] Failed to record view event:', err);
  }

  return NextResponse.json({ ok: true });
}
