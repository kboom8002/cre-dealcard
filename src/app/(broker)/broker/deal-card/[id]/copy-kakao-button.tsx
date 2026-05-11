"use client";

import { useState } from "react";

interface CopyKakaoButtonProps {
  text: string;
  variant?: "primary" | "secondary";
}

export function CopyKakaoButton({
  text,
  variant = "secondary",
}: CopyKakaoButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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

  if (variant === "primary") {
    return (
      <button
        onClick={handleCopy}
        className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        id="cta-copy-kakao-primary"
      >
        {copied ? "✅ 복사됨!" : "💬 문구 복사"}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center justify-center w-full rounded-lg bg-primary/10 text-primary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-primary/20 active:scale-[0.98]"
      id="cta-copy-kakao"
    >
      {copied ? "✅ 복사됨!" : "📋 카톡 문구 복사"}
    </button>
  );
}
