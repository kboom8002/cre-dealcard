import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('DC-L1 DB Migrations (P2) - PoC Feature Expansion Tables', () => {
  const tables = [
    'poc_surveys',
    'market_sentiment_polls',
    'content_share_events',
    'lead_scores',
    'content_curations',
    'curation_items',
    'content_ab_tests',
    'external_news',
    'external_reports',
    'social_sentiment',
    'youtube_trends',
    'auction_listings',
    'rental_market_data',
    'rental_trend_data',
    'land_use_plans',
    'energy_ratings',
    'commercial_district',
    'official_land_prices',
    'co_brokerage_requests',
    'buyer_wishlists',
    'vendor_reviews',
    'share_pages'
  ];

  test('All 22 PoC tables exist in Supabase database', async () => {
    const results = await Promise.all(
      tables.map(async (table) => {
        const { error } = await supabase.from(table).select('*').limit(1);
        return { table, error };
      })
    );

    for (const { table, error } of results) {
      // Verify the table exists by ensuring the error is not "undefined_table" (42P01)
      expect(error?.code).not.toBe('42P01');
    }
  }, 30000); // 30 seconds timeout
});
