import { describe, it, expect } from 'vitest';
import {
  fitBox,
  coverCropRatio,
  textH,
  gridFit,
  checkCropRatio,
  checkEffectiveDpi,
  checkOverflow,
  checkOverlap,
  checkBleed,
  SLIDE_W,
  SLIDE_H,
  CROP_BLOCK_THRESHOLD,
  MIN_DPI_CAPTURE,
  MIN_DPI_PHOTO,
} from '@/domain/building/mobile-im/pptx/utils/layout-physics';
import { runPublishGates } from '@/domain/building/mobile-im/quality-gates-v02';

// ─── 테스트 헬퍼: 유효 게이트 컨텍스트 ──────────────────────────────────────────
function createValidGateContext(overrides?: Record<string, any>) {
  return {
    capRateResults: [{ basis: 'NOI' }],
    totalReturnScenarios: [{ label: '하락', totalReturnPct: -5 }],
    parcels: [{ exclusions: [], area: 500 }],
    leaseUnits: [{ convertedDeposit: 1000, opposingPower: true }],
    disclosureDcf: 'hidden',
    disclosureIrr: 'hidden',
    termExplanationExists: true,
    effectiveLandArea: 500,
    effectiveFAR: 350,
    calculatedEffectiveFAR: 350,
    salePrice: 25_000_000_000,
    area: 3000,
    address: '서울특별시 영등포구 양평동',
    dataGrade: 'A',
    crossValidationPassed: true,
    hasHallucination: false,
    piiRemoved: true,
    hasRiskExpression: false,
    imJudgeScore: 4.0,
    threeAxisConfirmed: true,
    dcfGradeGatePassed: true,
    leaseActConfirmed: true,
    renewalRightConfirmed: true,
    mixedUseConfirmed: true,
    illegalArchitectureConfirmed: true,
    imagePiiConfirmed: true,
    // D31 기본값
    maxCropRatio: 0,
    minEffectiveDpi: 200,
    textOverflowCount: 0,
    overlapMaxInches: 0,
    bleedCount: 0,
    ...overrides,
  } as any;
}

