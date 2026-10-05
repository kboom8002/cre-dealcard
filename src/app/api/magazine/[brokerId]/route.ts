/**
 * /api/magazine/[brokerId]
 *
 * GET  — 공개 읽기 전용. 발행본(`?date=YYYY-MM-DD`, 기본 오늘 KST)만 반환한다.
 *        LLM 호출·insert·upsert 금지 (D2-01). 미존재 slug/날짜/미래 날짜/미발행 → 404.
 * POST — 인증된 브로커 본인만. 서버가 broker 정체성을 결정한다(클라이언트 broker_id 불신, T1-02).
 *        1) 본문 저장: 에디터가 보낸 content 를 magazine_issues 에 upsert (issueDate 검증·미래 날짜 거부, 오류 전파)
 *        2) `{ generate: true }`: 일간 브리핑을 실제 데이터로 생성 → QG 통과 시에만 저장.
 *           Mock/실패/QG 불합격은 저장하지 않고 오류로 응답한다 (이전: 62/100 가짜 기본값·가짜 지역명으로 생성).
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { createModuleLogger } from '@/lib/logger';
import { jsonError, notFoundResponse, requireBrokerContext, brokerKeyMatches } from '@/lib/magazine/authz';
import { isFutureDateKst, parseIssueDate, todayKst } from '@/lib/magazine/kst';
import { getPublishedIssue, maskIssueForPublic } from '@/lib/magazine/get-published-issue';
import { resolveBroker } from '@/lib/magazine/resolve-broker';
import { callMagazineJson, MagazineLlmError, zReaderText } from '@/lib/magazine/llm-guard';
import { PULSE_REGION_LABELS_KO, deriveRegionKeywords, pickPulseRegion } from '@/lib/magazine/period-label';
import {
  InsufficientSourceDataError,
  buildPromptFacts,
  fetchMarketSources,
  sentimentStatusLabel,
  DEFAULT_THEME_COLOR,
} from '@/domain/magazine/weekly-generator';
import { runMagazineQualityGate } from '@/domain/magazine/quality-gate';

const log = createModuleLogger('api-magazine-broker');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 에디터 저장 본문 상한 (남용 방지) */
const MAX_BODY_BYTES = 512 * 1024;

