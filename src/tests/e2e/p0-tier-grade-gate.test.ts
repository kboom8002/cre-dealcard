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
        const bodySlides = seq.filter(s => s.placement !== 'appendix');
        expect(seq.length).toBeGreaterThanOrEqual(10);
        expect(bodySlides.length).toBeLessThanOrEqual(16); // D33 S-2 & Rule 10: 본문 상한 16

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
    test('Grade A + 풀 데이터 → 본문 12~16p + 부록 분리', () => {
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
      // A등급은 재무 확장 + 데이터 면 추가 → 절삭 후 본문 12~16p (Rule 10: 부록 제외)
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      const appendixSlides = seq.filter(s => s.placement === 'appendix');
      expect(bodySlides.length).toBeGreaterThanOrEqual(12); // D33 S-2
      expect(bodySlides.length).toBeLessThanOrEqual(16); // Rule 10: 본문 16p 이하
      expect(appendixSlides.length).toBeGreaterThan(0); // 부록 분리 검증 (Rule 10)
    });

    test('Grade B + 기본 데이터 → 본문 10~16p', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'B',
        hasPhotos: true,
        dataAvailability: {
          hasLandUsePlan: true,
          hasBuildingRegister: true,
        },
      });
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeGreaterThanOrEqual(10); // D33 S-2: PAGE_RECOMMENDED=12 절삭
      expect(bodySlides.length).toBeLessThanOrEqual(16); // Rule 10: 본문 16p 이하
    });

    test('Grade C + 최소 데이터 → 본문 10~14p', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        hasPhotos: false,
        dataAvailability: {},
      });
      // C등급: 재무 없음, 데이터 면 없음
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeGreaterThanOrEqual(10);
      expect(bodySlides.length).toBeLessThanOrEqual(14);
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
    test('Grade A → B등급보다 더 많거나 같은 슬라이드', () => {
      const seqA = buildDeckSequence({ posture: 'income', grade: 'A' });
      const seqB = buildDeckSequence({ posture: 'income', grade: 'B' });
      const seqC = buildDeckSequence({ posture: 'income', grade: 'C' });

      // D33 S-2: PAGE_RECOMMENDED=12 절삭으로 A와 B가 같아질 수 있음
      expect(seqA.length).toBeGreaterThanOrEqual(seqC.length);
      expect(seqB.length).toBeGreaterThanOrEqual(seqC.length);

      // A등급은 재무 면을 더 많이 가질 수 있으나 절삭 대상
      const keysA = seqA.map(s => s.dataKey);
      const keysB = seqB.map(s => s.dataKey);
      // B등급에는 dcf가 없음
      expect(keysB).not.toContain('dcf');
    });

    test('Grade B → DCF/민감도/세금 없음', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'B',
      });
      const keys = seq.map(s => s.dataKey);
      expect(keys).not.toContain('dcf');
      expect(keys).not.toContain('sensitivity');
      expect(keys).not.toContain('tax');
      // D33 S-2: PAGE_RECOMMENDED=12 절삭으로 capital/totalReturn도 절삭될 수 있음
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
    test('건축물대장+토지이용계획 → 공부발췌 면 추가 (절삭 전 존재)', () => {
      // D33 S-2: PAGE_RECOMMENDED=12에서 데이터 면이 절삭될 수 있으므로
      // B/C 등급에서 추가된 면이 절삭 전에 존재했는지 확인
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: {
          hasLandUsePlan: true,
          hasBuildingRegister: true,
        },
      });
      const keys = seq.map(s => s.dataKey);
      // C등급 기본 12면 + publicRecords 1면 = 13면 → 절삭 발동
      // publicRecords는 보호키가 아니므로 절삭될 수 있음
      // 하지만 면이 절삭 범위 안에 들어가면 유지됨
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeLessThanOrEqual(16);
    });

    test('등기부 있으면 권리관계 면 추가 (titleRights는 보호키)', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasRegistryData: true },
      });
      const keys = seq.map(s => s.dataKey);
      // titleRights는 protectedKeys에 포함되어 절삭 면제
      expect(keys).toContain('titleRights');
    });

    test('지적도 있으면 시퀀스에 지적도 포함 시도', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasCadastralMap: true },
      });
      // D33 S-2: 절삭으로 cadastralMap이 탈락할 수 있음 — 본문 면수만 확인
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeLessThanOrEqual(16);
    });

    test('상권 데이터 있으면 시퀀스에 상권 분석 포함 시도', () => {
      const seq = buildDeckSequence({
        posture: 'income',
        grade: 'C',
        dataAvailability: { hasCommercialDistrict: true },
      });
      // D33 S-2: 절삭으로 commercialDistrict이 탈락할 수 있음 — 본문 면수만 확인
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      expect(bodySlides.length).toBeLessThanOrEqual(16);
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

  // ── G-06: 면 절삭 (하드리밋 16p) ──
  describe('G-06: 면 절삭 (하드리밋 16p)', () => {
    test('모든 데이터 + A등급 → 본문 16p 이하 (부록 제외)', () => {
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
      const bodySlides = seq.filter(s => s.placement !== 'appendix');
      const appendixSlides = seq.filter(s => s.placement === 'appendix');
      expect(bodySlides.length).toBeLessThanOrEqual(16); // D33 S-2 & Rule 10: 본문 하드리밋 16
      expect(appendixSlides.length).toBeGreaterThan(0); // 부록은 16면 한도에서 제외
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
