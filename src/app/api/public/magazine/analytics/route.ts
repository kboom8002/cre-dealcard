/**
 * POST /api/public/magazine/analytics
 * 매거진 분석 이벤트 수신 (공개, 인증 불필요)
 * → magazine_analytics_events 테이블에 적재
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { edition_id, visitor_id, event_type, section_id,
            target_url, target_param, dwell_seconds, scroll_pct, metadata } = body;

    if (!edition_id || !event_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    // 1. DB 스키마에 insert (기본 분석 로그)
    const { error } = await supabase.from('magazine_analytics_events').insert({
      edition_id,
      visitor_id: visitor_id || 'anonymous',
      event_type,
      section_id: section_id ?? null,
      target_url: target_url ?? null,
      target_param: target_param ?? null,
      dwell_seconds: dwell_seconds ?? null,
      scroll_pct: scroll_pct ?? null,
      metadata: metadata ?? {},
    });

    if (error) {
      console.error('[Magazine Analytics Error]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. 중앙 activity_events 테이블에 매핑 기록 (리드 스코어 산출용)
    let centralEventType: string | null = null;
    const centralBrokerId = metadata?.broker_id;

    if (event_type === 'page_view') {
      centralEventType = 'magazine_view';
    } else if (event_type === 'dwell' && dwell_seconds && dwell_seconds >= 30) {
      centralEventType = 'magazine_view';
    } else if (event_type === 'click') {
      if (target_url?.includes('im-lite')) {
        centralEventType = 'magazine_to_im_click';
      } else if (target_url?.includes('vibe-card')) {
        centralEventType = 'magazine_to_vibe_click';
      }
    }

    if (centralEventType && centralBrokerId && visitor_id) {
      try {
        const { data: bp } = await supabase
          .from('broker_profiles')
          .select('user_id')
          .eq('slug', centralBrokerId)
          .maybeSingle();

        if (bp?.user_id) {
          // 중앙 이벤트 테이블 적재
          await supabase.from('activity_events').insert({
            actor_id: bp.user_id,
            actor_role: 'system',
            event_type: centralEventType,
            entity_type: 'building_ssot_lite', // default entity
            broker_id: bp.user_id,
            metadata: {
              user_agent_hash: visitor_id,
              referrer: metadata?.referrer ?? null,
              dwell_seconds: dwell_seconds ?? null,
              target_url: target_url ?? null,
              target_param: target_param ?? null,
            },
            created_at: new Date().toISOString(),
          });

          // Hot Lead 점수 계산 및 알림 비동기 트리거
          const { calculateLeadScore } = await import('@/domain/analytics/cross-channel-score');
          const { checkAndSendHotLeadAlert } = await import('@/domain/notification/hot-lead-alert');

          calculateLeadScore(supabase, centralBrokerId, visitor_id)
            .then((scoreResult) => {
              if (scoreResult.isHotLead) {
                checkAndSendHotLeadAlert(supabase, centralBrokerId, scoreResult, visitor_id).catch((err) => {
                  console.error('[Hot Lead Alert] Failed to send alert:', err);
                });
              }
            })
            .catch((err) => {
              console.error('[Hot Lead Alert] Scoring calculation failed:', err);
            });
        }
      } catch (err) {
        console.error('[Magazine Analytics API] Central logging error:', err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[POST /api/public/magazine/analytics]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
