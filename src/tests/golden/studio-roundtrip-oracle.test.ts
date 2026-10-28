/**
 * @file src/tests/golden/studio-roundtrip-oracle.test.ts
 * @description Basic IM Studio 왕복(Round-Trip) 사실 오라클 + 다지면 확장(렌트롤 2면·갤러리 2면) 및 U1~U6 역검증 테스트.
 *
 * 1. CORE_GOLDEN_NAMES (8대 코어 골든, income-wellbing-r3 포함) 전체에 대해:
 *    extractRealInitialOverrides(doc.body) → _studioSlideOverrides 주입 → MobileImPptxRenderer.render()
 *    경로로 생성된 PPTX 가 expected_facts.json 및 U1~U6 범용 불변식을 100% 통과하는지 검증.
 * 2. U1~U6 범용 불변식이 실제 결함 텍스트(단독 호실번호 바, 공실 〃, 46316 시리얼, 이중 역 접미사, 층수·규모 중복, 3자리 소수 면적)를
 *    누락 없이 FAIL 로 잡아내는지 역검증(Negative Oracle Test).
 * 3. 12층·20호실 + 12장 사진(대표사진 index 3) 매물에 대해 실제 PPTX 바이너리를 렌더링하여
 *    임대차 현황 (1/2)·(2/2) 및 현장 사진 (1/2)·(2/2) 다지면 확장과 U1~U6 불변식을 검증.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  CORE_GOLDEN_NAMES,
  hasSnapshot,
  installOfflineGuard,
  resetOfflineGuardLog,
  loadExpectedFacts,
  loadSnapshot,
  loadPoiPool,
  buildRenderInput,
  extractSlideTexts,
  viewerTextOf,
} from '../../../scripts/golden-snapshot/lib';
import { evaluateOracle, type ExpectedFacts } from './oracle-engine';
import { buildBasicImSlideDefaults, studioService } from '../../domain/building/pptx-studio/studio-service';
import { applyStudioSlideOverrides } from '../../domain/building/mobile-im/pptx/studio-overrides-applier';
import { setOfflineEnrichment } from '../../domain/building/mobile-im/pptx/basic-im-enrichment';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';

const STRICT = process.env.ORACLE_STRICT === '1';

describe('Basic IM Studio Round-Trip Fact Oracle & Universal Invariants (U1-U6)', () => {
  beforeAll(async () => {
    await installOfflineGuard();
  });

  for (const name of CORE_GOLDEN_NAMES) {
    const facts = loadExpectedFacts(name);
    const present = !!facts && hasSnapshot(name);
    (present ? it : it.skip)(`Studio round-trip oracle: ${name}`, async () => {
      resetOfflineGuardLog();
      const snap = loadSnapshot(name);
      setOfflineEnrichment(snap.liveEnrichment ?? null);

      const studioOverrides = buildBasicImSlideDefaults(
        snap.doc.title || 'Basic IM',
        snap.doc.body,
        snap.broker ?? undefined,
      );
      snap.doc.body = {
        ...snap.doc.body,
        _studioSlideOverrides: studioOverrides,
      };

      const input = await buildRenderInput(snap);
      const pool = loadPoiPool(name);
      if (pool) input.landmarkPoolFixture = pool;

      const out = await new MobileImPptxRenderer().render(input as any);
      const slides = extractSlideTexts(out.buffer);
      const pptxText = slides.join('\n');
      const viewerText = viewerTextOf(snap.doc.body);

      const res = evaluateOracle(facts, { slides, pptxText, viewerText }, { strict: STRICT });
      const failures = res
        .filter((x) => x.status === 'FAIL')
        .map((x) => `[${x.kind}:${x.id}] ${x.label} — ${x.detail}`);
      expect(failures, `${name} Studio round-trip oracle failures`).toEqual([]);
    }, 90_000);
  }

  it('Negative Oracle Test: actively catches all U1-U6 defects from pre-remediation broken PPTX text', () => {
    const dummyFacts: ExpectedFacts = {
      schemaVersion: 1,
      golden: 'negative-test',
      fixture: 'none',
      must_contain: [],
      must_not_contain: [],
      must_not_be_dash: [],
      landmarks: [],
      numeric: [],
    };
    const brokenSlides = [
      '03\n물건 개요\n소재지\n용인시 보정동\n층수\n지하 1층 / 지상 4층\n규모\nB1/4F\n사용승인일\n2004\n연면적\n1,230.512㎡ (372.2평)',
      '04\n입지 정보\n대중교통\n보정역 수인분당선역 도보 12분',
      '06\n렌트롤\n층별 스태킹 플랜 (㎡)\n101호\n근린생활\n1F 105호\n공실\n근린생활\n55.28\n〃\n〃',
      '07\n수익률\n시장임대료 46316 기준',
    ];
    const results = evaluateOracle(dummyFacts, {
      slides: brokenSlides,
      pptxText: brokenSlides.join('\n'),
      viewerText: '',
    });
    const failedIds = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
    expect(failedIds).toContain('u1-no-unit-as-floor');
    expect(failedIds).toContain('u2-no-vacant-ditto');
    expect(failedIds).toContain('u3-no-excel-serial-date');
    expect(failedIds).toContain('u4-no-double-station-suffix');
    expect(failedIds).toContain('u5-no-dup-floor-scale-or-bare-year');
    expect(failedIds).toContain('u6-no-three-decimal-area');
  });

  it('Multi-Slide Expansion Binary Test: 12-floor / 20-unit rent roll (2 slides) + 12-photo gallery (2 slides)', async () => {
    if (!hasSnapshot('income-wellbing-r3')) return;
    resetOfflineGuardLog();
    const snap = loadSnapshot('income-wellbing-r3');
    setOfflineEnrichment(snap.liveEnrichment ?? null);

    // 20 units across B1 and 1F~11F
    const expandedLeases = Array.from({ length: 20 }, (_, i) => {
      const floorNum = i === 0 ? -1 : Math.min(11, Math.ceil(i / 2));
      const unitNo = i === 0 ? 'B101호' : `${floorNum}0${(i % 2) + 1}호`;
      const isVacant = i === 5;
      const isOwner = i === 19;
      return {
        floor: unitNo,
        area_sqm: 60.5,
        exclusive_area_sqm: 36.3,
        is_vacant: isVacant,
        lease_state: isVacant ? '공실' : isOwner ? '자가사용' : '임대중',
        tenant_name: isVacant ? '공실' : isOwner ? '자가' : `임차업종_${i + 1}`,
        tenant_type: isVacant ? '공실' : isOwner ? '자가' : '근린생활',
        contract_group: isOwner ? '주거' : '근린생활',
        deposit_manwon: isVacant || isOwner ? 0 : 2000,
        rent_manwon: isVacant || isOwner ? 0 : 80,
        mgmt_fee_manwon: isVacant || isOwner ? 0 : 5,
        lease_end: isVacant || isOwner ? undefined : '2027-12-31',
      };
    });

    // Ensure 12 photos with hero at index 3
    const basePhotos = Array.isArray(snap.doc.body.photos_v2) ? snap.doc.body.photos_v2 : [];
    const twelvePhotos = Array.from({ length: 12 }, (_, i) => {
      const src = basePhotos[i % basePhotos.length] || {};
      return {
        ...src,
        isHero: i === 3,
        category: i === 3 ? 'exterior' : i % 3 === 0 ? 'interior' : i % 3 === 1 ? 'lobby' : 'parking',
        caption: undefined,
      };
    });

    snap.doc.body.floor_leases = expandedLeases;
    snap.doc.body.photos_v2 = twelvePhotos;

    const input = await buildRenderInput(snap);
    const pool = loadPoiPool('income-wellbing-r3');
    if (pool) input.landmarkPoolFixture = pool;

    const out = await new MobileImPptxRenderer().render(input as any);
    const slides = extractSlideTexts(out.buffer);
    const pptxText = slides.join('\n');

    // Verify 2 rent roll slides + 2 gallery slides
    expect(pptxText).toContain('소계\n 12개 호실');
    expect(pptxText).toContain('렌트롤 (2/2)');
    expect(pptxText).toContain('합계\n 20개 호실');
    expect(pptxText).toContain('현장 사진 (1/2)');
    expect(pptxText).toContain('현장 사진 (2/2)');
    expect(pptxText).toContain('B1 B101호');
    expect(pptxText).toContain('10F 1002호');

    // Verify U1-U6 universal invariants on expanded deck
    const dummyFacts: ExpectedFacts = {
      schemaVersion: 1,
      golden: 'expanded-wellbing',
      fixture: 'none',
      must_contain: [],
      must_not_contain: [],
      must_not_be_dash: [],
      landmarks: [],
      numeric: [],
    };
    const universalRes = evaluateOracle(dummyFacts, { slides, pptxText, viewerText: '' });
    const failures = universalRes.filter((r) => r.status === 'FAIL');
    expect(failures).toEqual([]);
  }, 90_000);

  it('B-1 & D-1: enrichProjectFromDocBody replaces stale unedited overrides while preserving user edits, and multi-slide rentRoll_* obeys hide/reorder', () => {
    const mockProject: any = {
      id: 'basic-test-b1',
      dealId: 'test-b1',
      title: '웰빙프라자 Basic IM',
      slides: [
        {
          id: 's-overview',
          slideIndex: 3,
          title: '물건 개요',
          dataKey: 'overview',
          initialOverrides: {
            completionYear: '1999년',
            askingPrice: '65억 원',
          },
          slideOverrides: {
            completionYear: '1999년', // unedited stale initial value -> should be replaced by fresh def
            askingPrice: '99억 원', // genuine user edit -> must be preserved!
          },
        },
      ],
    };

    const freshBody = {
      ssot_summary: {
        address: '경기도 용인시 기흥구 보정동 1263',
        asking_price_manwon: 680000,
      },
      enrichment: {
        buildingRegister: {
          useAprDay: '2004.10.22',
        },
      },
    };

    (studioService as any).enrichProjectFromDocBody(mockProject, freshBody, undefined);
    const updatedSlide = mockProject.slides[0];
    expect(updatedSlide.slideOverrides.completionYear).toBe('2004년');
    expect(updatedSlide.slideOverrides.askingPrice).toBe('99억 원');

    // D-1: Multi-slide rentRoll_1 & gallery_0/gallery_1 group hide/reorder
    const seq = [
      { archetype: 'A01', kicker: 'COVER', title: '표지', dataKey: 'cover' },
      { archetype: 'A24', kicker: 'RENT ROLL', title: '임대차 현황 (1/2)', dataKey: 'rentRoll' },
      { archetype: 'A24', kicker: 'RENT ROLL', title: '임대차 현황 (2/2)', dataKey: 'rentRoll_1' },
      { archetype: 'A10', kicker: 'CLOSING', title: '문의', dataKey: 'closing' },
    ];
    const filteredSeq = applyStudioSlideOverrides(seq as any, {}, {
      _studioHiddenDataKeys: ['rentroll'],
    });
    expect(filteredSeq.map((s) => s.dataKey)).toEqual(['cover', 'closing']);
  });

  it('A-1~A-7: Explicit Studio user edits on slides 02~10 propagate into the rendered PPTX binary', async () => {
    if (!hasSnapshot('income-wellbing-r3')) return;
    resetOfflineGuardLog();
    const snap = loadSnapshot('income-wellbing-r3');
    setOfflineEnrichment(snap.liveEnrichment ?? null);

    const initialOverrides = buildBasicImSlideDefaults(
      snap.doc.title || 'Basic IM',
      snap.doc.body,
      snap.broker ?? undefined,
    );
    const editedOverrides = JSON.parse(JSON.stringify(initialOverrides));

    editedOverrides.highlights = {
      ...editedOverrides.highlights,
      leadSentence: '보정역 초역세권 메디컬·학원 특화 수익형 빌딩 커스텀리드',
      grossYield: '5.85%',
    };
    editedOverrides.overview = {
      ...editedOverrides.overview,
      archArea: '250.5㎡ (75.8평)',
    };
    editedOverrides.land = {
      ...editedOverrides.land,
      nationalLaw: '준주거지역, 지구단위계획구역(스튜디오편집)',
      landCallout: '전면 25m 대로변 접면으로 가시성 최상(스튜디오콜아웃)',
    };
    editedOverrides.rentroll = {
      ...editedOverrides.rentroll,
      turnaroundStrategy: '1층 공실 약국 유치 시 월 450만원 추가 수익 기대',
    };
    editedOverrides.yield = {
      ...editedOverrides.yield,
      capRateStabilized: '6.45%',
      stabilizedAssumption: '1층 약국 임대 완료 및 기준층 임대료 현실화 가정',
    };
    editedOverrides.comps = {
      ...editedOverrides.comps,
      comparables: [
        {
          name: '보정동 메디컬타워 비교사례',
          trade_date: '2025.11',
          price: '75억',
          land_pyeong: '125',
          land_unit_manwon: '6,000',
        },
      ],
      compsNotes: '인근 보정역 대로변 실거래 평당 6,000만원 수준',
    };
    editedOverrides.closing = {
      ...editedOverrides.closing,
      closingLine: '안정적인 임대수익과 지가 상승을 동시에 기대할 수 있는 우량 자산입니다.',
    };

    snap.doc.body = {
      ...snap.doc.body,
      _studioInitialOverrides: initialOverrides,
      _studioSlideOverrides: editedOverrides,
    };

    const input = await buildRenderInput(snap);
    const pool = loadPoiPool('income-wellbing-r3');
    if (pool) input.landmarkPoolFixture = pool;

    const out = await new MobileImPptxRenderer().render(input as any);
    const slides = extractSlideTexts(out.buffer);
    const pptxText = slides.join('\n');

    expect(pptxText).toContain('보정역 초역세권 메디컬·학원 특화 수익형 빌딩 커스텀리드');
    expect(pptxText).toContain('250.5㎡ (75.8평)');
    expect(pptxText).toContain('지구단위계획구역(스튜디오편집)');
    expect(pptxText).toContain('전면 25m 대로변 접면으로 가시성 최상(스튜디오콜아웃)');
    expect(pptxText).toContain('1층 공실 약국 유치 시 월 450만원 추가 수익 기대');
    expect(pptxText).toContain('6.45%');
    expect(pptxText).toContain('1층 약국 임대 완료 및 기준층 임대료 현실화 가정');
    expect(pptxText).toContain('보정동 메디컬타워 비교사례');
    expect(pptxText).toContain('인근 보정역 대로변 실거래 평당 6,000만원 수준');
    expect(pptxText).toContain('안정적인 임대수익과 지가 상승을 동시에 기대할 수 있는 우량 자산입니다.');
  }, 90_000);

  it('Teamwork Studio Upgrade: Rent Roll tenantData row edits and slide layoutType variants propagate cleanly', () => {
    const mockDataMap: Record<string, any> = {
      cover: { title: '표지' },
      summary: { metrics: [] },
      building: { left: { rows: [] } },
      location: { right: { rows: [] } },
      land: { overviewRows: [] },
      rentRoll: {
        rows: [
          { floor: '1F', tenant: '기존약국', areaPyeong: 25, deposit: '5,000만', monthlyRent: '300만' },
        ],
      },
      yieldFormula: {},
      gallery: { photos: [{ url: 'https://example.com/1.jpg', included: true }] },
      closing: {},
    };
    const mockSeq: any[] = [
      { archetype: 'A01', kicker: 'COVER', title: '표지', dataKey: 'cover' },
      { archetype: 'A02', kicker: 'HIGHLIGHTS', title: '요약', dataKey: 'summary' },
      { archetype: 'A24', kicker: 'RENT ROLL', title: '렌트롤', dataKey: 'rentRoll' },
      { archetype: 'A14', kicker: 'GALLERY', title: '갤러리', dataKey: 'gallery' },
      { archetype: 'A10', kicker: 'CLOSING', title: '문의', dataKey: 'closing' },
    ];
    const docBody = {
      _studioSlideTitles: {
        cover: { layoutType: 'A01_SPLIT' },
        highlights: { layoutType: 'A02_EXECUTIVE' },
        overview: { layoutType: 'A04_WIDE_SPEC' },
        location: { layoutType: 'A06_TRANSIT_FOCUS' },
        land: { layoutType: 'A06_LAND_CADASTRAL' },
        rentroll: { layoutType: 'A24_TABLE_FOCUS' },
        yield: { layoutType: 'A23_DUAL_YIELD' },
        gallery: { layoutType: 'A14_HERO_3' },
      },
      _studioInitialOverrides: {
        rentroll: {
          tenantData: [{ floor: '1F', tenant_name: '기존약국', area_pyeong: 25, deposit_manwon: 5000, rent_manwon: 300 }],
        },
      },
      _studioSlideOverrides: {
        rentroll: {
          tenantData: [
            { floor: '1F', unit_label: '101호', tenant_name: '스타벅스(스튜디오추가)', area_pyeong: 42, deposit_manwon: 10000, rent_manwon: 650, is_vacant: false },
            { floor: '2F', unit_label: '201호', tenant_name: '공실', area_pyeong: 42, deposit_manwon: 0, rent_manwon: 0, is_vacant: true },
          ],
        },
      },
    };

    applyStudioSlideOverrides(mockSeq, mockDataMap, docBody);

    expect(mockDataMap.cover.coverStyle).toBe('split');
    expect(mockDataMap.summary.layoutVariant).toBe('executive');
    expect(mockDataMap.building.layoutVariant).toBe('wide_spec');
    expect(mockDataMap.location.layoutVariant).toBe('transit_focus');
    expect(mockDataMap.land.layoutVariant).toBe('cadastral_focus');
    expect(mockDataMap.rentRoll.layoutVariant).toBe('table_focus');
    expect(mockDataMap.yieldFormula.layoutVariant).toBe('dual_yield');
    expect(mockDataMap.gallery.layout).toBe('ONE_LARGE_TWO_SMALL_H');
    expect(mockDataMap.rentRoll.studioTenantData).toHaveLength(2);
    expect(mockDataMap.rentRoll.rows.some((r: any) => String(r.tenant || '').includes('스타벅스(스튜디오추가)'))).toBe(true);
  });
});
