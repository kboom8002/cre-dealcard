/**
 * /api/public/im-lite/[buildingId]/tts
 *
 * 지능형 브리핑 스크립트 생성 → OpenAI TTS-1-HD 음성 변환.
 * 1~2분 내외의 투자 브리핑 음성을 audio/mpeg로 반환합니다.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDemoMobileIM, type MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";
import { createModuleLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getClientIp } from "@/lib/magazine/public-guard";
import {
  verifyShareLinkToken,
  isBuildingShareLinkRevoked,
} from "@/lib/security/share-link-tokens";
import { getInboxState } from "@/lib/im-lite/quick-generate-store";

const log = createModuleLogger("im-lite-tts-route");

const ALLOWED_LANGUAGES = new Set(["ko", "en", "ja", "zh"]);
const SAFE_BUILDING_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const VOICE_MAP: Record<string, string> = {
  ko: "nova",
  en: "alloy",
  zh: "echo",
  ja: "shimmer",
};

// ─── LLM 기반 브리핑 스크립트 생성 ─────────────────────────────────
function getBriefingSystemPrompt(lang: string) {
  const langInstructions =
    lang === "ko"
      ? "한국어로 작성하세요."
      : lang === "en"
      ? "Write the briefing script in professional English."
      : lang === "zh"
      ? "用专业中文撰写简报稿。"
      : "日本語で専門的なブリーフィングスクリプトを書いてください。";

  return `당신은 상업용 부동산(CRE) 전문 투자 브리핑 아나운서입니다.
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
6. **자연스러운 전환**: "다음으로", "한편", "수익 측면에서 보면" 등 연결어 활용

**언어 지침**: ${langInstructions}`;
}

async function generateBriefingScriptWithLLM(
  openai: OpenAI,
  doc: MobileIMDocument,
  lang: string
): Promise<string> {
  const supabase = createServiceClient();
  try {
    const { data: cached } = await supabase
      .from("document_objects")
      .select("body, created_at")
      .eq("building_id", doc.buildingId)
      .eq("document_type", "tts_script")
      .eq("title", lang)
      .maybeSingle();

    if (cached?.body && typeof cached.body === "object" && "script" in cached.body) {
      const createdAt = new Date(cached.created_at).getTime();
      if (Date.now() - createdAt < 60 * 60 * 1000) {
        return (cached.body as Record<string, any>).script;
      }
    }
  } catch (err) {
    log.warn("[TTS] Script cache read failed:", err);
  }

  const sectionsText = (doc.sections || [])
    .filter((s) => !s.locked)
    .map((s) => {
      const content = (s.content ?? (s as any).markdown ?? "").trim();
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
- 담당 중개인: ${doc.broker?.displayName ?? "담당 중개인"} (${doc.broker?.company ?? ""})
- SSoT 완성도: ${doc.completenessScore}점/100점

**섹션별 상세 데이터:**

${sectionsText}

위 데이터를 기반으로, 투자자가 차 안에서 편하게 들을 수 있는 1분~1분30초 분량의 음성 브리핑 스크립트를 작성해 주세요.
데이터가 부족한 섹션은 건너뛰고, 확인된 데이터만으로 전문적인 브리핑을 구성하세요.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    messages: [
      { role: "system", content: getBriefingSystemPrompt(lang) },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 1500,
  });

  const script = response.choices[0]?.message?.content?.trim() ?? "";

  if (script.length > 50) {
    try {
      await supabase.from("document_objects").upsert(
        {
          building_id: doc.buildingId,
          document_type: "tts_script",
          title: lang,
          body: { script },
          created_at: new Date().toISOString(),
        },
        { onConflict: "building_id,document_type,title" }
      );
    } catch (err) {
      log.warn("[TTS] Script cache write failed:", err);
    }
  }

  return script;
}

// ─── 폴백: 정규식 기반 스크립트 (LLM 실패 시) ──────────────────────
function generateFallbackScript(doc: MobileIMDocument): string {
  const sections = (doc.sections || []).filter((s) => !s.locked);
  const lines: string[] = [];

  lines.push(
    `안녕하세요. ${doc.areaSignal} 소재 ${doc.assetType}에 대한 투자 브리핑을 시작합니다.`
  );
  lines.push(`이 매물의 매각 희망가는 ${doc.priceBand}이며, ${doc.sizeSignal} 규모입니다.`);

  for (const section of sections) {
    const rawContent = section.content ?? (section as any).markdown ?? "";
    if (!rawContent || rawContent.length < 20) continue;
    const firstLine = rawContent
      .split("\n")
      .find(
        (l: string) =>
          l.length > 15 && !l.startsWith("|") && !l.startsWith("#") && !l.startsWith("-")
      );
    if (firstLine) {
      const cleaned = firstLine.replace(/\*\*/g, "").replace(/[#>]/g, "").trim();
      if (cleaned.length > 10 && cleaned.length < 200) {
        lines.push(cleaned);
      }
    }
  }

  lines.push("이상 브리핑을 마치겠습니다.");
  lines.push(
    `담당 중개인 ${doc.broker?.displayName ?? "담당 중개인"}에게 직접 문의도 가능합니다. 감사합니다.`
  );

  return lines.filter((l) => l.length > 0).join(" ");
}

