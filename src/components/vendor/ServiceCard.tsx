"use client";

import Link from "next/link";
import { VENDOR_CATEGORY_META } from "@/domain/vendor/vendor-tier";
import type { VendorCategory, VendorTier } from "@/domain/vendor/vendor-tier";

export interface ServiceCardData {
  id: string;
  service_category: VendorCategory;
  title: string;
  description: string;
  service_regions: string[];
  price_range: string | null;
  price_unit: string | null;
  completion_count: number;
  avg_rating: number | null;
  vendor_profiles?: {
    company_name: string;
    vendor_tier: VendorTier;
    is_verified: boolean;
  };
}

const REGION_LABELS: Record<string, string> = {
  gbd: "GBD", ybd: "YBD", cbd: "CBD",
  seongsu: "성수", pangyo: "판교", mapo: "마포",
  jongno: "종로", hongdae: "홍대",
};

function renderStars(rating: number | null) {
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <span className="text-[10px] text-amber-400">
      {"★".repeat(full)}{half ? "☆" : ""}
      <span className="text-slate-600">{"★".repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export default function ServiceCard({ card }: { card: ServiceCardData }) {
  const meta = VENDOR_CATEGORY_META[card.service_category];
  const vendor = card.vendor_profiles;
  const tierLabel = vendor?.vendor_tier === "premium" ? "Premium" : vendor?.vendor_tier === "pro" ? "Pro" : null;

  return (
    <Link
      href={`/services/${card.service_category}/${card.id}`}
      className="block bg-[#131b2e] border border-slate-800 rounded-2xl p-4 hover:border-emerald-500/30 hover:bg-[#161f33] transition-all group"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[10px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full">
          {meta?.emoji} {meta?.label}
        </span>
        {tierLabel && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            tierLabel === "Premium"
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/20"
              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
          }`}>
            {tierLabel}
          </span>
        )}
        {vendor?.is_verified && (
          <span className="text-[10px] text-emerald-500">✓ 인증</span>
        )}
      </div>

      {/* Title & Company */}
      <h3 className="text-sm font-bold text-white mb-1 group-hover:text-emerald-300 transition-colors line-clamp-1">
        {card.title}
      </h3>
      {vendor && (
        <p className="text-[10px] text-slate-400 mb-2">{vendor.company_name}</p>
      )}

      {/* Description */}
      <p className="text-[10px] text-slate-500 line-clamp-2 mb-3 leading-relaxed">
        {card.description}
      </p>

      {/* Region chips */}
      {card.service_regions.length > 0 && (
        <div className="flex gap-1 flex-wrap mb-3">
          {card.service_regions.slice(0, 4).map((r) => (
            <span key={r} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
              {REGION_LABELS[r] ?? r}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          {renderStars(card.avg_rating)}
          <span className="text-[9px] text-slate-600">
            완료 {card.completion_count}건
          </span>
        </div>
        <div className="flex items-center gap-2">
          {card.price_range && (
            <span className="text-[9px] text-slate-400">
              {card.price_range}{card.price_unit ? `/${card.price_unit}` : ""}
            </span>
          )}
          <span className="text-[9px] text-emerald-500 group-hover:translate-x-0.5 transition-transform">→</span>
        </div>
      </div>
    </Link>
  );
}
