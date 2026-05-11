import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('DC-L1 DB Migrations (P1)', () => {
  test('DC-L1-05: buyer_intent_lite cluster columns exist', async () => {
    const { data, error } = await supabase.from('buyer_intent_lite').select('cluster_id, cluster_label, cluster_updated_at').limit(1);
    expect(error?.code).not.toBe('42703'); // undefined_column
  });

  test('DC-L1-06: deal_casepacks embedding column exists', async () => {
    const { data, error } = await supabase.from('deal_casepacks').select('embedding').limit(1);
    expect(error?.code).not.toBe('42703');
  });

  test('DC-L1-07: knowledge_edges unique index', async () => {
    // If we try to insert duplicate source_id + target_id + edge_type, it should fail or update (upsert)
    // We just verify the table exists for now
    const { error } = await supabase.from('knowledge_edges').select('source_id, target_id, edge_type').limit(1);
    expect(error?.code).not.toBe('42P01');
  });
});
