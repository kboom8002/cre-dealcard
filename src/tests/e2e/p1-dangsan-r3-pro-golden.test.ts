/**
 * @file p1-dangsan-r3-pro-golden.test.ts
 * @description P1 당산 수익형 매물 — R3-Verified 데이터셋 기반 프로덕션 전구간 골든 테스트 (Pro IM)
 *
 * 사용자의 지시사항:
 * "p1-dangsan-income 매물에 대하여 r3-verified 데이터셋을 활용해서, 프러덕션 환경과 같은 파이프라인으로 
 * 골든 테스트를 통해 pptx im pro 산출물을 생성해줘. 데이터셋과 프로세스, 중간 로그를 확인할 수 있도록 
 * 모든 과정을 로그로 기록하여 md 파일로 줘. 실제 LLM 호출을 포함하여 실제 프러덕션 환경와 똑 같이 테스트해줘."
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

import { generateMobileIM } from '@/domain/building/mobile-im/writer';
import type { MobileIMWriterInput } from '@/domain/building/mobile-im/types';
import { MobileImPptxRenderer, type MobileImPptxInput } from '@/domain/building/mobile-im/pptx/pptx-renderer';
import {
  assertZeroPoisonTokens,
  assertZeroEvasivePhrases,
  assertZeroMockLeaks,
  assertAllPhysicalBinaryGates,
} from '@/assurance/im-harness/golden-test-utils';

// ═══════════════════════════════════════════════════════════════════
// Constants & Paths
// ═══════════════════════════════════════════════════════════════════

const DATA_DIR = join(process.cwd(), 'docs', 'golden-test-data', 'p1-dangsan-income', 'r3-verified');
const OUTPUT_DIR = join(process.cwd(), 'docs', 'test', 'golden-outputs', 'p1-dangsan-r3-pro');
const PPTX_OUTPUT_PATH = join(OUTPUT_DIR, 'p1_dangsan_income_r3_pro.pptx');
const LOG_PATH = join(OUTPUT_DIR, 'pipeline_log_pro.md');

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

  let md = `# P1 당산 수익형 — R3-Verified PRO IM 골든 파이프라인 보고서\n\n`;
  md += `> **생성 시각**: ${new Date().toISOString()}\n`;
  md += `> **총 소요시간**: ${totalDuration}ms\n`;
  md += `> **결과**: ${passCount} PASS / ${failCount} FAIL / ${warnCount} WARN\n\n---\n\n`;
  
  md += `## 입력 데이터셋\n\n`;
  md += `| 항목 | 값 |\n|:---|:---|\n`;
  md += `| 데이터셋 경로 | \`${DATA_DIR}\` |\n`;
  md += `| 해상도 | R3-Verified |\n`;
  md += `| 포스처 | income (Pro IM) |\n`;
  md += `| 매각가 | 115억 |\n\n---\n\n`;

  md += `## 파이프라인 실행 로그\n\n`;
  md += `| # | 단계 | 상태 | 소요시간 | 상세 |\n|:---|:---|:---|---:|:---|\n`;
  pipelineLog.forEach((entry, idx) => {
    const icon = entry.status === 'PASS' ? '✅' : entry.status === 'FAIL' ? '❌' : entry.status === 'WARN' ? '⚠️' : 'ℹ️';
    md += `| ${idx + 1} | ${entry.step} — ${entry.label} | ${icon} ${entry.status} | ${entry.durationMs}ms | ${entry.detail} |\n`;
  });

  md += `\n---\n\n## 상세 단계별 데이터\n\n`;
  pipelineLog.forEach((entry) => {
    if (entry.data) {
      md += `### ${entry.step}: ${entry.label}\n\n\`\`\`json\n${JSON.stringify(entry.data, null, 2)}\n\`\`\`\n\n`;
    }
  });

  return md;
}

// ═══════════════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════════════

describe('P1 당산 Income R3-Verified — PRO IM 골든 파이프라인 (실제 LLM 호출)', () => {
  let bottomSheet: any;
  let writerInput: MobileIMWriterInput;
  let writerOutput: any;
  let pptxResult: any;

  beforeAll(() => {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it('Step 1: 데이터셋 로드', async () => {
    const t = Date.now();
    bottomSheet = JSON.parse(readFileSync(join(DATA_DIR, 'bottom_sheet.json'), 'utf8'));

    logStep({
      step: 'S1', label: '데이터셋 로드', status: 'PASS', durationMs: Date.now() - t,
      detail: `bottom_sheet 로드 (R3-Verified)`, data: bottomSheet
    });
    expect(bottomSheet.posture).toBe('income');
  });

  it('Step 2: Writer Input 구성', async () => {
    const t = Date.now();

    const totalDepositManwon = bottomSheet.floor_leases.reduce((sum: number, fl: any) => sum + (fl.deposit_manwon || 0), 0);
    const monthlyRentManwon = bottomSheet.floor_leases.reduce((sum: number, fl: any) => sum + (fl.rent_manwon || 0), 0);

    writerInput = {
      building_ssot_lite: {
        id: 'golden-dangsan-pro',
        address: bottomSheet.address,
        investment_posture: 'income',
        asking_price: bottomSheet.askingPriceManwon * 10000,
        price_band: '115억 원',
        total_area: bottomSheet.grossFloorAreaM2,
        plat_area: bottomSheet.landAreaM2,
        use_approval_date: bottomSheet.completionYear ? `${bottomSheet.completionYear}-01-01` : undefined,
      } as any,
      identity: {
        investmentPosture: 'income',
        assetType: 'nbhd_building',
      },
      supplemental: {
        asking_price_manwon: bottomSheet.askingPriceManwon,
        monthly_rent_total_krw: monthlyRentManwon * 10000,
        total_deposit_manwon: totalDepositManwon,
        land_area_m2: bottomSheet.landAreaM2,
        total_gross_area_m2: bottomSheet.grossFloorAreaM2,
        building_age_years: 2026 - (bottomSheet.completionYear || 2002),
        floor_leases: bottomSheet.floor_leases,
        photos_v2: bottomSheet.photos_v2,
        resolved_address: bottomSheet.address,
      },
      readiness: { score: 100, missing: [] },
      dataGrade: 'A',
      dcfEligible: true,
      external_data: {
        buildingRegister: { platArea: bottomSheet.landAreaM2, totalArea: bottomSheet.grossFloorAreaM2 },
        landUsePlan: { zoningDistrict: bottomSheet.zoning },
      }
    };

    logStep({
      step: 'S2', label: 'Writer Input 구성', status: 'PASS', durationMs: Date.now() - t,
      detail: 'MobileIMWriterInput 생성 완료', data: writerInput
    });
    expect(writerInput).toBeDefined();
  });

  it('Step 3: AI Mobile IM Generation (REAL LLM CALL)', async () => {
    const t = Date.now();
    
    // 이 단계에서 실제 LLM(claude/gpt) 호출이 발생합니다.
    writerOutput = await generateMobileIM(writerInput);

    logStep({
      step: 'S3', label: 'AI 생성 엔진 (LLM)', status: 'PASS', durationMs: Date.now() - t,
      detail: `${writerOutput.sections?.length || 0}개 섹션 생성, AI 사용 여부: ${writerOutput.ai_used}`,
      data: {
        ai_used: writerOutput.ai_used,
        sections_count: writerOutput.sections?.length,
        heroCard: writerOutput.heroCard,
        sections_preview: writerOutput.sections?.map((s: any) => ({
          type: s.section_type, title: s.title, confidence: s.confidence
        }))
      }
    });

    expect(writerOutput).toBeDefined();
    expect(writerOutput.sections).toBeDefined();
    expect(writerOutput.sections.length).toBeGreaterThan(0);
  }, 120000); // LLM 호출을 위해 타임아웃 2분 설정

  it('Step 4: PRO IM PPTX 렌더링', async () => {
    const t = Date.now();

    const pptxInput: MobileImPptxInput = {
      buildingId: 'p1-dangsan-r3-pro',
      preset: 'institutional_dark_gold',
      posture: 'income',
      grade: 'A',
      isPro: true, // PRO IM 생성을 결정짓는 핵심 플래그
      doc: {
        title: '당산동5가 근생빌딩 매각 제안서',
        body: {
          investment_posture: 'income',
          heroCard: writerOutput.heroCard,
          financials: writerOutput.financials,
          photos: writerOutput.photos,
          floor_leases: bottomSheet.floor_leases,
          ssot_summary: {
            address: bottomSheet.address,
            asking_price: bottomSheet.askingPriceManwon * 10000,
            asking_price_manwon: bottomSheet.askingPriceManwon,
            total_deposit_manwon: writerInput.supplemental.total_deposit_manwon,
            monthly_rent_total_krw: writerInput.supplemental.monthly_rent_total_krw,
            land_area_sqm: bottomSheet.landAreaM2,
            total_gross_area_sqm: bottomSheet.grossFloorAreaM2,
            completion_year: bottomSheet.completionYear,
            zoning: bottomSheet.zoning,
            price_band: `${Math.round(bottomSheet.askingPriceManwon / 10000)}억 원`,
            floors_above: 5,
            floors_below: 1,
            parking_count: bottomSheet.parking,
            elevator_count: bottomSheet.elevator,
          },
          stackingPlan: bottomSheet.floor_leases?.map((fl: any) => ({
            floor: fl.floor,
            tenant: fl.tenant_type,
            area: fl.area_pyeong + '평',
            status: fl.is_vacant ? '공실' : '임대완료'
          }))
        },
        sections: writerOutput.sections,
      },
      building: {
        area_signal: '영등포/당산',
        asset_type: '근린생활시설',
      },
      broker: {
        display_name: '크리딜 파트너스',
        company_name: '크리딜 파트너스 부동산중개법인',
      }
    };

    const renderer = new MobileImPptxRenderer();
    pptxResult = await renderer.render(pptxInput);

    writeFileSync(PPTX_OUTPUT_PATH, pptxResult.buffer);

    logStep({
      step: 'S4', label: 'PRO PPTX 렌더링', status: 'PASS', durationMs: Date.now() - t,
      detail: `${pptxResult.slideCount}개 슬라이드, ${(pptxResult.fileSizeBytes / 1024).toFixed(0)}KB, 저장 완료`,
      data: { slideCount: pptxResult.slideCount, fileSizeBytes: pptxResult.fileSizeBytes, warnings: pptxResult.warnings }
    });

    expect(pptxResult.buffer).toBeDefined();
    expect(pptxResult.slideCount).toBeGreaterThanOrEqual(30); // Pro IM은 30장 이상이어야 함
    expect(pptxResult.slideCount).toBeLessThanOrEqual(45);
  }, 30000);

  it('Step 5: 바이너리 품질 게이트 (Poison/Evasive/Mock/Physical)', async () => {
    const t = Date.now();
    let gatesPass = true;
    const details = [];

    try { await assertZeroPoisonTokens(pptxResult.buffer); details.push('PoisonTokens: OK'); } catch (e: any) { gatesPass = false; details.push(`PoisonTokens: FAIL (${e.message})`); }
    try { await assertZeroEvasivePhrases(pptxResult.buffer); details.push('EvasivePhrases: OK'); } catch (e: any) { gatesPass = false; details.push(`EvasivePhrases: FAIL (${e.message})`); }
    try { await assertZeroMockLeaks(pptxResult.buffer); details.push('MockLeaks: OK'); } catch (e: any) { gatesPass = false; details.push(`MockLeaks: FAIL (${e.message})`); }
    
    let binaryInspection;
    try { 
      binaryInspection = await assertAllPhysicalBinaryGates(pptxResult.buffer); 
      details.push('PhysicalGates: OK'); 
    } catch (e: any) { 
      gatesPass = false; 
      details.push(`PhysicalGates: FAIL (${e.message})`); 
    }

    logStep({
      step: 'S5', label: '바이너리 품질 게이트', status: gatesPass ? 'PASS' : 'FAIL', durationMs: Date.now() - t,
      detail: details.join(', '),
      data: binaryInspection
    });

    expect(gatesPass).toBe(true);
  });

  it('Step 6: 리포트 생성', async () => {
    const report = generatePipelineReport();
    writeFileSync(LOG_PATH, report, 'utf8');
    expect(existsSync(LOG_PATH)).toBe(true);
  });
});
