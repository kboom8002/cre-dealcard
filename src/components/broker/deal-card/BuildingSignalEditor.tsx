"use client";

import { useState } from "react";
import { Loader2, Check, Pencil } from "lucide-react";

interface BuildingSignalEditorProps {
  buildingId: string;
  areaSignal: string | null;
  assetType: string | null;
  priceBand: string | null;
  currentUseSignal: string | null;
  confidence: Record<string, string>;
  fitSummary?: string | null;
  cautionSummary?: string | null;
}

type FieldKey = "areaSignal" | "assetType" | "priceBand" | "currentUseSignal";
type SsotKey = "area_signal" | "asset_type" | "price_band" | "current_use_signal";

export default function BuildingSignalEditor({
  buildingId,
  areaSignal: initialAreaSignal,
  assetType: initialAssetType,
  priceBand: initialPriceBand,
  currentUseSignal: initialCurrentUseSignal,
  confidence,
  fitSummary,
  cautionSummary,
}: BuildingSignalEditorProps) {
  const [fields, setFields] = useState({
    areaSignal: initialAreaSignal,
    assetType: initialAssetType,
    priceBand: initialPriceBand,
    currentUseSignal: initialCurrentUseSignal,
  });

  const [editingKey, setEditingKey] = useState<FieldKey | null>(null);
  const [editValue, setEditValue] = useState("");
  const [loadingKey, setLoadingKey] = useState<FieldKey | null>(null);
  const [successKey, setSuccessKey] = useState<FieldKey | null>(null);

  const fieldConfig: { key: FieldKey; ssotKey: SsotKey; label: string }[] = [
    { key: "areaSignal", ssotKey: "area_signal", label: "권역" },
    { key: "assetType", ssotKey: "asset_type", label: "자산 유형" },
    { key: "priceBand", ssotKey: "price_band", label: "가격대" },
    { key: "currentUseSignal", ssotKey: "current_use_signal", label: "현재 사용" },
  ];

  const handleEditClick = (key: FieldKey, currentValue: string | null) => {
    setEditingKey(key);
    setEditValue(currentValue || "");
  };

  const handleSave = async (key: FieldKey, ssotKey: SsotKey) => {
    if (fields[key] === editValue) {
      setEditingKey(null);
      return;
    }

    setEditingKey(null);
    setLoadingKey(key);

    try {
      const res = await fetch(`/api/broker/deal-card/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ssotUpdate: { [ssotKey]: editValue },
        }),
      });

      if (res.ok) {
        setFields((prev) => ({ ...prev, [key]: editValue }));
        setSuccessKey(key);
        setTimeout(() => setSuccessKey(null), 2000);
      } else {
        console.error("Failed to save field:", ssotKey);
      }
    } catch (error) {
      console.error("Error saving field:", error);
    } finally {
      setLoadingKey(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, key: FieldKey, ssotKey: SsotKey) => {
    if (e.key === "Enter") {
      handleSave(key, ssotKey);
    } else if (e.key === "Escape") {
      setEditingKey(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center justify-between">
        <span className="flex items-center gap-1.5"><span>🏢</span> 건물 신호 및 분류 스펙</span>
        <span className="text-[10px] font-normal text-muted-foreground flex items-center gap-1">
          <Pencil className="w-3 h-3" /> 클릭하여 편집
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        {fieldConfig.map((item) => {
          const value = fields[item.key];
          const conf = (confidence || {})[item.key];
          const isEditing = editingKey === item.key;
          const isLoading = loadingKey === item.key;
          const isSuccess = successKey === item.key;

          return (
            <div
              key={item.label}
              className={`rounded-lg p-2.5 transition-colors ${
                value ? 'bg-muted/30' : 'bg-muted/10 border border-dashed border-muted-foreground/20'
              } ${!isEditing ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              onClick={() => !isEditing && handleEditClick(item.key, value)}
            >
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
                <div className="flex items-center gap-1">
                  {conf === 'ai_hypothesis' && !isEditing && (
                    <span
                      className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-500 font-medium cursor-help"
                      title="AI가 파싱한 분류입니다."
                    >
                      AI분류
                    </span>
                  )}
                  {conf === 'needs_verification' && !isEditing && (
                    <span
                      className="text-[9px] px-1 py-0.2 rounded bg-red-500/15 text-red-500 font-medium cursor-help"
                      title="정보가 불충분합니다."
                    >
                      확인필요
                    </span>
                  )}
                  {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  {isSuccess && <Check className="w-3 h-3 text-green-500" />}
                </div>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  autoFocus
                  className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleSave(item.key, item.ssotKey)}
                  onKeyDown={(e) => handleKeyDown(e, item.key, item.ssotKey)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className={`font-semibold ${value ? '' : 'text-muted-foreground/50 text-[11px]'}`}>
                  {value || "미입력 ✏️"}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {fitSummary && (
        <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <span className="font-medium text-foreground">🎯 적합 매수자</span>
          </div>
          <p className="leading-relaxed">{fitSummary}</p>
        </div>
      )}
      {cautionSummary && (
        <div className="text-xs text-muted-foreground pt-1 space-y-0.5">
          <p className="font-medium text-amber-500 dark:text-amber-400">⚠️ 실사 확인 필요 사항</p>
          <p className="leading-relaxed">{cautionSummary}</p>
        </div>
      )}
    </div>
  );
}
