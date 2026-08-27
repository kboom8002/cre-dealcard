"use client";

import React, { useState, useCallback, useEffect } from "react";
import { X, Plus, Save, Check, AlertCircle, Sparkles, MessageCircle, Image as ImageIcon, FileText } from "lucide-react";
import { toast as sonnerToast } from "sonner";

interface DealCardEditorProps {
  buildingId: string;
  initialTitle: string;
  initialSummary: string;
  initialDealPoints: string[];
  initialCautionPoints: string[];
  initialKakaoText: string;
  initialOgTitle?: string;
  initialOgDescription?: string;
  initialHookCopy?: string;
  initialStructureChips?: string[];
  initialVacancyLabel?: string;
  initialCuriosityHook?: string;
}

export function DealCardEditor({
  buildingId,
  initialTitle,
  initialSummary,
  initialDealPoints,
  initialCautionPoints,
  initialKakaoText,
  initialOgTitle = "",
  initialOgDescription = "",
  initialHookCopy = "",
  initialStructureChips = [],
  initialVacancyLabel = "",
  initialCuriosityHook = "",
}: DealCardEditorProps) {
  // ── State ──
  const [activeSubTab, setActiveSubTab] = useState<"card" | "kakao" | "og">("card");
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [dealPoints, setDealPoints] = useState<string[]>(
    initialDealPoints.length > 0 ? initialDealPoints : ["", "", ""]
  );
  const [cautionPoints, setCautionPoints] = useState<string[]>(initialCautionPoints);
  const [kakaoText, setKakaoText] = useState(initialKakaoText);
  const [ogTitle, setOgTitle] = useState(initialOgTitle);
  const [ogDescription, setOgDescription] = useState(initialOgDescription);
  const [hookCopy, setHookCopy] = useState(initialHookCopy);
  const [structureChips, setStructureChips] = useState(initialStructureChips.join(", "));
  const [vacancyLabel, setVacancyLabel] = useState(initialVacancyLabel);
  const [curiosityHook, setCuriosityHook] = useState(initialCuriosityHook);

  const [isSaving, setIsSaving] = useState(false);

  // ── Dirty check ──
  const isDirty = useCallback(() => {
    return (
      title !== initialTitle ||
      summary !== initialSummary ||
      JSON.stringify(dealPoints.filter(Boolean)) !== JSON.stringify(initialDealPoints) ||
      JSON.stringify(cautionPoints.filter(Boolean)) !== JSON.stringify(initialCautionPoints) ||
      kakaoText !== initialKakaoText ||
      ogTitle !== initialOgTitle ||
      ogDescription !== initialOgDescription ||
      hookCopy !== initialHookCopy ||
      structureChips !== initialStructureChips.join(", ") ||
      vacancyLabel !== initialVacancyLabel ||
      curiosityHook !== initialCuriosityHook
    );
  }, [title, summary, dealPoints, cautionPoints, kakaoText, ogTitle, ogDescription, hookCopy, structureChips, vacancyLabel, curiosityHook, initialTitle, initialSummary, initialDealPoints, initialCautionPoints, initialKakaoText, initialOgTitle, initialOgDescription, initialHookCopy, initialStructureChips, initialVacancyLabel, initialCuriosityHook]);

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
          hookCopy,
          structureChips: structureChips.split(",").map((s) => s.trim()).filter(Boolean),
          vacancyLabel,
          curiosityHook,
        }),
      });
      if (res.ok) {
        sonnerToast.success("딜카드 문구가 성공적으로 저장되었습니다!");
        sessionStorage.setItem(`kakao_text_${buildingId}`, kakaoText);
        window.dispatchEvent(new Event(`kakao_update_${buildingId}`));
        window.dispatchEvent(new Event(`deal_card_updated_${buildingId}`));
      } else {
        const err = await res.json().catch((err) => { console.warn('[DealCardEditor]', err); return {}; });
        sonnerToast.error(err.error || "저장 실패 — 다시 시도해주세요");
      }
    } catch {
      sonnerToast.error("네트워크 오류 — 다시 시도해주세요");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-md overflow-hidden space-y-0">
      {/* Header & Sub-tabs */}
      <div className="p-4 bg-muted/30 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>딜카드 & 공유 정보 편집</span>
              {isDirty() && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="수정된 내용 있음" />
              )}
            </h2>
            <p className="text-[11px] text-muted-foreground">카톡 공유 문구와 핵심 포인트를 맞춤 편집하세요.</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty()}
          className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3.5 py-1.5 rounded-lg font-bold disabled:opacity-40 transition-all hover:brightness-110 active:scale-95 shadow-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? "저장 중..." : "변경사항 저장"}
        </button>
      </div>

      {/* 3-Sub Tabs */}
      <div className="flex border-b border-border bg-muted/10 text-xs">
        <button
          type="button"
          onClick={() => setActiveSubTab("card")}
          className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === "card"
              ? "border-primary text-primary bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          딜 타이틀 & 핵심 포인트
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("kakao")}
          className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === "kakao"
              ? "border-primary text-primary bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          카카오톡 전송 문구
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("og")}
          className={`flex-1 py-2.5 font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeSubTab === "og"
              ? "border-primary text-primary bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          OG 공유 메타
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-4 space-y-4">
        {/* ── SUB-TAB 1: 딜 타이틀 & 핵심 포인트 ── */}
        {activeSubTab === "card" && (
          <div className="space-y-4 animate-in fade-in duration-150">
            {/* 제목 */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-semibold flex items-center justify-between">
                <span>📌 딜카드 메인 제목</span>
                <span className="text-[10px] text-muted-foreground/70">권역·자산유형·핵심특징 반영</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-primary transition-colors"
                placeholder="예: 만실 운영 · 역세권 코너 · 잠원권 근생빌딩"
              />
            </div>

            {/* 한 줄 소구 (Hook Copy) */}
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                🎯 한 줄 소구 카피 (Hook Copy)
              </label>
              <input
                type="text"
                value={hookCopy}
                onChange={(e) => setHookCopy(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary transition-colors"
                placeholder="예: 신사역 도보 5분, 공실 없는 우량 임차 구성"
              />
            </div>

            {/* 핵심 딜 포인트 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5">
                  <span>🔑 핵심 딜 포인트 ({dealPoints.filter(Boolean).length}개 등록됨)</span>
                </label>
                <span className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                  1~3번 항목이 카톡 카드/미리보기에 우선 노출
                </span>
              </div>
              <div className="space-y-2">
                {dealPoints.map((point, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full ${
                        i < 3 
                          ? "bg-primary text-primary-foreground shadow-xs" 
                          : "bg-muted text-muted-foreground border border-border"
                      }`}>
                        {i + 1}
                      </span>
                      {i < 3 && (
                        <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 shrink-0">
                          Top {i + 1}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={point}
                      onChange={(e) => updateDealPoint(i, e.target.value)}
                      className={`flex-1 bg-background border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors ${
                        i < 3 ? "border-primary/40 focus:border-primary" : "border-border focus:border-muted-foreground"
                      }`}
                      placeholder={`핵심 강점 ${i + 1} (예: 만실 운영 중, 월 수입 2,850만원)`}
                    />
                    {dealPoints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeDealPoint(i)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 transition-all"
                        title="포인트 삭제"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={addDealPoint}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  포인트 추가
                </button>
                <span className="text-[10px] text-muted-foreground">
                  * 4번 이후 항목은 매수자가 상세 페이지를 열었을 때 전체 공개됩니다.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── SUB-TAB 2: 카카오톡 전송 문구 ── */}
        {activeSubTab === "kakao" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                <span>💬 카카오톡 공유 시 함께 전송되는 메시지</span>
                <span>{kakaoText.length.toLocaleString()}자</span>
              </div>
              <textarea
                value={kakaoText}
                onChange={(e) => setKakaoText(e.target.value)}
                rows={6}
                className="w-full bg-background border border-border rounded-xl p-3 text-xs leading-relaxed focus:outline-none focus:border-primary resize-y font-sans"
                placeholder="카카오톡 단톡방이나 매수자에게 보낼 메시지 원문"
              />
            </div>
            <p className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg leading-relaxed">
              💡 카카오톡 공유 버튼을 누르면 위 문구와 함께 하단의 블라인드 딜카드 링크가 매수자에게 전송됩니다.
            </p>
          </div>
        )}

        {/* ── SUB-TAB 3: OG 공유 메타 ── */}
        {activeSubTab === "og" && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                🖼️ OG 카드 타이틀 (소셜 미리보기 제목)
              </label>
              <input
                type="text"
                value={ogTitle}
                onChange={(e) => setOgTitle(e.target.value)}
                placeholder={title || "투자설명서 제목"}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-semibold">
                📝 OG 카드 설명 (소셜 미리보기 요약)
              </label>
              <textarea
                value={ogDescription}
                onChange={(e) => setOgDescription(e.target.value)}
                placeholder={summary || "투자설명서 요약 설명"}
                rows={3}
                className="w-full bg-background border border-border rounded-lg p-2.5 text-xs focus:outline-none focus:border-primary resize-none leading-relaxed"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2.5 bg-muted/20 border-t border-border flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">
          {isDirty() ? "⚠️ 수정된 내용이 있습니다. 저장 버튼을 눌러주세요." : "✅ 모든 변경사항이 반영되었습니다."}
        </span>
        <button
          onClick={handleSave}
          disabled={isSaving || !isDirty()}
          className="text-primary font-bold hover:underline disabled:opacity-40"
        >
          {isSaving ? "저장 중..." : "저장하기"}
        </button>
      </div>
    </div>
  );
}
