import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateQuickImCard4,
  getQuickImRecord,
  deleteQuickImRecord,
} from '@/lib/im-lite/quick-generate-store';
import {
  validateBlindPoints,
  cleanBlindPoints,
  suggestFallbackRegion,
} from '@/lib/deal-card/blind-guard';
import { parseLegacyBand } from '@/lib/deal-card/price-band';
import {
  bandPrice,
  bandArea,
  bandCapRate,
  bandBuildingEra,
  bandFarHeadroom,
} from '@/domain/deal/teaser/banding';
import {
  formatBandedPrice,
  formatBandedYield,
} from '@/domain/dealcard/teaser-rules';
import {
  stripUngroundedNumbers,
  findUngroundedNumbers,
  repairDealCardLine,
} from '@/lib/deal-card/copy-limits';
import { toPublicDealCard } from '@/domain/public-projection/deal-card';
import { projectToTeaser } from '@/domain/deal/teaser/teaser-projector';
import { filterValidTiles } from '@/domain/teaser/filter-valid-tiles';

describe('Deal Card Pipeline Preemptive Contracts (DC-G1 ~ DC-G6)', () => {
  describe('DC-G1: QuickImStore updateQuickImCard4 Upsert & Malformed Payload Guard', () => {
    const testId = 'bld-contract-dc-g1';

    beforeEach(() => {
      deleteQuickImRecord(testId);
    });

    it('synthesizes a new StoredQuickImRecord when upserting valid Card4Data for a non-existent bld-* ID', () => {
      expect(getQuickImRecord(testId)).toBeNull();

      const updated = updateQuickImCard4(testId, {
        region: '강남구 역삼동',
        use: '업무시설',
        priceBand: '120~140억',
        headline: '강남구 역삼동 대로변 업무시설',
        posture: 'income',
        area: '연 약 420평',
        gfaPyung: 420,
        landAreaPyung: 130,
        points: [
          '역세권 도보 3분 오피스',
          '우량 임차인 전층 임차 중',
          '안정적 임대수익 확보',
        ],
        provenance: { points: ['broker', 'broker', 'broker'] },
        card4_version: 1,
        pointTones: ['amber', 'sky', 'mint'],
        pointBriefs: ['역세권', '우량 임차인', '안정 수익'],
      });

      expect(updated).not.toBeNull();
      expect(updated?.buildingId).toBe(testId);
      expect(updated?.card4?.region).toBe('강남구 역삼동');
      expect(updated?.card4?.area).toBe('연 약 420평');
      expect(updated?.card4?.pointTones).toEqual(['amber', 'sky', 'mint']);
      expect(updated?.card4?.pointBriefs).toEqual(['역세권', '우량 임차인', '안정 수익']);
      expect((updated?.fullDocBody as Record<string, unknown>)?.card4).toBeDefined();
      const ssotSummary = (updated?.fullDocBody as Record<string, unknown>)?.ssot_summary as
        | Record<string, unknown>
        | undefined;
      expect(ssotSummary?.area_signal).toBe('강남구 역삼동');
      expect(ssotSummary?.price_band).toBe('120~140억');
    });

    it('returns null when passed a malformed non-Card4Data object (PC-G6 compatibility)', () => {
      const result = updateQuickImCard4(
        'non-existent-malformed-id',
        { askingPriceManwon: 900000 } as unknown as Parameters<typeof updateQuickImCard4>[1]
      );
      expect(result).toBeNull();
    });
  });

  describe('DC-G2: blind-guard Road-Name, Particle-Suffixed Jibun/Building, and Mixed-Sentence Parcel Hardening', () => {
    it('detects road-name addresses with building numbers while allowing road names without numbers', () => {
      const leakCheck = validateBlindPoints([
        '테헤란로 152 오피스 빌딩',
        '양화로 161 코너 상가',
        '도산대로45길 18 신축 부지',
      ]);
      expect(leakCheck.isValid).toBe(false);
      expect(leakCheck.violations.length).toBeGreaterThanOrEqual(3);

      const safeCheck = validateBlindPoints([
        '테헤란로 대로변 가시성 우수',
        '양화로 코너 접근성 탁월',
      ]);
      expect(safeCheck.isValid).toBe(true);
    });

    it('detects particle-suffixed parcel numbers and building names', () => {
      const check = validateBlindPoints([
        '역삼동 147-8번지에 위치한 코너 자산',
        '호산당빌딩은 가시성이 우수함',
        '역삼아크플레이스센터에서 도보 2분',
      ]);
      expect(check.isValid).toBe(false);
      expect(check.violations.length).toBeGreaterThanOrEqual(3);
    });

    it('detects parcel numbers in mixed sentences while allowing floor/walk-minute ranges', () => {
      const mixedCheck = validateBlindPoints([
        '지하 1-2층, 역삼동 147-8',
        '147-8 대로변 코너',
      ]);
      expect(mixedCheck.isValid).toBe(false);
      expect(mixedCheck.violations.some((v) => v.keyword?.includes('147-8') || v.pointText.includes('147-8'))).toBe(true);

      const allowedCheck = validateBlindPoints([
        '지하 1-2층 근린생활시설 구성',
        '역에서 도보 3-5분 거리',
      ]);
      expect(allowedCheck.isValid).toBe(true);
    });

    it('cleanBlindPoints sanitizes road-name, jibun, and building-name leaks so re-validation passes', () => {
      const dirty = [
        '서울시 강남구 테헤란로 152 호산당빌딩은 가시성이 우수함',
        '지하 1-2층, 역삼동 147-8번지에 위치',
      ];
      const cleaned = cleanBlindPoints(dirty);
      const recheck = validateBlindPoints(cleaned);
      expect(recheck.isValid).toBe(true);
      expect(suggestFallbackRegion('서울시 강남구 역삼동 147-8')).toContain('강남구');
    });
  });

  describe('DC-G3: price-band & Teaser Banding Comma and NaN/Infinity Guards', () => {
    it('parseLegacyBand strips commas before matching 억대 so "1,200억대" never corrupts into "200~210억"', () => {
      const parsed = parseLegacyBand('1,200억대');
      expect(parsed?.label).toBe('1200~1250억');
      expect(parsed?.label).not.toBe('200~210억');
      expect(parsed?.minKrw).toBe(1200_0000_0000);
    });

    it('banding functions never emit NaN or Infinity on non-finite inputs', () => {
      expect(bandPrice(NaN)).not.toContain('NaN');
      expect(bandPrice(Infinity)).not.toContain('Infinity');
      expect(bandArea(NaN)).not.toContain('NaN');
      expect(String(bandCapRate(NaN))).not.toContain('NaN');
      expect(String(bandBuildingEra(NaN))).not.toContain('NaN');
      expect(String(bandFarHeadroom(NaN))).not.toContain('NaN');
      expect(formatBandedPrice(NaN)).not.toContain('NaN');
      expect(formatBandedPrice(5000_0000)).not.toBe('0억 원대');
      expect(formatBandedYield(NaN)).not.toContain('NaN');
    });
  });

  describe('DC-G4: copy-limits Grounded Number Boundary & Domain Noun Tail Preservation', () => {
    it('stripUngroundedNumbers preserves multi-digit grounded numbers like "14층" when stripping ungrounded "4"', () => {
      const { cleaned } = stripUngroundedNumbers('지상 14층 규모 오피스 4개 호실', '지상 14층');
      expect(cleaned).toContain('14층');
      expect(cleaned).not.toContain('1층 규모');
      expect(cleaned).not.toContain('4개');
    });

    it('findUngroundedNumbers requires grounded percentage evidence for "%" claims', () => {
      const ungrounded = findUngroundedNumbers('연 5% 수익률 기대', '지상 5층 도보 5분');
      expect(ungrounded.some((token) => token.includes('5'))).toBe(true);

      const grounded = findUngroundedNumbers('연 5% 수익률 기대', '수익률 5.0%');
      expect(grounded).toHaveLength(0);
    });

    it('repairDealCardLine preserves valid Korean CRE nouns ending in 가/과/로 without truncating last character', () => {
      expect(repairDealCardLine('대치동 핵심 학원가')).toBe('대치동 핵심 학원가');
      expect(repairDealCardLine('역세권 핵심 번화가')).toBe('역세권 핵심 번화가');
      expect(repairDealCardLine('우량 성형외과·피부과')).toBe('우량 성형외과·피부과');
      expect(repairDealCardLine('인근 대비 합리적 매매가')).toBe('인근 대비 합리적 매매가');
      expect(repairDealCardLine('마포구 핵심 양화로')).toBe('마포구 핵심 양화로');
    });
  });

  describe('DC-G5: toPublicDealCard Banded Asking Price & Sensitive Needle Masking', () => {
    it('masks road-name and building-name needles and uses banded midpoint for postureWidget.askingPriceEok', () => {
      const pub = toPublicDealCard({
        id: '00000000-0000-4000-8000-000000000001',
        building: {
          id: '00000000-0000-4000-8000-000000000001',
          address: '서울특별시 강남구 테헤란로 152',
          road_address: '서울특별시 강남구 테헤란로 152',
          jibun_address: '서울특별시 강남구 역삼동 737',
          building_name: '강남파이낸스빌딩',
          area_signal: '강남구 역삼동',
          asset_type: '업무시설',
          asking_price_manwon: 1234000, // 123.4억 exact
          total_floor_area_pyung: 450,
          land_area_pyung: 150,
          layers: {
            card4: {
              region: '강남구 역삼동',
              use: '업무시설',
              priceBand: '120~140억',
              headline: '테헤란로 152 강남파이낸스빌딩 매각',
              posture: 'value_add',
              points: [
                '테헤란로 152 코너 가시성 우수',
                '역삼동 737번지 역세권 입지',
                '밸류애드 리모델링 잠재력 풍부',
              ],
            },
          },
        } as unknown as Parameters<typeof toPublicDealCard>[0]['building'],
        signalCard: null,
        teaserDoc: null,
        brokerProfile: null,
        hasImDoc: false,
        isPptxApproved: false,
        pptxDownloadUrl: '',
      });

      expect(pub.hero.title).not.toContain('테헤란로 152');
      expect(pub.hero.title).not.toContain('강남파이낸스빌딩');
      for (const pt of pub.dealPoints) {
        expect(pt).not.toContain('테헤란로 152');
        expect(pt).not.toContain('737');
      }
      // 120~140억 midpoint is 130억 (never exact 123.4억)
      expect(pub.postureWidget?.askingPriceEok).toBe(130);
      expect(pub.postureWidget?.askingPriceEok).not.toBe(123.4);
      expect(pub.postureWidget?.posture).toBe('development');
    });
  });

  describe('DC-G6: projectToTeaser 8-Digit Approval Date & filterValidTiles NaN Guard', () => {
    it('parses 8-digit approvalDate ("20180615") into bandedBuildingEra without emitting NaN and filters out NaN/Infinity tiles', () => {
      const projected = projectToTeaser({
        region: '서초구 서초동',
        buildingType: '오피스',
        askingPriceKrw: 150_0000_0000,
        totalFloorAreaPyung: 380,
        approvalDate: '20180615',
      });

      const serialized = JSON.stringify(projected);
      expect(serialized).not.toContain('NaN');
      expect(projected.bandedBuildingEra).toBe('2010년대 후반 준공');

      const validTiles = filterValidTiles([
        { emoji: '🏗️', label: '준공', value: 'NaN년대 후반 준공' },
        { emoji: '📈', label: '수익률', value: 'Infinity%' },
        { emoji: '📐', label: '연면적', value: '300~500평' },
      ]);
      expect(validTiles).toHaveLength(1);
      expect(validTiles[0].label).toBe('연면적');
    });
  });
});
