import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';
import { setOfflineEnrichment } from '../../domain/building/mobile-im/pptx/basic-im-enrichment';
import {
  hasSnapshot,
  loadSnapshot,
  loadPoiPool,
  buildRenderInput,
  installOfflineGuard,
} from '../../../scripts/golden-snapshot/lib';

/**
 * Basic IM SOTA 렌더 정합성 테스트 (vitest 통합)
 *
 * Supabase 실DB 문서 → renderer 직접 호출 → PPTX 바이너리 OpenXML 심층 단언.
 * Rule 41 기준 "프로덕션 골든 테스트"가 아닌 "렌더 정합성 테스트"로 분류됩니다.
 * 프로덕션 골든 테스트는 e2e/seocho-basic-golden.auth.spec.ts를 참조하세요.
 *
 * 검증 대상 (26개 단언):
 *  - 버퍼/면수 기본 검증 (3개)
 *  - G1: 6대 핵심 지표 키워드 + Pro 배제 (8개)
 *  - G2: INTERNAL_MONOLOGUE 전체 패턴 차단 (6개)
 *  - G3: 표지 배경색 OpenXML 0A1620 (1개)
 *  - G4: A24 공실 스타일링 FBEFE8 (1개)
 *  - G5: 투자 포인트 검증 가능 앵커 ≥3 (1개)
 *  - Rule 37: 회피성 문구 차단 (3개)
 *  - Rule 52: 200억대 밴드 전슬라이드 차단 (1개)
 *  - 결함 토큰 차단 (1개)
 *  - 렌트롤 관리비 배제 (1개)
 *  - 섹션별 키워드 (10개 슬라이드)
 */
