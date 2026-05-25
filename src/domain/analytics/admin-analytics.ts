/**
 * Analytics domain service
 *
 * Queries activity_events table for admin dashboard metrics.
 * All queries use service-role client for full visibility.
 *
 * Source: docs/13-event-analytics.md sections 6-8
 */
import { createServiceClient } from "@/lib/supabase/service";

export interface EventCountMap {
  building_ssot_lite_created: number;
  deal_curiosity_report_generated: number;
  broker_memo_submitted: number;
  blind_teaser_generated: number;
  buyer_intent_created: number;
  buyer_memo_generated: number;
  gate_request_created: number;
  gate_request_reviewed: number;
  expert_note_requested: number;
  owner_readiness_checked: number;
  ai_run_failed: number;
  pipeline_stage_transitioned?: number;
  match_failure_recorded?: number;
  price_negotiation_logged?: number;
  market_indicator_computed?: number;
  lease_pipeline_transitioned?: number;
  funding_project_created?: number;
}

export interface RecentEvent {
  id: string;
  event_type: string;
  actor_role: string | null;
  entity_type: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AdminAnalyticsData {
  counts: EventCountMap;
  recentEvents: RecentEvent[];
  totalEvents: number;
  todayEvents: number;
}


export async function getAdminAnalytics(): Promise<AdminAnalyticsData> {
  const supabase = createServiceClient();

  // Fetch all activity events (recent 1000) — sufficient for MVP
  const { data: events, error } = await supabase
    .from("activity_events")
    .select("id, event_type, actor_role, entity_type, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !events) {
    throw new Error(`Failed to fetch analytics: ${error?.message}`);
  }

  // Count each event type from in-memory results (avoids N+1)
  const counts: EventCountMap = {
    building_ssot_lite_created: 0,
    deal_curiosity_report_generated: 0,
    broker_memo_submitted: 0,
    blind_teaser_generated: 0,
    buyer_intent_created: 0,
    buyer_memo_generated: 0,
    gate_request_created: 0,
    gate_request_reviewed: 0,
    expert_note_requested: 0,
    owner_readiness_checked: 0,
    ai_run_failed: 0,
    pipeline_stage_transitioned: 0,
    match_failure_recorded: 0,
    price_negotiation_logged: 0,
    market_indicator_computed: 0,
    lease_pipeline_transitioned: 0,
    funding_project_created: 0,
  };

  for (const event of events) {
    const et = event.event_type as keyof EventCountMap;
    if (et in counts) {
      counts[et]++;
    }
  }

  // Today's events
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEvents = events.filter(
    (e) => new Date(e.created_at) >= todayStart,
  ).length;

  return {
    counts,
    recentEvents: events.slice(0, 30) as RecentEvent[],
    totalEvents: events.length,
    todayEvents,
  };
}

// Funnel conversion rates
export function computeFunnelRates(counts: EventCountMap) {
  const safe = (a: number, b: number) =>
    b === 0 ? null : Math.round((a / b) * 100);

  return {
    // Public funnel
    reportCompletionRate: safe(
      counts.deal_curiosity_report_generated,
      counts.building_ssot_lite_created,
    ),
    blindTeaserConversion: safe(
      counts.blind_teaser_generated,
      counts.deal_curiosity_report_generated,
    ),
    expertNoteConversion: safe(
      counts.expert_note_requested,
      counts.deal_curiosity_report_generated,
    ),
    gateRequestFromTeaser: safe(
      counts.gate_request_created,
      counts.blind_teaser_generated,
    ),
    // Broker funnel
    dealCardConversion: safe(
      counts.blind_teaser_generated,
      counts.broker_memo_submitted,
    ),
    buyerMemoConversion: safe(
      counts.buyer_memo_generated,
      counts.buyer_intent_created,
    ),
  };
}

export function computePipelineFunnelRates(counts: EventCountMap) {
  const safe = (a: number, b: number) =>
    b === 0 ? null : Math.round((a / b) * 100);

  return {
    memoToCard: safe(counts.blind_teaser_generated || 0, counts.broker_memo_submitted || 1),
    cardToGate: safe(counts.gate_request_created || 0, counts.blind_teaser_generated || 1),
    gateToIm: safe(counts.gate_request_reviewed || 0, counts.gate_request_created || 1),
  };
}

// Event display config
export const EVENT_DISPLAY: Record<
  string,
  { label: string; emoji: string; category: string }
> = {
  building_ssot_lite_created: {
    label: "건물 SSoT 생성",
    emoji: "🏢",
    category: "public",
  },
  deal_curiosity_report_generated: {
    label: "딜 리포트 생성",
    emoji: "📊",
    category: "public",
  },
  broker_memo_submitted: {
    label: "브로커 메모 제출",
    emoji: "📋",
    category: "broker",
  },
  blind_teaser_generated: {
    label: "블라인드 티저 생성",
    emoji: "🔍",
    category: "broker",
  },
  buyer_intent_created: {
    label: "매수자 조건 생성",
    emoji: "🎯",
    category: "broker",
  },
  buyer_memo_generated: {
    label: "매수자 메모 생성",
    emoji: "💬",
    category: "broker",
  },
  gate_request_created: {
    label: "Gate 요청",
    emoji: "🔐",
    category: "gate",
  },
  gate_request_reviewed: {
    label: "Gate 검토 완료",
    emoji: "✅",
    category: "gate",
  },
  expert_note_requested: {
    label: "전문가 코멘트 요청",
    emoji: "💡",
    category: "expert",
  },
  owner_readiness_checked: {
    label: "매각 준비도 체크",
    emoji: "📈",
    category: "owner",
  },
  ai_run_failed: {
    label: "AI 실패",
    emoji: "⚠️",
    category: "system",
  },
  pipeline_stage_transitioned: {
    label: "파이프라인 단계 전환",
    emoji: "🔄",
    category: "pipeline",
  },
  match_failure_recorded: {
    label: "매칭 실패 기록됨",
    emoji: "❌",
    category: "analytics",
  },
  price_negotiation_logged: {
    label: "가격 조정 기록됨",
    emoji: "💵",
    category: "analytics",
  },
  market_indicator_computed: {
    label: "시장 선행 지표 산출",
    emoji: "📉",
    category: "system",
  },
  lease_pipeline_transitioned: {
    label: "임대차 파이프라인 전환",
    emoji: "🔁",
    category: "pipeline",
  },
  funding_project_created: {
    label: "펀딩 프로젝트 생성",
    emoji: "🪙",
    category: "funding",
  },
};
