import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  issueShareLinkToken,
  revokeShareLinkToken,
  verifyShareLinkToken,
  resetShareLinkTokenStoreForTests,
} from '@/lib/security/share-link-tokens';

const mockRequireBroker = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireBroker: (...args: unknown[]) => mockRequireBroker(...args),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: async () => ({ error: null }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
  }),
}));

describe('Share Link Token Issuance, Verification & Revocation (IB-04, IB-05)', () => {
  beforeEach(() => {
    resetShareLinkTokenStoreForTests();
    mockRequireBroker.mockReset();
  });

  it('issues a signed share link token and verifies it for the matching buildingId', async () => {
    const issued = await issueShareLinkToken({
      buildingId: 'bld-01',
      brokerId: 'broker-alpha',
      recipientId: 'client-01',
      ttlDays: 7,
    });

    expect(issued.token).toMatch(/^slk\./);
    expect(issued.shareUrl).toContain('/im-lite/bld-01?token=');

    const validCheck = await verifyShareLinkToken({
      token: issued.token,
      buildingId: 'bld-01',
    });
    expect(validCheck.valid).toBe(true);

    // Mismatched buildingId must be rejected
    const wrongBuildingCheck = await verifyShareLinkToken({
      token: issued.token,
      buildingId: 'bld-02',
    });
    expect(wrongBuildingCheck.valid).toBe(false);
    expect(wrongBuildingCheck.reason).toBe('invalid');
  });

  it('blocks cross-broker revocation with 403 and revokes when called by owning broker', async () => {
    const issued = await issueShareLinkToken({
      buildingId: 'bld-01',
      brokerId: 'broker-owner',
      recipientId: 'client-01',
      ttlDays: 7,
    });

    const crossBrokerAttempt = await revokeShareLinkToken({
      token: issued.token,
      buildingId: 'bld-01',
      brokerId: 'broker-attacker',
      reason: 'unauthorized_attempt',
    });
    expect(crossBrokerAttempt.ok).toBe(false);
    expect(crossBrokerAttempt.status).toBe(403);

    // Token must still be valid after failed cross-broker attempt
    const stillValid = await verifyShareLinkToken({
      token: issued.token,
      buildingId: 'bld-01',
    });
    expect(stillValid.valid).toBe(true);

    // Owner revokes token
    const ownerRevoke = await revokeShareLinkToken({
      token: issued.token,
      buildingId: 'bld-01',
      brokerId: 'broker-owner',
      reason: 'deal_closed',
    });
    expect(ownerRevoke.ok).toBe(true);
    expect(ownerRevoke.status).toBe(200);

    const afterRevoke = await verifyShareLinkToken({
      token: issued.token,
      buildingId: 'bld-01',
    });
    expect(afterRevoke.valid).toBe(false);
    expect(afterRevoke.reason).toBe('revoked');
  });

  it('POST /api/broker/share-links/revoke enforces requireBroker and blocks revoked token in fetchIMData', async () => {
    const { POST } = await import('@/app/api/broker/share-links/revoke/route');
    const { fetchIMData } = await import('@/app/(public)/im-lite/[buildingId]/fetch-im-data');

    const issued = await issueShareLinkToken({
      buildingId: 'bld-01',
      brokerId: 'broker-owner',
      recipientId: 'client-01',
      ttlDays: 14,
    });

    // 1. Unauthenticated call -> 401
    mockRequireBroker.mockResolvedValueOnce({
      user: null,
      error: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    });
    const unauthReq = new NextRequest('http://localhost/api/broker/share-links/revoke', {
      method: 'POST',
      body: JSON.stringify({ token: issued.token, buildingId: 'bld-01' }),
    });
    const unauthRes = await POST(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Before revocation, fetchIMData with valid token returns IM data for seed building 'bld-01'
    const dataBefore = await fetchIMData('bld-01', undefined, undefined, {
      token: issued.token,
    });
    expect(dataBefore).not.toBeNull();

    // 3. Authenticated as owner -> 200 revoked
    mockRequireBroker.mockResolvedValueOnce({
      user: { id: 'broker-owner', email: 'owner@example.com', role: 'broker' },
      error: null,
    });
    const authReq = new NextRequest('http://localhost/api/broker/share-links/revoke', {
      method: 'POST',
      body: JSON.stringify({
        token: issued.token,
        buildingId: 'bld-01',
        reason: 'client_declined',
      }),
    });
    const authRes = await POST(authReq);
    expect(authRes.status).toBe(200);
    const authJson = await authRes.json();
    expect(authJson.ok).toBe(true);
    expect(authJson.revoked).toBe(true);

    // 4. After revocation, fetchIMData with the revoked token returns null (access blocked)
    const dataAfter = await fetchIMData('bld-01', undefined, undefined, {
      token: issued.token,
    });
    expect(dataAfter).toBeNull();
  });
});
