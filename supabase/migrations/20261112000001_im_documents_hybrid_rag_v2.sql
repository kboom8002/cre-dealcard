-- ============================================================================
-- Migration: 20261112000001_im_documents_hybrid_rag_v2.sql
-- Purpose:
--   1. Ensure public.im_documents exists with RLS enabled (service_role policy)
--   2. Upgrade public.match_im_documents to 6-parameter signature including
--      filter_posture so cre-rag-service.ts never hits PGRST202.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.im_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.im_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "im_documents_service_role_all" ON public.im_documents;
CREATE POLICY "im_documents_service_role_all"
  ON public.im_documents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS im_documents_embedding_idx
  ON public.im_documents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Drop legacy 5-arg overload if present so PostgREST resolves unambiguously
DROP FUNCTION IF EXISTS public.match_im_documents(
  VECTOR(1536),
  TEXT,
  INT,
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.match_im_documents(
  query_embedding VECTOR(1536) DEFAULT NULL,
  query_text TEXT DEFAULT '',
  match_count INT DEFAULT 5,
  filter_asset_type TEXT DEFAULT NULL,
  filter_region TEXT DEFAULT NULL,
  filter_posture TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  building_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF query_embedding IS NOT NULL THEN
    RETURN QUERY
      SELECT
        d.id,
        d.building_id,
        d.content,
        d.metadata,
        (1 - (d.embedding <=> query_embedding))::FLOAT AS similarity
      FROM public.im_documents d
      WHERE d.embedding IS NOT NULL
        AND (filter_asset_type IS NULL OR COALESCE(d.metadata->>'assetType', '') ILIKE '%' || filter_asset_type || '%')
        AND (filter_region IS NULL OR COALESCE(d.metadata->>'address', '') ILIKE '%' || filter_region || '%')
        AND (filter_posture IS NULL OR COALESCE(d.metadata->>'posture', d.metadata->>'investment_posture', '') ILIKE '%' || filter_posture || '%')
      ORDER BY d.embedding <=> query_embedding
      LIMIT GREATEST(1, match_count);
  ELSE
    RETURN QUERY
      SELECT
        d.id,
        d.building_id,
        d.content,
        d.metadata,
        0.25::FLOAT AS similarity
      FROM public.im_documents d
      WHERE (query_text = '' OR d.content ILIKE '%' || query_text || '%')
        AND (filter_asset_type IS NULL OR COALESCE(d.metadata->>'assetType', '') ILIKE '%' || filter_asset_type || '%')
        AND (filter_region IS NULL OR COALESCE(d.metadata->>'address', '') ILIKE '%' || filter_region || '%')
        AND (filter_posture IS NULL OR COALESCE(d.metadata->>'posture', d.metadata->>'investment_posture', '') ILIKE '%' || filter_posture || '%')
      ORDER BY d.updated_at DESC
      LIMIT GREATEST(1, match_count);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.match_im_documents(VECTOR(1536), TEXT, INT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_im_documents(VECTOR(1536), TEXT, INT, TEXT, TEXT, TEXT) TO service_role;
