"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  formatBuildStampBadge,
  getBuildStampInfo,
} from "@/lib/qa/build-stamp";
import {
  QA_SIGNOFF_SESSION_STORAGE_KEY,
  buildQaAuthHeaders,
  getQaSignoffHrefForRole,
  getStoredQaAccessKey,
  resolveBrokerCohortSessionIds,
  resolveQaPortalRole,
  syncQaKeyFromSearchParams,
  type QaPortalRole,
} from "@/lib/qa/qa-client-auth";

export type QaPinSeverity = "critical" | "major" | "minor";
export type QaPinAuthorRole = "tester" | "broker";
export type QaPinMode = "issue" | "redpen";

export interface QaFeedbackPinWidgetProps {
  workspace: string;
  /** 공개 산출물(/dc, /im-lite, /magazine)에서는 URL에 ?qa=1 이 명시된 최상위 창에서만 활성화 */
  requireExplicitQueryParam?: boolean;
  /** 검수 테스트 등에서 강제 표시가 필요한 경우 */
  forceVisible?: boolean;
}

export const QA_MODE_SESSION_STORAGE_KEY = "credeal_qa_mode";
const QA_PIN_ACTIVE_STORAGE_KEY = "credeal-qa-pin-active";
const QA_PIN_ROLE_STORAGE_KEY = "credeal-qa-pin-role";
const MAX_SCREENSHOT_DATA_URL_CHARS = 140_000;

/**
 * Production builds (Vercel prod/preview, `next start`) require a server-verified QA
 * key before the overlay renders on non-proxy-gated routes. Dev/test keep the legacy
 * `?qa=1` convenience toggle.
 */
export function isProductionQaBuild(): boolean {
  return process.env.NODE_ENV === "production";
}

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

function replaceModernColorFunctions(input: string): string {
  if (!input || !/(?:oklch|oklab|lab|lch|color-mix)\s*\(/i.test(input)) {
    return input;
  }
  const fnRe = /\b(?:oklch|oklab|lab|lch|color-mix)\s*\(/gi;
  let out = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = fnRe.exec(input)) !== null) {
    out += input.slice(cursor, match.index);
    let idx = fnRe.lastIndex;
    let depth = 1;
    while (idx < input.length && depth > 0) {
      const ch = input[idx];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      idx += 1;
    }
    out += "#334155";
    cursor = idx;
    fnRe.lastIndex = idx;
  }
  out += input.slice(cursor);
  return out;
}

function renderDiagnosticCaptureCanvas(opts: {
  pathname: string;
  targetLabel: string;
  targetSelector: string;
  targetRect?: DOMRect | null;
  buildSha: string;
}): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, 640, 48);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(`CRE DealCard QA Capture · #${opts.buildSha}`, 16, 30);

    ctx.fillStyle = "#1E293B";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`경로: ${opts.pathname}`.slice(0, 68), 20, 82);
    ctx.font = "14px sans-serif";
    ctx.fillText(`대상: ${opts.targetLabel}`.slice(0, 68), 20, 108);
    ctx.fillStyle = "#475569";
    ctx.fillText(`선택자: ${opts.targetSelector}`.slice(0, 72), 20, 134);

    if (opts.targetRect && opts.targetRect.width > 0 && opts.targetRect.height > 0) {
      const vw = Math.max(320, window.innerWidth || 1280);
      const vh = Math.max(320, window.innerHeight || 720);
      const boxX = 20;
      const boxY = 156;
      const boxW = 600;
      const boxH = 180;
      ctx.strokeStyle = "#CBD5E1";
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      const rx = boxX + Math.max(0, Math.min(boxW - 8, (opts.targetRect.left / vw) * boxW));
      const ry = boxY + Math.max(0, Math.min(boxH - 8, (opts.targetRect.top / vh) * boxH));
      const rw = Math.max(12, Math.min(boxW - (rx - boxX), (opts.targetRect.width / vw) * boxW));
      const rh = Math.max(12, Math.min(boxH - (ry - boxY), (opts.targetRect.height / vh) * boxH));
      ctx.strokeStyle = "#EF4444";
      ctx.lineWidth = 3;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", 0.65);
    return dataUrl.length <= MAX_SCREENSHOT_DATA_URL_CHARS ? dataUrl : null;
  } catch {
    return null;
  }
}