describe('L4: Layout Physics & D31 지면 물리 검사 (8 cases)', () => {
  // ─── L4-CROP-01: 전 사진 크로핑률 ≤ 25% ─────────────────────────────────────
  describe('G31: 사진 크로핑률', () => {
    it('L4-CROP-01: fitBox contain-fit produces 0% crop ratio', () => {
      // 2078×1289 원본을 6.00×3.00in 최대 영역에 contain
      const result = fitBox(2078, 1289, 6.00, 3.00);
      expect(result.cropRatio).toBe(0); // contain → 크로핑 0
      expect(result.w).toBeLessThanOrEqual(6.00);
      expect(result.h).toBeLessThanOrEqual(3.00);

      // cover-fit 시뮬레이션: 비율이 비슷한 상자에서 크로핑률 확인
      // 원본 1.61 vs 상자 2.0 비율 → 소량 크로핑
      const cropR = coverCropRatio(2078, 1289, 6.00, 3.00);
      expect(cropR).toBeLessThanOrEqual(0.25);

      // 극단적 비율 차이: 세로 원본(0.67)을 가로 상자(4.55)에 cover → 큰 크로핑
      const badCropR = coverCropRatio(2078, 3100, 6.00, 1.32);
      expect(badCropR).toBeGreaterThan(0.25);
    });

    it('L4-CROP-02: 45% 초과 사진 주입 시 G31 차단 (negative)', () => {
      // 세로 사진 (0.89 비율)을 가로 상자 (13.33×7.50 = 1.78 비율)에 cover
      const crop = coverCropRatio(1049, 1174, 13.33, 7.50);
      expect(crop).toBeGreaterThan(CROP_BLOCK_THRESHOLD);

      // 게이트 차단 확인
      const result = runPublishGates(createValidGateContext({ maxCropRatio: crop }));
      expect(result.failedBlocks.map(f => f.id)).toContain('G31');
      expect(result.blocked).toBe(true);

      // checkCropRatio 직접 호출
      const check = checkCropRatio(1049, 1174, 13.33, 7.50, '표지 사진');
      expect(check).not.toBeNull();
      expect(check!.severity).toBe('violation');
    });
  });

  // ─── L4-DPI-01 / L4-DPI-02: 실효 DPI ─────────────────────────────────────────
  describe('G32: 실효 DPI', () => {
    it('L4-DPI-01: 전 사진 실효 DPI ≥ 하한', () => {
      // 1800×1200 사진을 6.00in 에 놓음 → 300 DPI
      const result = fitBox(1800, 1200, 6.00, 4.00, MIN_DPI_CAPTURE);
      expect(result.effectiveDpi).toBeGreaterThanOrEqual(MIN_DPI_CAPTURE);
      expect(result.shrunk).toBe(false);

      // 게이트 통과 확인
      const gateResult = runPublishGates(createValidGateContext({ minEffectiveDpi: result.effectiveDpi }));
      expect(gateResult.failedBlocks.map(f => f.id)).not.toContain('G32');
    });

    it('L4-DPI-02: 저해상도 원본을 큰 상자에 넣으면 자동 축소 (negative)', () => {
      // 561×420 사진을 6.00in 에 놓음 → 실효 93 DPI → 하한 150 미달
      const result = fitBox(561, 420, 6.00, 4.00, MIN_DPI_CAPTURE);
      expect(result.shrunk).toBe(true);
      // 축소 후 DPI 는 하한 이상
      expect(result.effectiveDpi).toBeGreaterThanOrEqual(MIN_DPI_CAPTURE);
      // 축소 후 상자는 원래보다 작아짐
      expect(result.w).toBeLessThan(6.00);

      // DPI 검사 직접 호출
      const check = checkEffectiveDpi(561, 420, 6.00, 4.00, MIN_DPI_CAPTURE, '저해상도 사진');
      expect(check).not.toBeNull();
      expect(check!.gate).toBe('G32');
    });
  });

  // ─── L4-OVF-01 / L4-OVF-02: 텍스트 넘침 ─────────────────────────────────────
  describe('G33: 텍스트 상자 넘침', () => {
    it('L4-OVF-01: 텍스트 넘침 0', () => {
      // 짧은 텍스트를 충분한 상자에 넣음
      const h = textH('테스트 캡션', 4.0, 9, 1.3);
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThan(0.30); // 한 줄 텍스트는 0.30in 미만

      // 게이트 통과 확인
      const gateResult = runPublishGates(createValidGateContext({ textOverflowCount: 0 }));
      expect(gateResult.failedBlocks.map(f => f.id)).not.toContain('G33');
    });

    it('L4-OVF-02: 문구를 두 줄로 늘려도 상자가 따라 커짐 (negative)', () => {
      const shortText = '캡션 1줄';
      const longText = '이것은 매우 긴 캡션입니다. 두 줄 이상 되어야 하는 긴 문구를 테스트합니다.';

      const h1 = textH(shortText, 3.0, 9, 1.3);
      const h2 = textH(longText, 3.0, 9, 1.3);

      // 긴 텍스트는 더 높은 상자 필요
      expect(h2).toBeGreaterThan(h1);

      // 고정 높이 0.20in 에 넣으면 넘침 발생
      const check = checkOverflow(longText, 3.0, 0.20, 9, 1.3, '캡션');
      expect(check).not.toBeNull();
      expect(check!.gate).toBe('G33');

      // textH 로 계산된 높이를 쓰면 넘침 0
      const check2 = checkOverflow(longText, 3.0, h2, 9, 1.3, '캡션');
      expect(check2).toBeNull();
    });
  });

  // ─── L4-OVL-01: 요소 겹침 ─────────────────────────────────────────────────────
  describe('G34: 요소 겹침', () => {
    it('L4-OVL-01: 요소 겹침 0', () => {
      // 두 요소가 떨어져 있음
      const check = checkOverlap(
        { x: 0.5, y: 1.0, w: 3.0, h: 2.0 },
        { x: 4.0, y: 1.0, w: 3.0, h: 2.0 },
        '제목', '본문',
      );
      expect(check).toBeNull();

      // 게이트 통과 확인
      const gateResult = runPublishGates(createValidGateContext({ overlapMaxInches: 0 }));
      expect(gateResult.failedWarns.map(f => f.id)).not.toContain('G34');
    });
  });

  // ─── L4-BLEED-01: 지면 이탈 ─────────────────────────────────────────────────
  describe('G35: 지면 이탈', () => {
    it('L4-BLEED-01: 지면 이탈 0', () => {
      // 슬라이드 경계 안에 있는 요소
      const check = checkBleed(
        { x: 0.5, y: 0.5, w: 12.0, h: 6.0 },
        '본문 블록',
      );
      expect(check).toBeNull();

      // 경계를 넘는 요소
      const checkOut = checkBleed(
        { x: 12.0, y: 0, w: 2.0, h: 1.0 },
        '이탈 요소',
      );
      expect(checkOut).not.toBeNull();
      expect(checkOut!.gate).toBe('G35');

      // 배경 요소는 이탈 허용
      const checkBg = checkBleed(
        { x: -0.5, y: -0.5, w: 14.333, h: 8.5 },
        '배경',
        true,
      );
      expect(checkBg).toBeNull();

      // 게이트 통과 확인
      const gateResult = runPublishGates(createValidGateContext({ bleedCount: 0 }));
      expect(gateResult.failedBlocks.map(f => f.id)).not.toContain('G35');
    });
  });
});
