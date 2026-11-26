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

function loadPredictionGraphSql(): string {
  const sqlPath = path.resolve(
    process.cwd(),
    'supabase',
    'migrations',
    '00009_prediction_graph.sql'
  );
  expect(fs.existsSync(sqlPath)).toBe(true);
  return fs.readFileSync(sqlPath, 'utf-8');
}

function getLiveSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

describe('DC-L1 DB Migrations (P1)', () => {
  const snapshot = isLiveEnv ? null : loadSchemaSnapshot();
  const predictionSql = isLiveEnv ? '' : loadPredictionGraphSql();

  test('DC-L1-05: buyer_intent_lite cluster columns exist', async () => {
    const cols = ['cluster_id', 'cluster_label', 'cluster_updated_at'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error } = await supabase
        .from('buyer_intent_lite')
        .select(cols.join(', '))
        .limit(1);
      expect(error).toBeNull();
      return;
    }

    expect(snapshot!.tables.buyer_intent_lite).toBeDefined();
    for (const col of cols) {
      expect(snapshot!.tables.buyer_intent_lite.columns[col]).toBeDefined();
      expect(predictionSql.includes(col)).toBe(true);
    }
  });

  test('DC-L1-06: deal_casepacks embedding column exists', async () => {
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error } = await supabase.from('deal_casepacks').select('embedding').limit(1);
      expect(error).toBeNull();
      return;
    }

    expect(snapshot!.tables.deal_casepacks).toBeDefined();
    expect(snapshot!.tables.deal_casepacks.columns.embedding).toBeDefined();
    expect(/alter\s+table\s+deal_casepacks[\s\S]*?embedding/i.test(predictionSql)).toBe(true);
  });

  test('DC-L1-07: knowledge_edges unique index', async () => {
    const indexCols = ['from_type', 'from_id', 'to_type', 'to_id', 'edge_type'];
    if (isLiveEnv) {
      const supabase = getLiveSupabase();
      const { error } = await supabase
        .from('knowledge_edges')
        .select(indexCols.join(', '))
        .limit(1);
      expect(error).toBeNull();
      return;
    }

    expect(snapshot!.tables.knowledge_edges).toBeDefined();
    for (const col of indexCols) {
      expect(snapshot!.tables.knowledge_edges.columns[col]).toBeDefined();
    }
    const uniqueIdxRegex =
      /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?ke_unique_idx\s+on\s+knowledge_edges\s*\(\s*from_type\s*,\s*from_id\s*,\s*to_type\s*,\s*to_id\s*,\s*edge_type\s*\)/i;
    expect(uniqueIdxRegex.test(predictionSql)).toBe(true);
  });
});
