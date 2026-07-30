/**
 * 매거진 발행 시 구독자에게 카카오 알림톡 일괄 배포 발송.
 * weekly-magazine 크론 또는 에디터의 "발행" 버튼에서 호출됩니다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import { dispatchEdition, type DispatchTarget } from './rail/dispatcher';
import { computeEngagementScore, type InterestProfile } from './subscriber-profile';

export async function distributeMagazine(
  supabase: SupabaseClient,
  brokerId: string,
  edition: { title: string; date: string; headline?: string }
): Promise<{ sent: number; failed: number }> {
  try {
    // 1. 활성 구독자 조회 (카카오 채널 수신자 위주)
    const { data: subscribers, error: subError } = await supabase
      .from('magazine_subscribers')
      .select('id, subscriber_phone, subscriber_name, email, segment')
      .eq('broker_id', brokerId)
      .eq('status', 'active')
      .in('channel', ['kakao', 'both'])
      .not('subscriber_phone', 'is', null);

    if (subError) {
      console.error('[Magazine Distribution] Failed to query subscribers:', subError.message);
      return { sent: 0, failed: 0 };
    }

    if (!subscribers || subscribers.length === 0) {
      console.log(`[Magazine Distribution] No active kakao subscribers found for broker ${brokerId}`);
      return { sent: 0, failed: 0 };
    }

    // 2. 브로커 이름 조회
    const { data: bp, error: bpError } = await supabase
      .from('broker_profiles')
      .select('name')
      .eq('slug', brokerId)
      .maybeSingle();

    if (bpError) {
      console.warn('[Magazine Distribution] Failed to query broker profile name:', bpError.message);
    }

    const brokerName = bp?.name || brokerId;
    const magazineUrl = `https://www.credeal.net/magazine/${brokerId}/${edition.date}`;
    let sent = 0;
    let failed = 0;

    // 3. 일괄 배포 발송 (병렬 5건씩 처리)
    for (let i = 0; i < subscribers.length; i += 5) {
      const batch = subscribers.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((sub) => {
          const smsText = `[${brokerName}] 주간 부동산 매거진이 발행되었습니다. \n주제: ${edition.title}\n링크: ${magazineUrl}`;
          return sendKakaoAlimtalk({
            recipientPhone: sub.subscriber_phone!,
            templateId: 'TPL_MAGAZINE_NEW_ISSUE', // Solapi에 사전 등록 필요
            variables: {
              '#{subscriberName}': sub.subscriber_name || '투자자',
              '#{brokerName}': brokerName,
              '#{magazineTitle}': edition.title || `${edition.date} 주간 리포트`,
              '#{headline}': edition.headline || '이번 주 시장 동향과 분석을 확인해보세요.',
              '#{magazineUrl}': magazineUrl,
            },
            fallbackSms: smsText,
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          sent++;
        } else {
          failed++;
        }
      }
    }

    // 4. 배포 이력 기록
    const { error: logError } = await supabase.from('activity_events').insert({
      actor_id: brokerId,
      actor_role: 'system',
      event_type: 'magazine_distributed',
      entity_type: 'magazine_editions',
      metadata: {
        broker_id: brokerId,
        sent_count: sent,
        failed_count: failed,
        total_count: subscribers.length,
        issue_date: edition.date,
      },
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error('[Magazine Distribution] Log event failed:', logError.message);
    }

    // v3: Route through universal dispatch rail
    const targets: DispatchTarget[] = subscribers.map((s: any) => ({
      subscriberId: s.id || '',
      email: s.email,
      segment: s.segment || 'investor',
      preferences: {},
    }));

    // v3: Filter by engagement score for targeted dispatch
    const enrichedTargets = targets.filter(t => {
      // For now, send to all - engagement scoring will be refined later
      return true;
    });

    try {
      const htmlContent = ''; // Default empty or generate actual HTML
      const editionId = (edition as any).id || 'unknown';
      const dispatchResult = await dispatchEdition('weekly', editionId, enrichedTargets, htmlContent);
      console.info(`[magazine] Dispatched: ${dispatchResult.dispatched}/${dispatchResult.totalTargets}`);
    } catch (dispatchErr) {
      console.error('[Magazine Distribution] Dispatch failed:', dispatchErr);
    }

    console.log(`[Magazine Distribution] Finished for ${brokerId}: sent=${sent}, failed=${failed}`);
    return { sent, failed };
  } catch (err: any) {
    console.error('[Magazine Distribution] Unexpected error occurred:', err.message);
    return { sent: 0, failed: 0 };
  }
}
