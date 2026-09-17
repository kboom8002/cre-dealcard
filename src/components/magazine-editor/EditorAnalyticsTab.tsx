'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Eye, Clock, CheckCircle2, Users, Flame,
  Phone, MessageSquare, ExternalLink, RefreshCw, ChevronRight,
  Sparkles, ArrowUpRight, Copy, Check, Info, X, ShieldAlert,
  Compass, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

interface SectionStat {
  sectionId: string;
  label: string;
  count: number;
  avgDwellSeconds: number;
}

interface HotLead {
  id: string;
  subscriber_name: string;
  subscriber_phone: string;
  subscriber_email: string | null;
  segment: string;
  channel: string;
  interest_tags?: {
    regions?: string[];
    assetTypes?: string[];
    topics?: string[];
    hobbies?: string[];
  };
  buyerTemperature: string;
  temperatureConfig?: {
    label: string;
    color: string;
    badgeBg: string;
    minScore: number;
    description: string;
  };
  score: number;
  totalViews: number;
  lastActiveAt: string;
  recentSections: string[];
}

interface AnalyticsData {
  subscriberCount: number;
  lastDistribution: {
    date: string | null;
    sentCount: number;
    failedCount: number;
    totalCount: number;
  } | null;
  viewStats: {
    totalViews: number;
    uniqueVisitors: number;
    avgDwellSeconds: number;
    completionRate: number;
  };
  sectionStats?: SectionStat[];
  temperatureDistribution?: Record<string, number>;
  hotLeads?: HotLead[];
  dailyTrend?: { date: string; count: number }[];
  editions?: any[];
}

