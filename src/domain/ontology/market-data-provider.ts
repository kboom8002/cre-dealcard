import { createServiceClient } from '@/lib/supabase/service';
import {
  COMMERCIAL_MORTGAGE,
  ACQUISITION_COSTS,
  CONSTRUCTION_COST_PER_PYUNG,
  DEVELOPMENT_DEFAULTS,
  OPERATING_DEFAULTS,
  CAP_RATE_BENCHMARK,
  TRADING_THRESHOLDS,
  OWNER_OCCUPIED_DEFAULTS,
} from './market-defaults';

export interface MarketDefaults {
  commercialMortgage: {
    interestRatePct: number;
    typicalTermYears: number;
    maxLtvPct: number;
    defaultLtvPct: number;
  };
  acquisitionCosts: {
    taxRatePct: number;
    brokerageFeePct: number;
    legalFeesPct: number;
  };
  constructionCostPerPyung: {
    RC: number;
    SC: number;
    SRC: number;
    default: number;
  };
  developmentDefaults: {
    softCostRatioPct: number;
    pfInterestRatePct: number;
    typicalProjectYears: number;
  };
  operatingDefaults: {
    defaultAdrManwon: number;
    defaultOccPct: number;
    defaultGopMarginPct: number;
    ffeReserveRatioPct: number;
  };
  capRateBenchmarks: Record<string, number>;
  tradingThresholds: {
    discountThresholdPct: number;
    premiumThresholdPct: number;
  };
  ownerOccupiedDefaults: {
    defaultMonthlyRentManwon: number;
    comparisonHorizonYears: number;
  };
  updatedAt?: string;
  source?: string;
}

export const STATIC_MARKET_DEFAULTS: MarketDefaults = {
  commercialMortgage: { ...COMMERCIAL_MORTGAGE },
  acquisitionCosts: { ...ACQUISITION_COSTS },
  constructionCostPerPyung: { ...CONSTRUCTION_COST_PER_PYUNG },
  developmentDefaults: { ...DEVELOPMENT_DEFAULTS },
  operatingDefaults: { ...OPERATING_DEFAULTS },
  capRateBenchmarks: { ...CAP_RATE_BENCHMARK },
  tradingThresholds: { ...TRADING_THRESHOLDS },
  ownerOccupiedDefaults: { ...OWNER_OCCUPIED_DEFAULTS },
};

let cache: { data: MarketDefaults; ts: number } | null = null;
const CACHE_TTL_MS = 3_600_000; // 1시간 캐시

/**
 * DB에서 최신 시장 기본값을 조회합니다.
 * DB 미연동 / 오류 발생 시 정적 기본값(market-defaults.ts)으로 폴백합니다.
 */
export async function getMarketDefaults(): Promise<MarketDefaults> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('market_defaults')
      .select('*')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return STATIC_MARKET_DEFAULTS;
    }

    const fetched: MarketDefaults = {
      commercialMortgage: {
        interestRatePct: Number(data.commercial_mortgage_rate_pct ?? COMMERCIAL_MORTGAGE.interestRatePct),
        typicalTermYears: COMMERCIAL_MORTGAGE.typicalTermYears,
        maxLtvPct: Number(data.max_ltv_pct ?? COMMERCIAL_MORTGAGE.maxLtvPct),
        defaultLtvPct: COMMERCIAL_MORTGAGE.defaultLtvPct,
      },
      acquisitionCosts: {
        taxRatePct: Number(data.acquisition_tax_rate_pct ?? ACQUISITION_COSTS.taxRatePct),
        brokerageFeePct: Number(data.brokerage_fee_pct ?? ACQUISITION_COSTS.brokerageFeePct),
        legalFeesPct: Number(data.legal_fees_pct ?? ACQUISITION_COSTS.legalFeesPct),
      },
      constructionCostPerPyung: {
        RC: Number(data.construction_cost_rc ?? CONSTRUCTION_COST_PER_PYUNG.RC),
        SC: Number(data.construction_cost_sc ?? CONSTRUCTION_COST_PER_PYUNG.SC),
        SRC: Number(data.construction_cost_src ?? CONSTRUCTION_COST_PER_PYUNG.SRC),
        default: CONSTRUCTION_COST_PER_PYUNG.default,
      },
      developmentDefaults: {
        softCostRatioPct: DEVELOPMENT_DEFAULTS.softCostRatioPct,
        pfInterestRatePct: Number(data.pf_interest_rate_pct ?? DEVELOPMENT_DEFAULTS.pfInterestRatePct),
        typicalProjectYears: DEVELOPMENT_DEFAULTS.typicalProjectYears,
      },
      operatingDefaults: {
        defaultAdrManwon: Number(data.hotel_adr_manwon ?? OPERATING_DEFAULTS.defaultAdrManwon),
        defaultOccPct: Number(data.hotel_occ_pct ?? OPERATING_DEFAULTS.defaultOccPct),
        defaultGopMarginPct: Number(data.hotel_gop_margin_pct ?? OPERATING_DEFAULTS.defaultGopMarginPct),
        ffeReserveRatioPct: OPERATING_DEFAULTS.ffeReserveRatioPct,
      },
      capRateBenchmarks: (data.cap_rate_benchmarks as Record<string, number>) || CAP_RATE_BENCHMARK,
      tradingThresholds: { ...TRADING_THRESHOLDS },
      ownerOccupiedDefaults: { ...OWNER_OCCUPIED_DEFAULTS },
      updatedAt: data.updated_at,
      source: data.source,
    };

    cache = { data: fetched, ts: Date.now() };
    return fetched;
  } catch (err) {
    console.warn('[market-data-provider] Failed to fetch market_defaults from DB, using fallback:', err);
    return STATIC_MARKET_DEFAULTS;
  }
}

/** 캐시 강제 만료 */
export function invalidateMarketDefaultsCache(): void {
  cache = null;
}
