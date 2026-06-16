'use client';

import { useState, useEffect } from 'react';

interface WeeklyReport {
  period: { start: string; end: string };
  thisWeek: { dealCards: number; leaseCards: number; buyerIntents: number; tenantIntents: number };
  totals: { buildings: number; leaseSpaces: number; buyerIntents: number; tenantIntents: number; clients: number };
  matching: { sGrade: number; aGrade: number; bGrade: number; total: number };
  demandSignals: Array<{ region: string; count: number }>;
  followUpClients: Array<{ id: string; display_name: string; tier: string; days_since_contact: number }>;
}

const TIER_EMOJI: Record<string, string> = { vip: '⭐', normal: '', potential: '', dormant: '💤' };

export function WeeklyReportCard() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/broker/weekly-report', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            setReport(json.data);
          } else {
            setError('데이터가 없습니다.');
          }
        } else {
          setError(`데이터를 불러오지 못했습니다. (코드: ${res.status})`);
        }
      } catch (err: any) {
        setError(err?.message || '네트워크 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-32" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl">
          📊
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">주간 리포트</h3>
          <p className="text-xs text-muted-foreground max-w-[280px] mx-auto leading-normal">
            {error || '활동 데이터가 아직 없거나 리포트를 구성하지 못했습니다. 새로운 매물을 등록하거나 고객 매칭을 시작해 보세요.'}
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-2">
          <a
            href="/broker/deal-card/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            ➕ 30초 딜카드 등록
          </a>
        </div>
      </div>
    );
  }

  const periodLabel = `${report.period.start.slice(5)} ~ ${report.period.end.slice(5)}`;
  const totalWeek = report.thisWeek.dealCards + report.thisWeek.leaseCards +
    report.thisWeek.buyerIntents + report.thisWeek.tenantIntents;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-all">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-xs font-semibold">이번 주 리포트</span>
          <span className="text-[10px] text-muted-foreground">{periodLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-primary">{totalWeek}건 활동</span>
          <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Collapsed summary bar */}
      {!expanded && (
        <div className="px-4 pb-3 flex items-center gap-3 text-[10px] text-muted-foreground">
          {report.matching.sGrade > 0 && (
            <span className="text-grade-s font-bold">S {report.matching.sGrade}건</span>
          )}
          {report.matching.aGrade > 0 && (
            <span className="text-blue-400 font-bold">A {report.matching.aGrade}건</span>
          )}
          {report.demandSignals.length > 0 && (
            <span>📍 {report.demandSignals[0].region}({report.demandSignals[0].count})</span>
          )}
          {report.followUpClients.length > 0 && (
            <span className="text-amber-400">⚠️ 미연락 {report.followUpClients.length}명</span>
          )}
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
          {/* Market Pulse Link */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/5 rounded-xl p-3 border border-indigo-500/20 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-300">📡 시장 Pulse (Market Pulse)</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">권역별 거시적 시장 분석 및 심층 리포트</span>
            </div>
            <a href="/pulse/cbd/2026-W23" target="_blank" className="text-[10px] font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors">
              리포트 열기 &rarr;
            </a>
          </div>

          {/* This week activity */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: '딜카드', value: report.thisWeek.dealCards, total: report.totals.buildings },
              { label: '임대카드', value: report.thisWeek.leaseCards, total: report.totals.leaseSpaces },
              { label: '매수등록', value: report.thisWeek.buyerIntents, total: report.totals.buyerIntents },
              { label: '임차등록', value: report.thisWeek.tenantIntents, total: report.totals.tenantIntents },
            ].map((item) => (
              <div key={item.label} className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-base font-bold text-foreground">{item.value}</p>
                <p className="text-[9px] text-muted-foreground">{item.label}</p>
                <p className="text-[8px] text-muted-foreground mt-0.5">총 {item.total}건</p>
              </div>
            ))}
          </div>

          {/* Matching signals */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🎯 매칭 시그널</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 font-bold">
                S {report.matching.sGrade}건
              </span>
              <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-400 font-bold">
                A {report.matching.aGrade}건
              </span>
              <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 font-bold">
                B(참고) {report.matching.bGrade}건
              </span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                전체 {report.matching.total}건
              </span>
            </div>
          </div>

          {/* Regional demand */}
          {report.demandSignals.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">📍 수요 집중 권역</p>
              <div className="flex flex-wrap gap-1.5">
                {report.demandSignals.map((d, i) => (
                  <span
                    key={d.region}
                    className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                      i === 0
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {d.region} ({d.count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Follow-up needed */}
          {report.followUpClients.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                ⚠️ 14일+ 미연락 고객 ({report.followUpClients.length}명)
              </p>
              <div className="space-y-1">
                {report.followUpClients.map((c) => (
                  <a
                    key={c.id}
                    href={`/broker/clients/${c.id}`}
                    className="flex items-center justify-between rounded-lg bg-amber-500/5 border border-amber-500/10 px-3 py-1.5 text-xs hover:bg-amber-500/10 transition-colors"
                  >
                    <span className="font-medium">
                      {TIER_EMOJI[c.tier] || ''} {c.display_name}
                    </span>
                    <span className="text-[10px] text-amber-400">
                      {c.days_since_contact}일 전
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Summary bar */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <span>관리 고객 {report.totals.clients}명</span>
            <span>·</span>
            <span>총 매물 {report.totals.buildings + report.totals.leaseSpaces}건</span>
            <span>·</span>
            <span>총 의향서 {report.totals.buyerIntents + report.totals.tenantIntents}건</span>
          </div>
        </div>
      )}
    </div>
  );
}

async function getToken(): Promise<string> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? '';
  } catch {
    return '';
  }
}
