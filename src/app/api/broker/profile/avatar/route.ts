/**
 * POST /api/broker/profile/avatar
 *
 * 브로커 프로필 사진 업로드.
 * - broker-avatars 버킷에 업로드
 * - profiles.photo_url 동기화 (Vibe Card에서 읽는 컬럼)
 * - broker_profiles.avatar_url 동기화
 * - (선택) Vibe AI 재분석 비동기 트리거
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  try {
    const guard = await requireBroker(req);
    if (guard.error) return guard.error;
    const { user } = guard;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use user id and original extension
    const ext = file.name.split('.').pop() || 'png';
    const filename = `${user!.id}/avatar-${Date.now()}.${ext}`;

    // Upload to 'broker-avatars' bucket
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from("broker-avatars")
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[Avatar Upload Error]", uploadError);
      return NextResponse.json({ error: "업로드에 실패했습니다. (버킷이 존재하지 않을 수 있습니다.)" }, { status: 500 });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase
      .storage
      .from("broker-avatars")
      .getPublicUrl(filename);

    // ─── Fix #1: profiles.photo_url 동기화 ───────────────────
    // Vibe Card (/vibe-card/[slug])가 profiles.photo_url을 읽으므로 반드시 동기화
    const { error: profileSyncError } = await supabase
      .from("profiles")
      .update({ photo_url: publicUrl })
      .eq("id", user!.id);

    if (profileSyncError) {
      console.warn("[Avatar] profiles.photo_url sync failed:", profileSyncError.message);
      // 비치명적 — 업로드 자체는 성공했으므로 계속 진행
    }

    // ─── Fix #2: broker_profiles.photo_url도 즉시 동기화 ────
    const { error: bpSyncError } = await supabase
      .from("broker_profiles")
      .upsert(
        { user_id: user!.id, photo_url: publicUrl },
        { onConflict: "user_id" }
      );

    if (bpSyncError) {
      console.warn("[Avatar] broker_profiles.photo_url sync failed:", bpSyncError.message);
    }

    // ─── Fix #3: Vibe AI 재분석 비동기 트리거 ────────────────
    // 사진이 변경되었으므로 기존 vibe 분석 결과를 무효화하고 재분석 유도
    // 비동기로 실행 (응답을 블로킹하지 않음)
    triggerVibeReanalysis(user!.id, publicUrl).catch((err) => {
      console.warn("[Avatar] Vibe re-analysis trigger failed:", err);
    });

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error("[POST /api/broker/profile/avatar]", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 사진 변경 시 Vibe AI 재분석을 비동기로 트리거합니다.
 * vibe-analyze API를 내부 호출하지 않고, 직접 분석 로직을 인라인 실행합니다.
 */
async function triggerVibeReanalysis(userId: string, photoUrl: string) {
  try {
    // Dynamic import to avoid circular dependency
    const { VIBE_AXES, classifyVTI } = await import("@/lib/vibe/vibe-vector");
    const {
      computeComplementaryVibe,
      matchTemplates,
      computeTrustFromVibe,
      computeValenceFromVibe,
    } = await import("@/lib/vibe/vibe-complement");
    const { ALL_VIBE_TEMPLATES } = await import("@/lib/vibe/vibe-templates");

    // Gemini Flash Vision 호출 (환경변수 없으면 deterministic fallback)
    const apiKey = process.env.GEMINI_API_KEY;
    let vibeVector: Record<string, number>;

    if (apiKey) {
      try {
        // 사진 다운로드
        const imgRes = await fetch(photoUrl);
        if (!imgRes.ok) throw new Error("Image fetch failed");
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

        const model = "gemini-2.5-flash-preview-05-20";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const prompt = `You are a professional image analyst. Analyze this photo of a person and estimate their "vibe" across 7 dimensions. Return ONLY a JSON object with keys: warmth, energy, polish, authentic, heritage, futuristic, playful — each a float between 0.0 and 1.0.`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ]}],
            generationConfig: { temperature: 0.3, maxOutputTokens: 256, responseMimeType: "application/json" },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            vibeVector = {} as any;
            for (const axis of VIBE_AXES) {
              const val = Number(parsed[axis]);
              (vibeVector as any)[axis] = Number.isFinite(val) ? Math.min(1, Math.max(0, val)) : 0.5;
            }
          } else {
            throw new Error("Gemini JSON parse failed");
          }
        } else {
          throw new Error(`Gemini ${response.status}`);
        }
      } catch (geminiErr) {
        console.warn("[Vibe Re-analysis] Gemini failed, using URL hash fallback:", geminiErr);
        vibeVector = urlHashFallback(photoUrl, VIBE_AXES);
      }
    } else {
      vibeVector = urlHashFallback(photoUrl, VIBE_AXES);
    }

    // VTI 분류 + 상보 벡터 + 템플릿 매칭
    const vtiResult = classifyVTI(vibeVector as any);
    const complement = computeComplementaryVibe(vibeVector as any);
    const topMatches = matchTemplates(vibeVector as any, complement, ALL_VIBE_TEMPLATES, 3);
    const bestTemplateId = topMatches[0]?.template.id ?? "CC-01";
    const valence = computeValenceFromVibe(vibeVector as any);
    const trust = computeTrustFromVibe(vibeVector as any);

    // DB 업데이트
    const supabase = (await import("@/lib/supabase/service")).createServiceClient();
    await supabase
      .from("broker_profiles")
      .upsert({
        user_id: userId,
        vibe_vector: vibeVector,
        vibe_vti: vtiResult.meta.type,
        vibe_complement: complement,
        vibe_template_id: bestTemplateId,
        vibe_valence: valence,
        vibe_trust: trust,
        vibe_analyzed_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    console.log(`[Vibe Re-analysis] Completed for user ${userId}: VTI=${vtiResult.meta.type}, template=${bestTemplateId}`);
  } catch (err) {
    console.error("[Vibe Re-analysis] Failed:", err);
    throw err;
  }
}

function urlHashFallback(url: string, axes: readonly string[]): Record<string, number> {
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return Math.abs(h);
  };
  const vec: Record<string, number> = {};
  axes.forEach((axis, i) => {
    const seed = hash(`${url}-${axis}-${i}`);
    vec[axis] = Math.round((0.25 + (seed % 1000) / 1000 * 0.60) * 1000) / 1000;
  });
  return vec;
}
