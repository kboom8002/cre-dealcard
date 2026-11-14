"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export type QaPinSeverity = "critical" | "major" | "minor";

export interface QaFeedbackPinWidgetProps {
  workspace: string;
}

const QA_PIN_ACTIVE_STORAGE_KEY = "credeal-qa-pin-active";
const QA_SIGNOFF_SESSION_STORAGE_KEY = "credeal-qa-signoff-session-v1";

function describeElement(el: HTMLElement): { selector: string; label: string } {
  const testId = el.getAttribute("data-testid");
  const idAttr = el.id;
  const selector = testId
    ? `[data-testid="${testId}"]`
    : idAttr
    ? `#${idAttr}`
    : `${el.tagName.toLowerCase()}`;

  const rawText = (
    el.getAttribute("aria-label") ||
    el.innerText ||
    el.getAttribute("placeholder") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();

  const label = rawText
    ? rawText.slice(0, 36)
    : testId || idAttr || el.tagName.toLowerCase();

  return { selector, label };
}

export function QaFeedbackPinWidget({ workspace }: QaFeedbackPinWidgetProps) {
  const pathname = usePathname() || "/broker/w";
  const searchParams = useSearchParams();

  const [enabled, setEnabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [targetSelector, setTargetSelector] = useState("viewport");
  const [targetLabel, setTargetLabel] = useState("현재 화면 전체");
  const [severity, setSeverity] = useState<QaPinSeverity>("major");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    const qaParam = searchParams?.get("qa");
    try {
      if (qaParam === "1") {
        window.localStorage.setItem(QA_PIN_ACTIVE_STORAGE_KEY, "1");
        setEnabled(true);
        return;
      }
      if (qaParam === "0") {
        window.localStorage.removeItem(QA_PIN_ACTIVE_STORAGE_KEY);
        setEnabled(false);
        return;
      }
      if (window.localStorage.getItem(QA_PIN_ACTIVE_STORAGE_KEY) === "1") {
        setEnabled(true);
      }
    } catch {
      if (qaParam === "1") setEnabled(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isPicking) return;

    const handleCaptureClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-qa-pin-widget="true"]')) return;

      e.preventDefault();
      e.stopPropagation();

      const info = describeElement(target);
      setTargetSelector(info.selector);
      setTargetLabel(info.label);
      setIsPicking(false);
      setPanelOpen(true);
      setFeedback(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsPicking(false);
      }
    };

    document.addEventListener("click", handleCaptureClick, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleCaptureClick, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPicking]);

  const handleTurnOff = useCallback(() => {
    try {
      window.localStorage.removeItem(QA_PIN_ACTIVE_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setIsPicking(false);
    setPanelOpen(false);
    setEnabled(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed) {
      setFeedback({ kind: "err", text: "수정 요청이나 메모를 먼저 적어 주세요." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    let sessionId = "qa-pin-global";
    try {
      const saved = window.localStorage.getItem(QA_SIGNOFF_SESSION_STORAGE_KEY);
      if (saved && saved.trim()) sessionId = saved.trim();
    } catch {
      // ignore storage errors
    }

    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "pin",
          sessionId,
          workspace,
          routePath: pathname,
          targetSelector,
          targetLabel,
          note: trimmed,
          severity,
          viewport: {
            width: typeof window !== "undefined" ? window.innerWidth : 0,
            height: typeof window !== "undefined" ? window.innerHeight : 0,
          },
          fontScale:
            typeof document !== "undefined"
              ? document.documentElement.dataset.fontScale || "normal"
              : "normal",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setFeedback({
          kind: "err",
          text: json?.error || "핀 저장에 실패했습니다. 다시 시도해 주세요.",
        });
        return;
      }

      setNote("");
      setFeedback({
        kind: "ok",
        text: "검수 허브에 화면 메모를 저장했습니다.",
      });
    } catch {
      setFeedback({
        kind: "err",
        text: "네트워크 오류로 핀을 저장하지 못했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!enabled) return null;

  return (
    <div
      data-qa-pin-widget="true"
      data-testid="qa-pin-widget-root"
      className="fixed bottom-20 lg:bottom-5 left-4 z-50 flex flex-col items-start gap-2 print:hidden"
    >
      {panelOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="qa-pin-panel"
          className="w-[min(360px,calc(100vw-2rem))] rounded-2xl border-2 border-[#007AFF] bg-white p-4 shadow-2xl space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-extrabold text-slate-900">
              📌 화면 검수 메모
            </span>
            <div className="flex items-center gap-1.5">
              <a
                href="/qa-signoff"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] inline-flex items-center px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-[15px] font-bold whitespace-nowrap"
              >
                검수 허브 ↗
              </a>
              <button
                type="button"
                data-testid="qa-pin-disable-btn"
                onClick={handleTurnOff}
                className="min-h-[44px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[15px] font-bold cursor-pointer whitespace-nowrap"
              >
                끄기
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-slate-800 truncate">
                대상: {targetLabel}
              </p>
              <p className="text-[15px] text-slate-500 truncate">{targetSelector}</p>
            </div>
            <button
              type="button"
              data-testid="qa-pin-pick-btn"
              onClick={() => {
                setIsPicking(true);
                setPanelOpen(false);
              }}
              className="min-h-[44px] px-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#0040DD] text-[15px] font-extrabold shrink-0 cursor-pointer whitespace-nowrap"
            >
              🎯 요소 찍기
            </button>
          </div>

          <div
            role="group"
            aria-label="중요도 선택"
            className="grid grid-cols-3 gap-1.5"
          >
            {(
              [
                { id: "critical", label: "긴급" },
                { id: "major", label: "중요" },
                { id: "minor", label: "개선" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`qa-pin-severity-${opt.id}`}
                onClick={() => setSeverity(opt.id)}
                className={`min-h-[44px] rounded-xl text-[15px] font-bold border transition cursor-pointer ${
                  severity === opt.id
                    ? "bg-[#007AFF] text-white border-[#005FCC]"
                    : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="qa-pin-note-input"
              className="block text-[15px] font-bold text-slate-800 mb-1"
            >
              수정 요청 내용
            </label>
            <textarea
              id="qa-pin-note-input"
              data-testid="qa-pin-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 글씨가 작거나 버튼이 가려집니다"
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-[#007AFF] focus:outline-none"
            />
          </div>

          {feedback && (
            <p
              role="status"
              aria-live="polite"
              data-testid="qa-pin-feedback"
              className={`rounded-xl px-3 py-2 text-[15px] font-bold ${
                feedback.kind === "ok"
                  ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                  : "bg-rose-50 text-rose-900 border border-rose-200"
              }`}
            >
              {feedback.text}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="qa-pin-submit-btn"
            className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-base font-extrabold cursor-pointer transition"
          >
            {isSubmitting ? "저장 중…" : "검수 허브로 보내기"}
          </button>
        </form>
      )}

      <button
        type="button"
        data-testid="qa-pin-fab"
        onClick={() => {
          if (isPicking) {
            setIsPicking(false);
            setPanelOpen(true);
            return;
          }
          setPanelOpen((prev) => !prev);
        }}
        className={`min-h-[48px] px-4 rounded-full shadow-lg border-2 text-[15px] font-extrabold cursor-pointer transition whitespace-nowrap ${
          isPicking
            ? "bg-amber-500 border-amber-700 text-slate-950 animate-pulse"
            : "bg-slate-900 border-slate-700 text-white hover:bg-slate-800"
        }`}
      >
        {isPicking ? "🎯 화면에서 불편한 곳을 클릭하세요 (취소)" : "📌 화면 검수 핀"}
      </button>
    </div>
  );
}

export default QaFeedbackPinWidget;
