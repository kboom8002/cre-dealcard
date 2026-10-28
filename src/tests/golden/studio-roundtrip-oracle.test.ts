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
import { buildBasicImSlideDefaults } from '../../domain/building/pptx-studio/studio-service';
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
});
