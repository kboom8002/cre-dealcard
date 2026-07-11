import type { SupabaseClient } from '@supabase/supabase-js';

export interface LeadScoreResult {
  score: number;
  isHotLead: boolean;
  touchpoints: string[];
  channelCount: number;
  buildingsViewed: string[];
  firstContact?: string;
  lastContact?: string;
}

const SCORE_WEIGHTS: Record<string, number> = {
  'vibe_card_view':         5,
  'vibe_to_im_click':       15,
  'vibe_to_magazine_click': 10,
  'magazine_view':          10,
  'magazine_subscribe':     20,
  'magazine_to_im_click':   25,
  'im_lite_view':           25,
  'im_to_vibe_click':       10,
  'im_view_alert_sent':     0,   // 이미 알림 발송됨, 중복 방지
};

const HOT_LEAD_THRESHOLD = 80;

export async function calculateLeadScore(
  supabase: SupabaseClient,
  brokerId: string,
  visitorHash: string,
): Promise<LeadScoreResult> {
  try {
    let userUuid = brokerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(brokerId);
    if (!isUuid) {
      const { data: bp } = await supabase
        .from('broker_profiles')
        .select('user_id')
        .eq('slug', brokerId)
        .maybeSingle();
      if (bp?.user_id) {
        userUuid = bp.user_id;
      }
    }

    const { data: events, error } = await supabase
      .from('activity_events')
      .select('event_type, entity_id, metadata, created_at')
      .eq('broker_id', userUuid)
      .filter("metadata->>'user_agent_hash'", 'eq', visitorHash)
      .gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[calculateLeadScore] Failed to query activity_events:', error.message);
      return { score: 0, isHotLead: false, touchpoints: [], channelCount: 0, buildingsViewed: [] };
    }

    let score = 0;
    const touchpoints: string[] = [];
    const buildings = new Set<string>();

    for (const e of events ?? []) {
      const weight = SCORE_WEIGHTS[e.event_type] ?? 0;
      score += weight;
      if (!touchpoints.includes(e.event_type)) {
        touchpoints.push(e.event_type);
      }
      if (e.entity_id) {
        buildings.add(e.entity_id);
      }
      if (e.metadata?.building_id) {
        buildings.add(e.metadata.building_id);
      }
    }

    // Multi-channel bonus: 3개 채널(Vibe, Magazine, IM) 모두 접촉 시 +30 보너스
    const channels = new Set<string>();
    for (const t of touchpoints) {
      if (t.startsWith('vibe')) channels.add('vibe');
      if (t.includes('magazine')) channels.add('magazine');
      if (t.includes('im')) channels.add('im');
    }
    if (channels.size >= 3) {
      score += 30;
    }

    return {
      score,
      isHotLead: score >= HOT_LEAD_THRESHOLD,
      touchpoints,
      channelCount: channels.size,
      buildingsViewed: [...buildings],
      firstContact: events?.[0]?.created_at,
      lastContact: events?.[events.length - 1]?.created_at,
    };
  } catch (err: any) {
    console.error('[calculateLeadScore] Unexpected error:', err.message);
    return { score: 0, isHotLead: false, touchpoints: [], channelCount: 0, buildingsViewed: [] };
  }
}
