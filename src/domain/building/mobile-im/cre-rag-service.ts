// src/domain/building/mobile-im/cre-rag-service.ts
import { createClient } from "@supabase/supabase-js";

import { createModuleLogger } from "@/lib/logger";
const log = createModuleLogger("cre-rag-service");

export interface RAGDocument {
  id: string;
  building_id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity?: number;
}

export interface RAGQueryOptions {
  topK?: number;
  filterByAssetType?: string;
  filterByRegion?: string;
  filterByPosture?: string;
  excludeBuildingId?: string;
  excludeBuildingName?: string;
}

const RPC_MISSING_COOLDOWN_MS = 10 * 60 * 1000;
let rpcMissingUntilMs = 0;

export function resetRagRpcCircuitBreakerForTest(): void {
  rpcMissingUntilMs = 0;
}

function isMissingSchemaResourceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : "";
  const message = typeof rec.message === "string" ? rec.message : "";
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42883" ||
    code === "42P01" ||
    message.includes("Could not find the function") ||
    message.includes("Could not find the table")
  );
}

function tokenizeQuery(raw: string): string[] {
  const parts = raw
    .toLowerCase()
    .split(/[\s,./()[\]{}|:;\-_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return Array.from(new Set(parts));
}

function extractPublishedImDigest(body: Record<string, unknown>, title: string): string {
  const lines: string[] = [];
  if (title) lines.push(title);

  const heroCard =
    body.heroCard && typeof body.heroCard === "object"
      ? (body.heroCard as Record<string, unknown>)
      : {};
  const highlights = Array.isArray(body.axios_highlights)
    ? body.axios_highlights
    : Array.isArray(heroCard.keyPoints)
    ? heroCard.keyPoints
    : [];
  for (const h of highlights.slice(0, 4)) {
    if (typeof h === "string" && h.trim()) {
      lines.push(`- ${h.trim()}`);
    } else if (h && typeof h === "object") {
      const hRec = h as Record<string, unknown>;
      const claim = typeof hRec.claim === "string" ? hRec.claim.trim() : "";
      const detail = typeof hRec.detail === "string" ? hRec.detail.trim() : "";
      if (claim || detail) {
        lines.push(`- ${[claim, detail].filter(Boolean).join(": ")}`);
      }
    }
  }

  if (Array.isArray(body.sections)) {
    for (const sec of body.sections.slice(0, 3)) {
      if (!sec || typeof sec !== "object") continue;
      const sRec = sec as Record<string, unknown>;
      const secTitle = typeof sRec.title === "string" ? sRec.title.trim() : "";
      const md = typeof sRec.markdown === "string" ? sRec.markdown.trim() : "";
      if (md) {
        const compact = md.replace(/\s+/g, " ").slice(0, 220);
        lines.push(secTitle ? `[${secTitle}] ${compact}` : compact);
      }
    }
  }

  return lines.join("\n").slice(0, 680).trim();
}

interface LooseQueryChain {
  select?: (cols: string) => LooseQueryChain;
  eq?: (col: string, val: unknown) => LooseQueryChain;
  order?: (col: string, opts: { ascending: boolean }) => LooseQueryChain;
  limit?: (n: number) => Promise<{ data?: unknown; error?: unknown }>;
}

async function fallbackSearchPublishedDocumentObjects(
  supabase: ReturnType<typeof createClient>,
  query: string,
  options: RAGQueryOptions
): Promise<RAGDocument[]> {
  const topK = options.topK || 5;
  const anySb = supabase as unknown as {
    from?: (table: string) => LooseQueryChain;
  };
  if (!anySb || typeof anySb.from !== "function") {
    return [];
  }

  try {
    let q = anySb.from("document_objects");
    if (!q || typeof q.select !== "function") return [];
    q = q.select("id, building_id, title, body, updated_at");
    if (typeof q.eq === "function") {
      q = q.eq("document_type", "mobile_im");
      if (typeof q.eq === "function") {
        q = q.eq("status", "published");
      }
    }
    if (typeof q.order === "function") {
      q = q.order("updated_at", { ascending: false });
    }
    const res =
      typeof q.limit === "function"
        ? await q.limit(30)
        : await (q as unknown as Promise<{ data?: unknown; error?: unknown }>);
    const data = res?.data;
    if (res?.error || !Array.isArray(data) || data.length === 0) {
      return [];
    }

    const queryTokens = tokenizeQuery(query);
    const excludeNameNorm = options.excludeBuildingName?.trim().toLowerCase() || "";
    const scored: RAGDocument[] = [];

    for (const rawRow of data) {
      if (!rawRow || typeof rawRow !== "object") continue;
      const row = rawRow as Record<string, unknown>;
      const bldId = String(row.building_id || "");
      if (options.excludeBuildingId && bldId === options.excludeBuildingId) continue;

      const body =
        row.body && typeof row.body === "object"
          ? (row.body as Record<string, unknown>)
          : {};
      const ssot =
        body.ssot_summary && typeof body.ssot_summary === "object"
          ? (body.ssot_summary as Record<string, unknown>)
          : {};
      const title = String(row.title || body.heroTitle || body.building_name || "").trim();
      if (excludeNameNorm && title.toLowerCase() === excludeNameNorm) continue;

      const address = String(
        body.resolved_address || ssot.address || body.address || ""
      ).trim();
      const assetType = String(
        ssot.main_usage || body.assetType || body.main_usage || ""
      ).trim();
      const posture = String(
        body.investment_posture || body.posture || ssot.investment_posture || ""
      ).trim();

      const content = extractPublishedImDigest(body, title);
      if (!content) continue;

      const haystack = `${title} ${address} ${assetType} ${posture} ${content}`.toLowerCase();
      let matchedTokens = 0;
      for (const tok of queryTokens) {
        if (haystack.includes(tok)) matchedTokens++;
      }
      const lexicalScore =
        queryTokens.length > 0 ? (matchedTokens / queryTokens.length) * 0.6 : 0.15;

      let tagScore = 0;
      if (
        options.filterByPosture &&
        posture &&
        posture.toLowerCase().includes(options.filterByPosture.toLowerCase())
      ) {
        tagScore += 0.2;
      }
      if (
        options.filterByAssetType &&
        assetType &&
        assetType.toLowerCase().includes(options.filterByAssetType.toLowerCase())
      ) {
        tagScore += 0.15;
      }
      if (
        options.filterByRegion &&
        address &&
        address.toLowerCase().includes(options.filterByRegion.toLowerCase())
      ) {
        tagScore += 0.15;
      }

      const totalScore = lexicalScore + tagScore;
      if (totalScore <= 0) continue;

      scored.push({
        id: String(row.id || bldId),
        building_id: bldId,
        content,
        metadata: {
          title,
          address,
          assetType,
          posture,
          source: "document_objects_fallback",
        },
        similarity: Number(totalScore.toFixed(4)),
      });
    }

    return scored
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, topK);
  } catch {
    return [];
  }
}

/**
 * 3-layer Hybrid RAG (Vector + Tag + BM25 Ensemble)
 * Supabase pgvector RPC(match_im_documents) 우선 조회 후,
 * 스키마 미적용(PGRST202/PGRST205) 환경에서는 서킷 브레이커 + document_objects 하이브리드 폴백을 즉시 수행합니다.
 */
export async function searchSimilarIMs(
  supabase: ReturnType<typeof createClient>,
  query: string,
  options: RAGQueryOptions = {}
): Promise<RAGDocument[]> {
  const topK = options.topK || 5;
  type SupabaseRpcClient = {
    rpc?: (
      fn: string,
      params?: Record<string, unknown>
    ) => Promise<{ data: unknown; error: unknown }>;
  };
  const rpcClient = supabase as unknown as SupabaseRpcClient;

  // 서킷 브레이커 활성 상태이거나 rpc 미지원 클라이언트면 불필요한 OpenAI 임베딩 호출 없이 즉시 폴백
  if (Date.now() < rpcMissingUntilMs || typeof rpcClient?.rpc !== "function") {
    return fallbackSearchPublishedDocumentObjects(supabase, query, options);
  }

  // 1. 임베딩 생성 (OpenAI text-embedding-3-small)
  let embedding: number[] = [];
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          input: query,
          model: "text-embedding-3-small",
        }),
      });
      const data = await res.json();
      if (data.data?.[0]?.embedding) {
        embedding = data.data[0].embedding;
      }
    } catch (e) {
      log.warn("Embedding generation failed:", e);
    }
  }

  // 2. 하이브리드 검색 호출 (Supabase RPC - match_im_documents)
  try {
    const { data, error } = await rpcClient.rpc("match_im_documents", {
      query_embedding: embedding.length > 0 ? embedding : null,
      query_text: query,
      match_count: topK * 2, // 2x 후보 수집 후 리랭킹 적용
      filter_asset_type: options.filterByAssetType || null,
      filter_region: options.filterByRegion || null,
      filter_posture: options.filterByPosture || null,
    });

    if (error) {
      if (isMissingSchemaResourceError(error)) {
        rpcMissingUntilMs = Date.now() + RPC_MISSING_COOLDOWN_MS;
        log.info(
          "[CRE-RAG] match_im_documents not present in DB schema cache; switching to document_objects hybrid fallback for 10m."
        );
        return fallbackSearchPublishedDocumentObjects(supabase, query, options);
      }
      throw error;
    }

    const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
    const rawDocs: RAGDocument[] = rows.map((doc) => ({
      id: String(doc.id || ""),
      building_id: String(doc.building_id || ""),
      content: String(doc.content || ""),
      metadata:
        doc.metadata && typeof doc.metadata === "object"
          ? (doc.metadata as Record<string, unknown>)
          : {},
      similarity: typeof doc.similarity === "number" ? doc.similarity : 0,
    }));

    if (rawDocs.length === 0) {
      return fallbackSearchPublishedDocumentObjects(supabase, query, options);
    }

    // 3. Reranking (자산 유형 및 권역·포스처 정합성 가중치 보정)
    const rerankedDocs = rawDocs
      .map((doc) => {
        let boostedScore = doc.similarity ?? 0;
        const docAssetType =
          typeof doc.metadata?.assetType === "string" ? doc.metadata.assetType : "";
        const docAddress =
          typeof doc.metadata?.address === "string" ? doc.metadata.address : "";
        const docPosture =
          typeof doc.metadata?.posture === "string"
            ? doc.metadata.posture
            : typeof doc.metadata?.investment_posture === "string"
            ? doc.metadata.investment_posture
            : "";

        if (options.filterByAssetType && docAssetType === options.filterByAssetType) {
          boostedScore += 0.15;
        }
        if (options.filterByRegion && docAddress.includes(options.filterByRegion)) {
          boostedScore += 0.1;
        }
        if (options.filterByPosture && docPosture === options.filterByPosture) {
          boostedScore += 0.1;
        }
        return { ...doc, similarity: boostedScore };
      })
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, topK);

    return rerankedDocs;
  } catch (error) {
    log.warn("[CRE-RAG] Hybrid RPC search degraded, using document_objects fallback:", error);
    return fallbackSearchPublishedDocumentObjects(supabase, query, options);
  }
}