async function captureCompactScreenshot(options?: {
  targetSelector?: string;
  targetLabel?: string;
  pathname?: string;
  buildSha?: string;
}): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/jsdom/i.test(ua)) return null;

  const targetSelector = options?.targetSelector || "viewport";
  const targetLabel = options?.targetLabel || "현재 화면 전체";
  const pathname = options?.pathname || window.location.pathname || "/";
  const buildSha = options?.buildSha || "local";

  let targetRect: DOMRect | null = null;
  if (targetSelector !== "viewport") {
    try {
      const el = document.querySelector(targetSelector);
      if (el) targetRect = el.getBoundingClientRect();
    } catch {
      targetRect = null;
    }
  }

  try {
    const capturePromise = (async () => {
      const mod = await import("html2canvas");
      const html2canvas = mod.default;
      const vw = Math.max(320, window.innerWidth || 1280);
      const vh = Math.max(320, window.innerHeight || 720);

      let sanitizedSheetCss = "";
      try {
        const chunks: string[] = [];
        for (const sheet of Array.from(document.styleSheets || [])) {
          try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            for (const rule of Array.from(rules)) {
              chunks.push(rule.cssText);
            }
          } catch {
            // ignore cross-origin stylesheet restrictions
          }
        }
        if (chunks.length > 0) {
          sanitizedSheetCss = replaceModernColorFunctions(chunks.join("\n"));
        }
      } catch {
        sanitizedSheetCss = "";
      }

      const rawCanvas = await html2canvas(document.body, {
        logging: false,
        useCORS: true,
        foreignObjectRendering: false,
        backgroundColor: "#F8FAFC",
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
        onclone: (clonedDoc) => {
          try {
            if (sanitizedSheetCss) {
              clonedDoc
                .querySelectorAll('link[rel="stylesheet"]')
                .forEach((lnk) => lnk.remove());
              const injected = clonedDoc.createElement("style");
              injected.setAttribute("data-qa-sanitized", "true");
              injected.textContent = sanitizedSheetCss;
              clonedDoc.head?.appendChild(injected);
            }
            clonedDoc.querySelectorAll("style").forEach((styleEl) => {
              if (styleEl.getAttribute("data-qa-sanitized") === "true") return;
              if (styleEl.textContent) {
                styleEl.textContent = replaceModernColorFunctions(styleEl.textContent);
              }
            });
            clonedDoc.querySelectorAll("[style]").forEach((el) => {
              const raw = el.getAttribute("style");
              if (raw && /(?:oklch|oklab|lab|lch|color-mix)\s*\(/i.test(raw)) {
                el.setAttribute("style", replaceModernColorFunctions(raw));
              }
            });
            if (targetSelector !== "viewport") {
              try {
                const picked = clonedDoc.querySelector(targetSelector) as HTMLElement | null;
                if (picked) {
                  picked.style.outline = "3px solid #EF4444";
                  picked.style.outlineOffset = "2px";
                }
              } catch {
                // ignore invalid selector in clone
              }
            }
          } catch {
            // non-blocking clone sanitization
          }
        },
      });
      if (!rawCanvas || rawCanvas.width <= 0 || rawCanvas.height <= 0) {
        return null;
      }
      const scaleX = rawCanvas.width / vw;
      const scaleY = rawCanvas.height / vh;
      let sx = 0;
      let sy = 0;
      let sw = rawCanvas.width;
      let sh = rawCanvas.height;

      if (
        targetSelector !== "viewport" &&
        targetRect &&
        targetRect.width > 0 &&
        targetRect.height > 0
      ) {
        const padPx = 200;
        const cropLeft = Math.max(0, targetRect.left - padPx);
        const cropTop = Math.max(0, targetRect.top - padPx);
        const cropRight = Math.min(vw, targetRect.right + padPx);
        const cropBottom = Math.min(vh, targetRect.bottom + padPx);
        const candX = Math.max(0, Math.floor(cropLeft * scaleX));
        const candY = Math.max(0, Math.floor(cropTop * scaleY));
        const candW = Math.min(
          rawCanvas.width - candX,
          Math.ceil((cropRight - cropLeft) * scaleX)
        );
        const candH = Math.min(
          rawCanvas.height - candY,
          Math.ceil((cropBottom - cropTop) * scaleY)
        );
        if (candW >= 40 && candH >= 40) {
          sx = candX;
          sy = candY;
          sw = candW;
          sh = candH;
        }
      }

      const targetWidth = Math.min(640, sw);
      const ratio = targetWidth / sw;
      const targetHeight = Math.max(1, Math.round(sh * ratio));
      const outCanvas = document.createElement("canvas");
      outCanvas.width = targetWidth;
      outCanvas.height = targetHeight;
      const ctx = outCanvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(rawCanvas, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
      let dataUrl = outCanvas.toDataURL("image/jpeg", 0.55);
      if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_CHARS) {
        dataUrl = outCanvas.toDataURL("image/jpeg", 0.4);
      }
      if (dataUrl.length > MAX_SCREENSHOT_DATA_URL_CHARS) return null;
      return dataUrl;
    })().catch(() => null);

    const timeoutPromise = new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), 4500)
    );
    const rendered = await Promise.race([capturePromise, timeoutPromise]);
    if (rendered) return rendered;
  } catch {
    // fall through to diagnostic canvas fallback
  }

  return renderDiagnosticCaptureCanvas({
    pathname,
    targetLabel,
    targetSelector,
    targetRect,
    buildSha,
  });
}

