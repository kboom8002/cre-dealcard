/**
 * components/space-ai/space-ai-handoff-button.tsx
 *
 * Client component: sends MVP broker memo to Space AI Page (cre-aipage)
 * to start leasing marketing flow. Calls POST /api/space-ai-handoffs.
 */
"use client";

import { useState } from "react";

interface SpaceAIHandoffButtonProps {
  buildingId: string;
  memoText?: string;
  className?: string;
}

export function SpaceAIHandoffButton({
  buildingId,
  memoText = "",
  className = "",
}: SpaceAIHandoffButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{
    spaceId: string;
    spaceAiPageUrl: string;
    message: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleHandoff() {
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/space-ai-handoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buildingSsotLiteId: buildingId,
          memoText: memoText || "공간 임대 마케팅을 위한 자료 연동 요청",
          targetTenantTypes: [],
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        const msg = json.error?.message || "Space AI Page 연동에 실패했습니다.";
        setErrorMsg(msg);
        setStatus("error");
        return;
      }

      setResult(json.data);
      setStatus("success");
    } catch {
      setErrorMsg("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
      setStatus("error");
    }
  }

  if (status === "success" && result) {
    return (
      <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 space-y-2">
        <p className="text-sm font-semibold text-purple-800">✅ AI 임대 페이지 준비 완료</p>
        <p className="text-xs text-purple-700">이제 사진만 올리시면 임대 화면이 완성돼요. 카카오 공유도 자동으로 만들어드려요.</p>
        <a
          href={result.spaceAiPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-full rounded-xl bg-purple-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-purple-700 transition-colors"
          id="cta-space-ai-page-open"
        >
          📸 사진 올리고 임대 페이지 완성하기 →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleHandoff}
        disabled={status === "loading"}
        className={`inline-flex items-center justify-center w-full rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        id="cta-space-ai-handoff"
      >
        {status === "loading" ? (
          "AI 임대 자료 준비 중..."
        ) : (
          <>
            🏢 AI 임대 홈페이지 만들기
          </>
        )}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-600 text-center">{errorMsg}</p>
      )}
    </div>
  );
}
