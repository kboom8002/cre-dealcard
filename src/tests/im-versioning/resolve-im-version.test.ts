/**
 * @file src/tests/im-versioning/resolve-im-version.test.ts
 * @description WP-P4a1-07 & WP-P4a1-09: resolveImVersion() SSOT & Backward Compatibility Tests.
 *
 * Asserts:
 * 1. resolveImVersion resolves via shareToken (pinned vs follow_latest modes).
 * 2. resolveImVersion resolves via explicit versionId.
 * 3. resolveImVersion resolves via seriesId.
 * 4. resolveImVersion resolves via buildingId.
 * 5. Handles revoked and expired share links correctly.
 * 6. Graceful DB fallback when new tables are unmigrated in remote environment.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveImVersion } from '@/domain/building/im-core/version-resolver';

describe('WP-P4a1-07 & WP-P4a1-09: resolveImVersion() SSOT & Fallback Matrix', () => {
  const mockDocV1 = {
    id: 'doc-v1',
    series_id: 'series-01',
    version_no: 1,
    title: '강남구 역삼동 빌딩 v1',
    body: { releaseTier: 'fact_om', summary: 'v1 summary' },
    status: 'published',
    content_hash: 'sha256:v1hash',
    doc_hash: 'sha256:v1dochash',
    sealed_at: '2026-10-27T00:00:00Z',
    owner_id: 'owner-01',
    broker_id: 'broker-01',
    building_id: 'bld-01',
  };

  const mockDocV2 = {
    id: 'doc-v2',
    series_id: 'series-01',
    version_no: 2,
    title: '강남구 역삼동 빌딩 v2',
    body: { releaseTier: 'fact_om', summary: 'v2 summary' },
    status: 'draft',
    owner_id: 'owner-01',
    broker_id: 'broker-01',
    building_id: 'bld-01',
  };

  const mockSeries = {
    id: 'series-01',
    building_id: 'bld-01',
    owner_id: 'broker-01',
    label: 'Primary Series',
    latest_version_no: 2,
    published_version_id: 'doc-v1',
    current_draft_version_id: 'doc-v2',
  };

  function createMockSupabase(overrides: Record<string, any> = {}) {
    return {
      from: vi.fn((table: string) => {
        if (overrides[table]) return overrides[table];

        if (table === 'im_share_links') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: any) => ({
                maybeSingle: vi.fn(async () => {
                  if (val === 'valid-pinned-token') {
                    return {
                      data: {
                        token: 'valid-pinned-token',
                        series_id: 'series-01',
                        version_id: 'doc-v1',
                        mode: 'pinned',
                      },
                      error: null,
                    };
                  }
                  if (val === 'valid-follow-token') {
                    return {
                      data: {
                        token: 'valid-follow-token',
                        series_id: 'series-01',
                        version_id: null,
                        mode: 'follow_latest',
                      },
                      error: null,
                    };
                  }
                  if (val === 'revoked-token') {
                    return {
                      data: {
                        token: 'revoked-token',
                        revoked_at: '2026-10-27T00:00:00Z',
                      },
                      error: null,
                    };
                  }
                  if (val === 'expired-token') {
                    return {
                      data: {
                        token: 'expired-token',
                        expires_at: '2020-01-01T00:00:00Z',
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                }),
              })),
            })),
          };
        }

        if (table === 'im_series') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: any) => ({
                maybeSingle: vi.fn(async () => {
                  if (val === 'series-01') return { data: mockSeries, error: null };
                  return { data: null, error: null };
                }),
                order: vi.fn(() => ({
                  limit: vi.fn(async () => {
                    if (val === 'bld-01') return { data: [mockSeries], error: null };
                    return { data: [], error: null };
                  }),
                })),
              })),
            })),
          };
        }

        if (table === 'document_objects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: any) => ({
                maybeSingle: vi.fn(async () => {
                  if (val === 'doc-v1') return { data: mockDocV1, error: null };
                  if (val === 'doc-v2') return { data: mockDocV2, error: null };
                  return { data: null, error: null };
                }),
                eq: vi.fn((col2: string, val2: any) => ({
                  maybeSingle: vi.fn(async () => {
                    if (val === 'series-01' && val2 === 1) return { data: mockDocV1, error: null };
                    return { data: null, error: null };
                  }),
                })),
              })),
              in: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [mockDocV1], error: null })),
                })),
              })),
            })),
          };
        }

        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })),
          })),
        };
      }),
    };
  }

  it('resolves pinned version via shareToken', async () => {
    const client = createMockSupabase();
    const res = await resolveImVersion({ shareToken: 'valid-pinned-token' }, client);

    expect(res).not.toBeNull();
    expect(res?.version.id).toBe('doc-v1');
    expect(res?.pinned).toBe(true);
    expect(res?.access).toBe('public');
    expect(res?.isSealed).toBe(true);
  });

  it('resolves follow_latest version via shareToken pointing to series published_version_id', async () => {
    const client = createMockSupabase();
    const res = await resolveImVersion({ shareToken: 'valid-follow-token' }, client);

    expect(res).not.toBeNull();
    expect(res?.version.id).toBe('doc-v1');
    expect(res?.access).toBe('public');
  });

  it('returns null for revoked or expired share tokens', async () => {
    const client = createMockSupabase();
    const revoked = await resolveImVersion({ shareToken: 'revoked-token' }, client);
    expect(revoked).toBeNull();

    const expired = await resolveImVersion({ shareToken: 'expired-token' }, client);
    expect(expired).toBeNull();
  });

  it('resolves directly by versionId with owner access check', async () => {
    const client = createMockSupabase();
    const ownerRes = await resolveImVersion({ versionId: 'doc-v1', viewerId: 'broker-01' }, client);
    expect(ownerRes?.access).toBe('owner');
    expect(ownerRes?.version.id).toBe('doc-v1');

    const publicRes = await resolveImVersion({ versionId: 'doc-v1', viewerId: 'stranger-99' }, client);
    expect(publicRes?.access).toBe('public');
  });

  it('resolves by seriesId and specific versionNo', async () => {
    const client = createMockSupabase();
    const res = await resolveImVersion({ seriesId: 'series-01', versionNo: 1, viewerId: 'broker-01' }, client);
    expect(res?.version.id).toBe('doc-v1');
    expect(res?.version.version_no).toBe(1);
  });

  it('resolves by buildingId via series pointer', async () => {
    const client = createMockSupabase();
    const res = await resolveImVersion({ buildingId: 'bld-01', viewerId: 'broker-01' }, client);
    expect(res?.version.id).toBe('doc-v1');
  });

  it('backward compatibility: falls back gracefully to document_objects query when im_series table throws error', async () => {
    // Simulate remote DB without im_series table (error 42P01)
    const clientWithMissingTable = {
      from: vi.fn((table: string) => {
        if (table === 'im_series' || table === 'im_share_links') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => {
                throw new Error('relation "im_series" does not exist (code 42P01)');
              }),
            })),
          };
        }
        if (table === 'document_objects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(async () => ({ data: [mockDocV1], error: null })),
                  })),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    const res = await resolveImVersion({ buildingId: 'bld-01', viewerId: 'broker-01' }, clientWithMissingTable);
    expect(res).not.toBeNull();
    expect(res?.version.id).toBe('doc-v1');
    expect(res?.access).toBe('owner');
  });
});
