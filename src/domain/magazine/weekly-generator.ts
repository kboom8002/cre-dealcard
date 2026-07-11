/**
 * Weekly Magazine Generator
 *
 * 브로커별 주간 매거진을 자동 생성합니다.
 * 기존 src/app/api/magazine/[brokerId]/route.ts의
 * composeMagazineBriefing / getMarketIntelligence 패턴을 따릅니다.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { callLLM } from '@/ai/llm-client';
import {
  type MarketTemperature,
  type MagazineEdition,
  getWeekLabel,
  MARKET_TEMP_CONFIG,
} from './types';

// ── 타입 정의 ──────────────────────────────────────────────────────

interface BrokerContext {
  profile: {
    id: string;
    display_name: string;
    company: string;
    phone: string;
    photo_url: string | null;
    tagline: string;
  };
  broker: {
    user_id: string;
    slug: string;
    specialty_regions: string[];
    specialty_assets: string[];
    bio: string;
    total_deal_count_self: number;
    deal_size_range: string;
    magazine_cover_image: string | null;
  };
  activeDealCount: number;
}

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  sentiment: string;
  importance_score: number;
  topic: string;
}

interface DealItem {
  id: string;
  address: string;
  area_signal: string;
  asset_type: string;
  price: string;
  status: string;
  photo_urls: string[] | null;
}

interface PulseData {
  pulse_score: number;
  trend: string;
  summary_ko: string;
  key_findings: string[];
  signals: Record<string, unknown>;
}

interface ThemeResult {
  themeTitle: string;
  themeBodyMd: string;
  matchedDealIds: string[];
}

interface CoverData {
  marketTemp: MarketTemperature;
  coverKeywords: string[];
}

interface LLMGeneratedContent {
  market_temp: MarketTemperature;
  cover_keywords: string[];
  theme_title: string;
  theme_body_md: string;
  ai_briefing: string;
}

// ── 데이터 수집 ────────────────────────────────────────────────────

const fetchBrokerContext = async (
  supabase: SupabaseClient,
  brokerId: string,
): Promise<BrokerContext | null> => {
  try {
    const { data: bp } = await supabase
      .from('broker_profiles')
      .select(
        'user_id, slug, specialty_regions, specialty_assets, bio, total_deal_count_self, deal_size_range, magazine_cover_image',
      )
      .eq('slug', brokerId)
      .maybeSingle();

    if (!bp) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, display_name, company, phone, photo_url, tagline')
      .eq('id', bp.user_id)
      .single();

    if (!profile) return null;

    const { count: activeDealCount } = await supabase
      .from('building_ssot_lite')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', bp.user_id)
      .eq('status', 'public_signal_ready');

    return { profile, broker: bp, activeDealCount: activeDealCount ?? 0 };
  } catch {
    return null;
  }
};

const fetchWeekPulse = async (
  supabase: SupabaseClient,
  region: string,
  weekLabel: string,
): Promise<PulseData | null> => {
  try {
    const { data } = await supabase
      .from('cre_pulses')
      .select('pulse_score, trend, summary_ko, key_findings, signals')
      .eq('region', region)
      .eq('period_type', 'weekly')
      .eq('period_label', weekLabel)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
};

const fetchWeekNews = async (
  supabase: SupabaseClient,
  limit = 10,
): Promise<NewsItem[]> => {
  try {
    const { data } = await supabase
      .from('external_news')
      .select('id, title, summary, source, sentiment, importance_score, topic')
      .order('importance_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
};

const fetchWeekTransactions = async (
  supabase: SupabaseClient,
  limit = 10,
): Promise<Record<string, unknown>[]> => {
  try {
    const { data } = await supabase
      .from('external_transactions')
      .select(
        'address, dong, transaction_price, usage_type, building_area, transaction_date',
      )
      .order('transaction_date', { ascending: false })
      .limit(limit);
    return data ?? [];
  } catch {
    return [];
  }
};

const fetchActiveDeals = async (
  supabase: SupabaseClient,
  userId: string,
): Promise<DealItem[]> => {
  try {
    const { data } = await supabase
      .from('building_ssot_lite')
      .select('id, address, area_signal, asset_type, price, status, photo_urls')
      .eq('owner_id', userId)
      .in('status', ['public_signal_ready', 'active'])
      .order('updated_at', { ascending: false })
      .limit(10);
    return data ?? [];
  } catch {
    return [];
  }
};

const fetchSentimentData = async (
  supabase: SupabaseClient,
): Promise<{ avgSentiment: number; items: Record<string, unknown>[] }> => {
  try {
    const { data } = await supabase
      .from('social_sentiment')
      .select('keyword, sentiment_score, mention_count, analysis_date')
      .order('created_at', { ascending: false })
      .limit(5);
    const items = data ?? [];
    const avg =
      items.length > 0
        ? Math.round(
            items.reduce(
              (acc: number, s: Record<string, unknown>) =>
                acc + ((s.sentiment_score as number) ?? 50),
              0,
            ) / items.length,
          )
        : 50;
    return { avgSentiment: avg, items };
  } catch {
    return { avgSentiment: 50, items: [] };
  }
};

// ── 커버 데이터 빌드 ───────────────────────────────────────────────

/**
 * 펄스 스코어와 센티먼트 데이터로 시장 온도를 결정하고 커버 키워드를 추출합니다.
 */
