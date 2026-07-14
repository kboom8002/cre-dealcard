"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { X, Plus, GripVertical, Eye, Save, Check, AlertCircle } from "lucide-react";

interface DealCardEditorProps {
  buildingId: string;
  initialTitle: string;
  initialSummary: string;
  initialDealPoints: string[];
  initialCautionPoints: string[];
  initialKakaoText: string;
  initialOgTitle?: string;
  initialOgDescription?: string;
}

type ToastType = "success" | "error" | null;

export function DealCardEditor({
  buildingId,
  initialTitle,
  initialSummary,
  initialDealPoints,
  initialCautionPoints,
  initialKakaoText,
  initialOgTitle = "",
  initialOgDescription = "",
}: DealCardEditorProps) {
  // ── State ──
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [dealPoints, setDealPoints] = useState<string[]>(
    initialDealPoints.length > 0 ? initialDealPoints : [""]
  );
  const [cautionPoints, setCautionPoints] = useState<string[]>(initialCautionPoints);
  const [kakaoText, setKakaoText] = useState(initialKakaoText);
  const [ogTitle, setOgTitle] = useState(initialOgTitle);
  const [ogDescription, setOgDescription] = useState(initialOgDescription);
  const [ogTimestamp, setOgTimestamp] = useState(Date.now());

  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string }>({ type: null, message: "" });
  const [showPreview, setShowPreview] = useState(false);

  // ── Dirty check ──
  const isDirty = useCallback(() => {
    return (
      title !== initialTitle ||
      summary !== initialSummary ||
      JSON.stringify(dealPoints.filter(Boolean)) !== JSON.stringify(initialDealPoints) ||
      JSON.stringify(cautionPoints.filter(Boolean)) !== JSON.stringify(initialCautionPoints) ||
      kakaoText !== initialKakaoText ||
      ogTitle !== initialOgTitle ||
      ogDescription !== initialOgDescription
    );
  }, [title, summary, dealPoints, cautionPoints, kakaoText, ogTitle, ogDescription, initialTitle, initialSummary, initialDealPoints, initialCautionPoints, initialKakaoText, initialOgTitle, initialOgDescription]);

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (toast.type) {
      const timer = setTimeout(() => setToast({ type: null, message: "" }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Deal Point Management ──
  const addDealPoint = () => setDealPoints([...dealPoints, ""]);
  const removeDealPoint = (index: number) => {
    if (dealPoints.length <= 1) return;
    setDealPoints(dealPoints.filter((_, i) => i !== index));
  };
  const updateDealPoint = (index: number, value: string) => {
    const updated = [...dealPoints];
    updated[index] = value;
    setDealPoints(updated);
  };

  // ── Save ──
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/broker/deal-card/${buildingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          shortSummary: summary,
          dealPoints: dealPoints.filter(Boolean),
          cautionPoints: cautionPoints.filter(Boolean),
          kakaoText,
          ogTitle,
          ogDescription,
        }),
      });
      if (res.ok) {
        setToast({ type: "success", message: "딜카드가 저장되었습니다" });
        setOgTimestamp(Date.now());
        // Update sessionStorage for KakaoShareButton
        sessionStorage.setItem(`kakao_text_${buildingId}`, kakaoText);
        window.dispatchEvent(new Event(`kakao_update_${buildingId}`));
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ type: "error", message: err.error || "저장 실패 — 다시 시도해주세요" });
      }
    } catch {
      setToast({ type: "error", message: "네트워크 오류 — 다시 시도해주세요" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border-2 border-primary/20 bg-card overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-primary">
            <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
            딜카드 편집
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              미리보기
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty()}
              className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground px-3 py-1.5 rounded-lg font-bold disabled:opacity-40 transition-all hover:brightness-110 active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* ── 제목 ── */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              📌 제목 (캐치프레이즈)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-transparent border-b-2 border-border hover:border-primary/30 focus:border-primary px-0 py-2 text-lg font-bold focus:outline-none transition-colors placeholder:text-muted-foreground/40"
              placeholder="투자 포인트를 강조하는 제목"
            />
          </div>

          {/* ── 딜 개요 ── */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              📋 딜 개요
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-transparent resize-none transition-all placeholder:text-muted-foreground/40 leading-relaxed"
              placeholder="매물의 핵심 투자 포인트를 2~3문장으로 요약"
            />
          </div>

          {/* ── 딜 포인트 ── */}
          <div className="space-y-2">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              🔑 핵심 딜 포인트
            </label>
            <div className="space-y-2">
              {dealPoints.map((point, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <span className="w-5 h-5 flex items-center justify-center bg-primary/10 text-primary text-[10px] font-bold rounded-full shrink-0">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={point}
                    onChange={(e) => updateDealPoint(i, e.target.value)}
                    className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary focus:bg-transparent transition-all placeholder:text-muted-foreground/40"
                    placeholder={`딜 포인트 ${i + 1}`}
                  />
                  {dealPoints.length > 1 && (
                    <button
                      onClick={() => removeDealPoint(i)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addDealPoint}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              포인트 추가
            </button>
          </div>

          {/* ── 카톡 문구 ── */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              💬 카톡 공유 문구
            </label>
            <textarea
              value={kakaoText}
              onChange={(e) => setKakaoText(e.target.value)}
              rows={4}
              className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:bg-transparent resize-y transition-all placeholder:text-muted-foreground/40 leading-relaxed"
              placeholder="카카오톡으로 공유할 때 함께 전송되는 문구"
            />
          </div>

          {/* ── 공유 OG 메타 및 이미지 관리 ── */}
          <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                🖼️ 공유 OG 메타 및 이미지 관리
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Preview */}
              <div className="space-y-2">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                  OG 이미지 미리보기 (실시간)
                </label>
                <div className="relative rounded-lg overflow-hidden border border-border aspect-[1.91/1] bg-neutral-900 flex items-center justify-center">
                  <img
                    src={`/api/og/deal/${buildingId}?t=${ogTimestamp}`}
                    alt="OG Preview"
                    className="w-full h-full object-cover"
                    key={ogTimestamp}
                  />
                </div>
              </div>
              {/* Inputs */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                    OG 타이틀 (카톡 공유 제목)
                  </label>
                  <input
                    type="text"
                    value={ogTitle}
                    onChange={(e) => setOgTitle(e.target.value)}
                    placeholder={title || "투자설명서 제목"}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block">
                    OG 설명 (카톡 공유 설명)
                  </label>
                  <textarea
                    value={ogDescription}
                    onChange={(e) => setOgDescription(e.target.value)}
                    placeholder={summary || "투자설명서 요약 설명"}
                    rows={3}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── 내부 참고용 (접이식) ── */}
          {cautionPoints.length > 0 && (
            <details className="group/caution">
              <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1.5 py-1">
                <span className="text-[10px] transition-transform group-open/caution:rotate-90">▶</span>
                🔒 내부 참고 확인 사항 ({cautionPoints.filter(Boolean).length}건)
                <span className="text-[9px] text-muted-foreground/60 ml-1">— 공유 시 비공개</span>
              </summary>
              <div className="mt-2 pl-4 border-l-2 border-muted space-y-1">
                {cautionPoints.map((p, i) => (
                  <p key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span>•</span>
                    <span>{p}</span>
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {isDirty() ? "⚠️ 저장되지 않은 변경 사항" : "✅ 최신 상태"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              공유 미리보기
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty()}
              className="flex items-center gap-1 text-[11px] bg-primary text-primary-foreground px-4 py-1.5 rounded-lg font-bold disabled:opacity-40 transition-all hover:brightness-110 active:scale-95"
            >
              {isSaving ? "저장 중..." : "💾 저장"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast.type && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-300 ${
            toast.type === "success"
              ? "bg-green-500/90 text-white"
              : "bg-red-500/90 text-white"
          }`}
        >
          {toast.type === "success" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* ── 미리보기 바텀시트 ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-[#0b0f19] rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[90vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>
            {/* Header */}
            <div className="px-5 pb-3 flex items-center justify-between border-b border-slate-800">
              <span className="text-sm font-bold text-white">📱 공유 딜카드 미리보기</span>
              <button
                onClick={() => setShowPreview(false)}
                className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                닫기
              </button>
            </div>
            {/* Preview iframe */}
            <div className="flex-1 overflow-auto">
              <iframe
                src={`/dc/${buildingId}?preview=1&t=${Date.now()}`}
                className="w-full border-0"
                style={{ minHeight: "70vh" }}
                title="딜카드 미리보기"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
