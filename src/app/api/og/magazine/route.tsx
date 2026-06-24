import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const ACCENT: Record<string, string> = {
  emerald: "#10b981",
  indigo: "#6366f1",
  rose: "#f43f5e",
  amber: "#f59e0b",
  slate: "#94a3b8",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const brokerId = searchParams.get("brokerId") ?? searchParams.get("id") ?? "demo";
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);

  // 데이터 fetch
  let data: any = null;
  try {
    const BASE = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${BASE}/api/magazine/${brokerId}`, {
      cache: "no-store",
    });
    if (res.ok) data = (await res.json()).data;
  } catch { /* use fallback */ }

  const broker = data?.broker ?? {
    name: "CRE \uc804\ubb38 \uc911\uac1c\uc0ac",
    company: "JS \ubd80\ub3d9\uc0b0",
    specialtyRegions: ["\uc131\uc218\ub3d9", "\uac15\ub0a8 GBD"],
    totalDeals: 47,
    activeDeals: 3,
  };

  const headline =
    data?.headline ?? "\uc624\ub298\uc758 \uaf2c\ub9c8\ube4c\ub529 \uc2dc\uc7a5 \uc778\ud154\ub9ac\uc804\uc2a4";

  const keyStats: { label: string; value: string; accent: string }[] =
    data?.keyStats ?? [
      { label: "\ud22c\uc790\uc790 \uc2ec\ub9ac", value: "62/100", accent: "emerald" },
      { label: "\ud65c\uc131 \ub9e4\ubb3c", value: "3\uac74", accent: "indigo" },
      { label: "\uc2dc\uc7a5 \uc0c1\ud0dc", value: "\ud0d0\uc695 \uc6b0\uc138", accent: "slate" },
    ];

  const [y, m, d] = date.split("-");
  const dateLabel = `${y}.${m}.${d}`;
  const weekdays = ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"];
  const weekday = weekdays[new Date(date).getDay()];

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0f111a 0%, #060810 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
          padding: "48px 60px",
        }}
      >
        {/* 격자 패턴 배경 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.05,
            backgroundImage: "linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* 배경 글로우 */}
        <div
          style={{
            position: "absolute",
            top: "-150px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "800px",
            height: "500px",
            background: "radial-gradient(ellipse, rgba(99,102,241,0.2), transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* ── Top Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", zIndex: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "2px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} />
              <span style={{ color: "#a5b4fc", fontSize: "16px", fontWeight: 800, letterSpacing: "3px" }}>
                CRE DAILY MAGAZINE
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span style={{ color: "white", fontSize: "24px", fontWeight: 700, letterSpacing: "1px" }}>{dateLabel}</span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "16px", fontWeight: 500 }}>{y}년 {m}월 {d}일 {weekday}요일</span>
          </div>
        </div>

        {/* ── Center Headline ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", zIndex: 10, padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", padding: "8px 16px", borderRadius: "24px", marginBottom: "24px" }}>
            <span style={{ color: "#a5b4fc", fontSize: "14px", fontWeight: 700, letterSpacing: "1px" }}>✨ AI 맞춤형 인사이트</span>
          </div>
          <div style={{ color: "white", fontSize: "48px", fontWeight: 900, lineHeight: 1.3, letterSpacing: "-1px", wordBreak: "keep-all" }}>
            {headline}
          </div>
        </div>

        {/* ── Bottom Section ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", zIndex: 10, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "32px" }}>
          {/* 브로커 브랜딩 */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.1)" }}>
              <span style={{ color: "white", fontSize: "28px", fontWeight: 800 }}>{(broker.name ?? "B").charAt(0)}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ color: "white", fontSize: "24px", fontWeight: 800 }}>{broker.name}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "16px", fontWeight: 500 }}>{broker.company}</span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                {(broker.specialtyRegions ?? []).slice(0, 3).map((r: string, i: number) => (
                  <div key={i} style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 600, background: "rgba(99,102,241,0.1)", padding: "4px 10px", borderRadius: "12px", border: "1px solid rgba(99,102,241,0.2)" }}>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 핵심 지표 */}
          <div style={{ display: "flex", gap: "16px" }}>
            {keyStats.slice(0, 3).map((stat: any, i: number) => {
              const color = ACCENT[stat.accent] ?? "#6366f1";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${color}`, borderRadius: "12px", padding: "16px 20px", minWidth: "140px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", fontWeight: 600, marginBottom: "6px" }}>{stat.label}</span>
                  <span style={{ color, fontSize: "22px", fontWeight: 800 }}>{stat.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
