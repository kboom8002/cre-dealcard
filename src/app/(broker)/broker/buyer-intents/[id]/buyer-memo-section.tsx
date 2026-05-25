"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { updateBuyerMemo, updateBuyerIntent } from "./actions";

interface Building {
  id: string;
  area_signal: string | null;
  asset_type: string | null;
  price_band: string | null;
}

interface ExistingMemo {
  id: string;
  title: string | null;
  body: Record<string, unknown>;
  status: string;
  markdown: string | null;
  created_at: string;
}

interface BuyerMemoSectionProps {
  buyerIntentId: string;
  buildings: Building[];
  existingMemo: ExistingMemo | null;
  intentNormalized: any;
}

export function BuyerMemoSection({
  buyerIntentId,
  buildings,
  existingMemo,
  intentNormalized,
}: BuyerMemoSectionProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memo result state (either fetched or newly generated)
  const [memoResult, setMemoResult] = useState<{
    documentId?: string;
    fitReasons: string[];
    cautionReasons: string[];
    missingData: string[];
    recommendedNextAction: string;
    kakaoMessage: string;
    boundaryNote?: string;
  } | null>(null);

  // Local editing states
  const [isEditingMemo, setIsEditingMemo] = useState(false);
  const [editedKakaoMessage, setEditedKakaoMessage] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  const [memoSaveSuccess, setMemoSaveSuccess] = useState(false);

  // Tab state: "edit" vs "preview"
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");

  // Copy success state
  const [copied, setCopied] = useState(false);

  // Missing questions local state for checklist
  const [missingQuestions, setMissingQuestions] = useState<string[]>([]);
  const [newInquiry, setNewInquiry] = useState("");
  const [isUpdatingQuestions, setIsUpdatingQuestions] = useState(false);

  // Sync missing questions from prop
  useEffect(() => {
    if (intentNormalized && Array.isArray(intentNormalized.missingQuestions)) {
      setMissingQuestions(intentNormalized.missingQuestions);
    }
  }, [intentNormalized]);

  // Load existing memo into state on mount
  useEffect(() => {
    if (existingMemo && !memoResult) {
      const body = existingMemo.body as any;
      setMemoResult({
        documentId: existingMemo.id,
        fitReasons: body.fitReasons || [],
        cautionReasons: body.cautionReasons || [],
        missingData: body.missingData || [],
        recommendedNextAction: body.recommendedNextAction || "",
        kakaoMessage: existingMemo.markdown || body.kakaoMessage || "",
        boundaryNote: body.boundaryNote || "",
      });
      setEditedKakaoMessage(existingMemo.markdown || body.kakaoMessage || "");
      if (existingMemo.body && (existingMemo.body as any).source_refs?.building_ssot_lite_id) {
        setSelectedBuildingId((existingDocBody: any) => (existingMemo.body as any).source_refs?.building_ssot_lite_id || "");
      }
    }
  }, [existingMemo, memoResult]);

  async function handleGenerate() {
    if (!selectedBuildingId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/broker/buyer-memo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingId: selectedBuildingId,
          buyerIntentId,
          tone: "kakao",
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error?.message || "생성에 실패했습니다.");

      const newMemo = {
        documentId: json.data.documentId,
        fitReasons: json.data.fitReasons || [],
        cautionReasons: json.data.cautionReasons || [],
        missingData: json.data.missingData || [],
        recommendedNextAction: json.data.recommendedNextAction || "",
        kakaoMessage: json.data.kakaoMessage || "",
        boundaryNote: json.data.boundaryNote || "",
      };

      setMemoResult(newMemo);
      setEditedKakaoMessage(newMemo.kakaoMessage);
      setActiveTab("edit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setIsLoading(false);
    }
  }

  // Save the custom edited Kakao Message
  async function handleSaveMemo() {
    if (!memoResult?.documentId) return;

    setIsSavingMemo(true);
    setError(null);
    setMemoSaveSuccess(false);

    try {
      const res = await updateBuyerMemo(memoResult.documentId, {
        kakaoMessage: editedKakaoMessage,
      });

      if (!res.success) throw new Error(res.error || "메모 업데이트 실패");

      setMemoResult((prev) => prev ? { ...prev, kakaoMessage: editedKakaoMessage } : null);
      setMemoSaveSuccess(true);
      setIsEditingMemo(false);
      setTimeout(() => setMemoSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장 실패");
    } finally {
      setIsSavingMemo(false);
    }
  }

  // Inject a missing question directly into the Kakao Message text editor
  function handleInjectQuestion(question: string) {
    const injectionText = `\n\n❓ 추가 확인 필요 사항:\n- ${question}`;
    setEditedKakaoMessage((prev) => prev + injectionText);
    setIsEditingMemo(true); // switch on edit textarea
  }

  // Cross-off (delete) an answered question from the DB
  async function handleCrossOffQuestion(idx: number) {
    if (isUpdatingQuestions) return;

    setIsUpdatingQuestions(true);
    const updatedList = missingQuestions.filter((_, i) => i !== idx);

    try {
      const updatedNormalized = {
        ...(intentNormalized || {}),
        missingQuestions: updatedList,
      };

      const res = await updateBuyerIntent(buyerIntentId, {
        normalized: updatedNormalized,
      });

      if (res.success) {
        setMissingQuestions(updatedList);
      } else {
        setError("질문 상태 업데이트에 실패했습니다.");
      }
    } catch (err) {
      setError("서버와 통신하는 중 문제가 발생했습니다.");
    } finally {
      setIsUpdatingQuestions(false);
    }
  }

  // Add a new inquiry to the DB checklist in real time
  async function handleAddInquiry() {
    if (!newInquiry.trim() || isUpdatingQuestions) return;

    setIsUpdatingQuestions(true);
    const updatedList = [...missingQuestions, newInquiry.trim()];

    try {
      const updatedNormalized = {
        ...(intentNormalized || {}),
        missingQuestions: updatedList,
      };

      const res = await updateBuyerIntent(buyerIntentId, {
        normalized: updatedNormalized,
      });

      if (res.success) {
        setMissingQuestions(updatedList);
        setNewInquiry("");
      } else {
        setError("질문 추가에 실패했습니다.");
      }
    } catch (err) {
      setError("서버와 통신하는 중 문제가 발생했습니다.");
    } finally {
      setIsUpdatingQuestions(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);

  return (
    <div className="space-y-6">
      {/* 1. Building Selector and Action Panel */}
      <div className="relative rounded-2xl border border-white/5 bg-slate-950/40 backdrop-blur-xl p-6 overflow-hidden shadow-elevation-2">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-blue-500/5 -z-10" />
        <h2 className="text-base font-bold flex items-center gap-2 text-slate-100">
          <span className="text-indigo-400">📋</span> 딜카드 연동 매수자 답장 제작기
        </h2>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          분석된 매수자 의향 조건을 특정 매물(딜카드)과 interlock하여 AI가 최적의 커뮤니케이션 코멘트를 빌드합니다.
        </p>

        {buildings.length > 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">연결할 딜카드 선택</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {buildings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBuildingId(b.id)}
                    className={`text-left rounded-xl border p-3.5 text-xs transition-all duration-200 relative overflow-hidden ${
                      selectedBuildingId === b.id
                        ? "border-indigo-500/60 bg-indigo-950/20 shadow-lg shadow-indigo-500/5 font-semibold text-slate-200"
                        : "border-white/5 bg-slate-900/20 hover:border-white/10 hover:bg-slate-900/40 text-slate-400"
                    }`}
                  >
                    {selectedBuildingId === b.id && (
                      <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-indigo-500 rounded-bl-lg" />
                    )}
                    <span className="block font-bold text-sm text-slate-200 mb-1">
                      {b.area_signal || "미확인 권역"}{" "}
                    </span>
                    <span className="text-muted-foreground">
                      {b.asset_type || "상업용"} · {b.price_band || "가격 미정"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-950/30 border border-red-800/40 px-3.5 py-2.5 text-xs text-red-400">
                ⚠️ {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!selectedBuildingId || isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-10 shadow-lg shadow-indigo-600/25 active:scale-[0.98] transition-all"
              id="cta-generate-buyer-memo"
            >
              {isLoading ? (
                <span className="flex items-center gap-1.5 justify-center">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  AI 분석 및 맞춤 답장 문구 생성 중...
                </span>
              ) : (
                "🎯 매수자 맞춤형 정밀 브리핑 문구 빌드"
              )}
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 border border-dashed border-white/10 rounded-xl bg-slate-900/10">
            <p className="text-sm text-muted-foreground">아직 매칭 연산된 딜카드가 없습니다.</p>
            <p className="text-xs text-muted-foreground mt-1">
              상단의 "수동 재매칭 실행" 버튼을 눌러 먼저 분석 매물을 연동해 주세요.
            </p>
          </div>
        )}
      </div>

      {/* 2. Generated Memo Result Dashboard */}
      {memoResult && (
        <div className="grid grid-cols-1 gap-6">
          {/* Fit, Caution & Missing Info Badges */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fit Reasons */}
            <div className="rounded-2xl border border-emerald-950/50 bg-emerald-950/10 p-5 space-y-3 relative overflow-hidden shadow-elevation-1">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                적합 요건 (Fit Reasons)
              </p>
              {memoResult.fitReasons.length > 0 ? (
                <ul className="space-y-2">
                  {memoResult.fitReasons.map((r, i) => (
                    <li key={i} className="text-xs leading-relaxed text-slate-300 flex items-start gap-1.5">
                      <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
                      <span>{String(r)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">부합 요건 없음</p>
              )}
            </div>

            {/* Caution Reasons */}
            <div className="rounded-2xl border border-amber-950/50 bg-amber-950/10 p-5 space-y-3 relative overflow-hidden shadow-elevation-1">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
              <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                주의 요건 (Cautions)
              </p>
              {memoResult.cautionReasons.length > 0 ? (
                <ul className="space-y-2">
                  {memoResult.cautionReasons.map((r, i) => (
                    <li key={i} className="text-xs leading-relaxed text-slate-300 flex items-start gap-1.5">
                      <span className="text-amber-500 shrink-0 mt-0.5">!</span>
                      <span>{String(r)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">특이사항 없음</p>
              )}
            </div>

            {/* Missing Data */}
            <div className="rounded-2xl border border-blue-950/50 bg-blue-950/10 p-5 space-y-3 relative overflow-hidden shadow-elevation-1">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
              <p className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                보완 필요 정보 (Missing Data)
              </p>
              {memoResult.missingData.length > 0 ? (
                <ul className="space-y-2">
                  {memoResult.missingData.map((d, i) => (
                    <li key={i} className="text-xs leading-relaxed text-slate-300 flex items-start gap-1.5">
                      <span className="text-blue-500 shrink-0 mt-0.5">-</span>
                      <span>{String(d)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground italic">확인 필요자료 없음</p>
              )}
            </div>
          </div>

          {/* Interactive Checklist & Live Custom Editor Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Tabbed Copywriting Editor & Simulated KakaoTalk Bubble */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setActiveTab("edit")}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                      activeTab === "edit"
                        ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    📝 메시지 직접 수정
                  </button>
                  <button
                    onClick={() => setActiveTab("preview")}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ${
                      activeTab === "preview"
                        ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-300"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>💬</span> 카톡 실시간 프리뷰
                  </button>
                </div>
                {memoSaveSuccess && (
                  <span className="text-[10px] text-emerald-400 animate-pulse font-medium">
                    ✨ 편집 내용 실시간 동기화 완료!
                  </span>
                )}
              </div>

              {activeTab === "edit" ? (
                <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 space-y-4 shadow-elevation-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                      Interactive Text Editor
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      글자 수: {editedKakaoMessage.length}자
                    </span>
                  </div>

                  <textarea
                    value={editedKakaoMessage}
                    onChange={(e) => {
                      setEditedKakaoMessage(e.target.value);
                      setIsEditingMemo(true);
                    }}
                    rows={12}
                    className="w-full bg-slate-950/70 border border-white/5 rounded-xl px-4 py-3.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/80 leading-relaxed font-mono whitespace-pre-wrap resize-none"
                    placeholder="매수자에게 보낼 브리핑 문구를 직접 편집해 보세요."
                  />

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <Button
                      variant="ghost"
                      onClick={() => handleCopy(editedKakaoMessage)}
                      className="text-xs hover:bg-white/5 text-slate-300 h-9"
                    >
                      {copied ? "✅ 복사완료!" : "📋 텍스트 복사"}
                    </Button>

                    <div className="flex items-center gap-2">
                      {isEditingMemo && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditedKakaoMessage(memoResult.kakaoMessage);
                            setIsEditingMemo(false);
                          }}
                          className="text-xs hover:bg-white/5 text-slate-400 h-9"
                        >
                          되돌리기
                        </Button>
                      )}
                      <Button
                        onClick={handleSaveMemo}
                        disabled={isSavingMemo || !memoResult.documentId}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 h-9 shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all"
                      >
                        {isSavingMemo ? "저장 중..." : "수정본 서버 저장"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                /* KakaoTalk Mobile Simulated Custom Sharing Card Bubble */
                <div className="mx-auto max-w-[320px] rounded-3xl border border-white/10 bg-slate-950 p-4 shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-radial-gradient-indigo -z-10 opacity-30" />
                  
                  {/* Phone Header Bar */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono px-1 mb-3">
                    <span>JS CRE CHAT</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>

                  {/* Message Bubble Container */}
                  <div className="bg-[#FFEB33] text-[#1E1E1E] rounded-2xl rounded-tl-none p-4 shadow-lg space-y-3.5 relative select-none max-h-[460px] overflow-y-auto font-sans leading-relaxed">
                    {/* Brand Banner */}
                    <div className="flex items-center gap-1.5 border-b border-black/10 pb-2">
                      <div className="w-5 h-5 rounded-full bg-[#1E1E1E] text-[#FFEB33] flex items-center justify-center text-[10px] font-black">
                        JS
                      </div>
                      <span className="text-[10px] font-black tracking-tight text-[#1E1E1E]/80">
                        JS 1분 딜카드 분석 리포트
                      </span>
                    </div>

                    {/* Shared Content */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-red-600 text-white border-0 font-extrabold rounded-md px-1.5 py-0.5 text-[10px]">
                          Premium Match
                        </span>
                        {selectedBuilding && (
                          <span className="text-xs font-black text-slate-800">
                            {selectedBuilding.area_signal || "권역 미확인"} · {selectedBuilding.asset_type || "상업용"}
                          </span>
                        )}
                      </div>
                      
                      {/* Body Message */}
                      <p className="text-xs font-semibold whitespace-pre-wrap leading-relaxed break-all text-[#2c2c2c]">
                        {editedKakaoMessage || "리포트를 작성하는 중입니다."}
                      </p>
                    </div>

                    {/* Kakao sharing CTA button template */}
                    <div className="pt-2.5 border-t border-black/10 space-y-1.5">
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="block text-center bg-[#1E1E1E] text-white hover:bg-black font-extrabold text-[10px] rounded-lg py-2.5 shadow-sm active:scale-[0.98] transition-all"
                      >
                        ⚡ 1분 딜카드 상세 분석 확인
                      </a>
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="block text-center bg-white/40 hover:bg-white/60 font-bold text-[9px] text-[#1E1E1E] rounded-lg py-2"
                      >
                        📞 담당 중개사 직통 유선 연결
                      </a>
                    </div>
                  </div>

                  {/* Quick copy indicator */}
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => handleCopy(editedKakaoMessage)}
                      className="bg-slate-900 border border-white/10 hover:border-white/20 text-slate-300 text-[10px] rounded-xl px-4 py-2 hover:bg-slate-800 transition-colors"
                    >
                      {copied ? "✅ 프리뷰 문구 복사완료!" : "📋 프리뷰 카톡 문구 복사"}
                    </button>
                  </div>
                </div>
              )}

              {/* Boundary / Disclaimer Note */}
              {memoResult.boundaryNote && (
                <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4">
                  <p className="text-[10px] text-muted-foreground leading-relaxed leading-5">
                    <span className="font-bold text-amber-500/80">⚠️ 면책안내:</span>{" "}
                    {memoResult.boundaryNote}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Interactive Missing Questions Checklist Panel */}
            <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 space-y-4 shadow-elevation-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                  <span>❓</span> 의향 보완 질문 리스트 (Missing Questions)
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  총 {missingQuestions.length}건
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                매수자의 불명확한 요건들을 해결하기 위해 AI가 추가 질문을 권장합니다. 답변 완료된 질문은 체크하여 영구 제외 처리하거나, 버튼을 눌러 카톡 문구 본문에 질문을 즉시 삽입할 수 있습니다.
              </p>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {missingQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="group flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-slate-950/30 hover:bg-slate-950/70 p-3 text-xs transition-all"
                  >
                    <div className="flex gap-2 min-w-0">
                      <span className="text-indigo-400 font-bold shrink-0 mt-0.5">{idx + 1}.</span>
                      <span className="text-slate-300 leading-relaxed break-words">{q}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Inject Button */}
                      <button
                        onClick={() => handleInjectQuestion(q)}
                        className="w-7 h-7 rounded-lg border border-indigo-500/10 hover:border-indigo-500/30 text-indigo-400 hover:text-indigo-300 flex items-center justify-center transition-colors bg-indigo-950/10"
                        title="카톡 문구에 이 질문 삽입"
                      >
                        +
                      </button>

                      {/* Check-off Answered Button */}
                      <button
                        onClick={() => handleCrossOffQuestion(idx)}
                        disabled={isUpdatingQuestions}
                        className="w-7 h-7 rounded-lg border border-red-500/10 hover:border-red-500/30 text-red-400 hover:text-red-300 flex items-center justify-center transition-colors bg-red-950/10 disabled:opacity-50"
                        title="해결됨 (삭제)"
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ))}

                {missingQuestions.length === 0 && (
                  <div className="py-6 text-center text-xs text-muted-foreground italic border border-dashed border-white/5 rounded-xl bg-slate-950/10">
                    모든 권장 확인 사항이 완료되었거나 목록이 비어 있습니다.
                  </div>
                )}
              </div>

              {/* Add New Inquiry inline */}
              <div className="pt-2 border-t border-white/5 space-y-2">
                <label className="text-[10px] font-semibold text-slate-400">질문 직접 추가하기</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newInquiry}
                    onChange={(e) => setNewInquiry(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddInquiry();
                      }
                    }}
                    placeholder="새로운 추가 확인이 필요한 내용을 기록하세요..."
                    className="flex-1 bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/60 transition-colors"
                  />
                  <button
                    onClick={handleAddInquiry}
                    disabled={isUpdatingQuestions || !newInquiry.trim()}
                    className="bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 text-indigo-400 font-bold px-4 rounded-xl text-xs flex items-center justify-center transition-all active:scale-95 shrink-0 disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
