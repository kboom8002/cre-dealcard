/**
 * CRE Signal Aggregator
 *
 * 파이프라인 데이터(activity_events, market_leading_indicators,
 * deal_pipeline_states, agora_threads, service_matches)에서
 * 5축 시그널을 집계하여 주간/월간 CRE Pulse 스냅샷을 생성.
 *
 * aihompyhub의 signalAggregator + trendSignalAggregator 패턴을 CRE 전환.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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

// ── 기간 유틸 ──────────────────────────────────────────────────
function getWeekRange(weeksAgo = 0) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - weeksAgo * 7);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeekLabel(date = new Date()): string {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
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

    const { count } = await query;
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
    const { count: sCount } = await this.supabase
      .from("match_results")
      .select("id, building_ssot_lite!inner(area_signal)", { count: "exact", head: true })
      .eq("grade", "S")
      .eq("building_ssot_lite.area_signal", region);

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

    const { count: activeCards } = await this.supabase
      .from("building_ssot_lite")
      .select("id", { count: "exact", head: true })
      .eq("status", "public_signal_ready")
      .eq("area_signal", region);

    const { count: leaseSpaces } = await this.supabase
      .from("lease_spaces")
      .select("id, building:building_id!inner(area_signal)", { count: "exact", head: true })
      .eq("status", "active")
      .eq("building.area_signal", region);

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
    const { data } = await this.supabase
      .from("market_leading_indicators")
      .select("price_resistance_band, demand_score, supply_score")
      .eq("region", region)
      .order("created_at", { ascending: false })
      .limit(2);

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
      const { count } = await this.supabase
        .from("agora_threads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", start)
        .lte("created_at", end);
      return count ?? 0;
    };

    const [curr, prev] = await Promise.all([
      countThreads(thisWeek.start, thisWeek.end),
      countThreads(lastWeek.start, lastWeek.end),
    ]);

    // Top categories
    const { data: cats } = await this.supabase
      .from("agora_threads")
      .select("category")
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);

    const catCounts: Record<string, number> = {};
    for (const c of cats ?? []) {
      catCounts[c.category] = (catCounts[c.category] || 0) + 1;
    }
    const topCategories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const { count: hotCount } = await this.supabase
      .from("agora_threads")
      .select("id", { count: "exact", head: true })
      .eq("is_hot", true);

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
    const { count: newCards } = await this.supabase
      .from("service_cards")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);

    const { count: leads } = await this.supabase
      .from("service_matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end);

    const { data: topCats } = await this.supabase
      .from("service_matches")
      .select("service_cards!inner(service_category)")
      .gte("created_at", thisWeek.start)
      .lte("created_at", thisWeek.end)
      .limit(20);

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

  /** 주간 시그널 스냅샷 전체 생성 */
  async generateWeeklySnapshot(region: string): Promise<CRESignalSnapshot> {
    const thisWeek = getWeekRange(0);
    const lastWeek = getWeekRange(1);
    const period = getWeekLabel();

    const [demand, supply, price, sentiment, partner] = await Promise.all([
      this.aggregateDemand(region, thisWeek, lastWeek),
      this.aggregateSupply(region, thisWeek, lastWeek),
      this.aggregatePrice(region),
      this.aggregateSentiment(region, thisWeek, lastWeek),
      this.aggregatePartner(thisWeek),
    ]);

    const partialSnapshot = { demand, supply, price, sentiment, partner };
    const pulseScore = this.computePulseScore(partialSnapshot);
    const trendDirection = this.determineTrend(partialSnapshot);

    return {
      region,
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
