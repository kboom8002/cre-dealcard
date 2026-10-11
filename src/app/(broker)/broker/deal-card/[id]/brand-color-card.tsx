"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Basic IM 브랜드 컬러 설정 — pptx_custom_presets 회사 기본값 재사용 (/api/broker/brand-color).
 * 저장한 색은 이후 다운로드하는 Basic PPTX 의 기본 스킨(📋 Basic IM)에 적용된다.
 * 다른 내장 스킨을 직접 고르면 그 스킨이 우선한다.
 */
export function BrandColorCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [color, setColor] = useState("#1F4E8C");
  const [effective, setEffective] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/broker/brand-color");
        if (!res.ok) return;
        const d = await res.json();
        if (alive && d.accent) {
          setSaved(d.accent);
          setColor(`#${d.accent}`);
          setEffective(d.adjusted ? d.effective_accent : null);
        }
      } catch { /* 설정 조회 실패는 무시 (기본 팔레트) */ }
    })();
    return () => { alive = false; };
  }, []);

  const valid = /^#[0-9a-fA-F]{6}$/.test(color);

  const save = async () => {
    if (!valid) { toast.error("색상은 #RRGGBB 형식이어야 합니다."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/broker/brand-color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: color }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || "저장에 실패했습니다."); return; }
      setSaved(d.accent);
      setEffective(d.adjusted ? d.effective_accent : null);
      toast.success(d.adjusted ? "저장됨 — 가독성을 위해 색이 약간 어둡게 보정됩니다." : "브랜드 컬러가 저장되었습니다.");
    } finally { setBusy(false); }
  };

  const clear = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/broker/brand-color", { method: "DELETE" });
      if (res.ok) { setSaved(null); setEffective(null); toast.success("브랜드 컬러를 해제했습니다."); }
      else toast.error("해제에 실패했습니다.");
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5" data-testid="brand-color-card">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium">🎨 브랜드 컬러 (Basic IM)</span>
        {saved && <span className="text-[10px] text-emerald-600" data-testid="brand-color-saved">적용 중 #{saved}</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? color : "#1F4E8C"}
          onChange={(e) => setColor(e.target.value.toUpperCase())}
          className="h-7 w-9 rounded border border-border bg-background p-0.5"
          aria-label="브랜드 컬러 선택"
          data-testid="brand-color-picker"
        />
        <input
          value={color}
          onChange={(e) => setColor(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
          maxLength={7}
          className="w-20 h-7 rounded-md border border-border bg-background text-[11px] px-2 font-mono"
          aria-label="브랜드 컬러 HEX"
          data-testid="brand-color-hex"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !valid}
          className="h-7 px-2 rounded-md bg-foreground text-background text-[11px] disabled:opacity-40"
          data-testid="brand-color-save"
        >저장</button>
        {saved && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="h-7 px-2 rounded-md border border-border text-[11px] text-muted-foreground"
            data-testid="brand-color-clear"
          >해제</button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        기본 스킨(📋 Basic IM)의 강조색·표지 색을 이 색에서 자동 파생합니다. 너무 밝은 색은 가독성을 위해 어둡게 보정됩니다
        {effective ? ` (현재 적용색 #${effective})` : ""}.
      </p>
    </div>
  );
}
