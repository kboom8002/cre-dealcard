"use client";

import React, { useState } from "react";
import { editorToast } from "./editor-toaster";
import { Loader2, Link2 } from "lucide-react";
import { validateSlug } from "@/lib/magazine/slug";
import { extractApiErrorMessage, readJsonSafe } from "@/lib/magazine/editor-helpers";

interface SlugSetupGateProps {
  /** slug 저장 성공 시 확정된 slug */
  onConfirmed: (slug: string) => void;
}

/**
 * 매거진 주소(slug)가 없는 브로커를 위한 차단형 설정 화면.
 * "demo" 같은 가짜 slug로 편집이 진행되는 것을 막는다(P0-07).
 */
export function SlugSetupGate({ onConfirmed }: SlugSetupGateProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validateSlug(value.trim().toLowerCase());
    if (!v.ok) {
      setError(v.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/broker/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: v.slug }),
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        const msg = extractApiErrorMessage(json, "주소를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setError(msg);
        return;
      }
      editorToast.success("매거진 주소가 설정되었습니다");
      onConfirmed(v.slug);
    } catch {
      setError("네트워크 오류로 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1120] p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900/70 p-6"
        data-testid="slug-setup-gate"
      >
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-indigo-400" />
          <h1 className="text-sm font-bold text-slate-100">매거진 주소(slug)를 먼저 설정하세요</h1>
        </div>
        <p className="text-xs text-slate-400">
          구독자에게 공유되는 내 매거진 주소입니다. 영문 소문자·숫자·하이픈 3~30자로 입력해 주세요.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="magazine-slug" className="block text-xs text-slate-300">
            매거진 주소
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-subtle">credeal.net/magazine/</span>
            <input
              id="magazine-slug"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="my-magazine"
              autoComplete="off"
              className="min-h-[44px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-base text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          주소 저장하고 편집 시작
        </button>
      </form>
    </div>
  );
}
