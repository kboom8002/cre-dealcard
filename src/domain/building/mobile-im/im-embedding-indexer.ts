// src/domain/building/mobile-im/im-embedding-indexer.ts

import { createClient } from "@supabase/supabase-js";
import { MobileIMSection } from "./types";

/**
 * IM 섹션 컨텐츠를 임베딩하여 RAG 검색을 위한 pgvector 인덱스에 저장합니다.
 */
export async function indexIMSections(
  supabase: ReturnType<typeof createClient>,
  buildingId: string,
  sections: MobileIMSection[],
  metadata: Record<string, any>
) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[im-embedding-indexer] OPENAI_API_KEY is missing. Skipping indexing.");
    return;
  }

  // 전체 IM 텍스트 하나로 병합하거나 섹션별로 처리
  // 여기서는 섹션 전체를 하나의 문서로 묶어서 인덱싱합니다.
  const fullContent = sections.map(s => `[${s.title}]\n${s.markdown}`).join("\n\n");
  
  if (!fullContent.trim()) return;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        input: fullContent.slice(0, 8000), // Token limit cutoff
        model: "text-embedding-3-small"
      })
    });
    
    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;

    if (embedding) {
      const { error } = await (supabase as any).from("im_documents").upsert({
        building_id: buildingId,
        content: fullContent,
        metadata,
        embedding // pgvector 컬럼
      }, { onConflict: "building_id" });

      if (error) throw error;
      console.info(`[im-embedding-indexer] Successfully indexed IM for building ${buildingId}`);
    }
  } catch (error) {
    console.error("[im-embedding-indexer] Failed to index IM:", error);
  }
}
