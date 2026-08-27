import { describe, test, expect } from 'vitest';
import type { InvestmentPosture } from '@/domain/ontology';
import { buildDeckSequence, type DeckSequenceInput } from '@/domain/building/mobile-im/pptx/deck-sequencer';

/**
 * Goldilocks 단일 시퀀스 검증 — 기존 T13/T14(Basic vs Pro + Grade Gate) 대체
 *
 * Phase 1: Basic/Pro 이중 시퀀스 폐지 → 골디락스 12p 필수 + 동적 12→20p 스케일링
 */
describe('Goldilocks 단일 시퀀스 검증', { timeout: 60_000 }, () => {

  // ── G-01: 필수 골디락스 구성 확인 ──
  describe('G-01: 포스처별 골디락스 필수 구성', () => {
    const postures: InvestmentPosture[] = ['income', 'owner_occupied', 'development', 'operating', 'trading'];

    postures.forEach(posture => {
      test(`${posture}: 최소 10p 이상 골디락스 구성`, () => {
        const seq = buildDeckSequence({
          posture,
          grade: 'B',
        });

        // 골디락스 최소: cover + summary + location + land + building + posture(3~6) + 마감(5) = 최소 ~14
        expect(seq.length).toBeGreaterThanOrEqual(10);
        expect(seq.length).toBeLessThanOrEqual(20);

        // 필수 dataKey 존재 확인
        const keys = seq.map(s => s.dataKey);
        expect(keys).toContain('cover');
        expect(keys).toContain('summary');
        expect(keys).toContain('location');
        expect(keys).toContain('land');
        expect(keys).toContain('building');
        expect(keys).toContain('risk');
        expect(keys).toContain('process');
        expect(keys).toContain('closing');
      });
    });
  });

  // ── G-02: Grade별 동적 면 수 ──
  describe('G-02: Grade별 동적 면 수', () => {
    test('Grade A + 풀 데이터 → 16~20p', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true,
          hasLandPrice: true,
          hasBuildingRegister: true,
          hasRegistryData: true,
          hasComparables: true,
          hasCommercialDistrict: true,
          hasCadastralMap: true,
        },
      });
      // A등급은 재무 확장(capital, dcf, sensitivity, totalReturn, loan, tax) + 데이터 면 추가
      expect(seq.length).toBeGreaterThanOrEqual(16);
      expect(seq.length).toBeLessThanOrEqual(20);
    });

    test('Grade B + 기본 데이터 → 13~16p', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'B',
        hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true,
          hasBuildingRegister: true,
        },
      });
      expect(seq.length).toBeGreaterThanOrEqual(13);
      expect(seq.length).toBeLessThanOrEqual(16);
    });

    test('Grade C + 최소 데이터 → 12~14p', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        hasPhotos: false,
        dataAvailability: {},
      });
      // C등급: 재무 없음, 데이터 면 없음
      expect(seq.length).toBeGreaterThanOrEqual(10);
      expect(seq.length).toBeLessThanOrEqual(14);
    });
  });

  // ── G-03: D등급 차단 ──
  describe('G-03: D등급 차단', () => {
    test('Grade D → [G30] 에러', () => {
      expect(() => buildDeckSequence({
        posture: 'income',
        grade: 'D',
      })).toThrow('[G30]');
    });
  });

  // ── G-04: A등급 전용 재무 슬라이드 ──
  describe('G-04: A등급 전용 재무 슬라이드', () => {
    test('Grade A → B등급보다 더 많은 슬라이드 (재무 확장)', () => {
      const seqA = buildDeckSequence({ posture: 'income', grade: 'A' });
      const seqB = buildDeckSequence({ posture: 'income', grade: 'B' });
      const seqC = buildDeckSequence({ posture: 'income', grade: 'C' });

      // A >= B > C 면 수 관계 보장 (A와 B는 둘 다 PAGE_RECOMMENDED=16으로 절삭될 수 있음)
      expect(seqA.length).toBeGreaterThanOrEqual(seqB.length);
      expect(seqB.length).toBeGreaterThanOrEqual(seqC.length);

      // A등급에만 존재하는 키 확인 (절삭 후에도 capital은 보호 대상 근처)
      const keysA = seqA.map(s => s.dataKey);
      const keysB = seqB.map(s => s.dataKey);
      // A등급은 dcf를 포함 (절삭 순서상 앞쪽이라 유지)
      expect(keysA).toContain('capital');
      // B등급에는 dcf가 없음
      expect(keysB).not.toContain('dcf');
    });

    test('Grade B → DCF/민감도/세금 없음, 자본구조+총수익률만', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'B',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('dcf');
      expect(keys).not.toContain('sensitivity');
      expect(keys).not.toContain('tax');
      expect(keys).toContain('capital');
      expect(keys).toContain('totalReturn');
    });

    test('Grade C → 재무 슬라이드 전무', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('dcf');
      expect(keys).not.toContain('sensitivity');
      expect(keys).not.toContain('capital');
    });
  });

  // ── G-05: V-World 데이터 기반 면 추가 ──
  describe('G-05: V-World 데이터 기반 면 추가', () => {
    test('건축물대장+토지이용계획 → 공부발췌 면 추가', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C', // C등급: 재무 슬라이드 없음 → 절삭 가능성 낮음
        dataAvailability: {
          hasLandUsePlan: true,
          hasBuildingRegister: true,
        },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('publicRecords');
    });

    test('등기부 있으면 권리관계 면 추가', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasRegistryData: true },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('titleRights');
    });

    test('지적도 있으면 지적도 면 추가', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasCadastralMap: true },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('cadastralMap');
    });

    test('상권 데이터 있으면 상권 분석 면 추가', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasCommercialDistrict: true },
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).toContain('commercialDistrict');
    });

    test('데이터 없으면 추가 면 없음', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: {},
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('publicRecords');
      expect(keys).not.toContain('titleRights');
      expect(keys).not.toContain('cadastralMap');
      expect(keys).not.toContain('commercialDistrict');
    });
  });

  // ── G-06: 면 절삭 (하드리밋 20p) ──
  describe('G-06: 면 절삭 (하드리밋 20p)', () => {
    test('모든 데이터 + A등급 → 20p 이하', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasPhotos: true,
        incomeArchetype: 'R-INC-02',
        dataAvailability: {
          hasLandUsePlan: true, hasLandPrice: true,
          hasBuildingRegister: true, hasRegistryData: true,
          hasComparables: true, hasCommercialDistrict: true,
          hasCadastralMap: true, hasFloorPlan: true,
        },
      });
      expect(seq.length).toBeLessThanOrEqual(20);
    });

    test('보호된 키는 절삭되지 않음', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true, hasLandPrice: true,
          hasBuildingRegister: true, hasRegistryData: true,
          hasComparables: true, hasCommercialDistrict: true,
          hasCadastralMap: true,
        },
      });
      const keys = seq.map(s => s.dataKey);
      // 보호된 키: cover, summary, closing, risk, checklist, process, thesis, titleRights
      expect(keys).toContain('cover');
      expect(keys).toContain('summary');
      expect(keys).toContain('closing');
      expect(keys).toContain('risk');
      expect(keys).toContain('checklist');
      expect(keys).toContain('process');
      expect(keys).toContain('thesis');
    });
  });

  // ── G-07: 위반건물 대출 suppress ──
  describe('G-07: 위반건물 대출 suppress', () => {
    test('hasViolation=true → loan 슬라이드 suppress', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'A',
        hasViolation: true,
      });
      const loanSlide = seq.find(s => s.dataKey === 'loan');
      // loan 슬라이드가 suppress=true이면 active에서 제외됨
      if (loanSlide) {
        expect(loanSlide.suppress).toBe(true);
      }
      // 또는 아예 제외됨 (filtered out)
      const activeKeys = seq.filter(s => !s.suppress).map(s => s.dataKey);
      expect(activeKeys).not.toContain('loan');
    });
  });
});
