/**
 * @file src/app/api/broker/rent-roll/vision-ocr/route.ts
 * @description Authenticated OpenAI Vision (`gpt-4o`) endpoint for structured rent-roll OCR extraction.
 * Never fabricates rows: returns 503 when OPENAI_API_KEY is unconfigured or mock.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireBroker } from '@/lib/auth-guard';
import { checkRateLimit } from '@/lib/rate-limiter';
import {
  extractRentRollWithOpenAiVision,
  isVisionOcrApiKeyConfigured,
  validateVisionImageDataUrl,
} from '@/lib/rent-roll/vision-ocr';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DISABLED_OCR_MESSAGE =
  '렌트롤 사진 AI 인식이 현재 비활성화되어 있습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.';

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) {
    return guard.error;
  }

  const allowed = await checkRateLimit(guard.user!.id, 'vision_ocr', 10, 60_000);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: '잘못된 요청 본문(JSON)입니다.' },
      { status: 400 }
    );
  }

  const validation = validateVisionImageDataUrl(body?.imageDataUrl);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: validation.status }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!isVisionOcrApiKeyConfigured(apiKey)) {
    return NextResponse.json(
      { ok: false, error: DISABLED_OCR_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const rows = await extractRentRollWithOpenAiVision(
      validation.normalizedDataUrl,
      apiKey!.trim()
    );
    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          '렌트롤 사진 AI 인식 처리 중 오류가 발생했습니다. 엑셀 업로드 또는 표 붙여넣기를 이용해주세요.',
      },
      { status: 502 }
    );
  }
}
