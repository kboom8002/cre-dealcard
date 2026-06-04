import type { SupabaseClient } from "@supabase/supabase-js";
import { recordEvent } from "./record-event";

export interface MarketIndicator {
  region: string;
  assetType: string;
  periodStart: string;
  periodEnd: string;
  demandScore: number;
  supplyScore: number;
  avgHoldDays: number;
  conversionRate: number;
  priceResistanceBand: {
    avgPriceGapPct: number;
    resistanceThresholdPct: number;
  };
  absorptionRate: number;
  trendDirection: "up" | "flat" | "down";
}

/**
 * Domain engine for calculating market leading indicators from pipeline data.
 */
export class MarketIndicatorEngine {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Computes the demand score for a region and asset type.
   * Based on matching S/A count, buyer/tenant intents, and activity.
   */
  private getDistrictName(region: string): string {
    const r = region.toLowerCase();
    if (r.includes("gbd") || r.includes("강남") || r.includes("서초")) return "강남구";
    if (r.includes("seongsu") || r.includes("성동")) return "성동구";
    if (r.includes("ybd") || r.includes("영등포")) return "영등포구";
    if (r.includes("cbd") || r.includes("종로") || r.includes("중구")) return "종로구";
    return "강남구"; // Default
  }

  /**
   * Computes the demand score for a region and asset type.
   * Based on matching S/A count, buyer/tenant intents, and activity.
   * Includes 3-layer fallback: Internal -> Public Big Data (MOLIT) -> Sentiment (Social/News)
   */
  async computeDemandScore(region: string, assetType: string): Promise<number> {
    try {
      // Layer 3: Internal transaction matching S/A count
      const { count: saleCount } = await this.supabase
        .from("match_results")
        .select("id", { count: "exact", head: true })
        .eq("grade", "S")
        .eq("purpose_weight_profile", assetType);

      const { count: leaseCount } = await this.supabase
        .from("lease_match_results")
        .select("lease_space_id", { count: "exact", head: true })
        .eq("grade", "S");

      const internalMatchCount = (saleCount || 0) + (leaseCount || 0);

      if (internalMatchCount > 0) {
        const base = (saleCount || 0) * 12 + (leaseCount || 0) * 8;
        const score = Math.min(100, Math.max(15, base + 45));
        return Math.round(score);
      }

      // Layer 2: Public Big Data (MOLIT real transactions)
      const district = this.getDistrictName(region);
      const { data: txs } = await this.supabase
        .from("external_transactions")
        .select("transaction_price")
        .eq("district", district);

      if (txs && txs.length > 0) {
        // Calculate dynamic score from public transactions count (scale up to 90)
        return Math.min(90, Math.max(30, 50 + txs.length * 3));
      }

      // Layer 1: Meta Intelligence (Social community and news sentiment)
      const { data: sentiments } = await this.supabase
        .from("social_sentiment")
        .select("sentiment_score");

      if (sentiments && sentiments.length > 0) {
        const avg = sentiments.reduce((acc, s) => acc + Number(s.sentiment_score || 50), 0) / sentiments.length;
        return Math.round(avg);
      }

      return 55; // Core fallback
    } catch (e) {
      return 50; // Final fail-safe
    }
  }

  /**
   * Computes the supply score.
   * Based on active listings and new building/space registrations.
   * Fallback: Court auctions count
   */
  async computeSupplyScore(region: string, assetType: string): Promise<number> {
    try {
      // Layer 3: Internal supply listings
      const { count: buildingCount } = await this.supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("status", "public_signal_ready");

      const { count: leaseCount } = await this.supabase
        .from("lease_spaces")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      const internalSupplyCount = (buildingCount || 0) + (leaseCount || 0);

      if (internalSupplyCount > 0) {
        const base = (buildingCount || 0) * 8 + (leaseCount || 0) * 5;
        const score = Math.min(100, Math.max(10, base + 35));
        return Math.round(score);
      }

      // Layer 2: Public Big Data (Court Auctions for distressed listings supply)
      const district = this.getDistrictName(region);
      const { count: auctionCount } = await this.supabase
        .from("auction_listings")
        .select("id", { count: "exact", head: true })
        .ilike("address", `%${district}%`);

      if (auctionCount && auctionCount > 0) {
        // High distressed supply adds up to supply score
        return Math.min(95, Math.max(20, 45 + auctionCount * 5));
      }

      return 40; // Default baseline supply
    } catch (e) {
      return 50; // Fallback
    }
  }

