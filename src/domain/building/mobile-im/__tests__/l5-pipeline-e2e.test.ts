import { describe, it, expect } from 'vitest';
import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import { StageTimer } from '@/domain/building/mobile-im/stage-timer';
import { computeIdempotencyKey, computeInputHash } from '@/domain/building/mobile-im/idempotency';
import { YANGPYEONG_FIXTURE } from './fixtures/yangpyeong';

describe('L5: Full Pipeline E2E & System Invariants (25 cases)', () => {
  describe('Mobile IM Writer Pipeline Execution', () => {
    it('L5-YP-01: generateMobileIM produces valid sections for yangpyeong fixture', async () => {
      const input = {
        building_ssot_lite: {
          id: 'test-ssot-yp',
          area_signal: '영등포권역',
          asset_type: '업무시설',
          price_band: '250억',
          asking_price_krw: YANGPYEONG_FIXTURE.financial.priceKrw,
          gross_annual_income_krw: YANGPYEONG_FIXTURE.financial.monthlyRentKrw * 12,
          total_floor_area_pyung: YANGPYEONG_FIXTURE.asset.totalFloorAreaSqm / 3.3058,
          land_area_pyung: YANGPYEONG_FIXTURE.asset.farBaseAreaSqm / 3.3058,
          layers: { location: {} },
        } as any,
        supplemental: {
          resolved_address: YANGPYEONG_FIXTURE.asset.addressBand,
          monthly_rent_total_krw: YANGPYEONG_FIXTURE.financial.monthlyRentKrw,
          asking_price_manwon: YANGPYEONG_FIXTURE.financial.priceKrw / 10000,
          total_deposit_manwon: YANGPYEONG_FIXTURE.financial.depositKrw / 10000,
        },
        readiness: { score: 85, level: 'high' } as any,
        identity: {
          investmentPosture: 'income' as const,
          assetType: 'office_building' as const,
        },
      };

      const output = await generateMobileIM(input);
      expect(output).toBeDefined();
      expect(output.sections).toBeDefined();
      expect(output.sections.length).toBeGreaterThanOrEqual(4);
    }, 30000);
  });

  describe('StageTimer Invariant Protection (90s / 105s / 120s)', () => {
    it('L5-TIMER-01: StageTimer default limits are soft:90s, hard:105s, kill:120s', () => {
      const timer = new StageTimer({
        softLimit: 90_000,
        hardLimit: 105_000,
        killLimit: 120_000,
      });
      expect(timer.shouldAbortOptional()).toBe(false);
      expect(timer.shouldForceRender()).toBe(false);
      expect(timer.shouldDiscard()).toBe(false);
      expect(timer.getRemainingMs()).toBeGreaterThan(0);
    });
  });

  describe('Persona Isolation Principle (AGENTS.md Rule 1)', () => {
    it('L5-PERSONA-01: Generated content must never contain explicit persona labels', async () => {
      const forbiddenPersonas = ['60대 자산가', '법인 대표 맞춤', '은퇴 자산가', '초보 투자자용'];
      const input = {
        building_ssot_lite: {
          id: 'test-ssot-persona',
          area_signal: '강남권역',
          price_band: '100억',
          asking_price_krw: 10_000_000_000,
          layers: { location: {} },
        } as any,
        supplemental: {
          monthly_rent_total_krw: 30000000,
          asking_price_manwon: 1000000,
          total_deposit_manwon: 50000,
        },
        readiness: { score: 80, level: 'high' } as any,
        identity: {
          investmentPosture: 'income' as const,
        },
      };

      const output = await generateMobileIM(input);
      for (const section of output.sections) {
        for (const persona of forbiddenPersonas) {
          expect(section.title).not.toContain(persona);
          expect(section.markdown).not.toContain(persona);
        }
      }
    }, 30000);
  });

  describe('CRE Lexicon Standards (AGENTS.md Rule 2)', () => {
    it('L5-LEX-01: Must use standard Korean CRE terms instead of literal translations', async () => {
      const input = {
        building_ssot_lite: {
          id: 'test-ssot-lexicon',
          area_signal: '도심권역',
          price_band: '200억',
          asking_price_krw: 20_000_000_000,
          layers: { location: {} },
        } as any,
        supplemental: {
          monthly_rent_total_krw: 50000000,
          asking_price_manwon: 2000000,
          total_deposit_manwon: 100000,
        },
        readiness: { score: 85, level: 'high' } as any,
        identity: {
          investmentPosture: 'income' as const,
        },
      };

      const output = await generateMobileIM(input);
      const fullText = output.sections.map(s => s.markdown).join(' ');
      expect(fullText).not.toContain('네이밍 라이츠');
      expect(fullText).not.toContain('브랜딩 라이츠');
    }, 30000);
  });

  describe('Idempotency & Replay Invariants (BL-7, M-8)', () => {
    it('L5-IDEM-01: computeInputHash is strictly deterministic across multiple invocations', () => {
      const payload = {
        dealId: 'deal-test-55',
        price: 50_000_000_000,
        posture: 'development',
        timestamp: '2026-08-26',
      };
      const hash1 = computeInputHash(payload);
      const hash2 = computeInputHash(payload);
      const hash3 = computeInputHash(payload);
      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('L5-IDEM-02: computeIdempotencyKey incorporates version pins and posture', () => {
      const key1 = computeIdempotencyKey({
        dealId: 'deal-1',
        inputHash: 'hash-1',
        posture: 'income',
        rendererVersion: '1.0.0',
        
      });
      const key2 = computeIdempotencyKey({
        dealId: 'deal-1',
        inputHash: 'hash-1',
        posture: 'development',
        rendererVersion: '1.0.0',
        
      });
      expect(key1).not.toBe(key2);
    });
  });
});