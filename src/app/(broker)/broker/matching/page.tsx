'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { MatchStageBreakdown } from '@/components/matching/MatchStageBreakdown';
import { Share, MessageSquare, Briefcase, User, Sparkles, Building2 } from 'lucide-react';

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
  S: { bg: 'bg-emerald-50 dark:bg-emerald-950/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-900/50', label: 'S — 최우선' },
  A: { bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-900/50', label: 'A — 높은 적합도' },
  B: { bg: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-900/50', label: 'B — 참고 가능' },
  C: { bg: 'bg-rose-50 dark:bg-rose-950/20', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-900/50', label: 'C — 매칭 미흡' },
};

// 데모 폴백 데이터
const DEMO_MATCHES: MatchResult[] = [
  {
    id: 'demo-s-001',
    building_ssot_lite_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    buyer_intent_lite_id: 'cccccccc-0000-0000-0000-000000000001',
    grade: 'S',
    score: 89,
    stage1_passed: true,
    stage2_similarity: 0.91,
    stage3_score: 87,
    reasoning: '예산(70~85억)·지역(성동구)·자산유형(꼬마빌딩/근생) 3개 조건 완벽 일치. 1층 카페 임차 선호 조건까지 충족. 엘리베이터 없음도 무관하다고 명시. 시맨틱 유사도 0.91로 최고 수준. 즉시 연락 권장.',
    purpose_weight_profile: '투자',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    building_area: '성수동',
    building_asset_type: '꼬마빌딩(근생+사무)',
    building_price: '70억~78억',
    buyer_type: '개인 투자자 (홍○○)',
    buyer_budget: '70억~85억',
    buyer_purpose: '임대수익 투자',
  },
  {
    id: 'demo-a-002',
    building_ssot_lite_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    buyer_intent_lite_id: 'cccccccc-0000-0000-0000-000000000002',
    grade: 'A',
    score: 76,
    stage1_passed: true,
    stage2_similarity: 0.74,
    stage3_score: 78,
    reasoning: '예산(65~75억) 하단 — 매물 가격(70~78억)과 부분 겹침. 성동구 포함으로 지역 일치. 사옥 목적이라 엘리베이터 없음이 약점이나 주차 3대 확보로 보완. 대지 150평으로 120평 이상 조건 충족.',
    purpose_weight_profile: '사옥',
    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    building_area: '성수동',
    building_asset_type: '꼬마빌딩(근생+사무)',
    building_price: '70억~78억',
    buyer_type: '법인 (김○○ 대표)',
    buyer_budget: '65억~75억',
    buyer_purpose: '사옥 + 일부 임대',
  },
  {
    id: 'demo-b-003',
    building_ssot_lite_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    buyer_intent_lite_id: 'cccccccc-0000-0000-0000-000000000003',
    grade: 'B',
    score: 54,
    stage1_passed: true,
    stage2_similarity: 0.58,
    stage3_score: 51,
    reasoning: '예산(75~80억) 범위 내에 있으나 완전 임차 상태 필수 조건에서 2~4층 공실로 인해 감점. 지역도 마포/은평/서대문으로 성동구와 다소 거리 있음. 추가 상담 후 지역 범위 조정 가능성 있음.',
    purpose_weight_profile: '투자',
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    building_area: '성수동',
    building_asset_type: '꼬마빌딩(근생+사무)',
    building_price: '70억~78억',
    buyer_type: '개인 투자자 (이○○)',
    buyer_budget: '75억~80억',
    buyer_purpose: '임대수익',
  },
  {
    id: 'demo-c-004',
    building_ssot_lite_id: 'aaaaaaaa-0000-0000-0000-000000000001',
    buyer_intent_lite_id: 'cccccccc-0000-0000-0000-000000000004',
    grade: 'C',
    score: 32,
    stage1_passed: false,
    stage2_similarity: 0.31,
    stage3_score: 32,
    reasoning: 'Stage 1 탈락: 예산(55~65억)이 매물 호가(70억~78억)보다 5~15억 부족. 지역도 성동구와 불일치. 현재 조건으로는 매칭 성사 어려움. 예산 재조정 상담 필요.',
    purpose_weight_profile: '투자',
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    building_area: '성수동',
    building_asset_type: '꼬마빌딩(근생+사무)',
    building_price: '70억~78억',
    buyer_type: '개인 (박○○)',
    buyer_budget: '55억~65억',
    buyer_purpose: '임대수익',
  },
  {
    id: 'demo-a-005',
    building_ssot_lite_id: 'aaaaaaaa-0000-0000-0000-000000000002',
    buyer_intent_lite_id: 'cccccccc-0000-0000-0000-000000000001',
    grade: 'A',
    score: 82,
    stage1_passed: true,
    stage2_similarity: 0.85,
    stage3_score: 80,
    reasoning: '강남 역세권 빌딩으로 매수자의 임대수익 목적에 매우 부합합니다. 다만 예산 한도(85억)에 근접해 추가 협의가 필요합니다.',
    purpose_weight_profile: '투자',
    created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    building_area: '역삼동',
    building_asset_type: '근생빌딩',
    building_price: '85억',
    buyer_type: '개인 투자자 (홍○○)',
    buyer_budget: '70억~85억',
    buyer_purpose: '임대수익 투자',
  },
];

type ViewMode = 'deal-centric' | 'buyer-centric';

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

export default function MatchingBoardPage() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('deal-centric');
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();

      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

      // 본인 소유 데이터가 없거나 에러 날 수 있으니 바로 DB 조회
      const { data: matchData } = await supabase
        .from('match_results')
        .select(`
          id, building_ssot_lite_id, buyer_intent_lite_id, 
          grade, score, reasoning, purpose_weight_profile, created_at,
          stage1_passed, stage1_details, stage2_similarity, stage3_weights
        `)
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
        setExpandedGroupId(enriched[0]?.building_ssot_lite_id);
      } else {
        // 최종 폴백: 데모 데이터 사용
        setMatches(DEMO_MATCHES);
        setIsDemo(true);
        setExpandedGroupId(DEMO_MATCHES[0].building_ssot_lite_id);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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

    return {
      dealGroups: Array.from(dMap.values()),
      buyerGroups: Array.from(bMap.values()),
    };
  }, [matches]);

  // Handle Tab Switch
  const handleTabSwitch = (mode: ViewMode) => {
    setViewMode(mode);
    setExpandedGroupId(null);
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24 bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-xl font-bold tracking-tight">AI 매칭 센터</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            내 매물과 매수자를 연결하는 가장 빠른 방법
          </p>
        </div>

        {/* 데모 배너 */}
        {isDemo && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
            <span className="text-sm">🎬</span>
            <p className="text-[11px] text-amber-500 dark:text-amber-400 font-medium tracking-tight">
              데모 모드: 시연을 위한 매칭 데이터가 표시됩니다.
            </p>
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="bg-muted/50 p-1 rounded-xl flex">
          <button
            onClick={() => handleTabSwitch('deal-centric')}
            className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-all ${
              viewMode === 'deal-centric'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            내 매물 기준
          </button>
          <button
            onClick={() => handleTabSwitch('buyer-centric')}
            className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-all ${
              viewMode === 'buyer-centric'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            내 고객 기준
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : viewMode === 'deal-centric' ? (
          <div className="space-y-4 pt-2">
            {dealGroups.map((group) => {
              const isExpanded = expandedGroupId === group.buildingId;
              const sOrACount = group.matches.filter(m => m.grade === 'S' || m.grade === 'A').length;

              return (
                <div key={group.buildingId} className={`rounded-xl border overflow-hidden transition-all duration-300 ${isExpanded ? 'bg-card shadow-md border-primary/20' : 'bg-card border-border hover:border-primary/30'}`}>
                  {/* Group Header (Building) */}
                  <div 
                    className="p-4 cursor-pointer flex items-start gap-3"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.buildingId)}
                  >
                    <div className="w-12 h-12 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-black/5 flex-shrink-0">
                      <Building2 className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-[15px] font-bold truncate">
                          {group.buildingArea} {group.buildingAssetType}
                        </h2>
                        {sOrACount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 text-[9px] font-bold whitespace-nowrap">
                            S/A급 {sOrACount}명
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{group.buildingPrice}</p>
                      
                      {!isExpanded && (
                        <p className="text-[11px] text-primary font-medium mt-2 flex items-center gap-1">
                          <User className="w-3 h-3" /> 매칭 대기 중인 매수자 {group.matches.length}명 보기
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content (Matched Buyers) */}
                  {isExpanded && (
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border-t p-3 space-y-3 animate-fadeIn">
                      <h3 className="text-[11px] font-bold text-muted-foreground px-1 uppercase tracking-wider">Matched Buyers</h3>
                      
                      {group.matches.map((match) => (
                        <MatchCard key={match.id} match={match} type="buyer" />
                      ))}

                      <div className="pt-2 px-1 pb-1">
                        <Link 
                          href={`/broker/deal-card/${group.buildingId}`}
                          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg bg-zinc-900 dark:bg-white text-zinc-50 dark:text-zinc-900 font-bold text-xs shadow-sm hover:opacity-90 transition-opacity"
                        >
                          <Share className="w-3.5 h-3.5" />
                          매수자에게 이 딜카드 전송하기
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {buyerGroups.map((group) => {
              const isExpanded = expandedGroupId === group.buyerId;
              const sOrACount = group.matches.filter(m => m.grade === 'S' || m.grade === 'A').length;

              return (
                <div key={group.buyerId} className={`rounded-xl border overflow-hidden transition-all duration-300 ${isExpanded ? 'bg-card shadow-md border-blue-500/20' : 'bg-card border-border hover:border-blue-500/30'}`}>
                  {/* Group Header (Buyer) */}
                  <div 
                    className="p-4 cursor-pointer flex items-start gap-3"
                    onClick={() => setExpandedGroupId(isExpanded ? null : group.buyerId)}
                  >
                    <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/30 flex-shrink-0">
                      <Briefcase className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-[15px] font-bold truncate">
                          {group.buyerType}
                        </h2>
                        {sOrACount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 text-[9px] font-bold whitespace-nowrap">
                            추천 매물 {sOrACount}건
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex gap-1.5 items-center">
                        <span className="font-medium text-foreground">{group.buyerBudget}</span>
                        <span className="text-border">|</span>
                        <span>{group.buyerPurpose}</span>
                      </p>
                      
                      {!isExpanded && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium mt-2 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> 매칭된 건물 {group.matches.length}건 보기
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Expanded Content (Matched Deals) */}
                  {isExpanded && (
                    <div className="bg-blue-50/30 dark:bg-blue-950/10 border-t p-3 space-y-3 animate-fadeIn">
                      <h3 className="text-[11px] font-bold text-muted-foreground px-1 uppercase tracking-wider">Matched Properties</h3>
                      
                      {group.matches.map((match) => (
                        <MatchCard key={match.id} match={match} type="deal" />
                      ))}

                      <div className="pt-2 px-1 pb-1">
                        <Link 
                          href={`/broker/buyer-intents/${group.buyerId}`}
                          className="w-full flex items-center justify-center gap-1.5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          이 매수자를 위한 맞춤 보고서 작성
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
    <div className={`rounded-xl border bg-white dark:bg-black p-3 space-y-2 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${style.bg} ${style.text}`}>
            {match.grade}
          </span>
          <div>
            {type === 'buyer' ? (
              <>
                <p className="text-[13px] font-bold leading-tight">{match.buyer_type}</p>
                <p className="text-[10px] text-muted-foreground">{match.buyer_budget} · {match.buyer_purpose}</p>
              </>
            ) : (
              <>
                <p className="text-[13px] font-bold leading-tight">{match.building_area} {match.building_asset_type}</p>
                <p className="text-[10px] text-muted-foreground">{match.building_price}</p>
              </>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold ${style.text}`}>
            {Math.round(match.score)}<span className="text-[9px] font-normal ml-0.5 text-muted-foreground">점</span>
          </p>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed pl-9">
        {match.reasoning}
      </p>

      <div className="pl-9 pt-1">
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="text-[10px] font-semibold flex items-center gap-1 text-primary hover:underline"
        >
          <Sparkles className="w-3 h-3" /> 
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
          <div className="mt-3 flex justify-end">
             {type === 'buyer' ? (
                <Link href={`/broker/buyer-intents/${match.buyer_intent_lite_id}`} className="text-[10px] px-3 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  매수자 프로필 이동 →
                </Link>
             ) : (
                <Link href={`/broker/deal-card/${match.building_ssot_lite_id}`} className="text-[10px] px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                  딜카드 상세 보기 →
                </Link>
             )}
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
