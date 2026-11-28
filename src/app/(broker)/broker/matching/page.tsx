'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { MatchStageBreakdown } from '@/components/matching/MatchStageBreakdown';
import { Share, MessageSquare, Briefcase, User, Sparkles, Building2, Calendar, Users, ShieldCheck } from 'lucide-react';

interface MatchResult {

  id: string;
  building_ssot_lite_id: string;
  buyer_intent_lite_id: string;
  grade: 'S' | 'A' | 'B' | 'C';
  score: number;
  reasoning: string;
  purpose_weight_profile: string;
  created_at: string;
  stage1_passed?: boolean;
  stage1_details?: any;
  stage2_similarity?: number;
  stage3_score?: number;
  stage3_weights?: any;
  // joined
  building_area?: string;
  building_asset_type?: string;
  building_price?: string;
  buyer_type?: string;
  buyer_budget?: string;
  buyer_purpose?: string;
}

const GRADE_STYLES: Record<string, { bg: string; text: string; label: string; border: string }> = {
  S: { bg: 'bg-emerald-50', text: 'text-[#047857]', border: 'border-emerald-200', label: 'S — 최우선' },
  A: { bg: 'bg-blue-50', text: 'text-[#1D4ED8]', border: 'border-blue-200', label: 'A — 높은 적합도' },
  B: { bg: 'bg-amber-50', text: 'text-[#8A4B00]', border: 'border-amber-200', label: 'B — 참고 가능' },
  C: { bg: 'bg-rose-50', text: 'text-[#C8102E]', border: 'border-rose-200', label: 'C — 매칭 미흡' },
};

type ViewMode = 'deal-centric' | 'buyer-centric' | 'team-circle';

interface DealGroup {
  buildingId: string;
  buildingArea: string;
  buildingAssetType: string;
  buildingPrice: string;
  matches: MatchResult[];
}

interface BuyerGroup {
  buyerId: string;
  buyerType: string;
  buyerBudget: string;
  buyerPurpose: string;
  matches: MatchResult[];
}