/**
 * 특정 자산에 대한 RAG 컨텍스트를 생성합니다.
 */
export async function generateRAGContext(
  supabase: ReturnType<typeof createClient>,
  assetType: string | undefined,
  address: string | undefined,
  buildingName: string | undefined,
  posture?: string
): Promise<string> {
  const queryParts: string[] = [];
  let regionFilter: string | undefined;

  if (posture) queryParts.push(posture);
  if (assetType) queryParts.push(assetType);
  if (address) {
    // 동 단위로 추출 (예: 강남구 역삼동)
    const dongMatch = address.match(/([가-힣]+구)\s+([가-힣]+[동가])/);
    if (dongMatch) {
      queryParts.push(dongMatch[1], dongMatch[2]);
      regionFilter = `${dongMatch[1]} ${dongMatch[2]}`;
    } else {
      const prefix = address.split(" ").slice(0, 2).join(" ").trim();
      if (prefix) {
        queryParts.push(prefix);
        regionFilter = prefix;
      }
    }
  }
  if (buildingName) queryParts.push(buildingName);

  if (queryParts.length === 0) return "";

  const query = queryParts.join(" ");
  const docs = await searchSimilarIMs(supabase, query, {
    topK: 5,
    filterByAssetType: assetType,
    filterByRegion: regionFilter,
    filterByPosture: posture,
    excludeBuildingName: buildingName,
  });

  if (docs.length === 0) return "";

  return docs.map((d, i) => `[유사사례 ${i + 1}] ${d.content}`).join("\n\n");
}