  /**
   * Heuristically computes price resistance band using match failures.
   * Fallback: Public vacancy rates and trend analysis
   */
  async computePriceResistanceBand(region: string, assetType: string) {
    try {
      // Layer 3: Internal match failure logs
      const { data } = await this.supabase
        .from("match_failure_logs")
        .select("price_gap_pct")
        .eq("entity_type", assetType === "office" ? "lease" : "sale")
        .not("price_gap_pct", "is", null);

      if (data && data.length > 0) {
        const gaps = data.map((d) => Number(d.price_gap_pct));
        const avg = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
        const threshold = avg * 1.5;
        return {
          avgPriceGapPct: Math.round(avg * 10) / 10,
          resistanceThresholdPct: Math.round(threshold * 10) / 10,
        };
      }

      // Layer 2: Public/Crawl data fallback (Vacancy-adjusted pricing resistance)
      const { data: rentData } = await this.supabase
        .from("rental_market_data")
        .select("vacancy_rate")
        .eq("region", region.toLowerCase())
        .maybeSingle();

      if (rentData) {
        const vacancy = Number(rentData.vacancy_rate || 2.5);
        // Under high vacancy, buyer price resistance increases
        const avgPriceGapPct = 8.5 + (vacancy * 0.5);
        const resistanceThresholdPct = avgPriceGapPct * 1.5;
        return {
          avgPriceGapPct: Math.round(avgPriceGapPct * 10) / 10,
          resistanceThresholdPct: Math.round(resistanceThresholdPct * 10) / 10,
        };
      }

      return {
        avgPriceGapPct: 8.5, // 8.5% default gap
        resistanceThresholdPct: 15.0, // 15% default threshold
      };
    } catch (e) {
      return { avgPriceGapPct: 8.5, resistanceThresholdPct: 15.0 };
    }
  }

  /**
   * Computes average hold days and absorption rate from pipeline transitions.
   * Fallback: Public market vacancy rate
   */
  async computeHoldAndAbsorption(region: string, assetType: string) {
    try {
      // Layer 3: Internal pipeline transitions
      const { data } = await this.supabase
        .from("pipeline_stage_transitions")
        .select("hold_days");

      if (data && data.length > 0) {
        const days = data.map((d) => Number(d.hold_days));
        const avg = days.reduce((sum, v) => sum + v, 0) / days.length;
        // Absorption rate is inversely proportional to hold days
        const rate = Math.min(95, Math.max(20, 100 - (avg / 1.5)));
        return {
          avgHoldDays: Math.round(avg * 10) / 10 || 45,
          absorptionRate: Math.round(rate),
        };
      }

      // Layer 2: Public/Crawl data fallback (Vacancy-adjusted absorption rates)
      const { data: rentData } = await this.supabase
        .from("rental_market_data")
        .select("vacancy_rate")
        .eq("region", region.toLowerCase())
        .maybeSingle();

      if (rentData) {
        const vacancy = Number(rentData.vacancy_rate || 2.5);
        // Higher vacancy = slower deals (higher hold days) and lower absorption
        const avgHoldDays = 30 + (vacancy * 5);
        const absorptionRate = Math.max(10, 100 - (vacancy * 10));
        return {
          avgHoldDays: Math.round(avgHoldDays * 10) / 10,
          absorptionRate: Math.round(absorptionRate),
        };
      }

      return { avgHoldDays: 45, absorptionRate: 65 }; // Fallbacks
    } catch (e) {
      return { avgHoldDays: 45, absorptionRate: 65 };
    }
  }

  /**
   * Synthesizes and saves a snapshot of market indicators.
   */
  async generateSnapshot(region: string, assetType: string): Promise<MarketIndicator> {
    const demandScore = await this.computeDemandScore(region, assetType);
    const supplyScore = await this.computeSupplyScore(region, assetType);
    const priceBand = await this.computePriceResistanceBand(region, assetType);
    const { avgHoldDays, absorptionRate } = await this.computeHoldAndAbsorption(region, assetType);

    // Trend direction based on demand vs supply
    let trendDirection: "up" | "flat" | "down" = "flat";
    const gap = demandScore - supplyScore;
    if (gap > 10) trendDirection = "up";
    else if (gap < -10) trendDirection = "down";

    // Period: past 30 days
    const now = new Date();
    const periodEnd = now.toISOString().split("T")[0];
    const past30 = new Date();
    past30.setDate(now.getDate() - 30);
    const periodStart = past30.toISOString().split("T")[0];

    const indicator: MarketIndicator = {
      region,
      assetType,
      periodStart,
      periodEnd,
      demandScore,
      supplyScore,
      avgHoldDays,
      conversionRate: Math.round(absorptionRate * 0.4), // conversion is fraction of absorption
      priceResistanceBand: priceBand,
      absorptionRate,
      trendDirection,
    };

    // Save snapshot to database
    const { data, error } = await this.supabase
      .from("market_leading_indicators")
      .insert({
        region,
        asset_type: assetType,
        period_start: periodStart,
        period_end: periodEnd,
        demand_score: demandScore,
        supply_score: supplyScore,
        avg_hold_days: avgHoldDays,
        conversion_rate: indicator.conversionRate,
        price_resistance_band: priceBand,
        absorption_rate: absorptionRate,
        trend_direction: trendDirection,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[generateSnapshot] Save failed:", error.message);
    } else {
      await recordEvent(this.supabase, {
        eventType: "market_indicator_computed" as any,
        entityType: "market_indicator" as any,
        entityId: data.id,
        metadata: { region, assetType, demandScore, supplyScore, trendDirection },
      });
    }

    return indicator;
  }
}
