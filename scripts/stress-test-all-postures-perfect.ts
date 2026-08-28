/**
 * 4대 포스처 & 듀얼 프리셋 전수 완벽 PPTX 렌더링 배치 테스트
 * (서초 메디컬, 성수 사옥, 신사 밸류애드, 역삼 신축개발)
 * 
 * 실행: npx tsx --import ./scripts/env-preload.js scripts/stress-test-all-postures-perfect.ts
 */
import { MobileImPptxRenderer, type MobileImPptxInput } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { generatePremiumTemplate, getSectionTitle } from '../src/domain/building/mobile-im/premium-template-engine';
import { calculateFinancials } from '../src/domain/building/mobile-im/financials';
import type { MobileIMSectionType } from '../src/domain/building/mobile-im/types';
import * as fs from 'fs';
import * as path from 'path';

interface TestCase {
  id: string;
  name: string;
  posture: 'income' | 'owner_occupied' | 'development' | 'trading';
  preset: 'golden_institutional' | 'pro_dark_obsidian';
  address: string;
  askingPriceKrw: number;
  totalDepositKrw: number;
  monthlyRentKrw: number;
  mgmtFeeKrw: number;
  loanAmountKrw: number;
  loanInterestRate: number;
  landAreaPyung: number;
  totalFloorAreaPyung: number;
  floors: string;
  buildYear: number;
  coordinates: { lat: number; lng: number };
  photos: Array<{ url: string; caption: string }>;
  sectionTypes: MobileIMSectionType[];
  docno: string;
}

