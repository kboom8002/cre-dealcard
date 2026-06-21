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

// Demo broker slug → building ID + label mapping
const DEMO_IM_LISTINGS: Record<string, { buildingId: string; label: string; priceBand: string; assetType: string }> = {
  "hong-gildong": {
    buildingId: "f1111111-1111-1111-1111-111111111111",
    label: "강남구 GBD *** 오피스 빌딩",
    priceBand: "450억",
    assetType: "오피스 빌딩",
  },
  "kim-chulsoo": {
    buildingId: "f2222222-2222-2222-2222-111111111111",
    label: "영등포구 YBD *** 프라임 오피스",
    priceBand: "보증금 15억 / 월 1.2억",
    assetType: "프라임 오피스 (임대)",
  },
  "lee-younghee": {
    buildingId: "f3333333-3333-3333-3333-111111111111",
    label: "중구 CBD *** 지식산업센터",
    priceBand: "580억",
    assetType: "지식산업센터",
  },
};

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

        {/* ── 3. IM Lite Demo Listing (demo brokers only) ── */}
        {DEMO_IM_LISTINGS[slug] && (() => {
          const listing = DEMO_IM_LISTINGS[slug];
          return (
            <section>
              <div
                className="rounded-2xl border p-4"
                style={{
                  borderColor: `${css.accentColor}25`,
                  background: `linear-gradient(135deg, ${css.accentColor}08, transparent)`,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📄</span>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: css.subtextColor }}
                  >
                    대표 매물 IM Lite
                  </span>
                </div>
                <p className="text-sm font-semibold mb-0.5" style={{ color: css.textColor }}>
                  {listing.label}
                </p>
                <p className="text-xs mb-3" style={{ color: css.subtextColor }}>
                  {listing.assetType} · {listing.priceBand}
                </p>
                <Link
                  href={`/im-lite/${listing.buildingId}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all hover:opacity-90"
                  style={{
                    background: `${css.accentColor}20`,
                    color: css.accentColor,
                    border: `1px solid ${css.accentColor}30`,
                  }}
                >
                  투자설명서 보기 (7섹션)
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </section>
          );
        })()}

        {/* ── 4. Footer Branding ── */}
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
            Powered by Vibe AI · credeal.net
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
