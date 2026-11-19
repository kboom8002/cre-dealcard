"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Award, Building2, MapPin, Sparkles, ArrowRight } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

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

interface VtiMeta {
  color: string;
  emoji: string;
  label_ko: string;
}

interface BrokerResultCardProps {
  broker: BrokerCardData;
}

export function BrokerResultCard({ broker }: BrokerResultCardProps) {
  const haptic = useHaptic();

  // Resolve VTI metadata
  const vtiMeta: VtiMeta | null = null as VtiMeta | null;

  // Initials for avatar fallback
  const initials = broker.displayName
    ? broker.displayName.substring(0, 2)
    : "중개";

  const profileSlug = (broker.slug && broker.slug.trim()) || broker.id;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col justify-between h-full rounded-2xl border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:shadow-md transition-all p-5 overflow-hidden"
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={broker.photoUrl}
                alt={broker.displayName}
                className="w-14 h-14 rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center text-sm font-bold text-blue-800 bg-blue-50 border border-blue-200"
              >
                {initials}
              </div>
            )}

            {/* Verification Badge */}
            {broker.isVerified && (
              <div
                className="absolute -bottom-1 -right-1 bg-emerald-600 text-white p-0.5 rounded-full border-2 border-white shadow-xs"
                title="인증 파트너 중개사"
              >
                <Award className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </div>
            )}
          </div>

          {/* Name & Company */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                {broker.displayName}
              </h3>
              {broker.isVerified && (
                <span className="text-sm bg-emerald-50 text-emerald-800 font-semibold px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                  인증됨
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 truncate">
              {broker.company || "소속 공인중개사"}
            </p>
          </div>
        </div>

        {/* VTI Tag if available */}
        {vtiMeta && (
          <div className="mb-3.5 flex items-center justify-between">
            <span
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-800"
            >
              <span>{vtiMeta.emoji}</span>
              <span>{vtiMeta.label_ko}</span>
            </span>

            {/* Trust Match Rate */}
            {broker.vibeTrust !== null && (
              <span className="text-sm text-slate-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>신뢰도 {Math.round(broker.vibeTrust * 100)}%</span>
              </span>
            )}
          </div>
        )}

        {/* Tagline or bio summary */}
        <p className="text-sm text-slate-700 line-clamp-2 leading-relaxed mb-4">
          {broker.tagline || broker.seoSummary || broker.bio || `${broker.displayName} 중개사입니다.`}
        </p>

        {/* Specialty Tags */}
        <div className="space-y-2.5 mb-4">
          {/* Regions */}
          {broker.specialtyRegions && broker.specialtyRegions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-slate-600 shrink-0 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                권역:
              </span>
              {broker.specialtyRegions.slice(0, 2).map((reg) => (
                <span
                  key={reg}
                  className="text-sm font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-0.5"
                >
                  {reg.split(" ")[1] || reg}
                </span>
              ))}
              {broker.specialtyRegions.length > 2 && (
                <span className="text-sm font-medium text-slate-600">
                  +{broker.specialtyRegions.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Assets */}
          {broker.specialtyAssets && broker.specialtyAssets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-slate-600 shrink-0 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                자산:
              </span>
              {broker.specialtyAssets.slice(0, 2).map((asset) => (
                <span
                  key={asset}
                  className="text-sm font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded-md px-2.5 py-0.5"
                >
                  {asset}
                </span>
              ))}
              {broker.specialtyAssets.length > 2 && (
                <span className="text-sm font-medium text-slate-600">
                  +{broker.specialtyAssets.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer (Deals + CTA Button) */}
      <div className="pt-3.5 border-t border-slate-200 flex items-center justify-between gap-3 mt-auto">
        <div className="text-left">
          <span className="text-sm text-slate-600 block">총 거래 건수</span>
          <span className="text-sm font-bold text-slate-900">
            {broker.totalDealCount || 0}건
          </span>
        </div>

        <Link
          href={`/broker-profile/${encodeURIComponent(profileSlug)}`}
          onClick={() => haptic.light()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition-all group-hover:gap-2"
        >
          프로필 보기
          <ArrowRight className="w-4 h-4 transition-transform" />
        </Link>
      </div>
    </motion.div>
  );
}
