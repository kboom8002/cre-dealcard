/**
 * @file src/tests/foundations/jobs-v2-idempotency.test.ts
 * @description P0.5 Foundation Automated Verification Suite:
 * 1. Verify `computeIdempotencyHash` and `canonicalizeJson` recursively canonicalize nested dictionary keys.
 * 2. Verify deterministic hashing regardless of object key ordering across all nesting levels.
 * 3. Verify Jobs v2 state transitions: claimJob, heartbeatJob, cancelJob, and sweepStaleJobs.
 *
 * Authoritative Sources:
 * - docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §1.3, §5.3, WP-P05-05
 * - ORIGINAL_REQUEST.md (§ 2026-10-27T04:28:40Z)
 * - PROJECT.md (Milestone 1, Feature 9)
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0.5 Foundation Verification: Jobs v2 Idempotency & State Machine', () => {
  const jobsIndexPath = path.resolve(process.cwd(), 'src/lib/jobs/index.ts');

  describe('Part 1: Deterministic Nested-Key Canonicalization Hash', () => {
    it('canonicalizeJson recursively sorts keys across all nested levels', async () => {
      const { canonicalizeJson } = await import('@/lib/jobs');

      const objA = {
        z: 1,
        a: 2,
        nested: { b: 'first', a: 'second', inner: { y: 10, x: 20 } },
      };

      const objB = {
        a: 2,
        nested: { inner: { x: 20, y: 10 }, a: 'second', b: 'first' },
        z: 1,
      };

      expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
    });

    it('computeIdempotencyHash generates identical hash for shallow key order variations', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs');

      const hashA = computeIdempotencyHash({
        buildingId: 'bld-001',
        input: {
          assetType: '근린생활시설',
          askingPriceManwon: 850000,
          posture: 'income',
        },
      });

      const hashB = computeIdempotencyHash({
        buildingId: 'bld-001',
        input: {
          posture: 'income',
          askingPriceManwon: 850000,
          assetType: '근린생활시설',
        },
      });

      expect(hashA).toBeDefined();
      expect(typeof hashA).toBe('string');
      expect(hashA).toBe(hashB);
    });

    it('computeIdempotencyHash generates identical hash for deeply nested dictionary key variations', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs');

      const deepA = {
        options: {
          includeFloorPlans: true,
          curatePhotos: false,
          targetTier: 'pro',
        },
        financials: {
          capRate: 4.2,
          monthlyRent: 35000000,
          deposit: 500000000,
          ratios: {
            debt: 0.6,
            equity: 0.4,
          },
        },
        metadata: {
          requestedBy: 'broker-101',
          source: 'quick_generate',
        },
      };

      // Shuffled keys at every level
      const deepB = {
        metadata: {
          source: 'quick_generate',
          requestedBy: 'broker-101',
        },
        financials: {
          ratios: {
            equity: 0.4,
            debt: 0.6,
          },
          deposit: 500000000,
          capRate: 4.2,
          monthlyRent: 35000000,
        },
        options: {
          targetTier: 'pro',
          curatePhotos: false,
          includeFloorPlans: true,
        },
      };

      const hashA = computeIdempotencyHash({ buildingId: 'bld-deep-01', input: deepA });
      const hashB = computeIdempotencyHash({ buildingId: 'bld-deep-01', input: deepB });

      expect(hashA).toBe(hashB);
    });

    it('computeIdempotencyHash canonicalizes nested objects inside arrays while preserving array order', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs');

      // Array elements have shuffled internal object keys
      const arrA = {
        units: [
          { floor: '1F', tenant: '스타벅스', rent: 1000 },
          { floor: '2F', tenant: '올리브영', rent: 800 },
        ],
      };

      const arrB = {
        units: [
          { rent: 1000, floor: '1F', tenant: '스타벅스' },
          { tenant: '올리브영', rent: 800, floor: '2F' },
        ],
      };

      const hashA = computeIdempotencyHash({ buildingId: 'bld-arr-01', input: arrA });
      const hashB = computeIdempotencyHash({ buildingId: 'bld-arr-01', input: arrB });
      expect(hashA).toBe(hashB);

      // BUT if array element ORDER changes, hash MUST change (rentroll floor ordering matters!)
      const arrReversed = {
        units: [
          { floor: '2F', tenant: '올리브영', rent: 800 },
          { floor: '1F', tenant: '스타벅스', rent: 1000 },
        ],
      };

      const hashReversed = computeIdempotencyHash({ buildingId: 'bld-arr-01', input: arrReversed });
      expect(hashA).not.toBe(hashReversed);
    });

    it('computeIdempotencyHash correctly differentiates distinct data values', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs');

      const hash1 = computeIdempotencyHash({ buildingId: 'bld-1', input: { price: 100 } });
      const hash2 = computeIdempotencyHash({ buildingId: 'bld-1', input: { price: 101 } });
      const hash3 = computeIdempotencyHash({ buildingId: 'bld-2', input: { price: 100 } });

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });

    it('adversarial: handles null, boolean, undefined, special characters and unicode', async () => {
      const { computeIdempotencyHash } = await import('@/lib/jobs');

      const unicodeA = {
        title: '당산동 11-47 꼬마빌딩 ✨',
        memo: '공실률 0% · 특약 조건: "현 상태 승계"\n줄바꿈 포함',
        nullVal: null,
        boolVal: true,
      };

      const unicodeB = {
        boolVal: true,
        nullVal: null,
        memo: '공실률 0% · 특약 조건: "현 상태 승계"\n줄바꿈 포함',
        title: '당산동 11-47 꼬마빌딩 ✨',
      };

      const hashA = computeIdempotencyHash({ buildingId: 'bld-uni', input: unicodeA });
      const hashB = computeIdempotencyHash({ buildingId: 'bld-uni', input: unicodeB });

      expect(hashA).toBe(hashB);
    });
  });

  describe('Part 2: Jobs v2 Lifecycle Transitions & Invariants', () => {
    it('claimJob: atomically transitions queued job to running and sets worker heartbeat', async () => {
      const { claimJob } = await import('@/lib/jobs');

      // Mock Supabase client
      const mockSupabase = {
        from: vi.fn((table: string) => ({
          update: vi.fn((updates: any) => ({
            eq: vi.fn((col1: string, val1: string) => ({
              eq: vi.fn((col2: string, val2: string) => ({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: val1, status: 'running' }],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };

      const claimed = await claimJob('job-claim-001', 'worker-node-1', {
        client: mockSupabase as any,
      });

      expect(claimed).toBe(true);
      expect(mockSupabase.from).toHaveBeenCalledWith('im_generation_jobs');
    });

    it('claimJob: fails if job is already running or claimed by another worker', async () => {
      const { claimJob } = await import('@/lib/jobs');

      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({
                  data: [], // 0 rows updated
                  error: null,
                }),
              })),
            })),
          })),
        })),
      };

      const claimed = await claimJob('job-already-claimed', 'worker-node-2', {
        client: mockSupabase as any,
      });

      expect(claimed).toBe(false);
    });

    it('heartbeatJob: updates stage, progress, and heartbeat_at timestamp', async () => {
      const { heartbeatJob } = await import('@/lib/jobs');

      let recordedUpdates: any = null;
      const mockSupabase = {
        from: vi.fn(() => ({
          update: vi.fn((updates: any) => {
            recordedUpdates = updates;
            return {
              eq: vi.fn(() => ({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: 'job-hb-1', cancel_requested: false }],
                  error: null,
                }),
              })),
            };
          }),
        })),
      };

      const success = await heartbeatJob(
        'job-hb-1',
        { stage: 'RENTROLL_TABLE_PARSE', progress: 45 },
        { client: mockSupabase as any }
      );

      expect(success).toBe(true);
      expect(recordedUpdates.stage).toBe('RENTROLL_TABLE_PARSE');
      expect(recordedUpdates.progress).toBe(45);
      expect(recordedUpdates.heartbeat_at).toBeDefined();
    });

    it('cancelJob: cancels a queued job immediately', async () => {
      const { cancelJob } = await import('@/lib/jobs');

      let statusUpdatedTo: string | null = null;
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'job-q-1', status: 'queued' },
              }),
            })),
          })),
          update: vi.fn((updates: any) => {
            statusUpdatedTo = updates.status;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        })),
      };

      const result = await cancelJob('job-q-1', 'broker-owner', {
        client: mockSupabase as any,
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe('cancelled');
      expect(statusUpdatedTo).toBe('cancelled');
    });

    it('cancelJob: sets cancel_requested flag when job is running', async () => {
      const { cancelJob } = await import('@/lib/jobs');

      let cancelRequestedVal: boolean | null = null;
      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'job-run-1', status: 'running' },
              }),
            })),
          })),
          update: vi.fn((updates: any) => {
            cancelRequestedVal = updates.cancel_requested;
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          }),
        })),
      };

      const result = await cancelJob('job-run-1', 'broker-owner', {
        client: mockSupabase as any,
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe('cancel_requested');
      expect(cancelRequestedVal).toBe(true);
    });

    it('sweepStaleJobs: detects and marks timed_out jobs with heartbeats older than 90s', async () => {
      const { sweepStaleJobs } = await import('@/lib/jobs');

      const now = Date.now();
      const mockStaleJobs = [
        {
          id: 'job-timedout-1',
          status: 'running',
          attempt: 2,
          max_attempts: 2,
          heartbeat_at: new Date(now - 120 * 1000).toISOString(), // 120s ago (> 90s)
          deadline_at: new Date(now + 300 * 1000).toISOString(),
        },
      ];

      const mockSupabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: mockStaleJobs,
              error: null,
            }),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        })),
      };

      const result = await sweepStaleJobs(90, { client: mockSupabase as any });

      expect(result.sweptCount).toBe(1);
      expect(result.timedOutJobIds).toContain('job-timedout-1');
    });
  });
});
