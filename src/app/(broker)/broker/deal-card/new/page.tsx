"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { createClient } from "@/lib/supabase/client";

const LOADING_STEPS = [
  "메모에서 매물 정보 추출 중",
  "건물 기본 신호 생성 중",
  "민감정보 식별 및 숨김 처리 중",
  "블라인드 딜카드 생성 중",
  "카카오 문구 준비 중",
];

const SAMPLE_MEMO =
  "성수동 쪽 80억대 근생 건물. 정확한 주소는 아직 비공개로 해주세요.\n1층은 F&B로 쓰기 괜찮고 상층은 사무실 가능. 일부 임대 중이고 일부 공실 가능성 있음.\n매도자는 너무 공개되는 걸 싫어해서 임차인명이나 월세 세부는 빼고 먼저 사옥 수요자나 장기보유형한테 반응 보고 싶어함.\n주차는 확인 필요. 건물은 좀 노후됐고 리모델링 스토리 가능할 수도 있음.";

export default function BrokerDealCardNewPage() {
  const router = useRouter();
  const [memo, setMemo] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memo.trim()) return;

    setIsLoading(true);
    setError(null);
    setLoadingStep(0);

    // Progressive loading steps
    const interval = setInterval(() => {
      setLoadingStep((prev) =>
        prev < LOADING_STEPS.length - 1 ? prev + 1 : prev,
      );
    }, 2000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/broker/deal-card/from-memo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          memo: memo.trim(),
          visibilityPreference: "blind",
        }),
      });

      const json = await res.json();

      if (!json.ok) {
        const errorMsg =
          json.error?.message ||
          (typeof json.error === "string" ? json.error : null) ||
          json.message ||
          "딜카드 생성에 실패했습니다.";
        throw new Error(errorMsg);
      }

      clearInterval(interval);
      router.push(`/broker/deal-card/${json.data.buildingId}`);
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

  function handleUseSample() {
    setMemo(SAMPLE_MEMO);
  }

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div className="w-full max-w-md mx-auto text-center space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">딜카드를 만들고 있어요</h1>
            <p className="text-sm text-muted-foreground">
              메모를 분석하고 민감정보를 자동으로 숨기고 있습니다.
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
    <main className="flex flex-col items-center min-h-screen px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md mx-auto space-y-6"
      >
        {/* Header */}
        <div className="space-y-2 pt-4">
          <h1 className="text-2xl font-bold">
            카톡 매물 설명을 붙여넣으세요
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            길게 정리하지 않아도 됩니다.
            <br />
            평소 카톡으로 보내던 문장 그대로 넣어주세요.
          </p>
        </div>

        {/* Memo Input */}
        <div className="space-y-2">
          <Textarea
            id="broker-memo-input"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={
              "예:\n성수동 80억대 근생, 일부 임대 중,\n1층 F&B 가능, 사옥 수요도 볼 수 있음.\n주소는 아직 비공개."
            }
            className="min-h-[180px] text-base"
          />
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              {memo.length > 0 ? `${memo.length}자` : "최소 5자 이상"}
            </p>
            <button
              type="button"
              onClick={handleUseSample}
              className="text-xs text-primary hover:underline"
              id="btn-use-sample"
            >
              예시 메모 사용
            </button>
          </div>
        </div>

        {/* Disclosure Notice */}
        <div className="rounded-xl bg-secondary/50 border border-border px-4 py-3 space-y-2">
          <p className="text-xs font-medium">자동으로 숨기는 정보</p>
          <div className="grid grid-cols-1 gap-1">
            {[
              "✅ 정확한 주소",
              "✅ 임차인명",
              "✅ 호실별 임대료",
              "✅ 매도자 사정",
              "✅ 협상 관련 내부 메모",
            ].map((item) => (
              <p key={item} className="text-xs text-muted-foreground">
                {item}
              </p>
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
          disabled={memo.trim().length < 5}
          id="cta-generate-deal-card"
        >
          1분 딜카드 만들기
        </Button>

        {/* Microcopy */}
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          정확한 주소, 임차인명, 호실별 임대료, 매도자 사정은
          <br />
          자동으로 숨겨집니다.
        </p>
      </form>
    </main>
  );
}
