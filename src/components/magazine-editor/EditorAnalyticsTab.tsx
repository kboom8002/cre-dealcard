'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Eye, Clock, CheckCircle2, Users, Flame,
  Phone, RefreshCw, Sparkles, ArrowUpRight, Compass, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { messageFromResponse, toUserMessage } from '@/lib/magazine/user-message';
import { KPI_DEFINITIONS } from '@/domain/magazine/analytics-aggregate';
import { KpiCard } from './analytics/KpiCard';
import { PollHourly } from './analytics/PollHourly';
import { SubscriberDetailPanel } from './analytics/SubscriberDetailPanel';
import { CallBriefingModal } from './analytics/CallBriefingModal';
import { formatSeconds } from './analytics/analytics-text';
import type { AnalyticsData, HotLead, HotLeadTier } from './analytics/types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AnalyticsData };

const TEMPERATURE_TIERS = [
  { label: '🔥 적극검토', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  { label: '📈 관심', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  { label: '⏸️ 관망', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  { label: '❄️ 냉각', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
  { label: '⚪ 미확인', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' },
];

const REASON_TEXT: Record<string, string> = {
  intent_floor: '통화·IM 요청 신호로 상향',
  stale_cooling: '6개월 이상 반응 없음',
};

/** 성과 데이터 요청 — 상태를 직접 갱신하지 않고 LoadState 를 반환한다 (reject 하지 않음). */
async function requestAnalytics(tier: HotLeadTier): Promise<LoadState> {
  try {
    const res = await fetch(`/api/broker/magazine/analytics?tier=${tier}`);
    if (!res.ok) {
      // 실패를 빈 데이터로 위장하지 않는다 — ErrorState + 재시도
      return { status: 'error', message: await messageFromResponse(res) };
    }
    const json = (await res.json()) as AnalyticsData;
    return { status: 'ready', data: json };
  } catch (err) {
    console.error('[EditorAnalyticsTab] fetch failed:', err);
    return { status: 'error', message: toUserMessage(err) };
  }
}

/** 핫리드 기준 선택지 — 선별은 서버가 한다 (`?tier=`) */
const LEAD_TIER_OPTIONS: Array<{ value: HotLeadTier; label: string; hint: string }> = [
  { value: 'warm', label: '관심 이상', hint: '📈 관심 · 🔥 적극검토' },
  { value: 'hot', label: '적극검토만', hint: '🔥 적극검토' },
  { value: 'all', label: '반응 있는 전체', hint: '점수 1점 이상' },
];

export function EditorAnalyticsTab() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [leadTier, setLeadTier] = useState<HotLeadTier>('warm');
  const [briefingLead, setBriefingLead] = useState<HotLead | null>(null);
  const [detailLead, setDetailLead] = useState<{ id: string; name: string } | null>(null);

  // 사용자 동작(새로고침/재시도/기준 변경) 경로 — 이벤트 핸들러에서만 호출
  const fetchAnalytics = useCallback(async (isSilent = false, tier: HotLeadTier = leadTier) => {
    if (isSilent) setRefreshing(true);
    else setState({ status: 'loading' });
    const next = await requestAnalytics(tier);
    setState(next);
    setRefreshing(false);
  }, [leadTier]);

  const changeLeadTier = (tier: HotLeadTier) => {
    if (tier === leadTier) return;
    setLeadTier(tier);
    void fetchAnalytics(true, tier);
  };

  // 최초 로드: state 초기값이 이미 'loading' 이므로 effect 본문에서 동기 setState 하지 않고,
  // 응답 콜백에서만 상태를 갱신한다 (언마운트 후 갱신 방지 포함)
  useEffect(() => {
    let alive = true;
    requestAnalytics('warm').then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);


  if (state.status === 'loading') {
    return (
      <div className="@container space-y-5" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">매거진 성과 및 독자 인텔리전스를 집계하고 있습니다</span>
        <div className="h-16 animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" aria-hidden="true" />
        <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-2.5" aria-hidden="true">

          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-900/80 border border-slate-800/80" />
          ))}
        </div>
        <div className="h-28 animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" aria-hidden="true" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-900/60 border border-slate-800" aria-hidden="true" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <ErrorState
        title="성과 데이터를 불러오지 못했습니다"
        description={state.message}
        onRetry={() => fetchAnalytics()}
      />
    );
  }

  const data = state.data;
  const viewStats = data.viewStats;
  const defs = { ...KPI_DEFINITIONS, ...(data.kpiDefinitions ?? {}) } as Record<string, string>;
  const lastDist = data.lastDistribution;
  const tempDist = data.temperatureDistribution ?? {};
  const hotLeads = data.hotLeads ?? [];
  const sectionStats = data.sectionStats ?? [];
  const editions = data.editions ?? [];
  const poll = data.latestPollResults ?? null;

  // 서버가 tier 기준으로 이미 선별·정렬한 목록이다 (점수 0·냉각·미확인 제외)
  const filteredLeads = hotLeads;
  const leadQuery = data.hotLeadQuery;
  const totalSubscribers = data.totalSubscribers ?? data.subscriberCount;
  const tierOption = LEAD_TIER_OPTIONS.find((o) => o.value === leadTier) ?? LEAD_TIER_OPTIONS[0];
  const maxSectionCount = Math.max(...sectionStats.map((s) => s.count), 1);
  const dwellSamples = viewStats.dwellSamples ?? (viewStats.avgDwellSeconds > 0 ? 1 : 0);

  return (
    <div className="@container space-y-5">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 p-3.5 rounded-xl backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-body font-bold text-white">독자 인텔리전스 &amp; 성과 대시보드</h3>
            <p className="text-label text-ink-muted">
              구독자의 열람 행동과 관심 콘텐츠를 집계합니다 (최근 30일).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => fetchAnalytics(true)}
          disabled={refreshing}
          className="flex min-h-11 items-center gap-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-body text-slate-300 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : ''}`} aria-hidden="true" />
          <span>새로고침</span>
        </button>
      </div>

      {/* ── 안내 배너: KPI 가 0 인 사유 / 데이터 품질 ── */}
      {data.kpiNotice ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 text-body text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{data.kpiNotice.message}</span>
        </div>
      ) : null}
      {data.dataQuality?.legacyExcluded ? (
        <p className="text-label text-ink-subtle">{data.dataQuality.note}</p>
      ) : null}
      {viewStats.truncated ? (
        <p className="text-label text-amber-300">이벤트가 많아 일부만 집계되었습니다. 수치는 실제보다 적을 수 있습니다.</p>
      ) : null}

      {/* ── 1. KPI ── */}
      <div className="grid grid-cols-2 @2xl:grid-cols-4 gap-2.5">
        <KpiCard
          label="30일 총 열람"
          definition={defs.totalViews}
          icon={<Eye className="w-4 h-4 text-indigo-400" />}
          value={viewStats.totalViews.toLocaleString()}
          unit="회"
          sub={`고유 방문자 ${viewStats.uniqueVisitors.toLocaleString()}명`}
        />
        <KpiCard
          label="평균 체류시간"
          definition={defs.avgDwellSeconds}
          icon={<Clock className="w-4 h-4 text-emerald-400" />}
          value={formatSeconds(viewStats.avgDwellSeconds, dwellSamples)}
          unit={dwellSamples > 0 ? '초' : undefined}
          sub={dwellSamples > 0 ? `체류 기록 ${dwellSamples.toLocaleString()}건 기준` : '체류 기록이 아직 없습니다'}
          subTone={dwellSamples > 0 ? 'good' : 'muted'}
        />
        <KpiCard
          label="완독률"
          definition={defs.completionRate}
          icon={<CheckCircle2 className="w-4 h-4 text-purple-400" />}
          value={viewStats.completionBase === 0 ? '—' : String(viewStats.completionRate)}
          unit={viewStats.completionBase === 0 ? undefined : '%'}
          sub="열람 방문자 중 끝까지 읽은 비율"
        />
        <KpiCard
          label="활성 구독자"
          definition={defs.subscriberCount}
          icon={<Users className="w-4 h-4 text-amber-400" />}
          value={data.subscriberCount.toLocaleString()}
          unit="명"
          sub={lastDist ? `최근 배포: ${lastDist.date || '완료'} (${lastDist.sentCount}건)` : '배포 이력이 아직 없습니다'}
        />
      </div>

      {/* ── 1.5 독자 투표 ── */}
      {data.pollUnavailable === 'NOT_MIGRATED' ? (
        <p role="status" className="text-label text-amber-300">
          독자 투표 집계를 사용하려면 데이터베이스 업데이트가 필요합니다. 관리자에게 문의해 주세요.
        </p>
      ) : null}
      {poll && poll.choices ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-body font-bold text-slate-200 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-violet-400" aria-hidden="true" />
              이번 주 독자 투표 현황
            </h4>
            <span className="text-label text-ink-subtle">총 {poll.total}명 참여</span>
          </div>
          <p className="text-body font-bold text-white">{poll.question}</p>
          <div className="space-y-2.5">
            {poll.choices.map((choice, idx) => {
              const count = poll.counts[idx] || 0;
              const pct = poll.total > 0 ? Math.round((count / poll.total) * 100) : 0;
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-body">
                    <span className="text-slate-300 font-medium">{choice}</span>
                    <span className="text-label font-bold text-violet-200">{pct}% ({count}명)</span>
                  </div>
                  <div
                    className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"
                    role="progressbar"
                    aria-label={`${choice} 응답 비율`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    aria-valuetext={`${pct}% (${count}명)`}
                  >
                    <div className="h-full rounded-full bg-violet-400 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <PollHourly hourly={poll.hourly} hidden={poll.hourlyHidden} />
        </div>
      ) : null}

      {/* ── 2. 5단계 온도 분포 (전체 활성 구독자 기준, 표시 전용) ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
        <span className="text-body font-bold text-slate-300 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
          바이어 매수 참여도 (5단계 온도)
        </span>
        <p className="text-label text-ink-subtle">{defs.temperature}</p>
        <ul className="grid grid-cols-3 @lg:grid-cols-5 gap-1.5" aria-label="매수 온도 단계별 구독자 수">
          {TEMPERATURE_TIERS.map((tier) => {
            const count = tempDist[tier.label] || 0;
            return (
              <li
                key={tier.label}
                aria-label={`${tier.label} ${count}명`}
                className="p-2 rounded-lg border border-white/5 text-center"
                style={{ background: tier.bg }}
              >
                <div className="text-label font-bold truncate text-slate-100">{tier.label}</div>
                <div className="text-body font-black text-white mt-0.5">
                  {count}<span className="text-label font-normal text-ink-muted ml-0.5">명</span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── 3. 핫리드 (서버가 점수 임계로 선별) ── */}
      <div
        className="bg-gradient-to-br from-rose-950/20 via-slate-900/60 to-slate-900/80 border border-rose-500/20 rounded-xl p-4 space-y-3"
        aria-busy={refreshing}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h4 className="text-body font-bold text-rose-200">지금 연락해야 할 핫리드</h4>
            <span className="text-label bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
              {filteredLeads.length}명
            </span>
          </div>
          <span className="text-label text-ink-subtle">
            {leadQuery && leadQuery.matched > leadQuery.returned
              ? `${leadQuery.matched}명 중 반응 점수 상위 ${leadQuery.returned}명`
              : `전체 활성 구독자 ${totalSubscribers.toLocaleString()}명 중`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="핫리드 선별 기준">
          {LEAD_TIER_OPTIONS.map((opt) => {
            const selected = opt.value === leadTier;
            return (
              <button
                type="button"
                key={opt.value}
                aria-pressed={selected}
                disabled={refreshing}
                title={opt.hint}
                onClick={() => changeLeadTier(opt.value)}
                className={`min-h-11 px-3 rounded-lg border text-label font-bold transition-colors focus-visible:outline-2 focus-visible:outline-indigo-400 disabled:opacity-60 ${
                  selected
                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                    : 'border-white/10 bg-slate-800/60 text-ink-muted hover:text-slate-100'
                }`}
              >
                {selected ? '✓ ' : ''}{opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-label text-ink-subtle">
          {data.hotLeadThreshold?.rule ?? tierOption.hint}
        </p>

        {filteredLeads.length === 0 ? (
          <EmptyState
            title="아직 관심 신호가 있는 구독자가 없습니다"
            description={
              leadTier === 'all'
                ? `활성 구독자 ${totalSubscribers.toLocaleString()}명 중 열람·클릭 반응이 기록된 분이 아직 없습니다. 구독자가 개인 링크로 호수를 열람하면 이곳에 표시됩니다.`
                : `활성 구독자 ${totalSubscribers.toLocaleString()}명 중 이 기준(${tierOption.hint})에 도달한 분이 없습니다.`
            }
            action={leadTier === 'all' ? undefined : { label: '반응 있는 전체 보기', onClick: () => changeLeadTier('all') }}
          />

        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto scrollbar-none pr-1">
            {filteredLeads.map((lead) => {
              const interestTags = [...(lead.interest_tags?.regions || []), ...(lead.interest_tags?.assetTypes || [])];
              const reasonText = lead.temperatureReason ? REASON_TEXT[lead.temperatureReason] : undefined;
              return (
                <div
                  key={lead.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-rose-500/40 rounded-xl p-3 transition-all flex flex-col @lg:flex-row @lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-label font-bold px-2 py-0.5 rounded-full"
                        style={{
                          background: lead.temperatureConfig?.badgeBg || 'rgba(239,68,68,0.15)',
                          color: lead.temperatureConfig?.color || '#ef4444',
                        }}
                      >
                        {lead.buyerTemperature}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailLead({ id: lead.id, name: lead.subscriber_name })}
                        className="min-h-11 text-body font-bold text-white underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-indigo-400"
                        aria-label={`${lead.subscriber_name} 열람 상세 보기`}
                      >
                        {lead.subscriber_name}
                      </button>
                      <span className="text-label text-ink-muted">({lead.subscriber_phone})</span>
                      {lead.segment ? (
                        <span className="text-label bg-slate-800 text-ink-muted px-1.5 py-0.5 rounded">{lead.segment}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-label text-ink-muted flex-wrap">
                      <span>총 {lead.totalViews}회 열람</span>
                      {lead.recentSections.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-rose-300/90 truncate">집중: {lead.recentSections.join(', ')}</span>
                        </>
                      ) : null}
                      {interestTags.length > 0 ? (
                        <>
                          <span>·</span>
                          <span className="text-ink-subtle truncate">관심: {interestTags.slice(0, 3).join('/')}</span>
                        </>
                      ) : null}
                      {reasonText ? (
                        <>
                          <span>·</span>
                          <span className="text-amber-300">{reasonText}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end @lg:self-center">
                    <button
                      type="button"
                      onClick={() => setBriefingLead(lead)}
                      className="flex min-h-11 items-center gap-1 px-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-body font-medium transition-colors"
                      title="통화 전 참고용 브리핑 템플릿 열기"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                      <span>통화 브리핑(템플릿)</span>
                    </button>
                    <a
                      href={`tel:${lead.subscriber_phone}`}
                      className="flex min-h-11 items-center gap-1 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-body font-bold transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>전화걸기</span>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 4. 섹션별 관심도 ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-body font-bold text-slate-200 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
            콘텐츠별 독자 관심도
          </h4>
          <span className="text-label text-ink-subtle">열람수 및 평균 체류시간</span>
        </div>
        {sectionStats.length === 0 ? (
          <EmptyState title="섹션별 열람 데이터가 아직 없습니다" description="독자가 호수를 열람하면 섹션별 열람수와 체류시간이 표시됩니다." />
        ) : (
          <div className="space-y-2.5" role="list" aria-label="섹션별 열람수와 평균 체류시간">
            {sectionStats.slice(0, 6).map((sec, idx) => {
              const pct = Math.round((sec.count / maxSectionCount) * 100);
              return (
                <div key={sec.sectionId} role="listitem" className="space-y-1">
                  <div className="flex items-center justify-between text-body">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span className="text-label text-ink-subtle w-4">{idx + 1}.</span>
                      {sec.label}
                    </span>
                    <span className="text-label text-ink-muted flex items-center gap-2">
                      <span className="text-white font-bold">열람 {sec.count}회</span>
                      <span className="text-ink-subtle" aria-hidden="true">|</span>
                      <span>평균 체류 {formatSeconds(sec.avgDwellSeconds, sec.dwellSamples ?? (sec.avgDwellSeconds > 0 ? 1 : 0))}{(sec.dwellSamples ?? sec.avgDwellSeconds) > 0 ? '초' : ''}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden" aria-hidden="true">
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

      {/* ── 5. 에디션별 성과 ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-body font-bold text-slate-200 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-ink-muted" aria-hidden="true" />
            발행 에디션별 성과
          </h4>
          <span className="text-label text-ink-subtle">최근 20건</span>
        </div>
        {editions.length === 0 ? (
          <EmptyState title="아직 발행된 에디션이 없습니다" description="에디션을 발행하면 열람수가 여기에 표시됩니다." />
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
            {editions.map((ed) => {
              const dateStr = (ed.published_at || ed.created_at)?.slice(0, 10);
              return (
                <div
                  key={ed.id}
                  className="flex items-center justify-between bg-black/20 border border-white/5 hover:border-slate-700 p-2.5 rounded-lg text-body"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-label text-ink-subtle">{dateStr}</span>
                      <span className="text-label text-indigo-400 font-mono">{ed.edition_label}</span>
                      {ed.market_temp ? (
                        <span className="text-label px-1.5 rounded bg-slate-800 text-slate-300">{ed.market_temp}</span>
                      ) : null}
                    </div>
                    <p className="text-white font-medium truncate">{ed.title || '제목 없음'}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-white font-bold">{ed.view_count ?? 0}회</div>
                      <div className="text-label text-ink-subtle">열람수</div>
                    </div>
                    <a
                      href={`/magazine/${ed.broker_id}/${dateStr}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      aria-label="새 창에서 열기"
                      title="새 창에서 열기"
                    >
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CallBriefingModal lead={briefingLead} onClose={() => setBriefingLead(null)} />
      <SubscriberDetailPanel
        subscriberId={detailLead?.id ?? null}
        fallbackName={detailLead?.name}
        onClose={() => setDetailLead(null)}
      />
    </div>
  );
}
