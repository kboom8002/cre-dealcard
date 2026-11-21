import { describe, it, expect, afterAll } from 'vitest';
import AdmZip from 'adm-zip';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import { setOfflineEnrichment } from '@/domain/building/mobile-im/pptx/basic-im-enrichment';
import { YIELD_LABELS, buildYieldSetFromBody } from '@/domain/building/mobile-im/yield-set';
import { resolveTenantAndUse } from '@/domain/building/mobile-im/pptx/binder/rent-roll-table-builder';
import { parseTsvRentRoll } from '@/lib/rent-roll/tsv-parser';
import {
  buildAuthoritativeImFactSheet,
  enforceNominalBulletStyle,
} from '@/domain/building/mobile-im/workspace-ai-enhancer';
import { getRegionalLandPriceRateSeries, computeLandPriceRateStats } from '@/lib/external/rone-api';

describe('CASE-01 (마포구 동교동 189-6, 77억) IM 고도화 통합 회귀 검증', () => {
  afterAll(() => {
    setOfflineEnrichment(null);
  });

  it('1. 현행(2.92%) ↔ 기대수익률(3.73%) 정밀 산출 및 (추정수익률) 문구 완전 제거', () => {
    expect(YIELD_LABELS.stabilizedBrokerPlan).toBe('기대수익률');
    expect(YIELD_LABELS.stabilizedTargetRent).toBe('기대수익률');
    expect(YIELD_LABELS.stabilizedBrokerPlan).not.toContain('추정수익률');

    const ys = buildYieldSetFromBody({
      asking_price_manwon: 770_000,
      ssot_summary: {
        asking_price_manwon: 770_000,
        total_deposit_manwon: 30_000,
        monthly_rent_total_krw: 18_000_000,
      },
      expected_rent_roll: [
        { floor: '5F', tenantName: '디자인A', use: '사무실', depositManwon: 5000, monthlyRentManwon: 400 },
        { floor: '4F', tenantName: '스타벅스', use: '스타벅스 / 카페', depositManwon: 5000, monthlyRentManwon: 500 },
        { floor: '3F', tenantName: '스튜디오C', use: '근린생활', depositManwon: 5000, monthlyRentManwon: 450 },
        { floor: '2F', tenantName: '병원D', use: '의원', depositManwon: 5000, monthlyRentManwon: 450 },
        { floor: '1F', tenantName: '리테일E', use: '판매시설', depositManwon: 10000, monthlyRentManwon: 500 },
      ],
    });

    // 현행: (1800 * 12) / (770000 - 30000) = 21600 / 740000 = 2.9189... -> 2.92%
    expect(ys.grossYieldNetOfDeposit).toBe(2.92);
    // 기대: (2300 * 12) / (770000 - 30000) = 27600 / 740000 = 3.7297... -> 3.73%
    expect(ys.stabilized?.value).toBe(3.73);
    expect(ys.stabilized?.label).toBe('기대수익률');
  });

  it('2. E-04 임차인/용도 중복(스타벅스 / 카페), E-05 공실해소 오인, AI 개조식 및 이상치 가드', () => {
    // E-04: 상호 prefix + ' / ' 제거
    expect(
      resolveTenantAndUse({ tenant_name: '스타벅스', use: '스타벅스 / 카페' }),
    ).toMatchObject({ tenant: '스타벅스', use: '카페', isVacant: false });

    // E-05: 비고/상태에 '공실해소'·'임대전환' 입력 시 공실 오인 금지
    const parsed = parseTsvRentRoll('4F\t신규임차\t카페\t120\t5000\t500\t50\t2028-12\t공실해소');
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0].status).toBe('occupied');
    expect((parsed.rows[0] as any).is_vacant).not.toBe(true);

    // Step 3 개조식 변환기
    const nominal = enforceNominalBulletStyle(
      '홍대입구역 도보 3분 초역세권 코너에 위치해 있습니다.\n리모델링 전환 후 연 3.73% 기대수익률이 제시됩니다.',
    );
    expect(nominal).not.toMatch(/있습니다|제시됩니다|합니다|입니다/);
    expect(nominal.trim().length).toBeGreaterThan(8);

    // 25% 초과 단위 오기(77만원 등) 이상치 차단
    const factSheet = buildAuthoritativeImFactSheet({
      title: '마포구 동교동 근생빌딩',
      address: '서울특별시 마포구 동교동 189-6',
      posture: 'income_producing',
      askingPriceManwon: 77,
      landAreaSqm: 280,
      gfaSqm: 980,
      totalRentManwon: 1800,
      totalDepositManwon: 30000,
    });
    expect(factSheet.grossYieldPct).toBe(0);
    expect(factSheet.netYieldPct).toBe(0);
  });

  it('3. 마포구 R-ONE 최근 5년(2021~2025) 연평균 지가변동률 +3.29% (누적 +17.6%) 검증', () => {
    const mapo = getRegionalLandPriceRateSeries({
      pnu: '1144011500101890006',
      address: '서울특별시 마포구 동교동 189-6',
    });
    expect(mapo).not.toBeNull();
    const last5 = mapo!.points.slice(-5);
    const stats5 = computeLandPriceRateStats(last5);
    expect(last5.map((p) => p.year)).toEqual(['2021', '2022', '2023', '2024', '2025']);
    expect(stats5.geometricMeanPct).toBe(3.29);
    expect(stats5.cumulativePct).toBe(17.59);
  });

  it('4. CASE-01 Basic IM PPTX 전 슬라이드 조립·OpenXML 정합 (표지 무번호, 기대수익률 이탤릭 diff, 용도지역·등급·용어)', async () => {
    setOfflineEnrichment({
      pnu: '1144011500101890006',
      landUsePlan: {
        nationalLaw: '도시지역, 제2종일반주거지역',
        otherLaws: '지구단위계획구역(서교·동교권)',
        article9_4: '-',
      },
      landPrice: {
        officialPricePerM2: 14_500_000,
        baseYear: '2025',
      },
      locationPoi: {
        nearestStation: { name: '홍대입구역 2호선', distanceM: 250, walkMinutes: 3 },
        poiCounts: { restaurant: 120, cafe: 85, convenience: 15 },
      },
      buildingRegister: {
        totalArea: 980.5,
        platArea: 285.2,
        archArea: 162.4,
        bcRat: 56.94,
        vlRat: 288.4,
        groundFloorCount: 5,
        undergroundFloorCount: 1,
        mainPurpose: '근린생활시설',
        useAprDay: '2018-06-15',
      },
    } as any);

    const floorLeases = [
      { floor: '5F', tenant_name: '디자인A', tenant_type: '사무실', area_sqm: 150, exclusive_area_sqm: 120, deposit_manwon: 5000, rent_manwon: 400, mgmt_fee_manwon: 40, lease_end: '2027-06' },
      { floor: '4F', tenant_name: '공실', tenant_type: '공실', is_vacant: true, area_sqm: 150, exclusive_area_sqm: 120, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0 },
      { floor: '3F', tenant_name: '스튜디오C', tenant_type: '근린생활', area_sqm: 160, exclusive_area_sqm: 130, deposit_manwon: 5000, rent_manwon: 450, mgmt_fee_manwon: 45, lease_end: '2027-03' },
      { floor: '2F', tenant_name: '병원D', tenant_type: '의원', area_sqm: 160, exclusive_area_sqm: 130, deposit_manwon: 5000, rent_manwon: 450, mgmt_fee_manwon: 45, lease_end: '2028-01' },
      { floor: '1F', tenant_name: '리테일E', tenant_type: '판매시설', area_sqm: 140, exclusive_area_sqm: 115, deposit_manwon: 15000, rent_manwon: 500, mgmt_fee_manwon: 50, lease_end: '2028-05' },
      { floor: 'B1', tenant_name: '공방F', tenant_type: '근린생활', area_sqm: 150, exclusive_area_sqm: 120, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0 },
    ];

    const expectedRentRoll = [
      { floor: '5F', tenantName: '디자인A', use: '사무실', leasableAreaSqm: 150, exclusiveAreaSqm: 120, depositManwon: 5000, monthlyRentManwon: 400, managementFeeManwon: 40, expiryDate: '2027-06' },
      { floor: '4F', tenantName: '스타벅스', use: '스타벅스 / 카페', leasableAreaSqm: 150, exclusiveAreaSqm: 120, depositManwon: 0, monthlyRentManwon: 500, managementFeeManwon: 50, expiryDate: '2028-12' },
      { floor: '3F', tenantName: '스튜디오C', use: '근린생활', leasableAreaSqm: 160, exclusiveAreaSqm: 130, depositManwon: 5000, monthlyRentManwon: 450, managementFeeManwon: 45, expiryDate: '2027-03' },
      { floor: '2F', tenantName: '병원D', use: '의원', leasableAreaSqm: 160, exclusiveAreaSqm: 130, depositManwon: 5000, monthlyRentManwon: 450, managementFeeManwon: 45, expiryDate: '2028-01' },
      { floor: '1F', tenantName: '리테일E', use: '판매시설', leasableAreaSqm: 140, exclusiveAreaSqm: 115, depositManwon: 15000, monthlyRentManwon: 500, managementFeeManwon: 50, expiryDate: '2028-05' },
      { floor: 'B1', tenantName: '공방F', use: '근린생활', leasableAreaSqm: 150, exclusiveAreaSqm: 120, depositManwon: 0, monthlyRentManwon: 0, managementFeeManwon: 0 },
    ];

    const renderer = new MobileImPptxRenderer();
    const res = await renderer.render({
      buildingId: 'case01-donggyo-189-6',
      preset: 'credeal_basic',
      posture: 'income',
      grade: 'B',
      docno: 'IM-CASE01',
      doc: {
        title: '마포구 동교동 근린생활시설 빌딩 (77억)',
        body: {
          preset: 'credeal_basic',
          asking_price_manwon: 770_000,
          floor_leases: floorLeases,
          expected_rent_roll: expectedRentRoll,
          heroCard: {
            posture: 'core_income',
            preset: 'credeal_basic',
            askingPriceDisplay: '77억 원',
            totalAreaDisplay: '980.5',
            investmentPoints: [
              '홍대입구역 도보 3분 더블역세권 코너 입지',
              '4층 공실 임대 전환 시 연 3.73% 기대수익률 확보',
            ],
          },
          ssot_summary: {
            pnu: '1144011500101890006',
            address: '서울특별시 마포구 동교동 189-6',
            asking_price_manwon: 770_000,
            land_area_sqm: 285.2,
            total_gross_area_sqm: 980.5,
            total_deposit_manwon: 30_000,
            monthly_rent_total_krw: 18_000_000,
            zoning: '제2종일반주거지역',
          },
        },
        sections: [
          { title: '요약', section_type: 'executive_summary', markdown: '- 매매 희망가: 77억 원\n- 연면적: 980.5㎡' },
          { title: '입지 분석', section_type: 'location', markdown: '### 입지 요약\n- 대중교통: 홍대입구역 도보 3분\n- 배후·상권: 연남·동교 상권 밀집' },
        ],
      },
      building: {
        address: '서울특별시 마포구 동교동 189-6',
        pnu: '1144011500101890006',
        land_area_sqm: 285.2,
        total_gross_area_sqm: 980.5,
      },
    });

    expect(res.buffer.length).toBeGreaterThan(50_000);
    const zip = new AdmZip(res.buffer);
    const slideEntries = zip
      .getEntries()
      .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
      .sort((a, b) => {
        const na = parseInt(a.entryName.match(/\d+/)![0], 10);
        const nb = parseInt(b.entryName.match(/\d+/)![0], 10);
        return na - nb;
      });
    const slideXmls = slideEntries.map((e) => e.getData().toString('utf-8'));
    const slideTexts = slideXmls.map((xml) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    const fullText = slideTexts.join(' ');

    // Q1-A: '렌트롤'·'(추정수익률)' 완전 제거
    expect(fullText).not.toContain('렌트롤');
    expect(fullText).not.toContain('(추정수익률)');

    // Cover unnumbered, Slide 2 (요약) numbered 01
    expect(slideXmls[0]).not.toMatch(/<a:t>0?[01]<\/a:t>/);
    expect(slideTexts[1]).toContain('요약');
    expect(slideXmls[1]).toMatch(/<a:t>0?1<\/a:t>/);

    // Slide 2: '연면적(총)' 제거 및 단위 표기
    expect(slideTexts[1]).not.toContain('연면적(총)');
    expect(slideTexts[1]).toContain('980.5㎡');

    // Slide 4 (입지): 4대 등급 카드 제거 및 '입지 요약' 콜아웃 타이틀 제거
    const locIdx = slideTexts.findIndex((t) => t.includes('입지 정보'));
    expect(locIdx).toBeGreaterThan(0);
    expect(slideTexts[locIdx]).not.toContain('도보 접근성');
    expect(slideTexts[locIdx]).not.toContain('상권 활성화');
    expect(slideTexts[locIdx]).not.toContain('입지 요약');

    // Slide 5 (토지): A27 줄바꿈 개선
    const landIdx = slideTexts.findIndex((t) => t.includes('■ 토지이용계획'));
    expect(landIdx).toBeGreaterThan(0);
    expect(slideTexts[landIdx]).toContain('관한 법률」 지역·지구등');

    // Slide 6 & 6-2: 층별 임대차 현황 + 기대수익률 임대차 현황(이탤릭·FDF8EC diff, 스타벅스/카페 비고 중복 제거)
    const rrIdx = slideTexts.findIndex((t) => t.includes('층별 임대차 현황'));
    const expIdx = slideTexts.findIndex((t) => t.includes('기대수익률 임대차 현황'));
    expect(rrIdx).toBeGreaterThan(0);
    expect(expIdx).toBeGreaterThan(rrIdx);
    expect(slideTexts[expIdx]).not.toContain('스타벅스 / 카페');
    expect(slideXmls[expIdx]).toContain('FDF8EC');
    expect(slideXmls[expIdx]).toMatch(/i="1"/);

    // Slide 7 (수익률): 마포구 최근 5년 연평균 지가변동률 +3.29%
    const yieldIdx = slideTexts.findIndex((t) => t.includes('현행 임대수익률'));
    expect(yieldIdx).toBeGreaterThan(0);
    expect(slideTexts[yieldIdx]).toContain('서울 마포구 최근 5년 연평균 지가변동률');
    expect(slideTexts[yieldIdx]).toContain('+3.29%');
    expect(slideTexts[yieldIdx]).not.toContain('10년 연평균 지가변동률');
    expect(slideTexts[yieldIdx]).toContain('3.73%');
  });
});