export const buildWeeklyCoverData = (
  pulseData: PulseData | null,
  sentimentData: { avgSentiment: number; items: Record<string, unknown>[] },
): CoverData => {
  const score = pulseData?.pulse_score ?? sentimentData.avgSentiment;

  const marketTemp: MarketTemperature =
    score >= 80
      ? '적극 매수'
      : score >= 65
        ? '선별 매수'
        : score >= 45
          ? '관망'
          : score >= 25
            ? '조정 대기'
            : '위기 경계';

  // 키워드: pulse key_findings에서 3개, 부족하면 센티먼트 키워드로 보충
  const findings = pulseData?.key_findings ?? [];
  const sentimentKeywords = sentimentData.items
    .map((s) => s.keyword as string)
    .filter(Boolean);
  const allKeywords = [...findings, ...sentimentKeywords];
  const coverKeywords = allKeywords.slice(0, 3);

  // 최소 3개 보장 — 기본 키워드 사용
  while (coverKeywords.length < 3) {
    const defaults = ['CRE 시장동향', '투자 포인트', '거래 분석'];
    coverKeywords.push(defaults[coverKeywords.length] ?? '시장 리포트');
  }

  return { marketTemp, coverKeywords };
};

// ── 테마 빌드 ──────────────────────────────────────────────────────

/**
 * 뉴스 트렌드와 브로커 매물을 교차 분석하여 금주의 테마를 생성합니다.
 */
export const buildThemeOfWeek = async (
  news: NewsItem[],
  deals: DealItem[],
  region: string,
): Promise<ThemeResult> => {
  const newsDigest = news
    .slice(0, 5)
    .map((n) => `[${n.source}] ${n.title}: ${n.summary}`)
    .join('\n');

  const dealDigest = deals
    .slice(0, 5)
    .map((d) => `${d.address} (${d.asset_type}, ${d.price})`)
    .join('\n');

  try {
    const res = await callLLM({
      systemPrompt: `당신은 상업용 부동산 주간 매거진 에디터입니다.
이번 주 뉴스와 매물 데이터를 분석하여 "금주의 테마"를 작성하세요.
권역: ${region}

결과를 JSON으로 반환:
{
  "themeTitle": "테마 제목 (15-25자)",
  "themeBodyMd": "마크다운 본문 (500-800자, 3-4문단, 이모지 섹션 헤딩 포함)",
  "matchedDealIds": ["뉴스 주제와 관련된 매물 ID 배열"]
}`,
      userPrompt: `이번 주 뉴스:\n${newsDigest}\n\n브로커 활성 매물:\n${dealDigest}`,
      model: 'gpt-5.4',
      temperature: 0.7,
      maxTokens: 800,
      responseFormat: 'json_object',
    });

    const parsed = JSON.parse(
      res.content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    );

    // matchedDealIds 검증: 실제 매물 ID 목록에 있는 것만 필터링
    const validDealIds = new Set(deals.map((d) => d.id));
    const matchedDealIds = (parsed.matchedDealIds ?? []).filter(
      (id: string) => validDealIds.has(id),
    );

    return {
      themeTitle: parsed.themeTitle ?? `${region} 시장, 이번 주 핵심 테마`,
      themeBodyMd: parsed.themeBodyMd ?? '',
      matchedDealIds,
    };
  } catch (err) {
    console.warn('[buildThemeOfWeek] LLM 호출 실패, 폴백 사용:', err);
    return {
      themeTitle: `${region} 시장, 이번 주 핵심 트렌드`,
      themeBodyMd: news
        .slice(0, 3)
        .map((n) => `🏢 **${n.title}**\n${n.summary}`)
        .join('\n\n'),
      matchedDealIds: [],
    };
  }
};

