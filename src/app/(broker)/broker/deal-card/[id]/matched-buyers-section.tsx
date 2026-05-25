/**
 * MatchedBuyersSection — 딜카드 결과 화면에서 자동 매칭된 매수자 목록을 표시합니다.
 * match_results 테이블에서 해당 건물의 매칭 결과를 조회하여 S/A/B/C 등급 카드로 렌더링.
 *
 * P0-3: Matching Results UI — Professional Scorecard
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { MatchScoreCard } from "@/components/cards/MatchScoreCard";

interface MatchedBuyersSectionProps {
  buildingId: string;
}

export async function MatchedBuyersSection({
  buildingId,
}: MatchedBuyersSectionProps) {
  const supabase = createServiceClient();

  // match_results + buyer_intent_lite 조인 조회
  const { data: matches } = await supabase
    .from("match_results")
    .select(
      `id, grade, score, reasoning, stage1_passed, stage2_similarity, stage3_score, purpose_weight_profile, created_at,
       buyer_intent_lite_id,
       buyer_intent_lite (
         id, buyer_type, budget_display, preferred_regions,
         purchase_purpose, owner_id
       )`
    )
    .eq("building_ssot_lite_id", buildingId)
    .order("score", { ascending: false })
    .limit(10);

  if (!matches || matches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span>🎯</span> 자동 매칭 매수자
        </h2>
        <div className="text-center py-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            아직 매칭된 매수자가 없어요.
          </p>
          <p className="text-xs text-muted-foreground">
            매수자 조건이 등록되면 자동으로 매칭됩니다.
          </p>
          <Link
            href="/broker/buyer-intents/new"
            className="inline-flex items-center justify-center mt-2 rounded-lg bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
            id="cta-add-buyer-from-match"
          >
            🎯 매수자 조건 등록하기
          </Link>
        </div>
      </div>
    );
  }

  const gradeOrder = ["S", "A", "B", "C"];
  const sorted = [...matches].sort(
    (a, b) =>
      gradeOrder.indexOf(a.grade) - gradeOrder.indexOf(b.grade) ||
      b.score - a.score
  );

  const topGrade = sorted[0]?.grade;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span>🎯</span> 자동 매칭 매수자
        </h2>
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
          {matches.length}명 매칭
        </span>
      </div>

      {/* 최상위 등급 하이라이트 */}
      {topGrade && ["S", "A"].includes(topGrade) && (
        <div className="rounded-lg bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 px-3.5 py-2.5">
          <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5 animate-pulse">
            🔥 {topGrade}등급 매수자가 {sorted.filter((m) => m.grade === topGrade).length}명 매칭되었습니다! 매칭 리스트를 확인해 보세요.
          </p>
        </div>
      )}

      {/* 매칭 카드 목록 */}
      <div className="space-y-3.5">
        {sorted.map((match) => (
          <MatchScoreCard key={match.id} match={match as any} buildingId={buildingId} />
        ))}
      </div>

      {/* 매칭 설명 푸터 */}
      <p className="text-[11px] text-muted-foreground text-center pt-2 border-t border-black/5 dark:border-white/5">
        ⚡ 3-Stage 실시간 AI 매칭 엔진 작동 중 (하드 필터 → 시맨틱 분석 → 가중치 앙상블 스코어링)
      </p>
    </div>
  );
}
