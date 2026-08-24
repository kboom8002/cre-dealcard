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
  const { data: allMatches } = await supabase
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

  // Stage 1 하드 필터 탈락 및 0점 매수자는 제외 (실질적인 유효 매칭만 노출)
  const matches = (allMatches || []).filter(
    (m) => m.stage1_passed !== false && (m.score == null || m.score > 0)
  );

  if (!matches || matches.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span>🎯</span> 자동 매칭 매수자
        </h2>
        <div className="text-center py-6 space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center text-xl">🎯</div>
          <p className="text-sm font-semibold text-foreground">
            아직 조건에 맞는 유효 매수자가 없습니다.
          </p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">
            조건 불일치(탈락) 매수자는 제외되며, S/A/B등급 적합 매수자가 등록되면 3-Stage AI 엔진이 자동으로 매칭합니다.
          </p>
          <Link
            href="/broker/buyer-intents/new"
            className="inline-flex items-center justify-center mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 shadow-sm"
            id="cta-add-buyer-from-match"
          >
            🎯 매수자 의향 등록하기
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

  const sGradeCount = matches.filter(m => m.grade === 'S').length;
  const aGradeCount = matches.filter(m => m.grade === 'A').length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* AI 매칭 인사이트 & 헤더 통합 배너 */}
      <div className="rounded-xl border border-primary/20 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-emerald-500/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground">
            <span>🧠</span> AI 매칭 분석 인사이트
          </h3>
          <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full border border-primary/20">
            온톨로지 v0.4 · 3축 엔진
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-card/90 rounded-lg p-2 border border-border/60">
            <p className="text-base font-extrabold text-primary">{matches.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium">총 매칭</p>
          </div>
          <div className="bg-card/90 rounded-lg p-2 border border-border/60">
            <p className="text-base font-extrabold text-grade-s">{sGradeCount}</p>
            <p className="text-[10px] text-muted-foreground font-medium">S등급</p>
          </div>
          <div className="bg-card/90 rounded-lg p-2 border border-border/60">
            <p className="text-base font-extrabold text-grade-a">{aGradeCount}</p>
            <p className="text-[10px] text-muted-foreground font-medium">A등급</p>
          </div>
        </div>

        {sGradeCount > 0 && (
          <p className="text-xs text-purple-600 dark:text-purple-400 font-bold text-center animate-pulse pt-0.5">
            🔥 S등급 최우선 매수자가 대기 중입니다! 즉시 연락을 권장합니다.
          </p>
        )}
      </div>

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