// ── LLM 콘텐츠 생성 ───────────────────────────────────────────────

const generateLLMContent = async (
  brokerCtx: BrokerContext,
  news: NewsItem[],
  transactions: Record<string, unknown>[],
  pulseData: PulseData | null,
  coverData: CoverData,
): Promise<LLMGeneratedContent> => {
  const regionLabel =
    brokerCtx.broker.specialty_regions?.[0] ?? '강남·성수';
  const assetLabel =
    brokerCtx.broker.specialty_assets?.[0] ?? '꼬마빌딩';

  const newsText = news
    .slice(0, 6)
    .map((n) => `[${n.source}] ${n.title}: ${n.summary}`)
    .join('\n');

  const txText = transactions
    .slice(0, 5)
    .map(
      (tx) =>
        `${tx.address} ${tx.usage_type} ${tx.transaction_price} (${tx.transaction_date})`,
    )
    .join('\n');

  const pulseContext = pulseData
    ? `펄스 스코어: ${pulseData.pulse_score}/100, 트렌드: ${pulseData.trend}\n요약: ${pulseData.summary_ko}`
    : '펄스 데이터 없음';

  const tempEmoji = MARKET_TEMP_CONFIG[coverData.marketTemp].emoji;

  try {
    const res = await callLLM({
      systemPrompt: `당신은 "${brokerCtx.profile.display_name}" (${brokerCtx.profile.company}) 브로커를 위한 주간 CRE 매거진 에디터입니다.
전문 권역: ${regionLabel}, 전문 자산: ${assetLabel}

■ 이 매거진은 브로커가 고객(투자자/자산관리자)에게 배포하는 콘텐츠입니다.
■ 독자는 꼬마빌딩·상업용 부동산에 관심 있는 전문 투자자입니다.

시장 온도: ${tempEmoji} ${coverData.marketTemp}
커버 키워드: ${coverData.coverKeywords.join(', ')}

결과를 JSON으로 반환:
{
  "ai_briefing": "주간 AI 브리핑 본문 (마크다운, 4-6문단, 각 문단 이모지 섹션 헤딩, 600-1000자)",
  "theme_title": "금주의 테마 제목 (15-25자)",
  "theme_body_md": "테마 본문 마크다운 (500-800자)"
}

톤앤매너:
- 전문적이면서도 읽기 쉬운 매거진 문체 (존댓말)
- 데이터 근거 팩트 중심, 과장 금지
- 출처 있는 뉴스는 출처 명시
- **굵은 글씨**로 핵심 수치 강조`,
      userPrompt: `주간 뉴스:\n${newsText}\n\n실거래 동향:\n${txText}\n\n시장 펄스:\n${pulseContext}\n\n브로커 활성 매물: ${brokerCtx.activeDealCount}건`,
      model: 'gpt-5.4',
      temperature: 0.7,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });

    const parsed = JSON.parse(
      res.content
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, ''),
    );

    return {
      market_temp: coverData.marketTemp,
      cover_keywords: coverData.coverKeywords,
      theme_title: parsed.theme_title ?? `${regionLabel} 주간 테마`,
      theme_body_md: parsed.theme_body_md ?? '',
      ai_briefing: parsed.ai_briefing ?? '',
    };
  } catch (err) {
    console.warn('[generateLLMContent] LLM 호출 실패, 폴백 사용:', err);
    return {
      market_temp: coverData.marketTemp,
      cover_keywords: coverData.coverKeywords,
      theme_title: `${regionLabel} 이번 주 시장 동향`,
      theme_body_md: news
        .slice(0, 3)
        .map((n) => `🏢 **${n.title}**\n${n.summary}`)
        .join('\n\n'),
      ai_briefing: news
        .slice(0, 4)
        .map((n) => `📊 **${n.title}** (${n.source})\n${n.summary}`)
        .join('\n\n'),
    };
  }
};

// ── 메인: 주간 매거진 생성 ─────────────────────────────────────────