export function QaFeedbackPinWidget({
  workspace,
  requireExplicitQueryParam = false,
  forceVisible = false,
}: QaFeedbackPinWidgetProps) {
  const pathname = usePathname() || "/broker/w";
  const searchParams = useSearchParams();
  const buildInfo = useMemo(() => getBuildStampInfo(), []);
  const buildBadgeText = useMemo(
    () => formatBuildStampBadge(buildInfo),
    [buildInfo]
  );

  const [enabled, setEnabled] = useState<boolean>(() => Boolean(forceVisible));
  const [dockedOff, setDockedOff] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [targetSelector, setTargetSelector] = useState("viewport");
  const [targetLabel, setTargetLabel] = useState("현재 화면 전체");
  const resolvedPortalRole = useMemo<QaPortalRole>(() => {
    const explicitRole = searchParams?.get("qaRole");
    return resolveQaPortalRole(pathname, explicitRole);
  }, [pathname, searchParams]);
  const lockedRole: QaPinAuthorRole | null =
    resolvedPortalRole === "tester" || resolvedPortalRole === "broker"
      ? resolvedPortalRole
      : null;

  const [severity, setSeverity] = useState<QaPinSeverity>("major");
  const [authorRole, setAuthorRole] = useState<QaPinAuthorRole>(() => {
    if (lockedRole) return lockedRole;
    if (typeof window !== "undefined") {
      try {
        const savedRole = window.localStorage.getItem(QA_PIN_ROLE_STORAGE_KEY);
        if (savedRole === "broker" || savedRole === "tester") {
          return savedRole;
        }
      } catch {
        // ignore storage errors
      }
    }
    return "tester";
  });
  const effectiveAuthorRole: QaPinAuthorRole = lockedRole ?? authorRole;
  const [pinMode, setPinMode] = useState<QaPinMode>("issue");
  const [originalText, setOriginalText] = useState("");
  const [suggestedText, setSuggestedText] = useState("");
  const [attachScreenshot, setAttachScreenshot] = useState(true);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [capturingPreview, setCapturingPreview] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!zoomOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [zoomOpen]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    syncQaKeyFromSearchParams(searchParams, resolvedPortalRole);
    const fromHook = searchParams?.get("qa");
    const fromLocation =
      typeof window !== "undefined" && window.location?.search
        ? new URLSearchParams(window.location.search).get("qa")
        : null;
    const qaParam = (fromHook ?? fromLocation)?.toLowerCase() ?? null;
    const isQaExplicitOn = qaParam === "1" || qaParam === "true";
    const isQaExplicitOff = qaParam === "0" || qaParam === "false";

    const readDockedState = () => {
      try {
        return window.sessionStorage.getItem("credeal_qa_pin_docked") === "1";
      } catch {
        return false;
      }
    };

    if (forceVisible) {
      setEnabled(true);
      setDockedOff(readDockedState());
      return;
    }

    const isPublicRoute =
      requireExplicitQueryParam ||
      (!pathname.startsWith("/broker") &&
        !pathname.startsWith("/qa-") &&
        !pathname.startsWith("/testguide") &&
        !pathname.startsWith("/newsletter-inbox-test") &&
        !pathname.startsWith("/dealcard-im-test"));

    if (requireExplicitQueryParam || isPublicRoute) {
      const isTopFrame =
        typeof window === "undefined" || window.self === window.top;
      if (!isQaExplicitOn || !isTopFrame) {
        setEnabled(false);
        setDockedOff(false);
        return;
      }

      // 공개 라우트(/dc, /im-lite, /magazine 등)에서는 검증된 QA 키가 있을 때만 위젯 활성화
      const urlKey = (
        searchParams?.get("qaKey") ||
        searchParams?.get("key") ||
        (typeof window !== "undefined" && window.location?.search
          ? new URLSearchParams(window.location.search).get("qaKey") ||
            new URLSearchParams(window.location.search).get("key")
          : null) ||
        ""
      ).trim();
      const candidateKey = urlKey || getStoredQaAccessKey(resolvedPortalRole);
      if (!candidateKey) {
        setEnabled(false);
        setDockedOff(false);
        return;
      }

      let cancelled = false;
      fetch("/api/public/qa-workbench?mode=pins&verifyQaKey=1", {
        method: "GET",
        headers: { "x-qa-access-key": candidateKey },
      })
        .then((res) => {
          if (cancelled) return;
          if (res.ok) {
            setEnabled(true);
            setDockedOff(readDockedState());
          } else {
            setEnabled(false);
            setDockedOff(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setEnabled(false);
            setDockedOff(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    // P2 (WP-7.3A): in production builds `?qa=1` alone must never expose the QA
    // overlay on broker workspace routes. The proxy already enforces a key on the
    // /qa-*, /testguide, … routes; every other route needs a server-verified key.
    const isServerGatedQaRoute =
      pathname.startsWith("/qa-") ||
      pathname.startsWith("/testguide") ||
      pathname.startsWith("/newsletter-inbox-test") ||
      pathname.startsWith("/dealcard-im-test");
    if (isProductionQaBuild() && !isServerGatedQaRoute) {
      let wantsQa = false;
      try {
        if (isQaExplicitOff) {
          window.sessionStorage.removeItem(QA_MODE_SESSION_STORAGE_KEY);
          window.sessionStorage.removeItem("credeal_qa_pin_docked");
          window.localStorage.removeItem(QA_PIN_ACTIVE_STORAGE_KEY);
          setEnabled(false);
          setDockedOff(false);
          return;
        }
        wantsQa =
          isQaExplicitOn ||
          window.sessionStorage.getItem(QA_MODE_SESSION_STORAGE_KEY) === "1";
      } catch {
        wantsQa = isQaExplicitOn;
      }
      const prodUrlKey = (
        searchParams?.get("qaKey") ||
        searchParams?.get("key") ||
        ""
      ).trim();
      const prodCandidateKey = wantsQa
        ? prodUrlKey || getStoredQaAccessKey(resolvedPortalRole)
        : "";
      if (!prodCandidateKey) {
        setEnabled(false);
        setDockedOff(false);
        return;
      }
      let cancelledProd = false;
      fetch("/api/public/qa-workbench?mode=pins&verifyQaKey=1", {
        method: "GET",
        headers: { "x-qa-access-key": prodCandidateKey },
      })
        .then((res) => {
          if (cancelledProd) return;
          if (res.ok) {
            try {
              window.sessionStorage.setItem(QA_MODE_SESSION_STORAGE_KEY, "1");
            } catch {
              // ignore storage errors
            }
            setEnabled(true);
            setDockedOff(readDockedState());
          } else {
            setEnabled(false);
            setDockedOff(false);
          }
        })
        .catch(() => {
          if (!cancelledProd) {
            setEnabled(false);
            setDockedOff(false);
          }
        });
      return () => {
        cancelledProd = true;
      };
    }

    try {
      if (isQaExplicitOff) {
        window.sessionStorage.removeItem(QA_MODE_SESSION_STORAGE_KEY);
        window.sessionStorage.removeItem("credeal_qa_pin_docked");
        window.localStorage.removeItem(QA_PIN_ACTIVE_STORAGE_KEY);
        setEnabled(false);
        setDockedOff(false);
        return;
      }
      if (isQaExplicitOn) {
        window.sessionStorage.setItem(QA_MODE_SESSION_STORAGE_KEY, "1");
        setEnabled(true);
        setDockedOff(readDockedState());
        return;
      }
      if (window.sessionStorage.getItem(QA_MODE_SESSION_STORAGE_KEY) === "1") {
        setEnabled(true);
        setDockedOff(readDockedState());
        return;
      }
      setEnabled(false);
      setDockedOff(false);
    } catch {
      setEnabled(isQaExplicitOn);
      setDockedOff(false);
    }
  }, [forceVisible, pathname, requireExplicitQueryParam, resolvedPortalRole, searchParams]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
      setMinimized(false);
      setPanelOpen(true);
      setFeedback(null);

      const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
      if (attachScreenshot && !/jsdom/i.test(ua)) {
        setCapturingPreview(true);
        window.setTimeout(() => {
          void captureCompactScreenshot({
            targetSelector: info.selector,
            targetLabel: info.label,
            pathname,
            buildSha: buildInfo.shortSha,
          })
            .then((shot) => {
              setPreviewDataUrl(shot);
            })
            .finally(() => {
              setCapturingPreview(false);
            });
        }, 80);
      }
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
  }, [attachScreenshot, buildInfo.shortSha, isPicking, pathname]);

  const handleRoleChange = useCallback((nextRole: QaPinAuthorRole) => {
    setAuthorRole(nextRole);
    try {
      window.localStorage.setItem(QA_PIN_ROLE_STORAGE_KEY, nextRole);
    } catch {
      // ignore storage errors
    }
  }, []);

  const handleTurnOff = useCallback(() => {
    try {
      window.sessionStorage.setItem("credeal_qa_pin_docked", "1");
    } catch {
      // ignore storage errors
    }
    setIsPicking(false);
    setPanelOpen(false);
    setZoomOpen(false);
    setDockedOff(true);
  }, []);

  const handleReenable = useCallback(() => {
    try {
      window.sessionStorage.removeItem("credeal_qa_pin_docked");
    } catch {
      // ignore storage errors
    }
    setDockedOff(false);
    setMinimized(false);
    setPanelOpen(true);
  }, []);

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

    let sessionId =
      lockedRole === "tester"
        ? "qa-signoff-tester-r2"
        : lockedRole === "broker"
        ? resolveBrokerCohortSessionIds().signoffSessionId
        : "qa-pin-global";
    try {
      const saved = window.localStorage.getItem(QA_SIGNOFF_SESSION_STORAGE_KEY);
      if (saved && saved.trim()) {
        const trimmedSaved = saved.trim();
        if (
          !lockedRole ||
          (lockedRole === "tester" && trimmedSaved.includes("tester")) ||
          (lockedRole === "broker" && trimmedSaved.includes("broker"))
        ) {
          sessionId = trimmedSaved;
        }
      }
    } catch {
      // ignore storage errors
    }

    const screenshotDataUrl = attachScreenshot
      ? previewDataUrl ||
        (await captureCompactScreenshot({
          targetSelector,
          targetLabel,
          pathname,
          buildSha: buildInfo.shortSha,
        }))
      : null;

    try {
      const res = await fetch("/api/public/qa-workbench", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildQaAuthHeaders(lockedRole ?? resolvedPortalRole),
        },
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
          authorRole: effectiveAuthorRole,
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
      setPreviewDataUrl(null);
      setZoomOpen(false);
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

  if (dockedOff) {
    return (
      <div
        data-qa-pin-widget="true"
        data-testid="qa-pin-widget-root"
        className="fixed bottom-24 sm:bottom-5 left-4 z-50 print:hidden"
      >
        <button
          type="button"
          data-testid="qa-pin-reenable-btn"
          onClick={handleReenable}
          style={{
            backgroundColor: "#0F172A",
            color: "#FFFFFF",
            borderColor: "#334155",
          }}
          className="min-h-[44px] px-3.5 rounded-full shadow-lg border-2 text-[14px] font-extrabold cursor-pointer whitespace-nowrap"
        >
          📌 핀 켜기
        </button>
      </div>
    );
  }

  return (
    <div
      data-qa-pin-widget="true"
      data-testid="qa-pin-widget-root"
      className="fixed bottom-24 sm:bottom-5 left-4 z-50 flex flex-col items-start gap-2 print:hidden"
    >
      {panelOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="qa-pin-panel"
          data-theme-lock="light"
          style={{ backgroundColor: "#FFFFFF", color: "#0F172A" }}
          className="w-[min(360px,calc(100vw-2rem))] max-h-[80vh] overflow-y-auto rounded-2xl border-2 border-[#007AFF] bg-white p-4 shadow-2xl space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-extrabold text-slate-900">
              📌 화면 검수 메모
            </span>
            <div className="flex items-center gap-1.5">
              <a
                href={getQaSignoffHrefForRole(lockedRole ?? resolvedPortalRole)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="qa-pin-hub-link"
                className="min-h-[44px] inline-flex items-center px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-[15px] font-bold whitespace-nowrap"
              >
                {lockedRole === "tester"
                  ? "테스터 허브 ↗"
                  : lockedRole === "broker"
                  ? "중개인 보드 ↗"
                  : "검수 허브 ↗"}
              </a>
              <button
                type="button"
                data-testid="qa-pin-panel-minimize-btn"
                onClick={() => {
                  setPanelOpen(false);
                  setMinimized(true);
                }}
                className="min-h-[44px] px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[15px] font-bold cursor-pointer whitespace-nowrap"
              >
                접기
              </button>
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
            {lockedRole ? (
              <div
                data-testid="qa-pin-role-locked"
                className="col-span-2 min-h-[44px] flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-3 text-[15px] font-extrabold text-slate-900"
              >
                {lockedRole === "tester"
                  ? "🧪 일반 테스터 전용 모드 (역할 고정)"
                  : "👔 중개인 감수 전용 모드 (역할 고정)"}
              </div>
            ) : (
              (
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
              ))
            )}
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

          {attachScreenshot && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-bold text-slate-700">
                  {capturingPreview
                    ? "화면 캡처 중…"
                    : previewDataUrl
                    ? "캡처 미리보기 준비 완료"
                    : "제출 시 현재 화면을 자동 캡처해 첨부합니다"}
                </span>
                <button
                  type="button"
                  data-testid="qa-pin-preview-refresh-btn"
                  disabled={capturingPreview}
                  onClick={() => {
                    setCapturingPreview(true);
                    void captureCompactScreenshot({
                      targetSelector,
                      targetLabel,
                      pathname,
                      buildSha: buildInfo.shortSha,
                    })
                      .then((shot) => setPreviewDataUrl(shot))
                      .finally(() => setCapturingPreview(false));
                  }}
                  className="min-h-[44px] px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-sm font-bold text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  🔄 다시 캡처
                </button>
              </div>
              {previewDataUrl && (
                <button
                  type="button"
                  data-testid="qa-pin-preview-zoom-btn"
                  onClick={() => setZoomOpen(true)}
                  aria-label="캡처 미리보기 크게 보기"
                  className="group block w-full rounded-lg border border-slate-300 bg-white overflow-hidden cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-[#007AFF]"
                >
                  <img
                    src={previewDataUrl}
                    alt="검수 핀 캡처 미리보기"
                    data-testid="qa-pin-screenshot-preview"
                    className="w-full max-h-28 object-contain bg-white"
                  />
                  <span className="block w-full py-1 text-center text-sm font-bold text-slate-600 bg-slate-100/90 group-hover:text-slate-900">
                    🔍 눌러서 크게 보기
                  </span>
                </button>
              )}
            </div>
          )}

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
            style={{ backgroundColor: "#0F172A", color: "#FFFFFF" }}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-base font-extrabold cursor-pointer transition"
          >
            {isSubmitting ? "캡처·저장 중…" : "검수 허브로 보내기"}
          </button>
        </form>
      )}

      {zoomOpen && previewDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="검수 핀 캡처 확대 보기"
          data-testid="qa-pin-zoom-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-white p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-slate-900">
                🔍 캡처 미리보기 확대 ({targetLabel})
              </span>
              <button
                type="button"
                data-testid="qa-pin-zoom-close-btn"
                onClick={() => setZoomOpen(false)}
                className="min-h-[44px] px-3 rounded-lg bg-slate-900 text-white text-sm font-extrabold cursor-pointer hover:bg-slate-800"
              >
                ✕ 닫기 (ESC)
              </button>
            </div>
            <img
              src={previewDataUrl}
              alt="검수 핀 캡처 확대 미리보기"
              className="w-full max-h-[75vh] object-contain rounded-xl border border-slate-200 bg-slate-50"
            />
          </div>
        </div>
      )}

      <div
        data-theme-lock="dark"
        className="flex flex-col items-start gap-1.5"
      >
        <div className="flex items-center gap-1.5">
          <span
            data-testid="qa-build-stamp-badge"
            style={{
              backgroundColor: "#0F172A",
              color: "#FFFFFF",
              borderColor: "#334155",
            }}
            className="px-3 py-1 rounded-full bg-slate-900 text-white text-[15px] font-bold shadow-md border border-slate-700 whitespace-nowrap"
          >
            {buildBadgeText}
          </span>

          {minimized && (
            <button
              type="button"
              data-testid="qa-pin-minimize-btn"
              onClick={() => setMinimized(false)}
              style={{
                backgroundColor: "#0F172A",
                color: "#FFFFFF",
                borderColor: "#334155",
              }}
              className="min-h-[44px] px-3 rounded-full shadow-md border text-[14px] font-bold cursor-pointer whitespace-nowrap"
            >
              📌 핀 펼치기
            </button>
          )}
        </div>

        {!minimized && (
          <div className="flex items-center gap-1.5">
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
              style={
                isPicking
                  ? {
                      backgroundColor: "#F59E0B",
                      color: "#0F172A",
                      borderColor: "#B45309",
                    }
                  : {
                      backgroundColor: "#0F172A",
                      color: "#FFFFFF",
                      borderColor: "#334155",
                    }
              }
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

            <button
              type="button"
              data-testid="qa-pin-minimize-btn"
              onClick={() => {
                setIsPicking(false);
                setPanelOpen(false);
                setMinimized(true);
              }}
              aria-label="검수 핀 접기"
              style={{
                backgroundColor: "#1E293B",
                color: "#F8FAFC",
                borderColor: "#475569",
              }}
              className="min-h-[48px] px-3 rounded-full shadow-lg border text-[14px] font-bold cursor-pointer transition whitespace-nowrap"
            >
              접기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QaFeedbackPinWidget;
