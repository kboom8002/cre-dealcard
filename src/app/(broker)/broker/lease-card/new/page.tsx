"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

export default function NewLeaseCardPage() {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memo || memo.length < 5) {
      setError("메모를 5자 이상 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      setStep("1. 비정형 임대 메모 분석 중...");
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setStep("2. 임대차 SSoT Lite 생성 중...");
      await new Promise(resolve => setTimeout(resolve, 800));

      setStep("3. 안전한 블라인드 티저 작성 및 저장 중...");
      
      const res = await fetch("/api/broker/lease-card/from-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "임대차 딜카드 생성 실패");
      }

      router.push(`/broker/lease-card/${json.data.leaseSpaceId}`);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
      setLoading(false);
      setStep("");
    }
  };

  const loadExample = () => {
    setMemo(
      `성수역 도보 3분 대로변 코너 빌딩 2층 임대합니다. 
전용면적 45평(실평수), 현재 유명 의류 쇼룸 운영중이고 7월 말 퇴거 예정. 
보증금 1억에 월세 650만원, 관리비 50만원 별도입니다.
주차 1대 무료이고, 인테리어 무상 인수 협의 가능. 
업종은 고급 카페나 쇼룸, 브랜드 사옥 추천합니다. 
랜드로드는 대기업 계열사라 임대 조건 깔끔하고 렌트프리 2개월 협의해 주기로 했습니다.
상세한 주소는 일단 관심 고객에게만 공개해주세요.`
    );
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-100 px-4 py-8 pb-24">
      <div className="w-full max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 pt-4">
          <button
            onClick={() => router.back()}
            className="text-slate-400 hover:text-white p-1 text-lg transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">신규 임대차 딜카드</h1>
            <p className="text-xs text-slate-400">카톡 메모를 붙여넣어 1분 만에 블라인드 딜카드 생성</p>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-[#151c2c] border border-slate-800 rounded-2xl p-4 space-y-2">
          <h2 className="text-xs font-semibold text-primary uppercase tracking-wide">💡 AI 자동 변환 기술</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            비정형 메모에서 임대료(보증금/월세), 면적, 층수, 업종 제한 등을 파싱하고, 
            주소와 임대인 신원 등 민감 정보는 자동으로 숨긴 **블라인드 티저**를 제작합니다.
          </p>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-300">중개용 임대 메모 입력</label>
              <button
                type="button"
                onClick={loadExample}
                className="text-xs text-primary hover:underline font-medium"
              >
                📝 성수동 예시 불러오기
              </button>
            </div>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="여기에 카카오톡 매물 정보나 중개 메모를 그대로 붙여넣으세요..."
              rows={12}
              className="w-full bg-[#111726] border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-primary/50 transition-all font-sans leading-relaxed resize-none"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="bg-[#121824] border border-slate-800 rounded-xl p-4 text-center space-y-3">
              <div className="relative w-8 h-8 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
              <p className="text-xs text-primary font-semibold tracking-wide animate-pulse">{step}</p>
              <p className="text-[10px] text-slate-500">잠시만 기다려주시면 블라인드 카드가 완성됩니다.</p>
            </div>
          ) : (
            <button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-3.5 text-sm transition-all shadow-lg active:scale-[0.98]"
            >
              🚀 AI 1분 임대차 딜카드 생성
            </button>
          )}
        </form>
      </div>

      <BrokerBottomNav />
    </main>
  );
}