type RouteCtx = { params: Promise<{ brokerId: string }> };

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: RouteCtx) {
  const { brokerId } = await params;
  const dateParam = request.nextUrl.searchParams.get('date');
  const date = dateParam ?? todayKst();

  if (!parseIssueDate(date)) {
    return jsonError('INVALID_DATE', '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).', 400);
  }

  try {
    const supabase = createServiceClient();
    const result = await getPublishedIssue(supabase, brokerId, date);
    if (result.kind === 'ok') {
      return NextResponse.json({ data: result.data, cached: true, issueDate: result.date });
    }
    if (result.kind === 'invalid_date') {
      return jsonError('INVALID_DATE', '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).', 400);
    }
    // broker_not_found | future_date | not_published — 존재 여부를 구분해 노출하지 않는다
    return notFoundResponse('요청하신 매거진을 찾을 수 없습니다.');
  } catch (err) {
    log.error('[api/magazine/GET] lookup failed', err instanceof Error ? err.message : String(err));
    return jsonError('INTERNAL_ERROR', '매거진을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
}

// ── POST ───────────────────────────────────────────────────────────

const dailyOutputSchema = z.object({
  headline: zReaderText(4, 60),
  briefing: zReaderText(40, 2500),
});

async function generateDailyContent(
  supabase: ReturnType<typeof createServiceClient>,
  slug: string,
  issueDate: string,
) {
  const broker = await resolveBroker(supabase, slug);
  if (!broker) return { kind: 'broker_not_found' as const };

  const regionCode = pickPulseRegion(broker.specialtyRegions);
  const regionKeywords = deriveRegionKeywords(broker.specialtyRegions, regionCode);
  const regionLabel = regionCode ? PULSE_REGION_LABELS_KO[regionCode] : broker.specialtyRegions[0] ?? '';

  const [sources, dealsRes, countRes] = await Promise.all([
    fetchMarketSources(supabase, { regionCode, regionKeywords, issueDate }),
    supabase
      .from('building_ssot_lite')
      .select('id, raw_address, area_signal, asset_type, price_band, matched_buyer_count, layers')
      .eq('owner_id', broker.userId)
      .in('status', ['public_signal_ready', 'active'])
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('building_ssot_lite')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', broker.userId)
      .eq('status', 'public_signal_ready'),
  ]);

  const sourceErrors = [...sources.errors];
  if (dealsRes.error) sourceErrors.push(`building_ssot_lite: ${dealsRes.error.message}`);
  if (countRes.error) sourceErrors.push(`building_ssot_lite(count): ${countRes.error.message}`);
  const activeDeals = countRes.error ? 0 : countRes.count ?? 0;

  if (!sources.availability.news && !sources.availability.transactions && !sources.availability.pulse) {
    throw new InsufficientSourceDataError();
  }

  const facts = buildPromptFacts({
    regionLabel: regionLabel || '미지정',
    news: sources.news,
    transactions: sources.transactions,
    pulse: sources.pulse,
    sentiment: sources.sentiment,
    rentalTrend: sources.rentalTrend,
    activeDealCount: activeDeals,
  });

  const who = [broker.displayName, broker.company].filter(Boolean).join(' / ');
  const { data: out, response } = await callMagazineJson(
    {
      label: 'daily.briefing',
      tier: 'terra',
      temperature: 0.5,
      maxTokens: 900,
      systemPrompt: `당신은 꼬마빌딩 전문 부동산 매거진 에디터입니다.
${who ? `브로커 "${who}"를 위한 ` : ''}오늘의 CRE 데일리 브리핑을 작성하세요. 전문 권역: ${regionLabel || '미지정'}.

형식 규칙:
- headline: 15-40자, 오늘 시장의 핵심 한 문장
- briefing: 3-4 단락, 각 단락 2-3줄, 존댓말(~합니다/~습니다), 단락 시작 이모지 헤딩 가능
- "근거 사실"에 있는 내용만 사용. 출처가 있는 뉴스는 출처를 밝힙니다.
결과를 JSON으로 반환: {"headline": "...", "briefing": "..."}`,
      userPrompt: `근거 사실:\n${facts.lines.join('\n')}`,
    },
    dailyOutputSchema,
  );

  const qg = runMagazineQualityGate(`${out.headline}\n${out.briefing}`, { facts: facts.lines }, {
    sentimentScore: sources.sentiment?.avgSentiment ?? null,
    marketTemp: null,
  });

  const content: Record<string, unknown> = {
    schemaVersion: 1,
    kind: 'daily',
    issueDate,
    brokerId: slug,
    broker: {
      name: broker.displayName ?? '',
      slug,
      company: broker.company ?? '',
      photoUrl: broker.photoUrl,
      tagline: broker.tagline ?? broker.bio ?? '',
      specialtyRegions: broker.specialtyRegions,
      specialtyAssets: broker.specialtyAssets,
      activeDeals,
    },
    headline: out.headline,
    briefing: out.briefing,
    ai_briefing: out.briefing,
    themeColor: DEFAULT_THEME_COLOR,
    theme_color: DEFAULT_THEME_COLOR,
    generation: {
      model: response.model,
      isMock: response.isMock,
      totalTokens: response.tokens,
      llmCalls: 1,
      generatedAt: new Date().toISOString(),
      qualityGate: {
        passed: qg.passed,
        status: qg.status,
        score: qg.score,
        totalClaims: qg.totalClaims,
        matchedClaims: qg.matchedClaims,
        failureReasons: qg.failureReasons,
        issues: qg.issues.slice(0, 10),
      },
      sources: { ...sources.availability },
      sourceErrors: sourceErrors.slice(0, 10),
    },
  };

  // keyStats — 실제로 존재하는 값만 (이전: 심리 62/100 폴백)
  const keyStats: Array<{ label: string; value: string; accent: string }> = [];
  if (sources.sentiment) {
    const s = sources.sentiment.avgSentiment;
    keyStats.push({ label: '투자자 심리', value: `${s}/100`, accent: s >= 60 ? 'emerald' : s >= 40 ? 'amber' : 'rose' });
    keyStats.push({ label: '시장 상태', value: sentimentStatusLabel(s), accent: 'slate' });
  }
  keyStats.push({ label: '활성 매물', value: `${activeDeals}건`, accent: 'indigo' });
  content.keyStats = keyStats;

  if (sources.news.length) {
    content.topNews = sources.news.slice(0, 6).map((n) => ({
      id: n.id, title: n.title, summary: n.summary, source: n.source, sentiment: n.sentiment, topic: n.topic,
    }));
  }
  if (sources.sentiment) {
    content.sentiment = {
      score: sources.sentiment.avgSentiment,
      status: sentimentStatusLabel(sources.sentiment.avgSentiment),
      items: sources.sentiment.items,
      asOf: sources.sentiment.asOf,
    };
  }
  if (sources.auctionPicks.length) content.auctionPicks = sources.auctionPicks.slice(0, 2);
  if (sources.reports.length) content.reports = sources.reports.slice(0, 2);
  if (sources.transactions.length) content.recentTransactions = sources.transactions.slice(0, 5);
  if (sources.rentalTrend) content.rentalTrend = sources.rentalTrend;
  if (sources.commercialDistrict) content.commercialDistrict = sources.commercialDistrict;

  const deals = (dealsRes.error ? [] : dealsRes.data ?? []) as Array<Record<string, unknown>>;
  if (deals.length) {
    content.dealHighlights = deals.map((d) => ({
      id: d.id,
      address: d.raw_address, // DB 원본 보존 — 응답 직전 마스킹
      areaSignal: d.area_signal,
      assetType: d.asset_type,
      price: d.price_band,
      photoUrl: ((d.layers as { photos?: { urls?: string[] } } | null)?.photos?.urls ?? [])[0] ?? null,
      buyerInterestCount: typeof d.matched_buyer_count === 'number' ? d.matched_buyer_count : 0,
    }));
  }

  return { kind: 'ok' as const, content, qg, isMock: response.isMock };
}

export async function POST(request: NextRequest, { params }: RouteCtx) {
  try {
    const { brokerId } = await params;

    // 인증 + 서버가 slug 결정 — URL 의 brokerId 가 내 것이 아니면 404 (존재 여부 비노출)
    const { ctx, error } = await requireBrokerContext(request, { requireSlug: true });
    if (error) return error;
    if (!ctx.slug || !brokerKeyMatches(ctx, brokerId)) return notFoundResponse();
    const slug = ctx.slug;

    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return jsonError('PAYLOAD_TOO_LARGE', '본문이 너무 큽니다.', 413);
      body = JSON.parse(raw);
    } catch {
      return jsonError('INVALID_BODY', '요청 본문이 올바른 JSON이 아닙니다.', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError('INVALID_BODY', '요청 본문이 올바르지 않습니다.', 400);
    }
    const payload = body as Record<string, unknown>;

    const rawDate = payload.issueDate;
    if (rawDate !== undefined && typeof rawDate !== 'string') {
      return jsonError('INVALID_DATE', '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).', 400);
    }
    const issueDate = (rawDate as string | undefined) ?? todayKst();
    if (!parseIssueDate(issueDate)) {
      return jsonError('INVALID_DATE', '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).', 400);
    }
    if (isFutureDateKst(issueDate)) {
      return jsonError('FUTURE_DATE', '미래 날짜로는 저장할 수 없습니다.', 400);
    }

    const supabase = createServiceClient();

    // ── 생성 모드 ──
    if (payload.generate === true) {
      let gen;
      try {
        gen = await generateDailyContent(supabase, slug, issueDate);
      } catch (err) {
        if (err instanceof InsufficientSourceDataError) {
          return jsonError('INSUFFICIENT_DATA', err.message, 422);
        }
        if (err instanceof MagazineLlmError) {
          log.warn(`[api/magazine/POST] 생성 실패 (${err.code})`);
          return jsonError('AI_GENERATION_FAILED', err.message, 502);
        }
        throw err;
      }
      if (gen.kind === 'broker_not_found') return notFoundResponse();
      if (gen.isMock) {
        return jsonError('AI_GENERATION_FAILED', 'AI 생성 실패: Mock 응답은 저장하지 않습니다.', 502);
      }
      if (!gen.qg.passed) {
        // 불합격 콘텐츠는 공개 테이블에 저장하지 않는다. 사유만 돌려준다.
        return NextResponse.json(
          {
            ok: false,
            error: { code: 'QUALITY_GATE_FAILED', message: '품질 검수를 통과하지 못해 저장하지 않았습니다.' },
            qualityGate: { score: gen.qg.score, failureReasons: gen.qg.failureReasons, issues: gen.qg.issues.slice(0, 5) },
          },
          { status: 422 },
        );
      }
      const { error: upErr } = await supabase
        .from('magazine_issues')
        .upsert({ broker_id: slug, issue_date: issueDate, content: gen.content }, { onConflict: 'broker_id,issue_date' });
      if (upErr) {
        log.error('[api/magazine/POST] upsert failed', upErr.message);
        return jsonError('SAVE_FAILED', '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
      }
      return NextResponse.json({ success: true, data: maskIssueForPublic(gen.content), issue_date: issueDate });
    }

    // ── 본문 저장 모드 (에디터) ──
    const { generate: _generate, ...content } = payload;
    void _generate;
    const toSave = { ...content, brokerId: slug, issueDate };
    const { error: upErr } = await supabase
      .from('magazine_issues')
      .upsert({ broker_id: slug, issue_date: issueDate, content: toSave }, { onConflict: 'broker_id,issue_date' });
    if (upErr) {
      log.error('[api/magazine/POST] upsert failed', upErr.message);
      return jsonError('SAVE_FAILED', '저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
    }
    return NextResponse.json({ success: true, data: toSave, issue_date: issueDate });
  } catch (err: unknown) {
    log.error('[api/magazine/POST] Error:', err instanceof Error ? err.message : String(err));
    return jsonError('INTERNAL_ERROR', '서버 오류가 발생했습니다.', 500);
  }
}
