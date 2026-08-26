/**
 * 양평동·당산동 실매물 PPTX IM 산출물 생성
 * 실행: npx tsx src/tests/e2e/generate-pptx-output.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';

const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'pptx-output');
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function main() {
  const renderer = new MobileImPptxRenderer();

  // ═══════════════════════════════════════════
  // 1. 양평동4가 더레드빌딩 (250억 · 업무시설)
  // ═══════════════════════════════════════════
  console.log('▶ [1/2] 양평동4가 더레드빌딩 PPTX 생성 중...');

  const yangpyeongDoc = {
    title: '선유도역 초역세권 신축 오피스빌딩(더레드빌딩) 투자설명서',
    body: {
      photos: [],
      heroCard: {
        askingPriceDisplay: '250.0억 원',
        capRateBase: 2.41,
        noiBaseBil: 6.02,
        equityRequiredBil: 125.0,
        leveragedYieldPct: 3.85,
        posture: 'income',
        landAreaM2: 518.7,
        totalGrossAreaM2: 2490.88,
        zoning: '준공업지역',
        keyInvestmentPoint: '2018년 신축 자산 · IT·회계 등 11개 법인 분산 만실 · 지하 리스업 시 2.71%',
      },
      identity: { investmentPosture: 'income', assetType: '사무용빌딩' },
    },
    sections: [
      {
        title: '물건 개요', section_type: 'property_overview',
        markdown: `### 서울특별시 영등포구 양평동4가 117, 134, 125-2 (3필지 통합)\n- **대지면적**: 156.91평 (518.7㎡)\n- **연면적**: 전체 753.49평 (2,490.88㎡) / 지상 625.75평 (2,068.60㎡)\n- **건축규모**: 지하 1층 ~ 지상 10층 (철근콘크리트, 승강기 1대, 옥외1+기계식22대 주차)\n- **준공연도**: 2018년 9월\n- **용적률 현황**: 지상 연면적 기준 **398.8%** (준공업지역 법정 상한 400% 근접)\n- **거래 형태**: 매매희망가 250억 원\n\n| 구분 | 대지면적 | 연면적 (전체) | 지상 용적률 | 준공연도 | 주용도 |\n|---|---|---|---|---|---|\n| 본건 | 156.91평 | 753.49평 | 398.8% | 2018.09 | 업무시설 |`,
      },
      {
        title: '입지 및 교통 접근성', section_type: 'location_access',
        markdown: `### 선유도역 9호선 역세권 및 대로변\n- **역세권**: 선유도역 4번 출구 도보 1분(80m) 대로변 직결\n- **도로망**: 올림픽대로, 서부간선도로, 양화대교 초인접\n- **오피스 수요**: 영등포 벤처밸리 및 여의도 금융업 배후 수요 지속 유입`,
      },
      {
        title: '임대차 현황', section_type: 'lease_status',
        markdown: `### 11개 기업 다각화 분산 임차\n- **보증금 총액**: 5억 3,500만 원 | **월 임대료 총액**: 5,017만 원 (관리비 648만 별도)\n- **공실 현황**: 17.0% (지하 1층 127.7평만 리스업 대기)\n- **임차인 구성**: 디자인스튜디오, IT, 회계법인, 무역상사, 이커머스, 컨설팅 등\n- **상임법 분석**: 11개 호실 전원 환산보증금 9억 이하`,
      },
      {
        title: '수익성 분석', section_type: 'income_analysis',
        markdown: `### 현행 Cap Rate 2.41% + 지하 공실 리스업 시 2.71%\n- **현재 Cap Rate**: **2.41%** (연간 확정 임대수입 6억 204만 원)\n- **지하 1층(127.7평) 리스업 시**: 월 +638만 원 → **5,655만 원** (+12.7%)\n- **잠재 Cap Rate**: **2.71%** (연간 6억 7,860만 원)`,
      },
      {
        title: '리스크 점검', section_type: 'risk_check',
        markdown: `### 권리 및 물리적 안전성\n- **용적률 398.8%**: 법정 상한 400%에 근접, 증축 여력 제한적 → 운영 집중\n- **신축 컨디션**: 2018년 준공, 주요 설비 양호\n- **등기**: 단일 소유자, 권리제한사항 확인 필요`,
      },
      {
        title: '종합 가치 제안', section_type: 'investment_thesis',
        markdown: `### 밸류애드 리스크 없는 완성형 자산\n1. **입지**: 선유도역 9호선 도보 1분 대로변\n2. **신축**: 2018년 신축, 추가 캡엑스 불필요\n3. **분산 임차**: 11개 테넌트로 리스크 분산\n4. **리스업**: 지하 1층 임대화 시 2.71% 달성`,
      },
      {
        title: '향후 진행 일정', section_type: 'next_steps',
        markdown: `### 거래 진행 프로세스\n1. 투자 의향서 접수 및 임대차 실사\n2. 매매계약 체결 및 보증금 정산\n3. 잔금 지급 및 관리 인수인계`,
      },
    ],
  };

  const ypResult = await renderer.render({
    doc: yangpyeongDoc as any,
    buildingId: 'yangpyeong-output',
    building: { area_signal: '양평권역 (선유도역)', asset_type: '사무용빌딩', price_band: '250억' } as any,
    broker: { display_name: 'CREDEAL', company_name: 'CREDEAL', phone: '', specialty: '상업용 부동산 전문' },
    tier: 'basic', posture: 'income', preset: 'credeal_signature', grade: 'B',
  });
  const ypPath = join(OUTPUT_DIR, 'yangpyeong_income_250억_IM.pptx');
  writeFileSync(ypPath, ypResult.buffer);
  console.log(`  ✅ 양평동 PPTX 완료 (${ypResult.slideCount}슬라이드): ${ypPath}`);

  // ═══════════════════════════════════════════
  // 2. 당산동5가 근생빌딩 (115억 · 근린생활시설)
  // ═══════════════════════════════════════════
  console.log('▶ [2/2] 당산동5가 근생빌딩 PPTX 생성 중...');

  const dangsanDoc = {
    title: '당산역 역세권 근생빌딩 투자설명서',
    body: {
      photos: [],
      heroCard: {
        askingPriceDisplay: '115.0억 원',
        capRateBase: 2.03,
        noiBaseBil: 2.34,
        equityRequiredBil: 57.5,
        leveragedYieldPct: 3.1,
        posture: 'income',
        landAreaM2: 506.8,
        totalGrossAreaM2: 1441.15,
        zoning: '준공업지역',
        keyInvestmentPoint: '당산역 2·9호선 도보 5분 · 용적률 여유 178%p · 임대료 현실화 시 47% 수입 증가',
      },
      identity: { investmentPosture: 'income', assetType: '근린생활시설' },
    },
    sections: [
      {
        title: '물건 개요', section_type: 'property_overview',
        markdown: `### 서울특별시 영등포구 당산동5가 11-47 근린생활시설\n- **대지면적**: 153.31평 (506.8㎡)\n- **연면적**: 435.9평 (1,441.15㎡) — 렌트롤 행별 합산 기준\n- **건축규모**: 지하 1층 ~ 지상 5층, 자주식 주차 8대, 승강기 1대\n- **준공연도**: 2002년\n- **건폐율 / 용적률**: 51.9% / 221.8%\n- **용도지역**: 준공업지역 (법정 상한 400%, 여유 178.2%p)\n- **거래 형태**: 매매희망가 115억 원 (토지 평당가 7,500만원)\n- **소유 형태**: 층별 구분등기 · 소유자 2인(형제)\n\n> ⚠️ 연면적: 행별 합산(1,441.15㎡)과 표기 계(1,141.15㎡) 간 300㎡ 불일치. 건축물대장 미첨부로 미확정.`,
      },
      {
        title: '입지 및 교통 접근성', section_type: 'location_access',
        markdown: `### 당산역 2·9호선 역세권 · 아파트 밀집 배후\n- **역세권**: 당산역(2호선·9호선) 도보 5분\n- **배후 수요**: 아파트 단지 밀집 → 근린상업 수요 안정적\n- **도로망**: 국회대로·올림픽대로 접근 용이\n- **제도 개선**: 서울시 준공업지역 제도개선(2024.10) — 용도지역 변경 추진 중`,
      },
      {
        title: '임대차 현황', section_type: 'lease_status',
        markdown: `### 계약 5건 · 호실 6개 임대 + 자가사용 2개 · 공실 0\n- **보증금 총액**: 2억 9,000만 원 | **월 임대료 총액**: 1,946만 원\n- **공실률**: 0% (자가사용은 임대전환 여력으로 분류)\n- **자가사용**: B1 카페(317.22㎡) + 4F 일부(83.03㎡) = 400.25㎡\n\n| 층 | 임차인 | 면적(㎡) | 보증금 | 월세 | 만료일 | 비고 |\n|---|---|---:|---:|---:|---|---|\n| B1 | 데이르 카페 | 317.22 | - | - | - | 자가사용 |\n| 1F | 고은약국 | 78.39 | 6,000만 | 183만 | 2026-08-31 | |\n| 1F+2F | 로뎀나무내과 | 357.69 | 1.4억 | 883만 | 2026-08-31 | 통합계약 |\n| 3F | 헬쓰장 | 252.09 | 5,000만 | 455만 | 2026-04-17 | |\n| 4F | 국제와인 | 169.06 | 3,000만 | 260만 | 2025-04-30 | 만료 |\n| 4F | (자가) | 83.03 | - | - | - | 자가사용 |\n| 5F | 로뎀나무내과 | 183.67 | 1,000만 | 165만 | 2026-08-31 | |\n\n> ⚠️ 최초계약일 미기재 → 갱신요구권 잔여 연수 확인 필요`,
      },
      {
        title: '수익성 분석', section_type: 'income_analysis',
        markdown: `### 현행 Cap Rate 2.03% → 임대료 현실화 시 2.99% (총임대료 기준)\n- **현재**: 2.03% (월세 1,946만 × 12 / 115억)\n- **현실화 후**: 2.99% (월세 2,867만 × 12 / 115억, +47.3%)\n- **현실화 기준**: 3F 헬쓰장 평당 62.4천원을 기준단가\n- **주의**: 1F 로뎀나무내과 883→816만 감액 반영\n- **환산보증금 초과**: 로뎀 1F+2F 10.23억 (5% 상한 미적용 대상)\n\n> ◇ 임대료 현실화 계획은 가정입니다 (◇가정 0.30)`,
      },
      {
        title: '리스크 점검', section_type: 'risk_check',
        markdown: `### 확인 필요 사항\n- **연면적 미확정**: 행별 합산 vs 표기 계 300㎡ 차이\n- **구분등기 소유자 2인**: 매각 시 2인 전원 동의 필요\n- **최초계약일 미기재**: 갱신요구권 잔여 확인 불가\n- **국제와인 만료**: 4F 계약 2025-04-30 이미 만료\n- **대출·근저당**: 원본에 정보 없음`,
      },
      {
        title: '종합 가치 제안', section_type: 'investment_thesis',
        markdown: `### 용적률 여유 178%p + 임대료 현실화 47% 업사이드\n1. **입지**: 당산역 2·9호선 도보 5분, 아파트 밀집 배후\n2. **용적률 여유**: 221.8% vs 400% → 178.2%p 개발 여력\n3. **임대료 현실화**: 시세 대비 저평가 → 47.3% 인상 여력\n4. **인근 시세**: 평당 89~162백만 대비 본건 75백만 (할인 매물)\n5. **제도 혜택**: 준공업지역 용도변경 시 추가 용적률 확보 가능`,
      },
      {
        title: '향후 진행 일정', section_type: 'next_steps',
        markdown: `### 거래 진행 프로세스\n1. 건축물대장 취득 및 연면적 확정\n2. 소유자 2인 매각 동의 확인\n3. 투자 의향서 접수 및 실사\n4. 매매계약 체결 및 잔금 지급`,
      },
    ],
  };

  const dsResult = await renderer.render({
    doc: dangsanDoc as any,
    buildingId: 'dangsan-output',
    building: { area_signal: '당산권역 (당산역)', asset_type: '근린생활시설', price_band: '115억' } as any,
    broker: { display_name: 'CREDEAL', company_name: 'CREDEAL', phone: '', specialty: '상업용 부동산 전문' },
    tier: 'basic', posture: 'income', preset: 'credeal_signature', grade: 'C',
  });
  const dsPath = join(OUTPUT_DIR, 'dangsan_income_115억_IM.pptx');
  writeFileSync(dsPath, dsResult.buffer);
  console.log(`  ✅ 당산동 PPTX 완료 (${dsResult.slideCount}슬라이드): ${dsPath}`);

  console.log('\n════════════════════════════════════════════');
  console.log('📁 산출물 저장 위치:');
  console.log(`   ${OUTPUT_DIR}`);
  console.log(`   ├── yangpyeong_income_250억_IM.pptx`);
  console.log(`   └── dangsan_income_115억_IM.pptx`);
  console.log('════════════════════════════════════════════');
}

main().catch(console.error);
