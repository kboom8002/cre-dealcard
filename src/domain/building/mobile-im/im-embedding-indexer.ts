// src/domain/building/mobile-im/im-embedding-indexer.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import { MobileIMSection } from "./types";

import { createModuleLogger } from "@/lib/logger";
const log = createModuleLogger("im-embedding-indexer");

const TABLE_MISSING_COOLDOWN_MS = 10 * 60 * 1000;
let imDocumentsTableMissingUntilMs = 0;

export function resetImEmbeddingCircuitBreakerForTest(): void {
  imDocumentsTableMissingUntilMs = 0;
}

function isMissingImDocumentsTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  const message = typeof rec.message === "string" ? rec.message : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    message.includes("Could not find the table") ||
    message.includes("im_documents")
  );
}

interface ImDocumentsTableClient {
  from?: (table: string) => {
    select?: (cols: string) => {
      limit?: (n: number) => Promise<{ data?: unknown; error?: unknown }>;
    };
    upsert?: (
      values: Record<string, unknown>,
      opts: { onConflict: string }
    ) => Promise<{ error?: unknown }>;
  };
}

/**
 * IM 섹션 컨텐츠를 임베딩하여 RAG 검색을 위한 pgvector 인덱스에 저장합니다.
 * 운영 DB에 im_documents 테이블이 아직 생성되지 않은 경우(PGRST205)에는
 * 10분간 서킷 브레이커를 작동하여 불필요한 임베딩 API 호출과 에러 로그 스팸을 차단합니다.
 */
export async function indexIMSections(
  supabase: SupabaseClient,
  buildingId: string,
  sections: MobileIMSection[],
  metadata: Record<string, unknown>
) {
  if (!process.env.OPENAI_API_KEY) {
    log.warn("[im-embedding-indexer] OPENAI_API_KEY is missing. Skipping indexing.");
    return;
  }

  if (metadata.status !== "published" || !metadata.brokerApproved) return;
  if (Date.now() < imDocumentsTableMissingUntilMs) return;

  const fullContent = sections.map((s) => `[${s.title}]\n${s.markdown}`).join("\n\n");
  if (!fullContent.trim()) return;

  try {
    const looseClient = supabase as unknown as ImDocumentsTableClient;
    if (typeof looseClient?.from === "function") {
      const probeQuery = looseClient.from("im_documents")?.select?.("id");
      if (probeQuery && typeof probeQuery.limit === "function") {
        const { error: probeErr } = await probeQuery.limit(1);
        if (probeErr && isMissingImDocumentsTableError(probeErr)) {
          imDocumentsTableMissingUntilMs = Date.now() + TABLE_MISSING_COOLDOWN_MS;
          log.info(
            "[im-embedding-indexer] im_documents table not present in schema cache; skipping pgvector indexing for 10m (document_objects RAG fallback active)."
          );
          return;
        }
      }
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        input: fullContent.slice(0, 8000),
        model: "text-embedding-3-small",
      }),
    });

    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;

    if (embedding && typeof looseClient?.from === "function") {
      const upsertFn = looseClient.from("im_documents")?.upsert;
      if (typeof upsertFn === "function") {
        const { error } = await upsertFn(
          {
            building_id: buildingId,
            content: fullContent,
            metadata,
            embedding,
          },
          { onConflict: "building_id" }
        );

        if (error) {
          if (isMissingImDocumentsTableError(error)) {
            imDocumentsTableMissingUntilMs = Date.now() + TABLE_MISSING_COOLDOWN_MS;
            log.info(
              "[im-embedding-indexer] im_documents table unavailable; deferring pgvector indexing for 10m."
            );
            return;
          }
          throw error;
        }
        log.info(`[im-embedding-indexer] Successfully indexed IM for building ${buildingId}`);
      }
    }
  } catch (error) {
    log.warn("[im-embedding-indexer] Non-fatal indexing skip:", error);
  }
}
