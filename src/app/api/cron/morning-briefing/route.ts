import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  crawlCreNews,
  ingestGlobalReports,
  trackSocialSentiment,
  trackYoutubeTrends,
  crawlAuctions,
  computeRentalMarketRates,
} from '@/domain/external/market-crawlers';
import {
  fetchRentalTrend,
  fetchEnergyRating,
  fetchCommercialDistrict,
  fetchOfficialLandPrice,
  fetchConstructionPermits,
  fetchCommercialTransactions,
} from '@/domain/external/gov-premium-apis';
import { createModuleLogger } from '@/lib/logger';
import { acquireCronIdempotencySlot, verifyCronRequest } from '@/lib/security/cron-auth';

const log = createModuleLogger('route');

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 5;

async function runBoundedBatches<T>(
  tasks: Array<() => Promise<T>>,
  batchSize = BATCH_SIZE,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((task) => task()));
    results.push(...batchResults);
  }
  return results;
}

/**
 * GET /api/cron/morning-briefing
 * Vercel Cron: UTC 23:00 (KST 08:00) 매일 자동 실행
 * 모든 외부 데이터를 유계 동시성(배치 5)으로 수집하여 DB에 저장합니다.
 */
export async function GET(request: NextRequest) {
  const authFailure = verifyCronRequest(request);
  if (authFailure) return authFailure;

  const supabase = createServiceClient();
  const startedAt = Date.now();

  try {
    const bucketKey = new Date().toISOString().slice(0, 10);
    const slot = await acquireCronIdempotencySlot(supabase, 'morning-briefing', bucketKey);
    if (!slot.acquired) {
      return NextResponse.json({
        success: true,
        skipped: 'DUPLICATE_SLOT',
        timestamp: new Date().toISOString(),
      });
    }

    // 1. 뉴스 크롤링 + AI 요약 (배치 크기 5로 동시성 제한)
    const [news, reports, sentiments, youtube, auctions, rentals] = (await runBoundedBatches<
      unknown[]
    >(
      [
        () => crawlCreNews(supabase),
        () => ingestGlobalReports(supabase),
        () => trackSocialSentiment(supabase),
        () => trackYoutubeTrends(supabase),
        () => crawlAuctions(supabase),
        () => computeRentalMarketRates(supabase),
      ],
      BATCH_SIZE,
    )) as [unknown[], unknown[], unknown[], unknown[], unknown[], unknown[]];

    // 2. 보유 건물 중 대표 1개 (에너지 등급용 — 건물 없으면 생략, 가짜 UUID 금지)
    const { data: buildings } = await supabase
      .from('building_ssot_lite')
      .select('id')
      .limit(1);
    const targetBuildingId = buildings?.[0]?.id ?? null;

    // 3. 정부 API — 3개 권역 (배치 크기 5로 동시성 제한)
    const govTasks: Array<() => Promise<unknown>> = [
      () => fetchRentalTrend(supabase, 'gbd'),
      () => fetchRentalTrend(supabase, 'seongsu'),
      () => fetchRentalTrend(supabase, 'ybd'),
      ...(targetBuildingId ? [() => fetchEnergyRating(supabase, targetBuildingId)] : []),
      () => fetchCommercialDistrict(supabase, 'D001'), // 성수
      () => fetchCommercialDistrict(supabase, 'D002'), // 강남
      () => fetchCommercialDistrict(supabase, 'D003'), // 여의도
      // 공시지가 3개 권역 × 2년치
      () => fetchOfficialLandPrice(supabase, '1168010100101230045', 2026), // GBD
      () => fetchOfficialLandPrice(supabase, '1120011400100450012', 2026), // 성수
      () => fetchOfficialLandPrice(supabase, '1156011000100340001', 2026), // 여의도
      () => fetchOfficialLandPrice(supabase, '1168010100101230045', 2025),
      () => fetchOfficialLandPrice(supabase, '1120011400100450012', 2025),
      () => fetchOfficialLandPrice(supabase, '1156011000100340001', 2025),
      // 건축허가 3개 권역
      () => fetchConstructionPermits(supabase, 'gbd'),
      () => fetchConstructionPermits(supabase, 'seongsu'),
      () => fetchConstructionPermits(supabase, 'ybd'),
      // 실거래 ETL — 3개 권역 (당월)
      () => fetchCommercialTransactions(supabase, 'gbd'),
      () => fetchCommercialTransactions(supabase, 'seongsu'),
      () => fetchCommercialTransactions(supabase, 'ybd'),
    ];

    await runBoundedBatches(govTasks, BATCH_SIZE);

    const elapsedMs = Date.now() - startedAt;
    log.info(`[cron/morning-briefing] Completed in ${elapsedMs}ms`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      elapsedMs,
      summary: {
        newsFetched: news.length,
        reportsFetched: reports.length,
        sentimentsFetched: sentiments.length,
        youtubeFetched: youtube.length,
        auctionsFetched: auctions.length,
        rentalsFetched: rentals.length,
        govApisTriggered: true,
        transactionsFetched: true,
      },
    });
  } catch (err: unknown) {
    log.error({ err }, '[cron/morning-briefing] Error:');
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
