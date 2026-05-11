"use client";

import { useEffect, useState } from "react";

interface FunnelStep {
  event_type: string;
  label: string;
  source_app: string;
  count: number;
}

const FUNNEL_STEPS_DEFINITION = [
  { event_type: "building_ssot_lite_created", label: "주소 입력 (건물 생성)", source_app: "js-building-ssot-mvp" },
  { event_type: "deal_curiosity_report_generated", label: "딜 큐리오시티 생성", source_app: "js-building-ssot-mvp" },
  { event_type: "blind_teaser_generated", label: "블라인드 딜카드 생성", source_app: "js-building-ssot-mvp" },
  { event_type: "full_im_handoff_created", label: "Full IM 핸드오프 요청", source_app: "js-building-ssot-mvp" },
  { event_type: "handoff_imported", label: "Full IM 임포트 (프로젝트 시작)", source_app: "js-full-im-studio" },
  { event_type: "im_project_created", label: "IM 프로젝트 생성", source_app: "js-full-im-studio" },
  { event_type: "space_created_from_mvp_handoff", label: "Space AI 마케팅 시작", source_app: "js-space-ai-page" },
];

export function CrossSystemFunnel() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/cross-system-analytics")
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error);
        setData(json.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>데이터 불러오는 중...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  const eventCounts = data.eventCounts || {};

  const funnelSteps: FunnelStep[] = FUNNEL_STEPS_DEFINITION.map((def) => ({
    ...def,
    count: eventCounts[def.event_type]?.count || 0,
  }));

  const maxCount = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">크로스시스템 퍼널 (최근 30일)</h3>
        <div className="space-y-4">
          {funnelSteps.map((step, idx) => {
            const percentage = (step.count / maxCount) * 100;
            return (
              <div key={idx} className="relative">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-foreground">{step.label}</span>
                  <span className="text-muted-foreground">{step.count}건</span>
                </div>
                <div className="w-full bg-secondary h-4 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      step.source_app === "js-building-ssot-mvp"
                        ? "bg-blue-500"
                        : step.source_app === "js-full-im-studio"
                        ? "bg-indigo-500"
                        : "bg-purple-500"
                    }`}
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground mt-1 opacity-60">
                  {step.source_app} ({step.event_type})
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border border-border rounded-xl bg-card">
          <h4 className="text-sm font-semibold mb-2">Full IM 핸드오프 상태</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(data.fullImHandoffStatusCounts).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-muted-foreground">{status}</span>
                <span>{count as number}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4 border border-border rounded-xl bg-card">
          <h4 className="text-sm font-semibold mb-2">Space AI 핸드오프 상태</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(data.spaceAiHandoffStatusCounts).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-muted-foreground">{status}</span>
                <span>{count as number}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
