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
  async computeDemandScore(region: string, assetType: string): Promise<number> {
    // GBD, CBD, YBD, etc.
    try {
      // 1. Fetch S/A matches for sales
      const { count: saleCount } = await this.supabase
        .from("match_results")
        .select("id", { count: "exact", head: true })
        .eq("grade", "S")
        .eq("purpose_weight_profile", assetType);

      // 2. Fetch lease matches
      const { count: leaseCount } = await this.supabase
        .from("lease_match_results")
        .select("lease_space_id", { count: "exact", head: true })
        .eq("grade", "S");

      // Heuristic demand score (scaled to 0-100)
      const base = ((saleCount || 0) * 12 + (leaseCount || 0) * 8);
      const score = Math.min(100, Math.max(15, base + 45)); // default baseline around 45-60
      return Math.round(score);
    } catch (e) {
      return 50; // Fallback
    }
  }

  /**
   * Computes the supply score.
   * Based on active listings and new building/space registrations.
   */
  async computeSupplyScore(region: string, assetType: string): Promise<number> {
    try {
      // Count active building listings
      const { count: buildingCount } = await this.supabase
        .from("building_ssot_lite")
        .select("id", { count: "exact", head: true })
        .eq("status", "public_signal_ready");

      // Count active lease spaces
      const { count: leaseCount } = await this.supabase
        .from("lease_spaces")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      const base = ((buildingCount || 0) * 8 + (leaseCount || 0) * 5);
      const score = Math.min(100, Math.max(10, base + 35));
      return Math.round(score);
    } catch (e) {
      return 50; // Fallback
    }
  }

  /**
   * Heuristically computes price resistance band using match failures.
   */
  async computePriceResistanceBand(region: string, assetType: string) {
    try {
      const { data } = await this.supabase
        .from("match_failure_logs")
        .select("price_gap_pct")
        .eq("entity_type", assetType === "office" ? "lease" : "sale")
        .not("price_gap_pct", "is", null);

      if (!data || data.length === 0) {
        return {
          avgPriceGapPct: 8.5, // 8.5% default gap
          resistanceThresholdPct: 15.0, // 15% default threshold
        };
      }

      const gaps = data.map((d) => Number(d.price_gap_pct));
      const avg = gaps.reduce((sum, v) => sum + v, 0) / gaps.length;
      const threshold = avg * 1.5;

      return {
        avgPriceGapPct: Math.round(avg * 10) / 10,
        resistanceThresholdPct: Math.round(threshold * 10) / 10,
      };
    } catch (e) {
      return { avgPriceGapPct: 8.5, resistanceThresholdPct: 15.0 };
    }
  }

  /**
   * Computes average hold days and absorption rate from pipeline transitions.
   */
  async computeHoldAndAbsorption(region: string, assetType: string) {
    try {
      const { data } = await this.supabase
        .from("pipeline_stage_transitions")
        .select("hold_days");

      if (!data || data.length === 0) {
        return { avgHoldDays: 45, absorptionRate: 65 }; // Fallbacks
      }

      const days = data.map((d) => Number(d.hold_days));
      const avg = days.reduce((sum, v) => sum + v, 0) / days.length;
      
      // Absorption rate is inversely proportional to hold days
      const rate = Math.min(95, Math.max(20, 100 - (avg / 1.5)));

      return {
        avgHoldDays: Math.round(avg * 10) / 10 || 45,
        absorptionRate: Math.round(rate),
      };
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
