/**
 * @file bench-generation-time.ts
 * @description IM 생성 성능 및 타임 버짓 실측 벤치마크 (GENERATION_PERF_SPEC.md, S0-3)
 * 5종 포스처별 위상 정렬 4단계 병렬 실행 시간, p50, p95 계측
 */

import { generateMobileIM } from '../src/domain/building/mobile-im/writer';
import type { MobileIMWriterInput } from '../src/domain/building/mobile-im/types';
import type { InvestmentPosture } from '../src/domain/ontology';

interface BenchmarkDeal {
  name: string;
  posture: InvestmentPosture;
  input: MobileIMWriterInput;
}

function createMockDeal(name: string, posture: InvestmentPosture): BenchmarkDeal {
  return {
    name,
    posture,
    input: {
      building_ssot_lite: {
        id: `bench-deal-${posture}`,
        area_signal: '강남권역',
        asset_type: '근린생활시설',
        price_band: '120억대',
        building_use: '제2종근린생활시설',
        investment_posture: posture,
      },
      supplemental: {
        monthly_rent_total_krw: 45_000_000,
        total_deposit_manwon: 50_000,
        asking_price_manwon: 1_200_000,  // 120억 = 1,200,000만원
        mgmt_fee_total_manwon: 300,
        vacancy_pct: 0,
      },
      external_data: {
        buildingRegister: {
          platArea: 450,
          totalArea: 1800,
          archArea: 250,
          mainPurpose: '제2종근린생활시설',
          useAprDay: '20180512',
          floorsAbove: 6,
          floorsBelow: 1,
        },
        landUsePlan: {
          zoningDistrict: '제3종일반주거지역',
        },
        landPrice: {
          pricePerSqm: 28_000_000,
        },
      },
      readiness: {
        score: 85,
        missing: [],
      },
      dcfEligible: true,
      dataGrade: 'A',
    },
  };
}

async function runBenchmark() {
  console.log('=== CREDEAL IM Generation Performance Benchmark (S0-3) ===\n');

  const postures: InvestmentPosture[] = [
    'income',
    'owner_occupied',
    'development',
    'operating',
    'trading',
  ];

  const results: Array<{
    name: string;
    posture: InvestmentPosture;
    durationMs: number;
    sectionCount: number;
    aiUsed: boolean;
    publishBlocked: boolean;
  }> = [];

  for (const p of postures) {
    const deal = createMockDeal(`Deal-${p}`, p);
    console.log(`[Bench] Running posture: ${p} ...`);
    const start = Date.now();
    try {
      const output = await generateMobileIM(deal.input);
      const durationMs = Date.now() - start;
      results.push({
        name: deal.name,
        posture: p,
        durationMs,
        sectionCount: output.sections.length,
        aiUsed: output.ai_used,
        publishBlocked: output.publishBlocked ?? false,
      });
      console.log(`  ✓ Completed in ${(durationMs / 1000).toFixed(2)}s (${output.sections.length} sections)\n`);
    } catch (err) {
      const durationMs = Date.now() - start;
      console.error(`  ✗ Failed after ${(durationMs / 1000).toFixed(2)}s:`, err);
    }
  }

  // 통계 계산
  const durations = results.map(r => r.durationMs).sort((a, b) => a - b);
  if (durations.length > 0) {
    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const p50Ms = durations[Math.floor(durations.length * 0.5)];
    const p95Ms = durations[Math.floor(durations.length * 0.95)];

    console.log('=== Performance Summary ===');
    console.log(`Total Runs: ${results.length}`);
    console.log(`Average Latency: ${(avgMs / 1000).toFixed(2)}s`);
    console.log(`p50 Latency: ${(p50Ms / 1000).toFixed(2)}s`);
    console.log(`p95 Latency: ${(p95Ms / 1000).toFixed(2)}s`);
    console.log(`Target p95 limit: 90.00s — ${p95Ms <= 90_000 ? 'PASS ✓' : 'FAIL ✗'}`);
    console.log(`Absolute limit: 120.00s — ${p95Ms <= 120_000 ? 'PASS ✓' : 'FAIL ✗'}`);
  }
}

if (require.main === module) {
  runBenchmark().catch(console.error);
}

export { runBenchmark };
