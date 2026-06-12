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
          background:
            "linear-gradient(135deg, #060612 0%, #1a0a2e 50%, #0a1020 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* 배경 글로우 */}
        <div
          style={{
            position: "absolute",
            top: "-120px",
            left: "180px",
            width: "480px",
            height: "480px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.2), transparent)",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-80px",
            right: "150px",
            width: "320px",
            height: "320px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.15), transparent)",
            filter: "blur(60px)",
          }}
        />

        {/* ── 좌측 패널 ── */}
        <div
          style={{
            width: "400px",
            height: "100%",
            padding: "52px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            borderRight: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* 브랜드 */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                }}
              />
              <span
                style={{
                  color: "#6366f1",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "2px",
                }}
              >
                CRE DAILY MAGAZINE
              </span>
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
              {dateLabel} {weekday}
            </div>
          </div>

          {/* 브로커 */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "14px" }}
          >
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid rgba(99,102,241,0.4)",
              }}
            >
              <span
                style={{ color: "white", fontSize: "26px", fontWeight: 800 }}
              >
                {(broker.name ?? "B").charAt(0)}
              </span>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "5px" }}
            >
              <div
                style={{
                  color: "white",
                  fontSize: "24px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                }}
              >
                {broker.name}
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
                {broker.company}
              </div>
              <div
                style={{
                  marginTop: "6px",
                  display: "flex",
                  gap: "6px",
                  flexWrap: "wrap",
                }}
              >
                {(broker.specialtyRegions ?? [])
                  .slice(0, 2)
                  .map((r: string, i: number) => (
                    <div
                      key={i}
                      style={{
                        background: "rgba(99,102,241,0.15)",
                        border: "1px solid rgba(99,102,241,0.3)",
                        color: "#a5b4fc",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "4px 12px",
                        borderRadius: "20px",
                      }}
                    >
                      {r}
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* 통계 */}
          <div style={{ display: "flex", gap: "20px" }}>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "3px" }}
            >
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px" }}>
                \ub204\uc801 \uac70\ub798
              </span>
              <span
                style={{ color: "white", fontSize: "20px", fontWeight: 800 }}
              >
                {broker.totalDeals}\uac74
              </span>
            </div>
            <div
              style={{
                width: "1px",
                background: "rgba(255,255,255,0.07)",
              }}
            />
            <div
              style={{ display: "flex", flexDirection: "column", gap: "3px" }}
            >
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px" }}>
                \ud65c\uc131 \ub9e4\ubb3c
              </span>
              <span
                style={{ color: "#10b981", fontSize: "20px", fontWeight: 800 }}
              >
                {broker.activeDeals}\uac74
              </span>
            </div>
          </div>
        </div>

        {/* ── 우측 패널 ── */}
        <div
          style={{
            flex: 1,
            padding: "48px 52px 48px 48px",
            display: "flex",
            flexDirection: "column",
            gap: "22px",
          }}
        >
          {/* 헤드라인 */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.25)",
                padding: "6px 14px",
                borderRadius: "20px",
                width: "fit-content",
              }}
            >
              <span
                style={{
                  color: "#a5b4fc",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "1px",
                }}
              >
                \u2728 AI \uac1c\uc778\ud654 \ube0c\ub9ac\ud551
              </span>
            </div>
            <div
              style={{
                color: "white",
                fontSize: "23px",
                fontWeight: 800,
                lineHeight: 1.35,
                letterSpacing: "-0.5px",
              }}
            >
              {headline}
            </div>
          </div>

          {/* 핵심 수치 카드 3개 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              flex: 1,
            }}
          >
            {keyStats.map((stat: any, i: number) => {
              const color = ACCENT[stat.accent] ?? "#6366f1";
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderLeft: `3px solid ${color}`,
                    borderRadius: "12px",
                    padding: "16px 20px",
                  }}
                >
                  <span
                    style={{ color: "rgba(255,255,255,0.5)", fontSize: "14px" }}
                  >
                    {stat.label}
                  </span>
                  <span
                    style={{
                      color,
                      fontSize: "20px",
                      fontWeight: 800,
                    }}
                  >
                    {stat.value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* CTA 배너 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))",
              border: "1px solid rgba(99,102,241,0.28)",
              borderRadius: "16px",
              padding: "16px 22px",
            }}
          >
            <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "14px" }}>
              \uc624\ub298\uc758 AI \ub9de\uc2a4\ud2b8 \ube0c\ub9ac\ud551 \ubcf4\uae30 \u2192
            </span>
            <span
              style={{
                color: "white",
                fontSize: "12px",
                fontWeight: 700,
                background: "rgba(255,255,255,0.09)",
                padding: "6px 14px",
                borderRadius: "8px",
              }}
            >
              DealCard
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
