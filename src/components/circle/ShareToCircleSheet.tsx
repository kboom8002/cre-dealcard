"use client";

import React, { useState, useEffect } from "react";
import { X, Check, Users, Sparkles, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CircleOption {
  id: string;
  name: string;
  avatar_emoji: string;
  member_count: number;
}

interface ShareToCircleSheetProps {
  assetType: "building" | "buyer_intent" | "tenant_intent";
  assetId: string;
  assetTitle?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ShareToCircleSheet({
  assetType,
  assetId,
  assetTitle,
  onClose,
  onSuccess,
}: ShareToCircleSheetProps) {
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [selectedCircleIds, setSelectedCircleIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCircles() {
      try {
        const res = await fetch("/api/broker/circles");
        if (res.ok) {
          const json = await res.json();
          setCircles(json.circles || []);
          if (json.circles?.length > 0) {
            setSelectedCircleIds([json.circles[0].id]);
          }
        } else {
          console.warn("Failed to fetch circles, status:", res.status);
        }
      } catch (err) {
        console.error("Failed to fetch circles:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchCircles();
  }, []);

  function toggleCircle(id: string) {
    setSelectedCircleIds((prev) =>
      prev.includes(id) ? prev.filter((cId) => cId !== id) : [...prev, id]
    );
  }

  async function handleShare() {
    if (selectedCircleIds.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const results = await Promise.all(
        selectedCircleIds.map(async (cId) => {
          const res = await fetch(`/api/broker/circles/${cId}/share`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetType, assetId }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json.ok) {
            throw new Error(json.error || `서클 공유 실패 (HTTP ${res.status})`);
          }
          return json;
        })
      );

      setSuccessMsg("선택한 서클에 자산이 공유되었습니다! AI가 자동 팀 매칭을 시작합니다.");
      toast.success("선택한 서클에 딜카드가 공유되었습니다.");
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Share failed:", err);
      const msg = err.message || "서클 공유 중 오류가 발생했습니다.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end justify-center p-0 md:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#131b2e] border border-slate-800 rounded-t-3xl md:rounded-3xl p-6 space-y-5 shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤝</span>
            <div>
              <h2 className="text-[18px] font-extrabold text-slate-100">신뢰 서클에 자산 공유</h2>
              <p className="text-[13px] text-slate-400">
                {assetTitle ? `"${assetTitle}"` : "선택한 자산"}을 동료 서클에 공유합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Privacy Notice */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-1 text-[13px]">
          <p className="font-bold text-amber-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> 2단계 프라이버시 자동 보호
          </p>
          <p className="text-slate-300 text-[12px] leading-relaxed">
            처음에는 위치·가격 시그널만 안전하게 공개되며, AI가 S/A등급 매칭을 발견하더라도 **양측 승인 전까지 매수자/소유자 신원은 절대 공개되지 않습니다.**
          </p>
        </div>

        {/* Circle List */}
        <div className="space-y-2">
          <label className="text-[13px] font-bold text-slate-300">공유할 서클 선택</label>
          {loading ? (
            <p className="text-[13px] text-slate-500 py-4 text-center">서클 목록 불러오는 중...</p>
          ) : circles.length === 0 ? (
            <div className="text-center py-6 bg-slate-900/50 rounded-xl border border-slate-800 space-y-3">
              <p className="text-[13px] text-slate-400">아직 참여 중인 서클이 없습니다.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  window.location.href = "/broker/circles/new";
                }}
                className="border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
              >
                + 새 서클 개설하기
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {circles.map((c) => {
                const isSelected = selectedCircleIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    onClick={() => toggleCircle(c.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-amber-500/15 border-amber-500/50 text-slate-100"
                        : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{c.avatar_emoji || "🤝"}</span>
                      <div>
                        <p className="text-[15px] font-bold text-slate-100">{c.name}</p>
                        <p className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Users className="w-3 h-3" /> 멤버 {c.member_count}명
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center ${
                        isSelected
                          ? "bg-amber-500 border-amber-500 text-slate-950"
                          : "border-slate-700 bg-slate-800"
                      }`}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl text-[13px] flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Message */}
        {successMsg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-[13px] font-bold text-center animate-in fade-in">
            {successMsg}
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={handleShare}
          disabled={selectedCircleIds.length === 0 || submitting}
          className="w-full h-12 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-[15px] rounded-xl shadow-lg disabled:opacity-50"
        >
          <Sparkles className="w-5 h-5 mr-1" />
          {submitting ? "공유 중..." : `${selectedCircleIds.length}개 서클에 공유 및 자동 매칭`}
        </Button>
      </div>
    </div>
  );
}
