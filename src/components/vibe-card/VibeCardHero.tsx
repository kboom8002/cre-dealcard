"use client";

import { useState, useMemo } from "react";
import { motion, useSpring, useTransform, useMotionValue } from "motion/react";
import { MapPin, BarChart3, Handshake, Phone, MessageSquare } from "lucide-react";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";
import type { VibeVtiType } from "@/lib/vibe/vibe-vector";
import { VibeBackground } from "./VibeBackground";
import { VibePhotoRing } from "./VibePhotoRing";
import { VibeBadge } from "./VibeBadge";
import { VibeRadarChart } from "./VibeRadarChart";
import { VibeCardFlip } from "./VibeCardFlip";

// ── Types ─────────────────────────────────────────────

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

interface VibeCardProfessional {
  licenseNumber: string | null;
  careerStartYear: number | null;
  totalDealCount: number | null;
  dealSizeRange: string | null;
  dealSpecialty: string[];
  buyerTypes: string[];
  feePolicy: string | null;
  consultMethods: string[];
  responseTimeHours: number | null;
  kakaoChannel: string | null;
  naverBlogUrl: string | null;
  youtubeUrl: string | null;
  linkedinUrl: string | null;
  seoSummary: string | null;
  officeDistrict: string | null;
  languages: string[];
}

export interface VibeCardHeroProps {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  template: VibeCardTemplate | null;
  professional: VibeCardProfessional | null;
  stats: VibeCardStats;
}

// ── Score Bar (Glassmorphic) ─────────────────────────

