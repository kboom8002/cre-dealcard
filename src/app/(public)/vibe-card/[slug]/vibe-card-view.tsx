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
import { SubscribeCard } from "@/components/magazine/SubscribeCard";

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
  cardTitle?: string;
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
  imListings?: Array<{
    buildingId: string;
    label: string;
    priceBand: string;
    assetType: string;
    photoUrl?: string | null;
  }>;
  latestMagazine?: {
    date: string;
    headline: string;
    url: string;
    marketTemp?: string;
  } | null;
  slug: string;
  logoCompanyUrl?: string | null;
  logoPartnerUrl?: string | null;
  email?: string;
}

export function VibeCardView({ data }: { data: VibeCardData }) {
  const { profile, broker, vibe, template, professional, stats, slug } = data;
  const [shareOpen, setShareOpen] = useState(false);

  // Use template CSS or default dark theme
  const css = useMemo(() => {
    return template?.css ?? {
      bgGradient: "linear-gradient(135deg, #0b0f19 0%, #1a2333 50%, #0f1729 100%)",
      textColor: "#f8fafc",
      subtextColor: "#94a3b8",
      accentColor: "#8b5cf6",
      ringColor: "#c084fc",
      ringGlow: "0 0 25px rgba(139, 92, 246, 0.4)",
      badgeBg: "rgba(139,92,246,0.12)",
      cardBg: "#0f172a",
      fontFamily: "'Pretendard', sans-serif",
    };
  }, [template]);

  return (
    <main
      className="min-h-screen px-4 py-8 flex flex-col items-center select-none"
      style={{ background: css.bgGradient, fontFamily: css.fontFamily }}
    >
      <VibeCardJsonLd
        profile={profile}
        broker={broker}
        vibe={vibe}
        professional={professional}
        stats={stats}
        slug={slug}
      />

      <div className="w-full max-w-sm space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center px-1">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: css.subtextColor, opacity: 0.6 }}
          >
            Vibe AI Business Card
          </p>
          <button
            onClick={() => setShareOpen(true)}
            className="p-2 rounded-xl transition-all active:scale-95 border"
            style={{
              borderColor: `${css.accentColor}20`,
              background: `${css.accentColor}08`,
              color: css.accentColor,
            }}
            id="btn-open-share"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* ── 1. Hero Zone (3D Tilt & Flip Card) ── */}
        <section>
          <VibeCardHero
            profile={profile}
            broker={broker}
            vibe={vibe}
            template={template}
            professional={professional}
            stats={stats}
            logoCompanyUrl={data.logoCompanyUrl || undefined}
            logoPartnerUrl={data.logoPartnerUrl || undefined}
            email={data.email}
            latestMagazine={data.latestMagazine}
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

        {/* ── 3. IM Lite Listings (actual active listings) ── */}
        {data.imListings && data.imListings.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm">📄</span>
              <span
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: css.subtextColor }}
              >
                보유 매물 IM Lite ({data.imListings.length})
              </span>
            </div>
            <div className="space-y-3">
              {data.imListings.map((listing, i) => (
                <div
                  key={i}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    borderColor: `${css.accentColor}25`,
                    background: `linear-gradient(135deg, ${css.accentColor}08, transparent)`,
                  }}
                >
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
              ))}
            </div>
          </section>
        )}

        {/* ── 3.5. Latest Weekly Magazine Section ── */}
        {data.latestMagazine && (
          <section>
            <div
              className="rounded-2xl border p-4 transition-all"
              style={{
                borderColor: `${css.accentColor}25`,
                background: `linear-gradient(135deg, ${css.accentColor}08, transparent)`,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📰</span>
                <span
                  className="text-xs font-bold uppercase tracking-wider"
                  style={{ color: css.subtextColor }}
                >
                  최신 매거진
                </span>
              </div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: css.textColor }}>
                {data.latestMagazine.headline}
              </p>
              <p className="text-xs mb-3" style={{ color: css.subtextColor }}>
                발행일: {data.latestMagazine.date}
              </p>
              <Link
                href={data.latestMagazine.url}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all hover:opacity-90"
                style={{
                  background: `${css.accentColor}20`,
                  color: css.accentColor,
                  border: `1px solid ${css.accentColor}30`,
                }}
              >
                시장 인사이트 읽기
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </section>
        )}

        {/* ── 3.8. Weekly Magazine Subscribe CTA ── */}
        <section>
          <SubscribeCard brokerId={slug} source="vibe_card" accentColor={css.accentColor} />
        </section>

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
        cardTitle={`${profile.displayName} — ${profile.cardTitle || '공인중개사'}`}
        cardDescription={professional?.seoSummary ?? broker?.bio ?? ""}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </main>
  );
}
