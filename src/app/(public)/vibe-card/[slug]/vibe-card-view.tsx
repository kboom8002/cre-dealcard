"use client";

import Link from "next/link";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";

// ── Types ────────────────────────────────────────────

interface VibeCardProfile {
  id: string;
  displayName: string;
  company: string | null;
  phone: string | null;
  photoUrl: string | null;
  tagline: string | null;
}

interface VibeCardBroker {
  specialtyRegions: string[];
  specialtyAssets: string[];
  bio: string | null;
  isVerified: boolean | null;
}

interface VibeCardVibe {
  vector: Record<string, number>;
  vti: string;
  vtiMeta: {
    type: string;
    label: string;
    labelKo: string;
    emoji: string;
    color: string;
    description: string;
  } | null;
  complement: Record<string, number> | null;
  templateId: string | null;
  valence: number | null;
  trust: number | null;
  analyzedAt: string | null;
}

interface VibeCardTemplate {
  id: string;
  name: string;
  nameKo: string;
  css: VibeTemplateCssVars;
}

interface VibeCardStats {
  dealCount: number;
  activeCount: number;
}

export interface VibeCardData {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  template: VibeCardTemplate | null;
  stats: VibeCardStats;
  slug: string;
}

// ── Axis labels ──────────────────────────────────────

const AXIS_LABELS: Record<string, { label: string; emoji: string }> = {
  warmth: { label: "Warmth", emoji: "🔥" },
  energy: { label: "Energy", emoji: "⚡" },
  polish: { label: "Polish", emoji: "💎" },
  authentic: { label: "Authentic", emoji: "🌱" },
  heritage: { label: "Heritage", emoji: "🏛️" },
  futuristic: { label: "Future", emoji: "🚀" },
  playful: { label: "Playful", emoji: "🎭" },
};

// ── Component ────────────────────────────────────────

