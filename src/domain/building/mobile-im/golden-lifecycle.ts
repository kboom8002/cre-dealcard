// src/domain/building/mobile-im/golden-lifecycle.ts
// Golden Set 라이프사이클 관리 — 퇴역 후보 감지 및 일괄 비활성화
// 품질 낮고 장기 미사용 Golden Set을 자동 퇴역시켜 few-shot 품질 유지

import { createServiceClient } from "@/lib/supabase/service";

// ─── 퇴역 기준 ───────────────────────────────────────────────────────────────

/** 퇴역 후보 조건: 90일 미사용 + 점수 3.5 미만 */
const RETIREMENT_DAYS = 90;
const RETIREMENT_SCORE_THRESHOLD = 3.5;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface RetirementCandidate {
  id: string;
  section_type: string;
  asset_type: string;
  judge_score: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  reason: string;
}

// ─── 퇴역 후보 목록 조회 ─────────────────────────────────────────────────────

/**
 * 퇴역 대상 Golden Set 후보를 조회합니다.
 * 조건: is_active=true AND (미사용 OR 90일+ 미사용) AND 점수 < 3.5
 */
export async function getRetirementCandidates(): Promise<RetirementCandidate[]> {
  const supabase = createServiceClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETIREMENT_DAYS);

  const { data } = await supabase
    .from('im_golden_sets')
    .select('id, section_type, asset_type, judge_score, usage_count, last_used_at, created_at')
    .eq('is_active', true)
    .or(`last_used_at.is.null,last_used_at.lt.${cutoffDate.toISOString()}`)
    .lt('judge_score', RETIREMENT_SCORE_THRESHOLD)
    .order('judge_score', { ascending: true });

  return (data || []).map((r) => ({
    ...r,
    reason: !r.last_used_at
      ? `미사용 + 점수 ${r.judge_score}`
      : `${RETIREMENT_DAYS}일+ 미사용 + 점수 ${r.judge_score}`,
  }));
}

// ─── 일괄 비활성화 ───────────────────────────────────────────────────────────

/**
 * 퇴역 후보 Golden Set을 일괄 비활성화합니다.
 * @returns 비활성화된 레코드 수
 */
export async function retireGoldenSets(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const supabase = createServiceClient();
  const { count } = await supabase
    .from('im_golden_sets')
    .update({ is_active: false })
    .in('id', ids);

  return count || 0;
}
