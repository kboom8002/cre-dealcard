"use client";

import { useState, useEffect } from "react";
import {
  BrokerCardTemplate,
  BrokerCardKakaoCopy,
  type BrokerCardContent,
} from "@/components/broker-card/BrokerCardTemplates";

// ── Card type definitions ───────────────────────────────────────────
const CARD_TYPES = [
  { value: "seller",  icon: "💰", label: "매도자용",     desc: "매각 실적과 딜 속도를 강조하여 건물주의 신뢰를 확보합니다." },
  { value: "buyer",   icon: "🎯", label: "매수자용",     desc: "보유 블라인드 딜 현황으로 투자자에게 기회를 어필합니다." },
  { value: "tenant",  icon: "🏢", label: "임차인용",     desc: "임대 가능 공간 목록으로 공간을 찾는 분에게 전달합니다." },
  { value: "network", icon: "🤝", label: "네트워킹용",   desc: "동료 중개인에게 협업 가능한 실적과 네트워크를 보여줍니다." },
  { value: "owner",   icon: "🏗️", label: "건물주 관리용", desc: "자산 관리 역량과 월간 리포트 서비스를 어필합니다." },
] as const;

export default function BrokerMyCardNewPage() {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [card, setCard] = useState<BrokerCardContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  // Load broker stats on mount (for name suggestion)
  useEffect(() => {
    fetch("/api/broker/profile/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.data) {
          // Pre-fill broker name if available from stats
          setStatsLoading(false);
        }
      })
      .catch(() => setStatsLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!selectedType || !brokerName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/broker/my-card/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedType, brokerName: brokerName.trim() }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setCard(json.data);
        setStep(3);
      }
    } catch (err) {
      console.error("카드 생성 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-lg mx-auto px-4 py-8 space-y-8">
      {/* ── Header ── */}
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">💼 나의 브로커 카드 만들기</h1>
        <p className="text-sm text-slate-500">
          상황과 대상에 맞는 디지털 명함을 3단계로 생성합니다.
        </p>
      </div>

      {/* ── Step Indicator ── */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step >= s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {s}
            </div>
            {s < 3 && (
              <div className={`w-12 h-0.5 rounded ${step > s ? "bg-primary" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          {step === 1 ? "유형 선택" : step === 2 ? "이름 입력" : "미리보기"}
        </span>
      </div>

      {/* ═══════════════════ STEP 1: 카드 유형 선택 ═══════════════════ */}
      {step === 1 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-800">카드 유형을 선택하세요</h2>
          <div className="space-y-2.5">
            {CARD_TYPES.map((ct) => (
              <button
                key={ct.value}
                onClick={() => {
                  setSelectedType(ct.value);
                  setStep(2);
                }}
                className={`w-full text-left rounded-xl border p-4 transition-all hover:shadow-md active:scale-[0.99] ${
                  selectedType === ct.value
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                id={`card-type-${ct.value}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{ct.icon}</span>
                  <div className="space-y-0.5">
                    <p className="text-sm font-bold text-slate-800">{ct.label}</p>
                    <p className="text-xs text-slate-500 leading-relaxed">{ct.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 2: 이름 입력 ═══════════════════ */}
      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-base font-semibold text-slate-800">카드에 표시할 이름</h2>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-500">브로커 이름</label>
            <input
              type="text"
              value={brokerName}
              onChange={(e) => setBrokerName(e.target.value)}
              placeholder="예: 김재석"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary transition-colors"
              autoFocus
              id="input-broker-name"
            />
          </div>

          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
            <span className="text-lg">{CARD_TYPES.find((t) => t.value === selectedType)?.icon}</span>
            <div>
              <p className="text-xs font-bold text-slate-700">
                {CARD_TYPES.find((t) => t.value === selectedType)?.label}
              </p>
              <button
                onClick={() => setStep(1)}
                className="text-[10px] text-primary underline"
              >
                유형 변경
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-slate-100 text-slate-600 rounded-xl py-3 text-sm font-medium hover:bg-slate-200 transition-colors"
            >
              이전
            </button>
            <button
              onClick={handleGenerate}
              disabled={!brokerName.trim() || loading}
              className="flex-[2] bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              id="btn-generate-card"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  생성 중...
                </span>
              ) : (
                "카드 생성하기"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════ STEP 3: 미리보기 & 공유 ═══════════════════ */}
      {step === 3 && card && (
        <div className="space-y-6">
          <h2 className="text-base font-semibold text-slate-800">미리보기 & 공유</h2>

          {/* Card Preview */}
          <BrokerCardTemplate card={card} brokerName={brokerName} type={selectedType} />

          {/* Share Actions */}
          <div className="space-y-3">
            <BrokerCardKakaoCopy kakaoText={card.kakaoText} />

            <button
              onClick={() => {
                const url = `${window.location.origin}/broker-profile/${encodeURIComponent(brokerName)}`;
                navigator.clipboard.writeText(url);
              }}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold rounded-xl py-3 text-sm hover:bg-slate-200 transition-colors"
              id="btn-copy-url"
            >
              🔗 프로필 URL 복사
            </button>
          </div>

          {/* Regenerate */}
          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-slate-50 text-slate-500 rounded-xl py-2.5 text-xs font-medium hover:bg-slate-100"
            >
              다른 유형으로 만들기
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 bg-slate-50 text-slate-500 rounded-xl py-2.5 text-xs font-medium hover:bg-slate-100"
            >
              🔄 다시 생성
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
