"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

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
  created_at: string;
}

interface BuyerMemoSectionProps {
  buyerIntentId: string;
  buildings: Building[];
  existingMemo: ExistingMemo | null;
}

export function BuyerMemoSection({
  buyerIntentId,
  buildings,
  existingMemo,
}: BuyerMemoSectionProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memoResult, setMemoResult] = useState<{
    fitReasons: string[];
    cautionReasons: string[];
    missingData: string[];
    recommendedNextAction: string;
    kakaoMessage: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Show existing memo if available
  const showExisting =
    existingMemo && !memoResult
      ? (existingMemo.body as {
          fitReasons?: string[];
          cautionReasons?: string[];
          missingData?: string[];
          recommendedNextAction?: string;
          kakaoMessage?: string;
        })
      : null;

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

      setMemoResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setIsLoading(false);
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

  const displayMemo = memoResult || showExisting;

  return (
    <div className="space-y-4">
      {/* Building selector + generate */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span>📋</span> 딜카드와 연결하여 답장 문구 만들기
        </h2>

        {buildings.length > 0 ? (
          <>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">건물 선택</p>
              <div className="space-y-2">
                {buildings.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBuildingId(b.id)}
                    className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition-all ${
                      selectedBuildingId === b.id
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="font-medium">
                      {b.area_signal || "미확인"}{" "}
                    </span>
                    <span className="text-muted-foreground">
                      {b.asset_type || ""} {b.price_band || ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!selectedBuildingId || isLoading}
              className="w-full"
              id="cta-generate-buyer-memo"
            >
              {isLoading ? "생성 중..." : "매수자 답장 문구 만들기"}
            </Button>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">
              아직 생성된 딜카드가 없습니다.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              먼저 딜카드를 만든 후 연결해주세요.
            </p>
          </div>
        )}
      </div>

      {/* Display memo result */}
      {displayMemo && (
        <div className="space-y-4">
          {/* Fit Reasons */}
          {displayMemo.fitReasons && displayMemo.fitReasons.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-sm font-semibold text-green-700 flex items-center gap-1">
                <span>✅</span> 맞는 점
              </p>
              <ul className="space-y-1">
                {displayMemo.fitReasons.map((r, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{String(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Caution Reasons */}
          {displayMemo.cautionReasons && displayMemo.cautionReasons.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-sm font-semibold text-amber-700 flex items-center gap-1">
                <span>⚠️</span> 주의할 점
              </p>
              <ul className="space-y-1">
                {displayMemo.cautionReasons.map((r, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{String(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Missing Data */}
          {displayMemo.missingData && displayMemo.missingData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1">
                <span>📄</span> 확인 필요한 자료
              </p>
              <ul className="space-y-1">
                {displayMemo.missingData.map((d, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">-</span>
                    <span>{String(d)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Action */}
          {displayMemo.recommendedNextAction && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-sm">
                <span className="font-semibold">다음 액션:</span>{" "}
                {displayMemo.recommendedNextAction}
              </p>
            </div>
          )}

          {/* Kakao Message */}
          {displayMemo.kakaoMessage && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span>💬</span> 카톡 문구
              </h3>
              <div className="rounded-lg bg-secondary/50 px-4 py-3 text-sm whitespace-pre-line leading-relaxed">
                {displayMemo.kakaoMessage}
              </div>
              <button
                onClick={() => handleCopy(displayMemo.kakaoMessage!)}
                className="inline-flex items-center justify-center w-full rounded-lg bg-primary/10 text-primary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-primary/20 active:scale-[0.98]"
                id="cta-copy-buyer-kakao"
              >
                {copied ? "✅ 복사됨!" : "📋 카톡 문구 복사"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
