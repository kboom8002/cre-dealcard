import type { SupabaseClient } from '@supabase/supabase-js';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';

interface IMViewAlertInput {
  buildingId: string;
  blindName: string;       // "강남 GBD *** 오피스"
  dwellSeconds: number;
  visitorHash: string;
  referrer?: string;
}

export async function checkAndSendIMViewAlert(
  supabase: SupabaseClient,
  input: IMViewAlertInput
): Promise<boolean> {
  try {
    // 1. 매물 소유 브로커 조회
    const { data: building, error: bError } = await supabase
      .from('building_ssot_lite')
      .select('owner_id')
      .eq('id', input.buildingId)
      .single();

    if (bError || !building?.owner_id) {
      console.warn(`[IM View Alert] Building ${input.buildingId} has no owner_id`);
      return false;
    }

    // 2. 체류 60초 미만이면 스킵
    if (input.dwellSeconds < 60) {
      return false;
    }

    // 3. 24시간 내 동일 매물 알림 발송 이력 확인 (스팸 방지)
    const { count, error: countError } = await supabase
      .from('activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'im_view_alert_sent')
      .eq('entity_id', input.buildingId)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());

    if (countError) {
      console.error('[IM View Alert] Check history failed:', countError.message);
      return false;
    }

    if ((count ?? 0) > 0) {
      console.log(`[IM View Alert] Alert already sent for building ${input.buildingId} within 24 hours. Skipping.`);
      return false;
    }

    // 4. 브로커 전화번호 및 이름 조회
    const { data: profile, error: pError } = await supabase
      .from('profiles')
      .select('phone, display_name')
      .eq('id', building.owner_id)
      .single();

    if (pError || !profile?.phone) {
      console.warn(`[IM View Alert] Profile for owner ${building.owner_id} has no phone`);
      return false;
    }

    // 5. 카카오 알림톡 발송
    const minutes = Math.floor(input.dwellSeconds / 60);
    const seconds = input.dwellSeconds % 60;
    const dwellLabel = minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;

    const smsMessage = `[CRE Deal] "${input.blindName}" 투자설명서를 누군가 ${dwellLabel}간 상세히 열람했습니다. 잠재 고객의 관심 행동입니다.`;

    const sent = await sendKakaoAlimtalk({
      recipientPhone: profile.phone,
      templateId: 'TPL_IM_VIEW_ALERT', // Solapi에 사전 등록 필요
      variables: {
        '#{brokerName}': profile.display_name || '브로커',
        '#{buildingName}': input.blindName,
        '#{dwellTime}': dwellLabel,
        '#{viewUrl}': `https://www.credeal.net/broker/buildings`,
      },
      fallbackSms: smsMessage,
    });

    // 6. 발송 이력 기록
    if (sent) {
      const { error: logError } = await supabase.from('activity_events').insert({
        actor_id: building.owner_id,
        actor_role: 'system',
        event_type: 'im_view_alert_sent',
        entity_type: 'building_ssot_lite',
        entity_id: input.buildingId,
        broker_id: building.owner_id,
        metadata: {
          dwell_seconds: input.dwellSeconds,
          visitor_hash: input.visitorHash,
          referrer: input.referrer,
        },
      });
      if (logError) {
        console.error('[IM View Alert] Log event failed:', logError.message);
      }
    }

    return sent;
  } catch (err: any) {
    console.error('[IM View Alert] Error occurred:', err.message);
    return false;
  }
}
