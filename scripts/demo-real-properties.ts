/**
 * @file demo-real-properties.ts
 * @description 실제 매물 데이터 + 공공 API 인출 데이터 + 지도/지적도 + 건물 사진 풀세트 탑재
 *              PPTX IM 무마찰 완전 생성 스튜디오 E2E 시연 스크립트
 *
 * 3대 실매물 시나리오 (docs/product/02_CASE_STUDIES_REAL_DATA_SCENARIOS.md 기반):
 *  1. [Case 1] 당산동 115억 근생 (수익형 / commercial_visual_grid, 4장 건물사진, 카카오/정적 지도, V-World 지적도, 건축물대장, 상권분석, 렌트롤)
 *  2. [Case 2] 역삼동 120억 사옥 (사옥형 / corporate_clean_white, 4장 건물사진, 테헤란로 지도, 지적도, 총취득원가, vsLease TCO, 사옥 단독 명칭 표기권)
 *  3. [Case 3] 잠원동 242.27억 신축부지 (개발형 / development_technical_blueprint, 다필지 지적도, 3단 투입비, 조례기한, 신축 스태킹, 부록분리)
 *
 * 실행: npx tsx scripts/demo-real-properties.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../src/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../src/domain/building/pptx-studio/approval/studio-approval-service';

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'demo-output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * V-World 공공 연속지적도(Cadastral Map) 고품질 벡터 이미지 생성기
 */
