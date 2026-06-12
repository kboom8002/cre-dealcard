/**
 * Pulse Generator — 주간 CRE 펄스 자동 생성
 *
 * 1. CRESignalAggregator로 5축 시그널 집계
 * 2. LLM API로 한국어 요약 + 핵심 포인트 생성
 * 3. cre_pulses 테이블에 저장
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { CRESignalAggregator, getWeekLabel } from "./cre-signal-aggregator";
import type { CRESignalSnapshot } from "./cre-signal-aggregator";
import { callLLM as centralCallLLM } from "@/ai/llm-client";

const REGIONS = ["gbd", "ybd", "cbd", "seongsu", "pangyo", "mapo", "jongno", "hongdae"] as const;

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD(강남권역)", ybd: "YBD(여의도)", cbd: "CBD(광화문)",
  seongsu: "성수", pangyo: "판교", mapo: "마포", jongno: "종로", hongdae: "홍대",
};

// ── 트렌드 이모지 ──────────────────────────────────────────────
function trendEmoji(trend: string) {
  return trend === "up" ? "📈" : trend === "down" ? "📉" : "➡️";
}

// ── LLM 프롬프트 ──────────────────────────────────────────────
function buildSummaryPrompt(snapshot: CRESignalSnapshot): string {
  return `당신은 한국 상업용 부동산 시장 분석가입니다.
다음 주간 시그널 데이터를 분석하여, ${REGION_LABELS[snapshot.region] ?? snapshot.region} 권역의 주간 시장 펄스 요약을 작성하세요.

[시그널 데이터]
- 수요: Gate 요청 ${snapshot.demand.gateRequests}건 (전주 대비 ${snapshot.demand.gateRequestsDelta > 0 ? "+" : ""}${snapshot.demand.gateRequestsDelta}%), 매수자 의향 ${snapshot.demand.buyerIntents}건, S등급 매칭 ${snapshot.demand.sMatchCount}건
- 공급: 신규 딜카드 ${snapshot.supply.newDealCards}건 (전주 대비 ${snapshot.supply.newDealCardsDelta > 0 ? "+" : ""}${snapshot.supply.newDealCardsDelta}%), 활성 딜카드 ${snapshot.supply.activeDealCards}건
- 가격: 평균 가격 gap ${snapshot.price.avgPriceGapPct}% (변화 ${snapshot.price.priceGapDelta}%p)
- 체감: 아고라 질문 ${snapshot.sentiment.agoraQuestions}건 (전주 대비 ${snapshot.sentiment.agoraQuestionsDelta > 0 ? "+" : ""}${snapshot.sentiment.agoraQuestionsDelta}%), 인기 카테고리: ${snapshot.sentiment.topCategories.join(", ")}
- 파트너: 서비스 리드 ${snapshot.partner.serviceLeadCount}건
- 종합 펄스 점수: ${snapshot.pulseScore}/100, 트렌드: ${snapshot.trendDirection}

[출력 형식]
JSON으로 응답하세요:
{
  "summary": "300자 이내 한국어 요약. 투자자/중개인에게 유용한 핵심 메시지.",
  "keyFindings": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"],
  "seoTitle": "SEO 최적화 제목 (50자 이내)"
}`;
}

// ── LLM 호출 ──────────────────────────────────────────────────
async function callLLM(prompt: string): Promise<{
  summary: string;
  keyFindings: string[];
  seoTitle: string;
}> {
  try {
    const result = await centralCallLLM({
      systemPrompt: "당신은 한국 상업용 부동산 시장 분석가입니다. 주간 시그널 데이터를 요약해야 합니다.",
      userPrompt: prompt,
      model: "gpt-5.4",
      responseFormat: "json_object",
      temperature: 0.7,
    });
    return JSON.parse(result.content);
  } catch (e) {
    console.error("[PulseGenerator] LLM call failed, using fallback:", e);
    return {
      summary: "이번 주 시장 펄스 분석이 준비되었습니다. 상세 시그널은 본문을 확인하세요.",
      keyFindings: [
        "수요·공급 시그널 데이터 집계 완료",
        "가격 gap 및 체감 시그널 분석",
        "상세 트렌드 방향 확인 필요",
      ],
      seoTitle: "CRE 주간 시장 펄스",
    };
  }
}

// ── Pulse 생성기 ──────────────────────────────────────────────
export async function generateWeeklyPulse(
  supabase: SupabaseClient,
  region: string,
): Promise<{ id: string; pulseScore: number }> {
  const aggregator = new CRESignalAggregator(supabase);
  const snapshot = await aggregator.generateWeeklySnapshot(region);

  // LLM 요약
  const prompt = buildSummaryPrompt(snapshot);
  const llmResult = await callLLM(prompt);

  const weekLabel = getWeekLabel();
  const slug = `${region}-${weekLabel}`.toLowerCase();

  const { data, error } = await supabase
    .from("cre_pulses")
    .insert({
      region,
      period_type: "weekly",
      period_label: weekLabel,
      signals: snapshot,
      pulse_score: snapshot.pulseScore,
      trend: snapshot.trendDirection,
      summary_ko: llmResult.summary,
      key_findings: llmResult.keyFindings,
      seo_title: llmResult.seoTitle || `${REGION_LABELS[region] ?? region} 주간 CRE 펄스 — ${weekLabel}`,
      seo_slug: slug,
      status: "published",
    })
    .select("id, pulse_score")
    .single();

  if (error) throw new Error(`[PulseGenerator] Save failed: ${error.message}`);

  return { id: data.id, pulseScore: data.pulse_score };
}

/** 전체 권역 주간 펄스 일괄 생성 */
export async function generateAllWeeklyPulses(
  supabase: SupabaseClient,
): Promise<{ region: string; id: string; pulseScore: number }[]> {
  const results: { region: string; id: string; pulseScore: number }[] = [];

  for (const region of REGIONS) {
    try {
      const result = await generateWeeklyPulse(supabase, region);
      results.push({ region, ...result });
    } catch (e) {
      console.error(`[PulseGenerator] Failed for ${region}:`, e);
    }
  }

  return results;
}
