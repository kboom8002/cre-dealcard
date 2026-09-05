import { describe, it, expect } from 'vitest';
import { TokenBinder } from '@/domain/building/pptx-studio/composition/token-binder';
import { buildEffectiveSnapshot } from '@/domain/building/im-core/evidence/effective-snapshot';
import { PublicationPackageBuilder } from '@/domain/building/im-core/publication/package-builder';

describe('TokenBinder M2 Snapshot & Null Safety Tests', () => {
  const binder = new TokenBinder();
  const builder = new PublicationPackageBuilder();

  const snapshot = buildEffectiveSnapshot({
    dealId: 'deal-pptx-m2',
    parcels: [{ parcelId: 'p-1', address: '서울특별시 강남구 역삼동 123-45', landAreaSqm: 850, status: 'SUCCESS' }],
    grossFloorArea: 3400,
    buildingAreaTotal: 450,
    pricing: {
      askingPriceKrw: 50000000000,
      monthlyRentKrw: 120000000,
      totalDepositKrw: 1000000000,
      monthlyAdminFeeKrw: 15000000,
    },
  });

  // Inject metadata for test
  (snapshot as any).buildingName = '강남 프라임 타워';
  (snapshot as any).builtYear = 2021;
  (snapshot as any).floorsAbove = 10;
  (snapshot as any).floorsBelow = 3;
  (snapshot as any).zoningDistrict = '일반상업지역';

  const pkg = builder.build({
    dealId: 'deal-pptx-m2',
    targetLevel: 'L1',
    snapshot,
    claims: {
      cap_rate: {
        claimId: 'c-1',
        subject: 'cap_rate',
        value: 4.8,
        unit: '%',
        predicate: 'EQUALS',
        confidenceScore: 0.95,
        targetTier: 'effective_baseline',
        verified: true,
        sourceRef: 'calc',
      },
    },
    rentrollTier: 'standard',
  });

  it('Positive Pair: Binds all snapshot tokens accurately', () => {
    const template = [
      '소재지: {{snapshot.address}}',
      '건물명: {{snapshot.building_name}}',
      '대지면적: {{snapshot.land_area}}',
      '연면적: {{snapshot.gross_floor_area}}',
      '건축면적: {{snapshot.building_area}}',
      '준공연도: {{snapshot.built_year}}',
      '지상층: {{snapshot.floors_above}}',
      '지하층: {{snapshot.floors_below}}',
      '용도지역: {{snapshot.zoning_district}}',
      '매매가: {{snapshot.asking_price}}',
      '월임대료: {{snapshot.monthly_rent}}',
      '보증금: {{snapshot.deposit}}',
      '월관리비: {{snapshot.monthly_admin_fee}}',
      'Cap Rate: {{claim.cap_rate}}',
    ].join('\n');

    const result = binder.bindTokens(template, pkg);

    expect(result).toContain('소재지: 서울특별시 강남구 역삼동 123-45');
    expect(result).toContain('건물명: 강남 프라임 타워');
    expect(result).toContain('대지면적: 850 ㎡');
    expect(result).toContain('연면적: 3,400 ㎡');
    expect(result).toContain('건축면적: 450 ㎡');
    expect(result).toContain('준공연도: 2021년');
    expect(result).toContain('지상층: 지상 10층');
    expect(result).toContain('지하층: 지하 3층');
    expect(result).toContain('용도지역: 일반상업지역');
    expect(result).toContain('매매가: 500억 원');
    expect(result).toContain('월임대료: 1.2억 원');
    expect(result).toContain('보증금: 10억 원');
    expect(result).toContain('월관리비: 1,500만 원');
    expect(result).toContain('Cap Rate: 4.8 %');
  });

  it('Negative Pair: Missing or undefined snapshot properties gracefully format as fallback string', () => {
    const bareSnapshot = buildEffectiveSnapshot({
      dealId: 'deal-pptx-bare',
      parcels: [{ parcelId: 'p-bare', address: '', landAreaSqm: 100, status: 'SUCCESS' }],
      grossFloorArea: 200,
      pricing: { askingPriceKrw: 1000000000 },
    });

    const barePkg = builder.build({
      dealId: 'deal-pptx-bare',
      targetLevel: 'L1',
      snapshot: bareSnapshot,
      claims: {
        null_claim: {
          claimId: 'c-null',
          subject: 'null_claim',
          value: null as any,
          unit: '',
          predicate: 'EQUALS',
          confidenceScore: 0.5,
          targetTier: 'effective_baseline',
          verified: false,
          sourceRef: 'calc',
        },
      },
      rentrollTier: 'standard',
    });

    const template = '건물명: {{snapshot.building_name}}, 준공: {{snapshot.built_year}}, 클레임: {{claim.null_claim}}';
    const result = binder.bindTokens(template, barePkg);
    expect(result).toBe('건물명: -, 준공: -, 클레임: -');
  });

  it('Negative Pair: Unmapped token throws UNKNOWN_TOKEN_VIOLATION', () => {
    const template = '미등록 토큰: {{snapshot.non_existent_token}}';
    expect(() => binder.bindTokens(template, pkg)).toThrowError(/UNKNOWN_TOKEN_VIOLATION/);
  });
});
