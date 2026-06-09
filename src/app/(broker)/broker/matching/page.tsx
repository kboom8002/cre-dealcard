'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { MatchStageBreakdown } from '@/components/matching/MatchStageBreakdown';

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

// 데모 폴백 데이터 — DB가 비어있을 때 자동 사용
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
];



export default function MatchingBoardPage() {
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [gradeFilter, setGradeFilter] = useState<'all' | 'S' | 'A' | 'B' | 'C'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();

      // Fetch match results
      const res = await fetch('/api/broker/match-board', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const { data } = await res.json();
        if (data && data.length > 0) {
          setMatches(data);
        } else {
          // API 응답은 ok지만 데이터 없음 → Supabase 직접 조회로 넘어감
          throw new Error('empty');
        }
      } else {
        // Fallback: fetch directly from supabase client
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );

        const { data: matchData } = await supabase
          .from('match_results')
          .select(`
            id, building_ssot_lite_id, buyer_intent_lite_id, 
            grade, score, reasoning, purpose_weight_profile, created_at,
            stage1_passed, stage1_details, stage2_similarity, stage3_weights
          `)
          .order('created_at', { ascending: false })
          .limit(50);

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

          const buildingMap = new Map((buildings ?? []).map((b: Record<string, unknown>) => [b.id, b]));
          const buyerMap = new Map((buyers ?? []).map((b: Record<string, unknown>) => [b.id, b]));

          const enriched = matchData.map((m) => {
            const b = buildingMap.get(m.building_ssot_lite_id) as Record<string, string> | undefined;
            const bi = buyerMap.get(m.buyer_intent_lite_id) as Record<string, string> | undefined;
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
        } else {
          // 최종 폴백: 데모 데이터 사용
          setMatches(DEMO_MATCHES);
          setIsDemo(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const filteredMatches = gradeFilter === 'all'
    ? matches
    : matches.filter((m) => m.grade === gradeFilter);

  const gradeCounts = {
    S: matches.filter((m) => m.grade === 'S').length,
    A: matches.filter((m) => m.grade === 'A').length,
    B: matches.filter((m) => m.grade === 'B').length,
    C: matches.filter((m) => m.grade === 'C').length,
  };

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-5">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-xl font-bold">매칭 센터</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            총 {matches.length}건의 매칭 결과
          </p>
        </div>

        {/* 데모 배너 */}
        {isDemo && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-sm">🎬</span>
            <p className="text-[11px] text-amber-400 font-medium">
              데모 데이터 표시 중 — 성수동 꼬마빌딩 매칭 시연 (S/A/B/C 등급)
            </p>
          </div>
        )}

        {/* Grade Summary Cards */}
        <div className="grid grid-cols-4 gap-2">
          {(['S', 'A', 'B', 'C'] as const).map((grade) => {
            const style = GRADE_STYLES[grade];
            return (
              <button
                key={grade}
                onClick={() => setGradeFilter(gradeFilter === grade ? 'all' : grade)}
                className={`rounded-xl border p-3 text-center transition-all ${
                  gradeFilter === grade
                    ? `${style.bg} ${style.border} ${style.text} ring-1 ring-current/20`
                    : 'border-border bg-card hover:border-primary/30'
                }`}
              >
                <p className={`text-2xl font-bold ${gradeFilter === grade ? '' : style.text}`}>
                  {gradeCounts[grade]}
                </p>
                <p className="text-[10px] font-medium mt-0.5">{grade}급</p>
              </button>
            );
          })}
        </div>

        {/* Match List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredMatches.length > 0 ? (
          <div className="space-y-2">
            {filteredMatches.map((match) => {
              const style = GRADE_STYLES[match.grade];
              const isExpanded = expandedId === match.id;
              
              return (
                <div
                  key={match.id}
                  className={`rounded-xl border bg-card p-4 space-y-3 cursor-pointer hover:shadow-sm transition-all ${style.border}`}
                  id={`match-${match.id}`}
                  onClick={() => setExpandedId(isExpanded ? null : match.id)}
                >
                  {/* Grade + Score */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${style.bg} ${style.text}`}>
                        {match.grade}
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {match.building_area} {match.building_asset_type}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {match.building_price}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${style.text}`}>
                        {Math.round(match.score)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">점</p>
                    </div>
                  </div>

                  {/* Buyer Info */}
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/50 rounded-lg">
                    <span className="text-sm">🎯</span>
                    <span className="text-xs font-medium">{match.buyer_type}</span>
                    <span className="text-xs text-muted-foreground">{match.buyer_budget}</span>
                    {match.buyer_purpose && (
                      <span className="text-xs text-muted-foreground ml-auto">{match.buyer_purpose}</span>
                    )}
                  </div>

                  {/* Reasoning */}
                  <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {match.reasoning}
                    </p>
                    {!isExpanded && (
                      <p className="text-[10px] text-primary/70 font-semibold flex items-center gap-0.5 animate-pulse mt-1">
                        <span>🔍</span> 3단계 매칭 정밀 보고서 열기
                      </p>
                    )}
                  </div>

                  {/* Breakdown 시각화 컴포넌트 탑재 */}
                  {isExpanded && (
                    <div className="pt-2 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                      <MatchStageBreakdown
                        stage1Passed={match.stage1_passed ?? true}
                        stage1Details={match.stage1_details ?? { region: true, budget: true, asset: true }}
                        stage2Similarity={match.stage2_similarity ?? (match.score / 100)}
                        stage3Score={match.score}
                        stage3Weights={match.stage3_weights ?? {}}
                        grade={match.grade}
                        matchId={match.id}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(match.created_at).toLocaleDateString('ko-KR')}
                    </span>
                    <div className="flex gap-2">
                      <Link
                        href={`/broker/deal-card/${match.building_ssot_lite_id}`}
                        className="text-[11px] text-primary font-medium hover:underline"
                      >
                        딜카드 보기
                      </Link>
                      <Link
                        href={`/broker/buyer-intents/${match.buyer_intent_lite_id}`}
                        className="text-[11px] text-primary font-medium hover:underline"
                      >
                        매수자 보기
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
            <p className="text-4xl">🎯</p>
            <p className="text-sm font-medium">매칭 결과가 없어요.</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              매물과 매수자를 등록하면
              <br />
              AI가 자동으로 매칭 결과를 생성해드려요.
            </p>
          </div>
        )}
      </div>

      <BrokerBottomNav />
    </main>
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
