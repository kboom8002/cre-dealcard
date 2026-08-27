import { describe, it, expect } from 'vitest';
import { buildDeckSequence } from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { buildMinimalDoc, BUILDING_META, extractSlideTexts } from './pptx-test-helpers';
import type { InvestmentPosture } from '@/domain/ontology';

/**
 * @file p1-gate-logic.test.ts
 * @description T15 (DCF/Sensitivity Suppress), T16 (Violation/Loan), T20 (Posture Fallback) 덱 시퀀서 및 렌더링 검증 테스트
 */
describe('MECE Phase 2 Gate Logic Tests', () => {
  describe('T15: DCF/Sensitivity Suppress Logic', () => {
    it('T15-01: Grade A + Pro -> DCF and Sensitivity slides present in sequence', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
      });
      const dcf = sequence.find(s => s.dataKey === 'dcf');
      const sensitivity = sequence.find(s => s.dataKey === 'sensitivity');
      expect(dcf).toBeDefined();
      expect(sensitivity).toBeDefined();
    });

    it('T15-02: Grade B + Pro -> DCF suppressed, Sensitivity suppressed, TotalReturn present', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'B',
      });
      const dcf = sequence.find(s => s.dataKey === 'dcf');
      const sensitivity = sequence.find(s => s.dataKey === 'sensitivity');
      const totalReturn = sequence.find(s => s.dataKey === 'totalReturn');
      expect(dcf).toBeUndefined();
      expect(sensitivity).toBeUndefined();
      expect(totalReturn).toBeDefined();
    });

    it('T15-03: Grade C + Pro -> DCF, Sensitivity, TotalReturn all suppressed', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'C',
      });
      const dcf = sequence.find(s => s.dataKey === 'dcf');
      const sensitivity = sequence.find(s => s.dataKey === 'sensitivity');
      const totalReturn = sequence.find(s => s.dataKey === 'totalReturn');
      expect(dcf).toBeUndefined();
      expect(sensitivity).toBeUndefined();
      expect(totalReturn).toBeUndefined();
    });

    it('T15-04: Verify suppress flags propagate correctly to rendered PPTX (Grade B Pro render -> no DCF text)', async () => {
      const renderer = new MobileImPptxRenderer();
      const input = {
        buildingId: 'test-building',
as const,
        posture: 'income' as InvestmentPosture,
        grade: 'B' as const,
        doc: buildMinimalDoc('income'),
        building: BUILDING_META['income'],
        hasViolation: false
      };
      
      const { buffer } = await renderer.render(input as any);
      const textMap = await extractSlideTexts(buffer);
      
      let hasDCF = false;
      for (const texts of textMap.values()) {
        if (texts.some(t => t.includes('DCF'))) {
          hasDCF = true;
        }
      }
      expect(hasDCF).toBe(false);
    }, 120_000);
  });

  describe('T16: Violation/Loan Conditional Slides', () => {
    it('T16-01: hasViolation=true -> loan slide suppressed in Pro deck sequence', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasViolation: true
      });
      const loan = sequence.find(s => s.dataKey === 'loan');
      expect(loan).toBeUndefined();
    });

    it('T16-02: hasViolation=false -> loan slide present in Pro deck sequence', () => {
      const sequence = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasViolation: false
      });
      const loan = sequence.find(s => s.dataKey === 'loan');
      expect(loan).toBeDefined();
    });

    it('T16-03: hasJointCollateral=true → 공동담보 경고 텍스트가 리스크 슬라이드에 표시됨', async () => {
      const renderer = new MobileImPptxRenderer();
      const input = {
        buildingId: 'test-building',
as const,
        posture: 'income' as InvestmentPosture,
        grade: 'A' as const,
        hasJointCollateral: true,
        doc: buildMinimalDoc('income'),
        building: BUILDING_META['income'],
      };
      const { buffer } = await renderer.render(input as any);
      const textMap = await extractSlideTexts(buffer);
      
      let foundRiskText = false;
      for (const texts of textMap.values()) {
        if (texts.some(t => t.includes('공동담보'))) {
          foundRiskText = true;
        }
      }
      // hasJointCollateral=true → 리스크 슬라이드에 공동담보 경고 블록이 주입되어야 함
      expect(foundRiskText).toBe(true);
    }, 120_000);

    it('T16-04: Full PPTX render with hasViolation=true -> no loan-related text in slides', async () => {
      const renderer = new MobileImPptxRenderer();
      const input = {
        buildingId: 'test-building',
as const,
        posture: 'income' as InvestmentPosture,
        grade: 'A' as const,
        hasViolation: true,
        doc: buildMinimalDoc('income'),
        building: BUILDING_META['income'],
      };
      
      const { buffer } = await renderer.render(input as any);
      const textMap = await extractSlideTexts(buffer);
      
      let hasLoanTitle = false;
      for (const texts of textMap.values()) {
        if (texts.some(t => t === '대출시나리오')) {
          hasLoanTitle = true;
        }
      }
      expect(hasLoanTitle).toBe(false);
    }, 120_000);
  });

  describe('T20: Posture Fallback Logic', () => {
    it('T20-01: posture=undefined -> falls back to income sequence in basic tier', () => {
      const sequence = buildDeckSequence({
        posture: undefined as any,
        grade: 'B'
      });
      const rentRoll = sequence.find(s => s.dataKey === 'rentRoll');
      expect(rentRoll).toBeDefined();
    });

    it('T20-02: posture=\'unknown_type\' -> falls back to income sequence in basic tier', () => {
      const sequence = buildDeckSequence({
        posture: 'unknown_type' as any,
        grade: 'B'
      });
      const rentRoll = sequence.find(s => s.dataKey === 'rentRoll');
      expect(rentRoll).toBeDefined();
    });

    it('T20-03: posture=\'\' (empty string) -> falls back to income sequence in basic tier', () => {
      const sequence = buildDeckSequence({
        posture: '' as any,
        grade: 'B'
      });
      const rentRoll = sequence.find(s => s.dataKey === 'rentRoll');
      expect(rentRoll).toBeDefined();
    });

    it('T20-04: All 5 valid postures produce non-empty deck sequences in pro tier', () => {
      const postures: InvestmentPosture[] = ['income', 'development', 'owner_occupied', 'operating', 'trading'];
      for (const p of postures) {
        const sequence = buildDeckSequence({
          posture: p,
          grade: 'B'
        });
        expect(sequence.length).toBeGreaterThan(0);
        expect(sequence.find(s => s.dataKey === 'cover')).toBeDefined();
      }
    });
  });
});