describe('Basic IM SOTA Render Verification Test', () => {
  afterAll(() => {
    setOfflineEnrichment(null);
    delete process.env.OFFLINE_RENDER;
    try {
      const outDir = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'render-verification');
      const outPath = path.join(outDir, 'seocho_basic_sota.pptx');
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  });

  it('renders Basic IM with all 7 SOTA improvements and passes 26-point assertion suite', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const docId = '8bc302d8-dbe0-4109-ba49-9573e8e78dc3';
    let doc: any = null;
    let bldg: any = null;
    if (supabaseUrl && supabaseKey) {
      const s = createClient(supabaseUrl, supabaseKey);
      const { data: dbDoc } = await s.from('document_objects').select('*').eq('id', docId).maybeSingle();
      if (dbDoc?.building_id) {
        const { data: dbBldg } = await s.from('building_ssot_lite').select('*').eq('id', dbDoc.building_id).maybeSingle();
        if (dbBldg) {
          doc = dbDoc;
          bldg = dbBldg;
        }
      }
    }

    const renderer = new MobileImPptxRenderer();
    let result: Awaited<ReturnType<MobileImPptxRenderer['render']>>;
    if (doc && bldg) {
      result = await renderer.render({
        buildingId: doc.building_id,
        doc,
        building: bldg,
        grade: 'B',
        preset: 'credeal_basic',
        posture: 'income',
      });
    } else if (hasSnapshot('owner-seocho-r3')) {
      await installOfflineGuard();
      const snap = loadSnapshot('owner-seocho-r3');
      const fallbackLeases = [
        { floor: '1F', tenant_name: '스타벅스', tenant_type: '카페', area_sqm: 140, deposit_manwon: 30000, rent_manwon: 1800, mgmt_fee_manwon: 0, lease_state: '임대중', is_vacant: false },
        { floor: '2F', tenant_name: '', tenant_type: '공실', area_sqm: 140, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_state: '공실', is_vacant: true },
        { floor: '3F', tenant_name: '더블유클리닉', tenant_type: '병원', area_sqm: 140, deposit_manwon: 25000, rent_manwon: 1300, mgmt_fee_manwon: 0, lease_state: '임대중', is_vacant: false },
        { floor: '4F', tenant_name: '', tenant_type: '공실', area_sqm: 140, deposit_manwon: 0, rent_manwon: 0, mgmt_fee_manwon: 0, lease_state: '공실', is_vacant: true },
      ];
      const baseSections = Array.isArray(snap.doc.body.sections)
        ? snap.doc.body.sections.filter(
            (s: any) => s.section_type !== 'cost_comparison' && s.section_type !== 'occupancy_fit',
          )
        : [];
      const fallbackSections = [
        ...baseSections.filter(
          (s: any) => s.section_type !== 'lease_status' && s.section_type !== 'income_analysis',
        ),
        {
          section_type: 'lease_status',
          title: '임대차 현황',
          markdown:
            '| 층 | 임차인 | 보증금 | 월임대료 |\n|---|---|---|---|\n| 1F | 스타벅스 | 3억 | 1,800만원 |\n| 2F | 공실 | - | - |\n| 3F | 더블유클리닉 | 2.5억 | 1,300만원 |\n| 4F | 공실 | - | - |',
        },
        {
          section_type: 'income_analysis',
          title: '수익률 분석',
          markdown: '연간 임대수입 3.72억 원, 보증금 차감 임대수익률 1.66%',
        },
      ];
      snap.doc.body = {
        ...snap.doc.body,
        tier: 'basic',
        preset: 'credeal_basic',
        investment_posture: 'income',
        investmentPosture: 'income',
        posture: 'income',
        asking_price_manwon: 2300000,
        floor_leases: fallbackLeases,
        rentRoll: fallbackLeases,
        sections: fallbackSections,
        photos_v2: Array.isArray(snap.doc.body.photos_v2) ? snap.doc.body.photos_v2.slice(0, 4) : [],
        broker_extras: undefined,
        _studioSlideOverrides: undefined,
        market_rent_per_pyeong: undefined,
        target_monthly_rent_manwon: undefined,
        stabilized_yield_pct: undefined,
        turnaround_plan: undefined,
        financials: {
          depositKrw: 550_000_000,
        },
        ssot_summary: {
          ...(snap.doc.body.ssot_summary || {}),
          asking_price_manwon: 2300000,
          total_deposit_manwon: 55000,
          deposit_total_krw: 550_000_000,
          monthly_rent_total_krw: 31_000_000,
          maintenance_fee_monthly_krw: 0,
          investment_posture: 'income',
        },
      };
      if (snap.building) {
        snap.building.investment_posture = 'income';
      }
      setOfflineEnrichment(
        snap.liveEnrichment
          ? { ...snap.liveEnrichment, cadastralMapImage: undefined }
          : null,
      );
      const renderInput = await buildRenderInput(snap);
      const pool = loadPoiPool('owner-seocho-r3');
      if (pool) renderInput.landmarkPoolFixture = pool;
      result = await renderer.render({
        ...(renderInput as any),
        grade: 'B',
        preset: 'credeal_basic',
        posture: 'income',
      });
    } else {
      console.log('Skipping render test: no DB doc and no local snapshot');
      return;
    }

    // ═══════════════════════════════════════════════════
    // 기본 검증: 버퍼 유효성 + 면수
    // ═══════════════════════════════════════════════════
    expect(result.buffer).toBeDefined();
    expect(result.buffer.length).toBeGreaterThan(100_000);

    const outDir = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'render-verification');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'seocho_basic_sota.pptx');
    fs.writeFileSync(outPath, result.buffer);

    const zip = new AdmZip(outPath);
    const slideEntries = zip.getEntries().filter((e: any) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName));
    expect(slideEntries.length).toBeGreaterThanOrEqual(9);
    expect(slideEntries.length).toBeLessThanOrEqual(10);

    // XML 원문 + 텍스트 추출
    const slideXmls = slideEntries.map((e: any) => e.getData().toString('utf-8'));
    const slideTexts = slideXmls.map((xml: string) =>
      xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    );
    const fullText = slideTexts.join(' ');

    // ═══════════════════════════════════════════════════
    // 결함 토큰 차단 (Rule 7 negative): NaN, undefined, null, [object Object]
    // ═══════════════════════════════════════════════════
    for (const xml of slideXmls) {
      expect(xml).not.toContain('>NaN<');
      expect(xml).not.toContain('>undefined<');
      expect(xml).not.toContain('>null<');
      expect(xml).not.toContain('[object Object]');
    }
    console.log('  ✅ 결함 토큰 (NaN, undefined, null) 0건');

    // ═══════════════════════════════════════════════════
    // Rule 52 + SOTA ④: 200억대 밴드 전슬라이드 차단
    // ═══════════════════════════════════════════════════
    expect(fullText).not.toMatch(/\d+억\s*대/);
    console.log('  ✅ 가격 밴드(N억대) 전슬라이드 0건');

    // ═══════════════════════════════════════════════════
    // Rule 37: 회피성 문구 차단
    // ═══════════════════════════════════════════════════
    expect(fullText).not.toContain('본문을 참조');
    expect(fullText).not.toContain('별도 안내 예정');
    expect(fullText).not.toContain('추후 확인');
    console.log('  ✅ 회피성 문구 0건 (Rule 37)');

    // ═══════════════════════════════════════════════════
    // Slide 1: Cover — G3 표지 배경색 검증
    // basic-im-guide.md §4: 표지 배경은 `#0A1620`
    // ═══════════════════════════════════════════════════
    expect(slideTexts[0]).toContain('CRE DEAL');
    expect(slideXmls[0]).toContain('0A1620');
    console.log('  ✅ G3: 표지 배경색 0A1620 확인');

    // ═══════════════════════════════════════════════════
    // Slide 2: Summary — G1 6대 핵심 지표 + G2 INTERNAL_MONOLOGUE + G5 앵커
    // ═══════════════════════════════════════════════════
    console.log('Slide 2 Text:', slideTexts[1].slice(0, 300));

    // G1: 6대 핵심 지표 카드 키워드 (basic-im-guide.md §2 요약 섹션)
    expect(slideTexts[1]).toContain('요약');
    expect(slideTexts[1]).toContain('230억');
    const statKeywords = ['희망가', '수익률'];
    for (const kw of statKeywords) {
      expect(slideTexts[1]).toContain(kw);
    }
    // G1 Negative: Pro-only 고급 분석 지표가 Basic에 누출되지 않음
    expect(slideTexts[1]).not.toContain('IRR');
    expect(slideTexts[1]).not.toContain('DCF');
    console.log('  ✅ G1: 6대 핵심 지표 키워드 확인 + Pro 배제');

    // G2: INTERNAL_MONOLOGUE 전체 패턴 차단 (Rule 7 negative pair)
    const monologuePatterns = [
      '실사 점검:', '주의:', '검토 필요',
      '리스크 요인:', '내부 검토', '분석가 의견:',
    ];
    for (const pat of monologuePatterns) {
      expect(slideTexts[1]).not.toContain(pat);
    }
    console.log('  ✅ G2: INTERNAL_MONOLOGUE 6종 패턴 차단 확인');

    // G5: 투자 포인트 검증 가능 앵커 (역명, 숫자 등) ≥ 3건
    expect(slideTexts[1]).toContain('양재역');
    const anchorMatches = slideTexts[1].match(/\d+[%억평분㎡호세대만원]/g) || [];
    expect(anchorMatches.length).toBeGreaterThanOrEqual(3);
    console.log(`  ✅ G5: 검증 가능 앵커 ${anchorMatches.length}건 (≥3)`);

    // ═══════════════════════════════════════════════════
    // Slide 3: Building Overview — SOTA ② 매매 희망가 별도 소표
    // ═══════════════════════════════════════════════════
    console.log('Slide 3 Text:', slideTexts[2].slice(0, 300));
    expect(slideTexts[2]).toContain('물건 개요');
    expect(slideTexts[2]).toContain('매매 희망가');
    expect(slideTexts[2]).toContain('230억 원');

    // ═══════════════════════════════════════════════════
    // Slide 4: Location — 입지 분석 (카카오 지도)
    // ═══════════════════════════════════════════════════
    console.log('Slide 4 Text:', slideTexts[3].slice(0, 200));
    expect(slideTexts[3]).toContain('입지 정보');
    expect(slideTexts[3]).toContain('입지 요약');
    expect(slideTexts[3]).toContain('대중교통');
    expect(slideTexts[3]).toContain('배후·상권');

    // ═══════════════════════════════════════════════════
    // Slide 5: Land — 토지 현황 (A27 토지이용계획확인원 양식)
    // ═══════════════════════════════════════════════════
    expect(slideTexts[4]).toContain('토지 정보');
    expect(slideTexts[4]).toContain('■ 토지개요');
    expect(slideTexts[4]).toContain('■ 토지이용계획');

    // ═══════════════════════════════════════════════════
    // Slide 6: Rent Roll + Stacking Plan (A24)
    // G4: 공실 스타일링 검증 + 관리비 배제
    // ═══════════════════════════════════════════════════
    console.log('Slide 6 Text:', slideTexts[5].slice(0, 300));
    expect(slideTexts[5]).toContain('렌트롤');
    expect(slideTexts[5]).toContain('공실');

    // G4: 공실 행 배경색 FBEFE8 (basic-im-guide.md §4 공실/경고 강조)
    expect(slideXmls[5]).toContain('FBEFE8');
    console.log('  ✅ G4: A24 공실 스타일링 FBEFE8 확인');

    // F-06: 렌트롤 표준 컬럼 — 픽스처에 관리비 입력이 없으므로 관리비·월합계(=월임대료) 열은 생략된다
    expect(slideTexts[5]).toContain('월임대료');
    expect(slideTexts[5]).not.toContain('관리비');
    expect(slideTexts[5]).not.toContain('월합계');
    console.log('  ✅ 렌트롤 표준 컬럼 (관리비 미기입 → 관리비·월합계 생략) 확인');

    // ═══════════════════════════════════════════════════
    // Slide 7: Yield Formula (A23)
    // ═══════════════════════════════════════════════════
    console.log('Slide 7 Text:', slideTexts[6].slice(0, 300));
    expect(slideTexts[6]).toContain('수익률');
    expect(slideTexts[6]).toContain('1.66%');
    // D10: 목표임대료(중개인 입력) 없이는 시세 임대 가정 '안정화 수익률'을 표기하지 않는다 (구 2.87% 폐기)
    expect(slideTexts[6]).toContain('임대수익률 (매매가−보증금 대비)');
    expect(slideTexts[6]).not.toContain('인근 동일 용도 시세');
    expect(slideTexts[6]).not.toContain('시장 평균');
    expect(slideTexts[6]).toContain('임대수익률은 운영비 차감 전');

    // ═══════════════════════════════════════════════════
    // Slide 8: Gallery (A14)
    // ═══════════════════════════════════════════════════
    expect(slideTexts[7]).toContain('현장 사진');

    // ═══════════════════════════════════════════════════
    // Slide 9: Closing (A10)
    // ═══════════════════════════════════════════════════
    expect(slideTexts[8]).toContain('문의 및 유의사항');

    console.log('\n🏁 Basic IM SOTA 렌더 정합성 26-point 단언 스위트 완료');
  }, 45_000);
});
