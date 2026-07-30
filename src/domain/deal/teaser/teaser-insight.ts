/**
 * @module TeaserInsight
 * @description Tracks teaser viewer events and generates intent drafts.
 * @see docs/credal_v3/specs/teaser.md
 */

export type TeaserEventType = 'view' | 'slider_interact' | 'cta_click' | 'gate_request' | 'share';

export interface TeaserEvent {
  teaserConfigId: string;
  visitorFp: string;
  eventType: TeaserEventType;
  eventData: Record<string, unknown>;
  timestamp: string;
}

export interface IntentDraft {
  visitorFp: string;
  inferredBudgetKrw?: number;
  inferredLtvPct?: number;
  interestLevel: 'low' | 'medium' | 'high';
  suggestedAction: 'nurture' | 'direct_outreach' | 'gate_invite';
}

/**
 * Analyzes a series of teaser events to infer buyer intent.
 */
export function inferIntentFromEvents(events: TeaserEvent[]): IntentDraft | null {
  if (events.length === 0) return null;

  const visitorFp = events[0].visitorFp;
  const hasSliderInteraction = events.some(e => e.eventType === 'slider_interact');
  const hasCtaClick = events.some(e => e.eventType === 'cta_click');
  const hasGateRequest = events.some(e => e.eventType === 'gate_request');
  const viewCount = events.filter(e => e.eventType === 'view').length;

  let interestLevel: IntentDraft['interestLevel'] = 'low';
  let suggestedAction: IntentDraft['suggestedAction'] = 'nurture';

  if (hasGateRequest) {
    interestLevel = 'high';
    suggestedAction = 'gate_invite';
  } else if (hasCtaClick || (hasSliderInteraction && viewCount >= 2)) {
    interestLevel = 'medium';
    suggestedAction = 'direct_outreach';
  }

  // Extract budget from slider data if available
  const sliderEvents = events.filter(e => e.eventType === 'slider_interact');
  let inferredBudget: number | undefined;
  let inferredLtv: number | undefined;
  for (const se of sliderEvents) {
    if (se.eventData.budgetKrw) inferredBudget = Number(se.eventData.budgetKrw);
    if (se.eventData.ltvPct) inferredLtv = Number(se.eventData.ltvPct);
  }

  return {
    visitorFp,
    inferredBudgetKrw: inferredBudget,
    inferredLtvPct: inferredLtv,
    interestLevel,
    suggestedAction,
  };
}

/**
 * Creates a teaser event object for logging.
 */
export function createTeaserEvent(
  teaserConfigId: string,
  visitorFp: string,
  eventType: TeaserEventType,
  eventData: Record<string, unknown> = {}
): TeaserEvent {
  return {
    teaserConfigId,
    visitorFp,
    eventType,
    eventData,
    timestamp: new Date().toISOString(),
  };
}
