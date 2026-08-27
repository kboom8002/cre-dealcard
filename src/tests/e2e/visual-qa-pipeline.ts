/**
 * visual-qa-pipeline.ts
 * ───────────────────────
 * Case 01: 서초 메디컬 빌딩 시각적 품질 검수 파이프라인
 * 1) 4종 실사 사진 주입된 SSoT & Supplemental 데이터 준비
 * 2) MobileImPptxRenderer 인메모리 실행 → basic PPTX 생성
 * 3) PPTX 저장 (docs/test/stress/e2e-outputs/visual-qa/case01_seocho_medical_basic.pptx)
 * 4) AdmZip 기반 슬라이드 XML 구조 및 무결성 검사
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';

const QA_DIR = join(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs', 'visual-qa');
const CAPTURES_DIR = join(QA_DIR, 'captures');

if (!existsSync(QA_DIR)) mkdirSync(QA_DIR, { recursive: true });
if (!existsSync(CAPTURES_DIR)) mkdirSync(CAPTURES_DIR, { recursive: true });

async function runVisualQAPipeline() {
  console.log('=== [Phase 1] Case 01 서초 메디컬 빌딩 PPTX 생성 ===');

  // 사진 4장 메타데이터 구성
  const photos = [
    {
      url: `/test-images/01_exterior.jpg`,
      type: 'exterior' as const,
      label: '건물 외관 전경',
      caption: '서초 메디컬 빌딩 지상 7층 외관 및 1층 약국 전경',
      order: 1,
    },
    {
      url: `/test-images/02_aerial.jpg`,
      type: 'aerial' as const,
      label: '항공 뷰',
      caption: '서초권역 메디컬 타운 조망 및 주변 도로망',
      order: 2,
    },
    {
      url: `/test-images/03_entrance.jpg`,
      type: 'entrance' as const,
      label: '1층 주출입구',
      caption: '1층 메디컬 타워 진입 로비 및 대형 약국',
      order: 3,
    },
    {
      url: `/test-images/04_lobby.jpg`,
      type: 'lobby' as const,
      label: '메인 로비',
      caption: '안내 데스크 및 승강기 홀 현대식 인테리어',
      order: 4,
    },
  ];

  const doc = {
    title: '서초 메디컬 빌딩 투자설명서',
    body: {
      photos,
      heroCard: {
        askingPriceDisplay: '165억 원',
        capRateBase: 4.62,
        noiBaseBil: 7.14,
        equityRequiredBil: 68.5,
        leveragedYieldPct: 5.82,
        posture: 'income',
        landAreaM2: 471.1,
        totalGrossAreaM2: 2052.2,
        zoning: '일반상업지역',
      },
    },
    sections: [
      {
        title: '물건 개요',
        section_type: 'property_overview',
        markdown: `### 서초 메디컬 빌딩 (올근생)
- **위치**: 서울특별시 서초구 서초동 1320-5
- **대지면적**: 142.5평 (471.1㎡)
- **연면적**: 620.8평 (2,052.2㎡)
- **건축규모**: 지하 2층 ~ 지상 7층
- **준공연도**: 2017년 11월 (신축급 내외관 컨디션)
- **주차**: 자주식+기계식 총 18대

| 구분 | 대지면적 | 연면적 | 준공연도 | 주용도 |
|---|---|---|---|---|
| 본건 | 142.5평 | 620.8평 | 2017년 | 제2종근린생활시설 |`,
      },
      {
        title: '입지 및 상권',
        section_type: 'location_access',
        markdown: `### 강남·서초 메디컬 벨트 핵심 거점
- **교통 접근성**: 강남역(2호선·신분당선) 및 양재역 도보 5분 더블역세권
- **배후 수요**: 삼성타운, 롯데칠성부지 개발호재 인접 및 고소득 오피스 상주인구 12만명
- **도로망**: 강남대로, 서초대로, 남부순환로 직결 우수한 차량 접근성`,
      },
      {
        title: '임대차 현황 (Rent Roll)',
        section_type: 'lease_status',
        markdown: `### 전층 우량 메디컬 테넌트 만실 운영
총 7개 층 모두 병의원 및 약국으로 구성되어 있으며 공실률 0% 안정적인 임대수익 창출 중.

| 층수 | 입점 업종 | 전용(평) | 보증금(만원) | 월임대료(만원) |
|---|---|---|---|---|
| 1F | 대형약국 | 55.0 | 30,000 | 1,200 |
| 2F | 안과의원 | 65.0 | 20,000 | 1,100 |
| 3F | 피부과의원 | 65.0 | 20,000 | 1,050 |
| 4F | 정형외과 | 65.0 | 15,000 | 1,000 |
| 5F | 치과의원 | 65.0 | 15,000 | 950 |
| 6F~7F | 대형어학원 | 130.0 | 15,000 | 650 |
| **합계** | **만실(6개사)** | **445.0평** | **115,000만** | **5,950만** |`,
      },
      {
        title: '수익성 분석',
        section_type: 'income_analysis',
        markdown: `### 매입 즉시 연 4.62% 확정 Cap Rate
- **매매가**: 165억 원
- **보증금 총액**: 11억 5,000만 원
- **월 임대료 합계**: 5,950만 원 (연 7억 1,400만 원)
- **월 관리비**: 680만 원
- **기대 레버리지 수익률**: 5.82% (LTV 50% 실행 시)
- **실투자금액**: 약 68.5억 원 (보증금+대출 차감 후)`,
      },
      {
        title: '리스크 점검',
        section_type: 'risk_check',
        markdown: `| 리스크 영역 | 진단 현황 | 완화 방안 및 대응책 |
|---|---|---|
| **물리적 리스크** | 2017년 준공 신축급 | 대수선 필요 없음, 최근 승강기 정밀점검 완료 |
| **임대차 리스크** | 메디컬 업종 평균 계약 5년 | 잔여 임대기간 평균 3.5년, 장기 우량 임차인 |
| **금융 리스크** | 금리 변동성 | 기존 4.1% 우대금리 대출 승계 가능 |`,
      },
      {
        title: '투자 포인트',
        section_type: 'investment_thesis',
        markdown: `### 서초 메디컬 타워 핵심 투자 4대 강점
1. **원금 안정성**: 강남대로 이면 상업지 토지가격 지속 상승 구간
2. **현금흐름 명확성**: 월 5,950만원 세후 안정적 배당 소득
3. **관리 편의성**: 메디컬 단일 성격 임차인으로 공실 리스크 및 명도 마찰 극소화
4. **절세 및 승계**: 법인 전환 또는 사전증여 시 유리한 우량 자산 구조`,
      },
      {
        title: '표기 기준 및 면책',
        section_type: 'next_steps',
        markdown: `본 자료는 매수 검토를 위한 요약 투자설명서이며, 세부 권리관계 및 계약서 원본은 실사 단계에서 제공됩니다.`,
      },
    ],
  };

  const renderer = new MobileImPptxRenderer();
  const input: MobileImPptxInput = {
    buildingId: 'stress-case-01',
    posture: 'income',
    grade: 'A',
    preset: 'credeal_signature',
    doc,
    building: {
      area_signal: '서초권역',
      asset_type: '메디컬빌딩',
      price_band: '165억',
    },
    broker: {
      display_name: '박민호 수석팀장',
      company_name: '리얼티코리아 중개법인',
      phone: '010-9112-3344',
      specialty: '강남·서초 메디컬 빌딩 전문',
    },
    watermark: {
      requesterName: 'VIP 매수의뢰인',
      phoneLast4: '8002',
      timestamp: new Date().toISOString(),
    },
  };

  const pptxOutput = await renderer.render(input);
  const pptxPath = join(QA_DIR, 'case01_seocho_medical_basic.pptx');
  writeFileSync(pptxPath, pptxOutput.buffer);
  console.log(`✅ PPTX 생성 성공: ${pptxPath} (${pptxOutput.slideCount}장, ${(pptxOutput.fileSizeBytes / 1024).toFixed(1)} KB)`);

  // AdmZip XML 검사
  console.log('\n=== [Phase 1-2] PPTX XML 구조 및 데이터 무결성 검증 ===');
  const zip = new AdmZip(pptxOutput.buffer);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  console.log(`총 슬라이드 XML 개수: ${slideEntries.length}개`);
  let hasXmlErrors = false;

  slideEntries.forEach((entry, idx) => {
    const xml = entry.getData().toString('utf8');
    const issues: string[] = [];
    if (xml.includes('>NaN<')) issues.push('NaN 감지');
    if (xml.includes('>undefined<')) issues.push('undefined 감지');
    if (xml.includes('>null<')) issues.push('null 감지');
    if (xml.includes('[object Object]')) issues.push('[object Object] 감지');

    const tables = (xml.match(/<a:tbl>/g) || []).length;
    const shapes = (xml.match(/<p:sp>/g) || []).length;
    const textSample = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

    if (issues.length > 0) {
      hasXmlErrors = true;
      console.error(`❌ Slide ${idx + 1} [${entry.entryName}]: ${issues.join(', ')}`);
    } else {
      console.log(`✓ Slide ${idx + 1} [${entry.entryName}]: Tables=${tables}, Shapes=${shapes} | "${textSample}..."`);
    }
  });

  if (!hasXmlErrors) {
    console.log('🎉 모든 슬라이드 XML 무결성 검사 통과 (오류 없음)');
  }
}

runVisualQAPipeline().catch(console.error);
