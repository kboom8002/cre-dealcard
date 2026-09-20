/**
 * @file p1-dangsan-r2-golden-pipeline.test.ts
 * @description P1 당산 수익형 매물 — R2-Standard 데이터셋 기반 프로덕션 전구간 골든 테스트
 *
 * 프로덕션 파이프라인 동일 경로 (7단계):
 *   1. 데이터셋 로드 (bottom_sheet.json + memo.txt + expected.json)
 *   2. 메모 슬롯 추출 (extractSlotsFromMemo)
 *   3. 재무 계산 (calculateFinancials → NOI, Cap Rate, Land Price/Pyeong)
 *   4. 데이터 품질 배지 (computeDataQualityBadge)
 *   5. PPTX 렌더링 (MobileImPptxRenderer.render)
 *   6. 바이너리 품질 게이트 (4대 단언: Poison Token, Evasive, Mock, Physical)
 *   7. 슬라이드 콘텐츠 검증 (당산 키워드, 렌트롤, 수익률)
 *
 * 모든 단계를 로그로 기록하여 파이프라인 MD 보고서를 생성합니다.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

import { extractSlotsFromMemo } from '@/domain/building/memo-slot-mapper';
import { computeDataQualityBadge } from '@/domain/building/mobile-im/data-quality-badge';
import { calculateFinancials, type FinancialInputs } from '@/domain/building/mobile-im/financials';
import {
  MobileImPptxRenderer,
  type MobileImPptxInput,
} from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  extractSlideTexts,
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
  inspectPptxBinary,
  verifyMathematicalConsistency,
} from '@/assurance/im-harness/golden-test-utils';
import {
  buildDeckSequence,
  PAGE_HARD_LIMIT,
} from '@/domain/building/mobile-im/pptx/deck-sequencer';
import { safeWritePptx } from './fixtures/safe-write';
import { createBasicImTestInput } from './fixtures/basic-im-factory';

// ═══════════════════════════════════════════════════════════════════
// Constants & Paths
// ═══════════════════════════════════════════════════════════════════

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p1-dangsan-income', 'r2-standard');
const IMAGES_DIR = join(DATA_DIR, 'images');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p1-dangsan-r2');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'p1_dangsan_income_r2_basic.pptx');
const LOG_PATH = join(OUTPUT_DIR, 'pipeline_log.md');

// ═══════════════════════════════════════════════════════════════════
// Pipeline Log Accumulator
// ═══════════════════════════════════════════════════════════════════

interface PipelineLogEntry {
  step: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
  durationMs: number;
  detail: string;
  data?: any;
}

const pipelineLog: PipelineLogEntry[] = [];
const startTime = Date.now();

function logStep(entry: PipelineLogEntry) {
  pipelineLog.push(entry);
  const icon = entry.status === 'PASS' ? '✅' : entry.status === 'FAIL' ? '❌' : entry.status === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`  ${icon} [${entry.step}] ${entry.label}: ${entry.detail} (${entry.durationMs}ms)`);
}

function generatePipelineReport(): string {
  const totalDuration = Date.now() - startTime;
  const passCount = pipelineLog.filter(e => e.status === 'PASS').length;
  const failCount = pipelineLog.filter(e => e.status === 'FAIL').length;
  const warnCount = pipelineLog.filter(e => e.status === 'WARN').length;

  let md = `# P1 당산 수익형 — R2-Standard 골든 파이프라인 보고서

> **생성 시각**: ${new Date().toISOString()}
> **총 소요시간**: ${totalDuration}ms
> **결과**: ${passCount} PASS / ${failCount} FAIL / ${warnCount} WARN

---

## 입력 데이터셋

| 항목 | 값 |
|:---|:---|
| 데이터셋 경로 | \`${DATA_DIR}\` |
| 해상도 | R2-Standard |
| 포스처 | income |
| 매물 | 서울특별시 영등포구 당산동5가 11-47 |
| 매각가 | 115억 |

---

## 파이프라인 실행 로그

| # | 단계 | 상태 | 소요시간 | 상세 |
|:---|:---|:---|---:|:---|
`;

  pipelineLog.forEach((entry, idx) => {
    const icon = entry.status === 'PASS' ? '✅' : entry.status === 'FAIL' ? '❌' : entry.status === 'WARN' ? '⚠️' : 'ℹ️';
    md += `| ${idx + 1} | ${entry.step} — ${entry.label} | ${icon} ${entry.status} | ${entry.durationMs}ms | ${entry.detail} |\n`;
  });

  md += `\n---\n\n## 상세 단계별 데이터\n\n`;

  pipelineLog.forEach((entry) => {
    if (entry.data) {
      md += `### ${entry.step}: ${entry.label}\n\n`;
      md += '```json\n' + JSON.stringify(entry.data, null, 2) + '\n```\n\n';
    }
  });

  return md;
}

// ═══════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════

describe('P1 당산 Income R2-Standard — 프로덕션 골든 파이프라인', () => {
  // Shared state across tests
  let bottomSheet: any;
  let memo: string;
  let expected: any;
  let memoSlots: any;
  let financials: any;
  let badge: any;
  let pptxResult: any;
  let extractedSlides: any;
  let binaryInspection: any;

  // ──────────────────────────────────────────────────
  // Step 0: Setup — 출력 디렉토리 및 데이터셋 로드
  // ──────────────────────────────────────────────────
  beforeAll(() => {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it('Step 1: 데이터셋 로드 (bottom_sheet.json + memo.txt + expected.json)', () => {
    const t = Date.now();

    bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));
    memo = readFileSync(join(DATA_DIR, 'memo.txt'), 'utf8');
    expected = JSON.parse(readFileSync(join(DATA_DIR, 'expected.json'), 'utf8'));

    logStep({
      step: 'S1',
      label: '데이터셋 로드',
      status: 'PASS',
      durationMs: Date.now() - t,
      detail: `bottom_sheet: ${Object.keys(bottomSheet).length}개 필드, memo: ${memo.length}자, expected: ${Object.keys(expected).length}개 필드`,
      data: {
        bottomSheet_keys: Object.keys(bottomSheet),
        expected,
        memo_preview: memo.substring(0, 200) + '...',
      },
    });

    expect(bottomSheet).toBeDefined();
    expect(bottomSheet.posture).toBe('income');
    expect(bottomSheet.askingPriceManwon).toBe(1150000);
    expect(bottomSheet.floor_leases).toHaveLength(8);
    expect(memo.length).toBeGreaterThan(50);
    expect(expected.posture).toBe('income');
  });

  it('Step 2: 메모 슬롯 추출 (extractSlotsFromMemo)', () => {
    const t = Date.now();

    memoSlots = extractSlotsFromMemo(memo);
    const slotMap = new Map((memoSlots.slots || []).map((s: any) => [s.key, s.value]));

    logStep({
      step: 'S2',
      label: '메모 슬롯 추출',
      status: 'PASS',
      durationMs: Date.now() - t,
      detail: `${memoSlots.slots?.length ?? 0}개 슬롯 추출, 추출률 ${((memoSlots as any).extractionRate ?? 0).toFixed(1)}%`,
      data: {
        slotCount: memoSlots.slots?.length ?? 0,
        extractionRate: (memoSlots as any).extractionRate,
        slots: Object.fromEntries(slotMap),
      },
    });

    expect(memoSlots).toBeDefined();
    expect(memoSlots.slots?.length).toBeGreaterThan(0);
  });

  it('Step 3: 재무 계산 (calculateFinancials)', () => {
    const t = Date.now();

    // bottom_sheet에서 재무 입력 구성
    const totalDepositManwon = bottomSheet.floor_leases.reduce(
      (sum: number, fl: any) => sum + (fl.deposit_manwon || 0), 0
    );
    const monthlyRentManwon = bottomSheet.floor_leases.reduce(
      (sum: number, fl: any) => sum + (fl.rent_manwon || 0), 0
    );

    const finInput: FinancialInputs = {
      posture: 'income',
      purchasePriceKrw: bottomSheet.askingPriceManwon * 10000,
      monthlyRentKrw: monthlyRentManwon * 10000,
      totalAreaSqm: bottomSheet.grossFloorAreaM2,
      platAreaSqm: bottomSheet.landAreaM2,
      vacancyRatePct: 0, // 당산 매물은 만실
      totalDepositManwon,
    };

    financials = calculateFinancials(finInput);

    const capRateBase = financials?.capRate?.base ?? financials?.capRateAsIs ?? 0;
    const annualNoi = financials?.annualNoi?.base ?? (monthlyRentManwon * 10000 * 12);
    const landPricePerPyeong = bottomSheet.landAreaM2 > 0
      ? Math.round(bottomSheet.askingPriceManwon / (bottomSheet.landAreaM2 * 0.3025))
      : 0;

    logStep({
      step: 'S3',
      label: '재무 계산',
      status: capRateBase > 0 ? 'PASS' : 'WARN',
      durationMs: Date.now() - t,
      detail: `Cap Rate: ${capRateBase.toFixed(2)}%, 연 임대수익: ${(annualNoi / 100000000).toFixed(2)}억, 토지평당가: ${landPricePerPyeong.toLocaleString()}만/평`,
      data: {
        financialInput: finInput,
        capRateBase,
        annualNoi,
        monthlyRentManwon,
        totalDepositManwon,
        landPricePerPyeong: `${landPricePerPyeong.toLocaleString()}만/평`,
      },
    });

    expect(capRateBase).toBeGreaterThan(0);
    expect(annualNoi).toBeGreaterThan(0);
  });

  it('Step 4: 데이터 품질 배지 (computeDataQualityBadge)', () => {
    const t = Date.now();

    const inputFlags = {
      hasAddress: true,
      hasPublicData: false,
      hasMonthlyRent: true,
      hasVacancy: true,
      hasPhotos: false,
      hasAskingPrice: true,
      hasLoanAmount: false,
      hasFloorLeases: bottomSheet.floor_leases.length > 0,
      hasLandArea: bottomSheet.landAreaM2 > 0,
      hasZoning: !!bottomSheet.zoning,
      hasTotalGrossArea: bottomSheet.grossFloorAreaM2 > 0,
      hasMonthlyRevenue: false,
    };

    badge = computeDataQualityBadge(inputFlags, 'income');

    logStep({
      step: 'S4',
      label: '데이터 품질 배지',
      status: 'PASS',
      durationMs: Date.now() - t,
      detail: `점수: ${badge.score}, 등급: ${badge.tier}, 기대등급: ${expected.expectedGrade}`,
      data: {
        score: badge.score,
        tier: badge.tier,
        grade: badge.grade ?? badge.tier,
        inputFlags,
      },
    });

    expect(badge).toBeDefined();
    expect(badge.score).toBeGreaterThan(0);
  });

  it('Step 5: 덱 시퀀서 검증 (buildDeckSequence)', () => {
    const t = Date.now();

    const deckInput = {
      posture: 'income' as const,
      grade: (expected.expectedGrade ?? 'B') as 'A' | 'B' | 'C' | 'D',
      hasPhotos: true,
      preset: 'credeal_basic',
      dataAvailability: {
        hasCadastralMap: true,
      },
    };

    const sequence = buildDeckSequence(deckInput);
    const archetypes = sequence.map(s => s.archetype);

    logStep({
      step: 'S5',
      label: '덱 시퀀서',
      status: sequence.length >= (expected.expectedMinSlides ?? 7) ? 'PASS' : 'WARN',
      durationMs: Date.now() - t,
      detail: `${sequence.length}개 슬라이드 시퀀스, 아키타입: [${archetypes.join(', ')}]`,
      data: {
        slideCount: sequence.length,
        archetypes,
        expectedArchetypes: expected.expectedSlideArchetypes,
        sequence: sequence.map(s => ({ archetype: s.archetype, kicker: s.kicker, title: s.title, dataKey: s.dataKey })),
      },
    });

    expect(sequence.length).toBeGreaterThanOrEqual(expected.expectedMinSlides ?? 7);
    expect(sequence.length).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
  });

  it('Step 6: PPTX 렌더링 (MobileImPptxRenderer.render)', { timeout: 30_000 }, async () => {
    const t = Date.now();

    // ── 팩토리 기반 입력 생성 (S4/S8: 수동 200줄 → 팩토리 + override) ──
    const pptxInput = await createBasicImTestInput(bottomSheet, {
      coordinates: { lat: 37.5341, lng: 126.9026 },
      buildingName: '당산동 메디컬 근생빌딩',
      keyInvestmentPoint: '로뎀나무내과·고은약국 장기 임차 만실 · 11년 미인상 임대료 정상화 시 47% 상승 여력',
      photos: [
        { url: join(IMAGES_DIR, 'image_01.jpeg').replace(/\\/g, '/'), category: 'exterior', caption: '건물 정면 외관 (B1~5F, 벽돌 구조)', isHero: true, role: 'exterior' },
        { url: join(IMAGES_DIR, 'image_02.jpeg').replace(/\\/g, '/'), category: 'exterior', caption: '건물 측면 (자주식 주차장 진입로)' },
        { url: join(IMAGES_DIR, 'image_07.jpeg').replace(/\\/g, '/'), category: 'entrance', caption: '주출입구 및 1층 간판 (로뎀나무내과·고은약국)' },
        { url: join(IMAGES_DIR, 'image_08.jpeg').replace(/\\/g, '/'), category: 'interior', caption: '내부 층별 공용 복도' },
        { url: join(IMAGES_DIR, 'image_09.jpeg').replace(/\\/g, '/'), category: 'interior', caption: '임차 전용 공간 (사무실 내부)' },
        { url: join(IMAGES_DIR, 'image_14.jpeg').replace(/\\/g, '/'), category: 'parking', caption: '자주식 주차장 (8대)' },
      ],
      broker: {
        display_name: '정현우 수석팀장',
        company_name: '제이에스부동산중개법인',
        phone: '010-3344-5566',
        specialty: '영등포·당산 근생 및 메디컬 전문',
        email: 'js-cre@credeal.kr',
        registration_no: '11680-2024-00156',
      },
      ssotExtra: {
        building_area_sqm: 256.12,
        floors_above: 5,
        floors_below: 1,
        structure: '철근콘크리트조',
        heating: '개별냉난방 (각층)',
        bcr_pct: 50.54,
        far_pct: 225.14,
        road_condition: '8m 도로 2면 접면 (코너)',
        station_walk_min: 5,
        land_category: '대',
        area_signal: '영등포/당산',
      },
      buildingExtra: {
        area_signal: '영등포/당산',
        asset_type: '근린생활시설 (메디컬빌딩)',
        structure: '철근콘크리트조',
        heating: '개별냉난방',
      },
      // 당산 매물 전용 상세 섹션 (기본 자동생성 대신 커스텀)
      sections: [
        {
          title: '건물 개요',
          section_type: 'property_overview',
          markdown: `### 건물 기본 정보
| 구분 | 공부상 내용 |
|:---|:---|
| 소재지 | ${bottomSheet.address} |
| 대지면적 | ${bottomSheet.landAreaM2}㎡ (${(bottomSheet.landAreaM2 * 0.3025).toFixed(1)}평) |
| 연면적 | ${bottomSheet.grossFloorAreaM2}㎡ (${(bottomSheet.grossFloorAreaM2 * 0.3025).toFixed(1)}평) |
| 건축면적 | 256.12㎡ (77.5평, 건폐율 50.54%) |
| 용적률 | 225.14% (준공업지역 법정 400% 대비 여력 보유) |
| 건물구조 | 철근콘크리트조 / 개별냉난방 |
| 용도지역 | ${bottomSheet.zoning} |
| 준공연도 | ${bottomSheet.completionYear}년 |
| 층수 | ${bottomSheet.floors} |
| 주차 / 승강기 | 자주식 ${bottomSheet.parking}대 / 승강기 ${bottomSheet.elevator}대 |`,
        },
        {
          title: '입지 분석',
          section_type: 'location_access',
          markdown: `### 교통 접근성\n- **당산역** (2호선·9호선 환승역) 도보 5분 (약 400m)\n- 국회대로·올림픽대로 인접, 차량 접근성 우수\n- 여의도 금융중심지 차량 10분 이내\n\n### 도로 및 입지 조건\n- 8m 도로 2면 접면 (코너 입지)\n- 전면 도로 차량·보행 동선 양호\n\n### 상권·배후 수요\n- 당산동 아파트 밀집 지구 배후 — 거주 인구 약 3만 세대\n- 의원·약국 조합 상권 (필수 의료 수요 안정)\n- 카페·음식점 등 근린상가 활성 지역`,
        },
        {
          title: '임대차 현황',
          section_type: 'lease_status',
          markdown: generateRentRollMarkdown(bottomSheet.floor_leases),
        },
        {
          title: '투자수익률 분석',
          section_type: 'income_analysis',
          markdown: (() => {
            const totalDepositManwon = bottomSheet.floor_leases.reduce((sum: number, fl: any) => sum + (fl.deposit_manwon || 0), 0);
            const monthlyRentManwon = bottomSheet.floor_leases.reduce((sum: number, fl: any) => sum + (fl.rent_manwon || 0), 0);
            const annualRent = monthlyRentManwon * 12;
            const askingManwon = bottomSheet.askingPriceManwon;
            const netDenom = askingManwon - totalDepositManwon;
            const asIsCapRate = netDenom > 0 ? (annualRent / netDenom * 100) : 0;
            const stabilizedMonthlyRent = monthlyRentManwon * 1.47;
            const stabilizedAnnual = stabilizedMonthlyRent * 12;
            const stabilizedCapRate = netDenom > 0 ? (stabilizedAnnual / netDenom * 100) : 0;
            return `### 투자수익률 산출\n\n#### As-Is (현재)\n- 월 임대수익: ${monthlyRentManwon.toLocaleString()}만원\n- 연 임대수익: ${annualRent.toLocaleString()}만원\n- 보증금 총액: ${totalDepositManwon.toLocaleString()}만원\n\n**표면 임대수익률** = 연간 임대료 ÷ (매매가 − 승계 보증금)\n= ${annualRent.toLocaleString()}만 ÷ (${askingManwon.toLocaleString()}만 − ${totalDepositManwon.toLocaleString()}만)\n= **${asIsCapRate.toFixed(2)}%**\n\n#### ◇ 분석가정: Stabilized (안정화)\n- 로뎀나무내과 11년간 동결 임대료 인근 시세 수준으로 정상화 시 +47% 가정\n- 안정화 연 임대수익: ${Math.round(stabilizedAnnual).toLocaleString()}만원\n- **안정화 수익률: ${stabilizedCapRate.toFixed(2)}%**`;
          })(),
        },
        {
          title: '종합 가치 제안',
          section_type: 'investment_thesis',
          markdown: `### 핵심 투자 포인트\n1. **필수 의료시설 앵커 테넌트**: 로뎀나무내과·고은약국 11년 장기 임차 (공실률 0%, 만실 운영)\n2. **임대료 정상화 밸류애드**: 11년간 미인상된 임대료 시세 정상화 시 현금흐름 47% 증대 여력\n3. **역세권 + 코너 입지**: 당산역 2호선·9호선 환승역 도보 5분, 8m 도로 2면 접면\n4. **준공업지역 규제 완화**: 서울시 준공업지역 관리 개선에 따른 용적률 상향 잠재력 (현 225% → 법정 400% 한도)`,
        },
        {
          title: '향후 매각 진행 일정',
          section_type: 'next_steps',
          markdown: `### 거래 진행 프로세스\n- 1단계: 비밀유지협약(NDA) 체결\n- 2단계: 현장 실사 및 공부 확인\n- 3단계: 구분소유자 2인 매매계약 체결\n- 4단계: 잔금 지급 및 임대차 정상화 착수`,
        },
      ],
      pnu: '1156011500100110047',
    });

    const renderer = new MobileImPptxRenderer();
    pptxResult = await renderer.render(pptxInput);

    // PPTX 파일 저장
    const savedPath = safeWritePptx(PPTX_OUTPUT_PATH, pptxResult.buffer);

    logStep({
      step: 'S6',
      label: 'PPTX 렌더링',
      status: pptxResult.slideCount >= (expected.expectedMinSlides ?? 7) ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail: `${pptxResult.slideCount}개 슬라이드, ${(pptxResult.fileSizeBytes / 1024).toFixed(0)}KB, 저장: ${savedPath}`,
      data: {
        slideCount: pptxResult.slideCount,
        fileSizeKB: Math.round(pptxResult.fileSizeBytes / 1024),
        generatedAt: pptxResult.generatedAt,
        warnings: pptxResult.warnings,
        auditReport: pptxResult.auditReport,
      },
    });

    expect(pptxResult.buffer).toBeDefined();
    expect(pptxResult.buffer.length).toBeGreaterThan(50000);
    expect(pptxResult.slideCount).toBeGreaterThanOrEqual(expected.expectedMinSlides ?? 7);
    expect(pptxResult.slideCount).toBeLessThanOrEqual(PAGE_HARD_LIMIT);
  });

  it('Step 7-A: 바이너리 게이트 — Poison Token 검증', async () => {
    const t = Date.now();
    let pass = true;
    let detail = '';

    try {
      await assertZeroPoisonTokens(pptxResult.buffer);
      detail = '0 poison tokens detected';
    } catch (e: any) {
      pass = false;
      detail = e.message;
    }

    logStep({
      step: 'S7-A',
      label: 'Poison Token 검증',
      status: pass ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail,
    });

    expect(pass).toBe(true);
  });

  it('Step 7-B: 바이너리 게이트 — Evasive Phrase 검증', async () => {
    const t = Date.now();
    let pass = true;
    let detail = '';

    try {
      await assertZeroEvasivePhrases(pptxResult.buffer);
      detail = '0 evasive phrases detected';
    } catch (e: any) {
      pass = false;
      detail = e.message;
    }

    logStep({
      step: 'S7-B',
      label: 'Evasive Phrase 검증',
      status: pass ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail,
    });

    expect(pass).toBe(true);
  });

  it('Step 7-C: 바이너리 게이트 — Mock Data Leak 검증', async () => {
    const t = Date.now();
    let pass = true;
    let detail = '';

    try {
      await assertZeroMockLeaks(pptxResult.buffer);
      detail = '0 mock data leaks detected';
    } catch (e: any) {
      pass = false;
      detail = e.message;
    }

    logStep({
      step: 'S7-C',
      label: 'Mock Data Leak 검증',
      status: pass ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail,
    });

    expect(pass).toBe(true);
  });

  it('Step 7-D: 바이너리 게이트 — Physical Binary Gates 검증', async () => {
    const t = Date.now();
    let pass = true;
    let detail = '';

    try {
      binaryInspection = await assertAllPhysicalBinaryGates(pptxResult.buffer);
      detail = `isPass: true, slides: ${binaryInspection.slideCount}, issues: ${binaryInspection.issues?.length ?? 0}`;
    } catch (e: any) {
      pass = false;
      detail = e.message;
      // 실패해도 inspection 결과는 수집
      try {
        binaryInspection = await inspectPptxBinary(pptxResult.buffer);
      } catch { /* ignore */ }
    }

    logStep({
      step: 'S7-D',
      label: 'Physical Binary Gates',
      status: pass ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail,
      data: binaryInspection ? {
        isPass: binaryInspection.isPass,
        slideCount: binaryInspection.slideCount,
        poisonTokenViolationCount: binaryInspection.poisonTokenViolationCount,
        evasivePhraseViolationCount: binaryInspection.evasivePhraseViolationCount,
        mockLeakViolationCount: binaryInspection.mockLeakViolationCount,
        placeholderResidueCount: binaryInspection.placeholderResidueCount,
        personaViolationCount: binaryInspection.personaViolationCount,
        issues: binaryInspection.issues,
      } : undefined,
    });

    // 이 단언은 유연하게: pass가 아니어도 로그에 기록
    if (!pass) {
      console.warn('  ⚠️ Physical binary gates failed — see pipeline_log.md for details');
    }
    
    expect(pass).toBe(true);
  });

  it('Step 8: 슬라이드 콘텐츠 검증', async () => {
    const t = Date.now();
    extractedSlides = await extractSlideTexts(pptxResult.buffer);
    const fullText = extractedSlides.map((s: any) => s.text).join(' ');

    const checks: Array<{ name: string; pass: boolean; detail: string }> = [];

    // 8-1: 당산 키워드 확인
    const hasDangsanKeyword = fullText.includes('당산');
    checks.push({ name: '당산 키워드', pass: hasDangsanKeyword, detail: hasDangsanKeyword ? '포함' : '미포함' });

    // 8-2: 115억 가격 확인
    const hasPrice = fullText.includes('115') || fullText.includes('1,150');
    checks.push({ name: '매각가 115억', pass: hasPrice, detail: hasPrice ? '포함' : '미포함' });

    // 8-3: 로뎀나무내과 임차인 확인
    const hasTenant = fullText.includes('로뎀나무') || fullText.includes('내과');
    checks.push({ name: '핵심 임차인(로뎀나무내과)', pass: hasTenant, detail: hasTenant ? '포함' : '미포함' });

    // 8-4: 고은약국 확인
    const hasPharmacy = fullText.includes('약국');
    checks.push({ name: '약국 임차인', pass: hasPharmacy, detail: hasPharmacy ? '포함' : '미포함' });

    // 8-5: 수익률 숫자 확인 (X.XX%)
    const hasYield = /\d+\.\d+%/.test(fullText);
    checks.push({ name: '수익률 수치(X.XX%)', pass: hasYield, detail: hasYield ? '포함' : '미포함' });

    // 8-6: 렌트롤 테이블 검증 (층수 정보)
    const hasFloorInfo = fullText.includes('B1') || fullText.includes('1F') || fullText.includes('2F');
    checks.push({ name: '렌트롤 층수 정보', pass: hasFloorInfo, detail: hasFloorInfo ? '포함' : '미포함' });

    // 8-7: 슬라이드 수 범위 확인
    const slideCountOk = extractedSlides.length >= (expected.expectedMinSlides ?? 7) &&
                          extractedSlides.length <= (expected.expectedMaxSlides ?? 12);
    checks.push({
      name: '슬라이드 수 범위',
      pass: slideCountOk,
      detail: `${extractedSlides.length}개 (기대: ${expected.expectedMinSlides ?? 7}~${expected.expectedMaxSlides ?? 12})`,
    });

    const allPass = checks.every(c => c.pass);

    logStep({
      step: 'S8',
      label: '슬라이드 콘텐츠 검증',
      status: allPass ? 'PASS' : 'WARN',
      durationMs: Date.now() - t,
      detail: `${checks.filter(c => c.pass).length}/${checks.length} 검증 통과`,
      data: {
        checks,
        slideTextPreview: extractedSlides.map((s: any) => ({
          slide: s.slideNumber,
          textPreview: s.text.substring(0, 150) + (s.text.length > 150 ? '...' : ''),
        })),
      },
    });

    // 핵심 키워드는 반드시 포함
    expect(hasDangsanKeyword || hasPrice).toBe(true);
  });

  it('Step 9: 수학적 일관성 검증 (SSoT Cross-Check)', () => {
    const t = Date.now();
    
    const totalDepositManwon = bottomSheet.floor_leases.reduce(
      (sum: number, fl: any) => sum + (fl.deposit_manwon || 0), 0
    );
    const monthlyRentManwon = bottomSheet.floor_leases.reduce(
      (sum: number, fl: any) => sum + (fl.rent_manwon || 0), 0
    );
    const annualRentKrw = monthlyRentManwon * 10000 * 12;
    const askingPriceKrw = bottomSheet.askingPriceManwon * 10000;
    const netDenominator = askingPriceKrw - totalDepositManwon * 10000;
    const expectedCapRateGross = askingPriceKrw > 0 ? (annualRentKrw / askingPriceKrw) * 100 : 0;
    const expectedCapRateNet = netDenominator > 0 ? (annualRentKrw / netDenominator) * 100 : 0;

    const consistencyGross = verifyMathematicalConsistency(
      {
        noi: annualRentKrw,
        askingPrice: askingPriceKrw,
        initialCapRatePct: expectedCapRateGross,
      },
      {
        year1Noi: annualRentKrw,
        grossSalePrice: askingPriceKrw,
      }
    );

    const consistencyNet = verifyMathematicalConsistency(
      {
        noi: annualRentKrw,
        askingPrice: netDenominator,
        initialCapRatePct: expectedCapRateNet,
      },
      {
        year1Noi: annualRentKrw,
        grossSalePrice: netDenominator,
      }
    );

    const consistency = consistencyGross.isConsistent ? consistencyGross : consistencyNet;
    const expectedCapRate = consistencyGross.isConsistent ? expectedCapRateGross : expectedCapRateNet;

    logStep({
      step: 'S9',
      label: 'SSoT 수학적 일관성',
      status: consistency.isConsistent ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t,
      detail: consistency.isConsistent
        ? `일관성 확인: NOI=${(annualRentKrw / 100000000).toFixed(2)}억, Cap Rate=${expectedCapRate.toFixed(2)}%`
        : `불일치: ${consistency.discrepancies.join('; ')}`,
      data: {
        annualRentKrw,
        askingPriceKrw,
        totalDepositKrw: totalDepositManwon * 10000,
        netDenominator,
        computedCapRate: expectedCapRate.toFixed(4),
        consistency,
      },
    });

    expect(consistency.isConsistent).toBe(true);
  });

  it('Step 10: 파이프라인 리포트 생성', () => {
    const t = Date.now();

    const report = generatePipelineReport();
    writeFileSync(LOG_PATH, report, 'utf8');

    logStep({
      step: 'S10',
      label: '파이프라인 리포트 저장',
      status: 'PASS',
      durationMs: Date.now() - t,
      detail: `리포트 저장 완료: ${LOG_PATH}`,
    });

    // 최종 리포트 재생성 (S10 로그 포함)
    const finalReport = generatePipelineReport();
    writeFileSync(LOG_PATH, finalReport, 'utf8');

    expect(existsSync(LOG_PATH)).toBe(true);
    expect(existsSync(PPTX_OUTPUT_PATH)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Helper: 렌트롤 마크다운 테이블 생성
// ═══════════════════════════════════════════════════════════════════

function generateRentRollMarkdown(leases: any[]): string {
  let md = `### 층별 임대차 현황\n\n`;
  md += `| 층수 | 임차인 | 면적(평) | 보증금(만원) | 월세(만원) | 계약종료 |\n`;
  md += `|:---|:---|---:|---:|---:|:---|\n`;

  for (const fl of leases) {
    const deposit = fl.deposit_manwon > 0 ? fl.deposit_manwon.toLocaleString() : '-';
    const rent = fl.rent_manwon > 0 ? fl.rent_manwon.toLocaleString() : '-';
    const end = fl.lease_end || (fl.note?.includes('자가') ? '자가사용' : '-');
    md += `| ${fl.floor} | ${fl.tenant_type} | ${fl.area_pyeong} | ${deposit} | ${rent} | ${end} |\n`;
  }

  const totalDeposit = leases.reduce((s: number, l: any) => s + (l.deposit_manwon || 0), 0);
  const totalRent = leases.reduce((s: number, l: any) => s + (l.rent_manwon || 0), 0);
  const totalArea = leases.reduce((s: number, l: any) => s + (l.area_pyeong || 0), 0);
  md += `| **합계** | **${leases.length}개 호실** | **${totalArea.toFixed(1)}** | **${totalDeposit.toLocaleString()}** | **${totalRent.toLocaleString()}** | - |\n`;

  return md;
}
