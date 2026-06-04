"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Award, Building2, Calendar, MapPin, Sparkles, User, ArrowRight } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { VTI_PROTOTYPES } from "@/lib/vibe/vibe-vector";

export interface BrokerCardData {
  id: string;
  displayName: string;
  company: string | null;
  photoUrl: string | null;
  tagline: string | null;
  slug: string;
  specialtyRegions: string[];
  specialtyAssets: string[];
  bio: string | null;
  vibeVti: string | null;
  vibeTrust: number | null;
  vibeValence: number | null;
  totalDealCount: number;
  isVerified: boolean | null;
  seoSummary: string | null;
}

interface BrokerResultCardProps {
  broker: BrokerCardData;
}

export function BrokerResultCard({ broker }: BrokerResultCardProps) {
  const haptic = useHaptic();

  // Resolve VTI metadata
  const vtiMeta = broker.vibeVti
    ? VTI_PROTOTYPES.find((p) => p.meta.type === broker.vibeVti)?.meta ?? null
    : null;

  // Initials for avatar fallback
  const initials = broker.displayName
    ? broker.displayName.substring(0, 2)
    : "중개";

  // Gradient for avatar fallback based on VTI color or default
  const avatarBg = vtiMeta?.color
    ? `linear-gradient(135deg, ${vtiMeta.color}30, ${vtiMeta.color}80)`
    : "linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(168, 85, 247, 0.4))";

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col justify-between h-full glass-subtle rounded-2xl border border-white/10 hover:border-white/20 hover:shadow-2xl hover:shadow-primary/5 transition-all p-5 overflow-hidden"
    >
      {/* Visual background ambient glow if VTI is present */}
      {vtiMeta?.color && (
        <div
          className="absolute -top-12 -right-12 w-28 h-28 rounded-full blur-2xl opacity-10 pointer-events-none transition-all group-hover:opacity-20"
          style={{ backgroundColor: vtiMeta.color }}
        />
      )}

      <div>
        {/* Header section (Avatar + Verification + Names) */}
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar Area */}
          <div className="relative shrink-0">
            {broker.photoUrl ? (
              <img
                src={broker.photoUrl}
                alt={broker.displayName}
                className="w-14 h-14 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-sm font-bold text-white border border-white/10"
                style={{ background: avatarBg }}
              >
                {initials}
              </div>
            )}

            {/* Verification Badge */}
            {broker.isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-emerald-950 p-0.5 rounded-full border border-background shadow-sm" title="인증 파트너 중개사">
                <Award className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </div>
            )}
          </div>

          {/* Name & Company */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
                {broker.displayName}
              </h3>
              {broker.isVerified && (
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-medium px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  인증됨
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {broker.company || "소속 공인중개사"}
            </p>
          </div>
        </div>

        {/* VTI Tag if available */}
        {vtiMeta && (
          <div className="mb-3.5 flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
              style={{
                borderColor: `${vtiMeta.color}30`,
                backgroundColor: `${vtiMeta.color}10`,
                color: vtiMeta.color,
              }}
            >
              <span>{vtiMeta.emoji}</span>
              <span>{vtiMeta.label_ko}</span>
            </span>

            {/* Trust Match Rate */}
            {broker.vibeTrust !== null && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                <span>신뢰도 {Math.round(broker.vibeTrust * 100)}%</span>
              </span>
            )}
          </div>
        )}

        {/* Tagline or bio summary */}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-4">
          {broker.tagline || broker.seoSummary || broker.bio || `${broker.displayName} 중개사입니다.`}
        </p>

        {/* Specialty Tags */}
        <div className="space-y-2.5 mb-4">
          {/* Regions */}
          {broker.specialtyRegions && broker.specialtyRegions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                권역:
              </span>
              {broker.specialtyRegions.slice(0, 2).map((reg) => (
                <span
                  key={reg}
                  className="text-[10px] font-medium text-foreground bg-white/5 border border-white/5 rounded px-2 py-0.5"
                >
                  {reg.split(" ")[1] || reg}
                </span>
              ))}
              {broker.specialtyRegions.length > 2 && (
                <span className="text-[9px] text-muted-foreground">
                  +{broker.specialtyRegions.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Assets */}
          {broker.specialtyAssets && broker.specialtyAssets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5">
                <Building2 className="w-3 h-3" />
                자산:
              </span>
              {broker.specialtyAssets.slice(0, 2).map((asset) => (
                <span
                  key={asset}
                  className="text-[10px] font-medium text-foreground bg-white/5 border border-white/5 rounded px-2 py-0.5"
                >
                  {asset}
                </span>
              ))}
              {broker.specialtyAssets.length > 2 && (
                <span className="text-[9px] text-muted-foreground">
                  +{broker.specialtyAssets.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer (Deals + CTA Button) */}
      <div className="pt-3.5 border-t border-white/5 flex items-center justify-between mt-auto">
        <div className="text-left">
          <span className="text-[10px] text-muted-foreground block">총 거래 건수</span>
          <span className="text-xs font-bold text-foreground">
            {broker.totalDealCount || 0}건
          </span>
        </div>

        <Link
          href={`/vibe-card/${broker.slug}`}
          onClick={() => haptic.light()}
          className="inline-flex items-center gap-1 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-semibold rounded-lg px-3 py-2 transition-all group-hover:gap-1.5"
        >
          프로필 보기
          <ArrowRight className="w-3 h-3 transition-transform" />
        </Link>
      </div>
    </motion.div>
  );
}