function ScoreBar({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium leading-none">
      <span className="w-9 font-semibold shrink-0" style={{ color: `${textColor}cc` }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-white/10 backdrop-blur-xs overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </div>
      <span className="w-8 text-right font-mono font-bold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export function VibeCardHero({
  profile,
  broker,
  vibe,
  template,
  professional,
  stats,
}: VibeCardHeroProps) {
  // Use template CSS or default dark theme
  const css = useMemo(() => {
    return template?.css ?? {
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
  }, [template]);

  // Motion values for tilt & hologram
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 200, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [15, -15]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-15, 15]), springConfig);

  const sheenX = useSpring(useTransform(x, [-0.5, 0.5], [100, 0]), springConfig);
  const sheenY = useSpring(useTransform(y, [-0.5, 0.5], [100, 0]), springConfig);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left - width / 2;
    const mouseY = e.clientY - rect.top - height / 2;

    x.set(mouseX / width);
    y.set(mouseY / height);
  };

  const handlePointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  // Card Front Face
  const renderFront = () => (
    <VibeBackground
      css={css}
      className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col justify-between min-h-[500px]"
    >
      {/* Hologram Reflection Overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-color-dodge z-10"
        style={{
          background: useTransform(
            [sheenX, sheenY],
            ([sx, sy]) =>
              `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, 0.15) 0%, transparent 60%),
               linear-gradient(${sx}deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.08) 50%, rgba(255, 255, 255, 0) 70%)`
          ),
        }}
      />

      {/* ── 1. Top Section: Avatar + Identity ── */}
      <div className="flex flex-col items-center pt-8 pb-4 px-6 text-center">
        {vibe && (
          <VibePhotoRing
            photoUrl={profile.photoUrl ?? undefined}
            name={profile.displayName}
            vtiType={vibe.vti as VibeVtiType}
            ringColor={css.ringColor}
            ringGlow={css.ringGlow}
            coherence={vibe.trust ?? 0.7}
            size={100}
          />
        )}
        <h2 className="mt-4 text-xl font-bold tracking-tight" style={{ color: css.textColor }}>
          {profile.displayName}
        </h2>
        {profile.company && (
          <p className="text-xs mt-1 font-medium" style={{ color: css.subtextColor }}>
            {profile.company}
          </p>
        )}
        {vibe?.vtiMeta && (
          <div className="mt-2.5">
            <VibeBadge vtiType={vibe.vti as VibeVtiType} size="md" />
          </div>
        )}
      </div>

      {/* ── 2. Stats Section ── */}
      <div className="grid grid-cols-3 gap-2 px-5 py-2">
        <div
          className="rounded-2xl p-2.5 text-center backdrop-blur-md border border-white/5"
          style={{ backgroundColor: `${css.accentColor}0A` }}
        >
          <Handshake className="mx-auto mb-1 opacity-70" size={16} style={{ color: css.accentColor }} />
          <p className="text-[15px] font-bold tabular-nums" style={{ color: css.textColor }}>
            {stats.dealCount}건
          </p>
          <p className="text-[9px] font-medium opacity-60 mt-0.5">거래 실적</p>
        </div>

        <div
          className="rounded-2xl p-2.5 text-center backdrop-blur-md border border-white/5"
          style={{ backgroundColor: `${css.accentColor}0A` }}
        >
          <BarChart3 className="mx-auto mb-1 opacity-70" size={16} style={{ color: css.accentColor }} />
          <p className="text-[15px] font-bold tabular-nums" style={{ color: css.textColor }}>
            {professional?.totalDealCount ? `${professional.totalDealCount}건+` : "대기"}
          </p>
          <p className="text-[9px] font-medium opacity-60 mt-0.5">누적 중개</p>
        </div>

        <div
          className="rounded-2xl p-2.5 text-center backdrop-blur-md border border-white/5"
          style={{ backgroundColor: `${css.accentColor}0A` }}
        >
          <MapPin className="mx-auto mb-1 opacity-70" size={16} style={{ color: css.accentColor }} />
          <p className="text-[13px] font-bold truncate mt-0.5" style={{ color: css.textColor }}>
            {broker?.specialtyRegions[0] ?? "서울"}
          </p>
          <p className="text-[9px] font-medium opacity-60 mt-1">전문 지역</p>
        </div>
      </div>

      {/* ── 3. Tagline & Scores ── */}
      <div className="px-6 space-y-4">
        {profile.tagline && (
          <p className="text-[12px] leading-relaxed text-center italic opacity-85" style={{ color: css.subtextColor }}>
            &ldquo;{profile.tagline}&rdquo;
          </p>
        )}

        {vibe && (vibe.trust != null || vibe.valence != null) && (
          <div className="p-3.5 rounded-2xl space-y-2 border border-white/5 backdrop-blur-md" style={{ backgroundColor: "rgba(0, 0, 0, 0.15)" }}>
            {vibe.trust != null && (
              <ScoreBar label="신뢰 지수" value={vibe.trust} color={css.ringColor} textColor={css.textColor} />
            )}
            {vibe.valence != null && (
              <ScoreBar label="호감 지수" value={vibe.valence} color={css.accentColor} textColor={css.textColor} />
            )}
          </div>
        )}
      </div>

      {/* ── 4. CTA Buttons ── */}
      <div className="px-6 pb-6 pt-2 space-y-2 relative z-20">
        <a
          href={`/expert-note/request?broker=${encodeURIComponent(profile.displayName)}`}
          className="flex items-center justify-center gap-1.5 w-full rounded-2xl py-3 text-xs font-semibold shadow-lg hover:shadow-xl active:scale-[0.98] transition-all"
          style={{
            background: `linear-gradient(135deg, ${css.accentColor}, ${css.ringColor})`,
            color: "#fff",
          }}
          onClick={(e) => e.stopPropagation()} // Prevent card flip on click
        >
          <MessageSquare size={14} />
          전문가 상담 요청
        </a>

        <div className="flex gap-2">
          {profile.phone && (
            <a
              href={`tel:${profile.phone}`}
              className="flex-1 flex items-center justify-center gap-1 w-full rounded-xl py-2.5 text-[11px] font-semibold border backdrop-blur-sm transition-all active:scale-[0.97]"
              style={{
                backgroundColor: `${css.accentColor}12`,
                color: css.accentColor,
                borderColor: `${css.accentColor}25`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Phone size={12} />
              전화 연결
            </a>
          )}
          {professional?.kakaoChannel && (
            <a
              href={`https://pf.kakao.com/${professional.kakaoChannel}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1 w-full rounded-xl py-2.5 text-[11px] font-semibold transition-all active:scale-[0.97]"
              style={{
                backgroundColor: "#FEE500",
                color: "#000",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              💬 카카오 채널
            </a>
          )}
        </div>
      </div>
    </VibeBackground>
  );

  // Card Back Face
  const renderBack = () => (
    <VibeBackground
      css={css}
      className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col justify-between min-h-[500px]"
    >
      {/* Hologram Reflection Overlay */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-color-dodge z-10"
        style={{
          background: useTransform(
            [sheenX, sheenY],
            ([sx, sy]) =>
              `radial-gradient(circle at ${sx}% ${sy}%, rgba(255, 255, 255, 0.12) 0%, transparent 60%),
               linear-gradient(${sx}deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.05) 50%, rgba(255, 255, 255, 0) 70%)`
          ),
        }}
      />

      {/* ── 1. Top Section: 7D Radar Chart ── */}
      <div className="flex flex-col items-center pt-8 pb-2 px-6">
        <h3 className="text-xs font-bold uppercase tracking-wider opacity-80 mb-3" style={{ color: css.subtextColor }}>
          7D Vibe Vector Analysis
        </h3>
        {vibe && (
          <VibeRadarChart
            vector={vibe.vector}
            complement={vibe.complement}
            css={css}
            size={220}
          />
        )}
      </div>

      {/* ── 2. Middle Section: AI Vibe Analysis ── */}
      <div className="px-6 pb-6 pt-2 flex-1 flex flex-col justify-center">
        {vibe?.vtiMeta && (
          <div
            className="rounded-2xl p-4 border text-left"
            style={{
              background: css.badgeBg,
              borderColor: `${vibe.vtiMeta.color}25`,
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{vibe.vtiMeta.emoji}</span>
              <div>
                <p className="text-xs font-bold" style={{ color: vibe.vtiMeta.color }}>
                  {vibe.vtiMeta.labelKo} ({vibe.vti})
                </p>
                {template && (
                  <p className="text-[9px] opacity-60">
                    테마: {template.nameKo}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90" style={{ color: css.textColor }}>
              {vibe.vtiMeta.description}
            </p>
          </div>
        )}
      </div>

      {/* ── 3. Footer Section ── */}
      <div
        className="px-6 py-4 flex items-center justify-between text-[10px] font-medium tracking-wide"
        style={{ borderTop: `1px solid ${css.accentColor}15` }}
      >
        <span className="opacity-60">
          Powered by <span className="font-bold" style={{ color: css.textColor }}>DealCard</span>
        </span>
        <span className="opacity-40">
          Vibe AI Agent · {vibe?.analyzedAt ? new Date(vibe.analyzedAt).toLocaleDateString() : ""}
        </span>
      </div>
    </VibeBackground>
  );

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* 3D Tilt Container */}
      <motion.div
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
        className="transition-transform duration-200 ease-out"
      >
        <VibeCardFlip
          front={renderFront()}
          back={renderBack()}
          className="rounded-3xl shadow-2xl"
          hintColor={css.subtextColor}
        />
      </motion.div>
    </div>
  );
}
