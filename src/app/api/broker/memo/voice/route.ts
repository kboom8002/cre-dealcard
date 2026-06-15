import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import OpenAI from "openai";

// Edge runtime is not fully supported for node's FormData with fetch to OpenAI in some older setups,
// but for standard App Router API, we can use nodejs runtime.
// If needed, export const runtime = "edge";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Audio file is required" }, { status: 400 });
    }

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
    console.error("Voice API Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