export function EditorAnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTempFilter, setSelectedTempFilter] = useState<string | null>(null);
  const [briefingLead, setBriefingLead] = useState<HotLead | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);

  const fetchAnalytics = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await fetch('/api/broker/magazine/analytics');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        toast.error('성과 데이터를 불러오지 못했습니다.');
      }
    } catch (err) {
      console.error('[EditorAnalyticsTab] fetch failed:', err);
      toast.error('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPhone(true);
    toast.success('전화번호가 복사되었습니다.');
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
        <p className="text-xs">매거진 성과 및 독자 인텔리전스를 집계하고 있습니다...</p>
      </div>
    );
  }

  const viewStats = data?.viewStats || { totalViews: 0, uniqueVisitors: 0, avgDwellSeconds: 0, completionRate: 0 };
  const lastDist = data?.lastDistribution;
  const tempDist = data?.temperatureDistribution || {};
  const hotLeads = data?.hotLeads || [];
  const sectionStats = data?.sectionStats || [];
  const editions = data?.editions || [];

  // 필터링된 핫리드
  const filteredLeads = selectedTempFilter
    ? hotLeads.filter(l => l.buyerTemperature === selectedTempFilter)
    : hotLeads;

  // 섹션 차트 최대값 계산
  const maxSectionCount = Math.max(...sectionStats.map(s => s.count), 1);

  return (
    <div className="space-y-5">
      {/* ── 상단 헤더 & 새로고침 ── */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              독자 인텔리전스 & 성과 대시보드
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                실시간 집계
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              구독자의 열람 행동과 관심 콘텐츠를 추적하여 최적의 통화 타이밍을 도출합니다.
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      {/* ── 1. 핵심 KPI 지표 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px]">30일 총 열람</span>
            <Eye className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{viewStats.totalViews.toLocaleString()}</span>
            <span className="text-[11px] text-slate-500">회</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">고유 방문자 {viewStats.uniqueVisitors}명</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px]">평균 체류시간</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{viewStats.avgDwellSeconds}</span>
            <span className="text-[11px] text-slate-500">초</span>
          </div>
          <p className="text-[10px] text-emerald-400/80 mt-1">
            {viewStats.avgDwellSeconds >= 60 ? '심층 정독 국면' : '신속 브리핑 국면'}
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px]">100% 완독률</span>
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{viewStats.completionRate}</span>
            <span className="text-[11px] text-slate-500">%</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">마지막 섹션까지 도달</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px]">활성 구독자</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white">{(data?.subscriberCount || 0).toLocaleString()}</span>
            <span className="text-[11px] text-slate-500">명</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {lastDist ? `최근 배포: ${lastDist.date || '완료'} (${lastDist.sentCount}건)` : '배포 이력 대기중'}
          </p>
        </div>
      </div>

      {/* ── 2. 바이어 5단계 온도 필터 바 ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            바이어 매수 참여도 (5단계 온도)
          </span>
          {selectedTempFilter && (
            <button
              onClick={() => setSelectedTempFilter(null)}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
            >
              전체 보기
            </button>
          )}
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: '🔥 적극검토', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
            { label: '📈 관심', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
            { label: '⏸️ 관망', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
            { label: '❄️ 냉각', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
            { label: '⚪ 미확인', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' },
          ].map(tier => {
            const count = tempDist[tier.label] || 0;
            const isSelected = selectedTempFilter === tier.label;

            return (
              <button
                key={tier.label}
                onClick={() => setSelectedTempFilter(isSelected ? null : tier.label)}
                className={`p-2 rounded-lg border text-center transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                    : 'border-white/5 hover:border-white/20'
                }`}
                style={{ background: isSelected ? undefined : tier.bg }}
              >
                <div className="text-[11px] font-bold truncate" style={{ color: tier.color }}>
                  {tier.label}
                </div>
                <div className="text-sm font-black text-white mt-0.5">
                  {count}<span className="text-[10px] font-normal text-slate-400 ml-0.5">명</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. 🔥 핫리드(고관여 독자) 실시간 피드 ── */}
      <div className="bg-gradient-to-br from-rose-950/20 via-slate-900/60 to-slate-900/80 border border-rose-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            <h4 className="text-xs font-bold text-rose-200 flex items-center gap-1.5">
              지금 연락해야 할 핫리드 (Hot Leads Feed)
            </h4>
            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
              {filteredLeads.length}명
            </span>
          </div>
          <span className="text-[10px] text-slate-500">열람 반응 점수 순 정렬</span>
        </div>

        {filteredLeads.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
            해당 조건의 독자 활동 내역이 아직 없습니다.
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-none pr-1">
            {filteredLeads.map(lead => {
              const interestTags = [
                ...(lead.interest_tags?.regions || []),
                ...(lead.interest_tags?.assetTypes || []),
              ];

              return (
                <div
                  key={lead.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 rounded-xl p-3 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: lead.temperatureConfig?.badgeBg || 'rgba(239,68,68,0.15)',
                          color: lead.temperatureConfig?.color || '#ef4444',
                        }}
                      >
                        {lead.buyerTemperature}
                      </span>
                      <span className="text-xs font-bold text-white">{lead.subscriber_name}</span>
                      <span className="text-[11px] text-slate-400">({lead.subscriber_phone})</span>
                      {lead.segment && (
                        <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {lead.segment}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                      <span>총 {lead.totalViews}회 열람</span>
                      <span>·</span>
                      {lead.recentSections.length > 0 && (
                        <span className="text-rose-300/90 truncate">
                          집중: {lead.recentSections.join(', ')}
                        </span>
                      )}
                      {interestTags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-slate-500 truncate">
                            관심: {interestTags.slice(0, 3).join('/')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 액션 버튼군 */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => setBriefingLead(lead)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-medium transition-colors"
                      title="통화 전 맞춤 브리핑 치트시트 열기"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>통화 브리핑</span>
                    </button>

                    <a
                      href={`tel:${lead.subscriber_phone}`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-sm"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>전화걸기</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. 섹션별 독자 인기도 (히트맵 가로 바) ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            콘텐츠별 독자 관심도 (Top Sections)
          </h4>
          <span className="text-[10px] text-slate-500">열람수 및 평균 체류시간</span>
        </div>

        {sectionStats.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">섹션별 열람 데이터 집계 대기중입니다.</p>
        ) : (
          <div className="space-y-2.5">
            {sectionStats.slice(0, 6).map((sec, idx) => {
              const pct = Math.round((sec.count / maxSectionCount) * 100);

              return (
                <div key={sec.sectionId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 w-3">{idx + 1}.</span>
                      {sec.label}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span className="text-white font-bold">{sec.count}회</span>
                      <span className="text-slate-600">|</span>
                      <span>평균 {sec.avgDwellSeconds}초</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 5. 에디션별 성과 히스토리 ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-slate-400" />
            발행 에디션별 성과
          </h4>
          <span className="text-[10px] text-slate-500">최근 20건</span>
        </div>

        {editions.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-4">아직 발행된 에디션이 없습니다.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
            {editions.map(ed => {
              const dateStr = (ed.published_at || ed.created_at)?.slice(0, 10);

              return (
                <div
                  key={ed.id}
                  className="flex items-center justify-between bg-black/20 border border-white/5 hover:border-slate-700 p-2.5 rounded-lg text-xs"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] text-slate-500">{dateStr}</span>
                      <span className="text-[10px] text-indigo-400 font-mono">{ed.edition_label}</span>
                      {ed.market_temp && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                          {ed.market_temp}
                        </span>
                      )}
                    </div>
                    <p className="text-white font-medium truncate">{ed.title || '제목 없음'}</p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-white font-bold">{ed.view_count || 0}회</div>
                      <div className="text-[9px] text-slate-500">열람수</div>
                    </div>

                    <a
                      href={`/magazine/${ed.broker_id}/${dateStr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="새 창에서 열기"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 통화 브리핑 치트시트 모달 (Call Prep Modal) ── */}
      {briefingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5">
            {/* 모달 헤더 */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: briefingLead.temperatureConfig?.badgeBg || 'rgba(239,68,68,0.15)',
                      color: briefingLead.temperatureConfig?.color || '#ef4444',
                    }}
                  >
                    {briefingLead.buyerTemperature}
                  </span>
                  <h3 className="text-base font-bold text-white">{briefingLead.subscriber_name} 고객</h3>
                </div>
                <p className="text-xs text-slate-400">통화 전 고객 맞춤 브리핑 치트시트 (Call Preparation)</p>
              </div>
              <button
                onClick={() => setBriefingLead(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 주요 고객 정보 */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-black/30 p-3 rounded-xl border border-white/5">
              <div>
                <span className="text-slate-500 block text-[10px]">연락처</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-slate-200 font-bold">{briefingLead.subscriber_phone}</span>
                  <button
                    onClick={() => copyToClipboard(briefingLead.subscriber_phone)}
                    className="text-slate-400 hover:text-white p-0.5"
                    title="전화번호 복사"
                  >
                    {copiedPhone ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">세그먼트 / 채널</span>
                <span className="text-slate-200 font-medium mt-0.5 block">
                  {briefingLead.segment || '투자자'} · {briefingLead.channel === 'both' ? '카톡+메일' : briefingLead.channel}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">열람 빈도</span>
                <span className="text-indigo-300 font-bold mt-0.5 block">
                  최근 30일 {briefingLead.totalViews}회 열람
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">마지막 반응 일시</span>
                <span className="text-slate-300 font-mono text-[11px] mt-0.5 block">
                  {briefingLead.lastActiveAt?.slice(0, 16).replace('T', ' ') || '기록 없음'}
                </span>
              </div>
            </div>

            {/* 정독 섹션 & 관심 키워드 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>이 고객이 최근 가장 집중해서 본 내용</span>
              </div>
              <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-1.5 text-xs">
                {briefingLead.recentSections.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {briefingLead.recentSections.map((sec, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 font-medium">
                        ✓ {sec}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-[11px]">전체 에디션을 고르게 스캔하고 있습니다.</p>
                )}

                {briefingLead.interest_tags && (
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-rose-500/10 flex flex-wrap gap-1">
                    <span className="text-slate-500">등록 관심사:</span>
                    {[
                      ...(briefingLead.interest_tags.regions || []),
                      ...(briefingLead.interest_tags.assetTypes || []),
                      ...(briefingLead.interest_tags.topics || []),
                    ].map((t, i) => (
                      <span key={i} className="text-slate-300 bg-slate-800 px-1.5 py-0.2 rounded">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI 추천 통화 오프닝 멘트 */}
            <div className="space-y-1.5 bg-indigo-950/30 border border-indigo-500/30 p-3 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-300">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>추천 통화 오프닝 멘트 (자연스러운 접촉 유도)</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed bg-black/20 p-2.5 rounded-lg border border-white/5 font-sans">
                &ldquo;대표님, 안녕하세요! 지난번 보내드린 주간 리포트에서{' '}
                <span className="text-indigo-300 font-bold">
                  [{briefingLead.recentSections[0] || '금주 시장 분석'}]
                </span>{' '}
                내용 확인해보셨나요? 마침 대표님께서 보시던 조건과 매우 유사한 인근 추천 매물이 방금 접수되어 가장 먼저 안내드리려고 연락드렸습니다.&rdquo;
              </p>
            </div>

            {/* 모달 하단 액션 */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setBriefingLead(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
              >
                닫기
              </button>
              <a
                href={`tel:${briefingLead.subscriber_phone}`}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-900/20"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>지금 바로 전화걸기</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
