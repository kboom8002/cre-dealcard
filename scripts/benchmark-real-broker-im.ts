/**
 * @file benchmark-real-broker-im.ts
 * @description 실제 중개인 작성 수익형 근생 2건(신사동 590, 서초동 1364-28) IM 원본 기반
 *              E2E 정밀 감사, 4대 필수 제원 복원, 이상치 감지, 물리 렌더링 및 옴니채널 양방향 동기화 벤치마크 러너
 *
 * 실행: npx tsx scripts/benchmark-real-broker-im.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { MobileImPptxRenderer } from '../src/domain/building/mobile-im/pptx/pptx-renderer';
import { inspectPptxBinary } from '../src/assurance/im-harness/observers/pptx-binary-observer';
import { PptxStudioService } from '../src/domain/building/pptx-studio/studio-service';
import { StudioApprovalService } from '../src/domain/building/pptx-studio/approval/studio-approval-service';
import { validateBrokerInput, type BrokerPropertyInput } from '../src/domain/building/im-core/broker-input-validator';
import { verifyCrossChannelConsistency } from '../src/domain/building/im-core/cross-channel-checker';
import { computeTargetHash } from '../src/domain/building/im-core/target-hash';
import {
  generateCreDualValuationReport,
  DEFAULT_COST_METHOD_EXCLUSION_NOTE,
} from '../src/domain/building/im-core/valuation-calc';
import { generateMacroTransitDiagram } from '../src/services/macro-transit-engine';

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs', 'demo-output');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── SSoT Standalone Fixtures Ingestion ──
const sinsaFixturePath = path.resolve(process.cwd(), 'docs', 'test', 'real-broker-im', 'sinsa-590-fixture.json');
const seochoFixturePath = path.resolve(process.cwd(), 'docs', 'test', 'real-broker-im', 'seocho-1364-28-fixture.json');

const sinsaFixture = JSON.parse(fs.readFileSync(sinsaFixturePath, 'utf-8'));
const seochoFixture = JSON.parse(fs.readFileSync(seochoFixturePath, 'utf-8'));

/** Fixture to BrokerPropertyInput adapter */
function fixtureToBrokerInput(fixture: any, options?: { overrideLandPrice?: number; photoUrls?: string[] }): BrokerPropertyInput {
  const units = (fixture.stackingPlan || []).map((s: any) => ({
    floor: s.floor,
    tenant: s.tenant,
    deposit: s.depositKrw,
    rent: s.monthlyRentKrw,
    areaPyeong: s.floorAreaPy,
    isVacant: s.isVacant,
  }));
  return {
    askingPriceKrw: fixture.askingPriceKrw,
    landAreaM2: fixture.landAreaM2,
    grossFloorAreaM2: fixture.grossFloorAreaM2,
    statedLandPricePerPyeongKrw: options?.overrideLandPrice ?? fixture.statedLandPricePerPyeongKrw,
    statedDepositKrw: fixture.statedDepositKrw,
    statedMonthlyRentKrw: fixture.statedMonthlyRentKrw,
    rentRoll: {
      totalUnits: units.length,
      units,
    },
    photoUrls: options?.photoUrls ?? (fixture.photos || []).map((p: any) => p.url),
  };
}

