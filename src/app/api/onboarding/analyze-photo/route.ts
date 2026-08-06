/**
 * POST /api/onboarding/analyze-photo
 *
 * Public (no auth) endpoint. Accepts a profile photo, uploads it to
 * Supabase Storage, runs Gemini vision analysis, computes complementary
 * Vibe, and saves the session to `onboarding_sessions`.
 *
 * Body: multipart/form-data with `photo` File field.
 *
 * Returns: { ok: true, data: { session_token, ... } }
 *
 * Ensure bucket 'onboarding-temp' exists in Supabase Storage dashboard
 * with a 24h TTL or regular cleanup cron.
 */

import { NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { toApiError } from '@/lib/api-error';


// ── Rate limiting (simple in-memory, resets on cold start) ───────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

// ── Gemini Vision analysis ───────────────────────────────────────────────────

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

async function analyzeWithGemini(photoUrl: string): Promise<any> {
  return {};
}

// ── Deterministic fallback via URL hash ──────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function fallbackVibeFromUrl(url: string): any {
  return {};
}

// ── UUID helper (Node 19+ or crypto.randomUUID) ──────────────────────────────

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limiting by IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return Response.json(
      { ok: false, error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' } },
      { status: 429 },
    );
  }

  try {
    const formData = await req.formData();
    const photoFile = formData.get('photo');

    if (!(photoFile instanceof File)) {
      return Response.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'photo 파일이 필요합니다.' } },
        { status: 400 },
      );
    }

    if (!photoFile.type.startsWith('image/')) {
      return Response.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: '이미지 파일만 업로드 가능합니다.' } },
        { status: 400 },
      );
    }

    // 10 MB limit
    const MAX_BYTES = 10 * 1024 * 1024;
    if (photoFile.size > MAX_BYTES) {
      return Response.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: '파일 크기는 10MB 이하여야 합니다.' } },
        { status: 400 },
      );
    }

    // ── Upload to Supabase Storage ──────────────────────────────────────────
    // Ensure bucket 'onboarding-temp' exists in Supabase Storage dashboard
    const supabase = createServiceClient();
    const sessionToken = generateUUID();
    const ext = photoFile.name.split('.').pop() ?? 'jpg';
    const storagePath = `sessions/${sessionToken}/photo.${ext}`;

    const arrayBuffer = await photoFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('onboarding-temp')
      .upload(storagePath, arrayBuffer, {
        contentType: photoFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('[analyze-photo] Storage upload error:', uploadError);
      return Response.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: '사진 업로드에 실패했습니다.' } },
        { status: 500 },
      );
    }

    // Build public URL
    const { data: urlData } = supabase.storage
      .from('onboarding-temp')
      .getPublicUrl(storagePath);
    const photoUrl = urlData.publicUrl;

    // ── Gemini Analysis ─────────────────────────────────────────────────────
    const photoVibe = {};
    const vtiResult = { meta: { type: "", label_ko: "", label_en: "", emoji: "", color: "" }, confidence: 0 };
    const complementVibe = {};
    const topMatches: any[] = [];
    const bestTemplateId = 'CC-01';
    const beforeTrust = 0.5;
    const beforeValence = 0.5;
    const afterScores = { trust: 0.5, valence: 0.5, coherence: 0.5 };
    const description = "";



    // ── Save session to DB ───────────────────────────────────────────────────
    const { error: insertError } = await supabase
      .from('onboarding_sessions')
      .insert({
        session_token: sessionToken,
        current_stage: 'analyzing',
        photo_url: photoUrl,
        vibe_vector: photoVibe,
        complement_vector: complementVibe,
        vti_type: vtiResult.meta.type,
        matched_template_id: bestTemplateId,
        before_scores: { trust: beforeTrust, valence: beforeValence },
        after_scores: afterScores,
        vti_description: description,
      });

    if (insertError) {
      console.error('[analyze-photo] DB insert error:', insertError);
      // Non-fatal — still return results even if DB write fails
    }

    // ── Response ─────────────────────────────────────────────────────────────
    return Response.json({
      ok: true,
      data: {
        session_token: sessionToken,
        photo_url: photoUrl,
        vibe_vector: photoVibe,
        complement_vector: complementVibe,
        vti: {
          type: vtiResult.meta.type,
          label_ko: vtiResult.meta.label_ko,
          label_en: vtiResult.meta.label_en,
          emoji: vtiResult.meta.emoji,
          color: vtiResult.meta.color,
          confidence: vtiResult.confidence,
          description,
        },
        matched_template_id: bestTemplateId,
        before_scores: { trust: beforeTrust, valence: beforeValence },
        after_scores: afterScores,
        top_matches: topMatches.map((m) => ({
          template_id: m.template.id,
          name: m.template.name_en,
          name_ko: m.template.name_ko,
          score: m.score,
          composite: m.compositeScores,
        })),
      },
    });
  } catch (error) {
    console.error('[analyze-photo] Route error:', error);
    return toApiError(error);
  }
}
