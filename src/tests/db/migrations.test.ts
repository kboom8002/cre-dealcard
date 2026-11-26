import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

interface SchemaSnapshot {
  tables: Record<string, { columns: Record<string, string>; required?: string[] }>;
  rpcs?: Record<string, unknown>;
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
  const sqlFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  expect(sqlFiles.length > 0).toBe(true);
  return sqlFiles
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

function hasCreateViewSql(sql: string, viewName: string): boolean {
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?view\\s+(?:public\\.)?${viewName}\\b`,
    'i'
  );
  return pattern.test(sql);
}

function hasCreateFunctionSql(sql: string, fnName: string): boolean {
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${fnName}\\s*\\(`,
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

describe('DC-L1 DB Migrations & Tables', () => {
  const snapshot = isLiveEnv ? null : loadSchemaSnapshot();
  const migrationsSql = isLiveEnv ? '' : loadMigrationsSql();

  test('DC-L1-01: matching tables exist (match_results, deal_casepacks, deal_pipeline_states)', async () => {
    const tables = ['match_results', 'deal_casepacks', 'deal_pipeline_states'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      for (const table of tables) {
        const { error } = await supabase.from(table).select('id').limit(1);
        expect(error).toBeNull();
      }
      return;
    }

    for (const table of tables) {
      expect(snapshot!.tables[table]).toBeDefined();
      expect(snapshot!.tables[table].columns.id).toBeDefined();
      expect(hasCreateTableSql(migrationsSql, table)).toBe(true);
    }
  });

  test('DC-L1-02: prediction/graph tables exist (knowledge_edges, external_transactions, price_features, deal_conversion_features, buyer_clusters)', async () => {
    const tables = [
      'knowledge_edges',
      'external_transactions',
      'price_features',
      'deal_conversion_features',
      'buyer_clusters',
    ];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      for (const table of tables) {
        const { error } = await supabase.from(table).select('*').limit(1);
        expect(error).toBeNull();
      }
      return;
    }

    for (const table of tables) {
      expect(snapshot!.tables[table]).toBeDefined();
      expect(Object.keys(snapshot!.tables[table].columns).length > 0).toBe(true);
      expect(hasCreateTableSql(migrationsSql, table)).toBe(true);
    }
  });

  test('DC-L1-03: semantic search functions exist', async () => {
    const fnNames = ['search_similar_deals', 'search_similar_ims'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const zeroVector = JSON.stringify(Array(1536).fill(0));
      const { error: error1 } = await supabase.rpc('search_similar_deals', {
        query_embedding: zeroVector,
        match_threshold: 0,
        match_count: 1,
      });
      expect(error1).toBeNull();

      const { error: error2 } = await supabase.rpc('search_similar_ims', {
        query_embedding: zeroVector,
        match_threshold: 0,
        match_count: 1,
      });
      expect(error2).toBeNull();
      return;
    }

    const semanticSqlPath = path.resolve(
      process.cwd(),
      'supabase',
      'migrations',
      '00010_semantic_search_functions.sql'
    );
    expect(fs.existsSync(semanticSqlPath)).toBe(true);
    const semanticSql = fs.readFileSync(semanticSqlPath, 'utf-8');

    for (const fnName of fnNames) {
      expect(hasCreateFunctionSql(migrationsSql, fnName)).toBe(true);
      expect(hasCreateFunctionSql(semanticSql, fnName)).toBe(true);
      expect(semanticSql.includes('query_embedding')).toBe(true);
    }
  });

  test('DC-L1-04: building_ssot_lite promotion columns exist', async () => {
    const cols = ['promotion_score', 'matched_buyer_count', 'vacancy_demand_verified'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error } = await supabase
        .from('building_ssot_lite')
        .select(cols.join(', '))
        .limit(1);
      expect(error).toBeNull();
      return;
    }

    expect(snapshot!.tables.building_ssot_lite).toBeDefined();
    for (const col of cols) {
      expect(snapshot!.tables.building_ssot_lite.columns[col]).toBeDefined();
      expect(migrationsSql.includes(col)).toBe(true);
    }
  });

  test('DC-L1-05: broker_sentiment_votes and broker_sentiment_stats exist', async () => {
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error: errTable } = await supabase
        .from('broker_sentiment_votes')
        .select('id')
        .limit(1);
      expect(errTable).toBeNull();

      const { error: errView } = await supabase
        .from('broker_sentiment_stats')
        .select('vote_count')
        .limit(1);
      expect(errView).toBeNull();
      return;
    }

    expect(snapshot!.tables.broker_sentiment_votes).toBeDefined();
    expect(snapshot!.tables.broker_sentiment_votes.columns.id).toBeDefined();
    expect(hasCreateTableSql(migrationsSql, 'broker_sentiment_votes')).toBe(true);

    expect(snapshot!.tables.broker_sentiment_stats).toBeDefined();
    expect(snapshot!.tables.broker_sentiment_stats.columns.vote_count).toBeDefined();
    expect(hasCreateViewSql(migrationsSql, 'broker_sentiment_stats')).toBe(true);
  });

  test('DC-L1-06: broker_profiles v2 columns exist', async () => {
    const cols = ['license_number', 'career_start_year', 'association'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error } = await supabase
        .from('broker_profiles')
        .select(cols.join(', '))
        .limit(1);
      expect(error).toBeNull();
      return;
    }

    expect(snapshot!.tables.broker_profiles).toBeDefined();
    for (const col of cols) {
      expect(snapshot!.tables.broker_profiles.columns[col]).toBeDefined();
    }
  });
});
