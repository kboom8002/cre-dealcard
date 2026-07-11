// src/domain/building/mobile-im/fewshot-tracker.ts
// 퓨샷 품질 피드백 루프 및 상관관계 분석 모듈

import { createServiceClient } from "@/lib/supabase/service";

export interface FewShotUsageInput {
  generationId: string;
  sectionType: string;
  goldenIdsUsed: string[];
  hardcodedUsed: boolean;
}

/**
 * 1. 퓨샷 사용 기록 작성 (비동기)
 */
export async function logFewShotUsage(input: FewShotUsageInput): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.from('im_fewshot_usage_log').insert({
      generation_id:   input.generationId,
      section_type:    input.sectionType,
      golden_ids_used: input.goldenIdsUsed,
      hardcoded_used:  input.hardcodedUsed,
    });
  } catch (err) {
    console.warn('[fewshot-tracker] Failed to log usage:', err);
  }
}

/**
 * 2. 특정 세션의 AI Judge 결과 점수 기록
 */
export async function updateFewShotResultScore(
  generationId: string,
  sectionType: string,
  score: number,
): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase
      .from('im_fewshot_usage_log')
      .update({ result_score: score })
      .eq('generation_id', generationId)
      .eq('section_type', sectionType);
  } catch (err) {
    console.warn('[fewshot-tracker] Failed to update result score:', err);
  }
}

/**
 * 3. 퓨샷 효과 및 상관관계 분석
 * 각 골든셋이 사용되었을 때 최종 결과 점수 평균을 도출합니다.
 */
export interface FewShotEffectiveness {
  goldenId: string;
  sectionType: string;
  assetType: string;
  priceBand: string;
  avgResultScore: number;
  timesUsed: number;
  effectiveness: 'high' | 'medium' | 'low';
}

export async function analyzeFewShotEffectiveness(): Promise<FewShotEffectiveness[]> {
  try {
    const supabase = createServiceClient();

    // 최근 1000건의 사용 이력 로드
    const { data: logs } = await supabase
      .from('im_fewshot_usage_log')
      .select('golden_ids_used, result_score')
      .not('result_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!logs || logs.length === 0) return [];

    // 골든셋 매칭 정보 캐싱용 로드
    const { data: goldenList } = await supabase
      .from('im_golden_sets')
      .select('id, section_type, asset_type, price_band');

    const goldenMap = new Map<string, { section_type: string; asset_type: string; price_band: string }>();
    if (goldenList) {
      goldenList.forEach(g => {
        goldenMap.set(g.id, {
          section_type: g.section_type,
          asset_type: g.asset_type,
          price_band: g.price_band,
        });
      });
    }

    // 통계 집계
    const statsMap = new Map<string, { totalScore: number; count: number }>();

    interface LogRow {
      golden_ids_used: string[];
      result_score: number;
    }

    (logs as LogRow[]).forEach(log => {
      if (!log.golden_ids_used || log.golden_ids_used.length === 0) return;
      log.golden_ids_used.forEach(id => {
        const stats = statsMap.get(id) || { totalScore: 0, count: 0 };
        stats.totalScore += Number(log.result_score);
        stats.count += 1;
        statsMap.set(id, stats);
      });
    });

    const result: FewShotEffectiveness[] = [];

    statsMap.forEach((stats, goldenId) => {
      const avg = Math.round((stats.totalScore / stats.count) * 10) / 10;
      const meta = goldenMap.get(goldenId) || { section_type: 'unknown', asset_type: 'unknown', price_band: 'unknown' };

      // 효과 기준 정의
      let effectiveness: 'high' | 'medium' | 'low' = 'medium';
      if (avg >= 4.2 && stats.count >= 3) {
        effectiveness = 'high';
      } else if (avg < 3.8) {
        effectiveness = 'low';
      }

      result.push({
        goldenId,
        sectionType: meta.section_type,
        assetType:   meta.asset_type,
        priceBand:   meta.price_band,
        avgResultScore: avg,
        timesUsed:   stats.count,
        effectiveness,
      });
    });

    return result.sort((a, b) => b.avgResultScore - a.avgResultScore);
  } catch (err) {
    console.error('[fewshot-tracker] Failed to analyze effectiveness:', err);
    return [];
  }
}

/**
 * 4. 자동 골든 승격 후보 검증 및 등록
 * AI Judge 점수가 4.5 이상이고 브로커가 아직 수정하지 않은 우수한 AI 생성본이 존재할 때 호출.
 * 현재 골든셋에 존재하지 않으면 auto_approve로 즉시 등록합니다.
 */
export async function promoteToGoldenCandidate(
  documentId: string,
  buildingId: string,
  assetType: string,
  priceBand: string,
  sectionType: string,
  markdown: string,
  judgeScore: number,
): Promise<boolean> {
  try {
    const supabase = createServiceClient();

    // 1. 이미 동일 문서의 골든셋이 등록되어 있는지 확인
    const { data: existing } = await supabase
      .from('im_golden_sets')
      .select('id')
      .eq('document_id', documentId)
      .eq('section_type', sectionType)
      .maybeSingle();

    if (existing) return false;

    // 2. 골든셋 등록 수행
    await supabase.from('im_golden_sets').insert({
      document_id:   documentId,
      building_id:   buildingId,
      asset_type:    assetType,
      price_band:    priceBand,
      section_type:  sectionType,
      markdown:      markdown.slice(0, 2000),
      judge_score:   judgeScore,
      was_edited:    false,
      source_type:   'auto_approve',
      version:       1,
      is_active:     true,
    });

    console.info(`[fewshot-tracker] Automatically promoted ${sectionType} of doc ${documentId} (Score: ${judgeScore})`);
    return true;
  } catch (err) {
    console.warn('[fewshot-tracker] Failed to auto-promote:', err);
    return false;
  }
}
