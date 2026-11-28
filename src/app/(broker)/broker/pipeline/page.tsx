'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { StageTransitionModal } from '@/components/pipeline/StageTransitionModal';
import { GateRequestReviewModal } from '@/components/gate/GateRequestReviewModal';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { getAllStagesOrdered, getNextStages, type DealStage } from '@/domain/deal/deal-transition';

interface PipelineDeal {
  id: string;
  building_ssot_lite_id: string;
  current_stage: string;
  entered_at: string;
  metadata: Record<string, unknown>;
  building_area?: string;
  building_asset_type?: string;
  building_price?: string;
  matched_buyer_count?: number;
}

const STAGES = getAllStagesOrdered().map(s => ({
  key: s.stage,
  label: s.label,
  emoji: s.icon
}));

const HOLD_WARNING_DAYS: Record<DealStage, number> = {
  memo_input: 1,
  deal_card_created: 7,
  data_enriching: 7,
  im_draft: 14,
  im_published: 14,
  buyer_matching: 14,
  buyer_meeting: 14,
  loi_submitted: 21,
  due_diligence: 21,
  closing: 30,
  closed: 999,
  dead: 999,
};

export default function PipelinePage() {
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [buildings, setBuildings] = useState<PipelineDeal[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [transitionTarget, setTransitionTarget] = useState<{
    dealId: string;
    buildingId: string;
    fromStage: DealStage;
    toStage: DealStage;
  } | null>(null);

  const fetchPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Fetch deal_pipeline_states
      const { data: pipelineData } = await supabase
        .from('deal_pipeline_states')
        .select('*')
        .order('entered_at', { ascending: false });

      if (pipelineData && pipelineData.length > 0) {
        const buildingIds = [...new Set(pipelineData.map((p: Record<string, string>) => p.building_ssot_lite_id))];
        const { data: buildingData } = await supabase
          .from('building_ssot_lite')
          .select('id, area_signal, asset_type, price_band, matched_buyer_count')
          .in('id', buildingIds);

        const buildingMap = new Map((buildingData ?? []).map((b: Record<string, unknown>) => [b.id, b]));

        const enriched = pipelineData.map((p: Record<string, unknown>) => {
          const b = buildingMap.get(p.building_ssot_lite_id as string) as Record<string, unknown> | undefined;
          return {
            ...p,
            building_area: (b?.area_signal as string) ?? '미확인',
            building_asset_type: (b?.asset_type as string) ?? '',
            building_price: (b?.price_band as string) ?? '',
            matched_buyer_count: (b?.matched_buyer_count as number) ?? 0,
          };
        });

        setDeals(enriched as PipelineDeal[]);
      } else {
        // Fallback: create pseudo pipeline from buildings
        const { data: buildingData } = await supabase
          .from('building_ssot_lite')
          .select('id, area_signal, asset_type, price_band, matched_buyer_count, status, created_at')
          .order('created_at', { ascending: false });

        const pseudoPipeline = (buildingData ?? []).map((b: Record<string, unknown>) => ({
          id: b.id as string,
          building_ssot_lite_id: b.id as string,
          current_stage: b.status === 'draft' ? 'memo_input' : 'deal_card_created',
          entered_at: b.created_at as string,
          metadata: {},
          building_area: (b.area_signal as string) ?? '미확인',
          building_asset_type: (b.asset_type as string) ?? '',
          building_price: (b.price_band as string) ?? '',
          matched_buyer_count: (b.matched_buyer_count as number) ?? 0,
        }));

        setBuildings(pseudoPipeline as PipelineDeal[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  const activeModalDeal = transitionTarget
    ? (deals.length > 0 ? deals : buildings).find(d => d.building_ssot_lite_id === transitionTarget.buildingId)
    : null;

  const allDeals = deals.length > 0 ? deals : buildings;

  // Group by stage
  const stageGroups = STAGES.map((stage) => ({
    ...stage,
    deals: allDeals.filter((d) => d.current_stage === stage.key),
  }));

  // Count active (non-closed, non-failed)
  const activeCount = allDeals.filter(
    (d) => d.current_stage !== 'closed' && d.current_stage !== 'failed'
  ).length;

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#F5F5F7] text-[#1D1D1F] px-4 py-8 pb-24">
      <div className="w-full max-w-lg mx-auto space-y-5">
        {/* Header & KPI Dashboard */}
        <div className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-[#1D1D1F]">딜 파이프라인</h1>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="ios-glass-card rounded-xl p-4 flex flex-col justify-center items-center">
              <p className="text-sm font-medium text-[#515154] uppercase tracking-wider mb-1">진행 중인 딜</p>
              <p className="text-2xl font-bold text-[#0055D4]">{activeCount}<span className="text-sm font-medium text-[#515154] ml-1">건</span></p>
            </div>
            <div className="ios-glass-card rounded-xl p-4 flex flex-col justify-center items-center">
              <p className="text-sm font-medium text-[#515154] uppercase tracking-wider mb-1">총 누적 딜</p>
              <p className="text-2xl font-bold text-[#1D1D1F]">{allDeals.length}<span className="text-sm font-medium text-[#515154] ml-1">건</span></p>
            </div>
          </div>

          {/* Visual Bar Chart */}
          {!loading && allDeals.length > 0 && (
            <div className="ios-glass-card rounded-xl p-4 space-y-3">
              <h2 className="text-sm font-bold text-[#1D1D1F] mb-2">단계별 분포</h2>
              <div className="space-y-2">
                {stageGroups.filter(s => s.deals.length > 0).map(stage => {
                  const percentage = Math.max(5, (stage.deals.length / allDeals.length) * 100);
                  return (
                    <div key={stage.key} className="flex items-center gap-2">
                      <div className="w-20 text-sm text-[#515154] truncate">{stage.label}</div>
                      <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#0055D4] rounded-full transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="w-8 text-right text-sm font-bold text-[#1D1D1F]">{stage.deals.length}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pipeline Stages */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-slate-200/80 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {stageGroups.map((stage) => {
              const count = stage.deals.length;
              if (count === 0 && stage.key === 'closed') return null;

              return (
                <div
                  key={stage.key}
                  className="ios-glass-card rounded-xl overflow-hidden"
                >
                  {/* Stage Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100/70 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{stage.emoji}</span>
                      <span className="text-sm font-semibold text-[#1D1D1F]">{stage.label}</span>
                    </div>
                    <span className={`inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full text-sm font-bold ${
                      count > 0 ? 'bg-blue-50 text-[#0055D4]' : 'bg-slate-200/70 text-[#515154]'
                    }`}>
                      {count}
                    </span>
                  </div>

                  {/* Deal Cards in Stage */}
                  {count > 0 ? (
                    <div className="divide-y divide-slate-200">
                      {stage.deals.map((deal) => {
                        const holdDays = Math.floor(
                          (Date.now() - new Date(deal.entered_at).getTime()) / 86_400_000
                        );
                        const warnDays = HOLD_WARNING_DAYS[stage.key] ?? 14;
                        const isWarning = holdDays >= warnDays;
                        const currentStageKey = deal.current_stage as DealStage;
                        const nextStages = getNextStages(currentStageKey).filter(s => s !== 'dead');

                        return (
                          <div key={deal.id} className="flex flex-col sm:flex-row sm:items-center px-4 py-3 hover:bg-slate-50/80 transition-colors gap-3">
                            <Link
                              href={`/broker/deal-card/${deal.building_ssot_lite_id}`}
                              className="flex-1 min-w-0"
                              id={`pipeline-deal-${deal.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate text-[#1D1D1F]">
                                  {deal.building_area} {deal.building_asset_type}
                                </p>
                                {isWarning && (
                                  <span className="shrink-0 inline-flex items-center rounded-full bg-red-50 text-[#C8102E] border border-red-200 px-2 py-0.5 text-sm font-medium">
                                    ⚠️ {holdDays}일
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-[#515154]">
                                  {deal.building_price}
                                </span>
                                {(deal.matched_buyer_count ?? 0) > 0 && (
                                  <span className="text-sm text-[#0055D4] font-medium bg-blue-50 px-2 py-0.5 rounded-sm">
                                    매칭 {deal.matched_buyer_count}명
                                  </span>
                                )}
                              </div>
                            </Link>

                            {/* Actions */}
                            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-none border-slate-200">
                              <span className="text-sm text-[#515154] sm:hidden">
                                {holdDays}일 경과
                              </span>
                              
                              <div className="flex gap-2">
                                {currentStageKey === 'buyer_matching' ? (
                                  <button
                                    onClick={() => setTransitionTarget({
                                      dealId: deal.id,
                                      buildingId: deal.building_ssot_lite_id,
                                      fromStage: currentStageKey,
                                      toStage: 'buyer_meeting'
                                    })}
                                    className="text-sm font-bold px-3 py-1.5 rounded-md bg-[#0055D4] text-white hover:bg-[#0040DD] flex items-center gap-1 shadow-sm whitespace-nowrap"
                                  >
                                    응대 수락 (리뷰) <ShieldCheck className="w-4 h-4" />
                                  </button>
                                ) : (
                                  nextStages.map((nextStage: DealStage) => (
                                    <button
                                      key={nextStage}
                                      onClick={() => setTransitionTarget({
                                        dealId: deal.id,
                                        buildingId: deal.building_ssot_lite_id,
                                        fromStage: currentStageKey,
                                        toStage: nextStage
                                      })}
                                      className="text-sm font-bold px-3 py-1.5 rounded-md bg-[#1D1D1F] text-white hover:bg-[#3A3A3C] flex items-center gap-1 shadow-sm whitespace-nowrap"
                                    >
                                      다음 단계 <ChevronRight className="w-4 h-4" />
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-3">
                      <p className="text-sm text-[#515154]">
                        이 단계에 있는 딜이 없어요.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transition Modal */}
      {transitionTarget && transitionTarget.fromStage === 'buyer_matching' ? (
        <GateRequestReviewModal
          dealId={transitionTarget.dealId}
          buildingId={transitionTarget.buildingId}
          buyerType={activeModalDeal?.building_asset_type ? `${activeModalDeal.building_asset_type} 매수 희망자` : "사옥 매수 희망자"}
          buyerBudget={activeModalDeal?.building_price || "예산 검토 중"}
          buyerPurpose={`${activeModalDeal?.building_area || "서초/강남"} 지역 매수 검토`}
          ndaSigned={true}
          onClose={() => setTransitionTarget(null)}
          onSuccess={() => {
            setTransitionTarget(null);
            fetchPipeline(); // Refresh
          }}
        />
      ) : transitionTarget ? (
        <StageTransitionModal
          dealId={transitionTarget.dealId}
          buildingId={transitionTarget.buildingId}
          fromStage={transitionTarget.fromStage as any}
          toStage={transitionTarget.toStage as any}
          onClose={() => setTransitionTarget(null)}
          onSuccess={() => {
            setTransitionTarget(null);
            fetchPipeline(); // Refresh
          }}
        />
      ) : null}

      <BrokerBottomNav />
    </main>
  );
}
