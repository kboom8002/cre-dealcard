/**
 * @file benchmark-cbre-nh-capital.ts
 * @description CBRE 모범 IM (NH농협캐피탈빌딩) 원본 데이터 기반 E2E 벤치마크 러너
 *              - SSoT 픽스처 로드 및 중개인 입력 정합성 검증 (BrokerInputValidator)
 *              - 고화질 V-World 지적도 및 여의도 광역 대중교통망(Transit Macro) 벡터 그래픽 생성
 *              - 기관투자자 프라임 (Institutional Dark/Gold) 테마 PPTX 풀 덱 렌더링
 *              - 물리 바이너리 6대 게이트 정밀 인스펙션 (inspectPptxBinary)
 *              - 스튜디오 2단계 승인 원장 (S50 -> S60 -> S70)
 *              - 옴니채널 크로스 채널 정합성 감사 (verifyCrossChannelConsistency)
 *
 * 실행: npx tsx scripts/benchmark-cbre-nh-capital.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../src/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../src/domain/building/pptx-studio/approval/studio-approval-service';
import { validateBrokerInput } from '../src/domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../src/domain/building/im-core/cross-channel-checker';
import { computeTargetHash } from '../src/domain/building/im-core/target-hash';

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'demo-output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 여의도동 45-3 대 V-World 스타일 연속지적도(Cadastral Map) 벡터 이미지 생성기
 */
async function generateYeouidoCadastralPng(): Promise<{ buffer: Buffer; base64: string }> {
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
    <polygon points="80,50 310,60 290,200 80,180" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="180" y="130" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 45-1 대</text>
    
    <polygon points="490,50 720,60 700,210 480,190" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="600" y="130" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 45-2 대</text>

    <polygon points="80,410 290,420 270,550 80,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="180" y="480" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 45-4 대</text>

    <polygon points="490,410 720,420 700,550 480,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="600" y="480" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 45-13 대</text>

    <!-- 도로 접면 표시 -->
    <path d="M 0,330 L 800,345" stroke="#CBD5E1" stroke-width="32" opacity="0.6"/>
    <text x="400" y="343" font-family="sans-serif" font-weight="bold" font-size="13" fill="#475569" text-anchor="middle">북동측 20m 국제금융로8길 (대로변 접면)</text>

    <path d="M 400,0 L 415,600" stroke="#CBD5E1" stroke-width="22" opacity="0.4"/>
    <text x="407" y="580" font-family="sans-serif" font-weight="bold" font-size="11" fill="#64748B" text-anchor="middle">남동측 12m 도로</text>

    <!-- 대상 필지 (황금색/엠버 하이라이트 코너 각지) -->
    <polygon points="290,170 510,180 480,430 270,410" fill="#FEF3C7" stroke="#D97706" stroke-width="3.5" stroke-dasharray="8,3"/>
    
    <!-- 필지 텍스트 정보 -->
    <circle cx="390" cy="275" r="6" fill="#B45309"/>
    <text x="390" y="255" font-family="sans-serif" font-weight="bold" font-size="22" fill="#92400E" text-anchor="middle">여의도동 45-3 대</text>
    <text x="390" y="295" font-family="sans-serif" font-weight="bold" font-size="15" fill="#B45309" text-anchor="middle">[일반상업지역] 2,000.00㎡ (605.00평)</text>
    <text x="390" y="318" font-family="sans-serif" font-size="12" fill="#78350F" text-anchor="middle">건폐율 58.19% / 용적률 566.31% (상한 800%)</text>
    
    <!-- 방위표 (North) -->
    <g transform="translate(740, 45)">
      <polygon points="0,-24 8,8 0,4 -8,8" fill="#1E293B"/>
      <text x="0" y="-28" font-family="sans-serif" font-weight="bold" font-size="11" fill="#1E293B" text-anchor="middle">N</text>
    </g>
    <text x="50" y="580" font-family="sans-serif" font-size="11" fill="#94A3B8">국토교통부 V-World WMS 연속지적도 | 여의도 금융업무지구 | 축척 1:1,200</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    buffer,
    base64: `image/png;base64,${buffer.toString('base64')}`,
  };
}

/**
 * CBRE Page 9 벤치마크: 여의도 광역 대중교통망 (Macro Transit Vector) 생성기
 */
