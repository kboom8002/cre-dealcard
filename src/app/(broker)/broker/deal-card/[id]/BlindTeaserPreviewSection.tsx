"use client";

import React, { useState } from "react";
import { PenTool } from "lucide-react";
import { useRouter } from "next/navigation";

interface BlindTeaserPreviewSectionProps {
  buildingId: string;
  initialTitle: string;
  initialSummary: string;
  initialDealPoints: string[];
  initialCautionPoints: string[];
}

export function BlindTeaserPreviewSection({
  buildingId,
  initialTitle,
  initialSummary,
  initialDealPoints,
  initialCautionPoints,
}: BlindTeaserPreviewSectionProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [dealPointsStr, setDealPointsStr] = useState(initialDealPoints.join("\n"));
  const [cautionPointsStr, setCautionPointsStr] = useState(initialCautionPoints.join("\n"));
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/broker/deal-card/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          shortSummary: summary,
          dealPoints: dealPointsStr.split("\n").filter(Boolean),
          cautionPoints: cautionPointsStr.split("\n").filter(Boolean),
        }),
      });
      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="rounded-xl border-2 border-primary/20 bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-primary font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            블라인드 티저 편집 모드
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditing(false)} className="text-xs text-slate-400 hover:text-white px-2 py-1">취소</button>
            <button onClick={handleSave} disabled={isSaving} className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg disabled:opacity-50">
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
        
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-400">제목 (캐치프레이즈)</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">한줄 요약</label>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">딜 포인트 (줄바꿈으로 구분)</label>
            <textarea value={dealPointsStr} onChange={e => setDealPointsStr(e.target.value)} rows={3} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y" />
          </div>
          <div>
            <label className="text-[10px] text-slate-400">유의점/투자 포인트 (줄바꿈으로 구분)</label>
            <textarea value={cautionPointsStr} onChange={e => setCautionPointsStr(e.target.value)} rows={3} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-y" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-card p-5 space-y-4 group relative">
      <button onClick={() => setIsEditing(true)} className="absolute top-4 right-4 text-slate-400 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        <PenTool className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2 text-xs text-primary font-medium">
        <span className="inline-block w-2 h-2 rounded-full bg-primary" />
        블라인드 티저 미리보기
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {summary && (
        <p className="text-sm text-muted-foreground">{summary}</p>
      )}

      {/* Deal Points */}
      {dealPointsStr && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-success">딜 포인트</p>
          <ul className="space-y-1">
            {dealPointsStr.split("\n").filter(Boolean).map((p, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Caution Points */}
      {cautionPointsStr && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-warning">확인 필요 사항</p>
          <ul className="space-y-1">
            {cautionPointsStr.split("\n").filter(Boolean).map((p, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
