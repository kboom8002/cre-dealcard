"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  formatBuildStampBadge,
  getBuildStampInfo,
} from "@/lib/qa/build-stamp";

export type QaPinSeverity = "critical" | "major" | "minor";
export type QaPinAuthorRole = "tester" | "broker";
export type QaPinMode = "issue" | "redpen";

export interface QaFeedbackPinWidgetProps {
  workspace: string;
  /** 공개 산출물(/dc, /im-lite, /magazine)에서는 URL에 ?qa=1 이 명시된 최상위 창에서만 활성화 */
  requireExplicitQueryParam?: boolean;
}

const QA_PIN_ACTIVE_STORAGE_KEY = "credeal-qa-pin-active";
const QA_PIN_ROLE_STORAGE_KEY = "credeal-qa-pin-role";
const QA_SIGNOFF_SESSION_STORAGE_KEY = "credeal-qa-signoff-session-v1";
const MAX_SCREENSHOT_DATA_URL_CHARS = 140_000;

function describeElement(el: HTMLElement): {
  selector: string;
  label: string;
  sampleText: string;
} {
  const testId = el.getAttribute("data-testid");
  const idAttr = el.id;
  const selector = testId
    ? `[data-testid="${testId}"]`
    : idAttr
    ? `#${idAttr}`
    : `${el.tagName.toLowerCase()}`;

  const valueText =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el.value
      : "";
  const rawText = (
    el.getAttribute("aria-label") ||
    valueText ||
    el.innerText ||
    el.getAttribute("placeholder") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim();

  const label = rawText
    ? rawText.slice(0, 36)
    : testId || idAttr || el.tagName.toLowerCase();
  const sampleText = (valueText || el.innerText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);

  return { selector, label, sampleText };
}

async function captureCompactScreenshot(): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/jsdom/i.test(ua)) return null;

  try {
    const capturePromise = (async () => {
      const mod = await import("html2canvas");
      const html2canvas = mod.default;
      const vw = Math.max(320, window.innerWidth || 1280);
      const vh = Math.max(320, window.innerHeight || 720);
      const rawCanvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        foreignObjectRendering: true,
        removeContainer: true,
        scale: 0.75,
        x: window.scrollX || 0,
        y: window.scrollY || 0,
        width: vw,
        height: vh,
        windowWidth: vw,
        windowHeight: vh,
        ignoreElements: (el) =>
          el?.getAttribute?.("data-qa-pin-widget") === "true",
      });
      if (!rawCanvas || rawCanvas.width <= 0 || rawCanvas.height <= 0) {
        return null;
      }
      const targetWidth = Math.min(640, rawCanvas.width);
      const ratio = targetWidth / rawCanvas.width;
      const targetHeight = Math.max(1, Math.round(rawCanvas.height * ratio));
      const outCanvas = document.createElement("canvas");
      outCanvas.width = targetWidth;
      outCanvas.height = targetHeight;
      const ctx = outCanvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(rawCanvas, 0, 0, targetWidth, targetHeight);
      const dataUrl = outCanvas.toDataURL("image/jpeg", 0.55);
      if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_CHARS) return null;
      return dataUrl;
    })().catch(() => null);

    const timeoutPromise = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), 800)
    );
    return await Promise.race([capturePromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export function QaFeedbackPinWidget({
  workspace,
  requireExplicitQueryParam = false,
}: QaFeedbackPinWidgetProps) {
  const pathname = usePathname() || "/broker/w";
  const searchParams = useSearchParams();
  const buildInfo = useMemo(() => getBuildStampInfo(), []);
  const buildBadgeText = useMemo(
    () => formatBuildStampBadge(buildInfo),
    [buildInfo]
  );

  const [enabled, setEnabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [targetSelector, setTargetSelector] = useState("viewport");
  const [targetLabel, setTargetLabel] = useState("현재 화면 전체");
  const [severity, setSeverity] = useState<QaPinSeverity>("major");
  const [authorRole, setAuthorRole] = useState<QaPinAuthorRole>("tester");
  const [pinMode, setPinMode] = useState<QaPinMode>("issue");
  const [originalText, setOriginalText] = useState("");
  const [suggestedText, setSuggestedText] = useState("");
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    const qaParam = searchParams?.get("qa");
    try {
      const savedRole = window.localStorage.getItem(QA_PIN_ROLE_STORAGE_KEY);
      if (savedRole === "broker" || savedRole === "tester") {
        setAuthorRole(savedRole);
      }
    } catch {
      // ignore storage errors
    }

    if (requireExplicitQueryParam) {
      const isTopFrame =
        typeof window === "undefined" || window.self === window.top;
      setEnabled(qaParam === "1" && isTopFrame);
      return;
    }

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
  }, [requireExplicitQueryParam, searchParams]);

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
      if (info.sampleText) {
        setOriginalText(info.sampleText);
      }
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

  const handleRoleChange = useCallback((nextRole: QaPinAuthorRole) => {
    setAuthorRole(nextRole);
    try {
      window.localStorage.setItem(QA_PIN_ROLE_STORAGE_KEY, nextRole);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleTurnOff = useCallback(() => {
    if (!requireExplicitQueryParam) {
      try {
        window.localStorage.removeItem(QA_PIN_ACTIVE_STORAGE_KEY);
      } catch {
        // ignore storage errors
      }
    }
    setIsPicking(false);
    setPanelOpen(false);
    setEnabled(false);
  }, [requireExplicitQueryParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNote = note.trim();
    const trimmedOriginal = originalText.trim();
    const trimmedSuggested = suggestedText.trim();

    if (pinMode === "redpen") {
      if (!trimmedSuggested && !trimmedNote) {
        setFeedback({
          kind: "err",
          text: "고친 문구 또는 수정 요청 내용을 먼저 적어 주세요.",
        });
        return;
      }
    } else if (!trimmedNote) {
      setFeedback({ kind: "err", text: "수정 요청이나 메모를 먼저 적어 주세요." });
      return;
    }

    const resolvedNote =
      trimmedNote ||
      `[빨간펜] "${trimmedOriginal || targetLabel}" → "${trimmedSuggested}"`;

    setIsSubmitting(true);
    setFeedback(null);

    let sessionId = "qa-pin-global";
    try {
      const saved = window.localStorage.getItem(QA_SIGNOFF_SESSION_STORAGE_KEY);
      if (saved && saved.trim()) sessionId = saved.trim();
    } catch {
      // ignore storage errors
    }

    const screenshotDataUrl = attachScreenshot
      ? await captureCompactScreenshot()
      : null;

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
          note: resolvedNote,
          severity,
          viewport: {
            width: typeof window !== "undefined" ? window.innerWidth : 0,
            height: typeof window !== "undefined" ? window.innerHeight : 0,
          },
          fontScale:
            typeof document !== "undefined"
              ? document.documentElement.dataset.fontScale || "normal"
              : "normal",
          buildSha: buildInfo.shortSha,
          builtAt: buildInfo.builtAt,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : "",
          authorRole,
          pinMode,
          originalText: pinMode === "redpen" ? trimmedOriginal : undefined,
          suggestedText: pinMode === "redpen" ? trimmedSuggested : undefined,
          screenshotDataUrl: screenshotDataUrl || undefined,
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
      setOriginalText("");
      setSuggestedText("");
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
          className="w-[min(360px,calc(100vw-2rem))] max-h-[80vh] overflow-y-auto rounded-2xl border-2 border-[#007AFF] bg-white p-4 shadow-2xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
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

          <div
            role="group"
            aria-label="작성자 역할 선택"
            className="grid grid-cols-2 gap-1.5"
          >
            {(
              [
                { id: "tester", label: "🧪 테스터" },
                { id: "broker", label: "👔 중개인" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`qa-pin-role-${opt.id}`}
                onClick={() => handleRoleChange(opt.id)}
                className={`min-h-[44px] px-2 rounded-xl text-[15px] font-bold border transition cursor-pointer whitespace-nowrap ${
                  authorRole === opt.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="메모 유형 선택"
            className="grid grid-cols-2 gap-1.5"
          >
            {(
              [
                { id: "issue", label: "⚠️ 오류·불편" },
                { id: "redpen", label: "✏️ 빨간펜 교정" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-testid={`qa-pin-mode-${opt.id}`}
                onClick={() => setPinMode(opt.id)}
                className={`min-h-[44px] px-2 rounded-xl text-[15px] font-bold border transition cursor-pointer whitespace-nowrap ${
                  pinMode === opt.id
                    ? "bg-rose-600 text-white border-rose-700"
                    : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-slate-800 truncate">
                대상: {targetLabel}
              </p>
              <p className="text-[15px] text-slate-500 truncate">
                {targetSelector}
              </p>
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

          {pinMode === "redpen" && (
            <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5">
              <div>
                <label
                  htmlFor="qa-pin-original-text"
                  className="block text-[15px] font-bold text-rose-950 mb-1"
                >
                  원래 문구
                </label>
                <textarea
                  id="qa-pin-original-text"
                  data-testid="qa-pin-original-text"
                  rows={2}
                  value={originalText}
                  onChange={(e) => setOriginalText(e.target.value)}
                  placeholder="화면을 찍으면 자동 채워지거나 직접 붙여 넣으세요"
                  className="w-full min-h-[44px] rounded-xl border border-rose-200 bg-white p-2 text-[15px] text-slate-900 placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="qa-pin-suggested-text"
                  className="block text-[15px] font-bold text-rose-950 mb-1"
                >
                  이렇게 고쳐 주세요 (대체 문구)
                </label>
                <textarea
                  id="qa-pin-suggested-text"
                  data-testid="qa-pin-suggested-text"
                  rows={2}
                  value={suggestedText}
                  onChange={(e) => setSuggestedText(e.target.value)}
                  placeholder="예: 임대료가 꾸준히 오르는 상권입니다"
                  className="w-full min-h-[44px] rounded-xl border border-rose-300 bg-white p-2 text-base text-slate-900 placeholder:text-slate-500 focus:border-rose-600 focus:outline-none"
                />
              </div>
            </div>
          )}

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
              {pinMode === "redpen" ? "추가 설명 (선택)" : "수정 요청 내용"}
            </label>
            <textarea
              id="qa-pin-note-input"
              data-testid="qa-pin-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                pinMode === "redpen"
                  ? "왜 바꾸면 좋은지 짧게 남겨 주세요"
                  : "예: 글씨가 작거나 버튼이 가려집니다"
              }
              className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white p-2.5 text-base text-slate-900 placeholder:text-slate-500 focus:border-[#007AFF] focus:outline-none"
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={attachScreenshot}
            data-testid="qa-pin-screenshot-toggle"
            onClick={() => setAttachScreenshot((prev) => !prev)}
            className={`w-full min-h-[44px] px-3 rounded-xl border text-[15px] font-bold flex items-center justify-between gap-2 cursor-pointer transition ${
              attachScreenshot
                ? "bg-blue-50 border-blue-300 text-blue-950"
                : "bg-slate-50 border-slate-300 text-slate-700"
            }`}
          >
            <span>📷 현재 화면 스크린샷 자동 첨부</span>
            <span className="font-extrabold">
              {attachScreenshot ? "켜짐" : "꺼짐"}
            </span>
          </button>

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
            {isSubmitting ? "캡처·저장 중…" : "검수 허브로 보내기"}
          </button>
        </form>
      )}

      <div className="flex flex-col items-start gap-1.5">
        <span
          data-testid="qa-build-stamp-badge"
          className="px-3 py-1 rounded-full bg-slate-900/90 text-white text-[15px] font-bold shadow-md border border-slate-700"
        >
          {buildBadgeText}
        </span>

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
          {isPicking
            ? "🎯 화면에서 불편한 곳을 클릭하세요 (취소)"
            : "📌 화면 검수 핀"}
        </button>
      </div>
    </div>
  );
}

export default QaFeedbackPinWidget;
