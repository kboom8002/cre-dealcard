"use client";

import React, { useState } from "react";
import { X, Handshake, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeeSplitSheetProps {
  matchId: string;
  currentRatio?: string;
  onClose: () => void;
  onConfirm: (ratio: string) => Promise<void>;
}

const PRESETS = [
  { label: "50 : 50 균등 분배", value: "50:50" },
  { label: "물건측 60 : 매수측 40", value: "60:40" },
  { label: "물건측 40 : 매수측 60", value: "40:60" },
  { label: "물건측 70 : 매수측 30", value: "70:30" },
];

export function FeeSplitSheet({
  matchId,
  currentRatio = "50:50",
  onClose,
  onConfirm,
}: FeeSplitSheetProps) {
  const [selectedRatio, setSelectedRatio] = useState(currentRatio);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      await onConfirm(selectedRatio);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#131b2e] border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Handshake className="w-6 h-6 text-amber-400" />
            <h2 className="text-[18px] font-extrabold text-slate-100">공동중개 수수료 분배 설정</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[13px] text-slate-400">
          양측 중개사 간 수수료 분배 합의 비율을 서클 계약에 기록합니다.
        </p>

        <div className="space-y-2">
          {PRESETS.map((p) => {
            const isSelected = selectedRatio === p.value;
            return (
              <div
                key={p.value}
                onClick={() => setSelectedRatio(p.value)}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold"
                    : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <span className="text-[15px]">{p.label}</span>
                {isSelected && <Check className="w-5 h-5 text-amber-400" />}
              </div>
            );
          })}
        </div>

        <Button
          onClick={handleSave}
          disabled={loading}
          className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-lg"
        >
          {loading ? "저장 중..." : "분배 비율 확정"}
        </Button>
      </div>
    </div>
  );
}
