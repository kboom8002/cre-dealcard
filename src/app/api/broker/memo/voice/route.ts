import { NextRequest, NextResponse } from "next/server";
import { requireBroker } from "@/lib/auth-guard";
import { enforceBrokerAiQuota } from "@/lib/ai-quota-guard";
import OpenAI from "openai";

import { createModuleLogger } from '@/lib/logger';
const log = createModuleLogger('route');

export const maxDuration = 60;

// Vercel Serverless 4.5 MB request gateway safety cap (4.4 MB)
const MAX_AUDIO_BYTES = Math.floor(4.4 * 1024 * 1024);
const MULTIPART_ENVELOPE_ALLOWANCE_BYTES = 4096;

export async function POST(req: NextRequest) {
  const guard = await requireBroker(req);
  if (guard.error) return guard.error;
  const userId = guard.user?.id ?? "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_AUDIO_BYTES + MULTIPART_ENVELOPE_ALLOWANCE_BYTES
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "PAYLOAD_TOO_LARGE",
        error: "음성 파일 크기는 4.4MB 이하여야 합니다.",
      },
      { status: 413 },
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Audio file is required" }, { status: 400 });
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          code: "PAYLOAD_TOO_LARGE",
          error: "음성 파일 크기는 4.4MB 이하여야 합니다.",
        },
        { status: 413 },
      );
    }

    const quotaErr = await enforceBrokerAiQuota(req, userId, "memo_voice");
    if (quotaErr) return quotaErr;

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey || apiKey === "mock_key" || apiKey === "not-configured") {
      return NextResponse.json(
        { ok: false, error: "AI 음성 인식 서비스가 설정되어 있지 않습니다." },
        { status: 503 },
      );
    }

    const openai = new OpenAI({ apiKey });

    // Blob -> File 변환 (OpenAI 라이브러리가 요구하는 형태)
    // Next.js App Router의 Request는 웹 표준 File 객체를 지원함
    const file = new File([audioFile], "memo.webm", { type: audioFile.type });

    // Whisper API 호출
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "ko", // 한국어 강제
      prompt: "부동산 중개인의 메모입니다. 매각가, 층수, 임대료, 매수자, 임차인, 사옥, 예산 등의 용어가 등장합니다.",
    });

    const text = transcription.text;

    return NextResponse.json({
      ok: true,
      data: {
        text
      }
    });

  } catch (error) {
    log.error("Voice API Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
