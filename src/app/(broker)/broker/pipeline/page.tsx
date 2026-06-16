'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import BrokerBottomNav from '@/components/layout/BrokerBottomNav';
import { VALID_TRANSITIONS, DealStage } from '@/domain/pipeline/bridge-state-machine';
import { StageTransitionModal } from '@/components/pipeline/StageTransitionModal';
import { GateRequestReviewModal } from '@/components/gate/GateRequestReviewModal';
import { ChevronRight, ShieldCheck } from 'lucide-react';

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

const STAGES = [
  { key: 'memo_input', label: '메모 입력', emoji: '📝' },
  { key: 'deal_card_created', label: '딜카드', emoji: '📋' },
  { key: 'gate_requested', label: 'Gate', emoji: '🔒' },
  { key: 'im_created', label: 'IM 작성', emoji: '📄' },
  { key: 'buyer_meeting', label: '미팅', emoji: '🤝' },
  { key: 'loi', label: 'LOI', emoji: '✍️' },
  { key: 'contract', label: '계약', emoji: '📜' },
  { key: 'closed', label: '완료', emoji: '✅' },
] as const;

const HOLD_WARNING_DAYS: Record<string, number> = {
  memo_input: 1,
  deal_card_created: 7,
  gate_requested: 7,
  im_created: 14,
  buyer_meeting: 14,
  loi: 21,
  contract: 30,
  closed: 999,
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
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );

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
    <main className="flex flex-col items-center min-h-screen px-4 py-8 pb-24">
      <div className="w-full max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="pt-4">
          <h1 className="text-xl font-bold">딜 파이프라인</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            진행 중 {activeCount}건 · 총 {allDeals.length}건
          </p>
        </div>

        {/* Pipeline Stages */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
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
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Stage Header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{stage.emoji}</span>
                      <span className="text-sm font-semibold">{stage.label}</span>
                    </div>
                    <span className={`inline-flex items-center justify-center min-w-[1.5rem] h-6 rounded-full text-xs font-bold ${
                      count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {count}
                    </span>
                  </div>

                  {/* Deal Cards in Stage */}
                  {count > 0 ? (
                    <div className="divide-y divide-border">
                      {stage.deals.map((deal) => {
                        const holdDays = Math.floor(
                          (Date.now() - new Date(deal.entered_at).getTime()) / 86_400_000
                        );
                        const warnDays = HOLD_WARNING_DAYS[stage.key] ?? 14;
                        const isWarning = holdDays >= warnDays;
                        const currentStageKey = deal.current_stage as DealStage;
                        const nextStages = VALID_TRANSITIONS[currentStageKey]?.filter(s => s !== 'failed') || [];

                        return (
                          <div key={deal.id} className="flex flex-col sm:flex-row sm:items-center px-4 py-3 hover:bg-muted/10 transition-colors gap-3">
                            <Link
                              href={`/broker/deal-card/${deal.building_ssot_lite_id}`}
                              className="flex-1 min-w-0"
                              id={`pipeline-deal-${deal.id}`}
                            >
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate text-foreground">
                                  {deal.building_area} {deal.building_asset_type}
                                </p>
                                {isWarning && (
                                  <span className="shrink-0 inline-flex items-center rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 text-[10px] font-medium">
                                    ⚠️ {holdDays}일
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-muted-foreground">
                                  {deal.building_price}
                                </span>
                                {(deal.matched_buyer_count ?? 0) > 0 && (
                                  <span className="text-[11px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-sm">
                                    매칭 {deal.matched_buyer_count}명
                                  </span>
                                )}
                              </div>
                            </Link>

                            {/* Actions */}
                            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-none border-border">
                              <span className="text-[10px] text-muted-foreground sm:hidden">
                                {holdDays}일 경과
                              </span>
                              
                              <div className="flex gap-2">
                                {currentStageKey === 'gate_requested' ? (
                                  <button
                                    onClick={() => setTransitionTarget({
                                      dealId: deal.id,
                                      buildingId: deal.building_ssot_lite_id,
                                      fromStage: currentStageKey,
                                      toStage: 'im_created' // Used as dummy, the modal handles the actual routing
                                    })}
                                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1 shadow-sm whitespace-nowrap"
                                  >
                                    응대 수락 (리뷰) <ShieldCheck className="w-3 h-3" />
                                  </button>
                                ) : (
                                  nextStages.map(nextStage => (
                                    <button
                                      key={nextStage}
                                      onClick={() => setTransitionTarget({
                                        dealId: deal.id,
                                        buildingId: deal.building_ssot_lite_id,
                                        fromStage: currentStageKey,
                                        toStage: nextStage
                                      })}
                                      className="text-[11px] font-bold px-2.5 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 flex items-center gap-1 shadow-sm whitespace-nowrap"
                                    >
                                      다음 단계 <ChevronRight className="w-3 h-3" />
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
                      <p className="text-xs text-muted-foreground">
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
      {transitionTarget && transitionTarget.fromStage === 'gate_requested' ? (
        <GateRequestReviewModal
          dealId={transitionTarget.dealId}
          buildingId={transitionTarget.buildingId}
          buyerType="법인 사옥 매수자 (주식회사 테스트)"
          buyerBudget="100억 ~ 150억"
          buyerPurpose="IT 기업 사옥 이전"
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
          fromStage={transitionTarget.fromStage}
          toStage={transitionTarget.toStage}
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