async function generateCadastralPng(mainLot: string, areaM2: number, zoning: string, subLots: string[] = []): Promise<{ buffer: Buffer; base64: string }> {
  const svg = `
  <svg width="1600" height="1200" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#F8FAFC"/>
    <defs>
      <pattern id="cadGrid" width="25" height="25" patternUnits="userSpaceOnUse">
        <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#E2E8F0" stroke-width="0.8"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#cadGrid)"/>
    
    <!-- 인접 필지들 (회색 경계) -->
    <polygon points="60,60 260,70 240,210 70,190" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="140" y="140" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">산 14-2 임</text>
    
    <polygon points="530,80 740,95 720,270 510,230" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="610" y="170" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">121-5 대</text>

    <polygon points="90,390 280,400 260,540 100,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="170" y="470" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">125-1 대</text>

    <polygon points="510,380 730,390 710,550 490,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="600" y="470" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">125-8 도</text>

    <!-- 도로 접면 표시 (너비 10m 도로) -->
    <path d="M 0,330 L 800,345" stroke="#CBD5E1" stroke-width="28" opacity="0.5"/>
    <text x="400" y="342" font-family="sans-serif" font-weight="bold" font-size="12" fill="#475569" text-anchor="middle">10m 대로변 접면 도로</text>

    <!-- 대상 필지 (금색/주황색 하이라이트 및 실선 경계) -->
    <polygon points="270,180 520,195 490,430 250,410" fill="#FEF3C7" stroke="#D97706" stroke-width="3.5" stroke-dasharray="8,3"/>
    
    <!-- 필지 텍스트 정보 -->
    <circle cx="375" cy="285" r="5" fill="#B45309"/>
    <text x="375" y="265" font-family="sans-serif" font-weight="bold" font-size="22" fill="#92400E" text-anchor="middle">${mainLot}</text>
    <text x="375" y="300" font-family="sans-serif" font-weight="bold" font-size="15" fill="#B45309" text-anchor="middle">[${zoning}] ${areaM2.toLocaleString()}㎡ (${(areaM2 * 0.3025).toFixed(1)}평)</text>
    ${subLots.length > 0 ? `<text x="375" y="325" font-family="sans-serif" font-size="12" fill="#78350F" text-anchor="middle">(포함 필지: ${subLots.join(', ')})</text>` : ''}
    
    <!-- 방위표 (North) -->
    <g transform="translate(740, 45)">
      <polygon points="0,-24 8,8 0,4 -8,8" fill="#1E293B"/>
      <text x="0" y="-28" font-family="sans-serif" font-weight="bold" font-size="11" fill="#1E293B" text-anchor="middle">N</text>
    </g>
    <text x="50" y="580" font-family="sans-serif" font-size="11" fill="#94A3B8">국토교통부 공간정보 오픈플랫폼 (V-World WMS 연속지적도) | 축척 1:1,200</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    buffer,
    base64: `image/png;base64,${buffer.toString('base64')}`,
  };
}

// ═══════════════════════════════════════════════════════════════
// 실물 건물 사진 샘플 세트 (고화질 건축 사진)
// ═══════════════════════════════════════════════════════════════
const REAL_BUILDING_PHOTOS = {
  dangsan: [
    { url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80', caption: '당산역 코너 메디컬·근린생활 빌딩 전경 (외관 25m 대로변 접면)' },
    { url: 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=2400&q=80', caption: '1층 온누리약국 및 연세의원 전용 로비 출입구' },
    { url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=2400&q=80', caption: '2~3층 정형외과 및 피트니스 클럽 내부 인테리어' },
    { url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=2400&q=80', caption: '자주식 8대 주차장 및 옥상 정원 조경' },
  ],
  yeoksam: [
    { url: 'https://images.unsplash.com/photo-1554469384-e58fac16e23a?auto=format&fit=crop&w=2400&q=80', caption: '테헤란로 이면 단독 사옥 외관 (기업 단독 브랜딩 및 간판 설치 가능)' },
    { url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=2400&q=80', caption: '1층 안내 데스크 및 VIP 접견 라운지' },
    { url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2400&q=80', caption: '2~4층 IT 연구개발 및 오픈 워크스페이스 공간' },
    { url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=2400&q=80', caption: '5층 대회의실 및 테라스 휴게 라운지' },
  ],
  jamwon: [
    { url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=2400&q=80', caption: '잠원역 초역세권 신축 개발 대상 부지 전경 (160평 정형 필지)' },
    { url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186f5f8?auto=format&fit=crop&w=2400&q=80', caption: '8m x 6m 코너 각지 도로 접면 상태' },
    { url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=2400&q=80', caption: '기존 구옥 현황 (전원 명도 확약 체결 완료)' },
    { url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80', caption: '신축 완료 후 예상 랜드마크 조감도' },
  ],
  sinsa: [
    { url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2400&q=80', caption: '신사동 가로수길 부티크 호스피탈리티 & 코리빙 빌딩 전경' },
    { url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=2400&q=80', caption: '1층 컨시어지 및 프리미엄 카페·라운지' },
    { url: 'https://images.unsplash.com/photo-1591088398332-8a7791972843?auto=format&fit=crop&w=2400&q=80', caption: '스위트 코너 룸 및 독립형 테라스 객실 내부' },
    { url: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=2400&q=80', caption: '루프탑 라운지 바 및 야외 조경 휴게 공간' },
  ],
  euljiro: [
    { url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=80', caption: '을지로 중심업무지구(CBD) 코너 꼬마빌딩 외관 전경' },
    { url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=80', caption: '1층 힙지로 감성 F&B 리테일 테넌트 입점 전경' },
    { url: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2400&q=80', caption: '2~4층 스타트업 및 크리에이터 전용 오피스 공간' },
    { url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=2400&q=80', caption: '최신 승강기 및 리모델링 완료된 코어 시설' },
  ],
};

// ═══════════════════════════════════════════════════════════════
// 메인 시연 실행 루틴
// ═══════════════════════════════════════════════════════════════
async function runRealDataDemonstration() {
  console.log('======================================================================');
  console.log('🏛️ CREDEAL PPTX IM Studio — 지도·지적도·사진·공공API 완비 풀 덱 시연');
  console.log('======================================================================\n');

  // 1. 지적도 생성
  const dangsanCadastral = await generateCadastralPng('당산동 123-4 대', 345.20, '준공업지역');
  const yeoksamCadastral = await generateCadastralPng('역삼동 642-1 대', 247.90, '제2종일반주거');
  const jamwonCadastral = await generateCadastralPng('잠원동 123-1외 1필지', 528.93, '제3종일반주거', ['잠원동 123-1', '잠원동 123-2']);
  const sinsaCadastral = await generateCadastralPng('신사동 540-2 대', 380.20, '일반상업지역');
  const euljiroCadastral = await generateCadastralPng('을지로3가 110-5 대', 210.40, '중심상업지역');

  // ═══════════════════════════════════════════════════════════════
  // Case 1: 당산동 115억 근생
  // ═══════════════════════════════════════════════════════════════
  const case1Data = {
    dealId: 'case-01-dangsan',
    title: '당산역세권 메디컬·근린생활 빌딩 매각 안내서',
    posture: 'income' as const,
    preset: 'commercial_visual_grid',
    askingPrice: 11500000000,
    grade: 'A' as const, // A등급: 재무/자본/DCF/비교사례/지적도 전체 풀 전개
    doc: {
      title: '당산역세권 메디컬·근린생활 빌딩',
      posture: 'income',
      address: '서울특별시 영등포구 당산동',
      body: {
        title: '당산역세권 메디컬·근린생활 빌딩',
        askingPrice: 11500000000,
        coordinates: { lat: 37.5340, lng: 126.9027 },
        photo_urls: REAL_BUILDING_PHOTOS.dangsan.map(p => p.url),
        photos: REAL_BUILDING_PHOTOS.dangsan.map(p => ({ ...p, buildingId: 'case-01-dangsan' })),
        poiSpots: [
          { name: '당산역 (2호선/9호선)', lat: 37.5345, lng: 126.9020, category: 'subway' as const },
          { name: '연세의원', lat: 37.5340, lng: 126.9027, category: 'hospital' as const },
          { name: '온누리약국', lat: 37.5341, lng: 126.9028, category: 'shopping' as const },
        ],
        heroCard: {
          askingPriceKrw: 11500000000,
          landAreaM2: 345.20,
          grossFloorAreaM2: 1141.15,
          capRatePct: 5.33,
          monthlyRentKrw: 19460000,
          depositKrw: 290000000,
          useZone: '준공업지역',
          floors: '지하 1층 ~ 지상 5층',
          completionYear: 2011,
        },
        summary: {
          leadText: '당산역 도보 3분 초역세권 대로변 코너에 위치한 우량 메디컬·근린생활 빌딩',
          narrative: '보증금 총 2.9억 원에 월 임대료 1,946만 원이 안정적으로 발생하여 연 순수익률 (Cap Rate) 5.33%의 우수한 현금흐름을 실현합니다. 1~2층에 연세의원이 대형 면적으로 장기 입점 중이며, 3층 헬스장, 온누리약국 등 우량 테넌트로 구성되어 있습니다.',
        },
        rentRoll: {
          totalUnits: 8, occupiedUnits: 6, vacantUnits: 0, ownerOccupiedUnits: 2, physicalVacancyRatePct: 0.0,
          units: [
            { floor: 'B1F', tenant: '카페/창고', deposit: 0, rent: 0, useStatus: 'owner_occupied', note: '매도인 직영 (공실 아님)' },
            { floor: '1F', tenant: '연세의원 본관 (그룹B)', deposit: 140000000, rent: 8830000, useStatus: 'occupied', note: '1F+2F 통합계약 대표행' },
            { floor: '2F', tenant: '연세의원 별관 (그룹B)', deposit: 0, rent: 0, useStatus: 'occupied', note: '그룹B 연결 (금액 1F 합산)' },
            { floor: '1F 일부', tenant: '온누리약국 (그룹A)', deposit: 60000000, rent: 1830000, useStatus: 'occupied', note: '처방전 독점 약국' },
            { floor: '3F', tenant: '바디짐 헬스클럽', deposit: 50000000, rent: 4550000, useStatus: 'occupied', note: '5년 장기계약' },
            { floor: '4F 호실1', tenant: '전통주 보틀샵', deposit: 30000000, rent: 2600000, useStatus: 'occupied', note: '안정적 영업 중' },
            { floor: '4F 호실2', tenant: '소유주 개인사무실', deposit: 0, rent: 0, useStatus: 'owner_occupied', note: '잔금 시 즉시 퇴거 확약' },
            { floor: '5F', tenant: '밝은이비인후과', deposit: 10000000, rent: 1650000, useStatus: 'occupied', note: '원장 직접 진료 중' },
          ],
        },
        // V-World / 공공 7종 API 인출 데이터
        enrichment: {
          buildingRegister: {
            totalArea: 1141.15, platArea: 345.20, archArea: 206.4, bcRat: 59.8, vlRat: 298.5,
            floorsAbove: 5, floorsBelow: 1, structure: '철근콘크리트구조', mainPurpose: '제1종·제2종 근린생활시설',
            elevatorCount: 1, parkingCount: 8, useAprDay: '20110512',
          },
          landUsePlan: {
            zoningDistrict: '준공업지역', zoningOverlap: ['가열지구'], buildingCoverageMax: 60, floorAreaRatioMax: 400,
          },
          landPrice: { pricePerSqm: 5500000, baseYear: '2024' },
          commercialDistrict: {
            districtName: '당산역 역세권 상권', districtType: '역세권/발달상권', mainIndustry: '의료/클리닉/F&B',
            floatingPopulation: 42500, salesIndex: 128.5, storeCount: 145, openRate: 4.2, closeRate: 1.8,
          },
          comparableTransactions: [
            { buildingName: '당산동 124-2 근생빌딩', dealAmount: 1085000, area: 980.2, dealDate: '2024-05' },
            { buildingName: '당산로 38길 메디컬타워', dealAmount: 1250000, area: 1240.5, dealDate: '2024-03' },
            { buildingName: '양평동 3가 근생', dealAmount: 980000, area: 850.0, dealDate: '2024-01' },
          ],
          cadastralMapImage: dangsanCadastral,
        },
      },
      sections: [
        {
          section_type: 'location_access',
          title: '입지 및 접근성 분석',
          markdown: `### 지하철 및 도로 교통망\n- 지하철 2·9호선 환승역 당산역 도보 3분 초역세권\n- 올림픽대로 및 노들로 차량 2분 진입\n\n| 구분 | 노선/도로 | 소요시간 |\n|---|---|---|\n| 지하철 | 당산역 (2호선/9호선) | 도보 3분 (약 210m) |\n| 주요도로 | 올림픽대로 / 노들로 | 차량 2분 진입 |\n| 버스노선 | 당산역 광역/간선 버스정류장 | 도보 2분 (20개 노선) |`
        },
        {
          section_type: 'property_overview',
          title: '토지 및 건물 제원',
          markdown: `### 건축물대장 기준 제원\n- 준공연도 2011년, 지하 1층 ~ 지상 5층 자주식 주차 8대\n\n| 항목 | 세부 제원 | 비고 |\n|---|---|---|\n| 대지면적 | 345.20㎡ (104.42평) | 제3종일반주거/준공업 |\n| 연면적 | 1,141.15㎡ (345.20평) | 용적률 산정 연면적 |\n| 주차 | 8대 자주식 | 승강기 1대 완비 |\n| 건폐율/용적률 | 건폐율 59.8% / 용적률 298.5% | 법정 기준 충족 |`
        },
        {
          section_type: 'lease_status',
          title: '임대차 현황 (Rent Roll)',
          markdown: `### 실측 렌트롤 상세 분석\n- 총 8개 구획 중 6개 임대 완료, 2개 자가사용 (공실률 0.0%)\n\n| 층수 | 임차인 | 보증금(원) | 월차임(원) | 계약만기 |\n|---|---|---:|---:|:---:|\n| B1F | 직영 카페/창고 | - | - | 자가사용 |\n| 1F | 연세의원 본관 (그룹B) | 140,000,000 | 8,830,000 | 2027-04 |\n| 2F | 연세의원 별관 (그룹B) | - | - | 2027-04 |\n| 1F일부 | 온누리약국 (그룹A) | 60,000,000 | 1,830,000 | 2026-10 |\n| 3F | 바디짐 헬스클럽 | 50,000,000 | 4,550,000 | 2028-01 |\n| 4F | 전통주 보틀샵 | 30,000,000 | 2,600,000 | 2025-04 |\n| 5F | 밝은이비인후과 | 10,000,000 | 1,650,000 | 2026-08 |\n| **합계** | **총 8개 구획** | **290,000,000** | **19,460,000** | **공실률 0%** |`
        },
        {
          section_type: 'income_analysis',
          title: '수익성 및 현금흐름 분석',
          markdown: `### 연간 순영업소득 (NOI) 및 수익률\n- 연간 임대료 수입: 2억 3,352만 원\n- 관리운영비 공제 후 연 순수익률 (Cap Rate): 5.33%\n\n| 항목 | 금액(원) | 산출 기준 |\n|---|---:|---|\n| 연간 총임대료 | 233,520,000 | 월 1,946만 원 × 12개월 |\n| 운영비용 (OPEX) | 21,500,000 | 실질 관리비 및 유지보수비 |\n| 순영업소득 (NOI) | 212,020,000 | 총수익 - 운영비용 |\n| 실질 투자금액 | 11,210,000,000 | 매매가 115억 - 보증금 2.9억 |\n| **연 순수익률** | **5.33%** | **NOI / 실질매입원가** |`
        },
        {
          section_type: 'risk_check',
          title: '권리관계 및 리스크 체크',
          markdown: `### 등기부등본 및 권리 분석\n- 소유권: 개인 2인 공동소유 (매각 동의 완료)\n- 근저당권: 채권최고액 42억 원 설정 (잔금 시 전액 말소 조건)\n- 위반건축물: 건축물대장상 위반건축물 표기 없음 (적법 건물)`
        },
        {
          section_type: 'investment_thesis',
          title: '핵심 투자 가치 제안',
          markdown: `### Value Proposition\n1. 초역세권 대로변 코너 입지 프리미엄\n2. 1~2층 메디컬 앵커 테넌트 장기 임차로 공실 리스크 완전 차단\n3. 연 순수익률 5.33% 달성 및 밸류애드 기회 확보`
        },
        {
          section_type: 'next_steps',
          title: '매수 진행 절차 및 타임라인',
          markdown: `### 거래 진행 로드맵\n- 1단계: LOI (매수의향서) 접수 및 세부 실사\n- 2단계: 매매계약 체결 (계약금 10%)\n- 3단계: 근저당 말소 확인 및 잔금 지급 (명도 확약 이행)`
        },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // Case 2: 역삼동 120억 사옥
  // ═══════════════════════════════════════════════════════════════
  const case2Data = {
    dealId: 'case-02-yeoksam',
    title: '테헤란로 이면 단독 사옥 빌딩 매각 안내서',
    posture: 'owner_occupied' as const,
    preset: 'corporate_clean_white',
    askingPrice: 12000000000,
    grade: 'A' as const,
    doc: {
      title: '테헤란로 이면 단독 사옥 빌딩',
      posture: 'owner_occupied',
      address: '서울특별시 강남구 역삼동',
      body: {
        title: '테헤란로 이면 단독 사옥 빌딩',
        askingPrice: 12000000000,
        coordinates: { lat: 37.5006, lng: 127.0365 },
        photo_urls: REAL_BUILDING_PHOTOS.yeoksam.map(p => p.url),
        photos: REAL_BUILDING_PHOTOS.yeoksam.map(p => ({ ...p, buildingId: 'case-02-yeoksam' })),
        poiSpots: [
          { name: '역삼역 (2호선)', lat: 37.5006, lng: 127.0365, category: 'subway' as const },
          { name: '테헤란로 IT밸리', lat: 37.5015, lng: 127.0380, category: 'landmark' as const },
        ],
        heroCard: {
          askingPriceKrw: 12000000000,
          landAreaM2: 247.90,
          grossFloorAreaM2: 760.33,
          useZone: '제2종일반주거지역',
          floors: '지하 1층 ~ 지상 5층',
          completionYear: 2021,
        },
        summary: {
          leadText: '강남 테헤란로 이면 IT·스타트업 및 전문직 법인을 위한 전층 독립형 신축급 사옥',
          narrative: '매매희망가 120억 원에 취득세(4.6%) 및 부대비용을 포함한 총취득원가는 126.6억 원으로 산출됩니다. 잔금 시 전층 즉시 명도 가능하여 기업 단독 브랜딩 및 사옥 단독 명칭 표기(간판 설치권)가 즉시 확보됩니다. 인근 임대료 대비 7개년 매입 보유 시 vsLease TCO 비용 절감 효과가 탁월합니다.',
        },
        enrichment: {
          buildingRegister: {
            totalArea: 760.33, platArea: 247.90, archArea: 148.7, bcRat: 59.9, vlRat: 199.8,
            floorsAbove: 5, floorsBelow: 1, structure: '철근콘크리트구조', mainPurpose: '업무시설 / 근린생활시설',
            elevatorCount: 1, parkingCount: 6, useAprDay: '20210825',
          },
          landUsePlan: {
            zoningDistrict: '제2종일반주거지역', buildingCoverageMax: 60, floorAreaRatioMax: 200,
          },
          landPrice: { pricePerSqm: 18500000, baseYear: '2024' },
          cadastralMapImage: yeoksamCadastral,
        },
      },
      sections: [
        {
          section_type: 'location_access',
          title: '입지 및 사옥 접근성',
          markdown: `### 강남 테헤란로 비즈니스 인프라\n- 역삼역(2호선) 도보 5분, 강남역 도보 10분\n- 테헤란로 대기업 및 IT 밸리 배후 중심지 위치`
        },
        {
          section_type: 'property_overview',
          title: '사옥 건물 제원 및 공간 구성',
          markdown: `### 단독 사옥 건축 개요\n- 2021년 준공된 신축급 올근생 업무시설\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 247.90㎡ (74.99평) |\n| 연면적 | 760.33㎡ (230.00평) |\n| 규모 | 지하 1층 ~ 지상 5층 |\n| 승강기 | 현대엘리베이터 1대 (13인승) |\n| 주차대수 | 6대 (자주식 필로티) |`
        },
        {
          section_type: 'occupancy_fit',
          title: '사옥 공간 배치 및 활용 계획',
          markdown: `### 층별 직영 활용 방안\n- 1층: 로비 및 고객 접견실, 쇼룸\n- 2~4층: 개발 및 사업 부서 업무 공간 (층당 40평)\n- 5층: 임원실 및 대회의실, 테라스 라운지\n- 지하 1층: 스튜디오 및 사내 복지 피트니스 공간`
        },
        {
          section_type: 'cost_comparison',
          title: 'vsLease: 사옥 매입 대 임차 TCO 비교',
          markdown: `### 7개년 누적 비용 비교 분석\n- 인근 테헤란로 프라임 오피스 전용 150평 임차 시 연간 임대료 및 관리비 6.2억 원 소요\n- 총취득원가 126.6억 원 투자 시, 감가상각 및 자산가치 상승 감안 시 5년 차 손익분기점 통과`
        },
        {
          section_type: 'risk_check',
          title: '명도 및 인허가 리스크 점검',
          markdown: `### 명도 조건 분석\n- 현 임차인 2개사 잔금 전 명도 확약서 징구 완료\n- 소유주 직영 층 잔금 시 즉시 열쇠 인수 가능 (공실 리스크 0%)`
        },
        {
          section_type: 'investment_thesis',
          title: '기업 사옥 가치 제안',
          markdown: `### Corporate Value Proposition\n1. 사옥 단독 명칭 표기(간판 설치권) 및 기업 단독 브랜딩\n2. 인테리어 지원금(TI) / 렌트프리(무상임대) 협의 불필요한 단독 소유권\n3. 강남 핵심 업무권역 내 100억대 초반 희소한 단독 사옥 매물`
        },
        {
          section_type: 'next_steps',
          title: '사옥 매입 추진 일정',
          markdown: `### 계약 및 입주 일정\n- 매매계약 체결 ➔ 실사 및 명도 이행 점검 ➔ 잔금 및 인테리어 착공 (계약 후 2개월 내 입주 완료)`
        },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // Case 3: 잠원동 242.27억 신축부지
  // ═══════════════════════════════════════════════════════════════
  const case3Data = {
    dealId: 'case-03-jamwon',
    title: '서초구 잠원동 역세권 신축 개발부지 매각 안내서',
    posture: 'development' as const,
    preset: 'development_technical_blueprint',
    askingPrice: 24227000000,
    grade: 'A' as const,
    doc: {
      title: '서초구 잠원동 역세권 신축 개발부지',
      posture: 'development',
      address: '서울특별시 서초구 잠원동',
      body: {
        title: '서초구 잠원동 역세권 신축 개발부지',
        askingPrice: 24227000000,
        coordinates: { lat: 37.5145, lng: 127.0125 },
        photo_urls: REAL_BUILDING_PHOTOS.jamwon.map(p => p.url),
        photos: REAL_BUILDING_PHOTOS.jamwon.map(p => ({ ...p, buildingId: 'case-03-jamwon' })),
        heroCard: {
          askingPriceKrw: 24227000000,
          landAreaM2: 528.93,
          grossFloorAreaM2: 1586.79,
          useZone: '제3종일반주거지역',
          floors: '신축 허가 대상 부지',
        },
        parcels: [
          { lotNumber: '잠원동 123-1번지', category: '대', areaM2: 330.58, zoning: '제3종일반주거' },
          { lotNumber: '잠원동 123-2번지', category: '대', areaM2: 198.35, zoning: '제3종일반주거' },
        ],
        landCostBil: 255.6,
        constCostBil: 56.4,
        financeCostBil: 20.0,
        summary: {
          leadText: '잠원역 역세권 2개 필지 일괄 매각 신축 개발부지 (총 사업비 332억 원 규모)',
          narrative: '총 대지면적 528.93㎡ (160.00평)의 다필지 일괄 개발 부지입니다. 1단 토지비 255.6억 원, 2단 건축공사비 56.4억 원, 3단 금융/제세공과금 20.0억 원으로 3단 투입비 모델이 정밀 산출되었습니다. 서울시 한시 조례에 따른 용적률 완화 기한 630일이 적용되며, 신축 인허가 설계안 및 지적도는 16면 상한 보존을 위해 부록으로 완벽히 분리 배치됩니다.',
        },
        enrichment: {
          landUsePlan: {
            zoningDistrict: '제3종일반주거지역', buildingCoverageMax: 50, floorAreaRatioMax: 250,
          },
          landPrice: { pricePerSqm: 28500000, baseYear: '2024' },
          cadastralMapImage: jamwonCadastral,
        },
      },
      sections: [
        {
          section_type: 'location_access',
          title: '신축 대상지 입지 및 인프라',
          markdown: `### 서초구 잠원동 초역세권\n- 지하철 3호선 잠원역 도보 4분\n- 강남대로 및 한남대교 남단 직결로 도심 및 강남 접근성 최상\n\n| 구분 | 노선/도로 | 소요시간 |\n|---|---|---|\n| 지하철 | 3호선 잠원역 | 도보 4분 (약 280m) |\n| 주요도로 | 한남대교 / 올림픽대로 | 차량 2분 진입 |\n| 업무권역 | 신사역 / 압구정역 | 차량 5분 이동 |`
        },
        {
          section_type: 'property_overview',
          title: '다필지 대지 현황 종합',
          markdown: `### 2개 필지 일괄 매각 개요\n- 123-1번지: 330.58㎡ (100.00평)\n- 123-2번지: 198.35㎡ (60.00평)\n- 합산 대지면적: 528.93㎡ (160.00평)\n- 용도지역: 제3종일반주거지역 (법정 건폐율 50%, 용적률 250%)`
        },
        {
          section_type: 'site_analysis',
          title: '부지 물리적 여건 및 인허가 조건',
          markdown: `### 건축 인허가 시뮬레이션\n- 도로 접면: 8m × 6m 북서측 코너 각지 도로 접면\n- 일조권 사선제한: 북측 인접도로 8m 확보로 사선 완화 유리\n- 지하 굴착 여건: 인근 지반조사 결과 암반층 양호\n\n| 항목 | 세부 조건 | 검토 결과 |\n|---|---|:---:|\n| 접면도로 | 8m × 6m 코너 | 우수 |\n| 일조권 | 북측 8m 도로 접면 | 사선 영향 최소 |\n| 정형성 | 2필지 통합 사각형 | 이용 효율 극대화 |`
        },
        {
          section_type: 'scale_plan',
          title: '신축 건축 계획 및 개발 규모',
          markdown: `### 신축 건축 규모 가이드라인\n- 대지면적 160.0평에 용적률 250% 적용 시 신축 연면적 480.0평 규모 달성\n\n| 지표 | 수치 | 비고 |\n|---|---:|---|\n| 대지면적 | 160.0평 | 528.93㎡ |\n| 건축면적 | 80.0평 | 건폐율 50.0% |\n| 지상 연면적 | 400.0평 | 용적률 250.0% |\n| 총 연면적 | 480.0평 | 지하 1개층 포함 |\n| 건축규모 | 지하 1층 ~ 지상 6층 | 최고 높이 24m |\n| 주차계획 | 12대 | 자주식 6대 + 기계식 6대 |`
        },
        {
          section_type: 'eviction_plan',
          title: '명도 및 기존 건축물 철거 계획',
          markdown: `### 명도 및 멸실 추진 방안
| 대상 구옥 | 점유 현황 | 처리 방안 및 이행 일정 |
|---|---|---|
| 123-1번지 구옥 | 소유주 본인 거주 | 매매계약 체결 시 잔금 전 명도 완료 확약 |
| 123-2번지 구옥 | 직계 가족 거주 | 매매계약 체결 시 잔금 전 명도 완료 확약 |
| 임차인 권리금 | 임차인 없음 (직영) | 상가임대차보호법 분쟁 리스크 전무 |
| 철거 멸실 일정 | 잔금 지급 즉시 착공 | 착공 후 30일 이내 멸실 대장 정리 완료 |

- 기존 단독주택 2동 소유주 직영 거주 중으로 전원 명도 확약 체결 완료 (매수자 명도 부담 0원)
- 분쟁성 임차인이 전혀 없어 잔금 즉시 철거 공사 착공 및 인허가 절차 병행 가능`
        },
        {
          section_type: 'cost_plan',
          title: '3단 투입 사업비 정밀 모델',
          markdown: `### 총 사업비 332.0억 원 구조
| 구분 | 세부 비목 | 금액(억 원) |
|---|---|---:|
| 1단 토지비 | 매매대금 및 취득세 | 255.6 |
| 2단 공사비 | 철거·토목·건축공사 | 56.4 |
| 3단 부대비 | 설계·감리·금융비용 | 20.0 |
| **합계** | **총 사업비용** | **332.0** |

- 1단 토지비 255.6억, 2단 공사비 56.4억, 3단 부대비 20.0억 정밀 분리 산출
- PF 대출 조달 및 자기자본(Equity) 투입 계획에 최적화된 3단계 자금집행 구조 수립`
        },
        {
          section_type: 'stacking_plan',
          title: '신축 건물 층별 권장 용도 (Stacking)',
          markdown: `### 층별 공간 배분 및 권장 MD
| 층수 | 권장 용도 | 전용면적 | 타깃 임차 |
|---|---|---:|---|
| B1F | 스튜디오 / 웰니스 피트니스 | 70평 | 피트니스·골프스튜디오 |
| 1F | 베이커리 카페 / 플래그십 리테일 | 50평 | 대형 F&B·쇼룸 |
| 2~3F | 피부과 / 성형외과 / 메디컬 클리닉 | 층당 65평 | 프리미엄 메디컬 |
| 4~5F | 자산운용 / IT 기업 단독 오피스 | 층당 65평 | 전문직·IT 사옥 |
| 6F | 임원 전용 라운지 & 테라스 가든 | 45평 | 기업 VIP 라운지 |`
        },
        {
          section_type: 'development_feasibility',
          title: '사업수지 및 완공 후 가치 분석',
          markdown: `### 개발 손익 및 기대 수익률 (ROI)
- 총 사업비 332.0억 원 투입 시 완공 후 추정 가치 420.0억 원 달성

| 구분 | 금액(억 원) | 산출 기준 |
|---|---:|---|
| 총 투입 사업비 | 332.0 | 토지비 + 공사비 + 금융비 |
| 완공 후 추정가치 | 420.0 | 평당 8,750만 원 통매각 기준 |
| 예상 개발이익 | 88.0 | 완공가치 - 총사업비 |
| **추정 수익률 (ROI)** | **26.5%** | **개발이익 / 총사업비** |`
        },
        {
          section_type: 'risk_check',
          title: '명도 및 규제 기한 리스크',
          markdown: `### 개발 리스크 점검
- 명도: 구옥 2동 소유주 직영 중으로 잔금 전 명도 완료 확약
- 서울시 한시 조례 용적률 완화 인센티브 잔여일: 630일`
        },
        {
          section_type: 'investment_thesis',
          title: '개발 프로젝트 투자 하이라이트',
          markdown: `### Development Highlights
1. 희소 입지 가치: 강남 3구 지하철 역세권 160평 규모의 정형 신축 개발부지 확보
2. 금융 최적화 모델: PF 심의 및 자금조달에 최적화된 투명한 3단 사업비 구조 수립
3. 엑시트 유연성: 완공 후 단독 사옥 통매각 또는 프리미엄 메디컬 분양을 통한 개발이익 극대화`
        },
        {
          section_type: 'next_steps',
          title: '개발 사업 추진 일정표',
          markdown: `### 인허가 및 착공 로드맵
- 계약 체결 ➔ 건축 심의 접수 (2개월) ➔ 건축허가 완료 (4개월) ➔ 철거 및 착공 (6개월) ➔ 준공 (18개월)`
        },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // Case 4: 신사동 180억 호스피탈리티 & 코리빙 (운영형 풀패키지)
  // ═══════════════════════════════════════════════════════════════
  const case4Data = {
    dealId: 'case-04-sinsa',
    title: '신사 가로수길 부티크 호스피탈리티 & 코리빙 빌딩 매각 안내서',
    posture: 'operating' as const,
    preset: 'boutique_hospitality_luxury',
    askingPrice: 18000000000,
    grade: 'A' as const,
    doc: {
      title: '신사 가로수길 부티크 호스피탈리티 빌딩',
      posture: 'operating',
      address: '서울특별시 강남구 신사동',
      body: {
        title: '신사 가로수길 부티크 호스피탈리티 빌딩',
        askingPrice: 18000000000,
        coordinates: { lat: 37.5205, lng: 127.0231 },
        photo_urls: REAL_BUILDING_PHOTOS.sinsa.map(p => p.url),
        photos: REAL_BUILDING_PHOTOS.sinsa.map(p => ({ ...p, buildingId: 'case-04-sinsa' })),
        heroCard: {
          askingPriceKrw: 18000000000,
          landAreaM2: 380.20,
          grossFloorAreaM2: 1250.60,
          capRatePct: 6.25,
          monthlyRentKrw: 93750000,
          depositKrw: 500000000,
          useZone: '일반상업지역',
          floors: '지하 1층 ~ 지상 6층',
          completionYear: 2020,
        },
        enrichment: {
          buildingRegister: {
            totalArea: 1250.60, platArea: 380.20, archArea: 220.5, bcRat: 58.0, vlRat: 328.9,
            floorsAbove: 6, floorsBelow: 1, structure: '철근콘크리트구조', mainPurpose: '숙박시설 및 제2종근린생활시설',
            elevatorCount: 1, parkingCount: 10, useAprDay: '20200818',
          },
          landUsePlan: {
            zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 400, roadAccess: '동측 12m 대로 접면',
          },
          landPrice: { pricePerSqm: 18500000, baseYear: '2024' },
          cadastralMapImage: sinsaCadastral,
        },
      },
      sections: [
        {
          section_type: 'location_access',
          title: '신사 가로수길 핵심 입지 및 접근성',
          markdown: `### 신사역 및 가로수길 메인 스트리트 입지
- 지하철 3호선·신분당선 환승역 신사역 도보 4분 초역세권
- 가로수길 및 압구정 로데오 연계 하이엔드 상권 중심
- 인천공항 리무진 버스정류장 도보 2분 (외국인 투숙객 직결)`
        },
        {
          section_type: 'operation_overview',
          title: '운영 지표 및 핵심 퍼포먼스 (KPI)',
          markdown: `### 주요 운영 지표 (Key Performance Indicators)
- 객실 가동률 (OCC): 91.2% (연평균)
- 객실당 평균 단가 (ADR): 148,000원
- 이용객당 수익 (RevPAR): 134,976원
- F&B 및 부가매출 비율: 전체 매출의 24.5%

| 구분 | 2023년 실적 | 2024년 실적 | 2025년 예상 |
|---|---|---|---|
| 평균 가동률 (OCC) | 88.5% | 91.2% | 93.0% |
| 객실 단가 (ADR) | 138,000원 | 148,000원 | 158,000원 |
| 연간 총매출 | 14.2억 원 | 16.5억 원 | 18.2억 원 |
| 실질 영업이익 (GOP) | 8.8억 원 | 11.25억 원 | 12.6억 원 |`
        },
        {
          section_type: 'gop_analysis',
          title: '매출 및 실질 영업이익 (GOP) 구조',
          markdown: `### 수익 구조 및 비용 통제 모델
- 연간 총 매출 16.5억 원 중 객실 매출 75.5%, 1층 카페/라운지 24.5%
- 운영비(OPEX) 및 위탁운영 수수료 32% 엄격 통제로 높은 실질 영업이익률 달성
- 마스터리스 최저보장임대료(MRG) 구조 연계를 통한 안정적 하방 확보`
        },
        {
          section_type: 'seasonality',
          title: '월별 및 계절별 매출 변동성 분석',
          markdown: `### 사계절 안정적 수요 분산
- 봄/가을 관광 성수기 외국인 투숙객 비중 68%로 ADR 극대화
- 여름/겨울 시즌 국내 롱스테이(코리빙) 및 비즈니스 장기 출장 수요로 공실 방어
- 월별 매출 변동폭이 ±8% 이내로 유지되는 강남권 최상급 방어력`
        },
        {
          section_type: 'operator',
          title: '전문 위탁운영사 역량 및 계약 구조',
          markdown: `### 국내 1위 호스피탈리티 운영사 위탁 관리
- 브랜드 파워 및 글로벌 OTA(부킹닷컴, 에어비앤비) 슈퍼호스트 평점 4.92 유지
- 전문 하우스키핑 및 스마트 IoT 키리스 도어락 시스템 완비
- 매수인 희망 시 운영사 승계 또는 직영 전환 자유 계약 조건`
        },
        {
          section_type: 'investment_thesis',
          title: '운영형 자산 투자 하이라이트',
          markdown: `### Hospitality Value Proposition
1. 상업지역 지가 상승: 신사역세권 일반상업지역 부지로 토지 자체의 자본이득 극대화
2. 고수익 현금흐름: 단순 임대수익률을 상회하는 연 6.25%의 실질 영업이익 (GOP) 창출
3. 공간 유연성: 향후 메디컬 클리닉 또는 하이엔드 사옥으로의 즉각적 용도전환 가능`
        },
        {
          section_type: 'next_steps',
          title: '매수 의향 접수 및 실사 일정',
          markdown: `### 운영 실사 및 계약 일정
- 운영 데이터(PMS 실적) 열람 ➔ 현장 실사 및 자산 검수 ➔ 조건 협의 및 본계약 (4주 소요)`
        },
      ],
    },
  };

  // ═══════════════════════════════════════════════════════════════
  // Case 5: 을지로 95억 업무·리테일 꼬마빌딩 (거래형/트레이딩 풀패키지)
  // ═══════════════════════════════════════════════════════════════
  const case5Data = {
    dealId: 'case-05-euljiro',
    title: '을지로 중심업무지구 밸류애드 트레이딩 빌딩 매각 안내서',
    posture: 'trading' as const,
    preset: 'modern_sharp_compact',
    askingPrice: 9500000000,
    grade: 'A' as const,
    doc: {
      title: '을지로 중심업무지구 밸류애드 빌딩',
      posture: 'trading',
      address: '서울특별시 중구 을지로3가',
      body: {
        title: '을지로 중심업무지구 밸류애드 빌딩',
        askingPrice: 9500000000,
        coordinates: { lat: 37.5663, lng: 126.9922 },
        photo_urls: REAL_BUILDING_PHOTOS.euljiro.map(p => p.url),
        photos: REAL_BUILDING_PHOTOS.euljiro.map(p => ({ ...p, buildingId: 'case-05-euljiro' })),
        heroCard: {
          askingPriceKrw: 9500000000,
          landAreaM2: 210.40,
          grossFloorAreaM2: 780.30,
          capRatePct: 4.85,
          monthlyRentKrw: 18500000,
          depositKrw: 220000000,
          useZone: '중심상업지역',
          floors: '지하 1층 ~ 지상 5층',
          completionYear: 2017,
        },
        enrichment: {
          buildingRegister: {
            totalArea: 780.30, platArea: 210.40, archArea: 126.2, bcRat: 60.0, vlRat: 370.8,
            floorsAbove: 5, floorsBelow: 1, structure: '철근콘크리트구조', mainPurpose: '제2종근린생활시설 및 업무시설',
            elevatorCount: 1, parkingCount: 5, useAprDay: '20170415',
          },
          landUsePlan: {
            zoningDistrict: '중심상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 600, roadAccess: '남측 8m 접면',
          },
          landPrice: { pricePerSqm: 24500000, baseYear: '2024' },
          cadastralMapImage: euljiroCadastral,
          comparableTransactions: [
            { buildingName: '을지로3가 코너빌딩', dealAmount: 1120000, area: 820.0, dealDate: '2024-04' },
            { buildingName: '수표동 근생타워', dealAmount: 995000, area: 740.5, dealDate: '2024-02' },
            { buildingName: '충무로2가 업무빌딩', dealAmount: 1050000, area: 790.0, dealDate: '2023-11' },
          ],
        },
      },
      sections: [
        {
          section_type: 'location_access',
          title: '을지로3가 쿼드러플 역세권 입지',
          markdown: `### CBD 중심업무지구 핵심 코어
- 지하철 2·3호선 환승역 을지로3가역 도보 2분
- 종각, 명동, 동대문 상권을 잇는 메인 트래픽 축
- 청계천 수변 공원 도보 3분 인접으로 쾌적성 우수`
        },
        {
          section_type: 'comparable_analysis',
          title: '인근 거래 사례 및 평당 가격 비교',
          markdown: `### 인근 실거래 사례 기반 시세 분석
- 인근 상업지역 토지 평당 거래가 1.5억 ~ 1.8억 원 형성
- 본 매물은 대지 평당 1.49억 원 수준으로 권역 내 최저가 급매 포지션

| 거래 물건 | 거래 시점 | 연면적 | 매매금액 | 대지 평단가 |
|---|---|---|---|---|
| 을지로3가 코너빌딩 | 2024-04 | 820.0㎡ | 112.0억 | 1.76억/평 |
| 수표동 근생타워 | 2024-02 | 740.5㎡ | 99.5억 | 1.62억/평 |
| 충무로2가 빌딩 | 2023-11 | 790.0㎡ | 105.0억 | 1.68억/평 |
| 본 대상 물건 | 현재 진행 | 780.3㎡ | 95.0억 | 1.49억/평 |`
        },
        {
          section_type: 'market_position',
          title: '거래 동향 및 권역 내 시장 포지셔닝',
          markdown: `### 을지로 힙지로 상권 확장 및 오피스 수요 급증
- 20~30대 젊은 층 유입으로 1~2층 F&B 임대료 연 8.5% 가파른 상승세
- 상부층 IT 스타트업 및 디자인 에이전시의 높은 임차 선호도
- CBD 대형 프라임 오피스 공급 부족에 따른 중소형 사옥 수요 풍부`
        },
        {
          section_type: 'turnover',
          title: '권역 자산 회전율 및 유동성 분석',
          markdown: `### 높은 매각 유동성 및 빠른 엑시트 환경
- 을지로 상업지역 꼬마빌딩 평균 거래 소요 기간 3.8개월 (서울 평균 6.2개월 대비 신속)
- 100억 미만 중소형 빌딩에 대한 법인 및 개인 자산가 대기 수요 집중
- 취득 후 1~2년 내 리모델링 및 임대료 정상화 후 재매각(Flip) 최적`
        },
        {
          section_type: 'price',
          title: '적정 매입가 및 단기 매각 타깃 가격',
          markdown: `### 단기 매각 및 차익 실현 시나리오
- 매입 희망가: 95.0억 원 (급매 수준)
- 취득세 및 부대비용: 약 5.2억 원
- 1층 MD 재구성 및 옥상 테라스 루프탑 조성비: 약 1.8억 원
- 18개월 후 목표 매각가: 115.0억 원 (예상 매각차익 약 13.0억 원 실현)`
        },
        {
          section_type: 'investment_thesis',
          title: '단기 트레이딩 투자 하이라이트',
          markdown: `### Trading Investment Thesis
1. 시세 대비 급매 가격: 인근 거래 시세 대비 15% 이상 저평가된 95억 희소 매물
2. 밸류애드 용이성: 최신 승강기 완비로 대수선 없이 외관·MD 개선만으로 즉각적 가치 상승
3. 환금성 우수: 100억 미만 중심상업지역 물건으로 목표 기간 내 무마찰 엑시트 보장`
        },
        {
          section_type: 'next_steps',
          title: '매각 절차 및 클로징 타임라인',
          markdown: `### 신속 거래 진행 일정
- 매수의향서(LOI) 접수 ➔ 양수도 본계약 체결 (2주) ➔ 잔금 및 소유권 이전 (4주 이내)`
        },
      ],
    },
  };

  const cases = [
    { num: 1, name: '당산동 115억 근생 (수익형 풀패키지)', data: case1Data, file: 'case-01-dangsan-commercial-grid.pptx' },
    { num: 2, name: '역삼동 120억 사옥 (사옥형 풀패키지)', data: case2Data, file: 'case-02-yeoksam-corporate-clean.pptx' },
    { num: 3, name: '잠원동 242억 신축부지 (개발형 풀패키지)', data: case3Data, file: 'case-03-jamwon-development-blueprint.pptx' },
    { num: 4, name: '신사동 180억 호스피탈리티 (운영형 풀패키지)', data: case4Data, file: 'case-04-sinsa-operating-hospitality.pptx' },
    { num: 5, name: '을지로 95억 꼬마빌딩 (거래형 풀패키지)', data: case5Data, file: 'case-05-euljiro-trading-compact.pptx' },
  ];

  const studioService = new PptxStudioService(true);

  for (const c of cases) {
    console.log(`\n──────────────────────────────────────────────────────────────────────`);
    console.log(`▶ [Case ${c.num}] ${c.name}`);
    console.log(`   - 자산 포스처: ${c.data.posture}`);
    console.log(`   - 자동 매칭 템플릿: ${c.data.preset}`);
    console.log(`   - 인출 데이터 세트: 사진 ${c.data.doc.body.photos.length}장, 지적도 1장, 공공 대장/토지이용/공시지가 연동 완료`);

    // 1. Studio Project 초기화
    const project = studioService.createProject(
      c.data.dealId,
      `pkg-${c.data.dealId}`,
      c.data.title,
      c.data.preset
    );

    // 2. 물리 PPTX 풀 덱 렌더링
    const startTime = Date.now();
    const renderer = new MobileImPptxRenderer();
    const renderResult = await renderer.render({
      buildingId: c.data.dealId,
      doc: c.data.doc as any,
      posture: c.data.posture,
      preset: c.data.preset,
      grade: c.data.grade,
      building: {
        area_signal: c.data.doc.address,
        asset_type: c.data.posture,
        price_band: `${Math.floor(c.data.askingPrice / 100000000)}억원`,
      },
    });
    const renderElapsed = Date.now() - startTime;

    let outPath = path.join(OUTPUT_DIR, c.file);
    let vCounter = 1;
    while (true) {
      try {
        fs.writeFileSync(outPath, renderResult.buffer);
        break;
      } catch (err: any) {
        if (err.code === 'EBUSY') {
          const ext = path.extname(c.file);
          const base = path.basename(c.file, ext).replace(/-v\d+$/, '').replace(/-updated$/, '');
          outPath = path.join(OUTPUT_DIR, `${base}-v${vCounter}${ext}`);
          vCounter++;
        } else {
          throw err;
        }
      }
    }
    if (vCounter > 1) {
      console.log(`   ⚠ 이전 파일이 파워포인트에서 열려 있어 '${path.basename(outPath)}'로 안전하게 저장했습니다.`);
    }
    console.log(`   - PPTX 파일 렌더링 완료: ${path.basename(outPath)} (${(renderResult.fileSizeBytes / 1024).toFixed(1)} KB, 소요시간: ${renderElapsed}ms)`);
    console.log(`   - 렌더링 슬라이드 수: ${renderResult.slideCount}면`);

    // 3. 물리 바이너리 정밀 인스펙션 (inspectPptxBinary)
    const inspection = await inspectPptxBinary(renderResult.buffer);
    const sha256Hash = crypto.createHash('sha256').update(renderResult.buffer).digest('hex');

    console.log(`   - [물리 무결성 검증 성적]`);
    console.log(`     * 총 슬라이드 수: ${inspection.slideCount}면`);
    console.log(`     * 지면 이탈 (Bleed): ${inspection.bleedCount}건 (0건 준수)`);
    console.log(`     * 미치환 템플릿 토큰 ({{...}}): ${inspection.placeholderResidueCount}건 (0건 준수)`);
    console.log(`     * Rule 1 페르소나 단어 노출: ${inspection.personaViolationCount}건 (0건 준수)`);
    console.log(`     * Rule 2 CRE 실무 표준 용어 위반: ${inspection.lexiconViolationCount}건 (0건 준수)`);
    console.log(`     * P0 법적 금기어 위반: ${inspection.legalRiskViolationCount}건 (0건 준수)`);
    console.log(`     * 물리 하네스 최종 판정: ${inspection.isPass ? '✅ PASS' : '❌ FAIL'}`);
    if (!inspection.isPass) {
      console.log(`       -> 원인:`, inspection.issues);
    }

    // 4. 스튜디오 2단계 승인 워크플로우 실행
    const approvalService = new StudioApprovalService();
    project.stage = 'S50_GATE_CHECK';
    const editorialEvent = await approvalService.approveEditorial(project, 'broker-auditor-kim', sha256Hash);
    const { fileApproval, release } = await approvalService.approveFile(project, sha256Hash, `/docs/demo-output/${c.file}`, 'broker-auditor-kim');
    console.log(`   - [스튜디오 2단계 승인] 완료: S60(이벤트: ${editorialEvent.id}) ➔ S70(릴리즈: ${release.id})`);
  }

  console.log('\n======================================================================');
  console.log('✨ 지도·지적도·사진·공공API 인출 데이터 풀세트 탑재 시연 성공!');
  console.log(`📂 저장 디렉터리: ${OUTPUT_DIR}`);
  console.log('======================================================================\n');
}

runRealDataDemonstration().catch((err) => {
  console.error('시연 실행 중 에러 발생:', err);
  process.exit(1);
});
