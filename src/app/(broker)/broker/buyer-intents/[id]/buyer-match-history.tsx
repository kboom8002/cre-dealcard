"use client";

import { useState } from "react";

interface Building {
  id: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
}

interface MatchHistory {
  id: string;
  grade: string;
  score: number;
  reasoning: string | null;
  created_at: string;
  building_ssot_lite_id: string;
  building_ssot_lite: Building | Building[] | null;
}

interface BuyerMatchHistoryProps {
  matchHistory: MatchHistory[] | null;
}

export function BuyerMatchHistory({ matchHistory }: BuyerMatchHistoryProps) {
  const [expandedMatches, setExpandedMatches] = useState<Record<string, boolean>>({});

  const toggleMatchExpand = (id: string) => {
    setExpandedMatches((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-6 md:p-8 space-y-6 shadow-elevation-2">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>🏆</span> 실시간 매칭 적합도 분석
        </h2>
        <span className="text-xs text-muted-foreground">
          총 {matchHistory?.length || 0}건 매칭됨
        </span>
      </div>

      {matchHistory && matchHistory.length > 0 ? (
        <div className="space-y-4">
          {matchHistory.map((m) => {
            const b = Array.isArray(m.building_ssot_lite)
              ? m.building_ssot_lite[0]
              : m.building_ssot_lite;

            if (!b) return null;

            const isExpanded = !!expandedMatches[m.id];

            const gradeStyles: Record<
              string,
              { badge: string; border: string; glow: string; text: string }
            > = {
              S: {
                badge: "bg-amber-500/15 border-amber-500/30 text-amber-400",
                border: "border-amber-500/20 hover:border-amber-500/40",
                glow: "shadow-[inset_0_0_12px_rgba(245,158,11,0.08)]",
                text: "text-amber-400",
              },
              A: {
                badge: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
                border: "border-emerald-500/20 hover:border-emerald-500/40",
                glow: "shadow-[inset_0_0_12px_rgba(52,211,153,0.08)]",
                text: "text-emerald-400",
              },
              B: {
                badge: "bg-blue-500/15 border-blue-500/30 text-blue-400",
                border: "border-blue-500/20 hover:border-blue-500/40",
                glow: "shadow-[inset_0_0_12px_rgba(96,165,250,0.08)]",
                text: "text-blue-400",
              },
              C: {
                badge: "bg-slate-500/15 border-slate-500/30 text-slate-400",
                border: "border-slate-800 hover:border-slate-700",
                glow: "",
                text: "text-slate-400",
              },
            };

            const style = gradeStyles[m.grade] ?? gradeStyles["C"];
            const matchPercentage = Math.round(m.score * 100);

            return (
              <div
                key={m.id}
                className={`group relative rounded-xl border bg-slate-950/60 transition-all duration-300 overflow-hidden ${style.border} ${style.glow}`}
              >
                <div
                  onClick={() => toggleMatchExpand(m.id)}
                  className="flex items-center justify-between gap-4 p-4 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-black tracking-tight shrink-0 shadow-sm ${style.badge}`}
                    >
                      {m.grade}
                    </span>

                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors truncate">
                        {b.area_signal || "권역 미상"} · {b.asset_type || "자산 미상"}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {b.price_band || "가격 미확인"} · 연산일자 {new Date(m.created_at).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right shrink-0">
                      <span className={`text-base font-extrabold ${style.text}`}>
                        {matchPercentage}%
                      </span>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                        FIT SCORE
                      </p>
                    </div>

                    <div className="text-muted-foreground group-hover:text-foreground transition-colors">
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-white/5 bg-slate-900/20 px-4 pb-4 pt-3 space-y-3.5 animate-fadeIn">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>접합도 등급 분포</span>
                        <span className="font-semibold">{matchPercentage} / 100</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${matchPercentage}%` }}
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <span>⚡</span> AI 매칭 심층 리포트
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed bg-slate-950/40 rounded-lg p-3 border border-white/5 whitespace-pre-line">
                        {m.reasoning || "상세 매칭 접합 분석 사유가 기재되지 않았습니다."}
                      </p>
                    </div>

                    <div className="flex justify-end pt-1">
                      <a
                        href={`/broker/deal-card/${b.id}`}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-bold border border-indigo-500/20 hover:border-indigo-500/40 rounded-lg px-3 py-1.5 bg-indigo-950/10 hover:bg-indigo-950/20 transition-all active:scale-[0.98]"
                      >
                        이 매물의 딜카드 확인하기
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">현재 매칭된 매물 이력이 없습니다.</p>
          <p className="text-xs text-muted-foreground">
            우측 상단의 "수동 재매칭 실행" 버튼을 눌러 첫 매칭 연산을 시도해 보세요.
          </p>
        </div>
      )}
    </div>
  );
}
