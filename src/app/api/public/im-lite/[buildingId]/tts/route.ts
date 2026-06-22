/**
 * /api/public/im-lite/[buildingId]/tts
 *
 * GPT-5.4로 지능형 브리핑 스크립트 생성 → OpenAI TTS-1-HD 음성 변환.
 * 1~2분 내외의 한국어 투자 브리핑 음성을 audio/mpeg로 반환합니다.
 *
 * Pipeline: IM 섹션 마크다운 → GPT-5.4 스크립트 → TTS-1-HD → MP3
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDemoMobileIM, type MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";

// ─── Cache ─────────────────────────────────────────────────────────
const audioCache = new Map<string, { buffer: Buffer; createdAt: number }>();
const scriptCache = new Map<string, { script: string; createdAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

// ─── LLM 기반 브리핑 스크립트 생성 ─────────────────────────────────
const BRIEFING_SYSTEM_PROMPT = `당신은 상업용 부동산(CRE) 전문 투자 브리핑 아나운서입니다.
투자설명서(IM) 데이터를 기반으로, 투자자가 차 안에서 듣기 좋은 자연스럽고 전문적인 음성 브리핑 스크립트를 작성합니다.

## 스크립트 작성 규칙

1. **톤**: 전문적이되 친근한 존경체(~합니다, ~입니다). 뉴스 앵커 스타일.
2. **구조**: 아래 순서를 따르되, 데이터가 없는 섹션은 자연스럽게 건너뛰세요.
   - 인트로 (매물 핵심 한 줄 요약 + 중개인 소개)
   - 물건 개요 (규모, 준공, 핵심 사양)
   - 입지/상권 (역세권, 상권 특성 — 데이터 있는 경우만)
   - 임대 현황 (공실률, WALT, 주요 임차인)
   - 수익 분석 (NOI, Cap Rate, IRR — 수치가 있는 경우만)
   - 리스크/확인사항 (상위 2~3건만 간결히)
   - 투자 포인트 (핵심 매력 2~3가지)
   - 클로징 (다음 단계 안내)
3. **분량**: 700~1000자 (읽으면 약 1분~1분30초)
4. **금지사항**:
   - 마크다운 기호(**, ##, |, -) 사용 금지 — 순수 읽기 텍스트만
   - "섹션", "테이블", "표" 같은 문서 용어 사용 금지
   - 데이터가 없거나 "확인 필요"인 항목을 억지로 채우지 마세요
   - 주소, 건물명 등 블라인드 처리된 정보는 노출하지 마세요
5. **숫자 읽기**: "5.2%"→"5.2퍼센트", "15억"→"15억원", "WALT"→"왈트"
6. **자연스러운 전환**: "다음으로", "한편", "수익 측면에서 보면" 등 연결어 활용`;

async function generateBriefingScriptWithLLM(
  openai: OpenAI,
  doc: MobileIMDocument,
): Promise<string> {
  // 캐시 확인
  const cached = scriptCache.get(doc.buildingId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return cached.script;
  }

  // 섹션 데이터를 구조화
  const sectionsText = doc.sections
    .filter((s) => !s.locked)
    .map((s) => {
      const content = s.content.trim();
      if (!content || content === "데이터 없음") return null;
      return `### ${s.title}\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");

  const userPrompt = `아래는 "${doc.areaSignal} ${doc.assetType}" 매물의 투자설명서(IM) 데이터입니다.
이 데이터를 기반으로 음성 브리핑 스크립트를 작성해 주세요.

**매물 기본 정보:**
- 권역: ${doc.areaSignal}
- 자산 유형: ${doc.assetType}
- 매각 희망가: ${doc.priceBand}
- 규모: ${doc.sizeSignal}
- 담당 중개인: ${doc.broker.displayName} (${doc.broker.company})
- SSoT 완성도: ${doc.completenessScore}점/100점

**섹션별 상세 데이터:**

${sectionsText}

위 데이터를 기반으로, 투자자가 차 안에서 편하게 들을 수 있는 1분~1분30초 분량의 음성 브리핑 스크립트를 작성해 주세요.
데이터가 부족한 섹션은 건너뛰고, 확인된 데이터만으로 전문적인 브리핑을 구성하세요.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "system", content: BRIEFING_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 1500,
  });

  const script = response.choices[0]?.message?.content?.trim() ?? "";

  if (script.length > 50) {
    scriptCache.set(doc.buildingId, { script, createdAt: Date.now() });
  }

  return script;
}

// ─── 폴백: 정규식 기반 스크립트 (LLM 실패 시) ──────────────────────
function generateFallbackScript(doc: MobileIMDocument): string {
  const sections = doc.sections.filter((s) => !s.locked);
  const lines: string[] = [];

  lines.push(
    `안녕하세요. ${doc.areaSignal} 소재 ${doc.assetType}에 대한 투자 브리핑을 시작합니다.`,
  );
  lines.push(`이 매물의 매각 희망가는 ${doc.priceBand}이며, ${doc.sizeSignal} 규모입니다.`);

  for (const section of sections) {
    if (!section.content || section.content.length < 20) continue;
    const firstLine = section.content
      .split("\n")
      .find((l) => l.length > 15 && !l.startsWith("|") && !l.startsWith("#") && !l.startsWith("-"));
    if (firstLine) {
      const cleaned = firstLine.replace(/\*\*/g, "").replace(/[#>]/g, "").trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        lines.push(cleaned);
      }
    }
  }

  lines.push("이상 브리핑을 마치겠습니다.");
  lines.push(`담당 중개인 ${doc.broker.displayName}에게 직접 문의도 가능합니다. 감사합니다.`);

  return lines.filter((l) => l.length > 0).join(" ");
}

