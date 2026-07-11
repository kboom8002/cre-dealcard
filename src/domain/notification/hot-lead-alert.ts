import type { SupabaseClient } from '@supabase/supabase-js';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import type { LeadScoreResult } from '../analytics/cross-channel-score';

/**
 * Hot Lead 감지 시 브로커에게 카카오 알림톡 발송.
 * 조건: 리드 스코어 80+ 달성 + 24시간 내 동일 알림 미발송
 */
export async function checkAndSendHotLeadAlert(
  supabase: SupabaseClient,
  brokerId: string,
  lead: LeadScoreResult,
  visitorHash: string,
): Promise<boolean> {
  try {
    // 1. 중복 알림 방지 (24시간 내 동일 방문자에 대한 Hot Lead 알림)
    const { count, error: countError } = await supabase
      .from('activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'hot_lead_alert_sent')
      .eq('broker_id', brokerId)
      .filter("metadata->>'visitor_hash'", 'eq', visitorHash)
      .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString());

    if (countError) {
      console.error('[Hot Lead Alert] Check history failed:', countError.message);
      return false;
    }

    if ((count ?? 0) > 0) {
      console.log(`[Hot Lead Alert] Alert already sent for visitor ${visitorHash} today. Skipping.`);
      return false;
    }

    // 2. 브로커 정보 조회
    const { data: bp, error: bpError } = await supabase
      .from('broker_profiles')
      .select('user_id, name')
      .eq('slug', brokerId)
      .maybeSingle();

    if (bpError || !bp) {
      console.warn(`[Hot Lead Alert] Broker ${brokerId} not found`);
      return false;
    }

    // 3. 브로커 연락처 조회
    const { data: profile, error: pError } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', bp.user_id)
      .single();

    if (pError || !profile?.phone) {
      console.warn(`[Hot Lead Alert] Broker profile ${bp.user_id} has no phone`);
      return false;
    }

    // 4. 채널 접촉 라벨 설정
    const channelNames: Record<string, string> = {
      vibe: 'Vibe 명함',
      magazine: '위클리 매거진',
      im: '투자설명서(IM)',
    };
    
    const touchpointsList = lead.touchpoints
      .map(t => {
        if (t.startsWith('vibe')) return 'vibe';
        if (t.includes('magazine')) return 'magazine';
        if (t.includes('im')) return 'im';
        return '';
      })
      .filter(t => t !== '');
    
    const uniqueChannels = [...new Set(touchpointsList)].map(c => channelNames[c] || c);
    const channelLabel = uniqueChannels.join(', ');

    // 5. 알림톡 전송
    const smsMessage = `[CRE Deal] 🔥 Hot Lead 감지! 리드 스코어 ${lead.score}점 고객이 발견되었습니다. 접촉 채널: ${channelLabel}, 조회 매물수: ${lead.buildingsViewed.length}건. 대시보드에서 매칭 현황을 확인하세요.`;

    const sent = await sendKakaoAlimtalk({
      recipientPhone: profile.phone,
      templateId: 'TPL_HOT_LEAD', // Solapi에 사전 등록 필요
      variables: {
        '#{brokerName}': bp.name || '브로커',
        '#{leadScore}': `${lead.score}점`,
        '#{channels}': channelLabel || '다양한 채널',
        '#{buildingCount}': `${lead.buildingsViewed.length}건`,
        '#{dashboardUrl}': 'https://www.credeal.net/broker/funnel',
      },
      fallbackSms: smsMessage,
    });

    // 6. 알림 발송 기록 적재
    if (sent) {
      const { error: logError } = await supabase.from('activity_events').insert({
        actor_id: bp.user_id,
        actor_role: 'system',
        event_type: 'hot_lead_alert_sent',
        entity_type: 'broker_profiles',
        entity_id: brokerId,
        broker_id: bp.user_id,
        metadata: {
          visitor_hash: visitorHash,
          score: lead.score,
          touchpoints: lead.touchpoints,
          channels: uniqueChannels,
          buildings_viewed: lead.buildingsViewed,
        },
        created_at: new Date().toISOString(),
      });
      if (logError) {
        console.error('[Hot Lead Alert] Logging event failed:', logError.message);
      }
    }

    return sent;
  } catch (err: any) {
    console.error('[Hot Lead Alert] Error occurred:', err.message);
    return false;
  }
}
