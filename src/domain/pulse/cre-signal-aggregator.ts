/**
 * CRE Signal Aggregator
 *
 * 파이프라인 데이터(activity_events, market_leading_indicators,
 * deal_pipeline_states, agora_threads, service_matches)에서
 * 5축 시그널을 집계하여 주간/월간 CRE Pulse 스냅샷을 생성.
 *
 * aihompyhub의 signalAggregator + trendSignalAggregator 패턴을 CRE 전환.
 *
 * [C-01/D2-04] 주차 라벨은 `@/lib/magazine/period-label` 의 `pulsePeriodLabel`(= ISO `W41-2026`) 하나만 쓴다.
 * 과거 비-ISO 형식(`2026-W41`)은 조회 호환 전용(`pulsePeriodLabelCandidates`)이며 새로 적재하지 않는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { toKstDate, todayKst } from "@/lib/magazine/kst";
import { pulsePeriodLabel, normalizePulseRegion } from "@/lib/magazine/period-label";

// ── 시그널 스냅샷 타입 ─────────────────────────────────────────
export interface CRESignalSnapshot {
  region: string;
  period: string;

  demand: {
    gateRequests: number;
    gateRequestsDelta: number;
    buyerIntents: number;
    buyerIntentsDelta: number;
    sMatchCount: number;
  };

  supply: {
    newDealCards: number;
    newDealCardsDelta: number;
    activeDealCards: number;
    newLeaseSpaces: number;
  };

  price: {
    avgPriceGapPct: number;
    priceGapDelta: number;
    resistanceThreshold: number;
  };

  sentiment: {
    agoraQuestions: number;
    agoraQuestionsDelta: number;
    topCategories: string[];
    hotThreadCount: number;
  };

  partner: {
    newServiceCards: number;
    serviceLeadCount: number;
    topVendorCategories: string[];
  };

  trendDirection: "up" | "flat" | "down";
  pulseScore: number;
}

/** 집계 쿼리 실패 — 0 으로 위장하지 않고 호출부(펄스 생성기)가 해당 권역 생성을 실패 처리하게 한다. */
export class SignalQueryError extends Error {
  constructor(context: string, cause: { message?: string; code?: string } | null) {
    super(`[CRESignalAggregator] ${context} failed: ${cause?.message ?? "unknown"}${cause?.code ? ` (${cause.code})` : ""}`);
    this.name = "SignalQueryError";
  }
}

function assertOk(context: string, error: { message?: string; code?: string } | null | undefined): void {
  if (error) throw new SignalQueryError(context, error);
}

// ── 기간 유틸 ──────────────────────────────────────────────────
const WEEK_MS = 7 * 86400000;

