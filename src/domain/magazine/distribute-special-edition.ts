/**
 * Special Edition Distributor (속보 매거진 스마트 배포기)
 *
 * 해당 매물의 권역 및 자산유형에 매칭되는 관심 구독자를 자동 필터링하여
 * 30초 안에 카카오 알림톡 및 이메일로 긴급 속보를 배포합니다.
 */

import { sendKakaoAlimtalk } from '@/lib/notification/notification-service';
import { sendMagazineEmail } from '@/lib/notification/email-service';
import type { MagazineDbClient, MagazineEdition } from './types';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('distribute-special-edition');

export interface DistributeSpecialEditionInput {
  edition: MagazineEdition;
  buildingId: string;
  areaSignal: string;
  assetType: string;
  priceBand?: string;
  headline: string;
  brokerId: string;
}

export interface DistributionResult {
  totalTargets: number;
  sent: number;
  failed: number;
  kakaoSent: number;
  emailSent: number;
}

export async function distributeSpecialEdition(
  supabase: MagazineDbClient,
  input: DistributeSpecialEditionInput
): Promise<DistributionResult> {
  const { edition, areaSignal, assetType, headline, brokerId } = input;

  try {
    // 1. 브로커의 전체 활성 구독자 조회
    const { data: rawSubscribers, error: subError } = await supabase
      .from('magazine_subscribers')
      .select('id, subscriber_phone, subscriber_name, subscriber_email, email, segment, channel, interest_tags')
      .eq('broker_id', brokerId)
      .eq('status', 'active');

    if (subError || !rawSubscribers || rawSubscribers.length === 0) {
      log.info(`[Special Distribution] No active subscribers found for broker ${brokerId}`);
      return { totalTargets: 0, sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
    }

    // 2. 스마트 타깃 필터링 (권역, 자산유형, 투자자 세그먼트 일치도 분석)
    // - 구독자 관심 권역에 areaSignal(예: '성수', '강남')이 포함되어 있거나
    // - 구독자 관심 자산에 assetType(예: '꼬마빌딩', '상가')이 포함되어 있거나
    // - 세그먼트가 'investor'이거나 interest_tags가 비어있는 전체 수신 희망자
    const areaLower = areaSignal.toLowerCase();
    const assetLower = assetType.toLowerCase();

    const targetedSubscribers = rawSubscribers.filter((s: any) => {
      const tags = s.interest_tags || {};
      const regions: string[] = tags.regions || [];
      const assetTypes: string[] = tags.assetTypes || [];

      // 관심 권역 일치 확인 (부분 일치 지원: 성수동 <-> 성수)
      const regionMatch = regions.some(r =>
        areaLower.includes(r.toLowerCase()) || r.toLowerCase().includes(areaLower)
      );

      // 관심 자산유형 일치 확인
      const assetMatch = assetTypes.some(a =>
        assetLower.includes(a.toLowerCase()) || a.toLowerCase().includes(assetLower)
      );

      // 적극 관심자 우선 매칭 (권역 또는 자산 일치, 또는 세그먼트가 investor이고 태그 미지정)
      if (regionMatch || assetMatch) return true;
      if ((!regions.length && !assetTypes.length) || s.segment === 'investor') return true;

      return false;
    });

    if (targetedSubscribers.length === 0) {
      log.info(`[Special Distribution] No targeted subscribers matched for ${areaSignal}/${assetType}`);
      return { totalTargets: 0, sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
    }

    // 3. 브로커 정보 조회
    const { data: bp } = await supabase
      .from('broker_profiles')
      .select('name, user_id, slug')
      .or(`slug.eq.${brokerId},user_id.eq.${brokerId}`)
      .maybeSingle();

    const brokerName = bp?.name || '담당 중개사';
    const brokerSlug = bp?.slug || brokerId;
    const issueDate = (edition.published_at || new Date().toISOString()).slice(0, 10);
    const magazineUrl = `https://www.credeal.net/magazine/${brokerSlug}/${issueDate}`;

    let kakaoSent = 0;
    let kakaoFailed = 0;
    let emailSent = 0;
    let emailFailed = 0;

    // 4. 채널별 분류
    const kakaoTargets = targetedSubscribers.filter(
      (s: any) => (s.channel === 'kakao' || s.channel === 'both') && s.subscriber_phone
    );
    const emailTargets = targetedSubscribers.filter(
      (s: any) => (s.channel === 'email' || s.channel === 'both') && (s.subscriber_email || s.email)
    );

    // Track 1: 카카오 알림톡 긴급 속보 발송
    for (let i = 0; i < kakaoTargets.length; i += 5) {
      const batch = kakaoTargets.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((sub: any) => {
          const smsText = `[단독 속보] ${brokerName} 추천 매물이 접수되었습니다.\n${headline}\n확인: ${magazineUrl}`;
          return sendKakaoAlimtalk({
            recipientPhone: sub.subscriber_phone!,
            templateId: 'TPL_MAGAZINE_FLASH_ISSUE',
            variables: {
              '#{subscriberName}': sub.subscriber_name || '투자자',
              '#{brokerName}': brokerName,
              '#{magazineTitle}': `[단독 속보] ${areaSignal} ${assetType}`,
              '#{headline}': headline,
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

    // Track 2: 이메일 발송
    for (let i = 0; i < emailTargets.length; i += 5) {
      const batch = emailTargets.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (sub: any) => {
          const emailAddr = sub.subscriber_email || sub.email;
          return sendMagazineEmail({
            to: emailAddr!,
            brokerName,
            subscriberName: sub.subscriber_name || '투자자',
            magazineTitle: `[단독 속보] ${areaSignal} ${assetType} 급매 안내`,
            headline,
            magazineUrl,
            imageUrl: edition.cover_image_url || '',
            marketTemp: '적극 매수',
            fieldNote: {
              question: '매물 접수 배경',
              comment: '사전 검토를 마친 단독 협의 매물입니다.',
            },
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

    // 5. 배포 이력 기록 (activity_events)
    await supabase.from('activity_events').insert({
      actor_id: bp?.user_id || brokerId,
      actor_role: 'broker',
      event_type: 'special_magazine_distributed',
      entity_type: 'magazine_editions',
      metadata: {
        edition_id: edition.id,
        edition_label: edition.edition_label,
        building_id: input.buildingId,
        area_signal: areaSignal,
        asset_type: assetType,
        total_targets: targetedSubscribers.length,
        sent_count: totalSent,
        failed_count: totalFailed,
        kakao_sent: kakaoSent,
        email_sent: emailSent,
      },
      created_at: new Date().toISOString(),
    });

    log.info(`[Special Distribution] Finished: targets=${targetedSubscribers.length}, sent=${totalSent}, failed=${totalFailed}`);
    return {
      totalTargets: targetedSubscribers.length,
      sent: totalSent,
      failed: totalFailed,
      kakaoSent,
      emailSent,
    };
  } catch (err: any) {
    log.error('[Special Distribution] Failed:', err.message);
    return { totalTargets: 0, sent: 0, failed: 0, kakaoSent: 0, emailSent: 0 };
  }
}