function MatchingBoardContent() {
  const searchParams = useSearchParams();
  const buildingIdParam = searchParams?.get('buildingId');
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('deal-centric');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setMatches([]);
        setExpandedGroupId(null);
        return;
      }

      // 본인 소유 데이터 조회
      const { data: matchData } = await supabase
        .from('match_results')
        .select(`
          id, building_ssot_lite_id, buyer_intent_lite_id, 
          grade, score, reasoning, purpose_weight_profile, created_at,
          stage1_passed, stage1_details, stage2_similarity, stage3_weights
        `)
        .eq('broker_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (matchData && matchData.length > 0) {
        // Enrich with building and buyer info
        const buildingIds = [...new Set(matchData.map((m) => m.building_ssot_lite_id))];
        const buyerIds = [...new Set(matchData.map((m) => m.buyer_intent_lite_id))];

        const { data: buildings } = await supabase
          .from('building_ssot_lite')
          .select('id, area_signal, asset_type, price_band')
          .in('id', buildingIds);

        const { data: buyers } = await supabase
          .from('buyer_intent_lite')
          .select('id, buyer_type, budget_display, purchase_purpose')
          .in('id', buyerIds);

        const buildingMap = new Map((buildings ?? []).map((b: any) => [b.id, b]));
        const buyerMap = new Map((buyers ?? []).map((b: any) => [b.id, b]));

        const enriched = matchData.map((m) => {
          const b = buildingMap.get(m.building_ssot_lite_id);
          const bi = buyerMap.get(m.buyer_intent_lite_id);
          return {
            ...m,
            building_area: b?.area_signal ?? '미확인',
            building_asset_type: b?.asset_type ?? '',
            building_price: b?.price_band ?? '',
            buyer_type: bi?.buyer_type ?? '매수자',
            buyer_budget: bi?.budget_display ?? '',
            buyer_purpose: bi?.purchase_purpose ?? '',
          };
        });

        setMatches(enriched);
        setExpandedGroupId(buildingIdParam || enriched[0]?.building_ssot_lite_id);
      } else {
        setMatches([]);
        setExpandedGroupId(null);
      }
    } catch {
      setMatches([]);
      setExpandedGroupId(null);
    } finally {
      setLoading(false);
    }
  }, [buildingIdParam]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Group data based on ViewMode
  const { dealGroups, buyerGroups } = useMemo(() => {
    const dMap = new Map<string, DealGroup>();
    const bMap = new Map<string, BuyerGroup>();

    matches.forEach((m) => {
      // Deal grouping
      if (!dMap.has(m.building_ssot_lite_id)) {
        dMap.set(m.building_ssot_lite_id, {
          buildingId: m.building_ssot_lite_id,
          buildingArea: m.building_area || '',
          buildingAssetType: m.building_asset_type || '',
          buildingPrice: m.building_price || '',
          matches: [],
        });
      }
      dMap.get(m.building_ssot_lite_id)!.matches.push(m);

      // Buyer grouping
      if (!bMap.has(m.buyer_intent_lite_id)) {
        bMap.set(m.buyer_intent_lite_id, {
          buyerId: m.buyer_intent_lite_id,
          buyerType: m.buyer_type || '',
          buyerBudget: m.buyer_budget || '',
          buyerPurpose: m.buyer_purpose || '',
          matches: [],
        });
      }
      bMap.get(m.buyer_intent_lite_id)!.matches.push(m);
    });

    // Sort matches internally by score
    dMap.forEach((group) => group.matches.sort((a, b) => b.score - a.score));
    bMap.forEach((group) => group.matches.sort((a, b) => b.score - a.score));

    const dealGroupList = Array.from(dMap.values());
    if (buildingIdParam) {
      dealGroupList.sort((a, b) => {
        if (a.buildingId === buildingIdParam) return -1;
        if (b.buildingId === buildingIdParam) return 1;
        return 0;
      });
    }

    return {
      dealGroups: dealGroupList,
      buyerGroups: Array.from(bMap.values()),
    };
  }, [matches, buildingIdParam]);

  // Handle Tab Switch
  const handleTabSwitch = (mode: ViewMode) => {
    setViewMode(mode);
    setExpandedGroupId(null);
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24 bg-[#F5F5F7] text-[#1D1D1F]">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-xl font-bold tracking-tight text-[#1D1D1F]">AI 매칭 센터</h1>
          <p className="text-sm text-[#515154] mt-1">
            내 매물과 매수자를 연결하는 가장 빠른 방법
          </p>
        </div>

        {/* 특정 매물 필터 배너 if buildingIdParam */}
        {buildingIdParam && (
          <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">🏢</span>
              <span className="text-sm font-semibold text-[#0055D4]">지정 매물 연계 AI 매칭</span>
            </div>
            <Link
              href={`/broker/deal-card/${buildingIdParam}`}
              className="text-sm font-bold text-[#0055D4] hover:underline"
            >
              ← 딜카드로 돌아가기
            </Link>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="ios-segmented-track p-1 rounded-xl flex gap-1">
          <button
            onClick={() => handleTabSwitch('deal-centric')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              viewMode === 'deal-centric'
                ? 'ios-segmented-pill text-[#1D1D1F]'
                : 'text-[#515154] hover:text-[#1D1D1F]'
            }`}
          >
            내 매물 기준
          </button>
          <button
            onClick={() => handleTabSwitch('buyer-centric')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              viewMode === 'buyer-centric'
                ? 'ios-segmented-pill text-[#1D1D1F]'
                : 'text-[#515154] hover:text-[#1D1D1F]'
            }`}
          >
            내 고객 기준
          </button>
          <button
            onClick={() => handleTabSwitch('team-circle')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              viewMode === 'team-circle'
                ? 'bg-amber-100 text-[#8A4B00] shadow-sm font-extrabold border border-amber-300'
                : 'text-[#515154] hover:text-[#1D1D1F]'
            }`}
          >
            🤝 팀 서클
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-slate-200/80 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : viewMode === 'team-circle' ? (
          <div className="pt-2 space-y-4">
            <div className="ios-glass-card rounded-2xl border-amber-200 p-6 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl">
                🤝
              </div>
              <div>
                <h3 className="text-[18px] font-extrabold text-[#1D1D1F]">신뢰 동료와 크로스 팀 매칭</h3>
                <p className="text-sm text-[#515154] mt-1 leading-relaxed">
                  서클을 개설하고 물건·매수의향을 공유하면 AI가 2단계 프라이버시 원칙으로 팀 크로스 매칭을 탐색합니다.
                </p>
              </div>

              <div className="pt-2">
                <Link href="/broker/circles">
                  <button className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-[#1D1D1F] font-extrabold text-[15px] rounded-xl shadow-md transition-all">
                    내 서클 대시보드로 이동 →
                  </button>
                </Link>
              </div>
            </div>
          </div>
        ) : viewMode === 'deal-centric' ? (
          dealGroups.length === 0 ? (
            <div className="ios-glass-card rounded-2xl p-6 text-center space-y-3">
              <p className="text-base font-bold text-[#1D1D1F]">아직 매칭 결과가 없습니다</p>
              <p className="text-sm text-[#515154] leading-relaxed">
                매물 딜카드를 등록하거나 고객 소통함에서 매수 문의를 확인해 보세요.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Link
                  href="/broker/w/inbox"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#0055D4] hover:bg-[#0040DD] px-4 py-2 text-sm font-bold text-white"
                >
                  고객 소통함으로 이동 →
                </Link>
                <Link
                  href="/broker/w/dealcards"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[#1D1D1F]"
                >
                  딜카드 작업공간
                </Link>
              </div>
            </div>
          ) : (
          <div className="space-y-4 pt-2">
            {dealGroups.map((group) => {
              const isExpanded = expandedGroupId === group.buildingId;
              const sOrACount = group.matches.filter(m => m.grade === 'S' || m.grade === 'A').length;

              return (
                <div key={group.buildingId} className={`ios-glass-card rounded-xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-[#0055D4]/30' : 'hover:border-[#0055D4]/30'}`}>
                  {/* Group Header (Building) */}
                  <div 
                    className="p-4 cursor-pointer flex items-start gap-3"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.buildingId)}
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200 flex-shrink-0">
                      <Building2 className="w-6 h-6 text-[#515154]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-[15px] font-bold truncate text-[#1D1D1F]">
                          {group.buildingArea} {group.buildingAssetType}
                        </h2>
                        {sOrACount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#047857] border border-emerald-200 text-sm font-bold whitespace-nowrap">
                            S/A급 {sOrACount}명
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#515154]">{group.buildingPrice}</p>
                      
                      {!isExpanded && (
                        <p className="text-sm text-[#0055D4] font-medium mt-2 flex items-center gap-1">
                          <User className="w-4 h-4" /> 매칭 대기 중인 매수자 {group.matches.length}명 보기
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content (Matched Buyers) */}
                  {isExpanded && (
                    <div className="bg-slate-50/90 border-t border-slate-200 p-3 space-y-3 animate-fadeIn">
                      <h3 className="text-sm font-bold text-[#515154] px-1 uppercase tracking-wider">Matched Buyers</h3>
                      
                      {group.matches.map((match) => (
                        <MatchCard key={match.id} match={match} type="buyer" />
                      ))}

                      <div className="pt-2 px-1 pb-1 flex gap-2">
                        {group.matches.some(m => m.grade === 'S' || m.grade === 'A') && (
                          <Link 
                            href={`/broker/schedule?buildingId=${group.buildingId}`}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-[#1D1D1F] font-bold text-sm shadow-sm transition-colors"
                          >
                            <Calendar className="w-4 h-4" />
                            바로 임장 잡기
                          </Link>
                        )}
                        <Link 
                          href={`/broker/deal-card/${group.buildingId}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-lg bg-[#1D1D1F] hover:bg-[#3A3A3C] text-white font-bold text-sm shadow-sm transition-opacity"
                        >
                          <Share className="w-4 h-4" />
                          매수자에게 이 딜카드 전송하기
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )
        ) : (
          buyerGroups.length === 0 ? (
            <div className="ios-glass-card rounded-2xl p-6 text-center space-y-3">
              <p className="text-base font-bold text-[#1D1D1F]">등록된 매칭 고객이 없습니다</p>
              <p className="text-sm text-[#515154] leading-relaxed">
                고객 소통함에서 접수된 매수 문의를 확인하고 후속 상담을 이어가 보세요.
              </p>
              <div className="pt-1">
                <Link
                  href="/broker/w/inbox"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#0055D4] hover:bg-[#0040DD] px-4 py-2 text-sm font-bold text-white"
                >
                  고객 소통함으로 이동 →
                </Link>
              </div>
            </div>
          ) : (
          <div className="space-y-4 pt-2">
            {buyerGroups.map((group) => {
              const isExpanded = expandedGroupId === group.buyerId;
              const sOrACount = group.matches.filter(m => m.grade === 'S' || m.grade === 'A').length;

              return (
                <div key={group.buyerId} className={`ios-glass-card rounded-xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-[#0055D4]/30' : 'hover:border-[#0055D4]/30'}`}>
                  {/* Group Header (Buyer) */}
                  <div 
                    className="p-4 cursor-pointer flex items-start gap-3"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.buyerId)}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center border border-blue-200 flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-[#0055D4]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-[15px] font-bold truncate text-[#1D1D1F]">
                          {group.buyerType}
                        </h2>
                        {sOrACount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1D4ED8] border border-blue-200 text-sm font-bold whitespace-nowrap">
                            추천 매물 {sOrACount}건
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#515154] flex gap-1.5 items-center">
                        <span className="font-medium text-[#1D1D1F]">{group.buyerBudget}</span>
                        <span className="text-slate-300">|</span>
                        <span>{group.buyerPurpose}</span>
                      </p>
                      
                      {!isExpanded && (
                        <p className="text-sm text-[#0055D4] font-medium mt-2 flex items-center gap-1">
                          <Building2 className="w-4 h-4" /> 매칭된 건물 {group.matches.length}건 보기
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content (Matched Deals) */}
                  {isExpanded && (
                    <div className="bg-blue-50/50 border-t border-slate-200 p-3 space-y-3 animate-fadeIn">
                      <h3 className="text-sm font-bold text-[#515154] px-1 uppercase tracking-wider">Matched Properties</h3>
                      
                      {group.matches.map((match) => (
                        <MatchCard key={match.id} match={match} type="deal" />
                      ))}

                      <div className="pt-2 px-1 pb-1">
                        <Link 
                          href={`/broker/buyer-intents/${group.buyerId}`}
                          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg bg-[#0055D4] hover:bg-[#0040DD] text-white font-bold text-sm shadow-sm transition-colors"
                        >
                          <MessageSquare className="w-4 h-4" />
                          이 매수자를 위한 맞춤 보고서 작성
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )
        )}
      </div>

      <BrokerBottomNav />
    </main>
  );
}

// Subcomponent for rendering individual match items
function MatchCard({ match, type }: { match: MatchResult, type: 'buyer' | 'deal' }) {
  const [showDetails, setShowDetails] = useState(false);
  const style = GRADE_STYLES[match.grade];

  return (
    <div className={`rounded-xl border bg-white p-3 space-y-2 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-sm font-bold ${style.bg} ${style.text}`}>
            {match.grade}
          </span>
          <div>
            {type === 'buyer' ? (
              <>
                <p className="text-sm font-bold leading-tight text-[#1D1D1F]">{match.buyer_type}</p>
                <p className="text-sm text-[#515154]">{match.buyer_budget} · {match.buyer_purpose}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold leading-tight text-[#1D1D1F]">{match.building_area} {match.building_asset_type}</p>
                <p className="text-sm text-[#515154]">{match.building_price}</p>
              </>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold ${style.text}`}>
            {Math.round(match.score)}<span className="text-sm font-normal ml-0.5 text-[#515154]">점</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-[#515154] leading-relaxed pl-9">
        {match.reasoning}
      </p>

      <div className="pl-9 pt-1">
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm font-semibold flex items-center gap-1 text-[#0055D4] hover:underline"
        >
          <Sparkles className="w-4 h-4" /> 
          {showDetails ? '정밀 분석 닫기' : 'AI 3단계 정밀 분석 열기'}
        </button>
      </div>

      {showDetails && (
        <div className="pl-9 pt-2 animate-fadeIn">
          <MatchStageBreakdown
            stage1Passed={match.stage1_passed ?? true}
            stage1Details={match.stage1_details ?? { region: true, budget: true, asset: true }}
            stage2Similarity={match.stage2_similarity ?? (match.score / 100)}
            stage3Score={match.score}
            stage3Weights={match.stage3_weights ?? {}}
            grade={match.grade}
            matchId={match.id}
          />
          <div className="mt-3 flex justify-end gap-2">
             {(match.grade === 'S' || match.grade === 'A') && (
                <Link href={`/broker/schedule?buildingId=${match.building_ssot_lite_id}`} className="text-sm px-3 py-1.5 rounded-md bg-amber-500 text-[#1D1D1F] font-semibold hover:bg-amber-400 transition-colors flex items-center gap-1">
                  <Calendar className="w-4 h-4" /> 일정 조율
                </Link>
             )}
             {type === 'buyer' ? (
                <Link href={`/broker/buyer-intents/${match.buyer_intent_lite_id}`} className="text-sm px-3 py-1.5 rounded-md bg-slate-100 text-[#1D1D1F] font-semibold hover:bg-slate-200 transition-colors">
                  매수자 프로필 이동 →
                </Link>
             ) : (
                <Link href={`/broker/deal-card/${match.building_ssot_lite_id}`} className="text-sm px-3 py-1.5 rounded-md bg-blue-50 text-[#1D4ED8] font-semibold hover:bg-blue-100 transition-colors">
                  딜카드 상세 보기 →
                </Link>
             )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchingBoardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24 bg-[#F5F5F7]">
          <div className="w-full max-w-md mx-auto space-y-5 pt-4">
            <div className="h-10 bg-slate-200/80 rounded-xl animate-pulse" />
            <div className="h-12 bg-slate-200/80 rounded-xl animate-pulse" />
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-slate-200/80 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      }
    >
      <MatchingBoardContent />
    </Suspense>
  );
}
