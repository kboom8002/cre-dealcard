/**
 * 서초동 160억대 메디컬 빌딩 풀 텍스트 + 지도 + 4장 사진 완벽 PPTX 렌더링 검증 스크립트
 * 
 * 실행: npx tsx --import ./scripts/env-preload.js scripts/stress-test-pptx-perfect-single.ts
 */
import { MobileImPptxRenderer, type MobileImPptxInput } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { generatePremiumTemplate, getSectionTitle } from '../src/domain/building/mobile-im/premium-template-engine';
import { calculateFinancials } from '../src/domain/building/mobile-im/financials';
import type { MobileIMSectionType } from '../src/domain/building/mobile-im/types';
import * as fs from 'fs';
import * as path from 'path';

async function runPerfectSinglePptxTest() {
  console.log("================================================================================");
  console.log("🌟 서초동 160억대 메디컬 빌딩: 풀 텍스트 + 정밀 지도 + 4장 사진 완벽 PPTX 렌더링");
  console.log("================================================================================\n");

  const renderer = new MobileImPptxRenderer();

  const caseData = {
    id: "bld_seocho_medical_165",
    name: "서초동 역세권 160억대 메디컬 빌딩",
    posture: "income" as const,
    address: "서울특별시 서초구 서초동 1320-5",
    askingPriceKrw: 16500000000,
    totalDepositKrw: 1150000000,
    monthlyRentKrw: 59500000,
    mgmtFeeKrw: 6800000,
    loanAmountKrw: 8500000000,
    loanInterestRate: 4.1,
    landAreaPyung: 142.5,
    totalFloorAreaPyung: 620.8,
    floors: "지하 2층 ~ 지상 7층",
    buildYear: 2017,
    coordinates: { lat: 37.4912, lng: 127.0285 },
    photos: [
      { url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab", caption: "서초대로 25m 메인 도로변 외관 전경" },
      { url: "https://images.unsplash.com/photo-1577495508048-b635879837f1", caption: "1층 대형 약국 및 메디컬 로비" },
      { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b", caption: "3층 안과·피부과 전문의원 내부 인테리어" },
      { url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d", caption: "자주식 18대 전용 주차장 및 옥상 휴게공간" },
    ]
  };

  // 1. 재무 엔진 계산
  const finOutputs = calculateFinancials({
    posture: "income",
    monthlyRentKrw: caseData.monthlyRentKrw,
    purchasePriceKrw: caseData.askingPriceKrw,
    totalDepositManwon: caseData.totalDepositKrw / 10000,
    mgmtFeeTotalManwon: caseData.mgmtFeeKrw / 10000,
    loanAmountManwon: caseData.loanAmountKrw / 10000,
    totalAreaSqm: Math.round(caseData.totalFloorAreaPyung / 0.3025),
    platAreaSqm: Math.round(caseData.landAreaPyung / 0.3025),
    assetType: "메디컬빌딩",
  });

  // 2. 7개 핵심 섹션 프리미엄 마크다운 생성
  const sectionTypes: MobileIMSectionType[] = [
    "property_overview",
    "location_access",
    "lease_status",
    "income_analysis",
    "risk_check",
    "investment_thesis",
    "next_steps"
  ];

  const sections = sectionTypes.map(st => {
    const title = getSectionTitle(st, "메디컬빌딩");
    let markdown = generatePremiumTemplate(
      st,
      { title: caseData.name, address: caseData.address, assetType: "메디컬빌딩" },
      {
        plat_area_pyung: caseData.landAreaPyung,
        total_area_pyung: caseData.totalFloorAreaPyung,
        floors: caseData.floors,
        build_year: caseData.buildYear,
        parking_count: 18,
        elevator_count: 1
      },
      { area_signal: "서초권역", subway_info: "강남역·양재역 도보 4분", road_info: "서초대로 25m 접면" },
      { target_buyers: ["법인", "은퇴전문직", "자산가"] },
      {
        asking_price_manwon: caseData.askingPriceKrw / 10000,
        total_deposit_manwon: caseData.totalDepositKrw / 10000,
        monthly_rent_total_krw: caseData.monthlyRentKrw,
        mgmt_fee_total_manwon: caseData.mgmtFeeKrw / 10000,
        loan_amount_manwon: caseData.loanAmountKrw / 10000,
      },
      null,
      finOutputs as any,
      "income"
    );

    // 렌트롤 테이블 명시적 보강
    if (st === 'lease_status') {
      markdown += `\n\n### 층별 상세 임대차 렌트롤\n| 층수 | 임차인 및 주요 업종 | 보증금(원) | 월 임대료(원) | 만기일 |\n|---|---|---|---|---|\n| 1층 | 대형 문전약국 (직영) | 300,000,000 | 15,000,000 | 2028-12 |\n| 2층 | 메디컬 안과의원 | 150,000,000 | 8,500,000 | 2029-05 |\n| 3층 | 피부과 전문의원 | 150,000,000 | 8,500,000 | 2029-05 |\n| 4층 | 정형외과·통증의학과 | 150,000,000 | 7,500,000 | 2028-10 |\n| 5층 | 치과 클리닉 | 150,000,000 | 7,500,000 | 2028-10 |\n| 6~7층 | 어학원 및 법인 사옥 | 250,000,000 | 12,500,000 | 2027-06 |\n| **합계** | **전층 만실 (공실률 0.0%)** | **1,150,000,000** | **59,500,000** | **WALE 3.5년** |\n\n> 💡 1층 대형 약국 및 2~5층 병의원 우량 임차인 만실 운영으로 향후 3.5년간 공실 리스크 제로 자산입니다.`;
    }

    return {
      title,
      section_type: st,
      markdown,
      confidence: "공부확인",
    };
  });

  // 3. Summary용 풍부한 핵심 지표 데이터 구성
  const summaryMarkdown = `
| 지표 항목 | 세부 수치 | 비고 |
|---|---|---|
| 매매 희망가 | 165.0억원 | 건물분 부가세 별도 |
| 실질 Cap Rate | 연 4.62% | 강남 평균 3.2% 대비 고수익 |
| 월 임대료 합계 | 5,950만원 | 전층 만실 (공실률 0%) |
| 보증금 총액 | 11.5억원 | 우량 메디컬 테넌트 직영 |
| 대지 / 연면적 | 142.5평 / 620.8평 | 지하 2층 ~ 지상 7층 |
| 담보대출 승계 | 85.0억원 (4.1%) | 실투자금 약 68.5억원 |
| 준공년도 | 2017년 11월 | 15인승 침대용 승강기 완비 |
| 전용 주차 대수 | 18대 (자주식 10대) | 법정 대비 150% 완비 |
`;

  sections.unshift({
    title: "핵심 투자 지표 요약",
    section_type: "summary" as any,
    markdown: summaryMarkdown,
    confidence: "전문가검증",
  });

  // 4. PPTX 렌더러 입력 구성
  const pptxInput: MobileImPptxInput = {
    buildingId: caseData.id,
    tier: "basic",
    preset: "golden_institutional",
    posture: "income",
    grade: "A",
    docno: "CRE-2026-MED-01",
    doc: {
      title: caseData.name,
      body: {
        photo_urls: caseData.photos.map(p => p.url),
        photos: caseData.photos,
        coordinates: caseData.coordinates,
        sections,
      },
      sections,
    },
    building: {
      area_signal: "서초권역",
      asset_type: "메디컬빌딩",
      price_band: "160억대",
    },
    broker: {
      display_name: "김수석 자산관리위원",
      company_name: "CREDEAL PRIME PARTNERS",
      phone: "02-555-0100",
    }
  };

  console.log("⏳ PPTX 렌더링 파이프라인 가동 (전체 슬라이드 빌드)...");
  const result = await renderer.render(pptxInput);

  console.log(`\n🎉 [렌더링 성공!]`);
  console.log(`   - 총 슬라이드 수: ${result.slideCount}장`);
  console.log(`   - 파일 크기: ${(result.fileSizeBytes / 1024).toFixed(1)} KB`);
  console.log(`   - 경고(억제) 발생 수: ${result.warnings.length}건`);
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => console.log(`     ⚠️ ${w}`));
  }

  const outputDir = path.resolve(process.cwd(), 'docs/test/stress');
  const finalFilePath = path.join(outputDir, 'Seocho_Medical_160_V7_FINAL_FLAWLESS.pptx');
  fs.writeFileSync(finalFilePath, result.buffer);
  console.log(`\n💾 최종 완성형 PPTX 파일 저장 완료:`);
  console.log(`   👉 ${finalFilePath}\n`);
}

runPerfectSinglePptxTest().catch(console.error);
