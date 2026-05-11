"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const PURPOSE_OPTIONS = [
  { value: "sell_consideration", label: "내 건물 매각 검토", emoji: "🏢" },
  { value: "buy_consideration", label: "이 건물 매입 검토", emoji: "🔍" },
  { value: "owner_user_hq", label: "법인 사옥 검토", emoji: "🏛️" },
  { value: "broker_work", label: "중개 업무", emoji: "📋" },
  { value: "investment_learning", label: "투자 공부", emoji: "📚" },
] as const;

const LOADING_STEPS = [
  "주소/권역 확인 중",
  "건물 기본정보 정리 중",
  "상권·입지 신호 확인 중",
  "매수자 관점 질문 생성 중",
  "공개 가능 정보 점검 중",
];

export default function BuildingRadarPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [purpose, setPurpose] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !purpose) return;

    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    // Simulate progressive loading steps
    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 1800);

    try {
      const res = await fetch("/api/public/building-radar/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input.trim(),
          inputType: "address",
          userPurpose: purpose,
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error?.message || "생성에 실패했습니다.");
      }

      clearInterval(interval);
      router.push(`/building-radar/result/${json.data.buildingId}`);
    } catch (err) {
      clearInterval(interval);
      setError(
        err instanceof Error
          ? err.message
          : "이번 생성은 완료하지 못했습니다.",
      );
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">
              건물 신호를 정리하고 있어요
            </h1>
            <p className="text-sm text-muted-foreground">
              AI가 가격을 추정하는 것이 아니라,
              <br />딜 검토에 필요한 질문을 정리하고 있습니다.
            </p>
          </div>

          <div className="space-y-3 text-left">
            {LOADING_STEPS.map((step, i) => (
              <div
                key={step}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  i <= loadingStep ? "opacity-100" : "opacity-30"
                }`}
              >
                <span className="text-lg">
                  {i <= loadingStep ? "✅" : "⏳"}
                </span>
                <span className="text-sm">{step}</span>
              </div>
            ))}
          </div>

          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%`,
              }}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-8"
      >
        {/* Hero */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            이 건물, 딜 될까?
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            지번만 입력하면
            <br />
            매수자가 실제로 물어볼 질문,
            <br />
            확인해야 할 리스크,
            <br />
            필요한 자료를 AI가 먼저 정리합니다.
          </p>
        </div>

        {/* Address Input */}
        <div className="space-y-2">
          <label htmlFor="building-input" className="text-sm font-medium">
            지번 또는 도로명주소
          </label>
          <Textarea
            id="building-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 성수동 80억대 근생, 일부 임대 중, 사옥 가능성"
            className="min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            지번, 도로명주소, 건물명, 또는 간단한 설명을 입력해주세요.
          </p>
        </div>

        {/* Purpose Selector */}
        <div className="space-y-3">
          <label className="text-sm font-medium">
            이 건물을 왜 보고 있나요?
          </label>
          <div className="grid grid-cols-1 gap-2">
            {PURPOSE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPurpose(opt.value)}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-left transition-all ${
                  purpose === opt.value
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/40"
                }`}
                id={`purpose-${opt.value}`}
              >
                <span className="text-lg">{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!input.trim() || !purpose}
          id="cta-generate-report"
        >
          딜 관점으로 보기
        </Button>

        {/* Microcopy */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          가격을 단정하지 않습니다.
          <br />
          투자 추천을 하지 않습니다.
          <br />
          대신, 실제 딜 검토에 필요한 질문을 찾아드립니다.
        </p>
      </form>
    </main>
  );
}
