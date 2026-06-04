import type { SupabaseClient } from "@supabase/supabase-js";

// G4: A/B Testing variant logger
export async function logAbVariantView(
  supabase: SupabaseClient,
  curationId: string,
  variant: "A" | "B",
  title?: string,
  description?: string
): Promise<any> {
  const { data, error } = await supabase
    .from("content_ab_tests")
    .upsert(
      { curation_id: curationId, variant, title, description },
      { onConflict: "curation_id,variant" }
    )
    .select()
    .single();

  if (error) throw error;

  // Increment views atomicaly (using custom SQL or increment utility)
  const { error: incError } = await supabase.rpc("increment_ab_views", {
    p_curation_id: curationId,
    p_variant: variant
  });

  return { success: !incError, data };
}

export async function logAbVariantClick(
  supabase: SupabaseClient,
  curationId: string,
  variant: "A" | "B"
): Promise<any> {
  const { error } = await supabase.rpc("increment_ab_clicks", {
    p_curation_id: curationId,
    p_variant: variant
  });

  return { success: !error };
}

// G5: Auto CRM link (reactions update lead_scores)
export async function syncClientReactionToCrm(
  supabase: SupabaseClient,
  brokerId: string,
  leadName: string,
  actionWeight: number,
  metadata: Record<string, any>
): Promise<any> {
  // Check if lead score row exists
  const { data: existing } = await supabase
    .from("lead_scores")
    .select("*")
    .eq("broker_id", brokerId)
    .eq("lead_name", leadName)
    .single();

  const newScore = (existing?.score || 0) + actionWeight;
  const newCount = (existing?.engagement_count || 0) + 1;

  const { data, error } = await supabase
    .from("lead_scores")
    .upsert({
      id: existing?.id,
      broker_id: brokerId,
      lead_name: leadName,
      score: Math.min(newScore, 100), // Cap at 100
      engagement_count: newCount,
      last_active_at: new Date().toISOString(),
      metadata: { ...(existing?.metadata || {}), ...metadata }
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// G6: Weekly PoC Insight Report generator for Admins
export async function generateWeeklyAdminInsightReport(supabase: SupabaseClient): Promise<any> {
  const [surveys, sentimentPolls, totalEvents, hitmap] = await Promise.all([
    supabase.from("poc_surveys").select("*"),
    supabase.from("market_sentiment_polls").select("*"),
    supabase.from("content_share_events").select("*", { count: "exact", head: true }),
    supabase.from("activity_events").select("event_type")
  ]);

  // Aggregate NPS scores
  const surveyAnswers = surveys.data?.map(s => s.answers) || [];
  const npsScores = surveyAnswers
    .map(ans => Number(ans.nps || ans.NPS))
    .filter(score => !isNaN(score));

  const totalNps = npsScores.length;
  let promoters = 0;
  let detractors = 0;
  for (const s of npsScores) {
    if (s >= 9) promoters++;
    else if (s <= 6) detractors++;
  }
  const npsIndex = totalNps > 0
    ? Math.round(((promoters - detractors) / totalNps) * 100)
    : 0;

  // Aggregate Broker Sentiment
  const sentimentScores = sentimentPolls.data?.map(s => s.score) || [];
  const avgSentiment = sentimentScores.length > 0
    ? Math.round(sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length)
    : 50;

  // Function usage heatmap
  const heatmap: Record<string, number> = {};
  for (const row of hitmap.data || []) {
    heatmap[row.event_type] = (heatmap[row.event_type] || 0) + 1;
  }
  const sortedHeatmap = Object.entries(heatmap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    reportDate: new Date().toISOString().slice(0, 10),
    metrics: {
      totalSurveysCollected: surveys.data?.length || 0,
      netPromoterScore: npsIndex,
      brokerSentimentIndex: avgSentiment,
      totalShareViewsAndClicks: totalEvents.count || 0,
      activeBrokersCount: new Set(sentimentPolls.data?.map(s => s.broker_id)).size
    },
    topFeaturesUsed: sortedHeatmap.slice(0, 5),
    aiActionRecommendation: npsIndex < 30
      ? "NPS 지수가 다소 낮습니다. 브로커 온보딩 가이드를 강화하고 1:1 고객지원을 제공하세요."
      : "체감 지수 및 만족도가 매우 양호합니다. 공동중개 기능(D1) 활성화를 위해 프로모션을 진행하세요."
  };
}
