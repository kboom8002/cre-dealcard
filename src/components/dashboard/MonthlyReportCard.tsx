"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MonthlyReport {
  month: number;
  thisMonth: { deals: number; meetings: number; contracts: number };
  prevMonth: { deals: number; meetings: number; contracts: number };
  insight: string;
}

export function MonthlyReportCard() {
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch("/api/broker/monthly-report");
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) setReport(json.data);
        } else {
          setError("월간 리포트를 불러오지 못했습니다.");
        }
      } catch (err: any) {
        setError("네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading) {
    return <div className="h-20 bg-muted rounded-xl animate-pulse" />;
  }

  if (error || !report) return null;

  const renderTrend = (current: number, prev: number) => {
    if (current > prev) return <span className="text-emerald-500 flex items-center text-[10px]"><TrendingUp className="w-3 h-3 mr-0.5" />+{current - prev}</span>;
    if (current < prev) return <span className="text-rose-500 flex items-center text-[10px]"><TrendingDown className="w-3 h-3 mr-0.5" />{current - prev}</span>;
    return <span className="text-muted-foreground flex items-center text-[10px]"><Minus className="w-3 h-3 mr-0.5" />-</span>;
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📅</span>
          <span className="text-sm font-bold text-foreground">{report.month}월 결산 리포트</span>
        </div>
        <div className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-bold">
          {expanded ? "접기" : "보기"}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-border pt-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/30 p-3 rounded-lg text-center">
              <p className="text-[10px] text-muted-foreground mb-1">신규 소싱</p>
              <div className="flex items-end justify-center gap-1.5">
                <span className="text-xl font-bold">{report.thisMonth.deals}</span>
                {renderTrend(report.thisMonth.deals, report.prevMonth.deals)}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg text-center">
              <p className="text-[10px] text-muted-foreground mb-1">고객 미팅</p>
              <div className="flex items-end justify-center gap-1.5">
                <span className="text-xl font-bold">{report.thisMonth.meetings}</span>
                {renderTrend(report.thisMonth.meetings, report.prevMonth.meetings)}
              </div>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg text-center">
              <p className="text-[10px] text-muted-foreground mb-1">계약 성사</p>
              <div className="flex items-end justify-center gap-1.5">
                <span className="text-xl font-bold">{report.thisMonth.contracts}</span>
                {renderTrend(report.thisMonth.contracts, report.prevMonth.contracts)}
              </div>
            </div>
          </div>
          <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 text-xs leading-relaxed text-foreground">
            <span className="font-bold text-primary mr-1">AI 코멘트:</span>
            {report.insight}
          </div>
        </div>
      )}
    </div>
  );
}