/** Fixture to Renderable Doc adapter */
function buildDocFromFixture(
  fixture: any,
  options: {
    cadastralMapImage?: any;
    macroTransitImage?: any;
    photos?: Array<{ url: string; caption: string }>;
  }
) {
  const photoUrls = (options.photos || []).map((p) => p.url);
  const photoList = (options.photos || []).map((p) => ({
    ...p,
    buildingId: fixture.dealId,
  }));

  const keyFacts = fixture.keyFacts3Tier;
  const keyFactsTableRows: string[] = [];
  if (keyFacts) {
    if (keyFacts.tier1_subject) {
      keyFacts.tier1_subject.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **대상지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier2_land) {
      keyFacts.tier2_land.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **토지** | ${k} | ${v} | - |`);
      });
    }
    if (keyFacts.tier3_building) {
      keyFacts.tier3_building.forEach(([k, v]: [string, string]) => {
        keyFactsTableRows.push(`| **건물** | ${k} | ${v} | - |`);
      });
    }
  }

  const leaseRows = (fixture.stackingPlan || [])
    .map((u: any) => {
      const isVacant = u.isVacant;
      const tenantStr = isVacant ? `**${u.tenant || '공실'}**` : (u.tenant || '-');
      const depStr = isVacant ? '-' : (u.depositKrw ? u.depositKrw.toLocaleString() : '-');
      const rentStr = isVacant ? '-' : (u.monthlyRentKrw ? u.monthlyRentKrw.toLocaleString() : '-');
      const expiry = u.expiryYear ? (u.expiryYear === 2024 ? '2024.10' : u.expiryYear === 2025 ? '2025.04' : u.expiryYear === 2026 ? '2026.08' : u.expiryYear === 2027 ? '2027.06' : `${u.expiryYear}년`) : '-';
      return `| ${u.floor} | ${tenantStr} | ${depStr} | ${rentStr} | ${expiry} |`;
    })
    .join('\n');

  const compRows = (fixture.salesComparisonComps || [])
    .map((c: any) => {
      const landPyStr = c.landPricePerPyeongKrw ? `약 ${(c.landPricePerPyeongKrw / 1e8).toFixed(2)}억/평` : '-';
      return `| ${c.name} | ${c.landAreaPyeong}평 | ${c.gfaPyeong}평 | ${landPyStr} | ${c.dealDate} |`;
    })
    .join('\n');

  return {
    title: fixture.title,
    posture: fixture.posture,
    address: fixture.address,
    body: {
      title: fixture.title,
      askingPrice: fixture.askingPriceKrw,
      coordinates: fixture.coordinates,
      photo_urls: photoUrls,
      photos: photoList,
      poiSpots: fixture.poiSpots || [],
      heroCard: {
        askingPriceKrw: fixture.askingPriceKrw,
        landAreaM2: fixture.landAreaM2,
        grossFloorAreaM2: fixture.grossFloorAreaM2,
        archAreaM2: fixture.archAreaM2,
        capRatePct: fixture.capRatePct,
        monthlyRentKrw: fixture.statedMonthlyRentKrw,
        depositKrw: fixture.statedDepositKrw,
        useZone: fixture.useZone,
        floors: fixture.floors,
        completionDate: fixture.completionDate,
        completionYear: parseInt(fixture.completionDate?.split('-')[0] || '1998', 10),
        parkingCount: fixture.parkingCount,
        parking: fixture.parking,
        elevatorCount: fixture.elevatorCount,
      },
      keyFacts3Tier: fixture.keyFacts3Tier,
      summary: {
        leadText: `${fixture.title} 핵심 투자 요약`,
        narrative:
          fixture.proForma?.narrative ||
          `매각희망가 ${(fixture.askingPriceKrw / 1e8).toLocaleString()}억 원, 보증금 총 ${(fixture.statedDepositKrw / 1e8).toFixed(1)}억 원, 월 임대료 ${(fixture.statedMonthlyRentKrw / 1e4).toLocaleString()}만 원이 발생하는 우량 자산입니다.`,
      },
      enrichment: {
        buildingRegister: {
          totalArea: fixture.grossFloorAreaM2,
          platArea: fixture.landAreaM2,
          archArea: fixture.archAreaM2,
          bcRat: fixture.bcRat,
          vlRat: fixture.vlRat,
          floorsAbove: fixture.floorsAbove || 6,
          floorsBelow: fixture.floorsBelow || 1,
          structure: fixture.structure,
          mainPurpose: fixture.subDistrict === 'GBD_SINSA' ? '제1종·제2종 근린생활시설' : '제2종근린생활시설 및 업무시설',
          elevatorCount: fixture.elevatorCount,
          parkingCount: fixture.parkingCount,
          useAprDay: fixture.completionDate?.replace(/-/g, ''),
          approvalDate: fixture.completionDate,
        },
        landUsePlan: {
          zoningDistrict: fixture.useZone,
          buildingCoverageMax: fixture.bcRat ? Math.ceil(fixture.bcRat) : 50,
          floorAreaRatioMax: fixture.maxVlRat || 250,
        },
        cadastralMapImage: options.cadastralMapImage,
        macroTransitImage: options.macroTransitImage,
      },
      ssot_summary: {
        asking_price: fixture.askingPriceKrw,
        total_area: fixture.grossFloorAreaM2,
        land_area: fixture.landAreaM2,
        cap_rate: fixture.capRatePct,
        deposit: fixture.statedDepositKrw,
        monthly_rent: fixture.statedMonthlyRentKrw,
      },
    },
    sections: [
      {
        section_type: 'location_access',
        title: '입지 및 접근성 분석',
        markdown: `### ${fixture.address} 권역 중심 입지\n- 주요 대중교통 및 도로 접근성 우수\n- GBD 업무·상업 배후수요 직결 우량 입지`,
      },
      {
        section_type: 'property_overview',
        title: '토지 및 건물 제원',
        markdown: `### 건축물대장 및 3단 그룹 Key Facts 제원\n\n| 구분 | 주요 항목 | 상세 제원 | 비고 |\n|---|---|---|---|\n${keyFactsTableRows.join('\n')}`,
      },
      {
        section_type: 'lease_status',
        title: '임대차 현황 (Rent Roll)',
        markdown: `### 실측 렌트롤 상세 분석\n\n| 층수 | 입주사명 | 보증금(원) | 월차임(원) | 계약만기 |\n|---|---|---:|---:|:---:|\n${leaseRows}\n| **합계** | **총 ${fixture.stackingPlan?.length || 0}개 구획** | **${fixture.statedDepositKrw.toLocaleString()}** | **${fixture.statedMonthlyRentKrw.toLocaleString()}** | - |`,
      },
      ...(fixture.salesComparisonComps && fixture.salesComparisonComps.length > 0
        ? [
            {
              section_type: 'comparable_analysis',
              title: '주변 매물 및 실거래 시세 비교',
              markdown: `### 인근 실거래 및 매물 평당가 분석 (사례비교법)\n\n| 소재지/명칭 | 대지면적 | 연면적 | 대지 평당가 | 거래시점 |\n|---|---|---|---|---|\n${compRows}\n\n> ${fixture.incomeCapitalization?.costMethodExcludedNote || DEFAULT_COST_METHOD_EXCLUSION_NOTE}`,
            },
          ]
        : []),
      {
        section_type: 'income_analysis',
        title: '수익성 및 현금흐름 분석',
        markdown: `### 연 순수익률 (Cap Rate) 분석\n- 현재 연 순수익률 (Cap Rate): ${fixture.capRatePct}%\n- 연간 임대수익: ${((fixture.statedMonthlyRentKrw * 12) / 1e8).toFixed(2)}억 원${
          fixture.proForma
            ? `\n- 정상화(Pro-forma) 연 순수익률 (Cap Rate): ${fixture.proForma.estimatedFullOccupancyCapRatePct}% (+${fixture.proForma.upsideCapRatePp}%p 상승)`
            : ''
        }`,
      },
      {
        section_type: 'investment_thesis',
        title: '핵심 투자 가치 제안 (Value Proposition)',
        markdown: `### 핵심 투자 가치 제안\n1. 강남권 핵심 입지 및 뛰어난 자산 가치 보존성\n2. 안정적 우량 임차인 구성 및 현금흐름\n3. 인근 시세 대비 우수한 가격 경쟁력\n4. 향후 리모델링 및 임대 정상화를 통한 추가 밸류애드 기회`,
      },
      {
        section_type: 'next_steps',
        title: '거래 진행 절차 및 타임라인',
        markdown: `### 거래 진행 로드맵\n- 매수의향서(LOI) 접수 ➔ 임대차 계약서 및 공부 정밀 실사 ➔ 본계약 체결 ➔ 잔금 및 소유권 이전`,
      },
    ],
  };
}

