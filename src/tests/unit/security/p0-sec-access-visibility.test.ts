/**
 * P0-SEC (SEC-3 + status filtering) — access decision + visibility rule tests.
 */
import { describe, it, expect } from 'vitest';
import {
  decideOwnerPageAccess,
  isOwnerOrAdmin,
  ANONYMOUS_VIEWER,
  type Viewer,
} from '@/domain/public-projection/access';
import {
  evaluateDealCardPublicVisibility,
  isBuildingStatusPublic,
  isImDocStatusPublic,
} from '@/domain/public-projection/visibility';
import { isSocialBotUA } from '@/lib/social-bot';

const OWNER: Viewer = { userId: 'owner-1', isAdmin: false };
const OTHER: Viewer = { userId: 'other-2', isAdmin: false };
const ADMIN: Viewer = { userId: 'admin-9', isAdmin: true };
const KAKAO = 'Mozilla/5.0 (compatible; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/)';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36';

describe('P0-SEC SEC-3: decideOwnerPageAccess (broker deal-card / leasing)', () => {
  const base = { ownerId: 'owner-1', exists: true };

  it('anonymous social bot → bot_shell (never allow)', () => {
    expect(decideOwnerPageAccess({ ...base, viewer: ANONYMOUS_VIEWER, isBot: isSocialBotUA(KAKAO) })).toBe('bot_shell');
  });

  it('anonymous social bot on unknown / archived resource → not_found', () => {
    expect(decideOwnerPageAccess({ ...base, exists: false, viewer: ANONYMOUS_VIEWER, isBot: true })).toBe('not_found');
  });

  it('anonymous human → login', () => {
    expect(decideOwnerPageAccess({ ...base, viewer: ANONYMOUS_VIEWER, isBot: isSocialBotUA(CHROME) })).toBe('login');
  });

  it('authenticated non-owner → not_found (even with a bot UA)', () => {
    expect(decideOwnerPageAccess({ ...base, viewer: OTHER, isBot: false })).toBe('not_found');
    expect(decideOwnerPageAccess({ ...base, viewer: OTHER, isBot: true })).toBe('not_found');
  });

  it('owner and admin → allow; un-owned row → admin only', () => {
    expect(decideOwnerPageAccess({ ...base, viewer: OWNER, isBot: false })).toBe('allow');
    expect(decideOwnerPageAccess({ ...base, viewer: ADMIN, isBot: false })).toBe('allow');
    expect(decideOwnerPageAccess({ ...base, ownerId: null, viewer: OWNER, isBot: false })).toBe('not_found');
    expect(decideOwnerPageAccess({ ...base, ownerId: null, viewer: ADMIN, isBot: false })).toBe('allow');
  });

  it('non-prod E2E bypass only applies to anonymous requests for existing rows', () => {
    expect(decideOwnerPageAccess({ ...base, viewer: ANONYMOUS_VIEWER, isBot: false, isNonProdE2EBypass: true })).toBe('allow');
    expect(decideOwnerPageAccess({ ...base, exists: false, viewer: ANONYMOUS_VIEWER, isBot: false, isNonProdE2EBypass: true })).toBe('login');
    expect(decideOwnerPageAccess({ ...base, viewer: OTHER, isBot: false, isNonProdE2EBypass: true })).toBe('not_found');
  });

  it('isOwnerOrAdmin ignores empty owner ids', () => {
    expect(isOwnerOrAdmin(OWNER, null, undefined, '')).toBe(false);
    expect(isOwnerOrAdmin(OWNER, null, 'owner-1')).toBe(true);
    expect(isOwnerOrAdmin(ANONYMOUS_VIEWER, 'owner-1')).toBe(false);
    expect(isOwnerOrAdmin(null, 'owner-1')).toBe(false);
  });
});

describe('P0-SEC: public visibility rules', () => {
  it('building_ssot_lite.status: only archived is non-public (draft stays public — shared links)', () => {
    expect(isBuildingStatusPublic('archived')).toBe(false);
    for (const s of ['draft', 'public_signal_ready', 'snapshot_draft_ready', null, undefined]) {
      expect(isBuildingStatusPublic(s as string | null | undefined)).toBe(true);
    }
  });

  it('/dc: blocks archived building, internal_only or archived signal card', () => {
    expect(evaluateDealCardPublicVisibility({ buildingStatus: 'public_signal_ready', signalCardVisibility: 'public_blind', signalCardStatus: 'draft' }))
      .toEqual({ isPublic: true, reasons: [] });
    expect(evaluateDealCardPublicVisibility({ buildingStatus: 'draft' }).isPublic).toBe(true);
    expect(evaluateDealCardPublicVisibility({}).isPublic).toBe(true);
    expect(evaluateDealCardPublicVisibility({ buildingStatus: 'archived' }).reasons).toEqual(['building_archived']);
    expect(evaluateDealCardPublicVisibility({ signalCardVisibility: 'internal_only' }).reasons).toEqual(['signal_card_internal_only']);
    expect(evaluateDealCardPublicVisibility({ signalCardStatus: 'archived' }).reasons).toEqual(['signal_card_archived']);
    // gate_restricted / public still render the blind teaser
    expect(evaluateDealCardPublicVisibility({ signalCardVisibility: 'gate_restricted' }).isPublic).toBe(true);
  });

  it('/im-lite ?doc=: only published / broker_reviewed / shared_external are public', () => {
    for (const s of ['published', 'broker_reviewed', 'shared_external']) expect(isImDocStatusPublic(s)).toBe(true);
    for (const s of ['draft', 'generating', 'generated', 'pending_approval', 'revision_needed', 'archived', 'approved_internal', 'disclosure_checked', null, undefined, '']) {
      expect(isImDocStatusPublic(s as string | null | undefined)).toBe(false);
    }
  });
});
