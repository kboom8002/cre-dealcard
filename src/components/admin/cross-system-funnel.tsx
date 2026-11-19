"use client";

import { useEffect, useState } from "react";

interface FunnelStep {
  event_type: string;
  label: string;
  source_app: string;
  count: number;
}

interface CrossSystemAnalyticsData {
  eventCounts?: Record<string, { count?: number }>;
  fullImHandoffStatusCounts?: Record<string, number>;
  spaceAiHandoffStatusCounts?: Record<string, number>;
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

const SANITIZED_LOAD_ERROR =
  "크로스시스템 연계 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";

export function CrossSystemFunnel() {
  const [data, setData] = useState<CrossSystemAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/cross-system-analytics")
      .then((res) => {
        if (!res.ok) throw new Error("LOAD_FAILED");
        return res.json() as Promise<{ ok?: boolean; data?: CrossSystemAnalyticsData }>;
      })
      .then((json) => {
        if (!json?.ok || !json.data) throw new Error("LOAD_FAILED");
        if (active) setData(json.data);
      })
      .catch(() => {
        if (active) setHasError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="text-sm text-slate-600">데이터 불러오는 중...</div>;
  }
  if (hasError || !data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"
      >
        {SANITIZED_LOAD_ERROR}
      </div>
    );
  }

  const eventCounts = data.eventCounts ?? {};
  const fullImStatusCounts = data.fullImHandoffStatusCounts ?? {};
  const spaceAiStatusCounts = data.spaceAiHandoffStatusCounts ?? {};

  const funnelSteps: FunnelStep[] = FUNNEL_STEPS_DEFINITION.map((def) => ({
    ...def,
    count: eventCounts[def.event_type]?.count ?? 0,
  }));

  const maxCount = Math.max(...funnelSteps.map((s) => s.count), 1);

  return (
    <div className="space-y-8 bg-white text-slate-900">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          크로스시스템 퍼널 (최근 30일)
        </h3>
        <div className="space-y-4">
          {funnelSteps.map((step) => {
            const percentage = (step.count / maxCount) * 100;
            return (
              <div key={step.event_type} className="relative">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-slate-900">{step.label}</span>
                  <span className="text-slate-600">{step.count}건</span>
                </div>
                <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      step.source_app === "js-building-ssot-mvp"
                        ? "bg-blue-600"
                        : step.source_app === "js-full-im-studio"
                          ? "bg-indigo-600"
                          : "bg-purple-600"
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  {step.source_app} ({step.event_type})
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Full IM 핸드오프 상태</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(fullImStatusCounts).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-slate-600">{status}</span>
                <span className="font-medium text-slate-900">{count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Space AI 핸드오프 상태</h4>
          <ul className="space-y-1 text-sm">
            {Object.entries(spaceAiStatusCounts).map(([status, count]) => (
              <li key={status} className="flex justify-between">
                <span className="text-slate-600">{status}</span>
                <span className="font-medium text-slate-900">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
