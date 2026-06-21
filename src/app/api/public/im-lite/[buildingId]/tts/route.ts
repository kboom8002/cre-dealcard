/**
 * /api/public/im-lite/[buildingId]/tts
 *
 * OpenAI TTS-1-HD를 사용한 Mobile IM 음성 브리핑 생성 API.
 * 1분 내외의 한국어 투자 브리핑 음성을 audio/mpeg로 반환합니다.
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getDemoMobileIM, type MobileIMDocument } from "@/lib/demo/mobile-im-demo-data";

// In-memory cache: buildingId -> audio buffer
const audioCache = new Map<string, { buffer: Buffer; createdAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/** 7섹션 IM 데이터에서 음성 브리핑 스크립트를 생성합니다 */
function generateBriefingScript(doc: MobileIMDocument): string {
  const sections = doc.sections.filter((s) => !s.locked);

  // Extract key data points from section content
  const overviewSection = sections.find((s) => s.sectionId === "01_overview");
  const locationSection = sections.find((s) => s.sectionId === "02_location");
  const leaseSection = sections.find((s) => s.sectionId === "03_lease");
  const financeSection = sections.find((s) => s.sectionId === "04_finance");
  const riskSection = sections.find((s) => s.sectionId === "05_risk");
  const thesisSection = sections.find((s) => s.sectionId === "06_thesis");

  const lines: string[] = [];

  // Opening
  lines.push(
    `안녕하세요. ${doc.areaSignal} 소재 ${doc.assetType}에 대한 투자 브리핑을 시작합니다.`,
  );
  lines.push(`이 매물의 매각 희망가는 ${doc.priceBand}이며, ${doc.sizeSignal} 규모입니다.`);
  lines.push("");

  // Overview highlights
  if (overviewSection) {
    const content = overviewSection.content;
    // Extract key table data
    const completionMatch = content.match(/준공연도[|]*\s*[|]\s*([^\n|]+)/);
    const floorMatch = content.match(/층수[|]*\s*[|]\s*([^\n|]+)/);
    if (completionMatch) lines.push(`${completionMatch[1].trim()} 준공 건물로,`);
    if (floorMatch) lines.push(`${floorMatch[1].trim()} 규모입니다.`);
    lines.push("");
  }

  // Location highlights
  if (locationSection) {
    lines.push("입지 분석 결과,");
    const stationMatch = locationSection.content.match(/(?:지하철|역)\s*[:\s]*([^\n,]+)/);
    if (stationMatch) {
      lines.push(`최근접 역은 ${stationMatch[1].trim()}입니다.`);
    }
    // Extract area description
    const firstParagraph = locationSection.content
      .split("\n")
      .find((l) => l.length > 20 && !l.startsWith("|") && !l.startsWith("#"));
    if (firstParagraph) {
      const cleaned = firstParagraph.replace(/\*\*/g, "").replace(/[#>]/g, "").trim();
      if (cleaned.length > 10 && cleaned.length < 200) lines.push(cleaned);
    }
    lines.push("");
  }

  // Lease status
  if (leaseSection) {
    lines.push("임대 현황을 살펴보면,");
    const vacancyMatch = leaseSection.content.match(/공실[률\s]*[:\s]*([^\n,]+)/);
    const waltMatch = leaseSection.content.match(/WALT[:\s]*([^\n,]+)/);
    if (vacancyMatch) lines.push(`공실률은 ${vacancyMatch[1].trim()}이며,`);
    if (waltMatch) lines.push(`가중평균 잔여 임대기간 WALT는 ${waltMatch[1].trim()}입니다.`);
    lines.push("");
  }

  // Financial highlights
  if (financeSection) {
    lines.push("수익 분석에서 핵심 지표를 말씀드리면,");
    const capRateMatch = financeSection.content.match(/Cap\s*Rate[:\s]*([0-9.]+)/);
    const noiMatch = financeSection.content.match(/NOI[:\s]*(?:약\s*)?([^\n,]+)/);
    const irrMatch = financeSection.content.match(/IRR[:\s]*([0-9.]+)/);
    if (noiMatch) lines.push(`연간 순영업소득 NOI는 ${noiMatch[1].trim()}이고,`);
    if (capRateMatch) lines.push(`Cap Rate는 ${capRateMatch[1]}%,`);
    if (irrMatch) lines.push(`5년 IRR은 ${irrMatch[1]}% 수준입니다.`);
    lines.push("");
  }

  // Risk highlights
  if (riskSection) {
    lines.push("확인이 필요한 사항으로는,");
    const risks = riskSection.content
      .split("\n")
      .filter((l) => l.startsWith("- ") || l.match(/^[🔴🔶🔵⚠️]/))
      .slice(0, 3);
    for (const risk of risks) {
      const cleaned = risk.replace(/^[-*]\s*/, "").replace(/[🔴🔶🔵⚠️]\s*/, "").replace(/\*\*/g, "").trim();
      if (cleaned.length > 5) lines.push(`${cleaned}.`);
    }
    lines.push("");
  }

  // Investment thesis
  if (thesisSection) {
    lines.push("마지막으로 투자 포인트를 정리하면,");
    const points = thesisSection.content
      .split("\n")
      .filter((l) => (l.startsWith("- ") || l.startsWith("* ") || l.match(/^[0-9]+\./)) && l.length > 10)
      .slice(0, 3);
    for (const point of points) {
      const cleaned = point.replace(/^[-*0-9.]\s*/, "").replace(/\*\*/g, "").trim();
      if (cleaned.length > 5) lines.push(`${cleaned}.`);
    }
    lines.push("");
  }

  // Closing
  lines.push("이상 브리핑을 마치겠습니다.");
  lines.push(`상세 내용은 모바일 IM의 7개 섹션에서 확인하실 수 있으며,`);
  lines.push(`담당 중개인 ${doc.broker.displayName}에게 직접 문의도 가능합니다.`);
  lines.push("감사합니다.");

  return lines.filter((l) => l.length > 0).join(" ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildingId: string }> },
) {
  const { buildingId } = await params;

  // Check cache first
  const cached = audioCache.get(buildingId);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return new NextResponse(new Uint8Array(cached.buffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(cached.buffer.length),
        "Cache-Control": "public, max-age=1800",
        "X-TTS-Source": "cache",
      },
    });
  }

  // Load IM data
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

  // Check OpenAI API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TTS service not configured" },
      { status: 503 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const script = generateBriefingScript(doc);

    // Generate speech with OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice: "nova", // Clear, professional female voice — great for Korean
      input: script,
      speed: 0.95, // Slightly slower for clarity
      response_format: "mp3",
    });

    const arrayBuffer = await mp3.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uint8 = new Uint8Array(arrayBuffer);

    // Cache the result
    audioCache.set(buildingId, { buffer, createdAt: Date.now() });

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=1800",
        "X-TTS-Source": "generated",
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
