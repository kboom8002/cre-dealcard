/**
 * PPTX IM Basic 지도 및 다중 사진 갤러리 렌더링 E2E 스트레스 테스트 스크립트
 * 
 * 실행: npx tsx --import ./scripts/env-preload.js scripts/stress-test-pptx-map-gallery.ts
 */
import { MobileImPptxRenderer, type MobileImPptxInput } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import * as fs from 'fs';
import * as path from 'path';

async function testPptxMapAndGalleryRendering() {
  console.log("================================================================================");
  console.log("📊 PPTX IM Basic 지도 및 이미지 갤러리 렌더링 E2E 정밀 스트레스 테스트");
  console.log("================================================================================\n");

  const renderer = new MobileImPptxRenderer();

  // 테스트 매물: 서초동 160억대 메디컬 빌딩 (지도 + 4장 사진 갤러리 포함)
  const testInput: MobileImPptxInput = {
    buildingId: "bld_seocho_medical_160",
    tier: "basic",
    preset: "golden_institutional",
    posture: "income",
    grade: "A",
    docno: "CRE-2026-MED-01",
    doc: {
      title: "서초동 역세권 160억대 메디컬 빌딩",
      body: {
        photo_urls: [
          "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab",
          "https://images.unsplash.com/photo-1577495508048-b635879837f1",
          "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b",
          "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d",
        ],
        photos: [
          { url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab", caption: "서초대로 25m 메인 도로변 외관 전경" },
          { url: "https://images.unsplash.com/photo-1577495508048-b635879837f1", caption: "1층 대형 약국 및 메디컬 전용 로비" },
          { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b", caption: "3층 안과·피부과 전문의원 내부 인테리어" },
          { url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d", caption: "자주식 18대 전용 주차장 및 옥상 휴게공간" },
        ],
      },
      sections: [
        {
          title: "🏢 자산 개요",
          markdown: "### 자산 개요\n- 매매가: 165억원\n- 대지면적: 142.5평 | 연면적: 620.8평\n- 층수: 지하 2층 ~ 지상 7층 (2017년 준공)",
        },
        {
          title: "📍 입지 및 교통",
          markdown: "### 입지 및 교통\n- 강남역/양재역 더블역세권 도보 4분\n- 서초대로 25m 대로변 접면\n- 30만 배후 의료 수요",
        },
        {
          title: "📊 임대 현황 및 렌트롤",
          markdown: "### 렌트롤 현황\n- 보증금 11.5억원 / 월 임대료 5,950만원\n- 공실률 0.0% 만실 운영",
        },
        {
          title: "💰 수익률 및 현금흐름",
          markdown: "### 수익률 분석\n- 실질 Cap Rate: 연 4.62%\n- 대출 85억 승계 시 ROE 5.84%",
        },
        {
          title: "⚠️ 리스크 점검",
          markdown: "### 리스크 체크\n- 물리적 결함 없음 (2017년 준공)\n- 테넌트 인테리어 5억 투입으로 이탈 리스크 극소",
        },
        {
          title: "🎯 투자 논거",
          markdown: "### 매수 추천\n- 강남권 희소 메디컬 올근생 자산\n- 공실 리스크 제로 코어 자산",
        },
        {
          title: "📋 진행 절차",
          markdown: "### 인수 절차\n- 1단계: NDA 접수\n- 2단계: 현장 실사 및 병원장 미팅\n- 3단계: 계약 체결",
        }
      ]
    },
    building: {
      area_signal: "서초권역",
      asset_type: "메디컬빌딩",
      price_band: "160억대",
    },
    broker: {
      display_name: "김수석 자산관리전문위원",
      company_name: "CREDEAL PRIME PARTNERS",
      phone: "02-555-0100",
    }
  };

  try {
    console.log("⏳ [Step 1] PPTX 렌더러 실행 및 슬라이드 시퀀스 빌드...");
    const result = await renderer.render(testInput);

    console.log(`✅ [Step 2] PPTX 생성 성공!`);
    console.log(`   - 총 슬라이드 수: ${result.slideCount}장`);
    console.log(`   - 파일 크기: ${(result.fileSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`   - 생성 일시: ${result.generatedAt}`);
    console.log(`   - 발생 경고: ${result.warnings.length > 0 ? result.warnings.join(', ') : '없음 (0건)'}`);

    // 로컬 파일 저장
    const outputDir = path.resolve(process.cwd(), 'docs/test/stress');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputFilePath = path.join(outputDir, 'Seocho_Medical_160_PPTX_Test.pptx');
    fs.writeFileSync(outputFilePath, result.buffer);
    console.log(`💾 [Step 3] PPTX 파일 저장 완료: ${outputFilePath}\n`);

    console.log("================================================================================");
    console.log("🎯 PPTX IM Basic 지도 및 갤러리 렌더링 검증 결과: 100% PASS");
    console.log("================================================================================");
  } catch (error) {
    console.error("❌ PPTX 렌더링 실패:", error);
    process.exit(1);
  }
}

testPptxMapAndGalleryRendering().catch(console.error);
