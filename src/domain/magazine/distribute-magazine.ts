/**
 * @module distributeMagazine
 * @description 매거진 발행 시 카카오 알림톡 + 이메일 + 원페이지 이미지 3채널 일괄 배포.
 * weekly-magazine 크론 또는 에디터의 "발행" 버튼에서 호출됩니다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import { sendMagazineEmail } from '@/lib/notification/email-service';
import { dispatchEdition, type DispatchTarget } from './rail/dispatcher';
import { generatePersonalizedInsert } from './weekly-generator';

export interface DistributeMagazineEditionInput {
  id?: string;
  title: string;
  date: string;
  headline?: string;
  market_temp?: string;
  target_segments?: string[];
  content?: Record<string, unknown>;
}

export async function distributeMagazine(
  supabase: SupabaseClient,
  brokerId: string,
  edition: DistributeMagazineEditionInput
): Promise<{ sent: number; failed: number; kakaoSent: number; emailSent: number }> {
  try {
    // 1. 활성 구독자 조회 (전체 채널)
    const { data: rawSubscribers, error: subError } = await supabase
      .from('magazine_subscribers')
      .select('id, subscriber_phone, subscriber_name, subscriber_email, email, segment, channel, interest_tags')
      .eq('broker_id', brokerId)
      .eq('status', 'active');

    if (subError) {
      console.error('[Magazine Distribution] Failed to query subscribers:', subError.message);
      return { sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
    }

    if (!rawSubscribers || rawSubscribers.length === 0) {
      console.log(`[Magazine Distribution] No active subscribers found for broker ${brokerId}`);
      return { sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
    }

    // 2. 세그먼트 필터링 (target_segments가 'all'이 아니면 해당 자산유형 관심 구독자만 필터)
    let subscribers = rawSubscribers;
    const targetSegments = edition.target_segments || ['all'];
    if (!targetSegments.includes('all')) {
      subscribers = rawSubscribers.filter((s: any) => {
        const subAssetTypes = s.interest_tags?.assetTypes || [];
        return targetSegments.some((seg) => subAssetTypes.includes(seg) || seg === 'all');
      });
    }

    // 3. 브로커 정보 조회
    const { data: bp, error: bpError } = await supabase
      .from('broker_profiles')
      .select('name, user_id')
      .eq('slug', brokerId)
      .maybeSingle();

    if (bpError) {
      console.warn('[Magazine Distribution] Failed to query broker profile name:', bpError.message);
    }

    const brokerName = bp?.name || brokerId;
    const magazineUrl = `https://www.credeal.net/magazine/${brokerId}/${edition.date}`;
    const onePageImageUrl = `https://www.credeal.net/api/magazine/${brokerId}/${edition.date}/image?format=story`;

    let kakaoSent = 0;
    let kakaoFailed = 0;
    let emailSent = 0;
    let emailFailed = 0;

    // 4. 채널별 타겟 분류
    const kakaoTargets = subscribers.filter(
      (s: any) => (s.channel === 'kakao' || s.channel === 'both') && s.subscriber_phone
    );
    const emailTargets = subscribers.filter(
      (s: any) => (s.channel === 'email' || s.channel === 'both') && (s.subscriber_email || s.email)
    );

    // Track 1: 카카오 알림톡 일괄 배포 발송 (병렬 5건씩 처리)
    for (let i = 0; i < kakaoTargets.length; i += 5) {
      const batch = kakaoTargets.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((sub) => {
          const smsText = `[${brokerName}] 주간 부동산 매거진이 발행되었습니다.\n주제: ${edition.title}\n링크: ${magazineUrl}`;
          return sendKakaoAlimtalk({
            recipientPhone: sub.subscriber_phone!,
            templateId: 'TPL_MAGAZINE_NEW_ISSUE',
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
          kakaoSent++;
        } else {
          kakaoFailed++;
        }
      }
    }

    // Track 2: 이메일 일괄 발송 (Resend / Safe Fallback)
    for (let i = 0; i < emailTargets.length; i += 5) {
      const batch = emailTargets.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (sub) => {
          const emailAddr = sub.subscriber_email || sub.email;
          let customInsert = '';
          if (sub.interest_tags && Object.keys(sub.interest_tags).length > 0) {
            customInsert = await generatePersonalizedInsert(
              sub.interest_tags,
              { theme_title: edition.title, ai_briefing: edition.headline },
              []
            );
          }

          return sendMagazineEmail({
            to: emailAddr!,
            brokerName,
            subscriberName: sub.subscriber_name || '투자자',
            magazineTitle: edition.title || `${edition.date} CRE 주간 리포트`,
            headline: edition.headline || '이번 주 상업용 부동산 시장 핵심 분석 리포트입니다.',
            magazineUrl,
            imageUrl: onePageImageUrl,
            marketTemp: edition.market_temp || '관망',
            customInsert: customInsert || undefined,
            // Extended email sections
            fieldNote: (edition as any).content?.field_note || null,
            featuredDeals: ((edition as any).content?.dealHighlights || (edition as any).content?.featured_deals || []).slice(0, 3),
            topNews: ((edition as any).content?.topNews || []).slice(0, 3),
            recentTransactions: ((edition as any).content?.recentTransactions || []).slice(0, 3),
          });
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          emailSent++;
        } else {
          emailFailed++;
        }
      }
    }

    const totalSent = kakaoSent + emailSent;
    const totalFailed = kakaoFailed + emailFailed;

    // 5. 배포 이력 기록
    const { error: logError } = await supabase.from('activity_events').insert({
      actor_id: brokerId,
      actor_role: 'system',
      event_type: 'magazine_distributed',
      entity_type: 'magazine_editions',
      metadata: {
        broker_id: brokerId,
        sent_count: totalSent,
        failed_count: totalFailed,
        kakao_sent: kakaoSent,
        email_sent: emailSent,
        total_subscribers: subscribers.length,
        issue_date: edition.date,
        image_url: onePageImageUrl,
      },
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error('[Magazine Distribution] Log event failed:', logError.message);
    }

    // 6. Universal Dispatch Rail 로깅 연동
    const railTargets: DispatchTarget[] = subscribers.map((s: any) => ({
      subscriberId: s.id || '',
      email: s.subscriber_email || s.email || '',
      segment: s.segment || 'investor',
      preferences: s.interest_tags || {},
    }));

    try {
      const editionId = edition.id || `${brokerId}_${edition.date}`;
      await dispatchEdition('weekly', editionId, railTargets, '');
    } catch (railErr) {
      console.warn('[Magazine Distribution] Dispatch rail recording error:', railErr);
    }

    console.log(
      `[Magazine Distribution] Finished for ${brokerId}: totalSent=${totalSent} (kakao=${kakaoSent}, email=${emailSent}), failed=${totalFailed}`
    );

    return { sent: totalSent, failed: totalFailed, kakaoSent, emailSent };
  } catch (err: any) {
    console.error('[Magazine Distribution] Unexpected error occurred:', err.message);
    return { sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
  }
}
