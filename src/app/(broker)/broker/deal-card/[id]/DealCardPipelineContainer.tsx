"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PipelineStatusBar } from "@/components/pipeline/pipeline-status-bar";
import { DealStage } from "@/domain/pipeline/bridge-state-machine";
import "@/components/briefing/briefing.css";

interface DealCardPipelineContainerProps {
  buildingId: string;
}

export function DealCardPipelineContainer({ buildingId }: DealCardPipelineContainerProps) {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<DealStage | null>(null);
  const [holdDays, setHoldDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    async function initPipeline() {
      try {
        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !session) {
          setError("로그인이 필요하거나 브라우저 세션을 읽을 수 없습니다.");
          setLoading(false);
          return;
        }

        setAuthToken(session.access_token);

        // Fetch latest pipeline state
        const { data, error: fetchErr } = await supabase
          .from("deal_pipeline_states")
          .select("stage, entered_at")
          .eq("building_ssot_lite_id", buildingId)
          .eq("broker_id", session.user.id)
          .order("entered_at", { ascending: false })
          .limit(1);

        if (fetchErr) {
          setError("파이프라인 상태 정보를 조회하는 도중 오류가 발생했습니다.");
        } else if (!data || data.length === 0) {
          // If no state exists, initialize with 'deal_card_created'
          const { data: inserted, error: insertErr } = await supabase
            .from("deal_pipeline_states")
            .insert({
              building_ssot_lite_id: buildingId,
              broker_id: session.user.id,
              stage: "deal_card_created",
              metadata: {},
            })
            .select("stage, entered_at")
            .single();

          if (insertErr) {
            setCurrentStage("deal_card_created");
            setHoldDays(0);
          } else if (inserted) {
            setCurrentStage(inserted.stage as DealStage);
            setHoldDays(0);
          }
        } else {
          const latest = data[0];
          setCurrentStage(latest.stage as DealStage);
          const enteredAt = new Date(latest.entered_at);
          const diffTime = Math.abs(new Date().getTime() - enteredAt.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setHoldDays(diffDays);
        }
      } catch (err) {
        setError("네트워크 연결 또는 초기화 도중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }

    initPipeline();
  }, [buildingId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-center gap-3">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs text-muted-foreground">실시간 파이프라인 단계를 동기화하는 중...</p>
      </div>
    );
  }

  if (error || !authToken || !currentStage) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-xs text-destructive font-semibold flex items-center gap-1.5">
          ⚠️ 파이프라인 관리 비활성화: {error || "인증 토큰 확보 실패"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-2">
        <h2 className="text-xs font-extrabold text-foreground flex items-center gap-1.5 tracking-wide">
          <span>⚡</span> 딜 파이프라인 진행 현황
        </h2>
        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded">
          {holdDays}일째 대기 중
        </span>
      </div>

      <PipelineStatusBar
        buildingId={buildingId}
        authToken={authToken}
        currentStage={currentStage}
        holdDays={holdDays}
        onStageChange={(newStage) => {
          setCurrentStage(newStage);
          setHoldDays(0);
        }}
      />
    </div>
  );
}
