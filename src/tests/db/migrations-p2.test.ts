import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

interface SchemaSnapshot {
  tables: Record<string, { columns: Record<string, string>; required?: string[] }>;
}

const isLiveEnv = process.env.VITEST_USE_LIVE_ENV === '1';

function loadSchemaSnapshot(): SchemaSnapshot {
  const snapshotPath = path.resolve(process.cwd(), 'supabase', 'schema-snapshot.json');
  expect(fs.existsSync(snapshotPath)).toBe(true);
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as SchemaSnapshot;
}

function loadMigrationsSql(): string {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  expect(fs.existsSync(migrationsDir)).toBe(true);
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf-8'))
    .join('\n');
}

function hasCreateTableSql(sql: string, tableName: string): boolean {
  const pattern = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${tableName}\\b`,
    'i'
  );
  return pattern.test(sql);
}

function getLiveSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
    'share_pages',
  ];

  test('All 22 PoC tables exist in Supabase database', async () => {
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const results = await Promise.all(
        tables.map(async (table) => {
          const { error } = await supabase.from(table).select('*').limit(1);
          return { table, error };
        })
      );

      for (const { error } of results) {
        expect(error).toBeNull();
      }
      return;
    }

    const snapshot = loadSchemaSnapshot();
    const migrationsSql = loadMigrationsSql();
    expect(tables.length).toBe(22);

    for (const table of tables) {
      expect(snapshot.tables[table]).toBeDefined();
      expect(Object.keys(snapshot.tables[table].columns).length > 0).toBe(true);
      expect(hasCreateTableSql(migrationsSql, table)).toBe(true);
    }
  }, 30000);
});