// ─── GET Handler ────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> }
) {
  try {
    // 1. Strict IP Rate Limiting (10 req / 10 min per IP)
    const ip = getClientIp(request) ?? "unknown";
    const isAllowed = await checkRateLimit(ip, "im_lite_tts", 10, 10 * 60 * 1000);
    if (!isAllowed) {
      return NextResponse.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
        { status: 429 }
      );
    }

    const { buildingId } = await params;
    if (!buildingId || !SAFE_BUILDING_ID_RE.test(buildingId)) {
      return NextResponse.json({ error: "Invalid buildingId" }, { status: 400 });
    }

    // 2. Validate ?language= strictly BEFORE constructing cacheKey (blocks cache-bypass cost amplification)
    const rawLang = request.nextUrl.searchParams.get("language");
    const lang = rawLang === null || rawLang === "" ? "ko" : rawLang.trim();
    if (!ALLOWED_LANGUAGES.has(lang)) {
      return NextResponse.json(
        { error: "Invalid language. Use: ko, en, ja, zh" },
        { status: 400 }
      );
    }

    // 3. Share-link token & building-level revocation guard
    const token = request.nextUrl.searchParams.get("token")?.trim() || null;
    if (token) {
      const tokenCheck = await verifyShareLinkToken({ token, buildingId });
      if (!tokenCheck.valid) {
        return NextResponse.json(
          {
            ok: false,
            error: "담당 중개인에 의해 회수되었거나 유효하지 않은 공유 링크입니다.",
          },
          { status: tokenCheck.reason === "revoked" ? 410 : 403 }
        );
      }
    }

    const inboxRevoked = getInboxState().revokedBuildings?.[buildingId]?.revoked;
    if (inboxRevoked || isBuildingShareLinkRevoked(buildingId)) {
      return NextResponse.json(
        { ok: false, error: "담당 중개인에 의해 회수된 공유 링크입니다." },
        { status: 410 }
      );
    }

    const supabase = createServiceClient();

    // Check DB governance revocation events when available
    try {
      const govQuery: any = supabase
        .from("activity_events")
        .select("event_type, entity_id, metadata, created_at")
        .in("event_type", ["link_revoked", "link_restored"])
        .order("created_at", { ascending: false })
        .limit(100);
      const govRes = await govQuery;
      if (Array.isArray(govRes?.data)) {
        for (const row of govRes.data) {
          const meta =
            row?.metadata && typeof row.metadata === "object"
              ? (row.metadata as Record<string, unknown>)
              : {};
          const evBldId = String(meta.building_id || row?.entity_id || "").trim();
          if (evBldId !== buildingId) continue;
          if (row.event_type === "link_revoked") {
            return NextResponse.json(
              { ok: false, error: "담당 중개인에 의해 회수된 공유 링크입니다." },
              { status: 410 }
            );
          }
          if (row.event_type === "link_restored") {
            break;
          }
        }
      }
    } catch {
      // Non-blocking if activity_events unavailable
    }

    // 4. Load published IM document BEFORE serving audio cache (prevents draft/revoked leakage via cache)
    let doc: MobileIMDocument | null = getDemoMobileIM(buildingId) || null;

    if (!doc) {
      try {
        const { data: dbDoc } = await supabase
          .from("document_objects")
          .select("body, title, status, document_type, building_id")
          .eq("building_id", buildingId)
          .eq("status", "published")
          .in("document_type", ["mobile_im", "im_lite", "im_lite_draft", "blind_teaser"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (
          dbDoc?.body &&
          dbDoc.status === "published" &&
          (!dbDoc.building_id || String(dbDoc.building_id) === buildingId)
        ) {
          if ((dbDoc.body as Record<string, unknown>).is_revoked === true) {
            return NextResponse.json(
              { ok: false, error: "담당 중개인에 의해 회수된 공유 링크입니다." },
              { status: 410 }
            );
          }
          doc = dbDoc.body as MobileIMDocument;
          if (!doc.buildingId) {
            doc = { ...doc, buildingId };
          }
        }
      } catch {
        // DB query failure falls through to 404 below
      }
    }

    if (!doc) {
      return NextResponse.json(
        { error: "Building not found or IM not generated" },
        { status: 404 }
      );
    }

    const voice = VOICE_MAP[lang] || "nova";
    const cacheKey = `${buildingId}_${lang}`;
    const BUCKET_NAME = "tts-cache";
    const FILE_NAME = `${cacheKey}.mp3`;

    // 5. Audio cache check (Supabase Storage)
    try {
      const { data: fileData } = await supabase.storage
        .from(BUCKET_NAME)
        .download(FILE_NAME);
      if (fileData) {
        const buffer = await fileData.arrayBuffer();
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": String(buffer.byteLength),
            "Cache-Control": "public, max-age=3600",
            "X-TTS-Source": "cache",
          },
        });
      }
    } catch (err) {
      log.warn("[TTS] Audio cache read failed:", err);
    }

    // 6. OpenAI key check
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "TTS service not configured" },
        { status: 503 }
      );
    }

    const openai = new OpenAI({ apiKey });

    let script: string;
    let scriptSource = "gpt-5.6-terra";
    try {
      script = await generateBriefingScriptWithLLM(openai, doc, lang);
      if (!script || script.length < 50) {
        throw new Error("Script too short");
      }
    } catch (llmError) {
      log.warn("[TTS] LLM script generation failed, using fallback:", llmError);
      script = generateFallbackScript(doc);
      scriptSource = "fallback";
    }

    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: voice as any,
      input: script,
      speed: 0.95,
      response_format: "mp3",
    });

    const arrayBuffer = await mp3.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    try {
      try {
        await supabase.storage.createBucket(BUCKET_NAME, { public: false });
      } catch {
        // Ignore if bucket already exists
      }
      await supabase.storage.from(BUCKET_NAME).upload(FILE_NAME, buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
    } catch (err) {
      log.warn("[TTS] Audio cache write failed:", err);
    }

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
    log.error("[TTS] Error generating speech", {
      message: error instanceof Error ? error.message.slice(0, 120) : "unknown",
    });
    return NextResponse.json(
      { error: "Failed to generate voice briefing" },
      { status: 500 }
    );
  }
}
