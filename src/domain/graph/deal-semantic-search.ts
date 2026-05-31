/**
 * Deal Semantic Search — G-D
 * Generates embeddings for deal_casepacks and queries similar deals.
 * Falls back to text search when embeddings < 30.
 */
import { embedText } from '@/ai/llm-client';
import { createServiceClient } from '@/lib/supabase/service';

export interface SimilarDeal {
  id: string;
  task: string;
  knowledge: string;
  warning: string;
  situation: string;
  sourceEventType: string;
  similarity: number;
}

// ─── Embedding generation ──────────────────────────────────────────────

export async function generateCasePackEmbedding(casePackId: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: cp } = await supabase
    .from('deal_casepacks')
    .select('task, knowledge, warning, situation')
    .eq('id', casePackId)
    .single();

  if (!cp) return;

  const text = [cp.task, cp.knowledge, cp.situation, cp.warning]
    .filter(Boolean)
    .join(' ')
    .slice(0, 8000);

  const embedding = await embedText(text);

  await supabase
    .from('deal_casepacks')
    .update({
      embedding,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq('id', casePackId);
}

// ─── Count embedded records ────────────────────────────────────────────

async function countEmbedded(): Promise<number> {
  const supabase = createServiceClient();
  const { count } = await supabase
    .from('deal_casepacks')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);
  return count ?? 0;
}

// ─── Semantic search (pgvector) ────────────────────────────────────────

async function semanticSearch(
  queryText: string,
  excludeId?: string,
  limit = 5,
): Promise<SimilarDeal[]> {
  const supabase = createServiceClient();

  const embedding = await embedText(queryText.slice(0, 8000));

  const { data } = await supabase.rpc('search_similar_deals', {
    query_embedding:  embedding,
    match_threshold:  0.68,
    match_count:      limit,
    exclude_id:       excludeId ?? null,
  });

  return (data ?? []).map((r: Record<string, unknown>) => ({
    id:              r.id as string,
    task:            r.task as string,
    knowledge:       r.knowledge as string,
    warning:         r.warning as string,
    situation:       r.situation as string,
    sourceEventType: r.source_event_type as string,
    similarity:      r.similarity as number,
  }));
}

// ─── Text-based fallback ───────────────────────────────────────────────

async function textFallbackSearch(
  areaSignal: string,
  assetType: string,
  excludeId?: string,
  limit = 5,
): Promise<SimilarDeal[]> {
  const supabase = createServiceClient();

  let query = supabase
    .from('deal_casepacks')
    .select('id, task, knowledge, warning, situation, source_event_type')
    .or(`knowledge.ilike.%${areaSignal}%,knowledge.ilike.%${assetType}%`)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;
  return (data ?? []).map((r) => ({ ...r, sourceEventType: r.source_event_type, similarity: 0 }));
}

// ─── Main entry ────────────────────────────────────────────────────────

export async function findSimilarDeals(params: {
  areaSignal:  string;
  assetType:   string;
  priceBand?:  string;
  excludeId?:  string;
  limit?:      number;
}): Promise<{ deals: SimilarDeal[]; mode: 'semantic' | 'text' }> {
  const { areaSignal, assetType, priceBand, excludeId, limit = 5 } = params;

  const embeddedCount = await countEmbedded();

  if (embeddedCount >= 30) {
    const queryText = [areaSignal, assetType, priceBand ?? ''].filter(Boolean).join(' ');
    const deals = await semanticSearch(queryText, excludeId, limit);
    return { deals, mode: 'semantic' };
  }

  // Fallback to text search
  const deals = await textFallbackSearch(areaSignal, assetType, excludeId, limit);
  return { deals, mode: 'text' };
}

// ─── Batch embedding generation ────────────────────────────────────────

export async function backfillCasePackEmbeddings(batchSize = 20): Promise<number> {
  const supabase = createServiceClient();

  const { data: unembedded } = await supabase
    .from('deal_casepacks')
    .select('id')
    .is('embedding', null)
    .limit(batchSize);

  if (!unembedded?.length) return 0;

  let count = 0;
  for (const { id } of unembedded) {
    try {
      await generateCasePackEmbedding(id);
      count++;
    } catch (e) {
      console.warn('[G-D] embedding failed for', id, e);
    }
  }
  return count;
}
