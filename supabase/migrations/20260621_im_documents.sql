-- im_documents 테이블 (pgvector 사용)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS im_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  building_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- pgvector 인덱스
CREATE INDEX IF NOT EXISTS im_documents_embedding_idx ON im_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 하이브리드 검색 RPC
CREATE OR REPLACE FUNCTION match_im_documents(
  query_embedding VECTOR(1536) DEFAULT NULL,
  query_text TEXT DEFAULT '',
  match_count INT DEFAULT 3,
  filter_asset_type TEXT DEFAULT NULL,
  filter_region TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID, building_id TEXT, content TEXT, metadata JSONB, similarity FLOAT
) AS $$
BEGIN
  IF query_embedding IS NOT NULL THEN
    RETURN QUERY
      SELECT d.id, d.building_id, d.content, d.metadata,
             1 - (d.embedding <=> query_embedding) AS similarity
      FROM im_documents d
      WHERE (filter_asset_type IS NULL OR d.metadata->>'assetType' ILIKE '%' || filter_asset_type || '%')
        AND (filter_region IS NULL OR d.metadata->>'address' ILIKE '%' || filter_region || '%')
      ORDER BY d.embedding <=> query_embedding
      LIMIT match_count;
  ELSE
    RETURN QUERY
      SELECT d.id, d.building_id, d.content, d.metadata, 0.0::FLOAT AS similarity
      FROM im_documents d
      WHERE d.content ILIKE '%' || query_text || '%'
      LIMIT match_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- commercial_district 테이블 보완 (기존에 없을 경우 생성)
CREATE TABLE IF NOT EXISTS commercial_district (
  district_code TEXT PRIMARY KEY,
  district_name TEXT NOT NULL,
  sales_volume_index NUMERIC,
  footfall_index NUMERIC,
  full_analysis JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
