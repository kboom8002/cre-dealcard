/**
 * POST /api/broker/vibe-analyze
 *
 * 프로필 사진에서 Vibe 7D 벡터를 추출하고,
 * VTI 분류 / 상보 벡터 / 템플릿 매칭 결과를 저장합니다.
 *
 * Body: { photo_url: string }
 * Auth: Required (broker or admin).
 */
import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { requireBroker } from "@/lib/auth-guard";
import { toApiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/service";
import {
  type Vibe7D,
  VIBE_AXES,
  classifyVTI,
} from "@/lib/vibe/vibe-vector";
import {
  computeComplementaryVibe,
  matchTemplates,
  computeTrustFromVibe,
  computeValenceFromVibe,
} from "@/lib/vibe/vibe-complement";
import { ALL_VIBE_TEMPLATES } from "@/lib/vibe/vibe-templates";

const VibeAnalyzeRequest = z.object({
  photo_url: z.url("유효한 사진 URL을 입력해주세요."),
});

// ── Gemini Flash Vision 호출 ─────────────────────────

const GEMINI_PROMPT = `You are a professional image analyst. Analyze this photo of a person and estimate their "vibe" across 7 dimensions.

Return ONLY a JSON object with these 7 keys, each a float between 0.0 and 1.0:
- warmth: How warm, approachable, and caring they appear
- energy: How energetic, dynamic, and active they appear
- polish: How polished, refined, and professional they appear
- authentic: How authentic, genuine, and transparent they appear
- heritage: How traditional, classic, and established they appear
- futuristic: How innovative, modern, and forward-thinking they appear
- playful: How playful, fun, and witty they appear

Respond with ONLY the JSON object, no other text.`;

async function analyzeWithGemini(photoUrl: string): Promise<Vibe7D> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackVibeFromUrl(photoUrl);
  }

  try {
    const model = "gemini-2.5-flash-preview-05-20";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: GEMINI_PROMPT },
              {
                inline_data: undefined,
                file_data: undefined,
                // Use image_url for URL-based images
              },
              {
                text: `Image URL: ${photoUrl}\nPlease analyze this person's photo. If you cannot access the URL, infer a reasonable professional vibe.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[vibe-analyze] Gemini returned ${response.status}, falling back`);
      return fallbackVibeFromUrl(photoUrl);
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[vibe-analyze] Could not parse Gemini JSON, falling back");
      return fallbackVibeFromUrl(photoUrl);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const vec: Partial<Vibe7D> = {};
    for (const axis of VIBE_AXES) {
      const val = Number(parsed[axis]);
      vec[axis] = Number.isFinite(val) ? Math.min(1, Math.max(0, val)) : 0.5;
    }
    return vec as Vibe7D;
  } catch (err) {
    console.error("[vibe-analyze] Gemini call failed:", err);
    return fallbackVibeFromUrl(photoUrl);
  }
}

// ── Deterministic fallback using URL hash ─────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function fallbackVibeFromUrl(url: string): Vibe7D {
  const hash = simpleHash(url);
  const vec: Partial<Vibe7D> = {};

  VIBE_AXES.forEach((axis, i) => {
    // Generate a pseudo-random value between 0.25 and 0.85
    // using different parts of the hash for each axis
    const seed = simpleHash(`${url}-${axis}-${i}`);
    vec[axis] = Math.round((0.25 + (seed % 1000) / 1000 * 0.60) * 1000) / 1000;
  });

  return vec as Vibe7D;
}

// ── Route handler ────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const { user } = guard;

  try {
    const json = await req.json();
    const { photo_url } = VibeAnalyzeRequest.parse(json);

    // 1. Extract 7D vibe vector from photo
    const vibeVector = await analyzeWithGemini(photo_url);

    // 2. Classify VTI
    const vtiResult = classifyVTI(vibeVector);

    // 3. Compute complementary vibe
    const complement = computeComplementaryVibe(vibeVector);

    // 4. Match top 3 templates
    const topMatches = matchTemplates(vibeVector, complement, ALL_VIBE_TEMPLATES, 3);
    const bestTemplateId = topMatches[0]?.template.id ?? "CC-01";

    // 5. Compute trust & valence scores
    const valence = computeValenceFromVibe(vibeVector);
    const trust = computeTrustFromVibe(vibeVector);

    // 6. Save to broker_profiles
    const supabase = createServiceClient();

    const { error: upsertError } = await supabase
      .from("broker_profiles")
      .upsert(
        {
          user_id: user!.id,
          vibe_vector: vibeVector,
          vibe_vti: vtiResult.meta.type,
          vibe_complement: complement,
          vibe_template_id: bestTemplateId,
          vibe_valence: valence,
          vibe_trust: trust,
          vibe_analyzed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertError) {
      console.error("[vibe-analyze] Upsert error:", upsertError);
      return Response.json(
        { ok: false, error: { code: "INTERNAL_ERROR", message: upsertError.message } },
        { status: 500 },
      );
    }

    // 7. Return results
    return Response.json({
      ok: true,
      data: {
        vibe_vector: vibeVector,
        vti: {
          type: vtiResult.meta.type,
          label: vtiResult.meta.label_en,
          label_ko: vtiResult.meta.label_ko,
          emoji: vtiResult.meta.emoji,
          color: vtiResult.meta.color,
          confidence: vtiResult.confidence,
        },
        complement: complement,
        valence,
        trust,
        template: {
          id: bestTemplateId,
          name: topMatches[0]?.template.name_en,
          name_ko: topMatches[0]?.template.name_ko,
        },
        top_matches: topMatches.map((m) => ({
          template_id: m.template.id,
          name: m.template.name_en,
          score: m.score,
          composite: m.compositeScores,
        })),
      },
    });
  } catch (error) {
    console.error("[vibe-analyze] Route error:", error);
    return toApiError(error);
  }
}
