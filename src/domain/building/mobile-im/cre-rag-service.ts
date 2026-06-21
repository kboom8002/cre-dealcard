// src/domain/building/mobile-im/cre-rag-service.ts
import { createClient } from "@supabase/supabase-js";

export interface RAGDocument {
  id: string;
  building_id: string;
  content: string;
  metadata: Record<string, any>;
  similarity?: number;
}

export interface RAGQueryOptions {
  topK?: number;
  filterByAssetType?: string;
  filterByRegion?: string;
}

/**
 * 3-layer Hybrid RAG (Vector + Tag + BM25 Ensemble)
 * Supabase pgvector 및 텍스트 검색을 활용하여 관련 컨텍스트 검색
 */
export async function searchSimilarIMs(
  supabase: ReturnType<typeof createClient>,
  query: string,
  options: RAGQueryOptions = {}
): Promise<RAGDocument[]> {
  const topK = options.topK || 3;
  
  // 1. 임베딩 생성 (OpenAI text-embedding-3-small)
  let embedding: number[] = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          input: query,
          model: "text-embedding-3-small"
        })
      });
      const data = await res.json();
      if (data.data?.[0]?.embedding) {
        embedding = data.data[0].embedding;
      }
    } catch (e) {
      console.warn("Embedding generation failed:", e);
    }
  }

  // 2. 하이브리드 검색 호출 (Supabase RPC - match_im_documents)
  // 실제 환경에서는 match_im_documents RPC가 pgvector와 websearch_to_tsquery를 결합하여 결과를 반환합니다.
  try {
    const { data, error } = await (supabase as any).rpc("match_im_documents", {
      query_embedding: embedding.length > 0 ? embedding : null,
      query_text: query,
      match_count: topK,
      filter_asset_type: options.filterByAssetType || null,
      filter_region: options.filterByRegion || null,
    });

    if (error) throw error;
    
    return ((data as any[]) || []).map((doc: any) => ({
      id: doc.id,
      building_id: doc.building_id,
      content: doc.content,
      metadata: doc.metadata,
      similarity: doc.similarity
    }));
  } catch (error) {
    console.error("[CRE-RAG] Hybrid search failed:", error);
    return [];
  }
}

/**
 * 특정 자산에 대한 RAG 컨텍스트를 생성합니다.
 */
export async function generateRAGContext(
  supabase: ReturnType<typeof createClient>,
  assetType: string | undefined,
  address: string | undefined,
  buildingName: string | undefined
): Promise<string> {
  const queryParts = [];
  if (assetType) queryParts.push(assetType);
  if (address) {
    // 동 단위로 추출 (예: 강남구 역삼동)
    const dongMatch = address.match(/([가-힣]+구)\s+([가-힣]+[동|가])/);
    if (dongMatch) {
      queryParts.push(dongMatch[1], dongMatch[2]);
    } else {
      queryParts.push(address.split(' ').slice(0, 2).join(' '));
    }
  }
  if (buildingName) queryParts.push(buildingName);
  
  if (queryParts.length === 0) return "";

  const query = queryParts.join(" ");
  const docs = await searchSimilarIMs(supabase, query, { topK: 2, filterByAssetType: assetType });
  
  if (docs.length === 0) return "";

  return docs.map((d, i) => `[유사사례 ${i+1}] ${d.content}`).join("\n\n");
}
