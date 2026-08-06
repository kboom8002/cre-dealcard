/**
 * Vibe 분석 공유 로직
 * API 라우트와 카드 생성 등에서 재사용
 */
import { createServiceClient } from "@/lib/supabase/service";
import { type Vibe7D, VIBE_AXES, classifyVTI } from "@/lib/vibe/vibe-vector";
import {
  computeComplementaryVibe,
  matchTemplates,
  computeTrustFromVibe,
  computeValenceFromVibe,
} from "@/lib/vibe/vibe-complement";
import { ALL_VIBE_TEMPLATES } from "@/lib/vibe/vibe-templates";

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

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function fallbackVibeFromUrl(url: string): Vibe7D {
  const vec: Partial<Vibe7D> = {};
  VIBE_AXES.forEach((axis, i) => {
    const seed = simpleHash(`${url}-${axis}-${i}`);
    vec[axis] = Math.round((0.25 + (seed % 1000) / 1000 * 0.60) * 1000) / 1000;
  });
  return vec as Vibe7D;
}

async function analyzeWithGemini(photoUrl: string): Promise<Vibe7D> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackVibeFromUrl(photoUrl);

  try {
    let base64 = "";
    let mimeType = "image/jpeg";
    try {
      const imgRes = await fetch(photoUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        base64 = Buffer.from(buffer).toString("base64");
        mimeType = imgRes.headers.get("content-type") || "image/jpeg";
      }
    } catch { /* ignore */ }

    if (!base64) return fallbackVibeFromUrl(photoUrl);

    const model = "gemini-2.5-flash-preview-05-20";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 256, responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) return fallbackVibeFromUrl(photoUrl);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackVibeFromUrl(photoUrl);

    const parsed = JSON.parse(jsonMatch[0]);
    const vec: Partial<Vibe7D> = {};
    for (const axis of VIBE_AXES) {
      const val = Number(parsed[axis]);
      vec[axis] = Number.isFinite(val) ? Math.min(1, Math.max(0, val)) : 0.5;
    }
    return vec as Vibe7D;
  } catch {
    return fallbackVibeFromUrl(photoUrl);
  }
}

/**
 * 브로커 사진에서 Vibe 7D 벡터를 추출하고 broker_profiles에 저장
 */
export async function runVibeAnalysis(userId: string, photoUrl: string): Promise<void> {
  const vibeVector = await analyzeWithGemini(photoUrl);
  const vtiResult = classifyVTI(vibeVector);
  const complement = computeComplementaryVibe(vibeVector);
  const topMatches = matchTemplates(vibeVector, complement, ALL_VIBE_TEMPLATES, 3);
  const bestTemplateId = topMatches[0]?.template.id ?? "CC-01";
  const valence = computeValenceFromVibe(vibeVector);
  const trust = computeTrustFromVibe(vibeVector);

  const supabase = createServiceClient();
  await supabase.from("broker_profiles").upsert(
    {
      user_id: userId,
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
}
