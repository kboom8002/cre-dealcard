import { describe, it, expect, vi } from 'vitest';
import {
  Card4Schema,
  computeCard4Hash,
  updateDealCard4,
  type Card4Data,
} from '@/lib/deal-card/card4-schema';

describe('WP-P1-03: Card4Schema & Atomic Update', () => {
  describe('Card4Schema Validation', () => {
    it('validates a correct 4-item card schema', () => {
      const validCard: Card4Data = {
        region: '강남구 신사동',
        use: '근린생활시설',
        priceBand: '90~100억',
        points: ['대로변 코너 각지', '대지 120평 연면적 350평', '수익률 4.2% 안정적'],
        provenance: {
          points: ['public', 'broker', 'ai'],
        },
        card4_version: 1,
      };

      const result = Card4Schema.safeParse(validCard);
      expect(result.success).toBe(true);
    });

    it('rejects cards with missing items or points not being a 3-tuple', () => {
      const invalidCard = {
        region: '강남구',
        use: '근생',
        priceBand: '90~100억',
        points: ['포인트 1', '포인트 2'], // only 2 points
      };

      const result = Card4Schema.safeParse(invalidCard);
      expect(result.success).toBe(false);
    });
  });

  describe('computeCard4Hash Determinism', () => {
    it('generates deterministic SHA-256 hash for identical items', () => {
      const cardA = {
        region: '강남구 신사동',
        use: '근린생활시설',
        priceBand: '90~100억',
        points: ['포인트 1', '포인트 2', '포인트 3'],
      };

      const cardB = {
        region: '강남구 신사동',
        use: '근린생활시설',
        priceBand: '90~100억',
        points: ['포인트 1', '포인트 2', '포인트 3'],
      };

      const hashA = computeCard4Hash(cardA);
      const hashB = computeCard4Hash(cardB);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });

    it('trims leading/trailing whitespace before hashing', () => {
      const cardTrimmed = {
        region: '강남구 신사동',
        use: '근린생활시설',
        priceBand: '90~100억',
        points: ['포인트 1', '포인트 2', '포인트 3'],
      };

      const cardSpaced = {
        region: ' 강남구 신사동 ',
        use: ' 근린생활시설 ',
        priceBand: ' 90~100억 ',
        points: [' 포인트 1 ', ' 포인트 2 ', ' 포인트 3 '],
      };

      expect(computeCard4Hash(cardTrimmed)).toBe(computeCard4Hash(cardSpaced));
    });

    it('produces completely different hash if any single character changes', () => {
      const cardBase = {
        region: '강남구 신사동',
        use: '근린생활시설',
        priceBand: '90~100억',
        points: ['포인트 1', '포인트 2', '포인트 3'],
      };

      const cardModified = {
        ...cardBase,
        priceBand: '90~110억',
      };

      expect(computeCard4Hash(cardBase)).not.toBe(computeCard4Hash(cardModified));
    });
  });

  describe('updateDealCard4 Atomic Update with Optimistic Locking', () => {
    it('detects 409 version conflict when expectedVersion mismatches current version', async () => {
      // Mock Supabase client returning existing doc with version 3
      const mockSupabase: any = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: 'doc-1',
                        body: {
                          card4: { card4_version: 3 },
                        },
                      },
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          })),
        })),
      };

      const result = await updateDealCard4(mockSupabase, 'bldg-1', {
        card4: {
          region: '강남구 신사동',
          use: '근린생활시설',
          priceBand: '90~100억',
          points: ['P1', 'P2', 'P3'],
        },
        expectedVersion: 2, // Mismatch: current is 3
      });

      expect(result.success).toBe(false);
      expect(result.conflict).toBe(true);
      expect(result.currentVersion).toBe(3);
      expect(result.error).toContain('409 Version Conflict');
    });

    it('successfully increments version and updates doc when versions match', async () => {
      let updatedPayload: any = null;

      const mockSupabase: any = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({
                      data: {
                        id: 'doc-1',
                        body: {
                          card4: { card4_version: 2 },
                        },
                      },
                      error: null,
                    })),
                  })),
                })),
              })),
            })),
          })),
          update: vi.fn((payload: any) => {
            if (table === 'document_objects') {
              updatedPayload = payload;
            }
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        })),
      };

      const result = await updateDealCard4(mockSupabase, 'bldg-1', {
        card4: {
          region: '강남구 신사동',
          use: '근린생활시설',
          priceBand: '90~100억',
          points: ['P1', 'P2', 'P3'],
        },
        expectedVersion: 2, // Matches current version 2
      });

      expect(result.success).toBe(true);
      expect(result.version).toBe(3); // Bumped to 3
      expect(result.hash).toBeDefined();
      expect(result.card4?.card4_version).toBe(3);
      expect(updatedPayload.body.card4.card4_version).toBe(3);
    });
  });
});
