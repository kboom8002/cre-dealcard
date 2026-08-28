/**
 * @file generate-golden-im.ts
 * @status SCAFFOLD — 인프라 검증용. 콘텐츠는 스텁.
 *
 * ⚠️ 이 스크립트의 sections는 1~2문장짜리 더미입니다.
 * 실제 골든 IM을 생성하려면:
 *   1. generateMobileIM()으로 풀 파이프라인 실행하여 실제 sections 획득
 *   2. 획득한 sections를 아래 pptxInput.doc.sections에 주입
 *   3. 이 스크립트로 PPTX 렌더 → 파싱 → 감사 → 멱등 검증
 *   4. 도메인 전문가 검수 후 docs/test/golden/에 커밋
 *
 * @see docs/test/golden/README.md
 */
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import fs from 'fs';
import path from 'path';

const pptxInput = {
  buildingId: 'golden_yangpyeong_v6',
  preset: 'credeal_signature',
  posture: 'income' as const,
  grade: 'A' as const,
  incomeArchetype: 'R-INC-01' as const,
  docno: 'IM-GOLDEN-YP001',
  doc: {
    title: '양평동 오피스 투자설명서',
    body: {
      // yangpyeong.json의 asset/financial 데이터를 매핑
      buildingName: '양평동 오피스',
      address: '서울특별시 영등포구 양평동4가',
      salePrice: 25000000000,
      pricePerPyeong: Math.round(25000000000 / (2490.88 / 3.3058)),
      totalAreaPyeong: Math.round(2490.88 / 3.3058 * 10) / 10,
      landAreaPyeong: Math.round(2068.63 / 3.3058 * 10) / 10, // farBaseArea에서 추정
      qualityGrade: 'A',
      investmentPosture: 'income',
      highlights: [
        '연 순수익률(Cap Rate) 2.2% 수준의 안정적 임대수익',
        '영등포 도심권 역세권 주거지역 소재',
        '다양한 업종 테넌트 구성으로 공실 리스크 분산',
        '주차장 포함 전층 단독 사용 가능',
      ],
      zoningCode: '제2종일반주거',
      totalFloorAreaSqm: 2490.88,
      buildingCoverageRatio: 58.4,
      floorAreaRatio: 398.8,
      floors: { above: 6, below: 1 },
      buildYear: '2005',
      monthlyRentKrw: 46570000,
      depositKrw: 495000000,
      vacancyRate: 0,
      annualRentKrw: 46570000 * 12,
      noiKrw: 46570000 * 12 - 5760000 * 12,  // rent - mgmt
      capRate: ((46570000 * 12 - 5760000 * 12) / 25000000000) * 100,
    },
    sections: [
      { section_type: 'property_overview', title: '물건 개요', markdown: '양평동 업무시설. 6층 규모 오피스 건물.', confidence: '0.95' },
      { section_type: 'decision_snapshot', title: '투자 요약', markdown: '연 순수익률 2.2%로 안정적 임대수익 확보.', confidence: '0.92' },
      { section_type: 'location_access', title: '입지 분석', markdown: '영등포구 양평동 도심권 역세권.', confidence: '0.90' },
      { section_type: 'lease_status', title: '임대차 현황', markdown: '전층 임대 중. 공실 0%.', confidence: '0.95' },
      { section_type: 'income_analysis', title: '수익 분석', markdown: '연 순수익률(Cap Rate) 2.2%. 연간 임대수입 약 5.59억원.', confidence: '0.93' },
      { section_type: 'risk_check', title: '리스크 검토', markdown: '공실 리스크 낮음. 다양한 업종 구성.', confidence: '0.88' },
      { section_type: 'investment_thesis', title: '투자 논거', markdown: '안정적 임대수익 + 입지 우위성.', confidence: '0.90' },
      { section_type: 'next_steps', title: '후속 절차', markdown: '현장 답사 예약 및 추가 자료 제공.', confidence: '0.95' },
      { section_type: 'closing', title: '마감', markdown: '문의사항은 담당 중개사에게 연락해주세요.', confidence: '0.98' },
    ],
  },
  building: {
    area_signal: '양평동',
    asset_type: '업무시설',
    price_band: '200억~300억',
  },
};

async function main() {
  console.log('=== D41 Phase 3: 골든 IM 생성 (B-1 양평동 오피스) ===');
  
  // 1. 렌더링
  const renderer = new MobileImPptxRenderer();
  const result = await renderer.render(pptxInput);
  
  // 2. PPTX 저장
  const outDir = path.resolve('docs/test/golden');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const pptxPath = path.join(outDir, 'yangpyeong_golden_v6.pptx');
  fs.writeFileSync(pptxPath, result.buffer);
  console.log(`PPTX 저장: ${pptxPath} (${result.slideCount}면, ${Math.round(result.fileSizeBytes/1024)}KB)`);
  
  // 3. 셀프 파싱 + 감사
  const { parsePptx } = await import('../src/domain/building/mobile-im/pptx/pptx-parser');
  const { extractGateContext, generateAuditReport } = await import('../src/domain/building/mobile-im/pptx/extract-gate-context');
  const parseResult = await parsePptx(result.buffer);
  const gateCtx = extractGateContext(parseResult.slides);
  const audit = generateAuditReport(parseResult.slides, gateCtx);
  
  // 4. 결과 JSON 저장
  const goldenResult = {
    version: 'v6.0',
    specimen: 'B-1',
    generatedAt: new Date().toISOString(),
    slideCount: result.slideCount,
    fileSizeBytes: result.fileSizeBytes,
    warnings: result.warnings,
    auditReport: {
      layoutViolations: audit.layoutViolations,
      standardViolations: audit.standardViolations,
      totalViolations: audit.layoutViolations.length + audit.standardViolations.length,
      imageCount: audit.imageCount,
      textCount: audit.textCount,
    },
    gateContext: gateCtx,
    idempotencyHash: null as string | null, // 2회 렌더 후 채움
  };
  
  const jsonPath = path.join(outDir, 'yangpyeong_golden_v6.json');
  fs.writeFileSync(jsonPath, JSON.stringify(goldenResult, null, 2));
  console.log(`감사 결과: ${jsonPath}`);
  console.log(`  레이아웃 위반: ${audit.layoutViolations.length}건`);
  console.log(`  표준 위반: ${audit.standardViolations.length}건`);
  console.log(`  경고: ${result.warnings.length}건`);
  
  // 5. 멱등 검증 (2회 렌더)
  console.log('\n--- 멱등 검증 (2회 렌더) ---');
  const result2 = await renderer.render(pptxInput);
  const match = result.slideCount === result2.slideCount && 
                result.fileSizeBytes === result2.fileSizeBytes;
  console.log(`  1회: ${result.slideCount}면 / ${result.fileSizeBytes}B`);
  console.log(`  2회: ${result2.slideCount}면 / ${result2.fileSizeBytes}B`);
  console.log(`  멱등: ${match ? '✅ 통과' : '❌ 실패'}`);
  
  if (!match) {
    process.exit(1);
  }
  
  console.log('\n=== 골든 IM 생성 완료 ===');
}

main().catch(err => {
  console.error('골든 IM 생성 실패:', err);
  process.exit(1);
});