/**
 * 브로커의 주간 매거진 에디션을 자동 생성합니다.
 *
 * 1. 브로커 프로필, 주간 펄스, 뉴스, 거래, 매물 데이터 수집
 * 2. LLM으로 시장 온도, 커버 키워드, 테마, AI 브리핑 생성
 * 3. draft 상태로 magazine_editions에 저장
 */
export const generateWeeklyMagazine = async (params: {
  supabase: SupabaseClient;
  brokerId: string;
  editionType?: string;
  editionLabel?: string;
}): Promise<MagazineEdition> => {
  const { supabase, brokerId, editionLabel } = params;
  const label = editionLabel ?? getWeekLabel();

  // 1. 브로커 프로필 수집
  const brokerCtx = await fetchBrokerContext(supabase, brokerId);
  if (!brokerCtx) {
    throw new Error(`브로커를 찾을 수 없습니다: ${brokerId}`);
  }

  const region =
    (brokerCtx.broker.specialty_regions?.[0] ?? 'seongsu').toLowerCase();

  // 2. 병렬 데이터 수집
  const [pulseData, news, transactions, deals, sentimentData] =
    await Promise.all([
      fetchWeekPulse(supabase, region, label),
      fetchWeekNews(supabase, 10),
      fetchWeekTransactions(supabase, 10),
      fetchActiveDeals(supabase, brokerCtx.broker.user_id),
      fetchSentimentData(supabase),
    ]);

  // 3. 커버 데이터 결정
  const coverData = buildWeeklyCoverData(pulseData, sentimentData);

  // 4. 테마 빌드
  const theme = await buildThemeOfWeek(news, deals, region);

  // 5. LLM 콘텐츠 생성
  const llmContent = await generateLLMContent(
    brokerCtx,
    news,
    transactions,
    pulseData,
    coverData,
  );

  // 6. 에디션 레코드 구성
  const regionLabel =
    brokerCtx.broker.specialty_regions?.[0] ?? '강남·성수';
  const editionTitle = `${regionLabel} 주간 CRE 매거진 — ${label}`;

  const contentPayload = {
    ai_briefing: llmContent.ai_briefing,
    broker: {
      name: brokerCtx.profile.display_name ?? '',
      company: brokerCtx.profile.company ?? '',
      phone: brokerCtx.profile.phone ?? '',
      photoUrl: brokerCtx.profile.photo_url,
      tagline: brokerCtx.profile.tagline ?? brokerCtx.broker.bio ?? '',
      specialtyRegions: brokerCtx.broker.specialty_regions ?? [],
      specialtyAssets: brokerCtx.broker.specialty_assets ?? [],
      totalDeals: brokerCtx.broker.total_deal_count_self ?? 0,
      activeDeals: brokerCtx.activeDealCount,
    },
    topNews: news.slice(0, 6).map((n) => ({
      id: n.id,
      title: n.title,
      summary: n.summary,
      source: n.source,
      sentiment: n.sentiment,
      topic: n.topic,
    })),
    recentTransactions: transactions.slice(0, 5),
    sentiment: {
      score: sentimentData.avgSentiment,
      items: sentimentData.items,
    },
    dealHighlights: deals.slice(0, 5).map((d) => ({
      id: d.id,
      address: d.address,
      areaSignal: d.area_signal,
      assetType: d.asset_type,
      price: d.price,
      photoUrl: d.photo_urls?.[0] ?? null,
    })),
  };

  const editionRow = {
    broker_id: brokerId,
    edition_type: 'weekly' as const,
    edition_label: label,
    title: editionTitle,
    market_temp: llmContent.market_temp,
    cover_keywords: llmContent.cover_keywords,
    cover_image_url: brokerCtx.broker.magazine_cover_image,
    theme_title: theme.themeTitle,
    theme_body_md: theme.themeBodyMd,
    theme_asset_types: brokerCtx.broker.specialty_assets ?? [],
    content: contentPayload,
    featured_deal_ids: theme.matchedDealIds,
    target_segments: ['all'],
    status: 'draft' as const,
    theme_color: '#6366f1',
    version: 1,
  };

  // 7. Upsert (동일 broker_id + edition_type + edition_label이면 갱신)
  const { data, error } = await supabase
    .from('magazine_editions')
    .upsert(editionRow, {
      onConflict: 'broker_id,edition_type,edition_label',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`매거진 에디션 저장 실패: ${error.message}`);
  }

  return data as MagazineEdition;
};
