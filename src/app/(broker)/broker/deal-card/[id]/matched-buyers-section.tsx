/**
 * MatchedBuyersSection — 딜카드 결과 화면에서 자동 매칭된 매수자 목록을 표시합니다.
 * match_results 테이블에서 해당 건물의 매칭 결과를 조회하여 S/A/B/C 등급 카드로 렌더링.
 *
 * P0-1: UI/UX 완전화 — 매수자 매칭 엔진 결과의 시각화
 */
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";

interface MatchedBuyersSectionProps {
  buildingId: string;
}

const GRADE_CONFIG: Record<
  string,
  { emoji: string; label: string; bg: string; border: string; text: string }
> = {
  S: {
    emoji: "🏆",
    label: "S등급",
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
  },
  A: {
    emoji: "🥇",
    label: "A등급",
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
  },
  B: {
    emoji: "🥈",
    label: "B등급",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
  },
  C: {
    emoji: "🥉",
    label: "C등급",
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
  },
};

export async function MatchedBuyersSection({
  buildingId,
}: MatchedBuyersSectionProps) {
  const supabase = createServiceClient();

  // match_results + buyer_intent_lite 조인 조회
  const { data: matches } = await supabase
    .from("match_results")
    .select(
      `id, grade, score, reasoning, created_at,
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
        <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
          <p className="text-xs text-green-700 font-medium">
            🔥 {topGrade}등급 매수자가 {sorted.filter((m) => m.grade === topGrade).length}명 있습니다! 지금 연락해 보세요.
          </p>
        </div>
      )}

      {/* 매칭 카드 목록 */}
      <div className="space-y-3">
        {sorted.map((match) => {
          const intent = Array.isArray(match.buyer_intent_lite)
            ? match.buyer_intent_lite[0]
            : match.buyer_intent_lite;
          const cfg =
            GRADE_CONFIG[match.grade] ?? GRADE_CONFIG["C"];
          const regions = Array.isArray(intent?.preferred_regions)
            ? (intent.preferred_regions as string[]).join(", ")
            : "미확인";
          const scorePercent = Math.round(match.score * 100);

          return (
            <div
              key={match.id}
              className={`rounded-xl border p-4 space-y-3 ${cfg.bg} ${cfg.border}`}
            >
              {/* 상단 */}
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cfg.emoji}</span>
                    <span
                      className={`text-xs font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} border ${cfg.border}`}
                    >
                      {cfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      매칭 {scorePercent}점
                    </span>
                  </div>
                  <p className={`text-sm font-semibold ${cfg.text}`}>
                    {intent?.buyer_type || "매수자"}
                  </p>
                </div>
                {/* 스코어 게이지 */}
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-lg font-bold ${cfg.text}`}>
                    {scorePercent}
                    <span className="text-xs font-normal">점</span>
                  </span>
                  <div className="w-16 h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-current rounded-full transition-all"
                      style={{ width: `${scorePercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 조건 요약 */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">예산</span>
                  <span className="ml-1 font-medium">
                    {intent?.budget_display || "미확인"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">목적</span>
                  <span className="ml-1 font-medium">
                    {intent?.purchase_purpose || "미확인"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">선호 지역</span>
                  <span className="ml-1 font-medium">{regions}</span>
                </div>
              </div>

              {/* 매칭 이유 */}
              {match.reasoning && (
                <div className="rounded-lg bg-white/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    💬 {String(match.reasoning)}
                  </p>
                </div>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/broker/buyer-intents/${intent?.id}`}
                  className="flex-1 inline-flex items-center justify-center rounded-lg bg-white/80 border border-white/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white"
                  id={`cta-buyer-detail-${match.id}`}
                >
                  매수자 상세 보기
                </Link>
                <a
                  href={`https://open.kakao.com/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-white transition-colors ${
                    match.grade === "S" || match.grade === "A"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gray-500 hover:bg-gray-600"
                  }`}
                  id={`cta-notify-broker-${match.id}`}
                >
                  담당자에게 알림 📲
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* 매칭 설명 푸터 */}
      <p className="text-xs text-muted-foreground text-center pt-1">
        3-Stage 매칭 (예산·지역·목적 필터 → AI 시맨틱 유사도 → 앙상블 점수)
      </p>
    </div>
  );
}
