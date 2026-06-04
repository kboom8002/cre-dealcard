"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Share2 } from "lucide-react";
import type { VibeTemplateCssVars } from "@/lib/vibe/vibe-templates";
import {
  VibeCardHero,
  VibeCardDetails,
  VibeCardJsonLd,
  VibeShareSheet,
} from "@/components/vibe-card";

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

export interface VibeCardData {
  profile: VibeCardProfile;
  broker: VibeCardBroker | null;
  vibe: VibeCardVibe | null;
  template: VibeCardTemplate | null;
  professional: VibeCardProfessional | null;
  stats: VibeCardStats;
  slug: string;
}

export function VibeCardView({ data }: { data: VibeCardData }) {
  const { profile, broker, vibe, template, professional, stats, slug } = data;
  const [shareOpen, setShareOpen] = useState(false);

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

  return (
    <main
      className="min-h-screen flex flex-col items-center pb-12"
      style={{
        background: css.bgGradient,
        fontFamily: css.fontFamily,
      }}
    >
      {/* 3종 JSON-LD 구조화 데이터 삽입 */}
      <VibeCardJsonLd
        profile={profile}
        broker={broker}
        vibe={vibe}
        professional={professional}
        stats={stats}
        slug={slug}
      />

      {/* Header */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between px-6 py-4">
        <Link
          href="/hub"
          className="text-xs font-semibold hover:opacity-85 transition-opacity py-1.5 px-3 rounded-xl bg-white/5 border border-white/5"
          style={{ color: css.subtextColor }}
        >
          ← Hub
        </Link>

        <div className="flex items-center gap-2">
          {broker?.isVerified && (
            <span
              className="text-[10px] px-2.5 py-1 rounded-full font-bold border leading-none bg-white/5"
              style={{
                color: css.accentColor,
                borderColor: `${css.accentColor}30`,
              }}
            >
              ✓ 인증 중개사
            </span>
          )}
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-xs font-semibold flex items-center gap-1"
            style={{ color: css.textColor }}
            aria-label="명함 공유"
          >
            <Share2 size={13} />
            공유
          </button>
        </div>
      </header>

      {/* Main Content Body */}
      <div className="w-full max-w-md mx-auto px-4 space-y-6">
        
        {/* ── 1. Hero Zone (3D Tilt & Flip Card) ── */}
        <section className="pt-2">
          <VibeCardHero
            profile={profile}
            broker={broker}
            vibe={vibe}
            template={template}
            professional={professional}
            stats={stats}
          />
        </section>

        {/* ── 2. Detail Zone (Collapsible Profile Sections) ── */}
        <section className="space-y-4">
          <VibeCardDetails
            profile={profile}
            broker={broker}
            vibe={vibe}
            template={template}
            professional={professional}
            stats={stats}
          />
        </section>

        {/* ── 3. Footer Branding ── */}
        <footer className="text-center pt-8 pb-4 space-y-1">
          <p
            className="text-xs font-bold tracking-wider"
            style={{
              background: `linear-gradient(90deg, ${css.accentColor}, ${css.ringColor})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            DealCard
          </p>
          <p
            className="text-[9px]"
            style={{ color: css.subtextColor, opacity: 0.5 }}
          >
            Powered by Vibe AI · dealcard.kr
          </p>
        </footer>
      </div>

      {/* Share Bottom Sheet */}
      <VibeShareSheet
        slug={slug}
        cardTitle={`${profile.displayName} 공인중개사 명함`}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </main>
  );
}
