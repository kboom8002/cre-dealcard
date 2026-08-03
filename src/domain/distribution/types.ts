/**
 * types.ts — Distribution & Identity 시스템 핵심 타입
 * Spec: DISTRIBUTION_AND_IDENTITY.md §1, §4, §7
 */

// ── 티어 ──────────────────────────────────────────────
export type Tier = 'teaser' | 'basic' | 'pro';

// ── 3층 신원 모델 ────────────────────────────────────────
export interface Viewer {
  id: string;
  uaClass?: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Recipient {
  id: string;
  tenantId: string;
  brokerId: string;
  label: string;
  contactHint?: string;
  partyId?: string;
  createdAt: string;
}

export interface Party {
  id: string;
  tenantId: string;
  ownerBrokerId: string;
  name: string;
  phoneE164: string;
  email?: string;
  entityType: 'individual' | 'corp' | 'fund' | 'agent';
  consentVersion: string;
  consentAt: string;
  retentionUntil: string;
  createdAt: string;
}

export interface ShareLink {
  token: string;
  tenantId: string;
  dealId: string;
  dealVersion: number;
  tier: 'teaser' | 'basic';
  brokerId: string;
  recipientId?: string;
  distinctViewers: number;
  contaminated: boolean;
  expiresAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface BuyerCondition {
  id: string;
  partyId: string;
  source: 'gate_form' | 'grant_form' | 'slider' | 'broker_note';
  confidence: 'high' | 'medium' | 'low';
  budgetBand?: string;
  regions?: string[];
  assetTypes?: string[];
  purpose?: string;
  financing?: string;
  observedAt: string;
}

export interface GrantPass {
  token: string;
  tenantId: string;
  dealId: string;
  dealVersion: number;
  partyId: string;
  issuedBy: string;
  ndaSignedAt: string;
  watermarkRef: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
}

// ── 추적 이벤트 (§4) ────────────────────────────────────
export type TrackEvent =
  | { kind: 'view.opened';   dealId: string; tier: Tier; referrer?: string }
  | { kind: 'view.section';  sectionId: string; dwellMs: number }
  | { kind: 'view.slider';   param: 'budget' | 'ltv'; value: number }
  | { kind: 'view.completed'; scrollPct: number }
  | { kind: 'intent.question' }
  | { kind: 'intent.watch' }
  | { kind: 'intent.detail_request' }
  | { kind: 'grant.requested' }
  | { kind: 'grant.issued';  grantToken: string }
  | { kind: 'grant.opened' }
  | { kind: 'grant.expired' }
  | { kind: 'outcome.recorded'; result: 'closed' | 'lost' | 'held'; reason?: string };

// ── 매칭 계약 (§7) ───────────────────────────────────────
export interface MatchQuery {
  dealId: string;
  scope: 'own' | 'org';
}

/**
 * ⛔ 이 인터페이스에 partyId·name·phone·email을 추가하면 즉시 반려.
 * 우리가 공유하는 것은 매수자가 아니라 매칭 신호뿐입니다.
 */
export interface MatchResult {
  brokerId: string;
  brokerName: string;
  matchCount: number;
  strength: 'high' | 'medium';
  lastActivityBand: string;
  /** 역레버리지 물건 + 대출필수 매수자 경고 */
  financingWarning?: boolean;
}

// ── 매칭 축과 가중 (§7.2) ────────────────────────────────
export const MATCH_AXES = {
  budget:  { weight: 0.35, kind: 'band-overlap' as const },
  region:  { weight: 0.25, kind: 'set-intersect' as const },
  asset:   { weight: 0.20, kind: 'set-intersect' as const },
  purpose: { weight: 0.20, kind: 'compat-matrix' as const },
} as const;

export const RECENCY_DECAY = {
  within1m: 1.00,
  within3m: 0.85,
  within6m: 0.60,
  over6m: 0.30,
} as const;

// ── 보유기간 (§9) ────────────────────────────────────────
export const RETENTION = {
  party:          { months: 24, from: 'last_activity' as const },
  buyerCondition: { months: 24, from: 'observed_at' as const },
  trackEvent:     { months: 12, then: 'aggregate_and_purge' as const },
} as const;
