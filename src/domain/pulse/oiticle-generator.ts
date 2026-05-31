/**
 * Oiticle Generator — CRE 인사이트 롱폼 콘텐츠 자동 생성
 *
 * LLM API 호출로 8유형 오이티클 초안을 생성.
 * 중개인/벤더 기고도 지원 (author_type: broker | vendor).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OITICLE_TYPES,
  generateOiticleSlug,
  type OiticleTypeCode,
  type OiticleAuthorType,
} from "./oiticle-types";
import { callLLM as centralCallLLM } from "@/ai/llm-client";

// ── LLM 호출 (pulse-generator와 동일 패턴) ─────────────────────
async function callLLM(prompt: string): Promise<string> {
  try {
    const result = await centralCallLLM({
      systemPrompt: "당신은 한국 상업용 부동산 시장 분석가이며, 유능한 콘텐츠 에디터입니다.",
      userPrompt: prompt,
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 4096,
    });
    return result.content;
  } catch (e) {
    console.error("[OiticleGenerator] LLM call failed:", e);
    return "LLM 호출 중 오류가 발생하여 콘텐츠를 생성할 수 없습니다.";
  }
}

// ── 메타데이터 추출 프롬프트 ────────────────────────────────────
function buildMetaPrompt(body: string, title: string): string {
  return `다음 글에서 SEO 메타데이터를 JSON으로 추출하세요:

제목: ${title}
본문 (첫 500자): ${body.slice(0, 500)}

출력 형식:
{
  "excerpt": "150자 이내 요약",
  "seoTitle": "60자 이내 SEO 제목",
  "seoDescription": "160자 이내 메타 설명",
  "tags": ["태그1", "태그2", "태그3"]
}`;
}

// ── 오이티클 생성 인터페이스 ─────────────────────────────────────
export interface GenerateOiticleInput {
  type: OiticleTypeCode;
  topic?: string;              // LG, TX 등 주제 기반 유형용
  region?: string;
  dataSnapshot?: Record<string, unknown>;
  sourcePulseId?: string;

  // 기고자 정보 (broker/vendor 기고 시)
  authorType?: OiticleAuthorType;
  authorId?: string;
  authorName?: string;

  // 직접 작성 본문 (기고 시)
  manualBody?: string;
  manualTitle?: string;
}

export interface GenerateOiticleResult {
  id: string;
  slug: string;
  title: string;
  status: string;
}

// ── 메인 생성 함수 ──────────────────────────────────────────────
export async function generateOiticle(
  supabase: SupabaseClient,
  input: GenerateOiticleInput,
): Promise<GenerateOiticleResult> {
  const typeDef = OITICLE_TYPES[input.type];
  if (!typeDef) throw new Error(`Unknown oiticle type: ${input.type}`);

  let title: string;
  let bodyMd: string;
  let excerpt: string;
  let seoTitle: string;
  let seoDescription: string;
  let tags: string[] = [];

  if (input.manualBody && input.manualTitle) {
    // ── 중개인/벤더 직접 기고 ──────────────────────────────
    title = input.manualTitle;
    bodyMd = input.manualBody;

    // LLM으로 메타데이터만 추출
    const metaPrompt = buildMetaPrompt(bodyMd, title);
    try {
      const metaRaw = await callLLM(metaPrompt);
      const metaJson = JSON.parse(metaRaw);
      excerpt = metaJson.excerpt ?? bodyMd.slice(0, 150);
      seoTitle = metaJson.seoTitle ?? title;
      seoDescription = metaJson.seoDescription ?? excerpt;
      tags = metaJson.tags ?? [];
    } catch {
      excerpt = bodyMd.slice(0, 150);
      seoTitle = title;
      seoDescription = excerpt;
    }
  } else {
    // ── AI 자동 생성 ──────────────────────────────────────
    const prompt = typeDef.promptTemplate
      .replace("{{region}}", input.region ?? "전체")
      .replace("{{period}}", new Date().toISOString().slice(0, 7))
      .replace("{{topic}}", input.topic ?? typeDef.description)
      .replace("{{dataSnapshot}}", JSON.stringify(input.dataSnapshot ?? {}, null, 2));

    const fullPrompt = `${prompt}

추가 지침:
- 첫 줄에 "# 제목"을 마크다운 H1으로 작성
- 마지막에 "---" 구분선 후 면책 조항 포함
- 한국어로 작성`;

    bodyMd = await callLLM(fullPrompt);

    // 제목 추출
    const h1Match = bodyMd.match(/^#\s+(.+)$/m);
    title = h1Match?.[1] ?? `${typeDef.emoji} ${typeDef.label}`;

    // 메타데이터 추출
    try {
      const metaPrompt = buildMetaPrompt(bodyMd, title);
      const metaRaw = await callLLM(metaPrompt);
      const metaJson = JSON.parse(metaRaw);
      excerpt = metaJson.excerpt ?? bodyMd.slice(0, 150);
      seoTitle = metaJson.seoTitle ?? title;
      seoDescription = metaJson.seoDescription ?? excerpt;
      tags = metaJson.tags ?? typeDef.seoKeywords;
    } catch {
      excerpt = bodyMd.replace(/^#.+\n/, "").trim().slice(0, 150);
      seoTitle = title;
      seoDescription = excerpt;
      tags = typeDef.seoKeywords;
    }
  }

  const slug = generateOiticleSlug(input.type, title, input.region);

  // 작성자 정보
  const authorType = input.authorType ?? "ai";
  const authorName = input.authorName ?? "DealCard AI";
  const authorId = input.authorId ?? null;

  // 기고 콘텐츠는 review 상태, AI 생성은 draft
  const status = authorType === "ai" ? "draft" : "review";

  const { data, error } = await supabase
    .from("cre_oiticles")
    .insert({
      oiticle_type: input.type,
      title,
      slug,
      excerpt,
      body_md: bodyMd,
      author_type: authorType,
      author_id: authorId,
      author_name: authorName,
      regions: input.region ? [input.region] : [],
      tags,
      source_pulse_id: input.sourcePulseId ?? null,
      data_snapshot: input.dataSnapshot ?? {},
      seo_title: seoTitle,
      seo_description: seoDescription,
      status,
    })
    .select("id, slug, title, status")
    .single();

  if (error) throw new Error(`[OiticleGenerator] Save failed: ${error.message}`);

  return data;
}

/** 월간 시세 분석 오이티클 일괄 생성 (8개 권역) */
export async function generateMonthlyMarketOiticles(
  supabase: SupabaseClient,
): Promise<GenerateOiticleResult[]> {
  const REGIONS = ["gbd", "ybd", "cbd", "seongsu", "pangyo", "mapo", "jongno", "hongdae"];
  const results: GenerateOiticleResult[] = [];

  for (const region of REGIONS) {
    // 최신 펄스 데이터 가져오기
    const { data: pulse } = await supabase
      .from("cre_pulses")
      .select("id, signals, pulse_score, trend")
      .eq("region", region)
      .eq("period_type", "weekly")
      .order("created_at", { ascending: false })
      .limit(4);

    const dataSnapshot = {
      recentPulses: pulse ?? [],
      month: new Date().toISOString().slice(0, 7),
    };

    try {
      const result = await generateOiticle(supabase, {
        type: "MA",
        region,
        dataSnapshot,
        sourcePulseId: pulse?.[0]?.id,
      });
      results.push(result);
    } catch (e) {
      console.error(`[OiticleGenerator] MA for ${region} failed:`, e);
    }
  }

  return results;
}