const TEST_CASES: TestCase[] = [
  {
    id: "bld_case1_seocho_medical",
    name: "서초동 역세권 160억대 메디컬 빌딩",
    posture: "income",
    preset: "golden_institutional",
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
    docno: "CRE-2026-MED-01",
    sectionTypes: ["property_overview", "location_access", "lease_status", "income_analysis", "risk_check", "investment_thesis", "next_steps"],
    photos: [
      { url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab", caption: "서초대로 25m 메인 도로변 외관 전경" },
      { url: "https://images.unsplash.com/photo-1577495508048-b635879837f1", caption: "1층 대형 약국 및 메디컬 로비" },
      { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b", caption: "3층 안과·피부과 전문의원 내부 인테리어" },
      { url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d", caption: "자주식 18대 전용 주차장 및 옥상 휴게공간" },
    ]
  },
  {
    id: "bld_case2_seongsu_headquarter",
    name: "성수 IT밸리 130억대 단독 통사옥",
    posture: "owner_occupied",
    preset: "pro_dark_obsidian",
    address: "서울특별시 성동구 성수동2가 280-12",
    askingPriceKrw: 13500000000,
    totalDepositKrw: 500000000,
    monthlyRentKrw: 42000000,
    mgmtFeeKrw: 4500000,
    loanAmountKrw: 7000000000,
    loanInterestRate: 4.2,
    landAreaPyung: 110.2,
    totalFloorAreaPyung: 485.6,
    floors: "지하 1층 ~ 지상 6층",
    buildYear: 2021,
    coordinates: { lat: 37.5445, lng: 127.0560 },
    docno: "CRE-2026-HQ-02",
    sectionTypes: ["property_overview", "location_access", "occupancy_fit", "cost_comparison", "risk_check", "investment_thesis", "next_steps"],
    photos: [
      { url: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00", caption: "성수 IT밸리 단독 통사옥 외관 전경" },
      { url: "https://images.unsplash.com/photo-1497366216548-37526070297c", caption: "1층 브랜드 쇼룸 및 라운지" },
      { url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174", caption: "2~6층 4.2m 오픈 천장형 스마트 오피스" },
      { url: "https://images.unsplash.com/photo-1524758631624-e2822e304c36", caption: "지하 1층 대형 스튜디오 공간" },
      { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f", caption: "최상층 루프탑 가든 및 테라스" },
    ]
  },
  {
    id: "bld_case3_sinsa_value_add",
    name: "신사동 가로수길 90억대 코너 밸류애드",
    posture: "trading",
    preset: "pro_dark_obsidian",
    address: "서울특별시 강남구 신사동 532-11",
    askingPriceKrw: 9200000000,
    totalDepositKrw: 300000000,
    monthlyRentKrw: 22000000,
    mgmtFeeKrw: 2500000,
    loanAmountKrw: 5000000000,
    loanInterestRate: 4.3,
    landAreaPyung: 68.4,
    totalFloorAreaPyung: 235.1,
    floors: "지하 1층 ~ 지상 4층",
    buildYear: 1994,
    coordinates: { lat: 37.5205, lng: 127.0225 },
    docno: "CRE-2026-VAL-03",
    sectionTypes: ["property_overview", "location_access", "market_position", "comparable_analysis", "risk_check", "investment_thesis", "next_steps"],
    photos: [
      { url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750", caption: "가로수길 코너 입지 건물 외관" },
      { url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5", caption: "1~2층 F&B 트렌디 리테일 상권" },
      { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb", caption: "신사역 도보 4분 보행자 동선" },
      { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b", caption: "리모델링 파사드 개선 시뮬레이션" },
    ]
  },
  {
    id: "bld_case4_yeoksam_development",
    name: "역삼동 테헤란로 코너 200억대 신축부지",
    posture: "development",
    preset: "golden_institutional",
    address: "서울특별시 강남구 역삼동 735-18",
    askingPriceKrw: 21000000000,
    totalDepositKrw: 200000000,
    monthlyRentKrw: 12000000,
    mgmtFeeKrw: 1000000,
    loanAmountKrw: 12000000000,
    loanInterestRate: 4.4,
    landAreaPyung: 125.8,
    totalFloorAreaPyung: 195.4,
    floors: "지상 3층 (기존 노후 건물)",
    buildYear: 1988,
    coordinates: { lat: 37.5002, lng: 127.0365 },
    docno: "CRE-2026-DEV-04",
    sectionTypes: ["property_overview", "location_access", "site_analysis", "development_feasibility", "risk_check", "investment_thesis", "next_steps"],
    photos: [
      { url: "https://images.unsplash.com/photo-1503387762-592deb58ef4e", caption: "테헤란로 이면 코너 대지 전경" },
      { url: "https://images.unsplash.com/photo-1577495508048-b635879837f1", caption: "신축 오피스 개발 기획 조감도" },
      { url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab", caption: "역삼역 도보 3분 역세권 도로 접면" },
      { url: "https://images.unsplash.com/photo-1497366216548-37526070297c", caption: "신축 빌딩 스택킹 배치 계획안" },
    ]
  }
];

async function runAllPosturesPerfectTest() {
  console.log("================================================================================");
  console.log("🌟 전 포스처 & 듀얼 프리셋 PPTX IM Basic 완벽 렌더링 배치 스트레스 테스트");
  console.log("================================================================================\n");

  const renderer = new MobileImPptxRenderer();
  const outputDir = path.resolve(process.cwd(), 'docs/test/stress/pptx_perfect_v3');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: any[] = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`[${i + 1}/${TEST_CASES.length}] ${tc.name} (${tc.posture} / ${tc.preset}) 렌더링 중...`);

    const finOutputs = calculateFinancials({
      posture: tc.posture,
      monthlyRentKrw: tc.monthlyRentKrw,
      purchasePriceKrw: tc.askingPriceKrw,
      totalDepositManwon: tc.totalDepositKrw / 10000,
      mgmtFeeTotalManwon: tc.mgmtFeeKrw / 10000,
      loanAmountManwon: tc.loanAmountKrw / 10000,
      totalAreaSqm: Math.round(tc.totalFloorAreaPyung / 0.3025),
      platAreaSqm: Math.round(tc.landAreaPyung / 0.3025),
      assetType: "상업용 부동산",
    });

    const sections = tc.sectionTypes.map(st => {
      const title = getSectionTitle(st, "상업용 부동산");
      let markdown = generatePremiumTemplate(
        st,
        { title: tc.name, address: tc.address, asset_type: "상업용 부동산", price_band: `${(tc.askingPriceKrw / 100000000).toFixed(0)}억대`, area_signal: tc.address.split(" ")[1] || "서울 핵심권역" },
        {
          plat_area_pyung: tc.landAreaPyung,
          total_area_pyung: tc.totalFloorAreaPyung,
          floors: tc.floors,
          build_year: tc.buildYear,
          parking_count: 18,
          elevator_count: 1,
          zoning_district: "제3종일반주거지역",
          structure: "철근콘크리트구조"
        },
        { area_signal: tc.address.split(" ")[1] || "서울 핵심권역", subway_info: "지하철역 도보 4분", road_info: "대로변 접면" },
        { target_buyers: ["법인", "자산가", "개발사"] },
        {
          asking_price_manwon: tc.askingPriceKrw / 10000,
          total_deposit_manwon: tc.totalDepositKrw / 10000,
          monthly_rent_total_krw: tc.monthlyRentKrw,
          mgmt_fee_total_manwon: tc.mgmtFeeKrw / 10000,
          loan_amount_manwon: tc.loanAmountKrw / 10000,
        },
        null,
        finOutputs as any,
        tc.posture
      );

      if (st === 'lease_status' && tc.posture === 'income') {
        markdown += `\n\n### 층별 상세 임대차 렌트롤\n| 층수 | 임차인 및 주요 업종 | 보증금(원) | 월 임대료(원) | 만기일 |\n|---|---|---|---|---|\n| 1층 | 대형 문전약국 (직영) | 300,000,000 | 15,000,000 | 2028-12 |\n| 2~5층 | 메디컬 병의원 클리닉 | 600,000,000 | 32,000,000 | 2029-05 |\n| 6~7층 | 어학원 및 법인 사옥 | 250,000,000 | 12,500,000 | 2027-06 |\n| **합계** | **전층 만실 (공실률 0.0%)** | **1,150,000,000** | **59,500,000** | **WALE 3.5년** |`;
      }

      return {
        title,
        section_type: st,
        markdown,
        confidence: "공부확인",
      };
    });

    // Summary 슬라이드용 메트릭스
    sections.unshift({
      title: "핵심 투자 지표 요약",
      section_type: "summary" as any,
      markdown: `
| 지표 항목 | 세부 수치 | 비고 |
|---|---|---|
| 매매 희망가 | ${(tc.askingPriceKrw / 100000000).toFixed(1)}억원 | 건물분 부가세 별도 |
| 대지 / 연면적 | ${tc.landAreaPyung}평 / ${tc.totalFloorAreaPyung}평 | ${tc.floors} |
| 담보대출 승계 | ${(tc.loanAmountKrw / 100000000).toFixed(1)}억원 (${tc.loanInterestRate}%) | 실투자금 최적화 |
| 준공년도 | ${tc.buildYear}년 준공 | 정밀안전 A등급 |
| 입지 특성 | ${tc.address.split(" ")[1] || "핵심권역"} 역세권 | 대로변 우수한 가시성 |
`,
      confidence: "전문가검증",
    });

    const pptxInput: MobileImPptxInput = {
      buildingId: tc.id,
      preset: tc.preset,
      posture: tc.posture,
      grade: "A",
      docno: tc.docno,
      doc: {
        title: tc.name,
        body: {
          photo_urls: tc.photos.map(p => p.url),
          photos: tc.photos,
          coordinates: tc.coordinates,
          sections,
        },
        sections,
      },
      building: {
        area_signal: tc.address.split(" ")[1] || "서울 핵심권역",
        asset_type: "상업용 부동산",
        price_band: `${(tc.askingPriceKrw / 100000000).toFixed(0)}억대`,
      },
      broker: {
        display_name: "김수석 자산관리위원",
        company_name: "CREDEAL PRIME PARTNERS",
        phone: "02-555-0100",
      }
    };

    const startTime = Date.now();
    const renderResult = await renderer.render(pptxInput);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    const outFileName = `${tc.id}_${tc.preset}_perfect_v3.pptx`;
    const outFilePath = path.join(outputDir, outFileName);
    fs.writeFileSync(outFilePath, renderResult.buffer);

    console.log(`  ✅ 생성 완료: ${renderResult.slideCount}장 | ${(renderResult.fileSizeBytes / 1024).toFixed(1)} KB | ${duration}초 | 경고: ${renderResult.warnings.length}건`);
    if (renderResult.warnings.length > 0) {
      renderResult.warnings.forEach(w => console.log(`     ⚠️ ${w}`));
    }

    results.push({
      caseNo: i + 1,
      id: tc.id,
      name: tc.name,
      posture: tc.posture,
      preset: tc.preset,
      slideCount: renderResult.slideCount,
      fileSizeKb: (renderResult.fileSizeBytes / 1024).toFixed(1),
      durationSec: duration,
      warningsCount: renderResult.warnings.length,
      filePath: outFilePath,
      passed: renderResult.warnings.length === 0 && renderResult.slideCount >= 7,
    });
  }

  console.log("\n================================================================================");
  console.log(`🎯 4개 포스처 전체 테스트 완료! (${results.filter(r => r.passed).length}/${results.length} PASS)`);
  console.log("================================================================================");

  const logPath = path.resolve(process.cwd(), 'docs/test/stress/13_전포스처_PPTX_배치_실행로그.json');
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n로그 저장 완료: ${logPath}\n`);
}

runAllPosturesPerfectTest().catch(console.error);