export function VibeCardView({ data }: { data: VibeCardData }) {
  const { profile, broker, vibe, template, stats } = data;

  // Use template CSS or default dark theme
  const css = template?.css ?? {
    bgGradient: "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)",
    accentColor: "#8b5cf6",
    textColor: "#f1f5f9",
    subtextColor: "#94a3b8",
    ringColor: "#8b5cf6",
    ringGlow: "0 0 24px rgba(139,92,246,0.25)",
    badgeBg: "rgba(139,92,246,0.12)",
    cardBg: "#0f172a",
    fontFamily: "'Pretendard', sans-serif",
  };

  const initial = profile.displayName.charAt(0);
  const regions = broker?.specialtyRegions ?? [];
  const regionsText = regions.length > 0 ? regions.join(" · ") : "서울 전역";

  return (
    <main
      className="min-h-screen flex flex-col items-center"
      style={{
        background: css.bgGradient,
        fontFamily: css.fontFamily,
      }}
    >
      {/* Header */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between px-4 py-4">
        <Link
          href="/hub"
          className="text-xs hover:opacity-80 transition-opacity"
          style={{ color: css.subtextColor }}
        >
          ← Hub
        </Link>
        {broker?.isVerified && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium border"
            style={{
              background: css.badgeBg,
              color: css.accentColor,
              borderColor: `${css.accentColor}30`,
            }}
          >
            ✓ Verified Broker
          </span>
        )}
      </header>

      {/* Card body */}
      <div className="w-full max-w-md mx-auto px-4 pb-8 space-y-5">
        {/* Avatar + Name section */}
        <div className="flex flex-col items-center text-center space-y-4 pt-4">
          {/* Avatar with VTI ring */}
          <div className="relative">
            <div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(${css.ringColor}, ${css.accentColor}, ${css.ringColor})`,
                boxShadow: css.ringGlow,
                padding: "4px",
              }}
            >
              <div
                className="w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-cover bg-center"
                style={{
                  background: profile.photoUrl
                    ? undefined
                    : `linear-gradient(135deg, ${css.ringColor}30, ${css.accentColor}30)`,
                  backgroundColor: css.cardBg,
                }}
              >
                {profile.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.photoUrl}
                    alt={profile.displayName}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <span
                    className="text-4xl font-bold"
                    style={{ color: css.textColor }}
                  >
                    {initial}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* VTI badge */}
          {vibe?.vtiMeta && (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border"
              style={{
                background: css.badgeBg,
                color: vibe.vtiMeta.color,
                borderColor: `${vibe.vtiMeta.color}30`,
              }}
            >
              <span>{vibe.vtiMeta.emoji}</span>
              <span>{vibe.vtiMeta.label}</span>
            </div>
          )}

          {/* Name & company */}
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: css.textColor }}
            >
              {profile.displayName}
            </h1>
            {profile.company && (
              <p
                className="text-sm mt-1"
                style={{ color: css.subtextColor }}
              >
                {profile.company}
              </p>
            )}
            {profile.tagline && (
              <p
                className="text-xs mt-2 italic"
                style={{ color: css.subtextColor, opacity: 0.8 }}
              >
                &ldquo;{profile.tagline}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div
          className="grid grid-cols-3 gap-2.5"
        >
          {[
            { label: "딜카드", value: `${stats.dealCount}건`, emoji: "📋" },
            { label: "전문 권역", value: `${regions.length}개`, emoji: "📍" },
            { label: "활성 딜", value: `${stats.activeCount}건`, emoji: "🔥" },
          ].map((s, i) => (
            <div
              key={i}
              className="rounded-xl p-3 text-center border"
              style={{
                background: css.cardBg,
                borderColor: `${css.accentColor}15`,
              }}
            >
              <span className="text-lg">{s.emoji}</span>
              <p
                className="text-sm font-bold mt-1"
                style={{ color: css.textColor }}
              >
                {s.value}
              </p>
              <p
                className="text-[10px]"
                style={{ color: css.subtextColor }}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Vibe vector radar (simplified bar chart) */}
        {vibe && (
          <div
            className="rounded-2xl p-4 border space-y-3"
            style={{
              background: css.cardBg,
              borderColor: `${css.accentColor}15`,
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: css.subtextColor }}
            >
              Vibe Profile
            </h2>
            <div className="space-y-2">
              {Object.entries(vibe.vector).map(([axis, value]) => {
                const axisInfo = AXIS_LABELS[axis];
                if (!axisInfo) return null;
                const pct = Math.round((value as number) * 100);
                return (
                  <div key={axis} className="flex items-center gap-2">
                    <span className="text-xs w-4 text-center">{axisInfo.emoji}</span>
                    <span
                      className="text-[10px] w-16 shrink-0"
                      style={{ color: css.subtextColor }}
                    >
                      {axisInfo.label}
                    </span>
                    <div
                      className="flex-1 h-2 rounded-full overflow-hidden"
                      style={{ background: `${css.accentColor}15` }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(90deg, ${css.ringColor}, ${css.accentColor})`,
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] w-8 text-right tabular-nums font-medium"
                      style={{ color: css.textColor }}
                    >
                      {pct}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Trust & Valence scores */}
            {(vibe.trust != null || vibe.valence != null) && (
              <div className="flex gap-3 pt-2">
                {vibe.trust != null && (
                  <div
                    className="flex-1 rounded-lg p-2.5 text-center"
                    style={{ background: `${css.accentColor}10` }}
                  >
                    <p
                      className="text-lg font-bold tabular-nums"
                      style={{ color: css.accentColor }}
                    >
                      {Math.round(vibe.trust * 100)}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{ color: css.subtextColor }}
                    >
                      Trust Score
                    </p>
                  </div>
                )}
                {vibe.valence != null && (
                  <div
                    className="flex-1 rounded-lg p-2.5 text-center"
                    style={{ background: `${css.ringColor}10` }}
                  >
                    <p
                      className="text-lg font-bold tabular-nums"
                      style={{ color: css.ringColor }}
                    >
                      {Math.round(vibe.valence * 100)}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{ color: css.subtextColor }}
                    >
                      Valence
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Specialty regions */}
        {regions.length > 0 && (
          <div
            className="rounded-2xl p-4 border"
            style={{
              background: css.cardBg,
              borderColor: `${css.accentColor}15`,
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: css.subtextColor }}
            >
              전문 권역
            </h2>
            <p
              className="text-sm font-medium"
              style={{ color: css.textColor }}
            >
              📍 {regionsText}
            </p>
          </div>
        )}

        {/* Bio */}
        {broker?.bio && (
          <div
            className="rounded-2xl p-4 border"
            style={{
              background: css.cardBg,
              borderColor: `${css.accentColor}15`,
            }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: css.subtextColor }}
            >
              소개
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ color: css.textColor }}
            >
              {broker.bio}
            </p>
          </div>
        )}

        {/* VTI description */}
        {vibe?.vtiMeta && (
          <div
            className="rounded-2xl p-4 border"
            style={{
              background: css.badgeBg,
              borderColor: `${vibe.vtiMeta.color}20`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{vibe.vtiMeta.emoji}</span>
              <div>
                <p
                  className="text-sm font-bold"
                  style={{ color: vibe.vtiMeta.color }}
                >
                  {vibe.vtiMeta.labelKo}
                </p>
                <p
                  className="text-[10px]"
                  style={{ color: css.subtextColor }}
                >
                  {vibe.vtiMeta.label} · {template?.nameKo ?? template?.name ?? ""}
                </p>
              </div>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: css.textColor, opacity: 0.85 }}
            >
              {vibe.vtiMeta.description}
            </p>
          </div>
        )}

        {/* No vibe fallback */}
        {!vibe && (
          <div
            className="rounded-2xl p-5 border text-center space-y-3"
            style={{
              background: css.cardBg,
              borderColor: `${css.accentColor}15`,
            }}
          >
            <span className="text-3xl">✨</span>
            <p
              className="text-sm font-medium"
              style={{ color: css.textColor }}
            >
              Vibe 분석이 아직 진행되지 않았습니다
            </p>
            <p
              className="text-xs"
              style={{ color: css.subtextColor }}
            >
              프로필 사진을 등록하면 AI가 7D Vibe 벡터를 자동 분석하여
              맞춤형 명함을 생성합니다.
            </p>
          </div>
        )}

        {/* CTA */}
        <div
          className="rounded-2xl p-5 border text-center space-y-3"
          style={{
            background: css.cardBg,
            borderColor: `${css.accentColor}15`,
          }}
        >
          <p
            className="text-xs"
            style={{ color: css.subtextColor }}
          >
            이 중개인에게 문의하시겠습니까?
          </p>
          <Link
            href={`/expert-note/request?broker=${encodeURIComponent(profile.displayName)}`}
            className="inline-flex items-center gap-2 font-semibold rounded-xl px-6 py-3 text-sm transition-all active:scale-[0.98] hover:brightness-110"
            style={{
              background: css.accentColor,
              color: "#ffffff",
            }}
          >
            💬 전문가 상담 요청
          </Link>
        </div>

        {/* Footer branding */}
        <div className="text-center pt-4 pb-2 space-y-1">
          <p
            className="text-xs font-bold"
            style={{
              background: `linear-gradient(90deg, ${css.accentColor}, ${css.ringColor})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            DealCard
          </p>
          <p
            className="text-[10px]"
            style={{ color: css.subtextColor, opacity: 0.5 }}
          >
            Powered by Vibe AI · dealcard.kr
          </p>
        </div>
      </div>
    </main>
  );
}