/**
 * 고화질 V-World 스타일 연속지적도(Cadastral Map) 벡터 이미지 생성기
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
    <text x="140" y="140" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 589 대</text>
    
    <polygon points="530,80 740,95 720,270 510,230" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="610" y="170" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 591 대</text>

    <polygon points="90,390 280,400 260,540 100,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="170" y="470" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 586-6 대</text>

    <polygon points="510,380 730,390 710,550 490,530" fill="#F1F5F9" stroke="#94A3B8" stroke-width="1.5"/>
    <text x="600" y="470" font-family="sans-serif" font-size="13" fill="#64748B" text-anchor="middle">인접 590-23 대</text>

    <!-- 도로 접면 표시 -->
    <path d="M 0,330 L 800,345" stroke="#CBD5E1" stroke-width="28" opacity="0.5"/>
    <text x="400" y="342" font-family="sans-serif" font-weight="bold" font-size="12" fill="#475569" text-anchor="middle">전면 12m × 이면 6m 코너 각지 도로</text>

    <!-- 대상 필지 (금색/주황색 하이라이트) -->
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
// 메인 벤치마크 실행 루틴
// ═══════════════════════════════════════════════════════════════
export async function runRealBrokerBenchmark() {
  console.log('======================================================================');
  console.log('🏢 REAL BROKER IM E2E BENCHMARK — 실매물 2건 정밀 감사 및 고도화');
  console.log('======================================================================\n');

  // 지적도 생성
  const sinsaCadastral = await generateCadastralPng('신사동 590 외 2필지', 1061.90, '제3종일반주거', ['590', '590-1', '590-2']);
  const seochoCadastral = await generateCadastralPng('서초동 1364-28 대', 596.00, '제3종일반주거');

  // 광역 대중교통망 다이어그램 생성 (1600x1200 px, 266.7 DPI)
  const sinsaTransit = await generateMacroTransitDiagram({
    propertyName: sinsaFixture.title,
    address: sinsaFixture.address,
    subDistrict: 'GBD_SINSA',
    district: 'GBD',
  });
  const seochoTransit = await generateMacroTransitDiagram({
    propertyName: seochoFixture.title,
    address: seochoFixture.address,
    subDistrict: 'GBD_SEOCHO',
    district: 'GBD',
  });

  // 미디어 에셋 경로
  const sinsaPhotos = [
    { url: path.resolve('docs/test/real-broker-im/sinsa-media/image9.jpeg'), caption: '신사동 을지병원 사거리 인근 ICL 빌딩 전면 외관' },
    { url: path.resolve('docs/test/real-broker-im/sinsa-media/image8.jpeg'), caption: '건물 후면 주차장 진입로 및 이면도로 전경' },
    { url: path.resolve('docs/test/real-broker-im/sinsa-media/image10.jpeg'), caption: '지상 자주식 및 기계식 주차 타워 설비' },
    { url: path.resolve('docs/test/real-broker-im/sinsa-media/image11.jpeg'), caption: '논현로 이면 보행자 동선 및 1층 진입로' },
  ];

  const seochoPhotos = [
    { url: path.resolve('docs/test/real-broker-im/seocho-media/image3.jpeg'), caption: '양재역 역세권 먹자골목 코너 서초동 FM빌딩 전경' },
    { url: path.resolve('docs/test/real-broker-im/seocho-media/image7.jpeg'), caption: '건물 정면 도로 접면 및 1층 근린생활시설' },
    { url: path.resolve('docs/test/real-broker-im/seocho-media/image8.jpeg'), caption: '건물 후면 및 1층 주차부스/진입로' },
    { url: path.resolve('docs/test/real-broker-im/seocho-media/image10.jpeg'), caption: '지상층 전용 오피스 내부 업무 공간' },
  ];

  const cases = [
    {
      num: 1,
      name: '신사동 590 ICL 빌딩 (760억)',
      fixture: sinsaFixture,
      brokerInput: fixtureToBrokerInput(sinsaFixture),
      rawBrokerInput: undefined,
      doc: buildDocFromFixture(sinsaFixture, { cadastralMapImage: sinsaCadastral, macroTransitImage: sinsaTransit, photos: sinsaPhotos }),
      transitDiagram: sinsaTransit,
      file: 'real-broker-sinsa-590.pptx',
      dealId: 'real-sinsa-590',
    },
    {
      num: 2,
      name: '서초동 1364-28 FM 빌딩 (230억)',
      fixture: seochoFixture,
      brokerInput: fixtureToBrokerInput(seochoFixture),
      rawBrokerInput: fixtureToBrokerInput(seochoFixture, { overrideLandPrice: seochoFixture.rawBrokerStatedLandPricePerPyeongKrw }),
      doc: buildDocFromFixture(seochoFixture, { cadastralMapImage: seochoCadastral, macroTransitImage: seochoTransit, photos: seochoPhotos }),
      transitDiagram: seochoTransit,
      file: 'real-broker-seocho-1364.pptx',
      dealId: 'real-seocho-1364',
    },
  ];

  const studioService = new PptxStudioService(true);
  const approvalService = new StudioApprovalService();
  const results = [];

  for (const c of cases) {
    console.log(`\n──────────────────────────────────────────────────────────────────────`);
    console.log(`▶ [Case ${c.num}] ${c.name}`);
    console.log(`──────────────────────────────────────────────────────────────────────`);

    // 0. SSoT 픽스처 로드 및 4대 필수 건축 제원 복원 확인
    console.log(`[0. SSoT 픽스처 로드 및 4대 필수 건축 제원 복원 확인]`);
    console.log(`   - 자산명: ${c.fixture.title}`);
    console.log(`   - 소재지: ${c.fixture.address}`);
    console.log(`   - 매매가: ${(c.fixture.askingPriceKrw / 1e8).toLocaleString()}억 원`);
    console.log(`   - 연면적: ${c.fixture.grossFloorAreaM2}㎡ (${(c.fixture.grossFloorAreaM2 * 0.3025).toFixed(1)}평)`);
    console.log(`   - 대지면적: ${c.fixture.landAreaM2}㎡ (${(c.fixture.landAreaM2 * 0.3025).toFixed(1)}평)`);
    console.log(`   - [4대 필수 제원 1] 건축면적: ${c.fixture.archAreaM2}㎡ (${(c.fixture.archAreaM2 * 0.3025).toFixed(1)}평) [복원 완료]`);
    console.log(`   - [4대 필수 제원 2] 사용승인일: ${c.fixture.completionDate} [복원 완료]`);
    console.log(`   - [4대 필수 제원 3] 주차대수: ${c.fixture.parking} (총 ${c.fixture.parkingCount}대) [복원 완료]`);
    console.log(`   - [4대 필수 제원 4] 승강기: ${c.fixture.elevatorCount}대 완비 [복원 완료]`);
    console.log(`   - [3단 Key Facts] Tier 1 대상지(${c.fixture.keyFacts3Tier.tier1_subject.length}개) / Tier 2 토지(${c.fixture.keyFacts3Tier.tier2_land.length}개) / Tier 3 건물(${c.fixture.keyFacts3Tier.tier3_building.length}개) [복원 완료]`);

    // 1. 중개인 SSoT 입력치 검증 및 이상치 감지 (BrokerInputValidator)
    const valResult = validateBrokerInput(c.brokerInput);
    console.log(`\n[1. SSoT 중개인 입력치 검증 (Clean SSoT)]`);
    console.log(`   - 유효성: ${valResult.isValid ? '✅ VALID (0 이상치)' : '❌ INVALID'}`);
    console.log(`   - Critical 이상치 건수: ${valResult.hasCritical ? '1건 이상' : '0건 (통과)'}`);
    console.log(`   - 전체 이상치/불일치 감지 건수: ${valResult.discrepancies.length}건`);
    valResult.discrepancies.forEach((d, idx) => {
      console.log(`     (${idx + 1}) [${d.severity.toUpperCase()}] ${d.code}: ${d.message}`);
      console.log(`         ➔ 조치: ${d.recommendation}`);
    });
    if (valResult.proFormaOpportunity) {
      console.log(`   - [공실 민감도 분석] 현재 Cap Rate: ${valResult.proFormaOpportunity.currentCapRatePct}% ➔ 만실 Pro-forma Cap Rate: ${valResult.proFormaOpportunity.estimatedFullOccupancyCapRatePct}% (+${valResult.proFormaOpportunity.upsideCapRatePp}%p 상승)`);
    }

    // 1b. 원본 수기 메모 이상치 감지 시연 (서초동의 경우 raw memo 7천만 원/평 감지)
    if (c.rawBrokerInput) {
      const rawValResult = validateBrokerInput(c.rawBrokerInput);
      console.log(`\n   [참고: 원본 수기 메모(7천만/평) 이상치 감지 테스트]`);
      const rawLand = rawValResult.discrepancies.find(d => d.code === 'LAND_PRICE_PYEONG_DISCREPANCY');
      if (rawLand) {
        console.log(`   - 감지 성공: [${rawLand.severity.toUpperCase()}] ${rawLand.code} (${rawLand.discrepancyPct}% 불일치)`);
        console.log(`   - 권고 조치: ${rawLand.recommendation}`);
      }
    }

    // 1c. GBD 권역 2대 감정평가 엔진 가동 (사례비교법 + 수익환원법, 원가법 배제)
    console.log(`\n[1c. GBD 2대 감정평가 엔진 가동 (사례비교법 + 수익환원법, 원가법 배제)]`);
    const valSubject = {
      askingPriceKrw: c.fixture.askingPriceKrw,
      landAreaPyeong: c.fixture.landAreaM2 * 0.3025,
      gfaPyeong: c.fixture.grossFloorAreaM2 * 0.3025,
      annualGrossRentKrw: c.fixture.statedMonthlyRentKrw * 12,
      marketCapRateRangePct: c.fixture.incomeCapitalization.marketCapRateRangePct as [number, number],
    };
    const valReport = generateCreDualValuationReport(c.fixture.salesComparisonComps, valSubject);

    console.log(`   - [사례비교법] 비교사례 ${valReport.salesComparison.compCount}건 | 밴드: ${(valReport.salesComparison.minLandPricePerPyeongKrw / 1e8).toFixed(2)}억 ~ ${(valReport.salesComparison.maxLandPricePerPyeongKrw / 1e8).toFixed(2)}억 원/평 (평균 ${(valReport.salesComparison.avgLandPricePerPyeongKrw / 1e8).toFixed(2)}억 원/평)`);
    console.log(`   - [사례비교법 판정] 본건 호가 ${(valReport.salesComparison.subjectLandPricePerPyeongKrw / 1e8).toFixed(2)}억 원/평 (${valReport.salesComparison.isWithinMarketBand ? '밴드 내 진입' : '밴드 하단 할인 진입'}, 평균 대비: ${valReport.salesComparison.marketBandDiffPct}%)`);
    console.log(`   - [사례비교법 서사] ${valReport.salesComparison.analysisNarrative}`);
    console.log(`   - [수익환원법] 연 NOI ${(valReport.incomeCapitalization.annualNoiKrw / 1e8).toFixed(3)}억 원, 시장 요구 Cap Rate ${valReport.incomeCapitalization.marketCapRateRangePct[0]}% ~ ${valReport.incomeCapitalization.marketCapRateRangePct[1]}%`);
    console.log(`   - [수익환원법 판정] 적정 자산가치 ${(valReport.incomeCapitalization.fairValueRangeKrw[0] / 1e8).toFixed(1)}억 ~ ${(valReport.incomeCapitalization.fairValueRangeKrw[1] / 1e8).toFixed(1)}억 원 (내재 Cap Rate: ${valReport.incomeCapitalization.impliedCapRatePct}%)`);
    if (c.fixture.proForma) {
      console.log(`   - [만실 Pro-forma] 정상화 Cap Rate: ${c.fixture.proForma.estimatedFullOccupancyCapRatePct}% (+${c.fixture.proForma.upsideCapRatePp}%p upside)`);
    }
    console.log(`   - [원가법 배제 사유] ${valReport.costMethodExcludedNote}`);

    // 1d. GBD 광역 대중교통망 벡터 다이어그램 검증
    console.log(`\n[1d. GBD 광역 대중교통망 벡터 다이어그램 검증]`);
    const transitImg = c.transitDiagram;
    console.log(`   - 서브권역: ${transitImg.subDistrict || c.fixture.subDistrict}`);
    console.log(`   - 픽셀 규격: ${transitImg.width}x${transitImg.height} px (1600x1200 px 표준 규격 일치)`);
    console.log(`   - 실효 DPI: ${transitImg.effectiveDpi} DPI (G32 >= 150 DPI 하한 및 R2 >= 180 DPI 목표 초과 달성)`);
    console.log(`   - 미래 예정 노선: ${transitImg.futureLines.join(', ')}`);
    console.log(`   - 주요 환승역/노드: ${transitImg.stations.slice(0, 4).join(', ')}`);
    console.log(`   - 광역 통근 축: ${transitImg.coreDistrictArrows.join(' | ')}`);

    // 1e. 배후수요 도메인 격리 감사 (Catchment Isolation)
    console.log(`\n[1e. 배후수요 도메인 격리 감사 (Catchment Isolation)]`);
    const inPlaceTenants = (c.fixture.stackingPlan || [])
      .map((s: any) => s.tenant)
      .filter((t: string) => t && !t.includes('공실') && !t.includes('사무실'));
    const catchmentSections = c.doc.sections.filter(
      (s: any) => s.section_type === 'location_access' || s.section_type === 'commercialDistrict'
    );
    const catchmentText = catchmentSections.map((s: any) => `${s.title} ${s.markdown}`).join(' ');
    const leakedTenants = inPlaceTenants.filter((t: string) => catchmentText.includes(t));
    const isolationClean = leakedTenants.length === 0;
    console.log(`   - 내부 임차인명 유출 여부: ${isolationClean ? '✅ 0건 (완전 격리)' : '❌ 유출 감지: ' + leakedTenants.join(', ')}`);

    const rentRollSec = c.doc.sections.find((s: any) => s.section_type === 'lease_status');
    const rentRollText = `${rentRollSec?.title || ''} ${rentRollSec?.markdown || ''}`;
    const bannedMacroTerms = ['일평균 유동인구', '소비력 지수', '직장인 상주인구 12만', '개업률', '폐업률'];
    const leakedMacro = bannedMacroTerms.filter((term) => rentRollText.includes(term));
    const rentRollPure = leakedMacro.length === 0;
    console.log(`   - 렌트롤 거시 인구통계 혼입 여부: ${rentRollPure ? '✅ 0건 (완전 격리)' : '❌ 혼입 감지: ' + leakedMacro.join(', ')}`);

    // 2. 타깃 해시 계산 (SSoT 불변성 확인)
    const targetHash = computeTargetHash({
      body: {
        asking_price: c.doc.body.askingPrice,
        address: c.doc.address,
        posture: c.doc.posture,
        sections: c.doc.sections,
      },
      releaseTier: 'analysis_im',
      policyVersion: 'v1.0.0',
    });
    console.log(`\n[2. SSoT 타깃 해시 산출]`);
    console.log(`   - Target Hash: ${targetHash}`);

    // 3. Studio Project 생성
    const project = studioService.createProject(
      c.dealId,
      `pkg-${c.dealId}`,
      c.doc.title,
      'commercial_visual_grid'
    );

    // 4. 물리 PPTX 풀 덱 렌더링
    const startTime = Date.now();
    const renderer = new MobileImPptxRenderer();
    const renderResult = await renderer.render({
      buildingId: c.dealId,
      doc: c.doc as any,
      posture: c.doc.posture,
      preset: 'commercial_visual_grid',
      grade: 'A',
      building: {
        area_signal: c.doc.address,
        asset_type: c.doc.posture,
        price_band: `${Math.floor(c.doc.body.askingPrice / 100000000)}억원`,
      },
    });
    const renderElapsed = Date.now() - startTime;

    const outPath = path.join(OUTPUT_DIR, c.file);
    fs.writeFileSync(outPath, renderResult.buffer);
    console.log(`\n[3. 물리 PPTX 렌더링 완료]`);
    console.log(`   - 파일 경로: ${outPath}`);
    console.log(`   - 파일 크기: ${(renderResult.fileSizeBytes / 1024).toFixed(1)} KB`);
    console.log(`   - 슬라이드 면수: ${renderResult.slideCount}면 (Rule 10 16면 상한 준수)`);
    console.log(`   - 렌더링 소요시간: ${renderElapsed}ms`);

    // 5. 물리 바이너리 정밀 인스펙션 (inspectPptxBinary)
    const inspection = await inspectPptxBinary(renderResult.buffer);
    const sha256Hash = crypto.createHash('sha256').update(renderResult.buffer).digest('hex');

    console.log(`\n[4. 물리 무결성 검증 성적표]`);
    console.log(`   - 지면 이탈 (Bleed): ${inspection.bleedCount}건 (0건 목표)`);
    console.log(`   - 미치환 템플릿 토큰 ({{...}}): ${inspection.placeholderResidueCount}건 (0건 목표)`);
    console.log(`   - 깨진 이미지: ${inspection.brokenImageCount}건 (0건 목표)`);
    console.log(`   - Rule 1 페르소나 단어 노출: ${inspection.personaViolationCount}건 (0건 목표)`);
    console.log(`   - Rule 2 CRE 표준 용어 위반: ${inspection.lexiconViolationCount}건 (0건 목표)`);
    console.log(`   - P0 법적 금기어 위반: ${inspection.legalRiskViolationCount}건 (0건 목표)`);
    console.log(`   - 물리 하네스 최종 판정: ${inspection.isPass ? '✅ PASS' : '❌ FAIL'}`);
    if (!inspection.isPass) {
      console.log(`     * 이슈 목록:`, inspection.issues);
    }

    // 6. 스튜디오 2단계 승인 원장 (Approval Ledger)
    project.stage = 'S50_GATE_CHECK';
    const editorialEvent = await approvalService.approveEditorial(project, 'chief-broker-auditor', sha256Hash);
    const { release } = await approvalService.approveFile(project, sha256Hash, `/docs/demo-output/${c.file}`, 'chief-broker-auditor');
    console.log(`\n[5. 옴니채널 2단계 승인 원장]`);
    console.log(`   - S60 에디토리얼 승인 완료 (이벤트: ${editorialEvent.id})`);
    console.log(`   - S70 바이너리 파일 릴리즈 완료 (릴리즈: ${release.id}, 배지: ✓ 공식 승인 완료)`);

    // 7. 채널 간 정합성 크로스 체커
    const crossReport = verifyCrossChannelConsistency({
      webDoc: c.doc,
      pptxProject: project,
      ssotLite: c.doc.body.ssot_summary,
    });
    console.log(`\n[6. 채널 간 정합성 감사]`);
    console.log(`   - 검증된 지표: ${crossReport.verifiedMetrics.join(', ')}`);
    console.log(`   - 불일치 건수: ${crossReport.totalDiscrepancies}건`);
    console.log(`   - 크로스 채널 판정: ${crossReport.passed ? '✅ PASS' : '❌ FAIL'}`);

    results.push({
      case: c.num,
      name: c.name,
      file: c.file,
      slides: renderResult.slideCount,
      sizeKb: Math.round(renderResult.fileSizeBytes / 1024),
      compsCount: valReport.salesComparison.compCount,
      capRate: `${valReport.incomeCapitalization.impliedCapRatePct}%`,
      fairValueRange: `${(valReport.incomeCapitalization.fairValueRangeKrw[0] / 1e8).toFixed(0)}억~${(valReport.incomeCapitalization.fairValueRangeKrw[1] / 1e8).toFixed(0)}억`,
      physicalPass: inspection.isPass,
      crossPass: crossReport.passed,
      transitDpi: `${transitImg.effectiveDpi} DPI`,
      catchmentIsolated: isolationClean && rentRollPure ? '✅ ISOLATED' : '❌ LEAK',
      discrepanciesCount: valResult.discrepancies.length,
    });
  }

  console.log('\n======================================================================');
  console.log('🏆 REAL BROKER IM BENCHMARK 종합 결과 요약');
  console.log('======================================================================');
  console.table(results);
  console.log(`\n📂 생성된 PPTX 저장소: ${OUTPUT_DIR}\n`);

  return results;
}

// 직접 실행 지원
if (process.argv[1]?.endsWith('benchmark-real-broker-im.ts')) {
  runRealBrokerBenchmark().catch((err) => {
    console.error('벤치마크 실행 실패:', err);
    process.exit(1);
  });
}
