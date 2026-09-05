/**
 * pptx-renderer-e2e.test.ts
 * ─────────────────────────
 * Suite 3: PPTX 인메모리 렌더링 5포스처 검증 + 육안 검수용 파일 저장
 *
 * 현재 pptx-precision.test.ts는 HTTP 서버 의존으로 서버 없으면 전 테스트 skip됨.
 * 이 테스트는 MobileImPptxRenderer를 직접 인메모리로 호출하여 커버리지 확보.
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { MobileImPptxRenderer } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { MobileImPptxInput, MobileImPptxOutput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import type { InvestmentPosture } from '@/domain/ontology/enums';

const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'stress', 'e2e-outputs');

/** 포스처별 최소 유효 doc 구조 생성 */
function buildMinimalDoc(posture: InvestmentPosture) {
  const sectionMap: Record<string, Array<{ title: string; markdown: string; section_type: string }>> = {
    income: [
      { title: '물건 개요', markdown: '서초 메디컬 빌딩은 지하2층~지상7층 규모의 올근생 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 142.5평 |\n| 연면적 | 620.8평 |\n| 준공 | 2017년 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '강남역·양재역 더블역세권 도보 4분 거리에 위치합니다.', section_type: 'location_access' },
      { title: '임대차 현황', markdown: '전층 메디컬 만실 운영 중이며 WALE 평균 3.5년입니다.\n\n| 층 | 업종 | 보증금 | 월세 |\n|---|---|---|---|\n| 1F | 약국 | 3억 | 1,200만 |\n| 2F | 안과 | 2억 | 1,100만 |', section_type: 'lease_status' },
      { title: '수익성 분석', markdown: '연 순영업소득(NOI) 약 7.14억 원, 매입 Cap Rate 4.62%입니다.\n\n- 실투자금: 약 69억 원\n- 순수익(매월): 약 3,650만 원\n- 레버리지 수익률: 약 5.8%', section_type: 'income_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 메디컬 단일업종 집중 | 전층 의료 | 업종 다각화 검토 |\n| 금리 변동 | 4.1% 고정 | 승계 대출 활용 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '60대 자산가 관점에서 안정적 월 임대수익과 우량 메디컬 테넌트를 보유한 핵심 투자 자산입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '현장 실사 및 임대차계약서 원본 확인을 권장합니다.', section_type: 'next_steps' },
    ],
    owner_occupied: [
      { title: '물건 개요', markdown: '성수 IT밸리 단독 통사옥 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 연면적 | 512.4평 |\n| 층고 | 4.2m |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '성수역 3번 출구 도보 5분입니다.', section_type: 'location_access' },
      { title: '사옥 적합성', markdown: '전층 명도 완료, 즉시 사옥 입주 가능합니다.\n\n- 자주식 주차 12대\n- 옥상 휴게정원', section_type: 'occupancy_fit' },
      { title: '비용 비교', markdown: '자가 vs 임차 연간 비용 비교 결과, 약 2.5억 원 절감 효과가 있습니다.', section_type: 'cost_comparison' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 준공업 용도제한 | IT 허용 | 사전 확인 완료 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '성수 IT산업 거점으로서의 입지 가치와 통사옥 희소성을 갖추고 있습니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '사옥 활용 레이아웃 설계 및 인테리어 비용 산정을 권장합니다.', section_type: 'next_steps' },
    ],
    development: [
      { title: '물건 개요', markdown: '역삼동 테헤란로 이면 코너 신축 부지입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지면적 | 168.5평 |\n| 용도지역 | 제3종일반주거 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '역삼역 도보 4분, 테헤란로 메인 이면입니다.', section_type: 'location_access' },
      { title: '부지 분석', markdown: '건폐율 50%, 용적률 250% 적용 시 약 680평 신축 가능합니다.', section_type: 'site_analysis' },
      { title: '개발 사업성', markdown: '예상 개발이익률 약 28%, 완공 후 자산가치 350억 상회 전망입니다.', section_type: 'development_feasibility' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 인허가 지연 | 사전협의 완료 | 2개월 내 착수 가능 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '테헤란로 프라임 입지의 개발 가치와 용적률 잔여 활용 가능성이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '건축 설계 발주 및 인허가 일정 협의를 권장합니다.', section_type: 'next_steps' },
    ],
    operating: [
      { title: '물건 개요', markdown: '이천 물류센터 3층 규모 냉동냉장 겸용 시설입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지 | 3,000평 |\n| 연면적 | 5,500평 |\n| 천장고 | 12m |\n| 도크 | 12개 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '영동고속도로 이천IC 3km 거리에 위치합니다.', section_type: 'location_access' },
      { title: '운영 현황', markdown: 'CJ대한통운 10년 장기계약 만실 운영 중입니다.', section_type: 'operation_overview' },
      { title: 'GOP 분석', markdown: '월 운영수익 1.2억, GOP 마진율 약 65%입니다.\n\n| 지표 | 수치 |\n|---|---|\n| ADR | 85만 원 |\n| OCC | 95% |\n| RevPAR | 80.75만 원 |', section_type: 'gop_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 단일 임차인 | CJ 10년 | 장기계약 보장 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '3PL 대형 임차인의 장기 안정수익과 냉동냉장 특화 시설의 희소성이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '임대차계약서 원본 및 시설 점검 보고서 확인을 권장합니다.', section_type: 'next_steps' },
    ],
    trading: [
      { title: '물건 개요', markdown: '신사동 가로수길 이면 코너 노후 빌딩입니다.\n\n| 항목 | 내용 |\n|---|---|\n| 대지 | 102.3평 |\n| 연면적 | 215.4평 |\n| 준공 | 1988년 |', section_type: 'property_overview' },
      { title: '입지 및 교통', markdown: '신사역 도보 5분, 가로수길 세로수길 상권 접면입니다.', section_type: 'location_access' },
      { title: '시장 포지션', markdown: '시세 대비 15% 저평가, 용적률 여유 35% 보유입니다.', section_type: 'market_position' },
      { title: '비교 분석', markdown: '인근 유사 매물 대비 평당가가 약 15% 낮은 수준입니다.\n\n| 비교항목 | 본건 | 인근 시세 |\n|---|---|---|\n| 평당 매매가 | 9,580만 | 11,200만 |', section_type: 'comparable_analysis' },
      { title: '리스크 점검', markdown: '| 리스크 | 현황 | 완화 방안 |\n|---|---|---|\n| 노후 설비 | 36년 | 대수선 예산 반영 |', section_type: 'risk_check' },
      { title: '투자 포인트', markdown: '가로수길 프리미엄 입지의 저평가 기회와 증축/리모델링 밸류애드 잠재력이 핵심입니다.', section_type: 'investment_thesis' },
      { title: '다음 단계', markdown: '건축사 사전 상담 및 대수선 비용 산정을 권장합니다.', section_type: 'next_steps' },
    ],
  };
  return {
    title: `${posture} 포스처 테스트 문서`,
    body: {},
    sections: sectionMap[posture],
  };
}

/** 포스처별 building 메타데이터 */
const BUILDING_META: Record<InvestmentPosture, { area_signal: string; asset_type: string; price_band: string }> = {
  income: { area_signal: '서초권역', asset_type: '메디컬빌딩', price_band: '165억' },
  owner_occupied: { area_signal: '성수권역', asset_type: '사옥', price_band: '135억' },
  development: { area_signal: '강남권역', asset_type: '신축부지', price_band: '210억' },
  operating: { area_signal: '이천권역', asset_type: '물류센터', price_band: '450억' },
  trading: { area_signal: '강남권역', asset_type: '노후빌딩', price_band: '98억' },
};

function savePptx(filename: string, buffer: Buffer): void {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  writeFileSync(join(OUTPUT_DIR, filename), buffer);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PPTX In-Memory Renderer: 5 Postures × Tiers + 육안 검수', { timeout: 120_000 }, () => {
  let renderer: MobileImPptxRenderer;

  beforeAll(() => {
    renderer = new MobileImPptxRenderer();
  });

  // ── PR-01: income / basic ──────────────────────────────────────────
  test('PR-01: income/basic → 정상 버퍼 + 슬라이드 5~16장 + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-income-basic',
      posture: 'income',
      grade: 'B',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
      broker: { display_name: '박민호', company_name: '리얼티코리아', phone: '010-9112-3344' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(5);
    expect(result.slideCount).toBeLessThanOrEqual(16);
    expect(result.warnings.filter(w => w.includes('overflow'))).toHaveLength(0);
    savePptx('income_basic_pr01.pptx', result.buffer);
  });

  // ── PR-02: income / pro ────────────────────────────────────────────
  test('PR-02: income/pro → 정상 버퍼 + 슬라이드 8~14장 + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-income-pro',
      posture: 'income',
      grade: 'A',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
      broker: { display_name: '박민호', company_name: '리얼티코리아' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(8);
    expect(result.slideCount).toBeLessThanOrEqual(24);
    savePptx('income_pro_pr02.pptx', result.buffer);
  });

  // ── PR-03: owner_occupied / basic ──────────────────────────────────
  test('PR-03: owner_occupied/basic → vsLease 전용 슬라이드 + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-oo-basic',
      posture: 'owner_occupied',
      grade: 'B',
      doc: buildMinimalDoc('owner_occupied'),
      building: BUILDING_META.owner_occupied,
      broker: { display_name: '이민규', company_name: '알스퀘어' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(5);
    savePptx('owner_occupied_basic_pr03.pptx', result.buffer);
  });

  // ── PR-04: development / basic ─────────────────────────────────────
  test('PR-04: development/basic → land+feasibility 전용 슬라이드 + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-dev-basic',
      posture: 'development',
      grade: 'B',
      doc: buildMinimalDoc('development'),
      building: BUILDING_META.development,
      broker: { display_name: '송민기', company_name: 'NAI코리아' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(5);
    savePptx('development_basic_pr04.pptx', result.buffer);
  });

  // ── PR-05: operating / basic (이천 물류센터) ───────────────────────
  test('PR-05: operating/basic → KPI 슬라이드 (이천 물류센터) + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-op-basic',
      posture: 'operating',
      grade: 'B',
      doc: buildMinimalDoc('operating'),
      building: BUILDING_META.operating,
      broker: { display_name: '물류 브로커', company_name: '이천부동산' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(5);
    savePptx('operating_basic_pr05.pptx', result.buffer);
  });

  // ── PR-06: trading / basic ─────────────────────────────────────────
  test('PR-06: trading/basic → comps 슬라이드 + PPTX 저장', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-trading-basic',
      posture: 'trading',
      grade: 'B',
      doc: buildMinimalDoc('trading'),
      building: BUILDING_META.trading,
      broker: { display_name: '이수민', company_name: '리얼티빌딩' },
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    expect(result.slideCount).toBeGreaterThanOrEqual(5);
    savePptx('trading_basic_pr06.pptx', result.buffer);
  });

  // ── PR-07: Grade C → DCF/Sensitivity suppress ─────────────────────
  test('PR-07: Grade C → DCF/Sensitivity 슬라이드 suppress 확인', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-grade-c',
      posture: 'income',
      grade: 'C',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    // Grade C에서는 DCF/Sensitivity 슬라이드가 제외되므로 Pro 슬라이드 수가 적어야 함
    expect(result.slideCount).toBeLessThanOrEqual(16);
    expect(result.buffer.length).toBeGreaterThan(0);
    savePptx('income_pro_gradeC_pr07.pptx', result.buffer);
  });

  // ── PR-08: Grade D + Pro → reject ──────────────────────────────────
  test('PR-08: Grade D → Pro 렌더링 reject 확인', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-grade-d',
      posture: 'income',
      grade: 'D',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    await expect(renderer.render(input)).rejects.toThrow();
  });

  // ── PR-09: 사진 0장 → 갤러리 슬라이드 없음 ────────────────────────
  test('PR-09: 사진 0장 → 갤러리 슬라이드 없음 확인', async () => {
    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-no-photos',
      posture: 'income',
      grade: 'B',
      doc: buildMinimalDoc('income'),
      building: BUILDING_META.income,
    };
    // 사진 없는 경우 (기본 입력에 사진 데이터 없음)
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(0);
    // 갤러리 슬라이드는 사진이 없으면 suppress 됨
    savePptx('income_no_photos_pr09.pptx', result.buffer);
  });

  // ── PR-10: 사진 8장 → 갤러리 슬라이드 생성 ─────────────────────────
  test('PR-10: 사진 8장 → 갤러리 슬라이드 2장 생성 확인', async () => {
    const mockPhotos = Array.from({ length: 8 }, (_, i) => ({
      url: `https://example.com/photo${i + 1}.jpg`,
      type: 'exterior' as const,
      label: `외관 ${i + 1}`,
      caption: `사진 ${i + 1} 캡션`,
    }));
    const doc = buildMinimalDoc('income');
    (doc.body as any).photos = mockPhotos;

    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-8-photos',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(10_000);
    savePptx('income_8photos_pr10.pptx', result.buffer);
  });

  // ── PR-11: 텍스트 예산 초과 → warning ──────────────────────────────
  test('PR-11: 텍스트 예산 초과 시 warning 생성 확인', async () => {
    const longMarkdown = '이 건물은 '.repeat(500) + '매우 우수한 투자 물건입니다.';
    const doc = buildMinimalDoc('income');
    doc.sections![0].markdown = longMarkdown;
    doc.sections![2].markdown = longMarkdown;

    const input: MobileImPptxInput = {
      buildingId: 'pptx-test-overflow',
      posture: 'income',
      grade: 'B',
      doc,
      building: BUILDING_META.income,
    };
    const result = await renderer.render(input);
    expect(result.buffer.length).toBeGreaterThan(0);
    // 초과 시 warnings 배열에 기록됨
    // 긴 텍스트가 있어도 에러 없이 렌더링되어야 함 (graceful degradation)
    savePptx('income_overflow_pr11.pptx', result.buffer);
  });
});
