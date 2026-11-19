"use client";

import React, { useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { EditorAnalyticsTab } from "@/components/magazine-editor/EditorAnalyticsTab";
import { EditorOutreachTab } from "@/components/magazine-editor/EditorOutreachTab";
import { MAGAZINE_SEND_DAY_LABEL } from "@/lib/magazine/schedule-labels";

export interface NewsletterInsightsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insightsTab: "subscribers" | "analytics";
  onTabChange: (tab: "subscribers" | "analytics") => void;
  sendDisabled: boolean;
  onSendDisabledChange: (disabled: boolean) => void;
  brokerSlug: string;
  brokerName: string;
  baseUrl: string;
  editionDate: string;
  shareTitle: string;
  deals: { id: string; title: string }[];
}

export function NewsletterInsightsModal({
  open,
  onOpenChange,
  insightsTab,
  onTabChange,
  sendDisabled,
  onSendDisabledChange,
  brokerSlug,
  brokerName,
  baseUrl,
  editionDate,
  shareTitle,
  deals,
}: NewsletterInsightsModalProps) {
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/magazine/editions/draft")
      .then((res) => (res.ok ? res.json().catch(() => null) : null))
      .then((json: Record<string, unknown> | null) => {
        if (!alive || !json) return;
        const meta = json.meta as { sendEnabled?: unknown } | undefined;
        const enabled =
          typeof meta?.sendEnabled === "boolean"
            ? meta.sendEnabled
            : typeof json.sendEnabled === "boolean"
            ? json.sendEnabled
            : undefined;
        if (typeof enabled === "boolean") {
          onSendDisabledChange(!enabled);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, onSendDisabledChange]);

  if (!open) return null;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="구독자 · 발행 성과" size="lg">
      <div className="space-y-4">
        <div role="tablist" aria-label="구독자 및 발행 성과 탭" className="flex gap-2 rounded-xl bg-slate-100 p-1">
          {(["subscribers", "analytics"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={insightsTab === t}
              onClick={() => onTabChange(t)}
              className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold transition ${
                insightsTab === t ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {t === "subscribers" ? "구독자 관리" : "발행 성과"}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-900">
          {insightsTab === "subscribers" ? (
            <EditorOutreachTab
              brokerSlug={brokerSlug || "me"}
              brokerName={brokerName || "공인중개사"}
              baseUrl={baseUrl}
              sendDayLabel={MAGAZINE_SEND_DAY_LABEL}
              sendDisabled={sendDisabled}
              editionDate={editionDate}
              shareTitle={shareTitle}
              deals={deals}
            />
          ) : (
            <EditorAnalyticsTab brokerDisplayName={brokerName || null} />
          )}
        </div>
      </div>
    </Modal>
  );
}
