/**
 * Special Edition Generator (속보 매거진 생성기)
 *
 * 급매 또는 신규 딜카드 승인 시 1-매물 중심의 긴급 속보(special) 에디션을 자동 생성합니다.
 * 블라인드 티저 프로젝터(projectToTeaser)를 연동하여 보안을 유지하며 호기심을 극대화합니다.
 */

import { callLLM } from '@/ai/llm-client';
import {
  type MarketTemperature,
  type MagazineEdition,
  type MagazineDbClient,
} from './types';
import { generateMagazineTeaserCards } from './magazine-teaser-cards';
import { createModuleLogger } from '@/lib/logger';

const log = createModuleLogger('special-edition-generator');

export interface GenerateSpecialEditionParams {
  supabase: MagazineDbClient;
  brokerId: string; // user_id 또는 slug
  buildingId: string;
  urgentHeadline?: string;
  urgentNote?: string;
}

export async function generateSpecialEdition(
  params: GenerateSpecialEditionParams
): Promise<MagazineEdition> {
  const { supabase, brokerId, buildingId, urgentHeadline, urgentNote } = params;

  // 1. 브로커 프로필 조회 (slug 또는 user_id 대응)
  let bp: any = null;
  let profile: any = null;

  const { data: bpBySlug } = await supabase
    .from('broker_profiles')
    .select('user_id, slug, specialty_regions, specialty_assets, bio, magazine_cover_image')
    .eq('slug', brokerId)
    .maybeSingle();

  if (bpBySlug) {
    bp = bpBySlug;
  } else {
    const { data: bpById } = await supabase
      .from('broker_profiles')
      .select('user_id, slug, specialty_regions, specialty_assets, bio, magazine_cover_image')
      .eq('user_id', brokerId)
      .maybeSingle();
    bp = bpById;
  }

  if (bp) {
    const { data: p } = await supabase
      .from('profiles')
      .select('id, display_name, company, phone, photo_url, tagline')
      .eq('id', bp.user_id)
      .single();
    profile = p;
  }

  const brokerName = profile?.display_name || '담당 중개사';
  const brokerCompany = profile?.company || 'CRE 중개법인';
  const brokerSlug = bp?.slug || brokerId;

  // 2. 매물 데이터 조회
  const { data: rawData, error: bError } = await supabase
    .from('building_ssot_lite')
    .select('id, raw_address, area_signal, asset_type, price_band, status, layers')
    .eq('id', buildingId)
    .single();
    
  const buildings = (rawData ? [rawData] : []).map(b => ({
    ...b,
    address: b.raw_address,
    price: b.price_band,
    photo_urls: (b.layers as any)?.photos?.urls || [],
    attrs: b.layers || {},
  }));
  const building = buildings[0];

  if (bError || !building) {
    throw new Error(`매물을 찾을 수 없습니다: ${buildingId}`);
  }

  const areaSignal = building.area_signal || building.address?.split(' ')?.[1] || '서울 핵심권역';
  const assetType = building.asset_type || '꼬마빌딩';
  const priceDisplay = building.price || building.attrs?.askingPriceDisplay || '가격 협의';

  // 3. 블라인드 티저 카드 생성
  const teaserCards = generateMagazineTeaserCards([
    { id: building.id, attrs: building.attrs || {} },
  ]);
  const primaryTeaser = teaserCards[0]?.teaserView;

  // 4. LLM을 통한 속보 헤드라인 및 긴급 브리핑 생성
  let generatedHeadline = urgentHeadline;
  let generatedBriefing = '';

  try {
    const res = await callLLM({
      model: 'gpt-5.4',
      temperature: 0.7,
      maxTokens: 700,
      responseFormat: 'json_object',
      systemPrompt: `당신은 대한민국 상업용 부동산(CRE) 전문 브로커의 긴급 속보 에디터입니다.
이번에 접수된 단독 추천/급매 매물을 분석하여 투자자들의 시선을 즉시 사로잡는 속보 헤드라인과 3문단 긴급 브리핑을 작성하세요.

작성 가이드:
1. 헤드라인: [단독 속보] 또는 [긴급 매물] 머리말 포함, 18~28자 (권역과 자산유형, 가격 메리트 강조)
2. 브리핑 본문:
   - 1문단: 매물 접수 배경 및 시장 희소성 (왜 지금 주목해야 하는가)
   - 2문단: 입지 및 자산 경쟁력 (권역 시그널, 수익률 및 개발/활용 잠재력)
   - 3문단: 추천 투자자 페르소나 및 빠른 문의 권고
3. 지번 및 세부 주소는 기밀이므로 언급하지 마십시오.

반환 JSON 형식:
{
  "headline": "헤드라인 텍스트",
  "briefing": "마크다운 형식 본문 (이모지 활용, 3문단)"
}`,
      userPrompt: `매물 권역: ${areaSignal}
자산 유형: ${assetType}
가격대: ${priceDisplay}
티저 카피: ${primaryTeaser?.hookCopy || '핵심 상권 우량 자산'}
가격 밴드: ${primaryTeaser?.bandedPrice || priceDisplay}
수익률 밴드: ${primaryTeaser?.bandedCapRate || '시세 수준'}
구조적 시그널: ${(primaryTeaser?.structuralSignals || []).join(', ')}
브로커 긴급 메모: ${urgentNote || '단독 매물 협의 완료'}`,
    });

    const parsed = JSON.parse(
      res.content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
    );

    if (!generatedHeadline) {
      generatedHeadline = parsed.headline || `[단독 속보] ${areaSignal} ${assetType} 급매 안내`;
    }
    generatedBriefing = parsed.briefing || '';
  } catch (err) {
    log.warn('[SpecialEditionGenerator] LLM 호출 실패, 폴백 사용:', err);
    if (!generatedHeadline) {
      generatedHeadline = `[단독 속보] ${areaSignal} ${assetType} 추천 매물 (${priceDisplay})`;
    }
    generatedBriefing = `⚡ **${areaSignal} 중심지 우량 ${assetType} 긴급 접수**\n\n` +
      `주변 시세 대비 경쟁력 있는 조건으로 협의된 ${assetType} 자산이 방금 접수되었습니다.\n\n` +
      `🏢 **핵심 포인트**: ${primaryTeaser?.hookCopy || '높은 가치 상승 잠재력'}\n` +
      `💰 **가격 밴드**: ${primaryTeaser?.bandedPrice || priceDisplay}\n\n` +
      `상세 제원과 IM은 보안 유지를 위해 사전 승인된 투자자에게 우선 공개됩니다. 빠른 확인을 권장합니다.`;
  }

  // 5. 속보 에디션 라벨 구성
  const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortId = buildingId.slice(0, 4).toUpperCase();
  const editionLabel = `FLASH-${todayStr}-${shortId}`;
  const marketTemp: MarketTemperature = '적극 매수';

  const contentPayload = {
    briefing: generatedBriefing,
    headline: generatedHeadline,
    specialDeal: {
      id: building.id,
      areaSignal,
      assetType,
      price: priceDisplay,
      photoUrl: building.photo_urls?.[0] ?? null,
      teaser: primaryTeaser,
    },
    teaserCards,
    broker: {
      name: brokerName,
      slug: brokerSlug,
      company: brokerCompany,
      phone: profile?.phone || '',
      photoUrl: profile?.photo_url || null,
      tagline: profile?.tagline || bp?.bio || '',
    },
    market_temp: marketTemp,
    cover_keywords: ['단독속보', areaSignal, assetType],
    urgentNote: urgentNote || null,
    isSpecial: true,
  };

  const editionRow = {
    broker_id: brokerSlug,
    edition_type: 'special' as const,
    edition_label: editionLabel,
    title: generatedHeadline,
    market_temp: marketTemp,
    cover_keywords: ['단독속보', areaSignal, assetType],
    cover_image_url: building.photo_urls?.[0] || bp?.magazine_cover_image || null,
    theme_title: `${areaSignal} 긴급 속보`,
    theme_body_md: generatedBriefing,
    theme_asset_types: [assetType],
    content: contentPayload,
    featured_deal_ids: [buildingId],
    target_segments: [assetType, areaSignal],
    status: 'published' as const,
    published_at: new Date().toISOString(),
    theme_color: '#ef4444', // 긴급 속보 테마 (Rose/Red)
    version: 1,
  };

  // 6. DB 저장 (magazine_editions)
  const { data, error } = await supabase
    .from('magazine_editions')
    .upsert(editionRow, {
      onConflict: 'broker_id,edition_type,edition_label',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`속보 매거진 저장 실패: ${error.message}`);
  }

  // 7. magazine_issues 듀얼 쓰기
  const issueDate = new Date().toISOString().slice(0, 10);
  try {
    await supabase.from('magazine_issues').upsert({
      broker_id: brokerSlug,
      issue_date: issueDate,
      content: contentPayload,
    }, {
      onConflict: 'broker_id,issue_date',
    });
  } catch (issueErr) {
    log.warn('[SpecialEditionGenerator] magazine_issues 듀얼 쓰기 경고 (non-blocking):', issueErr);
  }

  log.info(`[SpecialEditionGenerator] Successfully generated special edition: ${editionLabel} for ${brokerSlug}`);
  return data as MagazineEdition;
}
