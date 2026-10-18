import { describe, it, expect } from 'vitest';
import { buildBasicImSlideDefaults } from '@/domain/building/pptx-studio/studio-service';
import {
  applyStudioThemeOverrides,
  applyStudioSlideOverrides,
} from '@/domain/building/mobile-im/pptx/studio-overrides-applier';
import { PPTX_PRESET_TEMPLATES } from '@/domain/building/mobile-im/pptx/pptx-theme';
import type { SlideSpec } from '@/domain/building/mobile-im/pptx/deck-sequencer';

describe('PPTX Basic IM Studio — 10-Slide Defaults & Override Applier', () => {
  it('buildBasicImSlideDefaults generates all 10 canonical Basic IM slide override maps populated with real data', () => {
    const defaults = buildBasicImSlideDefaults(
      '영등포구 당산동5가 11-47 호산당빌딩',
      {
        ssot_summary: {
          building_name: '호산당빌딩',
          road_address: '서울특별시 영등포구 당산로 214',
          jibun_address: '당산동5가 11-47',
          asking_price_manwon: 1150000,
          land_area_sqm: 506.8,
          total_gross_area_sqm: 1017.85,
          zoning: '제2종일반주거지역',
          cap_rate_base: '2.08%',
          cap_rate_stabilized: '2.75%',
          station_name: '2·9호선 당산역',
          station_walk_min: 3,
        },
        broker_extras: {
          investment_points: [
            '2·9호선 당산역 도보 3분 초역세권 코너 입지',
            '1층 약국 및 내과의원 장기 우량 임차 100% 임대 완료',
            '인근 매물 평당가 대비 -44.6% 가격 경쟁력 및 리모델링 밸류애드 잠재력',
          ],
          closing_line: '호산당빌딩 최종 매입 검토 요약',
        },
        manual_comps: [
          {
            name: '당산동6가 331-1',
            address: '당산동6가 331-1',
            price: '126억',
            pyeongPrice: '8,200만/평',
          },
        ],
        photos_v2: [
          { url: 'https://example.com/photo1.jpg', caption: '전면 외관', role: 'hero', included: true },
        ],
      },
      {
        company_name: '강남빌딩부동산중개법인',
        display_name: '김대표',
        phone: '02-555-1234',
      }
    );

    const keys = Object.keys(defaults);
    expect(keys).toEqual([
      'cover',
      'highlights',
      'overview',
      'location',
      'land',
      'rentroll',
      'yield',
      'comps',
      'gallery',
      'closing',
    ]);

    expect(defaults.cover.title).toContain('호산당빌딩');
    expect(defaults.cover.askingPrice).toContain('115억');
    expect(defaults.cover.brokerCompany).toBe('강남빌딩부동산중개법인');
    expect(defaults.highlights.keyInvestmentPoint).toContain('당산역');
    expect(defaults.overview.zoning).toBe('제2종일반주거지역');
    expect(Array.isArray(defaults.comps.compsRows)).toBe(true);
    expect(defaults.comps.compsRows).toHaveLength(1);
    expect(Array.isArray(defaults.gallery.photos)).toBe(true);
    expect(defaults.gallery.photos).toHaveLength(1);
  });

  it('applyStudioThemeOverrides applies all 10 presets, custom brandAccent, coverStyle, layoutStyle, and headerFooter', () => {
    const baseTheme = PPTX_PRESET_TEMPLATES['credeal_basic'];

    // No overrides -> returns unchanged theme reference
    const untouched = applyStudioThemeOverrides(baseTheme, {});
    expect(untouched).toBe(baseTheme);

    const tenPresets = [
      'credeal_basic',
      'minimal_clean',
      'corporate_clean',
      'warm_beige',
      'wine_burgundy',
      'mono_contrast',
      'golden_institutional',
      'credeal_signature',
      'executive_gold',
      'pro_dark_obsidian',
    ];

    for (const presetId of tenPresets) {
      const themed = applyStudioThemeOverrides(baseTheme, {
        _studioThemeOverrides: {
          visualPreset: presetId,
          coverStyle: 'split',
          layoutStyle: 'executive',
        },
        _studioHeaderFooter: {
          companyName: '프리미엄중개법인',
          companyTagline: 'Commercial Real Estate Advisory',
          logoUrl: 'https://example.com/logo.png',
          confidentialityText: 'CONFIDENTIAL',
          footerDisclaimer: '본 자료는 참고용입니다.',
          showPageNumber: true,
          pageNumberFormat: 'total',
        },
      });
      // Must preserve presetId = 'credeal_basic' and 맑은 고딕 font for Basic IM renderer compatibility
      expect(themed.presetId).toBe('credeal_basic');
      expect(themed.titleFont).toBe('맑은 고딕');
      expect(themed.bg).toBe('FFFFFF');
      expect(themed.companyName).toBe('프리미엄중개법인');
      expect(themed.companyTagline).toBe('Commercial Real Estate Advisory');
      expect(themed.logoUrl).toBe('https://example.com/logo.png');
    }

    // Custom brandAccent override
    const customAccentTheme = applyStudioThemeOverrides(baseTheme, {
      _studioThemeOverrides: {
        visualPreset: 'minimal_clean',
        brandAccent: '#1E40AF',
      },
    });
    expect(customAccentTheme.accent).toBe('1E40AF');
  });

  it('applyStudioSlideOverrides applies 10-slide content overrides, hides optional slides, protects cover/closing, and reorders sequence', () => {
    const baseSeq: SlideSpec[] = [
      { archetype: 'A01_COVER', placement: 'body', title: '표지', kicker: 'COVER', dataKey: 'cover' },
      { archetype: 'A02_SUMMARY', placement: 'body', title: '요약', kicker: 'SUMMARY', dataKey: 'summary' },
      { archetype: 'A03_OVERVIEW', placement: 'body', title: '물건 개요', kicker: 'OVERVIEW', dataKey: 'building' },
      { archetype: 'A04_LOCATION', placement: 'body', title: '입지 정보', kicker: 'LOCATION', dataKey: 'location' },
      { archetype: 'A05_LAND', placement: 'body', title: '토지 정보', kicker: 'LAND', dataKey: 'land' },
      { archetype: 'A06_RENTROLL', placement: 'body', title: '렌트롤', kicker: 'RENT ROLL', dataKey: 'rentRoll' },
      { archetype: 'A07_YIELD', placement: 'body', title: '수익률', kicker: 'YIELD', dataKey: 'yieldFormula' },
      { archetype: 'A08_COMPS', placement: 'body', title: '인근 시세 비교', kicker: 'COMPS', dataKey: 'brokerComps' },
      { archetype: 'A09_GALLERY', placement: 'body', title: '사진첩', kicker: 'GALLERY', dataKey: 'gallery' },
      { archetype: 'A10_CLOSING', placement: 'closing', title: '문의 및 유의사항', kicker: 'CLOSING', dataKey: 'closing' },
    ];

    const dataMap: Record<string, any> = {
      cover: { title: '기존 표지', subtitle: '기존 주소', companyName: '기존중개', brokerName: '홍길동', brokerPhone: '010-0000-0000' },
      summary: { leadSentence: '기존 헤드라인', keyPoints: ['포인트1', '포인트2', '포인트3'] },
      building: { left: { sub: '', rows: [['소재지', '기존 주소']] } },
      location: { right: { sub: '', rows: [] } },
      land: { overviewRows: [['용도지역', '제2종일반주거지역']] },
      rentRoll: {},
      yieldFormula: { capRateAsIs: 2.08, capRateStabilized: 2.75 },
      brokerComps: {},
      gallery: { photos: [] },
      closing: { closingLine: '기존 마무리', disclaimer: '기존 면책', brokerContact: {} },
    };

    const resultSeq = applyStudioSlideOverrides(baseSeq, dataMap, {
      _studioSlideOverrides: {
        cover: {
          title: '수정한 호산당빌딩',
          subtitle: '서울 영등포구 당산로 214',
          askingPrice: '120억 원',
          brokerCompany: '에이원중개법인',
        },
        highlights: {
          leadSentence: '수정한 핵심 투자 요약 헤드라인',
          keyInvestmentPoint: '수정한 핵심 포인트 1',
          investmentPoint2: '수정한 핵심 포인트 2',
          investmentPoint3: '수정한 핵심 포인트 3',
        },
        land: {
          zoningInfo: '준공업지역',
          landCallout: '일조권 사선제한 없음 확인 완료',
        },
        yield: {
          capRateStabilized: '3.15%',
          stabilizedAssumption: '1층 리테일 재임대 시 +0.85%p 상승',
        },
        closing: {
          closingLine: '최종 투자 권고 요약 문구',
          brokerCompany: '에이원중개법인',
        },
      },
      _studioSlideTitles: {
        highlights: { title: '핵심 투자 하이라이트 (수정)', kicker: 'EXECUTIVE SUMMARY' },
      },
      // Try hiding cover (protected) and gallery (allowed)
      _studioHiddenDataKeys: ['cover', 'gallery'],
      // Move comps before yield
      _studioSlideOrder: [
        'cover',
        'highlights',
        'overview',
        'location',
        'land',
        'rentroll',
        'comps',
        'yield',
        'closing',
      ],
    });

    // Cover is protected and cannot be hidden; gallery is hidden -> 9 slides
    expect(resultSeq.some((s: SlideSpec) => s.dataKey === 'cover')).toBe(true);
    expect(resultSeq.some((s: SlideSpec) => s.dataKey === 'gallery')).toBe(false);
    expect(resultSeq).toHaveLength(9);

    // Order check: brokerComps comes before yieldFormula
    const compsIdx = resultSeq.findIndex((s: SlideSpec) => s.dataKey === 'brokerComps');
    const yieldIdx = resultSeq.findIndex((s: SlideSpec) => s.dataKey === 'yieldFormula');
    expect(compsIdx).toBeLessThan(yieldIdx);

    // Custom slide title check
    const execSlide = resultSeq.find((s: SlideSpec) => s.dataKey === 'summary')!;
    expect(execSlide.title).toBe('핵심 투자 하이라이트 (수정)');

    // DataMap overrides check
    expect(dataMap.cover.title).toBe('수정한 호산당빌딩');
    expect(dataMap.cover.companyName).toBe('에이원중개법인');
    expect(dataMap.summary.leadSentence).toBe('수정한 핵심 투자 요약 헤드라인');
    expect(dataMap.summary.keyPoints[0]).toBe('수정한 핵심 포인트 1');
    expect(dataMap.land.overviewRows[0][1]).toBe('준공업지역');
    expect(dataMap.yieldFormula.capRateStabilized).toBe(3.15);
    expect(dataMap.closing.closingLine).toBe('최종 투자 권고 요약 문구');
  });
});
