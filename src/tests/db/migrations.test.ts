import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('DC-L1 DB Migrations & Tables', () => {
  test('DC-L1-01: matching tables exist (match_results, deal_casepacks, deal_pipeline_states)', async () => {
    const tables = ['match_results', 'deal_casepacks', 'deal_pipeline_states'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      // It might return an error if table doesn't exist. "relation does not exist"
      expect(error?.code).not.toBe('42P01'); // 42P01 is undefined_table in Postgres
    }
  });

  test('DC-L1-02: prediction/graph tables exist (knowledge_edges, external_transactions, price_features, deal_conversion_features, buyer_clusters)', async () => {
    const tables = ['knowledge_edges', 'external_transactions', 'price_features', 'deal_conversion_features', 'buyer_clusters'];
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      expect(error?.code).not.toBe('42P01');
    }
  });

  test('DC-L1-03: semantic search functions exist', async () => {
    // We can try to call them with dummy data and expect not to get "function does not exist"
    const { error: error1 } = await supabase.rpc('search_similar_deals', { query_embedding: '[0]', match_threshold: 0, match_count: 1 });
    expect(error1?.code).not.toBe('42883'); // undefined_function
    
    const { error: error2 } = await supabase.rpc('search_similar_ims', { query_embedding: '[0]', match_threshold: 0, match_count: 1 });
    expect(error2?.code).not.toBe('42883');
  });

  test('DC-L1-04: building_ssot_lite promotion columns exist', async () => {
    const { data, error } = await supabase.from('building_ssot_lite').select('promotion_score, matched_buyer_count, vacancy_demand_verified').limit(1);
    expect(error?.code).not.toBe('42703'); // undefined_column
  });
});
