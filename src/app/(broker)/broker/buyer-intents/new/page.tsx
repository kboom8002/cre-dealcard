"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SAMPLE_MEMO =
  "김대표님 조건. 예산은 50억에서 80억 정도.\n성수나 강남 쪽 선호. 사옥으로 일부 쓰고 나머지는 임대수익 있으면 좋겠다고 함.\n주차는 꼭 필요하고, 너무 노후된 건물은 부담스러워함.\n대출은 50% 정도까지는 생각하지만 확정 아님.\n기존 임차인 만기가 언제인지 중요하게 봄.";

const LOADING_STEPS = [
  "매수자 조건 추출 중",
  "예산·지역·목적 구조화 중",
  "필수조건·우대조건 정리 중",
  "추가 확인 질문 생성 중",
];

export default function BuyerIntentNewPage() {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memo.trim()) return;

    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 1500);

    try {
      const res = await fetch("/api/broker/buyer-intents/from-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo: memo.trim() }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error?.message || "매수자 조건 정리에 실패했습니다.");
      }

      clearInterval(interval);
      router.push(`/broker/buyer-intents/${json.data.buyerIntentId}`);
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
            <h1 className="text-2xl font-bold">매수자 조건을 정리하고 있어요</h1>
            <p className="text-sm text-muted-foreground">
              예산, 지역, 목적, 필수조건을 AI가 구조화합니다.
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
                <span className="text-lg">{i <= loadingStep ? "✅" : "⏳"}</span>
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
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-6"
      >
        {/* Header */}
        <div className="space-y-2 pt-4">
          <h1 className="text-2xl font-bold">
            매수자 조건을 그대로 넣어주세요
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            AI가 예산, 지역, 목적, 필수조건을 정리합니다.
          </p>
        </div>

        {/* Memo Input */}
        <div className="space-y-2">
          <Textarea
            id="buyer-memo-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={
              "예:\n김대표 50~80억,\n성수나 강남,\n사옥 겸 임대수익 원함.\n주차 중요.\n너무 낡은 건물은 싫어함."
            }
            className="min-h-[160px] text-base"
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {memo.length > 0 ? `${memo.length}자` : "최소 5자 이상"}
            </p>
            <button
              type="button"
              onClick={() => setMemo(SAMPLE_MEMO)}
              className="text-xs text-primary hover:underline"
              id="btn-use-sample-buyer"
            >
              예시 메모 사용
            </button>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            🔒 매수자 실명과 연락처는 공유 문서에 포함되지 않습니다.
          </p>
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
          disabled={memo.trim().length < 5}
          id="cta-normalize-buyer"
        >
          조건 정리하기
        </Button>
      </form>
    </main>
  );
}
