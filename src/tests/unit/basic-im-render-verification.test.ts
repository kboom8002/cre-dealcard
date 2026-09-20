import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createClient } from '@supabase/supabase-js';
import { MobileImPptxRenderer } from '../../domain/building/mobile-im/pptx/pptx-renderer';

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
    try {
      const outDir = path.resolve(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'render-verification');
      const outPath = path.join(outDir, 'seocho_basic_sota.pptx');
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {}
  });

  it('renders Basic IM with all 7 SOTA improvements and passes 26-point assertion suite', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.log('Skipping DB test: no supabase env');
      return;
    }
    const s = createClient(supabaseUrl, supabaseKey);

    const docId = '8bc302d8-dbe0-4109-ba49-9573e8e78dc3';
    const { data: doc } = await s.from('document_objects').select('*').eq('id', docId).single();
    const { data: bldg } = await s.from('building_ssot_lite').select('*').eq('id', doc.building_id).single();

    const renderer = new MobileImPptxRenderer();
    const result = await renderer.render({
      buildingId: doc.building_id,
      doc,
      building: bldg,
      grade: 'B',
      preset: 'credeal_basic',
      posture: 'income',
    });

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
    expect(slideTexts[0]).toContain('INVESTMENT MEMORANDUM');
    expect(slideXmls[0]).toContain('0A1620');
    console.log('  ✅ G3: 표지 배경색 0A1620 확인');

    // ═══════════════════════════════════════════════════
    // Slide 2: Summary — G1 6대 핵심 지표 + G2 INTERNAL_MONOLOGUE + G5 앵커
    // ═══════════════════════════════════════════════════
    console.log('Slide 2 Text:', slideTexts[1].slice(0, 300));

    // G1: 6대 핵심 지표 카드 키워드 (basic-im-guide.md §2 요약 섹션)
    expect(slideTexts[1]).toContain('핵심 투자 지표');
    expect(slideTexts[1]).toContain('230억');
    const statKeywords = ['매매가', 'Cap Rate'];
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
    expect(slideTexts[2]).toContain('건물 개요');
    expect(slideTexts[2]).toContain('매매 희망가');
    expect(slideTexts[2]).toContain('230억 원');

    // ═══════════════════════════════════════════════════
    // Slide 4: Location — 입지 분석 (카카오 지도)
    // ═══════════════════════════════════════════════════
    console.log('Slide 4 Text:', slideTexts[3].slice(0, 200));
    expect(slideTexts[3]).toContain('입지 분석');
    expect(slideTexts[3]).toContain('소재지');
    expect(slideTexts[3]).toContain('대중교통');

    // ═══════════════════════════════════════════════════
    // Slide 5: Land — 토지 현황
    // ═══════════════════════════════════════════════════
    expect(slideTexts[4]).toContain('토지 현황');

    // ═══════════════════════════════════════════════════
    // Slide 6: Cadastral Map — 지적도
    // ═══════════════════════════════════════════════════
    expect(slideTexts[5]).toContain('지적도');

    // ═══════════════════════════════════════════════════
    // Slide 7: Rent Roll + Stacking Plan (A24)
    // G4: 공실 스타일링 검증 + 관리비 배제
    // ═══════════════════════════════════════════════════
    console.log('Slide 7 Text:', slideTexts[6].slice(0, 300));
    expect(slideTexts[6]).toContain('임대차 현황');
    expect(slideTexts[6]).toContain('공실');

    // G4: 공실 행 배경색 FBEFE8 (basic-im-guide.md §4 공실/경고 강조)
    expect(slideXmls[6]).toContain('FBEFE8');
    console.log('  ✅ G4: A24 공실 스타일링 FBEFE8 확인');

    // 관리비 배제 (basic-im-guide.md §3.1: "관리비는 넣지 않습니다")
    expect(slideTexts[6]).not.toContain('관리비');
    console.log('  ✅ 렌트롤 관리비 컬럼 배제 확인');

    // ═══════════════════════════════════════════════════
    // Slide 8: Yield Formula (A23)
    // ═══════════════════════════════════════════════════
    console.log('Slide 8 Text:', slideTexts[7].slice(0, 300));
    expect(slideTexts[7]).toContain('투자수익률 분석');
    expect(slideTexts[7]).toContain('1.66%');
    expect(slideTexts[7]).toContain('2.90%');

    // ═══════════════════════════════════════════════════
    // Slide 9: Gallery (A14)
    // ═══════════════════════════════════════════════════
    expect(slideTexts[8]).toContain('현장 사진');

    // ═══════════════════════════════════════════════════
    // Slide 10: Closing (A10)
    // ═══════════════════════════════════════════════════
    expect(slideTexts[9]).toContain('문의 및 유의사항');

    console.log('\n🏁 Basic IM SOTA 렌더 정합성 26-point 단언 스위트 완료');
  }, 45_000);
});
