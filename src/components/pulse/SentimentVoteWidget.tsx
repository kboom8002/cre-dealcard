"use client";

import { useState, useEffect } from "react";

interface Props {
  region: string;
  period: string;
  pulseScore: number;
}

interface VoteStats {
  region: string;
  period_label: string;
  vote_count: number;
  avg_transaction: number;
  avg_lease: number;
  avg_outlook: number;
  sentiment_index: number | null;
  std_transaction: number;
  std_outlook: number;
  statistically_significant: boolean;
}

interface HistoryItem {
  period_label: string;
  sentiment_index: number | null;
  vote_count: number;
  statistically_significant: boolean;
}

const LIKERT_LABELS: Record<number, { emoji: string; text: string; color: string }> = {
  5: { emoji: "🔥🔥", text: "매우 뜨거움", color: "text-emerald-400" },
  4: { emoji: "🔥", text: "뜨거움", color: "text-emerald-500/80" },
  3: { emoji: "⚖️", text: "보합", color: "text-slate-400" },
  2: { emoji: "❄️", text: "차가움", color: "text-red-400/80" },
  1: { emoji: "❄️❄️", text: "매우 차가움", color: "text-red-500" },
};

export default function SentimentVoteWidget({ region, period, pulseScore }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isBroker, setIsBroker] = useState(false);
  const [stats, setStats] = useState<VoteStats | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [myVote, setMyVote] = useState<{
    q_transaction: number;
    q_lease: number;
    q_outlook: number;
    comment: string | null;
  } | null>(null);

  // Form states
  const [qTx, setQTx] = useState(3);
  const [qLease, setQLease] = useState(3);
  const [qOutlook, setQOutlook] = useState(3);
  const [comment, setComment] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const regionUpper = region.toUpperCase();

  const fetchData = async () => {
    try {
      // 1. Fetch stats
      const statsRes = await fetch(`/api/pulse/sentiment/stats?region=${region}&period=${period}`);
      const statsJson = await statsRes.json();
      
      if (statsJson.ok) {
        setStats(statsJson.stats);
        setIsBroker(statsJson.isBroker);
        if (statsJson.myVote) {
          setMyVote(statsJson.myVote);
          setQTx(statsJson.myVote.q_transaction);
          setQLease(statsJson.myVote.q_lease);
          setQOutlook(statsJson.myVote.q_outlook);
          setComment(statsJson.myVote.comment ?? "");
          setShowForm(false);
        } else {
          setShowForm(statsJson.isBroker);
        }
      }

      // 2. Fetch history for sparkline
      const histRes = await fetch(`/api/pulse/sentiment/history?region=${region}&weeks=12`);
      const histJson = await histRes.json();
      if (histJson.ok) {
        setHistory(histJson.history);
      }
    } catch (err) {
      console.error("Failed to load sentiment vote data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [region, period]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/pulse/sentiment/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          q_transaction: qTx,
          q_lease: qLease,
          q_outlook: qOutlook,
          comment: comment.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message ?? "투표 제출에 실패했습니다.");
      }

      // Refresh data
      await fetchData();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-500">체감 경기 데이터 로딩 중...</span>
        </div>
      </div>
    );
  }

  const hasVoted = !!myVote;
  const sentimentIndex = stats?.sentiment_index;
  const totalVotes = stats?.vote_count ?? 0;

  // Sparkline computation
  const sparklineData = history.map(h => h.sentiment_index ?? 50); // Fallback to 50 for layout
  const maxVal = 100;
  const minVal = 0;
  const range = maxVal - minVal;
  
  const width = 160;
  const height = 30;
  
  const points = sparklineData.length > 1
    ? sparklineData.map((val, index) => {
        const x = (index / (sparklineData.length - 1)) * width;
        const y = height - ((val - minVal) / range) * height;
        return `${x},${y}`;
      }).join(" ")
    : "";

  // Divergence check
  const showDivergence = sentimentIndex !== null && sentimentIndex !== undefined && totalVotes > 0;
  const divergenceGap = showDivergence ? (sentimentIndex - pulseScore) : 0;

  return (
    <div className="space-y-4">
      {/* 1. Statistics & Aggregation View */}
      <div className="bg-[#131b2e] border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">💬 현장 중개사 경기 체감 (B4 & G7)</p>
            <p className="text-[9px] text-slate-500 mt-0.5">실시간 중개인의 현장 체감을 취합한 정성적 지표</p>
          </div>
          {stats && sentimentIndex !== null && sentimentIndex !== undefined ? (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">
                체감 지수 {sentimentIndex} ({sentimentIndex >= 70 ? "Bullish" : sentimentIndex >= 45 ? "Neutral" : "Bearish"})
              </span>
              <span className="text-[8px] text-slate-500 mt-1">참여 {totalVotes}명</span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
              투표 데이터 부족
            </span>
          )}
        </div>

        {/* 1-A. Progress Bars (if votes exist) */}
        {stats && sentimentIndex !== null && sentimentIndex !== undefined && totalVotes > 0 ? (
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">매매 체감</span>
                <span className="text-slate-300 font-bold">{stats.avg_transaction} / 5</span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-500 rounded-full transition-all" 
                  style={{ width: `${(stats.avg_transaction / 5) * 100}%` }} 
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">임대/공실 체감</span>
                <span className="text-slate-300 font-bold">{stats.avg_lease} / 5</span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-cyan-500 rounded-full transition-all" 
                  style={{ width: `${(stats.avg_lease / 5) * 100}%` }} 
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">3개월 전망</span>
                <span className="text-slate-300 font-bold">{stats.avg_outlook} / 5</span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 rounded-full transition-all" 
                  style={{ width: `${(stats.avg_outlook / 5) * 100}%` }} 
                />
              </div>
            </div>

            {/* Sparkline & Significance info */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-800/40">
              <div className="flex flex-col gap-0.5">
                <span className="text-[8px] text-slate-500">📈 12주 체감 지수 추이</span>
                {stats.statistically_significant ? (
                  <span className="text-[8px] text-emerald-400 font-semibold">✓ 통계적 유의성 만족 (n≥30)</span>
                ) : (
                  <span className="text-[8px] text-amber-500/80">⚠️ 표본 수 부족 ({totalVotes}/30)</span>
                )}
              </div>

              {/* SVG Sparkline */}
              {history.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] text-slate-600">{history[0].period_label}</span>
                  <svg width={width} height={height} className="overflow-visible">
                    <polyline
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                      points={points}
                    />
                    {/* Pulsing end dot */}
                    {sparklineData.length > 0 && (
                      <circle
                        cx={width}
                        cy={height - ((sparklineData[sparklineData.length - 1] - minVal) / range) * height}
                        r="3"
                        fill="#06b6d4"
                        className="animate-pulse"
                      />
                    )}
                  </svg>
                  <span className="text-[8px] text-slate-600">{history[history.length - 1].period_label}</span>
                </div>
              ) : (
                <span className="text-[8px] text-slate-600">추이 데이터 누적 중</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
            <span className="text-xs text-slate-500">아직 중개사 투표가 수집되지 않았습니다.</span>
            <p className="text-[9px] text-slate-600 mt-1">첫 투표를 완료해 실시간 지수 집계에 기여해 주세요!</p>
          </div>
        )}

        {/* 1-B. User's Own Vote Summary */}
        {hasVoted && !showForm && (
          <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-cyan-400 font-bold">내 이번 주 현장 투표 정보</span>
              <button 
                onClick={() => setShowForm(true)} 
                className="text-[9px] text-slate-500 hover:text-white underline transition-all"
              >
                투표 수정하기
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/60 rounded p-1.5">
                <span className="text-[8px] text-slate-500 block">매매 체감</span>
                <span className="text-xs font-bold text-slate-300">{LIKERT_LABELS[myVote.q_transaction].emoji} ({myVote.q_transaction}점)</span>
              </div>
              <div className="bg-slate-900/60 rounded p-1.5">
                <span className="text-[8px] text-slate-500 block">임대 체감</span>
                <span className="text-xs font-bold text-slate-300">{LIKERT_LABELS[myVote.q_lease].emoji} ({myVote.q_lease}점)</span>
              </div>
              <div className="bg-slate-900/60 rounded p-1.5">
                <span className="text-[8px] text-slate-500 block">3개월 전망</span>
                <span className="text-xs font-bold text-slate-300">{LIKERT_LABELS[myVote.q_outlook].emoji} ({myVote.q_outlook}점)</span>
              </div>
            </div>
            {myVote.comment && (
              <p className="text-[9px] text-slate-400 italic">" {myVote.comment} "</p>
            )}
          </div>
        )}
      </div>

      {/* 2. Interactive Vote Form (Only if authenticated broker) */}
      {isBroker && (showForm || !hasVoted) && (
        <form onSubmit={handleSubmit} className="bg-[#131b2e] border border-indigo-500/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>✍️</span> {regionUpper} 권역 현장 경기 판단 투표
            </span>
            {hasVoted && (
              <button 
                type="button" 
                onClick={() => setShowForm(false)} 
                className="text-[9px] text-slate-500 hover:text-white"
              >
                취소
              </button>
            )}
          </div>

          {/* Q1: 매매 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Q1. 매매 체감 (거래 속도, 호가 분위기)</span>
              <span className={`font-bold ${LIKERT_LABELS[qTx].color}`}>
                {LIKERT_LABELS[qTx].emoji} {LIKERT_LABELS[qTx].text}
              </span>
            </div>
            <input 
              type="range" min="1" max="5" step="1" 
              value={qTx} onChange={(e) => setQTx(parseInt(e.target.value))}
              className="w-full accent-cyan-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-slate-600 px-1">
              <span>매우 차가움</span>
              <span>차가움</span>
              <span>보합</span>
              <span>뜨거움</span>
              <span>매우 뜨거움</span>
            </div>
          </div>

          {/* Q2: 임대 */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Q2. 임대 체감 (공실 소진, 임차 수요)</span>
              <span className={`font-bold ${LIKERT_LABELS[qLease].color}`}>
                {LIKERT_LABELS[qLease].emoji} {LIKERT_LABELS[qLease].text}
              </span>
            </div>
            <input 
              type="range" min="1" max="5" step="1" 
              value={qLease} onChange={(e) => setQLease(parseInt(e.target.value))}
              className="w-full accent-cyan-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-slate-600 px-1">
              <span>매우 차가움</span>
              <span>차가움</span>
              <span>보합</span>
              <span>뜨거움</span>
              <span>매우 뜨거움</span>
            </div>
          </div>

          {/* Q3: 전망 */}
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Q3. 3개월 후 권역 전망</span>
              <span className={`font-bold ${LIKERT_LABELS[qOutlook].color}`}>
                {LIKERT_LABELS[qOutlook].emoji} {LIKERT_LABELS[qOutlook].text}
              </span>
            </div>
            <input 
              type="range" min="1" max="5" step="1" 
              value={qOutlook} onChange={(e) => setQOutlook(parseInt(e.target.value))}
              className="w-full accent-indigo-500 bg-slate-950 h-1.5 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-slate-600 px-1">
              <span>매우 차가움</span>
              <span>차가움</span>
              <span>보합</span>
              <span>뜨거움</span>
              <span>매우 뜨거움</span>
            </div>
          </div>

          {/* 한 줄 코멘트 */}
          <div className="space-y-1 pt-1">
            <span className="text-[10px] text-slate-400">한 줄 코멘트 (선택)</span>
            <input 
              type="text" 
              placeholder="현장에서만 느껴지는 특이사항이 있다면 입력하세요 (예: F&B 업종 임차 문의 증가)"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 150))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {errorMessage && (
            <p className="text-[10px] text-red-400">{errorMessage}</p>
          )}

          <button 
            type="submit" 
            disabled={submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>{hasVoted ? "투표 수정하기" : "투표 제출하기"}</span>
            )}
          </button>
        </form>
      )}

      {/* Notice for non-logged-in / non-brokers */}
      {!isBroker && (
        <div className="bg-[#131b2e]/60 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="text-[10px] text-slate-500">
            🔒 체감 경기 투표는 <strong className="text-cyan-400">인증된 공인중개사</strong> 회원만 참여할 수 있습니다.
          </p>
        </div>
      )}

      {/* 3. Divergence Analysis (Cross-Validation component) */}
      {showDivergence && (
        <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">⚖️ AI 데이터 vs 중개인 체감 괴리 분석</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-900 flex flex-col justify-center items-center">
              <span className="text-[9px] text-slate-500">AI 실데이터 펄스</span>
              <span className="text-lg font-extrabold text-white mt-1">{pulseScore}</span>
            </div>
            <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-900 flex flex-col justify-center items-center">
              <span className="text-[9px] text-slate-500">현장 중개인 체감</span>
              <span className="text-lg font-extrabold text-cyan-400 mt-1">{sentimentIndex}</span>
            </div>
          </div>

          <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs">
                {Math.abs(divergenceGap) <= 10 ? "⚖️" : divergenceGap > 0 ? "🔥" : "❄️"}
              </span>
              <span className="text-[10px] font-bold text-white">
                {Math.abs(divergenceGap) <= 10 
                  ? "시장 균형 상태 (갭 일치)" 
                  : divergenceGap > 0 
                    ? `현장 낙관론 우세 (갭 +${divergenceGap})` 
                    : `현장 경계감 우세 (갭 ${divergenceGap})`}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {Math.abs(divergenceGap) <= 10 ? (
                "실제 거래량, 매칭 스코어 등의 시스템 실데이터와 현장 공인중개사들이 체감하는 온도가 일치합니다. 현재 시세 지표와 매수/매도 거래 속도가 매우 높은 신뢰도를 가지고 흐르고 있음을 나타냅니다."
              ) : divergenceGap > 0 ? (
                "공인중개사들이 시스템의 실제 수치 지표(거래 건수, 매칭 수 등)보다 현장 분위기를 더 긍정적으로 판단하고 있습니다. 이는 매수 주체들의 방문 및 유동적 문의가 현장에서 활발히 늘어나고 있다는 선행적 상승 시그널일 수 있습니다."
              ) : (
                "현장의 중개인들이 하드웨어 시스템 데이터가 지시하는 시장 수치보다 더 신중하고 보수적으로 시장을 체감하고 있습니다. 매수 의향 대비 가격 네고가 까다롭거나 권역 내 관망세가 짙은 상태임을 시사합니다."
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
