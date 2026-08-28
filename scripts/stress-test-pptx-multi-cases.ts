/**
 * 지도 이미지 및 4장 이상 사진 첨부 3개 이상 케이스 PPTX 생성 E2E 테스트
 * 
 * 실행: npx tsx --import ./scripts/env-preload.js scripts/stress-test-pptx-multi-cases.ts
 */
import { MobileImPptxRenderer, type MobileImPptxInput } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import * as fs from 'fs';
import * as path from 'path';

// 4개 대표 포스처 테스트 케이스 (지도 + 4~5장 고화질 사진 첨부)
const multiCasePptxTests: MobileImPptxInput[] = [
  // 🏥 Case 1: [Income] 서초동 160억대 메디컬 빌딩 (Golden Institutional 테마, 4장 사진)
  {
    buildingId: "bld_case1_seocho_medical",
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
          { url: "https://images.unsplash.com/photo-1577495508048-b635879837f1", caption: "1층 대형 약국 및 메디컬 로비" },
          { url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b", caption: "3층 안과·피부과 전문의원 내부 인테리어" },
          { url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d", caption: "자주식 18대 전용 주차장 및 옥상 휴게공간" },
        ],
        coordinates: { lat: 37.4912, lng: 127.0285 },
      },
      sections: [
        { title: "🏢 자산 개요", markdown: "### 자산 개요\n- 매매가: 165억원\n- 대지면적: 142.5평 | 연면적: 620.8평\n- 지하 2층 ~ 지상 7층 (2017년 준공)" },
        { title: "📍 입지 및 교통", markdown: "### 입지 및 교통\n- 강남역·양재역 더블역세권 도보 4분\n- 서초대로 25m 접면\n- 30만 배후 의료 수요" },
        { title: "📊 임대 현황 및 렌트롤", markdown: "### 렌트롤\n- 보증금 11.5억원 / 월 5,950만원\n- 전층 메디컬/약국 만실 운영 (WALE 3.5년)" },
        { title: "💰 수익률 및 현금흐름", markdown: "### 수익률\n- 실질 Cap Rate: 연 4.62%\n- 대출 85억 승계 시 ROE 5.84%" },
        { title: "⚠️ 리스크 점검", markdown: "### 리스크 체크\n- 병의원 인테리어 5억 투자로 이탈 리스크 극소\n- 물리적 결함 0건" },
        { title: "🎯 투자 논거", markdown: "### 매수 추천\n- 강남권 희소 메디컬 올근생 랜드마크\n- 공실 리스크 제로 코어 자산" },
        { title: "📋 진행 절차", markdown: "### 진행 절차\n- NDA 접수 → 현장 실사 → LOI 제출" }
      ]
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
  },

  // 👔 Case 2: [Owner-Occupier] 성수 IT밸리 130억대 단독 통사옥 (Pro Dark Obsidian 테마, 5장 사진)
  {
    buildingId: "bld_case2_seongsu_headquarter",
    preset: "pro_dark_obsidian",
    posture: "owner_occupied",
    grade: "A",
    docno: "CRE-2026-HQ-02",
    doc: {
      title: "성수 IT밸리 130억대 단독 통사옥",
      body: {
        photo_urls: [
          "https://images.unsplash.com/photo-1497366216548-37526070297c",
          "https://images.unsplash.com/photo-1497215728101-856f4ea42174",
          "https://images.unsplash.com/photo-1524758631624-e2822e304c36",
          "https://images.unsplash.com/photo-1504384308090-c894fdcc538d",
          "https://images.unsplash.com/photo-1517502884422-41eaead166d4",
        ],
        photos: [
          { url: "https://images.unsplash.com/photo-1497366216548-37526070297c", caption: "테라코타 & 노출콘크리트 모던 사옥 전경" },
          { url: "https://images.unsplash.com/photo-1497215728101-856f4ea42174", caption: "1층 브랜드 쇼룸 및 타운홀 미팅 라운지" },
          { url: "https://images.unsplash.com/photo-1524758631624-e2822e304c36", caption: "기준층 층고 4.2m 개방형 오픈 오피스" },
          { url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d", caption: "지하 1층 층고 4.5m 대형 스튜디오" },
          { url: "https://images.unsplash.com/photo-1517502884422-41eaead166d4", caption: "서울숲 조망 루프탑 테라스 정원" },
        ],
        coordinates: { lat: 37.5445, lng: 127.0560 },
      },
      sections: [
        { title: "🏢 자산 개요", markdown: "### 자산 개요\n- 매매가: 135억원\n- 대지 135.8평 | 연면적 512.4평\n- 지하 1층 ~ 지상 6층 (2020년 신축)" },
        { title: "📍 입지 및 접근성", markdown: "### 입지\n- 성수역(2호선) 도보 5분\n- 무신사/크래프톤 IT 진흥지구 중심\n- MZ 핵심 인재 채용 1등 입지" },
        { title: "🏢 사옥 적합도 분석", markdown: "### 사옥 스펙\n- 전층 명도 100% 완료 즉시 입주\n- 층고 4.2m 개방형 설계\n- 자주식 12대 전용 주차장" },
        { title: "⚖️ 비용 비교 분석", markdown: "### 자가사용 vs 임차비용\n- 임차 유지 대비 연간 2.47억원 비용 절감\n- 감가상각 및 법인세 절세 효과" },
        { title: "⚠️ 리스크 점검", markdown: "### 리스크 체크\n- 명도 확약 체결 완료 (2개월 내 공실 인도)\n- 층별 전력 50kW 이상 확보" },
        { title: "🎯 투자 논거", markdown: "### 매수 추천\n- 기업 브랜드 위상 제고 및 IR 극대화\n- 성수 준공업지역 평당 9천만원대 가격 경쟁력" },
        { title: "📋 진행 절차", markdown: "### 진행 절차\n- 사옥 실사 접수 → 실측 및 엔지니어링 미팅 → 매매계약" }
      ]
    },
    building: {
      area_signal: "성수권역",
      asset_type: "단독통사옥",
      price_band: "130억대",
    },
    broker: {
      display_name: "박사옥 기업부동산팀장",
      company_name: "CREDEAL CORPORATE PARTNERS",
      phone: "02-555-0200",
    }
  },

  // 🛠️ Case 3: [Value-Add] 신사동 가로수길 90억대 코너 밸류애드 (Pro Dark Obsidian 테마, 4장 사진)
  {
    buildingId: "bld_case3_sinsa_value_add",
    preset: "pro_dark_obsidian",
    posture: "trading",
    grade: "A",
    docno: "CRE-2026-VAL-03",
    doc: {
      title: "신사동 가로수길 90억대 코너 밸류애드",
      body: {
        photo_urls: [
          "https://images.unsplash.com/photo-1555396273-367ea4eb4db5",
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4",
          "https://images.unsplash.com/photo-1578683010236-d716f9a3f461",
          "https://images.unsplash.com/photo-1513694203232-719a280e022f",
        ],
        photos: [
          { url: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5", caption: "가로수길 세로수길 8m 코너 노후 외관" },
          { url: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4", caption: "1층 F&B 감성 카페 리모델링 예정 공간" },
          { url: "https://images.unsplash.com/photo-1578683010236-d716f9a3f461", caption: "2~4층 커튼월 전면 교체 예정 오피스" },
          { url: "https://images.unsplash.com/photo-1513694203232-719a280e022f", caption: "증축 예정 5층 루프탑 라운지" },
        ],
        coordinates: { lat: 37.5185, lng: 127.0230 },
      },
      sections: [
        { title: "🏢 자산 개요", markdown: "### 자산 개요\n- 매매가: 98억원 (평당 9,580만원)\n- 대지 102.3평 | 연면적 215.4평\n- 지하 1층 ~ 지상 4층 (용적률 165%, 법정 200%)" },
        { title: "📍 입지 분석", markdown: "### 입지\n- 신사역(3호선·신분당선) 도보 5분\n- 세로수길 8m 코너 자리 가시성 최상" },
        { title: "📊 현재 임대차", markdown: "### 임대 현황\n- 보증금 1.8억 / 월 1,100만 (노후 저임대)\n- 전층 명도 협의 100% 완료 (공실 인계)" },
        { title: "💰 밸류애드 사업수지", markdown: "### 밸류업 수지\n- 1개층 증축(연면적 60평) + 전면 대수선 (공사비 22억)\n- 리모델링 후 예상 월세 3,200만 (연 4.22%)\n- 예상 매각가 165억원 (매각차익 40.5억, ROI 32.5%)" },
        { title: "⚠️ 리스크 점검", markdown: "### 리스크 체크\n- 일조권 사선제한 사전 검토 완료 (증축 가능)\n- 1차 구조안전진단 통과" },
        { title: "🎯 투자 논거", markdown: "### 매수 추천\n- 강남 100억 미만 코너 매물의 절대적 희소성\n- 명도 완료 + 용적률 35% 증축 확실한 밸류업" },
        { title: "📋 진행 절차", markdown: "### 진행 절차\n- 가설계 도면 검토 → 시공 견적 비교 → 매매계약" }
      ]
    },
    building: {
      area_signal: "강남권역",
      asset_type: "밸류애드빌딩",
      price_band: "90억대",
    },
    broker: {
      display_name: "최밸류 개발자문위원",
      company_name: "CREDEAL VALUE PARTNERS",
      phone: "02-555-0300",
    }
  },

  // 🏗️ Case 4: [Development] 역삼동 테헤란로 코너 200억대 신축부지 (Golden Institutional 테마, 4장 사진)
  {
    buildingId: "bld_case4_yeoksam_development",
    preset: "golden_institutional",
    posture: "development",
    grade: "A",
    docno: "CRE-2026-DEV-04",
    doc: {
      title: "역삼동 테헤란로 코너 200억대 신축부지",
      body: {
        photo_urls: [
          "https://images.unsplash.com/photo-1503899036084-c55cdd92da26",
          "https://images.unsplash.com/photo-1541888946425-d0fbb18086f6",
          "https://images.unsplash.com/photo-1506146332389-18140dc7b2fb",
          "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab",
        ],
        photos: [
          { url: "https://images.unsplash.com/photo-1503899036084-c55cdd92da26", caption: "테헤란로 센터필드 맞은편 10m x 8m 코너 부지" },
          { url: "https://images.unsplash.com/photo-1541888946425-d0fbb18086f6", caption: "멸실 예정 기존 노후 건물 전경" },
          { url: "https://images.unsplash.com/photo-1506146332389-18140dc7b2fb", caption: "신축 부지 전면 10m 도로 차량 진출입로" },
          { url: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab", caption: "신축 가설계 조감도 (지하 2층 ~ 지상 7층, 연면적 680평)" },
        ],
        coordinates: { lat: 37.5015, lng: 127.0390 },
      },
      sections: [
        { title: "🏢 대지 개요", markdown: "### 대지 개요\n- 매매가: 210억원 (평당 1억 2,460만원)\n- 토지 168.5평 | 제3종일반주거지역\n- 10m x 8m 양면 코너 접면 (멸실 조건 잔금)" },
        { title: "📍 입지 환경", markdown: "### 입지\n- 역삼역(2호선) 도보 4분\n- 테헤란로 센터필드 및 조선팰리스 호텔 맞은편\n- 강남권 프라임 오피스 공급 부족 수혜지" },
        { title: "📐 신축 가설계 개요", markdown: "### 신축 규모\n- 지하 2층 ~ 지상 7층\n- 연면적 680.1평 (용적률 250% 적용)\n- 자주식 4대 + 기계식 12대 (총 16대 주차)" },
        { title: "🏗️ 개발 사업수지", markdown: "### 사업성 분석\n- 총 사업비: 300.0억원 (토지비 210억 + 공사비 57.8억 + 제비용 32.2억)\n- 자기자본 65억 / PF 대출 235억\n- 개발 후 자산가치: 353.6억원 (개발이익 53.6억, IRR 16.8%)" },
        { title: "⚠️ 개발 리스크", markdown: "### 리스크 점검\n- 매매계약 즉시 토지사용승낙서 발급 (인허가 2개월 단축)\n- 지반 암반층 적합 확인" },
        { title: "🎯 개발 논거", markdown: "### 매수 추천\n- 테헤란로 역세권 150평 이상 코너 필지의 압도적 희소성\n- 멸실 조건으로 취득세 절감 및 명도 리스크 0%" },
        { title: "📋 진행 절차", markdown: "### 진행 절차\n- 가설계 도면 브리핑 → 시공사 도급 견적 검토 → 토지 매매계약" }
      ]
    },
    building: {
      area_signal: "강남권역",
      asset_type: "신축개발부지",
      price_band: "200억대",
    },
    broker: {
      display_name: "정시행 개발총괄본부장",
      company_name: "CREDEAL DEVELOPMENT PARTNERS",
      phone: "02-555-0400",
    }
  }
];

async function runMultiCasePptxStressTest() {
  console.log("================================================================================");
  console.log("📊 4대 대표 케이스 지도 및 다중 사진(4~5장) PPTX 생성 E2E 정밀 스트레스 테스트");
  console.log("================================================================================\n");

  const renderer = new MobileImPptxRenderer();
  const outputDir = path.resolve(process.cwd(), 'docs/test/stress/pptx_outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const summaryResults: any[] = [];

  for (let i = 0; i < multiCasePptxTests.length; i++) {
    const tc = multiCasePptxTests[i];
    console.log(`[${i + 1}/4] ${tc.doc.title} (${tc.posture} / ${tc.preset}) PPTX 렌더링 중...`);

    const startTime = Date.now();
    try {
      const result = await renderer.render(tc);
      const elapsedMs = Date.now() - startTime;

      const fileName = `${tc.buildingId}_${tc.preset}.pptx`;
      const filePath = path.join(outputDir, fileName);
      fs.writeFileSync(filePath, result.buffer);

      const caseSummary = {
        caseNo: i + 1,
        buildingId: tc.buildingId,
        title: tc.doc.title,
        posture: tc.posture,
        preset: tc.preset,
        photoCount: tc.doc.body.photos.length,
        slideCount: result.slideCount,
        fileSizeBytes: result.fileSizeBytes,
        fileSizeKb: (result.fileSizeBytes / 1024).toFixed(1),
        elapsedMs,
        warningsCount: result.warnings.length,
        filePath,
        status: "PASS",
      };

      summaryResults.push(caseSummary);
      console.log(`  ✅ 생성 성공: 슬라이드 ${result.slideCount}장 | 크기 ${caseSummary.fileSizeKb} KB | 소요시간 ${(elapsedMs / 1000).toFixed(2)}초`);
    } catch (err: any) {
      console.error(`  ❌ 생성 실패 (${tc.buildingId}):`, err.message);
      summaryResults.push({
        caseNo: i + 1,
        buildingId: tc.buildingId,
        title: tc.doc.title,
        status: "FAIL",
        error: err.message,
      });
    }
  }

  console.log("\n================================================================================");
  console.log(`🎯 4개 케이스 전체 테스트 완료! (${summaryResults.filter(r => r.status === 'PASS').length}/4 PASS)`);
  console.log("================================================================================\n");

  const logPath = path.resolve(process.cwd(), 'docs/test/stress/09_다중케이스_PPTX_생성_실행로그.json');
  fs.writeFileSync(logPath, JSON.stringify({ timestamp: new Date().toISOString(), summaryResults }, null, 2), 'utf-8');
  console.log(`로그 저장 완료: ${logPath}`);
}

runMultiCasePptxStressTest().catch(console.error);