// ─── GET Handler ────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const { buildingId } = await params;

  // 1. 오디오 캐시 확인
  const cached = audioCache.get(buildingId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(cached.buffer.length),
        "Cache-Control": "public, max-age=3600",
        "X-TTS-Source": "cache",
      },
    });
  }

  // 2. IM 데이터 로드
  let doc: MobileIMDocument | null = getDemoMobileIM(buildingId) || null;

  if (!doc) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://credeal.net";
    try {
      const res = await fetch(`${baseUrl}/api/public/im-lite/${buildingId}`);
      if (res.ok) {
        const { data } = await res.json();
        doc = data as MobileIMDocument;
      }
    } catch {
      // Ignore fetch error
    }
  }

  if (!doc) {
    return NextResponse.json(
      { error: "Building not found or IM not generated" },
      { status: 404 },
    );
  }

  // 3. OpenAI 키 확인
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TTS service not configured" },
      { status: 503 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey });

    // 4. GPT-5.4로 브리핑 스크립트 생성 (실패 시 폴백)
    let script: string;
    let scriptSource = "gpt-5.4";
    try {
      script = await generateBriefingScriptWithLLM(openai, doc);
      if (!script || script.length < 50) {
        throw new Error("Script too short");
      }
    } catch (llmError) {
      console.warn("[TTS] LLM script generation failed, using fallback:", llmError);
      script = generateFallbackScript(doc);
      scriptSource = "fallback";
    }

    // 5. OpenAI TTS-1-HD로 음성 변환
    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: "nova",
      input: script,
      speed: 0.95,
      response_format: "mp3",
    });

    const arrayBuffer = await mp3.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    // 6. 캐시 저장
    audioCache.set(buildingId, { buffer, createdAt: Date.now() });

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=3600",
        "X-TTS-Source": "generated",
        "X-TTS-Script-Source": scriptSource,
        "X-TTS-Script-Length": String(script.length),
      },
    });
  } catch (error) {
    console.error("[TTS] Error generating speech:", error);
    return NextResponse.json(
      { error: "Failed to generate voice briefing" },
      { status: 500 },
    );
  }
}
