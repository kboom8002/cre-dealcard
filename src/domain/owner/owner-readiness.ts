/**
 * Domain service: owner readiness
 *
 * Calculates readiness score from checklist, determines available outputs,
 * lists missing data, and persists owner_readiness_check.
 * No AI needed — deterministic score calculation per docs/02-mvp-scope.md section 5.6.
 *
 * Source: docs/08-api-contracts.md section 11
 */
import { createServiceClient } from "@/lib/supabase/service";
import { recordEvent } from "@/domain/analytics/record-event";

export interface ReadinessChecklist {
  buildingRegister: boolean;
  registry: boolean;
  landUsePlan: boolean;
  rentRoll: boolean;
  photos: boolean;
  floorPlan: boolean;
  repairHistory: boolean;
  vacancyStatus: boolean;
  askingPrice: boolean;
  disclosurePolicy: boolean;
}

export interface OwnerReadinessResult {
  readinessCheckId: string;
  readinessScore: number;
  readinessState: string;
  availableOutputs: string[];
  missingData: string[];
  nextRecommendedAction: string;
}

// Weighted scoring: each item contributes specific points toward 100
const CHECKLIST_WEIGHTS: Record<keyof ReadinessChecklist, number> = {
  buildingRegister: 15,  // 건물 등기부등본
  registry: 10,          // 공부자료 (대장)
  landUsePlan: 10,       // 토지이용계획확인원
  rentRoll: 20,          // 임대차 현황 (임대료 요약)
  photos: 10,            // 건물 사진
  floorPlan: 10,         // 평면도
  repairHistory: 5,      // 수선 이력
  vacancyStatus: 10,     // 공실 현황
  askingPrice: 5,        // 희망 매각가
  disclosurePolicy: 5,   // 공개 범위 결정
};

const CHECKLIST_LABELS: Record<keyof ReadinessChecklist, string> = {
  buildingRegister: "건물 등기부등본",
  registry: "건물 공부 자료 (건축물대장)",
  landUsePlan: "토지이용계획확인원",
  rentRoll: "임대차 현황 요약표",
  photos: "건물 사진",
  floorPlan: "평면도",
  repairHistory: "수선 이력",
  vacancyStatus: "공실 현황",
  askingPrice: "희망 매각가",
  disclosurePolicy: "공개 범위 결정",
};

// Readiness states based on score
// Thresholds aligned with layer-score-engine.ts (canonical source):
// ≥20=deal_curiosity, ≥40=blind_teaser, ≥60=snapshot, ≥80=im_lite, =100=full_im
function getReadinessState(score: number): string {
  if (score >= 100) return "full_im_candidate";
  if (score >= 80) return "im_lite_ready";
  if (score >= 60) return "snapshot_draft_ready";
  if (score >= 40) return "teaser_ready";
  if (score >= 20) return "public_report_only";
  return "not_ready";
}

function getAvailableOutputs(score: number): string[] {
  const outputs: string[] = ["deal_curiosity_report"];
  if (score >= 40) outputs.push("blind_teaser");
  if (score >= 60) outputs.push("building_snapshot_draft");
  if (score >= 80) outputs.push("im_lite"); // aligned with layer-score-engine
  if (score === 100) outputs.push("full_im_candidate");
  return outputs;
}

function getNextRecommendedAction(
  score: number,
  checklist: ReadinessChecklist,
): string {
  if (!checklist.buildingRegister || !checklist.registry) {
    return "건물 등기부등본과 공부 자료를 먼저 준비해주세요.";
  }
  if (!checklist.rentRoll) {
    return "임대차 현황 요약표를 준비하면 블라인드 티저 생성이 가능합니다.";
  }
  if (score < 60) {
    return "사진, 평면도를 추가하면 Snapshot 초안 작성이 가능합니다.";
  }
  if (score < 80) {
    return "수선 이력과 공실 현황을 보완하면 IM Lite 작성이 가능합니다.";
  }
  if (score < 100) {
    return "희망 매각가와 공개 범위를 결정하면 Full IM 작성이 가능합니다.";
  }
  return "전문가 검토 후 Full IM 초안 작성을 진행할 수 있습니다.";
}

export async function checkOwnerReadiness(
  checklist: ReadinessChecklist,
  buildingId: string | null,
  userId: string | null,
  iotSignal?: { floorOccupancy?: Record<string, number> | null }
): Promise<OwnerReadinessResult> {
  if (iotSignal?.floorOccupancy && !checklist.vacancyStatus) {
    checklist = { ...checklist, vacancyStatus: true };
  }
  const supabase = createServiceClient();

  // Calculate weighted score
  let score = 0;
  const missingData: string[] = [];

  for (const [key, checked] of Object.entries(checklist) as [
    keyof ReadinessChecklist,
    boolean,
  ][]) {
    if (checked) {
      score += CHECKLIST_WEIGHTS[key];
    } else {
      missingData.push(CHECKLIST_LABELS[key]);
    }
  }

  // Clamp score to 100
  score = Math.min(score, 100);

  const readinessState = getReadinessState(score);
  const availableOutputs = getAvailableOutputs(score);
  const nextRecommendedAction = getNextRecommendedAction(score, checklist);

  // Persist owner_readiness_check
  const { data: check, error } = await supabase
    .from("owner_readiness_checks")
    .insert({
      owner_id: userId,
      building_id: buildingId,
      checklist: checklist as unknown as Record<string, unknown>,
      readiness_score: score,
      available_outputs: availableOutputs,
      missing_data: missingData,
      next_recommended_action: nextRecommendedAction,
    })
    .select("id")
    .single();

  if (error || !check) {
    throw new Error(`Failed to save readiness check: ${error?.message}`);
  }

  // Log activity event
  await recordEvent(supabase, {
    actorId: userId ?? undefined,
    actorRole: userId ? "authenticated" : "anonymous",
    eventType: "owner_readiness_checked",
    entityType: "owner_readiness_check",
    entityId: check.id,
    metadata: {
      building_id: buildingId,
      score,
      readiness_state: readinessState,
      available_outputs: availableOutputs,
    },
  });

  return {
    readinessCheckId: check.id,
    readinessScore: score,
    readinessState,
    availableOutputs,
    missingData,
    nextRecommendedAction,
  };
}