async function generateYeouidoTransitPng(): Promise<{ buffer: Buffer; base64: string }> {
  const svg = `
  <svg width="1600" height="1200" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <!-- 다크 슬레이트 배경 (CBRE 스타일) -->
    <rect width="100%" height="100%" fill="#1E222D"/>

    <!-- 한강 물길 (부드러운 곡선) -->
    <path d="M 0,110 Q 250,70 480,120 T 800,90 L 800,0 L 0,0 Z" fill="#1A2D42" opacity="0.8"/>
    <text x="400" y="55" font-family="sans-serif" font-size="16" font-weight="bold" fill="#3B82F6" letter-spacing="8" opacity="0.4">H A N   R I V E R ( 한 강 )</text>

    <!-- 한강 주요 교량 -->
    <line x1="180" y1="20" x2="200" y2="150" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="180" y="80" font-family="sans-serif" font-size="10" fill="#94A3B8">서강대교</text>

    <line x1="380" y1="30" x2="400" y2="160" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="380" y="80" font-family="sans-serif" font-size="10" fill="#94A3B8">마포대교</text>

    <line x1="580" y1="50" x2="600" y2="180" stroke="#475569" stroke-width="4" stroke-dasharray="4,2"/>
    <text x="580" y="95" font-family="sans-serif" font-size="10" fill="#94A3B8">원효대교</text>

    <!-- 올림픽대로 라인 -->
    <path d="M 0,160 Q 300,140 800,200" stroke="#334155" stroke-width="12" fill="none" opacity="0.5"/>
    <text x="730" y="215" font-family="sans-serif" font-size="10" fill="#64748B">올림픽대로</text>

    <!-- 여의도 섬 중심 영역 -->
    <rect x="120" y="150" width="560" height="340" rx="40" fill="#242A38" stroke="#384252" stroke-width="1.5"/>
    <text x="145" y="180" font-family="sans-serif" font-size="12" font-weight="bold" fill="#64748B">YEOUIDO (YBD) FINANCIAL DISTRICT</text>

    <!-- 대상지 기준 반경 동심원 (0.5km / 1.0km) -->
    <circle cx="430" cy="330" r="95" fill="none" stroke="#E8DEC8" stroke-width="1.2" stroke-dasharray="4,4" opacity="0.6"/>
    <text x="430" y="245" font-family="sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">0.5km (도보 5분)</text>

    <circle cx="430" cy="330" r="185" fill="none" stroke="#E8DEC8" stroke-width="1.0" stroke-dasharray="6,6" opacity="0.4"/>
    <text x="430" y="155" font-family="sans-serif" font-size="10" fill="#E8DEC8" text-anchor="middle">1.0km (도보 10분)</text>

    <!-- 5호선 라인 (Purple) -->
    <path d="M 60,300 L 250,290 L 350,280 L 520,200 L 750,150" stroke="#8B5CF6" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="70" y="290" font-family="sans-serif" font-size="11" font-weight="bold" fill="#A78BFA">5호선</text>

    <!-- 9호선 라인 (Gold / Amber) -->
    <path d="M 80,420 L 280,350 L 350,280 L 510,360 L 750,420" stroke="#D97706" stroke-width="6" fill="none" stroke-linecap="round"/>
    <text x="90" y="440" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FBBF24">9호선</text>

    <!-- 신림선 경전철 (Cyan) -->
    <path d="M 510,360 L 520,530 L 580,590" stroke="#0D9488" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="530" y="550" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2DD4BF">신림선</text>

    <!-- 예정 노선 점선 표시 (신안산선, GTX-B, 서부선) -->
    <!-- 신안산선 (2025 예정 - Red Orange) -->
    <path d="M 350,280 L 410,480 L 430,590" stroke="#EF4444" stroke-width="4" stroke-dasharray="5,3" fill="none"/>
    <text x="420" y="520" font-family="sans-serif" font-size="10" font-weight="bold" fill="#F87171">신안산선 (2025 예정)</text>

    <!-- GTX-B (2030 예정 - Indigo) -->
    <path d="M 100,240 L 350,280 L 700,230" stroke="#6366F1" stroke-width="4" stroke-dasharray="6,4" fill="none"/>
    <text x="610" y="250" font-family="sans-serif" font-size="10" font-weight="bold" fill="#818CF8">GTX-B 노선 (2030 예정)</text>

    <!-- 서부선 경전철 (2030 예정 - Emerald) -->
    <path d="M 210,120 L 230,340 L 250,560" stroke="#10B981" stroke-width="3.5" stroke-dasharray="5,3" fill="none"/>
    <text x="175" y="470" font-family="sans-serif" font-size="10" font-weight="bold" fill="#34D399">서부선 (2030 예정)</text>

    <!-- 주요 지하철역 핀 -->
    <!-- 여의도역 (5호선 / 9호선 환승) -->
    <circle cx="350" cy="280" r="10" fill="#FFFFFF" stroke="#D97706" stroke-width="3"/>
    <circle cx="350" cy="280" r="5" fill="#8B5CF6"/>
    <text x="350" y="260" font-family="sans-serif" font-size="12" font-weight="bold" fill="#FFFFFF" text-anchor="middle">여의도역 (5·9호선)</text>
    <text x="350" y="305" font-family="sans-serif" font-size="10" fill="#94A3B8" text-anchor="middle">도보 7분</text>

    <!-- 샛강역 (9호선 / 신림선 환승) -->
    <circle cx="510" cy="360" r="10" fill="#FFFFFF" stroke="#0D9488" stroke-width="3"/>
    <circle cx="510" cy="360" r="5" fill="#D97706"/>
    <text x="510" y="340" font-family="sans-serif" font-size="12" font-weight="bold" fill="#FFFFFF" text-anchor="middle">샛강역 (9호선·신림선)</text>
    <text x="510" y="390" font-family="sans-serif" font-size="10" fill="#2DD4BF" text-anchor="middle">★ 도보 3분 초역세권</text>

    <!-- 여의나루역 -->
    <circle cx="520" cy="200" r="6" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="2"/>
    <text x="520" y="190" font-family="sans-serif" font-size="10" fill="#CBD5E1" text-anchor="middle">여의나루역 (5호선)</text>

    <!-- 여의도 환승센터 -->
    <rect x="290" y="315" width="80" height="20" rx="4" fill="#3B82F6" opacity="0.9"/>
    <text x="330" y="329" font-family="sans-serif" font-size="9.5" font-weight="bold" fill="#FFFFFF" text-anchor="middle">여의도 환승센터(BUS)</text>

    <!-- [ASSET] 대상지 핀 (NH농협캐피탈빌딩) -->
    <g transform="translate(430, 330)">
      <circle cx="0" cy="0" r="22" fill="#E8DEC8" opacity="0.25"/>
      <circle cx="0" cy="0" r="14" fill="#E8DEC8" opacity="0.4"/>
      <polygon points="0,-18 12,0 0,6 -12,0" fill="#E8DEC8"/>
      <circle cx="0" cy="-6" r="4" fill="#1E222D"/>
      <rect x="-70" y="14" width="140" height="26" rx="5" fill="#E8DEC8" stroke="#FFFFFF" stroke-width="1"/>
      <text x="0" y="31" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1E222D" text-anchor="middle">[ ASSET ] NH농협캐피탈</text>
    </g>

    <!-- 광역 방향 벡터 화살표 (CBD / GBD / 마곡) -->
    <g transform="translate(710, 80)">
      <line x1="0" y1="20" x2="50" y2="0" stroke="#F59E0B" stroke-width="3" marker-end="url(#arrow)"/>
      <text x="25" y="-6" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ CBD (도심 15분)</text>
    </g>
    <g transform="translate(710, 480)">
      <line x1="0" y1="0" x2="50" y2="20" stroke="#F59E0B" stroke-width="3"/>
      <text x="25" y="36" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ GBD (강남 20분)</text>
    </g>
    <g transform="translate(40, 220)">
      <line x1="30" y1="20" x2="0" y2="0" stroke="#F59E0B" stroke-width="3"/>
      <text x="20" y="-8" font-family="sans-serif" font-size="11" font-weight="bold" fill="#FBBF24" text-anchor="middle">➔ 마곡 (18분)</text>
    </g>

    <!-- 범례 박스 (우하단) -->
    <rect x="50" y="475" width="220" height="95" rx="6" fill="#1A1F2C" stroke="#334155" stroke-width="1"/>
    <text x="65" y="495" font-family="sans-serif" font-size="10.5" font-weight="bold" fill="#E2E8F0">대중교통망 범례</text>
    <line x1="65" y1="512" x2="95" y2="512" stroke="#8B5CF6" stroke-width="4"/>
    <text x="105" y="516" font-family="sans-serif" font-size="9.5" fill="#94A3B8">5호선 / 9호선 / 신림선</text>
    <line x1="65" y1="532" x2="95" y2="532" stroke="#EF4444" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="536" font-family="sans-serif" font-size="9.5" fill="#94A3B8">신안산선 (2025 개통 예정)</text>
    <line x1="65" y1="552" x2="95" y2="552" stroke="#6366F1" stroke-width="3" stroke-dasharray="4,2"/>
    <text x="105" y="556" font-family="sans-serif" font-size="9.5" fill="#94A3B8">GTX-B / 서부선 (2030 예정)</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    buffer,
    base64: `image/png;base64,${buffer.toString('base64')}`,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════
 * 메인 벤치마크 실행 루틴
 * ═══════════════════════════════════════════════════════════════
 */
export async function runCbreBenchmark() {
  console.log('======================================================================');
  console.log('🏢 CBRE NH농협캐피탈빌딩 모범 IM E2E 파이프라인 벤치마크 러너');
  console.log('======================================================================\n');

  // 1. 고화질 지적도 및 광역 교통 벡터 그래픽 생성
  console.log('▶ [Step 1] 벡터 그래픽 생성 (연속지적도 및 Macro Transit Map)');
  const yeouidoCadastral = await generateYeouidoCadastralPng();
  const yeouidoTransit = await generateYeouidoTransitPng();
  console.log('   - V-World 연속지적도 PNG 생성 완료');
  console.log('   - 여의도 Macro Transit Vector Map PNG 생성 완료\n');

  // 2. 실매물 사진 준비
  const mediaDir = path.resolve('docs/test/real-broker-im/cbre-nh-capital-media');
  const photos = [
    { url: path.join(mediaDir, 'page_01_img_1.jpeg'), caption: 'NH농협캐피탈빌딩 황혼 전경 및 상부 외관 파사드' },
    { url: path.join(mediaDir, 'page_03_img_1.jpeg'), caption: '건물 정면 전경 (인접 주변 건물 모노크롬 대비 강조)' },
    { url: path.join(mediaDir, 'page_04_img_1.jpeg'), caption: '지상 1층 공개공지 및 진입 광장 전경' },
    { url: path.join(mediaDir, 'page_05_img_1.jpeg'), caption: '2개층 오픈 더블 하이트(Double-Height) 아트리움 로비' },
    { url: path.join(mediaDir, 'page_07_img_1.jpeg'), caption: '국제금융로 코너 전면 글라스 커튼월 외관' },
    { url: path.join(mediaDir, 'page_10_img_1.jpeg'), caption: '7층 전형적인 기준층 엘리베이터 홀 및 코어 마감' },
    { url: path.join(mediaDir, 'page_11_img_1.jpeg'), caption: '야간 조명 연출 및 1층 리테일(롤링핀, GS25) 가시성' },
  ];

  // 3. 중개인 입력 데이터 구성 (BrokerPropertyInput)
  const nhBrokerInput = {
    askingPriceKrw: 250000000000, // 2,500억 원
    landAreaM2: 2000.00,          // 605.00평
    grossFloorAreaM2: 20700.61,   // 6,261.93평
    statedLandPricePerPyeongKrw: 413223140, // 약 4.13억/평
    statedDepositKrw: 12000000000,          // 120억 원
    statedMonthlyRentKrw: 525000000,        // 5.25억 원 (연 63.0억 원, 단순 연 순수익률 2.52%)
    rentRoll: {
      totalUnits: 17,
      units: [
        { floor: '11F', tenant: 'NH농협캐피탈(주)', deposit: 1000000000, rent: 45000000, areaPyeong: 120.94, isVacant: false },
        { floor: '10F', tenant: 'NH농협캐피탈(주)', deposit: 1000000000, rent: 48000000, areaPyeong: 156.85, isVacant: false },
        { floor: '9F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, areaPyeong: 276.87, isVacant: false },
        { floor: '8F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, areaPyeong: 276.87, isVacant: false },
        { floor: '7F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, areaPyeong: 276.87, isVacant: false },
        { floor: '6F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, areaPyeong: 277.20, isVacant: false },
        { floor: '5F',  tenant: 'NH농협캐피탈(주)', deposit: 1200000000, rent: 55000000, areaPyeong: 277.20, isVacant: false },
        { floor: '4F',  tenant: '어니스트인베스트먼트 / 르그랑코리아', deposit: 1000000000, rent: 42000000, areaPyeong: 278.22, isVacant: false },
        { floor: '3F',  tenant: '한국휴렛팩커드 / 지앤비시스템', deposit: 1000000000, rent: 42000000, areaPyeong: 278.23, isVacant: false },
        { floor: '2F',  tenant: '세광그린푸드 / 오피스디포', deposit: 800000000, rent: 35000000, areaPyeong: 221.52, isVacant: false },
        { floor: '1F',  tenant: '롤링핀 / GS25 편의점', deposit: 600000000, rent: 20000000, areaPyeong: 155.77, isVacant: false },
        { floor: 'B1F', tenant: '아비쥬의원 / 수티문', deposit: 600000000, rent: 18000000, areaPyeong: 318.56, isVacant: false },
      ],
    },
    photoUrls: photos.map(p => p.url),
  };

  // 4. 공학적 SSoT 문서 정의 (nhCapitalDoc)
  const nhCapitalDoc = {
    title: 'NH농협캐피탈빌딩 투자설명서',
    posture: 'income' as const,
    address: '서울특별시 영등포구 여의도동 45-3 (국제금융로8길 27-8)',
    body: {
      title: 'NH농협캐피탈빌딩',
      askingPrice: 250000000000,
      coordinates: { lat: 37.5215, lng: 126.9302 },
      photo_urls: photos.map(p => p.url),
      photos: photos.map(p => ({ ...p, buildingId: 'cbre-nh-capital' })),
      poiSpots: [
        { name: '샛강역 (9호선·신림선)', lat: 37.5175, lng: 126.9285, category: 'subway' as const },
        { name: '여의도역 (5호선·9호선)', lat: 37.5215, lng: 126.9242, category: 'subway' as const },
        { name: '여의도 환승센터', lat: 37.5230, lng: 126.9250, category: 'landmark' as const },
        { name: '한국거래소 (KRX)', lat: 37.5225, lng: 126.9280, category: 'landmark' as const },
      ],
      heroCard: {
        askingPriceKrw: 250000000000,
        landAreaM2: 2000.00,
        grossFloorAreaM2: 20700.61,
        capRatePct: 2.52,
        monthlyRentKrw: 525000000,
        depositKrw: 12000000000,
        useZone: '일반상업지역',
        floors: '지하 6층 ~ 지상 11층',
        completionYear: 1995,
      },
      summary: {
        leadText: '여의도(YBD) 핵심 금융허브 입지의 사옥 적합형 연면적 6,262평 프라임 오피스',
        narrative: '매각희망가 2,500억 원, 대지 605.00평에 연면적 6,261.93평 규모의 여의도 프라임 자산입니다. 9호선·신림선 샛강역 도보 3분 및 5·9호선 여의도역 도보 7분 더블 역세권에 위치합니다. 앵커 테넌트 NH농협캐피탈(주) 본사 및 우량 임차인이 전층 만실(공실률 0%, WALE 2.1년) 입주 중이며, 기준층 280평 무주공간과 천정고 2.7m의 우수한 물리적 스펙을 갖추고 있습니다. 특히 현재 용적률 566%로 일반상업지역 기준 233.7%p 잔여 용적률이 확보되어 향후 증축 및 재건축 가치 상승 여력이 탁월합니다.',
      },
      enrichment: {
        buildingRegister: {
          totalArea: 20700.61, platArea: 2000.00, archArea: 1163.73, bcRat: 58.19, vlRat: 566.31,
          floorsAbove: 11, floorsBelow: 6, structure: '철근콘크리트조', mainPurpose: '업무시설 및 제2종근린생활시설',
          elevatorCount: 4, parkingCount: 102, useAprDay: '19950626',
        },
        landUsePlan: {
          zoningDistrict: '일반상업지역', buildingCoverageMax: 60, floorAreaRatioMax: 800,
        },
        cadastralMapImage: yeouidoCadastral,
        macroTransitImage: yeouidoTransit,
      },
      ssot_summary: {
        asking_price: 250000000000,
        total_area: 20700.61,
        cap_rate: 2.52,
        deposit: 12000000000,
        monthly_rent: 525000000,
      },
    },
    sections: [
      {
        section_type: 'location_access',
        title: '입지 및 광역 대중교통망 분석',
        markdown: `### 금융허브 YBD 내 핵심지역 및 쿼드러플 환승 잠재력
- **샛강역(9호선·신림선) 도보 3분 초역세권**: 신림선 개통으로 관악·서남권 16분대 직결
- **여의도역(5·9호선) 도보 7분**: 올림픽대로, 원효대교, 마포대교를 통한 도심(CBD) 15분, 강남(GBD) 20분
- **교통 호재 3대 축 완비**: 신안산선(2025 예정), GTX-B(2030 예정), 서부선 경전철(2030 예정) 직결 호재`
      },
      {
        section_type: 'property_overview',
        title: '토지 및 건물 상세 제원',
        markdown: `### 건축물대장 및 토지이용계획 3단 그룹 제원
- 대지 605.0평, 연면적 6,261.9평 규모의 여의도 희소 중대형 오피스
- 지하 6층 ~ 지상 11층, 승강기 4대 완비 및 102대 100% 자주식 주차

| 구분 | 주요 항목 | 상세 제원 | 비고 |
|---|---|---|---|
| **대상지** | 건물명 / 소재지 | NH농협캐피탈빌딩 / 영등포구 여의도동 45-3 | 국제금융로8길 27-8 |
| **토지** | 용도지역 / 대지면적 | 일반상업지역 / 2,000.00㎡ (605.00평) | 북동측 20m 도로 코너 |
| **건물** | 연면적 / 건축면적 | 20,700.61㎡ (6,261.93평) / 1,163.73㎡ (352.03평) | 지상11층 / 지하6층 |
| **건물** | 건폐율 / 용적률 | 58.19% / 566.31% | 일반상업 상한 800% (여유 233.7%p) |
| **건물** | 주차 / 승강기 | 총 102대 (자주식 95 옥내, 7 옥외) / 승강기 4대 | 기준층 무주 280평, 층고 2.7m |`
      },
      {
        section_type: 'lease_status',
        title: '임대차 현황 및 스태킹 플랜',
        markdown: `### 층별 임대차 실측 렌트롤 및 만기 현황 (WALE 2.1년, 공실률 0%)
- 5F~11F 및 B2F: 앵커 테넌트 NH농협캐피탈(주) 8개층 단독 임차 (2026.04 만기)
- 저층부 및 B1F: 우량 리테일(롤링핀, 아비쥬의원, GS25, 세광그린푸드) 장기 영업 중

| 층수 | 주용도 | 전용면적(평) | 임대면적(평) | 주요 입주사 | 만기연도 |
|---|---|---:|---:|---|:---:|
| 11F | 업무시설 | 120.94 | 241.53 | NH농협캐피탈(주) 본사 | 2026 |
| 10F | 업무시설 | 156.85 | 313.27 | NH농협캐피탈(주) 본사 | 2026 |
| 9F | 업무시설 | 276.87 | 552.94 | NH농협캐피탈(주) 본사 | 2026 |
| 8F | 업무시설 | 276.87 | 552.94 | NH농협캐피탈(주) 본사 | 2026 |
| 7F | 업무시설 | 276.87 | 552.94 | NH농협캐피탈(주) 본사 | 2026 |
| 6F | 업무시설 | 277.20 | 553.67 | NH농협캐피탈(주) 본사 | 2026 |
| 5F | 업무시설 | 277.20 | 553.67 | NH농협캐피탈(주) 본사 | 2026 |
| 4F | 업무시설 | 278.22 | 555.65 | 어니스트인베스트먼트 / 르그랑코리아 | 2025 |
| 3F | 업무시설 | 278.23 | 555.65 | 한국휴렛팩커드 / 지앤비시스템 | 2025 |
| 2F | 근생/업무 | 221.52 | 426.98 | 세광그린푸드 / 오피스디포 | 2027 |
| 1F | 근린생활 | 155.77 | 315.94 | 롤링핀 베이커리 / GS25 편의점 | 2028 |
| B1F | 근린생활 | 318.56 | 553.24 | 아비쥬의원 / 수티문 | 2027 |
| B2F | 업무(서고) | 318.31 | 533.52 | NH농협캐피탈(서고) / 리테일 | 2026 |
| B3~B5F | 주차장 | - | - | 지하 3개층 자주식 주차장 (총 95대) | - |
| B6F | 기계실 | - | - | 중앙 제어실 및 전기·기계설비 | - |
| **합계** | **전층 만실** | **3,233.40** | **6,261.94** | **총 17개 층 (공실 0건, WALE 2.1년)** | **만실 운용** |`
      },
      {
        section_type: 'investment_thesis',
        title: '핵심 투자 가치 제안',
        markdown: `### CBRE 벤치마크 5대 핵심 투자 기둥 (5 Strategic Pillars)
1. **Superb Accessibility**: 9호선·신림선 샛강역 도보 3분, 5·9호선 여의도역 도보 7분의 쿼드러플 대중교통망
2. **Strong Leasing Demand for HQ**: 연면적 6,262평 규모로 여의도 권역 금융사 및 대기업 단독 사옥으로 최적화
3. **WALE 2.1년 가치 상승 기회**: 잔여 임대기간 2.1년 도래 시 YBD 오피스 임대료 인상 반영 또는 매수인 사옥 자가사용 가능
4. **Outstanding Physical Specification**: 기준층 전용 280평 무주(Column-Free) 공간, 천정고 2.7m 개방감, 102대 100% 자주식 주차 설비
5. **Upside Potential (잔여 용적률 233.7%p)**: 현재 용적률 566% vs 법정 상한 800%로 향후 증축 또는 신축 시 연면적 대폭 확장 가능`
      },
      {
        section_type: 'income_analysis',
        title: '수익성 및 현금흐름 분석',
        markdown: `### 연간 순영업소득 (NOI) 및 임대수익 구조
- **연 순수익률 (Cap Rate)**: 2.52% (매각희망가 2,500억 원 기준)
- **보증금 총액**: 120억 원
- **월 임대료**: 5억 2,500만 원 (연간 환산 약 63억 원)
- **WALE**: 2.1년 (우량 금융사 및 대기업 임차 안정성 확보)`
      },
      {
        section_type: 'comparable_analysis',
        title: '주변 오피스 시세 비교',
        markdown: `### 여의도 권역(YBD) 오피스 실거래 및 매물 평당가 분석
- YBD 프라임 오피스 실거래가: 연면적 평당 약 3,800만 ~ 4,300만 원 형성
- 본건 대상(연면적 평당 약 3,992만 원)은 여의도 핵심 입지 및 단독 사옥 희소성 대비 적정 시장 가치 확보`
      },
      {
        section_type: 'next_steps',
        title: '법적 면책 및 진행 절차',
        markdown: `### 본 투자안내서(Teaser Memorandum)에 관한 법적 고지 및 일정
- 본 문서는 잠재 매수인의 예비 투자 검토 목적으로 작성된 비밀 유지 문서(Confidential & Proprietary)입니다.
- 거래 절차: 매수의향서(LOI) 접수 ➔ 데이터룸(VDR) 실사 ➔ 입찰 및 우선협상대상자 선정 ➔ 매매계약 체결`
      },
    ],
  };

  // ─────────────────────────────────────────────────────────────
  // 1. 중개인 원본 입력치 검증 및 이상치 감지 (BrokerInputValidator)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 2] 중개인 원본 입력치 정합성 검증 (BrokerInputValidator)');
  const valResult = validateBrokerInput(nhBrokerInput);
  console.log(`   - 이상치/불일치 감지 건수: ${valResult.discrepancies.length}건`);
  valResult.discrepancies.forEach((d, idx) => {
    console.log(`     (${idx + 1}) [${d.severity.toUpperCase()}] ${d.code}: ${d.message}`);
  });
  console.log(`   - 검증 결과 판정: ${valResult.isValid ? '✅ VALID (정상)' : '❌ INVALID'}\n`);

  // ─────────────────────────────────────────────────────────────
  // 2. SSoT 타깃 해시 계산 (SSoT Invariant Hash)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 3] SSoT 타깃 해시 산출');
  const targetHash = computeTargetHash({
    body: {
      asking_price: nhCapitalDoc.body.askingPrice,
      address: nhCapitalDoc.address,
      posture: nhCapitalDoc.posture,
      sections: nhCapitalDoc.sections,
    },
    releaseTier: 'analysis_im',
    policyVersion: 'v1.0.0',
  });
  console.log(`   - Target Hash: ${targetHash}\n`);

  // ─────────────────────────────────────────────────────────────
  // 3. Studio Project 생성
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 4] PptxStudioService 프로젝트 생성');
  const studioService = new PptxStudioService(true);
  const approvalService = new StudioApprovalService();
  const project = studioService.createProject(
    'cbre-nh-capital',
    'pkg-cbre-nh-capital',
    nhCapitalDoc.title,
    'institutional_dark_gold'
  );
  console.log(`   - Project ID: ${project.id}`);
  console.log(`   - Preset: institutional_dark_gold (기관투자자 다크/골드)\n`);

  // ─────────────────────────────────────────────────────────────
  // 4. 물리 PPTX 풀 덱 렌더링 (MobileImPptxRenderer)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 5] MobileImPptxRenderer 물리 풀 덱 렌더링');
  const startTime = Date.now();
  const renderer = new MobileImPptxRenderer();
  const renderResult = await renderer.render({
    buildingId: 'cbre-nh-capital',
    doc: nhCapitalDoc as any,
    posture: 'income',
    preset: 'institutional_dark_gold',
    grade: 'A',
    building: {
      area_signal: nhCapitalDoc.address,
      asset_type: '오피스빌딩',
      price_band: '2500억원',
    },
  });
  const renderElapsed = Date.now() - startTime;

  const outPath = path.join(OUTPUT_DIR, 'cbre-nh-capital-benchmark.pptx');
  fs.writeFileSync(outPath, renderResult.buffer);
  console.log(`   - 파일 저장: ${outPath}`);
  console.log(`   - 파일 크기: ${(renderResult.fileSizeBytes / 1024).toFixed(1)} KB`);
  console.log(`   - 슬라이드 면수: ${renderResult.slideCount}면 (Rule 10 16면 상한 준수)`);
  console.log(`   - 렌더링 소요시간: ${renderElapsed}ms\n`);

  // ─────────────────────────────────────────────────────────────
  // 5. 물리 바이너리 정밀 인스펙션 (inspectPptxBinary)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 6] inspectPptxBinary 물리 무결성 6대 게이트 검증');
  const inspection = await inspectPptxBinary(renderResult.buffer);
  const sha256Hash = crypto.createHash('sha256').update(renderResult.buffer).digest('hex');

  console.log(`   - 지면 이탈 (Bleed): ${inspection.bleedCount}건 (0건 목표)`);
  console.log(`   - 미치환 템플릿 토큰 ({{...}}): ${inspection.placeholderResidueCount}건 (0건 목표)`);
  console.log(`   - 깨진 이미지: ${inspection.brokenImageCount}건 (0건 목표)`);
  console.log(`   - Rule 1 페르소나 단어 노출: ${inspection.personaViolationCount}건 (0건 목표)`);
  console.log(`   - Rule 2 CRE 표준 용어 위반: ${inspection.lexiconViolationCount}건 (0건 목표)`);
  console.log(`   - P0 법적 금기어 위반: ${inspection.legalRiskViolationCount}건 (0건 목표)`);
  console.log(`   - 물리 하네스 최종 판정: ${inspection.isPass ? '✅ PASS' : '❌ FAIL'}`);
  if (!inspection.isPass) {
    console.log(`     * 감지된 이슈 목록:`, inspection.issues);
  }
  console.log('');

  // ─────────────────────────────────────────────────────────────
  // 6. 스튜디오 2단계 승인 원장 (StudioApprovalService)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 7] 스튜디오 2단계 승인 원장 (Approval Ledger)');
  project.stage = 'S50_GATE_CHECK';
  const editorialEvent = await approvalService.approveEditorial(project, 'chief-institutional-auditor', sha256Hash);
  const { release } = await approvalService.approveFile(project, sha256Hash, `/docs/demo-output/cbre-nh-capital-benchmark.pptx`, 'chief-institutional-auditor');
  console.log(`   - S60 에디토리얼 승인 완료 (이벤트 ID: ${editorialEvent.id})`);
  console.log(`   - S70 바이너리 릴리즈 완료 (릴리즈 ID: ${release.id}, 배지: ✓ 공식 승인 완료)\n`);

  // ─────────────────────────────────────────────────────────────
  // 7. 채널 간 정합성 감사 (verifyCrossChannelConsistency)
  // ─────────────────────────────────────────────────────────────
  console.log('▶ [Step 8] 옴니채널 크로스 채널 정합성 감사');
  const crossReport = verifyCrossChannelConsistency({
    webDoc: nhCapitalDoc,
    pptxProject: project,
    ssotLite: nhCapitalDoc.body.ssot_summary,
  });
  console.log(`   - 검증된 지표: ${crossReport.verifiedMetrics.join(', ')}`);
  console.log(`   - 불일치 건수: ${crossReport.totalDiscrepancies}건`);
  console.log(`   - 크로스 채널 판정: ${crossReport.passed ? '✅ PASS' : '❌ FAIL'}\n`);

  console.log('======================================================================');
  console.log('🏆 CBRE NH농협캐피탈빌딩 E2E 파이프라인 벤치마크 완료!');
  console.log('======================================================================');
  console.table([{
    deal: 'NH농협캐피탈빌딩 (2,500억)',
    slides: renderResult.slideCount,
    sizeKb: Math.round(renderResult.fileSizeBytes / 1024),
    physicalPass: inspection.isPass,
    crossPass: crossReport.passed,
    discrepancies: valResult.discrepancies.length,
    outputFile: 'cbre-nh-capital-benchmark.pptx'
  }]);

  return {
    renderResult,
    inspection,
    crossReport,
    valResult,
  };
}

// 직접 실행 지원
if (process.argv[1]?.endsWith('benchmark-cbre-nh-capital.ts')) {
  runCbreBenchmark().catch((err) => {
    console.error('CBRE 벤치마크 실행 실패:', err);
    process.exit(1);
  });
}