/** 롤링 7일 구간(UTC ISO 타임스탬프). weeksAgo=0 이면 [now-7d, now]. 타임존 독립(ms 산술). */
function getWeekRange(weeksAgo = 0, now: Date = new Date()) {
  const end = new Date(now.getTime() - weeksAgo * WEEK_MS);
  const start = new Date(end.getTime() - WEEK_MS);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * 주차 라벨 — ISO 8601 KST `W41-2026` (pulsePeriodLabel). 과거 `2026-W41` 형식은 더 이상 생성하지 않는다.
 * pulse-generator / sentiment 라우트가 이 함수를 그대로 쓰므로 `cre_pulses.period_label` 이 자동으로 통일된다.
 */
function getWeekLabel(date: Date = new Date()): string {
  return pulsePeriodLabel(toKstDate(date));
}

// ── 집계 엔진 ──────────────────────────────────────────────────
export class CRESignalAggregator {
  constructor(private supabase: SupabaseClient) {}

  /** 이벤트 카운트 집계 (기간별) */
  private async countEvents(
    eventType: string,
    start: string,
    end: string,
    region?: string,
  ): Promise<number> {
    let query = this.supabase
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", eventType)
      .gte("created_at", start)
      .lte("created_at", end);

    if (region) {
      // metadata JSONB 내부의 region 또는 area_signal 필터를 적용
      query = query.or(`metadata->>region.eq.${region},metadata->>area_signal.eq.${region}`);
    }

    const { count, error } = await query;
    assertOk(`activity_events(${eventType}) count`, error);
    return count ?? 0;
  }

  /** 수요 시그널 집계 */
  private async aggregateDemand(
    region: string,
    thisWeek: { start: string; end: string },
    lastWeek: { start: string; end: string },
  ) {
    const [gates, gatesPrev, buyers, buyersPrev] = await Promise.all([
      this.countEvents("gate_request_created", thisWeek.start, thisWeek.end, region),
      this.countEvents("gate_request_created", lastWeek.start, lastWeek.end, region),
      this.countEvents("buyer_intent_created", thisWeek.start, thisWeek.end, region),
      this.countEvents("buyer_intent_created", lastWeek.start, lastWeek.end, region),
    ]);

    // match_results 테이블에서 해당 region(building_ssot_lite의 area_signal)에 속하는 S등급 매칭 수 카운트
    const { count: sCount, error: sErr } = await this.supabase
      .from("match_results")
      .select("id, building_ssot_lite!inner(area_signal)", { count: "exact", head: true })
      .eq("grade", "S")
      .eq("building_ssot_lite.area_signal", region);
    assertOk("match_results S-grade count", sErr);

    const delta = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return {
      gateRequests: gates,
      gateRequestsDelta: delta(gates, gatesPrev),
      buyerIntents: buyers,
      buyerIntentsDelta: delta(buyers, buyersPrev),
      sMatchCount: sCount ?? 0,
    };
  }

  /** 공급 시그널 집계 */
  private async aggregateSupply(
    region: string,
    thisWeek: { start: string; end: string },
    lastWeek: { start: string; end: string },
  ) {
    const [newCards, newCardsPrev] = await Promise.all([
      this.countEvents("building_ssot_lite_created", thisWeek.start, thisWeek.end, region),
      this.countEvents("building_ssot_lite_created", lastWeek.start, lastWeek.end, region),
    ]);

    const { count: activeCards, error: activeErr } = await this.supabase
      .from("building_ssot_lite")
      .select("id", { count: "exact", head: true })
      .eq("status", "public_signal_ready")
      .eq("area_signal", region);
    assertOk("building_ssot_lite active count", activeErr);

    const { count: leaseSpaces, error: leaseErr } = await this.supabase
      .from("lease_spaces")
      .select("id, building:building_id!inner(area_signal)", { count: "exact", head: true })
      .eq("status", "active")
      .eq("building.area_signal", region);
    assertOk("lease_spaces active count", leaseErr);

    const delta = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return {
      newDealCards: newCards,
      newDealCardsDelta: delta(newCards, newCardsPrev),
      activeDealCards: activeCards ?? 0,
      newLeaseSpaces: leaseSpaces ?? 0,
    };
  }

  /** 가격 시그널 (MarketIndicatorEngine 최신 데이터) */
  private async aggregatePrice(region: string) {
    const { data, error } = await this.supabase
      .from("market_leading_indicators")
      .select("price_resistance_band, demand_score, supply_score")
      .eq("region", region)
      .order("created_at", { ascending: false })
      .limit(2);
    assertOk("market_leading_indicators select", error);

    // TODO(C-01 후속): 지표 부재 시 8.5/15 기본값은 근거 없는 값이다. 타입을 nullable 로 바꾸려면
    // pulse-generator 프롬프트/computePulseScore 까지 같이 고쳐야 하므로(소유자 다름) 보고서에 후속으로 남긴다.
    if (!data || data.length === 0) {
      return { avgPriceGapPct: 8.5, priceGapDelta: 0, resistanceThreshold: 15 };
    }

    const latest = data[0].price_resistance_band as { avgPriceGapPct: number; resistanceThresholdPct: number } | null;
    const prev = data[1]?.price_resistance_band as { avgPriceGapPct: number } | null;

    return {
      avgPriceGapPct: latest?.avgPriceGapPct ?? 8.5,
      priceGapDelta: prev
        ? Math.round(((latest?.avgPriceGapPct ?? 8.5) - prev.avgPriceGapPct) * 10) / 10
        : 0,
      resistanceThreshold: latest?.resistanceThresholdPct ?? 15,
    };
  }

  /** 체감 시그널 (아고라 기반) */
  private async aggregateSentiment(
    region: string,
    thisWeek: { start: string; end: string },
    lastWeek: { start: string; end: string },
  ) {
    const countThreads = async (start: string, end: string) => {
      const { count, error } = await this.supabase
        .from("agora_threads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end);
      assertOk("agora_threads count", error);
      return count ?? 0;
    };

    const [curr, prev] = await Promise.all([
      countThreads(thisWeek.start, thisWeek.end),
      countThreads(lastWeek.start, lastWeek.end),
    ]);

    // Top categories
    const { data: cats, error: catsErr } = await this.supabase
      .from("agora_threads")
      .select("category")
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);
    assertOk("agora_threads categories", catsErr);

    const catCounts: Record<string, number> = {};
    for (const c of cats ?? []) {
      catCounts[c.category] = (catCounts[c.category] || 0) + 1;
    }
    const topCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const { count: hotCount, error: hotErr } = await this.supabase
      .from("agora_threads")
      .select("id", { count: "exact", head: true })
      .eq("is_hot", true);
    assertOk("agora_threads hot count", hotErr);

    const delta = prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    return {
      agoraQuestions: curr,
      agoraQuestionsDelta: delta,
      topCategories,
      hotThreadCount: hotCount ?? 0,
    };
  }

  /** 파트너 시그널 */
  private async aggregatePartner(
    thisWeek: { start: string; end: string },
  ) {
    const { count: newCards, error: cardsErr } = await this.supabase
      .from("service_cards")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);
    assertOk("service_cards count", cardsErr);

    const { count: leads, error: leadsErr } = await this.supabase
      .from("service_matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);
    assertOk("service_matches count", leadsErr);

    const { data: topCats, error: topErr } = await this.supabase
      .from("service_matches")
      .select("service_cards!inner(service_category)")
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end)
      .limit(20);
    assertOk("service_matches categories", topErr);

    const catCounts: Record<string, number> = {};
    for (const m of topCats ?? []) {
      const cat = (m as any).service_cards?.service_category;
      if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
    }
    const topVendorCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    return {
      newServiceCards: newCards ?? 0,
      serviceLeadCount: leads ?? 0,
      topVendorCategories,
    };
  }

  /** 종합 펄스 점수 계산 */
  private computePulseScore(snapshot: Omit<CRESignalSnapshot, "pulseScore" | "trendDirection" | "region" | "period">) {
    let score = 50; // baseline

    // 수요 가산
    score += Math.min(snapshot.demand.gateRequestsDelta * 0.2, 10);
    score += Math.min(snapshot.demand.buyerIntentsDelta * 0.15, 8);
    score += Math.min(snapshot.demand.sMatchCount * 0.5, 7);

    // 공급 감산 (공급 과다 시 점수 하락)
    if (snapshot.supply.newDealCardsDelta > 30) score -= 5;

    // 가격 gap 축소 → 상승
    if (snapshot.price.priceGapDelta < 0) score += 5;

    // 체감 가산
    score += Math.min(snapshot.sentiment.agoraQuestionsDelta * 0.1, 5);

    // 파트너 가산
    score += Math.min(snapshot.partner.serviceLeadCount * 0.3, 5);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /** 트렌드 방향 결정 */
  private determineTrend(snapshot: Omit<CRESignalSnapshot, "pulseScore" | "trendDirection" | "region" | "period">) {
    const demandDelta = snapshot.demand.gateRequestsDelta + snapshot.demand.buyerIntentsDelta;
    const supplyDelta = snapshot.supply.newDealCardsDelta;
    const gap = demandDelta - supplyDelta;

    if (gap > 15) return "up" as const;
    if (gap < -15) return "down" as const;
    return "flat" as const;
  }

  /**
   * 주간 시그널 스냅샷 전체 생성.
   * `region` 은 권역 코드(gbd 등) 또는 한글 지명(강남구 등)을 받아 코드로 정규화한다.
   * 매핑되지 않는 지역은 기본 권역으로 대체하지 않고 오류로 처리한다(D2-04).
   */
  async generateWeeklySnapshot(region: string, now: Date = new Date()): Promise<CRESignalSnapshot> {
    const regionCode = normalizePulseRegion(region);
    if (!regionCode) {
      throw new Error(`[CRESignalAggregator] Unmapped pulse region: "${region}"`);
    }
    const thisWeek = getWeekRange(0, now);
    const lastWeek = getWeekRange(1, now);
    const period = pulsePeriodLabel(todayKst(now));

    const [demand, supply, price, sentiment, partner] = await Promise.all([
      this.aggregateDemand(regionCode, thisWeek, lastWeek),
      this.aggregateSupply(regionCode, thisWeek, lastWeek),
      this.aggregatePrice(regionCode),
      this.aggregateSentiment(regionCode, thisWeek, lastWeek),
      this.aggregatePartner(thisWeek),
    ]);

    const partialSnapshot = { demand, supply, price, sentiment, partner };
    const pulseScore = this.computePulseScore(partialSnapshot);
    const trendDirection = this.determineTrend(partialSnapshot);

    return {
      region: regionCode,
      period,
      demand,
      supply,
      price,
      sentiment,
      partner,
      pulseScore,
      trendDirection,
    };
  }
}

export { getWeekLabel };
