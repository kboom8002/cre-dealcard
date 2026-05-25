"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrokerBottomNav from "@/components/layout/BrokerBottomNav";

interface Client {
  id: string;
  display_name: string;
  company: string | null;
}

export default function NewTenantIntentPage() {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("");

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/broker/clients");
      const json = await res.json();
      if (res.ok && json.data) {
        setClients(json.data);
      }
    } catch (err) {
      console.error("고객 조회 실패", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memo || memo.length < 5) {
      setError("메모를 5자 이상 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    setStep("임차인의 요구사항 정형 분석 중...");

    try {
      const res = await fetch("/api/broker/tenant-intents/from-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memo,
          clientId: clientId ? clientId : null,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "임차 의향서 등록 실패");
      }

      router.push(`/broker/tenant-intents/${json.data.tenantIntentId}`);
    } catch (err: any) {
      setError(err.message || "오류가 발생했습니다.");
      setLoading(false);
    }
  };

  const loadExample = () => {
    setMemo(
      `이태원이나 성수 지역에 빈티지 가구 쇼룸 겸 카페를 하려는 임차사입니다. 
전용 40~60평 원하고 1층 필수, 층고가 높고 개방감이 좋아야 합니다. 
보증금 최대 8천만원에 월세 500만원 선까지 가능하고, 관리비는 40만 이하 선호. 
간판 시인성이 좋아야 하며, 주차는 1대 이상 무료 지원되면 좋습니다. 
입주는 8월 중순~하반기 중 협의 희망하고 렌트프리는 최소 2달 원하십니다. 
전기 용량이 많이 필요한 커피 머신이 들어와서 단상/삼상 20kW 증설 가능한 곳 위주로 알아봐 주세요.`
    );
  };

  return (
    <main className="flex flex-col items-center min-h-screen bg-[#0b0f19] text-slate-200 px-4 py-8 pb-24">
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
            <h1 className="text-xl font-bold text-white">임차인 의향서 등록</h1>
            <p className="text-xs text-slate-400">임차인의 요구 조건 메모를 정형 데이터로 변환</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* CRM Client Link Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">연결할 CRM 고객 선택 (선택)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-[#111726] border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-primary/50 transition-all cursor-pointer"
            >
              <option value="">고객을 연결하지 않음 (의향서 단독 등록)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name} {c.company ? `(${c.company})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-slate-300">임차 조건 및 메모 입력</label>
              <button
                type="button"
                onClick={loadExample}
                className="text-xs text-primary hover:underline font-medium"
              >
                🏷️ 임차 요구 메모 예시 불러오기
              </button>
            </div>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="임차인의 업종, 찾는 면적, 예산(보증금/월세), 필수 요청 조건(주차, 렌트프리, 층 등)이 담긴 메모를 붙여넣으세요..."
              rows={10}
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
              <p className="text-[10px] text-slate-500">AI 매칭 엔진이 실시간으로 매물을 매치하고 있습니다.</p>
            </div>
          ) : (
            <button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl py-3.5 text-sm transition-all shadow-lg active:scale-[0.98]"
            >
              🎯 AI 임차인 정규화 및 자동 매칭 실행
            </button>
          )}
        </form>
      </div>

      <BrokerBottomNav />
    </main>
  );
}
