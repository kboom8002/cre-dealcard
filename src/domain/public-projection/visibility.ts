/**
 * @module public-projection/visibility
 * @description P0-SEC — conservative public-visibility rules for /dc/[id] and
 * /im-lite/[buildingId]?doc=... .
 *
 * Lifecycle evidence (grep, 2026-10-27):
 *
 * building_ssot_lite.status  (CHECK: draft | public_signal_ready | snapshot_draft_ready | archived)
 *   - 'public_signal_ready' : set by broker-deal-card.ts (create/update) and building-radar.ts.
 *   - 'draft'               : column default (rows created by other flows). Such deal cards
 *                             already have shared /dc links, so draft is NOT blocked.
 *   - 'archived'            : soft-delete fallback in DELETE /api/broker/deal-card/[id] and
 *                             /api/broker/deal-card/[id]/delete; broker list hides it
 *                             (.neq('status','archived')).                → BLOCKED
 *
 * building_signal_cards.visibility (CHECK: public | public_blind | gate_restricted | internal_only)
 *   - 'public_blind'  : default for visibilityPreference 'blind' (the only value the UI sends).
 *   - 'internal_only' : broker explicitly chose visibilityPreference 'internal'. → BLOCKED
 * building_signal_cards.status (CHECK: draft | ... | archived)
 *   - Always inserted as 'draft' and never advanced by any code path, so 'draft' cannot be
 *     used as a gate (it would 404 every shared card). Only 'archived' is BLOCKED.
 *
 * document_objects.status (CHECK after 00042/00050: draft | generating | generated |
 *   pending_approval | published | revision_needed | disclosure_checked | broker_reviewed |
 *   approved_internal | shared_external | archived)
 *   - IM generate handler saves 'draft' (or 'broker_reviewed' when skipApproval); the broker
 *     is then redirected to /broker/im-approval/[docId] (owner review).
 *   - approve route sets 'published' (approve) or 'revision_needed' (reject).
 *   - im-lite DELETE soft-delete fallback sets 'archived'.
 *   - The broker's public share link is /im-lite/{buildingId} (no ?doc=), which already
 *     only shows 'published' | 'broker_reviewed'. ?doc= links are produced for the owner's own
 *     review screens (im-approval, buildings list, generate result).
 *   → For NON-OWNERS, ?doc= is honoured only for {@link PUBLIC_IM_DOC_STATUSES}; any other
 *     state (draft, generating, generated, pending_approval, revision_needed, archived,
 *     approved_internal, disclosure_checked) is ignored and the viewer falls back to the
 *     public default document — shared links degrade gracefully instead of 404ing.
 *   → Blind teaser / IM existence lookups on /dc skip 'archived' documents.
 */

export const NON_PUBLIC_BUILDING_STATUSES: readonly string[] = ['archived'];
export const NON_PUBLIC_SIGNAL_CARD_VISIBILITIES: readonly string[] = ['internal_only'];
export const NON_PUBLIC_SIGNAL_CARD_STATUSES: readonly string[] = ['archived'];

/** Document statuses that are never surfaced on public pages (teaser body / IM existence). */
export const NON_PUBLIC_DOCUMENT_STATUSES: readonly string[] = ['archived'];

/** Document statuses a NON-owner may open directly via /im-lite/[id]?doc=<docId>. */
export const PUBLIC_IM_DOC_STATUSES: readonly string[] = ['published', 'broker_reviewed', 'shared_external'];

/** Statuses already used by the no-?doc= default lookup in fetch-im-data.ts (unchanged). */
export const DEFAULT_PUBLIC_IM_DOC_STATUSES: readonly string[] = ['published', 'broker_reviewed'];

export function isBuildingStatusPublic(status: string | null | undefined): boolean {
  if (!status) return true; // unknown (e.g. no building_ssot_lite row) → do not block
  return !NON_PUBLIC_BUILDING_STATUSES.includes(status);
}

export function isImDocStatusPublic(status: string | null | undefined): boolean {
  return !!status && PUBLIC_IM_DOC_STATUSES.includes(status);
}

export type DealCardNonPublicReason =
  | 'building_archived'
  | 'signal_card_internal_only'
  | 'signal_card_archived';

export interface DealCardVisibilityInput {
  buildingStatus?: string | null;
  signalCardVisibility?: string | null;
  signalCardStatus?: string | null;
}

export interface DealCardVisibilityResult {
  isPublic: boolean;
  reasons: DealCardNonPublicReason[];
}

/** Public visibility for /dc/[id]. Non-public cards are visible to the owner/admin only. */
export function evaluateDealCardPublicVisibility(input: DealCardVisibilityInput): DealCardVisibilityResult {
  const reasons: DealCardNonPublicReason[] = [];
  if (!isBuildingStatusPublic(input.buildingStatus)) reasons.push('building_archived');
  if (input.signalCardVisibility && NON_PUBLIC_SIGNAL_CARD_VISIBILITIES.includes(input.signalCardVisibility)) {
    reasons.push('signal_card_internal_only');
  }
  if (input.signalCardStatus && NON_PUBLIC_SIGNAL_CARD_STATUSES.includes(input.signalCardStatus)) {
    reasons.push('signal_card_archived');
  }
  return { isPublic: reasons.length === 0, reasons };
}
