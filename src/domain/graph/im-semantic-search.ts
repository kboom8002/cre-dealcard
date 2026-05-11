/**
 * IM Semantic Search — G-I
 * Generates embeddings for im_projects and retrieves similar IMs.
 * Used to inject success/failure patterns into SectionPlanner.
 */
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI();

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface SimilarIM {
  id: string;
  outcome: string | null;
  outcomeNotes: string | null;
  readinessScore: number | null;
  similarity: number;
}

export interface ImSimilarContext {
  successPatterns: string[];
  failureWarnings: string[];
  similarCount: number;
}

// ─── Build embedding text from IM + building data ──────────────────────

export function buildImEmbeddingText(params: {
  areaSignal?:   string;
  assetType?:    string;
  priceBand?:    string;
  totalArea?:    number;
  floors?:       number;
  noi?:          number;
  capRate?:      number;
  vacancyRate?:  number;
  readinessScore?: number;
}): string {
  const { areaSignal, assetType, priceBand, totalArea, floors,
          noi, capRate, vacancyRate, readinessScore } = params;
  return [
    areaSignal,
    assetType,
    priceBand,
    totalArea ? `연면적 ${Math.round(totalArea)}평` : null,
    floors    ? `${floors}층` : null,
    noi       ? `NOI ${noi.toLocaleString()}원` : null,
    capRate   ? `Cap Rate ${capRate}%` : null,
    vacancyRate !== undefined ? `공실률 ${vacancyRate}%` : null,
    readinessScore ? `준비도 ${readinessScore}점` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

// ─── Generate and store embedding ──────────────────────────────────────

export async function generateImEmbedding(
  imProjectId: string,
  embeddingText: string,
): Promise<void> {
  const supabase = getClient();

  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText.slice(0, 8000),
  });

  await supabase
    .from('im_projects')
    .update({
      embedding:             resp.data[0].embedding,
      embedding_updated_at:  new Date().toISOString(),
    })
    .eq('id', imProjectId);
}

// ─── Find similar IMs ──────────────────────────────────────────────────

export async function findSimilarIMs(
  embeddingText: string,
  limit = 3,
): Promise<{ success: SimilarIM[]; failure: SimilarIM[] }> {
  const supabase = getClient();

  const { count: embeddedCount } = await supabase
    .from('im_projects')
    .select('id', { count: 'exact', head: true })
    .not('embedding', 'is', null);

  if (!embeddedCount || embeddedCount < 20) {
    return { success: [], failure: [] };
  }

  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText.slice(0, 8000),
  });
  const embedding = resp.data[0].embedding;

  const [{ data: successRows }, { data: failureRows }] = await Promise.all([
    supabase.rpc('search_similar_ims', {
      query_embedding: embedding,
      match_threshold: 0.70,
      match_count:     limit,
      outcome_filter:  'success',
    }),
    supabase.rpc('search_similar_ims', {
      query_embedding: embedding,
      match_threshold: 0.68,
      match_count:     limit,
      outcome_filter:  'failed',
    }),
  ]);

  const toSimilarIM = (r: Record<string, unknown>): SimilarIM => ({
    id:              r.id as string,
    outcome:         r.outcome as string | null,
    outcomeNotes:    r.outcome_notes as string | null,
    readinessScore:  r.readiness_score as number | null,
    similarity:      r.similarity as number,
  });

  return {
    success: (successRows ?? []).map(toSimilarIM),
    failure: (failureRows ?? []).map(toSimilarIM),
  };
}

// ─── Build context for SectionPlanner ─────────────────────────────────

export async function buildImSimilarContext(
  embeddingText: string,
): Promise<ImSimilarContext> {
  const { success, failure } = await findSimilarIMs(embeddingText);

  const successPatterns = success
    .filter((im) => im.outcomeNotes)
    .map((im) => `유사 성공 딜: ${im.outcomeNotes} (유사도 ${(im.similarity * 100).toFixed(0)}%)`);

  const failureWarnings = failure
    .filter((im) => im.outcomeNotes)
    .map((im) => `⚠️ 유사 실패 패턴: ${im.outcomeNotes}`);

  return {
    successPatterns,
    failureWarnings,
    similarCount: success.length + failure.length,
  };
}
